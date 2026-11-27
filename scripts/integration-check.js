#!/usr/bin/env node
/**
 * Real cədvəllərlə inteqrasiya yoxlaması.
 * İki cədvəli yükləyir, parse edir, indeksləyir və nümunə sorğuları
 * WhatsApp cavabı formatında çap edir.
 *
 * İşə salmaq:  node scripts/integration-check.js
 */
const path = require('path');
process.env.BOT_DATA_DIR = process.env.BOT_DATA_DIR || path.join(__dirname, '..', 'temp', 'integration-data');

const sheets = require('../modules/sheetsManager');
const autoReply = require('../modules/autoReply');

const SEP = '─'.repeat(74);

function show(label, value) {
  console.log(`${label.padEnd(26)} ${value}`);
}

async function main() {
  console.log(SEP);
  console.log('  İNTEQRASİYA YOXLAMASI — real Google Sheets məlumatları ilə');
  console.log(SEP);

  console.log('\n⏳ Cədvəllər yüklənir...\n');
  const res = await sheets.refreshAll();

  if (!res.certificate?.ok) {
    console.error('❌ Sertifikat cədvəli:', res.certificate?.error);
    process.exitCode = 1;
  } else {
    show('📜 Sertifikat sətirləri:', res.certificate.count);
    const st = sheets.certificateStore;
    show('   Təhvil verilib:', st.deliveredCount);
    show('   Təhvil verilməyib:', st.size - st.deliveredCount);
    show('   Status boş (qeyd yoxdur):', st.pendingCount);
    const codes = new Set(st.records.map((r) => r.code));
    show('   Unikal kurs kodu:', codes.size);
  }

  if (!res.course?.ok) {
    console.error('❌ Kurs cədvəli:', res.course?.error);
    process.exitCode = 1;
  } else {
    show('🎓 Kurs sətirləri:', res.course.count);
    show('   Unikal şəxs:', sheets.courseStore.peopleCount);
  }

  // Real şəxslərdən nümunə götür
  const certStore = sheets.certificateStore;
  const courseStore = sheets.courseStore;

  const samples = [];

  // Sertifikat cədvəlindən: təhvil verilmiş, təhvil verilməmiş və statusu boş sətirlər
  const delivered = certStore.records.find((r) => r.status === 'delivered');
  const notDelivered = certStore.records.find((r) => r.statusRaw && r.statusRaw !== 'Təhvil verilib');
  const pending = certStore.records.find((r) => !r.statusRaw);

  for (const rec of [delivered, notDelivered, pending]) {
    if (rec) samples.push({ text: `${rec.name} 1`, label: `Sertifikat — ${rec.statusRaw || 'status boş'}` });
  }

  // Kurs cədvəlindən: tarixli və tarixsiz sətirlər
  const dated = courseStore.records.find((r) => r.hasDate);
  const undated = courseStore.records.find((r) => !r.hasDate);
  for (const rec of [dated, undated]) {
    if (rec) samples.push({ text: `${rec.name} 2`, label: `Kurs — ${rec.hasDate ? 'tarixli' : 'tarixsiz'}` });
  }

  console.log('\n' + SEP);
  console.log('  NÜMUNƏ CAVABLAR');
  console.log(SEP);

  for (const s of samples) {
    console.log(`\n▶  ${s.label}`);
    console.log(`   Sorğu: "${s.text}"`);
    const out = autoReply.buildReply(s.text);
    console.log('   ───────────────────────────────────────────');
    for (const line of out.reply.split('\n')) console.log(`   ${line}`);
    console.log('   ───────────────────────────────────────────');
    console.log(`   [növ: ${out.kind}${out.matchType ? ` / ${out.matchType}` : ''}]`);
  }

  // Uyğunlaşma keyfiyyəti: 300 real ad + "1" ilə sınaq
  console.log('\n' + SEP);
  console.log('  UYĞUNLAŞMA KEYFİYYƏTİ (sertifikat cədvəli, 300 nümunə)');
  console.log(SEP);

  const sample = certStore.records.slice(0, 300);
  let hit = 0;
  let miss = 0;
  const misses = [];
  for (const rec of sample) {
    const r = certStore.find(rec.name);
    if (r.found && r.records.some((x) => x.certNo === rec.certNo)) hit += 1;
    else {
      miss += 1;
      if (misses.length < 5) misses.push(rec.name);
    }
  }
  show('   Sınaq sayı:', sample.length);
  show('   Tapıldı:', hit);
  show('   Tapılmadı:', miss);
  if (misses.length) show('   Nümunə tapınmayanlar:', misses.join(' | '));

  // Atasının adı olmadan (2 token) sınaq
  let hit2 = 0;
  const sample2 = certStore.records.filter((r) => r.name.split(/\s+/).length >= 3).slice(0, 200);
  for (const rec of sample2) {
    const two = rec.name.split(/\s+/).slice(0, 2).join(' ');
    const r = certStore.find(two);
    if (r.found && !r.ambiguous) hit2 += 1;
  }
  show('   2 token (soyad+ad) sınaq:', `${hit2}/${sample2.length} tapıldı`);

  console.log('\n' + SEP + '\n');
}

main().catch((e) => {
  console.error('❌ Xəta:', e.message, e.stack);
  process.exit(1);
});
