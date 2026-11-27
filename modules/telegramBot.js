/**
 * TelegramBot — botun idarəetmə paneli.
 *
 * Bot WhatsApp tərəfdə avtomatik cavab verir, Telegram tərəfdə isə sahib
 * hər şeyi idarə edir:
 *   • cədvəl linklərini dəyişmək (sertifikat / kurs)
 *   • cədvəlləri əl ilə yeniləmək və test etmək
 *   • statistika və son sorğuları görmək
 *   • WhatsApp-a Pair Code / QR ilə qoşulma, çıxış
 *   • avtomatik cavabı, Telegram ötürməsini, rate limiti idarə etmək
 *
 * Təhlükəsizlik: giriş icazəsi (modules/access.js) — ilk şəxsi yazan istifadəçi
 * avtomatik sahib olur.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { makeLogger } = require('./logger');
const { setTelegramMessenger, getTelegramMessenger } = require('./services');
const { sleep } = require('../lib/myfunc');
const wa = require('./whatsappManager');
const sheets = require('./sheetsManager');
const sheetConfig = require('./sheetConfig');
const guards = require('./guards');
const greetingStore = require('./greetingStore');
const settings = require('../settings');
const access = require('./access');
const autoReply = require('./autoReply');
const { KeyedMutex } = require('../lib/chatLock');
const { parseCallback, bypassesLock } = require('../lib/callbacks');
const { withTelegramRetry } = require('../lib/telegramRetry');
const {
  MAIN_MENU_BUTTONS,
  CONNECTION_MENU_BUTTONS,
  sheetMenuButtons,
  SETTINGS_MENU_BUTTONS,
  CANCEL_BUTTON,
  CONFIRM_SAVE_BUTTONS,
  MENU_BUTTON,
  userRestartButton,
  RESTART_ALL_BUTTONS,
  confirmUserRestartButtons,
  CONFIRM_RESTART_ALL_BUTTONS,
} = require('../lib/menu');
const { parseSheetUrl } = require('../lib/sheetUrl');

const LOG = makeLogger('TG');

const BANNER_PATH = path.join(__dirname, '..', 'assets', 'banner.png');

const START_CAPTION = [
  '🤖 *İST Services Dənizcilik Təlim Mərkəzi — Avtomatik Sorğu Botu*',
  '',
  'WhatsApp-a yazılan hər mesaj avtomatik cavablandırılır:',
  '• 📜 Sertifikatın təhvil vəziyyəti',
  '• 🎓 Kurs qeydiyyatı və başlama tarixi',
  '',
  'Cədvəl linklərini, botu və statistikanı buradan idarə edin.',
].join('\n');

const GG_PROMPT = [
  '📲 *WhatsApp-a qoşulma*',
  '',
  'Qoşulmaq istədiyiniz nömrəni ölkə kodu ilə göndərin.',
  '',
  'Format: `994XXXXXXXXX`',
  'Nümunə: `994501234567`',
].join('\n');

const CANCEL_TEXT = '✅ Əməliyyat ləğv edildi.';

let bot = null;
let botToken = null;
let botReady = false;
let creating = false;

// ─── Update dedup ───
const seen = new Map();
const SEEN_TTL_MS = 2 * 60 * 1000;

function isFresh(chatId, messageId) {
  const key = `${chatId}:${messageId}`;
  const now = Date.now();
  if (seen.has(key)) return false;
  seen.set(key, now);
  if (seen.size > 3000) {
    for (const [k, ts] of seen) if (now - ts > SEEN_TTL_MS) seen.delete(k);
  }
  return true;
}

// ─── Axın vəziyyəti (hər Telegram çatı üçün) ───
const flows = new Map(); // chatId -> { flow, kind, pendingUrl }

function getFlow(chatId) {
  return flows.get(String(chatId)) || null;
}

function setFlow(chatId, data) {
  flows.set(String(chatId), data);
}

function clearFlow(chatId) {
  flows.delete(String(chatId));
}

// ─── Public API ───

async function startBot(token) {
  if (creating) {
    LOG.info('Bot creation in progress — duplicate start ignored');
    return;
  }
  if (bot && botReady && botToken === token) {
    LOG.info('Bot already running — duplicate start ignored');
    return;
  }
  creating = true;
  botToken = token;
  process.env.NTBA_FIX_319 = '1';

  try {
    await deleteWebhook(token);
    if (bot) {
      LOG.info('Closing previous bot instance...');
      try {
        await bot.stopPolling();
      } catch {}
      try {
        bot.removeAllListeners();
      } catch {}
      bot = null;
      botReady = false;
    }
    await createBot(token);
  } finally {
    creating = false;
  }
}

async function createBot(token) {
  if (bot) return;
  try {
    const instance = new TelegramBot(token, {
      polling: { interval: 2000, params: { timeout: 30 }, autoStart: false },
    });

    bot = instance;
    registerHandlers(instance);
    setTelegramMessenger(buildMessenger(instance));

    await instance.startPolling();
    botReady = true;
    LOG.info('Telegram Bot started!');
  } catch (err) {
    LOG.error('Create bot error:', err.message);
    if (bot) {
      try {
        bot.removeAllListeners();
      } catch {}
      bot = null;
      botReady = false;
    }
    setTimeout(() => {
      if (!bot) createBot(token);
    }, 10000);
  }
}

function buildMessenger(instance) {
  const call = (fn) => withTelegramRetry(fn);
  return {
    sendText: (chatId, text, opts) => call(() => instance.sendMessage(chatId, text, opts || {})),
    sendPhoto: (chatId, buffer, caption, opts) =>
      call(() => instance.sendPhoto(chatId, buffer, { caption, ...(opts || {}) })),
    editButtons: (chatId, messageId, buttons) =>
      call(() => instance.editMessageReplyMarkup({ inline_keyboard: buttons }, { chat_id: chatId, message_id: messageId })),
    editMessage: (chatId, messageId, text, opts) =>
      call(() => instance.editMessageText(text, { chat_id: chatId, message_id: messageId, ...(opts || {}) })),
    deleteMessage: (chatId, messageId) => instance.deleteMessage(chatId, messageId),
  };
}

// ─── Handler-lər ───

function registerHandlers(instance) {
  instance.on('polling_error', (err) => {
    const msg = err?.message || '';
    if (msg.includes('timeout') || msg.includes('ETIMEOUT') || err?.code === 'ETIMEDOUT') return;

    // Token etibarsızdır — təkrar-tekrar cəhd etmək log spemi yaradır
    if (err?.response?.statusCode === 401 || /401 Unauthorized|ETELEGRAM: 401/i.test(msg)) {
      if (!registerHandlers._authErrorLogged) {
        registerHandlers._authErrorLogged = true;
        LOG.error(
          'Telegram tokeni qəbul edilmədi (401 Unauthorized). TELEGRAM_TOKEN / config.js.token dəyərini yoxlayın — polling dayandırıldı.'
        );
      }
      try {
        instance.stopPolling();
      } catch {}
      return;
    }

    if (err?.code === 'EFATAL' || msg.includes('EFATAL')) {
      LOG.warn('Polling EFATAL — restarting polling in 5s (same instance)');
      setTimeout(async () => {
        if (!bot) return;
        try {
          await bot.stopPolling();
        } catch {}
        try {
          await bot.startPolling();
        } catch (e) {
          LOG.error('Polling restart:', e.message);
        }
      }, 5000);
      return;
    }
    LOG.warn('Polling error:', err?.code, msg);
  });

  instance.on('webhook_error', () => {});

  instance.on('error', (err) => {
    if (err?.message?.includes('timeout') || err?.code === 'ETIMEDOUT') return;
    LOG.warn('Bot error:', err.message);
  });

  instance.on('callback_query', (query) => {
    guardedCallback(query).catch((err) => LOG.error('Callback handler error:', err.message));
  });

  instance.on('message', (msg) => {
    guardedMessage(msg).catch((err) => LOG.error('Message handler error:', err.message));
  });
}

// ─── Giriş nəzarəti + çat üzrə ardıcıl icra ───

const chatLock = new KeyedMutex(120000);

async function replyDenied(chatId, userId) {
  if (!access.shouldNotifyDenied(userId)) return;
  await sendText(chatId, access.deniedText());
}

async function guardedMessage(msg) {
  const chatId = msg?.chat?.id;
  if (!chatId) return;
  const auth = access.authorize(msg.from?.id, { privateChat: msg.chat?.type === 'private' });
  if (!auth.ok) {
    LOG.warn(`Unauthorized message from user ${msg.from?.id} ignored`);
    await replyDenied(chatId, msg.from?.id);
    return;
  }
  if (auth.claimed) await sendText(chatId, access.claimedText());
  if (msg.text?.trim() === '/start' || msg.text?.trim()?.startsWith('/start ')) {
    return routeMessage(msg);
  }
  return chatLock.run(chatId, () => routeMessage(msg));
}

async function safeAnswer(queryId, text, alert = false) {
  if (!bot) return;
  try {
    await bot.answerCallbackQuery(queryId, text ? { text, show_alert: alert } : {});
  } catch {
    /* köhnə callback — əhəmiyyətsiz */
  }
}

