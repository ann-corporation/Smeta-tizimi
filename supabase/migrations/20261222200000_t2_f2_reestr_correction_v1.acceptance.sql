-- ACCEPTANCE: 20261222200000 (F-2 reestr: korrektirovka asl yozuvni oladi). BEGIN..ROLLBACK; muvaffaqiyat: NOTICE 'F2_REESTR_CORRECTION_PASS'.
-- Sintetik ma'lumot. Tekshiruv: S1 oddiy tasdiq -> 1 avto yozuv; S2 korrektirovkasiz bekor -> avto 'bekor';
-- S3 qo'lda yozuv: bekor-keyin-tasdiq korrektirovka (xato holati) -> bir xil yozuv, raqam/summa/kim saqlanadi, 2-qator yo'q;
-- S4 avto yozuv: shu tartib -> bir xil yozuv, raqam saqlanadi, 2-qator yo'q; S5 tasdiq-keyin-bekor tartibi -> 1 yozuv;
-- S6 korrektirovka ham bekor bo'lsa avto yozuv 'bekor' (osilib qolmaydi).
begin;
create function pg_temp.tr(p_k bigint, p_a bigint, p_u bigint, p_st text) returns void language plpgsql as $f$
declare r jsonb;
begin
  r := public.t2_akt_lifecycle_transition_v1(p_k, p_a, p_st, p_u, (select versiya from public.t2_akt where id = p_a), gen_random_uuid(), 'acc');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL transition % %: %', p_a, p_st, r; end if;
end $f$;
create function pg_temp.ap(p_k bigint, p_a bigint, p_u bigint) returns void language plpgsql as $f$
begin
  perform pg_temp.tr(p_k, p_a, p_u, 'submitted'); perform pg_temp.tr(p_k, p_a, p_u, 'checked'); perform pg_temp.tr(p_k, p_a, p_u, 'approved');
end $f$;
create function pg_temp.mk(p_k bigint, p_o bigint, p_q bigint, p_u bigint, p_oy date, p_tag text) returns bigint language plpgsql as $f$
declare r jsonb;
begin
  r := public.t2_akt_yarat_v2(p_o, p_oy, jsonb_build_array(jsonb_build_object('qator_id', p_q, 'certified_quantity', 1, 'certified_unit_price', 100, 'certified_amount', 100)), p_u, p_tag, gen_random_uuid(), 'acc');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL yarat %: %', p_tag, r; end if;
  return (r->>'akt_id')::bigint;
end $f$;
create function pg_temp.kor(p_k bigint, p_a bigint, p_u bigint) returns bigint language plpgsql as $f$
declare r jsonb;
begin
  r := public.t2_akt_correction_create_v1(p_k, p_u, p_a, gen_random_uuid(), (select versiya from public.t2_akt where id = p_a), null, 'acc', null);
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL korrektirovka %: %', p_a, r; end if;
  return (r->>'replacement_akt_id')::bigint;
end $f$;
do $acc$
declare k bigint; u bigint; o bigint; rz bigint; m1 bigint; sh bigint; a1 bigint; a2 bigint; a3 bigint; a4 bigint; a5 bigint; c2 bigint; c3 bigint; c4 bigint; c5 bigint;
        rid bigint; rid2 bigint; n int;
