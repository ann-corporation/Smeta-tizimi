-- T2_TOMON_MUROJAAT — adversarial acceptance (rollback bilan). Natija: oxirgi exception matni.
do $$
declare
  p bigint; z bigint; x bigint; up bigint; uz bigint; uzk bigint; ux bigint; ly bigint; o1 bigint; ox bigint; al bigint; d1 bigint; d2 bigint; m1 bigint; m2 bigint; r jsonb; rep text[] := array[]::text[];
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_PUD', 'TST-P', '900000001', true) returning id into p;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_ZAK', 'TST-Z', '900000002', true) returning id into z;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_BEGONA', 'TST-X', '900000003', true) returning id into x;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_mp', 'P', 'faol') returning id into up;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_mz', 'Z', 'faol') returning id into uz;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_mzk', 'Zk', 'faol') returning id into uzk;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_mx', 'X', 'faol') returning id into ux;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, p, 'boss', 'faol'), (uz, z, 'boss', 'faol'), (uzk, z, 'kuzatuvchi', 'faol'), (ux, x, 'boss', 'faol');
  insert into t2_loyiha (kompaniya_id, nom) values (p, 'L') returning id into ly;
  insert into t2_obyekt (nom, kompaniya_id, loyiha_id) values ('P-obyekt', p, ly) returning id into o1;
  insert into t2_obyekt (nom, kompaniya_id) values ('X-obyekt', x) returning id into ox;
  insert into t2_document_registry (kompaniya_id, loyiha_id, obyekt_id, document_type, status, canonical_storage_status, r2_key, original_filename, mime_type, size_bytes, sha256, finalized_at)
    values (p, ly, o1, 'foto', 'active', 'stored', 'docs/p/foto.jpg', 'foto.jpg', 'image/jpeg', 10, repeat('a', 64), now()) returning id into d1;
  insert into t2_document_registry (kompaniya_id, loyiha_id, obyekt_id, document_type, status, canonical_storage_status, r2_key, original_filename, mime_type, size_bytes, sha256, finalized_at)
    values (p, ly, o1, 'maxfiy', 'active', 'stored', 'docs/p/maxfiy.pdf', 'maxfiy.pdf', 'application/pdf', 10, repeat('b', 64), now()) returning id into d2;
  r := t2_tomon_taklif_v1(up, p, z, '900000002', null, 'pudratchi', 'zakazchik', 'shartnoma', null, null, null, gen_random_uuid());
  al := (r->>'id')::bigint;
  r := t2_tomon_murojaat_yarat_v1(uz, z, al, 'remark', 'Beton sifati', 'x', 'yuqori', current_date + 3, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'HOLAT' then 'OK   faol bo''lmagan aloqada murojaat yozilmaydi' else 'FAIL taklifda murojaat: ' || r::text end);
  perform t2_tomon_javob_v1(uz, z, al, 'qabul', null);

  r := t2_tomon_murojaat_yarat_v1(uz, z, al, 'remark', 'Beton sifati', 'B25 o''rniga B20 quyilgan', 'yuqori', current_date - 1, null, '2-qavat, A-B', gen_random_uuid());
  m1 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'ochiq' then 'OK   zakazchik remark yozdi' else 'FAIL remark: ' || r::text end);
  begin perform t2_tomon_murojaat_yarat_v1(uzk, z, al, 'remark', 'Kuzatuvchi', null, null, null, null, null, gen_random_uuid()); rep := rep || 'FAIL kuzatuvchi murojaat yozdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   kuzatuvchi murojaat yoza olmaydi' else 'FAIL kuzatuvchi: ' || sqlerrm end); end;
  r := t2_tomon_murojaat_yarat_v1(uz, z, al, 'yo_q_tur', 'Noma''lum tur', null, null, null, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'TUR_YOQ' then 'OK   noma''lum tur rad' else 'FAIL tur: ' || r::text end);
  r := t2_tomon_murojaat_yarat_v1(uz, z, al, 'remark', 'Begona obyekt', null, null, null, ox, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'OBYEKT_BEGONA' then 'OK   begona kompaniya obyektiga murojaat yo''q' else 'FAIL begona obyekt: ' || r::text end);
  r := t2_tomon_murojaat_yarat_v1(uz, z, al, 'remark', 'Yopiq obyekt', null, null, null, o1, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'OBYEKT_YOPIQ' then 'OK   ochilmagan (grantsiz) pudratchi obyektiga murojaat yo''q' else 'FAIL yopiq obyekt: ' || r::text end);
  perform t2_tomon_grant_saqla_v1(up, p, al, jsonb_build_array(jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1)));
  r := t2_tomon_murojaat_yarat_v1(uz, z, al, 'remark', 'Ochiq obyekt', null, null, null, o1, null, gen_random_uuid());
  m2 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean then 'OK   grant berilgach pudratchi obyektiga murojaat mumkin' else 'FAIL grantli obyekt: ' || r::text end);

  r := t2_tomon_murojaat_tafsilot_v1(ux, x, m1);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   uchinchi kompaniya murojaatni ko''rmaydi' else 'FAIL begona tafsilot: ' || r::text end);
  r := t2_tomon_murojaat_royxat_v1(ux, x, null, null, null, 50);
  rep := rep || (case when jsonb_array_length(r) = 0 then 'OK   begona kompaniya ro''yxati bo''sh' else 'FAIL begona ro''yxat' end);
  r := t2_tomon_murojaat_royxat_v1(up, p, 'menga', null, null, 50);
  rep := rep || (case when jsonb_array_length(r) = 2 and (r->0->>'menga')::boolean then 'OK   pudratchida "menga" 2 ta murojaat' else 'FAIL menga ro''yxat: ' || r::text end);
  rep := rep || (case when (select (e->>'kechikkan')::boolean from jsonb_array_elements(t2_tomon_murojaat_royxat_v1(uz, z, 'mendan', null, null, 50)) e where (e->>'id')::bigint = m1) then 'OK   muddati o''tgan murojaat "kechikkan"' else 'FAIL kechikish belgisi' end);

  r := t2_tomon_murojaat_javob_v1(uz, z, m1, 'O''zim javob beraman', null);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   beruvchi o''z murojaatiga javob bera olmaydi' else 'FAIL o''z javobi: ' || r::text end);
  r := t2_tomon_murojaat_javob_v1(up, p, m1, 'ok', null);
  rep := rep || (case when r->>'code' = 'JAVOB_KERAK' then 'OK   mazmunsiz javob rad' else 'FAIL qisqa javob: ' || r::text end);
  begin perform t2_tomon_murojaat_javob_v1(up, p, m1, 'Beton almashtirildi, protokol ilova', array[d1, 999999999]::bigint[]); rep := rep || 'FAIL mavjud bo''lmagan dalil o''tdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   begona/yo''q dalil — 42501' else 'FAIL dalil: ' || sqlerrm end); end;
  begin perform t2_tomon_murojaat_hujjat_v1(uz, z, m1, d1); rep := rep || 'FAIL boshqa kompaniya hujjatini biriktirdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   zakazchik pudratchi hujjatini o''z dalili qila olmaydi' else 'FAIL egalik: ' || sqlerrm end); end;
  r := t2_tomon_murojaat_javob_v1(up, p, m1, 'Beton almashtirildi, protokol ilova', array[d1]);
  rep := rep || (case when r->>'holat' = 'bajarildi' and (r->>'dalil_soni')::int = 1 then 'OK   ijrochi bajardi + dalil biriktirdi' else 'FAIL javob: ' || r::text end);
  r := t2_tomon_murojaat_javob_v1(up, p, m1, 'Yana', null);
  rep := rep || (case when r->>'code' = 'HOLAT' then 'OK   ikki marta javob yo''q' else 'FAIL qayta javob: ' || r::text end);

  rep := rep || (case when (t2_tomon_hujjat_ol_v1(uz, d1))->>'r2_key' = 'docs/p/foto.jpg' then 'OK   zakazchik dalil faylini yuklab oladi' else 'FAIL zakazchik dalil yuklab olish' end);
  rep := rep || (case when (t2_tomon_hujjat_ol_v1(uz, d2))->>'code' = 'DOCUMENT_FORBIDDEN' then 'OK   biriktirilmagan boshqa hujjat yopiq' else 'FAIL boshqa hujjat ochildi' end);
  rep := rep || (case when (t2_tomon_hujjat_ol_v1(ux, d1))->>'code' = 'DOCUMENT_FORBIDDEN' then 'OK   begona kompaniya dalilni ololmaydi' else 'FAIL begona dalil' end);

  r := t2_tomon_murojaat_qaror_v1(up, p, m1, 'yopish', null);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   ijrochi murojaatni o''zi yopa olmaydi' else 'FAIL ijrochi yopdi: ' || r::text end);
  r := t2_tomon_murojaat_qaror_v1(uz, z, m1, 'qayta_ochish', null);
  rep := rep || (case when r->>'code' = 'IZOH_KERAK' then 'OK   sababsiz qayta ochib bo''lmaydi' else 'FAIL sababsiz qayta: ' || r::text end);
  r := t2_tomon_murojaat_qaror_v1(uz, z, m1, 'qayta_ochish', 'Protokolda B25 emas');
  rep := rep || (case when r->>'holat' = 'ochiq' and (r->>'raund')::int = 2 then 'OK   qayta ochildi, raund 2' else 'FAIL qayta ochish: ' || r::text end);
  r := t2_tomon_murojaat_javob_v1(up, p, m1, 'Qayta quyildi, yangi protokol', array[d1]);
  rep := rep || (case when r->>'holat' = 'bajarildi' and (r->>'dalil_soni')::int = 0 then 'OK   ikkinchi raund javobi (bir xil dalil takror biriktirilmadi)' else 'FAIL 2-raund: ' || r::text end);
  r := t2_tomon_murojaat_qaror_v1(uz, z, m1, 'yopish', 'Qabul');
  rep := rep || (case when r->>'holat' = 'yopildi' then 'OK   zakazchik yopdi' else 'FAIL yopish: ' || r::text end);
  r := t2_tomon_murojaat_qaror_v1(uz, z, m1, 'qayta_ochish', 'Yana');
  rep := rep || (case when r->>'code' = 'HOLAT' then 'OK   yopilgan murojaat qayta ochilmaydi' else 'FAIL yopilganni ochdi: ' || r::text end);
  r := t2_tomon_murojaat_bekor_v1(uz, z, m2, 'Kerak emas');
  rep := rep || (case when r->>'holat' = 'bekor' then 'OK   ochiq murojaat bekor qilindi' else 'FAIL bekor: ' || r::text end);
  r := t2_tomon_murojaat_bekor_v1(uz, z, m1, 'x');
  rep := rep || (case when r->>'code' = 'HOLAT' then 'OK   yopilganni bekor qilib bo''lmaydi' else 'FAIL yopilganni bekor: ' || r::text end);

  r := t2_tomon_murojaat_tafsilot_v1(up, p, m1);
  rep := rep || (case when jsonb_array_length(r->'hodisalar') >= 6 and jsonb_array_length(r->'hujjatlar') = 1 and (r->'murojaat'->>'raund')::int = 2 then 'OK   tarix to''liq (murojaat, dalil, javob, qayta, yopildi), 1 dalil' else 'FAIL tafsilot: ' || r::text end);
  begin update t2_tomon_hodisa set matn = 'x' where murojaat_id = m1; rep := rep || 'FAIL murojaat jurnali o''zgardi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   murojaat jurnali o''zgarmas' else 'FAIL jurnal: ' || sqlerrm end); end;
  perform t2_tomon_holat_v1(uz, z, al, 'toxtatish', null);
  rep := rep || (case when (t2_tomon_hujjat_ol_v1(uz, d1))->>'code' = 'DOCUMENT_FORBIDDEN' then 'OK   aloqa to''xtatilganda dalil yuklab bo''lmaydi' else 'FAIL toxtatilgan aloqa dalili' end);
  rep := rep || (case when not has_table_privilege('anon', 't2_tomon_murojaat', 'select') and not has_function_privilege('anon', 't2_tomon_murojaat_yarat_v1(bigint,bigint,bigint,text,text,text,text,date,bigint,text,uuid)', 'execute') then 'OK   anon jadval va RPC ga kira olmaydi' else 'FAIL anon' end);
  raise exception 'MUROJAAT_TEST % FAIL / % jami:%', (select count(*) from unnest(rep) s where s like 'FAIL%'), array_length(rep, 1), E'\n' || array_to_string(rep, E'\n');
end $$;