async function guardedCallback(query) {
  if (!query?.id) return;
  const chatId = query.message?.chat?.id;
  if (!chatId || typeof query.data !== 'string') {
    await safeAnswer(query.id);
    return;
  }
  if (!access.isAuthorized(query.from?.id)) {
    LOG.warn(`Unauthorized callback from user ${query.from?.id} ignored`);
    await safeAnswer(query.id, '⛔ Giriş icazəniz yoxdur.', true);
    return;
  }
  const parsed = parseCallback(query.data);
  if (!parsed.ok) {
    LOG.warn(`Invalid callback rejected (${parsed.reason})`);
    await safeAnswer(query.id, '⚠️ Bu düymə köhnəlib. /start yazın.', true);
    return;
  }
  await safeAnswer(query.id);
  if (bypassesLock(query.data)) return handleCallback(query, { answered: true });
  return chatLock.run(chatId, () => handleCallback(query, { answered: true }));
}

// ─── Marşrutlaşdırma ───

async function routeMessage(msg) {
  const chatId = msg.chat.id;
  if (!isFresh(chatId, msg.message_id)) {
    LOG.warn(`Dropped duplicate update (chat ${chatId})`);
    return;
  }

  const text = String(msg.text || '').trim();
  if (text) LOG.info(`Message from chat ${chatId} (${text.length} chars)`);

  // /start
  if (/^\/start(@\w+)?(\s|$)/i.test(text)) {
    clearFlow(chatId);
    await sendBanner(chatId);
    return;
  }

  // Əmrlər (axın vəziyyətindən asılı olmayaraq həmişə işləyir)
  const cmd = text.toLowerCase();
  if (cmd === '/help' || cmd === '/yardım' || cmd === '/yardim') {
    await sendHelp(chatId);
    return;
  }
  if (cmd === '/stat' || cmd === '/stats' || cmd === '/statistika') {
    await sendStats(chatId);
    return;
  }
  if (cmd === '/yenilə' || cmd === '/yenile' || cmd === '/refresh') {
    await doRefreshAll(chatId);
    return;
  }
  if (cmd === '/menu' || cmd === '/menyu') {
    await sendMainMenu(chatId);
    return;
  }
  if (cmd === '/users' || cmd === '/istifadəçilər' || cmd === '/restart') {
    await showUsers(chatId);
    return;
  }

  // Axınlarda gözləyən cavablar
  const flow = getFlow(chatId);
  if (flow) {
    if (flow.flow === 'pair') return handlePairInput(chatId, text);
    if (flow.flow === 'sheet_link') return handleSheetLinkInput(chatId, text, flow);
    if (flow.flow === 'sheet_test') return handleSheetTestInput(chatId, text, flow);
  }

  // Tək nömrə → Pair Code axınına keç
  if (/^\+?\d{7,15}$/.test(text.replace(/\s/g, ''))) {
    setFlow(chatId, { flow: 'pair' });
    return handlePairInput(chatId, text);
  }

  await sendText(chatId, '🤖 Əmr tanınmadı. Menyudan istifadə edin və ya /help yazın.', {
    reply_markup: { inline_keyboard: MAIN_MENU_BUTTONS },
  });
}

