/* SECURITY P0 — cross-cutting guards for the NEXT-MAIN-RELEASE candidate.
   1. no hardcoded auth-secret fallback (fail closed)
   2. service-role RPCs are actor/membership/lineage guarded
   3. canonical R2 is private (no public bucket / custom domain on the canonical path)
   4. upload validation + path safety (server-derived keys, size cap)
   5. privileged writes are audited
   6. session actor identity is server-side, never taken from the client */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const R = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
let ok = 0;
const must = (l, c) => { assert(c, l); console.log('  ✅ ' + l); ok++; };
const glob = (dir, re) => fs.readdirSync(path.join(__dirname, '..', '..', dir)).filter((f) => re.test(f)).map((f) => dir + '/' + f);

const auth = R('frontend', 'functions', '_shared', 'auth.ts');
const kirish = R('frontend', 'functions', 'api', 'kirish.ts');
const sessiya = R('frontend', 'functions', 'api', 'sessiya.ts');
const gas = R('frontend', 'functions', 'api', 'gas.ts');

console.log('\n── 1. No hardcoded auth-secret fallback (fail closed) ──');
must('no ZAXIRA / backup key constant remains', !/const ZAXIRA|Boshlangich_Maxfiy_Kalit|BACKUP_KEY|fallbackSecret/.test(auth));
must('kalitTekshir throws instead of returning a default', /kalitTekshir[\s\S]{0,220}throw new KalitYoqError\(\)/.test(auth) && !/return ZAXIRA/.test(auth));
must('tekshir() fails closed (returns null) when the key is missing', /try \{ secret = kalitTekshir\(secret\); \}\s*catch \{ return null; \}/.test(auth));
must('login handler returns 503 CONFIG (no cookie) when the key is missing',
  /SESSIYA_KALIT_YOQ/.test(kirish) && /status: 503/.test(kirish) && /try \{[\s\S]{0,240}imzola\(/.test(kirish));
must('constant-time signature compare kept', /function teng\(a: string, b: string\)/.test(auth) && /a\.length !== b\.length/.test(auth));
must('/api/sessiya still reports zaxira_kalit (unset-key visibility)', /zaxira_kalit: ?!kalitBormi\(secret\)/.test(sessiya));

console.log('\n── 2. Service-role RPCs: actor / membership / lineage guarded ──');
const migs = glob('supabase/migrations', /^(20260904|20260905|20260906|20260907|20260908)\d+_.*\.sql$/).filter((f) => !/rollback|acceptance/.test(f));
/* PostgreSQL `CREATE OR REPLACE FUNCTION` mavjud EXECUTE ruxsatlarini
   o'zgartirmaydi. 20260907130000 faqat avval ruxsati yopilgan mindmap
   tekshiruvchining rol shartini tuzatadi; uning ruxsatlari esa asl command
   contractda qat'iy yopilgan. Ikkala dalil bo'lmasa test baribir yiqiladi. */
const mindmapPermissionOrigin = R('supabase', 'migrations', '20260829051320_t2_mindmap_command_contract_hardening.sql');
for (const m of migs) {
  const s = R(...m.split('/'));
  const funcs = (s.match(/create or replace function public\.(t2_\w+)/g) || []);
  const guarded = /t2_actor_kompaniya_azo_tekshir|t2_azo_actor_director_tekshir|rol in \('boss','superadmin'\)|t2_control_actor_home_company/.test(s);
  const mindmapReplaceKeepsLockedPermissions = m.endsWith('20260907130000_t2_mindmap_actor_boss_fix.sql')
    && /create or replace function public\.t2_mindmap_actor_tekshir/.test(s)
    && /revoke all on function public\.t2_mindmap_actor_tekshir\(bigint,bigint\) from public, anon, authenticated;/.test(mindmapPermissionOrigin);
  must(m.split('/').pop() + ': every function guards the actor', funcs.length === 0 || guarded);
  must(m.split('/').pop() + ': revokes execute from anon/authenticated',
    !funcs.length || /revoke all on function/.test(s) || mindmapReplaceKeepsLockedPermissions);
}
must('CTRL global scope / kill-switch restricted to boss|superadmin', /rol in \('boss','superadmin'\)/.test(R('supabase','migrations','20260904120000_t2_capability_registry_v1.sql')));
must('company member commands reject superadmin grants', /ROLE_INVALID/.test(R('supabase','migrations','20260905120000_t2_company_onboarding_v1.sql')));
must('doc registry read is membership-checked + bounded', /t2_actor_kompaniya_azo_tekshir/.test(R('supabase','migrations','20260906120000_t2_document_registry_read_v1.sql')));
must('replica move re-binds only to KNOWN bindings (lineage safe)', /t2_object_storage_binding[\s\S]{0,200}folder_id = p_new_parent_id/.test(R('supabase','migrations','20260907120000_t2_document_replica_move_v1.sql')));

console.log('\n── 3. Canonical R2 is private ──');
const ftMig = R('supabase', 'migrations', '20260902120000_t2_file_truth_r2_canonical_v1.sql');
const yukla = R('frontend', 'functions', 'api', 'hujjat-yukla.ts');
const olfn = R('frontend', 'functions', 'api', 'hujjat-ol.ts');
must('uses the private R2_CANONICAL binding', /R2_CANONICAL/.test(yukla) && /R2_CANONICAL/.test(olfn));
must('no public r2.dev / custom-domain URL on the canonical path', !/r2\.dev|r2\.qurilish-os\.uz|pub-[0-9a-f]+\.r2/.test(yukla + olfn + ftMig));
must('canonical download requires a valid session', /tekshir\(ctx\.request\.headers\.get\('Cookie'\)/.test(olfn) && /AUTH_REQUIRED/.test(olfn));
must('internal replica read endpoint (hujjat-r2) is removed with Drive', !fs.existsSync(path.join(__dirname,'..','functions','api','hujjat-r2.ts')));

console.log('\n── 4. Upload validation + path safety ──');
must('size is required and capped (413 FILE_TOO_LARGE)', /declaredSize > maxBytes/.test(yukla) && /FILE_TOO_LARGE/.test(yukla) && /status: 413/.test(yukla));
must('operation_id must be a UUID', /UUID\.test\(operationId\)/.test(yukla));
must('client sha256 must be 64 hex', /HEX64\.test\(clientSha\)/.test(yukla));
must('original filename is sanitised before storage', /safeName\(file\.name\)/.test(yukla) && /function safeName/.test(yukla));
must('r2_key is SERVER-derived from document_id (no filename / no client input in the path)',
  /format\('docs\/%s\/%s\/%s\/d%s\/r%s'/.test(ftMig));
must('reserve enforces tenant lineage (STORAGE_TENANT_MISMATCH / PROJECT_COMPANY_MISMATCH)',
  /STORAGE_TENANT_MISMATCH/.test(ftMig) && /PROJECT_COMPANY_MISMATCH/.test(ftMig));

console.log('\n── 5. Privileged writes are audited ──');
for (const m of migs) {
  const s = R(...m.split('/'));
  const writes = /\b(insert into|update) public\.t2_/.test(s) && /create or replace function/.test(s);
  must(m.split('/').pop() + ': mutating functions call t2_audit_yoz', !writes || /t2_audit_yoz\(/.test(s));
}

console.log('\n── 6. Session actor identity is server-side ──');
for (const [n, s] of [
  ['boss-dashboard', R('frontend','functions','api','boss-dashboard.ts')],
  ['system-control', R('frontend','functions','api','system-control.ts')],
  ['company', R('frontend','functions','api','company.ts')],
  ['hujjat-royxat', R('frontend','functions','api','hujjat-royxat.ts')],
  ['hujjat-yukla', yukla],
]) {
  must(n + ': actor id read from the verified session, not the request body',
    /foydalanuvchi_id/.test(s) && !/(body|bodyIn|b)\.(actor_id|actorId|p_actor_id)/.test(s.replace(/\/\*[\s\S]*?\*\//g,'')));
}
must('gas.ts injects sess.foydalanuvchi_id as actorId (client cannot spoof)',
  /actorId: sess\.foydalanuvchi_id/.test(gas));

console.log('\n' + ok + ' checks passed');
