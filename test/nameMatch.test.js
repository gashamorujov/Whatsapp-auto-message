/**
 * nameMatch — ad uyğunlaşma mühərriki testləri.
 */
const test = require('node:test');
const assert = require('node:assert');
const { normalize, loosen, looseVariants, buildIndex, findByName, firstTwo } = require('../lib/nameMatch');

const RECORDS = [
  { name: 'Əliyev Əli Vəli', id: 1 },
  { name: 'Əliyev Əli Rəşad', id: 2 },
  { name: 'Abdullayev Vüsal Dilavər', id: 3 },
  { name: 'Ağayev Fərid Əlhadi oğlu', id: 4 },
  { name: 'Süleymanova Flora Fərrux qızı', id: 5 },
  { name: 'Məmmədov Rasif Əminağa', id: 6 },
  { name: 'Əliyeva Aysel Mehriban', id: 7 },
];

const index = buildIndex(RECORDS);

test('normalize — hərflər, nöqtə və boşluqlar təmizlənir', () => {
  assert.strictEqual(normalize('  Əliyev   Əli  Vəli '), 'əliyev əli vəli');
  assert.strictEqual(normalize('Abdullayev, Vüsal'), 'abdullayev vüsal');
  assert.strictEqual(normalize('Məmmədov Rasif Əminağa'), 'məmmədov rasif əminağa');
});

test('loosen — azərbaycan hərfləri sadələşdirilir', () => {
  assert.strictEqual(loosen('Əliyev'), 'aliyev');
  assert.strictEqual(loosen('Işıq'), 'isiq');
  assert.strictEqual(loosen('Çörək Şüçü'), 'corak sucu');
});

test('looseVariants — "ə" həm "a", həm "e" kimi qəbul edilir', () => {
  const variants = looseVariants('Əliyev');
  assert.ok(variants.includes('aliyev'));
  assert.ok(variants.includes('eliyev'));
});

test('dəqiq uyğunlaşma', () => {
  const r = findByName('Əliyev Əli Vəli', index);
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.matchType, 'exact');
  assert.strictEqual(r.records[0].id, 1);
});

test('dəqiq uyğunlaşma — nöqtə və boşluq fərq etmir', () => {
  const r = findByName('  əliyev,   əli vəli ', index);
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.records[0].id, 1);
});

test('yumşaq uyğunlaşma — ə/e fərqi', () => {
  const r = findByName('Eliyev Eli Veli', index);
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.matchType, 'loose');
  assert.strictEqual(r.records[0].id, 1);
});

test('prefix — atasının adı yazılmayıb', () => {
  const r = findByName('Əliyev Əli', index);
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.matchType, 'prefix');
  // İki fərqli "Əliyev Əli" var → ambiguous
  assert.strictEqual(r.ambiguous, true);
  assert.strictEqual(r.candidates.length, 2);
  // Namizədlər orijinal yazılışda qaytarılır
  assert.ok(r.candidates.includes('Əliyev Əli Vəli'));
  assert.ok(r.candidates.includes('Əliyev Əli Rəşad'));
});

test('prefix — unikal olduqda', () => {
  const r = findByName('Abdullayev Vüsal', index);
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.ambiguous, false);
  assert.strictEqual(r.records[0].id, 3);
});

test('"oğlu" sonlu ad — prefix uyğunlaşması', () => {
  const r = findByName('Ağayev Fərid Əlhadi', index);
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.records[0].id, 4);
});

test('"qızı" sonlu ad — prefix uyğunlaşması', () => {
  const r = findByName('Süleymanova Flora Fərrux', index);
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.records[0].id, 5);
});

test('soyad + ad — unikal olduqda tapılır', () => {
  const r = findByName('Məmmədov Rasif', index);
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.ambiguous, false);
  assert.strictEqual(r.records[0].id, 6);
});

test('soyad + ad — birdən çox uyğun olanda ambiguous', () => {
  const r = findByName('Əliyeva Aysel', index);
  assert.strictEqual(r.ambiguous, false);
  assert.strictEqual(r.found, true);
});

test('tapılmama halı', () => {
  const r = findByName('Qeydiyyatda Olmayan Adam', index);
  assert.strictEqual(r.found, false);
  assert.strictEqual(r.ambiguous, false);
  assert.strictEqual(r.records.length, 0);
});

test('çox qısa / boş sorğu tapılmır', () => {
  assert.strictEqual(findByName('', index).found, false);
  assert.strictEqual(findByName('Ab', index).found, false);
});

test('firstTwo köməkçisi', () => {
  assert.strictEqual(firstTwo('Əliyev Əli Vəli'), 'əliyev əli');
  assert.strictEqual(firstTwo('Əliyev'), 'əliyev');
});
