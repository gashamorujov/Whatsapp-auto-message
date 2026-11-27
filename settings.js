/**
 * settings.js — mərkəzləşdirilmiş konfiqurasiya.
 *
 * Bütün dəyərlər ətraf mühit dəyişəni ilə verilə bilər; defoltlar isə
 * "işləyən vəziyyət" üçün optimallaşdırılıb (heç nə konfiqurasiya
 * etmədən də bot qalxır və işləyir).
 *
 * ⚙️  `.env` FAYLI TAMAMLAŞ İSTEĞEYƏ BAĞLIDIR:
 *   varsa oxunur, yoxdursa heç nə baş vermir. `config.js` faylı həmişə
 *   əsas mənbədir; ətraf mühit dəyişənləri üstündür.
 */
const fs = require('fs');
const path = require('path');

/**
 * `.env` faylını oxuyur (yoxdursa heç nə etmir).
 * Artıq təyin olunmuş ətraf mühit dəyişənləri ÜSTÜNDÜR.
 */
function loadDotEnv(file = path.join(__dirname, '.env')) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    return false; // .env yoxdur — normal vəziyyət
  }
  try {
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);
      if (!m) continue;
      const key = m[1];
      if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;
      let value = String(m[2] || '').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (value === '') continue; // boş dəyər → defolt işləyir
      process.env[key] = value;
    }
    return true;
  } catch {
    return false;
  }
}

loadDotEnv();

let fileConfig = {};
try {
  fileConfig = require('./config');
} catch {
  fileConfig = {};
}

function intEnv(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : fallback;
}

function boolEnv(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(String(v).toLowerCase());
}

function strEnv(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : String(v);
}

/** "123, 456 789" → ['123','456','789'] (yalnız rəqəmli Telegram user id-ləri). */
function idListEnv(name) {
  return String(process.env[name] || '')
    .split(/[\s,;]+/)
    .map((v) => v.trim())
    .filter((v) => /^-?\d+$/.test(v));
}

const fileSheets = fileConfig.sheets || {};

const settings = {
  version: '1.1.0',
  name: 'İST Services Dənizcilik Təlim Mərkəzi',

  // Telegram bot tokeni — config.js-dədir (env faylı lazım deyil)
  telegramToken: String(process.env.TELEGRAM_TOKEN || fileConfig.telegramToken || '').trim(),

  // ─── Telegram giriş nəzarəti ───
  // Boşdursa: botda ilk şəxsi çatda yazan istifadəçi avtomatik sahib olur.
  allowedTelegramIds: idListEnv('ALLOWED_TELEGRAM_IDS'),
  allowAllUsers: boolEnv('ALLOW_ALL_USERS', false),

  // ─── WhatsApp ───
  pairNumber: strEnv('PAIR_NUMBER', ''),
  // Avtomatik cavab (sertifikat / kurs yoxlaması) — açıq/bağlı
  autoReplyEnabled: boolEnv('WA_AUTO_REPLY', true),
  // Yalnız fərdi (şəxsi) chat-lərdə cavab; qruplarda bot susar
  privateOnly: boolEnv('WA_PRIVATE_ONLY', true),
  // Nömrə ilə əlaqələndirmə yoxlaması (təhlükəsizlik — sənəd §6.11).
  // Cədvəldə "Telefon nömrəsi" sütunu varsa, yalnız eyni nömrəyə aid
  // qeydlərin məlumatı göstərilir. Cədvəl məlumatı səhvidirsə panelden
  // söndürülə bilər.
  waPhoneCheck: boolEnv('WA_PHONE_CHECK', true),
  // Gələn WhatsApp mesajlarını Telegram-a ötür (monitorinq)
  forwardIncoming: boolEnv('TG_FORWARD_INCOMING', true),
  // Anti-spam: bir nömrədən bu qədər mesaj / dəqiqə
  rateLimitPerMin: intEnv('WA_RATE_LIMIT_PER_MIN', 8),
  rateLimitWindowMin: intEnv('WA_RATE_LIMIT_WINDOW_MIN', 5),

  // ─── Cədvəllər ───
  // Yeniləmə tezliyi (dəqiqə) — 60 = saatda bir dəfə
  sheetRefreshMin: intEnv('SHEET_REFRESH_MINUTES', 60),
  // Kurs adının mənbəyi: 'map' = kod→ad xəritəsi (defolt), 'sheet' = cədvəldəki ad
  courseNameSource: strEnv('COURSE_NAME_SOURCE', 'map').toLowerCase() === 'sheet' ? 'sheet' : 'map',
  // Cədvəl linklərinin default dəyərləri (Telegram-da dəyişdirilə bilər)
  defaultSheetUrls: {
    certificate: strEnv('SHEET_CERT_URL', fileSheets.certificate?.url || ''),
    course: strEnv('SHEET_COURSE_URL', fileSheets.course?.url || ''),
  },

  // ─── Digər ───
  reportTimezone: strEnv('REPORT_TIMEZONE', 'Asia/Baku'),
  tempFileMaxAgeMin: intEnv('TEMP_FILE_MAX_AGE_MIN', 120),
  maxDownloadMb: intEnv('TG_MAX_DOWNLOAD_MB', 50),
  progressMinIntervalMs: intEnv('PROGRESS_MIN_INTERVAL_MS', 3000),
};

module.exports = settings;
