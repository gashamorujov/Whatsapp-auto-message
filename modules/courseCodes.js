/**
 * courseCodes — kurs kodu → kurs adı xəritəsi.
 *
 * Bu rəsmi adlar İST Services Dənizcilik Təlim Mərkəzinin tərəfindən
 * təsdiqlənmişdir. Sertifikat cədvəlində ad sütunu özü də mövcuddur,
 * amma prioritet bu xəritədədir (COURSE_NAME_SOURCE=map, defolt).
 *
 * DQ kodu üçün iki variant qeydə alınıb — cədvəldə hər ikisi eyni kodu
 * daşıyır; defolt ad "Ümumi Operator" variantıdır, alternativ aşağıdadır.
 */

const COURSE_CATALOG = [
  { code: 'SP', name: 'Əmniyyətli İdarəetmə haqqında Beynəlxalq Məcəllə' },
  { code: 'SI', name: 'Gəminin Mühafizəsi üzrə ümumi hazırlıq və təlimat' },
  {
    code: 'SH',
    name: 'Gəminin Mühafizəsi üzrə müəyyən edilmiş vəzifələrə malik şəxslərin hazırlığı',
  },
  { code: 'RS', name: 'Gəmi Əmniyyətliyi üzrə Məsul Şəxs' },
  { code: 'SG', name: 'Gəmi mühafizəsi üzrə məsul Şəxs' },
  { code: 'SO', name: 'Bütün dənizçilər üçün təhlükəsizlik üzrə tanışlıq, ilkin hazırlıq və təlimat' },
  { code: 'SW', name: 'Kapitan Körpüsü Resurslarının İdarə Olunması' },
  { code: 'SV', name: 'Gəminin İdarə Olunması və Manevr Edilməsi' },
  {
    code: 'SQ',
    name: 'Radar, avtomatik radar müşahidə vasitələri, kapitan körpüsü komandası və axtarış xilasetmə (idarəetmə səviyyəsində)',
  },
  {
    code: 'SR',
    name: 'Radar müşahidəsi və təsviri, avtomatik radar müşahidəsi vasitələrinin istismarı (istismar səviyyəsində)',
  },
  {
    code: 'SZ',
    name: 'Elektron Xəritə Displeyinin və İnformasiya Sistemlərinin İstismar Qaydaları',
  },
  { code: 'SF', name: 'Sərnişinlərin, yükün və gəmi gövdəsinin təhlükəsizliyi üzrə hazırlıq' },
  {
    code: 'SD',
    name: 'Sərnişinlərə bilavasitə xidmət göstərən heyət üzvləri üçün təhlükəsizlik üzrə hazırlıq',
  },
  { code: 'SC', name: 'İzdihamın idarə olunması üzrə hazırlıq' },
  { code: 'SE', name: 'Böhran zamanı idarəetmə və insan davranışı üzrə hazırlıq' },
  { code: 'ST', name: 'Gəmi qazanalizatorları və onların istismarı' },
  { code: 'SX', name: 'İnert qaz sistemi' },
  { code: 'SN', name: 'Gəmidə ilk tibbi yardım' },
  { code: 'SM', name: 'Gəmidə tibbi nəzarət' },
  { code: 'DQ', name: 'Qlobal Dəniz Fəlakət və Əmniyyətli Rabitə Sisteminin Ümumi Operatoru' },
  {
    code: 'DQ',
    name: 'Qlobal Dəniz Fəlakət və Əmniyyətli Rabitə Sisteminin Ümumi rayon operatoru üçün qısaldılmış kursu',
    variant: true,
  },
  {
    code: 'SA',
    name: 'Neft və Kimyəvi maddələr daşıyan tankerlərdə yük əməliyyatına dair ilkin hazırlıq və kvalifikasiya',
  },
  { code: 'SB', name: 'Neft tankerlərdə yük əməliyyatına dair geniş proqram üzrə hazırlıq' },
  {
    code: 'AS',
    name: 'Kimyəvi maddələr daşıyan tankerlərdə yük əməliyyatına dair geniş proqram üzrə hazırlıq',
  },
  { code: 'SK', name: 'Təhlükəli və zərərli yüklərin daşınması' },
  { code: 'ER', name: 'Maşın şöbəsi resurslarının idarə olunması' },
  { code: 'DL', name: 'Liderlik və heyətlə iş birliyi' },
  { code: 'SJ', name: 'Yanğınla mübarizə geniş proqram üzrə' },
  { code: 'SL', name: 'Sürətli olmayan xilasedici qayıq, növbətçi qayıq və sallar üzrə mütəxəssis' },
  { code: 'SU', name: 'Sürətli xilasetmə qayıqlar üzrə mütəxəssis' },
  { code: 'XS', name: 'Təkmilləşdirmə' },
  { code: 'YS', name: 'İxtisasartırma' },
  { code: 'WS', name: 'Liman Vasitələrinin mühafizəsinə məsul şəxsin hazırlığı' },
];

/** kod → ad (birinci qeyd qazanır) */
const COURSE_NAME_BY_CODE = new Map();
/** kod → alternativ adlar */
const COURSE_VARIANTS = new Map();

for (const item of COURSE_CATALOG) {
  const code = String(item.code).toUpperCase();
  if (!COURSE_NAME_BY_CODE.has(code)) COURSE_NAME_BY_CODE.set(code, item.name);
  if (item.variant) {
    if (!COURSE_VARIANTS.has(code)) COURSE_VARIANTS.set(code, []);
    COURSE_VARIANTS.get(code).push(item.name);
  }
}

/** Bütün məlum kodlar (cədvəl sütunlarını avtomatik seçmək üçün). */
const KNOWN_CODES = new Set(COURSE_NAME_BY_CODE.keys());

/**
 * Kodu normallaşdırır: "sp" → "SP", " er " → "ER".
 * @param {string} code
 * @returns {string}
 */
function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * Kurs adını müəyyən edir.
 * @param {string} code — cədvəldəki kurs kodu
 * @param {string} sheetName — cədvəldəki "Kursun adı" (fallback)
 * @param {'map'|'sheet'} source — prioritet
 * @returns {string|null}
 */
function resolveCourseName(code, sheetName, source = 'map') {
  const c = normalizeCode(code);
  const mapped = c ? COURSE_NAME_BY_CODE.get(c) : null;
  const fromSheet = String(sheetName || '').trim();

  if (source === 'sheet') return fromSheet || mapped || null;
  return mapped || fromSheet || null;
}

/** Kodun xəritədə olub-olmadığını yoxlayır (cədvəl sütununun seçilməsi üçün). */
function isKnownCode(value) {
  const c = normalizeCode(value);
  if (!c || c.length > 3) return false;
  return KNOWN_CODES.has(c);
}

module.exports = {
  COURSE_CATALOG,
  COURSE_NAME_BY_CODE,
  COURSE_VARIANTS,
  KNOWN_CODES,
  normalizeCode,
  resolveCourseName,
  isKnownCode,
};
