/**
 * waDispatcher — WhatsApp-dan gələn mesajları qəbul edib avtomatik cavab verir.
 *
 * Axın:
 *   Gələn mesaj → təkrar yoxlaması (dedup) → filtrlər (özümüz, qrup, status)
 *               → blok listi / rate limit → nömrə üzrə növbə (kilid)
 *               → qarşılama? (hər istifadəçiyə YALNIZ BİR DƏFƏ)
 *               → autoReply.buildReply() → WhatsApp-a göndərmə
 *               → Telegram-a monitorinq üçün ötürmə
 */
const { makeLogger } = require('./logger');
const { getTelegramMessenger } = require('./services');
const settings = require('../settings');
const autoReply = require('./autoReply');
const guards = require('./guards');
const greetingStore = require('./greetingStore');
const wa = require('./whatsappManager');
const access = require('./access');
const { KeyedMutex } = require('../lib/chatLock');

const LOG = makeLogger('WA-REPLY');

/** Eyni nömrədən gələn mesajlar növbə ilə emal olunur (qarışmamaq üçün). */
const phoneLocks = new KeyedMutex(120000);

/** ─── Təkrar (dedup) ───
 * Eyni mesaj iki dəfə emal olunmamalıdır (sənəd §9). */
const processed = new Map();
const DEDUP_TTL_MS = 10 * 60 * 1000;
const DEDUP_MAX = 5000;

/**
 * @param {string} key — mesajın unikal açarı
 * @returns {boolean} true = ilk dəfədir (emal olunmalıdır)
 */
function isFresh(key) {
  if (!key) return true;
  const now = Date.now();
  if (processed.has(key)) return false;
  processed.set(key, now);
  if (processed.size > DEDUP_MAX) {
    for (const [k, ts] of processed) if (now - ts > DEDUP_TTL_MS) processed.delete(k);
  }
  return true;
}

/** Mesajın unikal açarı (Baileys id, yoxdursa məzmun+vaxt). */
function messageKey(msg, remote) {
  const id = msg?.key?.id;
  if (id) return String(id);
  const ts = msg?.messageTimestamp ? Number(msg.messageTimestamp) : 0;
  return `${remote}:${ts}:${String(msg?.message?.conversation || '').slice(0, 40)}`;
}

/** Mesajın mətnini və növünü çıxarır. */
function extract(msg) {
  const m = msg?.message;
  if (!m) return null;

  // Müvəqqəti/zərfli mesajları aç
  let depth = 0;
  let cur = m;
  while (depth < 6) {
    if (cur.ephemeralMessage?.message) cur = cur.ephemeralMessage.message;
    else if (cur.viewOnceMessage?.message) cur = cur.viewOnceMessage.message;
    else if (cur.viewOnceMessageV2?.message) cur = cur.viewOnceMessageV2.message;
    else if (cur.documentWithCaptionMessage?.message) cur = cur.documentWithCaptionMessage.message;
    else if (cur.viewOnceMessageV2Extension?.message) cur = cur.viewOnceMessageV2Extension.message;
    else break;
    depth += 1;
  }

  if (typeof cur.conversation === 'string' && cur.conversation.trim()) {
    return { text: cur.conversation.trim(), kind: 'text' };
  }
  if (cur.extendedTextMessage?.text?.trim()) {
    return { text: cur.extendedTextMessage.text.trim(), kind: 'text' };
  }
  if (cur.imageMessage) {
    return { text: String(cur.imageMessage.caption || '').trim(), kind: 'image' };
  }
  if (cur.videoMessage) {
    return { text: String(cur.videoMessage.caption || '').trim(), kind: 'video' };
  }
  if (cur.documentMessage) {
    return { text: String(cur.documentMessage.caption || '').trim(), kind: 'document' };
  }
  if (cur.audioMessage) {
    return { text: '', kind: 'voice' };
  }
  if (cur.stickerMessage) return { text: '', kind: 'sticker' };
  if (cur.contactMessage) return { text: '', kind: 'contact' };
  if (cur.locationMessage) return { text: '', kind: 'location' };
  if (cur.contactArrayMessage) return { text: '', kind: 'contact' };
  if (cur.buttonsResponseMessage?.selectedButtonText) {
    return { text: String(cur.buttonsResponseMessage.selectedButtonText).trim(), kind: 'text' };
  }
  if (cur.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return { text: String(cur.listResponseMessage.singleSelectReply.selectedRowId).trim(), kind: 'text' };
  }
  if (cur.reactionMessage) return null;
  return { text: '', kind: 'other' };
}

