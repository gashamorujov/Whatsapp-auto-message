/**
 * autoReply — WhatsApp-a gələn mesajları analiz edib cavab mətnlərini quran mühərrik.
 *
 * Məqsəd: istifadəçi özü ilə danışmadan, bota yazdığı mətnə görə:
 *   • "1" → sertifikatların təhvil statusu (yalnız ad + status)
 *   • "2" → kurs qeydiyyatları və təlim tarixləri
 *
 * Təhlükəsizlik (sənəd §6):
 *   • FİN/şəxsi kodlarla axtarış edilmir;
 *   • cavabda yalnız ad, status və tarix göstərilir (sertifikat №, seriya,
 *     verilmə/qüvvət tarixi, kurs kodu, daxili ID açıqlanmır);
 *   • nömrə ilə əlaqələndirmə mövcuddursa, uyğun gəlməyən nömrəyə məlumat verilmir.
 *
 * Qarşılama (giriş) mesajının göndərilməsi waDispatcher tərəfindən idarə olunur
 * — hər istifadəçiyə YALNIZ BİR DƏFƏ göndərilir.
 */
const { cleanText } = require('../lib/myfunc');
const { tokens } = require('../lib/nameMatch');
const { detectSensitiveQuery, checkIdentity } = require('../lib/security');
const sheets = require('./sheetsManager');
const settings = require('../settings');

/**
 * Qarşılama mesajı (sənəd §3) — hər istifadəçiyə yalnız bir dəfə göndərilir.
 */
const WELCOME_MESSAGE = [
  'Salam! *İST Services Dənizcilik Təlim Mərkəzinə* müraciət etdiyiniz üçün təşəkkür edirik.',
  '',
  'Sizə lazım olan məlumatı əldə etmək üçün aşağıdakı seçimlərdən istifadə edə bilərsiniz.',
  '',
  '*1. Sertifikatın statusunu yoxlamaq*',
  '',
  'Sertifikatınızın hazır olub-olmadığını və təhvil statusunu öyrənmək üçün adınızı, soyadınızı, ata adınızı və *1* rəqəmini yazın.',
  '',
  '*Nümunə:* Əliyev Əli Vəli 1',
  '',
  '*2. Kurs qeydiyyatlarını yoxlamaq*',
  '',
  'Qeydiyyatda olduğunuz kurslar və təlim tarixləri barədə məlumat almaq üçün adınızı, soyadınızı, ata adınızı və *2* rəqəmini yazın.',
  '',
  '*Nümunə:* Əliyev Əli Vəli 2',
  '',
  '*Əlavə məlumat və ya digər suallarınız olarsa,* sualınızı mətn və ya səsli mesaj şəklində göndərə bilərsiniz. Müraciətiniz ən qısa zamanda cavablandırılacaq.',
].join('\n');

/**
 * Sorğunun formatı düzgün deyilsə göndərilən standart cavab (sənəd §7).
 */
const FORMAT_HELP_MESSAGE = [
  'Sorğunuzun formatı düzgün deyil.',
  '',
  'Sertifikat məlumatı üçün:',
  '*Soyad Ad Ata adı 1*',
  '',
  'Kurs qeydiyyatı üçün:',
  '*Soyad Ad Ata adı 2*',
  '',
  'Əlavə məlumat üçün administratorla əlaqə saxlaya bilərsiniz.',
].join('\n');

/** Səsli mesaj — yazı ilə cavab verilir (xarici transkripsiya xidməti yoxdur). */
const VOICE_HINT =
  '🎙 Səsli mesajınız qeydə alındı. Lakin cavab yalnız yazı ilə verilir — zəhmət olmasa sorğunuzu mətn ilə yazın.';

/** Şəkil/sənəd/video məzmunu avtomatik axtarılmır (sənəd §6.8). */
const MEDIA_NOTE =
  '📎 Göndərdiyiniz faylın (şəkil, sənəd, video) məzmunu avtomatik olaraq axtarılmır — təhlükəsizlik üçün fayl içəriyi təhlil edilmir. Sorğunuzu mətn ilə yazın.';

