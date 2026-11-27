/**
 * WhatsAppManager — Baileys soketinin həyat dövrü.
 *
 * Sorğular:
 *  - Pair Code və ya QR Code ilə qoşulma
 *  - sessiyaların saxlanması (sessions/<phone>/creds.json)
 *  - avtomatik yenidən bağlanma (exponential backoff + watchdog)
 *  - mesaj göndərmə (botun cavabları üçün)
 *
 * Bu layihədə toplu mesaj göndərmə, kontakt idarəetməsi yoxdur —
 * bot yalnız avtomatik cavab verir.
 */
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const NodeCache = require('node-cache');
const QRCode = require('qrcode');
const fs = require('fs-extra');
const path = require('path');
const { sleep } = require('../lib/myfunc');
const { makeLogger } = require('./logger');
const { getTelegramMessenger } = require('./services');
const { writeFileAtomic } = require('../lib/atomicWrite');

const LOG = makeLogger('WA');

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
const SESSION_DATA_FILE = path.join(SESSIONS_DIR, 'sessions.json');

fs.ensureDirSync(SESSIONS_DIR);

let sessionsData = {};
try {
  if (fs.existsSync(SESSION_DATA_FILE)) {
    sessionsData = JSON.parse(fs.readFileSync(SESSION_DATA_FILE, 'utf-8'));
  }
} catch {
  sessionsData = {};
}

function saveSessionsData() {
  try {
    writeFileAtomic(SESSION_DATA_FILE, JSON.stringify(sessionsData, null, 2));
  } catch (e) {
    LOG.error('saveSessionsData:', e.message);
  }
}

const activeConnections = {};
const connectedHooks = [];

/** Qoşulma hadisəsi dinləyicisi (auto-reply fayllarının yüklənməsi üçün). */
function onConnected(cb) {
  if (typeof cb === 'function') connectedHooks.push(cb);
}

function fireConnectedHooks(phone, sock) {
  for (const cb of connectedHooks) {
    try {
      Promise.resolve(cb(phone, sock)).catch((e) => LOG.error('Connected hook error:', e.message));
    } catch (e) {
      LOG.error('Connected hook error:', e.message);
    }
  }
}

const fmtPhone = (n) => String(n || '').replace(/[^0-9]/g, '');
const sessDir = (p) => path.join(SESSIONS_DIR, p);

/**
 * Telegram botuna mətn göndərir.
 * `bot` null ola bilər (avtomatik yenidən qoşulma zamanı) — o halda
 * qlobal messenger istifadə olunur, ki WhatsApp tərəfdəki kritik mesajlar
 * (yeni Pair Code / QR) Telegram-a çatdırılsın.
 */
async function say(bot, chatId, text, opts) {
  if (!chatId) return null;
  try {
    if (bot && typeof bot.sendMessage === 'function') {
      return await bot.sendMessage(chatId, text, opts || {});
    }
    const m = getTelegramMessenger();
    if (m && typeof m.sendText === 'function') {
      return await m.sendText(chatId, text, opts || {});
    }
  } catch (e) {
    LOG.error('say failed:', e.message);
  }
  return null;
}

async function sayPhoto(bot, chatId, buffer, caption) {
  if (!chatId) return null;
  try {
    if (bot && typeof bot.sendPhoto === 'function') {
      return await bot.sendPhoto(chatId, buffer, { caption });
    }
    const m = getTelegramMessenger();
    if (m && typeof m.sendPhoto === 'function') {
      return await m.sendPhoto(chatId, buffer, caption, {});
    }
  } catch (e) {
    LOG.error('sayPhoto failed:', e.message);
  }
  return null;
}

// ─── Qoşulma mesajlarının izlənməsi/təmizlənməsi ───
// QR, Pair Code və "qoşulur..." kimi müvəqqəti mesajlar uğurlu qoşulmadan
// sonra avtomatik silinir; yalnız "✅ Uğurla qoşuldu" qalır.
const connTrack = new Map();

function trackConnMsg(phone, msg) {
  if (!phone || !msg?.message_id) return;
  if (!connTrack.has(phone)) connTrack.set(phone, []);
  connTrack.get(phone).push({ chatId: msg.chat?.id, messageId: msg.message_id });
}

async function sayConn(bot, chatId, phone, text, opts) {
  const m = await say(bot, chatId, text, opts);
  trackConnMsg(phone, m);
  return m;
}

