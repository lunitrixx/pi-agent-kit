import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import { hostname, userInfo, totalmem, cpus } from "node:os";

const R = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
const X = "\x1b[0m";
const B = "\x1b[1m";

const C = {
  red:    R(255, 50, 50),
  orange: R(255, 140, 0),
  yellow: R(255, 220, 0),
  green:  R(0, 200, 70),
  blue:   R(0, 130, 255),
  purple: R(140, 0, 255),
  mauve:  R(245, 194, 231),
  sky:    R(137, 220, 235),
  text:   R(205, 214, 244),
  teal:   R(148, 226, 213),
  accent: R(255, 140, 0),
};

const LUNITRIXX = [
  `${C.red}${B}██╗     ██╗   ██╗███╗   ██╗██╗████████╗██████╗ ██╗██╗  ██╗██╗  ██╗${X}`,
  `${C.orange}${B}██║     ██║   ██║████╗  ██║██║╚══██╔══╝██╔══██╗██║╚██╗██╔╝╚██╗██╔╝${X}`,
  `${C.yellow}${B}██║     ██║   ██║██╔██╗ ██║██║   ██║   ██████╔╝██║ ╚███╔╝  ╚███╔╝${X}`,
  `${C.green}${B}██║     ██║   ██║██║╚██╗██║██║   ██║   ██╔══██╗██║ ██╔██╗  ██╔██╗${X}`,
  `${C.blue}${B}███████╗╚██████╔╝██║ ╚████║██║   ██║   ██║  ██║██║██╔╝ ██╗██╔╝ ██╗${X}`,
  `${C.purple}${B}╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝${X}`,
];

function sh(cmd: string): string {
  try { return execSync(cmd, { encoding: "utf-8", timeout: 2000 }).trim(); } catch { return "?"; }
}

function getSysInfo(): string[] {
  const user = process.env.USER ?? userInfo().username;
  const host = hostname();
  const os = sh("grep '^PRETTY_NAME=' /etc/os-release | cut -d= -f2 | tr -d '\"'") || "NixOS";
  const kernel = sh("uname -r");
  const cpuModel = cpus()[0]?.model?.replace(/\s+/g, " ").trim() ?? "?";
  const cpuCores = cpus().length;
  const memGib = (n: number) => (n / 1024 ** 3).toFixed(2);
  const memTotal = totalmem();
  const memAvail = parseInt(sh("free -b | awk '/^Mem:/{print $7}'")) || 0;
  const memUsed = memTotal - memAvail;
  const memPct = Math.round((memUsed / memTotal) * 100);
  const diskLine = sh("df -h / | awk 'NR==2{print $3\" / \"$2\" (\"$5\")\"}'");

  return [
    `${C.mauve}${B}${user}${X}${C.text}@${X}${C.sky}${B}${host}${X}`,
    "",
    `${C.text}OS${X}      ${os} (${kernel})`,
    `${C.mauve}CPU${X}     ${cpuModel} (${cpuCores})`,
    `${C.green}Memory${X}  ${memGib(memUsed)} / ${memGib(memTotal)} GiB (${memPct}%)`,
    `${C.teal}Disk${X}    ${diskLine}`,
  ];
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setHeader((_tui, _theme) => ({
      render(_width: number): string[] {
        const sys = getSysInfo();
        const sloganRaw = "Now you're part of the frequency.";
        const linkRaw = "https://linktr.ee/lunitrixx";
        const lw = Math.max(...LUNITRIXX.map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").length));
        const padSlogan = " ".repeat(Math.max(0, Math.floor((lw - sloganRaw.length) / 2)));
        const padLink = " ".repeat(Math.max(0, Math.floor((lw - linkRaw.length) / 2)));
        const P = "  ";
        return [
          "",
          ...LUNITRIXX.map((l) => P + l),
          "",
          P + `${padSlogan}${C.accent}${B}${sloganRaw}${X}`,
          "",
          P + `${padLink}${C.text}${linkRaw}${X}`,
          "",
          "",
          ...sys.map((l) => P + l),
          "",
        ];
      },
      invalidate() {},
    }));
  });
}
