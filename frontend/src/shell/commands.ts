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
