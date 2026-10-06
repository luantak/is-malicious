import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";

import path from "node:path";
import { expect, it } from "vitest";

it("lets the skill wrapper use OpenAI selected through the environment", () => {
  const dir = mkdtempSync(path.join(__dirname, ".scanner-wrapper-"));
  try {
    writeFileSync(path.join(dir, "is-malicious"), '#!/bin/sh\nprintf "%s\\n" "$IS_MALICIOUS_PROVIDER" "$IS_MALICIOUS_MODEL" "$1"\n', { mode: 0o755 });
    const output = execFileSync("bash", [path.join(__dirname, "../skills/is-malicious/scripts/run.sh"), dir], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, IS_MALICIOUS_PROVIDER: "openai", IS_MALICIOUS_MODEL: "gpt-6-luna", OPENAI_API_KEY: "test", TYPESAFE_API_KEY: "" },
      encoding: "utf8",
    });
    expect(output).toBe(`openai\ngpt-6-luna\n${dir}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
