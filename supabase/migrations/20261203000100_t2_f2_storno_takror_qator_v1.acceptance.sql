-- Qabul (BEGIN..ROLLBACK, o'zi yetarli sintetik ma'lumot): migratsiya qo'llangandan KEYIN ishga tushiriladi. Hech narsa saqlanmaydi.
-- Muvaffaqiyat: NOTICE 'STORNO_TAKROR_ACCEPTANCE_PASS'.
begin;
do $test$
declare c bigint; a bigint; o bigint; o2 bigint; rz bigint; x bigint; y bigint; x2 bigint;
  s bigint; dr bigint; s2 bigint; ak bigint; ak2 bigint; r jsonb; v int; op uuid;
  st jsonb; pl jsonb;
begin
  insert into public.t2_kompaniya(nom,kod) values('_TEST_STT_',gen_random_uuid()::text) returning id into c;
  insert into public.t2_foydalanuvchi(login) values('_TEST_STT_'||gen_random_uuid()) returning id into a;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol) values(a,c,'admin');
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_STT_',c) returning id into o;
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_STT_2',c) returning id into o2;
  insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,tartib) values(o,c,'rz','_TEST_STT_rz',1) returning id into rz;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_STT_X','m3',200,10,2000,2) returning id into x;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_STT_Y','m3',50,10,500,3) returning id into y;
  insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o2,c,'bl','_TEST_STT_X2','m3',10,10,100,1) returning id into x2;

  -- Manbalar: S — tasdiqlangan F2 (X = 40); DR — qoralama F2; S2 — boshqa obyektning tasdiqlangan F2 si.
  insert into public.t2_akt(obyekt_id,kompaniya_id,tur,oy,holat) values(o,c,'f2','2026-09-01','qoralama') returning id into s;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,kompaniya_id,hajm,narx,certified_quantity,certified_unit_price,certified_amount)
    values(s,x,o,c,40,10,40,10,400);
  update public.t2_akt set holat='tasdiqlangan' where id=s;
  insert into public.t2_akt(obyekt_id,kompaniya_id,tur,oy,holat) values(o,c,'f2','2026-09-01','qoralama') returning id into dr;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,kompaniya_id,hajm,narx) values(dr,x,o,c,40,10);
  insert into public.t2_akt(obyekt_id,kompaniya_id,tur,oy,holat) values(o2,c,'f2','2026-09-01','qoralama') returning id into s2;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,kompaniya_id,hajm,narx) values(s2,x2,o2,c,5,10);
  update public.t2_akt set holat='tasdiqlangan' where id=s2;
  if (select f2_hajm from public.t2_qator_holat where qator_id=x) <> 40 then raise exception '0: boshlang''ich f2_hajm 40 emas'; end if;

  st := jsonb_build_object('qator_id',x,'certified_quantity',-40,'certified_unit_price',10,'certified_amount',-400,
          'raw_snapshot',jsonb_build_object('source','storno','stornoOf',s),'izoh','Сторно (eski F2)');
  pl := jsonb_build_object('qator_id',x,'certified_quantity',60,'certified_unit_price',10,'certified_amount',600,
          'raw_snapshot',jsonb_build_object('source','native_f2_preparation'));

  -- 1) Yaratish: bir qator storno (−40) + plyus (+60) — ikkalasi o'z qiymati bilan.
  op := gen_random_uuid();
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(st,pl),a,'_TEST_STT_1',op);
  if (r->>'ok')::boolean is not true then raise exception '1: yaratilmadi: %', r; end if;
  ak := (r->>'akt_id')::bigint;
  if (select count(*) from public.t2_akt_qator where akt_id=ak and qator_id=x) <> 2 then raise exception '1a: 2 qator emas'; end if;
  if not exists (select 1 from public.t2_akt_qator where akt_id=ak and qator_id=x and certified_quantity=-40 and certified_amount=-400 and hajm=-40 and raw_snapshot->>'source'='storno')
     or not exists (select 1 from public.t2_akt_qator where akt_id=ak and qator_id=x and certified_quantity=60 and certified_amount=600 and hajm=60 and raw_snapshot->>'source'='native_f2_preparation') then
    raise exception '1b: nusxalar qiymati aralashgan: %', (select jsonb_agg(to_jsonb(q)) from public.t2_akt_qator q where akt_id=ak);
  end if;
  if (select hujjat_jami from public.t2_akt where id=ak) <> 200 then raise exception '1c: hujjat_jami 200 emas'; end if;
  -- Idempotentlik o'zgarmagan.
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(st,pl),a,'_TEST_STT_1',op);
  if (r->>'takror')::boolean is not true then raise exception '1d: idempotentlik buzildi: %', r; end if;

  -- 2) Qayta saqlash (yangila): storno −40 + plyus +70 (storno birinchi emas — tartib ahamiyatsiz).
  select versiya into v from public.t2_akt where id=ak;
  r := public.t2_f2_qoralama_yangila_v1(a,c,ak,v,jsonb_build_array(pl || jsonb_build_object('certified_quantity',70,'certified_amount',700), st),gen_random_uuid());
  if (r->>'ok')::boolean is not true then raise exception '2: yangilanmadi: %', r; end if;
  if (r->>'qator_soni')::int <> 2 then raise exception '2a: qator_soni 2 emas: %', r; end if;
  if not exists (select 1 from public.t2_akt_qator where akt_id=ak and qator_id=x and certified_quantity=-40 and certified_amount=-400 and raw_snapshot->>'source'='storno')
     or not exists (select 1 from public.t2_akt_qator where akt_id=ak and qator_id=x and certified_quantity=70 and certified_amount=700 and raw_snapshot->>'source'='native_f2_preparation') then
    raise exception '2b: yangila nusxalari aralashgan: %', (select jsonb_agg(to_jsonb(q)) from public.t2_akt_qator q where akt_id=ak);
  end if;
  -- Bir xil hajm/narxli ikki nusxa (storno +40 eski minus qatorning, plyus +40): juftlash bijeksiyasi qiymatlarni saqlaydi.
  select versiya into v from public.t2_akt where id=ak;
  r := public.t2_f2_qoralama_yangila_v1(a,c,ak,v,jsonb_build_array(
         st || jsonb_build_object('certified_quantity',40,'certified_amount',401),
         pl || jsonb_build_object('certified_quantity',40,'certified_amount',399)),gen_random_uuid());
  if (r->>'ok')::boolean is not true then raise exception '2c: %', r; end if;
  if (select sum(certified_amount) from public.t2_akt_qator where akt_id=ak) <> 800
     or not exists (select 1 from public.t2_akt_qator where akt_id=ak and certified_amount=401 and raw_snapshot->>'source'='storno') then
    raise exception '2d: bir xil kalitli nusxalar: %', (select jsonb_agg(to_jsonb(q)) from public.t2_akt_qator q where akt_id=ak);
  end if;
  select versiya into v from public.t2_akt where id=ak;
  r := public.t2_f2_qoralama_yangila_v1(a,c,ak,v,jsonb_build_array(st, pl || jsonb_build_object('certified_quantity',70,'certified_amount',700)),gen_random_uuid());
  if (r->>'ok')::boolean is not true then raise exception '2e: %', r; end if;

  -- 3) Tasdiqlash: f2_hajm ishorali = 40 (S) − 40 + 70 = 70.
  update public.t2_akt set holat='tasdiqlangan' where id=ak;
  if (select f2_hajm from public.t2_qator_holat where qator_id=x) <> 70 then raise exception '3: f2_hajm 70 emas: %', (select f2_hajm from public.t2_qator_holat where qator_id=x); end if;

  -- 4) Takrorlar hamon rad: ikki oddiy, ikki storno, uch nusxa.
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(pl, pl || jsonb_build_object('certified_quantity',1,'certified_amount',10)),a,'_TEST_STT_4',gen_random_uuid());
  if r->>'code' is distinct from 'DUPLICATE_F2_SOURCE_LINE' then raise exception '4a: ikki oddiy takror o''tdi: %', r; end if;
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(st, st),a,'_TEST_STT_4',gen_random_uuid());
  if r->>'code' is distinct from 'DUPLICATE_F2_SOURCE_LINE' then raise exception '4b: ikki storno takror o''tdi: %', r; end if;
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(st, pl, pl),a,'_TEST_STT_4',gen_random_uuid());
  if r->>'code' is distinct from 'DUPLICATE_F2_SOURCE_LINE' then raise exception '4c: uch nusxa o''tdi: %', r; end if;
  -- yangila ham.
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(jsonb_build_object('qator_id',y,'certified_quantity',5,'certified_unit_price',10,'certified_amount',50)),a,'_TEST_STT_5',gen_random_uuid());
  if (r->>'ok')::boolean is not true then raise exception '4d: %', r; end if;
  ak2 := (r->>'akt_id')::bigint;
  select versiya into v from public.t2_akt where id=ak2;
  r := public.t2_f2_qoralama_yangila_v1(a,c,ak2,v,jsonb_build_array(pl, pl),gen_random_uuid());
  if r->>'code' is distinct from 'DUPLICATE_F2_SOURCE_LINE' then raise exception '4e: yangila ikki oddiy takror o''tdi: %', r; end if;

  -- 5) Storno manbai tasdiqlangan F2 bo'lmasa — rad (qoralama, manbasiz, boshqa obyekt).
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(st || jsonb_build_object('raw_snapshot',jsonb_build_object('source','storno','stornoOf',dr))),a,'_TEST_STT_6',gen_random_uuid());
  if r->>'code' is distinct from 'STORNO_SOURCE_NOT_APPROVED' then raise exception '5a: qoralamadan storno o''tdi: %', r; end if;
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(st || jsonb_build_object('raw_snapshot',jsonb_build_object('source','storno'))),a,'_TEST_STT_6',gen_random_uuid());
  if r->>'code' is distinct from 'STORNO_SOURCE_NOT_APPROVED' then raise exception '5b: manbasiz storno o''tdi: %', r; end if;
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(st || jsonb_build_object('raw_snapshot',jsonb_build_object('source','storno','stornoOf',s2))),a,'_TEST_STT_6',gen_random_uuid());
  if r->>'code' is distinct from 'STORNO_SOURCE_NOT_APPROVED' then raise exception '5c: boshqa obyekt manbasi o''tdi: %', r; end if;
  select versiya into v from public.t2_akt where id=ak2;
  r := public.t2_f2_qoralama_yangila_v1(a,c,ak2,v,jsonb_build_array(st || jsonb_build_object('raw_snapshot',jsonb_build_object('source','storno','stornoOf',dr))),gen_random_uuid());
  if r->>'code' is distinct from 'STORNO_SOURCE_NOT_APPROVED' then raise exception '5d: yangila qoralamadan storno o''tdi: %', r; end if;
  -- Oddiy (storno bo'lmagan) yaratish o'zgarmagan.
  if (select count(*) from public.t2_akt_qator where akt_id=ak2) <> 1 then raise exception '5e: rad etilgan yangila qatorlarni o''zgartirdi'; end if;

  -- 6) Asl tasdiqlangan manba o'zgarmagan; zaxira nusxalar yopiq.
  if (select certified_amount from public.t2_akt_qator where akt_id=s) <> 400 then raise exception '6a: manba F2 o''zgargan'; end if;
  if has_function_privilege('authenticated','public.t2_akt_yarat_v2_pre_20261203000100(bigint,date,jsonb,bigint,text,uuid,text)','execute')
     or has_function_privilege('anon','public._t2_f2_storno_manba_xato(jsonb,bigint,bigint)','execute') then raise exception '6b: ruxsat ochiq'; end if;
  if exists (select 1 from public.t2_versiya_xabardorlik_audit_v1() z where z.nom like '%20261203000100%' or z.nom like '\_t2\_f2\_%') then raise exception '6c: yangi funksiyalar versiya auditida'; end if;
  raise notice 'STORNO_TAKROR_ACCEPTANCE_PASS akt=% f2_hajm=70', ak;
end $test$;
rollback;
