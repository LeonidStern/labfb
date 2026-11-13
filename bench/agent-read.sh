#!/usr/bin/env bash
# What does an agent get when it opens a link with no login?
# Usage: bench/agent-read.sh <url> [<url> ...]
# e.g.   bench/agent-read.sh https://lab.example.com/_lab/agent/anna/acme/k3v9qz7mtp/landing https://claude.ai/artifact/<id>
# Prints status, bytes, visible text, a rough token count (chars / 4) and how many comments the text holds.
set -euo pipefail
for url in "$@"; do
  body=$(mktemp)
  meta=$(curl -sS -L -o "$body" -A 'Mozilla/5.0 (agent-read bench)' -w '%{http_code} %{size_download} %{time_total}' "$url")
  read -r code bytes secs <<<"$meta"
  text=$(python3 - "$body" <<'PY'
import re, sys
s = open(sys.argv[1], encoding='utf-8', errors='replace').read()
if '<html' in s[:2000].lower():
    s = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', s, flags=re.S | re.I)
    s = re.sub(r'<[^>]+>', ' ', s)
print(re.sub(r'\s+', ' ', s).strip())
PY
)
  comments=$(grep -c '^comment: ' "$body" || true)
  printf '%s\n  status %s · %s bytes · %ss · visible text %s chars (~%s tokens) · comments %s\n  text: %.160s\n\n' \
    "$url" "$code" "$bytes" "$secs" "${#text}" "$(( ${#text} / 4 ))" "$comments" "$text"
  rm -f "$body"
done
