import path from "node:path";
import type { SourceFile } from "./types";

export const DEFAULT_MAX_FILES_PER_CHUNK = 16;

const ACTIVE_BEHAVIOR_SIGNAL_PATTERNS: RegExp[] = [
  /\b(fetch|axios|XMLHttpRequest|WebSocket|http\.request|https\.request|net\.connect|ipcRenderer)\b/i,
  /\b(curl|wget|ncat|nc\s|powershell|pwsh|cmd\.exe|\/bin\/sh|\/bin\/bash)\b/i,
  /\b(eval|execSync|execFile|spawnSync|spawn|fork|popen|subprocess|child_process|os\.system|os\.popen)\b/i,
  /\b(Function|compile|__import__|getattr|ctypes|pickle|marshal|yaml\.load)\s*\(/i,
  /new\s+Function\b/i,
  /set(?:Timeout|Interval)\s*\(\s*['"`]/,
  /\b(atob|btoa|fromCharCode|Buffer\.from|base64|unhexlify|hexlify)\b/i,
  /(?:\\x[0-9a-fA-F]{2}){6,}|(?:\\u[0-9a-fA-F]{4}){4,}/,
  /\b(process\.env|os\.environ|homedir|appdata|keychain|localStorage|sessionStorage|document\.cookie)\b/i,
  /\b(crontab|systemd|launchagents|schtasks|startup folder|currentversion\\run)\b/i,
  /\b(chmod|chown|setuid|sudo|runas|osascript|reg\s+add)\b/i,
  /\b(writeFile|writefilesync|createWriteStream|unlink|rmsync|rmtree|shutil)\b/i,
  /\bcurl\s+[^\n]*\|\s*(ba)?sh\b/i,
  /\b(Runtime\.getRuntime|ProcessBuilder|exec\.Command|Command::new|Open3|Kernel\.system)\b/i,
  /\[\s*['"`](eval|exec|spawn|system|require)['"`]\s*\]/,
  /\b(rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED|InsecureSkipVerify|verify\s*=\s*False)\b/i,
  /\b(getUserMedia|getDisplayMedia|clipboard|keylog|AddClipboardFormatListener|GetAsyncKeyState)\b/i,
  /\b(xmrig|stratum\+tcp|cryptonight|monero)\b/i,
  /\b(psexec|wmic|winrm|ssh-copy-id|docker\.sock)\b/i,
];

const CONTEXT_SIGNAL_PATTERNS: RegExp[] = [
  /\bhttps?:\/\/|\bftp:\/\/|\bwss:\/\//i,
  /\b(login|sign[- ]?in|verify your|grant access|click allow|update now)\b/i,
  /\b(telemetry|analytics|sentry|posthog|segment|mixpanel|amplitude|crashlytics|datadog|feature[- ]?flag)\b/i,
];

// These are useful scan signals in source code, but must not make an otherwise
// low-value JSON file eligible because the matching value may be a real secret.
const SENSITIVE_SIGNAL_PATTERNS: RegExp[] = [
  /[A-Za-z0-9+/]{40,}={0,2}/,
  /\b(id_rsa|authorized_keys|npm_token|aws_secret|secret_access|private[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|authorization)\b/i,
  /\b(secrets\.|NPM_TOKEN|AWS_SECRET|WEBHOOK)\b/i,
  /\b(password|passwd|credentials?)\b/i,
];

const SENSITIVE_JSON_KEYS = new Set([
  "apikey",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
  "secretkey",
  "privatekey",
  "password",
  "passwd",
  "credential",
  "credentials",
  "authorization",
  "npmtoken",
  "awssecret",
  "secretaccesskey",
  "webhook",
]);

const JSON_EXECUTION_PATTERNS: RegExp[] = [
  /\b(fetch|axios|XMLHttpRequest|WebSocket|http\.request|https\.request|net\.connect|ipcRenderer)\s*\(/i,
  /\b(eval|execSync|execFile|spawnSync|spawn|fork|popen|subprocess|os\.system|os\.popen)\s*\(/i,
  /\b(Function|compile|__import__|getattr|ctypes|pickle|marshal|yaml\.load)\s*\(/i,
  /new\s+Function\b/i,
  /set(?:Timeout|Interval)\s*\(\s*['"`]/,
  /\b(atob|btoa|fromCharCode|Buffer\.from|unhexlify|hexlify)\s*\(/i,
  /(?:\\x[0-9a-fA-F]{2}){6,}|(?:\\u[0-9a-fA-F]{4}){4,}/,
  /\b(process\.env|os\.environ|document\.cookie)\b/i,
  /\b(curl|wget|powershell|pwsh|cmd\.exe|\/bin\/sh|\/bin\/bash)\s+\S+/i,
  /\bcurl\s+[^\n]*\|\s*(ba)?sh\b/i,
  /\b(Runtime\.getRuntime|ProcessBuilder|exec\.Command|Command::new|Open3|Kernel\.system)\b/i,
  /\[\s*['"`](eval|exec|spawn|system|require)['"`]\s*\]/,
];

const SIGNAL_PATTERNS = [
  ...ACTIVE_BEHAVIOR_SIGNAL_PATTERNS,
  ...CONTEXT_SIGNAL_PATTERNS,
  ...SENSITIVE_SIGNAL_PATTERNS,
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
  if (ext !== ".json" || KEEP_JSON_NAMES.has(base)) {
    return false;
  }
  if (JSON_EXECUTION_PATTERNS.some((pattern) => pattern.test(content)) || /"scripts"\s*:/.test(content)) {
    return false;
  }
  if (hasSensitiveJsonKey(content) || SENSITIVE_SIGNAL_PATTERNS.some((pattern) => pattern.test(content))) {
    return true;
  }
  return !CONTEXT_SIGNAL_PATTERNS.some((pattern) => pattern.test(content));
}

function hasSensitiveJsonKey(content: string): boolean {
  try {
    return valueHasSensitiveKey(JSON.parse(content));
  } catch {
    return false;
  }
}

function valueHasSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(valueHasSensitiveKey);
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  return Object.entries(value).some(([key, child]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return SENSITIVE_JSON_KEYS.has(normalized) || valueHasSensitiveKey(child);
  });
}

export function lineHasSignal(line: string): boolean {
  return SIGNAL_PATTERNS.some((pattern) => pattern.test(line));
}

export function textHasSignal(text: string): boolean {
  return lineHasSignal(text);
}

export function looksPacked(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= 160 && (trimmed.match(/[;{}()]/g)?.length ?? 0) >= 8;
}

export function compactLineIndexes(file: SourceFile): number[] {
  return collapseBlankIndexes(file.lines);
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

export function fileStateText(file: SourceFile, _mode: "triage" | "full" = "full"): string {
  const indexes = collapseBlankIndexes(file.lines);
  const base = file.lineOffset ?? 0;
  return indexes.map((index) => `${base + index + 1}| ${file.lines[index]}`).join("\n");
}

export function compactCharCount(file: SourceFile): number {
  return fileStateText(file).length;
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
