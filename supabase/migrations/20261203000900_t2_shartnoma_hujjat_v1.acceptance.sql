-- ACCEPTANCE: 20261203000900 (shartnoma / DS asl hujjatlari bog'i) - migratsiya qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture.
-- Tekshiradi: shartnomaga va DS ga bog'lash, operation_id idempotentligi, takror bog' yaratilmasligi, tur/DS mosligi, saqlanmagan va begona
-- hujjat/shartnoma/DS rad etilishi, ro'yxat (DS summasi+sanasi, fayllar, bog'lanmaganlar), ajratish (fayl qoladi), begona a'zo rad, grantlar.
begin;

do $acc$
declare
  k bigint; k2 bigint; ua bigint; ux bigint; sh bigint; sh2 bigint; shb bigint; d1 bigint; d2 bigint; db bigint;
  doc1 bigint; doc2 bigint; doc3 bigint; docr bigint; docb bigint; r jsonb; l jsonb; op uuid; bog1 bigint; v_state text;
  rep text[] := array[]::text[];
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_SHHUJJAT_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_SHHUJJAT_BEGONA_', gen_random_uuid()::text, true) returning id into k2;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('shh_adm_' || k, 'admin', 'faol') returning id into ua;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('shh_xor_' || k, 'begona', 'faol') returning id into ux;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ua, k, 'admin', 'faol');
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi, jami_nds_bilan) values (k, 'TEST-SH-1', false, 'Test', 1000) returning id into sh;
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi) values (k, 'TEST-SH-2', false, 'Test') returning id into sh2;
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi) values (k2, 'TEST-SH-B', false, 'Test') returning id into shb;
  insert into public.t2_shartnoma_ds (kompaniya_id, shartnoma_id, raqam, sana, jami_nds_bilan) values (k, sh, 'DS-1', date '2026-01-10', 1500) returning id into d1;
  insert into public.t2_shartnoma_ds (kompaniya_id, shartnoma_id, raqam, sana, jami_nds_bilan) values (k, sh2, 'DS-X', date '2026-01-11', 10) returning id into d2;
  insert into public.t2_shartnoma_ds (kompaniya_id, shartnoma_id, raqam, sana, jami_nds_bilan) values (k2, shb, 'DS-B', date '2026-01-12', 10) returning id into db;

  insert into public.t2_document_registry (kompaniya_id, provider, document_type, status, canonical_storage_status, r2_key, original_filename, mime_type, size_bytes, sha256)
  values (k, 'cloudflare_r2', 'shartnoma', 'active', 'stored', 'docs/test/a', 'asosiy.pdf', 'application/pdf', 100, repeat('a', 64)) returning id into doc1;
  insert into public.t2_document_registry (kompaniya_id, provider, document_type, status, canonical_storage_status, r2_key, original_filename, mime_type, size_bytes, sha256)
  values (k, 'cloudflare_r2', 'shartnoma', 'active', 'stored', 'docs/test/b', 'ds1.pdf', 'application/pdf', 200, repeat('b', 64)) returning id into doc2;
  insert into public.t2_document_registry (kompaniya_id, provider, document_type, status, canonical_storage_status, r2_key, original_filename, mime_type, size_bytes, sha256)
  values (k, 'cloudflare_r2', 'shartnoma', 'active', 'stored', 'docs/test/c', 'boglanmagan.pdf', 'application/pdf', 300, repeat('c', 64)) returning id into doc3;
  insert into public.t2_document_registry (kompaniya_id, provider, document_type, status, canonical_storage_status, original_filename)
  values (k, 'cloudflare_r2', 'shartnoma', 'pending', 'reserved', 'reserved.pdf') returning id into docr;
  insert into public.t2_document_registry (kompaniya_id, provider, document_type, status, canonical_storage_status, r2_key, original_filename)
  values (k2, 'cloudflare_r2', 'shartnoma', 'active', 'stored', 'docs/test/x', 'begona.pdf') returning id into docb;

  -- 1. Shartnomaga bog'lash + idempotentlik
  op := gen_random_uuid();
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, null, doc1, null, 'skan', op);
  bog1 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and (r->>'takror')::boolean = false and bog1 is not null
                           and (select tur from public.t2_shartnoma_hujjat where id = bog1) = 'asosiy'
                      then 'OK   shartnomaga bog''landi (tur=asosiy standart)' else 'FAIL bogla asosiy: ' || r::text end);
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, null, doc1, null, null, op);
  rep := rep || (case when (r->>'id')::bigint = bog1 and (select count(*) from public.t2_shartnoma_hujjat where shartnoma_id = sh) = 1
                      then 'OK   operation_id idempotent' else 'FAIL idempotent: ' || r::text end);
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, null, doc1, 'asosiy', null, gen_random_uuid());
  rep := rep || (case when (r->>'takror')::boolean and (r->>'id')::bigint = bog1 and (select count(*) from public.t2_shartnoma_hujjat where shartnoma_id = sh) = 1
                      then 'OK   takror bog'' yaratilmaydi' else 'FAIL takror: ' || r::text end);

  -- 2. DS ga bog'lash va tur/DS mosligi
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, d1, doc2, null, null, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean and (select tur from public.t2_shartnoma_hujjat where id = (r->>'id')::bigint) = 'ds'
                      then 'OK   DS ga bog''landi (tur=ds)' else 'FAIL bogla ds: ' || r::text end);
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, null, doc3, 'ds', null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'DS_TUR_MOS_EMAS' then 'OK   ds_id siz tur=ds rad' else 'FAIL ds tur: ' || r::text end);
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, d1, doc3, 'ilova', null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'DS_TUR_MOS_EMAS' then 'OK   ds_id bilan tur=ilova rad' else 'FAIL ilova+ds: ' || r::text end);
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, null, doc3, 'xyz', null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'TUR_INVALID' then 'OK   noma''lum tur rad' else 'FAIL tur: ' || r::text end);
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, d2, doc3, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'DS_NOT_FOUND' then 'OK   boshqa shartnoma DS i rad' else 'FAIL boshqa DS: ' || r::text end);
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, db, doc3, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'DS_NOT_FOUND' then 'OK   begona kompaniya DS i rad' else 'FAIL begona DS: ' || r::text end);

  -- 3. Hujjat va shartnoma tekshiruvlari
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, null, docr, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'HUJJAT_SAQLANMAGAN' then 'OK   R2 ga saqlanmagan hujjat rad' else 'FAIL reserved: ' || r::text end);
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, null, docb, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'HUJJAT_NOT_FOUND' then 'OK   begona kompaniya hujjati rad' else 'FAIL begona hujjat: ' || r::text end);
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, shb, null, doc3, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'SHARTNOMA_NOT_FOUND' then 'OK   begona shartnoma rad' else 'FAIL begona shartnoma: ' || r::text end);
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, null, doc3, null, null, null);
  rep := rep || (case when r->>'code' = 'OPERATION_ID_REQUIRED' then 'OK   operation_id majburiy' else 'FAIL op: ' || r::text end);

  -- 4. Ro'yxat
  l := public.t2_shartnoma_hujjat_royxat_v1(k, ua, sh);
  rep := rep || (case when (l->>'ok')::boolean and l->'shartnoma'->>'raqam' = 'TEST-SH-1' and jsonb_array_length(l->'ds') = 1
                           and (l->'ds'->0->>'jami_nds_bilan')::numeric = 1500 and l->'ds'->0->>'sana' = '2026-01-10'
                      then 'OK   ro''yxat: DS summasi va sanasi' else 'FAIL royxat ds: ' || l::text end);
  rep := rep || (case when jsonb_array_length(l->'hujjatlar') = 2 and l->'hujjatlar'->0->>'ds_id' is null and l->'hujjatlar'->0->>'original_filename' = 'asosiy.pdf'
                           and (l->'hujjatlar'->1->>'ds_id')::bigint = d1 and (l->'hujjatlar'->1->>'size_bytes')::bigint = 200 and (l->'hujjatlar'->1->>'saqlangan')::boolean
                      then 'OK   ro''yxat: shartnoma va DS fayllari' else 'FAIL royxat hujjatlar: ' || (l->'hujjatlar')::text end);
  rep := rep || (case when exists (select 1 from jsonb_array_elements(l->'boglanmagan') x where (x->>'document_id')::bigint = doc3)
                           and not exists (select 1 from jsonb_array_elements(l->'boglanmagan') x where (x->>'document_id')::bigint in (doc1, doc2, docr, docb))
                      then 'OK   ro''yxat: bog''lanmaganlar (faqat o''z kompaniyasi, saqlangan)' else 'FAIL boglanmagan: ' || (l->'boglanmagan')::text end);
  l := public.t2_shartnoma_hujjat_royxat_v1(k, ua, shb);
  rep := rep || (case when l->>'code' = 'SHARTNOMA_NOT_FOUND' then 'OK   ro''yxat: begona shartnoma yo''q' else 'FAIL royxat begona: ' || l::text end);

  -- 5. Ajratish: bog' bekor, fayl reyestrda qoladi, qayta bog'lash mumkin
  op := gen_random_uuid();
  r := public.t2_shartnoma_hujjat_ajrat_v1(ua, k, bog1, op);
  l := public.t2_shartnoma_hujjat_royxat_v1(k, ua, sh);
  rep := rep || (case when (r->>'ok')::boolean and (select holat from public.t2_shartnoma_hujjat where id = bog1) = 'bekor'
                           and jsonb_array_length(l->'hujjatlar') = 1 and exists (select 1 from public.t2_document_registry where id = doc1 and status = 'active')
                      then 'OK   ajratildi: bog'' bekor, fayl saqlanib qoldi' else 'FAIL ajrat: ' || r::text end);
  r := public.t2_shartnoma_hujjat_ajrat_v1(ua, k, bog1, op);
  rep := rep || (case when (r->>'ok')::boolean then 'OK   ajrat idempotent' else 'FAIL ajrat idempotent: ' || r::text end);
  r := public.t2_shartnoma_hujjat_bogla_v1(ua, k, sh, null, doc1, null, null, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean and (r->>'takror')::boolean = false and (r->>'id')::bigint <> bog1
                      then 'OK   ajratilgandan keyin qayta bog''lash' else 'FAIL qayta bogla: ' || r::text end);
  r := public.t2_shartnoma_hujjat_ajrat_v1(ua, k, 999999999, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'BOG_NOT_FOUND' then 'OK   noma''lum bog'' rad' else 'FAIL ajrat noma''lum: ' || r::text end);

  -- 6. Begona foydalanuvchi
  begin
    r := public.t2_shartnoma_hujjat_bogla_v1(ux, k, sh, null, doc3, null, null, gen_random_uuid());
    rep := rep || ('FAIL begona bog''ladi: ' || r::text);
  exception when others then get stacked diagnostics v_state = returned_sqlstate; rep := rep || ('OK   begona bog''lay olmaydi (' || v_state || ')');
  end;
  begin
    l := public.t2_shartnoma_hujjat_royxat_v1(k, ux, sh);
    rep := rep || ('FAIL begona ro''yxat: ' || l::text);
  exception when others then rep := rep || 'OK   begona ro''yxat ko''rmaydi'::text;
  end;
  begin
    r := public.t2_shartnoma_hujjat_ajrat_v1(ux, k, bog1, gen_random_uuid());
    rep := rep || ('FAIL begona ajratdi: ' || r::text);
  exception when others then rep := rep || 'OK   begona ajrata olmaydi'::text;
  end;

  -- 7. Jadval va funksiyalar faqat service_role uchun
  rep := rep || (case when not has_function_privilege('authenticated', 'public.t2_shartnoma_hujjat_bogla_v1(bigint,bigint,bigint,bigint,bigint,text,text,uuid)', 'execute')
                           and not has_function_privilege('anon', 'public.t2_shartnoma_hujjat_royxat_v1(bigint,bigint,bigint)', 'execute')
                           and not has_function_privilege('authenticated', 'public.t2_shartnoma_hujjat_ajrat_v1(bigint,bigint,bigint,uuid)', 'execute')
                           and has_function_privilege('service_role', 'public.t2_shartnoma_hujjat_royxat_v1(bigint,bigint,bigint)', 'execute')
                           and not has_table_privilege('authenticated', 'public.t2_shartnoma_hujjat', 'select')
                           and (select relrowsecurity from pg_class where oid = 'public.t2_shartnoma_hujjat'::regclass)
                      then 'OK   faqat service_role, RLS yoqilgan' else 'FAIL grant/RLS' end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'T2_SHARTNOMA_HUJJAT_V1_ACCEPTANCE FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'T2_SHARTNOMA_HUJJAT_V1_ACCEPTANCE_PASS % tekshiruv:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;
