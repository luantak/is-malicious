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
      "authentication_bypass",
      "command_and_control",
      "surveillance",
      "destructive_behavior",
      "supply_chain",
      "security_weakening",
      "resource_abuse",
      "lateral_movement",
      "anti_removal",
      "covert_fingerprinting",
    ]);
  });

  it("accepts another check without rewriting the pipeline", () => {
    registerCheck({
      id: "custom_extra",
      label: "custom extra check",
      instructions: "Does the chunk do a project-specific bad thing?",
      criteria: {
        true: "The custom condition is present.",
        false: "The custom condition is absent.",
      },
      reasons: { none: "No extra issue." },
    });
    expect(listChecks().some((check) => check.id === "custom_extra")).toBe(true);
  });
});
