-- ACCEPTANCE: 20261119000000 (shartnoma oylik paketi) - migratsiya qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture.
-- Tekshiradi: topshirish (versiya 1), operation_id idempotent, qayta topshirish = versiya 2 (arxivda ikkalasi), iz (server hisoblaydi),
-- o'zgarish izi (fakt qo'shildi / F2 versiyasi o'zgardi), tekshir RPC (obyekt + oy), begona kompaniya va noto'g'ri kirishlar rad etiladi.
begin;

do $acc$
declare
  k bigint; ua bigint; ux bigint; o1 bigint; o2 bigint; sh bigint; r jsonb; l jsonb; t jsonb; op uuid; op2 uuid; iz0 jsonb; iz1 jsonb;
  rep text[] := array[]::text[]; v_state text; akt1 bigint; hid bigint; hok boolean := false;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_OYPAKET_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_OYPAKET_O1_', k) returning id into o1;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_OYPAKET_O2_', k) returning id into o2;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('top_adm_' || k, 'admin', 'faol') returning id into ua;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('top_xor_' || k, 'begona', 'faol') returning id into ux;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ua, k, 'admin', 'faol');
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi) values (k, 'TEST-OP-1', false, 'Subpudrat') returning id into sh;
  insert into public.t2_shartnoma_qoshimcha_bog (kompaniya_id, shartnoma_id, obyekt_id, holat) values (k, sh, o1, 'faol'), (k, sh, o2, 'faol');
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat) values (o1, k, 'f2', 'F2-T1', date '2026-03-01', 'qoralama') returning id into akt1;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, oy, holat) values (o1, k, 'fakt', date '2026-03-01', 'tasdiqlangan');

  -- registry qatori (ixtiyoriy: sxema kengaygan bo'lsa SKIP, FAIL emas)
  begin
    insert into public.t2_document_registry (kompaniya_id, loyiha_id, provider, external_file_id, external_parent_id, document_type, status)
    values (k, (select id from public.t2_loyiha where kompaniya_id = k limit 1), 'google_drive', 'test-' || gen_random_uuid(), 'test-parent', 'shartnoma_oylik_paket', 'active')
    returning id into hid;
    hok := hid is not null;
  exception when others then hok := false; rep := rep || ('SKIP registry fixture: ' || sqlerrm);
  end;

  -- 1. Topshirish: versiya 1, iz ikki obyekt
  op := gen_random_uuid();
  r := public.t2_shartnoma_oylik_paket_saqla_v1(ua, k, sh, '2026-03',
    jsonb_build_object('format', 't2-shartnoma-oylik-paket/1', 'fayllar', jsonb_build_array(
      jsonb_build_object('yol', 'Obyekt/F2.xlsx', 'tur', 'f2', 'sha256', repeat('a', 64), 'olcham', 10))),
    case when hok then hid else null end, repeat('b', 64), 1234, op);
  rep := rep || (case when (r->>'ok')::boolean and (r->>'versiya')::int = 1 and (r->>'obyekt_soni')::int = 2
                      then 'OK   topshirildi: versiya 1, 2 obyekt izi' else 'FAIL saqla v1: ' || r::text end);

  -- 1b. operation_id idempotent
  r := public.t2_shartnoma_oylik_paket_saqla_v1(ua, k, sh, '2026-03', '{"fayllar":[]}'::jsonb, null, null, null, op);
  rep := rep || (case when (r->>'versiya')::int = 1 and (select count(*) from public.t2_shartnoma_oylik_paket where shartnoma_id = sh) = 1
                      then 'OK   operation_id idempotent (ikkinchi yozuv yo''q)' else 'FAIL idempotent: ' || r::text end);

  -- 2. Royxat: manifest + iz saqlangan, hozirgi iz saqlanganiga teng (hali o'zgarish yo'q)
  l := public.t2_shartnoma_oylik_paket_royxat_v1(k, ua, sh, '2026-03');
  t := l->'paketlar'->0;
  iz0 := t->'manifest'->'iz';
  rep := rep || (case when jsonb_array_length(l->'paketlar') = 1 and (t->>'versiya')::int = 1 and t->>'oy' = '2026-03' and t->>'shartnoma_raqam' = 'TEST-OP-1'
                           and t->>'zip_sha256' = repeat('b', 64) and (t->>'zip_olcham')::bigint = 1234 and t->>'kim' = 'admin'
                      then 'OK   royxat: manifest, sha256, hajm, kim' else 'FAIL royxat: ' || coalesce(t::text, 'null') end);
  rep := rep || (case when iz0 = t->'hozirgi_iz' then 'OK   o''zgarish yo''q: saqlangan iz = hozirgi iz' else 'FAIL iz teng emas' end);
  rep := rep || (case when jsonb_array_length(iz0) = 2 and (iz0->0->'fakt'->>'soni')::int = 1 and jsonb_array_length(iz0->0->'f2') = 1
                           and (iz0->1->'fakt'->>'soni')::int = 0
                      then 'OK   iz: o1 da 1 fakt + 1 F2, o2 bo''sh' else 'FAIL iz tarkibi: ' || iz0::text end);

  -- 3. O'zgarish izi: yangi fakt akti + F2 versiyasi o'zgardi
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, oy, holat) values (o2, k, 'fakt', date '2026-03-01', 'tasdiqlangan');
  set local session_replication_role = replica;  -- F2 hayot sikli triggerlarini chetlab, faqat izni tekshiramiz
  update public.t2_akt set holat = 'tasdiqlangan', versiya = coalesce(versiya, 1) + 1 where id = akt1;
  set local session_replication_role = origin;
  l := public.t2_shartnoma_oylik_paket_royxat_v1(k, ua, sh, '2026-03');
  iz1 := l->'paketlar'->0->'hozirgi_iz';
  rep := rep || (case when iz1 <> iz0 and (iz1->1->'fakt'->>'soni')::int = 1 and iz1->0->'f2'->0->>'holat' = 'tasdiqlangan'
                      then 'OK   o''zgarish izi: yangi fakt va F2 holati/versiyasi o''zgardi' else 'FAIL o''zgarish izi: ' || iz1::text end);
  -- saqlangan iz o'zgarmagan (muhrlangan)
  rep := rep || (case when l->'paketlar'->0->'manifest'->'iz' = iz0 then 'OK   saqlangan iz muhrlangan' else 'FAIL saqlangan iz o''zgardi' end);

  -- 4. Qayta topshirish = versiya 2, arxivda ikkalasi (yangisi birinchi)
  op2 := gen_random_uuid();
  r := public.t2_shartnoma_oylik_paket_saqla_v1(ua, k, sh, '2026-03', '{"fayllar":[]}'::jsonb, null, null, null, op2);
  l := public.t2_shartnoma_oylik_paket_royxat_v1(k, ua, sh, '2026-03');
  rep := rep || (case when (r->>'versiya')::int = 2 and jsonb_array_length(l->'paketlar') = 2 and (l->'paketlar'->0->>'versiya')::int = 2 and (l->'paketlar'->1->>'versiya')::int = 1
                      then 'OK   qayta topshirish: versiya 2, arxivda ikkalasi' else 'FAIL versiya 2: ' || r::text end);
  rep := rep || (case when (l->'paketlar'->0->'manifest'->'iz') = (l->'paketlar'->0->'hozirgi_iz') then 'OK   v2 izi hozirgi holatga teng (o''zgarmagan)' else 'FAIL v2 iz' end);

  -- 5. Tekshir RPC: obyekt + oy -> eng so'nggi versiya; boshqa oy / begona obyekt bo'sh
  t := public.t2_shartnoma_oylik_paket_tekshir_v1(o1, ua, '2026-03');
  rep := rep || (case when jsonb_array_length(t->'paketlar') = 1 and (t->'paketlar'->0->>'versiya')::int = 2 and t->'paketlar'->0->>'shartnoma_raqam' = 'TEST-OP-1'
                      then 'OK   tekshir: o1 / 2026-03 -> v2' else 'FAIL tekshir: ' || t::text end);
  t := public.t2_shartnoma_oylik_paket_tekshir_v1(o1, ua, '2026-04');
  rep := rep || (case when jsonb_array_length(t->'paketlar') = 0 then 'OK   tekshir: boshqa oy bo''sh' else 'FAIL tekshir boshqa oy' end);

  -- 6. Rad etishlar
  begin
    r := public.t2_shartnoma_oylik_paket_saqla_v1(ux, k, sh, '2026-03', '{"fayllar":[]}'::jsonb, null, null, null, gen_random_uuid());
    rep := rep || ('FAIL begona yozdi: ' || r::text);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || ('OK   begona foydalanuvchi yoza olmaydi (' || v_state || ')');
  end;
  begin
    t := public.t2_shartnoma_oylik_paket_tekshir_v1(o1, ux, '2026-03');
    rep := rep || ('FAIL begona tekshirdi: ' || t::text);
  exception when others then rep := rep || 'OK   begona foydalanuvchi tekshira olmaydi'::text;
  end;
  begin
    l := public.t2_shartnoma_oylik_paket_royxat_v1(k, ux);
    rep := rep || ('FAIL begona royxat: ' || l::text);
  exception when others then rep := rep || 'OK   begona foydalanuvchi royxat ko''rmaydi'::text;
  end;
  r := public.t2_shartnoma_oylik_paket_saqla_v1(ua, k, sh, '2026-13', '{"fayllar":[]}'::jsonb, null, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'OY_INVALID' then 'OK   noto''g''ri oy rad' else 'FAIL oy: ' || r::text end);
  r := public.t2_shartnoma_oylik_paket_saqla_v1(ua, k, sh, '2026-03', '{"x":1}'::jsonb, null, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'MANIFEST_FAYLLAR_INVALID' then 'OK   fayllarsiz manifest rad' else 'FAIL manifest: ' || r::text end);
  r := public.t2_shartnoma_oylik_paket_saqla_v1(ua, k, sh + 999999, '2026-03', '{"fayllar":[]}'::jsonb, null, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'SHARTNOMA_NOT_FOUND' then 'OK   begona shartnoma rad' else 'FAIL shartnoma: ' || r::text end);
  r := public.t2_shartnoma_oylik_paket_saqla_v1(ua, k, sh, '2026-03', '{"fayllar":[]}'::jsonb, 999999999, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'HUJJAT_NOT_FOUND' then 'OK   begona hujjat_id rad' else 'FAIL hujjat: ' || r::text end);
  r := public.t2_shartnoma_oylik_paket_saqla_v1(ua, k, sh, '2026-03', '{"fayllar":[]}'::jsonb, null, 'xyz', null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'SHA256_INVALID' then 'OK   noto''g''ri sha256 rad' else 'FAIL sha: ' || r::text end);

  -- 7. Ruxsat: anon/authenticated chaqira olmaydi
  rep := rep || (case when not has_function_privilege('authenticated', 'public.t2_shartnoma_oylik_paket_saqla_v1(bigint,bigint,bigint,text,jsonb,bigint,text,bigint,uuid)', 'execute')
                           and not has_function_privilege('anon', 'public.t2_shartnoma_oylik_paket_royxat_v1(bigint,bigint,bigint,text)', 'execute')
                           and has_function_privilege('service_role', 'public.t2_shartnoma_oylik_paket_tekshir_v1(bigint,bigint,text)', 'execute')
                      then 'OK   faqat service_role' else 'FAIL grant' end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'ACCEPTANCE_SHARTNOMA_OYLIK_PAKET FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'ACCEPTANCE_SHARTNOMA_OYLIK_PAKET % OK:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;
