#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${HOME}/.local/bin"
BUN_BIN="${HOME}/.bun/bin/bun"

mkdir -p "${TARGET_DIR}"

write_launcher() {
  local name="$1"
  local extra_exports="$2"
  local extra_args="$3"
  local target="${TARGET_DIR}/${name}"

  cat >"${target}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

export PATH="\$HOME/.bun/bin:\$PATH"
export CLAUDE_CODE_USE_CODEX_ENGINE=1
export CLAUDE_CODE_CODEX_MODEL="\${CLAUDE_CODE_CODEX_MODEL:-gpt-5.4}"
${extra_exports}

cd "${REPO_ROOT}"
exec "${BUN_BIN}" run src/entrypoints/cli.tsx ${extra_args} "\$@"
EOF

  chmod +x "${target}"
  echo "Installed ${target}"
}

write_launcher "cc-codex" "" ""
write_launcher "cc-codex-debug" "export CLAUDE_CODE_CODEX_DEBUG=1" ""
write_launcher "cc-codex-bypass" "" "--dangerously-skip-permissions"

cat <<'EOF'

Launchers installed.

Use:
  cc-codex
  cc-codex-debug
  cc-codex-bypass

If your shell cannot find them yet, restart the shell or run:
  export PATH="$HOME/.local/bin:$PATH"
EOF
