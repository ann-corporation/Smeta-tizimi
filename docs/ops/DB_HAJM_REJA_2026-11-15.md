# DB hajm va IO rejasi (2026-11-15)

Holat: baza 506 MB (free limit 500 MB). Faqat o'qish so'rovlari bilan o'lchandi (pg_class, pg_stat_user_tables, cron.*). Hech narsa bajarilmagan.
Real summa/nom yo'q; faqat jadval nomlari va MB.

## 1. Eng katta 20 relation (jadval + indeks + TOAST)

| # | Relation | Jami MB | Izoh |
|---|---|---|---|
| 1 | public.t2_qator | 118 | asosiy smeta qatorlari (heap 70, indeks 47); biznes ma'lumoti |
| 2 | snapshot.bolak_mazmun | 83 | 1778 qator, 81 MB TOAST: snapshot blok mazmuni |
| 3 | public.t2_akt_qator | 71 | biznes ma'lumoti |
| 4 | public.t2_qator_muhr | 66 | biznes ma'lumoti |
| 5 | public.t2_onboarding_command_log | 11 | 4546 qator, 10 MB TOAST (buyruq payloadlari) |
| 6 | public.t2_signal | 10 | |
| 7 | public.t2_obyekt_natija_kesh | 10 | 152 qator; haqiqiy jsonb ~3 MB, qolgani qayta yozishdan TOAST shishishi |
| 8 | public.t2_ozgarish | 9 | |
| 9 | public.t2_smeta_versiya_pozitsiya | 8 | |
| 10 | public.t2_smeta_revision | 8 | 22 qator, 8 MB TOAST (katta jsonb) |
| 11 | public.t2_f2_import_draft_qator | 8 | import qoralamalari |
| 12 | public.t2_addrepl_command | 6 | |
| 13 | public.t2_sklad_harakat | 5 | |
| 14 | public.t2_smeta_versiya_moslik | 4 | |
| 15 | snapshot.obyekt_snapshot | 3 | 550 qator |
| 16 | cron.job_run_details | 3 | cron tarixi |
| 17 | public.t2_audit_log | 3 | |
| 18 | public.t2_smeta_ozgarish | 2 | |
| 19 | public.t2_aosr | 2 | |
| 20 | snapshot.obyekt_snapshot_bolak | 2 | |

