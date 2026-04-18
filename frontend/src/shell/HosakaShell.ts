import type { Terminal } from "@xterm/xterm";
import { BANNER, PLANT_STATES, LORE_FRAGMENTS, ORBS } from "./content";
import { COMMANDS, type CommandEntry } from "./commands";

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
    for (const line of BANNER) this.writeln(`${CYAN}${line}${R}`);
    this.writeln("");
    this.writeln(this.renderPlant());
    this.writeln("");
    this.writeln(
      `  ${CYAN}Field Terminal Online.${R}  ${GRAY}Signal steady.${R}  ${AMBER_DIM}hosted edition${R}`,
    );
    this.writeln(
      `  ${DARK_GRAY}/commands to explore  ·  /help to start  ·  just type to babble${R}`,
    );
    this.writeln(
      `  ${DARK_GRAY}this is a simulated shell — the appliance version runs the real thing${R}`,
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
      this.dispatch(raw);
    }
    this.writePrompt();
  }

  private dispatch(raw: string): void {
    if (raw.startsWith("!")) {
      this.writeln(
        `  ${AMBER}[sandbox]${R} shell passthrough is disabled in the hosted build.`,
      );
      this.writeln(
        `  ${GRAY}install the appliance to run real shells. see /docs.${R}`,
      );
      return;
    }

    if (!raw.startsWith("/")) {
      this.writeln(
        `  ${VIOLET}//${R} the orb received your transmission:`,
      );
      this.writeln(`     ${GRAY}"${raw}"${R}`);
      this.writeln(
        `  ${DARK_GRAY}in appliance mode this would reach Picoclaw. here, silence replies.${R}`,
      );
      return;
    }

    const [cmd, ...rest] = raw.split(/\s+/);
    const arg = rest.join(" ");
    switch (cmd) {
      case "/help":
        return this.help();
      case "/commands":
        return this.listCommands();
      case "/about":
        return this.about();
      case "/status":
        return this.status();
      case "/plant":
        return this.writeln(this.renderPlant());
      case "/orb":
        return this.orb();
      case "/lore":
        return this.lore();
      case "/signal":
        this.writeln(`  ${CYAN}Signal steady.${R} Persistence confirmed.`);
        this.writeln(`  ${GRAY}... but steady is relative, isn't it?${R}`);
        return;
      case "/clear":
        this.term.clear();
        return;
      case "/echo":
        return this.writeln(`  ${arg}`);
      case "/docs":
        return this.writeln(
          `  ${AMBER}https://github.com/BarkBarkBarkBarkBarkBarkBark/Hosaka${R}`,
        );
      case "/video":
      case "/messages":
      case "/terminal":
      case "/lorepanel":
        return this.writeln(
          `  ${GRAY}switch tabs at the top to open the ${cmd.slice(1)} panel.${R}`,
        );
      case "/exit":
        this.writeln(`  ${GRAY}there's nowhere to exit to. you're already here.${R}`);
        return;
      default:
        return this.unknown(cmd);
    }
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
