-- Qabul (BEGIN..ROLLBACK, sintetik, o'zi ma'lumot yaratadi): migratsiya qo'llangandan KEYIN ishga tushiriladi. Hech narsa saqlanmaydi.
-- Isbot: (1) rs faqat narx_manba='f2_sertifikat' bilan yoziladi; (2) o'z DIRECT fakti bor rs BL_NORMA hosilasi bilan
-- ikki marta sanalmaydi; (3) manfiy rs hajmi ham qabul qilinadi; (4) bl narx_yoq — hajm yoziladi, summa yo'q;
-- (4d-4o) view: F2 dan ko'chirilgan ish ulushi rs hosilasini bermaydi, qo'lda ulush ergashadi; minus F2 qatorlari
-- (bl/mat/rs) aynan yoziladi va yakuniy manfiy fakt to'g'ri hisoblanadi; f2_sertifikatsiz ma'lumotda hosila o'zgarmaydi;
-- (7) F2 qatorma-qator nusxa: har satr aynan (minus, 0 hajmli satr, takroriy qator), iz (manba_akt_qator_id), view va
-- Nakopitelniy jamisi = Σ F2, idempotent takror, ikki marta ko'chirish va noto'g'ri manba rad, qo'lda qoidalar o'zgarmagan;
-- (5) asl smeta qatorlari o'zgarmaydi; (6) ruxsatlar yopiq.
begin;
do $test$
declare c bigint; a bigint; o bigint; rz bigint; bl bigint; rs bigint; rs2 bigint; rs3 bigint; mat bigint; r jsonb; h record; s1 jsonb; s2 jsonb; v numeric;
  o2 bigint; rz2 bigint; bl2 bigint; rs4 bigint;
  o3 bigint; rz3 bigint; bl3 bigint; mat3 bigint; rs5 bigint; f2a bigint; f2b bigint; l1 bigint; l2 bigint; l3 bigint; l4 bigint; l5 bigint; l6 bigint;
  fakt7 bigint; op7 uuid;
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

  -- 4d) 2-qism (view): aralash holat — qo'lda ish fakti (4) + F2 dan ko'chirilgan ish fakti (3, f2_sertifikat).
  --     rs hosilasi faqat qo'lda ulushdan: rs2 (norma 1, narx 8) = 4 h / 32; rs3 (norma 1, narx 2) = 4 h / 8.
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,norma,kat,tartib) values(o,c,bl,'rs','_TEST_FF2RS_rs3','chel.-soat',10,2,20,1,'ЧЕЛ',6) returning id into rs3;
  r := public.t2_fakt_yoz_v2(o,current_date,jsonb_build_array(jsonb_build_object('qator_id',bl,'hajm',3,'narx_yoq',true,'narx_manba','f2_sertifikat')),a,gen_random_uuid(),'acceptance');
  if not coalesce((r->>'ok')::boolean,false) then raise exception '4d: f2_sertifikat bl yozilmadi: %', r; end if;
  if (select fakt_hajm from public.t2_qator_holat where qator_id=bl) <> 7 then raise exception '4e: bl fakti 7 emas'; end if;
  select * into h from public.t2_qator_holat where qator_id=rs2;
  if h.fakt_manbasi <> 'BL_NORMA' or h.fakt_hajm <> 4 or h.fakt_summa <> 32 then raise exception '4f: F2 ulushi rs hosilasini berdi: % % %', h.fakt_manbasi, h.fakt_hajm, h.fakt_summa; end if;
  select * into h from public.t2_qator_holat where qator_id=rs3;
  if h.fakt_hajm <> 4 or h.fakt_summa <> 8 then raise exception '4g: rs3 hosila noto''g''ri: % %', h.fakt_hajm, h.fakt_summa; end if;

  -- 4h) Minus F2 qatorlari aynan (egasi 2026-10-29): manfiy hajm bl/mat/rs uchun qabul; yakuniy fakt manfiy bo'lishi mumkin.
  r := public.t2_fakt_yoz_v2(o,current_date,jsonb_build_array(
         jsonb_build_object('qator_id',mat,'hajm',-5,'narx',45,'narx_manba','f2_sertifikat'),
         jsonb_build_object('qator_id',rs,'hajm',-8,'narx',7,'narx_manba','f2_sertifikat'),
         jsonb_build_object('qator_id',bl,'hajm',-10,'narx_yoq',true,'narx_manba','f2_sertifikat')),a,gen_random_uuid(),'acceptance');
  if not coalesce((r->>'ok')::boolean,false) then raise exception '4h: manfiy F2 qatorlari rad etildi: %', r; end if;
  select * into h from public.t2_qator_holat where qator_id=mat;
  if h.fakt_hajm <> -3 or h.fakt_summa <> -135 or h.f2_mumkin_hajm <> 0 then raise exception '4i: mat manfiy fakt noto''g''ri: % % %', h.fakt_hajm, h.fakt_summa, h.f2_mumkin_hajm; end if;
  select * into h from public.t2_qator_holat where qator_id=rs;
  if h.fakt_manbasi <> 'DIRECT' or h.fakt_hajm <> -3 or h.fakt_summa <> -21 then raise exception '4j: rs manfiy fakt noto''g''ri: % % %', h.fakt_manbasi, h.fakt_hajm, h.fakt_summa; end if;
  -- bl = 4 + 3 − 10 = −3; f2_sertifikat ulushi = 3 − 10 = −7; hosila (−3 − (−7)) × 1 = 4 — qo'lda ulush o'zgarmadi.
  if (select fakt_hajm from public.t2_qator_holat where qator_id=bl) <> -3 then raise exception '4k: bl manfiy fakt noto''g''ri'; end if;
  if (select fakt_summa from public.t2_qator_holat where qator_id=rs2) <> 32 then raise exception '4l: rs2 hosila manfiy F2 dan o''zgardi'; end if;

  -- 4m) f2_sertifikat yozuvi yo'q obyekt (eski ma'lumot): hosila avvalgidek bl fakti × norma.
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_FF2RS_eski',c) returning id into o2;
  insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,tartib) values(o2,c,'rz','_TEST_FF2RS_rz2',1) returning id into rz2;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib) values(o2,c,rz2,'bl','_TEST_FF2RS_bl2','m3',10,2) returning id into bl2;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,norma,kat,tartib) values(o2,c,bl2,'rs','_TEST_FF2RS_rs4','chel.-soat',20,3,60,2,'ЧЕЛ',3) returning id into rs4;
  r := public.t2_fakt_yoz_v2(o2,current_date,jsonb_build_array(jsonb_build_object('qator_id',bl2,'hajm',5)),a,gen_random_uuid(),'acceptance');
  if not coalesce((r->>'ok')::boolean,false) then raise exception '4m: eski obyekt bl yozilmadi: %', r; end if;
  select * into h from public.t2_qator_holat where qator_id=rs4;
  if h.fakt_manbasi <> 'BL_NORMA' or h.fakt_hajm <> 10 or h.fakt_summa <> 30 then raise exception '4n: eski hosila o''zgardi: % % %', h.fakt_manbasi, h.fakt_hajm, h.fakt_summa; end if;
  -- Butun baza: f2_sertifikat fakt yozuvi bo'lmagan ish ostidagi rs hosilasi = bl fakti × norma (oldingi formula).
  select count(*) into v from public.t2_qator_holat hh
    join public.t2_qator q on q.id=hh.qator_id
    join public.t2_qator p on p.id=q.ota_id and p.tur='bl' and p.obyekt_id=q.obyekt_id
  where hh.tur='rs' and q.norma is not null and hh.fakt_manbasi='BL_NORMA'
    and not exists (select 1 from public.t2_akt_qator x join public.t2_akt xa on xa.id=x.akt_id
                    where x.qator_id=p.id and xa.tur='fakt' and xa.holat<>'bekor' and x.narx_manba='f2_sertifikat')
    and hh.fakt_hajm is distinct from coalesce((select sum(x.hajm) from public.t2_akt_qator x join public.t2_akt xa on xa.id=x.akt_id
                    where x.qator_id=p.id and xa.tur='fakt' and xa.holat<>'bekor'),0::numeric) * q.norma;
  if v <> 0 then raise exception '4o: f2_sertifikatsiz % rs qatorida hosila o''zgardi', v; end if;

  -- 7) F2 qatorma-qator NUSXA (manba_akt_qator_id): alohida sintetik obyekt — tasdiqlangan F2 ning har satri aynan.
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_FF2RS_nusxa',c) returning id into o3;
  insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,tartib) values(o3,c,'rz','_TEST_FF2RS_rz3',1) returning id into rz3;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,tartib) values(o3,c,rz3,'bl','_TEST_FF2RS_bl3','m3',10,2) returning id into bl3;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,kat,tartib) values(o3,c,bl3,'mat','_TEST_FF2RS_mat3','t',5,40,200,'МАТ',3) returning id into mat3;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,norma,kat,tartib) values(o3,c,bl3,'rs','_TEST_FF2RS_rs5','chel.-soat',20,5,100,2,'ЧЕЛ',4) returning id into rs5;
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o3,'f2','2026-10-01','qoralama') returning id into f2a;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(f2a,mat3,o3,3,40) returning id into l1;          -- +3 × 40
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(f2a,mat3,o3,-1,40) returning id into l2;         -- minus satr
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx,certified_quantity,certified_amount)
    values(f2a,mat3,o3,1,40,0,15) returning id into l3;                                                                       -- satrning o'zida hajm 0, summa 15
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(f2a,rs5,o3,2,7) returning id into l4;            -- rs aniq
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(f2a,bl3,o3,4,null) returning id into l5;         -- ish, narxsiz
  update public.t2_akt set holat='tasdiqlangan' where id=f2a;
  select coalesce(sum(coalesce(certified_amount,summa)),0) into v from public.t2_akt_qator where akt_id=f2a;                -- Σ F2 = 120 − 40 + 15 + 14 = 109
  if v <> 109 then raise exception '7a: sintetik F2 jami % (kutilgan 109)', v; end if;
  r := public.t2_fakt_yoz_v2(o3,current_date,jsonb_build_array(
         jsonb_build_object('qator_id',mat3,'manba_akt_qator_id',l1,'narx_manba','f2_sertifikat','hajm',999,'narx',1),
         jsonb_build_object('qator_id',mat3,'manba_akt_qator_id',l2,'narx_manba','f2_sertifikat'),
         jsonb_build_object('qator_id',mat3,'manba_akt_qator_id',l3,'narx_manba','f2_sertifikat'),
         jsonb_build_object('qator_id',rs5,'manba_akt_qator_id',l4,'narx_manba','f2_sertifikat'),
         jsonb_build_object('qator_id',bl3,'manba_akt_qator_id',l5,'narx_manba','f2_sertifikat')),a,gen_random_uuid(),'acceptance');
  if not coalesce((r->>'ok')::boolean,false) then raise exception '7b: F2 nusxasi yozilmadi: %', r; end if;
  fakt7 := (r->>'akt_id')::bigint;
  -- Har satr 1:1, aynan (hajm, narx, summa; mijoz yuborgan 999/1 e'tiborsiz) va izi bilan.
  select count(*) into v from public.t2_akt_qator f join public.t2_akt_qator s on s.id=f.manba_akt_qator_id
   where f.akt_id=fakt7 and (f.qator_id<>s.qator_id or f.hajm<>coalesce(s.certified_quantity,s.hajm)
         or f.summa is distinct from coalesce(s.certified_amount,s.summa) or f.narx_manba<>'f2_sertifikat' or f.narx_manba_id<>f2a);
  if v <> 0 then raise exception '7c: % nusxa satri manbadan farq qiladi', v; end if;
  if (select count(*) from public.t2_akt_qator where akt_id=fakt7 and manba_akt_qator_id is not null) <> 5 then raise exception '7d: 5 ta satr emas'; end if;
  if (select hajm from public.t2_akt_qator where akt_id=fakt7 and manba_akt_qator_id=l3) <> 0 then raise exception '7e: 0 hajmli satr yozilmadi'; end if;
  -- Takroriy qatorli va manfiy satrli fakt jamlanishi: view va Nakopitelniy.
  select * into h from public.t2_qator_holat where qator_id=mat3;
  if h.fakt_hajm <> 2 or h.fakt_summa <> 95 or h.f2_summa <> 95 then raise exception '7f: mat3 view fakt % / % (F2 %)', h.fakt_hajm, h.fakt_summa, h.f2_summa; end if;
  select * into h from public.t2_qator_holat where qator_id=rs5;
  if h.fakt_manbasi <> 'DIRECT' or h.fakt_hajm <> 2 or h.fakt_summa <> 14 then raise exception '7g: rs5 % % %', h.fakt_manbasi, h.fakt_hajm, h.fakt_summa; end if;
  select sum(fakt_summa) into v from public.t2_qator_holat where obyekt_id=o3 and tur in ('rs','mat','ob');
  if v <> 109 then raise exception '7h: view fakt jami % (kutilgan 109 = Σ F2)', v; end if;
  r := public.t2_nakopitelniy_v2(o3,a);
  if (r->'jami'->>'fakt_summa')::numeric <> 109 then raise exception '7i: Nakopitelniy fakt jami % (kutilgan 109): %', r->'jami'->>'fakt_summa', r->'jami'; end if;
  -- Qayta yuborish (o'sha operation_id) — takror, yangi hujjat yo'q; yangi operation_id bilan — F2_SOURCE_ALREADY_COPIED.
  select operation_id into op7 from public.t2_akt where id=fakt7;
  r := public.t2_fakt_yoz_v2(o3,current_date,jsonb_build_array(jsonb_build_object('qator_id',mat3,'manba_akt_qator_id',l1,'narx_manba','f2_sertifikat')),a,op7,'acceptance');
  if not coalesce((r->>'takror')::boolean,false) or (r->>'akt_id')::bigint <> fakt7 then raise exception '7j: idempotent takror emas: %', r; end if;
  r := public.t2_fakt_yoz_v2(o3,current_date,jsonb_build_array(jsonb_build_object('qator_id',mat3,'manba_akt_qator_id',l1,'narx_manba','f2_sertifikat')),a,gen_random_uuid(),'acceptance');
  if r->>'code' <> 'F2_SOURCE_ALREADY_COPIED' then raise exception '7k: F2 satri ikki marta ko''chirildi: %', r; end if;
  -- Rad etishlar: bir hujjatda bir manba ikki marta; boshqa qatorning manbasi; f2_sertifikatsiz manba; qoralama F2 manbasi.
  r := public.t2_fakt_yoz_v2(o3,current_date,jsonb_build_array(jsonb_build_object('qator_id',mat3,'manba_akt_qator_id',l2,'narx_manba','f2_sertifikat'),
         jsonb_build_object('qator_id',mat3,'manba_akt_qator_id',l2,'narx_manba','f2_sertifikat')),a,gen_random_uuid(),'acceptance');
  if r->>'code' <> 'DUPLICATE_FAKT_SOURCE_LINE' then raise exception '7l: takror manba qabul qilindi: %', r; end if;
  r := public.t2_fakt_yoz_v2(o3,current_date,jsonb_build_array(jsonb_build_object('qator_id',rs5,'manba_akt_qator_id',l1,'narx_manba','f2_sertifikat')),a,gen_random_uuid(),'acceptance');
  if r->>'code' <> 'F2_SOURCE_LINE_INVALID' then raise exception '7m: boshqa qator manbasi qabul qilindi: %', r; end if;
  r := public.t2_fakt_yoz_v2(o3,current_date,jsonb_build_array(jsonb_build_object('qator_id',mat3,'manba_akt_qator_id',l1,'narx_manba','smeta')),a,gen_random_uuid(),'acceptance');
  if r->>'code' <> 'F2_SOURCE_LINE_INVALID' then raise exception '7n: f2_sertifikatsiz manba qabul qilindi: %', r; end if;
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o3,'f2','2026-10-01','qoralama') returning id into f2b;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(f2b,mat3,o3,1,40) returning id into l6;
  r := public.t2_fakt_yoz_v2(o3,current_date,jsonb_build_array(jsonb_build_object('qator_id',mat3,'manba_akt_qator_id',l6,'narx_manba','f2_sertifikat')),a,gen_random_uuid(),'acceptance');
  if r->>'code' <> 'F2_SOURCE_LINE_INVALID' then raise exception '7o: qoralama F2 manbasi qabul qilindi: %', r; end if;
  -- Qo'lda kiritilgan fakt: eski qoidalar (takror qator, 0 hajm) va ichki «summa_aynan» kaliti e'tiborsiz.
  r := public.t2_fakt_yoz_v2(o3,current_date,jsonb_build_array(jsonb_build_object('qator_id',mat3,'hajm',1),jsonb_build_object('qator_id',mat3,'hajm',2)),a,gen_random_uuid(),'acceptance');
  if r->>'code' <> 'DUPLICATE_FAKT_SOURCE_LINE' then raise exception '7p: qo''lda takror qator qabul qilindi: %', r; end if;
  r := public.t2_fakt_yoz_v2(o3,current_date,jsonb_build_array(jsonb_build_object('qator_id',mat3,'hajm',1,'narx',40,'summa_aynan',999)),a,gen_random_uuid(),'acceptance');
  if not coalesce((r->>'ok')::boolean,false) then raise exception '7q: qo''lda qator yozilmadi: %', r; end if;
  if (select summa from public.t2_akt_qator where akt_id=(r->>'akt_id')::bigint) <> 40 then raise exception '7r: summa_aynan qo''lda qatorga o''tdi'; end if;
  begin
    insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(fakt7,mat3,o3,0,40);
    raise exception '7s: manbasiz 0 hajm CHECK dan o''tdi';
  exception when check_violation then null;
  end;

  -- 5) rz (yig'indi) qatori f2_sertifikat bilan ham rad.
  r := public.t2_fakt_yoz_v2(o,current_date,jsonb_build_array(jsonb_build_object('qator_id',rz,'hajm',1,'narx_manba','f2_sertifikat')),a,gen_random_uuid(),'acceptance');
  if r->>'code' <> 'FAKT_DERIVED_OR_ROLLUP_LINE' then raise exception '5: rz qabul qilindi: %', r; end if;

  -- 6) Asl smeta o'zgarmagan; ruxsatlar yopiq.
  select jsonb_agg(to_jsonb(q) order by q.id) into s2 from public.t2_qator q where q.obyekt_id=o and q.id <> rs3;
  if s1 is distinct from s2 then raise exception '6: asl smeta qatorlari o''zgardi'; end if;
  if has_function_privilege('anon','public.t2_fakt_yoz_v2(bigint,date,jsonb,bigint,uuid,text,text,text)','execute')
     or has_function_privilege('authenticated','public.t2_fakt_yoz_v2(bigint,date,jsonb,bigint,uuid,text,text,text)','execute') then
    raise exception '6b: ruxsat ochiq';
  end if;
end $test$;
select 'FAKT_F2_RS_ACCEPTANCE_PASS' as acceptance;
rollback;
