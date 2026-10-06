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

## Koeffitsient / alternativa: egasining qo'shimcha talabi

`build-suggestions.mjs` source version manifest bilan uch JSONL hash/bytes
tekshiradi. 1438 qoida, 95704 link, 54013 scope: 94771 scoped association,
933 unresolved link. 16 lookup shard + raw rules + unresolved file;
721052 compressed bytes. Revision
`2f7debfba6e22b1a61d045cdb51906665eaba6d7341e55d06765cf0c504d395f`.
Local `D:/CatalogMigration/outputs/norm-suggestion-support-v1`.

`suggestions.mjs`: coefficientCandidates, alternativeCandidates,
workAlternativeCandidates. Candidate score lexical overlap, ishonchlilik
probabilitysi emas. Resource type/unit va work source/basis/revision
chegaralari saqlanadi. 10t→25t capacity warning, automatic multiplier YO'Q.
Bir shard shortlist O(n × token_count × bounded_limit), global all-pairs yo'q.
Koeffitsientlar source lookup key = JSON.stringify([bookType,collection,table,code]);
SHA256 key birinchi byte %16 → lookup-hex.gz. Rules ID orqali rules.gz dan.
Original opaque PRAV saqlanadi, eval/execute yo'q; canApply:false.

Alternativa semantic equivalence DB tayyor deb aytilmaydi: mavjud norm
shardning real resource/work qatorlari lexical review kandidatidir.
Texnika quvvati, marka, sinf, ish usuli va sarf o'zgarishini dalilli
tasdiqlash kontrakti hali kerak. Rasmiy edition/condition/base/DSL
verifikatsiyasi bo'lmaguncha avtomatik coefficient execution yopiq.

Test: suggestions.test.mjs (8), suggestion-pack.test.mjs (5 real pack).
R2 uploader: publish-suggestions.py existing verified upload helperdan
foydalanadi, immutable key conflict fail-closed; GET/readback SHA.
Server binding/UI integratsiya Claude'da; yangi canonical DB yoki pointer yo'q.

R2 publication VERIFIED: `smeta-tizimi-canonical` bucket,
`norm-katalog/suggestion-support/2f7debfba6e22b1a61d045cdb51906665eaba6d7341e55d06765cf0c504d395f`.
19 objects /727289bytes; har biri GET/readback compressed SHA256 PASS.
Receipt local outputdagi `R2_RECEIPT.json`; websiteIntegrated=false,
activePointerChanged=false. Obsidian binding:
`NORM_SUGGESTION_DATABASE_2026-10-06_CODEX.md`.

## Mashina-soat: egasi belgilagan yagona narx siyosati (2026-10-06)

`ops/catalog-hierarchy/machine-price-max.mjs`: `MAX_PER_EXACT_MACHINE`.
2023/2025 manbalardagi aynan bir xil texnikaga bitta eng yuqori narx
tanlanadi, o'rtacha yoki eng yangi narx emas. Teng narxda yangi manba;
keyin stable sourceKey tartibi. Pul decimal satrlaridan BigInt orqali
solishtiriladi, float yoki rounding bilan narx o'zgarmaydi.

Quvvat/model/tonnaj nomdagi raqamlar saqlanadi: 5t/10t/25t bir texnika emas.
Fuzzy yoki manba qator tartibi identity emas. Faqat tasdiqlangan o'qish,
manba SHA/page/date, UZS, mash-ch va NDS siz narxlar qabul qilinadi.
Dalil ichkarida saqlanadi; operatorga har davrdan alohida variant emas,
bitta maksimal reference offer beriladi. Bu certified F2 narxini
almashtirish yoki smetani avtomatik qayta narxlash ruxsati emas.

Test: `node --test ops/catalog-hierarchy/machine-price-max.test.mjs`
12/12 PASS, jumladan 10k source observation, different capacity,
NULL/zero, unverified OCR, NDS/currency/unit, reorder, exact decimal.

Source PDFlar 36 sahifa render+OCR qilingan. 2023 PDF skan, 2025 text/OCR
ham ayrim narx raqamlarini to'liq o'qimagan; OCRning o'zi verified=false.
Shu sabab real katalogning to'liq production importi hali bajarilmadi;
`readingVerified=true` faqat sahifa dalili bilan tekshirilgan yozuvga
beriladi. Renderer/OCR scripts repo ichida, original biznes fayllar
o'zgarmadi. Local source pack:
`D:/CatalogMigration/outputs/machine-prices-2023-2025-sources-v1`.

## 2026-10-06 — resource category + hourly price executable checkpoint

Branch: `codex/catalog-hierarchy-review-v1`. Integration base `07a0442bd1607217560dfd74eba7fbdb795fec3d`;
local safe sync commit `ef9fc65`. This section ships in the following implementation commit;
exact final remote SHA: `git ls-remote origin refs/heads/codex/catalog-hierarchy-review-v1`.

Root cause: `smeta-studio/export-adapter.ts` maps M/R to МАТ; actual source Tip R
also contains machinery. Among 7916 unique resources in revision `567137e5ebdf076c`,
1730 have proven machine-hour units, 17 human-hour units; 781 machine rows have R.
These are unique resources within exported work shards, not the entire global corpus.

