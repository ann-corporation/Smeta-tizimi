-- Qabul sinovi: FAQAT ROLLBACK ichida (migratsiyaning o'z begin/commit i yo'q). Xato: raise exception 'ACC: ...'.
do $$
declare k bigint; a bigint; o bigint; l bigint; r1 bigint; r2 bigint; x jsonb; y jsonb; fid bigint; pid bigint; fq jsonb; b bigint; kalit0 text; ver0 integer; ver1 integer; sha_a text := repeat('8', 64); sha_b text := repeat('7', 64);
begin
  select s.kompaniya_id, b2.obyekt_id, ob.loyiha_id into k, o, l from public.t2_shartnoma_bog b2 join public.t2_shartnoma s on s.id = b2.shartnoma_id
    join public.t2_obyekt ob on ob.id = b2.obyekt_id and ob.kompaniya_id = s.kompaniya_id and ob.loyiha_id is not null
   where b2.holat = 'faol' order by b2.obyekt_id limit 1;
  if o is null then raise exception 'ACC: sinov uchun obyekt topilmadi'; end if;
  select m.foydalanuvchi_id into a from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol' where m.kompaniya_id = k and m.holat = 'faol' order by m.foydalanuvchi_id limit 1;
  select u.id into b from public.t2_foydalanuvchi u where u.holat = 'faol' and not exists (select 1 from public.t2_azolik m where m.foydalanuvchi_id = u.id and m.kompaniya_id = k and m.holat = 'faol') order by u.id limit 1;
  -- obyektsiz hujjat (nakopitelniy, obyekt_id NULL) -> Biriktirilmagan
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, null, 'nakopitelniy', '2026-11', 'acc_a4.xlsx', 900, sha_a, 99601, 'stored', 'active', now() - interval '1 hour', 'docs/acc/a4', a) returning id into r1;
  x := public.t2_disk_tizim_yoz_v1(a, k, r1, null, null, null, null, null);
  if x->>'ok' <> 'true' then raise exception 'ACC1 yozuv %', x; end if;
  fid := (x->>'fayl_id')::bigint; kalit0 := x->>'kalit';
  -- 1. Royxat: fayl taklif metama'lumoti bilan; nomzodlar bor
  y := public.t2_disk_yetim_royxat_v1(a, k, 300);
  if y->>'ok' <> 'true' or y->>'papka_id' is null then raise exception 'ACC1 royxat %', y; end if;
  select e into fq from jsonb_array_elements(y->'fayllar') e where (e->>'id')::bigint = fid;
  if fq is null or fq->>'hujjat_turi' <> 'nakopitelniy' or fq->>'asl_nom' <> 'acc_a4.xlsx' or fq->>'revision' <> '2026-11' then raise exception 'ACC1 fayl maydonlari %', fq; end if;
  if not exists (select 1 from jsonb_array_elements(y->'obyektlar') e where (e->>'id')::bigint = o and (e->>'loyiha_id')::bigint = l) then raise exception 'ACC1 nomzod obyekt yoq'; end if;
  -- 2. Ko'chirish: obyekt yo'liga; versiya saqlanadi; kalit obyektga qayta hisoblanadi; Biriktirilmagan bo'shaydi
  select count(*) into ver0 from public.t2_hm_versiya where fayl_id = fid;
  x := public.t2_disk_yetim_kochir_v1(a, k, fid, l, o);
  if x->>'ok' <> 'true' then raise exception 'ACC2 kochirish %', x; end if;
  select count(*) into ver1 from public.t2_hm_versiya where fayl_id = fid;
  if ver0 <> ver1 or ver1 < 1 then raise exception 'ACC2 versiya yoqoldi % %', ver0, ver1; end if;
  pid := (x->>'papka_id')::bigint;
  if not exists (select 1 from public.t2_fayl_papka p where p.id = pid and p.tizim) then raise exception 'ACC2 manzil tizim papkasi emas'; end if;
  if (select hujjat_kalit from public.t2_hm_fayl where id = fid) <> 'nakopitelniy:' || o || ':2026-11' then raise exception 'ACC2 kalit %', (select hujjat_kalit from public.t2_hm_fayl where id = fid); end if;
  y := public.t2_disk_yetim_royxat_v1(a, k, 300);
  if exists (select 1 from jsonb_array_elements(y->'fayllar') e where (e->>'id')::bigint = fid) then raise exception 'ACC2 fayl hamon Biriktirilmagan ichida'; end if;
  -- 3. Endi biriktirilgan fayl qayta ko'chirilmaydi (YETIM_EMAS); yo'q fayl; loyihasiz
  if (public.t2_disk_yetim_kochir_v1(a, k, fid, l, o)->>'code') <> 'YETIM_EMAS' then raise exception 'ACC3 qayta kochirish'; end if;
  if (public.t2_disk_yetim_kochir_v1(a, k, -1, l, o)->>'code') <> 'FAYL_TOPILMADI' then raise exception 'ACC3 yoq fayl'; end if;
  -- 4. Xuddi shu hujjatning yangi versiyasi (keyin) KO'CHIRILGAN faylga qo'shiladi, yangi yetim fayl yaratilmaydi
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'nakopitelniy', '2026-11', 'acc_a4_v2.xlsx', 950, sha_b, 99602, 'stored', 'active', now(), 'docs/acc/a4b', a) returning id into r2;
  y := public.t2_disk_tizim_yoz_v1(a, k, r2, null, null, null, null, null);
  if y->>'ok' <> 'true' or (y->>'fayl_id')::bigint <> fid then raise exception 'ACC4 yangi versiya boshqa faylga tushdi %', y; end if;
  -- 5. Begona foydalanuvchi va ruxsat: kompaniya a'zosi emas -> rad; service_role dan boshqaga yopiq
  if b is not null then
    begin perform public.t2_disk_yetim_royxat_v1(b, k, 10); raise exception 'ACC5 begona royxat ko''rdi';
    exception when others then if sqlerrm like 'ACC5%' then raise; end if; end;
  end if;
  if has_function_privilege('authenticated', 'public.t2_disk_yetim_kochir_v1(bigint, bigint, bigint, bigint, bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_disk_yetim_royxat_v1(bigint, bigint, integer)', 'execute') then raise exception 'ACC5 authenticated chaqira oladi'; end if;
end $$;
