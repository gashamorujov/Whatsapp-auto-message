/**
 * sheetConfig — cədvəl linklərinin saxlanması (data/sheets.json).
 *
 * Linklər Telegram panelində dəyişdirilə bilər; dəyişiklik restartdan
 * sonra da qalır. Fayl yazılmasa default linklərdən (config.js) istifadə olunur.
 */
const fs = require('fs-extra');
const path = require('path');
const settings = require('../settings');
const { writeFileAtomic, readJsonSafe } = require('../lib/atomicWrite');
const { makeLogger } = require('./logger');

const LOG = makeLogger('SHEETS-CFG');

function dataDir() {
  return process.env.BOT_DATA_DIR ? path.resolve(process.env.BOT_DATA_DIR) : path.join(__dirname, '..', 'data');
}

function configFile() {
  return path.join(dataDir(), 'sheets.json');
}

const KINDS = ['certificate', 'course'];

let cache = null;

function defaults() {
  return {
    certificate: String(settings.defaultSheetUrls.certificate || '').trim(),
    course: String(settings.defaultSheetUrls.course || '').trim(),
  };
}

function load() {
  if (cache) return cache;
  const base = defaults();
  const saved = readJsonSafe(configFile());
  cache = {
    certificate: String(saved?.certificate || base.certificate || '').trim(),
    course: String(saved?.course || base.course || '').trim(),
  };
  return cache;
}

function persist() {
  try {
    fs.ensureDirSync(dataDir());
    writeFileAtomic(configFile(), JSON.stringify(cache, null, 2));
  } catch (e) {
    LOG.error('sheets.json yazıla bilmədi:', e.message);
  }
}

/** @param {'certificate'|'course'} kind */
function get(kind) {
  if (!KINDS.includes(kind)) return '';
  return load()[kind] || '';
}

/**
 * @param {'certificate'|'course'} kind
 * @param {string} url
 */
function set(kind, url) {
  if (!KINDS.includes(kind)) throw new Error('Bilinməyən cədvəl növü');
  load();
  cache[kind] = String(url || '').trim();
  persist();
  return cache[kind];
}

/** Bütün linklər (menyu ekranı üçün). */
function all() {
  return { ...load() };
}

module.exports = { get, set, all, defaults, dataDir, configFile, KINDS };
