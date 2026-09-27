# T2-AGENT-CONTROL-PLANE-001

## STATUS

SOURCE READY · VERIFIED STATIC + UI COMPONENT · production NOT APPLIED

## Branch/base

- Branch: `codex/t2-agent-control-plane-v1`
- Base: `f54c69645b7e71fdc2084b1f9d851995a8f00740`
- Machine: `codex-local`
- UI lane: no Freebuff component path edited

## Bajarilgan

- ten-role agent profile registry;
- company/project/object/global scope guard;
- operation-idempotent run start;
- explicit approval decision;
- optimistic `versiya` transitions;
- allowlisted tool-call preparation receipt;
- bounded agent control read model;
- Cloudflare session-to-RPC API boundary;
- typed frontend client without UI integration;
- reusable `AgentControlCenter` UI with safe empty/loading/error states and approval/run actions;
- `~$...xlsx` Excel lock-fayllarini paket importidan chiqarish va `XLSX_NOT_A_ZIP` xatosini safe operator xabariga aylantirish;
- Jarvis oddiy salomlashuvini company-context talab qilmaydigan deterministic yo‘lga ajratish;
- rollback and transaction-scoped acceptance SQL;
- static architecture tests.

## Fayllar

- `supabase/migrations/20261103120000_t2_agent_control_plane_v1.sql`
- `supabase/migrations/20261103120000_t2_agent_control_plane_v1.rollback.sql`
- `supabase/migrations/20261103120000_t2_agent_control_plane_v1.acceptance.sql`
- `frontend/functions/api/agent-control.ts`
- `frontend/src/api/t2-agent-control.ts`
- `frontend/src/lib/agent-control-plane/`
- `frontend/src/lib/agent-control-plane.test.ts`
- `frontend/src/components/agent-control/AgentControlCenter.tsx`
- `frontend/src/components/agent-control/AgentControlCenter.test.tsx`
- `frontend/src/components/agent-control/index.ts`
- `frontend/src/lib/jarvis/intent.ts`
- `frontend/src/api/ai-savol-contract.test.ts`
- `frontend/src/umumiy/ui/AiHelper.tsx`
- `frontend/functions/api/ai-savol.ts`
- `frontend/testlar/t2_agent_control_plane.test.cjs`
- `docs/architecture/T2_AGENT_CONTROL_PLANE_V1.md`

## Dalil va cheklov

Targeted Vitest 64/64, `tsc -b`, Functions typecheck, build, lint,
`npm run tekshir`, static oracle va `git diff --check` PASS. Full Vitest
697 passed / 1 failed / 12 skipped: bitta pre-existing `pto-hujjat-export`
testi 20 soniyada timeout bo‘ldi; agent-control yo‘liga tegishli emas.
SQL acceptance disposable/local Postgres yo‘qligi sabab runtime bajarilmadi;
production migration qilinmagan.

## Claude/Freebuff integratsiya kontrakti

Freebuff UI o‘rnida ishlatilishi mumkin bo‘lgan `AgentControlCenter` faqat
`frontend/src/api/t2-agent-control.ts` typed portini qabul qiladigan
callback/data props bilan ishlaydi. UI direct Supabase, Drive, Sheets, GAS yoki
arbitrary RPC nomiga tegmaydi va operation/UUID kabi texnik identitylarni
ko‘rsatmaydi. Claude/NREL domain adapter va route/shell integratsiyasini alohida
ownershipda bog‘laydi; bu branch `SystemControlPage`, `AdminShell`, PTO
calculation/export va canonical domain filesga tegmagan.
