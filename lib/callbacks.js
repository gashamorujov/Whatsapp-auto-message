/**
 * callbacks — inline düymələrin callback_data formatı və yoxlanması.
 *
 * Format (Telegram limiti: ≤ 64 bayt):
 *   statik:   menu | st | rq | ref | wa | out | pair | qr | cc
 *   namespace:<ns>:<action>[:<arg>]
 *
 * Namespace-lər:
 *   shc — sertifikat cədvəli (menu | lnk | ref | test | info)
 *   shk — kurs cədvəli      (menu | lnk | ref | test | info)
 *   sh  — ümumi axın        (save)
 *   cf  — ayarlar            (menu | reply | fwd | priv | rate)
 *   us  — istifadəçilər      (menu | rst:<nömrə> | rstok:<nömrə> | all | allok)
 */
const STATIC = new Set(['menu', 'st', 'rq', 'ref', 'wa', 'out', 'pair', 'qr', 'cc']);

const ARG = {
  none: null,
  sheetKind: /^(cert|course)$/,
  phone: /^\d{7,15}$/,
};

const NAMESPACES = {
  shc: {
    menu: ARG.none,
    lnk: ARG.none,
    ref: ARG.none,
    test: ARG.none,
    info: ARG.none,
  },
  shk: {
    menu: ARG.none,
    lnk: ARG.none,
    ref: ARG.none,
    test: ARG.none,
    info: ARG.none,
  },
  sh: {
    save: ARG.none,
  },
  cf: {
    menu: ARG.none,
    reply: ARG.none,
    fwd: ARG.none,
    priv: ARG.none,
    phone: ARG.none,
    rate: ARG.none,
  },
  us: {
    menu: ARG.none,
    rst: ARG.phone,
    rstok: ARG.phone,
    all: ARG.none,
    allok: ARG.none,
  },
};

const MAX_BYTES = 64;

/**
 * @param {string} data
 * @returns {{ok: true, kind: 'static'|'ns', name?: string, ns?: string, action?: string, arg?: string|null}
 *   | {ok: false, reason: string}}
 */
function parseCallback(data) {
  if (typeof data !== 'string' || data.length === 0) return { ok: false, reason: 'empty' };
  if (Buffer.byteLength(data, 'utf8') > MAX_BYTES) return { ok: false, reason: 'too-long' };

  if (STATIC.has(data)) return { ok: true, kind: 'static', name: data };

  const [ns, action, ...rest] = data.split(':');
  const actions = NAMESPACES[ns];
  if (!actions || !action || !Object.prototype.hasOwnProperty.call(actions, action)) {
    return { ok: false, reason: 'unknown' };
  }
  const rule = actions[action];
  const arg = rest.length > 0 ? rest.join(':') : null;
  if (rule === null) {
    if (arg !== null) return { ok: false, reason: 'unexpected-arg' };
  } else if (arg === null || !rule.test(arg)) {
    return { ok: false, reason: 'bad-arg' };
  }
  return { ok: true, kind: 'ns', ns, action, arg };
}

/** Bu callback-lər çat kilidini gözləməməlidir (ləğv həmişə dərhal işləməlidir). */
function bypassesLock(data) {
  return data === 'cc';
}

/** inline_keyboard-dakı bütün callback_data-ları toplayır (testlər üçün). */
function collectCallbackData(keyboard) {
  const out = [];
  for (const row of keyboard || []) {
    for (const btn of row) if (btn && btn.callback_data) out.push(btn.callback_data);
  }
  return out;
}

module.exports = { parseCallback, bypassesLock, collectCallbackData, STATIC, NAMESPACES, MAX_BYTES };
