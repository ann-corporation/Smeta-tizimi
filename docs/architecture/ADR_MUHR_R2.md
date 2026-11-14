# ADR: t2_qator_muhr yuklamasi R2 ga (saqlash dietasi)

Holat: TAKLIF (PR, qo'llanmagan). Sana: 2026-11-11. Asos: `docs/architecture/SUPABASE_DIETA_2026-11.md` (branch `claude/supabase-dieta`),
egasi qarori: Supabase FREE (500 MB), qoida — o'zgarmas ma'lumotnoma R2 da (`smeta-tizimi-canonical`), o'zgaruvchan biznes ma'lumot Supabase da.
Migratsiya: `20261212400000_t2_qator_muhr_r2_v1` (+ `.rollback.sql`, `.acceptance.sql`). Naqsh: `snapshot-r2` sovutish (`frontend/src/lib/snapshot-r2/sovuq.ts`).

## 1. Muhr nima (prod o'lchovi, faqat o'qish)

`public.t2_qator_muhr` — SMETA CONST isboti (migratsiya `20261112700000`, egasi 2026-10-27: «bir vergul qo'shilsa ham smetadan o'zgargan
pozitsiya aniq bo'lishi kerak»). Har smeta qatori uchun asl holatning kanonik nusxasi + SHA-256.

| Ko'rsatkich | Qiymat |
|---|---|
| Qatorlar | 141 674 (35 obyekt, 1 kompaniya); yopiq 3 677; `bosqich > 0` hali yo'q (korrektirovka — qoralama) |
| Hajm | 66,3 MB: heap 51,3 + indeks 18,2 (pkey 4,0; `(qator_id,bosqich)` unique 6,3 — 1,87 mln skan; `obyekt_ix` 6,2; `kompaniya_ix` 1,5) |
| Ustunlar | metadata: id, kompaniya_id, obyekt_id, qator_id, bosqich, revision_id, manba, bayroqlar, tekshirilmagan[], muhr (hex 64), asos_vaqt, actor_id, yaratildi, yopildi, yopilish_sabab. **Yuklama** (muhr xeshi qamrab olgan 9 maydon): tur, kod, nom, birlik, kat, ota_id, hajm, narx, norma |
| Yuklama hajmi | matn 12,2 MB + son 2,7 MB = **14,9 MB** (qator o'rtacha 347 B; qolgani qator-overhead, id lar, 65 B hex xesh) |
| Yaxlitlik | `muhr = sha256(kanonik(yuklama))` — 141 674 dan 0 ta nomuvofiq (tekshirildi) |

Ya'ni diet hujjatidagi «≈ 45–55 MB» bahosi faqat yuklamani ko'chirib bo'lmaydi: yuklama jami 15 MB. Haqiqiy tejash §5 da.

## 2. Kim yozadi

- `t2_qator_muhr_ol_v1(obyekt, manba, actor)` (security definer) — yagona yozuvchi: `INSERT` (faqat muhri yo'q qatorlar) va «qator bazada yo'q» ochiq muhrni `yopildi` ga yopish.
  Chaqiruvchilar: `t2_smeta_import_yakunla_v1`, `t2_smeta_paket_import_yakunla_v1` (o'ramlar, import muvaffaqiyatli bo'lgandan keyin), `t2_smeta_versiya_faollashtir_v1`. Xatosi importni yiqitmaydi.
- Bir martalik backfill (migratsiya ichida, bajarilgan). Qoralama `docs/architecture/qoralama/20261113100000_t2_smeta_korrektirovka_v1.draft.sql` `bosqich = N` muhrlarini INSERT qiladi (hali qo'llanmagan; bu ADR bilan mos: yangi qator issiq tug'iladi).
- Trigger `t2_qator_muhr_const_trg`: DELETE rad; UPDATE faqat ochiq muhrni bir marta yopish.

## 3. Kim o'qiydi (to'liq ro'yxat)

Bazada `t2_qator_muhr` ga havola qiladigan yagona obyekt — **view `t2_qator_muhr_farq`** (+ `ol_v1`, trigger — yozuvchilar). `pg_depend`: view'ga bog'liq funksiya/view yo'q.
View'ni o'qiydiganlar:

| O'quvchi | Qanday |
|---|---|
| `frontend/functions/api/sb.ts` (`t2_qator_muhr_farq` ruxsat ro'yxatida) + `_shared/tenant-oqish.ts` (kompaniya_id filtri) | PostgREST proksi, `kompaniya_id` bo'yicha |
| `frontend/src/api/t2-qator-muhr.ts` `qatorMuhrFarqOl(obyektId)` | ustunlar `MUHR_FARQ_USTUNLARI` (avval/endi jsonb, maydonlar, holat…) |
| `lib/qator-muhr/farq.ts`, `umumiy/daraxt/MuhrFarqXulosa.tsx`, `SmetaTree.tsx` | sof belgi/xulosa mantig'i; yozmaydi |
| MCP (`mcp/smeta-mcp`, `mcp/smeta-mcp-remote`) | muhr jadvaliga to'g'ridan-to'g'ri murojaat YO'Q (grep); faqat `sql_oqish` orqali ixtiyoriy |

Muhim kuzatuv: o'quvchilar **faqat «farqi bor» qatorlarni** ko'radi (odatda kam). Yuklamaning o'zi faqat qator o'zgargan/o'chirilgan bo'lgandagina
kerak (avval/endi ko'rsatish uchun). O'zgarmagan qatorning yuklamasiga hech kim murojaat qilmaydi, faqat view uni **solishtiradi**.

## 4. Dizayn

Tanlangan yo'l: **«issiq kalit + xesh bazada, ommaviy yuklama R2 da»** (qator darajasi), butun-satr arxivi R2 da ham saqlanadi (2-bosqich uchun).
Butun qatorni (id, obyekt, manba…) bazadan O'CHIRISH bu ADR da YO'Q — sabab §9.

1. **R2 bloki**: obyekt bo'yicha ≤ 3000 qatorli gzip JSON, kalit `muhr-cold/v1/<sha[0..2]>/<sha256>.json.gz` (mazmun manzilli — bir xil mazmun = bir xil kalit, idempotent).
   Blok matni DB funksiyasi `t2_qator_muhr_sovuq_matn_v1` bilan quriladi (jsonb tartibi, UTC vaqt, sonlar matn — aniqlik yo'qolmaydi), shuning uchun sha256 ni DB ham qayta hisoblaydi.
2. **Bazada qoladi**: barcha metadata + `muhr` (SHA-256 xesh) + yangi `sovuq_id` (R2 ko'rsatkichi) + `xom_xesh uuid` (xom yuklamaning arzon md5 barmoq izi).
   Yuklama 9 ustuni NULL bo'ladi (`CHECK`: `sovuq_id` bor bo'lsa yuklama NULL va `xom_xesh` majburiy).
3. **Ko'rsatkich jadvali** `t2_qator_muhr_sovuq` (kalit, sha256, tasdiq vaqti, id ro'yxati; o'chirilmaydi, FK `restrict`).
4. **Sovutish tartibi** (snapshot bilan bir xil, faqat service_role):
   `oqi` (DB id va matn beradi) → TS: sha256, gzip, R2 ga yoz → **R2 dan qayta o'qi**, gunzip, sha256, JSON qator soni → `yoz` (DB matnni o'zi qayta quradi, sha256 teng bo'lsa ko'rsatkich) → `tasdiq` → `sovut` (DB yana tekshiradi, keyin NULL).
   Har qadam xatosida bazada yuklama tegilmagan qoladi.
5. **Nomzod qator**: yopiq yoki (qator bazada va xom qiymati muhrdagiga teng) va `yaratildi` ≥ 2 kun. **Prodda 132 647 / 141 674 (93,6 %)**;
   9 027 qator issiq qoladi: 8 980 ta haqiqatan o'zgargan (asosan narxlangan) + 45 faqat normallashtirish farqi + 2 ta qator bazada yo'q — ya'ni view ularning avval/endi sini bazadan beradi.
6. **Const trigger** yangi ikki o'tishni ruxsat beradi, o'zgarmaslik buzilmaydi:
   sovutish — faqat tasdiqlangan R2 ko'rsatkichi shu qatorni qamrasa va eski qiymat xeshi `muhr` ga teng bo'lsa; isitish — qaytarilgan qiymat xeshi `muhr` ga **teng** bo'lsagina.
   Ya'ni qiymat bironta yo'l bilan o'zgarib qola olmaydi; R2 ni buzish ham isbotni buzmaydi (xesh bazada).
7. **O'quvchilar shaffofligi (view)**: issiq qator — avvalgi mantiq aynan. Sovuq qator: `xom_xesh` ni `t2_qator` xom qiymati bilan solishtiradi (regexsiz, ~µs); farq bo'lsa haqiqiy farq `muhr` xeshi bilan hal qilinadi
   (faqat probel farqi — farq emas, avvalgidek). Haqiqiy o'zgargan sovuq qator `holat='ozgargan'`, `sovuq=true`, avval/endi **bo'sh** keladi; o'chirilgan sovuq qator `holat='ochirilgan'`, nom/kod bo'sh.
8. **Isitish («tikla»)** — qator o'zgargach asl qiymat R2 dan qaytariladi, view to'liq avval/endi beradi. Ikki yo'l, bir mantiq (`isitObyekt`):
   (a) kunlik cron avval isitadi, keyin sovutadi; (b) reader: `qatorMuhrFarqOl` bo'sh avval/endili sovuq qatorni (`muhrSovuqKerak`) ko'rsa `POST /api/muhr-isit {obyekt_id}` chaqiradi (R2_CANONICAL binding, PostgREST RPC), so'ng qayta o'qiydi.
   R2 matni sha256 ga, har qator xeshi muhrga teng bo'lmasa yozilmaydi. Endpoint qiymat qaytarmaydi (faqat son), sessiya talab qiladi, bo'lak 3 blok, idempotent.
   Isitilgan qator qayta sovutilmaydi (u haqiqatan o'zgargan, nomzod emas).
9. **Cron**: `mcp/smeta-mcp-remote/src/sovutish.ts` `sovutishCron` snapshot sovutishdan keyin `muhrSovutishPartiya` ni ishga tushiradi: avval isitish, so'ng blok limiti (20/kun, `MUHR_SOVUT_BLOK`), vaqt byudjeti 15 s,
   5 xatodan keyin to'xtash, xato izolyatsiyasi (snapshot natijasiga ta'sir qilmaydi), migratsiya yo'q bo'lsa jim o'tkazib yuborish, `MUHR_SOVUT_OFF=1` — o'chirgich. Boshlang'ich ko'chirish ≈ 45 blok ≈ 3 kun.

Rad etilgan variantlar: (A) faqat «nom»ni ko'chirish — hajm kam; (B) obyekt darajasidagi umumiy xesh bilan qatorlarni o'chirish — qaysi qator o'zgarganini R2 siz topib bo'lmaydi, har ochilishda R2 o'qish;
(C) yangi saqlash mexanizmi (D1/KV) — talab: mavjud R2 + sovutish naqshi.

## 5. MB estimati (honest)

| Modda | MB |
|---|---|
| Yuklama (93,6 % qatorda) | −13,9 |
| `xom_xesh` (16 B) + `sovuq_id` (8 B) × 132,6 ming | +3,7 |
| Ko'rsatkich jadvali (id massivlari 8 B/qator + overhead) | +1,2 |
| **Sof tejash (VACUUM FULL / pg_repack dan keyin)** | **≈ −9 MB (8–10)** |
| Indekslar | 0 (tegilmaydi) |

Plain `UPDATE` (sovutish) heap'ni o'zi kichraytirmaydi: o'lik versiyalar autovacuum bilan sahifa ichida qayta ishlatiladi, fayl hajmi esa faqat `VACUUM FULL muhr` dan keyin tushadi (jadval ≈ 1–2 s qulf, muhr faqat import paytida yoziladi).
R2 hajmi: ≈ 141 ming qator gzip ≈ 3–5 MB (R2 bepul 10 GB).

**Diet hujjatidagi 45–55 MB bu ADR bilan erishilmaydi** — u butun qatorni bazadan olib tashlashni nazarda tutadi. Bu 2-bosqich (§9).

## 6. Qo'llash tartibi

1. Migratsiya `20261212400000` ni prodga (runner begin/commit o'raydi; ustun qo'shish qayta yozmaydi; view qayta yaratiladi — soniyalar). Acceptance (BEGIN..ROLLBACK) — qo'llashdan oldin/keyin.
2. MCP Worker (`mcp/smeta-mcp-remote`) deploy — cron yangi RPC larni topadi (migratsiyadan **keyin**; oldin deploy qilinsa ham jim o'tkazib yuboradi).
3. Frontend (Pages) deploy — `/api/muhr-isit`, `qatorMuhrFarqOl`. Migratsiyadan keyin (yangi ustun `sovuq` view'da; frontend uni so'ramaydi, shuning uchun tartib qat'iy emas).
4. Birinchi kunlik cron'lar ko'chiradi (3 kun) — yoki qo'lda `MUHR_SOVUT_BLOK=60`.
5. Ko'chirish tugagach: `select public.t2_qator_muhr_sovuq_statistika_v1();` va `VACUUM FULL public.t2_qator_muhr;` (past yuklama oynasida, Worker'da emas).
6. `select * from public.t2_versiya_xabardorlik_audit_v1()` bo'sh bo'lishi shart (yangi t2_qator o'quvchilar izohlangan: «versiya: tarix»).

## 7. Xavflar

| Xavf | Chora |
|---|---|
| R2 obyekti yo'qoladi/buziladi | DB `muhr` xeshi saqlanadi (isbot buzilmaydi); isitish xeshni tekshiradi → xatoda hech narsa yozilmaydi. R2 obyektlari o'chirilmaydi. **Yo'qolgan blokni qayta tiklab bo'lmaydi** (xesh isbot beradi, qiymatni emas) — shuning uchun sovutishdan keyin `R2_CANONICAL` lifecycle/versioning o'chirilmasin. Qo'shimcha: kerak bo'lsa `ops` skripti blokni ikkinchi kalitga nusxalaydi. |
| Sovuq qator keyin o'zgardi — avval/endi bo'sh | Reader `/api/muhr-isit` + cron isitadi; R2 yiqilsa — belgi bor, tafsilot yo'q (sukut, smeta ishlaydi) |
| View sekinlashishi | Sovuq qator uchun regexsiz `xom_xesh` (µs); sha256 (`hisob`, ~60 µs) faqat xom farqli qatorlarda. 26 ming qatorli obyektda hozirgi to'liq xesh solishtirish 2,6 s edi — shu sababli barmoq izi kiritildi |
| `xom_xesh` to'qnashuvi (md5, 128 bit) | Faqat «o'zgarmadi» deb xato aytishi mumkin; ehtimol ≈ 2⁻¹²⁸ (adversar yo'q: yozuvchi — faqat service_role RPC) |
| Trigger murakkabligi | `acceptance.sql` S5: noto'g'ri qiymat bilan isitish, qo'lda sovutish, DELETE — rad; TS testlari |
| Korrektirovka qoralamasi (`bosqich=N`) | Yangi qator issiq tug'iladi; o'zgarish talab qilmaydi (qoralamada muhr o'qilmaydi, faqat INSERT) |
| Ruxsatsiz isitish chaqirig'i | Qiymat qaytmaydi, faqat son; idempotent; xesh tekshiruvi; faqat o'zgargan qatorlar nomzod |
| Hyperdrive/Worker CPU | Blok ≤ 3000 qator, 20 blok/kun, 15 s byudjet |

## 8. Rollback

1. R2 dan hammasini bazaga qaytarish: `isitBarchasi(db, r2)` (`frontend/src/lib/qator-muhr-r2/sovuq.ts`) yoki `MUHR_SOVUT_OFF=1` + `/api/muhr-isit` har obyekt uchun.
2. `select count(*) from public.t2_qator_muhr where sovuq_id is not null` = 0 bo'lsagina `20261212400000_...rollback.sql` (aks holda u o'zi rad etadi).
3. Rollback asl const trigger va view'ni tiklaydi, ustun/jadval/funksiyalarni o'chiradi. R2 obyektlari qoladi (zararsiz, isbot nusxasi).
4. Cron kodi migratsiya yo'qligida jim o'tkazib yuboradi — Worker'ni orqaga qaytarish shart emas.

## 9. Keyingi bosqich (alohida ADR, egasi qarori kerak)

Butun-qator arxivi: R2 bloki allaqachon barcha o'zgarmas ustunlarni saqlaydi. Sovuq qatorni bazadan **butunlay o'chirib**, o'rniga ixcham
`(qator_id, bosqich, muhr bytea(32), xom_xesh uuid, sovuq_id)` qoldirish ≈ −40…45 MB beradi (qator ≈ 100 B, 2–3 indeks tushadi). Lekin:
const trigger «muhr o'chirilmaydi» mazmunini o'zgartiradi (isbot zanjiri: R2 + xesh), `ol_v1` («muhri bor-yo'q» tekshiruvi), view va trigger qayta yoziladi, 3 ta yozuvchi yo'l ta'sirlanadi.
Shuning uchun bu PR faqat xavfsiz 1-bosqichni beradi; 2-bosqichga ruxsat egasidan.
