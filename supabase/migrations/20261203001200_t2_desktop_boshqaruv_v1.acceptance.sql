-- Synthetic acceptance for 20261203001200_t2_desktop_boshqaruv_v1. No real actors/data; everything disappears at ROLLBACK.
begin;
do $$
declare
  ka bigint; kb bigint; sa bigint; boss_a bigint; mem_a bigint; usr_b bigint; r jsonb; i integer;
  da uuid; db uuid; dm uuid;
  exp bigint := floor(extract(epoch from clock_timestamp())*1000)::bigint + 3600000;
  gv integer;
begin
  -- Fixtures: company A (boss + member), company B (member), platform superadmin.
  insert into public.t2_kompaniya(nom,kod) values('_TEST_DESKTOP_A_',gen_random_uuid()::text) returning id into ka;
  insert into public.t2_kompaniya(nom,kod) values('_TEST_DESKTOP_B_',gen_random_uuid()::text) returning id into kb;
  insert into public.t2_foydalanuvchi(login,ism,holat) values('dkb_sa_'||gen_random_uuid(),'Synthetic SA','faol') returning id into sa;
  insert into public.t2_foydalanuvchi(login,ism,holat) values('dkb_boss_'||gen_random_uuid(),'Synthetic Boss A','faol') returning id into boss_a;
  insert into public.t2_foydalanuvchi(login,ism,holat) values('dkb_mem_'||gen_random_uuid(),'Synthetic Member A','faol') returning id into mem_a;
  insert into public.t2_foydalanuvchi(login,ism,holat) values('dkb_usr_'||gen_random_uuid(),'Synthetic User B','faol') returning id into usr_b;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol,holat) values
    (sa,ka,'superadmin','faol'),(boss_a,ka,'boss','faol'),(mem_a,ka,'pto','faol'),(usr_b,kb,'pto','faol');
  -- Isolate from whatever global policy exists: neutral defaults for this transaction.
  update public.t2_desktop_siyosat set yoqilgan=true,max_qurilma=10,lease_soat=72,oflayn=true,min_versiya=null
    where kompaniya_id is null and manba='platforma';
  select versiya into gv from public.t2_desktop_siyosat where kompaniya_id is null and manba='platforma';

  r := public.t2_desktop_qurilma_yarat_v2(mem_a,gen_random_uuid(),repeat('1',64),exp,gen_random_uuid(),'PC-A','windows','1.0.0');
  if r->>'ok' <> 'true' then raise exception 'enroll member A: %',r; end if; dm := (r->>'device_id')::uuid;
  r := public.t2_desktop_qurilma_yarat_v2(usr_b,gen_random_uuid(),repeat('2',64),exp,gen_random_uuid(),'PC-B','windows','1.0.0');
  if r->>'ok' <> 'true' then raise exception 'enroll user B: %',r; end if; db := (r->>'device_id')::uuid;
  if (select ilova_versiya from public.t2_desktop_qurilma where device_id=dm) <> '1.0.0' then raise exception 'metadata not stored'; end if;

  -- Tenant isolation (read).
  if public.t2_desktop_boshqaruv_v1(mem_a,ka)->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'regular member read company'; end if;
  if public.t2_desktop_boshqaruv_v1(mem_a,null)->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'regular member read global'; end if;
  if public.t2_desktop_boshqaruv_v1(boss_a,null)->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'boss read global'; end if;
  if public.t2_desktop_boshqaruv_v1(boss_a,kb)->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'boss read other company'; end if;
  r := public.t2_desktop_boshqaruv_v1(boss_a,ka);
  if r->>'ok' <> 'true' then raise exception 'boss read own: %',r; end if;
  if exists(select 1 from jsonb_array_elements(r->'qurilmalar') q where (q->>'foydalanuvchi_id')::bigint in (usr_b,sa)) then raise exception 'boss sees foreign/superadmin device'; end if;
  if not exists(select 1 from jsonb_array_elements(r->'qurilmalar') q where (q->>'device_id')::uuid=dm) then raise exception 'boss misses own member device'; end if;
  if r::text like '%token_hash%' then raise exception 'token hash leaked'; end if;
  if public.t2_desktop_boshqaruv_v1(sa,null)->>'ok' <> 'true' then raise exception 'superadmin global read'; end if;

  -- Tenant isolation (commands).
  if public.t2_desktop_boshqaruv_buyruq_v1(mem_a,'bekor',ka,dm,null,null,'test sabab',gen_random_uuid())->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'member revoke'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'bekor',ka,db,null,null,'test sabab',gen_random_uuid())->>'code' <> 'TENANT_FORBIDDEN' then raise exception 'boss revoke foreign via own company'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'bekor',kb,db,null,null,'test sabab',gen_random_uuid())->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'boss revoke via other company'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'foydalanuvchi_bekor',ka,null,usr_b,null,'test sabab',gen_random_uuid())->>'code' <> 'TENANT_FORBIDDEN' then raise exception 'boss revoke-all foreign'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'muddat',ka,dm,null,exp-60000,'test sabab',gen_random_uuid())->>'code' <> 'SUPERADMIN_REQUIRED' then raise exception 'boss expiry'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'bekor',ka,dm,null,null,'  ',gen_random_uuid())->>'code' <> 'SABAB_REQUIRED' then raise exception 'reason required'; end if;
  if public.t2_desktop_siyosat_saqla_v1(boss_a,null,'platforma','{"yoqilgan":false}',null,null,gen_random_uuid())->>'code' <> 'SABAB_REQUIRED' then raise exception 'policy reason'; end if;
  if public.t2_desktop_siyosat_saqla_v1(boss_a,null,'platforma','{"yoqilgan":false}','kill',null,gen_random_uuid())->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'boss global kill switch'; end if;
  if public.t2_desktop_siyosat_saqla_v1(boss_a,ka,'platforma','{"max_qurilma":50}','loosen',null,gen_random_uuid())->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'boss platform override'; end if;
  if public.t2_desktop_siyosat_saqla_v1(boss_a,kb,'kompaniya','{"yoqilgan":false}','other co',null,gen_random_uuid())->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'boss other company policy'; end if;
  if public.t2_desktop_siyosat_saqla_v1(boss_a,ka,'kompaniya','{"joriy_versiya":"9.9.9"}','installer',null,gen_random_uuid())->>'code' <> 'POLICY_FIELD_INVALID' then raise exception 'company installer field'; end if;

  -- Revoke by boss: audited, idempotent, verify refuses.
  da := gen_random_uuid();
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'bekor',ka,dm,null,null,'yo''qolgan noutbuk',da)->>'ok' <> 'true' then raise exception 'boss revoke own member'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(boss_a,'bekor',ka,dm,null,null,'yo''qolgan noutbuk',da)->>'takror' <> 'true' then raise exception 'command not idempotent'; end if;
  if (select count(*) from public.t2_desktop_audit where actor_id=boss_a and operation_id=da and kompaniya_id=ka and amal='bekor' and device_id=dm) <> 1 then raise exception 'audit missing'; end if;
  if public.t2_desktop_qurilma_tekshir_v1(repeat('1',64))->>'ok' <> 'false' then raise exception 'revoked device verified'; end if;
  if (select bekor_qildi from public.t2_desktop_qurilma where device_id=dm) <> boss_a then raise exception 'revoker not recorded'; end if;

  -- Superadmin expiry change (bounded by enrolling session expiry).
  if public.t2_desktop_boshqaruv_buyruq_v1(sa,'muddat',null,db,null,exp+1,'uzaytirish',gen_random_uuid())->>'code' <> 'EXPIRY_INVALID' then raise exception 'expiry beyond session'; end if;
  if public.t2_desktop_boshqaruv_buyruq_v1(sa,'muddat',null,db,null,exp-600000,'qisqartirish',gen_random_uuid())->>'ok' <> 'true' then raise exception 'superadmin shorten'; end if;
  if (select tugaydi from public.t2_desktop_qurilma where device_id=db) <> exp-600000 then raise exception 'expiry not applied'; end if;

  -- Kill switch (global): enroll and verify refuse with explicit code; refused device is retired server-side.
  if public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"yoqilgan":false,"max_qurilma":10,"lease_soat":72,"oflayn":true}','avariya',gv+1,gen_random_uuid())->>'code' <> 'STALE_VERSION' then raise exception 'stale version'; end if;
  r := public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"yoqilgan":false,"max_qurilma":10,"lease_soat":72,"oflayn":true}','avariya',gv,gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'kill switch save: %',r; end if;
  if public.t2_desktop_qurilma_yarat_v1(usr_b,gen_random_uuid(),repeat('3',64),exp,gen_random_uuid())->>'code' <> 'DESKTOP_DISABLED' then raise exception 'kill switch enroll'; end if;
  if public.t2_desktop_qurilma_tekshir_v1(repeat('2',64))->>'code' <> 'DESKTOP_DISABLED' then raise exception 'kill switch verify'; end if;
  if (select bekor_sabab from public.t2_desktop_qurilma where device_id=db) <> 'DESKTOP_DISABLED' then raise exception 'disabled device not retired'; end if;
  perform public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"yoqilgan":true,"max_qurilma":10,"lease_soat":72,"oflayn":true}','tiklash',null,gen_random_uuid());

  -- Company kill switch (boss self-restriction) blocks only that company's members.
  if public.t2_desktop_siyosat_saqla_v1(boss_a,ka,'kompaniya','{"yoqilgan":false}','vaqtincha',null,gen_random_uuid())->>'ok' <> 'true' then raise exception 'boss own company policy'; end if;
  if public.t2_desktop_qurilma_yarat_v1(mem_a,gen_random_uuid(),repeat('4',64),exp,gen_random_uuid())->>'code' <> 'DESKTOP_DISABLED' then raise exception 'company kill enroll'; end if;
  r := public.t2_desktop_qurilma_yarat_v1(usr_b,gen_random_uuid(),repeat('5',64),exp,gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'other company blocked: %',r; end if;
  perform public.t2_desktop_siyosat_saqla_v1(boss_a,ka,'kompaniya','{"yoqilgan":null}','qayta yoqish',null,gen_random_uuid());

  -- Device cap read from policy (global 2; superadmin per-company override 3 for B).
  perform public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"yoqilgan":true,"max_qurilma":2,"lease_soat":72,"oflayn":true}','limit',null,gen_random_uuid());
  r := public.t2_desktop_qurilma_yarat_v1(usr_b,gen_random_uuid(),repeat('6',64),exp,gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'cap premature: %',r; end if;
  r := public.t2_desktop_qurilma_yarat_v1(usr_b,gen_random_uuid(),repeat('7',64),exp,gen_random_uuid());
  if r->>'code' <> 'DEVICE_LIMIT' or (r->>'max_qurilma')::int <> 2 then raise exception 'cap from policy: %',r; end if;
  perform public.t2_desktop_siyosat_saqla_v1(sa,kb,'platforma','{"max_qurilma":3}','B uchun',null,gen_random_uuid());
  if public.t2_desktop_qurilma_yarat_v1(usr_b,gen_random_uuid(),repeat('7',64),exp,gen_random_uuid())->>'ok' <> 'true' then raise exception 'company override cap'; end if;
  -- Superadmin revoke-all for a user (force re-login).
  r := public.t2_desktop_boshqaruv_buyruq_v1(sa,'foydalanuvchi_bekor',null,null,usr_b,null,'qayta kirish',gen_random_uuid());
  if r->>'ok' <> 'true' or (r->>'soni')::int < 3 then raise exception 'revoke all: %',r; end if;
  if exists(select 1 from public.t2_desktop_qurilma where foydalanuvchi_id=usr_b and bekor is null) then raise exception 'revoke all incomplete'; end if;

  -- Minimum app version (numeric, not lexical: 1.10.0 > 1.2.0). Old client (no version) must update.
  perform public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"yoqilgan":true,"max_qurilma":10,"lease_soat":72,"oflayn":true,"min_versiya":"1.2.0"}','versiya',null,gen_random_uuid());
  if public.t2_desktop_qurilma_yarat_v2(usr_b,gen_random_uuid(),repeat('8',64),exp,gen_random_uuid(),null,null,'1.1.9')->>'code' <> 'DESKTOP_UPDATE_REQUIRED' then raise exception 'min version enroll'; end if;
  if public.t2_desktop_qurilma_yarat_v1(usr_b,gen_random_uuid(),repeat('8',64),exp,gen_random_uuid())->>'code' <> 'DESKTOP_UPDATE_REQUIRED' then raise exception 'unknown version enroll'; end if;
  if public.t2_desktop_qurilma_yarat_v2(usr_b,gen_random_uuid(),repeat('8',64),exp,gen_random_uuid(),null,null,'1.10.0')->>'ok' <> 'true' then raise exception 'numeric version compare'; end if;
  if public.t2_desktop_qurilma_tekshir_v2(repeat('8',64),'1.1.0')->>'code' <> 'DESKTOP_UPDATE_REQUIRED' then raise exception 'min version verify'; end if;
  r := public.t2_desktop_qurilma_yarat_v2(usr_b,gen_random_uuid(),repeat('9',64),exp,gen_random_uuid(),null,null,'1.2.0');
  if r->>'ok' <> 'true' then raise exception 'exact min version: %',r; end if;
  if public.t2_desktop_qurilma_tekshir_v2(repeat('9',64),'1.2.0')->>'ok' <> 'true' then raise exception 'verify current version'; end if;
  db := (r->>'device_id')::uuid;

  -- Lease: company offline switch and lease duration; trace recorded.
  perform public.t2_desktop_siyosat_saqla_v1(sa,kb,'platforma','{"lease_soat":24}','qisqa lease',null,gen_random_uuid());
  r := public.t2_desktop_lease_chegara_v2(usr_b,db,kb,3);
  if r->>'ok' <> 'true' or (r->>'lease_ms')::bigint <> 86400000 then raise exception 'lease duration: %',r; end if;
  if (select oxirgi_lease_kompaniya_id from public.t2_desktop_qurilma where device_id=db) <> kb then raise exception 'lease trace'; end if;
  perform public.t2_desktop_siyosat_saqla_v1(sa,kb,'platforma','{"lease_soat":24,"oflayn":false}','oflayn yopiq',null,gen_random_uuid());
  if public.t2_desktop_lease_chegara_v2(usr_b,db,kb,3)->>'code' <> 'DESKTOP_OFFLINE_DISABLED' then raise exception 'offline switch'; end if;
  if public.t2_desktop_lease_chegara_v2(mem_a,db,kb,3)->>'code' <> 'DEVICE_AUTH_REQUIRED' then raise exception 'lease wrong actor'; end if;
  if public.t2_desktop_siyosat_saqla_v1(sa,kb,'platforma','{"lease_soat":96}','juda uzun',null,gen_random_uuid())->>'code' <> 'POLICY_VALUE_INVALID' then raise exception 'lease above contract max'; end if;
  if public.t2_desktop_siyosat_saqla_v1(sa,null,'platforma','{"yuklab_olish_url":"javascript:alert(1)"}','url',null,gen_random_uuid())->>'code' <> 'POLICY_VALUE_INVALID' then raise exception 'unsafe download url'; end if;
  if public.t2_desktop_yangilanish_v1(mem_a)->>'ok' <> 'true' then raise exception 'user update info'; end if;

  -- Security posture.
  if not (select relrowsecurity from pg_class where oid='public.t2_desktop_siyosat'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.t2_desktop_audit'::regclass) then raise exception 'RLS off'; end if;
  if has_table_privilege('anon','public.t2_desktop_siyosat','select') or has_table_privilege('authenticated','public.t2_desktop_audit','select')
    or has_table_privilege('authenticated','public.t2_desktop_siyosat','update') then raise exception 'admin tables public'; end if;
  if has_function_privilege('anon','public.t2_desktop_boshqaruv_v1(bigint,bigint)','execute')
    or has_function_privilege('authenticated','public.t2_desktop_boshqaruv_buyruq_v1(bigint,text,bigint,uuid,bigint,bigint,text,uuid)','execute')
    or has_function_privilege('authenticated','public.t2_desktop_siyosat_saqla_v1(bigint,bigint,text,jsonb,text,integer,uuid)','execute')
    or has_function_privilege('anon','public.t2_desktop_qurilma_tekshir_v2(text,text)','execute') then raise exception 'admin RPC public'; end if;
  raise notice 'T2_DESKTOP_BOSHQARUV_ACCEPTANCE_PASS';
end $$;
rollback;
