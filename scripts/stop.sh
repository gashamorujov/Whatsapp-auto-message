#!/usr/bin/env bash
# Botu dayandırır.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/logs/bot.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "ℹ️  İşləyən bot tapılmadı."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill -TERM "$PID"
  for _ in {1..15}; do
    kill -0 "$PID" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$PID" 2>/dev/null; then
    echo "⚠️  Graceful dayandırma alınmadı — SIGKILL göndərilir."
    kill -9 "$PID" 2>/dev/null || true
  fi
  echo "✅ Bot dayandırıldı (PID $PID)"
else
  echo "ℹ️  Proses artıq mövcud deyil."
fi
rm -f "$PID_FILE"
