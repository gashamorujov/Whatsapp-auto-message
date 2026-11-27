/**
 * autoReply — sorğunun tanınması və cavab mətnləri (sənəd §1, §2, §3, §7).
 */
const test = require('node:test');
const assert = require('node:assert');
const autoReply = require('../modules/autoReply');
const sheets = require('../modules/sheetsManager');
const { CertificateStore } = require('../modules/certificateStore');
const { CourseStore } = require('../modules/courseStore');

// ── Fake store-lar ──
const certStore = new CertificateStore();
certStore.load({
  records: [
    {
      name: 'Əliyev Əli Vəli',
      code: 'SK',
      courseName: 'Təhlükəli və zərərli yüklərin daşınması',
      certNo: 'SK-0790-26',
      issueDate: '12.08.2026',
      expiryDate: '07.08.2031',
      status: 'delivered',
      statusRaw: 'Təhvil verilib',
      phone: '',
    },
    {
      name: 'Əliyev Əli Vəli',
      code: 'SG',
      courseName: 'Gəmi mühafizəsi üzrə məsul Şəxs',
      certNo: 'SG-0307-26',
      issueDate: '01.09.2026',
      expiryDate: 'Ömürlükdür',
      status: 'not_delivered',
      statusRaw: 'Təhvil verilməyib',
      phone: '',
    },
  ],
});

const courseStore = new CourseStore();
courseStore.load({
  records: [
    {
      name: 'Əliyev Əli Vəli',
      code: 'SL',
      courseName: 'Sürətli olmayan xilasedici qayıq, növbətçi qayıq və sallar üzrə mütəxəssis',
      startDate: '28.11.2026',
      startRaw: '28.11.2026',
      hasDate: true,
      finishDate: '10.12.2026',
      phone: '',
    },
    {
      name: 'Əliyev Əli Vəli',
      code: 'XS',
      courseName: 'Təkmilləşdirmə',
      startDate: '',
      startRaw: 'BORC',
      hasDate: false,
      finishDate: '',
      phone: '',
    },
  ],
});

sheets.certificateStore = certStore;
sheets.courseStore = courseStore;

// ── parseIntent ──
test('parseIntent — "1" → sertifikat', () => {
  const r = autoReply.parseIntent('Əliyev Əli Vəli 1');
  assert.strictEqual(r.kind, 'certificate');
  assert.strictEqual(r.name, 'Əliyev Əli Vəli');
});

test('parseIntent — "2" → kurs', () => {
  const r = autoReply.parseIntent('Əliyev Əli Vəli 2');
  assert.strictEqual(r.kind, 'course');
  assert.strictEqual(r.name, 'Əliyev Əli Vəli');
});

test('parseIntent — rəqəm yoxdursa tanınmır', () => {
  const r = autoReply.parseIntent('Salam');
  assert.strictEqual(r.kind, null);
});

test('parseIntent — başqa rəqəm tanınmır', () => {
  const r = autoReply.parseIntent('Əliyev Əli Vəli 3');
  assert.strictEqual(r.kind, null);
});

test('parseIntent — nöqtə və boşluqlar tolerant', () => {
  assert.strictEqual(autoReply.parseIntent('  Əliyev  Əli  Vəli  1  ').kind, 'certificate');
  assert.strictEqual(autoReply.parseIntent('Əliyev Əli Vəli. 1').kind, 'certificate');
  assert.strictEqual(autoReply.parseIntent('Əliyev Əli Vəli, 2').kind, 'course');
});

test('parseIntent — tək sözlük ad qəbul edilmir', () => {
  assert.strictEqual(autoReply.parseIntent('Əliyev 1').kind, null);
});

// ── buildReply — sertifikat (sənəd §1) ──
test('buildReply — sertifikat cavabı: yalnız ad və status', () => {
  const r = autoReply.buildReply('Əliyev Əli Vəli 1');
  assert.strictEqual(r.kind, 'certificate');
  assert.strictEqual(r.matched, true);
  assert.ok(r.reply.includes('Salam, Əli bəy, hər vaxtınız xeyir.'));
  assert.ok(r.reply.includes('Sertifikatlarınızın təhvil statusu:'));
  assert.ok(r.reply.includes('1. *Təhlükəli və zərərli yüklərin daşınması* — Təhvil verilib 🟢'));
  assert.ok(r.reply.includes('2. *Gəmi mühafizəsi üzrə məsul Şəxs* — Təhvil verilməyib ❌'));
});

test('buildReply — sertifikat nömrəsi və tarixlər cavabda YOXDUR (sənəd §1)', () => {
  const r = autoReply.buildReply('Əliyev Əli Vəli 1');
  assert.ok(!r.reply.includes('SK-0790-26'));
  assert.ok(!r.reply.includes('SG-0307-26'));
  assert.ok(!r.reply.includes('12.08.2026'));
  assert.ok(!r.reply.includes('07.08.2031'));
  assert.ok(!r.reply.includes('№'));
  assert.ok(!r.reply.includes('verilmə:'));
  assert.ok(!r.reply.includes('qüvvətdə:'));
  // Kurs kodu / daxili ID göstərilmir
  assert.ok(!r.reply.includes('* SK'));
  assert.ok(!r.reply.includes('* SG'));
});

// ── buildReply — kurs (sənəd §2) ──
test('buildReply — kurs cavabı: başlama/bitmə formatı', () => {
  const r = autoReply.buildReply('Əliyev Əli Vəli 2');
  assert.strictEqual(r.kind, 'course');
  assert.ok(r.reply.includes('Salam, Əli bəy, hər vaxtınız xeyir.'));
  assert.ok(r.reply.includes('Kurs qeydiyyatlarınız və təlim tarixləri aşağıdakı kimidir:'));
  assert.ok(r.reply.includes('Başlama: 28.11.2026 | Bitmə: 10.12.2026'));
  assert.ok(r.reply.includes('1. *Sürətli olmayan xilasedici qayıq'));
});

