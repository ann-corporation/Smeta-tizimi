# TIZIM_02 tezlik auditi (pudratchi tomoni) — 2026-11-13

Faqat o'qish: SELECT/EXPLAIN (ANALYZE'siz) va kod o'qildi. Hech narsa o'zgartirilmadi. Mijoz ma'lumoti yozilmadi.
Belgi: [O] — o'lchandi (so'rov natijasi), [K] — koddan (fayl:qator), [T] — o'lchanmadi, taxmin.

## 0. Asosiy xulosa
1. Eng katta sekinlik manbai: `t2_obyekt_jami` view (obyektlar ro'yxati) — 2685 chaqiruv x o'rtacha 3,7 s = jami 9873 s, ya'ni bazadagi №1 yuk [O]. Uni 36 ta joy `sbT2ObyektlarOlKomp` orqali KESHSIZ chaqiradi [K]; faqat Holat/Fakt/Nakopitelniy/F2 `obyektlarKeshdan` (60 s) ishlatadi.
2. `pg_stat_statements` dagi max ≈ 29-30 s — bu `authenticator` roli `statement_timeout=30s` [O: pg_roles]. Ya'ni og'ir RPC/view'lar real foydalanuvchida TIMEOUT bo'lgan holatlar bor (rahbar_panel max 29,1 s, mindmap 29,6 s, qator_holat 22 s, akt_reestr 28 s).
3. Statistika 2026-10-02 dan to'planadi [O: pg_stat_statements_info] — o'rtachalar qisman eski (tezlik migratsiyalaridan oldingi) ishga tushishlarni o'z ichiga oladi; hozirgi holat uchun yangi reset + qayta o'lchash kerak [T].
4. Baza 469 MB / 500 MB [O]; public 349 MB, snapshot 82 MB, pg_catalog 31 MB. Free tarifda 31 MB zaxira qoldi.
5. Frontend: lazy marshrutlar yaxshi (App.tsx:19-130), og'ir kutubxonalar (xlsx/exceljs/jspdf/leaflet) dinamik; asosiy bo'lakka faqat `framer-motion` tushib qolgan. Katta smeta daraxti virtualizatsiyalangan (SmetaTree.tsx:3,241).

## 1. Sahifalar: tarmoq so'rovlari (koddan)
Hamma o'qish `POST /api/sb` (sb.ts) orqali; `sbOqi` (api/supabase.ts:78) keshsiz va dedupesiz — dedupe faqat `birlash()` bilan o'ralgan funksiyalarda (akt-reestr kabi). Har /api/sb so'rovida: sessiya tekshiruvi + `roleAuthority` (60 s in-memory kesh, sovuq isolate'da `t2_men_v1` RPC, role-authority.ts:41-63) + `otaKompaniyasi` (60 s kesh, aks holda qo'shimcha REST so'rov, ota-kompaniya.ts:17) — sovuq isolate'da data so'rovidan OLDIN 1-2 ketma-ket Supabase so'rov. `t2_men_v1`: 16 516 chaqiruv, o'rt. 68 ms, max 12,6 s [O].

