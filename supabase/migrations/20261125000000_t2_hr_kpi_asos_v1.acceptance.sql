-- ACCEPTANCE: 20261125000000 (HR+KPI sxema) - migratsiya qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture.
-- Tekshiradi: jadvallar + RLS yoqilgan + anon/authenticated yopiq; t2_kadr_bog yangi ustunlar (mavjud qator ulush=100);
-- cheklovlar (tuzatma summa XOR foiz, oy oyning 1-kuni, grafik 5|6, PINFL 14 raqam, tabel oy).
begin;

do $acc$
declare
  k bigint; kd bigint; o bigint; rep text[] := array[]::text[]; v_state text; v_n int; v_ok boolean;
begin
  -- 1. jadvallar va RLS
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and c.relname in ('t2_hr_sxema', 't2_hr_sozlama', 't2_hr_xodim', 't2_hr_xodim_pii', 't2_hr_kalendar', 't2_hr_tatil', 't2_hr_tabel', 't2_hr_tuzatma', 't2_hr_oylik');
  rep := rep || (case when v_n = 9 then 'OK   9 jadval, RLS yoqilgan' else 'FAIL RLS: ' || v_n end);

  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name like 't2_hr_%' and grantee in ('anon', 'authenticated');
  rep := rep || (case when v_n = 0 then 'OK   anon/authenticated ga grant yo''q' else 'FAIL grant: ' || v_n end);

  -- 2. fixture
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_HR_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_HR_O_', k) returning id into o;
  insert into public.t2_kadr_mustaqil (kompaniya_id, ism_sharif, lavozim) values (k, 'TEST XODIM', 'prorab') returning id into kd;
  insert into public.t2_kadr_bog (kadr_id, obyekt_id, holat) values (kd, o, 'faol');
  select ulush_foiz into v_n from public.t2_kadr_bog where kadr_id = kd;
  rep := rep || (case when v_n = 100 then 'OK   t2_kadr_bog.ulush_foiz sukut 100' else 'FAIL ulush: ' || coalesce(v_n::text, 'null') end);

  insert into public.t2_hr_xodim (kadr_id, kompaniya_id, rol, grafik, baza_turi, baza_summa) values (kd, k, 'prorab', 6, 'oylik', null);
  rep := array_append(rep, 'OK   t2_hr_xodim: baza_summa NULL qabul qilindi (noma''lum)');

  -- 3. cheklovlar
  begin insert into public.t2_hr_xodim (kadr_id, kompaniya_id, grafik) values (kd, k, 7); v_ok := true; exception when check_violation or unique_violation then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   grafik 7 rad etildi' else 'FAIL grafik' end);

  begin insert into public.t2_hr_tuzatma (kompaniya_id, kadr_id, oy, tur, summa, foiz) values (k, kd, date '2026-03-01', 'jarima', 100, 5); v_ok := true; exception when check_violation then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   tuzatma: summa va foiz birga rad etildi' else 'FAIL summa XOR foiz' end);
  begin insert into public.t2_hr_tuzatma (kompaniya_id, kadr_id, oy, tur) values (k, kd, date '2026-03-01', 'jarima'); v_ok := true; exception when check_violation then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   tuzatma: summa ham foiz ham yo''q rad etildi' else 'FAIL summa/foiz yo''q' end);
  begin insert into public.t2_hr_tuzatma (kompaniya_id, kadr_id, oy, tur, summa) values (k, kd, date '2026-03-15', 'jarima', 10); v_ok := true; exception when check_violation then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   oy oyning 1-kuni bo''lishi shart' else 'FAIL oy' end);
  begin insert into public.t2_hr_xodim_pii (kadr_id, pinfl) values (kd, '123'); v_ok := true; exception when check_violation then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   PINFL 14 raqam talab qilinadi' else 'FAIL pinfl' end);
  insert into public.t2_hr_tabel (kadr_id, oy, kompaniya_id, kunlar) values (kd, date '2026-03-01', k, '{"1":"K"}'::jsonb);
  begin insert into public.t2_hr_tabel (kadr_id, oy, kompaniya_id, kunlar) values (kd, date '2026-04-01', k, '[]'::jsonb); v_ok := true; exception when check_violation then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   tabel kunlar obyekt bo''lishi shart' else 'FAIL tabel kunlar' end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    v_state := 'FAIL'; raise exception 'HR KPI ASOS ACCEPTANCE FAIL: %', array_to_string(rep, E'\n');
  end if;
  raise notice E'HR KPI ASOS ACCEPTANCE OK:\n%', array_to_string(rep, E'\n');
end $acc$;

rollback;
