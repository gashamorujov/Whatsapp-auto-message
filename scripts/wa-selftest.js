#!/usr/bin/env node
/**
 * WhatsApp özünü yoxlama (self-test).
 *
 * Sessiyanı açır, real cədvəl məlumatlarından bir sertifikat cavabı
 * qurur və onu WhatsApp-a göndərir — beləliklə "axtarış → cavab → göndərmə"
 * zənciri uçdan-uca yoxlanılır.
 *
 * İşə salmaq:  node scripts/wa-selftest.js
 */
const path = require('path');
const fs = require('fs');
process.env.BOT_DATA_DIR = process.env.BOT_DATA_DIR || path.join(__dirname, '..', 'data');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const NodeCache = require('node-cache');

const sheets = require('../modules/sheetsManager');
const autoReply = require('../modules/autoReply');

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');

function findSession() {
  if (!fs.existsSync(SESSIONS_DIR)) return null;
  for (const dir of fs.readdirSync(SESSIONS_DIR)) {
    if (dir === 'sessions.json' || dir.startsWith('.')) continue;
    if (fs.existsSync(path.join(SESSIONS_DIR, dir, 'creds.json'))) return dir;
  }
  return null;
}

async function main() {
  const phone = findSession();
  if (!phone) {
    console.error('❌ Sessiya tapılmadı. Əvvəlcə WhatsApp-a qoşulun.');
    process.exit(1);
  }
  console.log(`▶ Sessiya: +${phone}`);

  await sheets.refreshAll();

  // Real bir şəxs seç (təhvil verilmiş sertifikatı olan)
  const rec = sheets.certificateStore.records.find((r) => r.status === 'delivered');
  const query = `${rec.name} 1`;
  const result = autoReply.buildReply(query);
  console.log(`▶ Sorğu: "${query}"`);
  console.log('─'.repeat(70));
  console.log(result.reply);
  console.log('─'.repeat(70));

  const { state, saveCreds } = await useMultiFileAuthState(path.join(SESSIONS_DIR, phone));
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Android', 'Chrome', '20.0.04'],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' })),
    },
    markOnlineOnConnect: true,
    msgRetryCounterCache: new NodeCache(),
  });

  const opened = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 45000);
    sock.ev.on('connection.update', (s) => {
      if (s.connection === 'open') {
        clearTimeout(t);
        resolve(true);
      }
    });
  });

  if (!opened) {
    console.error('❌ WhatsApp-a qoşulma olmadı.');
    process.exit(1);
  }
  console.log('✅ WhatsApp sessiyası açıldı');

  const jid = `${phone}@s.whatsapp.net`;
  await sock.sendMessage(jid, {
    text: `🧪 *Bot özünü yoxlama testi*\n\nAşağıdakı cavab real cədvəl məlumatlarından hesablandı:\n\n${result.reply}`,
  });
  console.log(`✅ Test mesajı göndərildi: ${jid}`);

  await new Promise((r) => setTimeout(r, 1500));
  try {
    await saveCreds();
    sock.end(new Error('selftest done'));
  } catch {}
  console.log('✅ Test tamamlandı.');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Xəta:', e.message);
  process.exit(1);
});
