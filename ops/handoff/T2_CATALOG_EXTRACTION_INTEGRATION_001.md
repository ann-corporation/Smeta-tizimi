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
