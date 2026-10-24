-- T2_ZAKAZCHIK_F2_USTAMALI (+ murojaat turlari, taqdimlar.obyekt_id) - adversarial acceptance, rollback bilan.
-- Natija: oxirgi exception "TEST_ZUST ..." ichida. Faqat disposable branch / lokal (yoki BEGIN..ROLLBACK ichida).
do $$
declare
  p bigint; z bigint; x bigint; up bigint; uz bigint; ux bigint;
  o1 bigint; qc bigint; qm bigint; qk bigint; qn bigint; akt bigint; al bigint; r jsonb; a jsonb; h jsonb; exp4 numeric;
  rep text[] := array[]::text[];
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_PUD', 'TST-P', '900000021', true) returning id into p;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_ZAK', 'TST-Z', '900000022', true) returning id into z;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_BEGONA', 'TST-X', '900000023', true) returning id into x;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tsz_up', 'P boss', 'faol') returning id into up;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tsz_uz', 'Z boss', 'faol') returning id into uz;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tsz_ux', 'X boss', 'faol') returning id into ux;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, p, 'boss', 'faol'), (uz, z, 'boss', 'faol'), (ux, x, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('P-obyekt', p) returning id into o1;
  insert into t2_qator (obyekt_id, tur, kompaniya_id, kat) values (o1, 'rs', p, 'ЧЕЛ') returning id into qc;
  insert into t2_qator (obyekt_id, tur, kompaniya_id, kat) values (o1, 'mat', p, 'МАТ') returning id into qm;
  insert into t2_qator (obyekt_id, tur, kompaniya_id, kat) values (o1, 'rs', p, null) returning id into qk;
  insert into t2_qator (obyekt_id, tur, kompaniya_id, kat) values (o1, 'mat', p, 'МАТ') returning id into qn;
  insert into t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o1, p, 'f2', '1', date '2026-09-01', 2200, 'qoralama', 'draft') returning id into akt;
  insert into t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (akt, qc, o1, p, 10, 100), (akt, qm, o1, p, 5, 200), (akt, qk, o1, p, 2, 100);
  insert into t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (akt, qn, o1, p, 1, null);   -- narxsiz qator
  -- akt'ni tasdiqlangan holatga: qator qulfi/lifecycle himoyasi sinov tranzaksiyasida vaqtincha o'chiriladi (rollback bilan qaytadi)
  alter table t2_akt disable trigger user; alter table t2_akt_qator disable trigger user;
  update t2_akt set holat = 'tasdiqlangan', lifecycle_status = 'approved' where id = akt;
  alter table t2_akt enable trigger user; alter table t2_akt_qator enable trigger user;

  r := t2_tomon_taklif_v1(up, p, z, '900000022', null, 'pudratchi', 'zakazchik', 'shartnoma', null, null, null, gen_random_uuid());
  al := (r->>'id')::bigint;
  perform t2_tomon_javob_v1(uz, z, al, 'qabul', null);

  -- 1. grantsiz hech narsa
  r := t2_zakazchik_obyektlar_v1(uz, z);
  rep := rep || (case when jsonb_array_length(r) = 0 then 'OK   grantsiz zakazchik hech narsa ko''rmaydi' else 'FAIL grantsiz: ' || r::text end);
  -- 2. faqat obyekt_holat: f2 yashirin (ustama ham)
  perform t2_tomon_grant_saqla_v1(up, p, al, jsonb_build_array(jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1)));
  r := t2_zakazchik_obyektlar_v1(uz, z);
  rep := rep || (case when jsonb_array_length(r) = 1 and r->0->>'f2' is null then 'OK   f2 granti yo''q - ustama/podval ham yashirin' else 'FAIL f2 sizdi: ' || r::text end);
  -- 3. f2 granti bilan: raqamlar
  perform t2_tomon_grant_saqla_v1(up, p, al, jsonb_build_array(jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1), jsonb_build_object('resurs', 'f2', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1)));
  r := t2_zakazchik_obyektlar_v1(uz, z);
  a := r->0->'f2'->'royxat'->0->'ustama';
  rep := rep || (case when (a->>'pryamye')::numeric = 2200 and (r->0->'f2'->>'jami')::numeric = 2200 then 'OK   ИТОГО ПРЯМЫЕ = hujjat_jami (2200)' else 'FAIL pryamye: ' || coalesce(a::text, 'null') end);
  h := t2_nakrutka_hisobla_v1(jsonb_build_object('chel', 1000, 'mash', 0, 'mat', 1000, 'ob', 0, 'mk', 0, 'kab', 0, 'bez', 0), t2_nakrutka_default_v1());
  exp4 := (h->>'itogo4')::numeric + 200;
  rep := rep || (case when (a->>'ustamali')::numeric = round(exp4, 2) then 'OK   ustamali = podval itogo4 + KATSIZ (ustamasiz) - mavjud kaskad bilan teng' else 'FAIL ustamali: ' || (a->>'ustamali') || ' != ' || exp4::text end);
  rep := rep || (case when (a->>'katsiz')::numeric = 200 and (a->>'narxsiz_qator')::int = 1 then 'OK   KATSIZ=200, narxsiz qator=1 (NULL != 0)' else 'FAIL katsiz/narxsiz: ' || a::text end);
  rep := rep || (case when (a->'podval'->>'itogo4')::numeric = (h->>'itogo4')::numeric and (a->'podval'->>'vsego')::numeric = (h->>'vsego')::numeric then 'OK   podval satrlari kaskad natijasiga teng' else 'FAIL podval' end);
  rep := rep || (case when (r->0->'f2'->'ustama_jami'->>'ustamali')::numeric = (a->>'ustamali')::numeric then 'OK   obyekt jami ustamali (bitta akt) mos' else 'FAIL jami ustamali' end);
  -- 4. ichki ma'lumot sizmaydi
  rep := rep || (case when r::text !~* '(koef|marja|margin|subpudrat|cats|chel|mash)' and not (a->'podval' ? 'chel') then 'OK   koeffitsient/marja/kategoriya bo''linmasi javobda yo''q' else 'FAIL ichki ma''lumot sizdi' end);
  -- 5. begona kompaniya hech narsa ko'rmaydi
  begin perform t2_zakazchik_obyektlar_v1(ux, z); rep := rep || 'FAIL boshqa kompaniya nomidan o''qish'::text;
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   boshqa kompaniya nomidan o''qish - 42501' else 'FAIL: ' || sqlerrm end); end;
  r := t2_zakazchik_obyektlar_v1(ux, x);
  rep := rep || (case when jsonb_array_length(r) = 0 then 'OK   aloqasiz begona hech narsa ko''rmaydi' else 'FAIL begona ko''rdi' end);
  -- 6. taqdimlar.obyekt_id + murojaat turlari
  insert into t2_tomon_taqdim (aloqa_id, taqdim_etuvchi_kompaniya_id, qabul_qiluvchi_kompaniya_id, resurs, manba_jadval, manba_id, obyekt_id, nom, taqdim_actor_id)
  values (al, p, z, 'f2', 't2_akt', akt, o1, 'F-2 sinov', up);
  r := t2_tomon_taqdimlar_v1(uz, z, 'kelgan', null, al, 10);
  rep := rep || (case when (r->0->>'obyekt_id')::bigint = o1 then 'OK   taqdimlar javobida obyekt_id' else 'FAIL obyekt_id: ' || r::text end);
  rep := rep || (case when (select count(*) from t2_tomon_murojaat_turi where kalit in ('ozgartirish_sorovi','hujjat_sorovi') and faol) = 2 then 'OK   murojaat turlari: ozgartirish_sorovi, hujjat_sorovi' else 'FAIL turlar' end);
  -- 7. aloqa yopilgach yo'q
  perform t2_tomon_holat_v1(up, p, al, 'yopish', 'test');
  r := t2_zakazchik_obyektlar_v1(uz, z);
  rep := rep || (case when jsonb_array_length(r) = 0 then 'OK   aloqa yopilgach ko''rinish yo''q' else 'FAIL yopilgach' end);  raise exception 'TEST_ZUST %', array_to_string(rep, E'\n');
end $$;