async function sayPhotoConn(bot, chatId, phone, buffer, caption) {
  const m = await sayPhoto(bot, chatId, buffer, caption);
  trackConnMsg(phone, m);
  return m;
}

async function clearConnMsgs(phone, bot) {
  const list = connTrack.get(phone) || [];
  connTrack.delete(phone);
  for (const item of list) {
    try {
      if (bot && item.chatId && item.messageId) await bot.deleteMessage(item.chatId, item.messageId);
    } catch {}
  }
}

/**
 * Nömrəni qoşur (Pair Code və ya QR).
 * @param {string} phone
 * @param {'pair'|'qr'} method
 * @param {object|null} bot — Telegram bot messenger
 * @param {string|null} chatId
 */
async function connectWithPhone(phone, method = 'pair', bot = null, chatId = null) {
  phone = fmtPhone(phone);
  if (!phone || phone.length < 7 || phone.length > 15) {
    return say(bot, chatId, '❌ Yanlış nömrə formatı.\n\nDüzgün format: 994501234567\nNümunə: 994501234567');
  }

  if (sessionsData[phone]?.status === 'connected' && activeConnections[phone]) {
    return say(bot, chatId, `ℹ️ +${phone} artıq bağlıdır.`);
  }

  const methodName = method === 'qr' ? 'QR Code' : 'Pair Code';

  // Telegram çat id-si dərhal yadda saxlanılır: qoşulma uğursuz olsa da
  // yenidən cəhd zamanı yeni Pair Code / QR Telegram-a çatdırılsın.
  if (chatId) {
    if (!sessionsData[phone]) sessionsData[phone] = { phone, status: 'pending', method };
    sessionsData[phone].chatId = chatId;
    sessionsData[phone].method = method;
    saveSessionsData();
  }

  await sayConn(bot, chatId, phone, `⏳ +${phone} ${methodName} ilə qoşulur...`, { parse_mode: 'Markdown' });

  try {
    const dir = sessDir(phone);
    fs.ensureDirSync(dir);
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const { version } = await fetchLatestBaileysVersion();
    const msgCache = new NodeCache();

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['Android', 'Chrome', '20.0.04'],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' })),
      },
      markOnlineOnConnect: true,
      msgRetryCounterCache: msgCache,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      syncFullHistory: true,
    });

    let qrSent = false;
    let pairCodeSent = false;
    let connOpen = false;
    let everOpened = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 10;
    const timers = [];
    const thisSock = sock;

    sock.ev.on('connection.update', async (s) => {
      const { connection, lastDisconnect, qr } = s;

      if (qr && !qrSent) {
        qrSent = true;
        if (method === 'qr') {
          try {
            const buf = await QRCode.toBuffer(qr, { type: 'png', margin: 2, scale: 8 });
            await sayPhotoConn(
              bot,
              chatId,
              phone,
              buf,
              `📷 *QR Code* — +${phone}\n\n1. WhatsApp → Linked Devices\n2. *Link a Device*\n3. *Scan* the QR`
            );
          } catch (err) {
            LOG.error('QR gen error:', err.message);
            await say(bot, chatId, 'QR xətası: ' + err.message);
            qrSent = false;
          }
        } else if (method === 'pair' && !pairCodeSent) {
          pairCodeSent = true;
          LOG.info(`Socket ready, requesting pairing code for +${phone}`);
          requestPairingCodeWithRetry(sock, phone, bot, chatId).catch((e) => {
            LOG.error(`Pair request failed for +${phone}:`, e.message);
          });
        }
      }

      if (connection === 'open') {
        connOpen = true;
        everOpened = true;
        reconnectAttempts = 0;
        LOG.info('Connected +' + phone);
        sessionsData[phone] = {
          phone,
          status: 'connected',
          connectedAt: new Date().toISOString(),
          name: sock.user?.name || phone,
          jid: sock.user?.id || '',
          method,
          chatId: chatId || sessionsData[phone]?.chatId || null,
        };
        saveSessionsData();
        activeConnections[phone] = sock;
        await clearConnMsgs(phone, bot);
        await say(bot, chatId, `✅ Uğurla qoşuldu!\n+${phone}\n${sock.user?.name || ''}`, { parse_mode: 'Markdown' });
        fireConnectedHooks(phone, sock);
      }

      if (connection === 'close') {
        // Bu soketin taymerləri ləğv edilir — əks halda yeni qoşulmanı
        // "timeout" mesajı bağlaya bilərdi.
        for (const t of timers) clearTimeout(t);
        timers.length = 0;

        const code = lastDisconnect?.error?.output?.statusCode;
        const errMsg = lastDisconnect?.error?.message || '';
        LOG.info('Connection closed for +' + phone, 'code:', code, 'msg:', errMsg);
        delete activeConnections[phone];

        if (code === DisconnectReason.loggedOut || code === 401) {
          clearConnMsgs(phone, bot);
          delete sessionsData[phone];
          saveSessionsData();
          try {
            fs.removeSync(dir);
          } catch {}
          await say(bot, chatId, `🚪 +${phone} — hesabdan çıxarıldı (logged out).`);
          return;
        }

        if (sessionsData[phone]) sessionsData[phone].status = 'reconnecting';
        else sessionsData[phone] = { phone, status: 'reconnecting', method };
        saveSessionsData();

        // 515 = "restart required" — WhatsApp bağlantını qopardı.
        // Heç açılmamışdırsa → nömrə qeydi alınmayıb/bloklanıb ola bilər.
        if (code === 515 && !everOpened && reconnectAttempts === 0) {
          await say(
            bot,
            sessionsData[phone]?.chatId || chatId || null,
            `⚠️ +${phone} ilə bağlantı qurula bilmədi (WhatsApp bağlantını qopardı — 515).\n\n` +
              'Nömrəni yoxlayın: ölkə kodu + nömrə düzgün yazılmalıdır (məs. `994501234567`).\n' +
              'Əgər nömrə WhatsApp-da qeydi alınıbsa, bir neçə dəqiqə sonra yenidən cəhd edin.'
          );
        }

        if (reconnectAttempts < MAX_RECONNECT) {
          const delay = Math.min(3000 * Math.pow(2, reconnectAttempts), 60000);
          reconnectAttempts += 1;
          LOG.info(`[AutoReconnect] +${phone} attempt ${reconnectAttempts}/${MAX_RECONNECT} in ${delay / 1000}s`);
          const targetChat = sessionsData[phone]?.chatId || null;
          setTimeout(async () => {
            if (!activeConnections[phone]) {
              try {
                // Telegram çat id-si ötürülür — yeni QR / Pair Code çatdırılsın
                await connectWithPhone(phone, method, null, targetChat);
              } catch (e) {
                LOG.error(`[AutoReconnect] +${phone} failed:`, e.message);
              }
            }
          }, delay);
        } else {
          LOG.info(`[AutoReconnect] +${phone} max attempts reached, waiting for watchdog`);
          if (sessionsData[phone]) sessionsData[phone].status = 'disconnected';
          saveSessionsData();
          await say(
            bot,
            sessionsData[phone]?.chatId || null,
            `⚠️ +${phone} ilə bağlantı qurula bilmədi (${MAX_RECONNECT} cəhd).\n\n` +
              'Nömrəni yoxlayın və ya **📲 WhatsApp qoşulma → 🔐 Pair Code** ilə yenidən cəhd edin.'
          );
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);
    activeConnections[phone] = sock;

    if (method === 'qr') {
      timers.push(
        setTimeout(() => {
          // Yalnız ÖZ soketimizə toxunur — yeni qoşulmuş bağlantı qapalmasın
          if (activeConnections[phone] !== thisSock) return;
          if (!connOpen && !qrSent) {
            say(bot, chatId, `⏳ +${phone}: QR yaradılmadı (timeout).`);
            try {
              thisSock.end(new Error('qr timeout'));
            } catch {}
            delete activeConnections[phone];
            if (sessionsData[phone]) sessionsData[phone].status = 'disconnected';
            saveSessionsData();
          }
        }, 30000)
      );
      timers.push(
        setTimeout(() => {
          if (activeConnections[phone] !== thisSock) return;
          if (!connOpen) {
            say(bot, chatId, `⏳ +${phone}: QR scan timeout.`);
            try {
              thisSock.end(new Error('qr scan timeout'));
            } catch {}
            delete activeConnections[phone];
            if (sessionsData[phone]?.status !== 'logged_out') {
              sessionsData[phone].status = 'disconnected';
              saveSessionsData();
            }
          }
        }, 120000)
      );
    }
  } catch (err) {
    LOG.error('Connection error +' + phone, err);
    await say(bot, chatId, '❌ Xəta: ' + err.message);
  }
}

async function requestPairingCodeWithRetry(sock, phone, bot, chatId, maxRetries = 15) {
  for (let i = 0; i < maxRetries; i += 1) {
    if (sessionsData[phone]?.status === 'connected') return;
    if (!activeConnections[phone]) return;
    try {
      LOG.info(`Requesting pairing code for ${phone} (attempt ${i + 1}/${maxRetries})`);
      let code = await sock.requestPairingCode(phone);
      code = code?.match(/.{1,4}/g)?.join('-') || code;
      LOG.info(`Pairing code for ${phone}: ${code}`);

      await sayConn(
        bot,
        chatId,
        phone,
        `🔐 *Pairing Code hazırdır!*\n\n` + `Kod:\n\`${code}\`\n\n` + `📲 WhatsApp → Linked Devices → Link with phone number → kodu daxil edin\n\n` + `⏱ 5 dəqiqə ərzində etibarlıdır`,
        { parse_mode: 'Markdown' }
      );
      return;
    } catch (err) {
      const msg = err.message || '';
      LOG.info(`Pairing attempt ${i + 1} failed:`, msg.slice(0, 80));

      if (msg.includes('not authorized') || msg.includes('401') || msg.includes('conflict')) {
        await say(bot, chatId, `❌ Pair uğursuz oldu.\nSəbəb: ${msg}\n\nQR Code üsulunu yoxlayın.`, {
          parse_mode: 'Markdown',
        });
        if (activeConnections[phone]) {
          activeConnections[phone].end(new Error('Pair failed'));
          delete activeConnections[phone];
        }
        if (sessionsData[phone]) sessionsData[phone].status = 'disconnected';
        saveSessionsData();
        return;
      }

      if (msg.includes('Connection Closed') || msg.includes('not open') || msg.includes('timedOut')) {
        await sleep(2000);
        continue;
      }

      await sleep(1500);
    }
  }
}

async function disconnectSession(phone) {
  phone = fmtPhone(phone);
  if (activeConnections[phone]) {
    try {
      activeConnections[phone].end(new Error('User logout'));
    } catch {}
    delete activeConnections[phone];
  }
  try {
    fs.removeSync(sessDir(phone));
  } catch {}
  delete sessionsData[phone];
  saveSessionsData();
  return true;
}

let watchdogStarted = false;
function startConnectionWatchdog() {
  if (watchdogStarted) return;
  watchdogStarted = true;
  LOG.info('Connection watchdog started (every 2 minutes)');
  setInterval(() => {
    for (const [phone, session] of Object.entries(sessionsData)) {
      if ((session.status === 'disconnected' || session.status === 'reconnecting') && !activeConnections[phone]) {
        LOG.info(`[Watchdog] +${phone} is ${session.status}, reconnecting...`);
        connectWithPhone(phone, session.method || 'pair', null, session.chatId || null).catch((e) =>
          LOG.error(`[Watchdog] +${phone} reconnect failed:`, e.message)
        );
      }
      if (session.status === 'connected' && !activeConnections[phone]) {
        LOG.info(`[Watchdog] +${phone} marked connected but no active connection — reconnecting...`);
        sessionsData[phone].status = 'reconnecting';
        saveSessionsData();
        connectWithPhone(phone, session.method || 'pair', null, session.chatId || null).catch((e) =>
          LOG.error(`[Watchdog] +${phone} reconnect failed:`, e.message)
        );
      }
    }
  }, 120000);
}

/** Qoşulmuş bütün soketlər. */
function getSockets() {
  const out = [];
  for (const [phone, session] of Object.entries(sessionsData)) {
    if (session.status === 'connected' && activeConnections[phone]) {
      out.push({ sock: activeConnections[phone], phone });
    }
  }
  return out;
}

/** İlk qoşulmuş soket (tək hesab üçün). */
function getSenderSocket() {
  return getSockets()[0] || null;
}

/**
 * WhatsApp-a mətn göndərir.
 * @param {string} phone
 * @param {string} text
 * @param {string} [jid] — müəyyən JID-a göndərmək üçün
 */
async function sendText(phone, text, jid) {
  const sock = activeConnections[fmtPhone(phone)];
  if (!sock) return { ok: false, error: 'WhatsApp qoşulmayıb' };
  try {
    const target = jid || `${fmtPhone(phone)}@s.whatsapp.net`;
    await sock.sendMessage(target, { text });
    return { ok: true };
  } catch (e) {
    LOG.error('sendMessage failed:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  connectWithPhone,
  disconnectSession,
  startConnectionWatchdog,
  getSenderSocket,
  getSockets,
  sendText,
  onConnected,
  activeConnections,
  sessionsData,
  saveSessionsData,
  SESSIONS_DIR,
};
