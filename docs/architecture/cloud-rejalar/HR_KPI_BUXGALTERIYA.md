# HR + KPI + Buxgalteriya (1C o'rnini bosuvchi) — dizayn hujjati

Holat: **LOYIHA (kod yo'q, prod'ga yozilmagan)** · 2026-11-03 · muallif: ERP arxitektori (Claude) · asos: egasi talablari A) va B).
Bo'ysunadi: `docs/governance/CONSTITUTION.md`, `docs/architecture/ekotizim/E1–E7`, AGENTS.md §2a/2b/2c.
Belgilar: **[T]** — tekshirish kerak (qonun/me'yor/stavka, buxgalter yoki yurist tasdig'isiz kodga yozilmaydi). **[Q]** — egasi qarori kerak (§6).
Real summa/ism/INN bu hujjatda YO'Q. Prod'dan faqat SELECT bilan sxema o'qildi (2026-11-03).

---

## 0. Qisqa mazmun (rahbariyat uchun)

1. HR va buxgalteriya hozir **deyarli bo'sh**: HR — 2 ta eski jadval (`t2_erp_kadr`, `t2_kadr_mustaqil`), 0 qator, RPC faqat `t2_kadr_yarat`; tabel/oylik/KPI yo'q. Buxgalteriya — to'lov/xarajat/faktura oddiy ro'yxatlari + debitor/qarz ko'rinishlari; **hisob rejasi, provodka, jurnal, kassa/bank, QQS, OS, balans yo'q**.
2. Strategiya: **hodisaga asoslangan hujjat → provodka** modeli. Mavjud domenlar (F2, to'lov, ombor, uy sotuv, tender) o'z jadvalini o'zgartirmaydi; ular `t2_outbox` hodisasi chiqaradi, yangi `bux` qatlami hodisani hujjatga, hujjatni provodkaga aylantiradi.
3. Ikki xil hisob aralashtirilmaydi: **boshqaruv hisobi** (mavjud `t2_xarajat`/`t2_tolov`/moliya tahlil — L0 yo'li, ustamali ko'rinish) va **tartibga solingan hisob** (BHMS №21 jurnal — yangi, ustamasiz, QQS alohida). Ularni bog'laydigan narsa — hujjat `manba_ref`.
4. KPI = **qoida konstruktori** (rol → ko'rsatkich → og'irlik → maqsad → davr), manbalari faqat deterministik read-model RPC (tasdiqlangan F2, muddat, predpisaniye, hujjat to'liqligi). Bonus/jarima — oylik hisobiga **qator** bo'lib tushadi, oylik → buxgalteriyaga provodka.
5. F2 muzlaydi va bekor/storno bo'lishi mumkin ⇒ bonus F2 ga **bog'liq tuzatish qatori** (teskari yozuv) bilan ishlaydi; yopilgan davr o'zgarmaydi, tuzatish keyingi davrga tushadi.
6. Birinchi 2 PR: (PR-1) HR yadrosi: xodim kartasi/lavozim/shtat + ruxsat; (PR-2) Hisob rejasi + jurnal yadrosi (BHMS №21 seed, `bux_provodka` append-only, qo'lda hujjat + provodka ko'rsatish). Ikkalasi L0 yo'liga tegmaydi.

---

## 1. Inventarizatsiya (hozirgi holat)

### 1.1 HR / kadr / oylik

| Qatlam | Bor | Izoh |
|---|---|---|
| Jadval | `t2_erp_kadr` (ism, lavozim, `oylik_maosh`, status, obyekt_id) — eski GAS ko'chirishi; `t2_kadr_mustaqil` (ism_sharif, lavozim, `oylik_maosh`, valyuta, holat, versiya, `foydalanuvchi_id`); `t2_kadr_bog` (kadr↔obyekt) | prod'da ikkalasi **0 qator** (o'lchov 2026-11-03). Tenant/PII/tarix modeli yo'q (tug'ilgan sana, PINFL, shartnoma, bo'lim, shtat — yo'q) |
| RPC | `t2_kadr_yarat`, `t2_texnika_yarat` (eski uslub) | actor/operation_id/versiya standarti bo'yicha tekshirilmagan — qayta yoziladi |
| Frontend | `api/t2-erp.ts` → `sbErpDashboardOl('kadrlar',…)` (faqat dashboard) | tabel/grafik/ta'til/oylik ekrani yo'q |
| Ruxsat | E2 §3 da `hr.read/write/pii.read/pii.write/hr.tabel.write`, `payroll.read/write` **loyihalangan**, rollar `kadr`, `brigadir`, `bugalter+` | amalda katalogga ko'chirilganini F1 migratsiyasida (`20261108010000_t2_ekotizim_f1_ruxsat_v1`) tekshirish kerak; hozirgi uy-sotuv seed'ida `bugalter` = `financial.read/write` |
| Dizayn | E3 §4.11: `t2_tabel`, `t2_ish_haqi_hisob`, `t2_usta_daromad_v1` — **faqat eskiz**, jadval yo'q | Bu hujjat E3 §4.11 ni kengaytiradi (nomlar mos) |
| KPI/bonus/jarima/ta'til/grafik | **yo'q** | — |

### 1.2 Buxgalteriya

| Qatlam | Bor | Izoh |
|---|---|---|
| Jadval | `t2_tolov` (shartnoma bo'yicha avans/to'lov/qaytarim, `hujjat_raqam`, `manba`), `t2_xarajat` (kat ЧЕЛ/МАШ/МАТ/ОБ/SUB/OTK, manba `glavbux_import|qolda`), `t2_faktura` (raqam, kontragent matn, `inn` matn, summa, `items jsonb`), `t2_kontragent` (inn, mfo, hisob_raqam, `qqs_tolovchi`, `tomon_kompaniya_id`), `t2_qarz_asos` (qarz asosi qatorlari), `t2_tolov_taqsimot` (to'lov↔F2 taqsimoti), `t2_f2_reestr_jami`, `t2_moliya_qolda`, `t2_sotuv_*` (uy sotuv: bitim, grafik, `t2_sotuv_tolov`), `t2_tolov_sorov` (token to'lovi — platforma billing, **buxgalteriya emas**) | prod'da `t2_tolov/xarajat/faktura/kontragent` — 0 qator (o'lchov sanasi). Hammasi bir tomonlama yozuv — **ikki yoqlama yo'q** |
| RPC | `t2_tolov_yoz/tahrir/ochir`, `t2_xarajat_yoz/tahrir/ochir`, `t2_xarajat_kirit_v1/bekor_v1/royxat_v1`, `t2_faktura_yoz`, `t2_qarz_svod_v1`, `t2_qarzdorlik_*_v1`, `t2_sverka_import_v1`, `t2_sverka_moslash_v1`, `t2_tolov_taqsimot_saqla_v1`, `t2_pul_tahlil_v2`, `t2_moliya_tahlil_v1` (16 ko'rsatkich), `t2_boshqaruv_tolovlar_v1`, `t2_sotuv_tolov_yoz_v1` | Yangi uslub (`*_v1`: actor, `operation_id`, `versiya`, `financial.*`) — **namuna shu** |
| View | `t2_bux_dashboard` (shartnoma bo'yicha bajarilgan/to'langan/debitor/avans), debitor aging, `t2_kreditor_qarz` (E3 da rejalangan) | `bajarilgan` — toza F2 jami (ustamasiz), halol-sodda |
| Frontend | `api/t2-buxgalteriya.ts`, `api/t2-qarzdorlik.ts`, `api/t2-boss.ts`, `api/t2-didox.ts` (bitta `fetch('/api/didox-webhook')`), `api/t2-kontragent.ts`; `lib/moliya-tahlil.ts`, `lib/pul-tahlil.ts`, `lib/qarzdorlik/*`, `lib/sverka-1c/*` (1C akt-sverka **importi**, F2 bilan moslash), `lib/nakopitelniy-svod`, `lib/hisob-yadro/*` (yagona pul yadrosi, `nds.ts`); sahifalar `admin/sahifalar/Qarzdorlik.tsx`, `BossDashboard.tsx`, `F2Reestr.tsx`, `F2OylikPaket.tsx`, `NakopitelniyVedomost.tsx` | Eski GAS: `Smeta tizimi/85_Buxgalteriya.js` (ko'chirib bo'lingan) |
| Shlyuz | `functions/api/didox-webhook.ts`, `object-financials.ts`, `boss-dashboard.ts` | Didox — webhook ulangan, e-faktura **yaratish/qabul/tasdiq** oqimi to'liq emas [T: kod o'qilmadi, §6 savol] |
| Ruxsat | `financial.read/write` (taxallus), E2 da `accounting.read/write/approve` loyihalangan | `bugalter` roli bor (`F2 yozish yopiq` migratsiyasi — buxgalter F2 yozmaydi) |

### 1.3 Nima YO'Q (1C bilan solishtirganda bo'shliq)

Hisob rejasi; provodka jurnali; hujjat turlari (kassa kirim/chiqim orderi, bank vipiska, avans hisoboti, nakladnoy, schyot-faktura, OS kirim/amortizatsiya, oylik vedomost); kassa va bank daftari; kontragent bo'yicha **schyot (60/40-turdagi)** hisob-kitob; QQS kitobi (xarid/sotuv) va deklaratsiya; e-faktura hayot sikli; ustama xarajatlarni obyektga taqsimlash (ХВ/накладные); asosiy vositalar va amortizatsiya; aylanma-saldo, balans, moliyaviy natijalar; davr yopish; 1C import/eksport; xodim/oylik/soliq hisobi; tabel; KPI.

---

## 2. Umumiy arxitektura tamoyillari (ikkala modul uchun)

1. **Domen egaligi (E3 ga qo'shiladi):** yangi domenlar `hr` va `bux`. `hr.*` jadvallari — `t2_hr_*`, `bux.*` — `t2_bux_*`. Mavjud `t2_erp_kadr`, `t2_kadr_mustaqil` — **meros**: `t2_hr_xodim` ga bir martalik idempotent import (E3 §5.8: `manba='gas_import'`, xaritalanmaganlar hisobotga), keyin eski RPC lar yopiladi (`deprecated`), jadval o'chirilmaydi.
2. **Har yozuv** (Konstitutsiya): nomli `SECURITY DEFINER` RPC; `p_actor_id` sessiyadan (shlyuz), `p_kompaniya_id` (tenant, DB'da ham tekshiriladi), `p_operation_id uuid` idempotent, o'zgaruvchan qatorda `versiya` + `p_kutilgan_versiya`; hard delete yo'q (`holat`); RLS yoqilgan, policy yo'q, anon/authenticated'ga GRANT yo'q (E2 §5 shabloni); audit — `t2_audit_log` + domen audit jadvali.
3. **Hujjat → provodka (bux):** hujjat o'zgaruvchan (`qoralama → tasdiqlangan`), provodka **append-only**. Tuzatish — storno provodka (teskari ishora), hech qachon UPDATE/DELETE. Davr yopilgach yozuv taqiqlanadi (davr qulfi).
4. **Pul qoidasi (AGENTS §2b):** har summa ekranda — ustamali (katta) + ustamasiz (kichik), **QQS alohida yorliq**. Qaerda: (a) KPI bonus bazasi va ekranlari; (b) sotuv tushumi/F2 asosidagi hisobotlar. **Provodka jurnali ustamasiz + QQS alohida** (buxgalteriya hisobi sotuv narxida emas, haqiqiy qiymatda yuritiladi — ustama boshqaruv ko'rinishi). Formula YOZILMAYDI: `SummaJuft`, `useUstamaliSumma`, `lib/ustamali-summa.ts`; serverda — F2 ustama read-model (`_t2_f2_ustamali`, L0). Kategoriya noma'lum bo'lsa — «taxminiy (kat noma'lum: N so'm)», 0 emas. `NULL ≠ 0` har joyda: noma'lum summa ⇒ KPI/bonus «hisoblab bo'lmaydi», jim 0 emas.
5. **F2 muzlaydi:** HR/bux F2 jadvaliga **hech qachon yozmaydi** va F2 qatorini o'zgartirmaydi; faqat **o'qish read-model RPC** (L0 beradi) va **hodisa** (`f2.tasdiqlandi`, `f2.bekor`, `f2.storno`) orqali bog'lanadi. Tasdiqlangan F2 summasi KPI/provodka uchun **snapshot** (`f2_akt_id`, `versiya`, `xesh`) sifatida nusxalanadi — keyin F2 o'zgarsa (faqat bekor/storno) tuzatish qatori yaratiladi.
6. **Yengil Supabase:** fayllar (bank vipiska, 1C eksport arxivi, imzolangan vedomost PDF, jarima dalili foto) — R2 + `t2_document_registry`; DB'da faqat metadata/xesh. Katta hisobotlar (aylanma-saldo, balans) — davr yopilganda **R2 snapshot** (gzip JSON, xesh kalit, E7 §4 uslubi), ochiq davr uchun — indeksli, sahifalangan RPC (E5 byudjeti). Provodka jadvali yirik bo'ladi: oylik partitsiya (`davr`), agregat `t2_bux_saldo_oy` (oylik, qayta hisoblanadigan) — real vaqtda butun jurnalni skan qilmaslik uchun.
7. **i18n (AGENTS §2a):** hamma matn `t('…')`, tarjima `frontend/src/i18n/lugat/qism/hr.json`, `bux.json`. Rasmiy hujjatlar (F2/F3, soliq hisobotlari formasi, schyot-faktura) — rasmiy tilda (rus/o'zbek, forma talabiga ko'ra).
8. **Test:** har migratsiya — `.rollback.sql` + `supabase/tests/t2_<domen>_<nom>_contract.sql` (tenant izolyatsiyasi, idempotentlik, versiya konflikti, ruxsat) + shlyuz test + UI test; `node ops/governance-check.cjs`; `t2_versiya_xabardorlik_audit_v1()` bo'sh (t2_qator o'qilsa).

### 2.1 Ruxsat (capability) kengaytmasi — **[Q] egasi tasdig'i kerak (E2 §3)**

Mavjud E2 loyihasidan foydalanamiz, qo'shamiz: `hr.kpi.read`, `hr.kpi.write` (qoida konstruktori), `hr.kpi.approve`, `hr.jarima.propose`, `hr.jarima.approve`, `hr.tatil.approve`, `payroll.approve`, `payroll.close`, `accounting.post`, `accounting.period.close`, `accounting.tax.read/write` (QQS, deklaratsiya), `accounting.bank.import`, `accounting.admin` (hisob rejasi). `hr.pii.*` va `payroll.read` — **alohida** (maosh va PII ro'yxat RPC larida JOIN qilinmaydi, E2 qoidasi). Jarima tasdiqlovchisi **taklif qiluvchi bilan bir odam bo'la olmaydi** (4 ko'z).

---

## 3. HR + KPI dizayni

### 3.1 Xodim kartasi, lavozim, shtat

`t2_hr_xodim` (tenant: `kompaniya_id`):
- identifikatsiya: `id`, `kompaniya_id`, `tabel_raqam` (kompaniya ichida unique), `ism_sharif`, `foydalanuvchi_id` (nullable → `t2_foydalanuvchi`, bir odam ko'p kompaniyada: E1), `holat` (`ishlayapti|ta'tilda|ishdan_ketgan|nomzod`), `versiya`, `operation_id`.
- PII **alohida jadval** `t2_hr_xodim_pii` (`hr.pii.read/write`): tug'ilgan sana, PINFL, pasport, manzil, telefon, bank karta/hisob — ro'yxat RPC larida yo'q; har o'qish auditga.
- mehnat munosabati `t2_hr_mehnat` (tarixli, `sana_dan/sana_gacha`, bitta faol): `xodim_id`, `lavozim_id`, `bolim_id`, `shtat_id`, `shartnoma_turi` (`muddatsiz|muddatli|pudrat(GPX)|yarim_stavka`), `stavka` (1.0, 0.5), `oklad` (so'm, NULL=noma'lum), `maosh_turi` (`oklad|soatbay|ish_haqi_ulushi|aralash`), `ish_grafigi_id`, `ishga_kirish_sana`, `buyruq_raqam/sana`, `sinov_muddati_gacha`. Oklad o'zgarishi = yangi qator (tarix), eskisi yopiladi — UPDATE yo'q.
- `t2_hr_lavozim` (nom, `rol_kalit` — KPI shabloni va ruxsat bilan bog'lanadi: `prorab|pto|smetachi|omborchi|usta|mexanik|buxgalter|kadr|rahbar|…` E1 yo'nalish katalogi), `t2_hr_bolim`, `t2_hr_shtat` (shtat birligi: bolim+lavozim+stavka soni+oklad vilkasi+`holat` `bosh|band|bekor`) — shtat jadvali va haqiqiy bandlik taqqoslanadi («3 ta prorab shtati, 2 ta band»).
- obyektga biriktirish `t2_hr_obyekt_biriktirish` (xodim↔obyekt, `sana_dan/sana_gacha`, rol obyektda: prorab/PTO/brigadir) — **KPI manbasi** (qaysi prorab qaysi obyekt F2 siga javobgar). Mavjud `t2_kadr_bog`/`t2_obyekt_foydalanuvchi_ruxsat` dan ko'chiriladi, ruxsat jadvallariga TEGILMAYDI (ruxsat ≠ javobgarlik).
- hujjatlar: mehnat shartnomasi, buyruq, diplom/sertifikat — R2 + registry (`t2_hr_hujjat`: xodim_id, turi, document_id, amal_qilish_muddati) → muddat tugashidan signal (maxsus ruxsatnoma, texnika xavfsizligi instruktaji — qurilishda majburiy [T]).
- Mustaqil usta/mutaxassis (E1 `shaxsiy` kompaniya) — HR kartasiga **majburan** kiritilmaydi; ular uchun `t2_usta_daromad_v1` (E3 §4.11) o'z tabelini ko'radi.

### 3.2 Tabel va ish grafigi

- `t2_hr_grafik` (shablon: `ish_kunlari` haftalik naqsh, kunlik soat, smena; masalan 5/2, 6/1, smenali 15/15 vахta), `t2_hr_grafik_oy` (xodim×oy: reja kunlari, avtomatik shablondan yaratiladi, qo'lda o'zgartiriladi, `versiya`).
- `t2_hr_tabel` (E3 §4.11 ni aniqlashtirish): `(kompaniya_id, xodim_id, sana)` unique faol; `obyekt_id`, `soat`, `kod` (`ish|dam|bayram|ta'til|kasallik|safar|qarz_dam|sababsiz|kechikish|ustuvor`), `ortiqcha_soat`, `kechki_soat`, `manba` (`xodim|brigadir|kadr|geo`), `holat` (`kiritildi|brigadir_tasdiq|kadr_tasdiq|yopilgan`), `versiya`, `operation_id`.
- Oqim: brigadir/prorab (mobil `/m/brigadir`, offline navbat `operation_id` bilan, E4) kiritadi → kadr tasdiqlaydi → oy oxirida **tabel yopiladi** (qulf; ochish — `payroll.close` + sabab + audit). Obyekt bo'yicha taqsimot (bir kun ikki obyekt) — soatlar yig'indisi grafik me'yoridan oshmasligi tekshiriladi.
- Tekshiruvlar (oldindan aytadi): ta'tildagi kunga ish kiritilgan; bir kunda ikki obyektda >24 soat; dam kuni ish (ortiqcha stavka kerak [T]); tabel bo'sh kunlar; yopilgan oyga kirish.
- Ish vaqti normasi: oyiga ish kunlari/soatlari **taqvim jadvalidan** (`t2_hr_taqvim`: sana, `turi` `ish|dam|bayram|kochirilgan`, `manba`, yil bo'yicha). Taqvim — qo'lda yillik seed (O'zR Vazirlar Mahkamasi qarori bilan dam olish kunlari ko'chirilishi har yil o'zgaradi) → **kod ichida qattiq yozilmaydi**, jadvaldan.
  - Haftalik me'yor: odatda 40 soat (kunlik 8, 5 kunlik hafta) — **[T]** Mehnat kodeksi 2023 moddalari bo'yicha; qisqartirilgan ish vaqti (zararli sharoit, 16–18 yosh) alohida — **[T]**.
  - Ortiqcha ish haqi koeffitsienti (me'yordan tashqari, dam/bayram kuni, kechki/tungi) — **[T]**, har koeffitsient `t2_hr_sozlama` da (kompaniya darajasida o'zgaradigan parametr, sanasi bilan), kodda emas.

### 3.3 Dam olish / ta'til rejasi («oylik dam olish kunlarini hisoblash va rejalashtirish»)

- `t2_hr_tatil_balans` (xodim×ish yili): `hisoblangan_kun`, `ishlatilgan_kun`, `qoldiq` — **hisoblangan** (event ledger: `t2_hr_tatil_harakat`: `hisoblash|ishlatish|kompensatsiya|tuzatish`, append-only).
- Yillik asosiy ta'til: O'zR Mehnat kodeksi (2023-yil yangi tahrir) bo'yicha **kamida 21 kun** — **[T]** (kun turi: ish kuni yoki taqvim kuni? bayram kunlari qo'shiladimi/ketadimi? ish stajiga qo'shimcha ta'til (zararli/qurilish mehnat sharoiti, uzoq staj) bormi?) — kompaniya sozlamasi `yillik_tatil_kun` (default **21, [T]**), qonun tafsilotini yurist tasdiqlaydi.
- Ta'til arizasi/rejasi: `t2_hr_tatil_sorov` (xodim, turi `yillik|ijtimoiy(haqsiz)|kasallik|tugruq|oquv|qarz_dam`, `sana_dan/gacha`, `holat` `qoralama|yuborildi|tasdiq|rad|bekor`, tasdiqlovchi, sabab, `versiya`). Yillik ta'til **grafigi** (reja): `t2_hr_tatil_reja` yil boshida kompaniya bo'yicha, ustma-ust tushishni tekshiradi («shu obyektda 3 prorabdan 2 tasi bir vaqtda ta'tilda» → ogohlantirish; minimal bandlik qoidasi `obyekt×rol` bo'yicha).
- «Oylik dam olish kunlarini hisoblash va rejalashtirish»: (a) har oy uchun taqvim bo'yicha **me'yor kunlari**, xodim grafigidan **dam kunlari**; (b) vахta/smenali grafikda dam olish kunlari ro'yxati avtomatik, (c) «dam olish kuni ishlagan» → `qarz_dam` (boshqa kunga dam yoki ko'paytirilgan haq — **[T]** kodeks tartibi) — `t2_hr_tatil_balans` ga alohida `qarz_dam` ledger.
- Ta'til puli (otpusknye): o'rtacha kunlik ish haqi = oxirgi 12 oy (yoki hisob davri) haqi / ish kunlari — **[T]** (aniq davr, qaysi to'lovlar kiradi: bonus kiradimi?). Hisoblash — deterministik server funksiya `_t2_hr_ortacha_kunlik()`, parametrlar `t2_hr_sozlama`da; natija «tushuntirish» (qaysi oylar, qaysi summa) bilan qaytadi (§5.6 UX).
- Kasallik varaqasi (listok): davr/summa/ijtimoiy sug'urta fondidan to'lov — **[T]**, v1 da faqat tabel kodi (`kasallik`) + hujjat; haq hisobi keyingi bosqich.

### 3.4 KPI kartasi

Tuzilma (hammasi tarixli, davr bo'yicha muzlatiladi):
- `t2_kpi_shablon` (kompaniya, `rol_kalit`, nom, `holat`, versiya): rolga mos ko'rsatkichlar to'plami. Shablon o'zgarsa — **faqat yangi davrga** amal qiladi; yopilgan davr o'z snapshot'ida qoladi.
- `t2_kpi_korsatkich_katalog` (global + kompaniya): `kalit`, nom, `manba_turi` (`auto|qolda`), `manba_kalit` (read-model), `birlik` (`som|foiz|son|kun`), `yaxshi_yonalish` (`yuqori|past`), tavsif. Tizim katalogi (read-only) + kompaniya o'zi qo'sha oladigan `qolda` ko'rsatkichlar.
- `t2_kpi_karta` (xodim×davr): `xodim_id`, `davr` (`2026-11`), `shablon_id`+`shablon_snapshot jsonb`, `holat` (`qoralama|ochiq|hisoblandi|tasdiq|yopilgan`), `jami_ball`, `versiya`.
- `t2_kpi_karta_qator`: `korsatkich_kalit`, `ogirlik` (foiz, yig'indi=100, tekshiruv), `maqsad`, `chegara_min` (ostida 0 ball), `haqiqiy` (NULL = noma'lum), `haqiqiy_manba_snapshot jsonb` (qaysi F2 id/versiya/xesh, hisoblangan vaqt), `ball` (0..120 yoki sozlanadi), `izoh`, `qolda_tuzatish` (sabab majburiy + tasdiqlovchi).
- Ball formulasi: **soddaligi bilan** — chiziqli: `ball = clamp((haqiqiy − min)/(maqsad − min), 0, cap) × ogirlik` (yaxshi_yonalish `past` uchun teskari). Haqiqiy NULL bo'lsa qator **hisobga olinmaydi va ogirlik qayta taqsimlanmaydi jim** — karta `to'liq_emas` belgisi bilan qoladi, tasdiqlovchi qaror qiladi (Konstitutsiya: NULL≠0). Parametrlar (cap, min) shablonda.

Rol bo'yicha namunaviy ko'rsatkichlar (start shablonlari, kompaniya o'zgartiradi — raqamlar maqsadi **[Q]** egasi belgilaydi, hujjatda qiymat yo'q):

| Rol | Ko'rsatkichlar (manba) |
|---|---|
| Prorab | Tasdiqlangan F2 summasi (obyektlari bo'yicha, `f2.tasdiqlandi`); F2 reja bajarilishi %; ish muddatiga rioya (grafik vs fakt, `t2-grafik`); predpisaniye/remark soni va yopish tezligi (nazorat `t2_tomon_murojaat`); AOSR/ijro hujjatlari to'liqligi; material limiti (M-29 sarfi vs norma); xavfsizlik hodisalari (qo'lda) |
| PTO | F2 tayyorlash muddati (fakt→F2 tasdiq, kun); F2 rad etilish/qaytarilish soni; F2 hujjat to'liqligi; bekor/storno F2 ulushi (xato ko'rsatkichi); smeta-fakt tafovut signali |
| Omborchi | Inventarizatsiya aniqligi; M-29/kirim hujjatlarini o'z vaqtida kiritish; «manfiy qoldiq» holatlari (**ombor Codex yo'li — faqat o'qish**) |
| Ta'minot | Tender/buyurtma muddati; narx tejash (taklif vs bozor — mavjud narx nazorat); yetkazib berish kechikishi |
| Buxgalter | Hujjatlarni provodkalash muddati; davr yopish muddati; sverka farqlari soni; QQS/e-faktura muddatidan o'tganlar |
| Usta/brigadir | Tasdiqlangan hajm; sifat (qayta ishlash soni); tabel intizomi |

Avtomatik manbalar — **faqat nomli read-model RPC** (boshqa domen jadvalini to'g'ridan o'qimaymiz, E3 §5.6). Har bir manba: `(kompaniya_id, xodim_id|obyekt_id, davr_dan, davr_gacha) → {qiymat|null, ustamasiz, ustamali, qqs_alohida, yozuv_soni, nomalum_soni, manba_ref[]}`:
- `kpi_manba_f2_tasdiq_v1` — **L0 yozadi** (§5.3): davr ichida **tasdiqlangan** (`lifecycle_status='approved'`, `lifecycle_approved_at` davrda) F2 lar yig'indisi, obyekt bo'yicha; ustamasiz (pryamye) + ustamali + QQS; bekor/storno qilinganlar **ajratib** (alohida ustun) qaytariladi.
- `kpi_manba_muddat_v1` (grafik read-model, L0/mavjud `t2-grafik`).
- `kpi_manba_predpisaniye_v1` (`t2_tomon_murojaat turi='predpisaniya'` — tomon-nazorat egasi).
- `kpi_manba_hujjat_tolaliq_v1` (`hujjat-tekshir` / document-control; L0 ning hujjat tekshiruvi).
- `kpi_manba_tabel_v1` (HR o'zimiz).

### 3.5 Bonus qoidasi (prorab: tasdiqlangan F2 dan X%)

`t2_kpi_bonus_qoida` (kompaniya, tarixli, `amal_sana_dan`): 
- `nom`, `rol_kalit|xodim_id|lavozim_id` (kim uchun), `obyekt_id|null`,
- `baza_turi`: **`f2_ustamasiz`** | **`f2_ustamali`** [Q — egasi tanlaydi; ikkalasi qoida darajasida tanlanadi, ekranda doim ikkalasi ko'rinadi],
- `qqs`: bazaga QQS **kirmaydi** (default) — QQS faqat ma'lumot sifatida alohida; kirgizish mumkin emas (qoida: QQS soliq, xodim mukofoti bazasi emas) [Q] tasdiq,
- `foiz` (X%) yoki **zina** (jami bo'yicha: 0–A → x1%, A–B → x2% …), `chegara_min_baza` (bazadan kam bo'lsa bonus yo'q), `maks_bonus` (limit, NULL = cheksiz),
- `kpi_bogla` (opsional): bonus × `kpi_karta.jami_ball` koeffitsienti (ya'ni F2 foiz + KPI sifat — «F2 dan X% × KPI koeffitsienti»),
- `tolov_sharti`: `f2_tasdiq` (hisoblanadi) | `buyurtmachi_tolovi` (F2 summasi buyurtmachidan **tushganida** to'lanadi — `t2_tolov_taqsimot` bo'yicha; hozircha o'qish L0 sverka read-model) [Q: tasdiq vs tushum asosida].

Hisoblash (server, deterministik, hisob-yadro summalaridan; AI hisoblamaydi):
1. Davr yopilganda yoki «oldindan hisoblash» (preview) bosilganda `kpi_manba_f2_tasdiq_v1` chaqiriladi.
2. Har tasdiqlangan F2 akt uchun **`t2_kpi_bonus_qator`** (xodim, davr, `f2_akt_id`, `f2_versiya`, `baza_ustamasiz`, `baza_ustamali`, `tanlangan_baza_turi`, `foiz`, `summa`, `holat` `hisoblandi|tasdiqlandi|tolandi|bekor_qilindi`, `manba_xesh`). Idempotent kalit: `(xodim, qoida, f2_akt_id)`.
3. Baza summasi NULL (narx yo'q/kat noma'lum) → qator `summa=NULL`, `holat='hisoblanmadi_nomalum'`, sabab ko'rsatiladi (bonus 0 emas).
4. Bir F2 ga bir necha xodim (prorab+PTO) → `ulush_foiz` qoida bo'yicha taqsimot (yig'indisi ≤100 tekshiruvi).

**F2 bekor / storno bo'lsa (egasi qoidalari: F2 muzlaydi, tuzatish yangi hujjat orqali):**
- `f2.bekor` (lifecycle `cancelled`): tegishli bonus qatori → **teskari qator** (`tur='tuzatish'`, `summa=-asl`, `asos_qator_id`). Davr ochiq bo'lsa — qator `bekor_qilindi`, hisobdan chiqadi. Davr **yopilgan** va bonus to'langan bo'lsa — teskari qator **keyingi ochiq davrga** tushadi (tarix qayta yozilmaydi); ushlash siyosati [Q]: (a) darhol ushlab qolish, (b) faqat keyingi bonusdan qoplash, (c) ushlamaslik (kompaniya sozlamasi `bekor_siyosat`; default (b) — xodimga yumshoq, **[T]** mehnat qonuni bo'yicha oyligidan ushlash chegarasi/rozilik talabi).
- `f2.storno` (minus F2 yangi qoralama, qayta tayyorlangan yangi F2): minus F2 tasdiqlanganda uning bonus qatori manfiy hisoblanadi (summa ishorasi `kpi_manba_f2_tasdiq_v1` da saqlanadi — hisob-yadro `yigindi2`); yangi F2 tasdiqlanganda yangi bonus. Natijaviy bonus = Σ (asl + storno + yangi) — qo'shaloq sanalmaydi (`f2_akt_id` zanjiri `correction_of_akt_id` orqali).
- F2 hodisa kutmaymiz: har oy yopilishidan oldin **qayta tekshiruv** (reconciliation) — bonus qatorlari `f2_versiya/xesh` bo'yicha joriy F2 holati bilan solishtiriladi; farq bo'lsa signal (`t2_signal`) va «tuzatish taklifi» yaratadi (avto-qo'llamaydi, `payroll.approve` tasdiqlaydi).

### 3.6 Jarima (xato ish uchun)

> **[T] Muhim huquqiy xavf:** O'zR Mehnat kodeksi mehnat haqidan ushlab qolish va moddiy javobgarlikni cheklaydi; «jarima» (штраф) nomi bilan oylikdan ushlab qolish — qonunda keng taqiqlangan bo'lishi mumkin; intizomiy jazo turlari (hayfsan va h.k.) va **moddiy zarar qoplash** tartibi (rozilik, chegara, muddat) alohida. Dizayn jarimani **«ushlanma/moddiy javobgarlik/intizomiy chora»** turlariga ajratadi; qaysi turi qonuniy va qaysi cheklov bilan — yurist tasdiqlamaguncha **hisoblash-faqat-yozish rejimi** (oylikka avtomatik ushlanmaydi). [Q]

`t2_hr_jarima`:
- `xodim_id`, `tur` (`intizomiy|moddiy_zarar|sifat_ushlanma|boshqa`), `sana`, `obyekt_id`, `sabab_kod` (katalog: sifatsiz ish, qayta ishlash, hujjat kechikishi, material ortiqcha sarfi, xavfsizlik buzilishi…), `sabab_matn`,
- **dalil**: `dalil_hujjat_idlar bigint[]` (foto, akt, predpisaniye `t2_tomon_murojaat`, qayta ishlash fakti, M-29, F2 qatori) — R2 + registry; dalilsiz jarima `taklif` holatidan o'tmaydi (RPC tekshiradi),
- `summa` (NULL = noma'lum → tasdiqlab bo'lmaydi), `hisoblash_asos` (qo'lda | qoida: «predpisaniya bo'yicha qayta ishlash qiymatining N%»),
- oqim: `taklif` (`hr.jarima.propose`: prorab/PTO/nazorat) → `kadr_korik` → `tasdiq` (`hr.jarima.approve`, taklifchidan boshqa shaxs) → `xodimga_xabar` → `apellyatsiya_muddati` (kompaniya sozlamasi, masalan N kun) → `kuchga_kirdi` | `apellyatsiya` (xodim sabab+dalil yuboradi) → `komissiya_qarori` (`qoldirildi|kamaytirildi|bekor`) → `oylikka_otkazildi` | `bekor`. Hamma o'tish `t2_hr_jarima_tarix` (kim, qachon, nima, sabab).
- Ta'sir: faqat `kuchga_kirdi` holatidagina oylik hisobida **ushlanma qatori** (§3.7), ushlab qolish chegarasi (oylikning N% dan oshmaydi — **[T]**), qoldiq keyingi oyga.
- KPI bilan aloqa: jarimalar soni — KPI ko'rsatkichi (sifat), lekin **jarima summasi va KPI balli ikki marta jazolamasligi** uchun qoida `qoplash_birligi` bilan belgilanadi [Q].

### 3.7 Oylik hisobi (payroll)

Jadvallar: `t2_payroll_davr` (kompaniya×oy: `holat` `ochiq|hisoblandi|tasdiq|yopilgan`, `qulf_vaqt`, `versiya`), `t2_payroll_varaqa` (xodim×davr), `t2_payroll_qator` (`tur`, `summa`, `manba_ref`, `izoh`), `t2_payroll_hujjat` (vedomost PDF → R2).

Qatorlar (tur): `oklad` (tabel/me'yor bo'yicha: oklad × ishlangan/me'yor kun), `soatbay`, `ortiqcha` (koef. **[T]**), `tatil_puli`, `kasallik` (v2), `bonus` (§3.5), `kpi_premiya`, `jarima/ushlanma` (§3.6), `avans` (to'langan), `boshqa_ushlanma` (aliment, qarz — **[T]** ushlab qolish tartibi/ustuvorlik), `soliq_jshds`, `ijtimoiy_ushlanma` (agar xodim ulushi bor — **[T]**), `tolanadigan` (net).

Soliqlar — hammasi **[T]** (stavka/baza/imtiyoz kod bilan emas, `t2_hr_soliq_sozlama(kod, stavka, amal_sana_dan, manba_nomi)` jadvalida, sanalik versiyali):
- JShDS (jismoniy shaxslardan daromad solig'i) — odatda **12%** (egasi ko'rsatdi), baza: oklad+bonus+ortiqcha+ta'til puli, imtiyozli kategoriyalar/chegirmalar — **[T]**.
- Ijtimoiy soliq (ish beruvchi to'laydi, xodim oylig'idan ushlanmaydi, 2023+ stavka) — **[T]** (egasi aytgan raqamni emas, amaldagi stavkani buxgalter tasdiqlaydi); xodim oyligidan ushlanmaydi, lekin **xarajat** va provodkaga kiradi.
- Boshqa majburiy to'lovlar (YaIMTI/pensiya jamg'armasi tartibi, byudjetdan tashqari fondlar, INPS yig'ma hisobi) — **[T]** 2023+ tartib; `t2_hr_soliq_sozlama` ga stavka kiritiladi, kodni o'zgartirmasdan.
- Soliq/ijtimoiy hisobotlar (yagona ijtimoiy to'lov, JShDS hisoboti, shaxsiy hisobvaraq ma'lumotlari): v1 da faqat **tayyorlash va eksport** (CSV/XLSX forma ustuni), `soliq.uz` ga topshirish qo'lda yoki keyin API orqali [Q].

Hisoblash tartibi: (1) tabel yopilgan bo'lishi shart (aks holda `to'liq_emas`); (2) har qator `manba_ref` bilan; (3) `preview` har doim mavjud; (4) tasdiqdan keyin **davr yopiladi** → `payroll.yopildi` hodisasi → **provodka** (§4.6.8); (5) yopilgan davr o'zgarmaydi; xato — keyingi davrda tuzatish qatori (`tur='tuzatish'`, `asos_varaqa_id`).
Xodim «tushuntirish»: «Sizning oyligingiz: oklad X (22 kundan 20 kun), bonus Y (F2 №… dan Z%), ushlanma W (jarima №…, sabab…), soliq…» — har satr bosilganda asos.

Buxgalteriyaga provodka (oylik yopilganda; hisoblar BHMS №21 bo'yicha, kodlar **[T]**, §4.2):
- `Dt 2010 (asosiy ishlab chiqarish — obyekt) / 9400 (davr xarajati) / 0840…  Kt 6710 (xodimlarga mehnat haqi)` — hisoblangan oylik, **obyekt bo'yicha** (tabel soati asosida taqsimot).
- `Dt 6710 Kt 6410 (JShDS byudjetga)` — ushlangan JShDS.
- `Dt 6710 Kt 4730/jarima-ushlanma hisobi` — ushlanma (jarima/moddiy zarar).
- `Dt xarajat (2010/9400) Kt 6520 (ijtimoiy soliq/fond)` — ish beruvchi ijtimoiy badali.
- To'lov: `Dt 6710 Kt 5010 (kassa) / 5110 (hisob-kitob schyoti)`.
Provodka hujjati: `payroll_varaqa_tasdiq` → `bux_hujjat(tur='oylik_vedomost')` → `bux_provodka` qatorlari. Qaysi xarajat (2010 obyekt xarajati vs 9400 boshqaruv) — kompaniya `bux_siyosat` sozlamasi [Q+T].

### 3.8 Ekranlar (HR)

`/admin/hr`: Xodimlar (jadval+filtr, karta); Xodim kartasi (tablar: Umumiy, Mehnat tarixi, Hujjatlar, Obyektlar, Tabel, Ta'til, KPI, Oylik, Jarima; PII tab — `hr.pii.read`); Shtat jadvali; Tabel (oy setkasi, ommaviy kiritish); Ish grafigi; Ta'til rejasi (yillik diagramma + to'qnashuv ogohlantirishi); Ta'til arizalari; KPI shablonlari (konstruktor); KPI kartalar (davr, xodim bo'yicha); Bonus qoidalari; Jarimalar (taklif/tasdiq/apellyatsiya); Oylik (davr, varaqa, preview, vedomost); Soliq/koeffitsient sozlamalari; HR hisobotlari (bo'lim bo'yicha ish haqi fondi, kadr harakati, tabel yig'ma). Mobil `/m/brigadir` (tabel), `/m/usta` (o'z tabeli/daromadi — `t2_usta_daromad_v1`), `/m/prorab` (o'z KPI kartasi, jarima tarixi).

---

## 4. Buxgalteriya dizayni (1C o'rnini bosuvchi, lekin oddiy)

### 4.1 Falsafa — «buxgalter 1C ning murakkabligidan qutiladi»

- Buxgalter **hujjat** kiritadi («Kassa chiqim», «Bank vipiska qatori», «Nakladnoy»), **provodka — natija**: tizim uni hujjat tagida **oddiy tilda** ko'rsatadi («Siz 1 200 000 so'mlik materialni yetkazib beruvchidan qabul qildingiz → ombor ko'paydi (1010), qarz paydo bo'ldi (6010), QQS hisobga olindi (4410)»). Hisob kodi — kichik, bosilganda tushuntirish.
- «Qo'lda provodka» (operatsiya) — faqat `accounting.post` bor mutaxassis uchun, ikkinchi qatlamda.
- **Xatolarni oldindan aytish** (validator): debet≠kredit; kontragent INN yo'q/QQS to'lovchi emas, lekin QQS ajratilgan; yopilgan davr; hujjat sanasi kelajakda; takroriy hujjat raqami; to'lov summasi hujjatdan ortiq (avans bo'lishi mumkin — so'raydi); F2 summasi bilan tushum nomuvofiq; valyuta kursi yo'q; manfiy kassa qoldig'i; ombor qoldig'i manfiy (Codex read-model).
- AI yordamchi (§4.9): provodkani tushuntiradi, tavsiya (qaysi hisob) beradi, bank vipiska qatorini hujjatga moslashtirishni **taklif** qiladi; **hech qachon** o'zi provodka qilmaydi va summa/hisob o'ylab topmaydi (Konstitutsiya).

### 4.2 Hisob rejasi (O'zR BHMS №21 asosida)

`t2_bux_hisob_reja` (global andoza + kompaniya override): `kod` (4 xonali), `nom_uz`, `nom_ru`, `turi` (`aktiv|passiv|aktiv_passiv|balansdan_tashqari`), `ota_kod`, `analitika_turi[]` (`kontragent|shartnoma|obyekt|xodim|material|os|xarajat_moddasi|bank_hisob`), `valyuta_bor`, `faol`, `bhms_manba` (andoza versiyasi).
Andoza (asosiy bo'limlar; **barcha kod/nomlar [T] — buxgalter rasmiy hisob rejasi bilan tekshiradi, seed shundan keyin**): 
0100 asosiy vositalar; 0200 OS eskirishi; 0400 nomoddiy aktivlar; 0800 kapital qo'yilmalar; 1000 materiallar; 1500-1600 tayyor mahsulot/tovarlar (agar kerak); 2000 asosiy ishlab chiqarish (qurilishda **obyekt bo'yicha** xarajat — 2010); 2300 yordamchi ishlab chiqarish; 2500 umumishlab chiqarish xarajatlari; 2800 tayyor mahsulot/**tugallanmagan qurilish** [T]; 3100 kelgusi davr xarajatlari; 4000 debitorlar (4010 xaridor va buyurtmachilar, 4200 hisobdor shaxslar, 4300 ..); 4400 byudjet bo'yicha avans; 4700 ...; 5000 pul mablag'lari (5010 kassa, 5110 hisob-kitob schyoti, 5200 valyuta); 6000 kreditorlar (6010 yetkazib beruvchilar va pudratchilar, 6400 byudjetga to'lovlar (6410 JShDS..., QQS), 6500 maqsadli fondlar/ijtimoiy, 6700 xodimlarga mehnat haqi); 7000–7800 uzoq muddatli majburiyatlar; 8300 ustav kapitali; 8700 taqsimlanmagan foyda; 9000 sotishdan daromad (9010), 9100 sotilgan tannarx, 9400 davr xarajatlari, 9900 foyda solig'i/yakuniy natija [T].
Qoidalar: andoza `qoraXona` o'zgarmas versiyada; kompaniya pastki hisob (subschyot) qo'sha oladi, lekin bhms_manba bog'lanishi saqlanadi (hisobotlar yuqori darajada yig'iladi).

### 4.3 Provodka jurnali (yadro)

Jadvallar (`t2_bux_*`; hammasida `kompaniya_id NOT NULL`, RLS/GRANT shabloni):
- `t2_bux_hujjat`: `id`, `kompaniya_id`, `tur` (hujjat turi katalogi §4.4), `raqam`, `sana`, `davr` (`YYYY-MM`), `kontragent_id` (→ `t2_kontragent`), `shartnoma_id` (nullable → `t2_shartnoma`), `obyekt_id`, `valyuta`, `kurs`, `summa_qqssiz` (ustamasiz, tiyin aniqligida `numeric(20,2)`), `qqs_summa` (alohida), `summa_qqs_bilan`, `holat` (`qoralama|tasdiqlangan|bekor`), `manba` (`qolda|bank_import|f2|sotuv|ombor|oylik|os|tender|1c_import`), `manba_ref jsonb` (masalan `{f2_akt_id, versiya, xesh}`), `document_id` (R2 skan), `versiya`, `operation_id`, `kim`, `yaratildi`.
- `t2_bux_hujjat_qator`: hujjat qatorlari (nom, miqdor, birlik, narx, summa, QQS stavka) — nakladnoy/akt uchun.
- `t2_bux_provodka` (**append-only**, partitsiya oy bo'yicha): `id`, `kompaniya_id`, `hujjat_id`, `sana`, `davr`, `debet_kod`, `kredit_kod`, `summa` (`numeric(20,2)`, hamisha musbat; storno — alohida `storno_of_id`, `tur 'oddiy|storno'`), `valyuta_summa`, `valyuta`, `analitika_dt jsonb`, `analitika_kt jsonb` (kontragent/shartnoma/obyekt/xodim/material/OS), `izoh`, `operation_id`. UPDATE/DELETE trigger bilan taqiqlangan (append-only).
- `t2_bux_provodka_qoida`: hujjat turi → provodka shabloni (§4.4); versiyali, sanalik; **provodkani hosil qiluvchi deterministik server funksiya** `_t2_bux_provodka_hosil(hujjat_id)`; shablon JSON ko'rinishida («Dt kassa Kt kontragent hisobi = summa_qqssiz; Dt QQS-kredit Kt ... = qqs»).
- `t2_bux_davr` (kompaniya×oy: `ochiq|yopilgan`, `yopdi`, `qachon`), `t2_bux_saldo_oy` (hisob×analitika×oy: dt_aylanma, kt_aylanma, qoldiq; trigger emas — **post hodisasi bo'yicha inkremental yangilash**, qayta qurish funksiyasi bor).
- `t2_bux_audit`, `t2_bux_operatsiya` (idempotentlik jurnali — `t2_sotuv_operatsiya` namunasi).
- Invariant: har hujjat uchun Σ debet = Σ kredit (DB constraint trigger deferred); davr yopiq → INSERT rad; `tasdiqlangan` hujjat tahrirlanmaydi — **bekor → storno provodka**, yangi hujjat.
- Bog'lanish saqlanadi: provodka → hujjat → manba (F2/to'lov/ombor) — «Nega bu summa?» bosilganda zanjir.

### 4.4 Modullar (har biri — hujjat turlari + avtomatik provodka)

**Qoida:** quyidagi provodkalar **namunaviy**; aniq hisob kodlari va siyosat — buxgalter tasdig'i **[T]**. Summa — ustamasiz (haqiqiy qiymat), QQS alohida qatorda.

1. **Kassa** — hujjatlar: Kassa kirim orderi (KKO), kassa chiqim orderi (KChO), avans hisoboti, kassa kitobi. Provodka: KKO (mijozdan naqd): `Dt 5010 Kt 4010`; KChO (yetkazib beruvchiga): `Dt 6010 Kt 5010`; hisobdor shaxsga: `Dt 4200 Kt 5010`; avans hisoboti: `Dt 2010/1000 Kt 4200`. Kassa limit/manfiy qoldiq validator. Ekran: kassa kitobi (kun bo'yicha), bosma order (rasmiy forma).
2. **Bank** — bank schyotlar (`t2_bux_bank_hisob`: MFO, hisob raqami, valyuta), **vipiska importi**: fayl (1C-format `.txt`/`ClientBank`, MT940-like, bank Excel/CSV, bank API [Q]) R2 ga → `t2_bux_bank_import` (fayl xeshi — takror yuklash rad) → `t2_bux_bank_qator` (sana, summa, kontragent INN/hisob, to'lov maqsadi, **taklif etilgan hujjat/hisob** — qoidalar: INN → kontragent, maqsad matni → shartnoma raqami, summa+sana → ochiq schyot; AI faqat **nomzod** beradi, buxgalter tasdiqlaydi). Tasdiqlansa hujjat: «Bank kirim/chiqim» → provodka (`Dt 5110 Kt 4010` / `Dt 6010 Kt 5110`); komissiya `Dt 9400 Kt 5110`. Bank qoldig'i vs vipiska yakuniy qoldig'i **tekshiruvi**. **Mavjud `t2_tolov` bilan:** `t2_tolov` — shartnoma bo'yicha **boshqaruv** yozuvi (L0 moliya); yangi bank hujjat tasdiqlanganda `t2_tolov` ga yozish **L0 RPC si orqali** (`t2_tolov_yoz` yoki yangi hand-off) yoki L0 hodisasiga obuna — ikki marta sanalmaydi (`manba_ref`/`hujjat_raqam` kaliti; `t2_qarz_asos.tolov_id` namunasi) — kelishuv nuqtasi §5.
3. **Kontragentlar bilan hisob-kitob** — analitika: kontragent×shartnoma. Schyotlar 4010/6010 va avanslar (4400..6… [T]). Ekranlar: kontragent kartasi (INN, QQS holati, hisob raqamlar), **schyot-karta** (kontragent bo'yicha provodkalar), **akt-sverka** (tizim hisobi vs kontragent hisobi; **mavjud `lib/sverka-1c` va `sverka_import_v1` qayta ishlatiladi — L0 egaligi**), qarz yoshi (aging), kreditor qarz (`t2_kreditor_qarz` view, E3). Mavjud `t2_qarz_svod_v1`/`t2_qarz_asos` — **boshqaruv ko'rinishi** sifatida qoladi; jurnal hisobi bilan solishtirish ekrani («farq: jurnal vs qarzdorlik spravkasi»).
4. **QQS va e-faktura** — `t2_bux_qqs_kitob` (xarid/sotuv kitobi: hujjat, kontragent INN, QQS stavka, asos, `e_faktura_id`, `didox_holat`); schyot-faktura hujjati (chiqish/kirish), **Didox** orqali e-faktura yuborish/qabul qilish/tasdiq/rad (`functions/api/didox-*`, hozirgi webhook kengaytiriladi, kalitlar secret — kodda yo'q) va **soliq.uz** (QQS deklaratsiyasi ma'lumotlarini tayyorlash; topshirish — qo'lda yoki API [T/Q]). Provodka: sotuv `Dt 4010 Kt 9010 (qqssiz) + Kt 6410-QQS (qqs)`; xarid `Dt 1000/2010 + Dt 4410(QQS kreditga) Kt 6010`. QQS stavka (12%, 0%, ozod) — `t2_bux_soliq_sozlama`, sanalik; oborot chegarasi/QQS to'lovchi holati — **[T]**. Validator: QQS to'lovchi emas kontragentga QQS bilan faktura; e-faktura raqami/sanasi nomuvofiqligi; ESF muddatidan o'tish.
5. **Xarid (tender modul bilan)** — oqim: tender (`P2`, `t2_tender_*`, `t2_birja_*`; yo'l: tomon-yetkazuvchi/ta'minot) → g'olib/buyurtma (P3) → yetkazib berish → **ombor kirim** (Codex) → schyot-faktura/nakladnoy hujjati (bux) → to'lov (bank). Bux hujjati tender/buyurtma ID siga `manba_ref` bilan bog'lanadi; **kutilgan kreditor qarz** (E3 §4.5) — buyurtma qabul qilinganda. Provodka: `Dt 1000 Kt 6010` (+QQS). Uch tomonlama moslik tekshiruvi (buyurtma ↔ ombor kirim ↔ schyot): farq bo'lsa ogohlantirish (ombor miqdorini **faqat o'qiymiz**).
6. **Sotuv — (a) F2 (pudrat tushumi), (b) uy sotish (`t2_sotuv_*`)**:
   (a) **Tasdiqlangan F2 → sotuv hujjati.** Hodisa `f2.tasdiqlandi` (L0) → bux iste'molchi `bux_hujjat(tur='sotuv_f2', manba_ref={f2_akt_id, versiya, xesh})` **qoralama** yaratadi (summa: ustamasiz F2 + QQS alohida; **ustamali F2 summasi — boshqaruv hisobi, provodkaga kirmaydi** [Q: buxgalteriya tushumi nimaga teng — F2 ning pryamye summasimi yoki shartnoma narxidagi (ustamali) summami? Bu soliq/buxgalteriya hisobi uchun eng muhim savol]); buxgalter tasdiqlaydi → `Dt 4010 Kt 9010 + QQS`. Buyurtmachi to'lovi (avans/tushum) `Dt 5110 Kt 4010`; avans hisobga olish. F2 bekor/storno → hujjat avtomatik **bekor taklifi** (storno provodka, buxgalter tasdiqlaydi; yopiq davrda — keyingi davrda tuzatish).
   (b) Uy sotish: bitim → shartnoma tuzildi / to'lov jadvali (`t2_sotuv_grafik`) / to'lov (`t2_sotuv_tolov`) → hujjat «Uy sotish tushumi»: `Dt 5110/5010 Kt 4010(buyurtmachi/xaridor)`, tushum tan olish (qurilish tugaganda/topshirilganda/qismlar bo'yicha) — **[T] buxgalteriya siyosati (BHMS №… tushumni tan olish)** — `bux_siyosat` sozlamasi. Avans qabul qilingan mablag' — majburiyat.
7. **Ombor (Codex)** — bux faqat **o'qiydi** ombor read-model/hodisalarini: `ombor.kirim`, `m29.chiqim`, inventarizatsiya, material qoldig'i. Provodka: kirim `Dt 1000 Kt 6010`; M-29 chiqim obyektga `Dt 2010 (obyekt) Kt 1000`; hisoblash usuli (FIFO/o'rtacha) — ombor egasida (Codex) yoki bux siyosati [Q: tannarx metodi, kim hisoblaydi]. Bux ombor jadvaliga **yozmaydi**.
8. **Asosiy vositalar (OS) va amortizatsiya** — `t2_bux_os` (inventar raqam, nom, guruh, boshlang'ich qiymat, foydalanish sanasi, foydali xizmat muddati, usul `chiziqli|kamayuvchi`, amortizatsiya normasi, obyekt/mas'ul, `holat` `faol|chiqib_ketgan`), hujjatlar: OS kirim (xarid yoki kapital qo'yilmadan), OS chiqish, ichki ko'chirish, **oylik amortizatsiya hisoblash** (davr yopishdan oldin; deterministik; provodka `Dt 2500/9400/2010 Kt 0200`). Texnika (`t2_erp_texnika`, `t2_texnika_*`) bilan bog'lanish: texnika ↔ OS (`os_id` ixtiyoriy), mash-soat bo'yicha amortizatsiya (qurilish texnikasi — ishlab chiqarish usuli [T]). Norma/guruhlar — **[T]** (soliq va buxgalteriya amortizatsiya normalari farq qilishi mumkin).
9. **Oylik** — §3.7: yopilgan davr → `bux_hujjat(tur='oylik_vedomost')` → provodka; to'lov — bank/kassa hujjati bilan yopiladi.
10. **Boshqa:** hisobdor shaxslar (avans hisoboti), ustama xarajatlar (накладные) ni obyektlarga taqsimlash (`t2_bux_taqsimot_qoida`, davr oxirida — `2500 → 2010 obyekt`), valyuta kursi (`t2_bux_kurs`: MB kursi, qo'lda/import [T]), davr yopish (checklist: tasdiqlanmagan hujjat yo'q, bank qoldiq mos, amortizatsiya, oylik, taqsimot, QQS kitobi).

### 4.5 Hisobotlar

Hisobotlar **provodka jurnalidan** (`t2_bux_saldo_oy` + ochiq oy tafsiloti) olinadi; har raqam bosilganda hujjatgacha «qazib tushish» (drill-down); eksport — XLSX/PDF (R2, fayl ombor qoidasi), rasmiy formada.
1. **Aylanma-saldo vedomosti** (hisob/analitika bo'yicha, davr): boshlang'ich qoldiq, dt/kt aylanma, oxirgi qoldiq.
2. **Hisob kartasi / kontragent kartasi / hisob tahlili.**
3. **Balans** (forma №1 BHMS №… [T]) — aktiv/passiv.
4. **Moliyaviy natijalar to'g'risida hisobot** (forma №2 [T]): tushum, tannarx, davr xarajati, soliqqacha foyda.
5. **Pul oqimi** (v2), **Kapital o'zgarishi** (v3).
6. **Akt-sverka** (kontragent bilan; mavjud `lib/sverka-1c` formatlari + 1C eksport).
7. **QQS deklaratsiyasi** (xarid/sotuv kitobi asosida jadvallar; soliq.uz formati [T]).
8. **Obyekt bo'yicha xarajat/foyda** (2010 analitika «obyekt»; boshqaruv hisobi bilan solishtirish: mavjud `t2_moliya_tahlil_v1` ning 16 ko'rsatkichi — L0 egaligi, **o'zgartirilmaydi**; jurnal ma'lumoti ularga «tartibga solingan hisobdagi qiymat» ustuni sifatida kelishuv bilan qo'shilishi mumkin — §5).
9. Rahbar paneli: pul qoldig'i, debitor/kreditor, QQS majburiyati, oy natijasi (mavjud `t2_boss_dashboard_v1` `moliya.ulangan` bayrog'i orqali ulanadi — L0 bilan).
Davr yopilgach hisobot R2 snapshot (xesh) — o'zgarmas; qayta ochish faqat `accounting.period.close` + sabab + audit.

### 4.6 1C dan import va 1C ga eksport (o'tish davri)

- **Import (boshlang'ich):** (1) hisob rejasi moslash (1C hisob kodi → `t2_bux_hisob_reja`); (2) **boshlang'ich qoldiqlar** (aylanma-saldo vedomosti XLSX/CSV, analitika bilan: kontragent/shartnoma) → bitta «boshlang'ich qoldiq» hujjati; (3) kontragentlar (INN bo'yicha dedupe → `t2_kontragent`), (4) OS reestri; (5) tarixiy provodka (ixtiyoriy, `manba='1c_import'`, o'zgarmas); (6) bank/kassa kitobi tarixi. Import: fayl R2 ga, **tekshiruv bosqichi (dry-run)** → xatolar hisoboti (yo'qotilmaydi, taxmin qilinmaydi: E3 §5.8 qoidasi) → tasdiq → yozish (idempotent partiyalar `operation_id`). Mavjud `qarzdorlik_import_v1`, `sverka_import_v1` — namuna (L0).
- **Eksport (parallel yuritish):** hujjat/provodka → 1C uchun almashinuv fayli (XML/CSV — «Бухгалтерия предприятия» formatiga mos [T: qaysi 1C konfiguratsiya/versiya?]), kontragent/nomenklatura ma'lumotnomalari, aylanma-saldo solishtirish hisoboti (**tizim vs 1C farq ekrani** — o'tish davrida ishonch hosil qilish uchun). O'tish rejasi: 2–3 oy parallel, har oy yopilishda aylanma-saldo mos kelishi → keyin 1C o'chiriladi.
- Hozirgi `t2_xarajat.manba='glavbux_import'` (glavbux importi) bilan moslik: xarajat kategoriyasi ЧЕЛ/МАШ/МАТ/ОБ/SUB/OTK ↔ BHMS xarajat moddasi/hisob jadvali (`t2_bux_xarajat_moddasi_xarita`).

### 4.7 «Oddiy tilda» UX

- Bosh ekran (rolga): «Bugun qilinadigan ishlar»: tasdiqlanmagan F2→sotuv hujjatlari, bank qatorlari moslashtirilmagan, muddatidan o'tgan e-faktura, davr yopish checklisti, QQS muddati.
- Hujjat formasi: yuqorida oddiy maydonlar (kim, nima, qancha, nima uchun); pastda **«Tizim nima qiladi»** paneli: provodka jadvali, har qatorga bir jumlalik izoh va hisob nomi (kodi kichik); «Nima uchun bu hisob?» tugmasi; xatolar/ogohlantirishlar qizil/sariq, **tasdiqlashdan oldin**.
- Ikki rejim: «Oddiy» (provodka ko'rsatiladi, o'zgartirib bo'lmaydi) va «Mutaxassis» (`accounting.post`: provodkani qo'lda tuzatish).
- Qidiruv: «Qaysi kontragentga qancha qarzmiz» kabi savollar → AI aniq read-model chaqiradi (hisoblamaydi, topadi).
- UI til: ruscha 1C terminlari o'rniga oddiy o'zbekcha («Debet/Kredit» — «Qayerga/Qayerdan» izohi bilan), 4 tilli lug'at.
- Qisqa yo'llar (hotkeys) mavjud `lib/hotkeys`.

### 4.8 AI yordamchi (buxgalteriya)

Mavjud AI chegaralari (Konstitutsiya, `lib/ai-yordamchi`, `api/t2-ai.ts`): AI **tushuntiradi, nomzod taklif qiladi, xatoni ko'rsatadi**; hisoblamaydi. Funksiyalar: (1) provodkani tushuntirish; (2) hujjat turiga hisob/QQS tavsiyasi (manba: rasmiy hisob reja + kompaniya siyosati; mavjud bo'lmasa «bilmayman»); (3) bank qatori → hujjat/kontragent nomzodlari (ishonch darajasi bilan); (4) skan/PDF schyot-fakturani o'qish (OCR → **qoralama maydonlar**, tasdiqlash buxgalterda; `document-understanding` mavjud qatlami); (5) anomaliya: odatdan tashqari summa, takroriy to'lov; (6) davr yopish checklisti. Token/narx nazorati mavjud billing (`t2_tolov_sorov`) bilan; AI chaqiruvlari og'ir yuk yaratmasligi uchun faqat so'rov bo'yicha.

### 4.9 Eng muhim integratsiya xaritasi

| Manba (egasi) | Hodisa / read-model | Bux/HR natijasi |
|---|---|---|
| F2 tasdiqlandi (L0) | `f2.tasdiqlandi {akt_id, versiya, xesh, ustamasiz, ustamali, qqs}` | Sotuv hujjati qoralama (bux); KPI bonus qatori (HR) |
| F2 bekor/storno (L0) | `f2.bekor`, `f2.storno` | Sotuv hujjati bekor taklifi; bonus teskari qator |
| To'lov / sverka (L0) | `t2_tolov*`, `t2_tolov_taqsimot` read | Bank hujjati bilan moslik (takror sanamaslik); bonus `buyurtmachi_tolovi` sharti |
| Ombor (Codex) | `ombor.kirim`, `m29.chiqim`, qoldiq read | Xarid/material provodkasi; KPI omborchi |
| Tender/buyurtma (yetkazuvchi) | `buyurtma.qabul_qilindi` | Kreditor qarz, xarid hujjati |
| Uy sotuv (`t2_sotuv_*`) | bitim/to'lov hodisalari | Sotuv tushumi hujjati |
| Tabel/oylik (HR) | `payroll.yopildi` | Oylik provodkasi |
| Texnika | mash-soat | OS amortizatsiya, KPI mexanik |
| Didox/soliq.uz | e-faktura statuslari | QQS kitobi |

---

## 5. Ma'lumotlar modeli, RPC, ekranlar — jamlanma

### 5.1 L0 / Codex bilan kelishish nuqtalari (aniq)

| # | Nuqta | Kim egasi | Biz nima olamiz/beramiz | Shakl |
|---|---|---|---|---|
| K1 | **F2 tasdiq read-model** `kpi_manba_f2_tasdiq_v1` | L0 (F2/moliya) | HR so'raydi: davr, obyekt/xodim → tasdiqlangan F2 yig'indisi (ustamasiz+ustamali+QQS), bekor/storno ajratilgan, `akt_id/versiya/xesh` | L0 yozadi (ustama formulasi L0 da — `_t2_f2_ustamali`), HR faqat chaqiradi. **Biz F2 formulasini nusxalamaymiz** |
| K2 | **F2 hodisalari** `f2.tasdiqlandi/bekor/storno` outbox ga | L0 | Bux/HR iste'molchi (`t2_outbox_kursor`) | L0 hozirgi `t2_akt_lifecycle_transition_v1` tranzaksiyasida outbox yozuvini qo'shadi (yoki read-poll); yoki ularsiz — davriy reconcile |
| K3 | **Buxgalteriya tushumi = F2 qaysi summasi?** (ustamasiz/ustamali, QQS) | L0 + egasi | Qaror, §6-S1 | Ustama — boshqaruv ko'rinishi; jurnal — shartnoma bo'yicha rasmiy summa |
| K4 | **`t2_tolov`/`t2_tolov_taqsimot`/`t2_xarajat` yozish** | L0 (moliya/sverka) | Bank vipiska tasdiqlansa, boshqaruv jadvaliga yozish — **L0 RPC si orqali** (`t2_tolov_yoz` yoki hand-off), takror sanalmaslik kaliti | Bux bu jadvallarga to'g'ridan INSERT qilmaydi |
| K5 | **`t2_moliya_tahlil_v1`, boss dashboard, `lib/hisob-yadro`, `SummaJuft`** | L0 | Faqat qayta ishlatish; jurnaldan «rasmiy» ustun qo'shish — L0 bilan | Bux o'z hisobotlarida yadroni import qiladi |
| K6 | **Sverka (1C akt-sverka, `lib/sverka-1c`, `sverka_import_v1`)** | L0 | Bux kontragent sverka ekrani — mavjud importni chaqiradi, o'z parseri yo'q; 1C eksport formati — yangi (bux) | Ikki yo'nalish: import — L0, eksport — bux |
| K7 | **Smeta import / nakrutka** | L0 | Tegmaymiz. Nakrutka koeffitsientlari faqat o'qish (K1 orqali) | — |
| K8 | **Ombor read-model/hodisalar** | Codex | Bux/KPI faqat o'qiydi; tannarx usuli — Codex bilan; `ACTIVE_TASKS.json` da `owns` ga ombor yo'llari bor — HR/bux fayllari ularni kesmasligi tekshiriladi | Codex C11 kontrakt (`docs/architecture/warehouse/C11_CONTRACT.md`) ga mos |
| K9 | **Ruxsat/rol katalogi** (`accounting.*`, `hr.*`, `payroll.*`) | arxitektura/roles (T2-ROLES-CONTROL) | Yangi capability qo'shish F1 ko'riklashi orqali (E2 §3) | egasi ✅ [Q] |
| K10 | **Obyekt/loyiha tenant kontekst, `t2_kontragent`** | umumiy | `t2_kontragent` ga bux ustunlari qo'shilsa (hisob_kodi sukuti) — additiv, L0 ko'rigi | additiv migratsiya |

Qoida: har PR da `ops/ACTIVE_TASKS.json` da `owns` yo'llari qulflanadi; L0 yoki Codex qulfi bor yo'llarga tegilmaydi; kelishuv — `ops/mailbox/INBOX.md` + TASK PACKET.

### 5.2 Jadvallar (qisqa ro'yxat)

HR: `t2_hr_xodim`, `t2_hr_xodim_pii`, `t2_hr_mehnat`, `t2_hr_lavozim`, `t2_hr_bolim`, `t2_hr_shtat`, `t2_hr_obyekt_biriktirish`, `t2_hr_hujjat`, `t2_hr_taqvim`, `t2_hr_grafik`, `t2_hr_grafik_oy`, `t2_hr_tabel`, `t2_hr_tatil_sorov`, `t2_hr_tatil_reja`, `t2_hr_tatil_harakat`, `t2_hr_sozlama`, `t2_hr_soliq_sozlama`, `t2_kpi_korsatkich_katalog`, `t2_kpi_shablon`, `t2_kpi_karta`, `t2_kpi_karta_qator`, `t2_kpi_bonus_qoida`, `t2_kpi_bonus_qator`, `t2_hr_jarima`, `t2_hr_jarima_tarix`, `t2_payroll_davr`, `t2_payroll_varaqa`, `t2_payroll_qator`, `t2_hr_audit`, `t2_hr_operatsiya`.
Bux: `t2_bux_hisob_reja`, `t2_bux_hujjat`, `t2_bux_hujjat_qator`, `t2_bux_provodka` (partitsiya), `t2_bux_provodka_qoida`, `t2_bux_davr`, `t2_bux_saldo_oy`, `t2_bux_bank_hisob`, `t2_bux_bank_import`, `t2_bux_bank_qator`, `t2_bux_qqs_kitob`, `t2_bux_os`, `t2_bux_os_amortizatsiya`, `t2_bux_kurs`, `t2_bux_taqsimot_qoida`, `t2_bux_xarajat_moddasi_xarita`, `t2_bux_soliq_sozlama`, `t2_bux_siyosat`, `t2_bux_1c_import`, `t2_bux_audit`, `t2_bux_operatsiya`.
Barchasi: `kompaniya_id NOT NULL`, `versiya`, `operation_id` (yozuvchilarda), `holat`, `yaratildi/yangilandi/kim`, RLS yoqilgan + policy yo'q + GRANT yo'q; pul `numeric(20,2)`; sanalar `date`; NULL = noma'lum.

### 5.3 RPC ro'yxati (nomli; hammasi `p_actor_id, p_kompaniya_id, p_operation_id`, versiya; `*_v1`)

**HR**: `t2_hr_xodim_saqla_v1`, `t2_hr_xodim_royxat_v1` (PII siz), `t2_hr_xodim_karta_v1`, `t2_hr_pii_oqi_v1` (audit bilan), `t2_hr_mehnat_ozgartir_v1`, `t2_hr_shtat_saqla_v1`, `t2_hr_shtat_holat_v1`, `t2_hr_obyekt_biriktir_v1`, `t2_hr_taqvim_saqla_v1`, `t2_hr_grafik_saqla_v1`, `t2_hr_grafik_oy_yarat_v1`, `t2_hr_tabel_yoz_v1` (ommaviy, brigadir), `t2_hr_tabel_tasdiq_v1`, `t2_hr_tabel_yop_v1`, `t2_hr_tabel_oy_v1` (o'qish), `t2_hr_tatil_sorov_v1`, `t2_hr_tatil_qaror_v1`, `t2_hr_tatil_reja_v1`, `t2_hr_tatil_balans_v1`, `t2_hr_tatil_pul_hisobla_v1` (preview).
**KPI**: `t2_kpi_shablon_saqla_v1`, `t2_kpi_karta_yarat_v1`, `t2_kpi_karta_hisobla_v1` (manbalarni chaqiradi, snapshot), `t2_kpi_karta_tasdiq_v1`, `t2_kpi_qolda_tuzat_v1`, `t2_kpi_bonus_qoida_saqla_v1`, `t2_kpi_bonus_hisobla_v1` (preview + yozish), `t2_kpi_bonus_reconcile_v1` (F2 holati bilan solishtirish), `t2_kpi_royxat_v1`.
**Jarima**: `t2_hr_jarima_taklif_v1`, `t2_hr_jarima_tasdiq_v1`, `t2_hr_jarima_apellyatsiya_v1`, `t2_hr_jarima_qaror_v1`, `t2_hr_jarima_royxat_v1`.
**Payroll**: `t2_payroll_hisobla_v1` (preview), `t2_payroll_tasdiq_v1`, `t2_payroll_yop_v1` (hodisa `payroll.yopildi`), `t2_payroll_tuzatish_v1`, `t2_payroll_varaqa_v1` (xodim o'ziniki — `payroll.read` yoki o'z), `t2_usta_daromad_v1` (E3).
**Bux yadro**: `t2_bux_hisob_reja_seed_v1`, `t2_bux_hisob_saqla_v1`, `t2_bux_hujjat_saqla_v1`, `t2_bux_hujjat_tasdiq_v1` (provodka hosil+yoz, bitta tranzaksiya), `t2_bux_hujjat_bekor_v1` (storno), `t2_bux_provodka_korish_v1` (preview + izoh/tushuntirish), `t2_bux_validator_v1`, `t2_bux_davr_yop_v1`, `t2_bux_davr_och_v1` (ogohlantirish), `t2_bux_saldo_qayta_qur_v1`.
**Bank/kassa**: `t2_bux_bank_import_v1` (R2 fayl ref), `t2_bux_bank_qator_moslash_v1`, `t2_bux_bank_qator_tasdiq_v1`, `t2_bux_kassa_kitob_v1`.
**Kontragent/QQS/OS**: `t2_bux_kontragent_karta_v1`, `t2_bux_schyot_karta_v1`, `t2_bux_qqs_kitob_v1`, `t2_bux_efaktura_yarat_v1`, `t2_bux_efaktura_holat_v1` (Didox sync), `t2_bux_qqs_deklaratsiya_v1`, `t2_bux_os_kirim_v1`, `t2_bux_amortizatsiya_hisobla_v1`, `t2_bux_os_chiqish_v1`, `t2_bux_taqsimot_v1`.
**Hisobot**: `t2_bux_aylanma_saldo_v1`, `t2_bux_balans_v1`, `t2_bux_natija_v1`, `t2_bux_akt_sverka_v1`, `t2_bux_hisobot_snapshot_v1` (R2).
**Integratsiya iste'molchilar**: `_t2_bux_iste_mol_f2_v1`, `_t2_bux_iste_mol_ombor_v1`, `_t2_bux_iste_mol_sotuv_v1`, `_t2_hr_iste_mol_f2_v1` (outbox kursor bo'yicha, idempotent).
**1C**: `t2_bux_1c_import_tekshir_v1` (dry-run), `t2_bux_1c_import_qoll_v1`, `t2_bux_1c_eksport_v1`, `t2_bux_1c_farq_v1`.

### 5.4 Ekranlar (bux) — `/admin/buxgalteriya`

Bosh (vazifalar); Hujjatlar (jurnal: filtr, tur, holat) + hujjat formasi + «Tizim nima qiladi» paneli; Provodka jurnali (mutaxassis); Hisob rejasi; Kassa; Bank schyotlar + vipiska import (3 qadam: yuklash → moslash → tasdiq); Kontragentlar + schyot-karta + akt-sverka; QQS kitobi + e-faktura (Didox) + deklaratsiya; Xarid; Sotuv (F2 asosida qoralamalar, uy sotish tushumi); Ombor ko'rinishi (faqat o'qish); Asosiy vositalar + amortizatsiya; Oylik hujjatlari; Davr yopish (checklist); Hisobotlar (aylanma-saldo, balans, natija, hisob kartasi, obyekt bo'yicha); 1C import/eksport/farq; Sozlamalar (siyosat, stavkalar, kurs, andoza).

---

## 6. Bosqichli reja (PR hajmida)

Umumiy qoida: har PR — migratsiya (additiv) + `.rollback.sql` + contract test + shlyuz route + UI + i18n `qism/*.json` + gate (`governance-check`); **prod'ga migratsiya faqat parent/egasi tasdig'idan keyin** (Konstitutsiya). Migratsiya raqami: keyingi bo'sh oraliq parent bilan belgilanadi (hozirgi oxirgisi `20261124000000`); taklif — HR `202612010xxxxx`, bux `202612100xxxxx` [parent tasdiqlaydi].

**PR-1 — HR yadrosi: xodim kartasi, lavozim, shtat, ruxsat** (L0 ga tegmaydi)
- Migratsiya: `t2_hr_xodim`, `_pii`, `_mehnat`, `_lavozim`, `_bolim`, `_shtat`, `_obyekt_biriktirish`, `_hujjat`, `_audit`, `_operatsiya`; eski `t2_erp_kadr`/`t2_kadr_mustaqil` → idempotent import RPC (`gas_import`, xaritalanmaganlar hisoboti; jadvallar o'chirilmaydi, 0 qator bo'lgani uchun xavf kam).
- RPC: `xodim_saqla/royxat/karta`, `pii_oqi`, `mehnat_ozgartir`, `shtat_saqla`, `obyekt_biriktir`.
- Ruxsat: `hr.*` capability larni katalogga qo'shish — **egasi tasdig'i (K9)**; `kadr` roli mavjudligini F1 migratsiyasi bilan solishtirish.
- UI: `/admin/hr` — Xodimlar ro'yxati + karta + Shtat; mobil yo'q.
- Qabul: tenant izolyatsiya testi (boshqa kompaniya xodimini ko'rmaydi), PII ro'yxatda chiqmaydi, takror `operation_id`, versiya konflikti, eski RPC lar o'zgarmay ishlaydi.
- Hajm: ~1 migratsiya, 10 RPC, 3 ekran. Bog'liqlik: yo'q.

**PR-2 — Buxgalteriya yadrosi: hisob rejasi + hujjat + append-only provodka jurnali** (L0 ga tegmaydi, faqat o'qiydi)
- Migratsiya: `t2_bux_hisob_reja` (BHMS №21 andoza seed — **buxgalter tasdiqlagan ro'yxat bilan [T]**), `t2_bux_hujjat(+qator)`, `t2_bux_provodka` (append-only trigger, Σdt=Σkt constraint, partitsiya), `t2_bux_provodka_qoida`, `t2_bux_davr`, `t2_bux_saldo_oy`, `t2_bux_audit`, `t2_bux_operatsiya`.
- RPC: `hisob_reja_seed/saqla`, `hujjat_saqla/tasdiq/bekor`, `provodka_korish` (tushuntirish bilan), `validator`, `davr_yop`, `aylanma_saldo`.
- Hujjat turlari v1: faqat **qo'lda** (kassa kirim/chiqim, umumiy operatsiya) — provodka shablon mexanizmi isbotlanadi; integratsiya hali yo'q.
- UI: Hisob rejasi, Hujjatlar + «Tizim nima qiladi» paneli, Provodka jurnali, Aylanma-saldo (drill-down), Davr yopish.
- Qabul: davr yopiq → rad; tasdiqlangan hujjat tahrirlanmaydi; storno; Σ tengligi; tenant; performance (10⁵ provodka — aylanma-saldo `saldo_oy` dan, E5 byudjeti); mavjud `t2_tolov/xarajat` o'zgarmagan.

**Keyingi PR lar (tartib):**
- PR-3 HR: tabel + ish grafigi + taqvim (mobil `/m/brigadir`, offline), tabel yopish.
- PR-4 HR: ta'til (balans ledger, ariza, reja, to'qnashuv tekshiruvi) — **[T] qonun tasdig'idan keyin parametrlar**.
- PR-5 Bux: kassa + bank vipiska import (R2) + kontragent schyot-karta; `t2_tolov` bilan hand-off (**K4, L0 kelishuv**).
- PR-6 KPI yadro: katalog, shablon, karta, qo'lda manbalar, ball; avtomatik manbalar: tabel, predpisaniye, muddat (L0 muddat read-model bilan K1 dan tashqari).
- PR-7 **KPI bonus ← tasdiqlangan F2** (**K1+K2 L0 bilan oldindan**): `kpi_manba_f2_tasdiq_v1` L0 PR i birinchi; HR iste'molchi; bekor/storno teskari qatorlar, reconcile.
- PR-8 Payroll: oylik hisoblash, soliq sozlamalari **[T]**, vedomost PDF → R2, `payroll.yopildi`.
- PR-9 Bux: oylik provodkasi + xarid/ombor read (Codex K8) + sotuv F2 qoralamalari (K2, K3 qaror bilan) + uy sotish tushumi.
- PR-10 Jarima oqimi (yurist tasdig'idan keyin ushlanmani yoqish; avval faqat yozuv).
- PR-11 QQS kitobi + Didox e-faktura (yaratish/qabul/tasdiq) + deklaratsiya tayyorlash.
- PR-12 OS + amortizatsiya + texnika bog'lanishi.
- PR-13 Hisobotlar: balans, natija, akt-sverka (K6), obyekt hisoboti, davr snapshot R2.
- PR-14 1C import (boshlang'ich qoldiq, kontragent, OS) + eksport + farq ekrani; parallel yuritish.
- PR-15 AI yordamchi (provodka tushuntirish, bank moslash, OCR qoralama); rahbar paneliga ulash (K5).
Har bosqichdan keyin: **authenticated owner vertical smoke** (Konstitutsiya Release gate).

---

## 7. Xavflar

- **Qonun/soliq aniqligi** (stavka, ta'til, jarima, ushlanma, QQS, BHMS kodlari): hammasi sozlama jadvallarida, kodda emas; PR-4/8/10/11 `[T]` tasdig'isiz yoqilmaydi.
- **Ikkilangan hisob:** boshqaruv (ustamali, L0) va tartibga solingan (jurnal) o'rtasida nomuvofiqlik → yagona `manba_ref`, farq ekrani, K3 qarori.
- **F2 ga teskari ta'sir:** bonus/provodka F2 ni hech qachon o'zgartirmaydi; F2 bekor/storno → tuzatish qatorlari.
- **PII/maosh sizishi:** alohida jadval/capability, ro'yxat RPC larda yo'q, o'qish auditi.
- **Hajm:** provodka partitsiya + `saldo_oy`; fayllar R2.
- **Yurisdiksiya:** O'zR (so'm); boshqa valyuta v2.
- **Parallel agentlar:** `ACTIVE_TASKS.json` qulflari, migratsiya raqam oraliqlari.

---

## 8. Ochiq savollar egasiga (qisqa)

- **S1.** Buxgalteriya tushumi/QQS bazasi F2 ning qaysi summasi: ustamasiz (pryamye) yoki shartnoma/ustamali? (Soliq hisobiga ta'sir qiladi.)
- **S2.** Prorab bonusi bazasi: F2 ustamasizmi yoki ustamalimi? Foiz X qancha, rol bo'yicha farqlimi? Bonus F2 tasdiqlanganda yoki buyurtmachi pulni **to'laganda** hisoblanadimi?
- **S3.** F2 bekor/storno bo'lsa bonus qaytariladimi (ushlab qolish) yoki keyingi bonusdan ayriladimi yoki ushlanmaydimi?
- **S4.** «Jarima» — oylikdan ushlanma sifatida to'g'ridan-to'g'rimi? (Qonuniy cheklovlar bor [T]: yurist ko'rigi kerakmi? Avval faqat yozuv rejimida boshlaymizmi?)
- **S5.** Kompaniyada qanday mehnat rejimi (5/2, 6/1, vахta/smenali) va qaysi lavozimlar KPI ga kiradi? KPI maqsad qiymatlarini kim belgilaydi?
- **S6.** Hozir buxgalter qaysi 1C konfiguratsiya/versiyada ishlaydi va nechta yuridik shaxs/kompaniya shu tizimda yuritiladi? 1C bilan parallel muddati?
- **S7.** BHMS hisob rejasi va soliq stavkalarini kim tasdiqlaydi (ichki bosh buxgalter / tashqi audit)? Rasmiy hisob rejasi fayli bormi?
- **S8.** Didox/soliq.uz: qaysi imkoniyatlar kerak (faqat e-faktura yuborish/qabul, yoki deklaratsiyani avtomatik topshirish)? API kalitlari mavjudmi?
- **S9.** Bank vipiska formati qaysi banklardan (fayl turi)? Bank API kerakmi?
- **S10.** Yangi capability lar (`hr.*`, `payroll.*`, `accounting.*`) va `kadr` roli qo'shilishini tasdiqlaysizmi (E2 §3, K9)?
- **S11.** Ombor tannarx usuli (FIFO/o'rtacha) va uni kim hisoblaydi (Codex ombor yoki bux)?
- **S12.** Xodimlar faqat shtatdagilarmi yoki pudrat (GPX) ustalar ham HR kartasiga kiradimi (E1 «shaxsiy» ustalar bilan chegarasi)?