// ─── Callback işləyicisi ───

async function handleCallback(query, flags = {}) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  if (!flags.answered) await safeAnswer(query.id);
  const data = query.data;

  // ── Statik düymələr ──
  switch (data) {
    case 'menu':
      clearFlow(chatId);
      await setMenu(chatId, messageId, MAIN_MENU_BUTTONS, START_CAPTION);
      return;
    case 'st':
      await showStats(chatId, messageId);
      return;
    case 'rq':
      await showRecent(chatId, messageId);
      return;
    case 'ref':
      await doRefreshAll(chatId, messageId);
      return;
    case 'wa':
      await setMenu(chatId, messageId, CONNECTION_MENU_BUTTONS, '📲 *WhatsApp qoşulma*');
      return;
    case 'pair':
    case 'qr':
      clearFlow(chatId);
      setFlow(chatId, { flow: 'pair', method: data });
      await sendText(chatId, GG_PROMPT, { reply_markup: { inline_keyboard: CANCEL_BUTTON } });
      return;
    case 'out':
      await handleLogout(chatId, messageId);
      return;
    case 'cc':
      try {
        await bot.deleteMessage(chatId, messageId);
      } catch {}
      clearFlow(chatId);
      await sendText(chatId, CANCEL_TEXT, { reply_markup: { inline_keyboard: MAIN_MENU_BUTTONS } });
      return;
    default:
      break;
  }

  // ── Namespace düymələri ──
  if (data.startsWith('shc:') || data.startsWith('shk:')) {
    const kind = data.startsWith('shc:') ? 'certificate' : 'course';
    const action = data.split(':')[1];
    if (action === 'menu') {
      await showSheetMenu(chatId, messageId, kind);
      return;
    }
    if (action === 'lnk') {
      clearFlow(chatId);
      setFlow(chatId, { flow: 'sheet_link', kind });
      await sendText(
        chatId,
        `🔗 *${kind === 'certificate' ? 'Sertifikat' : 'Kurs'} cədvəlinin yeni linkini göndərin.*\n\n` +
          'Link Google Sheets formatında olmalıdır:\n' +
          '`https://docs.google.com/spreadsheets/d/<ID>/edit?gid=<N>`\n\n' +
          '⚠️ Cədvəl "Hər kəsə açıq" (Anyone with the link) olmalıdır — bot məlumatı oxusun.',
        { reply_markup: { inline_keyboard: CANCEL_BUTTON } }
      );
      return;
    }
    if (action === 'ref') {
      await doRefreshOne(chatId, messageId, kind);
      return;
    }
    if (action === 'test') {
      clearFlow(chatId);
      setFlow(chatId, { flow: 'sheet_test', kind });
      await sendText(
        chatId,
        `🧪 *Test:* ${kind === 'certificate' ? 'sertifikat' : 'kurs'} cədvəlində axtarılacaq adı yazın.\n\n` +
          'Nümunə: Əliyev Əli Vəli\n' +
          '(rəqəm yazmayın — test üçün kifayətdir)',
        { reply_markup: { inline_keyboard: CANCEL_BUTTON } }
      );
      return;
    }
    if (action === 'info') {
      await showSheetInfo(chatId, messageId, kind);
      return;
    }
    return;
  }

  if (data === 'sh:save') {
    const flow = getFlow(chatId);
    if (!flow || flow.flow !== 'sheet_link' || !flow.pendingUrl) {
      await safeAnswer(query.id, '⚠️ Link tapılmadı. Yenidən başlayın.', true);
      return;
    }
    await saveSheetLink(chatId, messageId, flow);
    return;
  }

  if (data.startsWith('cf:')) {
    const action = data.split(':')[1];
    if (action === 'menu') {
      await showSettings(chatId, messageId);
      return;
    }
    if (action === 'reply') {
      await toggleSetting(chatId, messageId, 'autoReplyEnabled', '🤖 Avtomatik cavab');
      return;
    }
    if (action === 'fwd') {
      await toggleSetting(chatId, messageId, 'forwardIncoming', '📨 Telegram ötürmə');
      return;
    }
    if (action === 'priv') {
      await toggleSetting(chatId, messageId, 'privateOnly', '👤 Yalnız fərdi chat');
      return;
    }
    if (action === 'phone') {
      await toggleSetting(chatId, messageId, 'waPhoneCheck', '📱 Nömrə yoxlaması');
      return;
    }
    if (action === 'rate') {
      await showRateLimit(chatId, messageId);
      return;
    }
  }

  // ── İstifadəçilər: siyahı + qarşılama statusunun sıfırlanması (Restart) ──
  if (data.startsWith('us:')) {
    const [, action, arg] = data.split(':');
    if (action === 'menu') {
      await showUsers(chatId, messageId);
      return;
    }
    if (action === 'rst') {
      await sendText(
        chatId,
        `🔄 *+${arg}* üçün qarşılama statusu sıfırlansın?\n\n` +
          'Bu istifadəçinin növbəti mesajında qarşılama mesajı yenidən göndəriləcək.\n' +
          '_Digər istifadəçilərin qarşılama statusu dəyişməyəcək._',
        { reply_markup: { inline_keyboard: confirmUserRestartButtons(arg) } }
      );
      return;
    }
    if (action === 'rstok') {
      const ok = greetingStore.reset(arg);
      const text = ok
        ? `✅ *+${arg}* üçün qarşılama statusu sıfırlandı.\n\nNövbəti mesajında qarşılama mesajı yenidən göndəriləcək.`
        : `⚠️ *+${arg}* tapılmadı — heç bir mesaj qeydə alınmayıb.`;
      await showUsers(chatId, messageId, text);
      return;
    }
    if (action === 'all') {
      await sendText(
        chatId,
        '🔄 *Bütün istifadəçilərin* qarşılama statusu sıfırlansın?\n\n' +
          'Bu əməliyyat hər WhatsApp istifadəçisinin qarşılama mesajını sıfırlayır — ' +
          'növbəti mesajlarında qarşılama yenidən göndəriləcək.',
        { reply_markup: { inline_keyboard: CONFIRM_RESTART_ALL_BUTTONS } }
      );
      return;
    }
    if (action === 'allok') {
      const count = greetingStore.resetAll();
      await showUsers(
        chatId,
        messageId,
        `✅ Ümumi restart — ${count} istifadəçinin qarşılama statusu sıfırlandı.\n\n` +
          'Növbəti mesajlarında qarşılama mesajı yenidən göndəriləcək.'
      );
      return;
    }
  }
}

