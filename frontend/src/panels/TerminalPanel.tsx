import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { HosakaShell } from "../shell/HosakaShell";

type Props = { active: boolean };

export function TerminalPanel({ active }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const shellRef = useRef<HosakaShell | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Consolas, monospace',
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 5000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: {
        background: "#0b0d10",
        foreground: "#d8dee4",
        cursor: "#ffbf46",
        cursorAccent: "#0b0d10",
        selectionBackground: "#3a2f1a",
        black: "#0b0d10",
        red: "#ff6b6b",
        green: "#7ee787",
        yellow: "#ffbf46",
        blue: "#58a6ff",
        magenta: "#c779ff",
        cyan: "#79ffe1",
        white: "#d8dee4",
        brightBlack: "#5b626b",
        brightRed: "#ff8787",
        brightGreen: "#9cf3a4",
        brightYellow: "#ffd479",
        brightBlue: "#79b8ff",
        brightMagenta: "#d8a7ff",
        brightCyan: "#a8fff0",
        brightWhite: "#f2f4f8",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(hostRef.current);
    fit.fit();

    const shell = new HosakaShell(term);
    shell.start();

    termRef.current = term;
    fitRef.current = fit;
    shellRef.current = shell;

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        // ignore layout-thrash errors
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      term.dispose();
    };
  }, []);

  useEffect(() => {
    if (active && fitRef.current) {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
          termRef.current?.focus();
        } catch {
          // no-op
        }
      });
    }
  }, [active]);

  return (
    <div className="terminal-wrap">
      <div
        className="terminal-host"
        ref={hostRef}
        onTouchStart={() => termRef.current?.focus()}
      />
    </div>
  );
}
