/**
 * courseStore — kurs qeydiyyatı cədvəlinin parseri və indeksi.
 *
 * Cədvəl strukturu (başlıq sətri avtomatik aşkarlanır):
 *   № | Soyad, Ad və Ata adı | Seriya № | Fərdi ID | Doğum tarixi | Telefon |
 *   email | Rank (Working Diploma) | Full Name (ID) | ... | Kurs kodu | Course Start | Course Finish
 *
 * Qeydlər:
 *  - Axtarış açarı "Full Name (ID)" sütunudur (istifadəçi adı burada yazılır).
 *  - Kurs kodu sütunu başlığı eyni sütunda "Rank (Working Diploma)" adını daşıyır;
 *    ona görə bir neçə namizəd sütun yoxlanılır və ən çox məlum kurs kodu
 *    saxlayan sütun seçilir (sətirlər dəyişsə belə işləyir).
 *  - Hücrdə mətn varsa (məs. "BORC", "hərbi xidmeti") və ya boşdursa,
 *    tarix "qeyd olunmayıb" kimi göstərilir.
 */
const { buildIndex, findByName } = require('../lib/nameMatch');
const { resolveCourseName, normalizeCode, isKnownCode } = require('./courseCodes');

const DATE_PATTERNS = [
  /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/,
  /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})[.\s].*$/,
];

/** Hücr mətninin tarix olub-olmadığını yoxlayır. */
function parseDateCell(value) {
  const raw = String(value || '').trim();
  if (!raw) return { isDate: false, value: '' };
  for (const re of DATE_PATTERNS) {
    const m = raw.match(re);
    if (m) {
      const [, d, mo, y] = m;
      let year = y.length === 2 ? `20${y}` : y;
      if (Number(year) < 2000 && year.length === 4) year = String(Number(year) + 100);
      return { isDate: true, value: `${d.padStart(2, '0')}.${mo.padStart(2, '0')}.${year}` };
    }
  }
  return { isDate: false, value: raw };
}

/** Başlıq sətrində "Full Name (ID)" sütunu tapılır. */
function detectHeader(rows, maxScan = 12) {
  const limit = Math.min(rows.length, maxScan);
  for (let r = 0; r < limit; r += 1) {
    const cells = (rows[r] || []).map((c) => String(c || '').trim());
    if (cells.some((c) => /full\s*name/i.test(c))) return r;
  }
  return -1;
}

function colIndex(row, matcher) {
  return row.findIndex((c) => matcher.test(String(c || '').trim()));
}

/**
 * Kurs kodu sütununu avtomatik seçir: "Rank (Working Diploma)" başlıqlı
 * sütunlar arasında ən çox məlum kurs kodu saxlayanı seçir.
 */
function detectCodeColumn(rows, headerIdx, header) {
  const candidates = [];
  header.forEach((h, idx) => {
    if (/rank/i.test(h)) candidates.push(idx);
  });
  if (candidates.length === 0) return -1;

  let best = candidates[0];
  let bestScore = -1;
  for (const idx of candidates) {
    let score = 0;
    let seen = 0;
    for (let r = headerIdx + 1; r < rows.length; r += 1) {
      const row = rows[r] || [];
      const v = String(row[idx] || '').trim();
      if (!v) continue;
      seen += 1;
      if (isKnownCode(v)) score += 1;
      if (seen > 500) break;
    }
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return bestScore > 0 ? best : -1;
}

/**
 * Cədvəli parse edir.
 * @param {string[][]} rows
 * @param {{courseNameSource?: 'map'|'sheet'}} [opts]
 */
function parseCourseRows(rows, opts = {}) {
  const source = opts.courseNameSource === 'sheet' ? 'sheet' : 'map';
  const headerIdx = detectHeader(rows);
  if (headerIdx < 0) {
    return { records: [], headerIndex: -1, error: 'Başlıq sətri tapılmadı ("Full Name (ID)" sütunu aşılanmadı).' };
  }
  const header = (rows[headerIdx] || []).map((c) => String(c || '').trim());

  const nameCol = colIndex(header, /full\s*name/i);
  const startCol = colIndex(header, /course\s*start|başlama\s*tarixi/i);
  const finishCol = colIndex(header, /course\s*finish|bitmə\s*tarixi/i);
  const rankCol = colIndex(header, /rank/i);
  const orgCol = colIndex(header, /^(soyad,\s*ad\s*və\s*ata\s*adı|soyad, ad və ata adı)$/i);
  const noteCol = colIndex(header, /^qeyd$/i);
  const phoneCol = colIndex(header, /telefon|phone|mobil/i);
  const codeCol = detectCodeColumn(rows, headerIdx, header);

  if (nameCol < 0) {
    return { records: [], headerIndex: headerIdx, error: '"Full Name (ID)" sütunu tapılmadı.' };
  }

  const records = [];
  for (let r = headerIdx + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const get = (idx) => (idx >= 0 && row[idx] !== undefined ? String(row[idx] || '').trim() : '');

    const name = get(nameCol);
    if (!name) continue;

    const code = get(codeCol);
    const startRaw = get(startCol);
    const start = parseDateCell(startRaw);
    const finishRaw = get(finishCol);
    const finish = parseDateCell(finishRaw);

    records.push({
      name,
      code: normalizeCode(code),
      codeRaw: code,
      courseName: resolveCourseName(code, '', source) || code || 'Naməlum kurs',
      rank: get(rankCol),
      org: get(orgCol),
      startDate: start.isDate ? start.value : '',
      startRaw,
      hasDate: start.isDate,
      finishDate: finish.isDate ? finish.value : '',
      finishRaw,
      hasFinishDate: finish.isDate,
      // Nömrə ilə əlaqələndirmə üçün (təhlükəsizlik — sənəd §6.11)
      phone: get(phoneCol),
      note: get(noteCol),
      rowNumber: r + 1,
    });
  }

  return { records, headerIndex: headerIdx, error: null };
}

/**
 * Kurs store — indeks və axtarış.
 */
class CourseStore {
  constructor() {
    this.records = [];
    this.index = buildIndex([]);
    this.updatedAt = null;
    this.source = null;
  }

  load(payload) {
    this.records = payload.records || [];
    this.index = buildIndex(this.records);
    this.updatedAt = payload.updatedAt || new Date().toISOString();
    this.source = payload.source || null;
  }

  /**
   * @param {string} name
   * @returns {{found: boolean, records: any[], matchType: string, ambiguous: boolean, candidates: string[]}}
   */
  find(name) {
    return findByName(name, this.index);
  }

  get size() {
    return this.records.length;
  }

  get peopleCount() {
    return this.index.fullNames.size;
  }
}

module.exports = { parseCourseRows, parseDateCell, detectHeader, detectCodeColumn, CourseStore };
