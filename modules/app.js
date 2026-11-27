/**
 * app — layihənin ortaq başlatma məntiqi.
 *
 * Həm `index.js`, həm də `bot.js` bu modulu çağırır:
 *   1) Express health server (Railway/Render üçün)
 *   2) Telegram botu (idarəetmə paneli)
 *   3) Snapshot-ların yüklənməsi + cədvəllərin ilk dəfə çəkilməsi
 *   4) Əvvəlki WhatsApp sessiyalarının avtomatik bərpası
 *   5) Saatlıq cədvəl yeniləməsi
 *
 * ⚙️ Ətraf mühit dəyişənləri İSTEĞEYƏ BAĞLIDIR — bütün defoltlar
 *     settings.js/config.js fayllarında saxlanılır.
 */
const path = require('path');
const express = require('express');
const fs = require('fs-extra');
const { makeLogger } = require('./logger');

const LOG = makeLogger('APP');

const TEMP_DIR = path.join(__dirname, '..', 'temp');

/** Temp qovluğunu hazırlayır (Baileys üçün tənzimləyici). */
function setupTemp() {
  fs.ensureDirSync(TEMP_DIR);
  process.env.TMPDIR = TEMP_DIR;
  process.env.TEMP = TEMP_DIR;
  process.env.TMP = TEMP_DIR;
}

/**
 * Health serveri qaldırır.
 * @param {object} status — canlı vəziyyət obyekti
 */
function createHealthServer(status) {
  const app = express();

  app.get('/', (req, res) => res.send('✅ İST Services Dənizcilik Təlim Mərkəzi botu işləyir!'));
  app.get('/health', (req, res) => {
    status.uptime = process.uptime();
    res.json(status);
  });

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, '0.0.0.0', () => {
    LOG.info(`Server listening on port ${PORT}`);
    status.status = 'running';
  });
  server.timeout = 120000;
  server.keepAliveTimeout = 65000;
  return server;
}

/** Əvvəlki WhatsApp sessiyalarını bərpa edir. */
async function autoReconnect(wa) {
  const sessionsData = wa.sessionsData || {};
  const sessionsDir = path.join(__dirname, '..', 'sessions');
  let reconnected = false;

  for (const [phone, session] of Object.entries(sessionsData)) {
    if (['connected', 'reconnecting', 'disconnected'].includes(session.status)) {
      LOG.info(`Auto-reconnecting to +${phone}...`);
      try {
        await wa.connectWithPhone(phone, session.method || 'pair', null, session.chatId || null);
        reconnected = true;
      } catch (e) {
        LOG.error(`Reconnect failed for +${phone}:`, e.message);
      }
    }
  }

  try {
    if (fs.existsSync(sessionsDir)) {
      const dirs = fs.readdirSync(sessionsDir);
      for (const dir of dirs) {
        if (dir === 'sessions.json' || dir.startsWith('.')) continue;
        const authPath = path.join(sessionsDir, dir, 'creds.json');
        if (fs.existsSync(authPath)) {
          const phone = dir.replace(/[^0-9]/g, '');
          if (phone && (!sessionsData[phone] || sessionsData[phone]?.status !== 'connected')) {
            if (!sessionsData[phone]) sessionsData[phone] = { phone, status: 'reconnecting' };
            else sessionsData[phone].status = 'reconnecting';
            wa.saveSessionsData();
            LOG.info(`Found stored auth for ${dir}, reconnecting...`);
            try {
              await wa.connectWithPhone(phone, 'pair', null, sessionsData[phone]?.chatId || null);
              reconnected = true;
            } catch (e) {
              LOG.error(`Reconnect failed for ${dir}:`, e.message);
            }
          }
        }
      }
    }
  } catch (e) {
    LOG.warn('No sessions to auto-reconnect:', e.message);
  }

  if (!reconnected) LOG.info('Əvvəlki WhatsApp sessiyası tapılmadı. Telegram-dan qoşulun.');
  return reconnected;
}

/**
 * Botu işə salır.
 *
 * @param {{telegram?: boolean, whatsapp?: boolean, health?: boolean}} [options]
 * @returns {Promise<object>} { status, server, stop }
 */
