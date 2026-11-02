-- ACCEPTANCE: 20261117100000_t2_f2_tasdiqlangan_bekor_v1 (migratsiya qo'llangan bazada; BEGIN..ROLLBACK — sintetik fixture, hech narsa qolmaydi).
-- Tekshiradi: tasdiqlangan F2 → bekor faqat transition orqali, sabab majburiy, versiya CAS, ruxsat (bugalter rad);
-- akt qatorlari / certified qiymatlar o'zgarmaydi; tarix + audit yoziladi; bekor F2 jamidan chiqadi;
-- boshqa har qanday tahrir hamon 55000 (muzlatilgan); eski t2_akt_bekor tasdiqlanganni o'tkazmaydi.
begin;

do $acc$
declare
  k bigint; o bigint; up bigint; ub bigint; q bigint; a1 bigint; a2 bigint; r jsonb; v_ver int;
  v_xesh_oldin text; v_xesh_keyin text; v_state text; v_n int;
  rep text[] := array[]::text[];
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_F2BEKOR_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_F2BEKOR_O_', k) returning id into o;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tf2b_pto_' || k, 'pto', 'faol') returning id into up;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tf2b_bug_' || k, 'bugalter', 'faol') returning id into ub;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, k, 'pto', 'faol'), (ub, k, 'bugalter', 'faol');
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, daraja, tartib, nom, hajm, narx) values (o, k, 'rs', 0, 1, '_Q_', 10, 1000) returning id into q;

  -- Fixture: tasdiqlangan F2 (trigerlarsiz)
  set local session_replication_role = replica;
  insert into public.t2_akt (kompaniya_id, obyekt_id, tur, oy, holat, lifecycle_status, raqam, versiya)
  values (k, o, 'f2', '2026-09-01', 'tasdiqlangan', 'approved', '_TB1_', 3) returning id into a1;
  insert into public.t2_akt (kompaniya_id, obyekt_id, tur, oy, holat, lifecycle_status, raqam, versiya)
  values (k, o, 'f2', '2026-10-01', 'tasdiqlangan', 'approved', '_TB2_', 1) returning id into a2;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx, certified_quantity, certified_unit_price, certified_amount, provenance_status)
  values (a1, q, o, k, 4, 1000, 4, 1000, 4000, 'source_certified');
  set local session_replication_role = origin;

  select md5(string_agg(to_jsonb(x)::text, '|' order by x.id)) into v_xesh_oldin from public.t2_akt_qator x where x.akt_id = a1;
  rep := rep || (case when (select f2_hajm from public.t2_qator_holat where qator_id = q) = 4 then 'OK   fixture: F2 hajm 4' else 'FAIL fixture F2' end);

  -- 1. Sabab majburiy
  r := public.t2_akt_lifecycle_transition_v1(k, a1, 'cancelled', up, 3, gen_random_uuid(), null);
  rep := rep || (case when r->>'code' = 'REASON_REQUIRED' then 'OK   sababsiz rad' else 'FAIL sababsiz: ' || r::text end);
  -- 2. Versiya CAS
  r := public.t2_akt_lifecycle_transition_v1(k, a1, 'cancelled', up, 2, gen_random_uuid(), 'qayta import');
  rep := rep || (case when r->>'code' = 'STALE_VERSION' then 'OK   eski versiya rad' else 'FAIL CAS: ' || r::text end);
  -- 3. Ruxsat: bugalter
  begin
    r := public.t2_akt_lifecycle_transition_v1(k, a1, 'cancelled', ub, 3, gen_random_uuid(), 'qayta import');
    rep := rep || ('FAIL bugalter o''tdi: ' || r::text);
  exception when insufficient_privilege then rep := rep || 'OK   bugalter PERMISSION_DENIED'::text;
  end;
  -- 4. Muvaffaqiyatli bekor
  r := public.t2_akt_lifecycle_transition_v1(k, a1, 'cancelled', up, 3, gen_random_uuid(), 'yangi smetaga qayta import');
  rep := rep || (case when (r->>'ok')::boolean and r->>'from_status' = 'approved' and r->>'status' = 'cancelled' then 'OK   approved → cancelled' else 'FAIL bekor: ' || r::text end);
  select versiya into v_ver from public.t2_akt where id = a1;
  rep := rep || (case when exists (select 1 from public.t2_akt where id = a1 and holat = 'bekor' and lifecycle_status = 'cancelled'
                                     and raqam = '_TB1_' and oy = '2026-09-01' and lifecycle_cancelled_at is not null)
                      then 'OK   sarlavha: holat bekor, biznes maydonlari o''zgarmagan' else 'FAIL sarlavha' end);
  select md5(string_agg(to_jsonb(x)::text, '|' order by x.id)) into v_xesh_keyin from public.t2_akt_qator x where x.akt_id = a1;
  rep := rep || (case when v_xesh_oldin = v_xesh_keyin then 'OK   akt qatorlari/certified bayt-bayt bir xil' else 'FAIL akt qatorlari o''zgardi' end);
  rep := rep || (case when exists (select 1 from public.t2_akt_holat_tarix h where h.akt_id = a1 and h.from_status = 'approved'
                                     and h.to_status = 'cancelled' and h.actor_id = up and h.reason = 'yangi smetaga qayta import')
                      then 'OK   holat tarixi (sabab, actor)' else 'FAIL holat tarixi' end);
  rep := rep || (case when (select f2_hajm from public.t2_qator_holat where qator_id = q) = 0 then 'OK   bekor F2 jamidan chiqdi' else 'FAIL F2 hali sanalmoqda' end);
  select count(*) into v_n from public.t2_akt_qator where akt_id = a1;
  rep := rep || (case when v_n = 1 then 'OK   hech narsa o''chirilmadi' else 'FAIL qatorlar soni ' || v_n end);
  -- 4b. Takror (bir xil holat) — idempotent
  r := public.t2_akt_lifecycle_transition_v1(k, a1, 'cancelled', up, v_ver, gen_random_uuid(), 'takror');
  rep := rep || (case when (r->>'ok')::boolean then 'OK   takror bekor — xatosiz' else 'FAIL takror: ' || r::text end);

  -- 5. Boshqa tahrir hamon muzlatilgan
  begin
    update public.t2_akt set izoh = 'buzish' where id = a2;
    rep := rep || 'FAIL tasdiqlangan akt tahrirlandi'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || (case when v_state = '55000' then 'OK   boshqa tahrir 55000' else 'FAIL tahrir: ' || v_state end);
  end;
  -- 6. Eski t2_akt_bekor tasdiqlanganni o'tkazmaydi (transitionsiz)
  begin
    r := public.t2_akt_bekor(a2, 'eski yo''l', null, 'test');
    rep := rep || ('FAIL legacy bekor o''tdi: ' || coalesce(r::text, 'null'));
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || (case when v_state = '55000' then 'OK   legacy t2_akt_bekor 55000' else 'FAIL legacy: ' || v_state end);
  end;
  rep := rep || (case when exists (select 1 from public.t2_akt where id = a2 and holat = 'tasdiqlangan') then 'OK   a2 tasdiqlangan qoldi' else 'FAIL a2' end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'ACCEPTANCE_F2_BEKOR FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'ACCEPTANCE_F2_BEKOR % OK:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;
