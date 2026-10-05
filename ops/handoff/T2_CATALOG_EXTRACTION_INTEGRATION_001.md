# T2 katalog extraction integratsiyasi — 1-bosqich

Agent: Codex, noutbuk. Branch: `codex/catalog-extraction-integration-v1`.
Base: `a0cf0bf8f2ab7648ba4b09b2341a0c7e68f95713` (remote main fetch natijasi).

## Haqiqiy implementatsiya

Mavjud KatalogManbaImport oynasiga source-review panel qo'shildi.
Yangi parallel canonical DB yo'q. Model manba IDlarini canonical ID deb
ko'rsatmaydi; norma va narxni Numberga konversiya/recalculate qilmaydi.
Aniq KODE orqali unique work–recipe join, duplicate/orphan fail-closed.
Source table identitylari tekshiriladi. 25 qatorli pagination, work ichida
ko'pi bilan 100 resurs render qilinadi; butun manba paketda qoladi.

Full packet 21 210 028 bayt; 188 671 yozuv:
BOOK 24 738, LIBRARY 621, NORMATIV 26, POPRAV 1 438,
POPRAVBASE 95 704, PRICE 20 706, IBASIS 299, IBASISRES 2 549,
RESURS_TIP 42 590. Barcha raw source scalar ustunlar saqlangan.
Resource/work name uchun CP1251 NAMEP BLOBlar hash/length bilan tekshirilgan.

## Fayllar

- frontend/src/lib/catalog-extraction/index.ts — read-only model va pagination.
- frontend/src/lib/catalog-extraction/index.test.ts — source + real corpus tests.
- frontend/src/admin/sahifalar/KatalogExtractionReview.tsx — review UI.
- frontend/src/admin/sahifalar/KatalogExtractionReview.test.tsx — no-network UI tests.
- frontend/src/admin/sahifalar/KatalogManbaImport.tsx — mavjud oynaga joylash.
- frontend/scripts/catalog-extraction/prepare.mjs — exported JSONL/BLOB → packet.

## Lokal paket tayyorlash

Repo ildizidan:

```powershell
node frontend/scripts/catalog-extraction/prepare.mjs D:/CatalogMigration/supplemental-20261005 D:/CatalogMigration/tizim2-full-review-packet-v1.json D:/CatalogMigration/firebird-export-20261005-01 D:/CatalogMigration/price-export-20261005-01
```

Output mavjud bo'lsa script ustidan yozmaydi (`wx`). Yangi fayl nomi bering.
Tayyor full paket: `D:\CatalogMigration\tizim2-full-review-packet-v1.json`.
Shaxsiy manbalar repo/public assetga qo'shilmagan. UI shu paketni file input
orqali o'qiydi. Preview browser xotirasida; refreshdan keyin qayta ochiladi.

## Sinov

frontend ichida:

```powershell
$env:CATALOG_REVIEW_PACKET='D:\CatalogMigration\supplemental-20261005\tizim2-review-packet-v1.json'
$env:CATALOG_FULL_PACKET='D:\CatalogMigration\tizim2-full-review-packet-v1.json'
node node_modules/vitest/vitest.mjs run src/lib/catalog-extraction/index.test.ts src/admin/sahifalar/KatalogExtractionReview.test.tsx --maxWorkers 1
```

33 test PASS, jumladan barcha 9 jadval real qatorlari deep equality,
aniq norma matni, NULL != 0, 10k work fixture, duplicate/orphan, bounded page,
source ID reorder, fake unit/name qo'shilmasligi va UI no-network writes.
Corpus bo'lmagan CI muhitida 2 real corpus test skip; synthetic tests ishlaydi.

Gate natijalari: tsc -b PASS; tsc -p tsconfig.functions.json PASS;
focused oxlint PASS; Vite production build PASS (mavjud katta chunk/grid.svg
warninglari); npm run tekshir ekvivalenti node testlar/hammasi.cjs PASS;
governance-check PASS (64 task, eski main_sha warning); git diff --check PASS.
Full Vitest kampaniyasi bu checkpointda bajarilmadi.

## Chegara — to'liq business integratsiya deb aytilmasin

Bu SOURCE REVIEW UI: Supabasega doimiy normativ registry importi yo'q;
R2ga corpus yuklanmagan; production deploy yoki authenticated smoke yo'q.
POPRAV grammar bajarilmaydi. PRICE sana/valyuta/birlik/VAT noma'lum bo'lsa
oferta yoki F2 narxi sifatida qo'llanmaydi. Shu sabab mavjud platforma PRICE
jadvallariga mazkur unverified narxlarni avtomatik kiritish qilinmadi.

