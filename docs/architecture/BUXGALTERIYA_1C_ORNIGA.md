# Buxgalteriya: 1C o'rniga (audit + ADR + yo'l xaritasi)

Holat: ADR, 2026-11-12. Egasi talabi: «1C darajasiga chiqarish; buxgalteriya 1C dan kechib keta olsin; oson ham, aniq ham» va
«har tarafda — pudratchi ham, zakazchik ham — buxgalter bor: universal, ideal darajada». Bu hujjat `BUXGALTERIYA_V1.md` (MVP dizayni) ustiga
quriladi, uni takrorlamaydi. Hujjatda haqiqiy summa, INN, kompaniya nomi yo'q. «T» = tekshirilsin (buxgalter/yurist): bu yerda qonuniy da'vo emas,
sozlanadigan qiymat.

## 1. Audit: bugun nima bor (prod, faqat tuzilma va qatorlar soni)

| Qism | Holat | Dalil |
| --- | --- | --- |
| Sahifa `/admin/buxgalteriya` (6 bo'lim: hisob-kitob, bank, ОСВ, QQS, jurnal, sozlama) | ISHLAYDI (UI to'liq) | `frontend/src/admin/sahifalar/Buxgalteriya.tsx`, `admin/buxgalteriya/*.tsx` |
| Hisoblar rejasi `t2_bux_hisob` (27 hisob seed, tahrir) | ISHLAYDI, prodda 0 qator (hech kim «Boshlash» bosmagan) | `20261126500000_...asos_v1.sql:12-30, 128-170` |
| Jurnal `t2_bux_provodka` (o'zgarmas, storno) | ISHLAYDI, 0 qator | `asos_v1.sql:53-85`; trigger UPDATE/DELETE ni taqiqlaydi |
| Qoidalar `t2_bux_moslik` (kalit → Dt/Kt) | ISHLAYDI, 0 qator | `asos_v1.sql:32-45`, `_t2_bux_moslik_seed` |
| Avto-provodka `t2_bux_avto_provodka_v1` (delta-sinxron) | ISHLAYDI: F3, to'lov, ombor kirimi, subpudrat akti, qarz asosi | `20261126500100_...rpc_v1.sql:56-150, 399-425` |
| ОСВ, kontragent hisob-kitobi, QQS reyestri, bank/kassa RPC | ISHLAYDI | `rpc_v1.sql:152-330` |
| Akt-sverka Excel (token bilan) | ISHLAYDI (bitta kontragent) | `lib/buxgalteriya/eksport.ts` |
| Davr yopish | YARIM: faqat ogohlantirish, yopiq oyga yozish to'xtatilmaydi | `rpc_v1.sql:482-512` |
| Hisob kartochkasi (карточка счёта) | YO'Q (jurnal hisob bo'yicha filtr bor, yuruvchi saldo yo'q) | — |
| `t2_xarajat` (kategoriyali xarajat) → provodka | YO'Q (jadval 0 qator, manba ulanmagan) | — |
| `t2_tomon_taqdim` qabul qilingan F2 → xaridor daftari | YO'Q (jadval 0 qator) | — |
| HR: `t2_hr_oylik_buxgalteriya_v1` | STUB: faqat o'qiydi, provodka beruvchi iste'molchi yo'q; qoidalar kaliti (`ish_haqi.*`) tayyor | `t2_bux_tashqi_sync_v1` ilgagi bor |
| Foyda/zarar, qarzdorlik, pul oqimi | PARALLEL jami: `rahbar_panel_v1` / `t2_pul_tahlil_v2` / `t2_qarz_svod_v1` jurnaldan o'qimaydi | — |
| Asosiy vositalar, amortizatsiya, balans, soliq hisobotlari, valyuta | YO'Q | — |

Qatorlar soni (prod): `t2_bux_*` 0, `t2_tolov` 0, `t2_xarajat` 0, `t2_forma3` 1, `t2_qarz_asos` 0, `t2_hr_oylik` 0, `t2_kontragent` 1, tasdiqlangan F2 49,
`t2_sklad_harakat` ≈8,7 ming. Xulosa: buxgalteriya kodi tayyor, lekin **hech qachon ishlatilmagan**; haqiqiy ma'lumot hali tizimga kirmagan.

Topilgan bo'shliqlar (shu PR yopadi): yopiq davr bloki, kartochka, xarajat manbasi, tomon shablonlari (xaridor tomon), T belgisi, qabul qilingan taqdim.

## 2. Buxgalter 1C da har oy nima qiladi — tizim qoplashi kerak (qoplanish holati)

Belgilar: **Hujjat** = manba hujjat tizimda bormi; **Avto** = provodka avtomatikmi; **Holat** = hozir (P1 dan keyin) / keyingi bosqich.

| Ish | Hujjat | Avto | Bo'shliq / holat |
| --- | --- | --- | --- |
| **Bank va kassa** | | | |
| Bank ko'chirmasini kiritish | `t2_tolov` (+ bank importi CSV) | ha (to'lov) | Klient-Bank formatlari to'liq parser yo'q (P4). Kassa (5010) kirim/chiqim orderi hujjati yo'q (P4) |
| Bank ↔ schyot solishtirish (sverka) | — | — | ОСВ 5110 bor; ko'chirma bilan avto-moslash P4 |
| **Sotuv va buyurtmachi hisob-kitobi** | | | |
| Realizatsiya (F2 → Forma-3 → ESF) | `t2_forma3` (+ ESF tayyorlash) | ha (4010/9010 + QQS 6410) | **P1 tayyor.** ESF ni Didox/soliq tizimiga yuborish yo'q (P5) |
| Buyurtmachi to'lovi, avans (6310) | `t2_tolov` | to'lov ha; avans alohida emas | Avans/zachet ajratish P3 |
| Akt-sverka (kontragent bilan) | jurnal | ha | Ikki kompaniya o'rtasida avto-sverka: §5, P3 |
| **Xarid va yetkazuvchi hisob-kitobi** | | | |
| Ombor kirimi, subpudrat akti | `t2_qarz_asos`, `t2_sklad_harakat` | ha (1010/2010 + QQS 4410 / 6010) | **P1 tayyor** (summa narxli qarz asosidan) |
| Yetkazuvchiga to'lov | `t2_tolov` | ha | tayyor |
| **Ombor / materiallar** | | | |
| M-29: materialni obyektga hisobdan chiqarish (1010 → 2010) | `t2_sklad_harakat` (narxsiz!) | yo'q | Narx manbasi kerak (partiya/o'rtacha); P2. xarajat.mat qoidasi shu uchun o'chirilgan |
| Inventarizatsiya | ombor | yo'q | P4 |
| **Ish haqi va naryad** | | | |
| Oylik hisoblash, ushlanma, INPS, daromad solig'i | `t2_hr_oylik`, naryad | yo'q (ilgak tayyor) | P3. Stavkalar T va sozlanadigan bo'ladi |
| Ish haqi to'lovi | `t2_tolov` | qisman | P3 |
| **Subpudratchilar** | | | |
| Subpudrat akti + garov/ushlab qolish | `t2_qarz_asos` | akt ha | Ushlab qolish (garov) hisobi P3 |
| **Asosiy vositalar** | | | |
| Kirim, amortizatsiya, chiqim | yo'q | yo'q | P4: hujjat ham, hisob ham yangi |
| **QQS** | | | |
| Kiruvchi/chiquvchi QQS kitobi | F3, qarz asosi | ha (6410 / 4410 ajratilgan) | **Reyestr bor.** Deklaratsiya shakli P5; stavka/qoidalar T |
| **Tannarx (obyekt bo'yicha)** | | | |
| To'g'ri xarajat obyektga (2010) | `t2_xarajat` ЧЕЛ/МАШ/ОБ; subpudrat akti; ombor kirimi | ha (**P1**) | МАТ/SUB qoidasi o'chirilgan (ikki marta sanalmasin). Ustama xarajat taqsimoti, 2010 → 9110 yopilishi P2 |
| **Davrni yopish** | | | |
| Oy yopish, bloklash | `t2_bux_davr` | — | **P1:** qat'iy blok (sukut) + ogohlantirish rejimi. Davr yopish amallari (kurs farqi, 2010→9110) P2 |
| **Hisobotlar** | | | |
| Oborot-saldo (ОСВ) | jurnal | — | **P1 tayyor** + Excel |
| Hisob kartochkasi | jurnal | — | **P1 tayyor** |
| Balans, foyda-zarar | jurnal | — | P2 (jurnaldan; `rahbar_panel_v1` shu manbaga o'tadi) |
| **Soliq/statistika hisobotlari** | | | |
| QQS, foyda solig'i, INPS, statistika | — | — | P5; shakllar T, buxgalter tasdig'i bilan |
| **1C dan o'tish** | | | |
| Boshlang'ich qoldiqlar | 1C ОСВ eksporti | — | §4: P2 (bir martalik import) |

## 3. Maqsad dizayn

### 3.1 Tamoyillar (o'zgarmas)
1. **Yagona daftar.** Barcha pul ko'rinishlari (foyda/zarar, qarzdorlik, pul oqimi, ОСВ) bitta jadvaldan — `t2_bux_provodka` — o'qiydi. Parallel jami yo'q.
   Bugungi parallel hisoblar (`rahbar_panel_v1`, `t2_pul_tahlil_v2`, `t2_qarz_svod_v1`) P2 da jurnalga o'tadi; ular shu paytgacha **solishtirish signali**.
2. **Ikki yoqlama.** Bir qator = bitta Dt + bitta Kt + bitta summa; muvozanat tuzilma bilan ta'minlangan (`check dt <> kt`, minus = storno). Murakkab yozuv =
   bir manbadan bir nechta qator (masalan realizatsiya + QQS). Alohida «sarlavha+qator» jadvali ATAYLAB yo'q: ta'minot 500 MB chegarasida
   har yozuvga ikkita qator bo'lardi, muvozanat esa baribir bir xil. Savol 4 ga qarang.
3. **Manba bilan bog'liq, o'zgarmas.** Har qator `manba_tur+manba_id`; UPDATE/DELETE trigger bilan taqiqlangan; tuzatish faqat storno yoki yangi yozuv.
4. **Idempotent.** Avto: «bo'lishi kerak» to'plami va jurnal sof summasi farqi (delta) yoziladi → qayta yurgizish = 0. Qo'lda/yozuvchi RPC: `operation_id` (`t2_onboarding_command_log` PK) bir xil javob.
   (Qatorda alohida `operation_id` ustuni qo'shilmadi: bir sinxron ko'p qator yozadi, unique bo'lmaydi.)
5. **Davr bloki.** `t2_bux_davr` + `t2_bux_sozlama.davr_blok` (sukut true): yopiq oyga INSERT triggerda rad (`BUX_DAVR_YOPIQ`), sinxron esa «o'tkazildi» deb sanaydi. Yopish/ochish `accounting.approve` (rol bugalter/rahbar).
6. **QQS ajratilgan.** Summa QQS bilan keladi; asos va QQS alohida qator (`qism`: asosiy / nds_sotuv / nds_xarid), `jami = asos + QQS` ayirma bilan. Stavka sozlanadigan (`param.nds_foiz`, T).
7. **Pul hisobi** yagona yadro orqali: frontend `lib/hisob-yadro`, SQL V1 formulasi (ayirma). Yangi mahalliy yaxlitlash yozilmaydi.
8. **Hajm.** Provodka qatori ≈100 bayt + indekslar; 1 ta kompaniya yiliga 20–60 ming qator → 4–10 MB/yil (§6).

### 3.2 Universal: har tomon o'z daftarida
- Hamma kompaniyaning (pudratchi, buyurtmachi, subpudratchi, yetkazuvchi, loyihachi, texnik nazorat, laboratoriya) daftari **bir xil dvigatelda**, `kompaniya_id` bilan.
  Jadval/RPC nomlari va mantig'ida «biz pudratchimiz» farazi yo'q: tomon farqi faqat **qoida shabloni**da (ma'lumot).
- **Hisoblar rejasi shabloni** (`_t2_bux_hisob_seed`, milliy reja NSBU № 21) hamma tomon uchun bir xil; tomon turi faqat qoidalar va standart ekranni o'zgartiradi.
  Seed: 16 hisob «ishonchli» (4010, 5110, 6010, 2010, 9010 ...), qolgani `tekshirilsin=true` («T» belgisi) — buxgalter rasmiy reja bilan solishtirib «Tasdiqlash» bosadi.
- **Qoida shablonlari** `t2_bux_shablon(shablon, kalit, dt_kod, kt_kod)`; kompaniya shablonni tanlaydi (`t2_bux_shablon_tanla_v1`), qoidalari `t2_bux_moslik` ga ko'chadi va tahrirlanadi.
  Dt/Kt NULL = qoida o'chirilgan (ma'lumot tayyor, provodka yo'q).
- Bitta umumiy hujjat — har tomonda o'z yozuvi (P1 da tayyor ikkita shablon):

| Umumiy fakt | Pudratchi (shablon `pudratchi`) | Buyurtmachi (shablon `buyurtmachi`) |
| --- | --- | --- |
| Forma-3 / qabul qilingan F2 | Dt 4010 / Kt 9010 (+ QQS Dt 4010 / Kt 6410) | Dt 0800 / Kt 6010 (+ QQS Dt 4410 / Kt 6010) — T |
| To'lov | Dt 5110 / Kt 4010 (kirim) | Dt 6010 / Kt 5110 (chiqim) |
| Yetkazuvchidan xarid | Dt 1010 / Kt 6010 | (yetkazuvchi shablonida sotuv) — P2/P3 |

- **Tomonlararo hujjat hodisasi.** `t2_tomon_taqdim.holat = 'qabul'` (resurs `f2`) = «ikkinchi tomon qabul qildi». Qabul qiluvchi kompaniya daftari shu faktdan `taqdim.f2` qoidasi bilan
  yozadi; taqdim etuvchi o'z daftariga o'z F3 sidan yozadi (ikki marta emas: F2 = nakopitelniy = F3 zanjiri, F2 o'zi daromad bermaydi). Har tomon **faqat o'z** `kompaniya_id` sidagi
  qatorlarni ko'radi (RPC a'zolik + rol + ruxsat). Boshqa tenantning `shartnoma_id`/`obyekt_id` si xaridor daftariga **yozilmaydi** (NULL); kontragent STIR bo'yicha o'z kontragentlari orasidan topiladi.
  Taqdim versiyasi qayta qabul qilinsa (`oldingi_taqdim_id`) eskisi sanalmaydi.
- **Tomonlararo akt-sverka** (dizayn; P3): ikki kompaniya o'zaro hisob-kitobni o'z daftarlaridan oladi (4010/6010 kontragent kesimi, STIR bo'yicha juftlash); farq qator-ma'qator
  ko'rsatiladi (hujjat raqami/sana/summa bo'yicha moslash). Har tomon faqat o'z yarmini ko'radi; ikkinchi tomon yarmi faqat u **taqdim** qilsa («sverka» resursi) beriladi. Hozir bitta kompaniya uchun
  kontragent bo'yicha akt-sverka Excel bor.

### 3.3 Provodka qoidalari = ma'lumot
Kalit → (Dt, Kt). Analitika kodda emas, manbadan: kontragent (shartnoma tomoni / STIR), shartnoma, obyekt (shartnomaning yagona obyekti), xarajat turi (kalit orqali: `xarajat.chel/mash/ob/mat/sub/otk`).
Manbalar P1 da: F3, to'lov, ombor kirimi, subpudrat akti, qarz asosi to'lovi, boshlang'ich kreditor qoldig'i, **xarajat**, **qabul qilingan taqdim**.
Tayyor-lekin-o'chirilgan: `xarajat.mat` (ombor kirimi + M-29 bilan ikki marta), `xarajat.sub` (subpudrat akti bilan ikki marta), `xarajat.otk` (hisob T), `ish_haqi.*` (HR ilgagi iste'molchisi yo'q).
`xarajat.chel` yoqilgan: HR ilgagi yoqilganda (P3) uni o'chirish shart.

### 3.4 Ruxsat va xavfsizlik
Yangi ruxsat kodi yo'q: o'qish `accounting.read`, yozish `accounting.write`, davr/qoida/shablon `accounting.approve` (mavjud rol `bugalter`, rahbariyat). Hamma RPC `security definer`,
a'zolik tekshiriladi, faqat `service_role`; jadvallar RLS, `anon/authenticated` huquqsiz.

## 4. 1C dan bir martalik boshlang'ich qoldiq importi (P2 da quriladi)
1. Buxgalter 1C dan «Оборотно-сальдовая ведомость» (schyot × kontragent × shartnoma × obyekt) Excel eksportini yuklaydi (`.xlsx`, hujjat-dvigatel kirish yo'li).
2. Tizim hisob kodlarini rejaga, kontragentlarni STIR/nom bo'yicha, shartnomalarni raqam bo'yicha moslaydi (deterministik; moslanmagani ro'yxat).
3. Ko'rik ekrani: schyot bo'yicha jami Dt = jami Kt (1C jami bilan solishtirish); xato bo'lsa to'xtaydi.
4. Tasdiqlanganda **bitta** ochilish provodkalari to'plami yoziladi: `manba_tur='boshlangich_saldo'`, sana = ochilish sanasi (oldingi oy yopilgan), 8810/9910 tomoni muvozanat uchun. `operation_id` bilan idempotent, storno bilan qaytariladi.
5. Parallel sverka davri: 1–2 oy tizim va 1C ОСВ yonma-yon (farq ekrani); keyin 1C o'chiriladi.
Hajm: bir ochilish ≈ 200–2000 qator ≈ 0,2–0,5 MB.

## 5. Yo'l xaritasi

| Bosqich | Mazmuni | Buxgalter 1C da nima qilmay qo'yadi | DB hajmi |
| --- | --- | --- | --- |
| **P1 (shu PR)** | Universal yadro: shablonlar (pudratchi, buyurtmachi), qat'iy davr bloki, kartochka, ОСВ + Excel, xarajat va taqdim manbalari, T belgisi, UI (ОСВ, kartochka, jurnal+hujjatga o'tish, reja, qoidalar, davr) | Realizatsiya/to'lov/xarid/xarajat provodkalarini qo'lda kiritish; ОСВ va kartochka olish | +0,1 MB (jadvallar bo'sh) ; ish boshlanganda ≈ 4–10 MB/yil/kompaniya |
| **P2** | M-29 → 2010 (narx manbasi), ustama xarajat taqsimoti, 2010→9110 yopilishi, balans, foyda-zarar, Foyda/zarar/qarzdorlik/pul oqimi jurnaldan o'qiydi, 1C boshlang'ich saldo importi | Oylik tannarx yopish va balans/foyda-zarar | +1–3 MB |
| **P3** | Ish haqi (HR ilgagi), naryad, avans/zachet (4310/6310), ushlab qolish, tomonlararo akt-sverka, yetkazuvchi/subpudratchi shablonlari | Ish haqi provodkalari, avans zachet, sverka | +2–5 MB |
| **P4** | Asosiy vositalar va amortizatsiya, kassa orderlari, bank formatlari parseri, inventarizatsiya, loyihachi/nazorat/laboratoriya shablonlari | OS va kassa ishlari | +1–3 MB |
| **P5** | QQS/foyda solig'i/INPS/statistika hisobotlari, ESF/Didox yuborish, yil yopish | Soliq hisobotlari (hammasi T) | +1 MB |
| **P6** | Parallel davr tugashi, 1C o'chirish, ko'p valyuta (kerak bo'lsa) | 1C ni butunlay | — |

Sabab-tartib: hamma keyingi qatlam jurnal va davr blokiga tayanadi, shuning uchun P1 «yadro».

## 6. Hajm hisobi (Supabase 500 MB, ≈463 MB band)
Qator ≈ 100–130 bayt + 4 indeks ≈ 250 bayt. Kichik kompaniya: oyiga 1–3 ming provodka → ≈ 0,5–1 MB/yil... zich pudratchi: 40 ming qator/yil ≈ 10 MB.
Chegara: bitta kompaniya >100 ming qator/yil bo'lsa — eski yillar R2 ga (arxiv, davr yopilgach) va ОСВ uchun oylik saldo jadvali (P2). P1 yangi jadvallari kichik ma'lumotnoma (`t2_bux_shablon` ≈ 22 qator, `t2_bux_sozlama` kompaniya soniga teng).

## 7. P1 da qilinganlar (bu PR)
Migratsiya `20261216200000_t2_buxgalteriya_yadro_v2` (forward, rollback, acceptance): `t2_bux_shablon`, `t2_bux_sozlama`, `t2_bux_hisob.tekshirilsin`, davr bloki triggeri,
`_t2_bux_sync` (blok), `_t2_bux_kerak_v2` (xarajat, taqdim, xaridor to'lovi), `t2_bux_kartochka_v1`, `t2_bux_sozlama_v1`, `t2_bux_shablon_tanla_v1`, `t2_bux_davr_blok_v1`, `t2_bux_hisob_tasdiq_v1`.
UI: ОСВ (+Excel, token kaliti `OBOROT_SALDO`), Hisob kartochkasi, Provodkalar jurnali (hujjatga o'tish), Hisoblar rejasi (T), Qoidalar (shablon), Davrni yopish (blok).
Jarvis: sinonimlar (oborotka, 60 schyot kartochkasi, provodkalar). **Qo'llanmagan**: migratsiya prodga qo'llanmagan va acceptance bazada yurgizilmagan (egasi tartibi: avval prod, keyin merge).

## 8. EGASIGA / BUXGALTERGA SAVOL (≤ 8)

1. **Realizatsiya manbai: F2 yoki Forma-3?** Variantlar: (a) faqat Forma-3 (счёт-фактура), F2 daromad bermaydi; (b) F2 tasdiqlanganda daromad, F3 faqat QQS uchun.
   Tavsiya: **(a)** — 1C «Продажа» ≠ F2 tajribasi, ikki marta sanash xavfi yo'q (hozir shunday).
2. **Yopiq davr:** qat'iy blok yoki ogohlantirish? Tavsiya: **qat'iy blok** (sukut yoqilgan, kompaniya o'chira oladi).
3. **t2_xarajat summasi QQS bilan yoki QQS siz?** Variantlar: QQS siz (to'g'ridan 2010) / QQS bilan (ajratish kerak). Tavsiya: **QQS siz deb olingan**, buxgalter tasdiqlasin (T).
4. **Provodka modeli:** bir qator = Dt+Kt (hozir) yoki sarlavha + ko'p qatorli (1C kabi)? Tavsiya: **hozirgi** (kichik hajm); ko'p qatorli hujjat ko'rinishi UI da jamlab ko'rsatiladi.
5. **Hisoblar rejasi kodlari** (0800, 4310, 4410, 6310, 6410, 8810 ...) rasmiy NSBU № 21 bilan mosligi: buxgalter «T» belgilarini tekshirib tasdiqlaydi. Tavsiya: **birinchi ish kuni**, ishlatishdan oldin.
6. **Buyurtmachi tomon qabul qilingan F2 summasi QQS bilan keladimi?** Variantlar: QQS bilan (ayirib ajratiladi — hozirgi) / QQS siz. Tavsiya: **QQS bilan**, tasdiqlang.
7. **Ish haqi:** naryaddan hisoblanadimi yoki oylik tabeldan? Qaysi ushlanma stavkalari (INPS, daromad solig'i) sozlamaga yoziladi? Tavsiya: **tabel + naryad**, stavkalar sozlamada, buxgalter kiritadi (T).
8. **1C bilan parallel davr** necha oy (1 / 2 / 3)? Tavsiya: **2 oy** (P2 importidan keyin).

## 9. P2 holati (PR claude/buxgalteriya-p2, migratsiya 20261216210000; prodga qo'llanmagan)
- **Yagona manba:** `t2_bux_pul_korinish_v1` obyekt/shartnoma kesimida daromad (9010), xarajat toifa bo'yicha (2010; toifa `t2_xarajat.kat` yoki subpudrat akti), tushgan, qarz (4010), kreditor (6010), pul (5010/5110), tannarx (9110) beradi.
  «Foyda / zarar» ekrani (PR #379) jurnalda provodka bo'lsa shu RPC dan o'qiydi va qaysi manba ekanini ekranda yozadi; jurnal bo'sh bo'lsa eski manba (F2/xarajat/to'lov) zaxira. Parallel jami yo'q.
  Hozircha jurnaldan kelmaydigan: obyektsiz daromad kompaniya jamida ko'rinmaydi (taqsimlanmagan sifatida RPC da bor, ekranda keyingi qadam).
- **Hisobotlar:** `t2_bux_hisobot_qator` (qator → hisoblar xaritasi, standart + kompaniyaning o'zi, hammasi T), `t2_bux_hisobot_v1` (balans: davr oxiriga saldo; foyda-zarar: davr oboroti),
  balans muvozanati tekshiruvi (aktiv − passiv) va shaklga kirmagan hisoblar ro'yxati. Joriy davr natijasi (9xxx) passivda ko'rsatiladi — yil yopilishi P5. Shakl tahriri hozir RPC (`t2_bux_hisobot_saqla_v1`), ekrani keyin.
- **Boshlang'ich qoldiq:** `t2_bux_saldo_import_v1` (ko'rik: hisob mavjud, summa, analitika, Dt = Kt; yozish: bitta partiya, qarshi hisob sozlanadi, sukut 8810, T) va `t2_bux_saldo_bekor_v1` (storno). Ustunlarni moslash mijozda (`lib/buxgalteriya/saldo.ts`), real fayl tuzilishi qattiq yozilmagan.
- **Tannarx:** qoida ma'lumot (`tannarx.yopish` 9110/2010), usul: daromad tan olingan obyektning butun 2010 qoldig'i (T — ulushli usul buxgalter bilan), ko'rik, delta, bekor = storno, oylar tartibi (`KEYINGI_OY_BOR`).
- **Ish haqi/naryad (P2 #4):** BAJARILMADI. Sabab: HR #380 va naryad #375/#377 hali birlashmagan; ikki marta sanalmasligi uchun «bir fakt — bir manba» qarori kerak (`xarajat.chel` va `ish_haqi.*` bir vaqtda yoqilmaydi). P3.
