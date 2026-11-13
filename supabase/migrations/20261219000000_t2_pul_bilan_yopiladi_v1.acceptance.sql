-- Qabul (BEGIN..ROLLBACK, sintetik): 20261219000000_t2_pul_bilan_yopiladi_v1 qo'llangandan KEYIN. Hech narsa saqlanmaydi.
begin;
do $test$
declare c bigint; a bigint; o bigint; rz bigint; f2 bigint; bl_pul bigint; bl_oddiy bigint; bl_qosh bigint; r jsonb; j jsonb; rp jsonb; ro jsonb;
begin
  -- A) predikat: birlik variantlari + narx = 1; narx != 1 va NULL — emas.
  if not (public.t2_pul_bilan_yopiladi_v1('сум', 1) and public.t2_pul_bilan_yopiladi_v1('СУМ', 1) and public.t2_pul_bilan_yopiladi_v1('сўм', 1)
          and public.t2_pul_bilan_yopiladi_v1('so''m', 1) and public.t2_pul_bilan_yopiladi_v1('so‘m', 1) and public.t2_pul_bilan_yopiladi_v1(' Sum ', 1)
          and public.t2_pul_bilan_yopiladi_v1('UZS', 1.0)) then raise exception 'A1: pul birliklari tanilmadi'; end if;
  if public.t2_pul_bilan_yopiladi_v1('сум', 2) or public.t2_pul_bilan_yopiladi_v1('сум', null) or public.t2_pul_bilan_yopiladi_v1('м3', 1)
     or public.t2_pul_bilan_yopiladi_v1(null, 1) then raise exception 'A2: narx != 1 / NULL / jismoniy birlik pul qatori emas'; end if;

  insert into public.t2_kompaniya(nom,kod) values('_TEST_PUL_',gen_random_uuid()::text) returning id into c;
  insert into public.t2_foydalanuvchi(login) values('_TEST_PUL_'||gen_random_uuid()) returning id into a;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol) values(a,c,'pto');
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_PUL_',c) returning id into o;
  insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,tartib) values(o,c,'rz','_TEST_PUL_rz',1) returning id into rz;
  -- pul qatori: birlik «сум», narx 1, hajm = pul; oddiy qator; qo'shimcha qator (asl emas).
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_PUL_pul','сум',1000000,1,1000000,2) returning id into bl_pul;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_PUL_oddiy','м3',10,100,1000,3) returning id into bl_oddiy;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib,qoshimcha) values(o,c,rz,'bl','_TEST_PUL_qosh','м3',5,100,500,4,true) returning id into bl_qosh;
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o,'f2','2026-10-01','qoralama') returning id into f2;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(f2,bl_pul,o,400000,1);
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(f2,bl_oddiy,o,10,100);
  update public.t2_akt set holat='tasdiqlangan' where id=f2;
  -- Absurd baseline (hajm = pul deb olingan): faqat qator darajasida qo'lda qo'yiladi; farqqa kirmasligi kerak.
  update public.t2_akt_qator set baseline_summa = 1e20 where akt_id = f2 and qator_id = bl_pul;
  update public.t2_akt_qator set baseline_summa = 900 where akt_id = f2 and qator_id = bl_oddiy;

  r := public.t2_nakopitelniy_v2(o, a);
  j := r->'jami';
  select e into rp from jsonb_array_elements(r->'qatorlar') e where (e->>'qator_id')::bigint = bl_pul;
  select e into ro from jsonb_array_elements(r->'qatorlar') e where (e->>'qator_id')::bigint = bl_oddiy;

  -- B) pul qatori: farq NULL (0 emas), baseline NULL, pul_bilan = true, bajarilish = yopilgan pul foizi (40.0).
  if rp->>'pul_bilan' <> 'true' then raise exception 'B1: pul_bilan belgisi yo''q: %', rp; end if;
  if jsonb_typeof(rp->'narx_variance_summa') <> 'null' or jsonb_typeof(rp->'jami_baseline_summa') <> 'null' then raise exception 'B2: pul qatorida farq/baseline NULL bo''lishi kerak: %', rp; end if;
  if (rp->>'bajarilish_foiz')::numeric <> 40.0 then raise exception 'B3: pul foizi 40.0 emas: %', rp->>'bajarilish_foiz'; end if;
  -- C) oddiy qator o'zgarmagan: farq = 1000 - 900.
  if ro->>'pul_bilan' <> 'false' or (ro->>'narx_variance_summa')::numeric <> 100 or (ro->>'jami_baseline_summa')::numeric <> 900 then raise exception 'C1: oddiy qator buzildi: %', ro; end if;
  -- D) jami: baseline 1e20 siz = 900; farq = 1000 - 900 = 100; pul qatorlari soni 1.
  if (j->>'baseline_summa')::numeric <> 900 then raise exception 'D1: jami baseline pul qatorini chiqarmadi: %', j->>'baseline_summa'; end if;
  if (j->>'narx_variance_summa')::numeric <> 100 then raise exception 'D2: jami farq 100 emas: %', j->>'narx_variance_summa'; end if;
  if (j->>'pul_bilan_soni')::int <> 1 or (j->>'pul_bilan_summa')::numeric <> 1000000 then raise exception 'D3: pul qatorlari soni/summasi: %', j; end if;
  -- E) smeta juftligi kaliti bor (qiymat podval bo'lmasa NULL = noma'lum).
  if not (j ? 'smeta_asl') or not (j ? 'smeta_joriy') then raise exception 'E1: smeta_asl/smeta_joriy kalitlari yo''q: %', j; end if;
  -- F) smeta (asl) paketi qo'shimcha qatorni o'z ichiga olmaydi; joriy — oladi (podval bor bo'lsa solishtiriladi).
  if j->'smeta_asl' is not null and jsonb_typeof(j->'smeta_asl') = 'object' and jsonb_typeof(j->'smeta_joriy') = 'object'
     and (j->'smeta_joriy'->>'ustamasiz')::numeric < (j->'smeta_asl'->>'ustamasiz')::numeric then raise exception 'F1: joriy asldan kichik: %', j; end if;
  -- G) hamma F2 qatori pul bo'yicha bo'lsa farq NULL: oddiy qator F2 sini o'chiramiz.
  delete from public.t2_akt_qator where akt_id = f2 and qator_id = bl_oddiy;
  j := (public.t2_nakopitelniy_v2(o, a))->'jami';
  if jsonb_typeof(j->'narx_variance_summa') <> 'null' then raise exception 'G1: asos qator yo''q — farq NULL (qo''llanmaydi) bo''lishi kerak: %', j->>'narx_variance_summa'; end if;
  raise notice 'PUL_BILAN_YOPILADI_V1 ACC: ok';
end $test$;
rollback;