Keyingi canonical persistence uchun integrator kontrakti kerak:
source corpus registry (original private R2 document), source revision/fingerprint,
review-only status, trusted provenance, unit/normative edition confirmation,
named import command + actor/platform permission + operation id + audit.
Review yozuvi active norma/narx read modeliga tasdiqsiz chiqmasin.
Kelajakda ochiladigan boshqa fayllar ham shu source pipelinega versiya bilan
qo'shiladi; source identity eski certified F2ni o'zgartirmaydi.

Binary hujjatlar/shablonlar/PTO manuals avvalgi extraction paketlarida;
bu panel ularni biznes formula deb ochib ishlatmaydi. Shablon fidelity
audit va official exporter moslash alohida keyingi ish.

Obsidian to'liq manba xaritasi:
`20_PROJECTS/Smeta-tizimi/KATALOG_PTO_MANBALARI_TO_LIQ_HANDOFF_2026-10-05.md`.

## 2-bosqich: ochilgan to'liq normativ baza va smeta konstruktori

Egasi bergan yangi manba: `D:\CatalogMigration\paradox-open-20261005-145050`.
Avvalgi 188 671 yozuvli review paketidan alohida dataset:
basis 54 013 ish, basisres 531 015 sarf normasi,
material 337 016 resurs, bprice 167 566 narx — jami 1 089 610.
`checksums.json` barcha fayl hash/size tekshiruvi PASS. Source SQLite faqat
`mode=ro` / `query_only` rejimida o'qildi. Manba fayllari tahrirlanmadi.

### Ishlaydigan kod

- `norm-catalog.ts`: source-ID indekslari, exact KodE ish–retsept bog'lanishi;
  KodM+KodR ikkalasi mavjud bo'lsa conjunction, KodM yo'q bo'lsa exact KodR.
  Nom, massiv pozitsiyasi va qator raqami join identity emas.
- `norm-catalog.worker.ts`: 4 JSONL File stream, UTF-8 decoder, worker indeks,
  main threadda 300MB JSON.parse yo'q; 25 ta ish/resurs sahifasi.
- `NormSmetaWorkbench.tsx`: ish qidirish/tanlash, sbornik/bo'lim, norma,
  resurs nomlari, narx nomzodlari, fizik hajm/asos/dalil, alohida qoralama narxi,
  ko'p ishli smeta qoralamasi va REVIEW_ONLY paketini yuklab olish.
- `norm-draft.ts`: barcha resurslarni (faqat ekrandagi 25 emas) hisoblaydi;
  1000 recipe/work limiti; BigInt decimal preview, 6 xona quantity / 2 xona
  money half-away; NULL saqlanadi. Bir narx noma'lum => jami noma'lum.
  Har xil valyuta jami birlashtirilmaydi. Unit/base/price evidence majburiy.
  `NormSmetaReviewPort` actor/tenant/canonical persistence uchun typed kontrakt;
  hozir backendga bog'lanmagan. Bu yangi canonical database emas.
- `audit-open.py`: checksum va SQLite join oracle; raw data ochish/bypass yo'q.

### Haqiqiy ma'lumotda tekshirilgan bog'lanishlar

Ish: unique 528 962 recipe, missing 2 042, ambiguous 11.
Takror work code: `E24-2-100-1`; tasodifiy birinchi ish olinmaydi.
Resurs: explicit KodM/KodR gates unique 530 220, missing 752, ambiguous 43.
Faqat unique-work recipe uchun independent SQLite oracle:
exact 528 210, missing 709, ambiguous 43 (jami 528 962).
Muhim tuzatish: dastlabki audit NULL KodMlarni Counter orqali bir-biriga
mos deb sanagan edi. NULL identity emas; bu statistika va lookup tuzatildi.

### Testlar

74 focused test PASS (6 fayl), jumladan real 4 JSONL to'liq o'qish,
oldingi 9-jadval packet deep equality, 10k search, decimal quantity/money,
full recipe pagination, source immutability, NULL, ikki kod conflict,
narx dalili, worker lifecycle va async stale search guard.
Corpus testi local-only environment bilan yoqiladi; CI'da tegishli manba
bo'lmasa real corpus testlari skip, synthetic testlar ishlaydi.
Oxirgi real corpus qayta testi: 32 795 ms; Node RSS 665 591 808 bayt.
Bu browser peak memory yoki foydalanuvchi authenticated smoke o'lchovi emas.
Natija: `D:\CatalogMigration\norm-smeta-acceptance-20261005-v1.json`.
Oxirgi app/functions TypeScript, focused oxlint, Vite build, tekshir,
governance va diff-check PASS; mavjud chunk/grid.svg va stale main_sha warning.

