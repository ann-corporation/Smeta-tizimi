-- Qabul sinovi: FAQAT ROLLBACK ichida (migratsiyaning o'z begin/commit i yo'q). Xato: raise exception 'ACC: ...'.
do $$
declare k bigint; a bigint; o bigint; l bigint; x jsonb; n jsonb; akt1 bigint; akt2 bigint; r1 bigint; sha_a text := repeat('6', 64);
begin
  select s.kompaniya_id, b2.obyekt_id, ob.loyiha_id into k, o, l from public.t2_shartnoma_bog b2 join public.t2_shartnoma s on s.id = b2.shartnoma_id
    join public.t2_obyekt ob on ob.id = b2.obyekt_id and ob.kompaniya_id = s.kompaniya_id and ob.loyiha_id is not null
   where b2.holat = 'faol' order by b2.obyekt_id limit 1;
  if o is null then raise exception 'ACC: sinov uchun obyekt topilmadi'; end if;
  select m.foydalanuvchi_id into a from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol' where m.kompaniya_id = k and m.holat = 'faol' order by m.foydalanuvchi_id limit 1;

  -- 1. RUXSAT: kompaniya a'zosi bo'lmagan aktor rad etiladi; filtrsiz chaqiruv ok
  if (public.t2_hujjat_paket_nomzod_v1(-1, k, '{}'::jsonb)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC1 ruxsat'; end if;
  x := public.t2_hujjat_paket_nomzod_v1(a, k, jsonb_build_object('obyekt_ids', jsonb_build_array(o)));
  if x->>'ok' <> 'true' or jsonb_typeof(x->'nomzodlar') <> 'array' then raise exception 'ACC1 javob %', x; end if;
  if (public.t2_hujjat_paket_nomzod_v1(a, k, '{"oy_dan":"2026/01"}'::jsonb)->>'code') <> 'OY_NOTOGRI' then raise exception 'ACC1 oy tekshiruvi'; end if;

  -- 2. Tasdiqlangan F-2 + Disk fayli: nomzod F-2 (fayl bilan), takror emas, nakopitelniy/m29 (yasash=true), slichitelniy/ostatka (yasash=true)
  insert into public.t2_akt(kompaniya_id, obyekt_id, tur, holat, oy, raqam) values (k, o, 'f2', 'tasdiqlangan', date '2031-03-01', 'ACC-P1') returning id into akt1;
  x := public.t2_hujjat_paket_nomzod_v1(a, k, jsonb_build_object('obyekt_ids', jsonb_build_array(o), 'oy_dan', '2031-03', 'oy_gacha', '2031-03'));
  select e into n from jsonb_array_elements(x->'nomzodlar') e where e->>'kalit' = 'f2:' || akt1;
  if n is null or n->>'holat' <> 'tasdiqlangan' or (n->>'takror')::boolean or (n->>'yasash')::boolean is not true then raise exception 'ACC2 f2 nomzod %', n; end if;
  if not exists (select 1 from jsonb_array_elements(x->'nomzodlar') e where e->>'kalit' = 'nakopitelniy:' || o || ':2031-03' and (e->>'yasash')::boolean) then raise exception 'ACC2 nakopitelniy yasash yoq'; end if;
  if not exists (select 1 from jsonb_array_elements(x->'nomzodlar') e where e->>'kalit' = 'm29:' || o || ':2031-03' and (e->>'yasash')::boolean) then raise exception 'ACC2 m29 yasash yoq'; end if;

  -- 3. Disk fayli bo'lsa: fayl_id/versiya to'ldiriladi, yasash=false
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'f2_hujjat', '2031-03-01', 'acc_f2_' || chr(8470) || 'ACC-P1_2031-03.xlsx', 900, sha_a, 99701, 'stored', 'active', now(), 'docs/acc/p1', a) returning id into r1;
  perform public.t2_disk_tizim_yoz_v1(a, k, r1, 'f2', akt1, 'f2:' || akt1, null, 'F-2 ACC');
  x := public.t2_hujjat_paket_nomzod_v1(a, k, jsonb_build_object('obyekt_ids', jsonb_build_array(o), 'oy_dan', '2031-03', 'oy_gacha', '2031-03', 'turlar', jsonb_build_array('f2')));
  select e into n from jsonb_array_elements(x->'nomzodlar') e where e->>'kalit' = 'f2:' || akt1;
  if n is null or (n->>'yasash')::boolean or n->>'fayl_id' is null or (n->>'versiya')::int < 1 then raise exception 'ACC3 disk fayl %', n; end if;
  if jsonb_array_length(x->'nomzodlar') <> 1 then raise exception 'ACC3 tur filtri %', x->'nomzodlar'; end if;

  -- 4. Takror (bir obyekt+oy da 2 F-2) belgilanadi; taxminiy chiqarilmaydi; bekor chiqarilmaydi
  insert into public.t2_akt(kompaniya_id, obyekt_id, tur, holat, oy, raqam) values (k, o, 'f2', 'qoralama', date '2031-03-01', 'ACC-P2') returning id into akt2;
  insert into public.t2_akt(kompaniya_id, obyekt_id, tur, holat, oy, raqam) values (k, o, 'f2', 'qoralama', date '2031-03-01', 'TAXMINIY-ACC');
  insert into public.t2_akt(kompaniya_id, obyekt_id, tur, holat, oy, raqam) values (k, o, 'f2', 'bekor', date '2031-03-01', 'ACC-B');
  x := public.t2_hujjat_paket_nomzod_v1(a, k, jsonb_build_object('obyekt_ids', jsonb_build_array(o), 'oy_dan', '2031-03', 'oy_gacha', '2031-03', 'turlar', jsonb_build_array('f2')));
  if not exists (select 1 from jsonb_array_elements(x->'nomzodlar') e where e->>'kalit' = 'f2:' || akt2 and (e->>'takror')::boolean) then raise exception 'ACC4 takror belgisi yoq'; end if;
  if exists (select 1 from jsonb_array_elements(x->'nomzodlar') e where e->>'sarlavha' like '%TAXMINIY%' or e->>'sarlavha' like '%ACC-B%') then raise exception 'ACC4 taxminiy/bekor chiqdi'; end if;
  -- holat filtri
  x := public.t2_hujjat_paket_nomzod_v1(a, k, jsonb_build_object('obyekt_ids', jsonb_build_array(o), 'oy_dan', '2031-03', 'oy_gacha', '2031-03', 'turlar', jsonb_build_array('f2'), 'holatlar', jsonb_build_array('tasdiqlangan')));
  if exists (select 1 from jsonb_array_elements(x->'nomzodlar') e where e->>'holat' <> 'tasdiqlangan') then raise exception 'ACC4 holat filtri'; end if;
end $$;