/**
 * guards — botun özünü qoruyan mexanizmlər.
 *
 *  • Blok listi  — müəyyən nömrələrə cavab verilmir (Telegram-dan idarə olunur).
 *  • Rate limit  — bir nömrədən çox tez-tez mesaj gələndə cavab dayandırılır.
 *  • Statistika  — sayğaclar və son sorğular (Telegram monitorinq üçün).
 */
const fs = require('fs-extra');
const path = require('path');
const settings = require('../settings');
const { writeFileAtomic, readJsonSafe } = require('../lib/atomicWrite');
const { makeLogger } = require('./logger');

const LOG = makeLogger('GUARDS');

function dataDir() {
  return process.env.BOT_DATA_DIR ? path.resolve(process.env.BOT_DATA_DIR) : path.join(__dirname, '..', 'data');
}

// ─────────────────────────── Blok listi ───────────────────────────

let blocked = null;

function blockedFile() {
  return path.join(dataDir(), 'blocked.json');
}

function loadBlocked() {
  if (blocked) return blocked;
  const data = readJsonSafe(blockedFile());
  blocked = new Set(Array.isArray(data?.numbers) ? data.numbers.map(String) : []);
  return blocked;
}

function saveBlocked() {
  try {
    fs.ensureDirSync(dataDir());
    writeFileAtomic(blockedFile(), JSON.stringify({ numbers: [...loadBlocked()] }, null, 2));
  } catch (e) {
    LOG.error('Blok listi yazıla bilmədi:', e.message);
  }
}

/** @param {string} phone */
function isBlocked(phone) {
  return loadBlocked().has(String(phone || '').replace(/\D/g, ''));
}

/** @param {string} phone */
function block(phone) {
  const p = String(phone || '').replace(/\D/g, '');
  if (!p) return false;
  loadBlocked().add(p);
  saveBlocked();
  return true;
}

/** @param {string} phone */
function unblock(phone) {
  const p = String(phone || '').replace(/\D/g, '');
  if (!loadBlocked().has(p)) return false;
  loadBlocked().delete(p);
  saveBlocked();
  return true;
}

function blockedList() {
  return [...loadBlocked()];
}

// ─────────────────────────── Rate limit ───────────────────────────

const hits = new Map(); // phone -> [timestamp, ...]

/**
 * Nömrə bu pəncərədə limiti aşdı?
 * @param {string} phone
 */
function isRateLimited(phone) {
  const key = String(phone || '').replace(/\D/g, '');
  if (!key) return false;
  const windowMs = Math.max(1, settings.rateLimitWindowMin) * 60 * 1000;
  const limit = Math.max(1, settings.rateLimitPerMin);
  const now = Date.now();

  const list = (hits.get(key) || []).filter((ts) => now - ts < windowMs);
  list.push(now);
  hits.set(key, list);

  if (hits.size > 5000) {
    for (const [k, arr] of hits) {
      const alive = arr.filter((ts) => now - ts < windowMs);
      if (alive.length === 0) hits.delete(k);
      else hits.set(k, alive);
    }
  }
  return list.length > limit;
}

// ─────────────────────────── Statistika ───────────────────────────

const stats = {
  startedAt: Date.now(),
  received: 0,
  replied: 0,
  certificateQueries: 0,
  courseQueries: 0,
  notFound: 0,
  ambiguous: 0,
  welcome: 0,
  voice: 0,
  blocked: 0,
  rateLimited: 0,
  blockedSkipped: 0,
  errors: 0,
};

const recent = []; // son N sorğu
const RECENT_MAX = 50;

/**
 * @param {{from: string, text: string, reply: string, kind: string, matched: boolean, at?: number}} entry
 */
function pushRecent(entry) {
  recent.unshift({ at: Date.now(), ...entry });
  if (recent.length > RECENT_MAX) recent.length = RECENT_MAX;
}

function getRecent(limit = 10) {
  return recent.slice(0, Math.max(1, Math.min(RECENT_MAX, limit)));
}

function getStats() {
  return { ...stats, uptimeMs: Date.now() - stats.startedAt, recentCount: recent.length };
}

function inc(key, by = 1) {
  if (key in stats) stats[key] += by;
}

module.exports = {
  isBlocked,
  block,
  unblock,
  blockedList,
  isRateLimited,
  pushRecent,
  getRecent,
  getStats,
  inc,
  stats,
};
