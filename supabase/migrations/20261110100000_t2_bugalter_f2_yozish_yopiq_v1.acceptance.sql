-- ACCEPTANCE: 20261110100000_t2_bugalter_f2_yozish_yopiq_v1 (migratsiya qo'llangan bazada; BEGIN..ROLLBACK — hech narsa qolmaydi).
-- Tekshiradi: (1) rol to'plami; (2) haqiqiy a'zolik orqali t2_permission_allowed_v2 / t2_require_permission_v2;
-- (3) capability ga tayanadigan RPC (t2_akt_lifecycle_transition_v1) buxgalterni PERMISSION_DENIED bilan rad etadi,
-- pto ni esa ruxsat bosqichidan o'tkazadi; (4) t2_men_v1 buxgalterga F2 yozish capability berilmaydi.
begin;

do $acc$
declare
  yoz constant text[] := array['f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct'];
  k bigint; ub bigint; up bigint; c text; r jsonb; v_state text; v_msg text;
  rep text[] := array[]::text[];
  status text;
begin
  -- 1. Rol to'plami
  rep := rep || (case when not (yoz && public.t2_role_permissions_v2('bugalter')) then 'OK   bugalter: F2 yozish capability yo''q' else 'FAIL bugalter: ' || public.t2_role_permissions_v2('bugalter')::text end);
  rep := rep || (case when array['f2.read','smeta.read','fakt.read','narx.read','financial.read','financial.write'] <@ public.t2_role_permissions_v2('bugalter') then 'OK   bugalter: f2.read va moliya qoldi' else 'FAIL bugalter o''qish/moliya yo''qoldi' end);
  rep := rep || (case when yoz <@ public.t2_role_permissions_v2('pto') and yoz <@ public.t2_role_permissions_v2('prorab') then 'OK   pto/prorab: F2 yozish bor' else 'FAIL pto/prorab' end);
  rep := rep || (case when yoz <@ public.t2_role_permissions_v2('boss') then 'OK   boss: butun katalog' else 'FAIL boss' end);

  -- 2. Haqiqiy a'zolik
  insert into public.t2_kompaniya (nom, kod, faol) values ('TEST_BUGF2', 'TBF2', true) returning id into k;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tbf2_bugalter', 'bugalter', 'faol') returning id into ub;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tbf2_pto', 'pto', 'faol') returning id into up;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ub, k, 'bugalter', 'faol'), (up, k, 'pto', 'faol');
  foreach c in array yoz loop
    rep := rep || (case when not public.t2_permission_allowed_v2(k, ub, c) and public.t2_permission_allowed_v2(k, up, c)
                        then 'OK   ' || c || ': bugalter rad, pto ruxsat' else 'FAIL ' || c end);
    begin
      perform public.t2_require_permission_v2(k, ub, c);
      rep := rep || ('FAIL require ' || c || ' bugalterni o''tkazdi');
    exception when insufficient_privilege then rep := rep || ('OK   require ' || c || ': bugalter 42501');
    end;
  end loop;
  rep := rep || (case when public.t2_permission_allowed_v2(k, ub, 'f2.read') then 'OK   bugalter f2.read (a''zolik)' else 'FAIL bugalter f2.read' end);

  -- 3. RPC: lifecycle — ruxsat tekshiruvi akt qidiruvidan OLDIN (akt -1 mavjud emas).
  foreach status in array array['approved','submitted','cancelled','superseded'] loop
    begin
      r := public.t2_akt_lifecycle_transition_v1(k, -1, status, ub, 1, gen_random_uuid(), 'acceptance');
      rep := rep || ('FAIL lifecycle ' || status || ' bugalterni o''tkazdi: ' || coalesce(r::text, 'null'));
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
      rep := rep || (case when v_state = '42501' and v_msg like '%PERMISSION_DENIED%' then 'OK   lifecycle ' || status || ': bugalter PERMISSION_DENIED'
                          else 'FAIL lifecycle ' || status || ': ' || v_state || ' ' || v_msg end);
    end;
    begin
      r := public.t2_akt_lifecycle_transition_v1(k, -1, status, up, 1, gen_random_uuid(), 'acceptance');
      rep := rep || ('OK   lifecycle ' || status || ': pto ruxsatdan o''tdi (' || coalesce(r->>'code', 'ok') || ')');
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
      rep := rep || (case when v_msg like '%PERMISSION_DENIED%' then 'FAIL lifecycle ' || status || ': pto rad etildi'
                          else 'OK   lifecycle ' || status || ': pto ruxsatdan o''tdi (keyingi tekshiruv: ' || left(v_msg, 60) || ')' end);
    end;
  end loop;

  -- 4. t2_men_v1 — frontend shu ro'yxatdan oladi
  r := public.t2_men_v1(ub);
  rep := rep || (case when not exists (select 1 from jsonb_array_elements(r->'context_kompaniyalar') x, jsonb_array_elements_text(x->'permissions') p
                                       where (x->>'kompaniya_id')::bigint = k and p = any (yoz))
                      then 'OK   t2_men_v1: bugalter F2 yozish capability ko''rmaydi' else 'FAIL t2_men_v1' end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'ACCEPTANCE_BUGALTER_F2 FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'ACCEPTANCE_BUGALTER_F2 % OK:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;
