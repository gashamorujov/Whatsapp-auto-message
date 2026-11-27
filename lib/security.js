/**
 * security — şəxsi məlumatın qorunması və əlavə identifikasiya yoxlaması.
 *
 *  1. ŞƏXSİ İDENTİFİKATORLA AXTARIŞ BLOKLANIR (sənəd §6):
 *     FİN kodu, şəxsiyyət vəsiqəsi, sənəd/diplom nömrəsi, doğum tarixi,
 *     telefon nömrəsi, e-poçt və s. ilə axtarış aparılmır — cavabda da
 *     "şəxs mövcuddur" məlumatı verilmir.
 *
 *  2. NÖMRƏ İLƏ ƏLAQƏLƏNDİRMƏ (sənəd §6.11):
 *     Cədvəldə telefon sütunu varsa, yalnız eyni nömrəyə aid qeydlərin
 *     məlumatı göstərilir. Nömrə uyğun gəlmirsə — məlumat açıqlanmır və
 *     istifadəçi administratorla əlaqə saxlamağa yönləndirilir.
 */

/** Açar sözə əsaslı bloklanan identifikatorlar. */
const KEYWORD_RULES = [
  { re: /\bfin\b/i, label: 'FİN kodu' },
  { re: /fİN|fın/i, label: 'FİN kodu' },
  { re: /şəxsiyyət\s*vəsiqə|vəsiqə\s*(№|no|number|nömrə)/i, label: 'şəxsiyyət vəsiqəsi' },
  { re: /pasport|məşəhurət/i, label: 'pasport məlumatı' },
  { re: /diplom/i, label: 'diplom məlumatı' },
  { re: /doğum\s*(tarix|gün)/i, label: 'doğum tarixi' },
  { re: /seriya\s*(№|no|number|nömrə)/i, label: 'seriya nömrəsi' },
  { re: /\bID\b/, label: 'daxili ID' },
  { re: /\bemail\b|e-poçt/i, label: 'e-poçt' },
];

/** 4+ ardıcıl rəqəm — FİN, telefon və ya şəxsi kod şəklində ola bilər. */
const DIGIT_RUN = /\d{4,}/;

/** E-poçt ünvanı. */
const EMAIL = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/;

/** "AZE1234567" / "BHG9Z2K" tipli kod. */
const CODE_LIKE = /\b[A-Z]{1,3}\d{4,8}\b/;

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Mətn şəxsi identifikator daşıyır?
 *
 * @param {string} text
 * @returns {{blocked: boolean, label: string|null}}
 */
function detectSensitiveQuery(text) {
  const raw = String(text || '').trim();
  if (!raw) return { blocked: false, label: null };

  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(raw)) return { blocked: true, label: rule.label };
  }
  if (EMAIL.test(raw)) return { blocked: true, label: 'e-poçt' };
  if (DIGIT_RUN.test(raw)) return { blocked: true, label: 'rəqəmsal şəxsi kod' };
  if (CODE_LIKE.test(raw)) return { blocked: true, label: 'şəxsi kod' };

  return { blocked: false, label: null };
}

/**
 * Nömrə dəyərindən bir neçə nömrəni ayırır ("0701234567/0509876543").
 * @param {string} value
 * @returns {string[]}
 */
function splitNumbers(value) {
  return String(value || '')
    .split(/[\/,;|·•]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Nömrəni milli (10 rəqəmli) formata gətirir.
 *
 *  • "994501234567" → "0501234567"  (ölkə kodu silinir, 0 əlavə olunur)
 *  • "501234567"    → "0501234567"  (9 rəqəm → 0 əlavə olunur)
 *  • "0501234567"   → "0501234567"
 *  • "051 682 61 42"→ "0516826142"
 *
 * @param {string} value
 * @returns {string|null} 10 rəqəmli milli nömrə, ya da null
 */
function canonicalNumber(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (!d) return null;

  if (d.startsWith('994') && d.length >= 12) d = d.slice(3);
  else if (d.length > 11) return null; // digər ölkə kodu / format

  if (d.length === 9) d = `0${d}`;
  if (d.length !== 10) return null;
  return d;
}

/**
 * Göndərənin nömrəsi ilə cədvəl qeydinin nömrəsi uyğundurmu?
 *
 * Cədvəl hücründə bəzən İKİ nömrə "a/b" şəklində yazılır — biri uyğun
 * gəlirsə, qeyd bu nömrəyə aid sayılır.
 *
 * @param {string} senderPhone — WhatsApp nömrəsi
 * @param {string} recordPhone — cədvəldəki telefon hücrü
 * @returns {boolean|null} true = uyğun, false = uyğun deyil, null = yoxlanıla bilməz
 */
function phoneMatches(senderPhone, recordPhone) {
  const sender = canonicalNumber(senderPhone);
  if (!sender) return null;

  const candidates = splitNumbers(recordPhone);
  if (!candidates.length) return null;

  let verifiable = false;
  for (const raw of candidates) {
    const c = canonicalNumber(raw);
    if (!c) continue;
    verifiable = true;
    if (c === sender) return true;
    // son 9 rəqəm eynidirsə (səhv ilk rəqəm/format fərqində) — eyni nömrə sayılır
    if (c.slice(-9) === sender.slice(-9)) return true;
  }

  return verifiable ? false : null;
}

/**
 * Tapılmış qeydlərin istifadəçinin nömrəsi ilə əlaqəsi yoxlanılır.
 *
 * @param {any[]} records — tapılmış cədvəl qeydləri
 * @param {string} senderPhone — WhatsApp nömrəsi
 * @returns {{ok: boolean, checked: boolean, matched: number}}
 */
function checkIdentity(records, senderPhone) {
  const list = Array.isArray(records) ? records : [];
  let checked = 0;
  let matched = 0;
  for (const rec of list) {
    const verdict = phoneMatches(senderPhone, rec?.phone);
    if (verdict === null) continue;
    checked += 1;
    if (verdict) matched += 1;
  }
  if (!checked) return { ok: true, checked: false, matched: 0 };
  return { ok: matched > 0, checked: true, matched };
}

module.exports = {
  detectSensitiveQuery,
  phoneMatches,
  checkIdentity,
  normalizeDigits,
  canonicalNumber,
  splitNumbers,
};
