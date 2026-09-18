import path from "node:path";
import type { SourceFile } from "./types";

export const DEFAULT_MAX_FILES_PER_CHUNK = 16;

const IMPORT_LINE =
  /^\s*(import|export\s+.+\s+from|require\s*\(|from\s+\S+\s+import|using\s+\S+|require_once|include(_once)?\s*\(|#include)\b/;

const SIGNAL_PATTERNS: RegExp[] = [
  /\b(fetch|axios|XMLHttpRequest|WebSocket|http\.request|https\.request|net\.connect|ipcRenderer)\b/i,
  /\bhttps?:\/\/|\bftp:\/\/|\bwss:\/\//i,
  /\b(curl|wget|ncat|nc\s|powershell|pwsh|cmd\.exe|\/bin\/sh|\/bin\/bash)\b/i,
  /\b(eval|execSync|execFile|spawnSync|spawn|fork|popen|subprocess|child_process|os\.system|os\.popen)\b/i,
  /\b(Function|compile|__import__|getattr|ctypes|pickle|marshal|yaml\.load)\s*\(/i,
  /new\s+Function\b/i,
  /set(?:Timeout|Interval)\s*\(\s*['"`]/,
  /\b(atob|btoa|fromCharCode|Buffer\.from|base64|unhexlify|hexlify)\b/i,
  /(?:\\x[0-9a-fA-F]{2}){6,}|(?:\\u[0-9a-fA-F]{4}){4,}/,
  /[A-Za-z0-9+/]{40,}={0,2}/,
  /\b(process\.env|os\.environ|homedir|appdata|keychain|localStorage|sessionStorage|document\.cookie)\b/i,
  /\b(id_rsa|authorized_keys|npm_token|aws_secret|secret_access|private[_-]?key|authorization)\b/i,
  /\b(crontab|systemd|launchagents|schtasks|startup folder|currentversion\\run)\b/i,
  /\b(chmod|chown|setuid|sudo|runas|osascript|reg\s+add)\b/i,
  /\b(writeFile|writefilesync|createWriteStream|unlink|rmsync|rmtree|shutil)\b/i,
  /\b(secrets\.|NPM_TOKEN|AWS_SECRET|WEBHOOK|curl\s+[^\n]*\|\s*(ba)?sh)\b/i,
  /\b(password|passwd|login|sign[- ]?in|verify your|grant access|click allow|update now|credentials?)\b/i,
  /\b(Runtime\.getRuntime|ProcessBuilder|exec\.Command|Command::new|Open3|Kernel\.system)\b/i,
  /\[\s*['"`](eval|exec|spawn|system|require)['"`]\s*\]/,
];

const KEEP_JSON_NAMES = new Set([
  "package.json",
  "composer.json",
  "deno.json",
  "manifest.json",
  "app.json",
  "now.json",
  "vercel.json",
  "firebase.json",
  "snapcraft.json",
  "appsscript.json",
]);

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "coverage",
  ".turbo",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".output",
  ".cache",
  "__pycache__",
  ".pytest_cache",
  "htmlcov",
  ".nyc_output",
  "storybook-static",
]);

const OUTPUT_DIR_NAMES = new Set(["dist", "build", "out", "lib"]);

export function isSkippedDirName(name: string): boolean {
  return SKIP_DIR_NAMES.has(name.toLowerCase());
}

export function isBuildOutputPath(relativePath: string): boolean {
  const parts = relativePath.split(/[/\\]/).map((part) => part.toLowerCase());
  if (parts.some((part) => SKIP_DIR_NAMES.has(part))) {
    return true;
  }
  const ext = path.extname(relativePath).toLowerCase();
  const compiled = ext === ".js" || ext === ".cjs" || ext === ".mjs" || relativePath.toLowerCase().endsWith(".d.ts");
  if (!compiled) {
    return false;
  }
  const outputAt = parts.findIndex((part) => OUTPUT_DIR_NAMES.has(part));
  if (outputAt < 0) {
    return relativePath.toLowerCase().endsWith(".d.ts");
  }
  if (parts.slice(0, outputAt).includes("src")) {
    return false;
  }
  return true;
}

export function isNamedNoiseConfig(relativePath: string): boolean {
  const base = path.basename(relativePath).toLowerCase();
  if (/^tsconfig(\..+)?\.json$/.test(base) || base === "jsconfig.json") {
    return true;
  }
  if (base.startsWith(".prettierrc") || base.startsWith(".eslintrc") || base.startsWith("eslint.config")) {
    return true;
  }
  if (base === ".editorconfig" || base === "extensions.json") {
    return true;
  }
  return relativePath.split(/[/\\]/).includes(".vscode") && base === "settings.json";
}

export function isLowValueConfig(relativePath: string, content: string): boolean {
  if (isNamedNoiseConfig(relativePath)) {
    return true;
  }
  const base = path.basename(relativePath).toLowerCase();
  const ext = path.extname(base);
  return ext === ".json" && !KEEP_JSON_NAMES.has(base) && !textHasSignal(content) && !/"scripts"\s*:/.test(content);
}

export function lineHasSignal(line: string): boolean {
  return SIGNAL_PATTERNS.some((pattern) => pattern.test(line));
}

export function textHasSignal(text: string): boolean {
  return lineHasSignal(text);
}

export function shouldSendFull(file: SourceFile): boolean {
  if (file.role === "ci" || file.role === "build") {
    return true;
  }
  const base = path.basename(file.relativePath).toLowerCase();
  if (KEEP_JSON_NAMES.has(base) || base === "dockerfile" || base === "makefile" || base === "containerfile") {
    return true;
  }
  const ext = path.extname(base);
  return ext === ".sh" || ext === ".bash" || ext === ".zsh" || ext === ".ps1";
}

export function looksPacked(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= 160 && (trimmed.match(/[;{}()]/g)?.length ?? 0) >= 8;
}

export function isImportLine(line: string): boolean {
  return IMPORT_LINE.test(line);
}

export function compactLineIndexes(file: SourceFile): number[] {
  if (shouldSendFull(file)) {
    return collapseBlankIndexes(file.lines);
  }

  const keep = new Set<number>();
  const total = file.lines.length;
  const head = Math.min(12, total);
  const tail = Math.min(8, total);
  for (let index = 0; index < head; index += 1) {
    keep.add(index);
  }
  for (let index = Math.max(head, total - tail); index < total; index += 1) {
    keep.add(index);
  }

  for (let index = 0; index < total; index += 1) {
    const line = file.lines[index];
    if (lineHasSignal(line) || looksPacked(line) || isImportLine(line)) {
      for (let around = Math.max(0, index - 1); around <= Math.min(total - 1, index + 1); around += 1) {
        keep.add(around);
      }
    }
  }

  if (keep.size >= total * 0.7) {
    return collapseBlankIndexes(file.lines);
  }

  return [...keep]
    .sort((a, b) => a - b)
    .filter((index) => file.lines[index].trim().length > 0);
}

export function collapseBlankIndexes(lines: string[]): number[] {
  const indexes: number[] = [];
  let blank = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim().length === 0) {
      blank += 1;
      if (blank > 1) {
        continue;
      }
    } else {
      blank = 0;
    }
    indexes.push(index);
  }
  return indexes;
}

export function fileStateText(file: SourceFile, mode: "triage" | "full" = "triage"): string {
  const indexes = mode === "full" ? collapseBlankIndexes(file.lines) : compactLineIndexes(file);
  const base = file.lineOffset ?? 0;
  return indexes.map((index) => `${base + index + 1}| ${file.lines[index]}`).join("\n");
}

export function compactCharCount(file: SourceFile): number {
  return fileStateText(file, "triage").length;
}

export function interestingLocalLines(file: SourceFile): number[] {
  const hits: number[] = [];
  for (let index = 0; index < file.lines.length; index += 1) {
    const line = file.lines[index];
    if (lineHasSignal(line) || looksPacked(line)) {
      hits.push(index + 1);
    }
  }
  return hits;
}
