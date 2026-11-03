-- Qabul (BEGIN..ROLLBACK, o'zi sintetik ma'lumot yaratadi; prodda iz qolmaydi).
-- Tekshiradi: ruxsatlar katalogi/rollar, grantlar; birlik yaratish, narx o'zgartirish (sabab majburiy), telefon bo'yicha dublikatsiz mijoz,
-- bron qulfi (ikkinchi bron rad), muddati o'tgan bron bo'shashi, shartnoma → sotilgan, grafik Σ tekshiruvi, to'lov FIFO, panel qarz yoshi,
-- bekor → birlik bo'shaydi, idempotentlik.
begin;
do $t$
declare v_komp bigint; v_actor bigint; v_loy bigint; v_ob bigint; r jsonb; b1 bigint; b2 bigint; u1 bigint; u2 bigint; br bigint; v int; op uuid := gen_random_uuid();
  t text := 'ACC-' || to_char(clock_timestamp(), 'HH24MISSUS');
begin
  if not ('sales.read' = any(public.t2_permission_catalog_v2())) then raise exception 'ACCEPT_FAIL: katalog'; end if;
  if not ('sales.write' = any(public.t2_role_permissions_v2('sotuvchi'))) or 'sales.price' = any(public.t2_role_permissions_v2('sotuvchi')) then raise exception 'ACCEPT_FAIL: sotuvchi'; end if;
  if not ('sales.read' = any(public.t2_role_permissions_v2('rahbar'))) or 'sales.write' = any(public.t2_role_permissions_v2('rahbar')) then raise exception 'ACCEPT_FAIL: rahbar'; end if;
  if not ('sales.payment' = any(public.t2_role_permissions_v2('bugalter'))) then raise exception 'ACCEPT_FAIL: bugalter'; end if;
  if not ('f2.approve' = any(public.t2_role_permissions_v2('pto'))) or 'f2.approve' = any(public.t2_role_permissions_v2('bugalter')) then raise exception 'ACCEPT_FAIL: mavjud rollar o''zgardi'; end if;
  if exists (select 1 from pg_proc p where p.proname = 't2_ish_joyi_taklif_yarat_v1' and position('sotuvchi' in pg_get_functiondef(p.oid)) = 0) then
    raise exception 'ACCEPT_FAIL: taklif rollari'; end if;
  if has_function_privilege('anon', 'public.t2_sotuv_bitim_saqla_v1(bigint,bigint,jsonb,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_sotuv_panel_v1(bigint,bigint,bigint)', 'execute')
     or has_table_privilege('anon', 'public.t2_sotuv_mijoz', 'select') then raise exception 'ACCEPT_FAIL: grant'; end if;

  select a.kompaniya_id, a.foydalanuvchi_id into v_komp, v_actor from public.t2_azolik a where a.rol = 'boss' and a.holat = 'faol' order by a.id limit 1;
  if v_komp is null then raise notice 'boss topilmadi — funksional qism o''tkazib yuborildi'; return; end if;
  insert into public.t2_loyiha (kompaniya_id, nom) values (v_komp, t) returning id into v_loy;
  insert into public.t2_obyekt (nom, kompaniya_id, loyiha_id) values (t || ' blok', v_komp, v_loy) returning id into v_ob;

  r := public.t2_sotuv_birlik_saqla_v1(v_komp, v_actor, v_ob, '[{"raqam":"1","qavat":1,"xona_soni":2,"maydon":60,"narx_m2":10000000},
     {"raqam":"2","qavat":1,"xona_soni":3,"maydon":80,"narx_m2":10000000},{"raqam":"3","qavat":2,"maydon":50}]', gen_random_uuid());
  if (r->>'yangi')::int <> 3 then raise exception 'ACCEPT_FAIL: birlik %', r; end if;
  select id into u1 from public.t2_sotuv_birlik where obyekt_id = v_ob and raqam = '1';
  select id into u2 from public.t2_sotuv_birlik where obyekt_id = v_ob and raqam = '2';
  r := public.t2_sotuv_narx_ozgartir_v1(v_komp, v_actor, array[u1, u2], 'foiz', 10, 'acceptance', gen_random_uuid());
  if (r->>'ozgardi')::int <> 2 or (select narx_m2 from public.t2_sotuv_birlik where id = u1) <> 11000000 then raise exception 'ACCEPT_FAIL: narx %', r; end if;
  r := public.t2_sotuv_narx_ozgartir_v1(v_komp, v_actor, array[u1], 'foiz', 5, '', gen_random_uuid());
  if r->>'code' <> 'SABAB_REQUIRED' then raise exception 'ACCEPT_FAIL: sabab %', r; end if;

  r := public.t2_sotuv_bitim_saqla_v1(v_komp, v_actor, '{"manba":"telegram","mijoz":{"fio":"Sintetik Xaridor","telefon":"+998 00 000-00-01","rozilik":true}}', gen_random_uuid());
  b1 := (r->>'id')::bigint;
  r := public.t2_sotuv_bitim_saqla_v1(v_komp, v_actor, '{"manba":"olx","mijoz":{"fio":"Sintetik 2","telefon":"000000001"}}', gen_random_uuid());
  b2 := (r->>'id')::bigint;
  if (select count(*) from public.t2_sotuv_mijoz where kompaniya_id = v_komp and telefon_norm = '998000000001') <> 1 then raise exception 'ACCEPT_FAIL: dublikat mijoz'; end if;

  r := public.t2_sotuv_bron_v1(v_komp, v_actor, b1, u1, 48, null, gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: bron %', r; end if; br := (r->>'id')::bigint;
  r := public.t2_sotuv_bron_v1(v_komp, v_actor, b2, u1, 48, null, gen_random_uuid());
  if r->>'code' <> 'BIRLIK_BAND' then raise exception 'ACCEPT_FAIL: qulf %', r; end if;
  update public.t2_sotuv_bron set boshlandi = now() - interval '3 day', tugaydi = now() - interval '1 hour' where id = br;
  r := public.t2_sotuv_shaxmatka_v1(v_komp, v_actor, v_ob);
  if (select e->>'holat' from jsonb_array_elements(r->'birliklar') e where (e->>'id')::bigint = u1) <> 'bosh' then raise exception 'ACCEPT_FAIL: muddat %', r; end if;
  r := public.t2_sotuv_bron_v1(v_komp, v_actor, b2, u1, 48, null, gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: qayta bron %', r; end if;

  select versiya into v from public.t2_sotuv_bitim where id = b2;
  r := public.t2_sotuv_bitim_saqla_v1(v_komp, v_actor, jsonb_build_object('id', b2, 'kutilgan_versiya', v, 'bosqich', 'shartnoma', 'tolov_turi', 'muddatli'), gen_random_uuid());
  if r->>'ok' <> 'true' or (select holat from public.t2_sotuv_birlik where id = u1) <> 'sotilgan' then raise exception 'ACCEPT_FAIL: shartnoma %', r; end if;
  r := public.t2_sotuv_grafik_saqla_v1(v_komp, v_actor, b2, jsonb_build_array(
         jsonb_build_object('sana', (current_date - 60)::text, 'summa', 200000000, 'tur', 'boshlangich'),
         jsonb_build_object('sana', (current_date - 30)::text, 'summa', 230000000),
         jsonb_build_object('sana', (current_date + 400)::text, 'summa', 230000000)), gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: grafik %', r; end if;
  r := public.t2_sotuv_grafik_saqla_v1(v_komp, v_actor, b2, '[{"sana":"2026-01-01","summa":1}]', gen_random_uuid());
  if r->>'code' <> 'JAMI_MOS_EMAS' then raise exception 'ACCEPT_FAIL: grafik Σ %', r; end if;
  r := public.t2_sotuv_tolov_yoz_v1(v_komp, v_actor, b2, current_date, 250000000, 'tolov', 'bank', null, null, gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: tolov %', r; end if;
  r := public.t2_sotuv_bitim_v1(v_komp, v_actor, b2);
  if (r->'jami'->>'qoldiq')::numeric <> 410000000 or (r->'jami'->>'muddati_otgan')::numeric <> 180000000 then raise exception 'ACCEPT_FAIL: FIFO %', r->'jami'; end if;
  r := public.t2_sotuv_panel_v1(v_komp, v_actor, v_loy);
  if (r->'zaxira'->>'sotilgan')::int <> 1 or (r->'qarz'->>'muddati_otgan')::numeric <> 180000000 or (r->>'tushum')::numeric <> 250000000 then
    raise exception 'ACCEPT_FAIL: panel %', r; end if;

  select versiya into v from public.t2_sotuv_bitim where id = b2;
  r := public.t2_sotuv_bitim_saqla_v1(v_komp, v_actor, jsonb_build_object('id', b2, 'kutilgan_versiya', v, 'bosqich', 'bekor', 'bekor_sabab', 'acceptance'), gen_random_uuid());
  if r->>'ok' <> 'true' or (select holat from public.t2_sotuv_birlik where id = u1) <> 'bosh' then raise exception 'ACCEPT_FAIL: bekor %', r; end if;

  r := public.t2_sotuv_bitim_saqla_v1(v_komp, v_actor, '{"mijoz":{"fio":"Sintetik 3","telefon":"000000002"}}', op);
  r := public.t2_sotuv_bitim_saqla_v1(v_komp, v_actor, '{"mijoz":{"fio":"Sintetik 3","telefon":"000000002"}}', op);
  if r->>'takror' <> 'true' then raise exception 'ACCEPT_FAIL: idempotent %', r; end if;
  raise notice 'ACCEPT_OK uy_sotuv_v1';
end $t$;
rollback;
