const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** " Əliyev   Əli  Vəli " → "Əliyev Əli Vəli" */
function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/** Saniyələri "1s 02dəq 15s" formatında (Telegram statistikası üçün). */
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}g ${h}saat`;
  if (h > 0) return `${h}saat ${m}daq`;
  if (m > 0) return `${m}daq ${sec}s`;
  return `${sec}s`;
}

module.exports = { sleep, cleanText, formatDuration };