begin
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_KOR_', gen_random_uuid()::text) returning id into k;
  insert into public.t2_foydalanuvchi(login, ism) values ('_TEST_KOR_' || gen_random_uuid(), '_TEST_') returning id into u;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (u, k, 'admin');
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_KOR_1', k) returning id into o;
  insert into public.t2_shartnoma(kompaniya_id, raqam) values (k, '_TEST_KOR_SH') returning id into sh;
  insert into public.t2_shartnoma_bog(shartnoma_id, obyekt_id) values (sh, o);
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, nom, tartib) values (o, k, 'rz', '_TEST_ RZ', 1) returning id into rz;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja)
    values (o, k, rz, 'mat', 'M1', 'TEST', 'M', 10, 100, 1000, U&'\041C\0410\0422', 2, 1) returning id into m1;

  -- S1: oddiy tasdiq -> 1 avto yozuv
  a1 := pg_temp.mk(k, o, m1, u, date '2027-01-01', 'K-1');
  perform pg_temp.ap(k, a1, u);
  if (select count(*) from public.t2_f2_reestr_jami where akt_id = a1 and holat = 'faol' and kim = 'avto:' || a1) <> 1 then raise exception 'FAIL S1: avto yozuv yo''q'; end if;
  -- S2: korrektirovkasiz bekor -> avto yozuv 'bekor'
  perform pg_temp.tr(k, a1, u, 'cancelled');
  if not exists (select 1 from public.t2_f2_reestr_jami where kim = 'avto:' || a1 and holat = 'bekor') then raise exception 'FAIL S2: bekor belgilanmadi'; end if;

  -- S3: qo'lda yozuv; asl bekor, KEYIN korrektirovka tasdiqlanadi (xato holati)
  a2 := pg_temp.mk(k, o, m1, u, date '2027-02-01', 'K-2');
  insert into public.t2_f2_reestr_jami(kompaniya_id, shartnoma_id, akt_id, raqam, davr, oy, qqssiz, kim)
    values (k, sh, a2, 'M-77', 'MANUAL', date '2027-02-01', 12345, 'actor:' || u) returning id into rid;
  perform pg_temp.ap(k, a2, u);
  c2 := pg_temp.kor(k, a2, u);
  perform pg_temp.tr(k, a2, u, 'cancelled');
  if not exists (select 1 from public.t2_f2_reestr_jami where id = rid and akt_id = a2 and holat = 'faol') then raise exception 'FAIL S3: yozuv bekor payti yetim qilindi'; end if;
  perform pg_temp.ap(k, c2, u);
  if not exists (select 1 from public.t2_f2_reestr_jami where id = rid and akt_id = c2 and holat = 'faol' and raqam = 'M-77' and qqssiz = 12345 and kim = 'actor:' || u and davr = 'MANUAL') then
    raise exception 'FAIL S3: asl yozuv korrektirovkaga o''tmadi / maydonlar o''zgardi'; end if;
  select count(*) into n from public.t2_f2_reestr_jami where shartnoma_id = sh and holat = 'faol' and (akt_id in (a2, c2) or kim = 'avto:' || c2);
  if n <> 1 then raise exception 'FAIL S3: % ta yozuv (1 kutilgan)', n; end if;

  -- S4: avto yozuv; asl bekor, keyin korrektirovka
  a3 := pg_temp.mk(k, o, m1, u, date '2027-03-01', 'K-3');
  perform pg_temp.ap(k, a3, u);
  select id into rid from public.t2_f2_reestr_jami where akt_id = a3 and holat = 'faol';
  if rid is null then raise exception 'FAIL S4: avto yozuv yo''q'; end if;
  c3 := pg_temp.kor(k, a3, u);
  perform pg_temp.tr(k, a3, u, 'cancelled');
  if not exists (select 1 from public.t2_f2_reestr_jami where id = rid and akt_id = a3 and holat = 'faol') then raise exception 'FAIL S4: avto yozuv bekor payti yopildi'; end if;
  perform pg_temp.ap(k, c3, u);
  if not exists (select 1 from public.t2_f2_reestr_jami where id = rid and akt_id = c3 and holat = 'faol') then raise exception 'FAIL S4: avto yozuv ko''chmadi'; end if;
  select count(*) into n from public.t2_f2_reestr_jami where shartnoma_id = sh and holat = 'faol' and (akt_id in (a3, c3) or kim like 'avto:%' || c3);
  if n <> 1 then raise exception 'FAIL S4: % ta yozuv (1 kutilgan)', n; end if;

  -- S5: tasdiq-keyin-bekor tartibi (korrektirovka asl hali tasdiqlangan paytda tasdiqlanadi)
  a4 := pg_temp.mk(k, o, m1, u, date '2027-04-01', 'K-4');
  perform pg_temp.ap(k, a4, u);
  select id into rid from public.t2_f2_reestr_jami where akt_id = a4 and holat = 'faol';
  c4 := pg_temp.kor(k, a4, u);
  perform pg_temp.ap(k, c4, u);
  perform pg_temp.tr(k, a4, u, 'cancelled');
  select count(*) into n from public.t2_f2_reestr_jami where shartnoma_id = sh and holat = 'faol' and (akt_id in (a4, c4) or kim like 'avto:%' || c4);
  if n <> 1 or not exists (select 1 from public.t2_f2_reestr_jami where id = rid and akt_id = c4 and holat = 'faol') then raise exception 'FAIL S5: % ta yozuv / yozuv c4 da emas', n; end if;

  -- S6: asl bekor (yozuv kutadi), korrektirovka ham bekor -> avto yozuv yopiladi
  a5 := pg_temp.mk(k, o, m1, u, date '2027-05-01', 'K-5');
  perform pg_temp.ap(k, a5, u);
  select id into rid from public.t2_f2_reestr_jami where akt_id = a5 and holat = 'faol';
  c5 := pg_temp.kor(k, a5, u);
  perform pg_temp.tr(k, a5, u, 'cancelled');
  perform pg_temp.tr(k, c5, u, 'cancelled');
  if not exists (select 1 from public.t2_f2_reestr_jami where id = rid and holat = 'bekor') then raise exception 'FAIL S6: yozuv yopilmadi'; end if;

  raise notice 'F2_REESTR_CORRECTION_PASS';
end $acc$;
rollback;