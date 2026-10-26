# SMETA CONST VA KORREKTIROVKA — dizayn (V1)

Holat: DIZAYN · 2026-10-27 · Claude · 1-PR: A (muhr) + B qoralamasi. Prodga L0 qo'llaydi.
Bog'liq: PTO-CORE-001 (#157, `t2_smeta_versiya*`), `SMETA_F2_NAKOPITELNIY_CHANGE_CONTROL_V1.md`, `PTO_STATE_MACHINE.md`.

## 0. Egasi talablari (2026-10-27)

- **(A)** «Smetani CONST qilish muhim — bir vergul qo'shilsa ham smetadan o'zgargan pozitsiya aniq bo'lishi kerak.»
- **(B)** «Stellani korrektirovkaga beryapmiz — smeta o'zgaradi, shu vaziyat uchun to'g'ri ishlashi kerak.» (Stella va haykal = obyekt 152.)

## 1. Hozir nima bor (jonli sxema, 2026-10-27 o'lchovi)

| Narsa | Joyi | Xulosa |
|---|---|---|
| Joriy smeta qatori | `t2_qator` (314 471 qator, 75 obyekt) | Yagona haqiqat; 90 funksiya va 15 view o'qiydi. `UPDATE` erkin (`t2_qator_tahrir`, import, markirovka, ierarxiya tiklash). |
| Obyekt bazaviy holati | `t2_smeta_revision` seq 0 «asl» (47 obyekt) — `t2_smeta_baseline_kafolat_v1` birinchi F2/o'zgarishda jsonb snapshot oladi | Bor, lekin **kod va norma yo'q**, qator bo'yicha indekslanmagan, 28 obyektda umuman yo'q. Taqqoslash hech qayerda ko'rsatilmaydi. |
| Maydon jurnali | `t2_ozgarish` (≈110 ming) — trigger `t2_ozgarish_qayd` | `manba ∈ {import, markirovka, narxlash, rollup}` bo'lsa **yozmaydi**; `kod`, `norma`, `tur`, `ota_id` umuman yozilmaydi. Ya'ni jurnal «const» isboti emas. |
| O'zgarish buyrug'i | `t2_smeta_ozgarish(+_qator)` → `_tasdiqlash_v1` | Tasdiqlanganda `t2_qator` ni yangilaydi (hajm, narx, nom; `olib_tashlash` → hajm 0; `qoshish` → yangi qator), keyin revision seq N yozadi. **Korrektirovka uchun qayta ishlatiladi (B).** |
| Tashqi versiya | `t2_smeta_versiya / _pozitsiya / _moslik` + view `t2_smeta_versiya_dava` (#157) | Moslash dvigateli + inson tasdig'i bor. B shu ustiga quriladi. |

**Stella (152) haqiqiy misoli** (seq 0 snapshot 2026-10-24 06:49 bilan joriy `t2_qator` solishtirildi):
29 qator o'zgargan — 28 tasi `rs → bl` (kat МАТ → bo'sh), shulardan 7 tasida birlik `% → сум`, hajm (masalan 50 → 1) va narx o'zgargan;
1 ta `ob` qatorda hajm va narx o'rin almashgan (hajm = 16 295 628 753,57, narx = 1, birlik `компл → сум`); 28 ta `rs` qator bazaviy holatdan keyin qo'shilgan; o'chirilgan yo'q.
Jurnalda (`t2_ozgarish`) birlik/hajm/narx/kat o'zgarishlari bor, lekin `manba = baza`, **`kim` bo'sh** (to'g'ridan-to'g'ri SQL, 2026-10-25), `tur` (rs → bl) esa umuman yozilmagan — ya'ni **hozir tizim bu o'zgarishlarni smeta sahifasida umuman ko'rsatmaydi va kim qilgani noma'lum.**
Ekspertizagacha bo'lim (`СТЕЛЛА (ekspertizagacha)`) ostida 774 qator bor — ularda o'zgarish yo'q; alohida belgilanadi.

## 2. A — CONST: qator muhri

