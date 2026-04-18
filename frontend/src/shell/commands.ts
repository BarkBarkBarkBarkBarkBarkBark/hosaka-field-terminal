export type CommandEntry = {
  cmd: string;
  desc: string;
  cat: string;
};

// Mirrors the real Hosaka TUI taxonomy, trimmed for the hosted simulation.
// See: Hosaka_Field-Terminal/hosaka/main_console.py COMMANDS list.
export const COMMANDS: readonly CommandEntry[] = [
  { cmd: "/help",      desc: "quick start guide",                   cat: "Reference" },
  { cmd: "/commands",  desc: "this list",                           cat: "Reference" },
  { cmd: "/about",     desc: "what is this thing",                  cat: "Reference" },
  { cmd: "/docs",      desc: "link to the original field terminal", cat: "Reference" },

  { cmd: "/chat",      desc: "enter a one-shot chat with gemini",   cat: "Chat & AI" },
  { cmd: "/ask <x>",   desc: "ask the orb a question",              cat: "Chat & AI" },
  { cmd: "/model",     desc: "show or set the gemini model",        cat: "Chat & AI" },
  { cmd: "/reset",     desc: "forget the current conversation",     cat: "Chat & AI" },
  { cmd: "/settings",  desc: "open the settings drawer",            cat: "Chat & AI" },

  { cmd: "/agent",         desc: "show picoclaw agent status",        cat: "Agent" },
  { cmd: "/agent on|off",  desc: "route input to picoclaw instead",   cat: "Agent" },
  { cmd: "/agent url <x>", desc: "set the fly.io websocket url",      cat: "Agent" },
  { cmd: "/agent passphrase <x>", desc: "set the shared passphrase",  cat: "Agent" },
  { cmd: "/agent test",    desc: "ping the agent backend",            cat: "Agent" },

  { cmd: "/status",    desc: "hosted-mode status",                  cat: "System" },
  { cmd: "/signal",    desc: "confirm persistence",                 cat: "System" },
  { cmd: "/clear",     desc: "wipe the screen",                     cat: "System" },

  { cmd: "/plant",     desc: "check the alien plant",               cat: "Tools" },
  { cmd: "/orb",       desc: "the orb sees you",                    cat: "Tools" },
  { cmd: "/lore",      desc: "fragments from before the cascade",   cat: "Tools" },
  { cmd: "/echo <x>",  desc: "say something back at yourself",      cat: "Tools" },

  { cmd: "/video",     desc: "hint: open the video tab",            cat: "Panels" },
  { cmd: "/messages",  desc: "hint: open the messages tab",         cat: "Panels" },
];
