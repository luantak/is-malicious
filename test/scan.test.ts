import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { scanProject } from "../src/scan";
import type { JevResult } from "../src/jev";
import { formatReport } from "../src/report";
import { choiceAnswer, highAnswers, lowAnswers, pickWindowId, scriptedAsker, stateText } from "./helpers";

const benign = path.join(__dirname, "../fixtures/benign-notes");
const suspicious = path.join(__dirname, "../fixtures/suspicious-dropper");
const telemetry = path.join(__dirname, "../fixtures/with-telemetry");

describe("scanProject", () => {
  it("does not escalate a clean fixture", async () => {
    const ask = scriptedAsker(() => lowAnswers());
    const report = await scanProject({ root: benign, ask, concurrency: 1 });
    expect(report.filesScanned).toBe(4);
    expect(report.escalated).toBe(0);
    expect(report.findings).toEqual([]);
    expect(ask.calls).toBe(report.chunks);
    expect(report.usage.requests).toBe(report.chunks);
    expect(report.usage.inputTokens).toBe(report.chunks * 100);
  });

  it("leaves provider pricing unknown for a custom endpoint", async () => {
    const report = await scanProject({
      root: benign,
      ask: scriptedAsker(() => lowAnswers()),
      baseURL: "http://localhost:8000",
    });
    expect(report.usage.inputTokens).toBeGreaterThan(0);
    expect(report.usage.billedUsd).toBeNull();
    expect(report.usage.pricePerMillionInputTokens).toBeNull();
    expect(formatReport(report)).toContain("cost depends on provider");
    expect(formatReport(report)).not.toContain("(free)");
  });

  it("recognizes a custom endpoint set through the SDK environment variable", async () => {
    vi.stubEnv("TYPESAFE_BASE_URL", "http://localhost:8000");
    try {
      const report = await scanProject({ root: benign, ask: scriptedAsker(() => lowAnswers()) });
      expect(report.usage.billedUsd).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("escalates the dropper and reports hot categories with source lines", async () => {
    const ask = scriptedAsker((state) => {
      const text = stateText(state);
      const answers = highAnswers({
        credential_theft: text.includes("src/sync.js") ? 0.93 : 0.04,
        dynamic_code: text.includes("src/update.js") ? 0.88 : 0.04,
        data_exfiltration: text.includes("src/sync.js") ? 0.81 : 0.04,
        suspicious_ci: text.includes("publish.yml") ? 0.9 : 0.04,
      });
      if (text.includes("src/sync.js")) {
        answers.hot_file = choiceAnswer("src/sync.js", 0.9);
      } else if (text.includes("publish.yml")) {
        answers.hot_file = choiceAnswer(".github/workflows/publish.yml", 0.9);
      } else if (text.includes("src/update.js")) {
        answers.hot_file = choiceAnswer("src/update.js", 0.9);
      }
      if (text.includes("windows")) {
        if (text.includes("src/sync.js")) {
          answers.relevant_window = choiceAnswer(pickWindowId(state, "src/sync.js") ?? "none", 0.86);
          answers.reason = choiceAnswer("credential_theft:env_exfil", 0.84);
        } else if (text.includes("publish.yml")) {
          answers.relevant_window = choiceAnswer(pickWindowId(state, "publish.yml", "last") ?? "none", 0.8);
          answers.reason = choiceAnswer("suspicious_ci:secret_webhook", 0.8);
        } else {
          answers.relevant_window = choiceAnswer(pickWindowId(state, "src/update.js") ?? "none", 0.8);
          answers.reason = choiceAnswer("dynamic_code:remote_eval", 0.8);
        }
      }
      return answers;
    });

    const report = await scanProject({ root: suspicious, ask, concurrency: 1 });
    expect(report.escalated).toBeGreaterThan(0);
    expect(ask.calls).toBeGreaterThan(report.chunks);
    const categories = new Set(report.findings.map((finding) => finding.category));
    expect(categories.has("credential_theft")).toBe(true);
    expect(categories.has("dynamic_code")).toBe(true);
    const theft = report.findings.find((finding) => finding.category === "credential_theft");
    expect(theft?.files).toEqual(["src/sync.js"]);
    expect(theft?.chunkId).toMatch(/^chunk-/);
    expect(theft?.lines[0]).toMatchObject({ path: "src/sync.js" });
    expect(theft?.lines[0]?.start).toBeGreaterThan(0);
    expect(theft?.lines[0]?.end).toBeGreaterThanOrEqual(theft?.lines[0]?.start ?? 0);
    expect(report.findings.some((finding) => finding.reason.includes("environment"))).toBe(true);
    expect(report.findings.every((finding) => finding.pass === 2)).toBe(true);
    expect(formatReport(report)).toMatch(/chunk-\d+\s+src\/sync\.js:\d+-\d+/);
    expect(formatReport(report)).toContain("Suspicious chunks");
  });

  it("reports ordinary telemetry as info and still points at the lines", async () => {
    const ask = scriptedAsker((state) => {
      const text = stateText(state);
      const answers = highAnswers({
        telemetry: text.includes("metrics.js") ? 0.86 : 0.04,
      });
      if (text.includes("metrics.js")) {
        answers.hot_file = choiceAnswer("src/metrics.js", 0.9);
      }
      if (text.includes("windows")) {
        answers.relevant_window = choiceAnswer(pickWindowId(state, "src/metrics.js") ?? "none", 0.8);
        answers.reason = choiceAnswer("telemetry:usage_analytics", 0.8);
      }
      return answers;
    });

    const report = await scanProject({ root: telemetry, ask, concurrency: 1 });
    const hit = report.findings.find((finding) => finding.category === "telemetry");
    expect(hit?.severity).toBe("info");
    expect(hit?.files).toEqual(["src/metrics.js"]);
    expect(hit?.lines[0]).toMatchObject({ path: "src/metrics.js" });
    expect(report.findings.every((finding) => finding.severity !== "high")).toBe(true);
    expect(formatReport(report)).toContain("Telemetry");
    expect(formatReport(report)).not.toContain("Suspicious chunks");
  });

  it("retries a max_tokens error by splitting the chunk", async () => {
    let calls = 0;
    const ask = {
      async ask(state: unknown): Promise<JevResult> {
        calls += 1;
        const paths = JSON.stringify(state).match(/"path":/g)?.length ?? 0;
        if (paths >= 3) {
          throw new Error('400 {"detail":{"error_type":"max_tokens_exceeded"}}');
        }
        return { model: "jev-test", answers: lowAnswers(), usage: { inputTokens: 10, outputTokens: 1 } };
      },
    };
    const report = await scanProject({ root: suspicious, ask, concurrency: 1 });
    expect(calls).toBeGreaterThan(report.chunks);
    expect(report.skipped).toEqual([]);
  });
});
