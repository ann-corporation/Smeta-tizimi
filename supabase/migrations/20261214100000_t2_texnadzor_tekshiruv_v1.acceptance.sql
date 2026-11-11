-- acceptance 20261214100000_t2_texnadzor_tekshiruv_v1
-- BEGIN..ROLLBACK ichida migratsiyadan KEYIN ishga tushiriladi; hamma ma'lumotni o'zi seed qiladi.
-- Natija: har tekshiruv "OK ..."/"FAIL ..."; birorta FAIL bo'lsa oxirida exception.
-- versiya: tarix
begin;
set local statement_timeout = '300s';
do $$
declare
  p bigint; z bigint;                     -- pudratchi, texnadzor tenanti
  up bigint; ui bigint; ukz bigint;       -- pudratchi boss, texnadzor (inspektor), pudratchi pto
  o1 bigint; al bigint; d1 bigint; d2 bigint; tk bigint; mid bigint; r jsonb; rep text[] := array[]::text[]; h text;
  ar bigint;
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_PUD', 'ACC-P', '900000021', true) returning id into p;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_NAZORAT', 'ACC-N', '900000022', true) returning id into z;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_n_up', 'P boss', 'faol') returning id into up;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_n_ui', 'N inspektor', 'faol') returning id into ui;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_n_pto', 'P pto', 'faol') returning id into ukz;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, p, 'boss', 'faol'), (ui, z, 'inspektor', 'faol'), (ukz, p, 'pto', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('ACC-N-OBYEKT', p) returning id into o1;
  r := t2_tomon_taklif_v1(up, p, z, '900000022', null, 'pudratchi', 'texnadzor', 'shartnoma', 'ACC nazorat aloqa', null, null, gen_random_uuid());
  al := (r->>'id')::bigint;
  r := t2_tomon_javob_v1(ui, z, al, 'qabul', null);
  rep := rep || (case when r->>'holat' = 'faol' then 'OK   aloqa faol' else 'FAIL aloqa: ' || r::text end);
  insert into t2_document_registry (kompaniya_id, document_type, status, canonical_storage_status) values (z, 'tekshiruv_foto', 'active', 'stored') returning id into d1;
  insert into t2_document_registry (kompaniya_id, document_type, status, canonical_storage_status) values (p, 'predpisaniya_foto', 'active', 'stored') returning id into d2;

  -- 1. rol qoidasi
  rep := rep || (case when _t2_tomon_rol_ok('inspektor', 'murojaat') and _t2_tomon_rol_ok('pto', 'murojaat') and _t2_tomon_rol_ok('prorab', 'murojaat') and not _t2_tomon_rol_ok('kuzatuvchi', 'murojaat')
                      then 'OK   murojaat roli tiklandi (inspektor, pto, prorab)' else 'FAIL murojaat roli' end);
  rep := rep || (case when (select faol from t2_tomon_resurs where kalit = 'fakt') then 'OK   fakt resursi faol' else 'FAIL fakt resursi' end);

  -- 2. obyekt ochilmagan -> tekshiruv rad
  r := t2_nazorat_tekshiruv_yoz_v1(ui, z, gen_random_uuid(), null, al, o1, current_date, 'Beton', 'A-o''q', '[{"kod":"b1","nom":"Armatura qadami","natija":"mos"}]'::jsonb, null, false, null);
  rep := rep || (case when r->>'code' = 'OBYEKT_YOPIQ' then 'OK   ochilmagan obyektga tekshiruv yozilmaydi' else 'FAIL obyekt yopiq: ' || r::text end);
  perform t2_tomon_grant_saqla_v1(up, p, al, jsonb_build_array(jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1)));

  -- 3. qoralama -> yakunlash (nomuvofiq band fotosiz rad; fotoli -> predpisaniya)
  r := t2_nazorat_tekshiruv_yoz_v1(ui, z, gen_random_uuid(), null, al, o1, current_date, 'Beton', 'A-o''q',
        jsonb_build_array(jsonb_build_object('kod','b1','nom','Armatura qadami','natija','mos'), jsonb_build_object('kod','b2','nom','Himoya qatlami','natija','mos_emas','izoh','Qatlam 15 mm','muhimlik','yuqori')), null, true, null);
  rep := rep || (case when r->>'code' = 'FOTO_KERAK' then 'OK   nomuvofiq band fotosiz yakunlanmaydi' else 'FAIL foto majburiy: ' || r::text end);
  r := t2_nazorat_tekshiruv_yoz_v1(ui, z, gen_random_uuid(), null, al, o1, current_date, 'Beton', 'A-o''q',
        jsonb_build_array(jsonb_build_object('kod','b1','nom','Armatura qadami','natija','mos'), jsonb_build_object('kod','b2','nom','Himoya qatlami','natija','mos_emas','izoh','Qatlam 15 mm','muhimlik','yuqori','document_ids', jsonb_build_array(d2))), null, true, null);
  rep := rep || (case when r->>'code' = 'FOTO_BEGONA' then 'OK   begona foto rad' else 'FAIL begona foto: ' || r::text end);
  r := t2_nazorat_tekshiruv_yoz_v1(ui, z, gen_random_uuid(), null, al, o1, current_date, 'Beton', 'A-o''q',
        jsonb_build_array(jsonb_build_object('kod','b1','nom','Armatura qadami','natija','mos'), jsonb_build_object('kod','b2','nom','Himoya qatlami','natija','mos_emas','izoh','Qatlam 15 mm','muhimlik','yuqori','document_ids', jsonb_build_array(d1))), null, true, null);
  tk := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and r->>'natija' = 'mos_emas' and jsonb_array_length(r->'predpisaniyalar') = 1 then 'OK   yakunlandi + 1 ta predpisaniya' else 'FAIL yakunlash: ' || r::text end);
  mid := (r->'predpisaniyalar'->>0)::bigint;
  rep := rep || (case when (select turi = 'predpisaniya' and muddat is not null and tekshiruv_id = tk and ijrochi_kompaniya_id = p and beruvchi_kompaniya_id = z from t2_tomon_murojaat where id = mid)
                      and exists (select 1 from t2_tomon_murojaat_hujjat where murojaat_id = mid and document_id = d1) then 'OK   predpisaniya muddat + dalil bilan, tekshiruvga bog''langan' else 'FAIL predpisaniya mazmuni' end);

  -- 4. pudratchi foto-siz javob bera olmaydi; fotoli javob; texnadzor qayta tekshiradi (raund+1)
  r := t2_tomon_murojaat_javob_v1(ukz, p, mid, 'Tuzatildi', null);
  rep := rep || (case when r->>'code' = 'FOTO_KERAK' then 'OK   foto-siz javob rad' else 'FAIL foto-siz javob: ' || r::text end);
  r := t2_tomon_murojaat_javob_v1(ukz, p, mid, 'Tuzatildi', array[d2]);
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'bajarildi' then 'OK   fotoli javob qabul' else 'FAIL fotoli javob: ' || r::text end);
  r := t2_tomon_murojaat_qaror_v1(ui, z, mid, 'qayta_ochish', 'Hali yetarli emas');
  rep := rep || (case when (r->>'ok')::boolean and (r->>'raund')::int = 2 then 'OK   qayta tekshiruv: raund 2' else 'FAIL qayta tekshiruv: ' || r::text end);
  r := t2_nazorat_uy_v1(ui, z);
  rep := rep || (case when (r->'jami'->>'pred_ochiq')::int = 1 then 'OK   bosh sahifa hisoblagichi' else 'FAIL uy: ' || r::text end);
  r := t2_nazorat_tekshiruv_tafsilot_v1(ui, z, tk);
  rep := rep || (case when (r->>'ok')::boolean and jsonb_array_length(r->'fotolar') = 1 and jsonb_array_length(r->'predpisaniyalar') = 1 then 'OK   tafsilot: foto + predpisaniya' else 'FAIL tafsilot: ' || r::text end);
  r := t2_nazorat_tekshiruvlar_v1(ui, z, current_date - 1, current_date, null, 50);
  rep := rep || (case when jsonb_array_length(r) = 1 then 'OK   jurnal' else 'FAIL jurnal: ' || r::text end);

  -- 5. АОСР foto + ko'rik (taqdim qabul qiluvchisi)
  r := t2_aosr_yoz_v2(p, o1, '{"ish_nomi":"ACC ish","raqam":"ACC-N1"}'::jsonb, null, null, gen_random_uuid(), 'acc');
  ar := (r->>'id')::bigint;
  r := t2_aosr_foto_biriktir_v1(ukz, p, ar, array[d2]);
  rep := rep || (case when (r->>'ok')::boolean and (r->>'qoshildi')::int = 1 then 'OK   АОСР foto biriktirildi' else 'FAIL АОСР foto: ' || r::text end);
  r := t2_nazorat_aosr_korik_v1(ui, z, 0);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   begona taqdim rad' else 'FAIL korik begona: ' || r::text end);

  select string_agg(e, E'\n') into h from unnest(rep) e;
  if h like '%FAIL%' then raise exception E'ACCEPTANCE FAIL\n%', h; end if;
  raise notice E'ACCEPTANCE OK\n%', h;
end $$;
rollback;
