# İST Services Dənizcilik Təlim Mərkəzi — WhatsApp Avtomatik Sorğu Botu

WhatsApp-a yazılan hər mesajı **avtomatik cavablandıran** bot. İki əsas funksiya:

| Sorğu | Nəticə |
|---|---|
| `Əliyev Əli Vəli 1` | Şəxsin **sertifikatları** və təhvil vəziyyəti (yalnız ad + status) |
| `Əliyev Əli Vəli 2` | Şəxsin **kurs qeydiyyatları** və təlim tarixləri |

Cədvəl məlumatları Google Sheets-dən saatda bir dəfə çəkilir və yadda saxlanılır.
Bütün idarəetmə (link dəyişmə, statistika, test, Restart) **Telegram panelində** aparılır.

> ⚙️ Telegram tokenini `TELEGRAM_TOKEN` mühit dəyişəni ilə verin.
> Cədvəl linkləri `config.js` faylındadır:
>
> ```bash
> npm install
> node bot.js        # və ya: npm start
> ```
>
> `.env` faylı yalnız **mühit dəyişənləri ilə override** etmək istəyirsinizsə
> lazımdır (və varsa `settings.js` tərəfindən oxunur).

---

## 📸 necə işləyir

```
WhatsApp istifadəçisi           Bot (Baileys)                  Google Sheets
        │                           │                               │
        │  "Əliyev Əli Vəli 1"     │                               │
        ├──────────────────────────►│                               │
        │                           │  saatda 1 dəfə CSV çəkilişi  │
        │                           ├──────────────────────────────►│
        │                           │◄──────────────────────────────┤
        │                           │  CSV → parse → indeks         │
        │                           │  ad → sertifikat/kurs        │
        │◄──────────────────────────┤                               │
        │  "✅ *Kurs adı* —          │                               │
        │   Təhvil verilib 🟢"      │                               │
        │                           ├──── monitorinq ────► Telegram│
        │  (qarşılama: YALNIZ 1 dəfə)│                               │
```

---

## ⚡ Quraşdırma

