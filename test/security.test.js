/**
 * security — şəxsi məlumat qorunması (sənəd §6).
 */
const test = require('node:test');
const assert = require('node:assert');
const { detectSensitiveQuery, phoneMatches, checkIdentity } = require('../lib/security');

// ── Şəxsi identifikatorla sorğular bloklanır ──
test('FİN kodu ilə sorğu bloklanır', () => {
  assert.strictEqual(detectSensitiveQuery('Əliyev Əli Vəli FIN AZE1234').blocked, true);
  assert.strictEqual(detectSensitiveQuery('FİN AZE1234 1').blocked, true);
  assert.strictEqual(detectSensitiveQuery('fin AZE123456').blocked, true);
});

test('şəxsiyyət vəsiqəsi / pasport / diplomat axtarışı bloklanır', () => {
  assert.strictEqual(detectSensitiveQuery('şəxsiyyət vəsiqəsi AZE12345').blocked, true);
  assert.strictEqual(detectSensitiveQuery('pasport AZE12345').blocked, true);
  assert.strictEqual(detectSensitiveQuery('diplom № 12345').blocked, true);
});

test('4+ rəqəmli şəxsi kod bloklanır', () => {
  assert.strictEqual(detectSensitiveQuery('994501234567').blocked, true);
  assert.strictEqual(detectSensitiveQuery('Əliyev Əli Vəli 1234').blocked, true);
});

test('e-poçt ünvanı bloklanır', () => {
  assert.strictEqual(detectSensitiveQuery('test@example.com 1').blocked, true);
});

test('NORMAL sorğu bloklanmır', () => {
  assert.strictEqual(detectSensitiveQuery('Əliyev Əli Vəli 1').blocked, false);
  assert.strictEqual(detectSensitiveQuery('Əliyev Əli Vəli 2').blocked, false);
  assert.strictEqual(detectSensitiveQuery('Salam, necəsiniz?').blocked, false);
});

// ── Nömrə ilə əlaqələndirmə ──
test('phoneMatches — eyni nömrə (format fərqli ola bilər)', () => {
  assert.strictEqual(phoneMatches('994501234567', '994501234567'), true);
  assert.strictEqual(phoneMatches('994501234567', '+994 50 123 45 67'), true);
  assert.strictEqual(phoneMatches('994501234567', '0501234567'), true);
  // 9 rəqəmli qeyd (başdakı 0 yazılmayıb)
  assert.strictEqual(phoneMatches('994501234567', '501234567'), true);
  assert.strictEqual(phoneMatches('994501234567', '050 123 45 67'), true);
});

test('phoneMatches — cədvəl hücründə İKİ nömrə varsa (a/b) biri uyğun gəlir', () => {
  assert.strictEqual(phoneMatches('994505120507', '703323287/512050707'), false);
  assert.strictEqual(phoneMatches('994703323287', '703323287/512050707'), true);
  assert.strictEqual(phoneMatches('994501234567', '0705220209/0501234567'), true);
});

test('phoneMatches — fərqli nömrə', () => {
  assert.strictEqual(phoneMatches('994501234567', '994509999999'), false);
  assert.strictEqual(phoneMatches('994501234567', '0509999999'), false);
});

test('phoneMatches — məlumat yoxdursa "yoxlanıla bilməz"', () => {
  assert.strictEqual(phoneMatches('994501234567', ''), null);
  assert.strictEqual(phoneMatches('994501234567', '123'), null);
  assert.strictEqual(phoneMatches('', '994501234567'), null);
});

// ── Qeydlərin identifikasiya yoxlaması ──
test('checkIdentity — uyğun nömrə → keçir', () => {
  const records = [{ phone: '994501234567' }];
  const r = checkIdentity(records, '994501234567');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.checked, true);
});

test('checkIdentity — uyğun gəlməyən nömrə → bloklanır', () => {
  const records = [{ phone: '994509999999' }];
  const r = checkIdentity(records, '994501234567');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.checked, true);
});

test('checkIdentity — telefon sütunu yoxdursa yoxlama aparılmır', () => {
  const records = [{ phone: '' }, { phone: '' }];
  const r = checkIdentity(records, '994501234567');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.checked, false);
});

test('checkIdentity — qeydlərin birində uyğun nömrə varsa keçir', () => {
  const records = [{ phone: '994509999999' }, { phone: '994501234567' }];
  const r = checkIdentity(records, '994501234567');
  assert.strictEqual(r.ok, true);
});