// ─── Ekranlar ───

async function sendMainMenu(chatId) {
  await sendText(chatId, START_CAPTION, { reply_markup: { inline_keyboard: MAIN_MENU_BUTTONS } });
}

async function sendBanner(chatId) {
  const m = getTelegramMessenger();
  if (!m) return null;
  try {
    if (fs.existsSync(BANNER_PATH)) {
      const buffer = fs.readFileSync(BANNER_PATH);
      return await m.sendPhoto(chatId, buffer, START_CAPTION, {
        reply_markup: { inline_keyboard: MAIN_MENU_BUTTONS },
      });
    }
  } catch (e) {
    LOG.error('sendBanner failed:', e.message);
  }
  return sendMainMenu(chatId);
}

/** Menyunu verilmiş mesajın üzərində göstərir, alınmasa yeni mesaj göndərir. */
async function setMenu(chatId, messageId, buttons, caption) {
  const m = getTelegramMessenger();
  if (!m) return;
  if (messageId) {
    try {
      await m.editMessage(chatId, messageId, caption || '🎛 Menyu:', { reply_markup: { inline_keyboard: buttons } });
      return;
    } catch (e) {
      LOG.warn('editMenu failed, resending:', e.message);
    }
  }
  try {
    await m.sendText(chatId, caption || '🎛 Menyu:', { reply_markup: { inline_keyboard: buttons } });
  } catch (e) {
    LOG.error('setMenu failed:', e.message);
  }
}

