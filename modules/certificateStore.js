/**
 * certificateStore — sertifikat cədvəlinin parseri və indeksi.
 *
 * Cədvəl strukturu (başlıq sətri avtomatik aşkarlanır):
 *   № | Sertifikat № | Soyadı, Adı, Atasının adı | Kurs kodu | Kursun adı |
 *   Sertifikatın verilmə tarixi | Sertifikatın qüvvədə olma tarixi | Təhvil statusu | Qeyd
 *
 * "Təhvil statusu" sütununda mətn "Təhvil verilib" / "Təhvil verilməyib"
 * yazılır (cədvəldə həmin sütunun başlıqları yaşıl/qırmızı rənglidir).
 * Boş dəyər = təhvil statusu hələ daxil edilməyib → təhvil verilməyib kimi göstərilir.
 */
const { buildIndex, findByName } = require('../lib/nameMatch');
const { resolveCourseName, normalizeCode } = require('./courseCodes');

const STATUS_DELIVERED = 'delivered';
const STATUS_NOT_DELIVERED = 'not_delivered';

/** Başlıq sətrində "Kurs kodu" və ad sütunu axtarılır. */
function detectHeader(rows, maxScan = 12) {
  const limit = Math.min(rows.length, maxScan);
  for (let r = 0; r < limit; r += 1) {
    const row = rows[r] || [];
    const cells = row.map((c) => String(c || '').trim());
    const hasCode = cells.some((c) => /kurs\s*kodu/i.test(c));
    const hasName = cells.some((c) => /soyad/i.test(c) && !/full\s*name/i.test(c));
    if (hasCode && hasName) return r;
  }
  return -1;
}

function colIndex(row, matcher) {
  return row.findIndex((c) => matcher.test(String(c || '').trim()));
}

/**
 * Cədvəli parse edir.
 * @param {string[][]} rows — CSV matrisi
 * @param {{courseNameSource?: 'map'|'sheet'}} [opts]
 */
function parseCertificateRows(rows, opts = {}) {
  const source = opts.courseNameSource === 'sheet' ? 'sheet' : 'map';
  const headerIdx = detectHeader(rows);
  if (headerIdx < 0) {
    return { records: [], headerIndex: -1, error: 'Başlıq sətri tapılmadı (Kurs kodu / Soyadı sütunları aşılanmadı).' };
  }
  const header = (rows[headerIdx] || []).map((c) => String(c || '').trim());

  const nameCol = colIndex(header, /soyad/i);
  const codeCol = colIndex(header, /kurs\s*kodu/i);
  const courseCol = colIndex(header, /kursun\s*adı/i);
  const statusCol = colIndex(header, /təhvil\s*statusu/i);
  const certNoCol = colIndex(header, /sertifikat\s*№|sertifikat\s*no/i);
  const issueCol = colIndex(header, /verilmə\s*tarixi/i);
  const expiryCol = colIndex(header, /qüvvədə\s*olma/i);
  const noteCol = colIndex(header, /^qeyd$/i);
  const phoneCol = colIndex(header, /telefon|phone|mobil/i);

  if (nameCol < 0 || codeCol < 0) {
    return { records: [], headerIndex: headerIdx, error: 'Ad və ya kurs kodu sütunu tapılmadı.' };
  }

  const records = [];
  for (let r = headerIdx + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const get = (idx) => (idx >= 0 && row[idx] !== undefined ? String(row[idx] || '').trim() : '');

    const name = get(nameCol);
    const code = get(codeCol);
    if (!name || !code) continue; // boş/placeholder sətirlər (tərsinxat sətirləri)

    const statusText = get(statusCol).toLowerCase();
    let status = STATUS_NOT_DELIVERED;
    if (/veril/i.test(statusText) && !/verilməyib/i.test(statusText)) status = STATUS_DELIVERED;
    else if (/verilməyib/i.test(statusText)) status = STATUS_NOT_DELIVERED;

    const sheetCourseName = get(courseCol);
    records.push({
      name,
      code: normalizeCode(code),
      codeRaw: code,
      courseName: resolveCourseName(code, sheetCourseName, source) || sheetCourseName || code,
      sheetCourseName,
      certNo: get(certNoCol),
      issueDate: get(issueCol),
      expiryDate: get(expiryCol),
      // Nömrə ilə əlaqələndirmə üçün (təhlükəsizlik — sənəd §6.11)
      phone: get(phoneCol),
      status,
      statusRaw: get(statusCol),
      note: get(noteCol),
    });
  }

  return { records, headerIndex: headerIdx, error: null };
}

/**
 * Sertifikat store — indeks və axtarış.
 */
class CertificateStore {
  constructor() {
    this.records = [];
    this.index = buildIndex([]);
    this.updatedAt = null;
    this.source = null;
  }

  /** @param {{records: any[], updatedAt?: string, source?: string}} payload */
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

  get deliveredCount() {
    return this.records.filter((r) => r.status === STATUS_DELIVERED).length;
  }

  get pendingCount() {
    return this.records.filter((r) => !r.statusRaw).length;
  }
}

module.exports = {
  parseCertificateRows,
  detectHeader,
  CertificateStore,
  STATUS_DELIVERED,
  STATUS_NOT_DELIVERED,
};