### 2.1. Qayerda saqlanadi (dublikat yasamaslik)
Yangi jadval **`t2_qator_muhr`** — har qator uchun bitta «muhr» yozuvi (`unique (qator_id, bosqich)`; `bosqich 0` = asl, B da `N` = korrektirovka revision seq).
Nega mavjud joy emas:
- `t2_qator` ga ustun qo'shilsa, muhr qatorning o'zi bilan birga bitta `UPDATE` da o'zgarishi mumkin — isbot bo'lmaydi; har `UPDATE` versiya/signal triggerlarini ham uradi.
- `t2_smeta_revision.snapshot` — obyekt bo'yicha bitta jsonb (1,4 MB gacha), kod/norma yo'q, qator bo'yicha so'rab bo'lmaydi. U **o'zgarmaydi** va muhr unga `revision_id` bilan havola qiladi (backfill manbai).
- `t2_ozgarish` — jurnal (qachon/kim), muhr esa holat (nima edi). View ikkisini bog'laydi.

Muhr yozuvi: `tur, kod, nom, birlik, kat, ota_id, hajm, narx, norma` — **normallashtirilgan** qiymatlar (= «avval»), `muhr` = SHA-256 (hex) kanonik matndan,
`manba` (`import` | `backfill_revision` | `backfill_joriy` | `korrektirovka` | `qolda`), `asos_vaqt` (qiymatlar qaysi paytdagi), `revision_id`,
`ekspertizagacha`, `aslda_yoq` (bazaviy holatdan keyin qo'shilgan), `tekshirilmagan text[]` (asl qiymati noma'lum maydonlar).
Jadval **faqat qo'shiladi**: trigger `UPDATE`/`DELETE` ni rad etadi (yagona istisno — bir marta `yopildi/yopilish_sabab` qo'yish). anon/authenticated kirishi yo'q.