/** Şəxsi identifikatorla sorğu bloklanır (sənəd §6.1-§6.3). */
const SENSITIVE_QUERY_MESSAGE = [
  '🔒 Bu cür sorğularla axtarış aparılmır.',
  '',
  'FİN kodu, şəxsiyyət vəsiqəsi nömrəsi, doğum tarixi, diplom nömrəsi və digər şəxsi identifikasiya məlumatları ilə məlumat axtarılmır.',
  '',
  'Sorğunuzu yalnız ad, soyad, ata adı və rəqəm formatında göndərin:',
  '*Sertifikat məlumatı üçün:* Soyad Ad Ata adı 1',
  '*Kurs qeydiyyatı üçün:* Soyad Ad Ata adı 2',
  '',
  'Administratorla əlaqə saxlaya bilərsiniz.',
].join('\n');

/** Nömrə ilə əlaqələndirmə uyğun gəlmədi (sənəd §6.11). */
const IDENTITY_MISMATCH_MESSAGE = [
  '🔒 Sorğunuzun təsdiqi mümkün olmadı.',
  '',
  'Sertifikat və kurs məlumatları yalnız sorğunu göndərən nömrə ilə əlaqələndirilmiş qeydlər üçün göstərilir. Bu halda nömrə uyğun gəlmədiyi üçün məlumat göstərilmədi.',
  '',
  'Administratorla əlaqə saxlaya bilərsiniz.',
].join('\n');

/** Kurs cavabının sonundakı qeyd (sənəd §2). */
const COURSE_NOTE =
  'Qeyd: *Tarixlərdə hər hansı bir dəyişiklik olarsa, məlumat verəcəyik. Kurs başlamamışdan 1 gün əvvəl hər kəsə kurs haqqında məlumat veriləcək.*';

const KIND = { CERT: 'certificate', COURSE: 'course' };

const ICON_DELIVERED = '🟢';
const ICON_NOT_DELIVERED = '❌';

/**
 * Mətnin sonundakı rəqəmə görə sorğunun növünü müəyyən edir.
 *
 * @param {string} text
 * @returns {{kind: 'certificate'|'course'|null, name: string, suffix: string|null}}
 */
function parseIntent(text) {
  const clean = cleanText(text);
  if (!clean) return { kind: null, name: '', suffix: null };

  const m = clean.match(/(?:^|[\s,;:.\-–—])(\d{1,2})\s*[.!]?\s*$/);
  if (!m) return { kind: null, name: '', suffix: null };

  const suffix = m[1];
  const name = clean.slice(0, m.index).replace(/[\s,;:.\-–—]+$/, '').trim();

  let kind = null;
  if (suffix === '1') kind = KIND.CERT;
  else if (suffix === '2') kind = KIND.COURSE;
  if (!kind) return { kind: null, name: '', suffix };

  if (!isPlausibleName(name)) return { kind: null, name: '', suffix };
  return { kind, name, suffix };
}

/** Ad mətninin "soyadı ad [atasının adı]" formasında olub-olmadığını yoxlayır. */
function isPlausibleName(name) {
  const t = tokens(name);
  if (t.length < 2 || t.length > 8) return false;
  if (t.some((tok) => /\d/.test(tok))) return false;
  if (t.some((tok) => tok.length < 2)) return false;
  return true;
}

/**
 * Adın birinci adını (2-ci token) və cinsi qarşılığını müəyyən edir.
 * Orijinal yazılış qorunur ("Əli" → "Əli", "Flora" → "Flora").
 */
function personSalutation(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstName = parts[1] || parts[0] || '';
  const female = /(qızı|qız|xanım)/i.test(String(name || ''));
  return { firstName, honorific: female ? 'xanım' : 'bəy' };
}

/** Adı "Əliyev Əli Vəli" formasında (ilk hərfi böyük) qaytarır. */
function titleCase(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase('az-AZ') + w.slice(1))
    .join(' ');
}

/** "Salam, İlham bəy, hər vaxtınız xeyir." */
function buildSalutation(name) {
  const sal = personSalutation(name);
  return `Salam, ${sal.firstName} ${sal.honorific}, hər vaxtınız xeyir.`;
}

