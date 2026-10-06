# T2 — current Claude + Codex catalog consolidation (2026-10-06)

Owner instruction: current tested Claude and Codex work → main → production deploy.
Release owner for this instruction: Codex, noutbuk.

## Captured inputs

- `origin/main` and `origin/claude/t2-smeta-studio-v1`:
  `07a0442bd1607217560dfd74eba7fbdb795fec3d` (0/0 divergence).
- Existing production deployment `41981d56-0f61-47ca-b314-42bbdef1c39b`:
  exact same SHA, deploy stage success (Cloudflare API independently inspected).
- Codex source `b1428ff67b208d500e2582aad2ba7f195a35fb70`, containing current main,
  hierarchy review, coefficient/alternative source support, resource semantics and
  authenticated immutable hourly-reference R2 read port.
- Human dirty `G:/Другие компьютеры/Компьютер/GAS` belongs to a separate old checkout;
  no reset/clean/stash/checkout or automatic untracked-file collection.
- `C:/Temp/GAS-xarita` local main is clean but older; no mutation of that checkout.

## Exact scope / no fake completion

This is a consolidation of committed source, not an assertion that every requested
PTO/Studio feature is finished. Claude current main business code remains unchanged
by this release. New resourceFacts/hour-catalog modules and the read endpoint ship;
Studio export/pricing/save wiring remains integrator work and is NOT silently
claimed as fixed live UI. Full machine catalogue remains PARTIAL_VERIFIED_SUBSET.
No canonical database migration, paid AI activation, secret rotation or real F2
approval/import is performed. Historical certified F2 and price separation remain.

R2 immutable reference revision `16ee27da8700cc28`:
30 verified machine MAX offers +30 labour region/quarter offers,3 originals+2JSON files,
all readback SHA checked. Missing labour quarter cells remain unavailable, not zero.
Actual source coverage/calculation contracts: `ops/handoff/T2_CATALOG_HIERARCHY_8053_001.md`.

## Release verification

Previous source checkpoint:88relevant Vitest +44Node source tests; app/functions tsc,
build/lint/tekshir/governance/diff passed. Consolidated candidate is rechecked before
main push. Existing lint/build/governance warnings are not erased or hidden.
Main integration uses ordinary fast-forward push, never force. On concurrent main
updates, fetch/merge/reverify instead of overwriting. Cloudflare must report exact
candidate SHA, production environment, final deploy success and canonical pointer.
GET /api/soglik must return ok:true. Reference endpoint unauthenticated must fail401.
Authenticated owner browser smoke remains UNKNOWN unless actually exercised;
technical deployment is not READY_FOR_WEBSITE_DAILY_USE.

## Deployment evidence

Consolidated local gates:23Vitestfiles/202tests PASS including Studio/UI/F2 operator
and read/save APIs. Additional OpenRouter/agent tests4files/48tests PASS (some overlap,
not claimed as unique250). App/functions TypeScript/build/lint/tekshir PASS.
Governance71tasks PASS; pre-existing lint/generated .wrangler warnings, grid.svg
and large-bundle warnings remain. Source/support actual-fixture tests44PASS.

Owner added request: configured Cloudflare OpenRouter key should ship with this deploy.
Production project inspected:OPENROUTER_API_KEY exists as secret_text (no value printed).
Existing OpenRouter server adapter/model registry and AI center are included from
Claude main. AGENT_ISH_YOQILGAN is NOT1, so model-calling /api/agent-ish actions remain
disabled; management UI/actions remain available. No key replaced, budgets invented,
paid model request executed, or feature flag silently changed. Deploy does not prove
real provider response/token metering. Separate Smeta price suggestion endpoint uses
the existing AI gateway; its calls must not be described as budgeted agent calls.

Code release SHA `64af58f7b96bbe4aac09b663f73733dfb08ef710`: main+sourcebranch remote
verified; Cloudflare canonical production `b7cacd02-3173-40e1-a69d-659825276aaf`,
deploy success ended2026-10-06T13:20:14.026988Z, exact SHA matches.
Production and deployment-URL /api/soglik HTTP200,ok:true; /admin/smeta-studio200;
hour catalogue unauthenticated401 AUTH_REQUIRED; agent-ish unauthenticated401.
This following governance-only checkpoint records measured code deployment and
completes the release task; its final SHA/deploy are recorded in Obsidian.
Authenticated owner flow/provider response remain UNKNOWN, not falsely PASS.
Rollback: redeploy previous verified07a0442 if deployment regression is observed;
no DB/data rollback is required because this release applies no DB writes.
