import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanProject } from "../src/scan";
import { choiceAnswer, highAnswers, lowAnswers, scriptedAsker, stateText } from "./helpers";

const benign = path.join(__dirname, "../fixtures/benign-notes");
const suspicious = path.join(__dirname, "../fixtures/suspicious-dropper");

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

  it("escalates the dropper and reports hot categories with source lines", async () => {
    const ask = scriptedAsker((state) => {
      const text = stateText(state);
      const answers = highAnswers({
        credential_theft: 0.93,
        dynamic_code: 0.88,
        data_exfiltration: 0.81,
        suspicious_ci: text.includes("publish.yml") ? 0.9 : 0.2,
      });
      if (text.includes("windows")) {
        if (text.includes("src/sync.js")) {
          answers.relevant_window = choiceAnswer("src/sync.js:1-10", 0.86);
          answers.reason = choiceAnswer("credential_theft:env_exfil", 0.84);
        } else if (text.includes("publish.yml")) {
          answers.relevant_window = choiceAnswer(".github/workflows/publish.yml:1-10", 0.8);
          answers.reason = choiceAnswer("suspicious_ci:secret_webhook", 0.8);
        } else {
          answers.relevant_window = choiceAnswer("src/update.js:1-8", 0.8);
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
    expect(report.findings.some((finding) => finding.files.some((file) => file.includes("sync.js")))).toBe(
      true,
    );
    expect(report.findings.some((finding) => finding.reason.includes("environment"))).toBe(true);
    expect(report.findings.every((finding) => finding.pass === 2)).toBe(true);
  });
});