/** Nəticənin qısa izahı (Telegram monitorinqi üçün). */
function resultSummary(result) {
  switch (result.kind) {
    case 'certificate':
      return `✅ Sertifikat tapıldı — ${result.records?.length || 0} qeyd`;
    case 'course':
      return `✅ Kurs qeydiyyatı tapıldı — ${result.records?.length || 0} qeyd`;
    case 'ambiguous':
      return '⚠️ Bir neçə uyğun şəxs tapıldı — ad dəqiqləşdirilməli';
    case 'not_found':
      return '❌ Məlumat tapılmadı';
    case 'not_ready':
      return '⏳ Məlumat bazası hələ yüklənməyib';
    case 'sensitive_query':
      return '🔒 Şəxsi identifikatorla sorğu — axtarış aparılmadı';
    case 'identity_mismatch':
      return '🔒 Nömrə ilə əlaqələndirmə uyğun gəlmədi — məlumat açılmadı';
    case 'voice':
      return '🎙 Səsli mesaj — yazı ilə cavab verildi';
    case 'media':
      return '📎 Fayl məzmunu axtarılmadı';
    case 'greeting':
      return '👋 Qarşılama mesajı göndərildi';
    case 'format_help':
      return 'ℹ️ Format yardımı göndərildi';
    default:
      return 'ℹ️ Giriş mesajı göndərildi';
  }
}

/** Telegram-a ötürmə. */
async function forwardToTelegram(phone, remote, pushName, extracted, result) {
  if (!settings.forwardIncoming) return;
  const messenger = getTelegramMessenger();
  if (!messenger || typeof messenger.sendText !== 'function') return;

  const chatId =
    wa.sessionsData?.[phone]?.chatId || access.getOwnerChatId();
  if (!chatId) return;

  const number = String(remote || '').split('@')[0];
  const who = pushName ? `${pushName} (${number})` : number;
  const body = extracted.text ? extracted.text : `(${extracted.kind})`;

  const lines = [
    '📥 WhatsApp sorğu',
    `👤 ${who}`,
    `💬 ${body}`,
    `➜ ${resultSummary(result)}`,
  ];
  if (result.matchType && result.matchType !== 'exact') {
    lines.push(`🔎 Uyğunlaşma: ${result.matchType}`);
  }

  try {
    await messenger.sendText(chatId, lines.join('\n'));
  } catch (e) {
    LOG.warn('Telegram ötürmə xətası:', e.message);
  }
}

/**
 * Göndəriləcək mesajları qurur.
 *
 * Qaydalar (sənəd §3-§4, §7):
 *   • İlk mesaj (mətn/səs/şəkil/sənəd) → qarşılama mesajı (yalnız bir dəfə);
 *   • Sorğu formatı düzgün → avtomatik cavab;
 *   • Format düzgün deyil → standart format yardımı;
 *   • Qarşılama göndərilən kimi status "aktiv" olur.
 *
 * @returns {{messages: string[], kind: string}}
 */
function composeMessages(result, extracted, firstTime) {
  const messages = [];
  let kind = result.kind;

  if (firstTime) {
    messages.push(autoReply.buildGreeting(extracted.kind));
    if (kind === 'unknown') kind = 'greeting';
  }

  if (result.reply) {
    messages.push(result.reply);
    if (kind === 'greeting') kind = result.kind;
  } else if (!firstTime) {
    messages.push(autoReply.FORMAT_HELP_MESSAGE);
    kind = 'format_help';
  }

  return { messages, kind };
}

