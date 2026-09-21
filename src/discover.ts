import { promises as fs } from "node:fs";
import path from "node:path";
import { isBuildOutputPath, isLowValueConfig, isNamedNoiseConfig, isSkippedDirName } from "./compact";
import { isVcsDir, listUnignoredPaths } from "./gitignore";
import type { FileRole, SourceFile } from "./types";

const SKIP_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "poetry.lock",
  "pipfile.lock",
  "gemfile.lock",
  "composer.lock",
  "go.sum",
  "flake.lock",
  "npm-shrinkwrap.json",
]);

const SKIP_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".tiff",
  ".avif",
  ".heic",
  ".svg",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".o",
  ".obj",
  ".class",
  ".jar",
  ".war",
  ".apk",
  ".aab",
  ".wasm",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".7z",
  ".rar",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".eot",
  ".mp3",
  ".mp4",
  ".wav",
  ".mov",
  ".avi",
  ".pdf",
  ".doc",
  ".docx",
  ".map",
  ".lock",
  ".snap",
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".swift",
  ".cs",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".m",
  ".mm",
  ".php",
  ".scala",
  ".lua",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".r",
  ".vue",
  ".svelte",
  ".sql",
]);

const CONFIG_EXTENSIONS = new Set([
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".properties",
  ".xml",
  ".gradle",
]);

const CONFIG_NAMES = new Set([
  "dockerfile",
  "containerfile",
  "makefile",
  "cmakelists.txt",
  "gemfile",
  "rakefile",
  "pipfile",
  "procfile",
  "vagrantfile",
]);

const CI_NAMES = new Set([
  "jenkinsfile",
  ".gitlab-ci.yml",
  "azure-pipelines.yml",
  "bitbucket-pipelines.yml",
  "buildkite.yml",
  "cloudbuild.yaml",
  "appveyor.yml",
]);

const BUILD_NAMES = new Set([
  "webpack.config.js",
  "vite.config.ts",
  "vite.config.js",
  "rollup.config.js",
  "esbuild.config.js",
  "next.config.js",
  "next.config.mjs",
  "turbo.json",
]);

const GENERATED_SUFFIXES = [".min.js", ".min.css", ".generated.ts", ".generated.js", ".pb.go", ".g.dart"];

const DEFAULT_MAX_BYTES = 400_000;

export interface DiscoverOptions {
  maxBytes?: number;
}

export function shouldSkipDir(name: string): boolean {
  return isVcsDir(name) || isSkippedDirName(name);
}

export function classifyFile(relativePath: string): FileRole | null {
  const base = path.basename(relativePath);
  const lower = base.toLowerCase();
  const ext = path.extname(lower);

  if (SKIP_FILES.has(lower) || SKIP_EXTENSIONS.has(ext) || lower === ".env" || lower.startsWith(".env.")) {
    return null;
  }
  if (GENERATED_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
    return null;
  }
  if (/\.generated\./.test(lower) || lower.includes(".min.")) {
    return null;
  }

  const parts = relativePath.split(path.sep).map((part) => part.toLowerCase());
  if (parts.some((part) => isSkippedDirName(part)) || isBuildOutputPath(relativePath)) {
    return null;
  }
  if (isNamedNoiseConfig(relativePath)) {
    return null;
  }
  if (relativePath.toLowerCase().endsWith(".d.ts")) {
    return null;
  }
  if (
    parts.includes(".github") ||
    parts.includes(".gitlab") ||
    parts.includes(".circleci") ||
    parts.includes(".buildkite") ||
    CI_NAMES.has(lower)
  ) {
    return "ci";
  }
  if (BUILD_NAMES.has(lower) || lower.includes("webpack") || lower.includes("rollup.config")) {
    return "build";
  }
  if (CONFIG_NAMES.has(lower) || CONFIG_EXTENSIONS.has(ext)) {
    return "config";
  }
  if (SOURCE_EXTENSIONS.has(ext)) {
    return "source";
  }
  return null;
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  if (sample.includes(0)) {
    return true;
  }
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 13 && byte < 32)) {
      suspicious += 1;
    }
  }
  return suspicious / sample.length > 0.1;
}

export async function discoverFiles(root: string, options: DiscoverOptions = {}): Promise<SourceFile[]> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const absRoot = path.resolve(root);
  const candidates = await listUnignoredPaths(absRoot);
  const found: SourceFile[] = [];

  for (const relativePath of candidates) {
    const role = classifyFile(relativePath);
    if (!role) {
      continue;
    }
    const fullPath = path.join(absRoot, relativePath);
    let stat;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > maxBytes) {
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(fullPath);
    } catch {
      continue;
    }
    if (looksBinary(buffer)) {
      continue;
    }

    const content = buffer.toString("utf8");
    if (isLowValueConfig(relativePath, content)) {
      continue;
    }
    found.push({
      path: fullPath,
      relativePath,
      role,
      content,
      lines: content.split(/\r?\n/),
      bytes: stat.size,
    });
  }

  found.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return found;
}
