#!/bin/bash
# Remove generated artifacts so the repo matches a fresh GitHub checkout.
# Works on host, devcontainer, linux/amd64, and linux/arm64.
set -euo pipefail

DEPS_ONLY=false
FULL=false
DRY_RUN=false
ASSUME_YES=false

usage() {
  cat <<'EOF'
Usage: scripts/clean-workspace.sh [OPTIONS]

Remove node_modules, build outputs, caches, and test artifacts.

Options:
  --deps-only   Remove dependency trees and pnpm markers only
  --full        Also remove gitignored env files (backend/.env, backend/.env.local, frontend/.env)
  --dry-run     Print paths that would be removed without deleting
  -y, --yes     Skip confirmation prompt
  -h, --help    Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deps-only) DEPS_ONLY=true ;;
    --full) FULL=true ;;
    --dry-run) DRY_RUN=true ;;
    -y | --yes) ASSUME_YES=true ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
cd "$REPO_ROOT"

PATHS=()

add_path() {
  local rel="$1"
  if [[ -e "$REPO_ROOT/$rel" ]]; then
    PATHS+=("$rel")
  fi
}

add_glob() {
  local pattern="$1"
  shopt -s nullglob
  local matches=($pattern)
  shopt -u nullglob
  local match
  for match in "${matches[@]}"; do
    PATHS+=("${match#"$REPO_ROOT"/}")
  done
}

# Dependencies
add_path "node_modules"
add_path "frontend/node_modules"
add_path "backend/node_modules"
add_path "integration/playwright/node_modules"
add_path "integration/node_modules"
add_path ".pnpm-store"
add_path ".devcontainer/.deps-installed"

if [[ "$DEPS_ONLY" == false ]]; then
  # Build outputs
  add_path "backend/dist"
  add_path "frontend/.next"
  add_path "frontend/.next-forms"
  add_glob "frontend/*.tsbuildinfo"
  add_path "frontend/.vite"

  # Test output
  add_path "coverage"
  add_path "backend/coverage"
  add_path "integration/playwright/test-results"
  add_path "integration/playwright/playwright-report"
  add_path "integration/playwright/blob-report"
  add_path "integration/playwright/playwright/.cache"
  add_path "integration/playwright/playwright/.auth"
  add_path "integration/test-results"
  add_path "integration/playwright-report"
  add_path "integration/.playwright"
  add_path "integration/.cache"
fi

if [[ "$FULL" == true ]]; then
  add_path "backend/.env"
  add_path "backend/.env.local"
  add_path "frontend/.env"
fi

if [[ ${#PATHS[@]} -eq 0 ]]; then
  echo "Nothing to clean — workspace already matches a fresh checkout."
  exit 0
fi

echo "The following paths will be removed:"
printf '  %s\n' "${PATHS[@]}"

if [[ "$DRY_RUN" == true ]]; then
  echo "(dry run — no files deleted)"
  exit 0
fi

if [[ "$ASSUME_YES" == false ]]; then
  read -r -p "Continue? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

for rel in "${PATHS[@]}"; do
  rm -rf "$REPO_ROOT/$rel"
  echo "Removed $rel"
done

echo "Clean complete."