async function startApp(options = {}) {
  const { telegram = true, whatsapp = true, health = true } = options;

  setupTemp();

  const status = { status: 'starting', uptime: 0, telegram: false, whatsapp: 0, sheets: {} };
  let server = null;
  if (health) server = createHealthServer(status);

  try {
    const settings = require('../settings');
    const tgBot = require('./telegramBot');
    const sheets = require('./sheetsManager');
    const sheetConfig = require('./sheetConfig');
    const waDispatcher = require('./waDispatcher');

    const TELEGRAM_TOKEN = settings.telegramToken;

    if (telegram) {
      if (!TELEGRAM_TOKEN) {
        LOG.error(
          'Telegram token tapılmadı! config.js faylında telegramToken sahəsini doldurun ' +
            '(və ya TELEGRAM_TOKEN mühit dəyişənini təyin edin).'
        );
      } else {
        if (settings.allowAllUsers) {
          LOG.warn('ALLOW_ALL_USERS=true — hər kəs botu idarə edə bilər.');
        } else if (settings.allowedTelegramIds.length > 0) {
          LOG.info(`Giriş nəzarəti: ${settings.allowedTelegramIds.length} icazəli istifadəçi`);
        } else {
          LOG.info('Giriş nəzarəti: botda ilk şəxsi çatda yazan istifadəçi avtomatik sahib olacaq.');
        }

        tgBot.startBot(TELEGRAM_TOKEN);
        LOG.info('Telegram bot started');
        status.telegram = true;
      }
    }

    // Cədvəl hadisələrini Telegram-a bildir
    const updateSheetHealth = () => {
      try {
        const st = sheets.getStatus();
        status.sheets = {
          certificate: { rows: st.certificate.size, updatedAt: st.certificate.updatedAt, error: st.certificate.error },
          course: { rows: st.course.size, updatedAt: st.course.updatedAt, error: st.course.error },
        };
      } catch {}
    };
    updateSheetHealth();
    setInterval(updateSheetHealth, 60000);

    if (telegram) {
      sheets.onEvent(async (event) => {
        if (!event || event.type !== 'refresh') return;
        updateSheetHealth();
        const access = require('./access');
        const chatId = access.getOwnerChatId();
        if (!chatId) return;
        const label = event.kind === 'certificate' ? '📜 Sertifikat cədvəli' : '🎓 Kurs cədvəli';
        try {
          await tgBot.getBot()?.sendMessage(
            chatId,
            event.ok
              ? `🔄 ${label} yeniləndi — ${event.count} sətir`
              : `⚠️ ${label} yenilənmədi: ${event.error}`
          );
        } catch {}
      });
    }

    // Cədvəllər: snapshot + ilk yükləmə
    setTimeout(async () => {
      try {
        sheets.restoreSnapshots();
        const res = await sheets.refreshAll();
        if (res.certificate?.ok) LOG.info(`Sertifikat cədvəli: ${res.certificate.count} sətir`);
        if (res.course?.ok) LOG.info(`Kurs cədvəli: ${res.course.count} sətir`);
      } catch (e) {
        LOG.error('Cədvəl yükləmə xətası:', e.message);
      }
      sheets.startScheduler();
    }, 2000);

    if (whatsapp) {
      const wa = require('./whatsappManager');

      // Əvvəlki WhatsApp sessiyalarını bərpa et
      setTimeout(async () => {
        try {
          await autoReconnect(wa);
        } catch (e) {
          LOG.error('Auto-reconnect:', e.message);
        }
      }, 4000);

      // WhatsApp qoşulanda auto-reply listener-ni qur
      wa.onConnected((phone, sock) => {
        try {
          waDispatcher.attach(sock, phone);
          status.whatsapp += 1;
        } catch (e) {
          LOG.error('Auto-reply attach error:', e.message);
        }
      });

      wa.startConnectionWatchdog();
    }

    // Temp təmizləmə
    setInterval(() => {
      try {
        const maxAge = settings.tempFileMaxAgeMin * 60 * 1000;
        const now = Date.now();
        for (const f of fs.readdirSync(TEMP_DIR)) {
          try {
            const fp = path.join(TEMP_DIR, f);
            const st = fs.statSync(fp);
            if (st.isFile() && now - st.mtimeMs > maxAge) fs.unlinkSync(fp);
          } catch {}
        }
      } catch {}
    }, 300000);

    LOG.info(`Bot işləyir! ${settings.name} — v${settings.version}`);
    try {
      const { parseSheetUrl } = require('../lib/sheetUrl');
      const ids = Object.entries(sheetConfig.all())
        .map(([kind, url]) => {
          const p = parseSheetUrl(url);
          return `${kind}: ${p ? p.id : 'təyin edilməyib'}`;
        })
        .join(' | ');
      LOG.info(`Cədvəl ID-ləri — ${ids}`);
    } catch {}
  } catch (err) {
    LOG.error('Startup error:', err.message, err.stack);
  }

  return {
    status,
    server,
    async stop(signal = 'stop') {
      await gracefulShutdown(signal, server);
    },
  };
}

// ─── Graceful shutdown ───
let shuttingDown = false;

async function gracefulShutdown(signal, server) {
  if (shuttingDown) return;
  shuttingDown = true;
  LOG.info(`${signal} received — shutting down...`);
  try {
    server?.close();
  } catch {}
  try {
    const wa = require('./whatsappManager');
    wa.saveSessionsData();
    await Promise.race([
      require('./telegramBot').stopBot(),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    for (const [, sock] of Object.entries(wa.activeConnections || {})) {
      try {
        sock?.end(new Error('Shutdown'));
      } catch {}
    }
  } catch (e) {
    LOG.error('Shutdown error:', e.message);
  }
  process.exit(0);
}

/** Siqnal handler-lərini qeydiyyata alır. */
function registerSignalHandlers() {
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('uncaughtException', (err) => LOG.error('Uncaught:', err.message, err.stack));
  process.on('unhandledRejection', (reason) => LOG.error('Unhandled:', reason?.message || reason));
}

module.exports = { startApp, createHealthServer, setupTemp, autoReconnect, registerSignalHandlers, gracefulShutdown };
