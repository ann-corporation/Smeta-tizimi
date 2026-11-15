# TIZIM_02 — Construction OS Master Roadmap

Authoritative domain map so nothing disappears between sessions.
Last reconciled: 2026-09-01 · main `b6db686` · release candidate `6a6f0d1`
(READY_FOR_OWNER_APPROVAL_V2).

Status legend: **LIVE** (in production) · **SOURCE_READY** (code on a branch/main,
not deployed) · **PARTIAL** · **MISSING** · **BLOCKED** · **DEFERRED-P1/P2/P3**.

Canonical law: ONE ENTITY — ONE ID — ONE SOURCE OF TRUTH — MANY VIEWS.
Supabase = business truth · private R2 = file truth · Drive/Sheets = replicas ·
GAS = bridge.

---

## Domain status

| Domain | Status | Canonical entity | Current source of truth | Gap / next vertical slice | Depends on |
|---|---|---|---|---|---|
| Auth / session | **LIVE** | User, Sess | Cloudflare `functions/api/sessiya` + cookie | Fail-closed secret audit (SEC H1) | — |
| Company / tenant | **LIVE** | `t2_kompaniya`, `t2_azolik` | Supabase | Company create/onboarding flow audit; company settings surface | Auth |
| Director / owner model | **SOURCE_READY** | `t2_azolik.rol='boss'` = director | Supabase (`20260905120000`) | `t2_kompaniya_yarat_v1` makes the creator a `boss`; `t2_men_v1.is_director`. Distinct `director` vs `boss` label deferred-P2 | Company |
| Membership / roles / permissions | **SOURCE_READY** | `t2_azolik` | Supabase + RLS + command guards (`20260905120000`) | Director-guarded `t2_azolik_qosh_v1`/`_rol_ozgartir_v1`/`_ochir_v1`; superadmin never grantable; last-director protected; soft-cancel. Invite-code flow deferred-P1 | Company |
| Subscription / billing / entitlements / quotas | **MISSING** | Subscription, Plan, Entitlement | — | Backlog contract only; `codex/storage-quota-ui-v1` waits here. NOT in this release (no fake payment) | Company |
| Onboarding (multi-tenant safety) | **SOURCE_READY** | `t2_kirish_royxatga_ol` | Supabase (`20260905120000`) | **P0 fixed**: new user no longer auto-joins every active company; `t2_royxat_sorov_qabul_v2` provisions company+director atomically | Auth, Company |
| Company settings / profile | **MISSING** | — | — | Minimal settings page | Company |
| Projects | **LIVE** | `t2_loyiha` | Supabase (`t2_loyiha_royxat`) | — | Company |
| Participants / project network | **PARTIAL→wired** | `t2_loyiha_qatnashchi` | Supabase (`t2_loyiha_qatnashchilar_royxat`) | `/admin/participants` reads real data (this release); invite/accept + email state = DEFERRED-P1 | Projects, ENT contract |
| Objects | **LIVE** | `t2_obyekt` | Supabase | — | Projects |
| PBS / WBS | **PARTIAL** | `t2_obyekt` + skeleton migration | Supabase | Object not overloaded; real PBS/WBS entities | Objects |
| Storage (canonical folders) | **LIVE** | `t2_company_storage_workspace` / `_project_storage_binding` / `_object_storage_binding` | Supabase + GAS bridge → Drive | Storage screen relabel: Drive = replica, not "asosiy storage" (PHASE G, in this release note) | — |
| File truth (documents) | **SOURCE_READY** | `t2_document_registry` (canonical R2 cols), `t2_replica_sync_job` | private R2 + Supabase (after migration) | Apply `20260902/06/07/08120000` + private `R2_CANONICAL` bucket + Cloudflare deploy (runbook) | Storage |
| Document Center UI | **SOURCE_READY** (wired) | `t2_document_registry_v1` | Supabase + Codex `DocumentCenter` | `/admin/documents` renders the real registry (or honest "not applied" until migrations ship); download → private R2 | File truth |
| Drive replica worker + write-back | **REMOVED 2026-11-15 (Drive olib tashlandi)** | `t2_replica_sync_job` + `98_T2ReplicaSync.js` | — | rename/**move**/delete write-back done (move = managed re-bind to KNOWN binding, else conflict+review); GAS trigger + `REPLICA_SYNC_SECRET`; content write-back R2 copy-in = DEFERRED-P1 | File truth |
| Sheets replica / write-back | **SOURCE_READY (reference)** | `sheets_entity_id`, `base_version`, `operation_id` | Supabase (`20260908120000`) + `99_T2SheetsReplica.js` | `t2_document_sheets_writeback_v1` = the reusable template (row number never identity). Legacy per-sheet write-backs DEFERRED-P1 | File truth |
| Boss / director panel | **SOURCE_READY** (was FAIL) | `t2_boss_dashboard_v1` read model | Supabase views | Apply migration; wire more cards as domains canonicalize | many read models |
| Control Center (CTRL-001) | **SOURCE_READY** (was DEFERRED-P1) | `t2_capability`, `t2_capability_override`, `t2_job`, `t2_integration_health`, `t2_deploy_state` | Supabase (`20260904120000`) | Real registry + `t2_capability_effective_v1` precedence + kill-switch + audited commands + `t2_system_control_v1`; `/api/system-control` + `/admin/system-control` wired to real data | — |
| Contracts / commercial | **PARTIAL** | `t2_shartnoma`, `t2_shartnoma_bog` | Supabase (`t2_bux_dashboard`) | Single contract truth; retention/advance/change-order entities | Projects |
| Change orders / claims / RFI | **MISSING** | — | — | P2 | Contracts |
| Design / document control | **MISSING** | DesignPackage, Drawing, Revision, Transmittal | — | P2; sits on file truth | File truth |
| Estimate / BOQ / norms | **SOURCE_READY (backlog)** | `frontend/src/estimate-engine/*` | `codex/universal-estimate-engine-v1` | P3; Global Core + Country Pack architecture | Objects/WBS |
| Schedule / planning | **MISSING** | Activity, Dependency, Baseline | — | P2 | WBS |
| Procurement / RFQ / bids / PO | **PARTIAL** | `t2_royxat_sorov`, `t2_birja_*` | Supabase (partial) | Material master; PR→RFQ→award→PO→GRN lineage | Estimate/BOQ |
| Warehouse / consumption | **PARTIAL** | `t2_sklad_harakat`, `t2_sklad_qoldiq` | Supabase (dual truths flagged) | Consolidate warehouse truth; three-way match | Procurement |
| Site execution / progress / Fakt / M29 | **PARTIAL** | `t2_qator_holat` (fakt) | Supabase | Daily execution model; M29 | Objects |
| F2 | **PARTIAL** | `t2_akt` (tur=f2) | Supabase (`t2_f2_kat_oy`, `t2_f2_tafsilot`) | F2 files → canonical R2 (no Drive-first); F2 from approved progress not ad-hoc arithmetic | File truth, Execution |
| Invoices / payments / advances / retention | **PARTIAL** | `t2_faktura`, `t2_tolov`, `t2_xarajat` | Supabase (`t2_bux_umumiy`) | Obligation/retention/advance-recovery entities; F2→invoice→payment lineage | Contracts |
| Finance / cost / margin | **PARTIAL** | `t2_bux_*` views | Supabase | Committed vs actual cost; margin forecast | Contracts, Procurement |
| Quality / safety / supervision | **MISSING** | Inspection, NCR, Defect, HSE | — | P2 | Objects |
| Equipment / HR / attendance | **PARTIAL** | ERP tables/views | Supabase (`t2_kadr_royxat`, `t2_texnika_royxat`) | Not overload company membership with HR | Company |
| Handover / defects / warranty / retention release / archive | **MISSING** | — | — | P2/P3 | Contracts |
| 1C / Didox integration | **MISSING** | ExternalMapping | — | P2; internal ID canonical, external mapping + reconciliation | Finance |
| Google Drive replica | **SOURCE_READY** | `t2_object_storage_binding`, `drive_*` cols | Supabase + GAS | see Drive replica worker | File truth |
| Google Sheets replica | **DEFERRED-P1** | contract only | — | see Sheets replica | File truth |
| Notifications / approvals | **MISSING** | — | — | DEFERRED-P1 foundation | — |
| Audit | **LIVE** | `t2_audit_log` + `t2_audit_yoz` + triggers | Supabase | Extend to reserve/finalize/replica/conflict/control (partly done in FILE-TRUTH source) | — |
| Signals / alerts / risks | **LIVE** | `t2_signal` | Supabase | Feed the Boss panel (done) + Control Center incidents | — |
| App identity / routes / titles / favicon / manifest | **SOURCE_READY** | — | `codex/app-identity-v1` (in integration) | canonical routes `/admin/{dashboard,storage,documents,mindmap,participants,system-control}` + `<PageIdentity/>` | — |
| Design system | **SOURCE_READY (backlog)** | — | `codex/design-system-v1` | dedicated milestone (broad restyle) | — |
| AI layer | **PARTIAL** | — | GAS `apiTitanAi` etc. | Move AI onto canonical APIs; scoped tools; no invented business truth | canonical APIs |
| Localization / country packs | **MISSING** | — | — | P3 | Estimate engine |
| Observability | **PARTIAL** | Control Center | — | DEFERRED-P1 with CTRL-001 | CTRL-001 |
| Performance | **ENFORCED** | — | static/behavior guards | keep guards; no Drive/Sheets/GAS on interactive reads | — |
| Security | **PARTIAL→hardened** | — | RLS + command guards + `t2_security_p0.test.cjs` | H1 auth-secret fail-closed **DONE** (ZAXIRA removed); H3 private R2 DONE; H4 upload validation/path-safety DONE; H2 service-role negative tests + H5 audit coverage guarded by tests. Full pen-style review still P1 | — |