/** Timestamp → "27.11.2026 14:32" (müəyyən edilmiş saat qurşağı). */
function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('az-AZ', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: settings.reportTimezone,
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
  } catch {
    return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
  }
}

async function showStats(chatId, messageId) {
  const s = guards.getStats();
  const sheetStatus = sheets.getStatus();
  const { formatDuration } = require('../lib/myfunc');

  const cert = sheetStatus.certificate;
  const course = sheetStatus.course;

  const lines = [
    '📊 *Statistika*',
    '',
    `⏱ İş vaxtı: ${formatDuration(s.uptimeMs)}`,
    `📥 Gələn mesaj: ${s.received}`,
    `🤖 Göndərilən cavab: ${s.replied}`,
    '',
    `📜 Sertifikat sorğusu: ${s.certificateQueries}`,
    `🎓 Kurs sorğusu: ${s.courseQueries}`,
    `❌ Tapılmadı: ${s.notFound}`,
    `⚠️ Ad uyğun gəlmədi: ${s.ambiguous}`,
    `🔒 Bloklanan sorğu: ${s.blocked}`,
    `🚦 Rate limit: ${s.rateLimited}`,
    `⛔ Blok listi: ${s.blockedSkipped}`,
    `⚠️ Göndərmə xətası: ${s.errors}`,
    '',
    `📜 *Sertifikat cədvəli:* ${cert.size} sətir`,
    `   Son yeniləmə: ${fmtDateTime(cert.updatedAt)}`,
    cert.error ? `   ⚠️ ${cert.error}` : '   ✅ Problemsiz',
    '',
    `🎓 *Kurs cədvəli:* ${course.size} sətir`,
    `   Son yeniləmə: ${fmtDateTime(course.updatedAt)}`,
    course.error ? `   ⚠️ ${course.error}` : '   ✅ Problemsiz',
  ];

  await setMenu(chatId, messageId, MAIN_MENU_BUTTONS, lines.join('\n'));
}

async function showRecent(chatId, messageId) {
  const list = guards.getRecent(10);
  const lines = ['📋 *Son sorğular*', ''];
  if (!list.length) {
    lines.push('Hələlik heç bir sorğu qeydə alınmayıb.');
  } else {
    for (const r of list) {
      lines.push(`🕐 ${fmtDateTime(new Date(r.at).toISOString())} — ${r.from}`);
      lines.push(`   💬 ${r.text ? r.text.slice(0, 80) : `(${r.kind})`}`);
      lines.push(`   ➜ ${r.summary}`);
      lines.push('');
    }
  }
  await setMenu(chatId, messageId, MAIN_MENU_BUTTONS, lines.join('\n').trim());
}

