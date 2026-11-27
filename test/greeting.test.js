/**
 * greeting — qarşılama mesajı YALNIZ BİR DƏFƏ göndərilir (sənəd §3-§5).
 *
 *  • status məlumat bazasında saxlanılır (restartdan sonra itmir)
 *  • Restart (fərdi / ümumi) statusu sıfırlayır
 *  • eyni mesaj iki dəfə emal olunmır (sənəd §9)
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// İzolyasiya edilmiş məlumat qovluğu
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ist-greeting-'));
process.env.BOT_DATA_DIR = TMP_DIR;

const greetingStore = require('../modules/greetingStore');
const autoReply = require('../modules/autoReply');
const dispatcher = require('../modules/waDispatcher');

const PHONE = '994501234567';

// ── Store ──
test('yeni istifadəçi qarşılama almayıb', () => {
  assert.strictEqual(greetingStore.hasSeen(PHONE), false);
});

test('qarşılama göndərildikdən sonra status aktiv olur', () => {
  greetingStore.markGreeted(PHONE, { kind: 'text' });
  assert.strictEqual(greetingStore.hasSeen(PHONE), true);
});

test('status faylda saxlanılır (restartdan sonra itmir)', () => {
  greetingStore._resetCache();
  assert.strictEqual(greetingStore.hasSeen(PHONE), true);
  const rec = greetingStore.get(PHONE);
  assert.strictEqual(rec.phone, PHONE);
  assert.ok(rec.greetedAt);
});

test('son mesaj məlumatı yenilənir', () => {
  greetingStore.touch(PHONE, { kind: 'text', query: 'certificate' });
  const rec = greetingStore.get(PHONE);
  assert.ok(rec.lastMessageAt);
  assert.strictEqual(rec.messageCount, 1);
  assert.strictEqual(rec.lastQuery, 'certificate');
});

test('fərdi restart — qarşılama statusu sıfırlanır', () => {
  assert.strictEqual(greetingStore.reset(PHONE), true);
  assert.strictEqual(greetingStore.hasSeen(PHONE), false);
});

test('restartdan sonra qarşılama yenidən göndərilir və status yenidən aktivləşir', () => {
  greetingStore.markGreeted(PHONE, { kind: 'text' });
  assert.strictEqual(greetingStore.hasSeen(PHONE), true);
});

test('ümumi restart — bütün istifadəçilər sıfırlanır', () => {
  greetingStore.markGreeted('994502223344', { kind: 'text' });
  const count = greetingStore.resetAll();
  assert.ok(count >= 1);
  assert.strictEqual(greetingStore.hasSeen(PHONE), false);
  assert.strictEqual(greetingStore.hasSeen('994502223344'), false);
});

test('siyahı istifadəçiləri son mesaj tarixi ilə qaytarır', () => {
  greetingStore.touch('994503334455', { kind: 'text' });
  const list = greetingStore.list();
  assert.ok(list.length >= 1);
  assert.ok(list.every((u) => typeof u.phone === 'string'));
});

// ── Mesaj kompozisiyası (dispatcher) ──
test('ilk mesajda qarşılama göndərilir', () => {
  const result = { kind: 'unknown', reply: null };
  const { messages, kind } = dispatcher.composeMessages(result, { kind: 'text', text: 'Salam' }, true);
  assert.strictEqual(messages.length, 1);
  assert.ok(messages[0].includes('İST Services Dənizcilik Təlim Mərkəzinə'));
  assert.strictEqual(kind, 'greeting');
});

test('ikinci və sonrakı mesajda qarşılama TƏKRAR göndərilmir', () => {
  const result = { kind: 'unknown', reply: null };
  const { messages, kind } = dispatcher.composeMessages(result, { kind: 'text', text: 'Salam' }, false);
  assert.strictEqual(messages.length, 1);
  assert.ok(!messages[0].includes('İST Services Dənizcilik Təlim Mərkəzinə'));
  assert.ok(messages[0].includes('Sorğunuzun formatı düzgün deyil.'));
  assert.strictEqual(kind, 'format_help');
});

test('ilk mesaj sorğudursa — qarşılama + cavab göndərilir', () => {
  const result = { kind: 'certificate', reply: 'SERTİFİKAT CAVABI' };
  const { messages } = dispatcher.composeMessages(result, { kind: 'text', text: 'Əliyev Əli Vəli 1' }, true);
  assert.strictEqual(messages.length, 2);
  assert.ok(messages[0].includes('İST Services Dənizcilik Təlim Mərkəzinə'));
  assert.strictEqual(messages[1], 'SERTİFİKAT CAVABI');
});

test('səsli mesajda qarşılama + səs qeydi göndərilir', () => {
  const result = { kind: 'voice', reply: autoReply.VOICE_HINT };
  const { messages } = dispatcher.composeMessages(result, { kind: 'voice', text: '' }, true);
  assert.strictEqual(messages.length, 2);
  assert.ok(messages[0].includes('İST Services Dənizcilik Təlim Mərkəzinə'));
  assert.ok(messages[1].includes('Səsli mesajınız qeydə alındı'));
});

test('şəkil/sənəd məzmunu axtarılmır', () => {
  const result = { kind: 'media', reply: autoReply.MEDIA_NOTE };
  const { messages } = dispatcher.composeMessages(result, { kind: 'image', text: '' }, false);
  assert.strictEqual(messages.length, 1);
  assert.ok(messages[0].includes('axtarılmır'));
});

// ── Təkrar mesajların qarşısının alınması (sənəd §9) ──
test('eyni mesaj iki dəfə emal olunmur', () => {
  assert.strictEqual(dispatcher.isFresh('msg-1'), true);
  assert.strictEqual(dispatcher.isFresh('msg-1'), false);
  assert.strictEqual(dispatcher.isFresh('msg-2'), true);
});