Reusable executable paths:

- `frontend/src/lib/resource-semantics/index.ts`: `resourceFacts`, `normativeWorkUnit`.
  Source-observed KodI outranks broad Tip. 001=чел-ч; 010/011/619=маш-ч.
  Unknown/conflicting unit stays UNRESOLVED, no work-unit fallback.
  Machinist labour stays чел-ч/LABOUR_HOUR but existing cost grouping МАШ is retained.
  This does NOT authorize applying construction-worker regional rate to machinists.
- `frontend/src/lib/hour-price-catalog/index.ts`: typed read-only loader, SHA/length/revision
  checks, exact machine MAX offer, region/year/quarter/worker-scope labour lookup.
- `frontend/functions/api/hour-price-catalog.ts`: authenticated private R2 read port,
  only manifest/catalog JSON; no arbitrary key, source-file disclosure, DB mutation.
- `ops/catalog-hierarchy/read-labour-catalog.mjs`, `build-hour-price-pack.mjs`,
  `upload-hour-price-pack.py`: deterministic preparation/publication commands.
- `prepare-hour-crops.py`, `hour-cell-crops.py`: OCR review aids ONLY. Crop counts and
  OCR agreement are not normative or reading verification.

R2 bucket `smeta-tizimi-canonical`:

```
hour-price-catalog/16ee27da8700cc28/catalog.json
hour-price-catalog/16ee27da8700cc28/manifest.json
hour-price-catalog/sources/574e32c8731c18e8d757ebfa1a10dca6bc208bf1afa799603d700384a62e1a4c.pdf
hour-price-catalog/sources/f47836597303b649f5f82600fd0f5ca2c95577db48c6a3799c4ee87a8efd8329.pdf
hour-price-catalog/sources/813c3261c92bb2548bb65755a74f836baced78458b4fc9d4e590afa13bf27f54.xls
```

All five uploaded/read-back SHA verified; original business files unchanged.
Catalog JSON 127697 bytes, SHA `16ee27da8700cc2853c3b4112e57237250df8eb497d0ab360284645271b35fde`.
Machine coverage **PARTIAL_VERIFIED_SUBSET**: 30 machines, each with visually checked
2023+2025 observations, one highest offer; remaining PDF rows NOT approved.
Labour 30 rates =15 regional/aggregate rows ×2 quarters; Q3/Q4 30 unavailable cells
are NOT zero. C base excludes 12% social addition; D=C×1.12 stored as evidence only.
Machine source explicitly reference/forecast, VAT excluded; not actual procurement
or automatically certified F2 price. Source IDs are strings derived from hashes/cells;
they are not invented canonical DB IDs.

### Claude production binding required — no parallel store

1. Merge this support branch (not cherry-picking unknown prerequisite files).
2. In export-adapter `resourceCategory` use `resourceFacts` result instead of M/R=МАТ.
   Keep calculation/core snapshot semantics; unknown category must surface review.
3. In Studio resource unit rendering remove WORK unit fallback for RESOURCE KodI.
   Render human and machine units from proven dictionary. Work basis `1000 м3`
   is distinct from physical input e.g.4 м3; NEVER relabel physical4 as4×1000 м3.
4. In SmetaStudioNarxlash load the hourly reference port once. Region+quarter must be
   selected for worker rates; no national-average or missing-quarter fallback.
   Machine exact offer → typed existing SET_PRICE candidate/evidence, operator decides.
   Name variants use existing characteristic gates+human review, NOT fuzzy autoapproval.
5. Save path must validate string source-reference IDs against this immutable R2 revision;
   do not fabricate t2_narx_manba_qator numeric IDs. R2 proof≠canonical mutation authority.
6. Existing baseline/certified/actual prices stay separate; historical F2 unchanged.
7. Test live excavator R/619, worker001, 1000м3 norm basis, hourly offer save/export/reload.

Production binding/deploy/authenticated smoke remain **NOT DONE** in this checkpoint.
Claude locked Studio files were not edited. Obsidian KOORDINATSIYA has the exact request.

### Verification commands and measured result

Frontend: `CATALOG_SHARD_DIR=C:/t2dev/norm-shards-v3 npx vitest run src/lib/resource-semantics/ src/lib/hour-price-catalog/ src/lib/smeta-studio/ functions/api/hour-price-catalog.test.ts functions/api/narx-katalog.test.ts`
→ 12 files,88 tests PASS,0 skipped with actual corpus env set.

Repo root: set `CATALOG_SHARD_DIR`, `CATALOG_BOOK_PACKET`, `CATALOG_SUGGESTION_PACK`,
`HOUR_PRICE_PACK=D:/CatalogMigration/outputs/hour-price-catalog-v1`,
then `node --test ops/catalog-hierarchy/*.test.mjs` →44 PASS.

`tsc -b`, `tsc -p tsconfig.functions.json --noEmit`, `npm run build`, `npm run lint`,
`npm run tekshir`, `node ops/governance-check.cjs`, `git diff --check` PASS.
Existing lint warnings, large bundle/grid.svg warning and stale CURRENT_STATE SHA
warning remain; they are not silently described as warning-free.
