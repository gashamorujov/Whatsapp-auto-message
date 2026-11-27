/**
 * menu — peşəkar, kompakt emoji-menyu (inline keyboards).
 *
 * Bütün düymələr qısa və mobil-uyğun dizayn edilib. Callback adları
 * lib/callbacks.js sxemi ilə 1:1 uyğundur.
 */

// Əsas menyu
const MAIN_MENU_BUTTONS = [
  [
    { text: '📊 Statistika', callback_data: 'st' },
    { text: '📋 Son sorğular', callback_data: 'rq' },
  ],
  [
    { text: '📜 Sertifikat cədvəli', callback_data: 'shc:menu' },
    { text: '🎓 Kurs cədvəli', callback_data: 'shk:menu' },
  ],
  [
    { text: '🔄 Cədvəlləri yenilə', callback_data: 'ref' },
    { text: '📲 WhatsApp qoşulma', callback_data: 'wa' },
  ],
  [
    { text: '👥 İstifadəçilər', callback_data: 'us:menu' },
    { text: '⚙️ Ayarlar', callback_data: 'cf:menu' },
  ],
  [{ text: '🚪 Çıxış', callback_data: 'out' }],
];

// WhatsApp qoşulma menyusu
const CONNECTION_MENU_BUTTONS = [
  [
    { text: '🔐 Pair Code', callback_data: 'pair' },
    { text: '📷 QR Code', callback_data: 'qr' },
  ],
  [{ text: '↩️ Geri', callback_data: 'menu' }],
];

// Cədvəl menyusu (sertifikat / kurs — eyni struktur)
function sheetMenuButtons(kind) {
  const p = kind === 'course' ? 'shk' : 'shc';
  return [
    [
      { text: '🔗 Linki dəyiş', callback_data: `${p}:lnk` },
      { text: '🔄 Yenilə', callback_data: `${p}:ref` },
    ],
    [
      { text: '🧪 Yoxla (test)', callback_data: `${p}:test` },
      { text: '📄 Təfərrüatlar', callback_data: `${p}:info` },
    ],
    [{ text: '↩️ Geri', callback_data: 'menu' }],
  ];
}

// Ayarlar menyusu
const SETTINGS_MENU_BUTTONS = [
  [
    { text: '🤖 Avtomatik cavab', callback_data: 'cf:reply' },
    { text: '📨 Telegram ötürmə', callback_data: 'cf:fwd' },
  ],
  [
    { text: '👤 Yalnız fərdi chat', callback_data: 'cf:priv' },
    { text: '📱 Nömrə yoxlaması', callback_data: 'cf:phone' },
  ],
  [
    { text: '🚦 Rate limit', callback_data: 'cf:rate' },
    { text: '↩️ Geri', callback_data: 'menu' },
  ],
];

// Ləğv (hər axında)
const CANCEL_BUTTON = [[{ text: '⛔ Ləğv et', callback_data: 'cc' }]];

// ─── İstifadəçilər menyusu (qarşılama statusu + Restart) ───

/** Bir istifadəçi üçün fərdi restart düyməsi (bir sətir). */
function userRestartButton(phone) {
  return [[{ text: `🔄 Restart · +${phone}`, callback_data: `us:rst:${phone}` }]];
}

/** Ümumi restart (təsdiqləmə tələb edir). */
const RESTART_ALL_BUTTONS = [
  [{ text: '🔄 Bütün istifadəçiləri restart et', callback_data: 'us:all' }],
  [{ text: '↩️ Geri', callback_data: 'menu' }],
];

/** Fərdi restart təsdiqi. */
function confirmUserRestartButtons(phone) {
  return [
    [{ text: '✅ Bəli, sıfırla', callback_data: `us:rstok:${phone}` }],
    [{ text: '✖️ Ləğv et', callback_data: 'cc' }],
  ];
}

/** Ümumi restart təsdiqi. */
const CONFIRM_RESTART_ALL_BUTTONS = [
  [{ text: '✅ Bəli, hamısını sıfırla', callback_data: 'us:allok' }],
  [{ text: '✖️ Ləğv et', callback_data: 'cc' }],
];

// Link təsdiqi
const CONFIRM_SAVE_BUTTONS = [
  [{ text: '✅ Saxla və yenilə', callback_data: 'sh:save' }],
  [{ text: '✖️ Ləğv et', callback_data: 'cc' }],
];

// Ümumi "geri" düyməsi
const BACK_BUTTON = [[{ text: '↩️ Geri', callback_data: 'menu' }]];

const MENU_BUTTON = [[{ text: '🏠 Menyu', callback_data: 'menu' }]];

module.exports = {
  MAIN_MENU_BUTTONS,
  CONNECTION_MENU_BUTTONS,
  sheetMenuButtons,
  SETTINGS_MENU_BUTTONS,
  CANCEL_BUTTON,
  CONFIRM_SAVE_BUTTONS,
  userRestartButton,
  RESTART_ALL_BUTTONS,
  confirmUserRestartButtons,
  CONFIRM_RESTART_ALL_BUTTONS,
  BACK_BUTTON,
  MENU_BUTTON,
};
