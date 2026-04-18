// Theatrical tcpdump / wireshark–style packet generator for /netscan.
// Yields colorized ANSI lines at random intervals. All data is invented.

const ESC = "\x1b[";
const R = `${ESC}0m`;
const CYAN = `${ESC}36m`;
const GREEN = `${ESC}32m`;
const AMBER = `${ESC}38;5;214m`;
const GRAY = `${ESC}38;5;245m`;
const DARK = `${ESC}38;5;240m`;
const BLUE = `${ESC}34m`;
const RED = `${ESC}31m`;
const VIOLET = `${ESC}38;5;141m`;

const HOSTS = [
  "10.0.42.1", "10.0.42.7", "10.0.42.12", "10.0.42.99",
  "172.16.0.3", "172.16.0.11", "172.16.0.50",
  "192.168.1.1", "192.168.1.42", "192.168.1.100",
  "fd00::412", "fd00::7e:3", "::1",
];

const EXT_HOSTS = [
  "relay.hosaka.net", "signal.cascade.io", "orb.deep-signal.dev",
  "node-412.ring.internal", "picoclaw.fly.dev", "cdn.fragment.co",
  "dns.resolver.lan", "ntp.drift.sys",
];

const PROTOCOLS = ["TCP", "UDP", "TLS", "DNS", "ICMP", "QUIC", "SSH"];
const PORTS = [22, 53, 80, 443, 993, 8080, 8443, 18790, 51820];
const FLAGS = ["SYN", "SYN-ACK", "ACK", "FIN", "PSH-ACK", "RST"];
const DNS_QUERIES = [
  "A orb.deep-signal.dev", "AAAA relay.hosaka.net",
  "PTR 412.42.0.10.in-addr.arpa", "TXT _hosaka.signal.cascade.io",
  "A node-412.ring.internal", "CNAME cdn.fragment.co",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function ts(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function genTcp(): string {
  const src = pick(HOSTS);
  const dst = pick([...HOSTS, ...EXT_HOSTS]);
  const sp = pick(PORTS);
  const dp = pick(PORTS);
  const flag = pick(FLAGS);
  const len = Math.floor(Math.random() * 1400) + 40;
  return `${DARK}${ts()}${R}  ${GREEN}TCP${R}  ${CYAN}${src}:${sp}${R} → ${CYAN}${dst}:${dp}${R}  ${GRAY}[${flag}]${R} len=${len}`;
}

function genDns(): string {
  const src = pick(HOSTS);
  const q = pick(DNS_QUERIES);
  return `${DARK}${ts()}${R}  ${BLUE}DNS${R}  ${CYAN}${src}${R} → ${CYAN}dns.resolver.lan:53${R}  ${GRAY}${q}${R}`;
}

function genTls(): string {
  const src = pick(HOSTS);
  const dst = pick(EXT_HOSTS);
  const phase = pick(["ClientHello", "ServerHello", "ChangeCipherSpec", "ApplicationData"]);
  return `${DARK}${ts()}${R}  ${VIOLET}TLS${R}  ${CYAN}${src}:${pick(PORTS)}${R} → ${CYAN}${dst}:443${R}  ${GRAY}${phase}${R}`;
}

function genIcmp(): string {
  const src = pick(HOSTS);
  const dst = pick([...HOSTS, ...EXT_HOSTS]);
  const t = pick(["echo request", "echo reply", "dest unreachable", "time exceeded"]);
  return `${DARK}${ts()}${R}  ${AMBER}ICMP${R} ${CYAN}${src}${R} → ${CYAN}${dst}${R}  ${GRAY}${t}${R}`;
}

function genQuic(): string {
  const src = pick(HOSTS);
  const dst = pick(EXT_HOSTS);
  return `${DARK}${ts()}${R}  ${GREEN}QUIC${R} ${CYAN}${src}:${pick(PORTS)}${R} → ${CYAN}${dst}:443${R}  ${GRAY}Initial, DCID=${Math.random().toString(16).slice(2, 10)}${R}`;
}

function genSsh(): string {
  const src = pick(HOSTS);
  const dst = pick([...HOSTS, ...EXT_HOSTS]);
  const phase = pick(["kex_init", "newkeys", "channel_open", "channel_data"]);
  return `${DARK}${ts()}${R}  ${RED}SSH${R}  ${CYAN}${src}:${pick(PORTS)}${R} → ${CYAN}${dst}:22${R}  ${GRAY}${phase}${R}`;
}

const GENERATORS = [genTcp, genTcp, genTcp, genDns, genTls, genTls, genIcmp, genQuic, genSsh];

export function generatePacketLine(): string {
  return pick(GENERATORS)();
}

export function realFrameTag(line: string): string {
  return `${AMBER}[REAL]${R} ${line}`;
}

export function netscanHeader(): string {
  const proto = PROTOCOLS.join(` ${DARK}|${R} `);
  return [
    `  ${DARK}┌─ netscan ────────────────────────────────────┐${R}`,
    `  ${DARK}│${R} ${GRAY}protocols: ${proto}${R}`,
    `  ${DARK}│${R} ${GRAY}ctrl-c to stop${R}`,
    `  ${DARK}└──────────────────────────────────────────────┘${R}`,
  ].join("\r\n");
}