/** Gələn mesajı emal edir. */
async function handleIncoming(phone, msg) {
  if (!msg?.key) return;
  if (msg.key.fromMe === true) return;

  const remote = String(msg.key.remoteJid || '');
  if (!remote) return;
  if (remote.endsWith('@broadcast') || remote === 'status@broadcast') return;
  if (remote.endsWith('@newsletter')) return;

  const isGroup = remote.endsWith('@g.us');
  if (isGroup && settings.privateOnly) return;

  // Reaksiya/protokol mesajları cavab tələb etmir
  if (msg.message?.protocolMessage || msg.message?.reactionMessage) return;

  const extracted = extract(msg);
  if (!extracted) return;

  const number = String(remote).split('@')[0];

  // Eyni mesaj iki dəfə emal olunmur
  if (!isFresh(messageKey(msg, remote))) {
    LOG.warn(`Təkrar mesaj dəstələndi (dərhal keçildi): ${number}`);
    return;
  }

  guards.inc('received');

  // Blok listi
  if (guards.isBlocked(number)) {
    guards.inc('blockedSkipped');
    return;
  }

  // Rate limit
  if (guards.isRateLimited(number)) {
    guards.inc('rateLimited');
    LOG.warn(`Rate limit: +${number}`);
    return;
  }

  if (!settings.autoReplyEnabled) {
    LOG.info('Auto-reply söndürülüb — cavab göndərilmədi.');
    return;
  }

  // Eyni nömrədən gələn mesajlar növbə ilə emal olunur
  await phoneLocks.run(number, () => processIncoming(phone, msg, number, extracted));
}

/** Nömrə növbəsi daxilində mesajın emalı. */
async function processIncoming(phone, msg, number, extracted) {
  const isVoice = extracted.kind === 'voice';

  // Qarşılama statusu — hər istifadəçiyə yalnız bir dəfə (sənəd §4)
  const firstTime = !greetingStore.hasSeen(number);
  if (firstTime) greetingStore.markGreeted(number, { kind: extracted.kind });

  let result;
  try {
    result = autoReply.buildReply(extracted.text, {
      isVoice,
      phone: number,
      kind: extracted.kind,
    });
  } catch (e) {
    LOG.error('Cavab qurulması xətası:', e.message);
    guards.inc('errors');
    return;
  }

  const { messages, kind } = composeMessages(result, extracted, firstTime);

  // Göndərmə
  let sent = 0;
  for (const text of messages) {
    if (!text) continue;
    try {
      await wa.sendText(phone, text, msg.key.remoteJid);
      sent += 1;
    } catch (e) {
      LOG.error('Cavab göndərilmədi:', e.message);
      guards.inc('errors');
      return;
    }
  }

  guards.inc('replied');
  if (kind === 'certificate') guards.inc('certificateQueries');
  else if (kind === 'course') guards.inc('courseQueries');
  else if (kind === 'not_found') guards.inc('notFound');
  else if (kind === 'ambiguous') guards.inc('ambiguous');
  else if (kind === 'greeting') guards.inc('welcome');
  else if (kind === 'voice') guards.inc('voice');
  else if (kind === 'sensitive_query' || kind === 'identity_mismatch') guards.inc('blocked');

  // İstifadəçi qeydi (son mesaj tarixi, qarşılama statusu)
  try {
    greetingStore.touch(number, { kind: extracted.kind, query: kind });
  } catch {}

  guards.pushRecent({
    from: msg.pushName || number,
    number,
    text: extracted.text,
    kind: extracted.kind,
    replyKind: kind,
    matched: !!result.matched,
    summary: resultSummary({ ...result, kind }),
    reply: messages.join('\n\n'),
  });

  await forwardToTelegram(phone, msg.key.remoteJid, msg.pushName, extracted, { ...result, kind });
}

/**
 * Baileys soketinin dinləyicisini qeydiyyatdan keçirir.
 * @param {object} sock
 * @param {string} phone
 */
function attach(sock, phone) {
  if (!sock || typeof sock?.ev?.on !== 'function') return;
  if (sock.__autoReplyAttached) return;
  sock.__autoReplyAttached = true;

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return; // tarix sinxronizasiyası
    for (const msg of messages || []) {
      handleIncoming(phone, msg).catch((e) => LOG.warn('Auto-reply handler error:', e.message));
    }
  });

  LOG.info(`Auto-reply listener attached for +${phone}`);
}

module.exports = { attach, handleIncoming, extract, resultSummary, composeMessages, isFresh };
