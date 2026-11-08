-- Qabul (BEGIN..ROLLBACK, sintetik): 20261203001700_t2_zamena_qozon_v1 qo'llangandan KEYIN. Hech narsa saqlanmaydi.
begin;
do $test$
declare c bigint; a bigint; o bigint; rz bigint; f2 bigint; fk bigint; snap jsonb; row jsonb; r1 jsonb; r2 jsonb; r3 jsonb;
  bl bigint; ch bigint; zbl bigint; o2 bigint; z2 bigint; o3 bigint; z3 bigint; o4 bigint; za bigint; zb bigint; o5 bigint; z5 bigint;
  o6 bigint; v integer; n integer; zc1 bigint; zc2 bigint; f3 bigint;
begin
  insert into public.t2_kompaniya(nom,kod) values('_TEST_ZQZ_',gen_random_uuid()::text) returning id into c;
  insert into public.t2_foydalanuvchi(login) values('_TEST_ZQZ_'||gen_random_uuid()) returning id into a;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol) values(a,c,'pto');
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_ZQZ_',c) returning id into o;
  insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,tartib) values(o,c,'rz','_TEST_ZQZ_rz',1) returning id into rz;
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o,'f2','2026-10-01','qoralama') returning id into f2;

  -- A) «umumiy qozon» + pul bolalarda: asl ish 100 m2 (narx 0, summa 1000 = bola resurs), zamena 20 m2 (birinchi kiritish), F2 95.
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_ZQZ_bl','m2',100,0,1000,2) returning id into bl;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,bl,'rs','_TEST_ZQZ_ch','kg',50,20,1000,3) returning id into ch;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,kod,nom,birlik,hajm,tartib,qoshimcha,zamena,change_type,replaces_line_id)
    values(o,c,rz,'bl','Z-1','_TEST_ZQZ_zbl','m2',20,4,true,true,'REPLACEMENT',bl) returning id into zbl;
  select jsonb_agg(to_jsonb(q) order by q.id) into snap from public.t2_qator q where q.id in (bl, ch);
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(f2,zbl,o,95,null);
  update public.t2_akt set holat='tasdiqlangan' where id=f2;
  if public.t2_zamena_reja_hajm(zbl) <> 100 then raise exception 'A1: samarali reja 100 emas: %', public.t2_zamena_reja_hajm(zbl); end if;
  select to_jsonb(h) into row from public.t2_qator_holat h where h.qator_id = zbl;
  if (row->>'smeta_hajm')::numeric <> 100 or (row->>'qoldiq_hajm')::numeric <> 5 or (row->>'asl_smeta_hajm')::numeric <> 20 then
    raise exception 'A2: zamena holati noto''g''ri (kutilgan smeta 100, qoldiq 5, asl 20): %', row; end if;
  select to_jsonb(h) into row from public.t2_qator_holat h where h.qator_id = bl;
  if (row->>'qoldiq_hajm')::numeric <> 5 then raise exception 'A3: asl qoldiq hajmi 5 emas: %', row; end if;
  if (row->>'almashtirilgan_summa')::numeric <> 950 or (row->>'qoldiq_summa')::numeric <> 50 then
    raise exception 'A4: narx 0 + summa: almashtirilgan 950 / qoldiq 50 bo''lishi kerak: %', row; end if;
  if (select qoldiq_summa from public.t2_qator_holat where qator_id = ch) <> 50 then raise exception 'A5: bola qoldiq summasi BL bilan teng emas'; end if;
  row := (select e from jsonb_array_elements(public.t2_nakopitelniy_v2(o,a)->'qatorlar') e where (e->>'qator_id')::bigint = zbl);
  if (row->>'smeta_hajm')::numeric <> 100 or (row->>'qoldiq_hajm')::numeric <> 5 or (row->>'asl_smeta_hajm')::numeric <> 20
     or (row->>'bajarilish_foiz')::numeric <> 95 then raise exception 'A6: nakopitelniy zamena qatori: %', row; end if;
  row := (select e from jsonb_array_elements(public.t2_nakopitelniy_v2(o,a)->'qatorlar') e where (e->>'qator_id')::bigint = bl);
  if (row->>'almashtirilgan_summa')::numeric <> 950 or (row->>'qoldiq_summa')::numeric <> 50 then raise exception 'A7: nakopitelniy asl summa: %', row; end if;
  if (select hajm from public.t2_qator where id = zbl) <> 20 then raise exception 'A8: zamena t2_qator.hajm o''zgargan'; end if;
  if snap is distinct from (select jsonb_agg(to_jsonb(q) order by q.id) from public.t2_qator q where q.id in (bl, ch)) then raise exception 'A9: asl qator o''zgargan'; end if;

  -- I) zamena ishining BOLA resurslari ish rejasi foizida: ish 20 -> reja 100 (×5).
  --    rs 40 (narxsiz) F2 190 -> reja 200, qoldiq 10; mat 10 (summa 500, narx NULL) F2 40/2000 -> reja 50, qoldiq 10, qoldiq summa 2500-2000=500.
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib,qoshimcha,change_type) values(o,c,zbl,'rs','_TEST_ZQZ_zc1','kg',40,5,true,'ADDITIONAL') returning id into zc1;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,summa,tartib,qoshimcha,change_type) values(o,c,zbl,'mat','_TEST_ZQZ_zc2','m3',10,500,6,true,'ADDITIONAL') returning id into zc2;
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o,'f2','2026-09-01','qoralama') returning id into f3;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(f3,zc1,o,190,null),(f3,zc2,o,40,50);  -- summa = hajm × narx (2000)
  update public.t2_akt set holat='tasdiqlangan' where id=f3;
  if public.t2_zamena_reja_hajm(zc1) <> 200 or public.t2_zamena_reja_hajm(zc2) <> 50 then
    raise exception 'I1: bola rejalari 200/50 emas: % %', public.t2_zamena_reja_hajm(zc1), public.t2_zamena_reja_hajm(zc2); end if;
  select to_jsonb(h) into row from public.t2_qator_holat h where h.qator_id = zc1;
  if (row->>'smeta_hajm')::numeric <> 200 or (row->>'qoldiq_hajm')::numeric <> 10 or (row->>'asl_smeta_hajm')::numeric <> 40 then raise exception 'I2: rs bola holati: %', row; end if;
  select to_jsonb(h) into row from public.t2_qator_holat h where h.qator_id = zc2;
  if (row->>'smeta_hajm')::numeric <> 50 or (row->>'qoldiq_hajm')::numeric <> 10 or (row->>'qoldiq_summa')::numeric <> 500 then raise exception 'I3: mat bola holati: %', row; end if;
  row := (select e from jsonb_array_elements(public.t2_nakopitelniy_v2(o,a)->'qatorlar') e where (e->>'qator_id')::bigint = zc2);
  if (row->>'smeta_hajm')::numeric <> 50 or (row->>'qoldiq_hajm')::numeric <> 10 or (row->>'qoldiq_summa')::numeric <> 500 then raise exception 'I4: nakopitelniy mat bola: %', row; end if;
  if public.t2_zamena_reja_hajm(ch) is not null then raise exception 'I5: asl ishning bolasi o''zgarmasligi kerak'; end if;
  if (select hajm from public.t2_qator where id = zc1) <> 40 then raise exception 'I6: bola t2_qator.hajm o''zgargan'; end if;

  -- B) birlik farqli -> qoida qo'llanmaydi (zamena o'z hajmi).
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'rs','_TEST_ZQZ_o2','m3',100,10,1000,5) returning id into o2;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib,qoshimcha,zamena,change_type,replaces_line_id) values(o,c,rz,'rs','_TEST_ZQZ_z2','kg',500,6,true,true,'REPLACEMENT',o2) returning id into z2;
  if public.t2_zamena_reja_hajm(z2) is not null or (select smeta_hajm from public.t2_qator_holat where qator_id = z2) <> 500 then raise exception 'B1: birlik farqli zamena o''zgargan'; end if;

  -- C) birlik bir xil, almashtirish_hajm kiritilgan -> qoida qo'llanmaydi.
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'rs','_TEST_ZQZ_o3','m3',100,10,1000,7) returning id into o3;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib,qoshimcha,zamena,change_type,replaces_line_id,almashtirish_hajm) values(o,c,rz,'rs','_TEST_ZQZ_z3','m3',30,8,true,true,'REPLACEMENT',o3,40) returning id into z3;
  if public.t2_zamena_reja_hajm(z3) is not null or (select smeta_hajm from public.t2_qator_holat where qator_id = z3) <> 30 then raise exception 'C1: almashtirish_hajm li zamena o''zgargan'; end if;

  -- D) bir aslga ikki zamena (bir xil birlik): asl 100; za F2 30, zb F2 20 -> za reja 80, zb reja 70; hammasining qoldig'i 50.
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'rs','_TEST_ZQZ_o4','m3',100,10,1000,9) returning id into o4;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib,qoshimcha,zamena,change_type,replaces_line_id) values(o,c,rz,'rs','_TEST_ZQZ_z4a','m3',10,10,true,true,'REPLACEMENT',o4) returning id into za;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib,qoshimcha,zamena,change_type,replaces_line_id) values(o,c,rz,'rs','_TEST_ZQZ_z4b','m3',10,11,true,true,'REPLACEMENT',o4) returning id into zb;
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o,'f2','2026-11-01','qoralama') returning id into fk;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(fk,za,o,30,10),(fk,zb,o,20,10);
  update public.t2_akt set holat='tasdiqlangan' where id=fk;
  if public.t2_zamena_reja_hajm(za) <> 80 or public.t2_zamena_reja_hajm(zb) <> 70 then raise exception 'D1: rejalar 80/70 emas: % %', public.t2_zamena_reja_hajm(za), public.t2_zamena_reja_hajm(zb); end if;
  if (select qoldiq_hajm from public.t2_qator_holat where qator_id = za) <> 50 or (select qoldiq_hajm from public.t2_qator_holat where qator_id = zb) <> 50
     or (select qoldiq_hajm from public.t2_qator_holat where qator_id = o4) <> 50 then raise exception 'D2: umumiy qozon qoldig''i 50 emas'; end if;

  -- E) zamena o'z hajmi qozondan katta: pastki chegara = zamena hajmi (yomonlashmaydi).
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'rs','_TEST_ZQZ_o5','m3',10,10,100,12) returning id into o5;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib,qoshimcha,zamena,change_type,replaces_line_id) values(o,c,rz,'rs','_TEST_ZQZ_z5','m3',40,13,true,true,'REPLACEMENT',o5) returning id into z5;
  if public.t2_zamena_reja_hajm(z5) <> 40 then raise exception 'E1: pastki chegara 40 emas: %', public.t2_zamena_reja_hajm(z5); end if;

  -- F) narx qoidasi (NULL != 0).
  if public.t2_almashtirilgan_summa_hisob(5,100,0,1000) <> 50 then raise exception 'F1: narx 0 + summa -> 50'; end if;
  if public.t2_almashtirilgan_summa_hisob(5,100,0,0) <> 0 then raise exception 'F2: narx 0 + summa 0 -> 0'; end if;
  if public.t2_almashtirilgan_summa_hisob(5,100,null,null) is not null then raise exception 'F3: noma''lum -> NULL'; end if;
  if public.t2_almashtirilgan_summa_hisob(5,100,10,999) <> 50 then raise exception 'F4: narx ustun'; end if;
  if public.t2_almashtirilgan_summa_hisob(0,100,0,1000) <> 0 then raise exception 'F5: alm 0 -> 0'; end if;
  if public.t2_almashtirilgan_summa_hisob(5,0,0,1000) is not null then raise exception 'F6: hajm 0 -> NULL'; end if;

  -- G) takror zamena (ish_abc_saqla_v1 'replacement'): mavjud qator qayta ishlatiladi, hajm tegilmaydi, faqat fakt qo'shiladi.
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_ZQZ_o6','m2',100,0,1000,14) returning id into o6;
  select versiya into v from public.t2_qator where id = rz;
  r1 := public.t2_ish_abc_saqla_v1(a,c,o,'replacement',rz,o6,jsonb_build_object('nom','_TEST_ZQZ_g','birlik','m2','hajm',10,'kod','G-1'),null,10,'2026-11-08','sinov',gen_random_uuid(),v);
  if not coalesce((r1->>'ok')::boolean,false) then raise exception 'G0: birinchi zamena yozilmadi: %', r1; end if;
  select versiya into v from public.t2_qator where id = rz;
  r2 := public.t2_ish_abc_saqla_v1(a,c,o,'replacement',rz,o6,jsonb_build_object('nom','_TEST_ZQZ_g','birlik','m2','hajm',7,'kod','G-1'),null,7,'2026-11-09','sinov 2',gen_random_uuid(),v);
  if not coalesce((r2->>'ok')::boolean,false) or (r2->>'qator_id') <> (r1->>'qator_id') or not (r2->>'qayta_ishlatildi')::boolean then
    raise exception 'G1: takror zamena yangi qator yaratdi: % / %', r1, r2; end if;
  select count(*) into n from public.t2_qator where replaces_line_id = o6;
  if n <> 1 then raise exception 'G2: zamena qatorlari soni 1 emas: %', n; end if;
  if (select hajm from public.t2_qator where id = (r1->>'qator_id')::bigint) <> 10 then raise exception 'G3: zamena hajmi o''zgargan'; end if;
  if (select fakt_hajm from public.t2_qator_holat where qator_id = (r1->>'qator_id')::bigint) <> 17 then
    raise exception 'G4: fakt 10+7=17 emas: %', (select fakt_hajm from public.t2_qator_holat where qator_id = (r1->>'qator_id')::bigint); end if;
  if (select smeta_hajm from public.t2_qator_holat where qator_id = (r1->>'qator_id')::bigint) <> 100 then raise exception 'G5: qozon rejasi 100 emas'; end if;
  -- boshqa kod -> alohida yangi zamena (birlashtirilmaydi)
  select versiya into v from public.t2_qator where id = rz;
  r3 := public.t2_ish_abc_saqla_v1(a,c,o,'replacement',rz,o6,jsonb_build_object('nom','_TEST_ZQZ_h','birlik','m2','hajm',5,'kod','H-2'),null,null,null,'sinov 3',gen_random_uuid(),v);
  if (r3->>'qator_id') = (r1->>'qator_id') or coalesce((r3->>'qayta_ishlatildi')::boolean, false) then raise exception 'G6: boshqa kod birlashtirildi: %', r3; end if;

  -- H) ruxsatlar yopiq.
  if has_function_privilege('anon','public.t2_zamena_reja_hajm(bigint)','execute') or has_function_privilege('authenticated','public.t2_zamena_reja_hajm(bigint)','execute') then raise exception 'H1: ruxsat ochiq'; end if;
end $test$;
rollback;
