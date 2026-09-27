# T2-PTO-DOCUMENT-FIDELITY-001

## Holat

SOURCE READY · targeted verified · production migration NOT APPLIED

## Branch

- branch: `codex/pto-document-fidelity-v1`
- base: `1dd256f31d01ff604238218fb846fedf90d5a589`
- final commit: `b193ff5` (`fix(pto): preserve exact certified amounts and live exports`)

## Nima tuzatildi

- `t2_akt_qator.certified_amount` Workbench response’dan yo‘qolib ketmasligi uchun additive `t2_workbench_exact_v1` RPC qo‘shildi.
- `certified_amount` endi `quantity * price` bilan qayta hisoblanmaydi; source document’dagi exact summa alohida saqlanadi.
- `normalizeWorkbench` exact amountni pure engine’ga uzatadi.
- `calculateProgressValuation` exact F2 amount yo‘q bo‘lsa `MISSING_CERTIFIED_AMOUNT` qaytaradi va soxta summa yasamaydi.
- `Forma-3` approved F2 source amountdan foydalanadi; baseline estimate qiymatini payment/progress qiymati deb aralashtirmaydi.
- `Forma-2` va `Nakopitelniy` hosila ustunlarida Excel formula + cached result mavjud; downloaded workbook qayta hisoblanadi.
- reconciliation exact previous + current = cumulative certified amountni ham tekshiradi.

## Fayllar

- `supabase/migrations/20261104100000_t2_workbench_certified_amount_v1.sql`
- `supabase/migrations/20261104100000_t2_workbench_certified_amount_v1.rollback.sql`
- `supabase/migrations/20261104100000_t2_workbench_certified_amount_v1.acceptance.sql`
- `frontend/functions/api/hujjat-nazorat.ts`
- `frontend/src/api/t2-document-control.ts`
- `frontend/src/lib/construction-document-control/types.ts`
- `frontend/src/lib/construction-document-control/calculation.ts`
- `frontend/src/lib/construction-document-control/validation.ts`
- `frontend/src/lib/construction-document-control/export/forma2-export.ts`
- `frontend/src/lib/construction-document-control/export/forma3-export.ts`
- `frontend/src/lib/construction-document-control/export/nakopitelniy-export.ts`
- relevant fixtures/tests and `frontend/testlar/t2_workbench_exact_amount.test.cjs`

## Release order

1. Apply the additive migration in a disposable/staging or approved database.
2. Run the acceptance SQL inside rollback transaction.
3. Deploy the Cloudflare function route and frontend bundle.
4. Verify `/api/hujjat-nazorat?amal=workbench` returns `certifiedAmount` for an approved F2 source row.
5. Open Forma-2, Nakopitelniy and Forma-3 exports and verify formula/result pairs.

No production migration was applied by this task.

## Verification evidence

- targeted Vitest: 8 files / 40 tests passed
- exact-amount static guard: `T2_WORKBENCH_EXACT_AMOUNT_STATIC_PASS`
- `npm run tekshir`: all registered checks passed
- `npm run lint`: passed with existing warnings only
- `npm run build` / browser and Functions type gates: passed
- full Vitest: 104 files passed, 6 skipped, 7 files failed (699 passed / 8 failed / 12 skipped); failures are existing large XLSX/export timeout and matcher-performance-threshold failures, not exact-amount assertion failures
- `git diff --check`: passed before checkpoint

## Production dependency

The frontend route now calls `t2_workbench_exact_v1`. The additive Supabase migration must be applied before the frontend bundle is deployed; otherwise the route intentionally returns the existing migration-not-applied response instead of silently falling back to an inaccurate amount calculation.
