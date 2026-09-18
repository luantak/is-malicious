import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function listChangedPaths(root: string, fromRef: string): Promise<string[]> {
  const absRoot = path.resolve(root);
  const repoRoot = await gitToplevel(absRoot);
  const names = await gitDiffNames(repoRoot, fromRef);
  const changed: string[] = [];

  for (const relative of names) {
    const absolute = path.join(repoRoot, relative);
    const fromScanRoot = path.relative(absRoot, absolute);
    if (fromScanRoot.startsWith("..") || path.isAbsolute(fromScanRoot)) {
      continue;
    }
    changed.push(fromScanRoot.split(path.sep).join("/"));
  }

  return changed;
}

export function pathFilter(changed: string[]): (relativePath: string) => boolean {
  const allowed = new Set(changed.map((item) => item.split(path.sep).join("/")));
  return (relativePath) => allowed.has(relativePath.split(path.sep).join("/"));
}

async function gitToplevel(root: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
    timeout: 10_000,
  });
  return stdout.trim();
}

async function gitDiffNames(repoRoot: string, fromRef: string): Promise<string[]> {
  const specs = [`${fromRef}...HEAD`, `${fromRef}..HEAD`, fromRef];
  let lastError: unknown;
  for (const spec of specs) {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["-C", repoRoot, "diff", "--name-only", "-z", "--diff-filter=ACMR", spec],
        { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
      );
      return stdout.split("\0").filter(Boolean);
    } catch (error) {
      lastError = error;
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Could not list changes from ${fromRef}: ${message}`);
}
