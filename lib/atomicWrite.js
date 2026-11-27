/**
 * atomicWrite — faylı əvvəl müvəqqəti ada yazır, sonra rename edir.
 * Proses yazma zamanı çökərsə köhnə fayl bütöv qalır (yarımçıq JSON olmur).
 */
const fs = require('fs');
const path = require('path');

let counter = 0;

function writeFileAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.${counter++}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

/** JSON faylı oxu: bütöv deyilsə null qaytarır (çağıran qərar verir). */
function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/** Qalıq .tmp fayllarını (əvvəlki çökmədən) təzizləyir. */
function cleanupTmp(dir) {
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.tmp')) {
        try { fs.unlinkSync(path.join(dir, f)); } catch {}
      }
    }
  } catch {}
}

module.exports = { writeFileAtomic, readJsonSafe, cleanupTmp };
