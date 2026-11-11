-- ACCEPTANCE: 20261215000000 (kundalik ish jurnali) - migratsiya qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture.
-- Tekshiradi: yangi yozuv, takror operation_id (idempotent), CAS (eskirgan versiya), tahrir + tasdiq, kelajak sana,
-- begona obyekt, ruxsatsiz rol (buyurtmachi), uzun izoh.
begin;
set local statement_timeout = '300s';

do $acc$
declare
  k bigint; o bigint; k2 bigint; o2 bigint; up bigint; ub bigint; r jsonb; op uuid; v int;
  rep text[] := array[]::text[]; v_state text;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_JURNAL_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_JURNAL_O_', k) returning id into o;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_JURNAL_2_', gen_random_uuid()::text, true) returning id into k2;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_JURNAL_O2_', k2) returning id into o2;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tjr_pto_' || k, 'pto', 'faol') returning id into up;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tjr_buy_' || k, 'buyurtmachi', 'faol') returning id into ub;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, k, 'pto', 'faol'), (ub, k, 'buyurtmachi', 'faol');

  -- 1. Yangi yozuv
  op := gen_random_uuid();
  r := public.t2_ish_jurnal_saqla_v1(up, k, o, current_date, 'test izoh', '5 kishi', '{"harorat":20}'::jsonb, false, null, op);
  rep := rep || (case when (r->>'ok')::boolean and (r->>'versiya')::int = 1 and not (r->>'tasdiqlandi')::boolean
                      then 'OK   yangi yozuv v1' else 'FAIL yangi: ' || r::text end);

  -- 2. Bir xil operation_id - o'sha natija, ikkinchi qator yo'q
  r := public.t2_ish_jurnal_saqla_v1(up, k, o, current_date, 'boshqa', null, null, false, null, op);
  rep := rep || (case when (r->>'versiya')::int = 1 and (select count(*) from public.t2_ish_jurnal_izoh where obyekt_id = o) = 1
                      then 'OK   operation_id idempotent' else 'FAIL idempotent: ' || r::text end);

  -- 3. Eskirgan versiya (kutilgan 5, haqiqiy 1) rad etiladi
  r := public.t2_ish_jurnal_saqla_v1(up, k, o, current_date, 'x', null, null, false, 5, gen_random_uuid());
  rep := rep || (case when not (r->>'ok')::boolean and r->>'code' = 'STALE_VERSION' then 'OK   CAS: eskirgan versiya rad' else 'FAIL CAS: ' || r::text end);

  -- 4. Tahrir + tasdiq (versiya 1 -> 2), ob-havo snapshot saqlanib qoladi (null yuborilsa)
  r := public.t2_ish_jurnal_saqla_v1(up, k, o, current_date, 'yangi izoh', '6 kishi', null, true, 1, gen_random_uuid());
  select versiya into v from public.t2_ish_jurnal_izoh where obyekt_id = o and sana = current_date;
  rep := rep || (case when (r->>'ok')::boolean and (r->>'tasdiqlandi')::boolean and v = 2
                        and (select ob_havo->>'harorat' from public.t2_ish_jurnal_izoh where obyekt_id = o and sana = current_date) = '20'
                      then 'OK   tahrir + tasdiq, ob-havo saqlandi' else 'FAIL tahrir: ' || r::text end);

  -- 5. Kelajak sana rad
  r := public.t2_ish_jurnal_saqla_v1(up, k, o, current_date + 10, 'x', null, null, false, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'SANA_KELAJAK' then 'OK   kelajak sana rad' else 'FAIL kelajak: ' || r::text end);

  -- 6. Begona kompaniya obyekti rad
  r := public.t2_ish_jurnal_saqla_v1(up, k, o2, current_date, 'x', null, null, false, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'OBYEKT_NOT_FOUND' then 'OK   begona obyekt rad' else 'FAIL begona obyekt: ' || r::text end);

  -- 7. Ruxsatsiz rol (buyurtmachi) - PERMISSION_DENIED
  begin
    r := public.t2_ish_jurnal_saqla_v1(ub, k, o, current_date - 1, 'x', null, null, false, null, gen_random_uuid());
    rep := rep || ('FAIL ruxsat: ' || r::text);
  exception when sqlstate '42501' then
    rep := rep || 'OK   ruxsatsiz rol rad';
  end;

  -- 8. Uzun izoh (2001 belgi) rad
  r := public.t2_ish_jurnal_saqla_v1(up, k, o, current_date - 2, repeat('a', 2001), null, null, false, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'IZOH_UZUN' then 'OK   uzun izoh rad' else 'FAIL uzun izoh: ' || r::text end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception E'ACCEPTANCE FAIL\n%', array_to_string(rep, E'\n');
  end if;
  raise notice E'ACCEPTANCE OK\n%', array_to_string(rep, E'\n');
end $acc$;

rollback;