| Sahifa | So'rovlar (taxminan, mount'da) | Muammo |
|---|---|---|
| Obyektlar (test02/TestObyektlar.tsx) | obyekt_jami (:94/:173), loyihalar (:69), useCompanyLineage (:35), **rahbar_panel_v1** (:44, avtomatik fon), nakrutka paket (:46, bo'laklab) — 4-5 parallel | rahbar_panel o'rt. 14 s [O] sahifa ochilishi bilan fonda ketadi; obyekt_jami keshsiz |
| Holat (HolatNative.tsx) | 1x `/api/obyekt-paket` (daraxt+holat+nakrutka bitta RPC; t2-paket-oqish.ts:37), obyektlar (60 s kesh), workspace hierarchy | Paket yo'li o'chsa/xato bo'lsa — eski sahifalab yo'l: ~10-12 so'rov x 4-6 s (t2-paket-oqish.ts:2-4). Paket `no-store` (obyekt-paket.ts:15) — har ochilishda to'liq RPC |
| Fakt (FaktNative.tsx) | useT2Daraxt (paket) + obyektlar kesh | Yozishdan keyin qisman yangilash (useT2Daraxt.ts:195-250) — yaxshi dizayn |
| F2 tayyorlash (F2TayyorlashNative.tsx) | paket (:36) yoki 2 ta (daraxt+holat :39); obyektlar (:227); akt (:248), akt_qator (:250); qoralama hajmlari (:269); `useUstamaliSumma` -> nakrutka (:492); **raw_snapshot** o'qish (:451, limit 200) | `raw_snapshot` — 27 MB og'ir ustun [O]; ketma-ket effektlar (akt -> qoralama -> raw_snapshot) waterfall |
| F2 tarix (F2TarixNative.tsx) | Promise.all: akt_reestr + f2 tafsilot + **to'liq t2_daraxt** (:210-213), kompaniya (:116), obyektlar (:197, **keshsiz**) | Paket o'rniga to'liq daraxt; akt_reestr view o'rt. 995 ms, max 28 s [O] |
| Nakopitelniy / Forma-3 (NakopitelniyVedomost.tsx) | `t2_nakopitelniy_v2` sahifalab (1060 chaq. x 2,5 s, jami 2663 s [O]), shartnomalar, obyektlar (kesh) | F3 eksportida qayta yuklash; nakrutka KPI |
| M-29 (M29Native.tsx:41) | obyekt_jami (**keshsiz**) + yukla() | keshni chetlab o'tadi |
| AOSR (test02/TestAosr.tsx:124) | obyekt_jami (**keshsiz**), coverage, kontragentlar | — |
| Zayavka/ombor (TestZayavka.tsx:103) | obyekt_jami (**keshsiz**), zayavkalar | — |
| Rahbar paneli (DirektorPult.tsx -> t2-rahbar-pult.ts:95) | 1 RPC `rahbar_pult_v1` (t2_obyekt_kesh "tayyor hisob"), staleTime 60 s | Yaxshi. Lekin BossDashboard/TestObyektlar boshqa `rahbar_panel_v1` (og'ir) ni chaqiradi |
| Qarzdorlik (Qarzdorlik.tsx:292) | `qarzdorlikRoyxatOl` bitta | [T] RPC xarajati o'lchanmadi |

Keshsiz `sbT2ObyektlarOlKomp` chaqiruvchilari (36): F2TarixNative:197, M29Native:41, TestAosr:124, TestZayavka:103, TestObyektlar:94/146/173, TestF2:147, TestFakt:25, TestShartnoma:56, ShartnomaLiniya:64, NakrutkaNative:390, BoshqaruvPanel:445, CommandPalette:32, hooks.ts:180, t2-f2-reestr.ts:32 va b. [K].

## 2. Baza [O]
### 2.1 pg_stat_statements — TOP 20 (jami vaqt; 2026-10-02 dan)
| # | So'rov (qisqartirilgan) | chaq. | jami s | o'rt ms | max ms |
|---|---|---|---|---|---|
| 1 | PostgREST: `t2_obyekt_jami` WHERE kompaniya_id=$ | 2685 | 9873 | 3677 | 29714 |
| 2 | RPC `t2_nakopitelniy_v2` | 1060 | 2663 | 2512 | 29272 |
| 3 | RPC `t2_mindmap_grafi_v4` | 351 | 2241 | 6385 | 29619 |
| 4 | RPC `t2_obyekt_nakrutka_v1` | 6783 | 2097 | 309 | 24667 |
| 5 | `t2_qator_holat` WHERE obyekt_id (sahifalab) | 216 | 1546 | 7159 | 22241 |
| 6 | RPC `t2_f2_versiya_kochirma_v1` (yozuvchi) | 233 | 1485 | 6375 | 29825 |
| 7 | RPC `t2_rahbar_panel_v1` | 98 | 1378 | 14058 | 29103 |
| 8 | `t2_qator_holat` (ustunli, tur/kod..) | 1935 | 1217 | 629 | 8912 |
| 9 | RPC `t2_men_v1` (authority) | 16516 | 1130 | 68 | 12591 |
| 10 | `select row_to_json(x) from t2_akt_qator order by ctid limit/offset` (zaxira skripti) | 9 | 1090 | 121139 | 942095 |
| 11 | `select snapshot.kunlik()` | 19 | 1041 | 54772 | 98422 |
| 12 | RPC `t2_object_financials_v1` | 194 | 972 | 5012 | 28415 |
| 13 | `t2_qator_muhr_farq` WHERE obyekt_id (view) | 196 | 955 | 4871 | 29702 |
| 14 | RPC `t2_platforma_narx_manba_yoz_v1` | 177 | 941 | 5317 | 26913 |
| 15 | `t2_qator_muhr_farq` (ustunli) | 182 | 764 | 4199 | 28249 |
| 16 | `t2_qator_holat` WHERE obyekt_id | 328 | 746 | 2274 | 18727 |
| 17 | `t2_qator_holat` (ustunli) | 2140 | 740 | 346 | 18393 |
| 18 | `t2_platforma_narx_manba` | 139 | 721 | 5187 | 23714 |
| 19 | `t2_akt_reestr` WHERE obyekt_id | 690 | 687 | 995 | 28203 |
| 20 | `t2_daraxt` (ustunli) | 4123 | 536 | 130 | 7212 |
Izoh: #10 — OFFSET sahifalash O(n^2), bitta ishga tushishda 942 s (zaxira/eksport skripti; jonli foydalanuvchiga ta'sir yo'q, lekin bazani band qiladi). Keyset (`id > $last`) ga o'tkazish kerak (dieta hujjati ham aytgan: docs/architecture/SUPABASE_DIETA_2026-11.md §5).

### 2.2 Eng katta jadvallar (public, jami = heap+indeks+toast)
t2_qator 117 MB (heap 71, idx 46; 139,8k qator, 21k o'lik) · t2_qator_muhr 66 MB (heap 49, idx 17) · t2_akt_qator 57 MB (heap 44, idx 13; raw_snapshot 27 MB) · t2_onboarding_command_log 12 MB (4,5k qator!) · t2_signal 11 MB · t2_smeta_versiya_pozitsiya 9 MB · **t2_smeta_revision 8,9 MB (22 qator, toast 8,7 MB)** · t2_ozgarish 8,5 MB · t2_f2_import_draft_qator 8,4 MB · t2_addrepl_command 6,4 MB. snapshot sxemasi: bolak_mazmun 77 MB (1778 qator), obyekt_snapshot 3,7 MB.

### 2.3 Seq scan (jadval > 5000 qator)
| Jadval | seq_scan | seq_tup_read | idx_scan | o'lik |
|---|---|---|---|---|
| t2_qator | 2452 | 254 mln | 208 mln | 21 385 |
| t2_akt_qator | 4142 | 133 mln | 200 mln | 4 880 |
| t2_qator_muhr | 387 | 29 mln | 2,05 mln | 96 |
| t2_ozgarish | 121 | 11,6 mln | 121k | 1 233 |
| t2_audit_log | 658 | 3,2 mln | 1301 | 857 |
t2_qator: har seq scan o'rtacha ~104k qator = deyarli butun jadval; t2_akt_qator ~32k. Manba aniqlanmadi (view/RPC ichki yoki zaxira skripti) [T].

### 2.4 Ishlatilmaydigan indekslar (idx_scan=0, unique/PK emas)
Katta emas: eng kattasi t2_qator_paket_manba_idx 520 kB, t2_ozgarish_kutayotgan_idx 336 kB; qolgani <=48 kB. Umumiy tejash < 1 MB — indeks tozalash joy uchun foydasiz. (Dieta hujjatida t2_qator indekslari ro'yxati bor.) Eslatma: stat reset 2026-10-02 dan, kam ishlatiladigan indekslar bo'lishi mumkin.

### 2.5 get_advisors (performance)
Faqat 1 tur: `unindexed_foreign_keys` — 193 ta (INFO) [O]; masalan t2_qator.almashtirgan_versiya_id_fkey, t2_qator_muhr.sovuq_id_fkey. Shu bilan birga `unused_index`, `auth_rls_initplan`, `no_primary_key` (t2_qator_kat_bak_*, t2_tmp_eq_lot1 kabi bak/tmp jadvallar) ro'yxatda. Katta jadvallardagi FK indekslarini qo'shish — yozishni sekinlashtiradi va joy oladi (t2_baza_gigiyena_v1 ataylab ba'zilarini qo'shgan). Bak/tmp jadvallar jami < 0,5 MB [O] — tozalash joy uchun ahamiyatsiz.

## 3. EXPLAIN (ANALYZE'siz) — obyekt 153 (eng katta, 26 479 qator) [O]
- `select * from t2_qator_holat where obyekt_id=153`: reja narxi **866 944** (rows 26 313). Seq scan YO'Q (t2_qator_komp_idx, t2_qator_replaces_line_ix, t2_akt_qator_qator_idx indekslari), lekin: (a) `t2_qator` o'ziga 2 marta Hash Left Join (self-join `z` — 19 735 qator filtr: `ANY(id = hashed SubPlan 13) OR ANY(ota_id = hashed SubPlan 14)`); (b) har qator uchun Nested Loop Left Join LATERAL `t2_akt_qator` + `t2_akt` (26k x indeks skan; narx 247 823); (c) Memoize + yana per-qator LATERAL ota qator uchun akt_qator/akt; (d) **6 ta correlated SubPlan** (SubPlan 2,4,6,8,10,12) — har biri har qatorga `t2_qator_replaces_line_ix` Index Scan (narx ~307, filtr `change_type='REPLACEMENT'`). Ya'ni per-qator nested loop yuki, butun obyekt uchun yuzlab ming indeks qidiruvi. Aniq vaqt [T] (ANALYZE ishlatilmadi).
- `select * from t2_obyekt_jami where kompaniya_id=(obyekt 153 kompaniyasi)`: **38 obyekt**, reja narxi **254 865**: har obyekt uchun LATERAL agregat butun `t2_qator` (obyekt_id bo'yicha) + `Hash Left Join` ota/bola — ya'ni ro'yxatni ochish = kompaniyaning BARCHA qatorlarini (~140k) qayta hisoblash. Seq scan t2_obyekt (38 qator) — arzon. Muammo: hisob view ichida, har so'rovda [O: view ta'rifi `LEFT JOIN LATERAL (select count(*), sum(q.summa) FILTER..., count(DISTINCT ROW(...)))`].
- RPC'lar (`t2_obyekt_paket_v1` 9,9 KB, `t2_rahbar_panel_v1` 24 KB, `t2_mindmap_grafi_v4` 8,9 KB, `t2_nakopitelniy_v2` 14 KB): funksiya ichi EXPLAIN bilan ko'rinmaydi (auto_explain yo'q) — **o'lchanmadi**. t2_obyekt_paket_v1 `t2_qator_holat` view'ni `h.id = q.id and h.obyekt_id = p_obyekt_id` bilan qayta ishlatadi (yuqoridagi reja shu).
- Mavjud yengillashtirish: `t2_obyekt_kesh` (38 qator, ustunlar: obyekt_id, kompaniya_id, smeta, fakt, f2, f2_qoralama, f2_oy, hisoblandi, hisob_ms; oxirgi yangilanish bugun 09:08 UTC [O]) — direktor pulti (rahbar_pult_v1) uchun ishlaydi; obyekt_jami (qator_soni/razdel/ish/resurs/narxsiz/chel/mash/mat/ob) uchun emas.

## 4. Frontend
- Entry (main.tsx -> App.tsx): `KirishSahifa`, `QoshilSahifa`, `TaklifSahifa`, `UlashSahifa`, `SahifaTopilmadi`, Toast, Tasdiq statik import (App.tsx:3-13). Toast.tsx, Tasdiq.tsx, KirishSahifa.tsx `framer-motion` ni statik import qiladi -> framer-motion (paket 5,9 MB diskda, min+gzip taxminan 35-45 KB [T]) asosiy bo'lakka tushadi. Boshqa og'ir kutubxonalar: recharts faqat sahifa komponentlarida (lazy ichida), leaflet — `lazy` (TestObyektlar.tsx:22-23), xlsx statik faqat `lib/smeta-anatomiya/korpus/oqish.ts` (uni hech kim import qilmaydi), exceljs/jspdf/pdfjs — dinamik import (28 joy) [K].
- vite.config.ts da `build.rollupOptions/manualChunks` YO'Q — Vite sukutiga tayanadi; `frontend/dist` yo'q, build qilinmadi, bo'lak hajmlari [T].
- `three`, `@react-three/*` package.json da (dependencies) bor, lekin src da import yo'q [K] — bundleni emas, install/CI'ni og'irlashtiradi.
- Virtualizatsiya BOR: SmetaTree.tsx:241 (Holat/Fakt daraxti), F2V3Workbench.tsx:478-480, EstimateOutline.tsx:64. YO'Q: FaktJurnal.tsx, NakopitelniyVedomost.tsx (5000 qator limit sahifasi), F2TarixNative.tsx, TestAosr.tsx jadvallari (map orqali to'liq render) [K] — minglab qator bo'lsa DOM og'ir [T].
- Qayta render: HolatNative.tsx 506 qator, ko'p `useState` + `useEffect`; F2TayyorlashNative.tsx 1305 qator, 56 useMemo/useCallback. `useT2ObyektlarRoyxati` (t2-obyektlar-kesh.ts:48-72) har sahifa uchun `setHolat` bilan alohida holat — React Query `useQuery` o'rniga qo'lda: bir obyekt ro'yxati o'zgarsa hamma sahifa qayta renderlanadi [K, taxmin].

## 5. Baza hajmi — joy bo'shatish (TOP 5) [O; tejash — taxmin]
| # | Nima | Hozir | Taxminiy tejash | Yo'l |
|---|---|---|---|---|
| 1 | snapshot.bolak_mazmun (1778 qator) | 77 MB | 40-60 MB (eski snapshotlar) | R2 ga sovutish allaqachon bor (`sovutish.ts`, dieta §1); issiq oxirgi snapshotlar qoladi. Eski chunklarni R2 ga ko'chirib bazadan olib tashlash siyosatini tekshirish |
| 2 | t2_qator_muhr (INSERT-ONLY, 141k) | 66 MB | 40-55 MB | Obyekt bo'yicha gzip JSON -> R2, bazada faqat ochiq muhrlar (dieta §4) — katta ADR, `t2_qator_muhr_farq` view ta'siri |
| 3 | t2_akt_qator.raw_snapshot (48 493 qatorda, jami 27 MB [O]) | 27 MB | 15-25 MB | R2 ga yoki import tugagach NULL; F2TayyorlashNative.tsx:451 o'qiydi — avval o'quvchilar |
| 4 | t2_smeta_revision (22 qator, toast 8,7 MB) + t2_onboarding_command_log (12 MB, 4,5k qator, ~10 MB `eski_qatorlar`) | 21 MB | 12-17 MB | Revision payload -> R2; `t2_dieta_log_kompakt_v1(7,false)` (dieta migratsiyasi) |
| 5 | t2_qator bloat (21k o'lik = ~15% heap) + indeks 46 MB; muhr/akt_qator | ~117 MB | 10-15 MB | VACUUM FULL/pg_repack tunda; 2 indeksni partial qilish ~8 MB |
Izoh: WAL 128 MB (pg_ls_waldir) DB hajmiga kirmaydi. Bak/tmp jadvallar < 0,5 MB — ahamiyatsiz. Dieta migratsiyasi `20261212100000_t2_supabase_dieta_v1` prodda yo'q ekani hujjatda aytilgan [K]; schema_migrations da tezlik/kesh migratsiyalaridan oxirgisi 20261203001600 [O].

## 6. TAKLIF
### P0 — foydalanuvchi sezadigan sekinlik / to'lib qolish xavfi
| # | Ish | Fayl/RPC/indeks | Foyda | Xavf | Hajm |
|---|---|---|---|---|---|
| P0-1 | `sbT2ObyektlarOlKomp` ni hamma sahifada `obyektlarKeshdan`/`useT2ObyektlarRoyxati` orqali o'tkazish (36 joy); kamida `sbT2ObyektlarOl` ni `birlash()` + 60 s kesh bilan o'rash | api/supabase.ts:290-300,605; F2TarixNative:197, M29Native:41, TestAosr:124, TestZayavka:103, TestF2:147 | #1 yuk (9873 s) keskin kamayadi; har sahifa ochilishida ~3,7 s tejaladi | Past (60 s eskirgan ro'yxat; yozishdan keyin `majburiy` yangilash bor) | S |
| P0-2 | `t2_obyekt_jami` ni qayta hisoblamaslik: qator_soni/razdel/ish/resurs/narxsiz/jami/chel/mash/mat/ob ni `t2_obyekt_kesh` kabi tayyor jadvalga (mavjud `_t2_kesh_belgila_v1` trigger mexanizmi) yoki view'ni kesh jadvaliga ulash | supabase/migrations (yangi), view t2_obyekt_jami | 254k narxli reja -> indeks bo'yicha 38 qator o'qish; 3,7 s -> ~ms [T] | O'rta: kesh eskirishi/pul bo'yicha ziddiyat (SMETA CONST qoidalari) | M |
| P0-3 | `useRahbarPanel` ni obyektlar ro'yxatida avtomatik fonda chaqirmaslik (yoki `rahbar_pult_v1` kesh yo'liga o'tkazish); 60-120 s server kesh | TestObyektlar.tsx:44, t2-rahbar-panel.ts:127, `rahbar_panel_v1` (o'rt. 14 s, 29 s timeout) | Obyektlar sahifasi bazani 14 s band qilmaydi; timeout kamayadi | Past | S |
| P0-4 | `t2_qator_holat` view: 6 ta correlated SubPlan + per-qator LATERAL akt_qator ni bitta oldindan agregatlangan CTE/JOIN ga | view t2_qator_holat; migratsiya 20261203001600 ustiga | Obyekt 153: narx 867k; paket/holat/nakopitelniy/F2 hammasi shu view'ga tayanadi (jami ~4 s x minglab chaqiruv) | O'rta-yuqori (pul hisobi — acceptance testlar majburiy) | L |
| P0-5 | Zaxira skriptini OFFSET'dan keyset ga o'tkazish; `snapshot.kunlik()` oynasini tunga | `select row_to_json ... order by ctid limit offset` (t2_akt_qator); snapshot.kunlik (54 s o'rt.) | Bazada 942 s lik bitta so'rov, 128 MB WAL va timeout riski | Past | S |
| P0-6 | Joy: 31 MB qoldi — TOP-5 dan avval #4 (t2_smeta_revision toast, onboarding log, ~12-17 MB) + dieta migratsiyasi (~13-17 MB) ni qo'llash, #1 (bolak_mazmun) siyosatini tekshirish | §5 | 500 MB dan qochish | Past-o'rta | M |

### P1
| # | Ish | Fayl | Foyda | Xavf | Hajm |
|---|---|---|---|---|---|
| P1-1 | F2 tarix: to'liq `sbT2DaraxtOl` o'rniga `paketdanDaraxtHolatOl` (1 so'rov) ishlatish | F2TarixNative.tsx:210-213 | 10-12 sahifa -> 1 so'rov | Past | S |
| P1-2 | `t2_nakopitelniy_v2` natijasini mijozda `staleTime` + F3/eksportda bitta to'liq chaqiruv; server keshi | NakopitelniyVedomost.tsx; hujjat-nazorat.ts; RPC | 1060 chaq. x 2,5 s | O'rta | M |
| P1-3 | `t2_akt_reestr` va `t2_qator_muhr_farq` view'larida LATERAL/hisoblarni kesh yoki indeksli yo'l bilan yengillatish | view'lar | o'rt. 1-5 s, max 28 s | O'rta | M |
| P1-4 | `framer-motion` ni entry'dan olish: Toast/Tasdiq/KirishSahifa uchun CSS yoki `LazyMotion`+`domAnimation` (~35 KB dan ~5 KB) | umumiy/ui/Toast.tsx, Tasdiq.tsx, kirish/KirishSahifa.tsx | Birinchi yuklash [T: build bilan tekshirish] | Past | S |
| P1-5 | `t2_obyekt_nakrutka_v1` fan-out (6783 chaq.): obyektlar ro'yxatida bitta paket (`t2NakrutkaOldindan` bor — qamrovni tekshirish) | t2-nakrutka-paket.ts:19-40 | 6783 x 309 ms | Past | S |
| P1-6 | Yangi pg_stat_statements reset + haftalik o'lchash; `sb_sekin_oqish` loglarini ko'rish (sb.ts:1095) | ops | Haqiqiy hozirgi holat | Yo'q | S |
| P1-7 | `t2_men_v1` sovuq isolate qo'shimcha so'rovi: imzolangan cookie'ga authority snapshot kiritish yoki KV kesh | role-authority.ts:41 | Sovuq startda 1-2 ketma-ket so'rov kamayadi | O'rta (ruxsat darhol bekor bo'lishi) | M |

### P2
- Katta jadval virtualizatsiyasi: Nakopitelniy/FaktJurnal/F2Tarix/Aosr (`@tanstack/react-virtual` allaqachon bor). S-M.
- `useT2ObyektlarRoyxati` ni `useQuery` ga ko'chirish (qo'lda `useState`/`useEffect` o'rniga). S.
- `three`, `@react-three/*`, `pdf-parse` kabi ishlatilmaydigan bog'liqliklarni tekshirib olib tashlash (CI/install). S.
- 193 FK indeksi: faqat jonli so'rovlarda ishlatiladiganlarga (t2_qator_almashtirgan_versiya_id va b.) — hajm ~ qo'shish bilan juda ehtiyotkor. M.
- `manualChunks` (recharts/react-query/router vendor bo'laklari) kesh uchun. S.

### Birinchi 5 ta ish (tartib bilan)
1. P0-1 — keshsiz obyekt ro'yxati chaqiruvlarini bitta kesh yo'liga (kichik, tez, eng katta yuk).
2. P0-3 — obyektlar sahifasidan `rahbar_panel_v1` fon chaqiruvini olib tashlash/keshlash.
3. P0-6 — joy: onboarding log + t2_smeta_revision + dieta migratsiyasi (31 MB zaxira uchun).
4. P0-5 — OFFSET zaxira skripti -> keyset, snapshot.kunlik tunda.
5. P0-2 — `t2_obyekt_jami` ni tayyor jadvalga (asosiy arxitektura yechimi); undan keyin P0-4 (`t2_qator_holat` qayta yozish) acceptance testlar bilan.
