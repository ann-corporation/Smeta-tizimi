-- Qabul sinovi: FAQAT ROLLBACK ichida (migratsiyaning o'z begin/commit i yo'q). Sinov qatorlari ROLLBACK bilan yo'qoladi. Xato: raise exception 'ACC: ...'.
do $$
declare k bigint; a bigint; o bigint; r1 bigint; x jsonb; n integer; sha_a text := repeat('e', 64);
begin
  select s.kompaniya_id, b.obyekt_id into k, o from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
    join public.t2_obyekt ob on ob.id = b.obyekt_id and ob.kompaniya_id = s.kompaniya_id and ob.loyiha_id is not null
   where b.holat = 'faol' order by b.obyekt_id limit 1;
  if o is null then raise exception 'ACC: sinov uchun obyekt topilmadi'; end if;
  select m.foydalanuvchi_id into a from public.t2_azolik m where m.kompaniya_id = k and m.holat = 'faol' order by m.foydalanuvchi_id limit 1;
  -- 1. Daraxtga ulanmagan saqlangan hujjat (yozuv xatosi holati)
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'nakopitelniy', '2026-11', 'acc_yetim.xlsx', 700, sha_a, 99301, 'stored', 'active', now() - interval '1 hour', 'docs/acc/y1', a) returning id into r1;
  if exists (select 1 from public.t2_hm_versiya where registry_id = r1) then raise exception 'ACC1 oldindan ulangan'; end if;
  -- 2. Navbat ishlaydi: hujjat Diskka ulanadi, tashqi kalit belgilanadi, R2 kaliti nusxalanmaydi
  x := public.t2_disk_yetim_ishla_v1(500, 0);
  if x->>'ok' <> 'true' or (x->>'yozildi')::int < 1 then raise exception 'ACC2 navbat ishlamadi %', x; end if;
  if not exists (select 1 from public.t2_hm_versiya where registry_id = r1 and tashqi_kalit and r2_kalit = 'docs/acc/y1') then raise exception 'ACC2 hujjat ulanmadi'; end if;
  select count(*) into n from public.t2_hm_fayl f join public.t2_hm_versiya v on v.fayl_id = f.id where v.registry_id = r1 and f.hujjat_kalit like 'nakopitelniy:%';
  if n <> 1 then raise exception 'ACC2 fayl kaliti noto''g''ri'; end if;
  -- 3. Idempotent: ikkinchi ishga tushirish o'zgarish bermaydi
  select count(*) into n from public.t2_hm_versiya where registry_id is not null;
  x := public.t2_disk_yetim_ishla_v1(500, 0);
  if (select count(*) from public.t2_hm_versiya where registry_id is not null) <> n then raise exception 'ACC3 takroriy ishga tushirish versiya qo''shdi'; end if;
  -- 4. Navbatda yangi hujjat (kutish oynasi) ulanmaydi
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'nakopitelniy', '2026-12', 'acc_yetim2.xlsx', 700, repeat('f', 64), 99302, 'stored', 'active', now(), 'docs/acc/y2', a) returning id into r1;
  x := public.t2_disk_yetim_ishla_v1(500, 60);
  if exists (select 1 from public.t2_hm_versiya where registry_id = r1) then raise exception 'ACC4 kutish oynasi buzildi'; end if;
  -- 5. Faqat service_role
  if has_function_privilege('authenticated', 'public.t2_disk_yetim_ishla_v1(integer, integer)', 'execute') then raise exception 'ACC5 authenticated chaqira oladi'; end if;
end $$;