/**
 * csv + sheetUrl parser testləri.
 */
const test = require('node:test');
const assert = require('node:assert');
const { parseCsv, normalizeWidth } = require('../lib/csv');
const { parseSheetUrl, buildCsvUrl } = require('../lib/sheetUrl');

test('CSV — sadə sətirlər', () => {
  const rows = parseCsv('a,b,c\n1,2,3');
  assert.deepStrictEqual(rows, [
    ['a', 'b', 'c'],
    ['1', '2', '3'],
  ]);
});

test('CSV — vergüllü tırnak içində', () => {
  const rows = parseCsv('x,"Təhlükəli və zərərli yüklər, daşınması",y');
  assert.deepStrictEqual(rows[0], ['x', 'Təhlükəli və zərərli yüklər, daşınması', 'y']);
});

test('CSV — tırnak içində sətır sonu', () => {
  const rows = parseCsv('a,"1-ci\nsətir",c');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0][1], '1-ci\nsətir');
});

test('CSV — tək təkrar tırnak', () => {
  const rows = parseCsv('a,"Dənizçi ""Gözə"", bəy",c');
  assert.strictEqual(rows[0][1], 'Dənizçi "Gözə", bəy');
});

test('CSV — CRLF', () => {
  const rows = parseCsv('a,b\r\n1,2\r\n');
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[1], ['1', '2']);
});

test('CSV — BOM təmizlənir', () => {
  const rows = parseCsv('\uFEFFad,soyad\nƏliyev,Əli');
  assert.strictEqual(rows[0][0], 'ad');
});

test('normalizeWidth — sətirləri eyni uzunluğa salır', () => {
  const rows = normalizeWidth([['a', 'b', 'c'], ['1']]);
  assert.deepStrictEqual(rows[1], ['1', '', '']);
});

test('sheetUrl — edit?gid= formatı', () => {
  const p = parseSheetUrl('https://docs.google.com/spreadsheets/d/14A3Utt4RZLy2uP0XSFL_gsEJf8a2k_4P/edit?gid=1252670317');
  assert.strictEqual(p.id, '14A3Utt4RZLy2uP0XSFL_gsEJf8a2k_4P');
  assert.strictEqual(p.gid, '1252670317');
});

test('sheetUrl — hash formatı', () => {
  const p = parseSheetUrl('https://docs.google.com/spreadsheets/d/19Ggn9KY6a8a1PaU0vdCOTakmkYounGqt/edit#gid=803500785');
  assert.strictEqual(p.id, '19Ggn9KY6a8a1PaU0vdCOTakmkYounGqt');
  assert.strictEqual(p.gid, '803500785');
});

test('sheetUrl — hər ikisi birlikdə', () => {
  const p = parseSheetUrl('https://docs.google.com/spreadsheets/d/14A3Utt4RZLy2uP0XSFL_gsEJf8a2k_4P/edit?gid=1252670317#gid=1252670317');
  assert.strictEqual(p.gid, '1252670317');
});

test('sheetUrl — gid yoxdursa 0', () => {
  const p = parseSheetUrl('https://docs.google.com/spreadsheets/d/14A3Utt4RZLy2uP0XSFL_gsEJf8a2k_4P/');
  assert.strictEqual(p.gid, '0');
});

test('sheetUrl — səhv link', () => {
  assert.strictEqual(parseSheetUrl('not-a-link'), null);
  assert.strictEqual(parseSheetUrl(''), null);
});

test('buildCsvUrl', () => {
  assert.strictEqual(
    buildCsvUrl('ABC', '42'),
    'https://docs.google.com/spreadsheets/d/ABC/export?format=csv&gid=42'
  );
});
