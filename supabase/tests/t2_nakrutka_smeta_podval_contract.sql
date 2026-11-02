-- T2-NAKRUTKA-SMETA-PODVAL-V1 — adversarial contract (BEGIN..ROLLBACK; faqat disposable branch / lokal).
-- Natija: oxirgi exception "TEST_NSP ..." ichida (rollback bilan hech narsa qolmaydi).
begin;
do $$
declare
  k bigint; o bigint; r record; j jsonb; rep text[] := array[]::text[];
  qat jsonb;
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_NSP', 'TST-NSP', '900000091', true) returning id into k;
  insert into t2_obyekt (nom, kompaniya_id) values ('NSP-obyekt', k) returning id into o;
  insert into t2_qator (obyekt_id, tur, kompaniya_id, kat, summa) values
    (o, 'rs', k, 'ЧЕЛ', 1000), (o, 'rs', k, 'МАШ', 200), (o, 'mat', k, 'МАТ', 3000), (o, 'ob', k, 'ОБ', 500);

  -- 1) Podvalsiz: sukut.
  select * into r from t2_obyekt_nakrutka where obyekt_id = o;
  if r.nk_manba <> 'sukut' or r.nakrutka_podval_id is not null or (r.koeffitsientlar->>'НДС')::numeric <> 12 then
    rep := rep || ('sukut: ' || r.nk_manba || ' ' || coalesce(r.koeffitsientlar->>'НДС', 'null'));
  end if;

  -- 2) Smeta podvali: НДС 15, ТРАНСПОРТ_МАТЕРИАЛ 6; meros qator, null foiz, noma'lum kod — e'tiborsiz.
  qat := jsonb_build_array(
    jsonb_build_object('kod','pryamye','nom','ПРЯМЫЕ','tur','jami','baza','[]'::jsonb),
    jsonb_build_object('kod','tr_mat','nom','Транспорт','tur','foiz','foiz',6,'koefKod','ТРАНСПОРТ_МАТЕРИАЛ','manba','smeta'),
    jsonb_build_object('kod','prochie','nom','Прочие','tur','foiz','foiz',99,'koefKod','ПРОЧИЕ_ПОДРЯДЧИК','manba','meros'),
    jsonb_build_object('kod','strax','nom','Страх','tur','foiz','foiz',null,'koefKod','СТРАХОВАНИЕ','manba','smeta'),
    jsonb_build_object('kod','x','nom','X','tur','foiz','foiz',7,'koefKod','УЙДИРМА','manba','smeta'),
    jsonb_build_object('kod','nds','nom','НДС','tur','foiz','foiz',15,'koefKod','НДС','manba','smeta'),
    jsonb_build_object('kod','vsego','nom','ВСЕГО','tur','jami','baza','[]'::jsonb));
  j := t2_nakrutka_podval_saqla_v1(k, o, null, 'Smeta podvali — test', qat, null, null, gen_random_uuid(), 'test');
  if not (j->>'ok')::boolean then rep := rep || ('saqla: ' || j::text); end if;

  select * into r from t2_obyekt_nakrutka where obyekt_id = o;
  if r.nk_manba <> 'smeta_podvali' then rep := rep || ('manba: ' || r.nk_manba); end if;
  if (r.koeffitsientlar->>'НДС')::numeric <> 15 then rep := rep || 'НДС 15 olinmadi'; end if;
  if (r.koeffitsientlar->>'ТРАНСПОРТ_МАТЕРИАЛ')::numeric <> 6 then rep := rep || 'transport 6 olinmadi'; end if;
  if (r.koeffitsientlar->>'ПРОЧИЕ_ПОДРЯДЧИК')::numeric <> 18 then rep := rep || 'meros qator hisobga kirdi'; end if;
  if (r.koeffitsientlar->>'СТРАХОВАНИЕ')::numeric <> 0.32 then rep := rep || 'null foiz 0 bo''ldi'; end if;
  if r.koeffitsientlar ? 'УЙДИРМА' then rep := rep || 'noma''lum kod kirdi'; end if;
  -- Arifmetika: vsego = itogo4 × 1.15 (ROUND 2).
  if r.vsego <> round(r.itogo4 * 1.15, 2) then rep := rep || ('vsego ' || r.vsego || ' <> itogo4*1.15'); end if;

  -- 3) Faolsizlantirilsa — sukutga qaytadi.
  update t2_nakrutka_podval set faol = false where obyekt_id = o;
  select * into r from t2_obyekt_nakrutka where obyekt_id = o;
  if r.nk_manba <> 'sukut' then rep := rep || ('faolsiz: ' || r.nk_manba); end if;

  -- 4) Buzuq kirish (massiv emas) — bo'sh xarita, xato emas.
  if t2_nakrutka_podval_smeta_nk_v1('"x"'::jsonb) <> '{}'::jsonb then rep := rep || 'massiv bo''lmagan qatorlar'; end if;

  raise exception 'TEST_NSP %', case when cardinality(rep) = 0 then 'PASS' else 'FAIL: ' || array_to_string(rep, ' | ') end;
end $$;
rollback;
