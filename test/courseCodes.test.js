/**
 * courseCodes — kurs kodu xəritəsi testləri.
 */
const test = require('node:test');
const assert = require('node:assert');
const {
  COURSE_CATALOG,
  COURSE_NAME_BY_CODE,
  normalizeCode,
  resolveCourseName,
  isKnownCode,
} = require('../modules/courseCodes');

test('bütün təsdiqlənmiş kurs kodu mövcuddur', () => {
  const required = [
    'SP', 'SI', 'SH', 'RS', 'SG', 'SO', 'SW', 'SV', 'SQ', 'SR', 'SZ', 'SF',
    'SD', 'SC', 'SE', 'ST', 'SX', 'SN', 'SM', 'DQ', 'SA', 'SB', 'AS', 'SK',
    'ER', 'DL', 'SJ', 'SL', 'SU', 'XS', 'YS', 'WS',
  ];
  for (const code of required) {
    assert.ok(COURSE_NAME_BY_CODE.has(code), `kod ${code} tapılmadı`);
    assert.ok(COURSE_NAME_BY_CODE.get(code).length > 5, `kod ${code} adı çox qısadır`);
  }
});

test('kurs adları düzgün mətnlərdir', () => {
  assert.strictEqual(COURSE_NAME_BY_CODE.get('SK'), 'Təhlükəli və zərərli yüklərin daşınması');
  assert.strictEqual(COURSE_NAME_BY_CODE.get('SG'), 'Gəmi mühafizəsi üzrə məsul Şəxs');
  assert.strictEqual(
    COURSE_NAME_BY_CODE.get('SP'),
    'Əmniyyətli İdarəetmə haqqında Beynəlxalq Məcəllə'
  );
});

test('normalizeCode', () => {
  assert.strictEqual(normalizeCode(' sp '), 'SP');
  assert.strictEqual(normalizeCode('er'), 'ER');
  assert.strictEqual(normalizeCode(null), '');
});

test('resolveCourseName — xəritə prioritetli (map)', () => {
  assert.strictEqual(
    resolveCourseName('SK', 'Cədvəldəki ad', 'map'),
    'Təhlükəli və zərərli yüklərin daşınması'
  );
});

test('resolveCourseName — cədvəl mənbəli (sheet)', () => {
  assert.strictEqual(resolveCourseName('SK', 'Cədvəldəki ad', 'sheet'), 'Cədvəldəki ad');
});

test('resolveCourseName — naməlum kod → cədvəl adı', () => {
  assert.strictEqual(resolveCourseName('ZZ', 'Bilinməyən kurs', 'map'), 'Bilinməyən kurs');
  assert.strictEqual(resolveCourseName('ZZ', '', 'map'), null);
});

test('isKnownCode', () => {
  assert.strictEqual(isKnownCode('SO'), true);
  assert.strictEqual(isKnownCode('so'), true);
  assert.strictEqual(isKnownCode('Aşpaz'), false);
  assert.strictEqual(isKnownCode(''), false);
});

test('DQ üçün iki variant qeydə alınıb', () => {
  const dq = COURSE_CATALOG.filter((c) => c.code === 'DQ');
  assert.strictEqual(dq.length, 2);
  assert.strictEqual(dq.filter((c) => c.variant).length, 1);
});
