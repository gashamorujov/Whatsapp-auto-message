/**
 * callbacks + menu — inline düymə sxeminin yoxlanması.
 */
const test = require('node:test');
const assert = require('node:assert');
const { parseCallback, collectCallbackData, bypassesLock, MAX_BYTES } = require('../lib/callbacks');
const menu = require('../lib/menu');

test('statik callback-lər', () => {
  for (const d of ['menu', 'st', 'rq', 'ref', 'wa', 'out', 'pair', 'qr', 'cc']) {
    const r = parseCallback(d);
    assert.strictEqual(r.ok, true, `${d} rədd edildi`);
    assert.strictEqual(r.kind, 'static');
  }
});

test('namespace callback-ləri', () => {
  assert.strictEqual(parseCallback('shc:menu').ok, true);
  assert.strictEqual(parseCallback('shk:lnk').ok, true);
  assert.strictEqual(parseCallback('sh:save').ok, true);
  assert.strictEqual(parseCallback('cf:reply').ok, true);
});

test('istifadəçi namespace-i (Restart)', () => {
  assert.strictEqual(parseCallback('us:menu').ok, true);
  assert.strictEqual(parseCallback('us:all').ok, true);
  assert.strictEqual(parseCallback('us:allok').ok, true);
  assert.strictEqual(parseCallback('us:rst:994501234567').ok, true);
  assert.strictEqual(parseCallback('us:rstok:994501234567').ok, true);
  // səhv nömrə formatı rədd edilir
  assert.strictEqual(parseCallback('us:rst:abc').ok, false);
  assert.strictEqual(parseCallback('us:rst:123').ok, false);
  assert.strictEqual(parseCallback('us:rst').ok, false);
});

test('naməlum callback rədd edilir', () => {
  assert.strictEqual(parseCallback('nope').ok, false);
  assert.strictEqual(parseCallback('shc:unknown').ok, false);
  assert.strictEqual(parseCallback('zz:menu').ok, false);
  assert.strictEqual(parseCallback('').ok, false);
});

test('çox uzun callback rədd edilir', () => {
  assert.strictEqual(parseCallback('x'.repeat(MAX_BYTES + 1)).ok, false);
});

test('bypass — ləğv düyməsi kilidi gözləmir', () => {
  assert.strictEqual(bypassesLock('cc'), true);
  assert.strictEqual(bypassesLock('menu'), false);
});

test('bütün menyu düymələri etibarlı callback-dir', () => {
  const keyboards = [
    menu.MAIN_MENU_BUTTONS,
    menu.CONNECTION_MENU_BUTTONS,
    menu.sheetMenuButtons('certificate'),
    menu.sheetMenuButtons('course'),
    menu.SETTINGS_MENU_BUTTONS,
    menu.CANCEL_BUTTON,
    menu.CONFIRM_SAVE_BUTTONS,
    menu.RESTART_ALL_BUTTONS,
    menu.CONFIRM_RESTART_ALL_BUTTONS,
    menu.confirmUserRestartButtons('994501234567'),
    menu.userRestartButton('994501234567'),
  ];
  for (const kb of keyboards) {
    for (const data of collectCallbackData(kb)) {
      assert.strictEqual(parseCallback(data).ok, true, `etibarsız callback: ${data}`);
      assert.ok(Buffer.byteLength(data, 'utf8') <= MAX_BYTES, `çox uzun callback: ${data}`);
    }
  }
});

test('menyu düymələri qısa və oxunaqlıdır', () => {
  for (const kb of [menu.MAIN_MENU_BUTTONS, menu.SETTINGS_MENU_BUTTONS]) {
    for (const row of kb) {
      for (const btn of row) {
        assert.ok(btn.text.length <= 24, `uzun düymə: ${btn.text}`);
      }
    }
  }
});

test('sertifikat və kurs menyusu fərqlidir', () => {
  const cert = collectCallbackData(menu.sheetMenuButtons('certificate'));
  const course = collectCallbackData(menu.sheetMenuButtons('course'));
  assert.ok(cert.includes('shc:lnk'));
  assert.ok(course.includes('shk:lnk'));
});

test('əsas menyuda istifadəçi ekranı var', () => {
  const data = collectCallbackData(menu.MAIN_MENU_BUTTONS);
  assert.ok(data.includes('us:menu'));
});
