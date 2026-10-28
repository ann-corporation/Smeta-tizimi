-- Qabul (BEGIN..ROLLBACK, sintetik, o'zi ma'lumot yaratadi): migratsiya qo'llangandan KEYIN ishga tushiriladi. Hech narsa saqlanmaydi.
-- Isbot: (1) rs faqat narx_manba='f2_sertifikat' bilan yoziladi; (2) o'z DIRECT fakti bor rs BL_NORMA hosilasi bilan
-- ikki marta sanalmaydi; (3) manfiy rs hajmi ham qabul qilinadi; (4) bl narx_yoq — hajm yoziladi, summa yo'q;
-- (5) asl smeta qatorlari o'zgarmaydi; (6) ruxsatlar yopiq.
begin;
do $test$
declare c bigint; a bigint; o bigint; rz bigint; bl bigint; rs bigint; rs2 bigint; mat bigint; r jsonb; h record; s1 jsonb; s2 jsonb; v numeric;
begin
  insert into public.t2_kompaniya(nom,kod) values('_TEST_FF2RS_',gen_random_uuid()::text) returning id into c;
  insert into public.t2_foydalanuvchi(login) values('_TEST_FF2RS_'||gen_random_uuid()) returning id into a;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol) values(a,c,'pto');
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_FF2RS_',c) returning id into o;
  insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,tartib) values(o,c,'rz','_TEST_FF2RS_rz',1) returning id into rz;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,tartib) values(o,c,rz,'bl','_TEST_FF2RS_bl','m3',10,30,2) returning id into bl;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,norma,kat,tartib) values(o,c,bl,'rs','_TEST_FF2RS_rs','chel.-soat',20,5,100,2,'ЧЕЛ',3) returning id into rs;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,norma,kat,tartib) values(o,c,bl,'rs','_TEST_FF2RS_rs2','mash.-soat',10,8,80,1,'МАШ',4) returning id into rs2;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,kat,tartib) values(o,c,bl,'mat','_TEST_FF2RS_mat','t',5,40,200,'МАТ',5) returning id into mat;
  select jsonb_agg(to_jsonb(q) order by q.id) into s1 from public.t2_qator q where q.obyekt_id=o;

  -- 1) bl fakti 4 (narx_yoq: hajm bor, bl summasi yo'q) -> rs norma bo'yicha ergashadi (BL_NORMA): 4 × 2 = 8 h, 8 × 5 = 40.
  r := public.t2_fakt_yoz_v2(o,current_date,jsonb_build_array(jsonb_build_object('qator_id',bl,'hajm',4,'narx_yoq',true)),a,gen_random_uuid(),'acceptance');
  if not coalesce((r->>'ok')::boolean,false) then raise exception '1: bl yozilmadi: %', r; end if;
  if (select summa from public.t2_akt_qator where akt_id=(r->>'akt_id')::bigint) is not null then raise exception '1b: narx_yoq bl summasi NULL emas'; end if;
  select * into h from public.t2_qator_holat where qator_id=rs;
  if h.fakt_manbasi <> 'BL_NORMA' or h.fakt_hajm <> 8 or h.fakt_summa <> 40 then raise exception '1c: rs hosila noto''g''ri: % % %', h.fakt_manbasi, h.fakt_hajm, h.fakt_summa; end if;

  -- 2) rs oddiy manba bilan (yoki manbasiz) — avvalgidek rad.
  r := public.t2_fakt_yoz_v2(o,current_date,jsonb_build_array(jsonb_build_object('qator_id',rs,'hajm',1)),a,gen_random_uuid(),'acceptance');
  if r->>'code' <> 'FAKT_DERIVED_OR_ROLLUP_LINE' then raise exception '2: manbasiz rs qabul qilindi: %', r; end if;
  r := public.t2_fakt_yoz_v2(o,current_date,jsonb_build_array(jsonb_build_object('qator_id',rs,'hajm',1,'narx',5,'narx_manba','smeta')),a,gen_random_uuid(),'acceptance');
  if r->>'code' <> 'FAKT_DERIVED_OR_ROLLUP_LINE' then raise exception '2b: smeta manbali rs qabul qilindi: %', r; end if;

  -- 3) rs «Fakt = F2» (f2_sertifikat, F2 narxi 7): 6 h -> rs DIRECT 6 × 7 = 42; hosila (40) QO'SHILMAYDI.
  r := public.t2_fakt_yoz_v2(o,current_date,jsonb_build_array(
         jsonb_build_object('qator_id',rs,'hajm',6,'narx',7,'narx_manba','f2_sertifikat','narx_izoh','acceptance'),
         jsonb_build_object('qator_id',mat,'hajm',2,'narx',45,'narx_manba','f2_sertifikat')),a,gen_random_uuid(),'acceptance');
  if not coalesce((r->>'ok')::boolean,false) then raise exception '3: rs f2_sertifikat yozilmadi: %', r; end if;
  if (r->>'jami')::numeric <> 6*7 + 2*45 then raise exception '3b: hujjat jami % (kutilgan 132)', r->>'jami'; end if;
  select * into h from public.t2_qator_holat where qator_id=rs;
  if h.fakt_manbasi <> 'DIRECT' or h.fakt_hajm <> 6 or h.fakt_summa <> 42 then raise exception '3c: rs ikki marta sanaldi / noto''g''ri: % % %', h.fakt_manbasi, h.fakt_hajm, h.fakt_summa; end if;
  if (select narx_manba from public.t2_akt_qator where akt_id=(r->>'akt_id')::bigint and qator_id=rs) <> 'f2_sertifikat' then raise exception '3d: narx manbasi saqlanmadi'; end if;
  -- Boshqa rs (o'z fakti yo'q) hosilada qoladi: 4 × 1 = 4 h, 4 × 8 = 32.
  select * into h from public.t2_qator_holat where qator_id=rs2;
  if h.fakt_manbasi <> 'BL_NORMA' or h.fakt_summa <> 32 then raise exception '3e: rs2 hosila buzildi: % %', h.fakt_manbasi, h.fakt_summa; end if;
  -- Obyekt bo'yicha rs fakt jami = 42 + 32 (40 hosila sanalmaydi).
  select sum(fakt_summa) into v from public.t2_qator_holat where obyekt_id=o and tur='rs';
  if v <> 74 then raise exception '3f: rs fakt jami % (kutilgan 74)', v; end if;

  -- 4) Manfiy rs hajmi (tuzatish) f2_sertifikat bilan: 6 − 1 = 5 h, 5 × 7 = 35.
  r := public.t2_fakt_yoz_v2(o,current_date,jsonb_build_array(jsonb_build_object('qator_id',rs,'hajm',-1,'narx',7,'narx_manba','f2_sertifikat')),a,gen_random_uuid(),'acceptance');
  if not coalesce((r->>'ok')::boolean,false) then raise exception '4: manfiy rs rad etildi: %', r; end if;
  select * into h from public.t2_qator_holat where qator_id=rs;
  if h.fakt_hajm <> 5 or h.fakt_summa <> 35 then raise exception '4b: manfiy rs noto''g''ri: % %', h.fakt_hajm, h.fakt_summa; end if;
  -- 0 hajm — avvalgidek rad.
  r := public.t2_fakt_yoz_v2(o,current_date,jsonb_build_array(jsonb_build_object('qator_id',rs,'hajm',0,'narx_manba','f2_sertifikat')),a,gen_random_uuid(),'acceptance');
  if r->>'code' <> 'FAKT_LINE_INVALID' then raise exception '4c: 0 hajm qabul qilindi: %', r; end if;

  -- 5) rz (yig'indi) qatori f2_sertifikat bilan ham rad.
  r := public.t2_fakt_yoz_v2(o,current_date,jsonb_build_array(jsonb_build_object('qator_id',rz,'hajm',1,'narx_manba','f2_sertifikat')),a,gen_random_uuid(),'acceptance');
  if r->>'code' <> 'FAKT_DERIVED_OR_ROLLUP_LINE' then raise exception '5: rz qabul qilindi: %', r; end if;

  -- 6) Asl smeta o'zgarmagan; ruxsatlar yopiq.
  select jsonb_agg(to_jsonb(q) order by q.id) into s2 from public.t2_qator q where q.obyekt_id=o;
  if s1 is distinct from s2 then raise exception '6: asl smeta qatorlari o''zgardi'; end if;
  if has_function_privilege('anon','public.t2_fakt_yoz_v2(bigint,date,jsonb,bigint,uuid,text,text,text)','execute')
     or has_function_privilege('authenticated','public.t2_fakt_yoz_v2(bigint,date,jsonb,bigint,uuid,text,text,text)','execute') then
    raise exception '6b: ruxsat ochiq';
  end if;
end $test$;
select 'FAKT_F2_RS_ACCEPTANCE_PASS' as acceptance;
rollback;
