-- Synthetic acceptance for 20261203001200_t2_desktop_boshqaruv_v1. No real actors/data; everything disappears at ROLLBACK.
begin;
do $$
declare
  ka bigint; kb bigint; sa bigint; boss_a bigint; adm_a bigint; mem_a bigint; usr_b bigint; r jsonb;
  dm uuid; db uuid; dboss uuid; dn uuid; d2 uuid;
  exp bigint := floor(extract(epoch from clock_timestamp())*1000)::bigint + 3600000;
  op uuid;
begin
  -- Fixtures: company A (boss, admin, member), company B (member), platform superadmin.
  insert into public.t2_kompaniya(nom,kod) values('_TEST_DESKTOP_A_',gen_random_uuid()::text) returning id into ka;
  insert into public.t2_kompaniya(nom,kod) values('_TEST_DESKTOP_B_',gen_random_uuid()::text) returning id into kb;
  insert into public.t2_foydalanuvchi(login,ism,holat) values('dkb_sa_'||gen_random_uuid(),'Synthetic SA','faol') returning id into sa;
  insert into public.t2_foydalanuvchi(login,ism,holat) values('dkb_boss_'||gen_random_uuid(),'Synthetic Boss A','faol') returning id into boss_a;
  insert into public.t2_foydalanuvchi(login,ism,holat) values('dkb_adm_'||gen_random_uuid(),'Synthetic Admin A','faol') returning id into adm_a;
  insert into public.t2_foydalanuvchi(login,ism,holat) values('dkb_mem_'||gen_random_uuid(),'Synthetic Member A','faol') returning id into mem_a;
  insert into public.t2_foydalanuvchi(login,ism,holat) values('dkb_usr_'||gen_random_uuid(),'Synthetic User B','faol') returning id into usr_b;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol,holat) values
    (sa,ka,'superadmin','faol'),(boss_a,ka,'boss','faol'),(adm_a,ka,'admin','faol'),(mem_a,ka,'pto','faol'),(usr_b,kb,'pto','faol');
  -- Isolate from whatever global policy exists: neutral defaults for this transaction.
  update public.t2_desktop_siyosat set yoqilgan=true,max_qurilma=10,lease_soat=72,oflayn=true,min_versiya=null
    where kompaniya_id is null and manba='platforma';

  r := public.t2_desktop_qurilma_yarat_v2(mem_a,gen_random_uuid(),md5('m')||md5('m'),exp,gen_random_uuid(),'PC-A','windows','1.0.0');
  if r->>'ok' is distinct from 'true' then raise exception 'enroll member A: %',r; end if; dm := (r->>'device_id')::uuid;
  r := public.t2_desktop_qurilma_yarat_v2(usr_b,gen_random_uuid(),md5('b')||md5('b'),exp,gen_random_uuid(),'PC-B','windows','1.0.0');
  if r->>'ok' is distinct from 'true' then raise exception 'enroll user B: %',r; end if; db := (r->>'device_id')::uuid;
  r := public.t2_desktop_qurilma_yarat_v2(boss_a,gen_random_uuid(),md5('x')||md5('x'),exp,gen_random_uuid(),'PC-BOSS','windows','1.0.0');
  if r->>'ok' is distinct from 'true' then raise exception 'enroll boss: %',r; end if; dboss := (r->>'device_id')::uuid;
  if (select ilova_versiya from public.t2_desktop_qurilma where device_id=dm) is distinct from '1.0.0' then raise exception 'metadata not stored'; end if;

  -- Tenant isolation (read).
  if public.t2_desktop_boshqaruv_v1(mem_a,ka)->>'code' is distinct from 'AUTHORIZATION_DENIED' then raise exception 'regular member read company'; end if;
  if public.t2_desktop_boshqaruv_v1(mem_a,null)->>'code' is distinct from 'AUTHORIZATION_DENIED' then raise exception 'regular member read global'; end if;
  if public.t2_desktop_boshqaruv_v1(boss_a,null)->>'code' is distinct from 'AUTHORIZATION_DENIED' then raise exception 'boss read global'; end if;
  if public.t2_desktop_boshqaruv_v1(boss_a,kb)->>'code' is distinct from 'AUTHORIZATION_DENIED' then raise exception 'boss read other company'; end if;
  r := public.t2_desktop_boshqaruv_v1(boss_a,ka);
  if r->>'ok' is distinct from 'true' then raise exception 'boss read own: %',r; end if;
  if exists(select 1 from jsonb_array_elements(r->'qurilmalar') q where (q->>'foydalanuvchi_id')::bigint in (usr_b,sa)) then raise exception 'boss sees foreign/superadmin device'; end if;
  if not exists(select 1 from jsonb_array_elements(r->'qurilmalar') q where (q->>'device_id')::uuid=dm) then raise exception 'boss misses own member device'; end if;
  if r::text like '%token_hash%' then raise exception 'token hash leaked'; end if;
  if public.t2_desktop_boshqaruv_v1(sa,null)->>'ok' is distinct from 'true' then raise exception 'superadmin global read'; end if;

  -- Tenant isolation (commands).
  if public.t2_desktop_boshqaruv_buyruq_v1(mem_a,'bekor',ka,dm,null,null,'test sabab',gen_random_uuid())->>'code' is distinct from 'AUTHORIZATION_DENIED' then raise exception 'member revoke'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'bekor',ka,db,null,null,'test sabab',gen_random_uuid())->>'code' is distinct from 'TENANT_FORBIDDEN' then raise exception 'boss revoke foreign via own company'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'bekor',kb,db,null,null,'test sabab',gen_random_uuid())->>'code' is distinct from 'AUTHORIZATION_DENIED' then raise exception 'boss revoke via other company'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'foydalanuvchi_bekor',ka,null,usr_b,null,'test sabab',gen_random_uuid())->>'code' is distinct from 'TENANT_FORBIDDEN' then raise exception 'boss revoke-all foreign'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'muddat',ka,dm,null,exp-60000,'test sabab',gen_random_uuid())->>'code' is distinct from 'SUPERADMIN_REQUIRED' then raise exception 'boss expiry'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'bekor',ka,dm,null,null,'  ',gen_random_uuid())->>'code' is distinct from 'SABAB_REQUIRED' then raise exception 'reason required'; end if;
  -- A company admin cannot revoke the boss's devices.
  if public.t2_desktop_boshqaruv_buyruq_v1(adm_a,'bekor',ka,dboss,null,null,'test sabab',gen_random_uuid())->>'code' is distinct from 'BOSS_PROTECTED' then raise exception 'admin revoked boss device'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(adm_a,'foydalanuvchi_bekor',ka,null,boss_a,null,'test sabab',gen_random_uuid())->>'code' is distinct from 'BOSS_PROTECTED' then raise exception 'admin revoked boss user'; end if;
  if public.t2_desktop_siyosat_saqla_v1(boss_a,null,'platforma','{"yoqilgan":false}',null,null,gen_random_uuid())->>'code' is distinct from 'SABAB_REQUIRED' then raise exception 'policy reason'; end if;
  if public.t2_desktop_siyosat_saqla_v1(boss_a,null,'platforma','{"yoqilgan":false}','kill',null,gen_random_uuid())->>'code' is distinct from 'AUTHORIZATION_DENIED' then raise exception 'boss global kill switch'; end if;
  if public.t2_desktop_siyosat_saqla_v1(boss_a,ka,'platforma','{"max_qurilma":50}','loosen',null,gen_random_uuid())->>'code' is distinct from 'AUTHORIZATION_DENIED' then raise exception 'boss platform override'; end if;
  if public.t2_desktop_siyosat_saqla_v1(boss_a,kb,'kompaniya','{"yoqilgan":false}','other co',null,gen_random_uuid())->>'code' is distinct from 'AUTHORIZATION_DENIED' then raise exception 'boss other company policy'; end if;
  if public.t2_desktop_siyosat_saqla_v1(boss_a,ka,'kompaniya','{"joriy_versiya":"9.9.9"}','installer',null,gen_random_uuid())->>'code' is distinct from 'POLICY_FIELD_INVALID' then raise exception 'company installer field'; end if;

  -- M1 (security review): boss adds a foreign account to company A (membership needs no consent) and tries to
  -- revoke it, lock it out via company policy, or read its device metadata.
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol,holat) values(usr_b,ka,'pto','faol');
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'bekor',ka,db,null,null,'test sabab',gen_random_uuid())->>'code' is distinct from 'MULTI_COMPANY_SUPERADMIN_REQUIRED' then raise exception 'M1 revoke multi-company device'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'foydalanuvchi_bekor',ka,null,usr_b,null,'test sabab',gen_random_uuid())->>'code' is distinct from 'MULTI_COMPANY_SUPERADMIN_REQUIRED' then raise exception 'M1 revoke-all multi-company'; end if;
  perform public.t2_desktop_qurilma_tekshir_v2(md5('b')||md5('b'),'1.0.0'); -- give it a last-seen
  r := public.t2_desktop_boshqaruv_v1(boss_a,ka);
  select q into r from jsonb_array_elements(r->'qurilmalar') q where (q->>'device_id')::uuid=db;
  if r is null or (r->>'kop_kompaniya')::boolean is not true or r->>'qurilma_nomi' is not null or r->>'oxirgi_kirish' is not null then raise exception 'M1 metadata leak: %',r; end if;
  if r::text like '%_TEST_DESKTOP_B_%' then raise exception 'M1 other company leaked'; end if;
  if public.t2_desktop_siyosat_saqla_v1(boss_a,ka,'kompaniya','{"max_qurilma":1}','lockout',null,gen_random_uuid())->>'code' is distinct from 'POLICY_FIELD_INVALID' then raise exception 'M1 company device cap accepted'; end if;
  r := public.t2_desktop_siyosat_saqla_v1(boss_a,ka,'kompaniya','{"min_versiya":"9999.0.0"}','lockout',null,gen_random_uuid());
  if r->>'ok' is distinct from 'true' then raise exception 'boss own company row: %',r; end if;
  if public.t2_desktop_qurilma_tekshir_v2(md5('b')||md5('b'),'1.0.0')->>'ok' is distinct from 'true' then raise exception 'M1 company min version revoked foreign device'; end if;
  if public.t2_desktop_qurilma_yarat_v2(usr_b,gen_random_uuid(),md5('b2')||md5('b2'),exp,gen_random_uuid(),null,null,'1.0.0')->>'ok' is distinct from 'true' then raise exception 'M1 company cap/version blocked foreign enroll'; end if;
  if public.t2_desktop_qurilma_tekshir_v2(md5('m')||md5('m'),'1.0.0')->>'ok' is distinct from 'true' then raise exception 'company row must not act at user level'; end if;
  -- ...it still gates this company's offline lease (company scope).
  if public.t2_desktop_lease_chegara_v2(mem_a,dm,ka,1)->>'code' is distinct from 'DESKTOP_UPDATE_REQUIRED' then raise exception 'company min version on lease'; end if;
  r := public.t2_desktop_siyosat_saqla_v1(boss_a,ka,'kompaniya','{"min_versiya":null}','qaytarish',
    (select versiya from public.t2_desktop_siyosat where kompaniya_id=ka and manba='kompaniya'),gen_random_uuid());
  if r->>'ok' is distinct from 'true' then raise exception 'reset company row: %',r; end if;
  -- The superadmin may act on multi-company accounts.
  if public.t2_desktop_boshqaruv_buyruq_v1(sa,'bekor',null,(select device_id from public.t2_desktop_qurilma where token_hash=md5('b2')||md5('b2')),null,null,'superadmin',gen_random_uuid())->>'ok' is distinct from 'true' then raise exception 'superadmin multi-company revoke'; end if;
  update public.t2_azolik set holat='bekor' where foydalanuvchi_id=usr_b and kompaniya_id=ka;

  -- Revoke by boss (single-company member): audited, idempotent, verify refuses.
  op := gen_random_uuid();
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'bekor',ka,dm,null,null,'yo''qolgan noutbuk',op)->>'ok' is distinct from 'true' then raise exception 'boss revoke own member'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'bekor',ka,dm,null,null,'yo''qolgan noutbuk',op)->>'takror' is distinct from 'true' then raise exception 'command not idempotent'; end if;
  if (select count(*) from public.t2_desktop_audit where actor_id=boss_a and operation_id=op and kompaniya_id=ka and amal='bekor' and device_id=dm) is distinct from 1 then raise exception 'audit missing'; end if;
  if public.t2_desktop_qurilma_tekshir_v1(md5('m')||md5('m'))->>'ok' is distinct from 'false' then raise exception 'revoked device verified'; end if;
  if (select bekor_qildi from public.t2_desktop_qurilma where device_id=dm) is distinct from boss_a then raise exception 'revoker not recorded'; end if;

  -- Superadmin expiry change (bounded by enrolling session expiry).
  if public.t2_desktop_boshqaruv_buyruq_v1(sa,'muddat',null,db,null,exp+1,'uzaytirish',gen_random_uuid())->>'code' is distinct from 'EXPIRY_INVALID' then raise exception 'expiry beyond session'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(sa,'muddat',null,db,null,exp-600000,'qisqartirish',gen_random_uuid())->>'ok' is distinct from 'true' then raise exception 'superadmin shorten'; end if;
  if (select tugaydi from public.t2_desktop_qurilma where device_id=db) is distinct from exp-600000 then raise exception 'expiry not applied'; end if;

  -- Compare-and-swap + partial update.
  if public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"yoqilgan":false}','avariya',null,gen_random_uuid())->>'code' is distinct from 'VERSION_REQUIRED' then raise exception 'CAS not required'; end if;
  if public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"yoqilgan":false}','avariya',
    (select versiya+1 from public.t2_desktop_siyosat where kompaniya_id is null and manba='platforma'),gen_random_uuid())->>'code' is distinct from 'STALE_VERSION' then raise exception 'stale version'; end if;

  -- Kill switch (global): enroll and verify refuse with explicit code; refused device is retired server-side + audited.
  r := public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"yoqilgan":false}','avariya',
    (select versiya from public.t2_desktop_siyosat where kompaniya_id is null and manba='platforma'),gen_random_uuid());
  if r->>'ok' is distinct from 'true' then raise exception 'kill switch save: %',r; end if;
  if (select max_qurilma from public.t2_desktop_siyosat where kompaniya_id is null and manba='platforma') is distinct from 10 then raise exception 'partial update lost fields'; end if;
  if public.t2_desktop_qurilma_yarat_v1(usr_b,gen_random_uuid(),md5('k')||md5('k'),exp,gen_random_uuid())->>'code' is distinct from 'DESKTOP_DISABLED' then raise exception 'kill switch enroll'; end if;
  if public.t2_desktop_qurilma_tekshir_v1(md5('b')||md5('b'))->>'code' is distinct from 'DESKTOP_DISABLED' then raise exception 'kill switch verify'; end if;
  if (select bekor_sabab from public.t2_desktop_qurilma where device_id=db) is distinct from 'DESKTOP_DISABLED' then raise exception 'disabled device not retired'; end if;
  if not exists(select 1 from public.t2_desktop_audit where amal='siyosat_rad' and device_id=db and sabab='DESKTOP_DISABLED' and (meta->>'tizim')::boolean) then raise exception 'auto-revoke not audited'; end if;
  perform public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"yoqilgan":true}','tiklash',
    (select versiya from public.t2_desktop_siyosat where kompaniya_id is null and manba='platforma'),gen_random_uuid());

  -- Company kill switch (boss self-restriction) blocks its single-company members only.
  if public.t2_desktop_siyosat_saqla_v1(boss_a,ka,'kompaniya','{"yoqilgan":false}','vaqtincha',
    (select versiya from public.t2_desktop_siyosat where kompaniya_id=ka and manba='kompaniya'),gen_random_uuid())->>'ok' is distinct from 'true' then raise exception 'boss own company policy'; end if;
  if public.t2_desktop_qurilma_yarat_v1(mem_a,gen_random_uuid(),md5('k2')||md5('k2'),exp,gen_random_uuid())->>'code' is distinct from 'DESKTOP_DISABLED' then raise exception 'company kill enroll'; end if;
  r := public.t2_desktop_qurilma_yarat_v1(usr_b,gen_random_uuid(),md5('u1')||md5('u1'),exp,gen_random_uuid());
  if r->>'ok' is distinct from 'true' then raise exception 'other company blocked: %',r; end if;
  perform public.t2_desktop_siyosat_saqla_v1(boss_a,ka,'kompaniya','{"yoqilgan":null}','qayta yoqish',
    (select versiya from public.t2_desktop_siyosat where kompaniya_id=ka and manba='kompaniya'),gen_random_uuid());

  -- Superadmin revoke-all for a user (force re-login).
  r := public.t2_desktop_boshqaruv_buyruq_v1(sa,'foydalanuvchi_bekor',null,null,usr_b,null,'qayta kirish',gen_random_uuid());
  if r->>'ok' is distinct from 'true' or (r->>'soni')::int < 1 then raise exception 'revoke all: %',r; end if;
  if exists(select 1 from public.t2_desktop_qurilma where foydalanuvchi_id=usr_b and bekor is null) then raise exception 'revoke all incomplete'; end if;

  -- Device cap read from policy (global 2; superadmin per-company override 3 for B).
  perform public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"max_qurilma":2}','limit',
    (select versiya from public.t2_desktop_siyosat where kompaniya_id is null and manba='platforma'),gen_random_uuid());
  for i in 1..2 loop
    r := public.t2_desktop_qurilma_yarat_v1(usr_b,gen_random_uuid(),md5('c'||i)||md5('c'||i),exp,gen_random_uuid());
    if r->>'ok' is distinct from 'true' then raise exception 'cap premature: %',r; end if;
  end loop;
  r := public.t2_desktop_qurilma_yarat_v1(usr_b,gen_random_uuid(),md5('c3')||md5('c3'),exp,gen_random_uuid());
  if r->>'code' is distinct from 'DEVICE_LIMIT' or (r->>'max_qurilma')::int is distinct from 2 then raise exception 'cap from policy: %',r; end if;
  perform public.t2_desktop_siyosat_saqla_v1(sa,kb,'platforma','{"max_qurilma":3}','B uchun',null,gen_random_uuid());
  if public.t2_desktop_qurilma_yarat_v1(usr_b,gen_random_uuid(),md5('c3')||md5('c3'),exp,gen_random_uuid())->>'ok' is distinct from 'true' then raise exception 'company override cap'; end if;
  perform public.t2_desktop_boshqaruv_buyruq_v1(sa,'foydalanuvchi_bekor',null,null,usr_b,null,'tozalash',gen_random_uuid());

  -- Minimum app version (numeric: 1.10.0 > 1.2.0). Unknown version (NULL / old client) is allowed — nudge only.
  perform public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"min_versiya":"1.2.0"}','versiya',
    (select versiya from public.t2_desktop_siyosat where kompaniya_id is null and manba='platforma'),gen_random_uuid());
  if public.t2_desktop_qurilma_yarat_v2(usr_b,gen_random_uuid(),md5('v0')||md5('v0'),exp,gen_random_uuid(),null,null,'1.1.9')->>'code' is distinct from 'DESKTOP_UPDATE_REQUIRED' then raise exception 'min version enroll'; end if;
  r := public.t2_desktop_qurilma_yarat_v1(usr_b,gen_random_uuid(),md5('v1')||md5('v1'),exp,gen_random_uuid());
  if r->>'ok' is distinct from 'true' then raise exception 'unknown version enroll must pass: %',r; end if; dn := (r->>'device_id')::uuid;
  if public.t2_desktop_qurilma_tekshir_v1(md5('v1')||md5('v1'))->>'ok' is distinct from 'true' then raise exception 'NULL version auto-revoked'; end if;
  if public.t2_desktop_qurilma_yarat_v2(usr_b,gen_random_uuid(),md5('v2')||md5('v2'),exp,gen_random_uuid(),null,null,'1.10.0')->>'ok' is distinct from 'true' then raise exception 'numeric version compare'; end if;
  if public.t2_desktop_qurilma_tekshir_v2(md5('v2')||md5('v2'),'1.1.0')->>'code' is distinct from 'DESKTOP_UPDATE_REQUIRED' then raise exception 'min version verify'; end if;
  r := public.t2_desktop_qurilma_yarat_v2(usr_b,gen_random_uuid(),md5('v3')||md5('v3'),exp,gen_random_uuid(),null,null,'1.2.0');
  if r->>'ok' is distinct from 'true' then raise exception 'exact min version: %',r; end if; d2 := (r->>'device_id')::uuid;
  if public.t2_desktop_qurilma_tekshir_v2(md5('v3')||md5('v3'),'1.2.0')->>'ok' is distinct from 'true' then raise exception 'verify current version'; end if;

  -- Lease: legacy v1 wrapper, company lease length, company version gate, offline switch; trace recorded.
  if public.t2_desktop_lease_chegara_v1(usr_b,d2)->>'ok' is distinct from 'true' then raise exception 'lease v1 wrapper'; end if;
  perform public.t2_desktop_siyosat_saqla_v1(sa,kb,'platforma','{"lease_soat":24}','qisqa lease',
    (select versiya from public.t2_desktop_siyosat where kompaniya_id=kb and manba='platforma'),gen_random_uuid());
  r := public.t2_desktop_lease_chegara_v2(usr_b,d2,kb,3);
  if r->>'ok' is distinct from 'true' or (r->>'lease_ms')::bigint is distinct from 86400000 then raise exception 'lease duration: %',r; end if;
  if (select oxirgi_lease_kompaniya_id from public.t2_desktop_qurilma where device_id=d2) is distinct from kb then raise exception 'lease trace'; end if;
  if (select max_qurilma from public.t2_desktop_siyosat where kompaniya_id=kb and manba='platforma') is distinct from 3 then raise exception 'company partial update lost fields'; end if;
  perform public.t2_desktop_siyosat_saqla_v1(sa,kb,'platforma','{"oflayn":false}','oflayn yopiq',
    (select versiya from public.t2_desktop_siyosat where kompaniya_id=kb and manba='platforma'),gen_random_uuid());
  if public.t2_desktop_lease_chegara_v2(usr_b,d2,kb,3)->>'code' is distinct from 'DESKTOP_OFFLINE_DISABLED' then raise exception 'offline switch'; end if;
  if public.t2_desktop_lease_chegara_v2(mem_a,d2,kb,3)->>'code' is distinct from 'DEVICE_AUTH_REQUIRED' then raise exception 'lease wrong actor'; end if;
  if public.t2_desktop_siyosat_saqla_v1(sa,kb,'platforma','{"lease_soat":96}','juda uzun',
    (select versiya from public.t2_desktop_siyosat where kompaniya_id=kb and manba='platforma'),gen_random_uuid())->>'code' is distinct from 'POLICY_VALUE_INVALID' then raise exception 'lease above contract max'; end if;
  if public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"yuklab_olish_url":"javascript:alert(1)"}','url',
    (select versiya from public.t2_desktop_siyosat where kompaniya_id is null and manba='platforma'),gen_random_uuid())->>'code' is distinct from 'POLICY_VALUE_INVALID' then raise exception 'unsafe download url'; end if;
  if public.t2_desktop_yangilanish_v1(mem_a)->>'ok' is distinct from 'true' then raise exception 'user update info'; end if;

  -- Security posture.
  if not (select relrowsecurity from pg_class where oid='public.t2_desktop_siyosat'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.t2_desktop_audit'::regclass) then raise exception 'RLS off'; end if;
  if has_table_privilege('anon','public.t2_desktop_siyosat','select') or has_table_privilege('authenticated','public.t2_desktop_audit','select')
    or has_table_privilege('authenticated','public.t2_desktop_siyosat','update') then raise exception 'admin tables public'; end if;
  if has_function_privilege('anon','public.t2_desktop_boshqaruv_v1(bigint,bigint)','execute')
    or has_function_privilege('authenticated','public.t2_desktop_boshqaruv_buyruq_v1(bigint,text,bigint,uuid,bigint,bigint,text,uuid)','execute')
    or has_function_privilege('authenticated','public.t2_desktop_siyosat_saqla_v1(bigint,bigint,text,jsonb,text,integer,uuid)','execute')
    or has_function_privilege('anon','public.t2_desktop_lease_chegara_v1(bigint,uuid)','execute')
    or has_function_privilege('anon','public.t2_desktop_qurilma_tekshir_v2(text,text)','execute') then raise exception 'admin RPC public'; end if;
  raise notice 'T2_DESKTOP_BOSHQARUV_ACCEPTANCE_PASS';
end $$;
rollback;
