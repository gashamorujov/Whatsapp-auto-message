/**
 * certificateStore + courseStore — cədvəl parseri testləri.
 *
 * Fixture-lar real cədvəllərin strukturunu əks etdirir.
 */
const test = require('node:test');
const assert = require('node:assert');
const { parseCsv, normalizeWidth } = require('../lib/csv');
const { parseCertificateRows, CertificateStore } = require('../modules/certificateStore');
const { parseCourseRows, parseDateCell, CourseStore } = require('../modules/courseStore');

const CERT_CSV = [
  'f,,TƏHVİL VERİLİB,,TƏHVİL VERİLMƏYİB,,,Status: H xanasını seçin → 2 dəfə ENTER-ə bas,',
  ',,Sertifikat şəxsə təhvil verilib  ·  808 ədəd,,Sertifikat hələ təhvil verilməyib  ·  460 ədəd,,,,',
  'f,Sertifikat №,"Soyadı, Adı, Atasının adı",Kurs kodu,Kursun adı,Sertifikatın verilmə tarixi,Sertifikatın qüvvədə olma tarixi,Təhvil statusu,Qeyd',
  '1,DL-0916-26,Abdullayev Vüsal Dilavər ,DL,Liderlik və birgə iş fəaliyyəti,12.08.2026,12.08.2031,Təhvil verilib,',
  '2,SA-0359-26,Abdullazadə Pərviz Xaqani,SA,Neft və kimyəvi maddələr daşıyan tankerlərdə yük əməliyyatına dair ilkin hazırlıq və kvalifikasiya,18.08.2026,Ömürlükdür,Təhvil verilməyib,',
  '3,SM-0342-26,Cəbrayılov Ayaz Xalis,SM,Gəmidə tibbi nəzarət,05.11.2026,05.11.2031,,',
  '4,SK-0790-26,Ağakişiyev Fərhad İslam,SK,Təhlükəli və zərərli yüklərin daşınması,12.08.2026,07.08.2031,Təhvil verilib,',
].join('\n');

const COURSE_CSV = [
  ',,,,,,,,,,,,,,,',
  '№,"Soyad, Ad və Ata adı",Seriya nömrəsi,Fərdi identifikasiya nömrəsi,Doğum tarixi,Telefon nömrəsi,email,Rank (Working Diploma)/ Vezife( İşçi Diplomu),"Full Name (ID)/Adı,soyadı,ata adı",Rank (Working Diploma)/ Vezife( İşçi Diplomu),Rank (Working Diploma)/ Vezife( İşçi Diplomu),Course Start Date/ Təlimin Başlama tarixi,Course Finish Date/ Təlimin Bitmə tarixi,Qeyd,Tarix',
  '2,Süleymanova Flora Fərrux qızı,AA6233244,62EPD4J,15.12.1996,703323287,suleymanova.flora655@gmail.com,Aşpaz,Süleymanova Flora Fərrux qızı,Fiziki Şəxs,SO,12.01.2026,21.01.2026,Aycan Kainat,,',
  '26,Məmmədov Rasif Əminağa,AA4862501,4KKFSH9,30.11.1987,0707494244,mammadov.rasif736@gmail.com,Gəmi elektriki,Məmmədov Rasif Əminağa,Fiziki Şəxs,SH,BORC,,ELVİN,,',
  '41,Bağırzadə Yəhya Mais,,514477989,08.03.1990,0775607922,bagirzada.yahya484@gmail.com,Növbə motorçusu,Bağırzadə Yəhya Mais,Fiziki Şəxs,SO,,,Tural m,,',
].join('\n');

const certRows = normalizeWidth(parseCsv(CERT_CSV));
const courseRows = normalizeWidth(parseCsv(COURSE_CSV));

test('sertifikat — başlıq sətri avtomatik tapılır', () => {
  const parsed = parseCertificateRows(certRows);
  assert.strictEqual(parsed.error, null);
  assert.strictEqual(parsed.headerIndex, 2);
  assert.strictEqual(parsed.records.length, 4);
});

test('sertifikat — boş/placeholder sətirlər atlanır', () => {
  const parsed = parseCertificateRows(certRows);
  assert.ok(parsed.records.every((r) => r.name && r.code));
});

