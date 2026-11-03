-- T2_SVOD_YAXLIT (20261113500000) — adversarial contract test, rollback bilan.
-- Natija: oxirgi exception "TEST_SVOD_YAXLIT ..." ichida (hamma narsa bekor qilinadi). Faqat disposable branch / lokal.
do $$
declare
  p bigint; x bigint; up bigint; ux bigint; o1 bigint; o2 bigint;
  r1 bigint; r2 bigint; r2a bigint; q1 bigint; op1 uuid := gen_random_uuid();
  r jsonb; j0 jsonb; j jsonb; j2 jsonb; nk jsonb; h jsonb; i4 numeric; nds numeric; yid bigint; yv int;
  rep text[] := array[]::text[];
  ok_ boolean;
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_SY', 'TST-SY', '900000031', true) returning id into p;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_SY_X', 'TST-SYX', '900000032', true) returning id into x;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tsy_up', 'SY boss', 'faol') returning id into up;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tsy_ux', 'SY begona', 'faol') returning id into ux;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, p, 'boss', 'faol'), (ux, x, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('SY-obyekt', p) returning id into o1;
  insert into t2_obyekt (nom, kompaniya_id) values ('SY-belgisiz', p) returning id into o2;
  -- o1: R1 (oddiy) → ЧЕЛ 1000; R2 (svod yaxlit) → МАТ 500, ОБ 300, R2a → ЧЕЛ 200
  insert into t2_qator (obyekt_id, tur, kompaniya_id, nom) values (o1, 'rz', p, 'R1') returning id into r1;
  insert into t2_qator (obyekt_id, tur, kompaniya_id, ota_id, kat, summa) values (o1, 'rs', p, r1, 'ЧЕЛ', 1000) returning id into q1;
  insert into t2_qator (obyekt_id, tur, kompaniya_id, nom) values (o1, 'rz', p, 'R2 письмо №133') returning id into r2;
  insert into t2_qator (obyekt_id, tur, kompaniya_id, ota_id, kat, summa) values (o1, 'mat', p, r2, 'МАТ', 500), (o1, 'ob', p, r2, 'ОБ', 300);
  insert into t2_qator (obyekt_id, tur, kompaniya_id, ota_id, nom) values (o1, 'rz', p, r2, 'R2a') returning id into r2a;
  insert into t2_qator (obyekt_id, tur, kompaniya_id, ota_id, kat, summa) values (o1, 'rs', p, r2a, 'ЧЕЛ', 200);
  insert into t2_qator (obyekt_id, tur, kompaniya_id, kat, summa) values (o2, 'rs', p, 'ЧЕЛ', 1000), (o2, 'mat', p, 'МАТ', 400);

  j0 := t2_obyekt_nakrutka_v1(o1, up, null);
  nk := j0->'koeffitsientlar';
  rep := rep || (case when not (j0 ? 'svod_yaxlit') and j0->'nakrutka' = t2_nakrutka_hisobla_v1(j0->'cats', nk)
    then 'OK   belgigacha: javob avvalgi formula bilan bir xil' else 'FAIL belgigacha: ' || j0::text end);

  -- 1. noto'g'ri belgilar rad etiladi
  r := t2_svod_yaxlit_belgila_v1(p, up, q1, null, null, '{"fayl":"x.xlsx"}', 'test', gen_random_uuid());
  rep := rep || (case when r->>'code' = 'QATOR_BOLIM_EMAS' then 'OK   resurs qatori bo''lim emas' else 'FAIL bolim_emas: ' || r::text end);
  r := t2_svod_yaxlit_belgila_v1(p, up, r2, null, null, '{}', 'test', gen_random_uuid());
  rep := rep || (case when r->>'code' = 'DALIL_REQUIRED' then 'OK   dalilsiz rad' else 'FAIL dalil: ' || r::text end);
  r := t2_svod_yaxlit_belgila_v1(p, up, r2, 1120, null, '{"fayl":"x.xlsx"}', 'test', gen_random_uuid());
  rep := rep || (case when r->>'code' = 'SVOD_SUMMA_QQS_JUFT' then 'OK   svod summasi QQS stavkasisiz rad' else 'FAIL juft: ' || r::text end);
  begin
    r := t2_svod_yaxlit_belgila_v1(p, ux, r2, 1120, 12, '{"fayl":"x.xlsx"}', 'test', gen_random_uuid());
    rep := rep || ('FAIL begona aktor belgiladi: ' || r::text);
  exception when others then rep := rep || 'OK   begona kompaniya aktori rad (' || sqlstate || ')'::text;
  end;

  -- 2. belgilash (svod 2240 QQS bilan, 12%) + idempotent replay
  r := t2_svod_yaxlit_belgila_v1(p, up, r2, 2240, 12, '{"fayl":"svod.xlsx","varaq":"свод","katak":"O20"}', 'svod yaxlit', op1);
  yid := (r->>'id')::bigint; yv := (r->>'versiya')::int;
  rep := rep || (case when r->>'ok' = 'true' then 'OK   belgilandi' else 'FAIL belgila: ' || r::text end);
  r := t2_svod_yaxlit_belgila_v1(p, up, r2, 2240, 12, '{"fayl":"svod.xlsx","varaq":"свод","katak":"O20"}', 'svod yaxlit', op1);
  rep := rep || (case when r->>'takror' = 'true' and (r->>'id')::bigint = yid then 'OK   operation_id replay' else 'FAIL replay: ' || r::text end);
  r := t2_svod_yaxlit_belgila_v1(p, up, r2a, null, null, '{"fayl":"x.xlsx"}', 'ichki', gen_random_uuid());
  rep := rep || (case when r->>'code' = 'ICHMA_ICH_BELGI' then 'OK   ichma-ich belgi rad' else 'FAIL ichma_ich: ' || r::text end);

  -- 3. kaskad: R2 avlodlari kategoriyadan chiqdi; svod 2240 QQS bilan — НДС dan keyin AYNAN (20261116000000, yadro hisob()):
  --    ВСЕГО = ishlar ВСЕГО + 2240; ИТОГО-4 = ishlar ИТОГО-4 + 2240/1.12 (= 2000); НДС = ВСЕГО − ИТОГО-4.
  j := t2_obyekt_nakrutka_v1(o1, up, null);
  h := t2_nakrutka_hisobla_v1(jsonb_build_object('chel',1000,'mash',0,'mat',0,'ob',0,'mk',0,'kab',0,'bez',0), nk);
  i4 := round((h->>'itogo4')::numeric + 2000, 2);
  nds := round((h->>'vsego')::numeric + 2240, 2) - i4;
  ok_ := (j->'cats_kaskad'->>'chel')::numeric = 1000 and (j->'cats_kaskad'->>'mat')::numeric = 0 and (j->'cats_kaskad'->>'ob')::numeric = 0
    and (j->'svod_yaxlit'->>'qqssiz')::numeric = 2000 and (j->'svod_yaxlit'->>'barglar')::numeric = 1000
    and (j->'nakrutka'->>'itogo4')::numeric = i4 and (j->'nakrutka'->>'nds')::numeric = nds
    and (j->'nakrutka'->>'vsego')::numeric = round((h->>'vsego')::numeric + 2240, 2)
    and (j->'nakrutka'->>'pryamye')::numeric = 2000 and (j->'nakrutka'->>'yaxlit')::numeric = 2000
    and j->'cats' = j0->'cats';
  rep := rep || (case when ok_ then 'OK   yaxlit ustamasiz ИТОГО-4 ga, QQS bir marta, pryamye = barcha barglar, cats o''zgarmadi'
                      else 'FAIL kaskad: ' || j::text end);
  rep := rep || (case when (select x.vsego from t2_obyekt_nakrutka x where x.obyekt_id = o1) = (j->'nakrutka'->>'vsego')::numeric
                       and (select x.yaxlit from t2_obyekt_nakrutka x where x.obyekt_id = o1) = 2000
    then 'OK   view (Nakopitelniy manbai) = RPC' else 'FAIL view: ' || (select row_to_json(x)::text from t2_obyekt_nakrutka x where x.obyekt_id = o1) end);

  -- 4. belgisiz obyekt — invariant
  j2 := t2_obyekt_nakrutka_v1(o2, up, null);
  rep := rep || (case when not (j2 ? 'svod_yaxlit') and not (j2 ? 'cats_kaskad') and j2->'nakrutka' = t2_nakrutka_hisobla_v1(j2->'cats', j2->'koeffitsientlar')
                       and (select x.yaxlit from t2_obyekt_nakrutka x where x.obyekt_id = o2) is null
    then 'OK   belgisiz obyekt natijasi o''zgarmadi' else 'FAIL invariant: ' || j2::text end);

  -- 5. olib tashlash — kaskad avvalgi holatga
  r := t2_svod_yaxlit_ochir_v1(p, up, yid, yv + 5, 'xato');
  rep := rep || (case when r->>'code' = 'VERSIYA' then 'OK   eskirgan versiya rad' else 'FAIL versiya: ' || r::text end);
  r := t2_svod_yaxlit_ochir_v1(p, up, yid, yv, 'qaytarish');
  j := t2_obyekt_nakrutka_v1(o1, up, null);
  rep := rep || (case when r->>'ok' = 'true' and j = j0 then 'OK   ochirilgach javob belgigacha bilan AYNAN bir xil' else 'FAIL ochir: ' || j::text end);

  -- 6. svod summasisiz belgi: yaxlit = bo'lim barglari (ustamasiz)
  r := t2_svod_yaxlit_belgila_v1(p, up, r2, null, null, '{"fayl":"x.xlsx"}', 'barglar asosida', gen_random_uuid());
  j := t2_obyekt_nakrutka_v1(o1, up, null);
  rep := rep || (case when (j->'svod_yaxlit'->>'qqssiz')::numeric = 1000 and j->'svod_yaxlit'->'bolimlar'->0->>'asos' = 'barglar'
    then 'OK   dalilsiz summa: barglar ustamasiz' else 'FAIL barglar: ' || j::text end);

  raise exception 'TEST_SVOD_YAXLIT %', array_to_string(rep, E'\n');
end $$;
