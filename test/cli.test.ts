import { afterEach, describe, expect, it, vi } from "vitest";
import { exitCodeForReport, main } from "../src/cli";
import type { ScanReport } from "../src/types";

function outcome(
  findings: ScanReport["findings"] = [],
  skipped: ScanReport["skipped"] = [],
): Pick<ScanReport, "findings" | "skipped"> {
  return { findings, skipped };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CLI exit codes", () => {
  it("fails when any scan chunk was skipped", () => {
    expect(
      exitCodeForReport(
        outcome([], [{ chunkId: "chunk-001", files: ["src/index.ts"], error: "401 unauthorized" }]),
      ),
    ).toBe(2);
  });

  it("keeps the finding exit codes for complete scans", () => {
    expect(exitCodeForReport(outcome())).toBe(0);
    expect(
      exitCodeForReport(
        outcome([
          {
            category: "credential_theft",
            label: "Credential theft",
            probability: 0.9,
            confidence: 0.8,
            severity: "high",
            files: ["src/index.ts"],
            lines: [],
            reason: "Steals credentials",
            pass: 1,
            chunkId: "chunk-001",
          },
        ]),
      ),
    ).toBe(1);
  });
});

describe("--min-prob", () => {
  it.each(["-0.1", "1.1", "Infinity", "-Infinity", "not-a-number"])("rejects %s", async (value) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(main([".", "--min-prob", value])).resolves.toBe(2);
  });

  it("rejects a missing value", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(main([".", "--min-prob"])).resolves.toBe(2);
  });

  it.each(["", "   "])("rejects an empty value %j", async (value) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(main(["--help", "--min-prob", value])).resolves.toBe(2);
  });

  it.each(["0", "1"])("accepts the boundary value %s", async (value) => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(main(["--help", "--min-prob", value])).resolves.toBe(0);
  });
});

describe("--base-url", () => {
  it.each(["", "--json", "not-a-url", "file:///tmp/api"])("rejects invalid URL %j", async (value) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(main(["--help", "--base-url", value])).resolves.toBe(2);
  });

  it("accepts an HTTP endpoint", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(main(["--help", "--base-url", "http://localhost:8000"])).resolves.toBe(0);
  });
});
