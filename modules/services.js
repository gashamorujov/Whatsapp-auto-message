/**
 * Services — paylaşılan vəziyyət (singleton).
 */
let telegramMessenger = null;

function setTelegramMessenger(m) {
  telegramMessenger = m;
}

function getTelegramMessenger() {
  return telegramMessenger;
}

module.exports = { setTelegramMessenger, getTelegramMessenger };
