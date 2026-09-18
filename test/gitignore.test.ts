import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listUnignoredPaths } from "../src/gitignore";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "is-malicious-"));
  temps.push(dir);
  return dir;
}

describe("listUnignoredPaths", () => {
  it("skips paths listed in .gitignore", async () => {
    const root = await tempDir();
    await fs.writeFile(path.join(root, ".gitignore"), "build/\n*.log\n");
    await fs.writeFile(path.join(root, "keep.js"), "ok");
    await fs.writeFile(path.join(root, "noise.log"), "nope");
    await fs.mkdir(path.join(root, "build"));
    await fs.writeFile(path.join(root, "build", "out.js"), "generated");

    const listed = (await listUnignoredPaths(root)).map((item) => item.split(path.sep).join("/")).sort();
    expect(listed).toEqual([".gitignore", "keep.js"]);
  });

  it("honors a nested gitignore", async () => {
    const root = await tempDir();
    await fs.mkdir(path.join(root, "pkg"));
    await fs.writeFile(path.join(root, "pkg", ".gitignore"), "secret.js\n");
    await fs.writeFile(path.join(root, "pkg", "ok.js"), "ok");
    await fs.writeFile(path.join(root, "pkg", "secret.js"), "nope");

    const listed = (await listUnignoredPaths(root)).map((item) => item.split(path.sep).join("/")).sort();
    expect(listed).toContain("pkg/ok.js");
    expect(listed).not.toContain("pkg/secret.js");
  });
});
