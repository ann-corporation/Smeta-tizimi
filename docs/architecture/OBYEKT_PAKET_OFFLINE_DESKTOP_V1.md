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
### 1.1 Reviziya
- `t2_obyekt_rev(obyekt_id pk, rev, meta_rev, toliq_rev, min_rev, oxirgi_txid xid8, yangilandi)`.
- `t2_obyekt_ozgarish(obyekt_id, qator_id, qator_rev, holat_rev, ochirildi, vaqt, pk(obyekt_id,qator_id))` — faqat upsert (qator soni bilan cheklangan, ~60 B/qator).
- `_t2_rev_oshir(obyekt_id)`: tranzaksiyaga bitta rev (`oxirgi_txid = pg_current_xact_id()` bo'lsa qayta ishlatadi).
- Statement-level triggerlar (transition table):
  - `t2_qator` I/U/D — UPDATE da faqat `versiya` o'zgarganlar (`t2_versiya_oshir` faqat haqiqiy o'zgarishda oshiradi); DELETE → `ochirildi`.
  - `t2_akt_qator` I/U/D → tegishli `qator_id` + BL_NORMA bolalari (`tur='rs' and norma is not null and ota_id = any(ids)`) uchun `holat_rev`.
  - `t2_akt` UPDATE OF holat, lifecycle_status → aktning barcha qatorlari `holat_rev`.
  - Meta jadvallar (`t2_obyekt`, `t2_nakrutka*`, nakrutka manbalari, `t2_shartnoma_bog`, `t2_smeta_versiya`) → `meta_rev`.
  - >5000 qatorli statement → `_t2_rev_toliq(obyekt)` (`toliq_rev = rev`).
- Triggerni chetlab o'tadiganlar `_t2_rev_toliq` ni o'zi chaqiradi: `snapshot.qaytar` (replica rejim), `t2_smeta_versiya_faollashtir_v1`.
- Saqlash: pg_cron kunlik — 30 kundan eski tombstone'lar o'chiriladi, `min_rev` oshiriladi. Backfill: har obyektga bitta `t2_obyekt_rev` qatori.

### 1.2 Paket RPC
`t2_obyekt_paket_v1(p_obyekt_id, p_actor_id) returns jsonb` — stable security definer, `t2_actor_kompaniya_azo_tekshir`, faqat `service_role`, faqat `faol` versiya. Ustunli JSON:
```json
{ "format":"t2-paket/1", "obyekt_id":0, "kompaniya_id":0, "rev":0, "meta_rev":0, "toliq_rev":0, "soni":0,
  "lugat": { "nom":[], "kod":[], "birlik":[], "tur":["rz","bl","rs","mat","ob"], "kat":[] },
  "q": { "id":[], "ota_id":[], "daraja":[], "tartib":[], "tur":[], "kat":[], "kod":[], "nom":[], "birlik":[],
         "hajm":[], "narx":[], "summa":[], "norma":[], "narx_usul":[], "versiya":[], "qoshimcha":[], "zamena":[], "xom_qator":{} },
  "h": { "fakt_hajm":[], "fakt_summa":[], "f2_hajm":[], "f2_summa":[], "f2_summa_nomalum":[], "direct_fakt_hajm":[],
         "fakt_manbasi":[], "almashtirilgan_hajm":{}, "almashtirilgan_summa":{} },
  "f2": [ {"akt_id":0, "raqam":"", "oy":"", "holat":"", "lifecycle_status":"", "versiya":0, "hujjat_jami":0, "muhr_xesh":""} ],
  "meta": { "podval":{}, "koeffitsientlar":{}, "nk_manba":"", "cats":{}, "cats_kaskad":{}, "svod_yaxlit":[], "versiyalar":[] } }
```
- Hosila ustunlar yuborilmaydi (smeta_*, qoldiq_*, f2_mumkin_*, f2_narx, fakt_narx, f2_narx_farq_foiz) — mijoz yadrosi hisoblaydi.
- Lug'atlar SQL'da `dense_rank()`; `array_agg(... order by tartib, id)`; bitta so'rov (`t2_qator` ⋈ `t2_qator_holat`), eng katta obyekt ~1,0–1,3 s sovuq.
- Yo'ldosh: `t2_obyekt_rev_v1(p_obyekt_id, p_actor_id)` → `{rev, meta_rev, toliq_rev, min_rev}` (arzon probe).

### 1.3 Delta RPC
`t2_obyekt_ozgarish_v1(p_obyekt_id, p_actor_id, p_dan_rev)`: `p_dan_rev < greatest(min_rev, toliq_rev)` yoki >5000 o'zgarish → `{toliq_kerak:true, rev}`; aks holda `{rev, meta_rev, q, h, ochirilgan:[ids], meta?}` (paket bilan bir xil ustun shakli).

