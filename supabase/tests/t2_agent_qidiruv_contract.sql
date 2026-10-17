-- t2_agent_qidiruv_contract: Jarvis aniq qidiruvi — obyekt nomi + resurs belgilari bo'yicha smeta qatorlari; narx faqat 'smeta_pul'
-- lavozimida; begona kompaniya/obyekt yopiq; LIKE belgilari kira olmaydi. Rollback.
do $t$
declare k1 bigint; k2 bigint; ub bigint; up bigint; ul bigint; uo bigint; o1 bigint; o2 bigint; ob bigint; r jsonb; ok int := 0; bad text := '';
begin
  insert into t2_kompaniya(kod, nom, faol) values ('AQA' || floor(random()*1e9)::text, 'Qidiruv A', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('AQB' || floor(random()*1e9)::text, 'Qidiruv B', true) returning id into k2;
  insert into t2_foydalanuvchi(login) values ('aq_boss_' || k1) returning id into ub;
  insert into t2_foydalanuvchi(login) values ('aq_prorab_' || k1) returning id into up;
  insert into t2_foydalanuvchi(login) values ('aq_lab_' || k1) returning id into ul;
  insert into t2_foydalanuvchi(login) values ('aq_other_' || k1) returning id into uo;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, ub, 'boss', 'faol'), (k1, up, 'prorab', 'faol'), (k1, ul, 'laborant', 'faol'), (k2, uo, 'boss', 'faol');
  insert into t2_obyekt(kompaniya_id, nom) values (k1, 'Amfiteatr test ' || k1) returning id into o1;
  insert into t2_obyekt(kompaniya_id, nom) values (k1, 'Maktab test ' || k1) returning id into o2;
  insert into t2_obyekt(kompaniya_id, nom) values (k2, 'Amfiteatr begona ' || k1) returning id into ob;
  insert into t2_qator(kompaniya_id, obyekt_id, tur, nom, birlik, hajm, narx, summa) values
    (k1, o1, 'mat', 'БЕТОН ТЯЖЕЛЫЙ М200', 'м3', 10, 950000, 9500000),
    (k1, o1, 'mat', 'БЕТОН ТЯЖЕЛЫЙ М200', 'м3', 5, 1000000, 5000000),
    (k1, o1, 'mat', 'БЕТОН ТЯЖЕЛЫЙ М300', 'м3', 7, 1100000, 7700000),
    (k1, o2, 'mat', 'БЕТОН ТЯЖЕЛЫЙ М200', 'м3', 3, 990000, 2970000),
    (k2, ob, 'mat', 'БЕТОН ТЯЖЕЛЫЙ М200', 'м3', 99, 123456, 1);

  r := t2_agent_qidiruv_v1(ub, k1, array['amfit'], array['БЕТОН', 'М200']);
  if jsonb_array_length(r->'obyektlar') = 1 and (r->'obyektlar'->0->>'id')::bigint = o1 then ok := ok + 1; else bad := bad || ' obyekt-topildi' || r::text; end if;
  if jsonb_array_length(r->'qatorlar') = 1 and r->'qatorlar'->0->>'nom' = 'БЕТОН ТЯЖЕЛЫЙ М200' and (r->'qatorlar'->0->>'qator_soni')::int = 2
     and (r->'qatorlar'->0->>'narx_min')::numeric = 950000 and (r->'qatorlar'->0->>'narx_max')::numeric = 1000000 and (r->'qatorlar'->0->>'hajm')::numeric = 15 then ok := ok + 1;
  else bad := bad || ' m200-aniq' || r::text; end if;
  if r::text not like '%123456%' then ok := ok + 1; else bad := bad || ' begona-kompaniya-qatori'; end if;
  -- obyekt aytilmasa — butun kompaniya (lekin faqat o'zi)
  r := t2_agent_qidiruv_v1(ub, k1, '{}', array['БЕТОН', 'М200']);
  if jsonb_array_length(r->'qatorlar') = 2 and r::text not like '%123456%' then ok := ok + 1; else bad := bad || ' kompaniya-boyicha' || r::text; end if;
  -- prorab: hajm ko'radi, narx/summa yo'q
  r := t2_agent_qidiruv_v1(up, k1, array['amfit'], array['БЕТОН', 'М200']);
  if (r->'qatorlar'->0->>'hajm')::numeric = 15 and not (r->'qatorlar'->0 ? 'narx_min') and not (r->'qatorlar'->0 ? 'summa') and not (r->>'narx_ruxsat')::boolean then ok := ok + 1;
  else bad := bad || ' prorab-narxsiz' || r::text; end if;
  -- laborant: smeta qatorlari umuman yo'q
  r := t2_agent_qidiruv_v1(ul, k1, array['amfit'], array['БЕТОН']);
  if jsonb_array_length(r->'qatorlar') = 0 and not (r->>'ruxsat')::boolean then ok := ok + 1; else bad := bad || ' laborant-yopiq'; end if;
  -- begona: boshqa kompaniya a'zosi k1 ni so'ray olmaydi; begona obyekt id rad
  r := t2_agent_qidiruv_v1(uo, k1, array['amfit'], array['БЕТОН']);
  if not (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' begona-rad'; end if;
  r := t2_agent_qidiruv_v1(ub, k1, '{}', array['БЕТОН'], ob);
  if r->>'code' = 'OBYEKT_BEGONA' then ok := ok + 1; else bad := bad || ' begona-obyekt'; end if;
  -- LIKE belgilari kira olmaydi ('%' so'z tashlanadi)
  r := t2_agent_qidiruv_v1(ub, k1, array['%'], array['%', '_']);
  if jsonb_array_length(r->'qatorlar') = 0 and jsonb_array_length(r->'obyektlar') = 0 then ok := ok + 1; else bad := bad || ' like-inyeksiya' || r::text; end if;
  raise exception 'T2_AGENT_QIDIRUV_RESULT ok=% bad=[%]', ok, bad;
end $t$;
