#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"
if [[ -z "$target" ]]; then
  echo "usage: run.sh <path>" >&2
  exit 2
fi

if [[ ! -e "$target" ]]; then
  echo "is-malicious: path not found: $target" >&2
  exit 2
fi

if [[ -z "${TYPESAFE_API_KEY:-}" ]]; then
  echo "is-malicious: TYPESAFE_API_KEY is not set. The scan needs an API key for the configured endpoint." >&2
  exit 2
fi

here="$(cd "$(dirname "$0")" && pwd)"

find_cli() {
  if command -v is-malicious >/dev/null 2>&1; then
    echo "bin"
    return
  fi

  local candidates=()
  if [[ -n "${IS_MALICIOUS_ROOT:-}" ]]; then
    candidates+=("$IS_MALICIOUS_ROOT")
  fi
  candidates+=("$(cd "$here/../../.." && pwd)")
  candidates+=("$HOME/is-malicous")
  candidates+=("$HOME/is-malicious")

  local root
  for root in "${candidates[@]}"; do
    if [[ -f "$root/src/cli.ts" || -f "$root/dist/cli.js" ]]; then
      echo "$root"
      return
    fi
  done

  if command -v npx >/dev/null 2>&1; then
    echo "npx"
    return
  fi
  return 1
}

resolved="$(find_cli)" || {
  echo "is-malicious: CLI not found. npm install -g is-malicious, or set IS_MALICIOUS_ROOT." >&2
  exit 2
}

if [[ "$resolved" == "bin" ]]; then
  exec is-malicious "$target"
fi

if [[ "$resolved" == "npx" ]]; then
  exec npx --yes is-malicious "$target"
fi

if [[ -f "$resolved/dist/cli.js" ]]; then
  exec node "$resolved/dist/cli.js" "$target"
fi

if command -v npx >/dev/null 2>&1 && [[ -f "$resolved/src/cli.ts" ]]; then
  exec npx --yes tsx "$resolved/src/cli.ts" "$target"
fi

echo "is-malicious: found checkout at $resolved but neither dist/cli.js nor npx/tsx is available." >&2
exit 2
