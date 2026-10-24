-- T2_TAQDIM_TAFSILOT_AKT_QATOR - rollback bilan. Natija: "TEST_TAQ ..." exception ichida.
do $$
declare
  p bigint; z bigint; x bigint; up bigint; uz bigint; ux bigint; o1 bigint; qa bigint; akt bigint; aq bigint; al bigint; tq bigint; r jsonb;
  rep text[] := array[]::text[];
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_PUD', 'TST-P', '900000031', true) returning id into p;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_ZAK', 'TST-Z', '900000032', true) returning id into z;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_BEGONA', 'TST-X', '900000033', true) returning id into x;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_up', 'P boss', 'faol') returning id into up;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_uz', 'Z boss', 'faol') returning id into uz;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_ux', 'X boss', 'faol') returning id into ux;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, p, 'boss', 'faol'), (uz, z, 'boss', 'faol'), (ux, x, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('P-obyekt', p) returning id into o1;
  insert into t2_qator (obyekt_id, tur, kompaniya_id, kat) values (o1, 'rs', p, 'ЧЕЛ') returning id into qa;
  insert into t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o1, p, 'f2', '1', date '2026-09-01', 1000, 'qoralama', 'draft') returning id into akt;
  insert into t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (akt, qa, o1, p, 10, 100) returning id into aq;
  r := t2_tomon_taklif_v1(up, p, z, '900000032', null, 'pudratchi', 'zakazchik', 'shartnoma', null, null, null, gen_random_uuid());
  al := (r->>'id')::bigint;
  perform t2_tomon_javob_v1(uz, z, al, 'qabul', null);
  insert into t2_tomon_taqdim (aloqa_id, taqdim_etuvchi_kompaniya_id, qabul_qiluvchi_kompaniya_id, resurs, manba_jadval, manba_id, obyekt_id, nom, taqdim_actor_id)
  values (al, p, z, 'f2', 't2_akt', akt, o1, 'F-2 sinov', up) returning id into tq;

  r := t2_tomon_taqdim_tafsilot_v1(uz, z, tq);
  rep := rep || (case when (r->'qatorlar'->0->>'akt_qator_id')::bigint = aq and (r->'taqdim'->>'manba_id')::bigint = akt and r->'taqdim'->>'manba_jadval' = 't2_akt'
                      then 'OK   buyurtmachi tafsilotida akt_qator_id va manba_id' else 'FAIL tafsilot: ' || r::text end);
  r := t2_tomon_taqdim_tafsilot_v1(up, p, tq);
  rep := rep || (case when (r->'qatorlar'->0->>'akt_qator_id')::bigint = aq then 'OK   pudratchi ham ko''radi' else 'FAIL pudratchi' end);
  r := t2_tomon_taqdim_tafsilot_v1(ux, x, tq);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   begona kompaniya - TOPILMADI' else 'FAIL begona: ' || r::text end);
  raise exception 'TEST_TAQ %', array_to_string(rep, E'\n');
end $$;