test('sertifikat — təhvil statusu mətnindən oxunur', () => {
  const parsed = parseCertificateRows(certRows);
  const byCert = Object.fromEntries(parsed.records.map((r) => [r.certNo, r]));
  assert.strictEqual(byCert['DL-0916-26'].status, 'delivered');
  assert.strictEqual(byCert['SA-0359-26'].status, 'not_delivered');
  // Status boş → təhvil verilməyib
  assert.strictEqual(byCert['SM-0342-26'].status, 'not_delivered');
});

test('sertifikat — kurs adı kod xəritəsindən gəlir', () => {
  const parsed = parseCertificateRows(certRows);
  const sk = parsed.records.find((r) => r.code === 'SK');
  assert.strictEqual(sk.courseName, 'Təhlükəli və zərərli yüklərin daşınması');
  // Cədvəldə fərqli ad yazılıb, xəritə prioritetli
  const dl = parsed.records.find((r) => r.code === 'DL');
  assert.strictEqual(dl.courseName, 'Liderlik və heyətlə iş birliyi');
  assert.strictEqual(dl.sheetCourseName, 'Liderlik və birgəiş fəaliyyəti'.replace('birgəiş', 'birgə iş'));
});

test('sertifikat — sheet mənbəli rejim', () => {
  const parsed = parseCertificateRows(certRows, { courseNameSource: 'sheet' });
  const sk = parsed.records.find((r) => r.code === 'SK');
  assert.strictEqual(sk.courseName, 'Təhlükəli və zərərli yüklərin daşınması');
  const dl = parsed.records.find((r) => r.code === 'DL');
  assert.strictEqual(dl.courseName, 'Liderlik və birgə iş fəaliyyəti');
});

test('sertifikat — ad axtarışı', () => {
  const parsed = parseCertificateRows(certRows);
  const store = new CertificateStore();
  store.load({ records: parsed.records });
  const r = store.find('Abdullayev Vüsal');
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.records[0].certNo, 'DL-0916-26');
});

test('kurs — başlıq sətri və kod sütunu avtomatik tapılır', () => {
  const parsed = parseCourseRows(courseRows);
  assert.strictEqual(parsed.error, null);
  assert.strictEqual(parsed.headerIndex, 1);
  assert.strictEqual(parsed.records.length, 3);
  // Kurs kodu sütunu "Rank" başlıqlı sütunlar arasından seçilir → K
  assert.strictEqual(parsed.records[0].code, 'SO');
  assert.strictEqual(parsed.records[1].code, 'SH');
});

test('kurs — tarix parse olunur', () => {
  const parsed = parseCourseRows(courseRows);
  assert.strictEqual(parsed.records[0].startDate, '12.01.2026');
  assert.strictEqual(parsed.records[0].hasDate, true);
});

test('kurs — mətnli tarix "BORC" → tarix yoxdur', () => {
  const parsed = parseCourseRows(courseRows);
  const m = parsed.records.find((r) => r.name === 'Məmmədov Rasif Əminağa');
  assert.strictEqual(m.hasDate, false);
  assert.strictEqual(m.startRaw, 'BORC');
});

test('kurs — boş tarix', () => {
  const parsed = parseCourseRows(courseRows);
  const m = parsed.records.find((r) => r.name === 'Bağırzadə Yəhya Mais');
  assert.strictEqual(m.hasDate, false);
});

test('kurs — ad axtarışı (ad + "oğlu" ixtisası)', () => {
  const parsed = parseCourseRows(courseRows);
  const store = new CourseStore();
  store.load({ records: parsed.records });
  assert.strictEqual(store.find('Süleymanova Flora').found, true);
  assert.strictEqual(store.find('Məmmədov Rasif Əminağa').found, true);
});

test('parseDateCell', () => {
  assert.deepStrictEqual(parseDateCell('12.01.2026'), { isDate: true, value: '12.01.2026' });
  assert.deepStrictEqual(parseDateCell('02/04/26'), { isDate: true, value: '02.04.2026' });
  assert.strictEqual(parseDateCell('BORC').isDate, false);
  assert.strictEqual(parseDateCell('').isDate, false);
  assert.strictEqual(parseDateCell('hərbi xidmeti').isDate, false);
});
