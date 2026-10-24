-- Qabul (BEGIN..ROLLBACK, sintetik): migratsiya qo'llangandan KEYIN ishga tushiriladi (yoki \i bilan). Hech narsa saqlanmaydi.
begin;
do $test$
declare c bigint; a bigint; o bigint; rz bigint; ak bigint; v numeric; snap jsonb; r jsonb;
  o1 bigint; z1 bigint; o2 bigint; z2 bigint; o3 bigint; z3 bigint; o4 bigint; za bigint; zb bigint; bl bigint; ch bigint; zbl bigint; row jsonb;
begin
  insert into public.t2_kompaniya(nom,kod) values('_TEST_ZQ_',gen_random_uuid()::text) returning id into c;
  insert into public.t2_foydalanuvchi(login) values('_TEST_ZQ_'||gen_random_uuid()) returning id into a;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol) values(a,c,'pto');
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_ZQ_',c) returning id into o;
  insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,tartib) values(o,c,'rz','_TEST_ZQ_rz',1) returning id into rz;
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o,'f2','2026-10-01','tasdiqlangan') returning id into ak;

  -- A) birlik bir xil: 1:1 (asl 100 m3; zamena 80 m3, F2 30) -> almashtirilgan 30, qoldiq 70.
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'rs','_TEST_ZQ_o1','m3',100,10,1000,2) returning id into o1;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib,qoshimcha,zamena,change_type,replaces_line_id) values(o,c,rz,'rs','_TEST_ZQ_z1','m3',80,3,true,true,'REPLACEMENT',o1) returning id into z1;
  select to_jsonb(q) into snap from public.t2_qator q where id=o1;
  if public.t2_almashtirilgan_hajm(o1) <> 0 then raise exception 'A0: zamenada F2 yo''q -> 0 bo''lishi kerak'; end if;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,summa) values(ak,z1,o,30,300);
  if public.t2_almashtirilgan_hajm(o1) <> 30 then raise exception 'A1: 1:1 qoplash 30 emas: %', public.t2_almashtirilgan_hajm(o1); end if;
  if (select qoldiq_hajm from public.t2_qator_holat where qator_id=o1) <> 70 then raise exception 'A2: view qoldiq_hajm 70 emas'; end if;
  if (select qoldiq_summa from public.t2_qator_holat where qator_id=o1) <> 700 then raise exception 'A3: view qoldiq_summa 700 emas'; end if;
  row := (select e from jsonb_array_elements(public.t2_nakopitelniy_v2(o,a)->'qatorlar') e where (e->>'qator_id')::bigint=o1);
  if (row->>'qoldiq_hajm')::numeric <> 70 or (row->>'almashtirilgan_hajm')::numeric <> 30 then raise exception 'A4: nakopitelniy qoldiq/almashtirilgan noto''g''ri: %', row; end if;
  if (select (e->>'qoldiq_hajm')::numeric from jsonb_array_elements(public.t2_nakopitelniy_v2(o,a)->'qatorlar') e where (e->>'qator_id')::bigint=z1) <> 50 then raise exception 'A5: zamenaning o''z qoldig''i 80-30=50 emas'; end if;
  if snap is distinct from (select to_jsonb(q) from public.t2_qator q where id=o1) then raise exception 'A6: asl qator o''zgargan'; end if;

  -- B) birlik farqli, miqdor kiritilmagan -> asl TO'LIQ almashtirilgan (hozirgi qoldiq yopiladi); asl F2 20 bo'lsa 80.
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'rs','_TEST_ZQ_o2','m3',100,10,1000,4) returning id into o2;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib,qoshimcha,zamena,change_type,replaces_line_id) values(o,c,rz,'rs','_TEST_ZQ_z2','kg',500,5,true,true,'REPLACEMENT',o2) returning id into z2;
  if public.t2_almashtirilgan_hajm(o2) <> 100 then raise exception 'B1: to''liq almashtirish 100 emas'; end if;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,summa) values(ak,o2,o,20,200);
  if public.t2_almashtirilgan_hajm(o2) <> 80 then raise exception 'B2: asl F2 20 dan keyin 80 bo''lishi kerak'; end if;
  if (select qoldiq_hajm from public.t2_qator_holat where qator_id=o2) <> 0 then raise exception 'B3: qoldiq 0 bo''lishi kerak'; end if;

  -- C) birlik farqli, miqdor kiritilgan (zamena 500 kg to'liq = aslning 40 m3): zamena F2 250 kg -> 20 m3.
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'rs','_TEST_ZQ_o3','m3',100,10,1000,6) returning id into o3;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib,qoshimcha,zamena,change_type,replaces_line_id) values(o,c,rz,'rs','_TEST_ZQ_z3','kg',500,7,true,true,'REPLACEMENT',o3) returning id into z3;
  r := public.t2_zamena_almashtirish_belgila_v1(a,c,z3,40);
  if not (r->>'ok')::boolean then raise exception 'C0: belgila rad etdi: %', r; end if;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,summa) values(ak,z3,o,250,2500);
  if public.t2_almashtirilgan_hajm(o3) <> 20 then raise exception 'C1: proporsional 20 emas: %', public.t2_almashtirilgan_hajm(o3); end if;
  r := public.t2_zamena_almashtirish_belgila_v1(a,c,z3,null);   -- tozalash -> to'liq almashtirilgan
  if public.t2_almashtirilgan_hajm(o3) <> 100 then raise exception 'C2: miqdor o''chirilsa to''liq (100) bo''lishi kerak'; end if;
  if (public.t2_zamena_almashtirish_belgila_v1(a,c,z3,-1)->>'ok')::boolean then raise exception 'C3: manfiy miqdor qabul qilindi'; end if;
  if (public.t2_zamena_almashtirish_belgila_v1(a,c,o3,5)->>'ok')::boolean then raise exception 'C4: zamena bo''lmagan qatorga yozildi'; end if;

  -- D) bitta aslga bir necha zamena: 30 + 20 = 50; ortiqcha bo'lsa aslning qoldig'i bilan cheklanadi (manfiy qoldiq to'qilmaydi).
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'rs','_TEST_ZQ_o4','m3',100,10,1000,8) returning id into o4;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib,qoshimcha,zamena,change_type,replaces_line_id) values(o,c,rz,'rs','_TEST_ZQ_z4a','m3',60,9,true,true,'REPLACEMENT',o4) returning id into za;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib,qoshimcha,zamena,change_type,replaces_line_id) values(o,c,rz,'rs','_TEST_ZQ_z4b','m3',50,10,true,true,'REPLACEMENT',o4) returning id into zb;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,summa) values(ak,za,o,30,300),(ak,zb,o,20,200);
  if public.t2_almashtirilgan_hajm(o4) <> 50 then raise exception 'D1: 30+20=50 emas'; end if;
  update public.t2_akt_qator set hajm=100, summa=1000 where akt_id=ak and qator_id=zb;
  if public.t2_almashtirilgan_hajm(o4) <> 100 then raise exception 'D2: cheklov (100) ishlamadi'; end if;
  if (select qoldiq_hajm from public.t2_qator_holat where qator_id=o4) <> 0 then raise exception 'D3: qoldiq manfiy/noto''g''ri'; end if;

  -- E) Ish (bl) almashtirilgan: bola resurs ham shu ulushda yopiladi (zamena ish 10 m3, F2 5 -> 50% -> resurs 20 dan 10).
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib) values(o,c,rz,'bl','_TEST_ZQ_bl','m3',10,11) returning id into bl;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,bl,'rs','_TEST_ZQ_ch','kg',20,10,200,12) returning id into ch;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib,qoshimcha,zamena,change_type,replaces_line_id) values(o,c,rz,'bl','_TEST_ZQ_zbl','m3',10,13,true,true,'REPLACEMENT',bl) returning id into zbl;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,summa) values(ak,zbl,o,5,null);
  if public.t2_almashtirilgan_hajm(bl) <> 5 then raise exception 'E1: ish qoplash 5 emas'; end if;
  if public.t2_almashtirilgan_hajm(ch) <> 10 then raise exception 'E2: bola resurs ulushi 10 emas: %', public.t2_almashtirilgan_hajm(ch); end if;

  -- F) Zamenasiz qator: 0 va qoldiq o'zgarmaydi.
  if public.t2_almashtirilgan_hajm(rz) <> 0 then raise exception 'F1: zamenasiz qator 0 emas'; end if;
  -- G) Yopiq ruxsatlar.
  if has_function_privilege('anon','public.t2_almashtirilgan_hajm(bigint)','execute') or has_function_privilege('authenticated','public.t2_zamena_almashtirish_belgila_v1(bigint,bigint,bigint,numeric)','execute') then raise exception 'G1: ruxsat ochiq'; end if;
end $test$;
rollback;