```powershell
# frontend cwd
$env:NORM_SOURCE_DIRECTORY='D:\CatalogMigration\paradox-open-20261005-145050'
$env:CATALOG_REVIEW_PACKET='D:\CatalogMigration\supplemental-20261005\tizim2-review-packet-v1.json'
$env:CATALOG_FULL_PACKET='D:\CatalogMigration\tizim2-full-review-packet-v1.json'
node node_modules/vitest/vitest.mjs run src/lib/catalog-extraction src/admin/sahifalar/KatalogExtractionReview.test.tsx src/admin/sahifalar/NormSmetaWorkbench.test.tsx --maxWorkers 1
```

### Ochiq keyingi ish — tayyor production smeta deb aytilmasin

1. Baza platforma catalog registry/R2ga bir marta import qilinishi va
   actor/platform permission + operation_id + audit bilan canonical read port.
   Hozir fayllar worker/browserda, refreshda qayta ochiladi; draft ham vaqtinchalik.
2. KodI fizik unit/scale lug'ati va normativ tahrir/amaldalik dalili.
   Qoralamada operator dalil/asos kiritadi, bu norma avtomatik legal tasdiq emas.
3. Bprice Rajon/sana/valyuta/VAT/CenaUE semantics; hozir narxlar faqat nomzod.
   Source JSON/SQLite floating-pointdan kelgan, original exact decimal deb
   kafolat berilmaydi; manba ko'rinishini qayta tasdiqlash kerak.
4. 752 missing / 43 ambiguous resurs va 2 042 orphan work uchun review queue.
5. Canonical `t2_qator`ga smeta command, hierarchy va rasmiy tirik Excel export.
   `shaxsiy_smeta_yarat` legacy bypass/NULL-to-zero oqimi ko'r-ko'rona olinmadi.

Bu bosqich SOURCE_READY + LOCAL_TESTED; permanent DB import, authenticated
browser smoke, main integration va production deployment hali bajarilmagan.
Qo'shimcha fizik bprice qatori (headerdan tashqari) karantinda qoldi.

## 3-bosqich: egasining ikki-panel/hierarchy aniqlashtirishi

`NormCatalog.branches(path,page)` basis source KodA → KodRaz → KodPRaz →
KodTab indeksini yaratadi, branch count/work scope aniq kalit bilan tekshiriladi.
NULL alohida unresolved bucket; prefix/fuzzy yoki qator pozitsiyasi ishlatilmaydi.
UI chapda drill-down/breadcrumb/search/detail, o'ngda doimiy smeta paneli.
Object/section/subsection draft destination va unique draft occurrence mavjud;
bir ish har xil destinationda takrorlanishi mumkin. Bir occurrence olib tashlash
boshqasini olib tashlamaydi. NormDraft schema optional additive maydonlar bilan
saqlandi; DB/RPC endpoint o'zgarmadi. Rus/en UI tarjimalari ham qo'shildi.

Hali PARTIAL: category/section uchun inson tushunadigan nomli daraxt (BOOK
IDPARENT mavjud, lekin eski TIPBOOK=A va yangi TipBook=H edition reconciliation
isbotlanmagan), o'ngda to'liq nested editor, inline resurs substitution va
koeffitsient apply/undo, canonical save, Excel. Ular source-ready deb aytilmasin.
POPRAV.PRAV verified calculation rule emas; raw matnni eval qilish yo'q.
Egasining to'liq talabi Obsidian handoff §16da saqlandi.
Oxirgi focused paket: 82 test PASS (7 fayl), jumladan to'liq real corpus,
4-level scope, NULL branch, Latin/Cyrillic search, ikki-panel elementlari,
hierarchy click requestlari va global i18n qorovuli. Build/functions typecheck,
focused lint, governance/diff-check PASS. Oldingi tekshir PASS o'z kuchida;
bu UI checkpointda to'liq Vitest kampaniyasi o'tkazilmadi.

## 4-bosqich: conversational estimate fundamenti

Egasi chat/ovozdan smeta yig'ish orzusini aniq bildirdi; Obsidian §17da to'liq
talab va misol saqlandi. `conversation-estimate.ts` typed source-proof facts,
explicit user scope confirmation va suggestion-only `ConversationEstimatePort`
beradi. Parser/LLM output tasdiqlangan norma yoki canonical command emas.
4m3/4t/15m3 × 14 misolida scope unresolved bo'lsa barcha totalQuantity NULL;
PER_ITEM user tasdiqlasa 56/56/210, TOTAL tasdiqlasa 4/4/15.
AI quantity/unit/material hallucination sourceQuote gate bilan bloklanadi;
BigInt decimal multiplication, decimal comma, duplicate fact ID va invalid count
gate'lari bor. 17 test PASS. No API call, no ASR, no paid model, no DB write.
REGISTER_FACT va CREATE_ESTIMATE ajratilishi backend bindingda majburiy;
«qilindi» so'zi avtomatik Fakt yozish vakolati emas.
