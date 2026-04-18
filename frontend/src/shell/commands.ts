export type CommandEntry = {
  cmd: string;
  desc: string;
  cat: string;
};

export const COMMANDS: readonly CommandEntry[] = [
  { cmd: "/help",      desc: "quick start guide",                   cat: "Reference" },
  { cmd: "/commands",  desc: "this list",                           cat: "Reference" },
  { cmd: "/about",     desc: "what is this thing",                  cat: "Reference" },
  { cmd: "/docs",      desc: "link to the original field terminal", cat: "Reference" },

  { cmd: "/ask <x>",   desc: "ask the orb a question (via gemini)", cat: "Chat & AI" },
  { cmd: "/model",     desc: "show or set the gemini model",        cat: "Chat & AI" },
  { cmd: "/reset",     desc: "forget the current conversation",     cat: "Chat & AI" },
  { cmd: "/settings",  desc: "open the settings drawer",            cat: "Chat & AI" },

  { cmd: "/agent",         desc: "show picoclaw agent status",        cat: "Agent" },
  { cmd: "/agent on|off",  desc: "route input to picoclaw instead",   cat: "Agent" },
  { cmd: "/agent test",    desc: "ping the agent backend",            cat: "Agent" },
  { cmd: "!<cmd>",         desc: "run a shell command in the sandbox", cat: "Agent" },

  { cmd: "/netscan",   desc: "theatrical + real network scanner",   cat: "Network" },

  { cmd: "/read",      desc: "list library fragments",              cat: "Reading" },
  { cmd: "/read <slug>", desc: "open a fragment in the reading tab", cat: "Reading" },
  { cmd: "/read order", desc: "the kindle relay (coming soon)",      cat: "Reading" },

  { cmd: "/todo",      desc: "open the open loops panel",           cat: "Open Loops" },
  { cmd: "/todo add <x>", desc: "add a loop from the terminal",     cat: "Open Loops" },
  { cmd: "/todo list", desc: "list open loops in-terminal",          cat: "Open Loops" },

  { cmd: "/status",    desc: "hosted-mode status",                  cat: "System" },
  { cmd: "/signal",    desc: "confirm persistence",                 cat: "System" },
  { cmd: "/clear",     desc: "wipe the screen",                     cat: "System" },

  { cmd: "/plant",     desc: "check the alien plant",               cat: "Tools" },
  { cmd: "/orb",       desc: "the orb sees you",                    cat: "Tools" },
  { cmd: "/lore",      desc: "fragments from before the cascade",   cat: "Tools" },
  { cmd: "/echo <x>",  desc: "say something back at yourself",      cat: "Tools" },

  { cmd: "/messages",  desc: "hint: open the messages tab",         cat: "Panels" },
];
