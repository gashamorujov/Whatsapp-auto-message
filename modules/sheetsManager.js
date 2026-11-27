/**
 * sheetsManager — cədvəllərin yüklənməsi, yenilənməsi və statusu.
 *
 * İş axını:
 *   1) Hər saatda bir dəfə (SHEET_REFRESH_MINUTES) hər iki cədvəl CSV kimi
 *      çəkilir, parse olunur və indekslər yenidən qurulur.
 *   2) Uğurlu yeniləmə snapshot faylda saxlanılır (restartda dərhal cavab verə bilmək üçün).
 *   3) Uğursuzluqda əvvəlki məlumat qorunur, xəta Telegram sahibinə bildirilir.
 */
const fs = require('fs-extra');
const path = require('path');
const settings = require('../settings');
const sheetConfig = require('./sheetConfig');
const { parseCsv, normalizeWidth } = require('../lib/csv');
const { parseSheetUrl, buildCsvUrl } = require('../lib/sheetUrl');
const { getSheetCsv } = require('../lib/http');
const { parseCertificateRows, CertificateStore } = require('./certificateStore');
const { parseCourseRows, CourseStore } = require('./courseStore');
const { writeFileAtomic } = require('../lib/atomicWrite');
const { makeLogger } = require('./logger');

const LOG = makeLogger('SHEETS');

const certificateStore = new CertificateStore();
const courseStore = new CourseStore();

const status = {
  certificate: { updatedAt: null, count: 0, error: null, lastAttemptAt: null },
  course: { updatedAt: null, count: 0, error: null, lastAttemptAt: null },
};

let schedulerTimer = null;
let refreshing = false;
const listeners = [];

/** Xəta/hadisə dinləyiciləri (Telegram bildirişləri üçün). */
function onEvent(cb) {
  if (typeof cb === 'function') listeners.push(cb);
}

function emit(event) {
  for (const cb of listeners) {
    try {
      cb(event);
    } catch (e) {
      LOG.warn('Event listener error:', e.message);
    }
  }
}

function snapshotDir() {
  return path.join(sheetConfig.dataDir(), 'snapshot');
}

function snapshotFile(kind) {
  return path.join(snapshotDir(), `${kind}.json`);
}

/** Son uğurlu snapshot-u oxuyur (startup-da dərhal məlumat üçün). */
function loadSnapshot(kind) {
  try {
    const file = snapshotFile(kind);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!data || !Array.isArray(data.records)) return null;
    return data;
  } catch (e) {
    LOG.warn(`Snapshot oxunmadı (${kind}):`, e.message);
    return null;
  }
}

function saveSnapshot(kind, records, source) {
  try {
    fs.ensureDirSync(snapshotDir());
    const payload = { records, updatedAt: new Date().toISOString(), source };
    writeFileAtomic(snapshotFile(kind), JSON.stringify(payload));
  } catch (e) {
    LOG.error(`Snapshot yazıla bilmədi (${kind}):`, e.message);
  }
}

/**
 * CSV-ni çəkib parse edir.
 * @param {string} sheetUrl
 * @returns {Promise<{rows: string[][], csvUrl: string}>}
 */
async function fetchRows(sheetUrl) {
  const parsed = parseSheetUrl(sheetUrl);
  if (!parsed) {
    throw new Error('Link tanınmadı. Google Sheets linki gözlənilir (https://docs.google.com/spreadsheets/d/...).');
  }
  const csvUrl = buildCsvUrl(parsed.id, parsed.gid);
  const { text } = await getSheetCsv(csvUrl);
  const rows = normalizeWidth(parseCsv(text));
  if (!rows.length) throw new Error('Cədvəl boş qaytarıldı.');
  return { rows, csvUrl };
}

