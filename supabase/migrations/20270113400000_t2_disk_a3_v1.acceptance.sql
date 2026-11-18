-- Qabul sinovi: FAQAT ROLLBACK ichida (migratsiyaning o'z begin/commit i yo'q). Xato: raise exception 'ACC: ...'.
do $$
declare k bigint; a bigint; o bigint; r1 bigint; x jsonb; y jsonb; fid bigint; pid bigint; fq jsonb; b bigint; sha_a text := repeat('9', 64);
begin
  select s.kompaniya_id, b2.obyekt_id into k, o from public.t2_shartnoma_bog b2 join public.t2_shartnoma s on s.id = b2.shartnoma_id
    join public.t2_obyekt ob on ob.id = b2.obyekt_id and ob.kompaniya_id = s.kompaniya_id and ob.loyiha_id is not null
   where b2.holat = 'faol' order by b2.obyekt_id limit 1;
  if o is null then raise exception 'ACC: sinov uchun obyekt topilmadi'; end if;
  select m.foydalanuvchi_id into a from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol' where m.kompaniya_id = k and m.holat = 'faol' order by m.foydalanuvchi_id limit 1;
  select u.id into b from public.t2_foydalanuvchi u where u.holat = 'faol' and not exists (select 1 from public.t2_azolik m where m.foydalanuvchi_id = u.id and m.kompaniya_id = k and m.holat = 'faol') order by u.id limit 1;
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'f2_hujjat', '2026-11', 'acc_a3.xlsx', 900, sha_a, 99401, 'stored', 'active', now() - interval '1 hour', 'docs/acc/a3', a) returning id into r1;
  x := public.t2_disk_tizim_yoz_v1(a, k, r1, 'f2', 77, 'f2:acc:a3', null, null);
  if x->>'ok' <> 'true' then raise exception 'ACC1 yozuv %', x; end if;
  fid := (x->>'fayl_id')::bigint; pid := (x->>'papka_id')::bigint;
  -- 1. Royxat: tizim fayliga manba va obyekt qo'shilgan; papkada tizim belgisi
  y := public.t2_hm_royxat_v1(a, k, pid, false);
  if y->>'ok' <> 'true' then raise exception 'ACC1 royxat %', y; end if;
  select e into fq from jsonb_array_elements(y->'fayllar') e where (e->>'id')::bigint = fid;
  if fq is null or fq->>'manba_turi' <> 'f2' or (fq->>'manba_id')::bigint <> 77 or (fq->>'obyekt_id')::bigint <> o or fq->>'hujjat_kalit' <> 'f2:acc:a3' or (fq->>'tizim_hujjat')::boolean is not true then raise exception 'ACC1 fayl maydonlari %', fq; end if;
  y := public.t2_hm_royxat_v1(a, k, null, false);
  if not exists (select 1 from jsonb_array_elements(y->'papkalar') e where (e->>'tizim')::boolean) then raise exception 'ACC1 ildizda tizim papkasi yoq'; end if;
  -- 2. Foydalanuvchining oddiy fayli: tizim_hujjat = false, manba yo'q
  insert into public.t2_hm_fayl(kompaniya_id, papka_id, nom, mime, yaratdi_id) values (k, null, 'acc_oddiy_a3.txt', 'text/plain', a) returning id into fid;
  y := public.t2_hm_royxat_v1(a, k, null, false);
  select e into fq from jsonb_array_elements(y->'fayllar') e where (e->>'id')::bigint = fid;
  if fq is null or (fq->>'tizim_hujjat')::boolean is not false or fq->>'manba_turi' is not null then raise exception 'ACC2 oddiy fayl %', fq; end if;
  -- 3. Eski havola: registry id -> fayl va papka; boshqa kompaniya a'zosi uchun rad
  x := public.t2_hm_registry_joy_v1(a, r1);
  if x->>'ok' <> 'true' or (x->>'papka_id')::bigint <> pid or (x->>'kompaniya_id')::bigint <> k then raise exception 'ACC3 registry_joy %', x; end if;
  if b is not null and (public.t2_hm_registry_joy_v1(b, r1)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC3 begona foydalanuvchi ko''rdi'; end if;
  if (public.t2_hm_registry_joy_v1(a, -1)->>'code') <> 'FAYL_TOPILMADI' then raise exception 'ACC3 yoq hujjat'; end if;
  -- 4. Faqat service_role
  if has_function_privilege('authenticated', 'public.t2_hm_registry_joy_v1(bigint, bigint)', 'execute') or has_function_privilege('authenticated', 'public.t2_hm_royxat_v1(bigint, bigint, bigint, boolean)', 'execute') then raise exception 'ACC4 authenticated chaqira oladi'; end if;
end $$;