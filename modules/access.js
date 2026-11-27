/**
 * access — Telegram giriş nəzarəti (konfiqurasiyasız, təhlükəsiz default).
 *
 *  1. SAHİB AVTOMATİK TƏYİN OLUNUR: botu deploy etdikdən sonra ona şəxsi
 *     çatda İLK yazan Telegram istifadəçisi sahib olur (data/owner.json).
 *  2. ALLOWED_TELEGRAM_IDS verilibsə, yalnız həmin id-lər icazəlidir.
 *  3. ALLOW_ALL_USERS=true — hər kəs istifadə edə bilər (tövsiyə olunmur).
 */
const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const { writeFileAtomic } = require('../lib/atomicWrite');
const { makeLogger } = require('./logger');

const LOG = makeLogger('ACCESS');

function ownerFile() {
  const dir = process.env.BOT_DATA_DIR ? path.resolve(process.env.BOT_DATA_DIR) : path.join(__dirname, '..', 'data');
  return { dir, file: path.join(dir, 'owner.json') };
}

let owners = null;

function loadOwners() {
  if (owners) return owners;
  owners = [];
  try {
    const data = JSON.parse(fs.readFileSync(ownerFile().file, 'utf-8'));
    if (Array.isArray(data.owners)) owners = data.owners.map(String);
  } catch {
    owners = [];
  }
  return owners;
}

function saveOwners() {
  const { dir, file } = ownerFile();
  try {
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(file, JSON.stringify({ owners, claimedAt: new Date().toISOString() }, null, 2));
  } catch (e) {
    LOG.error('Sahib məlumatı saxlanıla bilmədi:', e.message);
  }
}

function _resetOwners() {
  owners = null;
  try {
    fs.unlinkSync(ownerFile().file);
  } catch {}
}

/** İlk sahibin chat id-si (WhatsApp → Telegram ötürməsi üçün). */
function getOwnerChatId() {
  const first = loadOwners()[0];
  return first ? Number(first) : null;
}

function isAuthorized(userId, cfg = settings) {
  if (cfg.allowAllUsers) return true;
  if (userId === null || userId === undefined) return false;
  const id = String(userId);
  if (cfg.allowedTelegramIds.includes(id)) return true;
  return loadOwners().includes(id);
}

function authorize(userId, ctx = {}, cfg = settings) {
  if (isAuthorized(userId, cfg)) return { ok: true };
  const explicitList = cfg.allowedTelegramIds.length > 0;
  if (
    !explicitList &&
    !cfg.allowAllUsers &&
    ctx.privateChat &&
    userId !== null &&
    userId !== undefined &&
    loadOwners().length === 0
  ) {
    owners = [String(userId)];
    saveOwners();
    LOG.info(`Bot sahibi avtomatik təyin edildi (Telegram ID ${userId}).`);
    return { ok: true, claimed: true };
  }
  return { ok: false };
}

const deniedNotified = new Map();
const NOTIFY_INTERVAL_MS = 10 * 60 * 1000;

function shouldNotifyDenied(userId, now = Date.now()) {
  const key = String(userId);
  const last = deniedNotified.get(key) || 0;
  if (now - last < NOTIFY_INTERVAL_MS) return false;
  deniedNotified.set(key, now);
  if (deniedNotified.size > 1000) {
    for (const [k, ts] of deniedNotified) if (now - ts > NOTIFY_INTERVAL_MS) deniedNotified.delete(k);
  }
  return true;
}

function deniedText() {
  return '⛔ Bu bot şəxsi istifadə üçündür və artıq sahibi var. Giriş icazəniz yoxdur.';
}

function claimedText() {
  return '✅ Siz bu botun sahibi kimi qeyd olundunuz. Yalnız siz idarə edə bilərsiniz.\n\nBaşlamaq üçün /start yazın.';
}

module.exports = {
  isAuthorized,
  authorize,
  shouldNotifyDenied,
  deniedText,
  claimedText,
  getOwnerChatId,
  loadOwners,
  _resetOwners,
};
