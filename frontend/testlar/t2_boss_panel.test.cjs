/* BOSS PANEL P0 — canonical read model, no Drive/Sheets/GAS on the dashboard. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const R = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
let ok = 0;
const must = (l, c) => { assert(c, l); console.log('  ✅ ' + l); ok++; };

const comp = R('frontend', 'src', 'admin', 'sahifalar', 'BossDashboard.tsx');
const client = R('frontend', 'src', 'api', 't2-boss.ts');
const fn = R('frontend', 'functions', 'api', 'boss-dashboard.ts');
const mig = R('supabase', 'migrations', '20260903120000_t2_boss_dashboard_read_model_v1.sql');
const app = R('frontend', 'src', 'App.tsx');

console.log('\n── No legacy GAS/Sheets/Drive on the Boss dashboard read ──');
const nocomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
for (const [n, s0] of [['BossDashboard', comp], ['t2-boss client', client], ['boss-dashboard fn', fn]]) {
  const s = nocomment(s0);
  must(n + ': no GAS bridge call', !/fetch\(['"`]\/api\/gas|apiBossData|apiBossObyekt|apiTitanAi/.test(s));
  must(n + ': no DriveApp / SpreadsheetApp', !/DriveApp|SpreadsheetApp|drive\.google|sheets\.googleapis/i.test(s));
}
must('client reads /api/boss-dashboard only', /fetch\('\/api\/boss-dashboard/.test(client) && !/fetch\(['"`]\/api\/(gas|sb-yoz)/.test(client));

console.log('\n── Canonical read model ──');
must('function auths the session', /tekshir\(ctx\.request\.headers\.get\('Cookie'\)/.test(fn));
must('function calls the Supabase RPC t2_boss_dashboard_v1', /rest\/v1\/rpc\/t2_boss_dashboard_v1/.test(fn));
must('RPC checks company membership (generic guard)', /t2_actor_kompaniya_azo_tekshir\(p_kompaniya_id, ?p_actor_id\)/.test(mig));
must('RPC is a single bounded call (no N+1 loop over objects)', !/for .* in .* loop/i.test(mig) && /limit 200/.test(mig));
must('RPC returns finance from the canonical accounting view, not GAS', /t2_bux_umumiy/.test(mig));
must('RPC returns F2 from canonical t2_akt', /from public\.t2_akt/.test(mig));
must('RPC returns open signals bounded (<= 25)', /order by severity desc, detected_at desc limit 25/.test(mig));
must('RPC guards optional FILE-TRUTH tables', /to_regclass\('public\.t2_document_registry'\)/.test(mig));
must('RPC is service_role only', /revoke all on function public\.t2_boss_dashboard_v1\(bigint,bigint\) from public, anon, authenticated/.test(mig));

console.log('\n── Honest product states, canonical route ──');
must('legacy combined act amounts never become approved completion', /Eski umumiy akt summasi/.test(comp) && !/q\.data\.f2\.jami/.test(comp));
must('manager sees source coverage rather than internal module enums', /Hisob asoslari/.test(comp) && !/ulanmagan_modullar/.test(comp));
must('loading / error / no-company states', /q\.isLoading/.test(comp) && /q\.isError/.test(comp) && /KompaniyaKerak/.test(comp));
must('canonical route /admin/dashboard registered', /path="dashboard" element=/.test(app));
must('/boss index redirects to canonical dashboard', /Route index element=\{<Navigate to="\/admin\/dashboard" replace/.test(app));
must('admin index redirects to canonical dashboard', /Route index element=\{<Navigate to="\/admin\/dashboard" replace/.test(app));

console.log('\n' + ok + ' checks passed');
