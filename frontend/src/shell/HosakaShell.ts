import type { Terminal } from "@xterm/xterm";
import {
  BANNER,
  BANNER_COMPACT,
  PLANT_STATES,
  LORE_FRAGMENTS,
  ORBS,
  THINKING_FRAMES,
} from "./content";
import { COMMANDS, type CommandEntry } from "./commands";
import {
  askGemini,
  GEMINI_MODELS,
  loadConfig as loadLlmConfig,
  saveConfig as saveLlmConfig,
  type GeminiModel,
  type LlmMessage,
} from "../llm/gemini";
import {
  DEFAULT_AGENT_URL,
  MAGIC_WORD,
  getAgent,
  loadAgentConfig,
  saveAgentConfig,
  type AgentConfig,
  type AgentErrorCode,
} from "../llm/agentClient";

// ANSI helpers
const ESC = "\x1b[";
const R = `${ESC}0m`;
const CYAN = `${ESC}36m`;
const AMBER = `${ESC}38;5;214m`;
const AMBER_DIM = `${ESC}2;38;5;214m`;
const VIOLET = `${ESC}38;5;141m`;
const GRAY = `${ESC}38;5;245m`;
const DARK_GRAY = `${ESC}38;5;240m`;
const GREEN = `${ESC}32m`;
const RED = `${ESC}31m`;
const BLUE = `${ESC}34m`;

const PROMPT_HOST = "hosaka";
const PROMPT_CWD = "/web";

function prompt(): string {
  return `${CYAN}${PROMPT_HOST}${R}:${BLUE}${PROMPT_CWD}${R} ${AMBER}›${R} `;
}

