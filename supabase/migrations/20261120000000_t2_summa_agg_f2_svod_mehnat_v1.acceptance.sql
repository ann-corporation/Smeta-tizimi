-- ACCEPTANCE: 20261120000000 (F2 o'lchovida svod bo'limi ichidagi ЧЕЛ/МАШ yaxlit emas) - BEGIN..ROLLBACK, FAQAT sintetik fixture.
-- Tekshiradi: F2 da svod bo'limi ichidagi ЧЕЛ -> chel kesimi (ustama oladi), ОБ -> svod (ustamasiz); smeta o'lchovi o'zgarmaydi;
-- svod bo'limidan tashqari qator va f2_qoralama bir xil qoidada.
begin;

do $acc$
declare
  k bigint; o bigint; rz bigint; chel_q bigint; ob_q bigint; akt bigint; a_f2 jsonb; a_sm jsonb; a_qor jsonb;
  rep text[] := array[]::text[];
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_F2SVOD_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_F2SVOD_O_', k) returning id into o;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom) values (o, k, 'rz', 'svod bo''limi') returning id into rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kat, nom, birlik, hajm, narx) values
    (o, k, rz, 'rs', 'ЧЕЛ', 'mehnat', 'ЧЕЛ.-Ч', 10, 100) returning id into chel_q;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kat, nom, birlik, hajm, narx) values
    (o, k, rz, 'ob', 'ОБ', 'jihoz', 'шт', 1, 500) returning id into ob_q;
  insert into public.t2_svod_yaxlit (kompaniya_id, obyekt_id, qator_id, svod_summa, qqs_stavka, sabab)
    values (k, o, rz, 1680, 12, 'acceptance fixture');
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat) values (o, k, 'f2', 'ACC-F2', date '2026-03-01', 'qoralama') returning id into akt;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values
    (akt, chel_q, o, k, 10, 100), (akt, ob_q, o, k, 1, 500);

  select agg into a_qor from public._t2_summa_agg_v1(array[o], 'f2_qoralama');
  update public.t2_akt set holat = 'tasdiqlangan' where id = akt;
  select agg into a_f2 from public._t2_summa_agg_v1(array[o], 'f2');
  select agg into a_sm from public._t2_summa_agg_v1(array[o], 'smeta');
  rep := rep || (case when (a_f2->>'chel')::numeric = 1000 and (a_f2->>'svod')::numeric = 500
                      then 'OK   f2: svod ichidagi ЧЕЛ -> chel, ОБ -> svod' else 'FAIL f2 kesim ' || a_f2::text end);
  rep := rep || (case when (a_sm->>'chel')::numeric = 0
                      then 'OK   smeta o''lchovi o''zgarmagan (chel qayta ajratilmaydi)' else 'FAIL smeta kesim ' || a_sm::text end);

  rep := rep || (case when (a_qor->>'chel')::numeric = 1000 and (a_qor->>'svod')::numeric = 500
                      then 'OK   f2_qoralama bir xil qoida' else 'FAIL qoralama ' || a_qor::text end);

  -- Ustama oladi: ЧЕЛ kesimi paket hisobida ustamali > ustamasiz (nk: 18% prochie, 12% QQS).
  rep := rep || (case when (public._t2_summa_paket_hisob_v1(a_f2, public.t2_nakrutka_default_v1())->>'ustamali')::numeric
                         > (a_f2->>'chel')::numeric + (a_f2->>'svod')::numeric
                      then 'OK   ЧЕЛ ustama oladi, svod ustamasiz' else 'FAIL ustama' end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'ACCEPTANCE_F2_SVOD_MEHNAT FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'ACCEPTANCE_F2_SVOD_MEHNAT % OK:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;