/**
 * Qarşılama mesajı + mesaj növünə görə əlavə qeyd.
 * @param {'text'|'voice'|'image'|'video'|'document'|'other'} [kind]
 */
function buildGreeting(kind = 'text') {
  if (kind === 'voice') return `${WELCOME_MESSAGE}\n\n${VOICE_HINT}`;
  if (['image', 'video', 'document'].includes(kind)) return `${WELCOME_MESSAGE}\n\n${MEDIA_NOTE}`;
  return WELCOME_MESSAGE;
}

/**
 * Sertifikat cavabı — YALNIZ ad və təhvil statusu (sənəd §1).
 * Sertifikat №, seriya, verilmə və qüvvət tarixi GÖSTƏRİLMİR.
 *
 * @param {string} name — axtarılan ad
 * @param {any[]} records — tapılmış sertifikat sətirləri
 */
function buildCertificateReply(name, records) {
  const head = buildSalutation(records[0]?.name || name);
  const lines = records.map((r, i) => {
    const delivered = r.status === 'delivered';
    const icon = delivered ? ICON_DELIVERED : ICON_NOT_DELIVERED;
    const statusText = delivered ? 'Təhvil verilib' : 'Təhvil verilməyib';
    return `${i + 1}. *${r.courseName}* — ${statusText} ${icon}`;
  });

  return [head, '', 'Sertifikatlarınızın təhvil statusu:', '', ...lines].join('\n');
}

/**
 * Kurs qeydiyyatı cavabı — ad + başlama/bitmə tarixləri (sənəd §2).
 *
 * @param {string} name
 * @param {any[]} records
 */
function buildCourseReply(name, records) {
  const head = buildSalutation(records[0]?.name || name);

  // Eyni kurs (eyni ad + eyni başlama tarixi) təkrarlarını birləşdir
  const merged = new Map();
  for (const r of records) {
    const key = `${r.courseName}::${r.startDate || r.startRaw || ''}`;
    if (!merged.has(key)) merged.set(key, r);
  }

  const lines = [...merged.values()].map((r, i) => {
    const start = r.hasDate && r.startDate ? r.startDate : 'qeyd olunmayıb';
    const finish = r.finishDate && String(r.finishDate).trim() ? String(r.finishDate).trim() : 'qeyd olunmayıb';
    return `${i + 1}. *${r.courseName}* — Başlama: ${start} | Bitmə: ${finish}`;
  });

  return [
    head,
    '',
    'Kurs qeydiyyatlarınız və təlim tarixləri aşağıdakı kimidir:',
    '',
    ...lines,
    '',
    COURSE_NOTE,
  ].join('\n');
}

/** Tapılmadı halında cavab. */
function buildNotFoundReply(name, kind) {
  const hint =
    kind === KIND.CERT
      ? 'Sertifikatınız üzrə məlumat tapılmadı.'
      : 'Kurs qeydiyyatınız üzrə məlumat tapılmadı.';
  return [
    `Salam, ${titleCase(name)}! ${hint}`,
    '',
    'Zəhmət olmasa adınızı cədvəldəki kimi yazın (Soyadı, Ad, Atasının adı) və rəqəmi əlavə edin.',
    kind === KIND.CERT ? 'Nümunə: Əliyev Əli Vəli 1' : 'Nümunə: Əliyev Əli Vəli 2',
    '',
    'Əlavə məlumat üçün administratorla əlaqə saxlaya bilərsiniz.',
  ].join('\n');
}

/** Birdən çox şəxse uyğun gələndə cavab (sənəd §6.10). */
function buildAmbiguousReply(name, candidates) {
  const list = candidates.slice(0, 6).map((c) => `• ${titleCase(c)}`).join('\n');
  return [
    `Salam, ${titleCase(name)}! Bu ad bir neçə şəxsə uyğun gəlir.`,
    '',
    'Məlumat qarışdırılmaması üçün dəqiq adı seçib yenidən göndərin:',
    list,
    '',
    'Dəqiqləşdirmək üçün administratorla əlaqə saxlaya bilərsiniz.',
  ].join('\n');
}

