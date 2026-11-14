-- Qabul (BEGIN..ROLLBACK, sintetik, o'zi ma'lumot yaratadi): migratsiya qo'llangandan KEYIN ishga tushiriladi. Hech narsa saqlanmaydi.
-- Isbot: (1) norma NULL RS fakti ota BL fakti ulushi bo'yicha; (2) foizli (ota=rz) transport RS bo'lim MAT fakt ulushi bo'yicha;
-- (3) norma NOT NULL RS (eski BL_NORMA) o'zgarmaydi; (4) qo'lda va tasdiqlangan F-2 nusxasi DIRECT qoladi (F-2 qoidasi buzilmaydi);
-- (5) bekor F-2 dan ko'chirilgan eskirgan nusxa hosilaga o'tadi (BL fakti yo'q bo'lsa 0); (6) 3 o'lchov funksiyasi view bilan bir xil;
-- (7) ota to'liq bajarilganda RS fakti = RS smetasi; (8) asl smeta qatorlari o'zgarmaydi; (9) yordamchi ruxsatlari yopiq.
begin;
do $test$
declare
  c bigint; o bigint; rz bigint; bl1 bigint; bl2 bigint; bl3 bigint; bl4 bigint; m1 bigint; m2 bigint;
  rsa bigint; rsb bigint; rst bigint; rss bigint; rss2 bigint; rsk bigint; rsm bigint; rsfull bigint;
  fa bigint; f2b bigint; f2t bigint; h record; s1 jsonb; s2 jsonb; k bigint; v numeric;
