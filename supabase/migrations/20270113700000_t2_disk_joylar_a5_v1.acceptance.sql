-- Qabul sinovi: FAQAT ROLLBACK ichida (migratsiyaning o'z begin/commit i yo'q). Xato: raise exception 'ACC: ...'.
do $$
declare k bigint; a bigint; o bigint; l bigint; r1 bigint; r2 bigint; x jsonb; y jsonb; pid bigint; fid bigint;
begin
  select s.kompaniya_id, b2.obyekt_id, ob.loyiha_id into k, o, l from public.t2_shartnoma_bog b2 join public.t2_shartnoma s on s.id = b2.shartnoma_id
    join public.t2_obyekt ob on ob.id = b2.obyekt_id and ob.kompaniya_id = s.kompaniya_id and ob.loyiha_id is not null
   where b2.holat = 'faol' order by b2.obyekt_id limit 1;
  if o is null then raise exception 'ACC: sinov uchun obyekt topilmadi'; end if;
  select m.foydalanuvchi_id into a from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol' where m.kompaniya_id = k and m.holat = 'faol' order by m.foydalanuvchi_id limit 1;
  -- 1. Kompaniya darajasidagi hujjat: Biriktirilmagan EMAS, Kompaniya hujjatlari -> tur -> oy
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, null, 'kompaniya_bux_hisobot', '2026-11', 'acc_a5.xlsx', 700, repeat('6', 64), 99701, 'stored', 'active', now() - interval '1 hour', 'docs/acc/a5', a) returning id into r1;
  x := public.t2_disk_tizim_yoz_v1(a, k, r1, 'kompaniya_bux_hisobot', null, 'kompaniya_bux_hisobot:k' || k || ':2026-11:balans', null, 'Buxgalteriya hisoboti - Balans - 2026-11');
  if x->>'ok' <> 'true' then raise exception 'ACC1 yozuv %', x; end if;
  pid := (x->>'papka_id')::bigint;
  if (select tizim_kalit from public.t2_fayl_papka where id = pid) <> 'kompaniya/tur:kompaniya_bux_hisobot/oy:2026-11' then raise exception 'ACC1 papka kaliti %', (select tizim_kalit from public.t2_fayl_papka where id = pid); end if;
  if (select nom from public.t2_fayl_papka where id = (select ota_id from public.t2_fayl_papka where id = (select ota_id from public.t2_fayl_papka where id = pid))) <> 'Kompaniya hujjatlari' then raise exception 'ACC1 ildiz papka'; end if;
  if (select nom from public.t2_fayl_papka where id = (select ota_id from public.t2_fayl_papka where id = pid)) <> 'Buxgalteriya hisoboti' then raise exception 'ACC1 tur papka nomi %', (select nom from public.t2_fayl_papka where id = (select ota_id from public.t2_fayl_papka where id = pid)); end if;
  if exists (select 1 from jsonb_array_elements(public.t2_disk_yetim_royxat_v1(a, k, 500)->'fayllar') e where (e->>'id')::bigint = (x->>'fayl_id')::bigint) then raise exception 'ACC1 Biriktirilmagan ga tushdi'; end if;
  -- 2. Obyektli yangi tur: Loyiha -> ... -> Obyekt -> tur nomi (ro'yxatdagi nom)
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'pereraschet', '2026-11', 'acc_a5b.xlsx', 700, repeat('5', 64), 99702, 'stored', 'active', now() - interval '1 hour', 'docs/acc/a5b', a) returning id into r2;
  y := public.t2_disk_tizim_yoz_v1(a, k, r2, 'pereraschet', o, 'pereraschet:' || o || ':2026-11:smeta-butun', null, 'Pereraschet - acc');
  if y->>'ok' <> 'true' then raise exception 'ACC2 yozuv %', y; end if;
  if (select tizim_kalit from public.t2_fayl_papka where id = (y->>'papka_id')::bigint) not like 'loyiha:' || l || '%/obyekt:' || o || '/tur:pereraschet/oy:2026-11' then raise exception 'ACC2 yol %', (select tizim_kalit from public.t2_fayl_papka where id = (y->>'papka_id')::bigint); end if;
  if public._t2_disk_tur_nom_v1('pereraschet') <> 'Pereraschet' or public._t2_disk_tur_nom_v1('kompaniya_ish_haqi') <> 'Ish haqi vedomostlari' then raise exception 'ACC2 tur nomlari'; end if;
  -- 3. Eski turlar o'zgarmagan (A1 xatti-harakati)
  if public._t2_disk_tur_nom_v1('f2_hujjat') <> 'F-2 hujjatlari' or public._t2_disk_tur_nom_v1('nashr') <> 'Nashr qilingan hujjatlar' then raise exception 'ACC3 eski nomlar'; end if;
  -- 4. Faqat service_role
  if has_function_privilege('authenticated', 'public._t2_disk_yol_v1(bigint, bigint, bigint, bigint, text, text, text, bigint)', 'execute') then raise exception 'ACC4 authenticated chaqira oladi'; end if;
end $$;