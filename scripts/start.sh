#!/usr/bin/env bash
# Botu fon rejimində başladır (PID faylı ilə).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PID_FILE="$ROOT/logs/bot.pid"
LOG_FILE="$ROOT/logs/bot.log"

mkdir -p "$ROOT/logs" "$ROOT/data" "$ROOT/sessions" "$ROOT/temp"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "⚠️  Bot artıq işləyir (PID $(cat "$PID_FILE"))"
  exit 0
fi

echo "▶ Bot başladılır..."
nohup node index.js >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
sleep 3

if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "✅ Bot işləyir — PID $(cat "$PID_FILE")"
  echo "   Log: $LOG_FILE"
  echo "   Dayandırmaq üçün: bash scripts/stop.sh"
else
  echo "❌ Bot başlamadı. Log:"
  tail -20 "$LOG_FILE"
  exit 1
fi
