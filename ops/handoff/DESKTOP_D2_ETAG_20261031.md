# D2 PR216 — 2026-11-03 main adaptation

Branch `codex/desktop-d2-etag`, workdir `C:/Temp/GAS-desktop-d2`, common git `C:/Temp/GAS-slich/.git`.
Exact main merged: `fc65e64582c4b1fa792d556c2a073540f6ad1ebc` (second merge parent).
Only conflict: `ops/ACTIVE_TASKS.json`; all 101 main task records preserved unchanged, D2 record added/updated.
Local commit only; parent review precedes push. No production SQL/writers/deploy/main push. `supabase/.temp/` preserved.

## Changes / parent coordination

- New CLI2.122.0 migration `20261103123741_t2_obyekt_paket_f2_summa_yoq_v1.sql`, with `.rollback.sql` and `.acceptance.sql`.
- Contains literal full CREATE OR REPLACE of the existing packet function, not a runtime string patch. Deployed `20261116400000` and all other main historical migrations remain byte-identical.
- Adds `h.f2_summa_yoq` straight from the canonical view, in the same `tartib,id` order as every parallel array. No financial formula added. NULL source amount and explicit zero remain distinct; signed storno quantities do not erase unknown evidence.
- Adds `meta.akt_podval` using exactly the projection/order/scope of `t2_akt_podval_ol_v1` in deployed `20261121000000`. Includes sign, source document, NK, document totals, source verification and version. Synthetic acceptance compares the entire projection to that canonical reader.
- Existing unpublished D2 migration now fingerprints independent `t2_akt_podval` rows: insert/update/delete changes ETag even when immutable parent akt versions stay fixed. All raw podval fields are conservatively hashed; a timestamp-only change may also invalidate.
- Full packet function definition was already fingerprinted: the optional field extension and rollback both invalidate ETag. Added `_t2_f2_narxda_v1` definition hash: changing its body invalidates even when view text stays identical.
- Actor source (`manba`) and raw_snapshot source/meta changes are checked with explicit version increments. The real production version triggers/writers are NOT executed/proven by these fixtures.
- API/client implementation unchanged from PR216: flag `OBYEKT_PAKET_ETAG=1` remains default-off; authorization before 304, streamed body, same-snapshot wrapper, no-store, caller actor.
- Parent D1b/D3b must extend its `PaketXom`/decoder/types/use of `h.f2_summa_yoq` and consume `meta.akt_podval` as appropriate. Those parent-owned paths were not edited here.

## Selective apply / rollback

CLI timestamp `20261103123741` is earlier than future-dated dependencies. L0 must SELECTIVELY apply after `20261116400000` (packet), `20261117400000` (view + helper), `20261121000000` (akt podval); do not apply all pending by filename order.
Apply the unpublished D2 `20261031181105` functions and the new extension only after those dependencies, then both read-only acceptance files. D2 probe hashes packet definition dynamically, so extension order relative to D2 itself is safe.
Extension rollback restores the exact former packet definition; D2 hashes remain conservative. Roll back extension first, then D2 functions if needed. No tables or business rows are deleted by either rollback.

## Verified on this merged tree

- `PGLITE_DIR=C:/Temp/c11-sql-runtime/node_modules/@electric-sql/pglite node supabase/tests/desktop-etag-pglite.mjs`: 88 checks PASS. Loads exact main view/helper, packet SQL, deployed podval table/reader, new migration and acceptance. Synthetic actor/NK/permission fixtures; explicit version increments, no business-writer claims.
- Covers NULL/zero/new counter, BL legacy-counter distinction, parallel-array ordering, signed known/unknown storno and cancellation, source/meta changes, helper-only definition change, full packet definition change, independent podval changes with fixed akt versions, foreign-company isolation, no-op, empty packet, wrapper body/header, grants, exact rollback definition and reapply.
- Focused Vitest: 5 files / 35 PASS (`functions/api/obyekt-paket{,.etag}.test.ts`, `src/api/t2-obyekt-paket.etag.test.ts`, `src/ombor/paket.test.ts`, `src/lib/smeta-versiya/versiya-qoriqchi.test.ts`). One worker.
- `npx tsc -b` and `npx tsc -p tsconfig.functions.json --noEmit`: PASS.
- `npx oxlint src` plus D2 functions/tests and SQL runner: PASS, existing source warnings remain. `git diff --cached --check fc65e64582c4b1fa792d556c2a073540f6ad1ebc`: PASS. Whole merge vs old branch reports existing EOF blank lines in three main-owned PTO integration test files; untouched.
- `node ops/governance-check.cjs`: FAIL existing main C11-WAREHOUSE-LEDGER-20261027 vs C11-WAREHOUSE-CONTRACT-20261027 overlap; stale CURRENT_STATE SHA warning. No unrelated ownership records modified.
- Build / full Vitest / other full gates: NOT RUN on this revision; parent schedules one process after other laptop agents finish. Prior 2026-10-31 full-suite and performance receipts are historical, not evidence for this tree.

## Remaining acceptance / risks

Parent review and full gates required before push. L0 target read-only acceptance and authenticated 200/304 PostgREST smoke remain open; real concurrent writers, deployed version-trigger behavior, permission revoke/authority TTL and final warm probe <50ms remain unverified here. Added podval fingerprint cost needs target measurement. No production DB contacted in this adaptation.
