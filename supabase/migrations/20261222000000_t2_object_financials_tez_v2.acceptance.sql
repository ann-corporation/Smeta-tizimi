-- Qabul (BEGIN..ROLLBACK, sintetik): 20261222000000_t2_object_financials_tez_v2 qo'llangandan KEYIN. Hech narsa saqlanmaydi.
begin;
do $test$
declare c bigint; a bigint; o bigint; rz bigint; r jsonb; ob jsonb;
begin
  insert into public.t2_kompaniya(nom,kod) values('_TEST_TEZ_',gen_random_uuid()::text) returning id into c;
  insert into public.t2_foydalanuvchi(login) values('_TEST_TEZ_'||gen_random_uuid()) returning id into a;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol) values(a,c,'boss');
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_TEZ_',c) returning id into o;
  insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,tartib) values(o,c,'rz','_TEST_TEZ_rz',1) returning id into rz;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'rs','_TEST_TEZ_oddiy','m3',10,100,1000,2);
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'rs','ЗАТРАТЫ ТРУДА МАШИНИСТА','ч',5,10,50,3);

  r := public.t2_object_financials_v1(c,a,array[o]);
  if (r->>'ok')::boolean is not true or jsonb_array_length(r->'objects') <> 1 then raise exception 'A1: javob shakli buzilgan'; end if;
  ob := r->'objects'->0;
  -- Faqat barglar (rs) sanaladi, rz emas; haydovchi mehnati qatori driver_labor_count da.
  if (ob->>'leaf_count')::int <> 2 then raise exception 'A2: leaf_count %', ob->>'leaf_count'; end if;
  if (ob->>'driver_labor_count')::int <> 1 then raise exception 'A3: driver_labor_count %', ob->>'driver_labor_count'; end if;
  if (ob->'smeta'->>'known')::numeric <> 1050 then raise exception 'A4: smeta known %', ob->'smeta'->>'known'; end if;
  if (ob->'fakt'->>'present')::boolean or (ob->'f2'->>'present')::boolean then raise exception 'A5: akt yo''q, present bo''lmasligi kerak'; end if;
end
$test$;
rollback;
