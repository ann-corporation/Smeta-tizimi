-- t2_agent_oqish_buyruq_contract: fikr -> tozalangan signal -> global yig'ish -> rivojlanish taklifi -> tasdiq -> ISH BUYRUG'I. Rollback (raise exception).
do $t$
declare
  k1 bigint; k2 bigint; ks bigint; u1 bigint; u2 bigint; us bigint; ubuy bigint;
  r jsonb; tid bigint; bid bigint; ok int := 0; bad text := ''; n int; sid bigint[];
begin
  insert into t2_kompaniya(kod, nom, faol) values ('OBA' || floor(random()*1e9)::text, 'Uzbek Quruvchi Maxfiy', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('OBB' || floor(random()*1e9)::text, 'Boshqa Firma', true) returning id into k2;
  insert into t2_kompaniya(kod, nom, faol) values ('OBS' || floor(random()*1e9)::text, 'Platforma', true) returning id into ks;
  insert into t2_foydalanuvchi(login) values ('ob_u1_' || k1) returning id into u1;
  insert into t2_foydalanuvchi(login) values ('ob_u2_' || k1) returning id into u2;
  insert into t2_foydalanuvchi(login) values ('ob_s_' || k1) returning id into us;
  insert into t2_foydalanuvchi(login) values ('ob_b_' || k1) returning id into ubuy;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, u1, 'pto', 'faol'), (k2, u2, 'pto', 'faol'), (ks, us, 'superadmin', 'faol'), (k1, ubuy, 'boss', 'faol');
  insert into t2_obyekt(kompaniya_id, nom) values (k1, 'Navoiy Ozerka Park');

  -- 1) fikr: toza xulosa ulashiladi; tenant nomi/obyekt/raqam/email bo'lsa ULASHILMAYDI (fail-closed)
  r := t2_agent_fikr_yoz_v1(u1, k1, 'muammo', 'F2 import sekin', '/admin/f2', '{}', 'javob', 'F2 import sahifasi katta fayllarda sekin ishlaydi');
  if (r->>'ok')::boolean and (r->>'ulashildi')::boolean then ok := ok + 1; else bad := bad || ' toza-ulashildi'; end if;
  r := t2_agent_fikr_yoz_v1(u1, k1, 'muammo', 'x matn', '/admin/f2', '{}', null, 'Uzbek Quruvchi Maxfiy kompaniyasida F2 sekin');
  if (r->>'ok')::boolean and not (r->>'ulashildi')::boolean then ok := ok + 1; else bad := bad || ' kompaniya-nomi'; end if;
  r := t2_agent_fikr_yoz_v1(u1, k1, 'muammo', 'x matn', '/admin/f2', '{}', null, 'Navoiy Ozerka Park obyektida xato bor');
  if not (r->>'ulashildi')::boolean then ok := ok + 1; else bad := bad || ' obyekt-nomi'; end if;
  r := t2_agent_fikr_yoz_v1(u1, k1, 'muammo', 'x matn', '/admin/f2', '{}', null, 'Narx 1500000 so''m chiqdi noto''g''ri');
  if not (r->>'ulashildi')::boolean then ok := ok + 1; else bad := bad || ' raqam'; end if;
  r := t2_agent_fikr_yoz_v1(u1, k1, 'muammo', 'x matn', '/admin/f2', '{}', null, 'Aloqa uchun test@mail.uz ga yozing');
  if not (r->>'ulashildi')::boolean then ok := ok + 1; else bad := bad || ' email'; end if;

  -- 2) izolyatsiya: begona kompaniya fikr yoza/o'qiy olmaydi, skrinshot begona bo'lsa rad
  r := t2_agent_fikr_yoz_v1(u2, k1, 'fikr', 'begona', null, '{}', null, null);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' begona-yoz'; end if;
  r := t2_agent_fikr_royxat_v1(u2, k1);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' begona-oqish'; end if;
  r := t2_agent_fikr_yoz_v1(u1, k1, 'muammo', 'skrin', null, '{999999999}', null, null);
  if r->>'code' = 'SKRIN_BEGONA' then ok := ok + 1; else bad := bad || ' skrin-begona'; end if;
  r := t2_agent_fikr_royxat_v1(u1, k1);
  if (r->>'ok')::boolean and jsonb_array_length(r->'natija') = 5 then ok := ok + 1; else bad := bad || ' royxat-soni'; end if;

  -- 3) quyi agent signali ham tozalanadi; kompaniya_id chiqmaydi
  r := t2_agent_signal_yoz_v1(u1, k1, 'pto_smeta', '/admin/f2', 'material_topilmadi', 'Mash-chas materiali katalogdan topilmadi');
  if (r->>'ulashildi')::boolean then ok := ok + 1; else bad := bad || ' signal'; end if;
  r := t2_agent_signal_yoz_v1(u2, k2, 'pto_smeta', '/admin/f2', 'material_topilmadi', 'Material katalogdan topilmadi shu');
  if (r->>'ulashildi')::boolean then ok := ok + 1; else bad := bad || ' signal-2'; end if;

  -- 4) global yig'ish: faqat superadmin; natijada kompaniya nomi/ID yo'q; kompaniya soni bor
  r := t2_agent_rivojlanish_yigish_v1(u1, 30);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' yigish-oddiy'; end if;
  r := t2_agent_rivojlanish_yigish_v1(us, 30);
  if (r->>'ok')::boolean and position('Maxfiy' in r::text) = 0 and position('Ozerka' in r::text) = 0 and position('"kompaniya_id"' in r::text) = 0 and position('kompaniya_soni' in r::text) > 0 then ok := ok + 1; else bad := bad || ' yigish-tozalik'; end if;
  select array_agg(id) into sid from t2_agent_signal where tur = 'material_topilmadi';

  -- 5) rivojlantiruvchi agent taklifi (global) -> tasdiq -> ISH BUYRUG'I; signal buyruqqa bog'lanadi
  r := t2_agent_taklif_yarat_v1(us, null, 'rivojlanish', 'global', null, 'Material qidiruvini yaxshilash',
        jsonb_build_object('maqsad', 'material moslashuvi', 'tavsif', 'Qidiruvga sinonimlar qo''shish', 'xavf', 'past', 'signal_idlar', to_jsonb(sid)), '[]', null);
  tid := (r->>'id')::bigint;
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' riv-yarat'; end if;
  r := t2_agent_taklif_qaror_v1(u1, tid, 'tasdiqlash', null, true);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' riv-oddiy-tasdiq'; end if;
  r := t2_agent_taklif_qaror_v1(us, tid, 'tasdiqlash', 'ok', true);
  bid := (r->>'buyruq_id')::bigint;
  if (r->>'ok')::boolean and bid is not null and (select avto_birlashtirish from t2_agent_buyruq where id = bid) then ok := ok + 1; else bad := bad || ' buyruq-yaratildi'; end if;
  select count(*) into n from t2_agent_signal where buyruq_id = bid;
  if n = array_length(sid, 1) then ok := ok + 1; else bad := bad || ' signal-boglandi'; end if;
  r := t2_agent_rivojlanish_yigish_v1(us, 30);
  if position('material_topilmadi' in r::text) = 0 then ok := ok + 1; else bad := bad || ' ishlangan-signal-qayta'; end if;

  -- 6) yuqori xavfli buyruq avto-birlashtirilmaydi
  r := t2_agent_taklif_yarat_v1(us, null, 'rivojlanish', 'global', null, 'Migratsiya o''zgartirish', '{"maqsad":"x","tavsif":"y","xavf":"yuqori"}', '[]', null);
  r := t2_agent_taklif_qaror_v1(us, (r->>'id')::bigint, 'tasdiqlash', null, true);
  if (r->>'ok')::boolean and not (select avto_birlashtirish from t2_agent_buyruq where id = (r->>'buyruq_id')::bigint) then ok := ok + 1; else bad := bad || ' yuqori-xavf-avto'; end if;

  -- 7) ijrochi holati: faqat superadmin, PR url shakli tekshiriladi, yakunlangan buyruq o'zgarmaydi
  r := t2_agent_buyruq_holat_v1(u1, bid, 'bajarilmoqda');
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' holat-oddiy'; end if;
  r := t2_agent_buyruq_holat_v1(us, bid, 'pr_ochildi', 'http://evil.example/pull/1');
  if r->>'code' = 'PR_URL_INVALID' then ok := ok + 1; else bad := bad || ' pr-url'; end if;
  r := t2_agent_buyruq_holat_v1(us, bid, 'pr_ochildi', 'https://github.com/ann-corporation/Smeta-tizimi/pull/12');
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' pr-ochildi'; end if;
  r := t2_agent_buyruq_holat_v1(us, bid, 'birlashtirildi');
  r := t2_agent_buyruq_holat_v1(us, bid, 'bajarilmoqda');
  if r->>'code' = 'YAKUNLANGAN' then ok := ok + 1; else bad := bad || ' yakunlangan'; end if;
  r := t2_agent_buyruq_royxat_v1(u1);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' buyruq-royxat-oddiy'; end if;

  -- 8) kompaniya doirasidagi rivojlanish UMUMIY kodni o'zgartirmaydi: buyruq YARATILMAYDI, tozalangan signalga aylanadi
  select count(*) into n from t2_agent_buyruq;
  r := t2_agent_taklif_yarat_v1(u1, k1, 'rivojlanish', 'company', null, 'Bizga alohida hisobot', '{"tavsif":"Oylik hisobot shabloni kerak"}', '[]', null);
  r := t2_agent_taklif_qaror_v1(ubuy, (r->>'id')::bigint, 'tasdiqlash', null, true);
  if (r->>'ok')::boolean and (r->>'buyruq_id') is null and (select count(*) from t2_agent_buyruq) = n
     and exists (select 1 from t2_agent_signal where tur = 'tavsiya') then ok := ok + 1; else bad := bad || ' kompaniya-riv'; end if;

  raise exception 'OQISH_BUYRUQ_TEST ok=% / 25 bad=[%]', ok, bad;
end $t$;
