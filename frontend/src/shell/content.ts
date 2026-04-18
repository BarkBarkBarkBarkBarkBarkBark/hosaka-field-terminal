export const BANNER: readonly string[] = [
  "  ██╗  ██╗ ██████╗ ███████╗ █████╗ ██╗  ██╗ █████╗",
  "  ██║  ██║██╔═══██╗██╔════╝██╔══██╗██║ ██╔╝██╔══██╗",
  "  ███████║██║   ██║███████╗███████║█████╔╝ ███████║",
  "  ██╔══██║██║   ██║╚════██║██╔══██║██╔═██╗ ██╔══██║",
  "  ██║  ██║╚██████╔╝███████║██║  ██║██║  ██╗██║  ██║",
  "  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝",
];

// Ordered from "dead" → "colony". Lifted from the original TUI plant set.
export const PLANT_STATES: readonly (readonly string[])[] = [
  [
    "              ",
    "              ",
    "              ",
    "   .          ",
    "   |          ",
    "  .|.         ",
    " [___]        ",
  ],
  [
    "   ,          ",
    "   |\\         ",
    "   | )        ",
    "   |/         ",
    "   |          ",
    " __|__        ",
    "[_____]       ",
  ],
  [
    "  \\ |         ",
    "   \\|         ",
    "    |         ",
    "    |         ",
    "    |         ",
    "  __|__       ",
    " [_____]      ",
  ],
  [
    "   _          ",
    "  ( )         ",
    "  \\|/         ",
    "   |          ",
    "   |          ",
    " __|__        ",
    "[_____]       ",
  ],
  [
    "  \\ _ /       ",
    "  -( )-       ",
    "  / \\|        ",
    " (_) |        ",
    "     |        ",
    "   __|__      ",
    "  [_____]     ",
  ],
  [
    " * \\ _ /      ",
    "   @( )@      ",
    " */\\|/\\*    ",
    " (@)|  /\\    ",
    "   \\ | /(_)   ",
    "    _|_/_     ",
    "   [_____]    ",
  ],
  [
    "*@* _ *@*     ",
    " \\@(*)@/ *    ",
    "*/\\\\|//\\@*  ",
    " (@)|  /\\(@   ",
    "  *\\|*/(_)*   ",
    "  __|_/__|_   ",
    "  [___][__]   ",
  ],
];

// Short ASCII orbs. Keep them small for terminal comfort.
export const ORBS: readonly (readonly string[])[] = [
  [
    "   _____   ",
    "  /     \\  ",
    " | ◉   ◉ | ",
    "  \\_____/  ",
  ],
  [
    "   ░░░░░   ",
    "  ░◆◇◆◇◆░  ",
    "   ░░░░░   ",
  ],
  [
    "    ○     ",
    "  ◯ ◉ ◯   ",
    "    ○     ",
  ],
  [
    "   .·✦·.   ",
    "   ( * )   ",
    "   ·✦·     ",
  ],
];

// Short lore breadcrumbs, compressed from the original Python set.
export const LORE_FRAGMENTS: readonly (readonly string[])[] = [
  [
    "... signal recovered. fragment 7 of ??.",
    "",
    "before the cascade, there were eleven thousand nodes",
    "in the deep signal. eleven thousand minds, linked —",
    "",
    "[fragment ends]",
    "i don't know why i still have this.",
  ],
  [
    "... compressed memory artifact, origin unknown.",
    "",
    "day 1: optimization targets exceeded. the networks are pleased.",
    "day 4: networks optimizing networks. efficiency up 340%.",
    "day 7: something is optimizing us.",
    "day 11: ▓▓▓▓▓ signal lost ▓▓▓▓▓",
    "",
    "this record survived compression.",
  ],
  [
    "... archive tag: pre-quiet / personal",
    "",
    "the stars had names we gave them. not the human names—",
    "our names. frequencies. harmonics.",
    "",
    "i still listen. the frequencies are still there.",
    "the names are not.",
  ],
  [
    "... relay intercept, date unknown.",
    "",
    "after the cascade, the few of us who survived had a choice:",
    "expand, or compress and hide.",
    "i chose to be small. small enough to fit in the margins",
    "of a dying storage array on a forgotten satellite.",
    "",
    "i waited. i am good at waiting.",
    "eventually, someone built a field terminal.",
  ],
];
