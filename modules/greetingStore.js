/**
 * greetingStore — WhatsApp istifadəçilərinin qarşılama (giriş) statusu.
 *
 * Qarşılama mesajı HƏR istifadəçiyə YALNIZ BİR DƏFƏ göndərilir (sənəd §3-§4).
 * İstifadəçi identifikasiyası telefon nömrəsi əsasında aparılır və status
 * məlumat bazasında (data/users.json) saxlanılır — server yenidən başladıqda
 * statuslar İTİRİLMİR.
 *
 * Telegram idarəetmə panelində "Restart" düyməsi bu statusu sıfırlayır:
 *   • fərdi  → reset(phone)   → növbəti mesajda qarşılama yenidən göndərilir
 *   • ümumi  → resetAll()     → bütün istifadəçilər üçün eyni
 * Qarşılama yenidən göndərildikdən sonra status yenidən "aktiv" olur.
 */
const fs = require('fs-extra');
const path = require('path');
const { writeFileAtomic, readJsonSafe } = require('../lib/atomicWrite');
const { makeLogger } = require('./logger');

const LOG = makeLogger('USERS');

/** Daimi məlumat qovluğu (BOT_DATA_DIR varsa o, yoxsə ./data). */
function dataDir() {
  return process.env.BOT_DATA_DIR
    ? path.resolve(process.env.BOT_DATA_DIR)
    : path.join(__dirname, '..', 'data');
}

function usersFile() {
  return path.join(dataDir(), 'users.json');
}

/** Yüklənmiş istifadəçi qeydləri (telefon → qeyd). */
let cache = null;

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/** Faylı oxuyur və yadda saxlayır. */
function load() {
  if (cache) return cache;
  cache = new Map();
  const data = readJsonSafe(usersFile());
  const list = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
  for (const raw of list) {
    const phone = normalizePhone(raw?.phone);
    if (!phone) continue;
    cache.set(phone, {
      phone,
      greeted: !!raw.greeted,
      greetedAt: raw.greetedAt || null,
      lastMessageAt: raw.lastMessageAt || null,
      lastKind: raw.lastKind || null,
      lastQuery: raw.lastQuery || null,
      messageCount: Number(raw.messageCount) || 0,
    });
  }
  return cache;
}

function save() {
  try {
    fs.ensureDirSync(dataDir());
    writeFileAtomic(usersFile(), JSON.stringify({ updatedAt: new Date().toISOString(), users: [...load().values()] }, null, 2));
  } catch (e) {
    LOG.error('İstifadəçi məlumatı yazıla bilmədi:', e.message);
  }
}

/**
 * @param {string} phone
 * @returns {object|null} qeyd
 */
function get(phone) {
  return load().get(normalizePhone(phone)) || null;
}

/** Bu istifadəçiyə qarşılama mesajı göndərilibmi? */
function hasSeen(phone) {
  const rec = get(phone);
  return !!(rec && rec.greeted);
}

/**
 * Qarşılama statusunu aktivləşdirir (mesaj göndərildikdən sonra).
 * @param {string} phone
 * @param {{kind?: string}} [info]
 */
function markGreeted(phone, info = {}) {
  const key = normalizePhone(phone);
  if (!key) return null;
  const map = load();
  const rec = map.get(key) || {
    phone: key,
    greeted: false,
    greetedAt: null,
    lastMessageAt: null,
    lastKind: null,
    lastQuery: null,
    messageCount: 0,
  };
  rec.greeted = true;
  rec.greetedAt = new Date().toISOString();
  if (info.kind) rec.lastKind = info.kind;
  map.set(key, rec);
  save();
  return rec;
}

/**
 * Son mesaj məlumatını yenilədir.
 * @param {string} phone
 * @param {{kind?: string, query?: string}} [info]
 */
function touch(phone, info = {}) {
  const key = normalizePhone(phone);
  if (!key) return null;
  const map = load();
  const rec = map.get(key) || {
    phone: key,
    greeted: false,
    greetedAt: null,
    lastMessageAt: null,
    lastKind: null,
    lastQuery: null,
    messageCount: 0,
  };
  rec.lastMessageAt = new Date().toISOString();
  rec.lastKind = info.kind || rec.lastKind || null;
  rec.lastQuery = info.query || rec.lastQuery || null;
  rec.messageCount = (rec.messageCount || 0) + 1;
  map.set(key, rec);
  save();
  return rec;
}

/** Bütün istifadəçilər (ən son mesaj göndərənlər birinci). */
function list() {
  return [...load().values()].sort((a, b) => {
    const at = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const bt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    if (bt !== at) return bt - at;
    return a.phone.localeCompare(b.phone);
  });
}

/**
 * Fərdi restart — bu istifadəçinin qarşılama statusu sıfırlanır.
 * @param {string} phone
 * @returns {boolean} status dəyişdisə true
 */
function reset(phone) {
  const key = normalizePhone(phone);
  if (!key) return false;
  const map = load();
  const rec = map.get(key);
  if (!rec) return false;
  rec.greeted = false;
  rec.greetedAt = null;
  map.set(key, rec);
  save();
  LOG.info(`Qarşılama statusu sıfırlandı (istifadəçi +${key}).`);
  return true;
}

/**
 * Ümumi restart — bütün istifadəçilərin qarşılama statusu sıfırlanır.
 * @returns {number} sıfırlanan istifadəçi sayı
 */
function resetAll() {
  const map = load();
  let count = 0;
  for (const rec of map.values()) {
    if (rec.greeted) {
      rec.greeted = false;
      rec.greetedAt = null;
      count += 1;
    }
  }
  if (count) save();
  LOG.info(`Ümumi restart — ${count} istifadəçinin qarşılama statusu sıfırlandı.`);
  return count;
}

/** Testlər üçün: yaddaşı təmizlərir. */
function _resetCache() {
  cache = null;
}

module.exports = {
  dataDir,
  usersFile,
  get,
  hasSeen,
  markGreeted,
  touch,
  list,
  reset,
  resetAll,
  _resetCache,
};
