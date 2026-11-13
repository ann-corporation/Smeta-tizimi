-- Acceptance: 20261216610000_t2_loyiha_varaq_xarita_v1 (BEGIN..ROLLBACK; sintetik seed; JSON tuzilmasi aniq tekshiriladi).
begin;
set local statement_timeout = '300s';

do $$
declare ka bigint; kb bigint; oa bigint; ob bigint; b1 bigint; qb bigint; w1 bigint; r jsonb; v_hajm numeric; v_n int;
begin
  insert into public.t2_kompaniya (nom, kod) values ('ACC XR A', 'ACC_XR_A') returning id into ka;
  insert into public.t2_kompaniya (nom, kod) values ('ACC XR B', 'ACC_XR_B') returning id into kb;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('ACC XR OB A', ka) returning id into oa;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('ACC XR OB B', kb) returning id into ob;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm) values (oa, ka, 'rz', 'ACC BOLIM', null, null) returning id into b1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm) values (ob, kb, 'rz', 'ACC B BOLIM', null, null) returning id into qb;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm) values (oa, ka, 'bl', 'ACC ISH', 'м3', 5) returning id into w1;
  select hajm into v_hajm from public.t2_qator where id = w1;

  -- 1. Yozish: javob tuzilmasi
  r := public._t2_lm_xarita_yoz_ich(ka, oa, 'КР-59', b1, 'taklif', 'sinov', 'qosh', 1);
  if r is distinct from jsonb_build_object('ok', true) then raise exception 'ACCEPT: yozish javobi %', r; end if;
  r := public._t2_lm_xarita_yoz_ich(ka, oa, 'КР-59', b1, 'qolda', 'yangi', 'qosh', 1);   -- takror: yangilanadi, ikkilanmaydi
  select count(*) into v_n from public.t2_loyiha_varaq_xarita where obyekt_id = oa; if v_n <> 1 then raise exception 'ACCEPT: takror ikkilandi %', v_n; end if;

  -- 2. Tenant izolyatsiya: boshqa kompaniya obyekti / boshqa tenant bo'limi rad
  r := public._t2_lm_xarita_yoz_ich(ka, ob, 'КР-59', qb, 'qolda', null, 'qosh', 1);
  if r->>'ok' <> 'false' or r->>'code' <> 'OBYEKT' then raise exception 'ACCEPT: boshqa obyekt %', r; end if;
  r := public._t2_lm_xarita_yoz_ich(ka, oa, 'КР-59', qb, 'qolda', null, 'qosh', 1);
  if r->>'ok' <> 'false' or r->>'code' <> 'BOLIM' then raise exception 'ACCEPT: boshqa tenant bo''limi %', r; end if;
  r := public._t2_lm_xarita_yoz_ich(ka, oa, 'КР-60', w1, 'qolda', null, 'qosh', 1);   -- bl ham mumkin (ish qatori bo'lim emas: bl ruxsat)
  if r->>'ok' <> 'true' then raise exception 'ACCEPT: bl bo''lim %', r; end if;

  -- 3. Ro'yxat tuzilmasi (aniq kalitlar) va tenant
  r := public._t2_lm_xarita_royxat_ich(ka, oa);
  if jsonb_typeof(r->'xarita') <> 'array' or jsonb_array_length(r->'xarita') <> 2 or (r->'xarita'->0) ?& array['varaq', 'bolim_qator_id', 'manba'] is not true
     or (r->'xarita'->0->>'varaq') <> 'КР-59' or (r->'xarita'->0->>'manba') <> 'qolda' then raise exception 'ACCEPT: royxat tuzilmasi %', r; end if;
  if (public._t2_lm_xarita_royxat_ich(kb, oa)->'xarita') <> '[]'::jsonb then raise exception 'ACCEPT: royxat boshqa kompaniyaga ochiq'; end if;

  -- 4. Asl smeta o'zgarmaydi; o'chirish
  if (select hajm from public.t2_qator where id = w1) is distinct from v_hajm then raise exception 'ACCEPT: asl smeta o''zgargan'; end if;
  perform public._t2_lm_xarita_yoz_ich(ka, oa, 'КР-59', b1, 'qolda', null, 'ochir', 1);
  select count(*) into v_n from public.t2_loyiha_varaq_xarita where obyekt_id = oa; if v_n <> 1 then raise exception 'ACCEPT: ochirish %', v_n; end if;
end $$;

-- 5. FAKT ustuni: haqiqiy fakt ('fakt' aktlar) tasdiqlangan miqdorga bog'langan smeta qatori bo'yicha o'qiladi; F2 akt sanalmaydi
do $$
declare ka bigint; oa bigint; w bigint; a1 bigint; a3 bigint; m1 bigint; f jsonb; b jsonb;
begin
  insert into public.t2_kompaniya (nom, kod) values ('ACC FK A', 'ACC_FK_A') returning id into ka;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('ACC FK OB', ka) returning id into oa;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm) values (oa, ka, 'bl', 'ACC BETON', '100 м3', 0.1) returning id into w;
  insert into public.t2_akt (obyekt_id, tur, oy, kompaniya_id) values (oa, 'fakt', date '2026-01-01', ka) returning id into a1;
  insert into public.t2_akt (obyekt_id, tur, oy, kompaniya_id) values (oa, 'f2', date '2026-01-01', ka) returning id into a3;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, hajm, kompaniya_id) values (a1, w, oa, 0.12, ka), (a3, w, oa, 7, ka);
  perform public._t2_lm_yoz_ich(ka, oa, 'КР-5', 0, null, '[{"nom":"Beton","belgi":"P1","birlik":"m3","miqdor":10,"tur":"beton"}]'::jsonb, 1, gen_random_uuid());
  select id into m1 from public.t2_loyiha_miqdor where kompaniya_id = ka and belgi = 'P1';
  perform public._t2_lm_tasdiq_ich(ka, array[m1], 'tasdiqlangan', 1);
  perform public._t2_lm_boglash_ich(ka, m1, w, 0.9, 'sinov', 'qosh', 1);
  f := public._t2_lm_farq_ich(ka, oa);
  b := f->'miqdorlar'->0->'boglar'->0;
  if (b->>'fakt')::numeric <> 0.12 or (b->>'fakt_norm')::numeric <> 12 or (b->>'hajm_norm')::numeric <> 10 then raise exception 'ACCEPT: fakt ustuni %', b; end if;
  if not (b ?& array['qator_id', 'kod', 'nom', 'birlik', 'hajm', 'narx', 'hajm_norm', 'fakt', 'fakt_norm']) then raise exception 'ACCEPT: boglar kalitlari %', b; end if;
end $$;
do $$
declare fn text;
begin
  foreach fn in array array['t2_loyiha_xarita_yoz_v1', 't2_loyiha_xarita_v1'] loop
    if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fn and has_function_privilege('anon', p.oid, 'execute')) then raise exception 'ACCEPT: % anon uchun ochiq', fn; end if;
  end loop;
  begin
    perform public.t2_loyiha_xarita_v1(-1, -1, null);
    raise exception 'ACCEPT: a''zosiz actor o''tib ketdi';
  exception when sqlstate '42501' or sqlstate '22023' then null; end;
  if not (select relrowsecurity from pg_class where relname = 't2_loyiha_varaq_xarita') then raise exception 'ACCEPT: RLS'; end if;
end $$;

rollback;
