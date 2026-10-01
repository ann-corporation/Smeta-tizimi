# 2026-09-09 — T2 PTO audit, F2 zanjiri va agent liniyasi

Ushbu addendum quyidagi eski yozuvlardan ustun bo'lgan eng so'nggi o'lchangan
holat. Avvalgilar tarixiy dalil sifatida saqlanadi.

| Field | Current value |
|---|---|
| `main_sha` | `be800d0dfeb356521284a614ae1d09764a28353d` |
| `main_sha_izoh` | Addendum commit qilingach bir commitga orqada qoladi — bu normal. |
| `f2_chain` | **Kodda tuzatildi, jonli rollback bilan isbotlandi.** `exactWrite` narxi nol qator uchrasa BUTUN F2 faylini rad etardi; haqiqiy faylda 1054 qatordan 164 tasi narxsiz (`000003` МАШИНИСТОВ obyekt 6 da 782/782 = 100 % narxsiz — bu qoida, buzuq ma'lumot emas), ulardan 159 tasi allaqachon moslashgan edi. Natijada 2 ta import (06.09, 08.09) `review` da qotgan va `t2_akt_qator` butun bazada **0 qator**. Tuzatish `da26170`. |
| `f2_rollback_proof` | Jonli bazada `raise exception` bilan majburiy rollback: 1020 qator yozildi, akt summasi **1 633 694 097.50**, read-modeldagi barglar summasi aynan shu, **farq 0.00**; 79 manfiy (storno) qator saqlandi; nol hajmli-lekin-summali (fantom pul) qator 0. Bazaga hech narsa yozilmadi. |
| `f2_real_import` | **APPROVAL_REQUIRED** — haqiqiy import productionga 1.63 mlrd so'mlik hujjat yozadi. Bajarilmadi. |
| `unauth_endpoints` | **Tuzatildi (`edc3977`).** `/api/payment` (auth/signature/replay/reconciliationSIZ moliyaviy RPC, frontendda 0 chaqiruvchi) va `/api/upload` (auth yo'q, klient bergan `kompaniya_id` R2 kalitiga tozalanmasdan, o'lcham/MIME/overwrite himoyasi yo'q, ustiga bog'lanmagan `R2_ARCHIVE` ga yozardi — ya'ni allaqachon buzuq) o'chirildi. `uploadFayl` kanonik `/api/hujjat-yukla` ga o'tkazildi. |
| `lrv_export` | `frontend/src/lib/lrv-plus-export.ts` — ustun tartibi haqiqiy T1 LRV_PLUS bilan bir xil (ТИП **I** da, kategoriyalar J..O `=$H{qator}` formulasi), A..H qalin chegara, rz/bl/resurs Excel outline bilan **guruhlanadi**, РАЗДЕЛ/ВИД РАБОТ olib tashlandi. Har qatorda FAKT/OSTATKA/F2 OLINGAN/F2 MUMKIN. Egasi 2026-09-09 da sinab ko'rib tasdiqladi. Yopilmagan 7 band `docs/audit/T2_PTO_CLOSURE_AUDIT_2026-09-09.md` da. |
| `agent_comms` | **`docs/governance/AGENT_COMMS_PROTOCOL.md` endi `main` da (v2).** Ilgari u faqat `codex/agent-comms-protocol-v1` branchida turardi (branch 52k qator orqada — merge qilinmadi, hujjat ko'chirildi). v2: Hermes roli + §11 ko'p mashina qoidasi (noutbuk va ishxona PC yagona liniya = git remote; push qilinmagan ish — aloqa emas; har mailbox fayli agent VA mashinani nomlaydi; bitta task — bitta mashina). `ops/mailbox/INBOX.md` yaratildi. |
| `active_task_HERM_001` | `HERM-001` — Hermes uchun PTO yopish (6 ta ish paketi), branch `hermes/t2-pto-closure-v1`, `owns` ataylab tor, `machine` hali bo'sh. Topshiriq: `docs/ai/HERMES_T2_PTO_TOPSHIRIQ_2026-09-09.md`. |
| `pto_audit` | `docs/audit/T2_PTO_CLOSURE_AUDIT_2026-09-09.md` — Bosqich 0 gap matrix. Ochiq: `PTOWorkspaceContext` **yo'q**, targeted re-import **yo'q**, cross-tenant negative testlar **yo'q**, schema bootstrap testi **UNPROVEN**, `didox-webhook` to'qilgan son qaytaradi. |
| `missing_authority_docs` | `docs/product/PTO_TARGET_STATE.md`, `docs/product/PTO_ACCEPTANCE_MATRIX.md`, `docs/audit/HERMES_FULL_SYSTEM_AUDIT_2026_09.md` — topshiriq ularga murojaat qiladi, repoda **yo'q**. |
| `verification` | `tsc -b` exit 0 · `tsc -p tsconfig.functions.json` exit 0 · Vitest **377/377** · `tekshir` PASS · `build` PASS · `lint` **0 error** (161 warning, eskidan) · `governance-check` PASS (31 task). |
| `authenticated_smoke` | Hamon **UNPROVEN** — egasining haqiqiy sessiyasi kerak; agent parol/cookie so'ramaydi. |

# 2026-09-07 — T2 safe release reconciliation: amaldagi holat

Quyidagi addendum oldingi yozuvlarni tarixiy dalil sifatida saqlagan holda
hozirgi xavfsiz release cutoverini qayd etadi.

| Field | Current value |
|---|---|
| `base_sha` | `50e1fb72a81e187ba495865ce8515b13603dd9be` — xavfsiz integration manbasi. |
| `safe_candidate` | `b60d6d64fc647116bee6299bc8de17fd26ca601b` — reconciliation o‘zgarishlari bilan yakuniy xavfsiz kod daraxti. |
| `main_sha` | `b6f8c141674c9f5ed18e2e9b62e189a0e3d0b4e6` |
| `production_deploy` | Cloudflare Pages check `success`; latest commit `b6f8c14`; deploy preview `https://0aca4f41.smeta-tizimi.pages.dev`. `https://smeta-tizimi.pages.dev` va deploy preview HTML build xeshi bir xil. |
| `runtime_smoke` | Production `/api/soglik` HTTP 200, `ok=true`, `supabase_key_role=service_role`, canonical RPC HTTP 200; protected API’lar 401; noto‘g‘ri login 401 va cookie yo‘q; asosiy admin route’lar HTTP 200. |
| `r2` | `frontend/wrangler.toml` private `R2_CANONICAL` → `smeta-tizimi-canonical`; public canonical bucket yo‘q. Authenticated binary round-trip bu muhitda bajarilmadi. |
| `production_migrations` | Ushbu cutoverda yangi migration qo‘llanmadi; production business data o‘zgartirilmadi. |
| `gas` | GAS deploy qilinmadi; bridge source’dagi xavfsiz LockService tuzatishi source-only. |
| `authenticated_smoke` | Ownerning yaroqli browser sessiyasi mavjud emasligi sabab login → obyekt → Smeta → LRV → Fakt → F2 → tarix → narx → Nakopitelniy to‘liq smoke isbotlanmadi. |
| `release_status` | Safe code main’ga chiqarildi va Cloudflare deploy qilindi; authenticated owner vertical smoke — ochiq dalil bo‘shlig‘i. |

# 2026-09-06 — T2 PTO daily reliability: joriy integratsiya checkpointi

Ushbu yangi addendum joriy release ishining o‘lchangan holatini qayd etadi;
quyidagi avvalgi yozuvlar tarixiy dalil sifatida saqlanadi va qayta yozilmaydi.

| Field | Current value |
|---|---|
| `integration_sha` | `f182bd77cf2798852d5968a4e39bdbc1f39a03fb` — `origin/integration/next-main-release-v1`; implementation `8c7cf3b8fb1dcdfe9601b48936f6670ba3552afb`, handoff `af050f71...`, governance checkpoint shu SHAda. |
| `main_sha` | `7a49befb611408c8b39ebd8e564465eb423b61bf` |
| `main_change` | Ushbu ish davomida main o‘zgartirilmadi. |
| `cloudflare_deploy` | Candidate `f182bd7` uchun Cloudflare Pages deploy muvaffaqiyatli: `https://1ca8fc74.smeta-tizimi.pages.dev`; main/Production deploy qilinmadi. |
| `runtime_smoke` | Candidate `/`, `/admin/fakt` — HTTP 200; `/api/soglik` — HTTP 200, `ok=true`, Supabase `service_role`, `canonical_rpc_http_status=200`, `SESSIYA_KALIT`/`GAS_URL` mavjud. Authenticated vertikal smoke hali bajarilmadi. |
| `r2` | Private `R2_CANONICAL` → `smeta-tizimi-canonical`; public access o‘chirilgan; repo konfiguratsiyasi PASS. |
| `production_migration` | `t2_lrv_approved_f2_rollup_v1`, source `20260906130000`, live ledger versiyasi `20260906141808`; acceptance `LRV_APPROVED_F2_ROLLUP_ACCEPTANCE_PASS`; biznes qatorlariga DML kiritilmagan. |
| `live_counts` | `t2_qator=17521`, `t2_akt=1`, `t2_akt_qator=0`, tasdiqlangan F2 aktlari `0`, qoralama F2 aktlari `1`, LRV view `1`; null qiymatlar manbada saqlanadi. |
| `native_routes` | Native T2 Smeta/Fakt/F2/F2 tarixi/F2 tayyorlash yo‘llarida eski `apiHolatOl`, `apiHolatSaqla` va `gas()` bog‘liqligi topilmadi; R2 oldindan yuklash va price-control adapterlari source darajasida mavjud. |
| `sheets_bridge` | Ko‘prik kodi, yashirin canonical ID/version/hash va setup hujjati mavjud; egasi tomonidan aktivlashtirish hamda haqiqiy ikki tomonlama round-trip hali bajarilmagan. |
| `verification` | `tsc`, build, barqaror Vitest `52 fayl / 271 test`, lint `0 error`, `tekshir`, governance va `git diff --check` — PASS. |
| `release_status` | `SOURCE_READY / INTEGRATION_UPDATED / PREVIEW_DEPLOYED`; main va Cloudflare Production o‘zgartirilmadi. |

# 2026-09-06 — T2 daily native LRV: so‘nggi deploy checkpointi

Ushbu addendum eng so‘nggi masofaviy va runtime tekshiruvini qayd etadi.
Avvalgi addendumlar tarixiy dalil sifatida saqlanadi.

| Field | Current value |
|---|---|
| `integration_sha` | `46a68a3c11c146b41e03f3f2344712348dde0490` — `origin/integration/next-main-release-v1`. |
| `main_sha` | `6d64f66d7cbe71fc3a145b86bc1de505a8de1f0d` — oxirgi governance checkpointidagi `origin/main`; keyingi hujjat commiti faqat shu holatni qayd etadi. |
| `cloudflare_deploy` | Cloudflare Pages deploy `97676085.smeta-tizimi.pages.dev`; GitHub Cloudflare check muvaffaqiyatli, deploy `6d64f66` main commitidan yaratilgan. |
| `runtime_smoke` | `/` va `/admin/fakt` — HTTP 200; `/api/soglik` — HTTP 200, kerakli muhit belgilarini va `service_role` kalit rolini ko‘rsatdi; `/api/sessiya` va `/api/hujjat-royxat` anonim so‘rovga mos ravishda 401 qaytardi. |
| `r2` | `wrangler.toml` ichida private `R2_CANONICAL` → `smeta-tizimi-canonical`; public access yo‘q. |
| `production_migration` | `t2_fakt_belgila_v2` live katalogda `20260906120454` sifatida mavjud; real biznes qatoriga sinov yozuvi kiritilmagan. |
| `preapproval_ui` | F2 import oqimida faqat istisnolar oynasi ishlatiladi; toza qatorlar qayta chizilmaydi, F2 summasi UI tomonidan o‘zgartirilmaydi. |
| `verification` | `tsc`, functions typecheck, barqaror Vitest `52 fayl / 263 test`, build, lint, `tekshir`, governance va `git diff --check` — PASS. |
| `authenticated_smoke` | To‘liq login va biznes vertikal smoke bu muhitda egasining haqiqiy sessiyasini talab qiladi; anonim xavfsizlik smoke’i PASS. |

# 2026-09-06 — T2 daily native LRV: canonical Fakt jami tahriri

Ushbu addendum quyidagi eski jadvaldan ustun bo‘lgan eng so‘nggi tekshirilgan
holatni qayd etadi.

| Field | Current value |
|---|---|
| `candidate_sha` | `f527200a0ce119086ea9c38c43e96c5dbc850ed4` — native Fakt jami tahriri, gateway allowlist va regressiya testi. |
| `production_migration` | `20260906120454 t2_fakt_belgila_v2` live katalogda mavjud; qo‘llanishi faqat additive DDL bo‘ldi, biznes qatorlariga yozuv qilinmadi. |
| `fakt_web_contract` | `/admin/fakt?obyekt=<id>` endi `Ustiga qo‘shish` (`t2_fakt_yoz_v2`) va `Jami qiymat` (`t2_fakt_belgila_v2`) rejimlariga ega. Ikkinchi rejim joriy Faktni `expected_fakt_hajm` bilan tekshiradi va eskirgan qiymatni `FAKT_CONFLICT` bilan rad etadi. |
| `fakt_safety` | Actor server sessiyasidan olinadi; obyekt/qator munosabati va operation UUID RPC’da tekshiriladi; muvaffaqiyatsiz yoki ziddiyatli natijadan keyin UI kanonik qiymatlarni qayta yuklaydi. |
| `verification` | Focused 3/3, full stable Vitest 52 fayl/263 test PASS, functions typecheck PASS, build CPU-affinity bilan PASS, lint 0 error, `tekshir` PASS, governance PASS. |
| `production_deploy` | Ushbu candidate hali Cloudflare Production’ga chiqarilmadi; main/integration release keyingi merge va deploy tekshiruvigacha `73c3a817...` holatida edi. |

# TIZIM_02 current state

Replaceable measured state, not a journal. Last checked: 2026-09-03 — NEXT-MAIN-RELEASE-V1 shipped, then two P0 security hotfixes applied directly to prod, then T2-COMPANY-CONTROL-FOUNDATION-001 integration (Codex v1 auth core + fix/company-context-p0 reconciled, 3 backend migrations authored) under a re-engaged production freeze, then T2-COMPANY-CONTROL-CLOSEOUT Phase A: Codex auth core v2 superseded v1 (platform role has no separate table), Antigravity's 3 confirmed P0s closed (role integration, route guards, Control Center tabs). Phase B (T2-GAS-EXIT-LRV-CONTROL-001 foundation contracts) follows in the same session.

| Field | Current value |
|---|---|
| `main_sha` | `9462a361fb249da36aab8141428cc95c17e8a0d6` (verified remote — NEXT-MAIN-RELEASE-V1 `--no-ff` merge of `integration/next-main-release-v1 @ 3af5afa`; previous main `b6db686`) |
| `release_candidate` | **RELEASED.** `integration/next-main-release-v1 @ 9462a36` == `origin/main`. NEXT-MAIN-RELEASE-V1 + SMETA/F2/NAKOPITELNIY + Codex document-fidelity + visible workbench route + PGRST125 fix + F2 import P0. Cloudflare Pages deploy `9462a36` → **Deploy successful**; production smoke green (see `release_smoke`). |
| `production_write_allowed` | **false** (reset post-release). NREL-001 was owner-authorized for THIS release only: Supabase migrations applied, `main` pushed, Cloudflare production deployed. GAS not deployed (not required). |
| `release_smoke` | 2026-09-02 post-deploy, non-destructive: `POST /api/kirish` (junk creds) → **401** (NOT 503 CONFIG) ⇒ `SESSIYA_KALIT` confirmed set on **Production**. `/api/{sessiya,boss-dashboard,system-control,company,hujjat-nazorat,hujjat-royxat,hujjat-ol,gas}` → all **401 AUTH_REQUIRED** (live + fail-closed, no 5xx). `/api/kirish-diag` → 200 SPA fallback (route removed as intended). `/`, `/admin/hujjat-nazorat`, favicon, manifest, JS chunks → 200. Prod RPCs `t2_workbench_v1 / t2_nakopitelniy_v1 / t2_obyekt_yakunlash_v1 / t2_smeta_ozgarish_royxat_v1 / t2_boss_dashboard_v1 / t2_system_control_v1 / t2_men_v1` → all `ok:true`. **Authenticated deep smoke (login → dashboard → upload PDF → download) remains owner-only** — Claude cannot log in. |
| `smeta_f2_nakopitelniy` | **APPLIED to production 2026-09-02.** Migrations `t2_f2_baseline_price_v1` / `t2_smeta_change_control_v1` / `t2_forma3_closeout_v1` + hotfix `t2_smeta_ozgarish_royxat_fix` (recorded as `20260901210044`–`20260901210934`; repo files `20260910/11/12/13120000`). F2 price-fact split A/B/C/D + `t2_smeta_revision` original-baseline ledger + `t2_nakopitelniy_v1` bounded STABLE cumulative; governed `t2_smeta_ozgarish` change control (atomic preflight-then-apply, zero partial mutation, compensating-revision reversal, optimistic lock); `t2_forma3` UNRESOLVED boundary (no legal/tax/payment total or column); `t2_yakunlash_talab` data-driven closeout pack; `t2_obyekt_yakunlash_v1` + `t2_workbench_v1` → `ConstructionDocumentControlReadModel`. **Live smoke passed**: all 6 read RPCs return `ok:true` for object 8; zero rows written to the 3 new business tables (read-only STABLE). `get_advisors security` after DDL: only INFO `rls_enabled_no_policy` on the 6 new tables (intended — access is via `revoke`d `security definer` RPCs only); no new ERROR/WARN. Pre-use-only rollbacks in repo. Guard `t2_smeta_f2_nakopitelniy.test.cjs` (74 checks). Regression oracle = MATCH:1 / INTENTIONAL_CHANGE:2 / UNRESOLVED:1 / **BUG_FOUND:0**. |
| `hujjat_nazorat_workbench` | **SOURCE_READY** (needs Cloudflare deploy → still on SESSIYA_KALIT) — `/api/hujjat-nazorat` gateway (session→actor→canonical RPCs, no Drive/Sheets/GAS), `src/api/t2-document-control.ts` (4 generic port bindings + SQL-model→pure-engine normalization: requirement/doc type mapping, null→undefined on CertifiedLine), `/admin/hujjat-nazorat` renders the Codex `<ConstructionDocumentWorkbench>` with loading/error/not-applied/empty states. Route + nav + title + allowlist wired. Adapter test (3) + guard checks. |
| `codex_integration` | Codex hit usage limit; Claude took over. Merged: `codex/park-regression-lab-v1` (`f6d04c3`, pure PARK engine + legacy oracle), `codex/park-closeout-lab-v1` (`769c06b`), `codex/construction-document-control-workbench-v1` (`5586eb5`, generic engine + 4 ports + validators + UI). Codex uncommitted worktree work checkpointed as `87b2b31` and pushed to its branch before integration. Unrelated Commercial/Procurement/Schedule V3 branches NOT merged. Engine O(n²) rescan fixed (`640b6c3`): 10k-row valuation 3.35s→~35ms. `park-document-control` kept as reference/fixture namespace; canonical schema is already generic (`t2_smeta_*` / `t2_nakopitelniy_*` / `t2_workbench_*`). |
| `storage_STOR_001` | **LIVE** — DB migrations applied, GAS deployed (v378), frontend on main (`/admin/storage`). |
| `file_truth_FILE_TRUTH_001` | **LIVE (source + DB).** Private `R2_CANONICAL` binding in `wrangler.toml` (bucket `smeta-tizimi-canonical`), two-phase reserve/finalize/reconcile, Drive managed-move write-back, Document Center registry read model, Sheets write-back reference. DB applied. GAS replica workers (`98_/99_`) NOT deployed — deferred P1-A (need trigger + `REPLICA_SYNC_SECRET` wiring; `REPLICA_SYNC_SECRET` is already set in Cloudflare). |
| `boss_panel` | **LIVE** — canonical `t2_boss_dashboard_v1` + `/admin/dashboard`; `/api/boss-dashboard` deployed (401 AUTH_REQUIRED unauth). |
| `ctrl_001` | **LIVE** — capability registry (`t2_capability` / `_override` / `t2_job` / `t2_integration_health` / `t2_deploy_state`), precedence resolver `t2_capability_effective_v1` (project>company>global>default + kill-switch), audited commands, `t2_system_control_v1`. `/api/system-control` deployed. |
| `company_auth_director` | **LIVE** — **P0 fix live**: `t2_kirish_royxatga_ol` no longer auto-joins a new user to every company (`ok_no_autojoin` verified in prod). `t2_kompaniya_yarat_v1`, `t2_men_v1`, director-guarded `t2_azolik_*_v1`, `t2_royxat_sorov_qabul_v2`. `/api/company` deployed. No subscription/payment. |
| `document_center` | **LIVE** — `/api/hujjat-royxat` → `t2_document_registry_v1`; `/admin/documents` renders the real Codex `DocumentCenter`; download → private R2 `/api/hujjat-ol` (fail-closed). A failed Drive replica is never a canonical failure. |
| `codex_ui` | document-center + participants + system-control + app-identity integrated; participants read real `t2_loyiha_qatnashchilar_royxat`; system-control + documents wired to real backends (this task). |
| `security_p0` | **LIVE** — hardcoded `ZAXIRA` auth-secret fallback removed; `_shared/auth.ts` fails closed; login returns 503 CONFIG (no cookie) when `SESSIYA_KALIT` unset. Confirmed on prod: `SESSIYA_KALIT` IS set (login path returns 401 not 503). `t2_security_p0.test.cjs` (41 checks). |
| `smeta_f2_workbench` | **LIVE** — `/api/hujjat-nazorat` gateway (session→actor→canonical RPCs, no Drive/Sheets/GAS) deployed (401 AUTH_REQUIRED unauth); `/admin/hujjat-nazorat` renders Codex `<ConstructionDocumentWorkbench>`. Codex `document-fidelity-release-v1` (bc4248e) merged: F2 projection fidelity, deterministic export, `~`/`+` legacy marker compat, no banner rows, no NAIMENOVANIE mutation. `pre-main-release-qa-v1` (4125ef6) adversarial QA merged. |
| `pgrst125_fix` | **LIVE** — `_shared/supabase-url.ts` `supabaseBaseUrl()` strips a trailing `/rest/v1` from `SUPABASE_URL` before appending, at all 16 Supabase call sites. Root cause was the wrong Cloudflare dashboard field copied into `SUPABASE_URL`; the value is still technically wrong but tolerated. Owner may still clean up the raw value. |
| `errcode_25006_p0` | **LIVE — applied to prod 2026-09-03**, migration `20260903050000_t2_actor_azo_tekshir_remove_for_share_p0.sql`. `t2_actor_kompaniya_azo_tekshir` used `select ... for share`; PostgREST always wraps a `STABLE`-marked RPC call in a read-only transaction (independent of GET/POST or which Supabase key calls it), and `FOR SHARE` cannot run in a read-only transaction — SQLSTATE `25006`. This broke, for real PostgREST traffic, every STABLE RPC that transitively calls the helper: `t2_boss_dashboard_v1` (Boss Dashboard), `t2_document_registry_v1` (Document Center), `t2_system_control_v1` (System Control — the owner-reported `25006`), `t2_workbench_v1`, `t2_nakopitelniy_v1`, `t2_obyekt_yakunlash_v1`, `t2_forma3_royxat_v1`, `t2_smeta_baseline_asl_v1`, `t2_smeta_ozgarish_royxat_v1`, `t2_azo_actor_director_tekshir`. Earlier "ok:true" verification of these RPCs used raw SQL execution (bypasses PostgREST's read-only wrapping) and never caught this. Fix: drop the lock (only protected a narrow check-then-write race for VOLATILE write-command callers; irrelevant and actively broken for STABLE read-model callers). Reproduced exactly (`begin; set transaction read only; select ...` → same SQLSTATE/line), fixed, re-verified all 9 directly-testable RPCs return `ok:true` under a simulated read-only transaction, and confirmed live via PostgREST HTTP (anon key now gets the *correct* `42501` permission-denied, not `25006`). Rollback paired; PRE-USE semantics don't apply here (no business data touched, pure function body swap). |
| `legacy_rpc_open_grants_p0` | **LIVE — applied to prod 2026-09-03.** `t2_kompaniya_yangila` and the unversioned `t2_azolik_qosh`/`_rol_ozgartir`/`_ochir`/`t2_royxat_sorov_qabul` had `EXECUTE` granted to `PUBLIC`/`anon`/`authenticated` with zero actor/tenant check — full incident record in `ops/handoff/T2_COMPANY_CONTROL_SECURITY_INCIDENT_2026-09-03.md`. Revoked (service_role only, matching every other write RPC); `sb-yoz.ts`'s `azolik_*` dispatcher rerouted to the already-guarded `t2_azolik_*_v1` RPCs; `kompaniya_yangila` gets an interim Cloudflare-layer director check pending `t2_kompaniya_yangila_v1` (source-only, see the Company Control contract). |
| `supabase_key_role` | **⚠️ MISCONFIGURED** — Cloudflare Pages `SUPABASE_KEY` on **Preview** (and almost certainly **Production**) is the **anon / publishable** key, not **service_role**. Proven anonymously on the live Preview: `GET /api/soglik` → `canonical_rpc_http_status: 401`, `supabase_key_role: "anon_or_low"`. DB evidence: `t2_men_v1` / `t2_boss_dashboard_v1` / `t2_workbench_v1` / `t2_nakopitelniy_v1` / `t2_system_control_v1` are granted to `{postgres, service_role}` only (anon → 42501); `t2_kirish_royxatga_ol` is granted to PUBLIC. So **login succeeds but every canonical `/api/*` endpoint returns permission-denied** — the owner's authenticated smoke FAIL. **Fix is owner-only** (Claude has no Cloudflare access): set `SUPABASE_KEY` = service_role for **Production AND Preview**, redeploy. Then `/api/soglik` must report `service_role`. Permanent `/api/soglik` health probe (anon-safe) exists so this class of misconfig is caught before an owner smoke. |
| `company_context_fix` | **PHASE A CLOSED (T2-COMPANY-CONTROL-CLOSEOUT, 2026-09-03)** — `fix/company-context-p0 @ 71cc123` reconciled into `integration/next-main-release-v1` (source/integration only, production freeze active — **not** merged to `main`). `KompaniyaProvider` lives in `AdminShell`, fed by canonical `t2_men_v1` memberships; context bar + superadmin "Global rejim"; localStorage persist (actor-namespaced) + `qc.clear()` on switch + logout-clears-context; `routeScope.ts` (GLOBAL/COMPANY/PROJECT/OBJECT); `tsconfig.functions.json` + `@cloudflare/workers-types` real type gate for `frontend/functions/**`. **Platform-role model: FINAL is `codex/t2-company-control-auth-core-v2` (`2849d9b`)** — the platform-role migration `20260914120000_t2_platforma_superadmin_context_v1` AND Codex v1's separate `t2_platforma_rol`/`t2_platforma_kompaniya_kontekst` tables are BOTH superseded/removed; the live model derives the platform signal from any active `t2_azolik` row with `rol in (superadmin, admin)` — no parallel truth table, per explicit owner directive ("Stale V1 modelga qaytma"). `KompaniyaKontekst.tsx`'s `superadmin` derivation already matched this (no rewire needed). Antigravity's FINAL-AUDIT-002 3 confirmed P0s are now CLOSED: (1) `AdminShell` reads the active company's own membership role (`useKompaniya().joriy.rol`) via a `KompaniyaProvider`-wrapped `AdminShellInner`, not the global `sess.data?.rol`; (2) `RuxsatGuard` wraps `<Outlet/>` and calls the new `GET /api/company?authorize=1` (real `t2_effective_authorization_v1` check) before rendering any `COMPANY_SCOPED`/`PROJECT_SCOPED`/`OBJECT_SCOPED` route, with a professional "Ruxsat yo'q" screen on denial; (3) `/admin/kompaniya` is a 7-tab Company Control Center (Profil real-write via new `t2_kompaniya_yangila_v1` wiring / A'zolar / Rollar-Ruxsatlar / Modullar / Loyiha-Obyekt honest-empty / Integratsiyalar / Audit — last 3 reuse the existing `t2_system_control_v1` read model). System Control global/company split (`t2_system_control_global_v1` + `t2_control_global_write_guard_v1`, source-only) now reaches the frontend: `GET /api/system-control` with no `kompaniya_id` is the platform-role-gated global view; global-scope POST writes are re-checked against the write guard before the existing command RPC (defense in depth for "Company boss: platform-wide kill switch boshqara OLMASIN"). Gates green: `tsc -b`, `tsc -p tsconfig.functions.json`, `vite build`, `oxlint` 0 errors, `npm run tekshir` (63 checks / 3 oracles), `vitest` 128/128 (`--no-file-parallelism`). **Owner authenticated Preview smoke still required before any `main` merge**, and `SUPABASE_KEY` must be `service_role` in both Production and Preview first. **NEXT:** Antigravity re-audit against `c52ba4f` (their FINAL-AUDIT-002 was against `9d9ba3d`, before this fix). |
| `production_frontend` | Cloudflare Pages `smeta-tizimi.pages.dev`, auto-build from `main`. |
| `production_db` | Supabase `tuoyrzadkgoltpqkdiyx`. **All NREL-001 migrations APPLIED** (live catalog verified 2026-09-02): SMETA/F2/NAKOPITELNIY (`t2_f2_baseline_price_v1` / `t2_smeta_change_control_v1` / `t2_forma3_closeout_v1` / `t2_smeta_ozgarish_royxat_fix`), FILE-TRUTH (`t2_file_truth_r2_canonical_v1` + `_provider_check_fix` + `_status_check_fix` + `_constraint_vocab_fix_v1`), `t2_boss_dashboard_read_model_v1`, `t2_capability_registry_v1`, `t2_company_onboarding_v1`, `t2_document_registry_read_v1`, `t2_document_replica_move_v1`, `t2_sheets_writeback_reference_v1`. Applied under prod versions `20260901210044`–`20260902104218` (repo filenames use later `2026091x` stamps — content matches; verified by `pg_proc`/`to_regclass`). Repo-vs-prod drift on `t2_resource_command_v2` / `t2_mindmap_request_identity_v2` still tracked (pre-existing, not in this release). |
| `release_blockers` | **RESOLVED.** (1) SESSIYA_KALIT — confirmed set: Preview `kirish-diag` (`bor:true`, 86 chars, no whitespace) + Production `POST /api/kirish` returns 401 not 503. (2) Cloudflare deploy — `9462a36` deployed successfully. (3) Authenticated deep smoke — still owner-only, non-blocking (anonymous fail-closed + RPC smoke all green). (4) Real Drive Forma-2/Smeta template study + F2 document-fidelity acceptance (A–L) — **still deferred**, needs Drive access; contract locked (marker + canonical relation + hidden system columns, never banner rows / NAIMENOVANIE edits), Codex `document-fidelity-release-v1` implemented the projection side. |
| `agent_control_plane` | `docs/governance/AGENT_COMMS_PROTOCOL.md` on `codex/agent-comms-protocol-v1` (not merged). Task truth: `ops/ACTIVE_TASKS.json`. `tizim02/MULOQOT.md` = append-only history. |
| `branches` | `ops/handoff/BRANCH_RECONCILIATION_NEXT_RELEASE.md`. Nothing deleted. Backlog kept: `universal-estimate-engine-v1`, `design-system-v1`, `storage-quota-ui-v1`, `agent-comms-protocol-v1`. |
| `roadmap` | `docs/architecture/CONSTRUCTION_OS_MASTER_ROADMAP.md` |
| `release_runbook` | `ops/releases/NEXT_MAIN_RELEASE_V1.md` |
| `continuation` | `ops/handoff/NEXT_MAIN_RELEASE_CONTINUATION.md` |
| `repo_health` | Two loose objects flagged bad by `git gc` (`f94fa32…`, `fb937515…`, both `(1)` partials) — not referenced by any branch; all release-candidate commits intact and pushed. Pre-existing detritus. |
| `broken` | No disposable Supabase branch (only `main`). |
| `gas` | **NOT deployed this release — not required.** `frontend/functions/api/gas.ts` unchanged vs old main; no new GAS `fn` calls added. `Smeta tizimi/98_/99_` replica-worker edits are source-only, run on GAS time-triggers (not created), deferred P1-A. |
| `deferred_p1` | T2-GAS-EXIT-001 (F2 engine off GAS — `ops/handoff/T2_GAS_EXIT_001.md`). GAS replica worker deploy + triggers + controlled Drive backfill pilot (P1-A). Real Drive Forma-2/Smeta template study + F2 document-fidelity acceptance A–L. `SUPABASE_URL` raw-value cleanup in Cloudflare. `tsconfig.functions.json` + `@cloudflare/workers-types` gate for `frontend/functions/**` (currently not type-checked by `tsc -b`). |
| `lrv_control_foundation` | **EXACT-F2-INTEGRATION DRAFTED (T2-LRV-EXACT-F2-INTEGRATION-003, 2026-09-03)** — corrects a wrong call from the earlier foundation pass: `t2_akt_qator.summa` being Postgres `GENERATED` (`hajm*narx`) is a **P0**, not a non-issue — it makes it physically impossible to store a certified F2 amount that differs from `qty*price` (owner's own example: qty=10, price=123.45, document amount=1234.49 — the generated column forces 1234.50). Fixed additively (source-only): new plain `certified_quantity/unit_price/amount` columns on `t2_akt_qator` (`20260920120000`, legacy `hajm`/`narx`/`summa` untouched) + a new parallel `t2_akt_yarat_v2` RPC (`20260920130000`) with **no smeta-price fallback at all** (`MISSING_CERTIFIED_PRICE`/`MISSING_CERTIFIED_AMOUNT` reject the batch) — legacy `t2_akt_yarat` unchanged, still used by `Smeta tizimi/T2_F2Import.js`. **Caller audit, code-cited not guessed** (`T2_BRIDGE_CALLER_AUDIT_003.md`): GAS `T2_F2Import.js` sets `narx_yoq` correctly (safe); both Tizim_02 frontend F2 paths (`TestF2Import.tsx`, `TestF2.tsx`) never send it and `sb-yoz.ts` stripped it even if they did — fixed (`sb-yoz.ts`/`supabase.ts` now pass `narx_yoq` through; zero behavior change until a caller opts in, no frontend caller does yet). `codex/t2-lrv-canonical-core-v1` (`bbf55c8`) reconciled: semantics ACCEPTED in full, its 11 new `t2_lrv_*` tables REJECTed as parallel truth and ADAPTed onto `t2_qator`/`t2_akt_qator` instead; its sync envelope became `20260920140000_t2_lrv_sync_envelope_v1` (generic `entity_table`+`entity_id`, schema only). GAS bridge writer (`T2_Kozgu.js`) audited with line citations: un-correlated blanket outbox-close PATCH, silently swallowed errors, 60s time-window echo suppression instead of event-id — confirmed, **not fixed** (GAS deploy out of scope under the freeze). All 3 new migrations live `BEGIN`/`ROLLBACK` verified together against real data. Nothing applied to production. **UPDATE (T2-REAL-PARK-LRV-VERTICAL-SLICE-004, same day):** reconciled two more Codex branches (`t2-lrv-exact-f2-adapter-v1` 3591e37, `t2-lrv-price-control-core-v1` 5d0bff1), added the actor-authorization check Codex correctly flagged as missing, fixed a reachability bug in Codex's own price-state classifier, shipped a live-tested Price Control core (`t2_price_basis`/`t2_price_basis_line`, `t2_price_control_v1` — frozen/at-risk/basis-justification, every owner worked example PASS) and a real (non-demo) "Narx nazorati" UI tab at `/admin/test/smeta` wired to it. **⚠️ Incident during this pass**: a large hand-typed combined SQL test left empty schema (no data) live in production for a few minutes due to a stray `commit;` in the pasted text — found, fully reverted, confirmed clean; testing methodology corrected (small isolated tests + mandatory post-rollback verification query going forward). Still open: `TestF2Import.tsx`/`TestF2.tsx` frontend migration to v2, read-model updates, additional/replacement write commands, catalog pipeline live wiring, GAS bridge source fix — see `T2_REAL_PARK_LRV_VERTICAL_SLICE_004.md`. |

## Evidence boundary

`main_sha` and the release SHAs measured from `git ls-remote origin` 2026-09-02
evening. Production DB state measured from the live Supabase catalog (`list_migrations`,
`pg_proc`, `to_regclass`). Cloudflare deploy status from the public GitHub
check-runs API for commit `9462a36` ("Deploy successful"). Production smoke is
**non-destructive and anonymous** — endpoint liveness + fail-closed behavior +
read-model RPC `ok:true`; it does **not** include an authenticated end-to-end
user flow (login is a prohibited action for Claude). `tizim02/MULOQOT.md` is an
append-only historical journal, not current state — this file is the only
current-state authority.
# 2026-09-06 — T2 daily PTO native cutover addendum

Quyidagi yozuvlar ushbu fayldagi eski release jadvalidan ustun bo‘lgan eng so‘nggi
tekshirilgan holatdir. Eski jadval tarixiy dalil sifatida saqlanadi.

| Field | Current value |
|---|---|
| `main_sha` | `5edc7f31bc2536f69f7a555348479fd8de46ded2` — integration va `origin/main` bir xil. |
| `production_deploy` | Cloudflare Pages `main` → `5edc7f31bc2536f69f7a555348479fd8de46ded2` deployi `success`; deploy URL `6b78875b.smeta-tizimi.pages.dev`. |
| `daily_native_routes` | `/admin/obyektlar`, `/admin/holat/:id`, `/admin/fakt`, `/admin/f2`, `/admin/f2-tayyorlash` native canonical yo‘llarga ulangan; `/admin/narxlar` native rejimni odatiy holatda ochadi. |
| `lrv_workbench` | `/admin/holat/:id` faqat raqamli `t2_obyekt.id` bilan daraxt, Faktga o‘tish, native smeta importi, qo‘shimcha/zamena/resurs, resurs vedomosti va narx nazoratini bitta kontekstga birlashtiradi. Yopiq panellar oldindan API chaqirmaydi. |
| `old_gas_boundary` | Kundalik native LRV/Fakt/F2/F2 tayyorlash oqimi eski GAS biznes dvigateliga qaytmaydi. Eski modullar faqat compatibility/arxiv yo‘llari sifatida qolgan. |
| `production_migrations` | T2 native LRV uchun kerakli besh additive migration live katalogda mavjud; `t2_fakt_yoz_v2` ham qo‘llangan. Ushbu checkpoint yangi production migration qo‘llamadi. |
| `sheets_bridge` | Kod va ko‘prik kontrakti tayyor, lekin real Google trigger/Sheet↔Supabase acceptance hali egasi tomonidan faollashtirilmagan. |
| `remaining_evidence` | Authenticated production deep-smoke egasining real sessiyasini talab qiladi; bu muhit parol yoki cookie olmagan. |

# 2026-09-20 — Owner authorization va governance checkpoint

Quyidagi yozuv ushbu fayldagi oldingi tarixiy jadvaldan ustun bo‘lgan joriy
checkpointdir. Eski yozuvlar o‘zgartirilmaydi.

| Field | Current value |
|---|---|
| `main_sha` | `0079c4a7aeed94f241744494340e8d77eae67f26` — `origin/main` dan remote tekshirildi. |
| `integration_sha` | `e22a0f1218264bfd7d3bb234e0ca6e5cf4ab5477` — shartnoma qamrovi/nakrutka hardening integration branchga push qilindi. |
| `owner_authorization` | ACTIVE — routine branch, commit, push, merge, additive safe migration, normal deployment va release ishlari uchun qayta-qayta approval so‘ralmaydi. |
| `hard_stops` | Destruktiv o‘chirish, TRUNCATE/DROP/reset, qaytarib bo‘lmaydigan data rewrite, secret rotation, yangi pullik majburiyat va tiklab bo‘lmaydigan tashqi xavf. |
| `production_change_boundary` | Ushbu checkpointda production main, production baza, secret va deploy o‘zgartirilmadi. |
| `governance_warning` | `governance-check.cjs` endi append-only CURRENT_STATE ichidagi eng yangi `main_sha`ni va mavjud bo‘lsa `origin/main`ni solishtiradi. |

# 2026-09-25 — PTO liniya checkpoint (Smeta anatomiya + Oferta V2)

| Field | Current value |
|---|---|
| `main_sha` | `bd5ddb485937ef83619114e9457d35fd14b7cefd` — `origin/main` (Tender Oferta V2) remote tekshirildi; Cloudflare Pages check `completed success`, `/api/soglik` ok. |
| `landed` | Smeta anatomiya moduli (ichma-ich RZ, svod bog‘lash, erkin varaqlar), import sifat qo‘riqchisi, RES → bir nechta LRV (checkbox), Ostatka Excel, LRV eksport ($ siz formulalar, BL birlik narxi), Fakt qisman yangilash, read-model tezlik kontrakti, Tender Oferta V2. |
| `production_migrations` | `20261028090000_t2_qator_holat_obyekt_filtr_v1`, `20261028091000_t2_obyekt_read_model_filtr_v2` (owner ruxsati bilan; additive view qayta ta’rifi, rollback bor). |
| `open_owner_decisions` | `t2_qator_holat` anon SELECT grant; `/api/agent/call` (Hermes) yo‘nalishi; ruflo hook shell:true; "Suniy Ko‘l" (84) 2413 dublikat vedomost qatori — qayta import kerak; ТЕПЛОТРАССА 02-04/02-05 −1.70 чел-ч. |
| `remaining_evidence` | Authenticated live smoke (Suniy Ko‘l 2 import, fakt, ostatka, oferta) egasining sessiyasini talab qiladi. Excel COM tekshiruvi ofis PC real fayllarida. |

# 2026-09-25 (kech) — PTO liniyasi yakuni: hujjat standarti (PTO-LINIYA-YAKUN-001)

| Field | Current value |
|---|---|
| `main_sha` | `d3c89e886faec2fbf92e3fe1b08e2205fd58d5fb` — PTO liniyasi kod commit'lari + origin/main merge; shu addendum commit'i undan keyin (bir qadam). Yakuniy deploy SHA — `ops/handoff/PTO_LINIYA_YAKUN_HISOBOT_2026-09-25.md`. |
| `base_sha` | `e0d44855d193e960e75283df7fa73ec32ac8482d` |
| `landed` | `frontend/src/lib/hujjat-yozuvchi/` (asl hujjatni davom ettirish + noldan rasmiy hujjat + H1–H9 tekshiruvchi); barcha PTO eksportlari hujjat standartida: Oferta, paket svodi, LRV_PLUS/Forma-2 (ЛРВ), Ведомость остатка работ, Накопительная ведомость, АКТ Ф-2 (TN), Проект акта Ф-2, Ресурсная ведомость, PTO hujjat (Excel+PDF). Kontrakt: `docs/architecture/HUJJAT_STANDARTI_V1.md`. |
| `fixed_bugs` | LRV_PLUS nakrutka ИТОГО-3 Excel formulasi noto'g'ri qatorga havola qilardi (sayt ≠ Excel); narxsiz bargda Excel 0 chiqarardi (NULL→0); Nakopitelniy/Ф-2 eksporti RPC 500-qator chegarasida jimgina chala hujjat yasardi. |
| `adaptive_columns` | `smeta-anatomiya/ustun-dalil.ts`: hajm × narx ≈ summa isboti — anatomiya, F2 import, Oferta, RES narxlash (egasi so'rovi). |
| `perf` | Daraxt yo'li kerakli ustunlar (sintetik 27k: t2_daraxt −26 %, t2_qator_holat −40 % payload); Excel o'qish Web Worker da. Jonli <4 s — o'lchanmagan (UNKNOWN). |
| `production_changes` | Yo'q: migratsiya, DDL, real ma'lumotga yozish qilinmadi. Production faqat o'qildi (list_migrations, information_schema, agregat SELECT). |
| `open_owner_decisions` | `ops/handoff/PTO_EGASI_QARORLARI_2026-09-25.md` Q1–Q13 (Forma-3 qoidasi, Ф-2 НДС asosi, RPC smeta_summa ikki marta sanash, 3000 qator chegarasi, anon grant, Hermes marshruti, Suniy Ko'l 84, ТЕПЛОТРАССА, Faravon, АОСР/ijro hujjatlari integratsiyasi, ustun moslashuvi siyosati). |
| `remaining_evidence` | Microsoft Excel va real fayllar bilan tekshiruv, authenticated live smoke — egasi (UNKNOWN shu muhitda). LibreOffice qayta hisoblash farqi 0 (sintetik namunalar). |

# 2026-09-25 (kechqurun) — Egasi javoblari: Nakopitelniy, sahifalash, НДС, ostatka istisnosi (PTO-EGASI-JAVOB-001)

| Field | Current value |
|---|---|
| `main_sha` | `8df37424f6ea5bd4d8aa053fff96d86e736c9c8c` — egasi javoblari kod commit'lari (d6a7222 ustida); shu addendum commit'i undan keyin. |
| `owner_decisions` | `ops/handoff/PTO_EGASI_QARORLARI_2026-09-25.md`: Q2 (НДС oxirida bir marta, sukut 12 %), Q3 (tuzat — 56 mlrd), Q4 (serverda, avtomat), Q12 (АОСР va ijro hujjatlari T2 ga to'liq — blanklar kutilmoqda), Q13 (avtomatik + izoh) — javob berildi. |
| `production_migrations` | `20261101090000_t2_nakopitelniy_v2_sahifa_barg_jami` (prod 20260925151924) va `20261101091000_t2_ozgarish_tasdiqlash_signal_bir_marta` (prod 20260925160504) — egasi chatda aniq ruxsat bergan; additiv funksiyalar, rollback fayllari bor. Biznes ma'lumotiga yozuv yo'q (barcha tekshiruvlar tranzaksiyada, rollback). |
| `verified` | Amfiteatr smeta 43 596 859 620,62 (to'g'ri xarajat), nakrutka+НДС bilan 56 623 606 614,37; 28 obyekt acceptance PASS; Suniy Ko'l 27 309 qator 6 sahifada ~2,9 s; ostatka istisnosini tasdiqlash 31,7 s → 5,0 s. LibreOffice qayta hisoblash farqi 0 (19 namuna). |
| `landed` | Накопительная: НДС 12 % oxirida (tahrirlanadi), smeta nakrutka izohi; mijoz avtomat sahifalash; Ostatka: «ИСКЛЮЧЕНО ИЗ ОСТАТКА» + LRV sahifasida «Bajarilmaydigan / bekor qilingan ishlar» paneli. |
| `open_owner_decisions` | Q1 Forma-3; Q5–Q9, Q11; Q12 uchun real blanklar va F2 bloklash/ogohlantirish (`ops/handoff/IJRO_HUJJATLARI_T2_REJA_2026-09-25.md`). |
| `remaining_evidence` | Real login bilan brauzerda: Suniy Ko'l Nakopitelniy Excel vaqti, istisno yaratish/tasdiqlash — UNKNOWN (egasi sessiyasi kerak). |

# 2026-09-26 — F3 (Форма № 3, счет-фактура) T2 native — T2-FORMA3-F3-001

| Field | Current value |
|---|---|
| `main_sha` | Base `30f663355e9aa01563f21b16ff6307b4168e89e1`. F3 kod commit‘lari `claude/forma3-f3-v1` branch‘da; shu addendumdan keyin origin/main ga merge + push (deploy avtomat, owner standing authorization). Yakuniy deploy SHA — `ops/handoff/T2_FORMA3_F3_001.md`. |
| `landed` | `lib/forma3-export.ts` — F3 rasmiy hujjat (RasmiyVaraq): 4 pul ustuni (сметная / с начала строительства / с начала года / за отчетный период — H/I/J FAQAT tasdiqlangan F2, manba t2_f2_tafsilot), РАЗДЕЛ → ish turlari → ИТОГО ПО РАЗДЕЛУ → ИТОГО ПРЯМЫЕ ЗАТРАТЫ, oxirida nakrutka podvali har ustunga (server t2_nakrutka_hisobla_v1 kaskadi bilan aynan), eng pastki qator ВСЕГО К ОПЛАТЕ = F2 к оплате jamisi (tiyingacha nazorat, farq — diqqat); NULL ≠ 0; jonli `$` siz formulalar; 255 argument chegarasi — yashirin K/L ustunlari ustidagi SUMIF; tasdiqlangan olib_tashlash СМЕТНАЯ dan chiqadi. UI: Nakopitelniy «Форма № 3» + 👁. Testlar 9/9. |
| `production_migrations` | `20261102090000_t2_forma3_rule_mapped_v1` — prod `schema_migrations.version = 20260926125938` (2026-09-26): `t2_forma3_yarat_v1` endi `qoida_holat=‘FORMA3_RULE_MAPPED’` + `qoida_manba=‘EGA_QAROR_B_NAKRUTKA_KASKAD_V1…’` yozadi. Additive (faqat create or replace function); tranzaksiyada (begin…rollback) test qilingan; rollback fayli bor. Biznes ma’lumotiga yozuv YO‘Q. |
| `owner_decisions` | Q1 (`PTO_EGASI_QARORLARI_2026-09-25.md`) javob yozildi: **B — nakrutka kaskadi**; avans hozir F3 ga kirmaydi; davr ustunlari faqat `holat=‘tasdiqlangan’` F2 dan; qamrov — loyiha (shartnoma) darajasi. |
| `verified` | Amfiteatr (obyekt 77, kompaniya 17) real read-only: 195 razdel / 869 ish / 9 448 barg, NULL smeta = 0, kat noma’lum = 0, прямые 43 596 859 620,83 so‘m; JS kaskad (nakrutkaKaskadJS) = server `t2_obyekt_nakrutka` kaskadi AYNAN (foizlar 0 %, kf=1). Gate‘lar: tsc/functions/oxlint/tekshir 5-5/build/vitest/governance/git diff --check — PASS (t2clean clone‘da). |
| `remaining_evidence` | Real tasdiqlangan F2 bilan «F3 за период ВСЕГО = F2 к оплате» tekshiruvi — UNKNOWN (kompaniya 17 da tasdiqlangan F2 yo‘q; baza bo‘yicha yagona F2 0 qatorli). Brauzer real sinov va LibreOffice/Excel chop — egasi sessiyasi. |

# 2026-09-27 — C1 F3 reconciliation — T2-FORMA3-F3-RECONCILIATION-002

Ushbu addendum F3 implementatsiyasini qayta yozmaydi. U `origin/main` va
production catalog bo‘yicha C1 holatini ajratadi.

| Field | Current value |
|---|---|
| `main_sha` | `681e88a8b9be0751e490cda31c90c485b58c40bc` — F3 code va reconciliation governance commitlari bilan origin/mainga chiqarilgan deployed product SHA. |
| `f3_source` | `VERIFIED REMOTE`: `frontend/src/lib/forma3-export.ts`, focused test va Nakopitelniy UI mavjud. |
| `f3_migration` | `VERIFIED PRODUCTION`: `t2_forma3_rule_mapped_v1` live version `20260926125938`; `t2_forma3_yarat_v1` `FORMA3_RULE_MAPPED` yozadi. Qayta apply qilinmadi. |
| `f3_schema` | `VERIFIED PRODUCTION`: `qoida_holat`, `qoida_manba`, `certified_amount` mavjud; RPC `SECURITY DEFINER`, read model `STABLE`. |
| `f3_live_data` | `t2_forma3` qatorlari `0`; approved F2 qatorlari `1`. Shu sabab real F3-period ↔ F2 `к оплате` tengligi `UNKNOWN`, uydirma PASS berilmaydi. |
| `focused_gate` | `forma3-export.hujjat.test.ts`: `9/9 PASS`; migration static/rollback review: PASS; functions/frontend typecheck: PASS; `npm run tekshir`: PASS; `git diff --check`: PASS. |
| `authenticated_rendering` | `UNKNOWN`: egasining login sessiyasi va Excel/LibreOffice chop dalili kerak; agent parol/cookie so‘ramaydi. |
| `task` | `T2-FORMA3-F3-RECONCILIATION-002` — branch `codex/f3-closeout-v1`; source ownership boshqa agent taskida qolgan. |
# 2026-09-27 — T2 PTO document fidelity release checkpoint

Ushbu addendum eng so‘nggi remote va runtime holatni qayd etadi. Oldingi
addendumlar tarixiy dalil sifatida saqlanadi.

| Field | Current value |
|---|---|
| `main_sha` | `68eabd44abefbb1659800e68adedb78f6be4a8df` — `origin/main` bilan tasdiqlangan. |
| `2026-10-01_night_main` | `8f0a0ee` — narx dalili UI; `fbf78e4` — АОСР ogohlantirishi + laboratoriya roli; `bdf037c` — kompaniya logosi UI + АОСР/laboratoriya reestri Excel; `68eabd4` — Ombor agenti: БЕЗСКЛАД nomzodlari, `bez-sklad.ts` kirill `\b` tuzatildi. |
| `release` | T2 exact certified F2 amount propagation + live Forma-2/Nakopitelniy/Forma-3 formula exports main’ga fast-forward qilindi. |
| `production_migration` | `20260927120004 / t2_workbench_certified_amount_v1` Supabase `tuoyrzadkgoltpqkdiyx` loyihasiga additive migration sifatida qo‘llandi; rollback fayli repoda bor. |
| `supabase_verification` | `t2_workbench_exact_v1` mavjud; `anon`/`authenticated` execute huquqiga ega emas; `service_role` execute qiladi; `certifiedAmount` exact source sifatida qaytadi; amount quantity×price bilan qayta hisoblanmaydi. |
| `cloudflare_production` | Pages deployment `68239d1e-69f9-409e-8aaa-21b126d7a1a8` `success`; trigger commit `d7b9bba5fcf72ac3c204f09838356673fdbd7c27`; `https://smeta-tizimi.pages.dev/api/soglik` HTTP 200 / `ok=true`. |
| `authenticated_smoke` | Owner login/session talab qiladi; bu muhitda tasdiqlanmagan. Real production’da approved F2 `certified_amount` qatori hozircha yo‘q (`approved_exact_rows=0`), shuning uchun concrete amount parity UNKNOWN. |
| `full_vitest` | 699 passed, 8 failed, 12 skipped; timeout/large-XLSX/export va matcher performance thresholdlari. Exact-amount targeted suite yashil. |
| `production_write_allowed` | `false` — keyingi production DDL/DML yoki config o‘zgarishi uchun alohida scope kerak. |
