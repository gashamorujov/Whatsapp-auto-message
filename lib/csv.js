/**
 * csv.js — RFC 4180 uyğun CSV parser (təkrar istifadə üçün).
 *
 * Google Sheets "export?format=csv" çıxışında:
 *  - tırnak içində vergüllər və sətır sonları ola bilər;
 *  - tırnak içindəki tırnaklar "" ilə təkrarlanır;
 *  - UTF-8 BOM olsa, ilk sütun adı zibildən təmizlənir.
 */
const BOM = '\uFEFF';

/**
 * @param {string} text
 * @returns {string[][]} sətirlər × sütunlar
 */
function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      if (src[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Son sətir newline ilə bitməyə bilər
  if (field.length > 0 || row.length > 0) pushRow();

  return rows;
}

/** Bütün sətirləri eyni uzunluqda olan düz sətirlərə çevirir (boş xanaları doldurur). */
function normalizeWidth(rows) {
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return rows.map((r) => {
    if (r.length === width) return r;
    const copy = r.slice();
    while (copy.length < width) copy.push('');
    return copy;
  });
}

/** Sətri obyektlərə çevirir: { [header]: value } */
function rowsToObjects(rows, headerRowIndex) {
  const header = (rows[headerRowIndex] || []).map((h) => String(h || '').trim());
  const out = [];
  for (let r = headerRowIndex + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const obj = {};
    header.forEach((h, idx) => {
      if (!h) return;
      obj[h] = row[idx] === undefined ? '' : String(row[idx]).trim();
    });
    out.push(obj);
  }
  return out;
}

module.exports = { parseCsv, normalizeWidth, rowsToObjects, BOM };
