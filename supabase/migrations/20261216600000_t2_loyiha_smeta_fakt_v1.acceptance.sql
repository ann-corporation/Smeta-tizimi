-- Acceptance: 20261216600000_t2_loyiha_smeta_fakt_v1 (BEGIN..ROLLBACK; prodga yozuv qolmaydi). Sintetik seed.
begin;
set local statement_timeout = '300s';

do $$
declare ka bigint; kb bigint; oa bigint; ob bigint; q1 bigint; q2 bigint; qb bigint; r jsonb; m1 bigint; m2 bigint; m3 bigint; f jsonb; v_hajm numeric;
begin
  insert into public.t2_kompaniya (nom, kod) values ('ACC LM A', 'ACC_LM_A') returning id into ka;
  insert into public.t2_kompaniya (nom, kod) values ('ACC LM B', 'ACC_LM_B') returning id into kb;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('ACC OB A', ka) returning id into oa;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('ACC OB B', kb) returning id into ob;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx) values (oa, ka, 'rs', 'ACC BETON', 'м3', 10, 1000) returning id into q1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx) values (oa, ka, 'rs', 'ACC BETON 100', '100 м3', 0.5, 90000) returning id into q2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx) values (ob, kb, 'rs', 'ACC B QATOR', 'м3', 1, 1) returning id into qb;

  -- 1. Birlik koeffitsiyenti
  if public._t2_lm_norm(2, '100 м3') <> 200 or public._t2_lm_norm(1.5, 'т') <> 1500 or public._t2_lm_norm(null, 'м3') is not null
     or public._t2_lm_norm(3, 'xyz') is not null then raise exception 'ACCEPT: birlik normallashtirish xato'; end if;

  -- 2. Yozish: hammasi taklif; tenant izolyatsiya (boshqa kompaniya obyektiga yozib bo'lmaydi)
  r := public._t2_lm_yoz_ich(ka, oa, 'KR-5', 0, null,
    '[{"nom":"Beton B25","belgi":"P1","birlik":"m3","miqdor":10,"tur":"beton"},{"nom":"Beton B15","belgi":"P2","birlik":"m3","miqdor":4,"tur":"beton"},{"nom":"Narxsiz","belgi":"P3","birlik":"t","tur":"armatura"}]'::jsonb,
    1, gen_random_uuid());
  if not (r->>'ok')::boolean or (r->>'yangi')::int <> 3 then raise exception 'ACCEPT: yozish %', r; end if;
  r := public._t2_lm_yoz_ich(ka, ob, 'KR-5', 0, null, '[{"nom":"x","birlik":"m3","miqdor":1}]'::jsonb, 1, null);
  if (r->>'ok')::boolean then raise exception 'ACCEPT: boshqa kompaniya obyektiga yozildi'; end if;
  if (select count(*) from public.t2_loyiha_miqdor where kompaniya_id = kb) <> 0 then raise exception 'ACCEPT: tenant oqib ketdi'; end if;
  if (public._t2_lm_royxat_ich(kb, oa)->'miqdorlar') <> '[]'::jsonb then raise exception 'ACCEPT: royxat boshqa kompaniyaga ochiq'; end if;
  select id into m1 from public.t2_loyiha_miqdor where kompaniya_id = ka and belgi = 'P1';
  select id into m2 from public.t2_loyiha_miqdor where kompaniya_id = ka and belgi = 'P2';
  select id into m3 from public.t2_loyiha_miqdor where kompaniya_id = ka and belgi = 'P3';
  if (select miqdor from public.t2_loyiha_miqdor where id = m3) is not null then raise exception 'ACCEPT: noma''lum miqdor NULL bo''lishi kerak'; end if;

  -- 3. Tasdiqlanmagan (taklif) hisobga kirmaydi
  f := public._t2_lm_farq_ich(ka, oa);
  if jsonb_array_length(f->'miqdorlar') <> 0 or (f->>'taklif_soni')::int <> 3 or (f->>'tasdiqlangan_soni')::int <> 0 then raise exception 'ACCEPT: taklif hisobga kirib ketdi %', f; end if;

  -- 4. Tasdiq + bog'lash (boshqa kompaniya qatori rad etiladi) -> farq birlik koeffitsiyenti bilan
  r := public._t2_lm_tasdiq_ich(kb, array[m1, m2], 'tasdiqlangan', 1);
  if (r->>'yangilandi')::int <> 0 then raise exception 'ACCEPT: boshqa kompaniya tasdiqladi'; end if;
  perform public._t2_lm_tasdiq_ich(ka, array[m1, m2], 'tasdiqlangan', 1);
  r := public._t2_lm_boglash_ich(ka, m1, qb, 0.9, 'x', 'qosh', 1);
  if (r->>'ok')::boolean then raise exception 'ACCEPT: boshqa tenant qatoriga bog''landi'; end if;
  r := public._t2_lm_boglash_ich(ka, m1, q1, 0.9, 'sinov', 'qosh', 1);
  if not (r->>'ok')::boolean then raise exception 'ACCEPT: boglash %', r; end if;
  perform public._t2_lm_boglash_ich(ka, m2, q2, 0.5, 'sinov', 'qosh', 1);   -- smeta 0.5 x 100 m3 = 50 m3
  f := public._t2_lm_farq_ich(ka, oa);
  if jsonb_array_length(f->'miqdorlar') <> 2 then raise exception 'ACCEPT: tasdiqlangan 2 ta bo''lishi kerak %', f; end if;
  select (x->'boglar'->0->>'hajm_norm')::numeric into v_hajm from jsonb_array_elements(f->'miqdorlar') x where (x->>'miqdor_id')::bigint = m2;
  if v_hajm <> 50 then raise exception 'ACCEPT: 100 m3 koeffitsiyenti ishlamadi: %', v_hajm; end if;

  -- 5. Qaror manbani yozadi va asl smeta qatoriga TEGMAYDI
  select hajm into v_hajm from public.t2_qator where id = q1;
  r := public._t2_lm_qaror_ich(ka, m1, 'etibor_yoq', q1, null, null, 'x', 1);
  if (r->>'ok')::boolean then raise exception 'ACCEPT: qisqa sabab o''tib ketdi'; end if;
  r := public._t2_lm_qaror_ich(ka, m1, 'etibor_yoq', q1, null, null, 'loyiha xatosi', 1);
  if not (r->>'ok')::boolean then raise exception 'ACCEPT: qaror %', r; end if;
  if not exists (select 1 from public.t2_loyiha_qaror where miqdor_id = m1 and manba_varaq = 'KR-5' and manba_revizya = 0 and manba_belgi = 'P1') then
    raise exception 'ACCEPT: qaror manbasi yozilmadi'; end if;
  if (select hajm from public.t2_qator where id = q1) is distinct from v_hajm or (select count(*) from public.t2_qator where obyekt_id = oa) <> 2 then
    raise exception 'ACCEPT: asl smeta o''zgargan'; end if;
  r := public._t2_lm_qaror_ich(kb, m1, 'zamena', null, null, null, null, 1);
  if (r->>'ok')::boolean then raise exception 'ACCEPT: boshqa kompaniya qaror yozdi'; end if;

  -- 6. Yangi revizya: o'zgarmagan - tasdiq ko'chadi; o'zgargan - eskirgan belgisi, qaror eskiradi; yo'qolgan - olingan
  r := public._t2_lm_yoz_ich(ka, oa, 'KR-5', 0, null, '[{"nom":"x","birlik":"m3","miqdor":1}]'::jsonb, 1, null);
  if (r->>'ok')::boolean then raise exception 'ACCEPT: eski revizya raqami o''tib ketdi'; end if;
  r := public._t2_lm_yoz_ich(ka, oa, 'KR-5', 1, null,
    '[{"nom":"Beton B25","belgi":"P1","birlik":"m3","miqdor":12,"tur":"beton"},{"nom":"Beton B15","belgi":"P2","birlik":"m3","miqdor":4,"tur":"beton"}]'::jsonb, 1, gen_random_uuid());
  if (r->>'ozgargan')::int <> 1 or (r->>'ayni')::int <> 1 or (r->>'olingan')::int <> 1 then raise exception 'ACCEPT: revizya farqi %', r; end if;
  if not (select eskirgan from public.t2_loyiha_qaror where miqdor_id = m1) then raise exception 'ACCEPT: qaror eskirmadi'; end if;
  if not exists (select 1 from public.t2_loyiha_miqdor where kompaniya_id = ka and belgi = 'P1' and revizya = 1 and oldingi_miqdor = 10 and holat = 'taklif') then
    raise exception 'ACCEPT: o''zgargan qator qayta tasdiq kutmayapti'; end if;
  if not exists (select 1 from public.t2_loyiha_miqdor where kompaniya_id = ka and belgi = 'P2' and revizya = 1 and holat = 'tasdiqlangan') then
    raise exception 'ACCEPT: o''zgarmagan tasdiq ko''chmadi'; end if;
  f := public._t2_lm_farq_ich(ka, oa);
  if jsonb_array_length(f->'miqdorlar') <> 1 then raise exception 'ACCEPT: eskirgan/taklif qator hisobda %', f; end if;
end $$;

-- 7. RPC lar service_role dan boshqaga yopiq; a'zosiz actor kira olmaydi; RLS
do $$
declare fn text;
begin
  foreach fn in array array['t2_loyiha_yoz_v1','t2_loyiha_tasdiq_v1','t2_loyiha_boglash_v1','t2_loyiha_qaror_v1','t2_loyiha_farq_v1','t2_loyiha_royxat_v1','t2_loyiha_smeta_v1'] loop
    if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fn and has_function_privilege('anon', p.oid, 'execute')) then
      raise exception 'ACCEPT: % anon uchun ochiq', fn; end if;
  end loop;
  begin
    perform public.t2_loyiha_royxat_v1(-1, -1, null);
    raise exception 'ACCEPT: a''zosiz actor o''tib ketdi';
  exception when sqlstate '42501' or sqlstate '22023' then null; end;
  if (select count(*) from pg_class where relname in ('t2_loyiha_miqdor','t2_loyiha_moslik','t2_loyiha_qaror') and relrowsecurity) <> 3 then raise exception 'ACCEPT: RLS'; end if;
end $$;

rollback;
