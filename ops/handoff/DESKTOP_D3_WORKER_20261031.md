# PR217 D3a — exact-main alignment, 2026-11-03

Branch: codex/desktop-d3-worker. Exact merged main: fc65e64582c4b1fa792d556c2a073540f6ad1ebc. Local review delivery only; no push, main mutation, production writes, build or full-suite run in this update. Parent owns D3b integration and final acceptance.

## Current implementation

- holat.ts delegates amount arithmetic to current hisob-yadro/korinish helpers: qoldiq, faktSummaF2Narxda, f2MumkinIshorali. No duplicated price/podval formula. Signed negative availability stays negative; unknown Fakt amount/availability stays null.
- Packet fakt_summa already comes from t2_qator_holat; it and frozen f2_hajm/f2_summa pass through unchanged. Pricing is used only to derive availability, never to rewrite source values.
- h.f2_summa_yoq is an optional numeric/null column with the existing presence bitmap. It passes through decoded packet, holat derivation and Worker result. Absent remains omitted/undefined (actual main optional helper behavior), explicit null stays null and explicit 0 stays 0. It is NOT inferred from f2_summa_nomalum: the latter excludes BL/RZ and machine-operator rows whereas the new count does not.
- Legacy optional-field behavior cannot prove that a zero F2 aggregate means a real zero amount. The SQL extension below is required for complete missing-amount protection; no claim of complete old-packet equivalence.
- Main has no holat.ts conflict to resolve; its old inline packet derivation was replaced with the shared core call. Only merge conflict: ACTIVE_TASKS. Every foreign task record was compared against exact main and is unchanged and in original order. Only the D3a task was added.

## Unsupported F2 document markup — parent dependency

The current packet lacks t2_akt_podval metadata / per-act-per-block own nk and attributable category cuts. D3a does NOT call f2Baholash with smeta metadata to invent F2 markup. Exact source F2 amounts and document totals stay intact. F2 own-podval/QQS/markup evaluation from this packet is UNSUPPORTED until an explicit authoritative document-metadata contract is supplied. D3a produces row state, not a document monetary total.

## Exact PR2 SQL / contract work for parent

1. Extend the existing t2_obyekt_paket_v1 source CTE to select h.f2_summa_yoq from t2_qator_holat, and h JSON with f2_summa_yoq = array_agg(f2_summa_yoq ORDER BY tartib,id), empty [] (same column alignment as other h arrays). Current file anchors: supabase/migrations/20261116400000_t2_obyekt_paket_v1.sql source SELECT line 38 and h JSON near line 86. Use a new parent migration plus rollback/acceptance; D3a edits no SQL.
2. Keep the exact view count, including BL/RZ and signed nonzero quantities. Do not derive it from the filtered f2_summa_nomalum and do not default missing transport to 0.
3. Coordinate packet format/ETag salt/cache invalidation with D2; old cached packet bodies lack this guard. Extend packet acceptance and shadow comparison to check new column values, including null/zero/count and BL/RZ cases. This lane does not edit D2.
4. Update the now-stale comment in api/t2-daraxt-ustunlar.ts stating the packet never carries the field (it is optional here). Existing base-column shape remains unchanged for legacy packets; extended packets include f2_summa_yoq.
5. Parent must define F2 document podval metadata separately before worker document-valuation support; row source amounts alone are insufficient. No fallback to smeta podval asserted here.

## Validation for this update

- Focused final run: 3 files / 22 tests PASS. Command from frontend: npx vitest run src/lib/hisob-yadro/holat.paritet.test.ts src/ombor/hisob-worker.test.ts src/lib/hisob-yadro/hisob-yadro.guard.test.ts --maxWorkers=1 --no-file-parallelism.
- Broader focused packet compatibility probe: paket.test.ts has 5 PASS / 2 FAIL, both stale zero expectations for an unknown material amount. Failures at materializer assertion line 87 and tree assertion line 93; fixture qator_id 12 uses fakt_summa:null but expects f2_mumkin_summa:0. Actual value is now null per owner contract. Unowned packet.test.ts intentionally not edited. Parent should replace that expected zero with null and reconcile its exact legacy-SQL-parity wording with canonical signed/null behavior. All other tested packet cases passed.
- Governance FAIL: pre-existing C11-WAREHOUSE-LEDGER vs C11-WAREHOUSE-CONTRACT path overlap; stale CURRENT_STATE warning. Foreign records were not changed to bypass it.
- TypeScript: npx tsc -p tsconfig.app.json --noEmit PASS (exit 0). D3a-only whitespace diff vs exact main PASS. Whole staged merge whitespace check flagged three pre-existing imported main files: journal-window.config.ts:11, journal-window.test.tsx:168, ui-harness/fixtures.ts:146 under frontend/testlar/pto-integration-20261026 (blank line at EOF); left unchanged. Full suite, application/Worker build, perf/session/browser/SQL/live differential acceptance remain parent-owned and were not run in this update.

