import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyFile, discoverFiles, shouldSkipDir } from "../src/discover";

const benign = path.join(__dirname, "../fixtures/benign-notes");
const suspicious = path.join(__dirname, "../fixtures/suspicious-dropper");

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
});
