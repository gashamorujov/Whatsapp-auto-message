/**
 * index.js — botun əsas başlanğıc nöqtəsi.
 *
 * Bütün başlatma məntiqi modules/app.js-dədir (həm bu fayl, həm də bot.js
 * eyni məntiqi işə salır). Burada yalnız icra olunur.
 *
 *   node index.js  →  Telegram idarəetmə paneli + WhatsApp avtomatik cavabı
 *   node bot.js    →  eyni iş, amma Telegram botuna xüsusi diqqət (env lazım deyil)
 */
const { startApp, registerSignalHandlers } = require('./modules/app');

registerSignalHandlers();

startApp({ telegram: true, whatsapp: true, health: true }).catch((err) => {
  console.error('Bot başladıla bilmədi:', err);
  process.exit(1);
});
