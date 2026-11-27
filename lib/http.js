/**
 * http.js — minimal HTTP/1.1 GET köməkçisi (Node 18+ global fetch əsasında).
 *
 * Xüsusiyyətlər:
 *  - istifadəçi-agenti (Google bəzi endpoint-ləri bot trafikini rədd edir);
 *  - vaxt aşımı (AbortController);
 *  - HTML cavabını aşkarlayır — Google "login" səhifəsi 200 statusu ilə
 *    qaytarır və bu, cədvəlin public olmadığına işarədir;
 *  - redirect-ləri avtomatik izləyir.
 */

/**
 * @param {string} url
 * @param {{timeoutMs?: number, maxBytes?: number, headers?: object}} [opts]
 * @returns {Promise<{status: number, text: string, contentType: string, url: string}>}
 */
async function getText(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const maxBytes = opts.maxBytes ?? 25 * 1024 * 1024;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(opts.headers || {}),
      },
    });

    const contentType = String(res.headers.get('content-type') || '');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(`Cavab çox böyükdür (${Math.round(buf.length / 1024 / 1024)} MB)`);
    }
    return {
      status: res.status,
      text: buf.toString('utf-8'),
      contentType,
      url: res.url || url,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Google üçün login/HTML səhifəsini aşkarlayır. */
function looksLikeHtml(text, contentType) {
  if (/text\/html/i.test(contentType)) return true;
  const head = String(text || '').slice(0, 800).trim().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

/**
 * Google Sheets CSV ixracını çəkir.
 * @param {string} csvUrl
 * @returns {Promise<{text: string, url: string}>}
 */
async function getSheetCsv(csvUrl) {
  const res = await getText(csvUrl, { timeoutMs: 45000 });
  if (looksLikeHtml(res.text, res.contentType)) {
    throw new Error(
      'Cədvəl açıq deyil (public link yoxdur). Google "giriş tələb olunur" səhifəsini qaytardı — cədvəli "Hər kəsə açıq" (Anyone with the link) etmək lazımdır.'
    );
  }
  if (!String(res.text || '').trim()) {
    throw new Error('Cədvəl boş qaytarıldı.');
  }
  return { text: res.text, url: res.url };
}

module.exports = { getText, getSheetCsv, looksLikeHtml };