## Historical evidence (2026-10-31, not current validation)

# D3a — Worker o‘qish modeli poydevori

Codex@noutbuk; base `fc4f0eab8bba5e24d9752f5e1d27618742999ee7`; `codex/desktop-d3-worker`.

## Nima o‘zgardi

- `ombor/paket.ts`dagi mavjud hosila ifodalar aynan `lib/hisob-yadro/holat.ts`ga ko‘chirildi. Eski decoder ham shu funksiyani chaqiradi; yangi narx/pul formulasi yo‘q. Source F2 amount qayta hisoblanmaydi. PostgreSQL GREATEST(NULL,0)ning mavjud semantikasi saqlangan.
- `ombor/hisob.worker.ts` production module Worker, typed message protocol va toza handler. Mavjud dekoder/reader ishlatiladi. Xato paketda yarim natija yoki xom diagnostika qaytmaydi.
- `hisob-mijoz.ts`: request/epoch/revision, oldingi so‘rovni bekor qilish, kech A javobini Bga qo‘llamaslik, close/crash/messageerror/timeout cleanup. Worker serverTasdiqni bermaydi. Mijoz logout/obyekt almashishda yopilishi shart.
- Runtime hook yoki feature flagning eski yo‘li o‘zgartirilmadi. Bu modul hali sahifaga ulanmagan.

## Tekshiruv

Focused20 PASS: existing paket parity, core guard, synthetic hosila oracle, Worker request/close/race/timeout/error,30k fixture. AppTS/FunctionsTS/lint PASS; tekshir PASS; Vite app build PASS; Worker alohida Vite production build PASS (6.09kB). Lintdagi mavjud warninglar saqlangan. Governance4oldingi owns/policy FAIL; bu lane yangi conflict kiritmadi.

Full Vitest:584fayl/4262test PASS,12fayl/25test skip,471.77s (`C:/Temp/desktop-d3-vitest.log`). TypeScript va Functions alohida exit0; `git diff --check` PASS. Ruxsatli branch push/PR bor, main integratsiyasi yo‘q.

`node src/ombor/hisob-thread-smoke.mjs` (`frontend`dan) production Worker bundle’ni alohida Node thread’da WebWorker port adapteri orqali ishlatadi.26k synthetic qator, exact F2 saqlanishi PASS. O‘lchov: compute cold47.15ms, warm17.75/14.17/10.20ms; to‘liq message roundtrip121.59/92.27/93.71/79.88ms. Bu haqiqiy thread, lekin browser render/login yoki server parity acceptance emas. Vaqt mashina/yuklamaga bog‘liq.

## D3 hali tugamagan

To‘liq D3 tahrir→jami≤50ms mezoni PASS emas. Har safar katta paket/resultni structured-clone qilishning o‘zi ortiqcha vaqt oladi. Keyingi D3b: Worker ichida obyekt snapshotini ushlash; faqat canonical IDli o‘zgarish yuborish; iterativ daraxt/rollup va norma kaskadini aynan server manbasi bilan isbotlash; kichik o‘zgargan-natija qaytarish. RZ/BL rollup va norma mutatsiyalari bu PRda yo‘q. Real server differential/shadow parity, actual browser Worker roundtrip va UI ulanishi ochiq. Snapshotlar bir-biriga qo‘shilmaydi; approved F2ni lokal tahrirlash eshigi yo‘q.

Main/prod o‘zgarmadi, migratsiya yo‘q. Claude independent reviewdan keyin integratsiya qiladi. Goal ACTIVE.