async function refreshCertificate() {
  const url = sheetConfig.get('certificate');
  status.certificate.lastAttemptAt = new Date().toISOString();
  if (!url) {
    status.certificate.error = 'Sertifikat cədvəlinin linki təyin edilməyib.';
    return { ok: false, error: status.certificate.error };
  }
  try {
    const { rows } = await fetchRows(url);
    const parsed = parseCertificateRows(rows, { courseNameSource: settings.courseNameSource });
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.records.length) throw new Error('Cədvəldə məlumat tapılmadı (başlıq sətri tapıldı, amma sətirlər boşdur).');

    certificateStore.load({ records: parsed.records, updatedAt: new Date().toISOString(), source: url });
    saveSnapshot('certificate', parsed.records, url);
    status.certificate = {
      updatedAt: certificateStore.updatedAt,
      count: certificateStore.size,
      error: null,
      lastAttemptAt: new Date().toISOString(),
    };
    LOG.info(`Sertifikat cədvəli yeniləndi: ${certificateStore.size} sətir`);
    emit({ type: 'refresh', kind: 'certificate', ok: true, count: certificateStore.size });
    return { ok: true, count: certificateStore.size };
  } catch (e) {
    status.certificate.error = e.message;
    LOG.error('Sertifikat cədvəli yenilənmədi:', e.message);
    emit({ type: 'refresh', kind: 'certificate', ok: false, error: e.message });
    return { ok: false, error: e.message };
  }
}

async function refreshCourse() {
  const url = sheetConfig.get('course');
  status.course.lastAttemptAt = new Date().toISOString();
  if (!url) {
    status.course.error = 'Kurs cədvəlinin linki təyin edilməyib.';
    return { ok: false, error: status.course.error };
  }
  try {
    const { rows } = await fetchRows(url);
    const parsed = parseCourseRows(rows, { courseNameSource: settings.courseNameSource });
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.records.length) throw new Error('Cədvəldə məlumat tapılmadı (başlıq sətri tapıldı, amma sətirlər boşdur).');

    courseStore.load({ records: parsed.records, updatedAt: new Date().toISOString(), source: url });
    saveSnapshot('course', parsed.records, url);
    status.course = {
      updatedAt: courseStore.updatedAt,
      count: courseStore.size,
      error: null,
      lastAttemptAt: new Date().toISOString(),
    };
    LOG.info(`Kurs cədvəli yeniləndi: ${courseStore.size} sətir`);
    emit({ type: 'refresh', kind: 'course', ok: true, count: courseStore.size });
    return { ok: true, count: courseStore.size };
  } catch (e) {
    status.course.error = e.message;
    LOG.error('Kurs cədvəli yenilənmədi:', e.message);
    emit({ type: 'refresh', kind: 'course', ok: false, error: e.message });
    return { ok: false, error: e.message };
  }
}

/** Hər iki cədvəli yeniləyir. */
async function refreshAll() {
  if (refreshing) return { ok: false, error: 'Yeniləmə artıq davam edir.' };
  refreshing = true;
  try {
    const [cert, course] = [await refreshCertificate(), await refreshCourse()];
    return { ok: cert.ok && course.ok, certificate: cert, course };
  } finally {
    refreshing = false;
  }
}

/** Restartdan sonra əvvəlki snapshot-u yükləyir. */
function restoreSnapshots() {
  const cert = loadSnapshot('certificate');
  if (cert) {
    certificateStore.load(cert);
    status.certificate = { updatedAt: cert.updatedAt, count: certificateStore.size, error: null, lastAttemptAt: null };
    LOG.info(`Sertifikat snapshot-u yükləndi: ${certificateStore.size} sətir`);
  }
  const course = loadSnapshot('course');
  if (course) {
    courseStore.load(course);
    status.course = { updatedAt: course.updatedAt, count: courseStore.size, error: null, lastAttemptAt: null };
    LOG.info(`Kurs snapshot-u yükləndi: ${courseStore.size} sətir`);
  }
}

/** Saatlıq yeniləmə taymerini başladır. */
function startScheduler() {
  stopScheduler();
  const minutes = Math.max(5, settings.sheetRefreshMin);
  schedulerTimer = setInterval(() => {
    refreshAll().catch((e) => LOG.error('Cədvəl yeniləmə xətası:', e.message));
  }, minutes * 60 * 1000);
  if (schedulerTimer.unref) schedulerTimer.unref();
  LOG.info(`Cədvəl yeniləmə taymeri başladı: hər ${minutes} dəqiqə`);
  return minutes;
}

function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

/** Telegram üçün vəziyyət hesabatı. */
function getStatus() {
  return {
    certificate: { ...status.certificate, size: certificateStore.size },
    course: { ...status.course, size: courseStore.size },
    links: sheetConfig.all(),
    refreshIntervalMin: Math.max(5, settings.sheetRefreshMin),
  };
}

module.exports = {
  certificateStore,
  courseStore,
  refreshCertificate,
  refreshCourse,
  refreshAll,
  startScheduler,
  stopScheduler,
  restoreSnapshots,
  getStatus,
  onEvent,
  fetchRows,
};
