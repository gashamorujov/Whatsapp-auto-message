#!/usr/bin/env node
/**
 * Telegram paneli üçün mock test + vizual yoxlama.
 *
 * node-telegram-bot-api modulu mock ilə əvəzlənir, botun bütün ekranları
 * ("/start", statistika, cədvəl menyusu, axınlar) çağırılır və nəticələr
 *   • konsola (mətn + düymələr)
 *   • temp/telegram-preview.html (brauzer üçün)
 * kimi çıxarılır.
 *
 * İşə salmaq:  node scripts/mock-telegram.js
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'temp');
const HTML_FILE = path.join(OUT_DIR, 'telegram-preview.html');

const captured = []; // { text, buttons }

// ─── Mock TelegramBot ───
class MockTelegramBot {
  constructor(token, opts) {
    this.token = token;
    this.handlers = new Map();
    this.lastMessageId = 1000;
  }
  on(event, cb) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(cb);
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
  async startPolling() {
    return true;
  }
  async stopPolling() {
    return true;
  }
  async sendMessage(chatId, text, opts = {}) {
    this.lastMessageId += 1;
    captured.push({ text: String(text), buttons: opts.reply_markup?.inline_keyboard || null, kind: 'message' });
    return { message_id: this.lastMessageId, chat: { id: chatId }, text };
  }
  async sendPhoto(chatId, buffer, opts = {}) {
    this.lastMessageId += 1;
    captured.push({
      text: String(opts.caption || ''),
      buttons: opts.reply_markup?.inline_keyboard || null,
      kind: 'photo',
    });
    return { message_id: this.lastMessageId, chat: { id: chatId } };
  }
  async editMessageText(text, opts = {}) {
    this.lastMessageId += 1;
    captured.push({ text: String(text), buttons: opts.reply_markup?.inline_keyboard || null, kind: 'edit' });
    return { message_id: this.lastMessageId, chat: { id: opts.chat_id } };
  }
  async editMessageReplyMarkup(markup, opts = {}) {
    const existing = captured.find((c) => c.messageId === opts.message_id);
    if (existing) existing.buttons = markup.inline_keyboard || null;
    else captured.push({ text: '(düymələr dəyişdirildi)', buttons: markup.inline_keyboard || null, kind: 'edit' });
    return true;
  }
  async answerCallbackQuery() {
    return true;
  }
  async deleteMessage() {
    return true;
  }
}

// ─── Mock modulu quraşdır ───
const tgPath = require.resolve('node-telegram-bot-api');
require.cache[tgPath] = {
  id: tgPath,
  filename: tgPath,
  loaded: true,
  exports: MockTelegramBot,
  children: [],
  paths: [],
};

// ─── Botu işə sal ───
process.env.BOT_DATA_DIR = path.join(OUT_DIR, 'mock-data');
fs.mkdirSync(process.env.BOT_DATA_DIR, { recursive: true });

const tgBot = require('../modules/telegramBot');
const sheets = require('../modules/sheetsManager');
const guards = require('../modules/guards');
const greetingStore = require('../modules/greetingStore');

const CHAT = 123456789;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderHtml() {
  const blocks = captured
    .map((c) => {
      const buttons = (c.buttons || [])
        .map(
          (row) =>
            `<div class="row">${row
              .map((b) => `<span class="btn">${escapeHtml(b.text)}</span>`)
              .join('')}</div>`
        )
        .join('');
      return `<div class="msg ${c.kind}">
        <div class="meta">${c.kind === 'photo' ? '📷 foto mesaj' : c.kind === 'edit' ? '✏️ redaktə' : '💬 mesaj'}</div>
        <pre>${escapeHtml(c.text)}</pre>
        ${buttons ? `<div class="kb">${buttons}</div>` : ''}
      </div>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="az"><head><meta charset="utf-8">
<title>Telegram panel yoxlaması</title>
<style>
  body { background:#17212b; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; padding:24px; }
  h1 { color:#fff; font-size:20px; margin:0 0 18px; }
  .msg { background:#242f3d; border-radius:12px; padding:12px 14px; margin-bottom:14px; max-width:760px; }
  .msg.photo { border-left:3px solid #4fa3ff; }
  .msg.edit { border-left:3px solid #6ee7a8; }
  .meta { color:#7d93ab; font-size:11px; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
  pre { color:#e8eef5; font-family:inherit; font-size:13.5px; white-space:pre-wrap; margin:0; line-height:1.45; }
  .kb { margin-top:10px; }
  .row { display:flex; gap:6px; margin-bottom:5px; flex-wrap:wrap; }
  .btn { background:#2b5278; color:#fff; font-size:12.5px; padding:7px 12px; border-radius:6px; white-space:nowrap; }
</style></head>
<body><h1>İST Services — Telegram idarəetmə paneli (mock render)</h1>
${blocks}
</body></html>`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(HTML_FILE, html);
}

async function main() {
  console.log('⏳ Cədvəllər yüklənir...');
  await sheets.refreshAll();

  // Simulyasiya edilmiş statistika
  guards.inc('received', 42);
  guards.inc('replied', 40);
  guards.inc('certificateQueries', 21);
  guards.inc('courseQueries', 15);
  guards.inc('notFound', 3);
  guards.inc('ambiguous', 1);
  guards.pushRecent({
    from: 'Əliyev Əli',
    number: '994501234567',
    text: 'Əliyev Əli Vəli 1',
    kind: 'text',
    summary: '✅ Sertifikat tapıldı — 2 qeyd',
  });
  guards.pushRecent({
    from: 'Süleymanova Flora',
    number: '994502223344',
    text: 'Süleymanova Flora Fərrux 2',
    kind: 'text',
    summary: '✅ Kurs qeydiyyatı tapıldı — 1 qeyd',
  });

  // Nümunə istifadəçilər (qarşılama statusu)
  greetingStore.markGreeted('994501234567', { kind: 'text' });
  greetingStore.touch('994501234567', { kind: 'text', query: 'certificate' });
  greetingStore.touch('994502223344', { kind: 'voice', query: 'voice' });

  await tgBot.startBot('MOCK-TOKEN');
  await new Promise((r) => setTimeout(r, 300));

  const handler = (ev) => {
    const list = [...(tgBot.getBot()?.handlers?.get(ev) || [])];
    return list;
  };

  async function sendText(text) {
    captured.push({ text: `⌨️ istifadəçi yazır: ${text}`, buttons: null, kind: 'input' });
    for (const cb of handler('message')) {
      await cb({ chat: { id: CHAT, type: 'private' }, message_id: `m${captured.length}`, from: { id: 999 }, text });
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  async function press(label) {
    captured.push({ text: `👆 düymə: ${label}`, buttons: null, kind: 'input' });
    for (const cb of handler('callback_query')) {
      await cb({
        id: `q${captured.length}`,
        from: { id: 999 },
        message: { chat: { id: CHAT }, message_id: `cb${captured.length}` },
        data: label,
      });
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log('▶ /start');
  await sendText('/start');

  console.log('▶ Statistika');
  await press('st');

  console.log('▶ Son sorğular');
  await press('rq');

  console.log('▶ Sertifikat cədvəli');
  await press('shc:menu');

  console.log('▶ Kurs cədvəli');
  await press('shk:menu');

  console.log('▶ Ayarlar');
  await press('cf:menu');

  console.log('▶ İstifadəçilər (qarşılama statusu + Restart)');
  await press('us:menu');

  console.log('▶ Fərdi restart təsdiqi');
  await press('us:rst:994501234567');

  console.log('▶ Ümumi restart təsdiqi');
  await press('us:all');

  console.log('▶ Link dəyişmə axını');
  await press('shc:lnk');
  await sendText('https://docs.google.com/spreadsheets/d/14A3Utt4RZLy2uP0XSFL_gsEJf8a2k_4P/edit?gid=1252670317');

  console.log('▶ Test axını');
  await press('shk:test');
  await sendText('Süleymanova Flora');

  console.log('▶ WhatsApp qoşulma');
  await press('wa');

  console.log('\n══════════════════════════════════════════');
  console.log(`  CAPTURED MESSAGES: ${captured.length}`);
  console.log('══════════════════════════════════════════\n');
  for (const c of captured) {
    console.log(`\n[${c.kind}] ${c.text}`);
    if (c.buttons) {
      for (const row of c.buttons) console.log(`   ${row.map((b) => `[${b.text}]`).join(' ')}`);
    }
  }

  renderHtml();
  console.log(`\nHTML preview: ${HTML_FILE}`);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
