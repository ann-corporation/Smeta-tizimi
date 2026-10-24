/* T2 F2 lifecycle source contract. Metadata/static only; never connects to a database. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const migration = path.join(root, 'supabase', 'migrations', '20260920150000_t2_f2_lifecycle_v1.sql');
const acceptance = path.join(root, 'supabase', 'migrations', '20260920150000_t2_f2_lifecycle_v1.acceptance.sql');
const rollback = path.join(root, 'supabase', 'migrations', '20260920150000_t2_f2_lifecycle_v1.rollback.sql');
const recoveryMigration = path.join(root, 'supabase', 'migrations', '20260922130000_t2_f2_import_job_recovery_v1.sql');
const recoveryAcceptance = path.join(root, 'supabase', 'migrations', '20260922130000_t2_f2_import_job_recovery_v1.acceptance.sql');
const recoveryRollback = path.join(root, 'supabase', 'migrations', '20260922130000_t2_f2_import_job_recovery_v1.rollback.sql');
const gateway = path.join(root, 'frontend', 'functions', 'api', 'sb-yoz.ts');
const readGateway = path.join(root, 'frontend', 'functions', 'api', 'sb.ts');
const read = (p) => fs.readFileSync(p, 'utf8');
const must = (label, ok) => {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('  ✅ ' + label);
};

const mig = read(migration);
const acc = read(acceptance);
const roll = read(rollback);
const recovery = read(recoveryMigration);
const recoveryAcc = read(recoveryAcceptance);
const recoveryRoll = read(recoveryRollback);
const apiGateway = read(gateway);
const apiReadGateway = read(readGateway);
const smetaUi = read(path.join(root, 'frontend', 'src', 'admin', 'sahifalar', 'SmetaYuklaNative.tsx'));
const f2HistoryUi = read(path.join(root, 'frontend', 'src', 'admin', 'sahifalar', 'F2TarixNative.tsx'));

must('source/acceptance/rollback package exists', fs.existsSync(migration) && fs.existsSync(acceptance) && fs.existsSync(rollback));
must('canonical lifecycle includes all required states', ['draft', 'submitted', 'checked', 'approved', 'rejected', 'cancelled', 'superseded'].every((state) => mig.includes("'" + state + "'")));
must('transition RPC is tenant and actor bound', mig.includes('t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id)') && mig.includes('where id = p_akt_id and kompaniya_id = p_kompaniya_id'));
must('transition requires expected version and operation id', mig.includes('EXPECTED_VERSION_REQUIRED') && mig.includes('OPERATION_ID_REQUIRED') && mig.includes('STALE_VERSION'));
must('approved rows cannot be mutated in place', mig.includes('approved akt immutable') && mig.includes("old.lifecycle_status = 'approved'"));
must('correction creates a new draft and provenance link', mig.includes('t2_akt_correction_link') && mig.includes('correction_of_akt_id') && mig.includes("'correction'"));
must('history is append-only through trigger/RPC', mig.includes('t2_akt_holat_tarix') && mig.includes('t2_akt_lifecycle_history_capture'));
must('new tables are RLS protected and not public-writeable', mig.includes('enable row level security') && mig.includes('revoke all on table public.t2_akt_holat_tarix, public.t2_akt_correction_link from public, anon, authenticated'));
must('acceptance is metadata-only', acc.includes('begin;') && acc.includes('rollback;') && !/\b(insert|update|delete|truncate)\s+/i.test(acc));
must('rollback preserves lifecycle data', !/\bdrop\s+(table|column)\b/i.test(roll) && roll.toLowerCase().includes('data-preserving rollback'));
must('gateway maps canonical lifecycle actions', apiGateway.includes("akt_lifecycle_transition_v1: { rpc: 't2_akt_lifecycle_transition_v1' }") && apiGateway.includes("akt_correction_create_v1: { rpc: 't2_akt_correction_create_v1' }"));
must('gateway rejects absent expected version', apiGateway.includes('expectedRaw == null') && apiGateway.includes('expected_source_version'));
must('recovery package exists and preserves cursor/drafts', [recoveryMigration, recoveryAcceptance, recoveryRollback].every(fs.existsSync) && recovery.includes('cursor_snapshot') && recovery.includes('recovery_required'));
must('recovery never fabricates completion', recovery.includes("status = 'paused'") && recovery.includes("'completed_at', null") && recovery.includes('JOB_NOT_STALE'));
must('soft cancel is durable and reason-bound', recovery.includes('t2_f2_import_job_cancel_event') && recovery.includes('REASON_REQUIRED') && recovery.includes('p_operation_id'));
must('recovery acceptance is metadata-only', !/\b(insert|update|delete|truncate)\s+/i.test(recoveryAcc) && recoveryAcc.includes('rollback;') && recoveryAcc.includes('T2_F2_IMPORT_JOB_RECOVERY_ACCEPTANCE_PASS'));
must('recovery rollback keeps job data', !/\bdrop\s+(table|column)\b/i.test(recoveryRoll));
must('gateway maps recovery and cancel actions', apiGateway.includes("f2_import_job_recover: { rpc: 't2_f2_import_job_recover_v1' }") && apiGateway.includes("f2_import_job_cancel: { rpc: 't2_f2_import_job_cancel_v1' }"));
must('smeta native reimport is non-destructive', smetaUi.includes('smetaQaytaImportDiff') && (!smetaUi.includes('smeta_tozala') || (smetaUi.includes('smeta_bogliqlik') && smetaUi.includes('bogliqlik?.qoralama'))) && !smetaUi.includes('Smetani tozalab'));
must('F2 approval follows draft-submitted-checked-approved sequence', f2HistoryUi.includes("['submitted', 'checked', 'approved']") && f2HistoryUi.includes('t2AktLifecycleTransition') && !f2HistoryUi.includes('sbT2AktTasdiqlash'));
must('read gateway exposes tenant+actor-bound lifecycle history (GET-only, no ad-hoc RPC name)', apiReadGateway.includes("akt_lifecycle_history_v1: 'akt_kompaniya_actor'") && apiReadGateway.includes("q.set('p_akt_id', String(id))") && apiReadGateway.includes("tur === 'kompaniya_actor' || tur === 'akt_kompaniya_actor'"));
console.log('  ✅ T2 F2 lifecycle source contract');