### 1. Tələblər
- Node.js **18+** (20+ tövsiyə olunur)
- Telegram bot tokeni ([@BotFather](https://t.me/BotFather))
- WhatsApp nömrəsi (bot kimi qoşulacaq hesab)
- **Hər iki Google Sheets cədvəli "Hər kəsə açıq" (Anyone with the link) olmalıdır**

### 2. Qurulum

```bash
npm install
```

### 3. Konfiqurasiya — `config.js`

```js
module.exports = {
  telegramToken: process.env.TELEGRAM_TOKEN || '', // @BotFather-dan alınan tokeni env-də verin
  sheets: {
    certificate: { url: 'https://docs.google.com/spreadsheets/d/.../edit?gid=...' },
    course:      { url: 'https://docs.google.com/spreadsheets/d/.../edit?gid=...' },
  },
};
```

> Tokeni `TELEGRAM_TOKEN` mühit dəyişəni ilə konfiqurasiya edin.
> Real tokenləri repository-yə əlavə etməyin.

### 4. İşə salmaq

```bash
node bot.js                 # ⭐ əsas giriş (Telegram paneli + WhatsApp cavabı)
node bot.js --telegram-only # yalnız Telegram idarəetmə paneli
node bot.js --no-health     # health server olmadan
npm start                    # = node bot.js
```

**Arxa planda (tövsiyə olunan):**
```bash
bash scripts/start.sh     # başladır (PID faylı ilə)
bash scripts/stop.sh      # dayandırır
tail -f logs/bot.log      # logları izləmək
```

> `scripts/start.sh` botu `nohup` ilə fon rejimində başladır, PID faylını
> `logs/bot.pid` altında saxlayır və logu `logs/bot.log` faylına yazır.

### 5. WhatsApp-a qoşulma

Telegram-da botu açın → **📲 WhatsApp qoşulma**:

- **🔐 Pair Code** → nömrənizi ölkə kodu ilə göndərin (`994501234567`),
  bot 4 rəqəmli kodu verir → WhatsApp → **Linked Devices → Link with phone number** → kodu daxil edin.
- **📷 QR Code** → bot QR şəkli göndərir → WhatsApp → **Linked Devices → Link a Device → Scan**.

Sessiya `sessions/` qovluğunda saxlanılır — bot yenidən başladıqda avtomatik qoşulur.

---

## 🎛 Telegram paneli

| Düymə | İş |
|---|---|
| 📊 **Statistika** | Gələn mesaj, göndərilən cavab, sertifikat/kurs sorğu sayları, cədvəl vəziyyəti, xəta sayğacı |
| 📋 **Son sorğular** | Son 10 sorğunun mətnsi və nəticəsi |
| 👥 **İstifadəçilər** | WhatsApp istifadəçilərinin siyahısı, qarşılama statusu, son mesaj tarixi, **Restart** düymələri |
| 📜 **Sertifikat cədvəli** | Linki dəyiş / yenilə / test et / təfərrüatlar |
| 🎓 **Kurs cədvəli** | Linki dəyiş / yenilə / test et / təfərrüatlar |
| 🔄 **Cədvəlləri yenilə** | İki cədvəli dərhal yenidən çəkir |
| 📲 **WhatsApp qoşulma** | Pair Code / QR Code / Çıxış |
| ⚙️ **Ayarlar** | Avtomatik cavab, Telegram ötürmə, fərdi chat, **nömrə yoxlaması**, rate limit |
| 🚪 **Çıxış** | WhatsApp sessiyasını silir |

**Əmrlar:** `/start` · `/stat` · `/yenile` · `/users` · `/menu` · `/help`

### Cədvəl linkini dəyişmək

1. **📜 Sertifikat cədvəli** → **🔗 Linki dəyiş**
2. Yeni Google Sheets linkini göndərin
3. Bot linki göstərib təsdiq istəyir → **✅ Saxla və yenilə**
4. Cədvəl dərhal yenilənir və yeni məlumat yüklənir

Link `data/sheets.json` faylında saxlanılır — restartdan sonra da qalır.

---

## 👋 Qarşılama mesajı — HƏR İSTİFADƏÇİYƏ YALNIZ BİR DƏFƏ

Bot hər WhatsApp istifadəçisinin **ilk mesajında** (mətn, səs, şəkil, sənəd —
hamısında) avtomatik qarşılama mesajı göndərir:

```
Salam! *İST Services Dənizcilik Təlim Mərkəzinə* müraciət etdiyiniz üçün təşəkkür edirik.

Sizə lazım olan məlumatı əldə etmək üçün aşağıdakı seçimlərdən istifadə edə bilərsiniz.

*1. Sertifikatın statusunu yoxlamaq*
...
*Nümunə:* Əliyev Əli Vəli 1

*2. Kurs qeydiyyatlarını yoxlamaq*
...
*Nümunə:* Əliyev Əli Vəli 2
```

**Qaydalar:**

1. İlk mesaj → qarşılama göndərilir, status **aktiv** olur.
2. Sonrakı bütün mesajlarda (mətn, səs, şəkil, sənəd) qarşılama **təkrar göndərilmir**.
3. `1` / `2` formatında sorğu həmişə avtomatik cavablandırılır.
4. Format düzgün deyilsə standart cavab göndərilir (qarşılama deyil).
5. Status **məlumat bazasında** (`data/users.json`) saxlanılır — server yenidən
   başladıqda itmir.
6. İstifadəçi **yalnız öz nömrəsi ilə** tanınır (identifikasiya telefon nömrəsi
   əsasında aparılır).

### 🔄 Restart (admin panelində)

**👥 İstifadəçilər** ekranında hər istifadəçinin nömrəsi, qarşılama statusu
(`göndərilib` / `göndərilməyib`) və son mesaj tarixi göstərilir.

| Düymə | İş |
|---|---|
| 🔄 **Restart · +994…** | Seçilmiş **bir** istifadəçinin qarşılama statusunu sıfırlayır → növbəti mesajında qarşılama yenidən göndərilir |
| 🔄 **Bütün istifadəçiləri restart et** | **Ümumi** sıfırlama — təsdiq pəncərəsi tələb edir |

> Restart **yalnız seçilmiş istifadəçiyə** təsir edir; digər istifadəçilərin
> qarşılama statusları dəyişmir. Qarşılama yenidən göndərildikdən sonra status
> yenidən aktivləşir.

---

## 💬 Cavab formatları

### Sertifikat sorğusu (`… 1`)

```
Salam, İlham bəy, hər vaxtınız xeyir.

Sertifikatlarınızın təhvil statusu:

1. *Sürətli olmayan xilasedici qayıq, növbətçi qayıq və sallar üzrə mütəxəssis* — Təhvil verilib 🟢

2. *Əmniyyətli İdarəetmə haqqında Beynəlxalq Məcəllə* — Təhvil verilib 🟢
```

> 🟢 = Təhvil verilib · ❌ = Təhvil verilməyib.
> **Sertifikat №, seriya, verilmə/qüvvət tarixi, kurs kodu və daxili ID
> istifadəçiyə GÖSTƏRİLMİR.**

### Kurs sorğusu (`… 2`)

```
Salam, İlham bəy, hər vaxtınız xeyir.

Kurs qeydiyyatlarınız və təlim tarixləri aşağıdakı kimidir:

1. *Sürətli olmayan xilasedici qayıq, növbətçi qayıq və sallar üzrə mütəxəssis* — Başlama: 27.09.2026 | Bitmə: 30.09.2026

Qeyd: *Tarixlərdə hər hansı bir dəyişiklik olarsa, məlumat verəcəyik. Kurs başlamamışdan 1 gün əvvəl hər kəsə kurs haqqında məlumat veriləcək.*
```

### Format düzgün deyilsə

```
Sorğunuzun formatı düzgün deyil.

Sertifikat məlumatı üçün:
*Soyad Ad Ata adı 1*

Kurs qeydiyyatı üçün:
*Soyad Ad Ata adı 2*

Əlavə məlumat üçün administratorla əlaqə saxlaya bilərsiniz.
```

---

## 🗄 Cədvəl məlumatlarının oxunması

### Sertifikat cədvəli

Başlıq sətri avtomatik aşkarlanır (ilk 12 sətir içində `Kurs kodu` + `Soyadı` sütunları):

| Sütun | Məqsəd |
|---|---|
| `Soyadı, Adı, Atasının adı` | Axtarış açarı |
| `Kurs kodu` | Kurs adının tapılması |
| `Kursun adı` | Fallback (xəritədə yoxdursa) |
| `Sertifikat №`, `verilmə tarixi`, `qüvvədə olma tarixi` | Təfərrüat (**cavabda göstərilmir**) |
| `Telefon` | Nömrə ilə əlaqələndirmə (təhlükəsizlik) |
| `Təhvil statusu` | `Təhvil verilib` / `Təhvil verilməyib` (boş = hələ qeyd olunmayıb) |

### Kurs qeydiyyatı cədvəli

| Sütun | Məqsəd |
|---|---|
| `Full Name (ID)` | Axtarış açarı |
| `Rank (Working Diploma)` | **Kurs kodu** (sütun avtomatik seçilir — ən çox məlum kodu saxlayan sütun) |
| `Course Start Date` | Başlama tarixi |
| `Course Finish Date` | Bitmə tarixi |
| `Telefon` | Nömrə ilə əlaqələndirmə (təhlükəsizlik) |

Tarix hücründə **mətn varsa** (`BORC`, `hərbi xidmeti`) və ya **boşdursa** →
`Başlama: qeyd olunmayıb`.

### Yeniləmə

- Avtomatik: hər **60 dəqiqə** (`SHEET_REFRESH_MINUTES`)
- Əl ilə: Telegram-dan **🔄 Cədvəlləri yenilə**
- Uğursuzluqda əvvəlki məlumat qorunur, xəta Telegram sahibinə bildirilir
- Son uğurlu məlumat `data/snapshot/` altında saxlanılır → restart dərhal cavab verir

---

## 🔍 Ad uyğunlaşma (matching)

Cədvəllərdə adlar **"Soyadı Ad Atasının adı"** formatında, bəzən `oğlu/qızı` sözü ilə
yazılır. İstifadəçi isə bəzən ata adını yazmır. Buna görə 4 səviyyəli uyğunlaşma:

1. **Dəqiq** — tam ad (böyük/kiçik hərf, nöqtə, tire fərq etmir)
2. **Yumşaq** — `ə→a/e`, `ö→o`, `ü→u`, `ç→c`, `ş→s`, `ğ→g`, `ı→i`
3. **Prefix** — istifadəçi adın başlanğıcını yazıb (`Əliyev Əli` → `Əliyev Əli Vəli`)
4. **Soyad + Ad** — yalnız iki token, unikal olduqda

> Ad bir neçə şəxse uyğun gəlirsə bot **səhv şəxsin məlumatını vermir** —
> dəqiq ad tələb edir və administratorla əlaqə saxlamağa yönləndirir.

---

## 📚 Kurs kodu xəritəsi

`modules/courseCodes.js` faylında 32 kod → ad xəritəsi var (SP, SI, SH, RS, SG, SO, SW, SV,
SQ, SR, SZ, SF, SD, SC, SE, ST, SX, SN, SM, DQ, SA, SB, AS, SK, ER, DL, SJ, SL, SU, XS, YS, WS).

**Kurs adının mənbəyi:**

- `COURSE_NAME_SOURCE=map` (**defolt**) — bu xəritədən gəlir
- `COURSE_NAME_SOURCE=sheet` — cədvəldəki `Kursun adı` sütunundan gəlir

Xəritəni dəyişmək üçün `modules/courseCodes.js` faylını redaktə edin — yeni kodu
`COURSE_CATALOG` massivinə əlavə etmək kifayətdir.

---

## 🛡 Təhlükəsizlik və dayanıqlılıq

| Mexanizm | Təfərrüat |
|---|---|
| **Yalnız iki sorğu** | Bot yalnız `… 1` və `… 2` formatını qəbul edir; digər əmrlər sistemin iş prinsipini dəyişə bilmir |
| **Şəxsi identifikator bloklanır** | FİN, vəsiqə, pasport, diplom №, doğum tarixi, e-poçt, 4+ rəqəmli kod ilə axtarış **edilmir** |
| **Nömrə ilə əlaqələndirmə** | Cədvəldə `Telefon` sütunu varsa, yalnız eyni nömrəyə aid qeydlərin məlumatı göstərilir. Hücrdə "a/b" şəklində iki nömrə varsa, hər ikisi yoxlanılır |
| **Məlumat azlığı** | Cavabda yalnız ad, təhvil statusu və tarix — №/seriya/kurs kodu/ID yoxdur |
| **Qarışdırılmama** | Eyni adlı bir neçə şəxs varsa, dəqiqləşdirmə tələb olunur |
| **Rate limit** | 8 mesaj / 5 dəqiqə (bir nömrədən) |
| **Blok listi** | `data/blocked.json` — müəyyən nömrələrə cavab verilmir |
| **Fərdi chat** | Qruplarda bot susar (`WA_PRIVATE_ONLY=true`) |
| **Təkrarların qarşısının alınması** | Eyni mesaj iki dəfə cavablandırılmır; eyni nömrədən mesajlar növbə ilə emal olunur |
| **Səsli mesaj / fayl** | Yazılı cavab verilir; fayl məzmunu təhlil edilmir |
| **Məxfilik** | Loglarda nömrələr maskalanır (`+994•••••4567`), adlar/e-poçtlar loglanmır |
| **Crash təhlükəsizliyi** | Bütün JSON fayllar atomik yazılır (yarımçıq fayl qalır) |
| **Auto-reconnect** | Exponential backoff + 2 dəqiqəlik watchdog |
| **Restart bərpası** | Snapshot + sessiya qovluğu ilə dərhal işə düşür |

---

## ⚙️ Environment dəyişənləri (TAMAMLAŞ İSTEĞEYƏ BAĞLI)

Bütün dəyərlərin defoltu var — `.env` faylı olmadan da bot işləyir.

| Dəyişən | Defolt | İzah |
|---|---|---|
| `TELEGRAM_TOKEN` | config.js | Bot tokeni (config.js-dəki dəyər üstündür) |
| `ALLOWED_TELEGRAM_IDS` | boş | Boşdursa ilk yazan istifadəçi sahib olur |
| `ALLOW_ALL_USERS` | `false` | `true` = açıq bot (tövsiyə olunmur) |
| `PAIR_NUMBER` | boş | İlk qoşulma nömrəsi |
| `BOT_DATA_DIR` | `./data` | Daimi məlumat qovluğu |
| `SHEET_REFRESH_MINUTES` | `60` | Cədvəl yeniləmə tezliyi |
| `COURSE_NAME_SOURCE` | `map` | Kurs adının mənbəyi |
| `SHEET_CERT_URL` / `SHEET_COURSE_URL` | config.js | Default cədvəl linkləri |
| `WA_AUTO_REPLY` | `true` | Avtomatik cavab |
| `WA_PRIVATE_ONLY` | `true` | Yalnız fərdi chat |
| `WA_PHONE_CHECK` | `true` | Nömrə ilə əlaqələndirmə yoxlaması (təhlükəsizlik) |
| `TG_FORWARD_INCOMING` | `true` | Gələn mesajları Telegram-a ötür |
| `WA_RATE_LIMIT_PER_MIN` | `8` | Rate limit |
| `WA_RATE_LIMIT_WINDOW_MIN` | `5` | Rate limit pəncərəsi |
| `PORT` | `3000` | Health server portu |
| `LOG_FORMAT` | `text` | `json` = strukturlu loglar |
| `LOG_REDACT_PHONES` | `true` | Nömrə maskalama |

---

## 🚀 Deploy

### Railway
1. **New Project → Deploy from GitHub**
2. `railway.toml` Dockerfile ilə avtomatik işləyir
3. **Variables** → `TELEGRAM_TOKEN` *əlavə etmək mümkündür, lakin vacib deyil*
   (token `config.js` faylındadır)
4. **Volumes** → `/app/data` və `/app/sessions` (persistent)

### Docker / VPS
```bash
docker compose up -d      # .env faylı olmadan da işləyir
```

### Lokal
```bash
npm start                 # = node bot.js
```

**Health check:** `GET /health` → `{ status, uptime, telegram, whatsapp, sheets }`

---

## 📁 Layihə strukturu

```
├── bot.js                     # ⭐ əsas giriş: Telegram botu + WhatsApp cavabı (env lazım deyil)
├── index.js                   # Eyni iş (proqramatik giriş / legacy)
├── config.js                  # Token + default cədvəl linkləri
├── settings.js                # Mərkəzləşdirilmiş konfiqurasiya (+ .env yükləyici)
├── lib/
│   ├── nameMatch.js            # Ad uyğunlaşma mühərriki (4 səviyyə)
│   ├── security.js             # ★ Şəxsi identifikator bloklanması + nömrə yoxlaması
│   ├── csv.js                  # RFC 4180 CSV parser
│   ├── sheetUrl.js             # Google Sheets link → {id, gid}
│   ├── http.js                 # Fetch + HTML/login aşkarlama
│   ├── menu.js                 # Bütün inline klaviaturalar (istifadəçi + Restart)
│   ├── callbacks.js            # callback_data sxemi + yoxlama
│   ├── telegramRetry.js        # 429/5xx retry
│   ├── chatLock.js             # Çat/nömrə üzrə növbə
│   ├── atomicWrite.js          # Atomik JSON yazma
│   └── myfunc.js               # Kiçik köməkçilər
├── modules/
│   ├── app.js                  # ★ Ortaq başlatma məntiqi (bot.js + index.js)
│   ├── autoReply.js            # ★ Sorğunun tanınması + cavab mətnləri
│   ├── waDispatcher.js         # ★ Gələn mesaj → filtr → qarşılama → cavab
│   ├── greetingStore.js        # ★ Qarşılama statusu (data/users.json) + Restart
│   ├── telegramBot.js          # ★ İdarəetmə paneli (istifadəçilər + Restart)
│   ├── whatsappManager.js      # Pair/QR, sessiya, reconnect
│   ├── sheetsManager.js        # Yükləmə, yeniləmə, snapshot, scheduler
│   ├── certificateStore.js     # Sertifikat cədvəlinin parseri + indeks
│   ├── courseStore.js          # Kurs cədvəlinin parseri + indeks
│   ├── courseCodes.js          # Kurs kodu → ad xəritəsi
│   ├── sheetConfig.js          # Cədvəl linklərinin saxlanması
│   ├── guards.js               # Blok listi, rate limit, statistika
│   ├── access.js               # Telegram giriş nəzarəti
│   ├── logger.js / services.js # Dəstək modulları
├── scripts/
│   ├── start.sh              # ⭐ Botu fon rejimində başladır (PID faylı)
│   ├── stop.sh               # ⭐ Botu dayandırır
│   ├── check-syntax.js       # node --check (lint əvəzi)
│   ├── integration-check.js  # Real cədvəllə inteqrasiya testi
│   ├── wa-selftest.js        # ⭐ WhatsApp özünü yoxlama (axtarış→cavab→göndərmə)
│   ├── mock-telegram.js      # Panelin mock render + HTML preview
│   └── make_banner.py        # Banner generator
└── test/                       # 105 test (node --test)
```

---

## 🧪 Yoxlama

```bash
npm test                          # 105 unit test
npm run check                     # sintaksis yoxlaması
node scripts/integration-check.js # real cədvəllərlə tam yoxlama
node scripts/mock-telegram.js     # Telegram panelinin render yoxlaması
node scripts/wa-selftest.js       # WhatsApp uçdan-uca yoxlama (bot dayandırılmış vəziyyətdə)
```

---

## ❓ Problem olsa

| Problem | Həll |
|---|---|
| Cədvəl yüklənmir, "giriş tələb olunur" | Cədvəli **Paylaş → Hər kəsə açıq** etmək lazımdır |
| `gid` səhvdir | Sheet-də səhifəyə klikləyin, URL-də `gid=` dəyərini götürün |
| Ad tapılmır | Adı cədvəldəki kimi yazın: **Soyadı Ad Atasının adı** |
| "Bu ad bir neçə şəxsə uyğun gəlir" | Atasının adını da əlavə edin |
| Bot cavab vermir | **⚙️ Ayarlar → Avtomatik cavab** açıldığını yoxlayın; rate limitə görə bloklanmış ola bilər |
| Qarşılama təkrar göndərilir | **👥 İstifadəçilər → 🔄 Restart** düyməsini basın |
| Pair code işləmir | Əvvəlcə köhnə Linked Device-i silin, sonra **QR Code** üsulunu yoxlayın |
| Telegram token işləmir | `TELEGRAM_TOKEN` mühit dəyişənini yoxlayın |

---

© İST Services Dənizcilik Təlim Mərkəzi