begin
  insert into public.t2_kompaniya(nom,kod) values('_TEST_RSH_',gen_random_uuid()::text) returning id into c;
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_RSH_',c) returning id into o;
  insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,tartib) values(o,c,'rz','_TEST_RSH_rz',1) returning id into rz;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_RSH_bl1','m3',10,100,1000,2) returning id into bl1;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_RSH_bl2','m3',4,100,400,3) returning id into bl2;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_RSH_bl3','m3',4,100,400,4) returning id into bl3;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_RSH_bl4','m3',2,100,200,5) returning id into bl4;
  -- norma NULL RS (ota bl1): smeta 20 x 5
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,bl1,'rs','_TEST_RSH_rsa','chel.-soat',20,5,100,6) returning id into rsa;
  -- norma NOT NULL RS (eski BL_NORMA)
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,norma,tartib) values(o,c,bl1,'rs','_TEST_RSH_rsb','chel.-soat',20,5,100,2,7) returning id into rsb;
  -- eskirgan nusxa: norma NULL, ota bl2, bekor F-2 dan ko'chirilgan 6 h
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,bl2,'rs','_TEST_RSH_rss','chel.-soat',8,3,24,8) returning id into rss;
  -- eskirgan nusxa, ota bl3 fakti yo'q
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,bl3,'rs','_TEST_RSH_rss2','chel.-soat',8,3,24,9) returning id into rss2;
  -- tasdiqlangan F-2 nusxasi (eskirgan EMAS): ota bl2
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,bl2,'rs','_TEST_RSH_rsk','chel.-soat',8,3,24,10) returning id into rsk;
  -- qo'lda DIRECT (narx_manba NULL)
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,bl2,'rs','_TEST_RSH_rsm','chel.-soat',8,3,24,11) returning id into rsm;
  -- to'liq bajariladigan ota bl4
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,bl4,'rs','_TEST_RSH_rsfull','chel.-soat',1000,2,2000,12) returning id into rsfull;
  -- bo'lim materiallari va foizli transport (ota = rz)
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'mat','_TEST_RSH_m1','t',2,100,200,13) returning id into m1;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'mat','_TEST_RSH_m2','t',3,100,300,14) returning id into m2;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,norma,tartib) values(o,c,rz,'rs','_TEST_RSH_rst','%',5,10,50,5,15) returning id into rst;
  select jsonb_agg(to_jsonb(q) order by q.id) into s1 from public.t2_qator q where q.obyekt_id=o;

  -- Hujjatlar: bekor F-2 (eskirgan nusxa manbasi), tasdiqlangan F-2, fakt.
  insert into public.t2_akt(obyekt_id,tur,oy,holat,raqam) values(o,'f2','2026-10-01','bekor','ACC-RSH-F2B') returning id into f2b;
  insert into public.t2_akt(obyekt_id,tur,oy,holat,raqam) values(o,'f2','2026-10-01','qoralama','ACC-RSH-F2T') returning id into f2t;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(f2t,rsk,o,6,3);
  update public.t2_akt set holat='tasdiqlangan' where id=f2t;
  insert into public.t2_akt(obyekt_id,tur,oy,holat,raqam) values(o,'fakt','2026-10-02','qoralama','ACC-RSH-FK') returning id into fa;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx,narx_manba) values(fa,bl1,o,5,100,'smeta');                 -- bl1: yarmi
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx,narx_manba) values(fa,bl2,o,4,100,'smeta');                 -- bl2: to'liq
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx,narx_manba) values(fa,bl4,o,2,100,'smeta');                 -- bl4: to'liq
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx,narx_manba) values(fa,m1,o,2,100,'smeta');                  -- mat1 to'liq (200), mat2 fakti yo'q
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx,narx_manba,narx_manba_id) values(fa,rss,o,6,3,'f2_sertifikat',f2b);   -- eskirgan nusxa
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx,narx_manba,narx_manba_id) values(fa,rss2,o,6,3,'f2_sertifikat',f2b);  -- eskirgan nusxa, ota fakti yo'q
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx,narx_manba,narx_manba_id) values(fa,rsk,o,6,3,'f2_sertifikat',f2t);   -- tasdiqlangan F-2 nusxasi
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx,narx_manba) values(fa,rsm,o,5,3,'smeta');                   -- qo'lda

  -- 1) norma NULL RS: 20 x (5/10) = 10 h, 10 x 5 = 50.
  select * into h from public.t2_qator_holat where qator_id=rsa;
  if h.fakt_manbasi <> 'BL_NORMA' or h.fakt_hajm <> 10 or h.fakt_summa <> 50 then raise exception '1: norma NULL rs: % % %', h.fakt_manbasi, h.fakt_hajm, h.fakt_summa; end if;
  -- 3) norma NOT NULL: 5 x 2 = 10 h (o'zgarmagan qoida), 50.
  select * into h from public.t2_qator_holat where qator_id=rsb;
  if h.fakt_manbasi <> 'BL_NORMA' or h.fakt_hajm <> 10 or h.fakt_summa <> 50 then raise exception '3: norma rs buzildi: % % %', h.fakt_manbasi, h.fakt_hajm, h.fakt_summa; end if;
  -- 2) foizli transport: MAT fakt ulushi 200/500 = 0.4 -> 5 x 0.4 = 2 h, 2 x 10 = 20.
  select * into h from public.t2_qator_holat where qator_id=rst;
  if h.fakt_manbasi <> 'BL_NORMA' or h.fakt_hajm <> 2 or h.fakt_summa <> 20 then raise exception '2: foizli rs: % % %', h.fakt_manbasi, h.fakt_hajm, h.fakt_summa; end if;
  -- 4) tasdiqlangan F-2 nusxasi va qo'lda fakt — DIRECT.
  select * into h from public.t2_qator_holat where qator_id=rsk;
  if h.fakt_manbasi <> 'DIRECT' or h.fakt_hajm <> 6 then raise exception '4a: F-2 nusxasi o''zgardi: % %', h.fakt_manbasi, h.fakt_hajm; end if;
  select * into h from public.t2_qator_holat where qator_id=rsm;
  if h.fakt_manbasi <> 'DIRECT' or h.fakt_hajm <> 5 then raise exception '4b: qo''lda fakt o''zgardi: % %', h.fakt_manbasi, h.fakt_hajm; end if;
  -- 5) eskirgan nusxa: bl2 to'liq (4/4) -> RS fakti = smeta 8; ota fakti yo'q -> 0.
  select * into h from public.t2_qator_holat where qator_id=rss;
  if h.fakt_manbasi <> 'BL_NORMA' or h.fakt_hajm <> 8 or h.fakt_hajm <> h.smeta_hajm then raise exception '5a: eskirgan nusxa: % % (smeta %)', h.fakt_manbasi, h.fakt_hajm, h.smeta_hajm; end if;
  select * into h from public.t2_qator_holat where qator_id=rss2;
  if h.fakt_manbasi <> 'BL_NORMA' or h.fakt_hajm <> 0 then raise exception '5b: eskirgan nusxa (ota fakti yo''q): % %', h.fakt_manbasi, h.fakt_hajm; end if;
  -- 7) ota to'liq bajarilganda RS fakti = smeta (norma NULL).
  select * into h from public.t2_qator_holat where qator_id=rsfull;
  if h.fakt_manbasi <> 'BL_NORMA' or h.fakt_hajm <> 1000 or h.fakt_hajm <> h.smeta_hajm then raise exception '7: to''liq bajarilgan ota: % % (smeta %)', h.fakt_manbasi, h.fakt_hajm, h.smeta_hajm; end if;

  -- 6) funksiyalar view bilan bir xil (fakt_hajm / fakt_summa).
  for k in select q.id from public.t2_qator q where q.obyekt_id=o and q.tur='rs' loop
    select fakt_hajm into v from public.t2_qator_holat where qator_id=k;
    if v is distinct from (select x.fakt_hajm from public._t2_fakt_olchov_v1(array[o]) x where x.qator_id=k) then raise exception '6a: _t2_fakt_olchov_v1 farq qator %', k; end if;
    if v is distinct from (select x.fakt_hajm from public._t2_qator_holat_v2(array[o]) x where x.qator_id=k) then raise exception '6b: _t2_qator_holat_v2 farq qator %', k; end if;
  end loop;
  if (select sum(fakt_hajm) from public.t2_qator_holat where obyekt_id=o) is distinct from (select sum(x.fakt_hajm) from public._t2_ortiqcha_olchov_v1(array[o]) x) then raise exception '6c: _t2_ortiqcha_olchov_v1 jami farq'; end if;

  -- 8) asl smeta qatorlari o'zgarmagan.
  select jsonb_agg(to_jsonb(q) order by q.id) into s2 from public.t2_qator q where q.obyekt_id=o;
  if s1 is distinct from s2 then raise exception '8: asl smeta qatorlari o''zgardi'; end if;
  -- 9) yordamchi ruxsatlari yopiq.
  if has_function_privilege('anon','public._t2_rs_hosila_v1(bigint)','EXECUTE') or has_function_privilege('authenticated','public._t2_rs_hosila_v1(bigint)','EXECUTE') then raise exception '9: yordamchi ochiq'; end if;
end
$test$;
rollback;