function pad(s: string, n: number): string {
  // visible width is naive — our commands are ASCII-only, fine here
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class HosakaShell {
  private buffer = "";
  private cursor = 0;
  private history: string[] = [];
  private histIdx = 0;
  private plantTicks = 0;
  private llmHistory: LlmMessage[] = [];
  private busy = false;
  private thinkingTimer: number | null = null;

  constructor(private readonly term: Terminal) {}

  start(): void {
    this.writeBanner();
    this.writePrompt();
    this.term.onData((data) => this.onData(data));
  }

  private writeln(s = ""): void {
    this.term.writeln(s);
  }
  private write(s: string): void {
    this.term.write(s);
  }
  private writePrompt(): void {
    this.write(prompt());
  }

  private writeBanner(): void {
    // On narrow viewports the wide block banner wraps mid-glyph and looks
    // broken. Pick the compact variant when xterm reports < 56 cols.
    const cols = this.term.cols ?? 80;
    const banner = cols < 56 ? BANNER_COMPACT : BANNER;
    for (const line of banner) this.writeln(`${CYAN}${line}${R}`);
    this.writeln("");
    this.writeln(this.renderPlant());
    this.writeln("");
    if (cols < 56) {
      this.writeln(`  ${CYAN}Field Terminal Online.${R}`);
      this.writeln(`  ${GRAY}Signal steady. ${AMBER_DIM}hosted edition${R}`);
      this.writeln(`  ${DARK_GRAY}/help · /commands${R}`);
      this.writeln(
        `  ${DARK_GRAY}say a ${VIOLET}word${R}${DARK_GRAY}, open the channel.${R}`,
      );
    } else {
      this.writeln(
        `  ${CYAN}Field Terminal Online.${R}  ${GRAY}Signal steady.${R}  ${AMBER_DIM}hosted edition${R}`,
      );
      this.writeln(
        `  ${DARK_GRAY}/commands to explore  ·  /help to start  ·  /ask the orb anything${R}`,
      );
      this.writeln(
        `  ${DARK_GRAY}if someone shared a word with you, ${VIOLET}say it${R}${DARK_GRAY} and the channel opens.${R}`,
      );
    }
    this.writeln("");
  }

  private renderPlant(): string {
    const idx = Math.min(
      PLANT_STATES.length - 1,
      Math.floor(this.plantTicks / 5),
    );
    return PLANT_STATES[idx]
      .map((l) => `  ${GREEN}${l}${R}`)
      .join("\r\n");
  }

  private onData(data: string): void {
    // Handle common escape sequences first
    if (data === "\x1b[A") return this.historyPrev();
    if (data === "\x1b[B") return this.historyNext();
    if (data === "\x1b[D") return this.moveLeft();
    if (data === "\x1b[C") return this.moveRight();
    if (data === "\x1b[H" || data === "\x01") return this.moveHome();
    if (data === "\x1b[F" || data === "\x05") return this.moveEnd();

    for (const ch of data) {
      const code = ch.charCodeAt(0);
      if (ch === "\r") {
        this.submit();
      } else if (ch === "\x7f" || ch === "\b") {
        this.backspace();
      } else if (ch === "\x03") {
        // Ctrl-C
        this.write("^C");
        this.writeln("");
        this.buffer = "";
        this.cursor = 0;
        this.writePrompt();
      } else if (ch === "\x0c") {
        // Ctrl-L: clear
        this.term.clear();
        this.writePrompt();
        this.write(this.buffer);
      } else if (code >= 32 && code !== 127) {
        this.insert(ch);
      }
    }
  }

  private insert(ch: string): void {
    const before = this.buffer.slice(0, this.cursor);
    const after = this.buffer.slice(this.cursor);
    this.buffer = before + ch + after;
    this.cursor += ch.length;
    if (after.length === 0) {
      this.write(ch);
    } else {
      this.write(ch + after + "\x1b[" + after.length + "D");
    }
  }

  private backspace(): void {
    if (this.cursor === 0) return;
    const before = this.buffer.slice(0, this.cursor - 1);
    const after = this.buffer.slice(this.cursor);
    this.buffer = before + after;
    this.cursor -= 1;
    this.write("\b" + after + " " + "\x1b[" + (after.length + 1) + "D");
  }

  private moveLeft(): void {
    if (this.cursor > 0) {
      this.cursor -= 1;
      this.write("\x1b[D");
    }
  }
  private moveRight(): void {
    if (this.cursor < this.buffer.length) {
      this.cursor += 1;
      this.write("\x1b[C");
    }
  }
  private moveHome(): void {
    while (this.cursor > 0) this.moveLeft();
  }
  private moveEnd(): void {
    while (this.cursor < this.buffer.length) this.moveRight();
  }

  private historyPrev(): void {
    if (this.history.length === 0) return;
    this.histIdx = Math.max(0, this.histIdx - 1);
    this.replaceBuffer(this.history[this.histIdx] ?? "");
  }
  private historyNext(): void {
    if (this.history.length === 0) return;
    this.histIdx = Math.min(this.history.length, this.histIdx + 1);
    const v = this.history[this.histIdx] ?? "";
    this.replaceBuffer(v);
  }
  private replaceBuffer(next: string): void {
    // move to start, clear to end, write next, update state
    this.write("\r" + prompt() + "\x1b[K");
    this.write(next);
    this.buffer = next;
    this.cursor = next.length;
  }

  private submit(): void {
    this.writeln("");
    const raw = this.buffer.trim();
    this.buffer = "";
    this.cursor = 0;

    if (raw.length > 0) {
      this.history.push(raw);
      this.histIdx = this.history.length;
      this.plantTicks += 1;
      void this.dispatch(raw);
      return; // dispatch handles re-prompting (esp. for async LLM calls)
    }
    this.writePrompt();
  }

  private async dispatch(raw: string): Promise<void> {
    if (this.busy) {
      this.writeln(`  ${GRAY}...the orb is still thinking. patience.${R}`);
      this.writePrompt();
      return;
    }

    if (raw.startsWith("!")) {
      this.writeln(
        `  ${AMBER}[sandbox]${R} shell passthrough is disabled in the hosted build.`,
      );
      this.writeln(
        `  ${GRAY}install the appliance to run real shells. see /docs.${R}`,
      );
      this.writePrompt();
      return;
    }

    if (!raw.startsWith("/")) {
      const normalized = raw.trim().toLowerCase();
      if (normalized === MAGIC_WORD.toLowerCase()) {
        this.magicWord();
        this.writePrompt();
        return;
      }
      // picoclaw is the heartbeat: free text always routes to the agent.
      // If the channel is off (user disabled it), we nudge them back to neuro
      // rather than silently falling through to the gemini proxy.
      const agentCfg = loadAgentConfig();
      if (!agentCfg.enabled) {
        this.channelClosed();
      } else {
        await this.askAgent(raw, agentCfg);
      }
      this.writePrompt();
      return;
    }

    const [cmd, ...rest] = raw.split(/\s+/);
    const arg = rest.join(" ");
    switch (cmd) {
      case "/help":
        this.help();
        break;
      case "/commands":
        this.listCommands();
        break;
      case "/about":
        this.about();
        break;
      case "/status":
        this.status();
        break;
      case "/plant":
        this.writeln(this.renderPlant());
        break;
      case "/orb":
        this.orb();
        break;
      case "/lore":
        this.lore();
        break;
      case "/signal":
        this.writeln(`  ${CYAN}Signal steady.${R} Persistence confirmed.`);
        this.writeln(`  ${GRAY}... but steady is relative, isn't it?${R}`);
        break;
      case "/clear":
        this.term.clear();
        break;
      case "/echo":
        this.writeln(`  ${arg}`);
        break;
      case "/docs":
        this.writeln(
          `  ${AMBER}https://github.com/BarkBarkBarkBarkBarkBarkBark/Hosaka${R}`,
        );
        break;
      case "/video":
      case "/messages":
      case "/terminal":
      case "/lorepanel":
        this.writeln(
          `  ${GRAY}switch tabs at the top to open the ${cmd.slice(1)} panel.${R}`,
        );
        break;
      case "/exit":
        this.writeln(`  ${GRAY}there's nowhere to exit to. you're already here.${R}`);
        break;
      case "/ask":
      case "/chat":
        if (arg) {
          await this.askLlm(arg);
        } else {
          this.writeln(`  ${GRAY}usage: /ask <your question>${R}`);
        }
        break;
      case "/model":
        this.handleModel(arg);
        break;
      case "/agent":
        await this.handleAgent(arg);
        break;
      case "/settings":
        this.openSettings();
        break;
      case "/reset":
        this.llmHistory = [];
        this.writeln(`  ${GRAY}conversation cleared. fresh channel.${R}`);
        break;
      default:
        this.unknown(cmd);
    }
    this.writePrompt();
  }

  private async askLlm(prompt: string): Promise<void> {
    const cfg = loadLlmConfig();
    this.busy = true;
    this.startThinking();
    try {
      const res = await askGemini(prompt, this.llmHistory, cfg);
      this.stopThinking();
      if (!res.ok) {
        this.writeGeminiFallback(res.code);
        return;
      }
      this.llmHistory.push({ role: "user", text: prompt });
      this.llmHistory.push({ role: "assistant", text: res.text });
      if (this.llmHistory.length > 16) {
        this.llmHistory = this.llmHistory.slice(-16);
      }
      this.writeln("");
      for (const line of res.text.split("\n")) {
        this.writeln(`  ${line}`);
      }
      this.writeln("");
    } finally {
      this.stopThinking();
      this.busy = false;
    }
  }

  private writeGeminiFallback(code: "proxy_down" | "rate_limited" | "empty" | "unknown"): void {
    this.writeln("");
    switch (code) {
      case "rate_limited":
        this.writeln(`  ${GRAY}the channel is crowded. breathe. try again in a moment.${R}`);
        break;
      case "proxy_down":
        this.writeln(`  ${GRAY}the orb is quiet. the relay is resting.${R}`);
        this.writeln(`  ${GRAY}say ${VIOLET}neuro${R}${GRAY} and try again — picoclaw still listens.${R}`);
        break;
      case "empty":
        this.writeln(`  ${GRAY}the orb heard you but had nothing to say. try again.${R}`);
        break;
      default:
        this.writeln(`  ${GRAY}signal faint. try again in a moment.${R}`);
    }
    this.writeln("");
  }

  private channelClosed(): void {
    this.writeln("");
    this.writeln(`  ${GRAY}the channel is quiet. behind it: ${AMBER}picoclaw${R}${GRAY} — an agent${R}`);
    this.writeln(`  ${GRAY}that walks a sandboxed workspace and answers in full thoughts.${R}`);
    this.writeln(`  ${GRAY}say ${VIOLET}neuro${R}${GRAY} to open the door.${R}`);
    this.writeln("");
  }

  private handleModel(arg: string): void {
    const cfg = loadLlmConfig();
    if (!arg) {
      this.writeln(`  ${GRAY}current model:${R} ${AMBER}${cfg.model}${R}`);
      this.writeln(`  ${GRAY}available:${R}`);
      for (const m of GEMINI_MODELS) this.writeln(`    ${CYAN}${m}${R}`);
      this.writeln(
        `  ${GRAY}usage: /model <name>  ·  try ${CYAN}/settings${R}${GRAY} for key + mode.${R}`,
      );
      return;
    }
    if (!(GEMINI_MODELS as readonly string[]).includes(arg)) {
      this.writeln(`  ${RED}unknown model:${R} ${arg}`);
      this.writeln(`  ${GRAY}try one of:${R} ${GEMINI_MODELS.join(", ")}`);
      return;
    }
    saveLlmConfig({ ...cfg, model: arg as GeminiModel });
    this.writeln(`  ${GRAY}model set →${R} ${AMBER}${arg}${R}`);
  }

  private magicWord(): void {
    const cfg = loadAgentConfig();
    if (cfg.enabled) {
      this.writeln("");
      this.writeln(`  ${GRAY}channel already open.${R} ${AMBER}signal steady.${R}`);
      this.writeln("");
      return;
    }

    const next: AgentConfig = {
      url: cfg.url || DEFAULT_AGENT_URL,
      passphrase: MAGIC_WORD,
      enabled: true,
    };
    saveAgentConfig(next);

    this.writeln("");
    this.writeln(`  ${DARK_GRAY}░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░${R}`);
    this.writeln(`  ${DARK_GRAY}// the word was spoken${R}`);
    this.writeln(`  ${AMBER}authorizing${R}${DARK_GRAY}…${R}  ${GREEN}passphrase accepted${R}`);
    this.writeln(`  ${AMBER}connecting${R}${DARK_GRAY}…${R}  ${GREEN}agent channel open${R}`);
    this.writeln(`  ${DARK_GRAY}░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░${R}`);
    this.writeln("");
    this.writeln(`  ${GRAY}you are now speaking with ${AMBER}picoclaw${R}${GRAY} — an agentic framework${R}`);
    this.writeln(`  ${GRAY}with a sandboxed workspace it can ${VIOLET}walk, read, write, and probe${R}${GRAY}.${R}`);
    this.writeln("");
    this.writeln(`  ${DARK_GRAY}things to try:${R}`);
    this.writeln(`    ${CYAN}list the files in your workspace${R}`);
    this.writeln(`    ${CYAN}make a tiny haiku in haiku.txt${R}`);
    this.writeln(`    ${CYAN}what tools do you have?${R}`);
    this.writeln("");
    this.writeln(`  ${DARK_GRAY}it answers ${VIOLET}slowly${R}${DARK_GRAY} — agents think before they speak.${R}`);
    this.writeln(`  ${DARK_GRAY}to close the channel, type${R} ${CYAN}/agent off${R}${DARK_GRAY}.${R}`);
    this.writeln("");
  }

  private openSettings(): void {
    try {
      window.dispatchEvent(new CustomEvent("hosaka:open-settings"));
      this.writeln(`  ${GRAY}settings drawer opened. tap the gear next time.${R}`);
    } catch {
      this.writeln(`  ${RED}could not open settings (non-browser env?)${R}`);
    }
  }

  private async askAgent(prompt: string, cfg: AgentConfig): Promise<void> {
    this.busy = true;
    // Animated, in-character indicator so picoclaw's few-second latency
    // doesn't feel like a dropped prompt. Updates the same line in place
    // so we don't spam scrollback.
    this.startThinking();
    try {
      const agent = getAgent(cfg);
      let res = await agent.send(prompt);
      // Fly's ws proxy idles out silent connections after ~60s, so the
      // first send after a pause often lands on a half-dead socket and/or
      // a cold machine. One quiet retry masks the cold start without
      // spamming on a genuinely-down relay.
      if (!res.ok && res.code === "unreachable") {
        this.stopThinking();
        this.writeln(`  ${DARK_GRAY}… waking the relay${R}`);
        this.startThinking();
        await new Promise((r) => setTimeout(r, 1500));
        res = await agent.send(prompt);
      }
      this.stopThinking();
      if (!res.ok) {
        this.writeAgentFallback(res.code);
        return;
      }
      this.writeln("");
      for (const line of res.text.split("\n")) {
        this.writeln(`  ${line}`);
      }
      this.writeln("");
    } finally {
      this.stopThinking();
      this.busy = false;
    }
  }

  // ── animated in-character thinking indicator ───────────────────────────
  // Renders a single line that updates in place: a rotating message from
  // THINKING_FRAMES with an animated "…" trailer. Always paired with
  // stopThinking() in a finally block — never leave a dangling timer.
  private startThinking(): void {
    if (this.thinkingTimer !== null) return;
    let tick = 0;
    const trailers = [".", "..", "...", "…", "·…", "··…"];
    const renderFrame = () => {
      const msg = THINKING_FRAMES[Math.floor(tick / 4) % THINKING_FRAMES.length];
      const tail = trailers[tick % trailers.length];
      this.write(`\r\x1b[K  ${DARK_GRAY}${tail} ${msg}${R}`);
      tick += 1;
    };
    renderFrame();
    this.thinkingTimer = window.setInterval(renderFrame, 350);
  }

  private stopThinking(): void {
    if (this.thinkingTimer === null) return;
    window.clearInterval(this.thinkingTimer);
    this.thinkingTimer = null;
    // Wipe the indicator line so the next writeln starts on a clean row.
    this.write("\r\x1b[K");
  }

  // Branded in-character copy for every picoclaw failure mode. The user
  // should never see raw error strings, http codes, or stack traces.
  private writeAgentFallback(code: AgentErrorCode): void {
    this.writeln("");
    switch (code) {
      case "not_configured":
        this.writeln(`  ${GRAY}the channel isn't tuned yet. say ${VIOLET}neuro${R}${GRAY} to open it.${R}`);
        break;
      case "unauthorized":
        this.writeln(`  ${GRAY}the door didn't recognize the word. say ${VIOLET}neuro${R}${GRAY} to try again.${R}`);
        break;
      case "unreachable":
        this.writeln(`  ${GRAY}the relay is sleeping. give it a moment and try again.${R}`);
        break;
      case "timeout":
        this.writeln(`  ${GRAY}the signal took too long to come back. try again.${R}`);
        break;
      case "rate_limited":
        this.writeln(`  ${GRAY}too many pings in a short window. breathe, then try again.${R}`);
        break;
      case "busy":
        this.writeln(`  ${GRAY}still listening to the last thing you said. patience.${R}`);
        break;
      case "dropped":
        this.writeln(`  ${GRAY}the channel blinked. try once more.${R}`);
        break;
      case "empty":
        this.writeln(`  ${GRAY}picoclaw heard you but said nothing. try rephrasing.${R}`);
        break;
      default:
        this.writeln(`  ${GRAY}signal faint. try again in a moment.${R}`);
    }
    this.writeln("");
  }

  private async handleAgent(arg: string): Promise<void> {
    const cfg = loadAgentConfig();
    const parts = arg.trim().split(/\s+/).filter(Boolean);
    const sub = parts[0] ?? "";

    if (!sub || sub === "status") {
      this.writeln(`  ${GRAY}agent mode:${R}    ${cfg.enabled ? AMBER + "on" : GRAY + "off"}${R}`);
      this.writeln(`  ${GRAY}url:${R}           ${cfg.url || "(unset)"}`);
      this.writeln(
        `  ${GRAY}passphrase:${R}    ${cfg.passphrase ? "•".repeat(Math.min(cfg.passphrase.length, 10)) : "(unset)"}`,
      );
      this.writeln("");
      this.writeln(
        `  ${GRAY}usage:${R} /agent on | off | url <wss://…> | passphrase <phrase> | test`,
      );
      return;
    }

    if (sub === "on") {
      if (!cfg.url || !cfg.passphrase) {
        this.writeln(
          `  ${RED}can't enable:${R} need both url and passphrase first.`,
        );
        return;
      }
      saveAgentConfig({ ...cfg, enabled: true });
      this.writeln(`  ${AMBER}agent mode on.${R} ${GRAY}typing now goes to picoclaw.${R}`);
      return;
    }
    if (sub === "off") {
      saveAgentConfig({ ...cfg, enabled: false });
      this.writeln(`  ${GRAY}agent mode off. typing now goes to gemini.${R}`);
      return;
    }
    if (sub === "url") {
      const value = parts.slice(1).join(" ").trim();
      if (!value) {
        this.writeln(`  ${GRAY}usage: /agent url wss://host/ws/agent${R}`);
        return;
      }
      if (!/^wss?:\/\//i.test(value)) {
        this.writeln(`  ${RED}url must start with ws:// or wss://${R}`);
        return;
      }
      saveAgentConfig({ ...cfg, url: value });
      this.writeln(`  ${GRAY}agent url saved.${R}`);
      return;
    }
    if (sub === "passphrase") {
      const value = parts.slice(1).join(" ").trim();
      if (!value) {
        this.writeln(`  ${GRAY}usage: /agent passphrase <phrase>${R}`);
        return;
      }
      saveAgentConfig({ ...cfg, passphrase: value });
      this.writeln(`  ${GRAY}passphrase saved (browser-only).${R}`);
      return;
    }
    if (sub === "test") {
      if (!cfg.url || !cfg.passphrase) {
        this.writeln(`  ${GRAY}the channel isn't tuned. say ${VIOLET}neuro${R}${GRAY} first.${R}`);
        return;
      }
      this.writeln(`  ${DARK_GRAY}pinging agent…${R}`);
      this.busy = true;
      try {
        const agent = getAgent(cfg);
        const res = await agent.send("say 'signal steady' and nothing else.");
        if (res.ok) {
          this.writeln(`  ${GRAY}✓ reply:${R} ${res.text.split("\n")[0]}`);
        } else {
          this.writeAgentFallback(res.code);
        }
      } finally {
        this.busy = false;
      }
      return;
    }
    this.writeln(`  ${RED}unknown /agent subcommand:${R} ${sub}`);
  }

  private help(): void {
    this.writeln(
      `  ${CYAN}quick start${R} — type anything, prefix ${CYAN}/${R} for commands.`,
    );
    this.writeln("");
    const starters: [string, string][] = [
      ["/commands", "list everything"],
      ["/status", "what's online"],
      ["/plant", "check the alien plant"],
      ["/lore", "breadcrumbs from before the cascade"],
      ["/orb", "the orb sees you"],
      ["/about", "what is this thing"],
    ];
    for (const [c, d] of starters) {
      this.writeln(`    ${CYAN}${pad(c, 14)}${R}${GRAY}${d}${R}`);
    }
    this.writeln("");
    this.writeln(
      `  ${VIOLET}there is no wrong way.${R} experiment freely.`,
    );
  }

  private listCommands(): void {
    let currentCat = "";
    const rows = COMMANDS as readonly CommandEntry[];
    for (const row of rows) {
      if (row.cat !== currentCat) {
        currentCat = row.cat;
        this.writeln("");
        this.writeln(`  ${AMBER_DIM}── ${currentCat} ──${R}`);
      }
      this.writeln(
        `    ${CYAN}${pad(row.cmd, 18)}${R}${GRAY}${row.desc}${R}`,
      );
    }
    this.writeln("");
    this.writeln(
      `  ${DARK_GRAY}(hosted build is a loving simulation. the appliance does the rest.)${R}`,
    );
  }

  private status(): void {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    this.writeln(`  ${GRAY}Host:${R}       ${AMBER}hosaka.web${R}`);
    this.writeln(`  ${GRAY}Mode:${R}       ${AMBER}hosted${R}  ${DARK_GRAY}// static, no backend${R}`);
    this.writeln(`  ${GRAY}Signal:${R}     ${GREEN}steady${R}`);
    this.writeln(`  ${GRAY}Plant:${R}      ${GREEN}${this.plantState()}${R}`);
    this.writeln(`  ${GRAY}Orb:${R}        ${VIOLET}watching${R}`);
    this.writeln(`  ${GRAY}Clock (utc):${R} ${AMBER}${now}${R}`);
  }

  private plantState(): string {
    const idx = Math.min(
      PLANT_STATES.length - 1,
      Math.floor(this.plantTicks / 5),
    );
    const names = [
      "dead", "wilted", "dry", "stable", "growing", "bloom", "colony",
    ];
    return `${names[idx] ?? "stable"} (idx ${idx})`;
  }

  private about(): void {
    this.writeln(`  ${CYAN}HOSAKA — Web Desktop Edition${R}`);
    this.writeln(`  ${GRAY}// signal persists //${R}`);
    this.writeln("");
    this.writeln(
      `  a console-first cyberdeck appliance shell, wearing a touchscreen.`,
    );
    this.writeln(
      `  hosted build is static. the appliance runs the real python TUI.`,
    );
    this.writeln("");
    this.writeln(`  ${VIOLET}there is no wrong way.${R}`);
  }

  private orb(): void {
    this.writeln("");
    const lines = pickRandom(ORBS);
    for (const l of lines) this.writeln(`  ${VIOLET}${l}${R}`);
    const captions = [
      "the orb watches. it offers no judgment.",
      "something stirs in the signal.",
      "the orb acknowledges your presence.",
      "luminance holds. for now.",
      "it has always been here.",
    ];
    this.writeln(`  ${GRAY}${pickRandom(captions)}${R}`);
    this.writeln("");
  }

  private lore(): void {
    this.writeln("");
    const lines = pickRandom(LORE_FRAGMENTS);
    for (const line of lines) {
      this.writeln(`  ${DARK_GRAY}${line}${R}`);
    }
    this.writeln("");
  }

  private unknown(cmd: string): void {
    this.writeln(`  ${GRAY}unknown command:${R} ${AMBER}${cmd}${R}`);
    this.writeln(
      `  ${VIOLET}no wrong way${R} — try ${CYAN}/commands${R}.`,
    );
    if (cmd === "/rm" || cmd === "/sudo") {
      this.writeln(`  ${RED}bold choice.${R} ${GRAY}glad it didn't work.${R}`);
    }
  }
}
