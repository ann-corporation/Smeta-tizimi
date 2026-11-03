# Buxgalteriya V1 — dizayn (MVP) va yo'l xaritasi

Holat: MVP v1 (branch `claude/buxgalteriya-v1`). Egasi talabi: buxgalteriya 1C darajasiga yaqinlashsin, lekin
buxgalter uchun ODDIY bo'lsin; tizimning qolgan qismi (F2 / Forma-3, ombor, to'lov, qarzdorlik, shartnoma, kadrlar)
bilan bog'langan bo'lsin; kelajakda 1C o'rnini bosin.

> Hujjatda haqiqiy summa, INN, kontragent nomi yoki bank raqami yo'q — faqat tuzilma va qoidalar.

## 1. Nima allaqachon bor (kengaytiriladi, dublikat qilinmaydi)

| Mavjud | Rol | Buxgalteriyada ishlatilishi |
| --- | --- | --- |
| `accounting.read/write/approve` ruxsatlari (rol `bugalter`) | ruxsat | RPC lar shularni tekshiradi (`read` = `financial.read`, `write` = `financial.write` dan hosil bo'ladi) |
| `t2_tolov` (+ `t2_tolov_taqsimot`, `t2_tolov_sorov`) | to'lovlar (kirim/chiqim shartnoma bo'yicha) | provodka manbasi; bank importi shu jadvalga yozadi |
| `t2_shartnoma` (`asosiy=true` buyurtmachi, `false` kontragent), `t2_shartnoma_tomon`, `t2_kontragent` | shartnoma va kontragent | analitika (kontragent, shartnoma) |
| `t2_qarz_asos` (qarzdorlik asoslari) | postavshik/subpudrat hujjatlari (yetkazish, bajarilgan ish, to'lov, boshlang'ich qoldiq) | kreditor provodkalari manbasi (ombor kirimi `sklad_harakat_id` orqali bog'langan) |
| `t2_forma3` (`manba='sotuv'` — 1C «Продажа», `sotuv_summa`, `nds_foiz`) | realizatsiya hujjati (счёт-фактура) | realizatsiya provodkasi manbasi |
| `t2_sklad_harakat` (M-29 / ombor) | ombor harakati (narxi yo'q) | narx `t2_qarz_asos.sklad_harakat_id` qatorida; ombor kirimi provodkasi shu summadan |
| `t2_shartnoma_svod_sverka_v1`, `t2_qarz_svod_v1`, `t2_pul_tahlil` | boshqaruv tahlili (F2/DS/sotuv/to'lov) | O'ZGARMAYDI; buxgalteriya hisobi bilan solishtirish keyingi bosqich |
| Qarzdorlik sahifasi | kreditor asoslari + spravka farqi | provodkalar shu asoslardan avtomatik hosil bo'ladi |

Xotira eslatmasi: Direksiya 1C sverka — 1C «Продажа» ≠ F2. Shuning uchun realizatsiya F2 dan emas, **Forma-3 (счёт-фактура)**
dan tan olinadi; F2 hali F3 ga o'tmagan bo'lsa, u provodkaga tushmaydi (hisobotda «F3 chiqmagan» deb ko'rsatiladi).

## 2. Hisoblar rejasi (план счетов НСБУ № 21)

- Har kompaniya O'Z rejasiga ega (`t2_bux_hisob`): kod (4 xona), nomi (uz/ru), turi, `kontragent_analitika`, `faol`.
- Standart ro'yxat SQL funksiyada **ma'lumot sifatida** (`_t2_bux_hisob_seed`) — «Boshlash» tugmasi uni kompaniyaga ko'chiradi.
  Keyin buxgalter nomini o'zgartiradi, yangi hisob qo'shadi, ishlatilmaydiganini o'chiradi (faolsizlantiradi). Kod o'zgarmaydi,
  ishlatilgan hisob o'chirilmaydi (faqat faolsiz).
- Seed — amalda kerakli kichik qism: 0100/0200 asosiy vositalar, 1010 materiallar, 2010 asosiy ishlab chiqarish (qurilish
  tugallanmagan ish), 4010 xaridorlar, 4310 berilgan avanslar, 4410 QQS (zachet), 5010 kassa, 5110 hisob-kitob schyoti,
  6010 yetkazuvchilar, 6310 olingan avanslar, 6410 byudjetga qarz (QQS), 6710 ish haqi, 6810 qisqa kreditlar, 8310 ustav kapitali,
  8810 taqsimlanmagan foyda, 9010 realizatsiya daromadi, 9110 sotilgan tannarx, 9410/9420 davr xarajatlari, 9810 foyda solig'i, 9910 yakuniy natija.
- **Kodlar rasmiy reja bilan buxgalter tomonidan tasdiqlanadi** — seed namuna; rasmiy rejadan farq bo'lsa, hisob tahrir ekrani
  orqali tuzatiladi (migratsiya talab qilinmaydi).

## 3. Provodka (проводка) tamoyillari

Jadval `t2_bux_provodka` (ixcham — Supabase 500 MB chegarasiga yaqin):

`id, kompaniya_id, sana, dt_kod, kt_kod, summa numeric(18,2), kontragent_id, shartnoma_id, obyekt_id, manba_tur, manba_id, qism, tur, storno_id, izoh, aktor_id, yaratildi`

1. **Ikki yoqlama yozuv**: har qator Dt va Kt kodidan iborat; bitta summa. Jami Dt = jami Kt har doim (qator ichida o'z-o'zidan).
2. **O'zgarmas (append-only)**: UPDATE/DELETE trigger bilan taqiqlangan. Tuzatish faqat **storno** (minus summa, xuddi shu Dt/Kt —
   «красное сторно») yoki yangi provodka bilan. Minus summa ruxsat.
3. **Hujjat nusxalanmaydi**: provodka faqat `manba_tur + manba_id` (+ `qism`) ni saqlaydi; hujjat mazmuni manba jadvalda qoladi.
4. **Analitika**: kontragent, shartnoma, obyekt (null = noma'lum). Summa NULL bo'lgan hujjat provodka bermaydi (NULL ≠ 0) — «summasiz»
   deb hisobotda sanaladi.
5. **Pul**: QQS bilan birinchi. Hujjat summasi (QQS bilan) → asosiy summa + QQS ga **ayirma** bilan bo'linadi
   (`asos = round(jami / (1 + foiz/100), 2)`, `QQS = jami − asos`), shuning uchun yig'indi aniq jamiga teng. Stavka `param.nds_foiz`
   (sukut 12, tahrirlanadi); F3 da `nds_foiz` bo'lsa o'sha. QQS to'lamaydigan kontragent (`qqs_tolovchi=false`) xaridida QQS ajratilmaydi.
   Hisob mantig'i `lib/hisob-yadro` (frontend), SQL da bir xil formula.
6. Qism (`qism`): `asosiy`, `nds_sotuv`, `nds_xarid` — QQS reyestri va tekshiruv uchun.

## 4. Hujjatlar → avtomatik provodkalar

Bir RPC `t2_bux_avto_provodka_v1` hamma manbani **sinxronlaydi** (idempotent): manbadan «bo'lishi kerak» to'plami hisoblanadi, jurnalda
mavjud sof (net) summa bilan solishtiriladi, faqat **farq (delta)** yoziladi. Natija:

- ikkinchi marta bosish — hech narsa yozmaydi;
- hujjat summasi o'zgarsa — delta provodka (ixtiyoriy ishorali) yoziladi;
- hujjat bekor qilinsa — minus (storno) provodka yoziladi; hech qachon tahrir/o'chirish emas.

Kalit: `(manba_tur, manba_id, qism, Dt, Kt, sana, kontragent, shartnoma, obyekt)`. «Quruq yurgizish» (`dry`) — hech narsa yozmasdan
nechta provodka hosil bo'lishini ko'rsatadi.

| Hujjat (holat) | Provodka (standart; **moslik jadvalidan** o'zgartiriladi) |
| --- | --- |
| Forma-3 / sotuv (`tayyor`, `imzolangan`, `sotuv_summa` bor) | Dt 4010 / Kt 9010 (QQS siz) + Dt 4010 / Kt 6410 (QQS) — kalit `sotuv.realizatsiya`, `sotuv.nds` |
| To'lov (`t2_tolov`), asosiy shartnoma (qabul qilindi) | Dt 5110 / Kt 4010 (`tolov.kirim`) |
| To'lov (`t2_tolov`), kontragent shartnomasi (to'landi) | Dt 6010 / Kt 5110 (`tolov.chiqim`) |
| To'lov `qaytarim` | xuddi shu hisoblar, minus summa |
| Ombor kirimi (qarz asosi `yetkazib_berish`, narxli) | Dt 1010 / Kt 6010 + Dt 4410 / Kt 6010 (QQS) — `xarid.ombor`, `xarid.nds` |
| Subpudrat/xizmat dalolatnomasi (`bajarilgan_ish`) | Dt 2010 / Kt 6010 + QQS — `xarid.ish`, `xarid.nds` |
| Qarz asosi `tolov` (t2_tolov ga bog'lanmagan) | Dt 6010 / Kt 5110 |
| Boshlang'ich qoldiq (kreditor) | Dt 8810 / Kt 6010 — `boshlangich.kreditor` |
| **Kadrlar (kelajak, HR agenti)** | `t2_bux_tashqi_sync_v1`: `manba_tur = hr_*` (masalan `hr_ish_haqi`). Moslik kalitlari tayyor: `ish_haqi.hisoblash` (Dt 2010 / Kt 6710), `ish_haqi.tolash` (Dt 6710 / Kt 5110). HR moduli qator ro'yxatini beradi, sinxron mexanizm bir xil. |

Bir to'lov ikki marta sanalmaydi: `t2_qarz_asos` dagi `tolov` qatori `t2_tolov` ga bog'langan bo'lsa, faqat `t2_tolov` hisoblanadi.
Avans ham to'lov kabi 4010/6010 da netlanadi (MVP); alohida 6310/4310 ajratish keyingi bosqich.

## 5. Davrni yopish (ogohlantirish asosida)

`t2_bux_davr` — oy bo'yicha «yopiq» belgisi (kim, qachon, izoh). Egasi qat'iy bloklashni emas, **ogohlantirishni** afzal ko'radi
(oylik paket kabi):

- Yopish `accounting.approve` talab qiladi. Yopishdan oldin tekshiruv: oyda provodkaga aylanmagan hujjat bor-yo'qligi (dry sinxron),
  oldingi oy ochiqligi. Ogohlantirish bo'lsa — foydalanuvchiga ko'rsatiladi, u «Baribir yopish» deb tasdiqlaydi.
- Yopiq oyga yangi provodka tushsa — **to'xtatilmaydi**, javobda `yopiq_davr_ogohlantirish` soni qaytadi va ekranda banner chiqadi.
- Yopilgan davrni qayta ochish mumkin (kim/qachon yoziladi).

## 6. Hisobotlar (MVP)

1. **Kontragent bilan hisob-kitob** — kontragent × hisob: boshlang'ich saldo, Dt oborot, Kt oborot, oxirgi saldo; qatorni bosish — hujjatlar
   (jurnal) ro'yxati (akt-sverka uslubi). Saldo: «+» — ular bizga qarz, «−» — biz qarzmiz.
2. **Oborot-saldo vedomost (ОСВ)** — davr uchun hisoblar bo'yicha; tekshiruv: jami Dt = jami Kt.
3. **Akt-sverka** (RU, Excel, `hujjat-yozuvchi` + `hujjatTokenBilan`) — kontragent bo'yicha, ikki tomon ustunlari (kontragent ma'lumoti bo'sh).
4. **QQS reyestri** — sotuv va xarid (hujjat, kontragent, asos, QQS), jami.
5. **Bank va kassa** — to'lovlar ro'yxati, CSV/Excel ko'chirma importi (kontragent va shartnomaga moslash), moslanmaganlar qo'lda.
6. **Jurnal** — barcha provodkalar, filtr (hisob, kontragent, shartnoma, davr), qo'lda provodka va storno.

Oddiy tillar: «Debet/Kredit» yonida tushuntirish (hover): «Debet — hisob ko'payadi / bizga qarz» va h.k.

## 7. Xavfsizlik va tuzilma

- Barcha RPC: `security definer`, `search_path = public, pg_temp`, a'zolik + rol + ruxsat tekshiruvi, faqat `service_role` ga `grant`.
- O'qish: `/api/sb` ro'yxati (`bux_*`, kompaniya + actor). Yozish: `/api/sb-yoz` oq ro'yxat + `write-command-policy` (`financial.write`);
  RPC ichida `accounting.write` / `accounting.approve`.
- Jadvallarda RLS yoqilgan, `anon/authenticated` dan huquqlar olingan.
- Yozuvchi RPC lar idempotent (`operation_id`), audit (`t2_audit_yoz`, 4-argument — obyekt id yoki null).
- Migratsiyalar `.rollback.sql` va `.acceptance.sql` bilan; **prodga qo'llanmagan** (egasi tartibi: avval prod, keyin merge).

## 8. MVP v1 doirasi va keyingi bosqichlar

**MVP v1 (shu branch):** hisoblar rejasi (seed + tahrir), jurnal (o'zgarmas, storno), 4 ta avto-manba (F3 realizatsiya, to'lov, ombor kirimi,
subpudrat aktlari), moslik jadvali, kontragent hisob-kitobi, ОСВ, akt-sverka (Excel), QQS reyestri, bank importi, davr yopish (ogohlantirish),
HR uchun tashqi manba ilgagi, ru/en tarjima, yangiliklar yozuvi.

**Keyingi:**
1. Tannarx va sotilgan mahsulot (Dt 9110 / Kt 2010, M-29 sarfi → 2010, F3 bilan davr tannarxi), tugallanmagan ishlab chiqarish yopilishi.
2. Avanslar (6310/4310) alohida va zachet; to'lovni hujjatga bog'lash.
3. Asosiy vositalar, amortizatsiya, kapital qo'yilmalar.
4. Ish haqi: HR moduli bilan to'liq integratsiya (hisoblash, ushlanmalar, INPS, daromad solig'i), tabel → provodka.
5. Valyuta va kurs farqi; bank ko'chirma formatlari (1C Klient-Bank, Xalq/Ipak/NBU CSV) — to'liq parser.
6. Soliq hisobotlari (QQS deklaratsiyasi, foyda solig'i), balans va foyda-zarar (P&L) hisobotlari, yil yopilishi.
7. 1C dan boshlang'ich qoldiq va jurnal importi; 1C bilan parallel sverka (Продажа ≠ F2 farqlari).
8. Qat'iy davr bloklash (ixtiyoriy, kompaniya sozlamasi), ko'p valyutali hisoblar, hujjat shablonlari (provodka qoidalari konstruktori).

## 9. Bulut rejasi (`docs/architecture/cloud-rejalar/HR_KPI_BUXGALTERIYA.md`) bilan farqlar

Reja o'qildi; shu build manba-haqiqat. Olingan g'oyalar: hisob rejasi `[T]` (buxgalter tasdiqlaydi), o'zgarmas jurnal + storno, hujjat -> provodka -> manba zanjiri («Nega bu summa?»), oddiy tildagi izohlar, davr yopish checklisti, ombor/F2/to'lovni faqat o'qish (ikki marta sanamaslik), HR/oylik ilgagi, bank importi (kontragent INN / shartnoma raqami bo'yicha moslash, AI emas — deterministik).

| Rejada | Shu MVP da | Sabab |
| --- | --- | --- |
| Alohida `t2_bux_hujjat` + qatorlar, `t2_bux_provodka_qoida` shablonlari, partitsiya, `t2_bux_saldo_oy` | Hujjat nusxalanmaydi: provodka manbaga `manba_tur+manba_id` bilan bog'lanadi; qoidalar `t2_bux_moslik` (kalit -> Dt/Kt); saldo so'rovdan hisoblanadi | Supabase hajmi chegarada (421/500 MB); mavjud hujjatlar dublikat qilinmaydi |
| Provodka summasi doim musbat, storno `storno_of_id` | Minus summa (qizil storno) + `storno_id`; avto-sinxron faqat delta yozadi | Egasi qoidasi: minus ruxsat; idempotentlik |
| Hujjat qoralama -> buxgalter tasdig'i | Manba hujjat holati (F3 `tayyor/imzolangan`, to'lov faol) provodka beradi; tasdiq - davr yopish | MVP soddaligi; tasdiq qatlami keyingi bosqich |
| `accounting.post` mutaxassis ruxsati | `accounting.write/approve` (mavjud) | Yangi ruxsat kodi egasi tasdig'ini talab qiladi |
| Kassa, OS, amortizatsiya, valyuta, Didox, balans/P&L, 1C import-eksport | Keyingi bosqich (§8) | MVP doirasi |
| Realizatsiya F2 dan sotuv hujjati | Faqat **Forma-3** (счёт-фактура) dan; F2 F3 ga o'tmaguncha provodka yo'q | 1C «Продажа» ≠ F2; ochiq savol (ustamasiz yoki ustamali) egasida qoladi - F3 summasi (`sotuv_summa`) haqiqat |

## 10. Tashqi manbalar ilgagi: kadrlar va logistika

`t2_bux_tashqi_sync_v1(manba_tur, qatorlar)` — modul o'z hujjatlaridan «bo'lishi kerak» provodkalarni beradi, sinxron faqat deltani yozadi (idempotent, bekor -> storno). Ruxsat etilgan prefikslar: `hr_*` (kadrlar: `hr_ish_haqi`) va `tr_*` (logistika PR #235: `t2_tr_*` va `t2_xarajat_kirit_v1` orqali tushgan МАШ/transport xarajatlari, masalan `tr_mash_xarajat`; standart juftlik Dt 2010 (obyekt analitikasi) / Kt 6010 yoki 6710 — modul belgilaydi). Logistika tomoni keyin shu RPC ni (BFF `bux_tashqi_v1`) chaqiradi yoki `t2_xarajat` dan avto-manba sifatida `_t2_bux_kerak_avto` ga qo'shiladi (yangi `xarid.mash` moslik kaliti bilan).