/** Məlumat bazası hələ yüklənməyib halında. */
function buildNotReadyReply() {
  return [
    'Salam! Bot məlumat bazasını hələ yükləyir.',
    '',
    'Bir-iki dəqiqə sonra yenidən yazın — sorğunuz dərhal cavablandırılacaq.',
  ].join('\n');
}

/**
 * Əsas funksiya: mesaj mətnindən cavabı qurur.
 *
 * @param {string} text — WhatsApp-dan gələn mətn (boş ola bilər)
 * @param {{isVoice?: boolean, phone?: string, kind?: string}} [meta]
 * @returns {{reply: string|null, kind: string, matched: boolean, intent: object}}
 */
function buildReply(text, meta = {}) {
  const intent = parseIntent(text);

  // Şəxsi identifikatorla sorğu — axtarış aparılmır (sənəd §6)
  const sensitive = detectSensitiveQuery(text);
  if (sensitive.blocked) {
    return {
      reply: SENSITIVE_QUERY_MESSAGE,
      kind: 'sensitive_query',
      matched: false,
      intent,
      reason: sensitive.label,
    };
  }

  // Səsli mesaj — yazı ilə cavab verilir, məzmunu axtarılmır (sənəd §6.8)
  if (meta.isVoice) {
    return { reply: VOICE_HINT, kind: 'voice', matched: false, intent };
  }

  // Şəkil/sənəd/video — fayl məzmunu təhlil edilmir (sənəd §6.8)
  if (['image', 'video', 'document'].includes(meta.kind)) {
    return { reply: MEDIA_NOTE, kind: 'media', matched: false, intent };
  }

  if (!intent.kind) {
    // Tanınmayan mesaj — cavabı waDispatcher seçir (qarşılama yoxsa format yardımı)
    return { reply: null, kind: 'unknown', matched: false, intent };
  }

  const store = intent.kind === KIND.CERT ? sheets.certificateStore : sheets.courseStore;

  if (!store || !store.size) {
    return { reply: buildNotReadyReply(), kind: 'not_ready', matched: false, intent };
  }

  const result = store.find(intent.name);

  // Ambiguous — bir neçə şəxse uyğun gəlir: dəqiqləşdirmə tələb olunur
  if (result.ambiguous) {
    return {
      reply: buildAmbiguousReply(intent.name, result.candidates),
      kind: 'ambiguous',
      matched: false,
      intent,
      matchType: result.matchType,
    };
  }

  if (!result.found) {
    return { reply: buildNotFoundReply(intent.name, intent.kind), kind: 'not_found', matched: false, intent };
  }

  // Nömrə ilə əlaqələndirmə — uyğun gəlmirsə məlumat açıqlanmır (sənəd §6.11)
  const identity = checkIdentity(result.records, meta.phone);
  if (settings.waPhoneCheck && identity.checked && !identity.ok) {
    return {
      reply: IDENTITY_MISMATCH_MESSAGE,
      kind: 'identity_mismatch',
      matched: false,
      intent,
      matchType: result.matchType,
    };
  }

  const reply =
    intent.kind === KIND.CERT
      ? buildCertificateReply(intent.name, result.records)
      : buildCourseReply(intent.name, result.records);

  return { reply, kind: intent.kind, matched: true, intent, matchType: result.matchType, records: result.records };
}

module.exports = {
  WELCOME_MESSAGE,
  FORMAT_HELP_MESSAGE,
  VOICE_HINT,
  MEDIA_NOTE,
  SENSITIVE_QUERY_MESSAGE,
  IDENTITY_MISMATCH_MESSAGE,
  COURSE_NOTE,
  ICON_DELIVERED,
  ICON_NOT_DELIVERED,
  KIND,
  parseIntent,
  buildReply,
  buildGreeting,
  buildSalutation,
  buildCertificateReply,
  buildCourseReply,
  buildNotFoundReply,
  buildAmbiguousReply,
  isPlausibleName,
  personSalutation,
  titleCase,
};
