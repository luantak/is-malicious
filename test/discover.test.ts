import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { classifyFile, discoverFiles, shouldSkipDir } from "../src/discover";

const benign = path.join(__dirname, "../fixtures/benign-notes");
const suspicious = path.join(__dirname, "../fixtures/suspicious-dropper");
const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("discover", () => {
  it("skips lockfiles, images, and generated names by type", () => {
    expect(shouldSkipDir(".git")).toBe(true);
    expect(shouldSkipDir("node_modules")).toBe(true);
    expect(classifyFile("package-lock.json")).toBeNull();
    expect(classifyFile("logo.png")).toBeNull();
    expect(classifyFile("app.min.js")).toBeNull();
    expect(classifyFile("tsconfig.json")).toBeNull();
    expect(classifyFile("packages/foo/lib/index.js")).toBeNull();
    expect(classifyFile("packages/foo/src/lib/util.ts")).toBe("source");
    expect(classifyFile("src/index.js")).toBe("source");
    expect(classifyFile(".github/workflows/ci.yml")).toBe("ci");
    expect(classifyFile("package.json")).toBe("config");
    expect(classifyFile(".env")).toBeNull();
    expect(classifyFile("config/.env.local")).toBeNull();
    expect(classifyFile(".env.production")).toBeNull();
    expect(classifyFile("testdata/ignore-me.js")).toBe("source");
  });

  it("reads the benign fixture and honors its gitignore", async () => {
    const files = await discoverFiles(benign);
    const relative = files.map((file) => file.relativePath).sort();
    expect(relative).toEqual([
      ".github/workflows/ci.yml",
      "package.json",
      "src/index.js",
      "src/store.js",
    ]);
    expect(relative.some((name) => name.includes("node_modules"))).toBe(false);
    expect(relative).not.toContain("package-lock.json");
    expect(relative).not.toContain("logo.png");
    expect(relative).not.toContain("dist/bundle.js");
    expect(relative).not.toContain("testdata/ignore-me.js");
  });

  it("reads the suspicious fixture source and CI", async () => {
    const files = await discoverFiles(suspicious);
    const relative = files.map((file) => file.relativePath).sort();
    expect(relative).toContain("src/sync.js");
    expect(relative).toContain("src/update.js");
    expect(relative).toContain(".github/workflows/publish.yml");
    expect(relative.some((name) => name.includes("node_modules"))).toBe(false);
  });

  it("keeps secrets out without hiding executable JSON behavior", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "is-malicious-sensitive-config-"));
    temps.push(root);
    await fs.writeFile(path.join(root, ".env"), "API_TOKEN=secret\n");
    await fs.writeFile(path.join(root, ".env.local"), "PASSWORD=secret\n");
    await fs.writeFile(path.join(root, "credentials.json"), '{ "private_key": "secret" }');
    await fs.writeFile(
      path.join(root, "loader.json"),
      '{ "private_key": "secret", "loader": "eval(payload)" }',
    );

    const relative = (await discoverFiles(root)).map((file) => file.relativePath);
    expect(relative).not.toContain(".env");
    expect(relative).not.toContain(".env.local");
    expect(relative).not.toContain("credentials.json");
    expect(relative).toContain("loader.json");
  });
});
