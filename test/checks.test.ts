import { afterEach, describe, expect, it } from "vitest";
import { builtinChecks, listChecks, registerCheck, resetChecks } from "../src/checks";

describe("check registry", () => {
  afterEach(() => {
    resetChecks();
  });

  it("ships the required categories", () => {
    const ids = builtinChecks.map((check) => check.id);
    expect(ids).toEqual([
      "credential_theft",
      "data_exfiltration",
      "hidden_network",
      "dynamic_code",
      "permission_abuse",
      "persistence",
      "stealth",
      "deception",
      "suspicious_ci",
      "telemetry",
    ]);
  });

  it("accepts another check without rewriting the pipeline", () => {
    registerCheck({
      id: "supply_chain",
      label: "supply-chain tampering",
      instructions: "Does the chunk replace a dependency with a hostile one?",
      criteria: {
        true: "A dependency is swapped or padded with hostile code.",
        false: "Dependencies look ordinary.",
      },
      reasons: { none: "No supply-chain issue." },
    });
    expect(listChecks().some((check) => check.id === "supply_chain")).toBe(true);
  });
});
