#!/usr/bin/env bash
# Kill whatever is LISTENing on the given TCP ports. Run inside the dev container.
# Usage:  ./scripts/kill-dev-ports.sh [port ...]
# Default (no args) targets all app dev ports: 3000 design, 3100 submit, 4000 backend, 3001 form.io.
# DB/Temporal/MinIO run in other containers and aren't reachable from here.
set -uo pipefail

PORTS=("$@")
[[ ${#PORTS[@]} -eq 0 ]] && PORTS=(3000 3001 3100 4000)

find_pids() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnpH 2>/dev/null | grep -E ":$p\b" | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
  elif command -v fuser >/dev/null 2>&1; then
    fuser "$p"/tcp 2>/dev/null | tr ' ' '\n'
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"$p" -sTCP:LISTEN 2>/dev/null
  fi
  return 0
}

self=$$
for p in "${PORTS[@]}"; do
  pids=$(find_pids "$p" | grep -vx "$self" | tr '\n' ' ')
  pids="${pids%% }"
  if [[ -z "${pids// /}" ]]; then
    echo "port $p: nothing listening"
    continue
  fi
  echo "port $p: killing pid(s) $pids"
  kill $pids 2>/dev/null
  sleep 1
  kill -9 $pids 2>/dev/null || true
done
