/* T2-AGENT-CONTROL-PLANE-001 — static architecture/contract guards. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const migration = read('supabase', 'migrations', '20261103120000_t2_agent_control_plane_v1.sql');
const rollback = read('supabase', 'migrations', '20261103120000_t2_agent_control_plane_v1.rollback.sql');
const acceptance = read('supabase', 'migrations', '20261103120000_t2_agent_control_plane_v1.acceptance.sql');
const api = read('frontend', 'functions', 'api', 'agent-control.ts');
const client = read('frontend', 'src', 'api', 't2-agent-control.ts');
const policy = read('frontend', 'src', 'lib', 'agent-control-plane', 'policy.ts');

const checks = [];
function must(label, ok) {
  checks.push({ label, ok: Boolean(ok) });
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

must('agent profile registry exists', /create table if not exists public\.t2_agent_profile/.test(migration));
must('run/approval/tool receipt tables exist',
  /create table if not exists public\.t2_agent_run/.test(migration) &&
  /create table if not exists public\.t2_agent_approval/.test(migration) &&
  /create table if not exists public\.t2_agent_tool_call/.test(migration));
must('stable operation_id is unique', /operation_id uuid not null unique/.test(migration));
must('optimistic version is present', /versiya integer not null default 1/.test(migration) && /STALE_VERSION/.test(migration));
must('server-side scope guard is present', /t2_agent_scope_guard_v1/.test(migration) && /t2_actor_kompaniya_azo_tekshir/.test(migration));
must('project/object lineage is checked', /PROJECT_LINEAGE_INVALID/.test(migration) && /OBJECT_LINEAGE_INVALID/.test(migration));
must('global scope is platform-superadmin gated', /t2_platforma_superadmin\(p_actor_id\)/.test(migration) && /GLOBAL_SCOPE_DENIED/.test(migration));
must('approval path is explicit', /t2_agent_approval_decide_v1/.test(migration) && /approval_required/.test(migration));
must('commands are allowlisted and approval cannot be bypassed', /allowed_commands jsonb/.test(migration) && /COMMAND_NOT_ALLOWED/.test(migration) && /v_requires_approval := p_requires_approval or/.test(migration));
must('tool execution is allowlist-only', /TOOL_NOT_ALLOWED/.test(migration) && /allowed_tools \? p_tool_kod/.test(migration));
must('no arbitrary SQL/Drive/GAS path', !/DriveApp|SpreadsheetApp|api\/gas|execute arbitrary SQL/i.test(api + client + policy));
must('RLS and public revoke are present', /enable row level security/.test(migration) && /revoke all on public\.t2_agent_/.test(migration));
must('Cloudflare actor comes from verified session', /tekshir\(/.test(api) && /foydalanuvchi_id/.test(api) && !/body\.actor_id/.test(api));
must('RPC dispatch is fixed allowlist', /const RPC =/.test(api) && /RPC\[action\]/.test(api) && !/body\.rpc|body\.function/.test(api));
must('client has typed run/approval/tool commands', /agentRunStart/.test(client) && /agentApprovalDecide/.test(client) && /agentToolPrepare/.test(client));
must('policy has deterministic transition guard', /AGENT_RUN_TRANSITIONS/.test(policy) && /canTransition/.test(policy));
must('acceptance rolls back synthetic writes', /begin;/.test(acceptance) && /rollback;/.test(acceptance) && /cross-company/.test(acceptance));
must('rollback covers all new functions and tables',
  /t2_agent_control_v1/.test(rollback) && /t2_agent_tool_call/.test(rollback) && /t2_agent_profile/.test(rollback));

console.log(`\n${checks.length} agent-control checks passed.`);
