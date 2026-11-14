-- Acceptance: 20261217600000_t2_loyiha_tahrir_farq_v1 (BEGIN..ROLLBACK; sintetik seed; JSON tuzilmasi aniq tekshiriladi).
begin;
set local statement_timeout = '300s';

do $$
declare ka bigint; kb bigint; oa bigint; ob bigint; rz bigint; w1 bigint; w2 bigint; ta bigint; tb bigint; r jsonb; m1 bigint; m3 bigint; f jsonb; it jsonb;
  v_hajm numeric; v_narx numeric; v_qn int; n int;
begin
  insert into public.t2_kompaniya (nom, kod) values ('ACC TH A', 'ACC_TH_A') returning id into ka;
  insert into public.t2_kompaniya (nom, kod) values ('ACC TH B', 'ACC_TH_B') returning id into kb;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('ACC TH OB A', ka) returning id into oa;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('ACC TH OB B', kb) returning id into ob;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm) values (oa, ka, 'rz', 'ACC BOLIM (KR-5)', null, null) returning id into rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx, ota_id) values (oa, ka, 'bl', 'ACC BETON', 'м3', 10, 1000, rz) returning id into w1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx, ota_id) values (oa, ka, 'bl', 'ACC ARMATURA', 'Т', 1, 9000, rz) returning id into w2;
  select hajm, narx into v_hajm, v_narx from public.t2_qator where id = w1;
  select count(*) into v_qn from public.t2_qator where obyekt_id = oa;

  -- 1. Ikki tahrir (sintetik): A = eski, B = yangi
  r := public._t2_lm_tahrir_yarat_ich(ka, oa, 'ACC A', date '2026-01-01', 1); ta := (r->>'id')::bigint;
  r := public._t2_lm_tahrir_yarat_ich(ka, oa, 'ACC B', date '2026-02-01', 1); tb := (r->>'id')::bigint;
  if ta is null or tb is null or (public._t2_lm_tahrir_yarat_ich(ka, oa, 'ACC A', null, 1)->>'qayta')::boolean is not true then raise exception 'ACCEPT: tahrir yaratish %', r; end if;
  r := public._t2_lm_tahrir_yarat_ich(ka, ob, 'X', null, 1);
  if (r->>'ok')::boolean then raise exception 'ACCEPT: boshqa kompaniya obyektida tahrir ochildi'; end if;

  r := public._t2_lm_tahrir_yoz_ich(ka, oa, ta, 'KR-5', 0, null,
    '[{"nom":"Beton B25","belgi":"P1","birlik":"m3","miqdor":10,"tur":"beton"},{"nom":"Beton B15","belgi":"P2","birlik":"m3","miqdor":4,"tur":"beton"},{"nom":"Armatura","belgi":"S","birlik":"kg","miqdor":1000,"tur":"armatura"}]'::jsonb,
    1, gen_random_uuid());
  if not (r->>'ok')::boolean then raise exception 'ACCEPT: A KR-5 %', r; end if;
  r := public._t2_lm_tahrir_yoz_ich(ka, oa, ta, 'KR-7', 0, null, '[{"nom":"Beton B20","belgi":"Q1","birlik":"m3","miqdor":8,"tur":"beton"}]'::jsonb, 1, gen_random_uuid());
  if not (r->>'ok')::boolean then raise exception 'ACCEPT: A KR-7 %', r; end if;
  select id into m1 from public.t2_loyiha_miqdor where kompaniya_id = ka and tahrir_id = ta and belgi = 'P1';
  select id into m3 from public.t2_loyiha_miqdor where kompaniya_id = ka and tahrir_id = ta and belgi = 'S';
  perform public._t2_lm_tasdiq_ich(ka, array[m1, m3], 'tasdiqlangan', 1);
  perform public._t2_lm_boglash_ich(ka, m1, w1, 0.9, 'sinov', 'qosh', 1);
  perform public._t2_lm_boglash_ich(ka, m3, w2, 0.9, 'sinov', 'qosh', 1);

  -- 2. Smeta asosi bitta; boshqa kompaniya o'rnata olmaydi
  perform public._t2_lm_tahrir_asos_ich(ka, oa, ta);
  perform public._t2_lm_tahrir_asos_ich(ka, oa, tb);
  select count(*) into n from public.t2_loyiha_tahrir where obyekt_id = oa and smeta_asosi;
  if n <> 1 then raise exception 'ACCEPT: asos bittadan ko''p %', n; end if;
  perform public._t2_lm_tahrir_asos_ich(ka, oa, ta);
  if not (select smeta_asosi from public.t2_loyiha_tahrir where id = ta) then raise exception 'ACCEPT: asos A emas'; end if;
  r := public._t2_lm_tahrir_asos_ich(kb, oa, tb);
  if (r->>'ok')::boolean then raise exception 'ACCEPT: boshqa kompaniya asos o''rnatdi'; end if;

  -- 3. B tahrir: KR-5 (P1 10->12, P2 o'zgarmagan, S olingan, P4 yangi), KR-7 yo'q, KR-9 yangi varaq
  r := public._t2_lm_tahrir_yoz_ich(ka, oa, tb, 'KR-5', 1, null,
    '[{"nom":"Beton B25","belgi":"P1","birlik":"m3","miqdor":12,"tur":"beton"},{"nom":"Beton B15","belgi":"P2","birlik":"m3","miqdor":4,"tur":"beton"},{"nom":"Beton B30","belgi":"P4","birlik":"m3","miqdor":3,"tur":"beton"}]'::jsonb,
    1, gen_random_uuid());
  if not (r->>'ok')::boolean then raise exception 'ACCEPT: B KR-5 %', r; end if;
  r := public._t2_lm_tahrir_yoz_ich(ka, oa, tb, 'KR-9', 0, null, '[{"nom":"Beton B20","belgi":"R1","birlik":"100 m3","miqdor":0.5,"tur":"beton"}]'::jsonb, 1, gen_random_uuid());
  if not (r->>'ok')::boolean then raise exception 'ACCEPT: B KR-9 %', r; end if;

  -- 4. Farq: tuzilma, holatlar, foiz, bog'langan qator narxi va bo'limi
  f := public._t2_lm_tahrir_farq_ich(ka, oa, ta, tb);
  if f->>'ok' <> 'true' or (f ?& array['eski_id', 'yangi_id', 'varaqlar', 'items', 'qarorlar']) is not true then raise exception 'ACCEPT: farq tuzilmasi %', f; end if;
  if jsonb_array_length(f->'items') <> 5 then raise exception 'ACCEPT: 5 ta o''zgarish kutilgan (P1, S, P4, Q1, R1) %', f->'items'; end if;
  select x into it from jsonb_array_elements(f->'items') x where x->>'belgi' = 'P1';
  if it->>'holat' <> 'ozgargan' or (it->>'foiz')::numeric <> 20 or (it->>'eski_norm')::numeric <> 10 or (it->>'yangi_norm')::numeric <> 12
     or not (it ?& array['varaq', 'kalit', 'nom', 'tur', 'belgi', 'eski_birlik', 'yangi_birlik', 'eski_miqdor', 'yangi_miqdor', 'foiz', 'boglar']) then raise exception 'ACCEPT: P1 elementi %', it; end if;
  if jsonb_array_length(it->'boglar') <> 1 or (it->'boglar'->0->>'narx')::numeric <> 1000 or (it->'boglar'->0->>'bolim_id')::bigint <> rz
     or not (it->'boglar'->0 ?& array['qator_id', 'kod', 'nom', 'birlik', 'hajm', 'narx', 'bolim_id', 'bolim_nom']) then raise exception 'ACCEPT: P1 boglari %', it->'boglar'; end if;
  if (select x->>'holat' from jsonb_array_elements(f->'items') x where x->>'belgi' = 'S') <> 'olingan' then raise exception 'ACCEPT: S olingan emas'; end if;
  if (select x->>'holat' from jsonb_array_elements(f->'items') x where x->>'belgi' = 'P4') <> 'yangi' then raise exception 'ACCEPT: P4 yangi emas'; end if;
  if exists (select 1 from jsonb_array_elements(f->'items') x where x->>'belgi' = 'P2') then raise exception 'ACCEPT: o''zgarmagan P2 ro''yxatda'; end if;
  if (select x->>'holat' from jsonb_array_elements(f->'varaqlar') x where x->>'varaq' = 'KR-7') <> 'olingan_varaq'
     or (select x->>'holat' from jsonb_array_elements(f->'varaqlar') x where x->>'varaq' = 'KR-9') <> 'yangi_varaq'
     or (select x->>'holat' from jsonb_array_elements(f->'varaqlar') x where x->>'varaq' = 'KR-5') <> 'ozgargan' then raise exception 'ACCEPT: varaq holatlari %', f->'varaqlar'; end if;
  if not ((f->'varaqlar'->0) ?& array['varaq', 'eski_soni', 'yangi_soni', 'ozgargan', 'olingan', 'yangi', 'ayni', 'holat']) then raise exception 'ACCEPT: varaqlar kalitlari'; end if;
  select x into it from jsonb_array_elements(f->'items') x where x->>'belgi' = 'R1';
  if (it->>'yangi_norm')::numeric <> 50 or it->'foiz' <> 'null'::jsonb then raise exception 'ACCEPT: R1 koeffitsiyent/foiz %', it; end if;   -- 0.5 x 100 m3 = 50 m3; eski yo'q -> foiz NULL

  -- 5. Qaror yozuvi (smetaga ko'chirish / pereraschet / qoldirish) + asl smeta o'zgarmagan
  r := public._t2_lm_tahrir_qaror_ich(ka, oa, ta, tb, 'KR-5', 'beton|p1|beton b25', 'qoldir', 'x', 1);
  if (r->>'ok')::boolean then raise exception 'ACCEPT: qisqa sabab o''tdi'; end if;
  r := public._t2_lm_tahrir_qaror_ich(ka, oa, ta, tb, 'KR-5', 'beton|p1|beton b25', 'pereraschet', null, 1);
  if not (r->>'ok')::boolean then raise exception 'ACCEPT: qaror %', r; end if;
  r := public._t2_lm_tahrir_qaror_ich(ka, oa, ta, tb, 'KR-5', 'beton|p1|beton b25', 'smetaga_kochir', null, 1);   -- almashtiriladi, ikkilanmaydi
  select count(*) into n from public.t2_loyiha_tahrir_qaror where obyekt_id = oa; if n <> 1 then raise exception 'ACCEPT: qaror ikkilandi %', n; end if;
  f := public._t2_lm_tahrir_farq_ich(ka, oa, ta, tb);
  if jsonb_array_length(f->'qarorlar') <> 1 or f->'qarorlar'->0->>'qaror' <> 'smetaga_kochir' or not (f->'qarorlar'->0 ?& array['varaq', 'kalit', 'qaror', 'sabab', 'yaratildi']) then raise exception 'ACCEPT: qarorlar %', f->'qarorlar'; end if;
  r := public._t2_lm_tahrir_qaror_ich(ka, oa, ta, tb, 'KR-5', 'k', 'xxx', null, 1);
  if (r->>'ok')::boolean then raise exception 'ACCEPT: noto''g''ri qaror turi o''tdi'; end if;
  if (select hajm from public.t2_qator where id = w1) is distinct from v_hajm or (select narx from public.t2_qator where id = w1) is distinct from v_narx
     or (select count(*) from public.t2_qator where obyekt_id = oa) <> v_qn then raise exception 'ACCEPT: asl smeta o''zgargan'; end if;

  -- 6. Begona kompaniya ko'rmaydi (tahrir, farq, ro'yxat, qaror)
  if (public._t2_lm_tahrir_farq_ich(kb, oa, ta, tb)->>'code') <> 'TAHRIR' then raise exception 'ACCEPT: farq boshqa kompaniyaga ochiq'; end if;
  if (public._t2_lm_tahrir_royxat_ich(kb, oa)->'tahrirlar') <> '[]'::jsonb then raise exception 'ACCEPT: royxat boshqa kompaniyaga ochiq'; end if;
  r := public._t2_lm_tahrir_qaror_ich(kb, oa, ta, tb, 'KR-5', 'k', 'pereraschet', null, 1);
  if (r->>'ok')::boolean then raise exception 'ACCEPT: boshqa kompaniya qaror yozdi'; end if;
  r := public._t2_lm_tahrir_yoz_ich(kb, oa, ta, 'KR-5', 5, null, '[{"nom":"x","birlik":"m3","miqdor":1}]'::jsonb, 1, gen_random_uuid());
  if (r->>'ok')::boolean then raise exception 'ACCEPT: boshqa kompaniya miqdor yozdi'; end if;

  -- 7. Ro'yxat tuzilmasi
  r := public._t2_lm_tahrir_royxat_ich(ka, oa);
  if jsonb_array_length(r->'tahrirlar') <> 2 or not ((r->'tahrirlar'->0) ?& array['id', 'nom', 'sana', 'smeta_asosi', 'yaratildi', 'varaq_soni', 'element_soni'])
     or (r->'tahrirlar'->0->>'smeta_asosi')::boolean is not true or (r->'tahrirlar'->0->>'varaq_soni')::int <> 2 or (r->'tahrirlar'->0->>'element_soni')::int <> 4 then raise exception 'ACCEPT: royxat %', r; end if;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['t2_loyiha_tahrir_yarat_v1', 't2_loyiha_tahrir_yoz_v1', 't2_loyiha_tahrir_asos_v1', 't2_loyiha_tahrir_royxat_v1', 't2_loyiha_tahrir_farq_v1', 't2_loyiha_tahrir_qaror_v1'] loop
    if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fn and has_function_privilege('anon', p.oid, 'execute')) then raise exception 'ACCEPT: % anon uchun ochiq', fn; end if;
  end loop;
  begin
    perform public.t2_loyiha_tahrir_royxat_v1(-1, -1, null);
    raise exception 'ACCEPT: a''zosiz actor o''tib ketdi';
  exception when sqlstate '42501' or sqlstate '22023' then null; end;
  if (select count(*) from pg_class where relname in ('t2_loyiha_tahrir', 't2_loyiha_tahrir_qaror') and relrowsecurity) <> 2 then raise exception 'ACCEPT: RLS'; end if;
end $$;

rollback;
