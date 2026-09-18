import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { listChangedPaths, pathFilter } from "../src/diff";
import { scanProject } from "../src/scan";
import { lowAnswers, scriptedAsker } from "./helpers";

const execFileAsync = promisify(execFile);
const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function gitRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "is-malicious-diff-"));
  temps.push(dir);
  await execFileAsync("git", ["-C", dir, "-c", "init.defaultBranch=main", "init"]);
  await execFileAsync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  await execFileAsync("git", ["-C", dir, "config", "user.name", "Test"]);
  await execFileAsync("git", ["-C", dir, "config", "commit.gpgsign", "false"]);
  return dir;
}

describe("listChangedPaths", () => {
  it("lists files added after the base ref", async () => {
    const root = await gitRepo();
    await fs.writeFile(path.join(root, "keep.js"), "const a = 1;\n");
    await execFileAsync("git", ["-C", root, "add", "keep.js"]);
    await execFileAsync("git", ["-C", root, "commit", "-m", "base"]);
    await execFileAsync("git", ["-C", root, "checkout", "-b", "pr"]);
    await fs.writeFile(path.join(root, "new.js"), "const b = 2;\n");
    await execFileAsync("git", ["-C", root, "add", "new.js"]);
    await execFileAsync("git", ["-C", root, "commit", "-m", "change"]);

    expect(await listChangedPaths(root, "main")).toEqual(["new.js"]);
    expect(pathFilter(["src/a.js"])("src/a.js")).toBe(true);
    expect(pathFilter(["src/a.js"])("src/b.js")).toBe(false);
  });
});

describe("scanProject diffFrom", () => {
  it("only scans files that changed since the ref", async () => {
    const root = await gitRepo();
    await fs.writeFile(path.join(root, "old.js"), "const a = 1;\n");
    await execFileAsync("git", ["-C", root, "add", "old.js"]);
    await execFileAsync("git", ["-C", root, "commit", "-m", "base"]);
    await fs.writeFile(path.join(root, "new.js"), "const b = 2;\n");
    await execFileAsync("git", ["-C", root, "add", "new.js"]);
    await execFileAsync("git", ["-C", root, "commit", "-m", "change"]);

    const report = await scanProject({
      root,
      ask: scriptedAsker(() => lowAnswers()),
      concurrency: 1,
      diffFrom: "HEAD~1",
    });
    expect(report.filesScanned).toBe(1);
    expect(report.categoryScores[0]?.files).toEqual(["new.js"]);
  });
});