async function showSheetMenu(chatId, messageId, kind) {
  const url = sheetConfig.get(kind);
  const label = kind === 'certificate' ? '📜 Sertifikat cədvəli' : '🎓 Kurs cədvəli';
  const parsed = parseSheetUrl(url);
  const st = sheets.getStatus()[kind];

  const lines = [
    `*${label}*`,
    '',
    parsed ? `🆔 ID: \`${parsed.id}\`` : '🔗 Link təyin edilməyib',
    parsed ? `📑 Səhifə (gid): \`${parsed.gid}\`` : '',
    `📊 Sətirlər: ${st.size}`,
    `🕒 Son yeniləmə: ${fmtDateTime(st.updatedAt)}`,
    st.error ? `⚠️ Xəta: ${st.error}` : '✅ Status: problemsiz',
    '',
    kind === 'certificate'
      ? 'Bu cədvəl sertifikat təhvil vəziyyətini saxlayır (yaşıl = təhvil verilib, qırmızı = təhvil verilməyib).'
      : 'Bu cədvəl kurs qeydiyyatlarını və təlim başlama tarixlərini saxlayır.',
  ].filter(Boolean);

  await setMenu(chatId, messageId, sheetMenuButtons(kind), lines.join('\n'));
}

async function showSheetInfo(chatId, messageId, kind) {
  const url = sheetConfig.get(kind);
  const parsed = parseSheetUrl(url);
  const label = kind === 'certificate' ? 'Sertifikat' : 'Kurs';
  const lines = [
    `🔎 *${label} cədvəli — təfərrüatlar*`,
    '',
    `🔗 Link: ${url || '—'}`,
    parsed ? `🆔 Sheet ID: \`${parsed.id}\`` : '',
    parsed ? `📑 gid: \`${parsed.gid}\`` : '',
    parsed ? `📄 CSV: ${require('../lib/sheetUrl').buildCsvUrl(parsed.id, parsed.gid)}` : '',
  ].filter(Boolean);
  await setMenu(chatId, messageId, sheetMenuButtons(kind), lines.join('\n'));
}

/**
 * WhatsApp istifadəçiləri — nömrə, qarşılama statusu, son mesaj tarixi
 * və hər istifadəçi üçün fərdi "Restart" düyməsi (sənəd §5, §8).
 *
 * @param {string|number} chatId
 * @param {number} [messageId]
 * @param {string} [prefix] — əməliyyatdan sonra göstərilən mətn
 */
async function showUsers(chatId, messageId, prefix = '') {
  const users = greetingStore.list();

  // Sessiyası olan, amma qeyd faylında olmayan nömrələri də göstər
  const known = new Set(users.map((u) => u.phone));
  for (const raw of Object.keys(wa.sessionsData || {})) {
    const key = String(raw).replace(/\D/g, '');
    if (key && !known.has(key)) {
      known.add(key);
      users.push({ phone: key, greeted: false, lastMessageAt: null, lastKind: null });
    }
  }

  const lines = [];
  if (prefix) lines.push(prefix, '');
  lines.push('👥 *WhatsApp istifadəçiləri*', '', `Cəmi: ${users.length}`, '');

  if (!users.length) {
    lines.push('Hələlik heç bir istifadəçi qeydə alınmayıb.');
    lines.push('');
    lines.push('WhatsApp-a qoşulduqdan sonra gələn mesajlar burada görünəcək.');
  } else {
    for (const u of users.slice(0, 20)) {
      lines.push(`${u.greeted ? '✅' : '🔄'} *+${u.phone}*`);
      lines.push(`   Qarşılama: ${u.greeted ? 'göndərilib' : 'göndərilməyib'}`);
      lines.push(`   Son mesaj: ${fmtDateTime(u.lastMessageAt)}`);
    }
    if (users.length > 20) lines.push(`… və ${users.length - 20} istifadəçi daha`);
  }

  lines.push('');
  lines.push('_Restart — seçilmiş istifadəçinin qarşılama statusunu sıfırlayır: növbəti mesajında qarşılama mesajı yenidən göndərilir._');

  const keyboard = users.slice(0, 20).flatMap((u) => userRestartButton(u.phone));
  keyboard.push(...RESTART_ALL_BUTTONS);

  await setMenu(chatId, messageId, keyboard, lines.join('\n'));
}

async function showSettings(chatId, messageId) {
  const on = (v) => (v ? '✅ Aktiv' : '⛸️ Qapalı');
  const lines = [
    '⚙️ *Ayarlar*',
    '',
    `🤖 Avtomatik cavab: ${on(settings.autoReplyEnabled)}`,
    `📨 Telegram ötürmə: ${on(settings.forwardIncoming)}`,
    `👤 Yalnız fərdi chat: ${on(settings.privateOnly)}`,
    `📱 Nömrə yoxlaması: ${on(settings.waPhoneCheck)}`,
    `🚦 Rate limit: ${settings.rateLimitPerMin} mesaj / ${settings.rateLimitWindowMin} dəqiqə`,
    `⏱ Cədvəl yeniləməsi: hər ${sheets.getStatus().refreshIntervalMin} dəqiqə`,
    '',
    'Düyməyə basaraq dəyişə bilərsiniz.',
    '_Bu parametrlər bot işlədiyi müddətdə qüvvədədir; restart etdikdə .env / environment dəyəri ilə əvəzlənir._',
  ];
  await setMenu(chatId, messageId, SETTINGS_MENU_BUTTONS, lines.join('\n'));
}

