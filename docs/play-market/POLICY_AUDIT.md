# QURAI Android: Google Play siyosati auditi (2026-11-19)

Manba: `android-native/app/src/main/AndroidManifest.xml`, kod (`feature/`, `core/`), CI ruxsat siyosati. Bu hujjat Play Console «App content» bo'limidagi formalarni to'ldirish uchun javoblar to'plami.

## 1. Ruxsatlar (permissions)

| Ruxsat | Nima uchun | Holat |
| --- | --- | --- |
| INTERNET, ACCESS_NETWORK_STATE | API bilan aloqa, oflayn/onlayn holat | Kerak |
| CAMERA | Obyekt surati, shtrix-kod/QR skaner (runtime so'raladi; `uses-feature camera required=false`) | Kerak |
| RECORD_AUDIO | Ombor va AI yordamchi ovozli buyrug'i, faqat mikrofon tugmasi bosilganda (runtime so'raladi; `required=false`) | Kerak, Play formasida asoslanadi |
| WAKE_LOCK, RECEIVE_BOOT_COMPLETED, FOREGROUND_SERVICE | Kutubxonadan (WorkManager) birlashadi, ilova o'zi foreground service e'lon qilmaydi | Kuzatuvda, «foreground service» deklaratsiyasi kerak emas |
| USE_BIOMETRIC / USE_FINGERPRINT | PIN/barmoq izi qulfi (kutubxonadan) | Kerak |

