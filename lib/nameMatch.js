/**
 * nameMatch — ad uyğunlaşma mühərriki.
 *
 * Azərbaycan adları "Soyadı Ad Atasının adı" formatında yazılır və
 * cədvəllərdə bəzən "oğlu/qızı" sözü əlavə olunur. İstifadəçi isə
 * bəzən ata adını yazmır. Buna görə matching 4 səviyyəlidir:
 *
 *   1. Dəqiq      — tam ad (böyük/kiçik hərf, nöqtə, tire fərq etmir)
 *   2. Yumşaq     — ə→a/ə→e, ö→o, ü→u, ç→c, ş→s, ğ→g, ı→i
 *   3. Prefix     — istifadəçi adın başlanğıcını yazıb (atasının adını qısaltıb)
 *   4. Soyad+Ad   — yalnız "Soyadı Ad" (2 token), unikal olduqda
 *
 * Əgər eyni ad birdən çox fərqli insana uyğun gəlirsə, nəticə
 * "ambiguous" olur — bot istifadəçidən dəqiq ad tələb edir
 * (səhv şəxsə məlumat vermək riski olur).
 */
const KINSHIP = new Set(['oglu', 'qizi', 'oğlu', 'qızı', 'qiz', 'oghlu', 'qizi']);

/** Sadələşdirmə cədvəli (ə ayrıca idarə olunur). */
const FOLD = { ö: 'o', ü: 'u', ç: 'c', ş: 's', ğ: 'g', ı: 'i' };

/** Sətiri normallaşdırır (hərflər saxlanılır, yalnız kiçik hərf + ayrıqlar). */
function normalize(value) {
  return String(value === null || value === undefined ? '' : value)
    .toLowerCase()
    .replace(/[\u0307\u0308]/g, '')
    .replace(/[^a-z0-9əöüçşğı ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Yumşaq variantlar: "ə" hərfi həm "a", həm "e" kimi qəbul edilir
 * ("Əliyev" → "aliyev" və "eliyev"), beləliklə hər iki yazılış tapılır.
 * @param {string} value
 * @returns {string[]}
 */
function looseVariants(value) {
  const base = normalize(value);
  if (!base) return [];
  const foldRest = (s) => s.replace(/[öüçşğı]/g, (c) => FOLD[c] || c);
  const variants = new Set([foldRest(base.replace(/ə/g, 'a')), foldRest(base.replace(/ə/g, 'e'))]);
  return [...variants];
}

/** Hərfləri sadələşdirir (ə→a). */
function loosen(value) {
  return looseVariants(value)[0] || '';
}

/** Tokenlərə bölr (artıq boşluqlar təmizlənir). */
function tokens(value) {
  const n = normalize(value);
  return n ? n.split(' ') : [];
}

/** Adı "soyad ad ..." formatında qısaltır — ilk 2 token. */
function firstTwo(value) {
  const t = tokens(value);
  return t.length >= 1 ? t.slice(0, 2).join(' ') : '';
}

/** Son token "oğlu/qızı" mı? */
function endsWithKinship(tok) {
  return tok.length > 0 && KINSHIP.has(tok);
}

/**
 * Ad indeksi qurur.
 * @param {Array<{name: string}>} records
 */
function buildIndex(records) {
  const byExact = new Map();
  const byLoose = new Map();
  const byFirst2 = new Map(); // "soyad ad" → Set(fullName)
  const fullNames = new Set();
  const origByNorm = new Map(); // normalize(ad) → orijinal yazılış

  const push = (map, key, rec) => {
    if (!key) return;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(rec);
  };

  for (const rec of records) {
    const name = String(rec.name || '').trim();
    if (!name) continue;
    const n = normalize(name);
    if (!n) continue;

    push(byExact, n, rec);
    for (const variant of looseVariants(name)) push(byLoose, variant, rec);
    fullNames.add(n);
    if (!origByNorm.has(n)) origByNorm.set(n, name);

    const f2 = firstTwo(name);
    if (f2) {
      let set = byFirst2.get(f2);
      if (!set) {
        set = new Set();
        byFirst2.set(f2, set);
      }
      set.add(n);
    }
  }

  return { byExact, byLoose, byFirst2, fullNames, origByNorm, size: records.length };
}

/**
 * Prefix uyğunlaşması: sorğu adın başlanğıcını təşkil edirsə.
 * Arada 1-2 token qəbul edilir (atasının adı), sonuncu token "oğlu/qızı"
 * ola bilər.
 */
function prefixAllowed(extra) {
  if (extra.length <= 2) return true;
  return extra.length === 3 && endsWithKinship(extra[2]);
}

/**
 * Ad axtarışı.
 * @param {string} query
 * @param {ReturnType<typeof buildIndex>} index
 * @returns {{found: boolean, records: any[], matchType: string, ambiguous: boolean, candidates: string[]}}
 */
function findByName(query, index) {
  const q = normalize(query);
  const empty = { found: false, records: [], matchType: 'none', ambiguous: false, candidates: [] };
  if (!q || q.length < 3) return empty;

  // 1) Dəqiq
  const exact = index.byExact.get(q);
  if (exact && exact.length) {
    return { found: true, records: exact, matchType: 'exact', ambiguous: false, candidates: [] };
  }

  // 2) Yumşaq (ə/e/a fərqləri, ö/ü/ç/ş/ğ/ı)
  for (const variant of looseVariants(query)) {
    const loose = index.byLoose.get(variant);
    if (loose && loose.length) {
      return { found: true, records: loose, matchType: 'loose', ambiguous: false, candidates: [] };
    }
  }

  // 3) Prefix — istifadəçi adın başlanğıcını yazıb (atasının adını qısaltıb)
  const qt = q.split(' ');
  const prefixHits = [];
  const seenFull = new Set();
  for (const [full, recs] of index.byExact) {
    const ft = full.split(' ');
    if (ft.length < qt.length) continue;
    if (ft.slice(0, qt.length).join(' ') !== qt.join(' ')) continue;
    if (!prefixAllowed(ft.slice(qt.length))) continue;
    seenFull.add(full);
    prefixHits.push(...recs);
  }
  if (prefixHits.length) {
    return {
      found: true,
      records: prefixHits,
      matchType: 'prefix',
      ambiguous: seenFull.size > 1,
      candidates: [...seenFull].map((n) => index.origByNorm.get(n) || n),
    };
  }

  // 4) Yalnız "Soyadı Ad" — unikal olduqda
  const f2 = firstTwo(query);
  if (f2) {
    const names = index.byFirst2.get(f2);
    if (names && names.size === 1) {
      const only = [...names][0];
      const recs = index.byExact.get(only) || [];
      if (recs.length) {
        return { found: true, records: recs, matchType: 'surname-firstname', ambiguous: false, candidates: [] };
      }
    } else if (names && names.size > 1) {
      return {
        found: false,
        records: [],
        matchType: 'ambiguous',
        ambiguous: true,
        candidates: [...names].map((n) => index.origByNorm.get(n) || n),
      };
    }
  }

  return empty;
}

module.exports = {
  normalize,
  loosen,
  looseVariants,
  tokens,
  firstTwo,
  buildIndex,
  findByName,
  endsWithKinship,
  KINSHIP,
};