async function toggleSetting(chatId, messageId, key, label) {
  settings[key] = !settings[key];
  LOG.info(`Setting ${key} → ${settings[key]}`);
  const icon = settings[key] ? '✅' : '⛸️';
  await setMenu(chatId, messageId, SETTINGS_MENU_BUTTONS, `⚙️ *Ayarlar*\n\n${icon} ${label}: ${settings[key] ? 'Aktiv' : 'Qapalı'}`);
}

async function showRateLimit(chatId, messageId) {
  const lines = [
    '🚦 *Rate limit*',
    '',
    `Məhdud: ${settings.rateLimitPerMin} mesaj / ${settings.rateLimitWindowMin} dəqiqə`,
    '',
    'Limit aşıldıqda bot cavab göndərmir (spam qarşısı).',
  ];
  await setMenu(chatId, messageId, SETTINGS_MENU_BUTTONS, lines.join('\n'));
}

// ─── Əməliyyatlar ───

async function doRefreshAll(chatId, messageId) {
  const pending = await sendText(chatId, '🔄 Cədvəllər yenilənir...');
  const res = await sheets.refreshAll();
  const lines = ['🔄 *Cədvəl yenilənməsi*', ''];
  lines.push(
    res.certificate?.ok
      ? `📜 Sertifikat: ✅ ${res.certificate.count} sətir`
      : `📜 Sertifikat: ❌ ${res.certificate?.error || 'xəta'}`
  );
  lines.push(
    res.course?.ok ? `🎓 Kurs: ✅ ${res.course.count} sətir` : `🎓 Kurs: ❌ ${res.course?.error || 'xəta'}`
  );
  if (messageId) {
    try {
      if (pending?.message_id) await bot.deleteMessage(chatId, pending.message_id);
    } catch {}
  }
  await setMenu(chatId, messageId, MAIN_MENU_BUTTONS, lines.join('\n'));
}

async function doRefreshOne(chatId, messageId, kind) {
  const res = kind === 'certificate' ? await sheets.refreshCertificate() : await sheets.refreshCourse();
  const label = kind === 'certificate' ? '📜 Sertifikat cədvəli' : '🎓 Kurs cədvəli';
  const text = res.ok ? `${label}: ✅ Yeniləndi — ${res.count} sətir` : `${label}: ❌ ${res.error}`;
  await setMenu(chatId, messageId, sheetMenuButtons(kind), text);
}

async function saveSheetLink(chatId, messageId, flow) {
  const kind = flow.kind;
  const url = flow.pendingUrl;
  sheetConfig.set(kind, url);
  LOG.info(`Sheet link updated (${kind})`);

  const res = kind === 'certificate' ? await sheets.refreshCertificate() : await sheets.refreshCourse();
  const label = kind === 'certificate' ? '📜 Sertifikat cədvəli' : '🎓 Kurs cədvəli';
  const lines = [
    '✅ *Link saxlanıldı*',
    '',
    `${label}: ${url}`,
    res.ok ? `Məlumat yükləndi: ${res.count} sətir` : `⚠️ Yüklənmə xətası: ${res.error}`,
  ];
  clearFlow(chatId);
  await setMenu(chatId, messageId, sheetMenuButtons(kind), lines.join('\n'));
}

async function handleSheetLinkInput(chatId, text, flow) {
  const parsed = parseSheetUrl(text);
  if (!parsed) {
    await sendText(
      chatId,
      '❌ Link tanınmadı.\n\nDüzgün format:\n`https://docs.google.com/spreadsheets/d/<ID>/edit?gid=<N>`',
      { reply_markup: { inline_keyboard: CANCEL_BUTTON } }
    );
    return;
  }
  setFlow(chatId, { ...flow, pendingUrl: text.trim() });
  await sendText(
    chatId,
    `🔗 *Yeni link:*\n` +
      `Sheet ID: \`${parsed.id}\`\n` +
      `Səhifə (gid): \`${parsed.gid}\`\n\n` +
      'Bu linki saxlamaq istəyirsiniz?',
    { reply_markup: { inline_keyboard: CONFIRM_SAVE_BUTTONS } }
  );
}

