# QA - Loyiha > Shartnoma > Obyekt ierarxiyasi (APK + Windows) - 2026-11-19

Egasi fikri: "APK da ham Windowsda ham obyektlarni hammasini sochib ochvorayapdi, vizual tushunish qiyin, shartnoma, loyiha kabi ierarxiyalar ishlamayapdi."

Ma'lumot manbai: saytdagi `lib/obyekt-ierarxiya.ts` bilan bir xil qoida (obyekt.loyiha_id, shartnoma.loyiha_id, faol `t2_shartnoma_bog`), bir xil jadvallar
(`t2_loyiha_royxat`, `t2_shartnoma`, `t2_shartnoma_bog_kompaniya`, `t2_obyekt_jami`) mavjud `/api/sb` yo'li orqali: BFF ruxsat ro'yxati va server o'zgarmadi.
Summalar serverning obyekt paketlaridan (QQS bilan asosiy, ustamali + ustamasiz ikkinchi) faqat QO'SHILADI; noma'lum = "—", hech qachon 0 emas.
Sinov ma'lumoti: faqat demo (sintetik, haqiqiy ma'lumot/summa/nom yo'q). Skrinshotlar lokal: `C:\Temp\ilova-ierarxiya\`.

| # | Daraja | Platforma | Nuqson / talab | Holat | Tekshiruv usuli |
| --- | --- | --- | --- | --- | --- |
| I1 | P1 | Android + Windows | Obyektlar tekis ro'yxat: loyiha/shartnoma qavatlari yo'q | tuzatildi ✅ | `ObjectTreeTest` (14 test: guruhlash, bir obyekt ikki shartnomada, Loyihasiz/Shartnomasiz); Windows demo `w02`, Android emulyator `a11` |
| I2 | P1 | Android + Windows | Har qavatda soni va summa (QQS bilan, ustamali, ustamasiz); summasiz obyekt 0 sifatida qo'shilmasin | tuzatildi ✅ | `sumsAddKnownValuesAndNullNeverBecomesZero`; ekranda "—" va "Summa yo'q: N" belgisi (`a11`, `w03`) |
| I3 | P2 | Android + Windows | Yig'iladigan guruhlar, holat eslab qolinadi | tuzatildi ✅ | `smallTreeOpensBigTreeStaysClosedAndStateIsRemembered`; Windows: `tree.properties` dan tiklangan daraxt `w03_expanded`; Android: Prefs per-kompaniya, ochish/yopish `a12` |
| I4 | P2 | Android + Windows | Qidiruv daraxtni saqlasin, ota qavatlar ochilsin | tuzatildi ✅ | `searchKeepsTheTreeAndOpensParents`, `searchOnContract...`; Android jonli "korpus b" (`a13`) |
| I5 | P2 | Android + Windows | Filtrlar: loyiha, shartnoma, holat | tuzatildi ✅ | `filtersByProjectContractAndStatus`; Android jonli loyiha tanlash (`a16`) |
| I6 | P2 | Android + Windows | Joriy kontekstni (loyiha/shartnoma/obyekt) qobiqda tez almashtirish (saytdagi "Kontekst") | tuzatildi ✅ | `normalizeScope`, `scopedLeaves` testlari; Android: ish joyi ostida "Kontekst" qatori + sheet (`a14`, `a15`, `a16`); Windows: yuqori panelda "Kontekst" tugmasi (`w02`) |
| I7 | P2 | Windows | Keng oynada ikki panel: chapda daraxt, o'ngda obyekt kartasi (Smeta/Fakt/F-2 summalari, bajarilish %, tezkor o'tishlar) | tuzatildi ✅ | Windows demo `w02`, `w03` |
| I8 | P2 | Android + Windows | Loyiha/shartnoma o'qilmasa (ruxsat yo'q/oflayn nusxasiz) oddiy ro'yxat + izoh | tuzatildi | `parsesTheFourServerReadsAndToleratesAFailedOne`, `fetchFoldsTheReadsAndSurvivesADeniedOne`; ekranda `ier_flat_note` (jonli ko'rilmadi) |
| A7 | P2 | Windows | Bosh sahifa (Bugun) yo'q edi | tuzatildi ✅ | yangi `Today.kt`: tasdiq, F-2/fakt qoralamalari, o'qilmagan, oxirgi bildirishnomalar (Android bilan bir xil `TodayRepository`); Windows demo `w01_bugun` |
| A8 | P2 | Windows | Smeta qatori tafsiloti (fakt/F-2 ajratmasi, qoldiq) yo'q edi | tuzatildi | yon panel (keng) / dialog (tor): hajm, narx, summa, fakt, F-2, qoldiq (minus aynan ko'rinadi); kod + `:desktop:compileKotlin`; demo da jonli bosilmadi (Windows ilovani boshqarish ruxsati berilmadi) |
| I9 | P3 | Hammasi | Uz/ru/en: yangi matnlar `strings_ierarxiya.xml` (3 til), Windows ham xuddi shu resurslarni o'qiydi | tuzatildi ✅ | `lintDebug`; ru tilida jonli ko'rilmadi |
| I10 | P3 | Android | Tor ekranda "Loyiha: Demo yo'..." nomi qisqa ko'rinadi (to'liq nom kontekst qatorida) | qabul | `a16` |
| I11 | P3 | Hammasi | Obyektning bir nechta shartnomadagi qo'shimcha bog'i: obyekt faqat bitta guruhda (sayt qoidasi), yig'indi ikki marta sanalmaydi | qabul | `objectInTwoContractsGoesToTheOneOfItsOwnProjectOnlyOnce` |
| I12 | P3 | Hammasi | Holat filtri loyiha holatiga bog'liq (obyektning o'z holati serverdan kelmaydi); "Loyihasiz" guruh holat filtri yoqilganda yashiriladi | ochiq | mahsulot qarori kerak |
| I13 | P3 | Hammasi | Telegram-uslubdagi tor Windows oynasi (<840dp) da ikki panel o'rniga daraxt, obyekt tanlanganda to'liq kartaga o'tadi; jonli sinalmadi | ochiq | kod |

## Usul va cheklov
- Birlik testlari: `:shared:test` (`ObjectTreeTest`), Windows `:desktop:compileKotlin`/`:desktop:test`, Android `testDebugUnitTest`, `lintDebug`.
- Android: bitta yengil emulyator (AVD p5_sinov, alohida port, boshqa agentlarning emulyatorlariga tegilmadi), `assembleBench` (demo, alohida paket `.bench`). Sinovdan keyin o'chirildi.
- Windows: demo rejimi (`QURAI_DEMO=1`, ixtiyoriy `QURAI_START=<modul>`), skrinshot oyna darajasida olindi; bosish-boshqarish vositasi `java` jarayoniga ruxsat bera olmadi, shuning uchun interaktiv bosishlar (qidiruv, kontekst dialogi, smeta tafsiloti) Windowsda jonli sinalmadi, Android da sinaldi; umumiy UI kodi bir xil.
- Haqiqiy hisob/summa/nom ishlatilmadi; demo fixture: `ier_loyiha/ier_shartnoma/ier_bog.json`, `objects.json` 13 ta sintetik obyekt.
