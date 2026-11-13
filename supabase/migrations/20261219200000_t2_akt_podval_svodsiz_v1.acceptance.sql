-- ACCEPTANCE: 20261219200000 (akt podvali bor -> svod qayta tasnifi yo'q). FAQAT sintetik fixture; BEGIN..ROLLBACK.
-- Fixture: o1 - svod bo'limi (CHEL 1000 + MAT 500 ichida) va ikki akt: aP (o'z podvali, PROCHIE 18, NDS 12) hamda aN (podvalsiz).
--          o2 - nazorat: xuddi shu qatorlar svod bo'limisiz; aC aktida aP bilan bir xil podval.
-- Kutiladi: (1) aP ustamali = nazorat aC (MAT ga ham ustama); (2) aN (podvalsiz) hozirgidek svod qoidasi - aP dan kam ustamali;
-- (3) ustamasiz hamma holatda teng; (4) aP + aN aralash = aP + aN alohida yig'indisi.
begin;

do $acc$
declare
  k bigint; o1 bigint; o2 bigint; b1 bigint; c1 bigint; m1 bigint; c2 bigint; m2 bigint; aP bigint; aN bigint; aC bigint; e1 bigint; e2 bigint; ex1 bigint; ex2 bigint;
  pP jsonb; pN jsonb; pC jsonb; pM jsonb; rep text[] := array[]::text[];
  chel text := U&'\0427\0415\041B'; mat text := U&'\041C\0410\0422'; chel_b text := U&'\0427\0415\041B.-\0427';
  prochie text := U&'\041F\0420\041E\0427\0418\0415_\041F\041E\0414\0420\042F\0414\0427\0418\041A';
  nds text := U&'\041D\0414\0421';
  nk jsonb;
begin
  nk := public.t2_nakrutka_default_v1() || jsonb_build_object(prochie, 18, nds, 12);
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_PODVAL_SVODSIZ_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_SVODSIZ_O1_', k) returning id into o1;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_SVODSIZ_O2_', k) returning id into o2;

  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom) values (o1, k, 'rz', 'svod bolim') returning id into b1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kat, nom, birlik, hajm, narx, ota_id) values (o1, k, 'bl', chel, 'mehnat', chel_b, 10, 100, b1) returning id into c1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kat, nom, birlik, hajm, narx, ota_id) values (o1, k, 'bl', mat, 'material', 'sht', 5, 100, b1) returning id into m1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kat, nom, birlik, hajm, narx) values (o2, k, 'bl', chel, 'mehnat', chel_b, 10, 100) returning id into c2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kat, nom, birlik, hajm, narx) values (o2, k, 'bl', mat, 'material', 'sht', 5, 100) returning id into m2;
  insert into public.t2_svod_yaxlit (kompaniya_id, obyekt_id, qator_id, sabab, turi, faol) values (k, o1, b1, 'acceptance', 'svod', true);
  -- ekspert kabi 'ustamasiz' belgili bo'lim (doim ustamasiz): har ikki obyektda, MAT kategoriyali qator
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom) values (o1, k, 'rz', 'ekspert') returning id into e1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kat, nom, birlik, hajm, narx, ota_id) values (o1, k, 'bl', mat, 'ekspert qator', 'sht', 1, 200, e1) returning id into ex1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom) values (o2, k, 'rz', 'ekspert') returning id into e2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kat, nom, birlik, hajm, narx, ota_id) values (o2, k, 'bl', mat, 'ekspert qator', 'sht', 1, 200, e2) returning id into ex2;
  insert into public.t2_svod_yaxlit (kompaniya_id, obyekt_id, qator_id, sabab, turi, faol) values (k, o1, e1, 'acceptance', 'ustamasiz', true);
  insert into public.t2_svod_yaxlit (kompaniya_id, obyekt_id, qator_id, sabab, turi, faol) values (k, o2, e2, 'acceptance', 'ustamasiz', true);

  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat) values (o1, k, 'f2', 'SV-P', date '2026-03-01', 'qoralama') returning id into aP;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat) values (o1, k, 'f2', 'SV-N', date '2026-04-01', 'qoralama') returning id into aN;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat) values (o2, k, 'f2', 'SV-C', date '2026-03-01', 'qoralama') returning id into aC;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (aP, c1, o1, k, 10, 100), (aP, m1, o1, k, 5, 100), (aP, ex1, o1, k, 1, 200);
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (aN, c1, o1, k, 10, 100), (aN, m1, o1, k, 5, 100), (aN, ex1, o1, k, 1, 200);
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (aC, c2, o2, k, 10, 100), (aC, m2, o2, k, 5, 100), (aC, ex2, o2, k, 1, 200);
  insert into public.t2_akt_podval (akt_id, blok, kompaniya_id, obyekt_id, manba, nk, nds_foiz) values (aP, '', k, o1, 'import', nk, 12), (aC, '', k, o2, 'import', nk, 12);

  select x.paket into pP from public._t2_summa_paket_v1(array[o1], 'aktlar', array[aP]) x;
  select x.paket into pN from public._t2_summa_paket_v1(array[o1], 'aktlar', array[aN]) x;
  select x.paket into pC from public._t2_summa_paket_v1(array[o2], 'aktlar', array[aC]) x;
  select x.paket into pM from public._t2_summa_paket_v1(array[o1], 'aktlar', array[aP, aN]) x;

  rep := rep || (case when (pP->>'ustamali')::numeric = (pC->>'ustamali')::numeric and (pP->>'qqs_bilan')::numeric = (pC->>'qqs_bilan')::numeric
                       and (pP->>'ustamasiz')::numeric = 1700 and (pP->'kesim'->>'ustamasiz')::numeric = 200
                      then 'OK   podvalli akt svod bo''limida = nazorat (MAT ga ham ustama, ustamasiz belgi saqlanadi)' else 'FAIL podvalli ' || pP::text || ' / ' || pC::text end);
  rep := rep || (case when (pN->>'ustamali')::numeric < (pP->>'ustamali')::numeric and (pN->>'ustamasiz')::numeric = 1700
                      then 'OK   podvalsiz akt - svod qoidasi hozirgidek (kamroq ustamali)' else 'FAIL podvalsiz ' || pN::text end);
  rep := rep || (case when (pM->>'ustamali')::numeric = round((pP->>'ustamali')::numeric + (pN->>'ustamali')::numeric, 2)
                      then 'OK   aralash yig''indi = alohida yig''indi' else 'FAIL aralash ' || pM::text end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'ACCEPTANCE_AKT_PODVAL_SVODSIZ FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'ACCEPTANCE_AKT_PODVAL_SVODSIZ % OK:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;