---

## Immediate sequence (next 2–3 releases)

1. **This release** (`6a6f0d1` → main after approval): FILE-TRUTH deploy + Boss
   panel + **CTRL-001 real** + **company/auth/director P0** + **Document Center
   real** + **Drive move write-back** + **Sheets reference** + **SECURITY P0
   (auth fail-closed)** + App identity + participants real-read.
2. **P1-A**: Drive replica worker + Sheets worker GAS deploy + triggers;
   controlled Drive backfill pilot (separate approval).
3. **P1-B**: content write-back R2 copy-in (Drive→R2 new revision, currently a
   review job); invite-code onboarding flow + notifications.
4. **P1-C**: full security review (H2 service-role negative tests at the DB,
   H5 audit completeness, session rotation).
5. **P2**: contracts single-truth, procurement lineage, warehouse consolidation,
   finance lineage, schedule, design control, quality/safety.
6. **P3**: Universal Estimate Engine, design system, AI assistants, country packs,
   subscription commercialization (no fake payment until then).

## Do-not-lose backlog branches

`codex/universal-estimate-engine-v1`, `codex/design-system-v1`,
`codex/storage-quota-ui-v1`, `codex/agent-comms-protocol-v1` (governance docs).
See `ops/handoff/BRANCH_RECONCILIATION_NEXT_RELEASE.md`.
