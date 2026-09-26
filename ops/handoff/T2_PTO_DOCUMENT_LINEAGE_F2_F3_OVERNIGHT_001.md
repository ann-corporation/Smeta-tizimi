# T2-PTO-DOCUMENT-LINEAGE-F2-F3-OVERNIGHT-001

- Agent: Codex
- Machine: pc-ishxona
- Branch: `codex/pto-document-lineage-f2-f3-v1`
- Base: `origin/main` @ `361261e775df5173181f2967fcda227748f21dfb`
- Production write: `false`
- Status: `SOURCE_READY_WITH_LIVE_EVIDENCE_OPEN`

## Nima qilindi

- Generic `pto-document-lineage` validator qo'shildi.
- F3 export real UI oqimida company/project/object/contract/period scope'siz
  ishlamasligi uchun `lineageRequired: true` qilindi.
- F2 source'ning `akt_id` va `qator_id` identity'lari F3 source lineage'iga
  o'tkazildi; duplicate qator manbasi bloklanadi.
- Tasdiqlangan F2 source'da `akt_id` yoki exact `summa` noma'lum bo'lsa
  anonim `akt` yoki `0` fallback ishlatilmaydi — F3 fail-closed bo'ladi.
- Nakopitelniy va F2 eksportlari ham explicit object → active contract
  relation gate'dan o'tadi.
- `t2_shartnoma_bog` client read active link (`holat=eq.faol`) bilan
  cheklab qo'yildi.
- Additive DB trigger migration, rollback va read-only acceptance SQL tayyor.
- Active task owns ro'yxati barcha o'zgartirilgan pathlarni qayd etadi.

## O'zgargan fayllar

- `frontend/src/lib/pto-document-lineage/index.ts`
- `frontend/src/lib/pto-document-lineage/index.test.ts`
- `frontend/src/lib/forma3-export.ts`
- `frontend/src/admin/sahifalar/NakopitelniyVedomost.tsx`
- `frontend/src/api/t2-shartnoma.ts`
- `frontend/testlar/t2_pto_document_lineage.test.cjs`
- `supabase/migrations/20261102100000_t2_forma3_lineage_guard_v1.sql`
- `supabase/migrations/20261102100000_t2_forma3_lineage_guard_v1.rollback.sql`
- `supabase/migrations/20261102100000_t2_forma3_lineage_guard_v1.acceptance.sql`
- `docs/architecture/PTO_DOCUMENT_LINEAGE_F2_F3_V1.md`
- `ops/ACTIVE_TASKS.json`

## Dalil va cheklovlar

Repo migrationlari va Supabase read-only catalog tekshiruvi `t2_forma3`,
`t2_shartnoma`, `t2_shartnoma_bog`, `t2_loyiha`, `t2_obyekt` va kerakli
columnlarni ko'rsatdi. Migration hali productionga qo'llanmagan.

`F2-IMPORT-V3-001` faol lane bo'lgani uchun parser/matcher UI va uning
owns pathlari ataylab o'zgartirilmadi. Native F2 import/GAS exit statusi bu
handoff bilan avtomatik yakunlangan deb hisoblanmaydi.

Forma-3 legal/payment/tax semantics verified rule pack bilan ta'minlanmagan;
`FORMA3_RULE_UNRESOLVED` saqlanadi. Real approved F2 bilan Excel/print
authenticated smoke hali UNKNOWN.

AI endpoint source'da auth, company scope va fail-closed javoblar bilan bor,
ammo provider konfiguratsiyasi va authenticated live smoke bu branchda
isbotlanmagan.

## Claude uchun integratsiya tartibi

1. Branchni fetch qilib commit diffini review qiling.
2. `frontend/src/lib/pto-document-lineage/` unit/static testlarini ishga
   tushiring.
3. Migrationni faqat named migration sifatida shadow/disposable acceptance'da
   tekshiring; production apply alohida release approvalga tegishli.
4. `t2_forma3` create/update commandlari lineage guard bilan mosligini
   authenticated staging smoke'da tekshiring.
5. Real tasdiqlangan F2 mavjud obyekt uchun F3 exportda:
   `company/project/object/contract` bir xil, oldingi approved davrlar
   cumulative, kelajak davr va cross-scope manba bloklanganini isbotlang.
6. F2 parser/matcher lane'ini bu branch bilan semantik conflict qilmasdan
   alohida integrate qiling.

## Gate natijasi

Targeted Vitest: 2 test file, 19 test PASS.
Full Vitest: **108 file PASS, 6 skipped; 685 test PASS, 12 skipped**.
Full run parallel muhitda og'ir Excel/perf timeout bergan; ayni testlar
`--no-file-parallelism --maxWorkers=1 --testTimeout=60000` bilan hammasi PASS
bo'ldi. 50k matching perf shu run'da 1.43s bo'ldi.
`npx tsc -b`: PASS.
`npx tsc -p tsconfig.functions.json`: PASS.
`npm run lint`: PASS, faqat repositorydagi mavjud warninglar.
`npm run build`: PASS.
`npm run tekshir`: PASS.
`node ops/governance-check.cjs`: PASS; faqat CURRENT_STATE main SHA stale
warningi mavjud.
`git diff --check`: PASS.

Disposable Supabase/Docker CLI bu muhitda mavjud emas; shu sabab migration
runtime/shadow apply qilinmadi. Read-only production catalog faqat mavjud
column va parent relationlarni tasdiqlash uchun ishlatildi.
