/**
 * Logger — vahid, məxfi məlumata təhlükəsiz loglama köməkçisi.
 *
 *  - LOG_FORMAT=json → strukturlu (bir sətir = bir JSON) loglar;
 *    default: oxunaqlı mətn.
 *  - Telegram bot tokeni və telefon nömrələri loglara YAZILMIR:
 *      * `bot123456:ABC…` / token formatı → <redacted>
 *      * 9–15 rəqəmli nömrələr → +994•••••4567 (maskalanmış)
 *  - Şəxsi məlumat (ad, e-poçt) loglanmır — yalnız sayğaclar və növ/length.
 */
const crypto = require('crypto');

const TOKEN_RES = [/bot\d{6,}:[A-Za-z0-9_-]{20,}/g, /\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g];
const PHONE_RE = /(\+?)(\d{2,4})(\d{3,9})(\d{4})(?!\d)/g;

function redactPhones() {
  return process.env.LOG_REDACT_PHONES !== 'false';
}

function redactString(str) {
  let out = String(str);
  for (const re of TOKEN_RES) out = out.replace(re, '<redacted>');
  if (redactPhones()) {
    out = out.replace(PHONE_RE, (m, plus, a, mid, last) => {
      const total = a.length + mid.length + last.length;
      if (total < 9 || total > 15) return m;
      return `${plus || '+'}${a.slice(0, 3)}${'•'.repeat(Math.max(3, mid.length))}${last}`;
    });
  }
  return out;
}

function toText(arg) {
  if (arg instanceof Error) return redactString(arg.stack || arg.message);
  if (typeof arg === 'string') return redactString(arg);
  if (arg === null || arg === undefined) return String(arg);
  if (typeof arg === 'object') {
    try {
      return redactString(JSON.stringify(arg));
    } catch {
      return '[object]';
    }
  }
  return redactString(String(arg));
}

/** Qaytarılmayan qısa identifikator (nömrə əvəzinə loglarda istifadə üçün). */
function contactRef(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return 'c_none';
  return `c_${crypto.createHash('sha1').update(d).digest('hex').slice(0, 8)}`;
}

function emit(level, prefix, args) {
  const msg = args.map(toText).join(' ');
  const json = String(process.env.LOG_FORMAT || '').toLowerCase() === 'json';
  const stream = level === 'info' ? console.log : level === 'warn' ? console.warn : console.error;
  if (json) {
    stream(JSON.stringify({ ts: new Date().toISOString(), level, scope: prefix, msg }));
  } else {
    stream(`[${prefix}]`, msg);
  }
}

function makeLogger(prefix) {
  return {
    info: (...args) => emit('info', prefix, args),
    warn: (...args) => emit('warn', prefix, args),
    error: (...args) => emit('error', prefix, args),
  };
}

module.exports = { makeLogger, redactString, contactRef };