Sxema bo'yicha: public 377 MB (375 jadval), snapshot 89, pg_catalog 33, cron 3.4. Top-20 yig'indisi ~450 MB; qolgani ko'p mayda jadvallar va katalog.
pg_stat_user_tables: n_dead_tup > 500 bo'lgan jadval YO'Q (bloat asosan jadval ichida emas; faqat TOAST qayta yozishdan o'sgan joylar tekshirilsin).

## 2. Tozalash rejasi (bajarilmaydi, taxminiy)

### A. Xavfsiz / qaytariladigan (egasi so'rovisiz ham mumkin, qayta tiklanadigan ma'lumot)
| Qadam | Tejam | Xavf |
|---|---|---|
| A1. t2_obyekt_natija_kesh ni TRUNCATE (butunlay qayta hisoblanadi: ochiq funksiyalar jonli fallback, tungi job to'ldiradi). VACUUM FULL EMAS. 10 MB jadval uchun TRUNCATE bir zumda, IO yo'q. | ~9-10 MB | past: tungi 02:00-05:00 gacha bir necha og'ir ekran sekinroq (jonli) |
| A2. cron.job_run_details ni 2 kundan eskisidan tozalash + keyin oddiy VACUUM | ~2-3 MB | juda past |
| A3. Oddiy VACUUM (ANALYZE) kichik jadvallar: t2_signal, t2_ozgarish, t2_smeta_revision | 0-3 MB (fayl odatda qisqarmaydi, joy qayta ishlatiladi) | past |
| A4. Yangi cron (20261225000000) natija keshining qayta yozilib shishishini to'xtatadi | kelajakda +10 MB/hafta oldini oladi | past |

### B. R2 ga arxiv, keyin o'chirish
| Qadam | Tejam | Xavf |
|---|---|---|
| B1. snapshot.bolak_mazmun: eski (masalan 30 kundan eski, kunlik avto-snapshotlar) blok mazmunini R2 ga eksport qilib, ularga havola qoldirish va qatorni o'chirish; ishlatilmayotgan (hech bir snapshot ko'rsatmaydigan) bloklarni oldin topish | 40-60 MB (83 MB dan) | o'rta: snapshot_qaytar eski nuqtaga R2 dan o'qish kerak bo'ladi; avval R2 da to'liqlikni tekshirish shart |
| B2. t2_onboarding_command_log payloadlarini (TOAST 10 MB) tugagan buyruqlar uchun R2 ga yoki qisqartirib saqlash | 7-9 MB | past-o'rta (audit tarixi) |
| B3. t2_smeta_revision eski reviziyalar jsonb (22 qator, 8 MB): faqat so'nggi N ni qoldirib, qolganini R2 | 5-6 MB | o'rta (hujjat tarixi) |
| B4. t2_f2_import_draft_qator: qabul qilingan/bekor qilingan eski qoralamalar | 4-6 MB | past-o'rta |

### C. Egasi qarori kerak
- C1. Snapshot saqlash muddati siyosati (kunlik snapshotni nechta kun saqlash). Shundan B1 miqdori kelib chiqadi.
- C2. t2_qator / t2_akt_qator / t2_qator_muhr (255 MB, biznes ma'lumoti) — tegilmaydi; indekslar (t2_qator 47 MB indeks) bo'yicha foydalanilmagan indeks auditi (pg_stat_user_indexes idx_scan=0) keyin alohida, taxminan 10-25 MB.
- C3. Free tier o'rniga Pro (8 GB, ko'proq IO) ga o'tish: eng ishonchli, chunki 506 MB har kuni limitga yaqin.
- C4. pg_catalog 33 MB: 375 jadval; ishlatilmaydigan jadvallar/migratsiya qoldiqlarini tozalash.

Jami taxminiy: A ~12-15 MB, B ~55-80 MB, C2 ~10-25 MB. A+B1 bilan ~420-440 MB ga tushadi (limitdan ~12-16% past).

## 3. Boshqa cronlar (IO bahosi)

Oxirgi 1 kun (so'nggi 1500 ta ishga tushish ichida): job 8 o'rtacha 12.9 s (max 491 s, 65 xato), job 20 o'rtacha 7.9 s (max 492 s, 36 xato), job 37 o'rtacha 7.2 s (max 589 s, 95 xato), job 38 o'rtacha 15.7 s (max 283 s, 13 xato). Max va xatolar baza yuklanib qotgan paytga mos.

| Job | Hozir | Baho | Tavsiya |
|---|---|---|---|
| 8 outbox bildirishnoma | har 2 daq | outbox atigi ~46 qator, so'rov arzon, lekin t2_outbox_kursor/bildirishnoma ga yozadi; yuklanishda 490 s qotgan | */5 (bildirishnoma 5 daq gacha kechikadi) va statement_timeout 60 s qo'shish |
| 20 kesh yangila | o'chirilgan | sababchi | yangi 20261225000000 bilan almashadi |
| 21 tungi 'hammasi' | 22:20 UTC, 900 s | hamma obyekt og'ir qayta hisob | olib tashlanadi, o'rniga tungi og'ir job |
| 37 ustama | har daq, 150 s | 95 xato/kun | */2, timeout 60 s, budjet 20 s (migratsiyada) |
| 38 ai_jadval | har 10 daq, 120 s | har ishga tushishda t2_ai_ish bo'yicha UPDATE/DELETE skan; navbat bo'sh bo'lganda ham | */15 yoki */20, timeout 60 s; navbat bo'lmasa kutish |
| 29 solishtiruv tungi | 22:40 UTC, 600 s | og'ir, 22:20 va snapshot (21:00) bilan ketma-ket | 23:30 UTC ga ko'chirish, tungi og'ir kesh (21-23:50) bilan to'qnashmaslik; timeout 600 s qoladi, egasi tasdiqlasin |
| 31 baza hajm kunlik | 03:40 UTC | arzon (pg_class), 1 qator/kun | o'zgarishsiz |
| 1 snapshot kunlik | 21:00 UTC | snapshot.bolak_mazmun o'sishining manbai | C1 siyosatiga qarab |

## 4. Egasi tasdiqlashi kerak
1. 20261225000000 migratsiyasini qo'llash (yangi cron joblar, eski 21 va 20 ni o'chirish, job 37 ni sekinlatish).
2. A1 (natija keshini TRUNCATE) va A2 (cron tarixini tozalash).
3. C1 snapshot saqlash muddati, keyin B1.
4. Job 8 va 38 jadvalini o'zgartirish; job 29 ni ko'chirish.
