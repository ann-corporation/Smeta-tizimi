# Obyekt paketi, oflayn va Windows dastur — arxitektura v1 (ADR)

Holat: QABUL QILINGAN (egasi 2026-10-30/31: bitta kod web+Windows (Tauri), tijoriy sotuv, oflayn juda muhim, kod/ma'lumot himoyasi; baza hozircha Supabase Sidney, Free tarif).
Maqsad: Construct 2 darajasidagi "bir zumda" ishlash, bitta hisob yadrosi (`frontend/src/lib/hisob-yadro/`) ustida.

## 0. Bugungi holat (o'lchangan)
- Ekran ochilishi butun obyektni 2 marta oladi: `useT2Daraxt.ts` → `sbT2DaraxtOl` + `sbT2QatorHolatOl` → `t2ToliqOqiParallel` (2 probe + 6 oyna) → `/api/sb` (har biri 20 tagacha PostgREST sahifa, birinchisida `count=exact`). Har so'rov ~0,35 s (Yevropa edge ↔ Sidney).
- ~15 boshqa fayl ham butun o'qishni takrorlaydi (F2Tayyorlash, F2Tarix, F2ImportV3, ResursVedomost, M29, NarxDalil, SmetaNarxlashRes, AdditionalReplacement, `lib/smeta-model.ts`, `api/f2-oylik-paket.ts`, `components/boss-decision/report.ts` …).
- Holat og'ir view'da jonli hisoblanadi (`t2_qator_holat`); ota summalar `t2_rollup` da saqlanadi.
- `qator_tahrir` da `operation_id` yo'q; `t2_fakt_belgila_v2` FAKT_CONFLICT ni operation_id dedupe'dan OLDIN tekshiradi (yo'qolgan javobni qayta yuborish soxta ziddiyat beradi).
- `_shared/navbat.ts` (idb-keyval) eski GAS navbati — almashtiriladi.
- `t2_obyekt_jami` — bazaning №1 iste'molchisi.
- Cheklovlar: Cloudflare Function free = 10 ms CPU (katta JSON'ni parse qilmaslik, oqim bilan uzatish); Supabase free = 500 MB DB, **5 GB/oy egress**, nano compute. Bugun bitta ochilish ~16 MB JSON → egress birinchi devor bo'lishi mumkin.
- Nom to'qnashuvi: `snapshot.*` — kunlik zaxira sxemasi. Yangi o'qish modeli **obyekt paketi** (`t2_obyekt_paket_v1`) deb ataladi.

## 1. Obyekt paketi va reviziyalar
> **Ko'rib chiqishdan keyingi reja (2026-10-31).** Dastlabki PR1 (obyektga bitta qulflanadigan `t2_obyekt_rev` qatori + issiq jadvallarda triggerlar + matn-langar bilan funksiya yamash + R2) bitta PR sifatida BLOKLANDI: obyekt qatorini tranzaksiya oxirigacha qulflash yangi deadlock va navbat beradi, mavjud bo'lmagan bucket'ga binding Pages deployni buzadi, matn yamog'i mo'rt. Endi bosqichma-bosqich (§6): PR1a — triggersiz paket; PR1b — triggersiz kompozit ETag; PR1c — R2; PR3 — qulfsiz xid8 jurnal. **Obyektga bitta hisoblagich qatori chiqarilmaydi.** Dastlabki ish `claude/obyekt-rev-wip` branchida tarix sifatida saqlangan.

### 1.1 Reviziya va ETag (PR1b — triggersiz)
- Hech qanday trigger yo'q. ETag — kompozit muhr, so'rov vaqtida hisoblanadi (bitta indeksli o'qish, paket tanasini yig'masdan):
  `md5(format_tuzi || t2_qator(obyekt, faol): count, sum(versiya), max(id), sum(id) || t2_akt_qator(obyekt): count, sum(versiya), max(id), sum(id) || t2_akt(obyekt): count, sum(versiya), max(id), sum(id) || md5(meta))`.
- `format_tuzi` (masalan `t2-paket/1`) — paket shakli yoki hosila qoidasi o'zgarsa, eski ETag/kesh avtomatik yaroqsiz.
- `versiya` ustunlari `t2_versiya_oshir` bilan faqat haqiqiy o'zgarishda oshadi — no-op UPDATE muhrni o'zgartirmaydi; INSERT/DELETE count/sum(id) ni o'zgartiradi.
- Meta muhri: `t2_obyekt_nakrutka_v1` natijasi, faol podval, svod yaxlit va versiyalar ro'yxatining md5'i (paketdagi `meta` bilan bir manba).
- Qabul: muhr = paket tanasi o'zgarganda o'zgaradi (sintetik: qator/fakt/F2/meta har biri), o'zgarmaganda teng; EXPLAIN bilan eng katta obyektda < 50 ms.

### 1.2 Paket RPC (PR1a)
`t2_obyekt_paket_v1(p_obyekt_id, p_actor_id) returns json` — **`json`, jsonb emas** (massivlar bo'sh joysiz chiqadi: 26k qatorli obyektda 2,89 MB va 3,53 MB). Stable security definer, `t2_actor_kompaniya_azo_tekshir`, faqat `service_role`, faqat `faol` versiya. Ustunli JSON (PR1a da rev maydonlari YO'Q):
```json
{ "format":"t2-paket/1", "obyekt_id":0, "obyekt_nom":"", "kompaniya_id":0, "soni":0,
  "lugat": { "nom":[], "kod":[], "birlik":[], "tur":["rz","bl","rs","mat","ob"], "kat":[] },
  "q": { "id":[], "ota_id":[], "daraja":[], "tartib":[], "tur":[], "kat":[], "kod":[], "nom":[], "birlik":[],
         "hajm":[], "narx":[], "summa":[], "norma":[], "narx_usul":[], "versiya":[], "qoshimcha":[], "zamena":[], "xom_qator":{} },
  "h": { "fakt_hajm":[], "fakt_summa":[], "f2_hajm":[], "f2_summa":[], "f2_summa_nomalum":[], "direct_fakt_hajm":[],
         "fakt_manbasi":[], "almashtirilgan_hajm":{}, "almashtirilgan_summa":{} },
  "f2": [ {"akt_id":0, "raqam":"", "oy":"", "holat":"", "lifecycle_status":"", "versiya":0, "hujjat_jami":0, "muhr_xesh":""} ],
  "meta": { "podval":{}, "koeffitsientlar":{}, "nk_manba":"", "shartnoma_id":0, "nakrutka_podval_id":0, "cats":{}, "cats_kaskad":{},
            "svod_yaxlit":[], "svod_yaxlit_jami":{}, "versiyalar":[] } }
```
- Kodlash: massivlar `tartib, id` bo'yicha; NULL — `null` (0 emas); `q.tur/nom/kod/birlik/kat` — lug'at indeksi (`row_number() - 1`, null — null); `qoshimcha/zamena/fakt_manbasi` — 0/1 (`fakt_manbasi` 1 = BL_NORMA); `xom_qator`, `almashtirilgan_*` — siyrak `{id: qiymat}` (yo'q kalit: null / 0 / 0). `muhr_xesh` = akt qatorlari `id:versiya` md5'i.
- **`tur` qat'iy:** lug'atda yo'q tur bo'lsa RPC xato beradi, dekoder bo'sh `tur` ni rad etadi (jim null yo'q). Prod'dagi qiymatlar aynan rz/bl/rs/mat/ob (`t2_qator_tur_check`).
- Hosila ustunlar yuborilmaydi (smeta_*, qoldiq_*, f2_mumkin_*, f2_narx, fakt_narx, f2_narx_farq_foiz) — mijoz `t2_qator_holat` formulalari bilan hisoblaydi (PR4 da `hisob-yadro/holat.ts`).
- Holat — aynan `t2_qator_holat` view'idan, meta — `t2_obyekt_nakrutka_v1` dan (parallel formula yo'q).
- O'lchov (prod, issiq, 2026-10-31): 153 (26 475 qator) 1,82 s + meta 0,13 s (≈1,3 s — `t2_qator_holat` LATERAL'lari), 2,89 MB; 151 (11 942) 0,53 s, 1,43 MB; 152 (2 302) ~0,07 s, 0,29 MB. ≤1,5 s maqsadiga 153 yetmaydi — view optimallashtirish alohida (formulani nusxalamasdan).
- Tekshiruv: 34 obyektning hammasida (96 477 faol qator) dekod qilingan paket = `t2_daraxt` va = `t2_qator_holat` (faol; hosila ustunlar mijoz formulasi bilan), EXCEPT ikki tomonga 0.
- Probe RPC PR1a da YO'Q (rev'ga bog'liq edi); PR1b da muhr bilan qaytadi.

### 1.3 Delta (PR3 — qulfsiz xid8 jurnal)
- Obyektga bitta hisoblagich qatori O'RNIGA faqat-qo'shiladigan jurnal: `t2_obyekt_jurnal(id bigserial, obyekt_id, qator_id, tur ('q'|'h'|'meta'|'ochir'), txid xid8 default pg_current_xact_id(), vaqt)` — triggerlar faqat INSERT qiladi (qator qulfi yo'q, navbat yo'q, deadlock yo'q).
- Gorizont: paket/delta javobi `pg_snapshot_xmin(pg_current_snapshot())` ni qaytaradi; keyingi delta `txid >= mijoz_xmin` yozuvlarini oladi (ba'zilari takror — idempotent, chunki delta qator qiymatini to'liq beradi). Kech commit qilingan tranzaksiya yo'qolmaydi.
- `toliq_kerak`: mijoz gorizonti saqlash chegarasidan eski yoki >5000 o'zgarish.
- Triggerni chetlab o'tuvchi `snapshot.qaytar` uchun matn yamog'i EMAS — `snapshot.qaytarish_jurnal` ga AFTER INSERT trigger jurnalga `tur='toliq'` yozadi; versiya faollashtirish oddiy triggerlar bilan qamraladi (>5000 → `toliq`).
- Saqlash: pg_cron kunlik, 30 kundan eski yozuvlar o'chiriladi; issiq jadvallarda yuk import paytida o'lchanadi.

### 1.4 Shlyuz
`frontend/functions/api/obyekt-paket.ts`: PR1a — faqat `GET ?obyekt_id=` (paket). PR1b — ETag/304 (muhr); PR3 — `?dan_xmin=` (delta).
- Auth/tenant `sb.ts` bilan bir xil (`tekshir` → `roleAuthority` → `otaKompaniyasi`); `otaKompaniyasi*` → `functions/_shared/ota-kompaniya.ts`. `p_actor_id` doim sessiyadan.
- Ruxsat: middleware `smeta.read`, shlyuz qo'shimcha `f2.read` + `narx.read` (paket F2 ro'yxati va nakrutkani ham beradi). `permissionsByCompany` yo'q bo'lsa — YOPIQ (503 `AUTHORITY_SCHEMA_REQUIRED`), superadmin bundan mustasno (L2).
- **PR2 uchun (L1):** `f2.read`/`narx.read` bo'lmagan foydalanuvchi 403 oladi — mijoz eski o'qish yo'liga qaytishi shart.
- Function ichida JSON parse YO'Q — `new Response(upstream.body)` oqim bilan; PR1a da `Cache-Control: no-store`, ETag/304 va R2 yo'q.
- PR1c — R2 kesh: bucket avval yaratiladi, keyin `wrangler.toml` binding (mavjud bo'lmagan bucket'ga binding Pages deployni buzadi). Kalit tuzli: `paket/{format_tuzi}/{kompaniya_id}/{obyekt_id}/{muhr}.json.gz`; lifecycle qoidasi (masalan 7 kun); binding'siz ham ishlaydi.

### 1.5 Hajm (26k qator)
2,89 MB xom json (bugun ~16 MB), gzip taxminan 0,5–0,7 MB; tahrirdan keyingi delta 1–50 KB. Binar format foyda bermaydi — ustunli JSON.

### 1.6 Free tarifga sig'ish
PR1a ham egressni ~5 marta kamaytiradi (16 MB → ~2,9 MB, Cloudflare gzip bilan ~0,6 MB). PR1b (304) va PR1c (R2) takroriy ochilishni bazadan oladi. Jurnal (PR3) saqlash muddati bilan cheklangan.
PR1d (avvalgi «PR1b»): `t2_obyekt_jami_kesh` + pg_cron 60 s; view `LEFT JOIN kesh`, jonli LATERAL faqat eskirganlar uchun (EXPLAIN bilan tasdiqlash); ustunlar tartibi o'zgarmaydi.

## 2. Mijoz ombori — `frontend/src/ombor/`
| Fayl | Vazifa |
|---|---|
| `paket.ts` | `Paket`/`Delta` turlari, `paketDekod()` → struct-of-arrays (Int32Array id/ota, Float64Array + null bitmap; NULL ≠ 0), id→index |
| `ombor-idb.ts` | `idb-keyval` `createStore('t2-ombor','v1')`; `paket/{kid}/{uid}/{oid}` → `{rev, meta_rev, iv, bytes}` (fflate gzip + AES-GCM); `navbat/{kid}/{uid}`; LRU 30 obyekt |
| `saqlash.ts` | Saqlash interfeysi (hozir IDB, keyin Tauri) |
| `obyekt-ombor.ts` | Obyektga BITTA xotira modeli (`Map`, LRU 3): `asos` (server tasdiqlagan) + `kutilayotgan` (buyruqlar qatlami); `subscribe/getSnapshot` |
| `useObyekt.ts` | `useObyekt(id, selector)` + moslik adapteri `useT2DaraxtOmbor(id)` (`useT2Daraxt` shakli aynan) |
| `bayroq.ts` | `localStorage['t2.ombor']` / kompaniya sozlamasi; sukut o'chiq |
| `sinxron.ts` | Ochilish/fokus/online/o'z yozuvidan keyin/30 s: probe → delta → paket; `toliq_kerak` → to'liq paket; davr (epoch) himoyasi |
| `hisob.worker.ts`, `hisob-mijoz.ts` | Worker + turli postMessage RPC (`f2v3.worker.ts` namunasi) |
| `buyruq.ts`, `chiquvchi.ts` | Buyruqlar va chiquvchi navbat (§3) |

- `useT2Daraxt.ts` ga bitta qator: `if (omborYoqilgan()) return useT2DaraxtOmbor(obyektId)`.
- Qolgan ~13 to'liq o'quvchi birma-bir `omborOl(obyektId)` ga o'tadi (qator obyektlari rev bo'yicha memo).
- Ochilish: IDB'dan darhol chizish → fonda probe → delta; `serverTasdiq` faqat lokal rev = server rev tasdiqlangandan keyin. Eksport darvozasi (`serverTasdiq`, `qoshimchaHolat`, `selected`) saqlanadi.
- Worker qayta hisob (Construct kabi har tahrirda to'liq, 26k qator < 50 ms): `lib/hisob-yadro/daraxt-yigish.ts` (`t2_rollup` va `t2_qator_tahrir` norma kaskadi bilan teng), `lib/hisob-yadro/holat.ts` (`t2_qator_holat` formulalari) + `holat.paritet.test.ts`. Server qiymati tasdiqlangach doim ustun; optimistik qiymat «taxminiy» belgisi bilan. Sinxrondan keyin jamilar `t2_obyekt_jami`/meta bilan solishtiriladi, farq `/api/xato` ga.
- Buyruq: `{operation_id, tur, obyekt_id, asos_rev, kutilgan:{versiya|fakt_hajm}, yuk, yaratildi, qurilma_id, holat}`. Yangi idempotent `t2_qator_tahrir_v2(p_operation_id)` + `t2_buyruq_jurnal(operation_id pk, kompaniya_id, actor_id, amal, natija, yaratildi)`; `t2_fakt_belgila_v3` (dedupe CAS'dan oldin). Ziddiyat: delta → mine/theirs/base, sukut theirs, mine rad etilgan buyruq sifatida qayta qo'llanadi. Jim last-write-wins yo'q.
- Tasdiqlangan F2 server ustun: `h.f2_*` va `f2[]` faqat serverdan; tasdiqlangan akt eksporti `f2_exact_qatorlar_v1` + `muhr_xesh` bilan.

## 3. Oflayn
- Chiquvchi navbat: obyekt bo'yicha FIFO, IDB (Tauri'da SQLite); `sb-yoz` `amal:'buyruqlar'` (50 tagacha, har biri alohida sub-tranzaksiya); backoff; birinchi ziddiyatda obyekt navbati to'xtaydi; `components/ombor/NavbatPaneli.tsx`; `_shared/navbat.ts` olib tashlanadi.
- Qayta yuborish: online/start'da avval probe → delta, qatlam yangi `asos` ustiga, keyin yuborish; server barcha invariantlarni qayta tekshiradi.
- Web oflayn: `public/sw.js` (app shell; `/api/*` keshlanmaydi).

| Obyekt | Oflayn | Ziddiyat qoidasi |
|---|---|---|
| Smeta qatori tahriri | ✅ navbat | versiya CAS; idempotent v2; 3 tomonlama UI |
| Fakt | ✅ navbat | `expected_fakt_hajm` CAS; target = joriy → muvaffaqiyat |
| F2 qoralama | ✅ lokal | ziddiyatda nusxa, foydalanuvchi birlashtiradi |
| F2 yuborish/tasdiqlash/bekor | ❌ faqat online | server hal qiladi |
| Smeta import, versiya faollashtirish, qo'shimcha/zamena, narxlash | ❌ faqat online | — |
| Eksport (LRV, resurs, smeta) | ✅ lokal rev'dan, «rev N, sinxron sanasi» | tasdiqlangan F2 faqat server akt + xesh |
| AI, Didox, to'lov, token, sklad, M29 | ❌ faqat online | — |
| Keshdagi obyektni ko'rish | ✅ | — |

## 4. Windows dastur (Tauri 2)
- `frontend/src-tauri/` (Cargo.toml, tauri.conf.json, capabilities/default.json — eng kam huquq; src/main.rs, lib.rs, fayl.rs, papka.rs, litsenziya.rs, katalog.rs, maxfiy.rs). Web build lokal paketlanadi (`frontendDist: ../dist`).
- `src/desktop/fetch-shim.ts`: `/api/` → `https://<prod>/api/` + `Authorization: Bearer`; token Windows Credential Manager'da (`keyring`). Server: `_shared/auth.ts` Cookie yoki Bearer; `functions/api/_middleware.ts` CORS faqat `http://tauri.localhost`.
- Saqlash: 1-bosqich IndexedDB (web bilan bir kod); 2-bosqich `rusqlite` + `bundled-sqlcipher` (norma katalogi FTS5, chiquvchi navbat) — `ombor/saqlash.ts` orqali.
- Paketlash: NSIS, `installMode: currentUser`, WebView2 `embedBootstrapper`; CI `tauri-apps/tauri-action` (windows-latest).
- Avto-yangilanish: `tauri-plugin-updater` (o'z kaliti), `functions/api/yangilanish.ts`, artefaktlar R2'da.
- Fayllar: `.smt2` (o'z paketi), xlsx/xls faqat «Open with»; `tauri-plugin-single-instance`; mavjud parserlar (`xlsxReader.worker.ts`, `smeta-package-import.ts`, `lrv-qayta-import.ts`).
- Excel ochish: `tauri-plugin-opener`; papka importi: dialog + `papka_skan(path)` (webda `webkitdirectory`).
- Imzo: `signCommand` tayyor, sertifikat olinguncha bo'sh (SmartScreen «Unknown publisher»).
- Egasi o'rnatadi: rustup (stable MSVC), VS 2022 Build Tools («Desktop development with C++»).

## 5. Xavfsizlik va litsenziya
- Litsenziya: `{litsenziya_id, kompaniya_id, tarif, modullar, qurilma_hash, berildi, lease_tugaydi=+30 kun, muddat_tugaydi, min_versiya}`, Ed25519 (`LITSENZIYA_KALIT` Cloudflare secret), ochiq kalit Rust binar ichida; `litsenziya.rs` Rust buyruqlarini o'zi to'sadi.
- Server: `t2_litsenziya`, `t2_litsenziya_qurilma`; `functions/api/litsenziya.ts` (aktivlash, yangila, bekor).
- Qurilma: `MachineGuid` xeshi + o'rnatish id (Credential Manager). Lease tugasa — faqat o'qish/eksport (ma'lumot qulflanmaydi). Soat orqaga surilsa (>24 soat) — online talab.
- Shifrlangan katalog: SQLCipher, kalit = HKDF(litsenziyadagi katalog kaliti, DPAPI qurilma siri); JS faqat sahifalangan natija oladi (≤500 qator, limit), dump buyrug'i yo'q; litsenziya bo'yicha id-fazo izi (soxta qator emas).
- Halol chegara: JS bundle (hisob-yadro, f2-moslash-v3) har doim chiqarib olinadi; obfuskator hisob-yadro'ga qo'llanmaydi (sekinlik, worker buziladi) — minify, source map'siz. Haqiqiy himoya — server: AI, F2 lifecycle, sinxron, narx katalogi yangilanishi, Didox, R2 hujjatlar, token/billing, litsenziya berish.
- Tenant izolyatsiyasi saqlanadi; R2 va IDB kalitlari kompaniya/foydalanuvchi bo'yicha; chiqishda lokal ombor tozalanadi.

## 6. PR'lar ketma-ketligi (har biri alohida chiqariladi)
- **PR0** — shu ADR + bazaviy o'lchovlar (`api/sb-tezlik-byudjeti.test.ts`): 3 eng katta obyektning ochilish vaqti, bayt, chaqiruvlar soni.
- **PR1a** — paket triggersiz: `20261116400000_t2_obyekt_paket_v1` (+rollback/acceptance; rev'ga bog'liq emas), `functions/api/obyekt-paket.ts` + test (no-store, R2/ETag yo'q, `permissionsByCompany` yo'q — yopiq), `_shared/ota-kompaniya.ts`, `src/api/t2-obyekt-paket.ts`, `src/ombor/paket.ts` + test. `wrangler.toml` o'zgarmaydi. Qabul: dekod qilingan paket = `t2_daraxt` + `t2_qator_holat` (EXCEPT ikki tomonga) BARCHA obyektlarda (read-only skript, obyekt bo'yicha bo'laklab) — 2026-10-31: 34/34 obyekt, 96 477 qator, 0 farq.
- **PR1b** — triggersiz ETag: kompozit muhr (§1.1: `t2_qator`, `t2_akt_qator`, `t2_akt` bo'yicha count/sum(versiya)/max(id)/sum(id) + meta md5, format tuzi), shlyuzda ETag/304. Qabul: har turdagi o'zgarish muhrni o'zgartiradi, no-op o'zgartirmaydi; muhr < 50 ms.
- **PR1c** — R2 kesh: bucket yaratilgandan keyin binding; tuzli kalit, lifecycle; binding'siz ishlaydi. Qabul: takroriy ochilish ≤0,5 s, bazaga paket so'rovi yo'q.
- **PR1d** — `t2_obyekt_jami` kesh (avvalgi «PR1b»). Qabul: EXCEPT 0; ro'yxat <150 ms.
- **PR2** — mijoz ombori bayroq ostida. Qabul: 26k obyekt ikkinchi ochilish <300 ms; bayroq o'chiq = aynan avvalgidek.
- **PR3** — delta: qulfsiz faqat-qo'shiladigan xid8 jurnal + snapshot-xmin gorizonti (§1.3; obyektga bitta hisoblagich qatori CHIQARILMAYDI), `snapshot.qaytarish_jurnal` triggeri (matn yamog'i emas), qolgan 13 o'quvchi. Qabul: fakt saqlangach ≤0,5 s, <20 KB; ikki tab/ikki foydalanuvchi yaqinlashadi; kech commit yo'qolmaydi; 26k import paytida trigger yuki o'lchanadi.
- **PR4** — worker qayta hisob. Qabul: 26k qatorda ≤50 ms; jamilar server bilan tiyinigacha teng.
- **PR5** — buyruqlar, navbat, oflayn (`t2_buyruq_jurnal`, `t2_qator_tahrir_v2`, `t2_fakt_belgila_v3`, `buyruqlar` batch, sw.js). Qabul: samolyot rejimida 20 tahrir + 5 fakt → har biri bir marta; F2 tasdiqlash oflayn o'chiq.
- **PR6** — Tauri qobig'i. **PR7** — litsenziya. **PR8** — shifrlangan norma katalogi. **PR9** — kod imzosi.

## 7. Xavflar va egasi qarorlari
1. Narx modeli (obuna / bir martalik) — hal qilinmagan; tavsiya: gibrid (doimiy litsenziya + yillik xizmat obunasi: sinxron, AI, F2 tasdiqlash).
2. Kod imzosi narxi (OV ~$200–500/yil, bulut imzolovchi talab qilinadi).
3. Free tarifda egress birinchi devor bo'lishi mumkin — Supabase Usage sahifasini tekshirish; PR1a (~5x kam bayt) + PR1b (304) + PR1c (R2) buni hal qiladi.
4. Mijoz/server formula siljishi (`holat.ts`) — paritet testlari va sinxrondan keyingi solishtirish majburiy; farqda server ustun.
5. Issiq jadvallardagi triggerlar — PR1a/PR1b da trigger YO'Q; PR3 jurnali faqat INSERT (qulfsiz), yuk 26k import paytida o'lchanadi; >5000 o'zgarish → `toliq`. Obyektga bitta qulflanadigan hisoblagich qatori (deadlock/navbat xavfi) rad etilgan.
6. Norma katalogini UI orqali nusxalash mumkin — qabul qilinadi yoki premium narxlar faqat serverda.
7. Oflayn F2 import — moslash dvigateli mijozda qolsa ishlaydi (kod ochiq), serverga ko'chsa oflayn yo'qoladi.
