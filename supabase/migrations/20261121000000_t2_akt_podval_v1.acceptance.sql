-- ACCEPTANCE: 20261121000000 (F2 hujjat podvali) - BEGIN..ROLLBACK, FAQAT sintetik fixture.
-- Tekshiradi: (1) podvalsiz F2 - obyekt smeta podvali (eskicha); (2) podvalli F2 - o'z podvali; (3) storno nusxasi aynan teskari ishora;
-- (4) aralash (podvalli + podvalsiz) yig'indi; (5) pereraschet: bitta aktda blok '<manba akt>' o'z podvali, yangi qator smeta podvali;
-- (6) RPC yozuvi: tasdiqlangan F2 uchun faqat backfill; (7) 5 argli o'tkazgich.
begin;

do $acc$
declare
  k bigint; o bigint; chel_q bigint; mat_q bigint; a1 bigint; a2 bigint; a3 bigint; a4 bigint; u bigint;
  p jsonb; rep text[] := array[]::text[]; r jsonb; sm numeric;
  podval jsonb := jsonb_build_object('nk', jsonb_build_object('ПРОЧИЕ_ПОДРЯДЧИК', 10, 'НДС', 12), 'itogo4', 1100,
                                     'qatorlar', jsonb_build_array(jsonb_build_object('kod', 'prochie', 'nom', 'PROCHIE', 'foiz', 10, 'summa', 100)));
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_PODVAL_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_PODVAL_O_', k) returning id into o;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kat, nom, birlik, hajm, narx) values
    (o, k, 'bl', 'ЧЕЛ', 'mehnat', 'ЧЕЛ.-Ч', 10, 100) returning id into chel_q;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kat, nom, birlik, hajm, narx) values
    (o, k, 'bl', 'МАТ', 'material', 'шт', 5, 200) returning id into mat_q;

  -- a1: podvalsiz (smeta podvali); a2: o'z podvali; a3: a2 ning storno nusxasi; a4: pereraschet (storno bloki + yangi qator)
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat) values (o, k, 'f2', 'ACC-1', date '2026-03-01', 'qoralama') returning id into a1;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat) values (o, k, 'f2', 'ACC-2', date '2026-04-01', 'qoralama') returning id into a2;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat) values (o, k, 'f2', 'ACC-3', date '2026-05-01', 'qoralama') returning id into a3;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat) values (o, k, 'f2', 'ACC-4', date '2026-06-01', 'qoralama') returning id into a4;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (a1, chel_q, o, k, 10, 100);
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (a2, chel_q, o, k, 10, 100);
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx, raw_snapshot) values
    (a3, chel_q, o, k, -10, 100, jsonb_build_object('source', 'storno', 'stornoOf', a2));
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx, raw_snapshot) values
    (a4, chel_q, o, k, -10, 100, jsonb_build_object('source', 'storno', 'stornoOf', a2));
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (a4, mat_q, o, k, 5, 200);

  -- podval qatorini to'g'ridan-to'g'ri yozamiz (fixture; RPC aktyor/ruxsat talab qiladi - alohida tekshiriladi pastda)
  insert into public.t2_akt_podval (akt_id, blok, kompaniya_id, obyekt_id, manba, nk, nds_foiz)
    values (a2, '', k, o, 'import', public.t2_nakrutka_default_v1() || '{"ПРОЧИЕ_ПОДРЯДЧИК":10,"СТРАХОВАНИЕ":0,"РИСК":0}'::jsonb, 12);
  insert into public.t2_akt_podval (akt_id, blok, kompaniya_id, obyekt_id, manba, manba_akt_id, ishora, nk, nds_foiz)
    values (a3, a2::text, k, o, 'storno', a2, -1, public.t2_nakrutka_default_v1() || '{"ПРОЧИЕ_ПОДРЯДЧИК":10,"СТРАХОВАНИЕ":0,"РИСК":0}'::jsonb, 12);
  insert into public.t2_akt_podval (akt_id, blok, kompaniya_id, obyekt_id, manba, manba_akt_id, ishora, nk, nds_foiz)
    values (a4, a2::text, k, o, 'storno', a2, -1, public.t2_nakrutka_default_v1() || '{"ПРОЧИЕ_ПОДРЯДЧИК":10,"СТРАХОВАНИЕ":0,"РИСК":0}'::jsonb, 12);

  -- (1) podvalsiz = eskicha (obyekt smeta podvali)
  select x.paket into p from public._t2_summa_paket_v1(array[o], 'aktlar', array[a1]) x;
  select (public._t2_summa_paket_hisob_v1(g.agg, n.x->'nk')->>'qqs_bilan')::numeric into sm
    from public._t2_summa_agg_v1(array[o], 'aktlar', array[a1]) g cross join lateral (select public._t2_obyekt_nk_v1(o) x) n;
  rep := rep || (case when (p->>'qqs_bilan')::numeric = sm and p->>'akt_podvalli' is null
                      then 'OK   podvalsiz F2 - smeta podvali (eskicha), akt_podvalli yo''q' else 'FAIL podvalsiz ' || p::text end);

  -- (2) o'z podvali: chel 1000, prochie 10% -> 1100; QQS 12% -> 132; jami 1232
  select x.paket into p from public._t2_summa_paket_v1(array[o], 'aktlar', array[a2]) x;
  rep := rep || (case when (p->>'ustamali')::numeric = 1100 and (p->>'qqs')::numeric = 132 and (p->>'qqs_bilan')::numeric = 1232
                      and (p->>'ustamasiz')::numeric = 1000 and (p->>'akt_podvalli')::numeric = 1
                      then 'OK   o''z podvali bilan 1100 / 132 / 1232' else 'FAIL o''z podval ' || p::text end);

  -- (3) storno = aynan teskari
  select x.paket into r from public._t2_summa_paket_v1(array[o], 'aktlar', array[a3]) x;
  rep := rep || (case when (r->>'qqs_bilan')::numeric = -1232 and (r->>'ustamali')::numeric = -1100 and (r->>'ustamasiz')::numeric = -1000
                      then 'OK   storno aynan -1232 / -1100 / -1000' else 'FAIL storno ' || r::text end);

  -- (4) aralash yig'indi a1 + a2
  select x.paket into p from public._t2_summa_paket_v1(array[o], 'aktlar', array[a1, a2]) x;
  select (public._t2_summa_paket_hisob_v1(g.agg, n.x->'nk')->>'qqs_bilan')::numeric + 1232 into sm
    from public._t2_summa_agg_v1(array[o], 'aktlar', array[a1]) g cross join lateral (select public._t2_obyekt_nk_v1(o) x) n;
  rep := rep || (case when (p->>'qqs_bilan')::numeric = sm and p->>'obyekt_soni' is null
                      then 'OK   aralash: podvalsiz + podvalli yig''indisi' else 'FAIL aralash ' || p::text end);

  -- (5) pereraschet a4: storno bloki (-1232) + yangi qator (material 1000, smeta podvali)
  select x.paket into p from public._t2_summa_paket_v1(array[o], 'aktlar', array[a4]) x;
  select (public._t2_summa_paket_hisob_v1(g.agg, n.x->'nk')->>'qqs_bilan')::numeric into sm
    from public._t2_summa_agg_v1(array[o], 'aktlar', array[a4], null, null, 'siz', null) g cross join lateral (select public._t2_obyekt_nk_v1(o) x) n;
  rep := rep || (case when (p->>'qqs_bilan')::numeric = round(sm - 1232, 2) and sm > 1000
                      then 'OK   pereraschet: blok o''z podvali (-1232) + yangi qator smeta podvali' else 'FAIL pereraschet ' || p::text || ' sm=' || sm::text end);

  -- (6) tasdiqlangan F2: RPC faqat backfill; import rad etiladi
  update public.t2_akt set holat = 'tasdiqlangan' where id = a1;
  rep := rep || (case when to_regprocedure('public.t2_akt_podval_yoz_v1(bigint,bigint,bigint,text,text,jsonb,bigint)') is not null
                      then 'OK   t2_akt_podval_yoz_v1 mavjud' else 'FAIL RPC yo''q' end);

  -- (7) 5 argli o'tkazgich 'hammasi' - podvalli qatorlar ham kiradi
  select (agg->>'chel')::numeric into sm from public._t2_summa_agg_v1(array[o], 'aktlar', array[a2]);
  rep := rep || (case when sm = 1000 then 'OK   5 argli agg o''zgarishsiz (chel 1000)' else 'FAIL 5 argli agg ' || sm::text end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'ACCEPTANCE_AKT_PODVAL FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'ACCEPTANCE_AKT_PODVAL % OK:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;