### 1.4 Shlyuz
`frontend/functions/api/obyekt-paket.ts`: `GET ?obyekt_id=&rev_faqat=1` (probe) | `?obyekt_id=` (paket) | `?obyekt_id=&dan_rev=` (delta).
- Auth/tenant `sb.ts` bilan bir xil (`tekshir` → `roleAuthority` → `otaKompaniyasi`); `otaKompaniyasi*` → `functions/_shared/ota-kompaniya.ts`. `p_actor_id` doim sessiyadan.
- Function ichida JSON parse YO'Q — `new Response(upstream.body)` oqim bilan.
- R2 kesh (`R2_KESH` binding, kanonik bucket emas): `paket/{kompaniya_id}/{obyekt_id}/{rev}.{meta_rev}.json.gz`; miss'da `tee()` + `CompressionStream`; ETag `"rev.meta_rev"`, 304.
- PostgREST'ga `Accept-Encoding: gzip` (tekshirish).

### 1.5 Hajm (26k qator)
~3,5–4,5 MB xom (bugun ~16 MB), gzip ~0,7–1,0 MB; tahrirdan keyingi delta 1–50 KB. Binar format foyda bermaydi — ustunli JSON.

### 1.6 Free tarifga sig'ish
`t2_obyekt_ozgarish` ~20 MB bilan cheklangan; egress har yangi rev ~1 MB (R2 kesh bilan takroriy ochilish bazaga tushmaydi).
PR1b: `t2_obyekt_jami_kesh(obyekt_id pk, rev, …)` + pg_cron 60 s; view `LEFT JOIN kesh … AND k.rev = r.rev`, jonli LATERAL faqat eskirganlar uchun (EXPLAIN bilan tasdiqlash); ustunlar tartibi o'zgarmaydi.

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
- **PR1** — `20261116000000_t2_obyekt_rev_v1`, `20261116100000_t2_obyekt_paket_v1` (+rollback/acceptance); `snapshot.qaytar` va versiya faollashtirish `_t2_rev_toliq`; `functions/api/obyekt-paket.ts` + test, `_shared/ota-kompaniya.ts`; `R2_KESH`; `src/api/t2-obyekt-paket.ts`, `src/ombor/paket.ts` + test. Qabul: dekod qilingan paket = `t2_daraxt` + `t2_qator_holat` (EXCEPT ikki tomonga) barcha obyektlarda; tranzaksiyaga bitta rev, no-op UPDATE oshirmaydi; eng katta obyekt ≤1,5 s sovuq, ≤0,5 s R2'dan, ≤1,2 MB, Supabase'ga 1 so'rov.
- **PR1b** — `t2_obyekt_jami` kesh. Qabul: EXCEPT 0; ro'yxat <150 ms.
- **PR2** — mijoz ombori bayroq ostida. Qabul: 26k obyekt ikkinchi ochilish <300 ms; bayroq o'chiq = aynan avvalgidek.
- **PR3** — delta sinxron + qolgan 13 o'quvchi. Qabul: fakt saqlangach ≤0,5 s, <20 KB; ikki tab/ikki foydalanuvchi yaqinlashadi.
- **PR4** — worker qayta hisob. Qabul: 26k qatorda ≤50 ms; jamilar server bilan tiyinigacha teng.
- **PR5** — buyruqlar, navbat, oflayn (`t2_buyruq_jurnal`, `t2_qator_tahrir_v2`, `t2_fakt_belgila_v3`, `buyruqlar` batch, sw.js). Qabul: samolyot rejimida 20 tahrir + 5 fakt → har biri bir marta; F2 tasdiqlash oflayn o'chiq.
- **PR6** — Tauri qobig'i. **PR7** — litsenziya. **PR8** — shifrlangan norma katalogi. **PR9** — kod imzosi.

## 7. Xavflar va egasi qarorlari
1. Narx modeli (obuna / bir martalik) — hal qilinmagan; tavsiya: gibrid (doimiy litsenziya + yillik xizmat obunasi: sinxron, AI, F2 tasdiqlash).
2. Kod imzosi narxi (OV ~$200–500/yil, bulut imzolovchi talab qilinadi).
3. Free tarifda egress birinchi devor bo'lishi mumkin — Supabase Usage sahifasini tekshirish; PR1 + R2 buni hal qiladi.
4. Mijoz/server formula siljishi (`holat.ts`) — paritet testlari va sinxrondan keyingi solishtirish majburiy; farqda server ustun.
5. Issiq jadvallardagi triggerlar — PR1 da o'lchash; >5000 qator → `toliq_rev`.
6. Norma katalogini UI orqali nusxalash mumkin — qabul qilinadi yoki premium narxlar faqat serverda.
7. Oflayn F2 import — moslash dvigateli mijozda qolsa ishlaydi (kod ochiq), serverga ko'chsa oflayn yo'qoladi.