### 2.2. Kanonik shakl («bir vergul ham»)
`v1 ␟ tur ␟ kod ␟ nom ␟ birlik ␟ kat ␟ ota_id ␟ hajm ␟ narx ␟ norma` (ajratgich `chr(31)`), qoidalar:
- matn: chetdagi bo'shliq olinadi, ichki bo'shliqlar (NBSP, tab, qator ko'chishi) bitta probelga; **harf registri va tinish belgilari saqlanadi** — vergul, nuqta, qavs, `ё/е` farqi o'zgarish deb hisoblanadi; bo'sh matn = NULL;
- son: `trim_scale` (2.4210 = 2.421), **NULL `∅` belgisi bilan — 0 dan farqli** (NULL ≠ 0);
- egasi ro'yxatidagi 8 maydonga `kat` ham qo'shildi (Stella misolida МАТ → bo'sh real o'zgarish). `summa` kirmaydi — u hosila (rollup).

### 2.3. Qachon olinadi
1. **Import**: `t2_smeta_import_yakunla_v1` va `t2_smeta_paket_import_yakunla_v1` (qisqa o'ram funksiyalar) ichki funksiya muvaffaqiyatli tugagach `t2_qator_muhr_ol_v1(obyekt,'import')` ni chaqiradi: muhri yo'q har qator muhrlanadi; bazada endi yo'q qatorlarning ochiq muhrlari «qayta import» sababi bilan yopiladi. Muhr xatosi importni yiqitmaydi (ogohlantirish + javobda `muhr_xato`), muhrsiz qator UI'da «muhrsiz» bo'lib ko'rinadi.
2. **Backfill** (bir martalik, migratsiyada): seq 0 revision bo'lsa — snapshotdagi qiymatlar (`backfill_revision`, `asos_vaqt` = revision vaqti; kod/norma snapshotda yo'q → joriydan, `tekshirilmagan = {kod,norma}`); snapshotda yo'q joriy qatorlar → `aslda_yoq = true`; snapshotda bor, bazada yo'q → muhr qoladi va «o'chirilgan» chiqadi. Revisionsiz obyekt → joriy holat (`backfill_joriy`).
3. **Ekspertizagacha** belgisi muhr paytida ajdodlar zanjiridan (frontend `ESKI_SMETA` bilan bir xil regex) hisoblanadi.

### 2.4. «O'zgargan» read-model
View **`t2_qator_muhr_farq`** (security_invoker, faqat farqi bor qatorlar): `holat ∈ ozgargan | ochirilgan | qoshilgan | muhrsiz`,
`maydonlar text[]`, `avval jsonb` / `endi jsonb` (faqat o'zgargan maydonlar), `faqat_narx_qoyildi` (narx NULL → qiymat: narxlash bosqichi, xavf emas),
`ekspertizagacha`, `tekshirilmagan`, jurnal bog'lanishi: `jurnal_soni`, `oxirgi_tahrir`, `oxirgi_kim`, `oxirgi_manba` (`t2_ozgarish`, `asos_vaqt` dan keyin) —
**`jurnal_soni = 0` va `holat = ozgargan` → «jurnalsiz o'zgarish»** (import/markirovka yo'li) alohida ogohlantiriladi. Gateway: `/api/sb`, siyosat `kompaniya`.
Asl qatorni `UPDATE` qilish **rad etilmaydi** (egasi cheklov xohlamaydi) — faqat ko'rinadi.

**Tezlik (prod o'lchovi, BEGIN..ROLLBACK):** `search_path` o'rnatilgan funksiya chaqirig'i ~100 mks — shuning uchun qatorga bitta chaqiriq (`t2_qator_muhr_hisob` → {muhr, normallashtirilgan matnlar}); view muhrni faqat xom qiymati saqlangandan farq qilgan qatorlar uchun hisoblaydi. Stella: backfill 2 302 qator 1,5 s, view 1,9 s (jurnal indeksisiz). To'liq backfill ≈ 315 ming qator, ~40–60 s; faqat yangi jadvalga yozadi, `t2_ozgarish` indeksi eng oxirida quriladi.

### 2.5. UI (1-PR)
Smeta daraxtida (LRV «Smeta va bajarilish»): qator nomi yonida muhr belgisi «o'zgargan» (warn) / «qo'shilgan» (info) / «narx qo'yildi» (info);
tezkor filtr «Asl smetadan farq»; qator tafsilotida «Asl smetadan farq» paneli: maydon | avval | endi | jurnal (kim/qachon yoki «jurnalda yo'q»);
daraxt ustida xulosa: N o'zgargan · M qo'shilgan · K o'chirilgan (o'chirilganlar ro'yxati shu yerda, chunki ular daraxtda yo'q), ekspertizagacha bo'limlar soni alohida.

## 3. B — KORREKTIROVKA oqimi (dizayn + migratsiya qoralamasi; egasi tasdig'idan keyin)

```
LRV (korrektirovka) ─► t2_smeta_versiya(tur='korrektirovka') ─► #157 moslash ─► egasi noaniqlarni tasdiqlaydi
   ─► «Amaldagi qilish» (t2_smeta_korrektirovka_qolla_v1, preview → tasdiq, operation_id, kutilgan revision)
        ├─ t2_smeta_ozgarish(tur='korrektirovka', versiya_id) + _qator (moslikdan avtomatik)
        ├─ mavjud t2_smeta_ozgarish_tasdiqlash_v1 → t2_qator o'zgaradi, revision seq N (amaldagi = yangi)
        ├─ t2_qator_muhr bosqich N (yangi holat muhri; bosqich 0 «asl» o'zgarmay qoladi)
        └─ da'vo/pereraschet: kesilgan hajm × F2 olingan → t2_smeta_versiya_dava + pereraschet ro'yxati
```

### 3.1. Asosiy qaror: qator identifikatori barqaror (tavsiya)
Moslik holati bo'yicha:

| Moslik | t2_qator bilan nima bo'ladi | F2 / fakt |
|---|---|---|
| `ozgarmagan` | tegilmaydi | o'z joyida |
| `kamaygan` / `oshgan` | **o'sha qator** hajmi yangilanadi (`amal='hajm'`); «avval» bosqich 0 muhrida | o'z joyida — nakopitelniy «oldingi olingan» avtomatik to'g'ri; kesilganda qoldiq manfiy → pereraschet/da'vo |
| `almashtirilgan` | eski qator hajmi 0 (`olib_tashlash`), `zamena=true`; yangi qator `replaces_line_id = eski`, `change_type='REPLACEMENT'` | eski qatordagi F2 o'zgarmaydi; yangi qatorning «oldingi olingan»i = Σ F2(eski) × moslik (mavjud `t2_zamena_qoplash` mexanizmi) |
| `ochirilgan` | hajm **0** (faktik 0 — korrektirovka olib tashlagan, NULL emas), qator o'chirilmaydi | F2 bor bo'lsa → qoldiq manfiy → da'vo/pereraschet ro'yxati |
| `yangi` | yangi qator (`amal='qoshish'`) | — |

**Nega yangi qatorlar + eski «arxiv» varianti emas:** `t2_qator` ni 90 funksiya va 15 view o'qiydi; «arxiv» holati qo'shilsa hammasiga filtr kerak (birortasi unutilsa smeta ikki marta sanaladi), `t2_akt_qator.qator_id → t2_qator` FK `RESTRICT`, va nakopitelniy/forma3/workbench `revision_id`/`qator_id` bo'yicha bog'langan. Barqaror identifikator bilan **o'qiydigan hech bir funksiya o'zgarmaydi**, tasdiqlangan F2 qatori ham, uning `qator_id`si ham o'zgarmaydi; «asl» qiymat esa bosqich 0 muhrida va seq 0 snapshotda const qoladi. (Egasi «yangi qator + arxiv» variantini talab qilsa — §4 savol 1.)

### 3.2. Revision ledgeri
Korrektirovka = bitta `t2_smeta_ozgarish` → bitta revision seq N (`izoh = 'Korrektirovka: <versiya nomi>'`). «Amaldagi» = eng katta seq — mavjud 6+ o'quvchi o'zgarmaydi. `t2_smeta_versiya.natija_ozgarish_id` bog'lanadi; F2 qatorlaridagi `revision_id` eski bo'lib qoladi (qaysi smeta bo'yicha topshirilgani isboti).

### 3.3. Rollback
1-qatlam: `t2_smeta_ozgarish_qaytar_v1` (mavjud) — teskari amal, yangi revision seq N+1 («bekor qilindi»), muhr bosqich N yopiladi. Faqat korrektirovkadan keyin yangi F2 tasdiqlanmagan bo'lsa ruxsat (aks holda `F2_KORREKTIROVKADAN_KEYIN`).
2-qatlam (favqulodda): `snapshot.qaytar` — qo'llashdan oldin avtomatik obyekt snapshoti olinadi.

### 3.4. Qoralama migratsiya (prodga EMAS)
`docs/architecture/qoralama/20261113100000_t2_smeta_korrektirovka_v1.draft.sql`: `t2_smeta_ozgarish.tur += 'korrektirovka'`, `versiya_id`; `t2_smeta_versiya.natija_ozgarish_id`; `t2_smeta_korrektirovka_preview_v1` / `_qolla_v1`; `t2_qator_muhr` bosqich N.

## 4. Egasi uchun savollar (B dan oldin)
1. Korrektirovkada mos kelgan pozitsiya **o'sha qatorda** yangilansinmi (tavsiya, F2 bog'lanishi buzilmaydi) yoki har doim yangi qator + eski «arxiv»?
2. Korrektirovka hajmni kamaytirdi, lekin F2 da ko'proq olingan (Stella: tasdiqlangan 8 ta F2, 2 466 qator): avtomatik pereraschet ro'yxatiga tushsinmi yoki avval «qurilgan/qurilmagan» qarori (#157 dagidek) so'ralsinmi?
3. Korrektirovkadagi narx: LRV da narx yo'q — narx joriy smetadan (moslik bo'yicha) olinsinmi, yangi pozitsiyalar narxsiz (bo'sh, bildirishnoma bilan) qolsinmi?
4. «Ekspertizagacha» bo'limlar (Stella 774 qator) korrektirovkaga kiradimi yoki alohida qoladimi?
5. Kim «Amaldagi qilish» ni bosadi — faqat boss/rahbar (hozirgi `t2_smeta_ozgarish` qoidasi) yoki PTO ham?
6. Muhr: narx o'zgarishi (narxlash bosqichi, NULL → qiymat) ham «o'zgargan» deb ko'rsatilsinmi (hozir alohida «narx qo'yildi» deb, yumshoq rangda) — yoki umuman yashirilsinmi?
7. Backfill: Stella kabi seq 0 dan keyin qilingan 29 o'zgarish — «asl»ga aylantirilsinmi (qayta muhrlash) yoki ko'rinib tursinmi (tavsiya: ko'rinib tursin)?
