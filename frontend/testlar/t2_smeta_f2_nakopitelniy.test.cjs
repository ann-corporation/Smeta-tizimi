/* SMETA / F2 / NAKOPITELNIY / CHANGE CONTROL — generic (project-agnostic) canonical model.
   "PARK" is only the reference scenario; NO t2_park_* / park_* canonical entity.
   Additive on the existing t2_qator -> t2_akt -> t2_akt_qator -> t2_qator_holat model. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const R = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
const has = (p) => fs.existsSync(path.join(__dirname, '..', '..', ...p.split('/')));
let ok = 0;
const must = (l, c) => { assert(c, l); console.log('  ✅ ' + l); ok++; };
const N = (s) => s.replace(/\s+/g, ' ');

const m1 = R('supabase', 'migrations', '20260910120000_t2_f2_baseline_price_v1.sql');       const m1n = N(m1);
const m1r = R('supabase', 'migrations', '20260910120000_t2_f2_baseline_price_v1.rollback.sql');
const m1a = R('supabase', 'migrations', '20260910120000_t2_f2_baseline_price_v1.acceptance.sql');
const m2 = R('supabase', 'migrations', '20260911120000_t2_smeta_change_control_v1.sql');    const m2n = N(m2);
const m2r = R('supabase', 'migrations', '20260911120000_t2_smeta_change_control_v1.rollback.sql');
const m2a = R('supabase', 'migrations', '20260911120000_t2_smeta_change_control_v1.acceptance.sql');
const m3 = R('supabase', 'migrations', '20260912120000_t2_forma3_closeout_v1.sql');           const m3n = N(m3);
const m3r = R('supabase', 'migrations', '20260912120000_t2_forma3_closeout_v1.rollback.sql');
const m3a = R('supabase', 'migrations', '20260912120000_t2_forma3_closeout_v1.acceptance.sql');
const doc = R('docs', 'architecture', 'SMETA_F2_NAKOPITELNIY_CHANGE_CONTROL_V1.md');

console.log('\n── Naming: PARK is not a canonical boundary ──');
for (const [n, s] of [['migration 1', m1], ['migration 2', m2], ['migration 3', m3], ['rollback 1', m1r], ['rollback 2', m2r], ['rollback 3', m3r]]) {
  must(n + ': no t2_park_* / park_* canonical entity', !/\bt2_park_|\bpark_project_id\b|create (table|function)[^;]*\bpark\b/i.test(s));
}
must('generic entity names (t2_smeta_revision / t2_smeta_ozgarish / t2_nakopitelniy_v1)',
  /t2_smeta_revision/.test(m1) && /t2_smeta_ozgarish/.test(m2) && /t2_nakopitelniy_v1/.test(m1));
must('binds through canonical ids (obyekt_id / kompaniya_id / qator_id / revision_id / operation_id)',
  /obyekt_id/.test(m1) && /revision_id/.test(m1) && /operation_id/.test(m2));

console.log('\n── Price facts kept strictly separate ──');
must('t2_akt_qator: baseline_narx (A) + narx (B) + actual_narx (C) are distinct columns',
  /add column if not exists baseline_narx/.test(m1) && /add column if not exists actual_narx/.test(m1));
must('narx_manba enum separates smeta / f2_sertifikat / taminot / shartnoma / qol_nomalum',
  /narx_manba in \('smeta','f2_sertifikat','taminot','shartnoma','qol_nomalum'\)/.test(m1));
must('actual_narx is NULL when unknown — never silently the estimate', /actual_narx.*NULL = unknown|NULL when unknown/i.test(m1));
must('acceptance proves actual stays NULL + manba qol_nomalum when no source',
  /actual_narx must stay NULL when no source|q2 narx_manba must be qol_nomalum/i.test(m1a));
must('variance is a stored generated column (certified value vs frozen baseline)',
  /variance_summa numeric\s+generated always as/.test(m1));

console.log('\n── Baseline never drifts / revision lineage ──');
must('t2_smeta_revision ledger: seq 0 = asl (original), seq N = ozgarish', /seq 0 = original baseline|seq 0 = 'asl'/i.test(m1) && /tur in \('asl','ozgarish'\)/.test(m1n));
must('t2_akt / t2_akt_qator stamp the effective revision_id', /add column if not exists revision_id/.test(m1) && /revision_id\)\s*(--|$)/m.test(m1) || /,revision_id\)/.test(m1n));
must('acceptance: a later BOQ re-price does NOT rewrite the historical F2 baseline',
  /BOQ re-price silently rewrote the historical F2 baseline|reprice rewrote baseline/i.test(m1a));
must('acceptance: F2 certified ABOVE baseline AND BELOW baseline both covered',
  /variance should be positive/i.test(m1a) && /variance should be negative/i.test(m1a));
must('acceptance: historical period unchanged after later revision',
  /historical period baseline value changed after later revision|historical period certified price changed/i.test(m1a));

console.log('\n── Nakopitelniy: approved-only cumulative, bounded, stable ──');
must('t2_nakopitelniy_v1 is STABLE + has NO temp table (correctness of volatility/DDL)', (() => {
  const body = (m1.match(/create or replace function public\.t2_nakopitelniy_v1[\s\S]*?\$\$;/) || [''])[0];
  return /language plpgsql stable/i.test(body) && !/create temp table/i.test(body);
})());
must('cumulative uses APPROVED F2 only (a.holat=tasdiqlangan)', /a\.holat='tasdiqlangan' and a\.oy/.test(m1n));
must('draft F2 kept separate (joriy_qoralama_summa)', /joriy_qoralama_summa/.test(m1));
must('previous / current / cumulative / remaining all present',
  /'oldingi_summa'/.test(m1) && /'joriy_tasdiqlangan_summa'/.test(m1) && /'jami_tasdiqlangan_summa'/.test(m1) && /'qoldiq_summa'/.test(m1));
must('acceptance: previous + current-approved = cumulative; remaining = smeta - cumulative',
  /cumulative reconciliation \(prev \+ current-approved\)|jami_tasdiqlangan_summa.*oldingi_summa/i.test(m1a) && /remaining value != smeta - cumulative/i.test(m1a));
must('acceptance: draft F2 must NOT leak into certified current period',
  /draft F2 leaked into certified current period|draft F2 not surfaced separately/i.test(m1a));
must('detail bounded (limit clamp), totals over ALL rows',
  /least\(greatest\(coalesce\(p_limit,500\),1\),3000\)/.test(m1n) && /into v_jami from agg/.test(m1n));
must('pending change delta shown separately (not in certified totals)', /pending_ozgarish_delta/.test(m1));
must('membership-checked + service_role only', /t2_actor_kompaniya_azo_tekshir/.test(m1n) && /revoke all on function public\.t2_nakopitelniy_v1/.test(m1));

console.log('\n── Change control: governed layer, not a 2nd smeta ──');
must('reuses t2_qator_tahrir / t2_qator_qosh (no parallel line writer)',
  /public\.t2_qator_tahrir\(/.test(m2n) && /public\.t2_qator_qosh\(/.test(m2n));
must('carries reason / type / evidence / effective period / affected IDs / before-after',
  /sabab/.test(m2) && /evidence_hujjat_id/.test(m2) && /effective_oy/.test(m2) && /baseline_snapshot/.test(m2) && /eski_hajm.*yangi_hajm/.test(m2n));
must('all professional change kinds supported',
  ['almashtirish','qoshimcha_ish','olib_tashlash','hajm_ozgarish','yangi_bolim','yangi_ish','resurs_almashtirish','boshqa']
    .every((k) => m2.includes("'" + k + "'")));

console.log('\n── ATOMIC approval (correction #1) ──');
must('preflight validates EVERY line before any mutation', /PHASE 1 — PREFLIGHT: validate EVERY line, ZERO mutation/.test(m2));
must('preflight collects errors, returns CHANGE_PREFLIGHT_FAILED with zero mutation',
  /if jsonb_array_length\(v_xatolar\) > 0 then[\s\S]{0,120}CHANGE_PREFLIGHT_FAILED/.test(m2n));
must('preflight covers: existence, hierarchy, snapshot version, required values, new-line parent, kat',
  /QATOR_NOT_IN_OBJECT/.test(m2) && /NEW_LINE_PARENT/.test(m2) && /NEW_LINE_HIERARCHY/.test(m2) && /SCOPE_DRIFT/.test(m2) && /YANGI_HAJM_REQUIRED/.test(m2) && /NEW_LINE_KAT_INVALID/.test(m2));
must('affected rows locked FOR UPDATE across preflight+apply', /select qator_id from public\.t2_smeta_ozgarish_qator[\s\S]{0,80}for update/.test(m2n));
must('apply-phase race forces rollback (raise exception, never partial-commit)', /raise exception 'CHANGE_APPLY_RACE/.test(m2));
must('acceptance PROVES zero partial mutation (line 1 untouched when line 2 fails)',
  /FAIL ATOMICITY: line 1 was mutated despite line 2 preflight failure|line 1 mutated/i.test(m2a));

console.log('\n── Approved-change reversal (correction #2) ──');
must('reversal writes a COMPENSATING revision (forward event), not a deletion',
  /COMPENSATING revision|compensating revision|kompensatsiya_revision_id/.test(m2));
must('added qator is SOFT-removed on reversal (hajm=0), never hard-deleted',
  /soft-remove any qator this order added|soft-remove any line this order ADDED/i.test(m2) && !/delete from public\.t2_qator/i.test(m2n));
must('acceptance: added row still EXISTS after reversal (history preserved)',
  /added row hard-deleted \(history lost\)|added not soft-removed/i.test(m2a));
must('acceptance: original baseline + revision chain intact after reversal',
  /original baseline lost after reversal|compensating revision missing/i.test(m2a));

console.log('\n── Migration rollback correctness (correction #3) ──');
must('rollback 1 is PRE-USE ONLY and REFUSES when post-use data exists',
  /PRE-USE SCHEMA ROLLBACK/.test(m1r) && /POST-USE: t2_smeta_revision has|Pre-use rollback refused/.test(m1r));
must('rollback 2 refuses to delete change/revision lineage while mutations remain',
  /PRE-USE SCHEMA ROLLBACK/.test(m2r) && /Pre-use rollback refused/.test(m2r) && /forward repair/i.test(m2r));
must('rollback docs point to t2_smeta_ozgarish_qaytar_v1 / compensating migration for post-use',
  /t2_smeta_ozgarish_qaytar_v1|forward-repair|forward repair/i.test(m2r));

console.log('\n── Forma-3 stays UNRESOLVED (correction: no invented legal rule) ──');
must('t2_forma3 has NO markup / tax / payment-due / legal-total column',
  !/legal_total|payment_due|tax_summa|ustama_summa|jami_qonuniy|nds_summa/i.test(m3n));
must('bajarilgan_f2_summa is the ONLY numeric field (a FACT, Σ approved F2 line sums)',
  /bajarilgan_f2_summa numeric not null/.test(m3) && /the ONLY numeric field/i.test(m3));
must('qoida_holat guard defaults to FORMA3_RULE_UNRESOLVED', /qoida_holat[\s\S]{0,80}default 'FORMA3_RULE_UNRESOLVED'/.test(m3n));
must('t2_forma3_yarat_v1 links ONLY approved F2 (tur=f2, holat=tasdiqlangan) in scope + period',
  /a\.tur <> 'f2' or a\.holat <> 'tasdiqlangan'/.test(m3n) && /FORMA3_AKT_INVALID/.test(m3));
must('rule guard lifts only with a verified evidence reference — still adds NO formula',
  /FORMA3_EVIDENCE_REQUIRED/.test(m3) && /Qonuniy hisob-kitob hali qo|adds no legal formula/i.test(m3));
must('acceptance proves forma3 emits no legal/payment total + no such column',
  /forma3 emitted a legal\/payment total/.test(m3a) && /t2_forma3 has a legal\/markup\/tax column/.test(m3a));

console.log('\n── Closeout requirement pack is DATA-driven ──');
must('t2_yakunlash_talab is config/data driven (project override > company > global)',
  /t2_yakunlash_talab/.test(m3) && /project override > company > global/i.test(m3));
must('no park-specific legal requirement hard-coded as a universal rule',
  !/\bpark\b/i.test((m3.match(/insert into public\.t2_yakunlash_talab[\s\S]*?on conflict/) || [''])[0]));
must('t2_obyekt_yakunlash_v1 returns requirements / documents / exportPeriods',
  /'requirements', v_reqs/.test(m3) && /'documents', v_docs/.test(m3) && /'exportPeriods', v_periods/.test(m3));
must('forma3 requirement carries evidenceRule forma3_unresolved',
  /'forma3_unresolved'/.test(m3n));

console.log('\n── Workbench aggregate feeds the pure engine (generic read model) ──');
must('t2_workbench_v1 is STABLE + bounded (limit clamp), no temp table', (() => {
  const body = (m3.match(/create or replace function public\.t2_workbench_v1[\s\S]*?\$\$;/) || [''])[0];
  return /language plpgsql stable/i.test(body) && !/create temp table/i.test(body) &&
    /least\(greatest\(coalesce\(p_limit,800\),1\),3000\)/.test(N(body));
})());
must('workbench emits ConstructionDocumentControlReadModel shape (valuation.lines/changes/periods + revisions)',
  /'valuation', jsonb_build_object/.test(m3) && /'lines',[\s\S]{0,120}jsonb_array_elements\(v_lines\)/.test(m3n) && /'revisions', v_revisions/.test(m3));
must('lines carry baselineReferencePrice separately from any F2 / actual price',
  /'baselineReferencePrice', coalesce\(q\.narx,0\)/.test(m3n));
must('periods carry f2ValuationPrice + actualProcurementPrice (never collapsed)',
  /'f2ValuationPrice', aq\.narx/.test(m3n) && /'actualProcurementPrice', aq\.actual_narx/.test(m3n));
must('membership-checked + service_role only', /t2_actor_kompaniya_azo_tekshir/.test(m3n) && /revoke all on function public\.t2_workbench_v1/.test(m3));

console.log('\n── Migration 3 rollback correctness ──');
must('rollback 3 is PRE-USE ONLY and REFUSES once a Forma-3 certificate exists',
  /PRE-USE SCHEMA ROLLBACK/.test(m3r) && /Pre-use rollback refused|holat=.?bekor/i.test(m3r));

console.log('\n── Vertical slice: canonical boundary is wired (no Drive/Sheets/GAS) ──');
const fn = R('frontend', 'functions', 'api', 'hujjat-nazorat.ts');
const adapter = R('frontend', 'src', 'api', 't2-document-control.ts');
const page = R('frontend', 'src', 'admin', 'pages', 'HujjatNazoratPage.tsx');
const app = R('frontend', 'src', 'App.tsx');
const shell = R('frontend', 'src', 'admin', 'AdminShell.tsx');
const routes = R('frontend', 'src', 'umumiy', 'marshrutTekshir.ts');
must('Cloudflare fn resolves actor from session + forwards to canonical RPCs only',
  /from '\.\.\/_shared\/auth'/.test(fn) && /t2_workbench_(?:exact_)?v1/.test(fn) && /t2_smeta_ozgarish_tasdiqlash_v[12]/.test(fn) && /t2_forma3_yarat_v1/.test(fn));
// 2026-09-25: tasdiqlash v2 = v1 ning o'rami (signal oxirida bir marta) — semantika v1 da qoladi.
const m6 = R('supabase', 'migrations', '20261101091000_t2_ozgarish_tasdiqlash_signal_bir_marta.sql');
must('ozgarish tasdiqlash v2 wraps v1 unchanged (signal refresh once at end)',
  /public\.t2_smeta_ozgarish_tasdiqlash_v1\(p_ozgarish_id, p_actor_id, p_kutilgan_versiya, p_operation_id\)/.test(m6)
  && /t2_signal_refresh_object\(v_komp, v_obyekt\)/.test(m6) && /revoke all on function public\.t2_smeta_ozgarish_tasdiqlash_v2/.test(m6));
must('Cloudflare fn does NOT touch Drive/Sheets/GAS', !/DriveApp|SpreadsheetApp|\/api\/gas|clasp/i.test(fn));
must('Cloudflare fn surfaces "not applied" as 501 (migration missing)', /not applied|PGRST202|does not exist/.test(fn) && /501/.test(fn));
must('adapter normalizes SQL nulls out of optional CertifiedLine fields (unknown stays unknown)',
  /dropNulls/.test(adapter) && /f2ValuationPrice: x\.f2ValuationPrice/.test(adapter));
must('adapter maps requirement/doc vocabulary (forma3 -> payment_certification, forma3_unresolved -> payment_rule_unresolved)',
  /forma3: 'payment_certification'/.test(adapter) && /'payment_rule_unresolved'/.test(adapter));
must('adapter binds the 4 generic ports + deterministic engine page builder',
  /constructionDocumentControlPort/.test(adapter) && /progressValuationReadPort/.test(adapter) && /changeControlCommandPort/.test(adapter) && /projectCloseoutPort/.test(adapter) && /calculateProgressValuation/.test(adapter));
must('admin page renders the generic ConstructionDocumentWorkbench with loading/error/empty states',
  /ConstructionDocumentWorkbench/.test(page) && /q\.isLoading/.test(page) && /notApplied/.test(page) && /noPerm|noPermission/.test(page));
must('route + nav + title + route-allowlist all wired for /admin/hujjat-nazorat',
  /path="hujjat-nazorat"/.test(app) && /\/admin\/hujjat-nazorat/.test(shell) && /hujjat-nazorat/.test(R('frontend','src','lib','pageTitle.ts')) && /'hujjat-nazorat'/.test(routes));

console.log('\n── Acceptance sentinels + AI safety ──');
must('m1 acceptance raises PARK_F2_BASELINE_ACCEPTANCE_PASS', /PARK_F2_BASELINE_ACCEPTANCE_PASS/.test(m1a));
must('m2 acceptance raises SMETA_CHANGE_CONTROL_ACCEPTANCE_PASS', /SMETA_CHANGE_CONTROL_ACCEPTANCE_PASS/.test(m2a));
must('m3 acceptance raises FORMA3_CLOSEOUT_WORKBENCH_ACCEPTANCE_PASS', /FORMA3_CLOSEOUT_WORKBENCH_ACCEPTANCE_PASS/.test(m3a));
must('no AI / Drive / Sheets / GAS anywhere in the valuation or change path',
  !/openai|gemini|groq|aiCall|DriveApp|SpreadsheetApp|\/api\/gas/i.test(m1 + m2 + m3));

console.log('\n── Architecture doc ──');
must('doc is evidence-grounded (real objects + existing RPCs named)',
  /Amfiteatr/.test(doc) && /t2_akt_yarat/.test(doc) && /t2_qator_holat/.test(doc));
must('doc follows REUSE / EXTEND / ADDITIVE decision order', /REUSE/.test(doc) && /EXTEND/.test(doc) && /ADDITIVE/.test(doc));
must('doc keeps PARK as reference scenario, not a canonical name', !/t2_park_|park_project_id/.test(doc));

console.log('\n' + ok + ' checks passed');
