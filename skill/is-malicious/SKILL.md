---
name: is-malicious
description: Scans a cloned or local codebase for covert, deceptive, or data-stealing behavior with the is-malicious CLI (TypeSafe Jev). Use immediately after git clone, when the user asks if a repo is safe, malicious, suspicious, or hostile, or when they ask to scan a project before installing or running it.
---

# is-malicious

Run the `is-malicious` CLI. Do not eyeball the tree and call it clean.

## When

Do this without being asked again when:

- You just ran `git clone`, `gh repo clone`, or equivalent, and have a new checkout
- The user asks if a repo, folder, or dependency tree is safe, malicious, suspicious, or hostile
- The user asks to scan, review, or vet a project before install or run

Scan **before** `npm install`, `pnpm install`, `yarn`, `pip install`, `poetry install`, `bundle install`, or running any script from the tree.

## How to run

```bash
skill/is-malicious/scripts/run.sh <path>
```

If this skill was copied or symlinked, use the script next to this file:

```bash
~/.cursor/skills/is-malicious/scripts/run.sh <path>
```

or `~/.agents/skills/is-malicious/scripts/run.sh <path>`.

The script prints the human report on stdout. Exit code 1 means at least one high finding. Exit 2 means the scanner or key is missing.

Needs `TYPESAFE_API_KEY`. Optional: `IS_MALICIOUS_ROOT` pointing at the is-malicious checkout.

Do not pass `--json` unless the user asked for machine output.

## After the report

- Quote the CLI output. Keep chunk ids, `path:start-end`, category, probability, and reason. Do not rewrite findings into a vibe.
- High findings: stop. Do not install or run the project unless the user explicitly overrides.
- Telemetry / `info`: show the host and the lines. Say it is not a malice finding. Users still need to know the project phones home.
- Uncertain / medium only: show them and say they are not a clean bill of health.
- No findings: say Jev did not flag the files it read. That is not a guarantee. Do not call the repo safe.
- If the scan failed (no key, no CLI, API error): say so. Do not invent a result.

This tool is not antivirus, not `npm audit`, and not a secret scanner. See the project README if you need to explain the limits.

## Do not

- Skip the CLI and "just look at package.json"
- Scan only a subdirectory unless the user scoped it
- Run installers, `postinstall`, or sample commands to "see what happens"
- Commit the API key or put it in the report