test('buildReply — kurs cavabının sonunda Qeyd bloku var (sənəd §2)', () => {
  const r = autoReply.buildReply('Əliyev Əli Vəli 2');
  assert.ok(
    r.reply.includes(
      'Qeyd: *Tarixlərdə hər hansı bir dəyişiklik olarsa, məlumat verəcəyik. ' +
        'Kurs başlamamışdan 1 gün əvvəl hər kəsə kurs haqqında məlumat veriləcək.*'
    )
  );
});

test('buildReply — kurs cavabında kurs kodu və ID yoxdur', () => {
  const r = autoReply.buildReply('Əliyev Əli Vəli 2');
  assert.ok(!r.reply.includes('* SL'));
  assert.ok(!r.reply.includes('* XS'));
});

// ── Tanınmayan mesaj ──
test('buildReply — tanınmayan mesaj → cavab null (qarşılama/format seçimi dispatcher-də)', () => {
  const r = autoReply.buildReply('Salam, necəsiniz?');
  assert.strictEqual(r.kind, 'unknown');
  assert.strictEqual(r.reply, null);
});

test('format yardımı mətni sənəddəki formattadır (sənəd §7)', () => {
  const m = autoReply.FORMAT_HELP_MESSAGE;
  assert.ok(m.startsWith('Sorğunuzun formatı düzgün deyil.'));
  assert.ok(m.includes('Sertifikat məlumatı üçün:'));
  assert.ok(m.includes('*Soyad Ad Ata adı 1*'));
  assert.ok(m.includes('Kurs qeydiyyatı üçün:'));
  assert.ok(m.includes('*Soyad Ad Ata adı 2*'));
  assert.ok(m.includes('Əlavə məlumat üçün administratorla əlaqə saxlaya bilərsiniz.'));
});

// ── Qarşılama mesajı (sənəd §3) ──
test('qarşılama mesajı sənəddəki mətni ehtiva edir', () => {
  const m = autoReply.WELCOME_MESSAGE;
  assert.ok(m.startsWith('Salam! *İST Services Dənizcilik Təlim Mərkəzinə* müraciət etdiyiniz üçün təşəkkür edirik.'));
  assert.ok(m.includes('*1. Sertifikatın statusunu yoxlamaq*'));
  assert.ok(m.includes('*Nümunə:* Əliyev Əli Vəli 1'));
  assert.ok(m.includes('*2. Kurs qeydiyyatlarını yoxlamaq*'));
  assert.ok(m.includes('*Nümunə:* Əliyev Əli Vəli 2'));
  assert.ok(m.includes('Müraciətiniz ən qısa zamanda cavablandırılacaq.'));
});

test('buildGreeting — səsli mesaj üçün qeyd əlavə olunur', () => {
  const g = autoReply.buildGreeting('voice');
  assert.ok(g.includes(autoReply.WELCOME_MESSAGE));
  assert.ok(g.includes('Səsli mesajınız qeydə alındı'));
});

test('buildGreeting — şəkil/sənəd üçün fayl məzmunu axtarılmadığı bildirilir', () => {
  const g = autoReply.buildGreeting('image');
  assert.ok(g.includes('məzmunu avtomatik olaraq axtarılmır'));
});

// ── Səsli mesaj ──
test('buildReply — səsli mesaj → yazılı cavab', () => {
  const r = autoReply.buildReply('', { isVoice: true });
  assert.strictEqual(r.kind, 'voice');
  assert.ok(r.reply.includes('Səsli mesajınız qeydə alındı'));
  assert.ok(r.reply.includes('sözə yazın') || r.reply.includes('mətn ilə yazın'));
});

// ── Fayl məzmunu (sənəd §6.8) ──
test('buildReply — şəkil/sənəd məzmunu axtarılmır', () => {
  const r = autoReply.buildReply('Əliyev Əli Vəli 1', { kind: 'image' });
  assert.strictEqual(r.kind, 'media');
  assert.ok(r.reply.includes('axtarılmır'));
});

// ── Tapılmadı / qarışdırılmama ──
test('buildReply — tapılmadı halı', () => {
  const r = autoReply.buildReply('Qeydiyyatda Olmayan Adam 1');
  assert.strictEqual(r.kind, 'not_found');
  assert.ok(r.reply.includes('tapılmadı'));
  assert.ok(r.reply.includes('Nümunə: Əliyev Əli Vəli 1'));
  assert.ok(r.reply.includes('administratorla əlaqə'));
});

test('buildReply — kurs tapılmadı halında kurs nümunəsi göstərilir', () => {
  const r = autoReply.buildReply('Qeydiyyatda Olmayan Adam 2');
  assert.strictEqual(r.kind, 'not_found');
  assert.ok(r.reply.includes('Nümunə: Əliyev Əli Vəli 2'));
});

test('buildReply — qadın adı üçün "xanım"', () => {
  const female = new CourseStore();
  female.load({
    records: [
      {
        name: 'Süleymanova Flora Fərrux qızı',
        code: 'SO',
        courseName: 'Bütün dənizçilər üçün təhlükəsizlik üzrə tanışlıq, ilkin hazırlıq və təlimat',
        startDate: '12.01.2026',
        startRaw: '12.01.2026',
        hasDate: true,
        finishDate: '12.01.2026',
        phone: '',
      },
    ],
  });
  sheets.courseStore = female;
  const r = autoReply.buildReply('Süleymanova Flora Fərrux 2');
  assert.ok(r.reply.includes('Flora xanım'));
  sheets.courseStore = courseStore;
});
