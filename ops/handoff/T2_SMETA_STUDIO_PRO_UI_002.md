# T2-SMETA-STUDIO-PRO-UI-002 — Codex / noutbuk

## Vazifa va chegara

Egasi mavjud smeta muharririni yoqtirmadi: Excel → chuqur ierarxiya → resurs
almashtirish → katalog narxi → nakrutka → tirik Excel professional ish joyiga
aylanishi kerak. Bu checkpoint TO'LIQ yangi muharrir yoki production release EMAS.

Branch: `codex/smeta-studio-pro-v2`.
Base: `0fc3e402564460df6c535075be879fff981c5283`.
Worktree: `C:/Temp/GAS-smeta-studio-pro`.
Egasi talabi Obsidian: `SMETA_STUDIO_PRO_V2_EGASI_TALABI_2026-10-06.md`.

## Haqiqiy kod

`frontend/src/components/smeta-studio-pro/`:
- `hierarchy.ts`: mavjud `EstimateDoc`dan iterativ O(n) indeks; canonical
  snapshot o'zgarmaydi, RZ parent lineage saqlanadi. Cycles/duplicate/orphan
  fail-closed. Reorder stable identityni o'zgartirmaydi. Qidiruv lotin/kirill,
  topilgan resursning barcha ota bo'limlarini saqlaydi.
- `EstimateOutline.tsx`: haqiqiy React + TanStack virtualizer, ko'rinadigan
  viewport + 8 overscan, 44 px qator. Bo'lim/ish/resurs ochish, yopish, qidiruv,
  ancestor breadcrumb. Texnik UUID/version/hash ko'rinmaydi; onSelect orqali
  ichki occurrence/recipe ID inspector uchun qaytadi. Labels caller tomonidan
  `t()` bilan lokalizatsiya qilinishi shart; komponent yangi lug'at yozmaydi.
- `substitution-review.ts`: UI preflight — type/unit ma'lumligi, type mismatch,
  conversion va sabab; birlik farqida factor=1 bo'lsa HAM evidence talab.
  `readyForOperatorReview` tasdiqlangan normativ moslik DEGANI EMAS; geometrik
  specifications/normative basis hamda backend command tekshiruvi majburiy.
- 3 test fayli: hierarchy 13, component 4, substitution 11 = 28 yangi test.

## Tekshiruv va chegaralar

2026-10-06: yangi va mavjud engine suite birga **60/60 PASS** (6 fayl).
`tsc -b`, `tsc -p tsconfig.functions.json`, focused oxlint, `npm run build`,
`npm run tekshir`, `git diff --check` PASS. Governance PASS (69 task),
CURRENT_STATE main_sha eski ekanligi haqida pre-existing WARN. Buildda
pre-existing `/grid.svg` va katta bundle warninglar bor; ular yangi UI ishlashi
isbotiga aylantirilmaydi.

Focused komponent + mavjud canonical engine testlari qayta yuritiladi:
`node node_modules/vitest/vitest.mjs run src/components/smeta-studio-pro src/lib/smeta-studio --maxWorkers=1`.
30 000-deep indeks/search/expand 383 ms birgalikdagi test runida;
50 003-row fixture stable keys PASS; 30 000-work UI viewport 50 dan kam DOM
treeitem (jsdom viewport geometry, real virtualizer). Browser timing emas.

Route/App/AdminShell/SmetaStudio.tsx, model/commands/calc, R2 runtime builder,
nakrutka engine, backend va DB o'zgarmadi. Yangi production URL yo'q.
Mavjud command hali `SECTION_DEPTH_LIMIT` bilan 2 daraja cheklaydi: yangi
presentation mavjud chuqur inputni ko'rsata olishi commandning chuqur bo'lim
yaratishni qo'llashini isbotlamaydi. Undo hali 100 full-document snapshot.

## Claude bilan integratsiya

1. Branchdagi yangi komponentlarni mavjud muharrirning tree presentationi
   o'rniga ulang: `doc` aynan mavjud canonical draft; onSelect mavjud
   occurrence/resource inspectorga ulanadi; ikkinchi draft/store yaratmang.
2. Lokalizatsiya caller labels orqali. Preview'da yangi PTOga ko'rsatib sinash.
3. Model egasi bilan chuqur ADD_SECTION/move cycle guard va bounded undo
   alohida mustahkamlanadi; bu checkpoint Claude qulflarini bosmaydi.
4. Excel import confirmation/source section, pricing inspector va podval
   shu mavjud commands/calculator/narx-katalog/nakrutka portsga ulanadi.
5. UI preflight server authorization o'rnini bosmaydi. Price candidate
   estimate/certified/procurement historyni yashirin o'zgartirmaydi.
6. Authenticated save/export/real workbook smoke o'tmasdan yangi muharrirni
   READY yoki production tayyor deb e'lon qilmang.

## Parallel R2 natijasi

11 immutable REVIEW_ONLY obyekt / 167 162 008 bayt private
`smeta-tizimi-canonical`ga yuklandi, hammasi readback SHA256 PASS.
Receipt: `D:/CatalogMigration/compact-estimate-reference-v1-20261005/R2_UPLOAD_RECEIPT_20261006.json`.
Snapshot `norm-katalog/reference-snapshots/66de1eea4dee809665fb998e37ff0539e62e67ba4c9de1011192d7971853ce6b/`.
QA `norm-katalog/review-support/a9d50b7e40cb0d994b3bfd64e0112a1874a6fbe87970eae6341148a7c18a1028/`.
Website active pointer o'zgarmadi. Brauzerga 165 MB SQLite to'liq berilmaydi.
