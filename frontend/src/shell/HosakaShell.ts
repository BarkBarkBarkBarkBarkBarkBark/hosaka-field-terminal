import type { Terminal } from "@xterm/xterm";
import {
  BANNER,
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
import {
  generatePacket,
  packetToRow,
  tableHeader,
  netscanHeader,
  realFrameTag,
  portsLine,
  packetCountLine,
  newPortTracker,
  trackPacket,
} from "./netscan";

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
  private netscanTimer: number | null = null;
  private suggestion: string | null = null;

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
    // Push the cursor to the vertical mid-screen by writing enough blank
    // lines to center it, then scrolling back. xterm doesn't expose a
    // native "center viewport on cursor" API, so we pad after every
    // prompt to keep the active line from being glued to the bottom.
    const rows = this.term.rows ?? 24;
    const pad = Math.floor(rows / 2);
    for (let i = 0; i < pad; i++) this.writeln("");
    this.term.scrollToBottom();
    // Move the cursor back up to where those blanks start so the prompt
    // sits at ~mid screen and new output grows downward from there.
    this.write(`\x1b[${pad}A`);
    this.write(prompt());

    // If there's a suggestion from the last picoclaw reply, show it as
    // dim ghost text on the prompt line. Tab or Enter accepts, Esc or
    // any other keypress dismisses.
    if (this.suggestion) {
      this.write(`${DARK_GRAY}${this.suggestion}${R}`);
      // Move cursor back to the start of the suggestion text so the
      // cursor sits at prompt position (user hasn't typed it yet).
      this.write(`\x1b[${this.suggestion.length}D`);
    }
  }

  private writeBanner(): void {
    // Narrow viewports get a deliberately tiny opening so the prompt
    // lands in the upper-mid of the screen instead of being pushed off
    // the fold by ASCII art. The plant + full chrome are still one
    // /plant or /help away.
    const cols = this.term.cols ?? 80;
    if (cols < 56) {
      this.writeln(`  ${CYAN}▓▒ HOSAKA ▒▓${R}  ${GRAY}signal steady${R}`);
      this.writeln(
        `  ${DARK_GRAY}/help  ·  ${VIOLET}whisper a word${R}${DARK_GRAY} to open the channel${R}`,
      );
      this.writeln("");
      return;
    }
    for (const line of BANNER) this.writeln(`${CYAN}${line}${R}`);
    this.writeln("");
    this.writeln(this.renderPlant());
    this.writeln("");
    this.writeln(
      `  ${CYAN}Field Terminal Online.${R}  ${GRAY}Signal steady.${R}  ${AMBER_DIM}hosted edition${R}`,
    );
    this.writeln(
      `  ${DARK_GRAY}/commands to explore  ·  /help to start  ·  /ask the orb anything${R}`,
    );
    this.writeln(
      `  ${DARK_GRAY}if someone shared a word with you, ${VIOLET}say it${R}${DARK_GRAY} and the channel opens.${R}`,
    );
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

    // Tab accepts the ghost suggestion
    if (data === "\t" && this.suggestion) {
      this.acceptSuggestion();
      return;
    }

    for (const ch of data) {
      const code = ch.charCodeAt(0);
      if (ch === "\r") {
        if (this.suggestion && this.buffer.length === 0) {
          this.acceptSuggestion();
          return;
        }
        this.clearSuggestion();
        this.submit();
      } else if (ch === "\x7f" || ch === "\b") {
        this.backspace();
      } else if (ch === "\x03") {
        // Ctrl-C — also kills netscan if running
        if (this.netscanTimer !== null) {
          this.stopNetscan();
          return;
        }
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
      } else if (ch === "\x1b" && this.suggestion) {
        this.clearSuggestion();
      } else if (code >= 32 && code !== 127) {
        if (this.suggestion) this.clearSuggestion();
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
      const cmd = raw.slice(1).trim();
      if (!cmd) {
        this.writeln(`  ${GRAY}usage: !ls, !cat README.md, etc.${R}`);
        this.writePrompt();
        return;
      }
      const agentCfg = loadAgentConfig();
      if (!agentCfg.enabled) {
        this.writeln(`  ${GRAY}the channel is quiet — ${VIOLET}whisper the word${R}${GRAY} first.${R}`);
        this.writePrompt();
        return;
      }
      await this.shellPassthrough(cmd, agentCfg);
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
      case "/messages":
      case "/terminal":
        this.writeln(
          `  ${GRAY}switch tabs at the top to open the ${cmd.slice(1)} panel.${R}`,
        );
        break;
      case "/read":
        this.handleRead(arg);
        break;
      case "/todo":
        this.handleTodo(arg);
        break;
      case "/netscan":
        await this.netscan();
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
        this.writeln(`  ${GRAY}whisper ${VIOLET}the word${R}${GRAY} and try again — picoclaw still listens.${R}`);
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
    this.writeln(`  ${GRAY}speak ${VIOLET}the magic word${R}${GRAY} to open the door.${R}`);
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

      // If the reply contains a fenced code block or an inline `command`,
      // extract the first one and offer it as a ghost suggestion on the
      // next prompt line. The user can accept with Tab/Enter or dismiss
      // with Esc or by typing anything else.
      const cmd = this.extractSuggestion(res.text);
      if (cmd) {
        this.suggestion = cmd;
      }
    } finally {
      this.stopThinking();
      this.busy = false;
    }
  }

  private acceptSuggestion(): void {
    if (!this.suggestion) return;
    const text = this.suggestion;
    this.suggestion = null;
    // Overwrite the ghost text with real (bright) text
    this.write("\r" + prompt() + "\x1b[K");
    this.buffer = text;
    this.cursor = text.length;
    this.write(text);
    // Auto-submit the accepted suggestion
    this.submit();
  }

  private clearSuggestion(): void {
    if (!this.suggestion) return;
    this.suggestion = null;
    // Erase the ghost text
    this.write("\r" + prompt() + "\x1b[K");
  }

  // ── inline code suggestion ──────────────────────────────────────────────
  // Extracts the first code block or inline `command` from picoclaw's reply.
  private extractSuggestion(text: string): string | null {
    // Fenced code blocks: ```...\n<code>\n```
    const fenced = /```[^\n]*\n([\s\S]*?)```/.exec(text);
    if (fenced) {
      const code = fenced[1].trim();
      // Only suggest if it's 1-2 lines (likely a command, not a file)
      const lines = code.split("\n");
      if (lines.length <= 2 && code.length < 200) {
        return lines[0].trim();
      }
    }
    // Inline backtick: `some command here`
    const inline = /`([^`]{3,120})`/.exec(text);
    if (inline) {
      const cmd = inline[1].trim();
      // Skip if it looks like prose rather than a command
      if (!cmd.includes(" ") || /^[!\/]|^[a-z]+\s/.test(cmd)) {
        return cmd;
      }
    }
    return null;
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
        this.writeln(`  ${GRAY}the channel isn't tuned yet. ${VIOLET}whisper a word${R}${GRAY} to open it.${R}`);
        break;
      case "unauthorized":
        this.writeln(`  ${GRAY}the door didn't recognize the word. ${VIOLET}try another${R}${GRAY}.${R}`);
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
        this.writeln(`  ${GRAY}the channel isn't tuned. ${VIOLET}speak the word${R}${GRAY} first.${R}`);
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

  // ── /read command ────────────────────────────────────────────────────────
  private handleRead(arg: string): void {
    if (!arg) {
      this.writeln(`  ${AMBER}library${R} — reading material from the signal`);
      this.writeln("");
      fetch("/library/index.json")
        .then((r) => r.json())
        .then((entries: { slug: string; title: string; summary: string }[]) => {
          for (const e of entries) {
            this.writeln(`    ${CYAN}${e.slug}${R}  ${GRAY}${e.summary}${R}`);
          }
          this.writeln("");
          this.writeln(`  ${GRAY}usage: /read <slug>  or switch to the reading tab.${R}`);
          this.writePrompt();
        })
        .catch(() => {
          this.writeln(`  ${GRAY}the library is quiet. try again.${R}`);
          this.writePrompt();
        });
      return;
    }
    if (arg === "order") {
      this.writeln(`  ${GRAY}the kindle relay isn't tuned yet — coming soon.${R}`);
      this.writeln(`  ${GRAY}for now, the local library is open. try ${CYAN}/read${R}${GRAY}.${R}`);
      return;
    }
    window.dispatchEvent(new CustomEvent("hosaka:read", { detail: arg }));
    window.dispatchEvent(new CustomEvent("hosaka:open-tab", { detail: "reading" }));
    this.writeln(`  ${GRAY}opening ${CYAN}${arg}${R}${GRAY} in the reading panel.${R}`);
  }

  // ── /todo command ───────────────────────────────────────────────────────
  private handleTodo(arg: string): void {
    if (!arg) {
      window.dispatchEvent(new CustomEvent("hosaka:open-tab", { detail: "todo" }));
      this.writeln(`  ${GRAY}opened the open loops panel.${R}`);
      return;
    }
    const parts = arg.split(/\s+/);
    const sub = parts[0];
    if (sub === "add") {
      const text = parts.slice(1).join(" ").trim();
      if (!text) {
        this.writeln(`  ${GRAY}usage: /todo add remember the signal${R}`);
        return;
      }
      window.dispatchEvent(new CustomEvent("hosaka:todo-add", { detail: text }));
      this.writeln(`  ${GRAY}loop opened: ${CYAN}${text}${R}`);
      return;
    }
    if (sub === "list") {
      try {
        const raw = localStorage.getItem("hosaka.todo.v1");
        const loops: { text: string; closed: boolean }[] = raw ? JSON.parse(raw) : [];
        const open = loops.filter((l) => !l.closed);
        if (open.length === 0) {
          this.writeln(`  ${GRAY}no open loops.${R}`);
          return;
        }
        for (const l of open) {
          this.writeln(`    ${CYAN}○${R} ${l.text}`);
        }
      } catch {
        this.writeln(`  ${GRAY}couldn't read loops.${R}`);
      }
      return;
    }
    this.writeln(`  ${GRAY}usage: /todo  ·  /todo add <text>  ·  /todo list${R}`);
  }

  // ── !cmd shell passthrough ──────────────────────────────────────────────
  private async shellPassthrough(cmd: string, cfg: AgentConfig): Promise<void> {
    this.busy = true;
    this.writeln(`  ${DARK_GRAY}$ ${cmd}${R}`);
    try {
      const agent = getAgent(cfg);
      const res = await agent.runShell(cmd);
      if (!res.ok) {
        this.writeAgentFallback(res.code);
        return;
      }
      const color = res.exit === 0 ? "" : RED;
      if (res.stdout.trim()) {
        for (const line of res.stdout.trimEnd().split("\n")) {
          this.writeln(`  ${color}${line}${R}`);
        }
      }
      if (res.stderr.trim()) {
        for (const line of res.stderr.trimEnd().split("\n")) {
          this.writeln(`  ${RED}${line}${R}`);
        }
      }
      if (res.exit !== 0) {
        this.writeln(`  ${DARK_GRAY}exit ${res.exit}${R}`);
      }
    } finally {
      this.busy = false;
    }
  }

  // ── /netscan ────────────────────────────────────────────────────────────
  private async netscan(): Promise<void> {
    const agentCfg = loadAgentConfig();
    this.writeln(netscanHeader());
    if (!agentCfg.enabled) {
      this.writeln(`  ${DARK_GRAY}(channel quiet — rehearsal feed only)${R}`);
    }
    this.writeln("");
    this.writeln(tableHeader());

    let tickCount = 0;
    const startTime = Date.now();
    const tracker = newPortTracker();
    const agent = agentCfg.enabled ? getAgent(agentCfg) : null;

    // Two status lines at the bottom that update in place:
    // line 1: open ports summary
    // line 2: packet count + rate
    // We write them once, then overwrite them each tick by cursor-up.
    this.writeln("");
    this.writeln("");

    this.netscanTimer = window.setInterval(() => {
      const pkt = generatePacket();
      trackPacket(tracker, pkt);
      tickCount += 1;

      const elapsed = Math.max(1, (Date.now() - startTime) / 1000);
      const rate = Math.round(tickCount / elapsed);

      // Move up 2 (the status lines), insert a new row before them
      this.write(`\x1b[2A`);
      this.writeln(`  ${packetToRow(pkt)}`);
      // Rewrite status lines
      this.write(`\r\x1b[K`);
      this.writeln(portsLine(tracker));
      this.write(`\r\x1b[K`);
      this.write(packetCountLine(tickCount, rate));

      if (agent && tickCount % 15 === 0) {
        void agent.runShell("ss -tunp 2>/dev/null | tail -5").then((r) => {
          if (this.netscanTimer === null) return;
          if (r.ok && r.stdout.trim()) {
            for (const line of r.stdout.trim().split("\n").slice(0, 3)) {
              this.write(`\x1b[2A`);
              this.writeln(`  ${realFrameTag(line)}`);
              this.writeln(portsLine(tracker));
              this.write(packetCountLine(tickCount, Math.round(tickCount / Math.max(1, (Date.now() - startTime) / 1000))));
            }
          }
        });
      }
    }, 120 + Math.floor(Math.random() * 80));
  }

  private stopNetscan(): void {
    if (this.netscanTimer === null) return;
    window.clearInterval(this.netscanTimer);
    this.netscanTimer = null;
    this.writeln("");
    this.writeln("");
    this.writeln(`  ${GRAY}netscan stopped.${R}`);
    this.writeln("");
    this.writePrompt();
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
