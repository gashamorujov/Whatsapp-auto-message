#!/usr/bin/env node
/**
 * bot.js — İST Services botunun işə salıcısı (Telegram botu + WhatsApp cavabı).
 *
 * ⚙️  ENV FAYLI (`.env`) LAZIM DEYİL
 * ───────────────────────────────────
 * Bütün konfiqurasiya `config.js` faylında saxlanılır:
 *   • Telegram bot tokeni   → config.js → telegramToken
 *   • Cədvəl linkləri      → config.js → sheets.*
 *
 * Bu fayl `.env` OLMADAN da tam işləyir. Əgər `.env` faylı varsa, o da
 * oxunur (settings.js) — lakin hər iki halda da bot işə salınır.
 * Ətraf mühit dəyişəni (`TELEGRAM_TOKEN` və s.) varsa, o üstündür.
 *
 * İstifadə:
 *   node bot.js                 → tam bot (Telegram paneli + WhatsApp cavabı + cədvəllər)
 *   node bot.js --telegram-only → yalnız Telegram idarəetmə paneli
 *   node bot.js --no-health     → health server olmadan (yalnız lokal istifadə)
 *
 * Telegram idarəetmə paneli:
 *   • Cədvəl linklərini dəyişmək / yeniləmək / test etmək
 *   • WhatsApp-a Pair Code və ya QR ilə qoşulmaq
 *   • 👥 İstifadəçilər — qarşılama statusu, son mesaj tarixi, Restart
 */
const { startApp, registerSignalHandlers } = require('./modules/app');

/** CLI bayraqları. */
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);

const options = {
  telegram: !has('--no-telegram'),
  whatsapp: !has('--telegram-only'),
  health: !has('--no-health'),
};

/** Tokeni maskalayır (loglarda açıq göstərilməsin). */
function maskToken(token) {
  const t = String(token || '');
  if (!t) return '(yoxdur)';
  const [id] = t.split(':');
  return `${id.slice(0, 4)}…${id.slice(-4)} (${t.length} simvol)`;
}

function banner() {
  const settings = require('./settings');
  const token = settings.telegramToken;

  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║   İST Services — Dənizçilik Təlim Mərkəzi Botu          ║');
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Telegram token : ${maskToken(token)}  (${token ? 'config.js' : 'TAPILMADI!'})`);
  console.log(`  Telegram panel : ${options.telegram ? 'aktiv' : 'söndürülüb'}`);
  console.log(`  WhatsApp cavab : ${options.whatsapp ? 'aktiv' : 'söndürülüb'}`);
  console.log(`  Health server  : ${options.health ? 'aktiv' : 'söndürülüb'}`);
  console.log('');
  console.log('  .env faylı tələb edilmir — bütün dəyərlər config.js-dədir.');
  console.log('');

  if (options.telegram && !token) {
    console.error('  ⚠️  Telegram tokeni tapılmadı!');
    console.error('      config.js faylında telegramToken sahəsini doldurun,');
    console.error('      ya da TELEGRAM_TOKEN mühit dəyişənini təyin edin.');
    console.error('');
  }
}

registerSignalHandlers();
banner();

startApp(options).catch((err) => {
  console.error('Bot başladıla bilmədi:', err);
  process.exit(1);
});