async function handleSheetTestInput(chatId, text, flow) {
  const store = flow.kind === 'certificate' ? sheets.certificateStore : sheets.courseStore;
  if (!store.size) {
    await sendText(chatId, '⚠️ Cədvəl hələ yüklənməyib. Əvvəlcə "🔄 Yenilə" edin.', {
      reply_markup: { inline_keyboard: sheetMenuButtons(flow.kind) },
    });
    return;
  }
  const result = store.find(text);
  const label = flow.kind === 'certificate' ? 'sertifikat' : 'kurs';

  if (!result.found) {
    const extra = result.ambiguous ? `\n\nMümkün uyğunlar:\n${result.candidates.slice(0, 6).map((c) => `• ${c}`).join('\n')}` : '';
    await sendText(chatId, `❌ "${text}" üzrə ${label} tapılmadı.${extra}`, {
      reply_markup: { inline_keyboard: sheetMenuButtons(flow.kind) },
    });
    return;
  }
  const preview = result.records.slice(0, 5).map((r) => {
    if (flow.kind === 'certificate') {
      return `• ${r.courseName} — ${r.status === 'delivered' ? 'Təhvil verilib' : 'Təhvil verilməyib'} (№ ${r.certNo || '—'})`;
    }
    return `• ${r.courseName} — ${r.hasDate ? r.startDate : 'tarix qeyd olunmayıb'}`;
  });
  await sendText(
    chatId,
    `🧪 *Test nəticəsi* (${result.matchType})\n\n${preview.join('\n')}` +
      (result.records.length > 5 ? `\n\n… və ${result.records.length - 5} qeyd daha` : ''),
    { reply_markup: { inline_keyboard: sheetMenuButtons(flow.kind) } }
  );
}

async function handlePairInput(chatId, text) {
  const flow = getFlow(chatId);
  const method = flow?.method === 'qr' ? 'qr' : 'pair';
  const phone = String(text || '').replace(/[^0-9]/g, '');
  if (!phone || phone.length < 7 || phone.length > 15) {
    await sendText(chatId, '❌ Yanlış nömrə formatı.\n\nDüzgün format: `994XXXXXXXXX`\nNümunə: `994501234567`', {
      reply_markup: { inline_keyboard: CANCEL_BUTTON },
    });
    return;
  }
  clearFlow(chatId);
  try {
    await wa.connectWithPhone(phone, method, bot, chatId);
  } catch (err) {
    LOG.error('Pair error:', err.message);
  }
}

async function handleLogout(chatId, messageId) {
  const entries = Object.entries(wa.sessionsData || {});
  if (entries.length === 0) {
    await setMenu(chatId, messageId, MAIN_MENU_BUTTONS, '❌ Silinəcək sessiya yoxdur.');
    return;
  }
  for (const [phone] of entries) {
    try {
      await wa.disconnectSession(phone);
      LOG.info('Logged out +' + phone);
    } catch (err) {
      LOG.error('Logout error +' + phone, err.message);
    }
  }
  await setMenu(chatId, messageId, MAIN_MENU_BUTTONS, '✅ Bütün WhatsApp sessiyaları təmizləndi.');
}

async function sendHelp(chatId) {
  const lines = [
    'ℹ️ *Bot komandaları*',
    '',
    '/start — menyunu aç',
    '/stat — statistika',
    '/yenile — cədvəlləri yenilə',
    '/users — istifadəçilər və qarşılama statusu (Restart)',
    '/menu — menyunu aç',
    '',
    '*Düymələr:*',
    '📜 Sertifikat cədvəli — linki dəyiş / yenilə / test et',
    '🎓 Kurs cədvəli — linki dəyiş / yenilə / test et',
    '📲 WhatsApp qoşulma — Pair Code / QR Code',
    '👥 İstifadəçilər — siyahı, qarşılama statusu, Restart',
    '⚙️ Ayarlar — avtomatik cavab, ötürmə, rate limit',
  ];
  await sendText(chatId, lines.join('\n'), { reply_markup: { inline_keyboard: MAIN_MENU_BUTTONS } });
}

// ─── Köməkçilər ───

async function sendText(chatId, text, opts) {
  const m = getTelegramMessenger();
  if (!m) return null;
  try {
    return await m.sendText(chatId, text, opts || {});
  } catch (e) {
    LOG.error('sendMessage failed:', e.message);
    return null;
  }
}

function deleteWebhook(token) {
  return new Promise((resolve) => {
    try {
      const req = https.get(
        `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`,
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const r = JSON.parse(data);
              if (r.ok) LOG.info('Webhook cleared');
            } catch {}
            resolve();
          });
        }
      );
      req.on('error', () => resolve());
      req.setTimeout(5000, () => {
        req.destroy();
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

async function stopBot() {
  if (!bot) return;
  try {
    await bot.stopPolling();
  } catch {}
  botReady = false;
}

module.exports = {
  startBot,
  stopBot,
  getBot: () => bot,
  isFresh,
  routeMessage,
  handleCallback,
  guardedMessage,
  guardedCallback,
  fmtDateTime,
};
