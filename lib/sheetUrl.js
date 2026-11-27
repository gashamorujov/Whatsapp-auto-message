/**
 * sheetUrl.js — Google Sheets linklərini { id, gid } formatına çevirir.
 *
 * Dəstəklənən formatlar:
 *   https://docs.google.com/spreadsheets/d/<ID>/edit?gid=1252670317#gid=1252670317
 *   https://docs.google.com/spreadsheets/d/<ID>/edit#gid=1252670317
 *   https://docs.google.com/spreadsheets/d/<ID>/
 *   https://docs.google.com/spreadsheets/u/0/d/<ID>/edit?gid=1
 *   <ID> (yalnız id)
 */
const SHEET_ID_RE = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;

/**
 * @param {string} url
 * @returns {{id: string, gid: string}|null}
 */
function parseSheetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  const idMatch = raw.match(SHEET_ID_RE);
  const id = idMatch ? idMatch[1] : raw.match(/^[a-zA-Z0-9-_]{20,}$/)?.[1];
  if (!id) return null;

  let gid = null;
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://docs.google.com/spreadsheets/d/${id}/edit`);
    gid = u.searchParams.get('gid');
    if (!gid && u.hash) {
      const hm = u.hash.match(/gid=([0-9]+)/);
      if (hm) gid = hm[1];
    }
  } catch {
    /* URL parse uğursuz oldu — aşağıdakı regex işə düşəcək */
  }
  if (!gid) {
    const m = raw.match(/[#?&]gid=([0-9]+)/);
    if (m) gid = m[1];
  }
  if (!gid) {
    const m = raw.match(/[#&?]sheet=([^&]+)/);
    if (m) gid = m[1];
  }

  return { id, gid: gid || '0' };
}

/** CSV ixrac URL-i qurur. */
function buildCsvUrl(id, gid) {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid || '0'}`;
}

/** İnsan üçün qısa göstərmə (telegram mesajında). */
function shortSheetUrl(url) {
  const parsed = parseSheetUrl(url);
  if (!parsed) return String(url || '');
  return `docs.google.com/spreadsheets/d/${parsed.id.slice(0, 10)}…`;
}

module.exports = { parseSheetUrl, buildCsvUrl, shortSheetUrl, SHEET_ID_RE };
