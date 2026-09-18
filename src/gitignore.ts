import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ignore, { type Ignore } from "ignore";

const execFileAsync = promisify(execFile);

const VCS_DIRS = new Set([".git", ".hg", ".svn"]);

export function isVcsDir(name: string): boolean {
  return VCS_DIRS.has(name);
}

function posix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

export async function listUnignoredPaths(root: string): Promise<string[]> {
  const fromGit = await listGitPaths(root);
  if (fromGit) {
    return fromGit;
  }
  return walkWithGitignore(root);
}

async function listGitPaths(root: string): Promise<string[] | null> {
  try {
    const { stdout: inside } = await execFileAsync(
      "git",
      ["-C", root, "rev-parse", "--is-inside-work-tree"],
      { timeout: 5000 },
    );
    if (inside.trim() !== "true") {
      return null;
    }
    const { stdout: toplevel } = await execFileAsync(
      "git",
      ["-C", root, "rev-parse", "--show-toplevel"],
      { timeout: 5000 },
    );
    const repoRoot = toplevel.trim();
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repoRoot, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { timeout: 30_000, maxBuffer: 64 * 1024 * 1024 },
    );
    const absRoot = path.resolve(root);
    const files: string[] = [];
    for (const relative of stdout.split("\0")) {
      if (!relative) {
        continue;
      }
      const absolute = path.join(repoRoot, relative);
      const fromScanRoot = path.relative(absRoot, absolute);
      if (fromScanRoot.startsWith("..") || path.isAbsolute(fromScanRoot)) {
        continue;
      }
      files.push(fromScanRoot);
    }
    return files;
  } catch {
    return null;
  }
}

interface IgnoreLayer {
  dirRel: string;
  ig: Ignore;
}

async function walkWithGitignore(root: string): Promise<string[]> {
  const absRoot = path.resolve(root);
  const found: string[] = [];
  const rootLayers: IgnoreLayer[] = [];

  try {
    const exclude = await fs.readFile(path.join(absRoot, ".git", "info", "exclude"), "utf8");
    rootLayers.push({ dirRel: "", ig: ignore().add(exclude) });
  } catch {
    // no exclude file
  }

  async function walk(dir: string, layers: IgnoreLayer[]): Promise<void> {
    let nextLayers = layers;
    try {
      const text = await fs.readFile(path.join(dir, ".gitignore"), "utf8");
      nextLayers = [...layers, { dirRel: posix(path.relative(absRoot, dir)), ig: ignore().add(text) }];
    } catch {
      // no gitignore here
    }

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (isVcsDir(entry.name)) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(absRoot, fullPath);
      if (isIgnored(posix(relativePath), entry.isDirectory(), nextLayers)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(fullPath, nextLayers);
        continue;
      }
      if (entry.isFile()) {
        found.push(relativePath);
      }
    }
  }

  await walk(absRoot, rootLayers);
  return found;
}

export function isIgnored(relativePosix: string, isDirectory: boolean, layers: IgnoreLayer[]): boolean {
  for (const layer of layers) {
    let local = relativePosix;
    if (layer.dirRel) {
      if (relativePosix !== layer.dirRel && !relativePosix.startsWith(`${layer.dirRel}/`)) {
        continue;
      }
      local = relativePosix.slice(layer.dirRel.length).replace(/^\//, "");
    }
    if (!local) {
      continue;
    }
    const candidate = isDirectory && !local.endsWith("/") ? `${local}/` : local;
    if (layer.ig.ignores(candidate)) {
      return true;
    }
  }
  return false;
}