Yo'q (va qo'shilmaydi): joylashuv, kontaktlar, SMS/qo'ng'iroqlar, kalendar, MANAGE_EXTERNAL_STORAGE, READ_MEDIA_*/READ_EXTERNAL_STORAGE (galereya Photo Picker orqali, ruxsatsiz), REQUEST_INSTALL_PACKAGES, POST_NOTIFICATIONS (hozir lokal bildirishnoma yo'q; qo'shilsa, ruxsat va CI ro'yxati yangilanadi). Fayl ulashish FileProvider (exported=false) orqali.

## 2. Komponentlar va tarmoq

- Exported: faqat `MainActivity` (LAUNCHER). Provider va servislar `exported=false`.
- `usesCleartextTraffic="false"`: faqat HTTPS (`https://qurai.uz`, zaxira `https://smeta-tizimi.pages.dev`).
- `allowBackup="false"`, `data_extraction_rules` hamma domenni bulutga zaxiralashdan chiqaradi.
- Qurilmadagi baza SQLCipher bilan shifrlangan.

## 3. MUHIM: o'z-o'zini yangilash (self-update) siyosati

Ilovada sayt orqali APK yuklab yangilash (Sozlamalar tugmasi va bosh ekran bannerlari) bor. Google Play «Device and Network Abuse» siyosati Play'dan o'rnatilgan ilovaga Play'dan tashqari yangilanishni taqiqlaydi. Yechim kodda: `BuildConfig.SELF_UPDATE`. Play AAB `-Pplay=true` bilan quriladi, bunda yangilash tugmasi/banneri yashirin va tekshiruv so'rovi yuborilmaydi. Sayt/Telegram APK sini o'zgarishsiz qoladi (SELF_UPDATE=true).

## 4. Hisobni o'chirish talabi

Play talab qiladi: ilova ichida yo'l + veb-havola (Data safety formasiga yoziladi).
- Ilova ichida: Profil > Sozlamalar > «Hisobni o'chirishni so'rash» (dialog + veb-sahifaga o'tish).
- Veb: https://qurai.uz/hisobni-ochirish (uz/ru/en), maxfiylik siyosatida ham bor.
- Hozirgi jarayon qo'lda (Telegram bot/e-pochta orqali so'rov, 30 kun ichida bajariladi). Avtomatik o'chirish serverda yo'q: bu keyingi ish (qarang «Ochiq masalalar»). Play qo'lda so'rov jarayonini qabul qiladi, lekin so'rovlarga haqiqatan javob berish majburiyat.

## 5. Maxfiylik siyosati

https://qurai.uz/maxfiylik (uz/ru/en, bitta sahifa). Frontend `public/` ichida statik fayl; `_routes.json` va sitemap yangilangan. Deploy'dan keyin URL ochilishini tekshiring (Play uni tekshiradi, PDF/login talab qilmasligi kerak).

## 6. Data safety formasi (javoblar)

Umumiy:
- Ma'lumot yig'iladi: Ha. Uzatish shifrlanadi (HTTPS): Ha. Foydalanuvchi o'chirishni so'ray oladi: Ha (yuqoridagi URL).
- Uchinchi tomonga «sotish/ulashish» (Play ta'rifi): Yo'q. Xizmat ko'rsatuvchi qayta ishlovchilarga (hosting, AI/nutq) uzatish Play'da «sharing» hisoblanmaydi, agar faqat bizning nomimizdan ishlasa.

| Play kategoriyasi | Tur | Yig'iladimi | Maqsad | Majburiy / ixtiyoriy |
| --- | --- | --- | --- | --- |
| Personal info | Name | Ha | App functionality, Account management | Majburiy |
| Personal info | Email address | Ha | App functionality, Account management | Ixtiyoriy (kirish usuliga qarab) |
| Personal info | Phone number | Ha | App functionality, Account management | Ixtiyoriy |
| Personal info | User IDs (Google/Telegram ID) | Ha | Account management | Ixtiyoriy |
| Photos and videos | Photos | Ha | App functionality (obyekt surati, profil rasmi) | Ixtiyoriy |
| Audio | Voice or sound recordings | Ha | App functionality (ovozli buyruq; saqlanmaydi, matnga aylantirishga yuboriladi) | Ixtiyoriy |
| Files and docs | Files and docs | Ha | App functionality (hujjatlar) | Ixtiyoriy |
| App activity | Other user-generated content | Ha | App functionality (smeta, fakt, ombor yozuvlari) | Majburiy |
| App info and performance | Crash logs / Diagnostics | Ha (server jurnali) | Analytics/Developer communications (texnik) | Majburiy |
| Device or other IDs | Device ID (ilova qurilma tokeni) | Ha | App functionality, Security | Majburiy |

Yig'ilmaydi: joylashuv, moliyaviy ma'lumot (to'lov kartasi; smeta summalari kompaniya hujjati, foydalanuvchining moliyaviy hisobi emas), kontaktlar, salomatlik, xabarlar (SMS), reklama ID, web browsing. Reklama va analitika SDK yo'q (Firebase/Crashlytics/AdMob yo'q). Ilovada SDK: Google Credential Manager + Play services (kirish), ML Kit barcode (qurilmada ishlaydi), SQLCipher, CameraX.

## 7. Kontent reytingi (IARC so'rovnomasi)

Kategoriya: Utility/Productivity/Business (o'yin emas). Javoblar: zo'ravonlik, jinsiy kontent, qo'pol til, giyohvand/alkogol/tamaki, qimor, foydalanuvchi bilan ulashiladigan umumiy chat: hammasi «Yo'q». Foydalanuvchi yaratgan kontent: faqat ish hujjatlari, ommaga ochiq emas. Joylashuv ulashish: yo'q. Tijorat tovar sotish: yo'q. Kutilgan natija: IARC 3+ / Everyone.

## 8. Target audience va Content

- Target age: faqat 18+ (professional ilova). Bolalarga mo'ljallanmagan, «Families» dasturiga kirmaydi.
- Reklama: yo'q (Contains ads: No).
- Ilova toifasi: Business. «Government», «Health», «Financial» (kredit/to'lov) ilovasi emas. «Financial features» formasida: «My app doesn't provide any financial features».
- News app: yo'q. COVID: yo'q.

## 9. Ilovaga kirish (App access): tekshiruvchi uchun

Ilova login talab qiladi, shuning uchun Play Console > App content > App access da «All or some functionality is restricted» tanlanadi va quyidagi matn kiritiladi:

```
No account is needed to review the app. On the sign-in screen tap "Demo rejimi (namunaviy ma'lumot)" / "Demo mode".
Demo mode runs fully offline with sample data (no real company data) and lets you open the home screen, estimates, F-2 documents,
warehouse and the AI assistant. Camera and microphone permissions are requested only when you tap the photo or microphone buttons.
Account deletion: Settings > "Request account deletion", or https://qurai.uz/hisobni-ochirish
```

Demo rejimi haqiqiy login talab qilmaydi, shuning uchun alohida test hisobi va parol Play'ga berilmaydi. Agar tekshiruvchi haqiqiy backend oqimini ko'rishni talab qilsa, vaqtinchalik test hisobi egasi tomonidan yaratiladi (repo'ga parol yozilmaydi).

## 10. Boshqa deklaratsiyalar

- Sensitive permissions deklaratsiyasi: kerak emas (RECORD_AUDIO/CAMERA runtime «dangerous», maxsus forma talab qilinmaydi).
- Foreground service type deklaratsiyasi: kerak emas.
- Advertising ID deklaratsiyasi: «No».
- Target API: 35 (Play 2026 talabi: yangi ilova 35+). Eslatma: Play har yili targetSdk'ni oshirishni talab qiladi, hamda 16 KB sahifa o'lchami talabi (native kutubxonalar: SQLCipher, ML Kit, CameraX; kutubxonalarni 16 KB mos versiyaga yangilab turing, AAB yuklashda Play Console ogohlantiradi).
- Yangi shaxsiy akkauntlar: 12 tester x 14 kun yopiq test (qarang QOLLANMA.md).
- Signing: Play App Signing. Yuklash kaliti (upload key) = hozirgi `ANDROID_KEYSTORE_*`. Play foydalanuvchilarga Google'ning o'z kaliti bilan imzolangan ilovani beradi; shuning uchun Play'dan o'rnatilgan ilova va saytdagi APK bir-birini yangilay olmaydi (imzo har xil), foydalanuvchi bitta kanal tanlaydi.

## 11. Ochiq masalalar (egasi/keyingi ish)

1. support@qurai.uz pochta qutisini yaratish (Cloudflare Email Routing yetadi) yoki matnlardagi manzilni haqiqiy manzilga almashtirish (maxfiylik, o'chirish sahifasi, LISTING.md).
2. Hisobni o'chirishni avtomatlashtirish (server RPC: profil anonimlashtirish + sessiyalarni bekor qilish + auditga yozish). Hozir qo'lda.
3. Maxfiylik siyosatidagi qayta ishlovchilar ro'yxatini (AI/nutq provayderlari) hozirgi haqiqiy ro'yxat bilan egasi tasdiqlashi kerak. Yuridik shaxs nomi va manzili (Play ko'rsatadi) siyosatga qo'shilishi mumkin.
4. Play'dan o'rnatilgan ilovada saytdagi «Ilova» sahifasi APK yuklashni taklif qiladi; Play listing'da bunga havola yo'q (muammo emas).
