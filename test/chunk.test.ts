import { describe, expect, it } from "vitest";
import { groupFiles, lineWindows } from "../src/chunk";
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

describe("groupFiles", () => {
  it("keeps same-directory files together when they fit", () => {
    const chunks = groupFiles([
      file("src/a.js", "aaa"),
      file("src/b.js", "bbb"),
      file("lib/c.js", "ccc"),
    ]);
    const src = chunks.find((chunk) => chunk.files.some((item) => item.relativePath === "src/a.js"));
    expect(src?.files.map((item) => item.relativePath)).toEqual(
      expect.arrayContaining(["src/a.js", "src/b.js"]),
    );
    expect(chunks.flatMap((chunk) => chunk.files.map((item) => item.relativePath))).toContain("lib/c.js");
  });

  it("splits when a directory exceeds the character budget", () => {
    const chunks = groupFiles(
      [file("src/big.js", "x".repeat(80)), file("src/small.js", "y".repeat(20))],
      50,
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.files.length >= 1)).toBe(true);
  });

  it("builds numbered line windows", () => {
    const windows = lineWindows([file("src/a.js", "one\ntwo\nthree\nfour")], 2);
    expect(windows).toHaveLength(2);
    expect(windows[0]).toMatchObject({ path: "src/a.js", start: 1, end: 2, id: "src/a.js:1-2" });
    expect(windows[0].text).toContain("1| one");
  });
});
