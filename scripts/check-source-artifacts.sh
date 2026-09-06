#!/usr/bin/env bash
# Fails CI if a real secret or a leftover local/dev artifact ever gets committed. This
# codifies checks that were previously done by hand (manually grepping tracked files across
# every repo) into something that actually runs on every push and PR, so a mistake here can't
# silently slip back in later.
#
# Deliberately scoped to structural, near-zero-false-positive checks:
#   - tracked file paths that should never be committed (.env, .claude/, key/cert files,
#     build output that should always come from .gitignore instead)
#   - a literal PEM "BEGIN ... PRIVATE KEY" marker, which no legitimate test fixture needs
#     verbatim
# This deliberately does NOT pattern-match for raw Stellar secret keys (S[A-Z0-9]{55}) in
# general file content — this project's own tests legitimately generate and hardcode many
# real-format throwaway keypairs (e.g. via Keypair.random() in test setup), and a blanket
# ban would flag genuine, intentional test fixtures as false positives, eroding trust in the
# check. A real leaked secret is still caught by the tracked-file-path checks below, since a
# real .env file being committed is the actual failure mode that matters.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

fail=0

echo "Checking for tracked files that should never be committed..."
FORBIDDEN_PATHS=$(git ls-files | grep -E '(^|/)\.env$|(^|/)\.claude/|\.pem$|\.p12$|\.key$|(^|/)node_modules/|(^|/)dist/|(^|/)target/|(^|/)coverage/' || true)
if [ -n "$FORBIDDEN_PATHS" ]; then
  echo "FAIL: the following tracked files should never be committed:" >&2
  echo "$FORBIDDEN_PATHS" >&2
  fail=1
else
  echo "  OK — none found."
fi

echo "Checking for literal PEM private-key markers in tracked files..."
PEM_HITS=$(git grep -lE -- '-----BEGIN (RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----' 2>/dev/null || true)
if [ -n "$PEM_HITS" ]; then
  echo "FAIL: literal PEM private-key markers found in:" >&2
  echo "$PEM_HITS" >&2
  fail=1
else
  echo "  OK — none found."
fi

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "check-source-artifacts failed — see above." >&2
  exit 1
fi

echo "check-source-artifacts passed."
