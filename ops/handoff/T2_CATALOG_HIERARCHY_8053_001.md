# T2-CATALOG-HIERARCHY-8053-001

Owner: Codex, noutbuk. Branch: codex/catalog-hierarchy-review-v1.
Base: origin/main 2099628 (2026-10-06). Status: JARAYONDA.

Egasi: Claude Studio'da; Codex 8053 unresolved yozuvni kategoriyalaydi.
Koordinatsiya: Obsidian 20_PROJECTS/Smeta-tizimi/KOORDINATSIYA.md,
Savollar bo'limida binding kontrakti so'ralgan; javob hali tasdiqlanmagan.

Owns: ops/catalog-hierarchy/, ushbu handoff, ops/ACTIVE_TASKS.json.
DO NOT TOUCH: Studio/UI, lib/catalog-extraction, scripts/catalog-extraction,
canonical backend, source norma/price/recipe, R2 active pointer.

Kirish: C:/t2dev/norm-shards-v3 (rev 567137e5ebdf076c), BOOK
D:/CatalogMigration/tizim2-full-review-packet-v1.json. Source faqat o'qiladi.
Chiqish: har stable workId uchun source key + candidate BOOK path +
dalil/status + izohli navigation category. Raw key, nom, retsept saqlanadi.
Unique code-variant candidate ham official norm equivalence emas;
ko'p candidate yoki yetishmagan source avtomatik tasdiqlanmaydi.

Acceptance: 8053/8053 coverage, ID dublikati yo'q, source hash verification,
deterministik natija, reordering invariance, tip/edition chegarasi,
ambiguous mapping fail-closed, hech qanday source/production rewrite yo'q.

## 2026-10-06 executable checkpoint

Kod: `ops/catalog-hierarchy/reconcile.mjs`, `generate.mjs`,
`reconcile.test.mjs`, `real-source.test.mjs`.
Generator manifest SHA/bytes va BOOK SHA tekshiradi; mavjud outputni
ustidan yozmaydi. BOOK tipi alohida; nom/ID/source key saqlanadi;
norma/narx/retseptga tegmaydi. Lotin-kirill o'xshash uppercase shifr
faqat review kandidati, normativ ekvivalentlik tasdig'i EMAS.

Real chiqish: `D:/CatalogMigration/outputs/catalog-hierarchy-8053-v1/`
(`review.json`, Excelda o'qiladigan `review.csv`, `summary.json`).
Revision `567137e5ebdf076c`; 8053/8053, original nomi bo'sh yozuv=0.
3262 COLLECTION_NAVIGATION_REVIEW; 2918 SOURCE_NAVIGATION_ONLY;
1864 AMBIGUOUS_BOOK_REVIEW; 9 UNIQUE_CODE_VARIANT_REVIEW.
Review SHA256: `e86ad65ad103e497266852d5a6cc5dc2b21379e6ad5a960438752e4c649845ff`.

Run:
```powershell
node --test ops/catalog-hierarchy/reconcile.test.mjs
$env:CATALOG_SHARD_DIR='C:/t2dev/norm-shards-v3'
$env:CATALOG_BOOK_PACKET='D:/CatalogMigration/tizim2-full-review-packet-v1.json'
node --test ops/catalog-hierarchy/real-source.test.mjs
node ops/catalog-hierarchy/generate.mjs C:/t2dev/norm-shards-v3 D:/CatalogMigration/tizim2-full-review-packet-v1.json NEW_OUTPUT_DIRECTORY
```

Claude binding: review keyed by unchanged workId/sourceRevision; selected
BOOK candidate path yoki izohli navigatsiya groupni tree adapterda ishlating.
Ambiguous candidate avtomatik normativ qaror emas. Bu paket original
source hierarchy correction, recipe approval yoki official edition emas.
Production websiteIntegrated=false: R2 builder/active pointer ulanmaguncha
saytdagi 8053 yo'qoldi deb aytilmaydi. Obsidian'da adapter owns so'ralgan.
