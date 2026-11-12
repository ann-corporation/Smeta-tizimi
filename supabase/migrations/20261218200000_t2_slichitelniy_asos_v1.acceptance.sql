-- acceptance 20261218200000_t2_slichitelniy_asos_v1
-- BEGIN..ROLLBACK ichida migratsiyadan KEYIN ishga tushiriladi; hamma ma'lumotni o'zi seed qiladi (sintetik: real nom/INN/summa yo'q).
-- Zanjir: smeta 3 qator (to'liq, ortiq, kam) + 1 qo'shimcha ish -> fakt -> АОСР qoralamalari (hajm bilan) -> texnadzor qarori -> slichitelniy RPC.
-- Har qadam yorliq bilan: SLICH qadam [n nom]: ...  (xato bo'lsa shu yorliq bilan exception).
-- versiya: faol smeta (versiya_holat = 'faol')
begin;
set local statement_timeout = '300s';

create or replace function pg_temp.sl_assert(p_cond boolean, p_msg text) returns void language plpgsql as $f$
begin
  if p_cond is not true then raise exception 'ASSERT: %', p_msg; end if;
end $f$;

do $sl$
declare
  v_n integer := 0; v_name text := 'init';
  p bigint; z bigint; x bigint;                               -- pudratchi, texnadzor/buyurtmachi tomoni (alohida kompaniya), begona kompaniya
  up bigint; upto bigint; uz bigint; uin bigint; ux bigint; upr bigint;
  o1 bigint; al bigint; r jsonb; tay jsonb; v_hash0 text; v_hash1 text; v_op uuid;
  v_s bigint; v_w1 bigint; v_w2 bigint; v_w3 bigint; v_w4 bigint; v_r2 bigint; v_a2 bigint; v_a3 bigint; v_a4 bigint;
  t2id bigint; t3id bigint; t4id bigint; v_ver integer; v_x jsonb;
begin
  -- ===================================================================
  v_n := 1; v_name := 'kompaniyalar, a''zolar, aloqa (pudratchi <-> texnadzor)';
  insert into public.t2_kompaniya (nom, kod, inn, faol) values ('SLICH_PUD', 'SLC-P', '900000021', true) returning id into p;
  insert into public.t2_kompaniya (nom, kod, inn, faol) values ('SLICH_TEXNADZOR', 'SLC-Z', '900000022', true) returning id into z;
  insert into public.t2_kompaniya (nom, kod, inn, faol) values ('SLICH_BEGONA', 'SLC-X', '900000023', true) returning id into x;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('slc_up', 'P boss', 'faol') returning id into up;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('slc_upto', 'P pto', 'faol') returning id into upto;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('slc_upr', 'P prorab', 'faol') returning id into upr;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('slc_uz', 'Z boss', 'faol') returning id into uz;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('slc_uin', 'Z texnadzor', 'faol') returning id into uin;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('slc_ux', 'X boss', 'faol') returning id into ux;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values
    (up, p, 'boss', 'faol'), (upto, p, 'pto', 'faol'), (upr, p, 'prorab', 'faol'), (uz, z, 'boss', 'faol'), (uin, z, 'inspektor', 'faol'), (ux, x, 'boss', 'faol');
  insert into public.t2_obyekt (nom, kompaniya_id) values ('SLICH-OBYEKT', p) returning id into o1;
  r := public.t2_tomon_taklif_v1(up, p, z, '900000022', null, 'pudratchi', 'zakazchik', 'shartnoma', 'SLICH aloqa', null, null, gen_random_uuid());
  al := (r->>'id')::bigint;
  r := public.t2_tomon_javob_v1(uz, z, al, 'qabul', null);
  perform pg_temp.sl_assert(r->>'holat' = 'faol', 'aloqa faol bo''lmadi: ' || r::text);
  raise notice 'SLICH qadam [% %]: OK', v_n, v_name;

  -- ===================================================================
  v_n := 2; v_name := 'smeta: 3 ish (to''liq, ortiq, kam) + resurs + 1 qo''shimcha ish';
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kod, nom, hajm, tartib, daraja)
    values (o1, p, 'rz', 'SL-S', 'Bolim', 1, 1, 0) returning id into v_s;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, tartib, daraja, ota_id)
    values (o1, p, 'bl', 'SL-W1', 'Ish tolik', 'm3', 10, 2, 1, v_s) returning id into v_w1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, tartib, daraja, ota_id)
    values (o1, p, 'bl', 'SL-W2', 'Ish ortiq', 'm3', 10, 3, 1, v_s) returning id into v_w2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja, ota_id)
    values (o1, p, 'rs', 'SL-R2', 'Resurs ortiq', 'kg', 100, 10, 1000, U&'\041C\0410\0422', 4, 2, v_w2) returning id into v_r2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, tartib, daraja, ota_id)
    values (o1, p, 'bl', 'SL-W3', 'Ish kam', 'm3', 10, 5, 1, v_s) returning id into v_w3;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, tartib, daraja, ota_id, qoshimcha)
    values (o1, p, 'bl', 'SL-W4', 'Qoshimcha ish', 'm3', 0, 6, 1, v_s, true) returning id into v_w4;
  select md5(string_agg(id::text || ':' || coalesce(hajm::text, '') || ':' || coalesce(narx::text, '') || ':' || coalesce(summa::text, ''), ',' order by id))
    into v_hash0 from public.t2_qator where obyekt_id = o1;
  raise notice 'SLICH qadam [% %]: OK', v_n, v_name;

  -- ===================================================================
  v_n := 3; v_name := 'fakt: W1=10 (smeta 10), W2=12 (ortiq), W3=6 (kam), W4=3 (smetada yo''q)';
  r := public.t2_fakt_yoz_v2(o1, date '2026-10-12', jsonb_build_array(
         jsonb_build_object('qator_id', v_w1, 'hajm', 10), jsonb_build_object('qator_id', v_w2, 'hajm', 12),
         jsonb_build_object('qator_id', v_w3, 'hajm', 6), jsonb_build_object('qator_id', v_w4, 'hajm', 3)),
         upr, gen_random_uuid(), 'SLICH fakt', null, 'actor:' || upr);
  perform pg_temp.sl_assert(coalesce((r->>'ok')::boolean, false), 'fakt yozilmadi: ' || left(coalesce(r::text, 'NULL'), 400));
  raise notice 'SLICH qadam [% %]: OK', v_n, v_name;

  -- ===================================================================
  v_n := 4; v_name := 'slichitelniy RPC (asos yo''q): farqli 3 (to''liq qator farqsiz), hammasi asossiz';
  r := public.t2_aosr_slichitelniy_v1(up, p, o1, 200);
  perform pg_temp.sl_assert((r->>'ok')::boolean, 'RPC ok emas: ' || r::text);
  tay := r->'tayyorlik';
  perform pg_temp.sl_assert((tay->>'farqli')::int = 3 and (tay->>'ortiq')::int = 2 and (tay->>'kam')::int = 1, 'farqli/ortiq/kam kutilgan 3/2/1: ' || tay::text);
  perform pg_temp.sl_assert((tay->>'smetada_yoq')::int = 1, 'smetada_yoq kutilgan 1: ' || tay::text);
  perform pg_temp.sl_assert((tay->>'asossiz')::int = 3 and (tay->>'asosli')::int = 0 and (tay->>'tasdiqlagan')::int = 0, 'asos holati kutilgan 3/0/0: ' || tay::text);
  perform pg_temp.sl_assert((r->>'yetishmaydi_jami')::int = 3 and jsonb_array_length(r->'yetishmaydi') = 3
                            and not exists (select 1 from jsonb_array_elements(r->'yetishmaydi') e where e->>'amal' <> 'aosr_yarat'), 'yetishmaydi ro''yxati: ' || (r->'yetishmaydi')::text);
  perform pg_temp.sl_assert(not exists (select 1 from jsonb_array_elements(r->'yetishmaydi') e where (e->>'qator_id')::bigint = v_w1), 'to''liq bajarilgan qator ro''yxatda bo''lmasligi kerak');
  raise notice 'SLICH qadam [% %]: OK', v_n, v_name;

  -- ===================================================================
  v_n := 5; v_name := 'ommaviy АОСР qoralamalari (hajm = fakt), resurs qatori o''tkaziladi, qayta chaqiruv takror yaratmaydi';
  v_op := gen_random_uuid();
  r := public.t2_aosr_asos_qoralama_v1(up, p, o1, array[v_w2, v_w3, v_w4, v_r2], v_op, 'slich');
  perform pg_temp.sl_assert((r->>'ok')::boolean and jsonb_array_length(r->'yaratildi') = 3, 'yaratildi 3 bo''lishi kerak: ' || r::text);
  perform pg_temp.sl_assert(exists (select 1 from jsonb_array_elements(r->'otkazildi') e where (e->>'qator_id')::bigint = v_r2 and e->>'sabab' = 'resurs_qatori'), 'resurs qatori o''tkazilmadi: ' || r::text);
  perform pg_temp.sl_assert((select b.hajm from public.t2_aosr_bog b where b.qator_id = v_w2) = 12
                            and (select b.hajm from public.t2_aosr_bog b where b.qator_id = v_w3) = 6
                            and (select b.hajm from public.t2_aosr_bog b where b.qator_id = v_w4) = 3, 'bog hajmi fakt hajmiga teng emas');
  select b.aosr_id into v_a2 from public.t2_aosr_bog b where b.qator_id = v_w2;
  select b.aosr_id into v_a3 from public.t2_aosr_bog b where b.qator_id = v_w3;
  select b.aosr_id into v_a4 from public.t2_aosr_bog b where b.qator_id = v_w4;
  perform pg_temp.sl_assert((select holat from public.t2_aosr where id = v_a2) = 'yangi', 'qoralama holati yangi bo''lishi kerak');
  r := public.t2_aosr_asos_qoralama_v1(up, p, o1, array[v_w2, v_w3, v_w4], v_op, 'slich');
  perform pg_temp.sl_assert(jsonb_array_length(r->'yaratildi') = 0 and jsonb_array_length(r->'otkazildi') = 3
                            and not exists (select 1 from jsonb_array_elements(r->'otkazildi') e where e->>'sabab' <> 'allaqachon'), 'bir xil operation_id takror yaratdi: ' || r::text);
  r := public.t2_aosr_asos_qoralama_v1(up, p, o1, array[v_w2, v_w3, v_w4], gen_random_uuid(), 'slich');
  perform pg_temp.sl_assert(jsonb_array_length(r->'yaratildi') = 0 and not exists (select 1 from jsonb_array_elements(r->'otkazildi') e where e->>'sabab' <> 'qoplangan'),
                            'asoslangan hajm qayta taklif qilindi: ' || r::text);
  perform pg_temp.sl_assert((select count(*) from public.t2_aosr where obyekt_id = o1) = 3, 'АОСР soni 3 bo''lishi kerak');
  raise notice 'SLICH qadam [% %]: OK', v_n, v_name;

  -- ===================================================================
  v_n := 6; v_name := 'bog'' hajmi: resurs qatoriga bog''lash ishga ko''chadi; salbiy/matn hajm rad; W3 hajmi 4 ga tushiriladi (qisman)';
  r := public.t2_aosr_bog_hajm_v1(up, p, v_a2, jsonb_build_array(jsonb_build_object('qator_id', v_r2, 'hajm', 100)));
  perform pg_temp.sl_assert((r->>'ok')::boolean and (r->>'saqlandi')::int = 1, 'resurs bog'' saqlanmadi: ' || r::text);
  r := public.t2_aosr_bog_hajm_v1(up, p, v_a3, jsonb_build_array(jsonb_build_object('qator_id', v_w3, 'hajm', -1)));
  perform pg_temp.sl_assert(r->>'code' = 'HAJM_NOTOGRI', 'salbiy hajm rad etilmadi: ' || r::text);
  r := public.t2_aosr_bog_hajm_v1(up, p, v_a3, jsonb_build_array(jsonb_build_object('qator_id', v_w3, 'hajm', '5')));
  perform pg_temp.sl_assert(r->>'code' = 'HAJM_NOTOGRI', 'matn hajm rad etilmadi: ' || r::text);
  r := public.t2_aosr_bog_hajm_v1(up, p, v_a3, jsonb_build_array(jsonb_build_object('qator_id', v_w3, 'hajm', 4)));
  perform pg_temp.sl_assert((r->>'ok')::boolean and (select hajm from public.t2_aosr_bog where aosr_id = v_a3 and qator_id = v_w3) = 4, 'hajm 4 ga tushmadi: ' || r::text);
  r := public.t2_aosr_bog_hajm_v1(up, p, v_a3, jsonb_build_array(jsonb_build_object('qator_id', v_w3, 'hajm', 4)));
  perform pg_temp.sl_assert((r->>'ok')::boolean and (select count(*) from public.t2_aosr_bog where aosr_id = v_a3) = 1, 'takror chaqiruv bog'' ko''paytirdi');
  raise notice 'SLICH qadam [% %]: OK', v_n, v_name;

  -- ===================================================================
  v_n := 7; v_name := 'tayyorlik (qoralamalar): hammasi asosli, hech biri tasdiqlanmagan; amal = texnadzorga yuborish';
  r := public.t2_aosr_slichitelniy_v1(up, p, o1, 200);
  tay := r->'tayyorlik';
  perform pg_temp.sl_assert((tay->>'asosli')::int = 3 and (tay->>'qoralama')::int = 3 and (tay->>'tasdiqlagan')::int = 0 and (tay->>'asossiz')::int = 0, 'qoralama sanog''i: ' || tay::text);
  perform pg_temp.sl_assert(not exists (select 1 from jsonb_array_elements(r->'yetishmaydi') e where e->>'amal' <> 'texnadzorga_yubor'), 'amal texnadzorga_yubor emas');
  perform pg_temp.sl_assert(exists (select 1 from jsonb_array_elements(r->'asoslar') e where (e->>'qator_id')::bigint = v_w2 and (e->>'asoslangan_hajm')::numeric = 112), 'W2 asoslangan hajmi 12 + resurs bog''i = 112 emas (resurs bog'' hajmi ishga qo''shilmasligi kerak)');
  raise notice 'SLICH qadam [% %]: OK', v_n, v_name;

  -- ===================================================================
  v_n := 8; v_name := 'texnadzorga yuborish; qaror kutilayotgan akt bog''i qulflanadi; texnadzor yoza olmaydi';
  r := public.t2_tomon_taqdim_yarat_v1(upto, p, al, 'aosr', v_a2, null, gen_random_uuid()); t2id := (r->>'id')::bigint;
  perform pg_temp.sl_assert((r->>'ok')::boolean, 'W2 АОСР yuborilmadi: ' || r::text);
  r := public.t2_tomon_taqdim_yarat_v1(upto, p, al, 'aosr', v_a3, null, gen_random_uuid()); t3id := (r->>'id')::bigint;
  perform pg_temp.sl_assert((r->>'ok')::boolean, 'W3 АОСР yuborilmadi: ' || r::text);
  r := public.t2_tomon_taqdim_yarat_v1(upto, p, al, 'aosr', v_a4, null, gen_random_uuid()); t4id := (r->>'id')::bigint;
  perform pg_temp.sl_assert((r->>'ok')::boolean, 'W4 АОСР yuborilmadi: ' || r::text);
  r := public.t2_aosr_bog_hajm_v1(up, p, v_a4, jsonb_build_array(jsonb_build_object('qator_id', v_w4, 'hajm', 2)));
  perform pg_temp.sl_assert(r->>'code' = 'TAQDIMDA', 'taqdimdagi akt bog''i qulflanmadi: ' || r::text);
  begin
    perform public.t2_aosr_bog_hajm_v1(uin, z, v_a4, jsonb_build_array(jsonb_build_object('qator_id', v_w4, 'hajm', 1)));
    raise exception 'ASSERT: texnadzor (inspektor) yozdi';
  exception when others then
    perform pg_temp.sl_assert(sqlstate = '42501', 'texnadzor yozishi 42501 bo''lishi kerak, keldi: ' || sqlstate || ' ' || sqlerrm);
  end;
  r := public.t2_aosr_slichitelniy_v1(up, p, o1, 200);
  perform pg_temp.sl_assert((r->'tayyorlik'->>'kutilmoqda')::int = 3, 'kutilmoqda 3 bo''lishi kerak: ' || (r->'tayyorlik')::text);
  raise notice 'SLICH qadam [% %]: OK', v_n, v_name;

  -- ===================================================================
  v_n := 9; v_name := 'texnadzor qarori: W2 qabul, W3 qabul (hajm yetmaydi), W4 tuzatish';
  r := public.t2_tomon_qaror_v1(uin, z, t2id, 'qabul', 'Mos');
  perform pg_temp.sl_assert((r->>'ok')::boolean and r->>'holat' = 'qabul', 'W2 qabul qilinmadi: ' || r::text);
  r := public.t2_tomon_qaror_v1(uin, z, t3id, 'qabul', 'Qisman mos');
  perform pg_temp.sl_assert((r->>'ok')::boolean, 'W3 qabul qilinmadi: ' || r::text);
  r := public.t2_tomon_qaror_v1(uin, z, t4id, 'tuzatish', 'Hajmni aniqlashtiring');
  perform pg_temp.sl_assert((r->>'ok')::boolean and r->>'holat' = 'tuzatish', 'W4 tuzatishga qaytmadi: ' || r::text);
  r := public.t2_aosr_bog_hajm_v1(up, p, v_a2, jsonb_build_array(jsonb_build_object('qator_id', v_w2, 'hajm', 1)));
  perform pg_temp.sl_assert(r->>'code' = 'TASDIQLANGAN', 'tasdiqlangan akt bog''i o''zgardi: ' || r::text);
  raise notice 'SLICH qadam [% %]: OK', v_n, v_name;

  -- ===================================================================
  v_n := 10; v_name := 'slichitelniy RPC yakuniy: farqlar, asoslar, tayyorlik sanog''i, aosrlar (qaror kim/qachon)';
  r := public.t2_aosr_slichitelniy_v1(up, p, o1, 200);
  tay := r->'tayyorlik';
  perform pg_temp.sl_assert((tay->>'farqli')::int = 3 and (tay->>'asosli')::int = 3 and (tay->>'tasdiqlagan')::int = 1
                            and (tay->>'hajm_yetmaydi')::int = 1 and (tay->>'tuzatish')::int = 1 and (tay->>'asossiz')::int = 0, 'yakuniy sanoq: ' || tay::text);
  perform pg_temp.sl_assert((r->>'yetishmaydi_jami')::int = 2, 'yetishmaydi_jami kutilgan 2 (W3 hajm, W4 tuzatish): ' || r::text);
  perform pg_temp.sl_assert((select e->>'amal' from jsonb_array_elements(r->'yetishmaydi') e where (e->>'qator_id')::bigint = v_w3) = 'hajm_toldir'
                            and (select e->>'amal' from jsonb_array_elements(r->'yetishmaydi') e where (e->>'qator_id')::bigint = v_w4) = 'tuzatish_kiriting', 'amal xaritasi noto''g''ri');
  v_x := (select e from jsonb_array_elements(r->'aosrlar') e where (e->>'id')::bigint = v_a2);
  perform pg_temp.sl_assert(v_x->>'asos_holat' = 'tasdiqlangan' and v_x->>'taqdim_holat' = 'qabul' and v_x->>'qaror_vaqti' is not null
                            and v_x->>'qaror_kim' = 'Z texnadzor' and v_x->>'qaror_kompaniya' = 'SLICH_TEXNADZOR', 'qaror kim/qachon yo''q: ' || v_x::text);
  perform pg_temp.sl_assert((select e->>'asos_holat' from jsonb_array_elements(r->'aosrlar') e where (e->>'id')::bigint = v_a4) = 'tuzatish', 'W4 aosr holati tuzatish emas');
  raise notice 'SLICH qadam [% %]: OK', v_n, v_name;

  -- ===================================================================
  v_n := 11; v_name := 'asl smeta o''zgarmagan; begona kompaniya ko''rmaydi; texnadzor kompaniyasi pudratchi obyektini ko''rmaydi';
  select md5(string_agg(id::text || ':' || coalesce(hajm::text, '') || ':' || coalesce(narx::text, '') || ':' || coalesce(summa::text, ''), ',' order by id))
    into v_hash1 from public.t2_qator where obyekt_id = o1;
  perform pg_temp.sl_assert(v_hash0 = v_hash1, 'asl smeta qatorlari o''zgargan');
  r := public.t2_aosr_slichitelniy_v1(ux, x, o1, 200);
  perform pg_temp.sl_assert(r->>'code' = 'TOPILMADI', 'begona kompaniya obyektni ko''rdi: ' || r::text);
  r := public.t2_aosr_slichitelniy_v1(uz, z, o1, 200);
  perform pg_temp.sl_assert(r->>'code' = 'TOPILMADI', 'texnadzor kompaniyasi pudratchi obyektini o''z nomidan ko''rdi: ' || r::text);
  begin
    perform public.t2_aosr_slichitelniy_v1(ux, p, o1, 200);
    raise exception 'ASSERT: begona foydalanuvchi boshqa kompaniya nomidan o''qidi';
  exception when others then
    perform pg_temp.sl_assert(sqlstate <> 'P0001' or sqlerrm not like 'ASSERT:%', 'begona foydalanuvchi o''qidi');
  end;
  r := public.t2_aosr_bog_hajm_v1(ux, x, v_a2, jsonb_build_array(jsonb_build_object('qator_id', v_w2, 'hajm', 1)));
  perform pg_temp.sl_assert(r->>'code' = 'TOPILMADI', 'begona kompaniya yozdi: ' || r::text);
  raise notice 'SLICH qadam [% %]: OK', v_n, v_name;

  raise notice 'SLICH ACCEPTANCE OK';
exception when others then
  raise exception 'SLICH qadam [% %]: %', v_n, v_name, sqlerrm;
end $sl$;
rollback;
