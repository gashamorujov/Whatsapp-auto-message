/**
 * config.js — yeganə yerdə doldurmalı olduğunuz fayl.
 *
 * Telegram bot tokenini TELEGRAM_TOKEN mühit dəyişəni ilə verin.
 * 2) Cədvəl linkləri — default olaraq artıq qoyulub. Telegram-dan
 *    "🎓 Kurs cədvəli" / "📜 Sertifikat cədvəli" düymələri ilə
 *    istədiyiniz vaxt dəyişə bilərsiniz (dəyişiklik data/sheets.json-da qalır).
 *
 * Hər iki dəyər ətraf mühit dəyişəni ilə də verilə bilər (ətraf mühit üstündür):
 *   TELEGRAM_TOKEN
 *   SHEET_CERT_URL / SHEET_COURSE_URL
 */
module.exports = {
  // @BotFather-dan aldığınız bot tokenı
  telegramToken: process.env.TELEGRAM_TOKEN || '',

  // Cədvəl linkləri — Telegram panelində dəyişdirilə bilər.
  sheets: {
    certificate: {
      label: 'Sertifikat cədvəli',
      url: 'https://docs.google.com/spreadsheets/d/14A3Utt4RZLy2uP0XSFL_gsEJf8a2k_4P/edit?gid=1252670317#gid=1252670317',
    },
    course: {
      label: 'Kurs qeydiyyatı cədvəli',
      url: 'https://docs.google.com/spreadsheets/d/19Ggn9KY6a8a1PaU0vdCOTakmkYounGqt/edit?gid=803500785#gid=803500785',
    },
  },
};
