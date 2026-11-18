-- Qabul sinovi: FAQAT ROLLBACK ichida (rb_run; migratsiyaning o'z begin/commit i yo'q). Haqiqiy ma'lumot: faol a'zo + faol shartnoma bog'i bor obyekt
-- t2_azolik.holat='faol' / t2_shartnoma_bog.holat='faol' dan tanlanadi; sinov qatorlari ROLLBACK bilan yo'qoladi. Xato: raise exception 'ACC: ...'.
do $$
declare
  k bigint; a bigint; o bigint; sh bigint; k2 bigint; r1 bigint; r2 bigint; r3 bigint; x jsonb; f jsonb; used0 bigint; n integer; v_olingan boolean := false;
begin
  -- 0. BACKFILL invarianti: hamma saqlangan hujjatda kalit bor (dublikatlar kalit orqali versiyaga yig'ilgan)
  select count(*) into n from public.t2_document_registry where canonical_storage_status = 'stored' and hujjat_kalit is null;
  if n <> 0 then raise exception 'ACC0 backfill: kalitsiz hujjat % ta', n; end if;
  if exists (select 1 from public.t2_document_registry where canonical_storage_status = 'stored' and manba_turi is null) then raise exception 'ACC0 backfill: manbasiz hujjat'; end if;

  -- sinov obyekti: faol shartnoma bog'i + shu kompaniyaning faol a'zosi
  select b.obyekt_id, s.id, s.kompaniya_id into o, sh, k from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
    join public.t2_obyekt ob on ob.id = b.obyekt_id and ob.kompaniya_id = s.kompaniya_id
   where b.holat = 'faol' and exists (select 1 from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol'
                                       where m.kompaniya_id = s.kompaniya_id and m.holat = 'faol')
   order by b.obyekt_id limit 1;
  if o is null then raise exception 'ACC: sinov uchun faol shartnoma bog''li obyekt topilmadi'; end if;
  select m.foydalanuvchi_id into a from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol'
   where m.kompaniya_id = k and m.holat = 'faol' order by m.foydalanuvchi_id limit 1;
  select kompaniya_id into k2 from public.t2_azolik where holat = 'faol' and kompaniya_id <> k limit 1;

  -- 1. Ikki marta chiqarilgan BIR hujjat (bir xil kalit) = bitta hujjatning 2 versiyasi
  select (public._t2_hm_kvota_v1(k, null)->>'ishlatilgan')::bigint into used0;
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, mime_type, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at)
  values (k, o, 'f2_hujjat', '2026-11', 'acc_f2_v1.xlsx', 'application/octet-stream', 1000, repeat('1', 64), 9001, 'stored', 'active', now() - interval '1 hour') returning id into r1;
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, mime_type, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at)
  values (k, o, 'f2_hujjat', '2026-11', 'acc_f2_v2.xlsx', 'application/octet-stream', 2000, repeat('2', 64), 9002, 'stored', 'active', now()) returning id into r2;
  x := public.t2_disk_tizim_meta_v1(a, k, r1, 'f2', 5, 'f2:acc:5', null, 'F-2 ' || chr(8470) || '5 ' || chr(8212) || ' ACC ' || chr(8212) || ' 2026-11');
  if x->>'ok' <> 'true' or (x->>'versiya')::int <> 1 or (x->>'versiyalar')::int <> 1 then raise exception 'ACC1 birinchi versiya %', x; end if;
  if (x->>'shartnoma_id')::bigint <> sh then raise exception 'ACC1 shartnoma obyekt bog''idan aniqlanmadi %', x; end if;
  x := public.t2_disk_tizim_meta_v1(a, k, r2, 'f2', 5, 'f2:acc:5', null, 'F-2 ' || chr(8470) || '5 ' || chr(8212) || ' ACC ' || chr(8212) || ' 2026-11');
  if (x->>'versiya')::int <> 2 or (x->>'versiyalar')::int <> 2 then raise exception 'ACC1 ikkinchi versiya yangi fayl bo''lib qoldi %', x; end if;
  x := public.t2_disk_tizim_meta_v1(a, k, r2, 'f2', 5, 'f2:acc:5', null, null);
  if (x->>'versiya')::int <> 2 then raise exception 'ACC1 takroriy meta versiyani o''zgartirdi %', x; end if;

  -- 2. Explorer: shartnoma, nom, manba, versiya zanjiri; eski versiya 'oxirgi' emas
  f := public.t2_fayl_explorer_v1(a, k);
  if f->>'ok' <> 'true' then raise exception 'ACC2 explorer %', f; end if;
  select e into x from jsonb_array_elements(f->'fayllar') e where (e->>'id')::bigint = r2;
  if x is null or (x->>'oxirgi')::boolean is not true or (x->>'versiya')::int <> 2 or (x->>'versiyalar')::int <> 2 or (x->>'shartnoma_id')::bigint <> sh
     or x->>'manba_turi' <> 'f2' or (x->>'manba_id')::bigint <> 5 or x->>'hujjat_kalit' <> 'f2:acc:5' or x->>'nom' not like 'F-2 %' then raise exception 'ACC2 oxirgi versiya maydonlari %', x; end if;
  select e into x from jsonb_array_elements(f->'fayllar') e where (e->>'id')::bigint = r1;
  if (x->>'oxirgi')::boolean is not false or (x->>'versiya')::int <> 1 then raise exception 'ACC2 eski versiya %', x; end if;
  if x->>'asl_nom' <> 'acc_f2_v1.xlsx' then raise exception 'ACC2 asl nom yo''qoldi %', x; end if;
  -- kalitsiz (qo'lda yuklangan) hujjat: oldingi xulq (oxirgi = true, versiyalar = 1)
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, original_filename, size_bytes, revision_seq, canonical_storage_status, status, finalized_at)
  values (k, o, 'hujjat', 'acc_qolda.pdf', 500, 9003, 'stored', 'active', now()) returning id into r3;
  f := public.t2_fayl_explorer_v1(a, k);
  select e into x from jsonb_array_elements(f->'fayllar') e where (e->>'id')::bigint = r3;
  if (x->>'oxirgi')::boolean is not true or (x->>'versiyalar')::int <> 1 or (x->>'versiya')::int <> 9003 then raise exception 'ACC2 kalitsiz hujjat %', x; end if;

  -- 3. Ruxsat va izolyatsiya
  begin
    perform public.t2_disk_tizim_meta_v1(-1, k, r1, 'f2', 5, 'f2:acc:5', null, null); raise exception 'ACC3 a''zo bo''lmagan meta yozdi';
  exception when others then if sqlerrm like 'ACC3%' then raise; end if; end;
  if k2 is not null then
    begin perform public.t2_fayl_explorer_v1(a, k2); raise exception 'ACC3 begona kompaniya explorer ochildi';
    exception when others then if sqlerrm like 'ACC3%' then raise; end if; end;
  end if;
  if (public.t2_disk_tizim_meta_v1(a, k, 0, 'f2', 5, 'f2:acc:5', null, null)->>'code') <> 'HUJJAT_TOPILMADI' then raise exception 'ACC3 yo''q hujjat'; end if;
  if (public.t2_disk_tizim_meta_v1(a, k, r1, 'F2 NOTOGRI', 5, 'f2:acc:5', null, null)->>'code') <> 'MANBA_NOTOGRI' then raise exception 'ACC3 manba tekshiruvi'; end if;

  -- 4. Disk hajmi: tizim hujjatlari (3 qator: 1000 + 2000 + 500) kompaniya hajmiga qo'shilgan
  if (public._t2_hm_kvota_v1(k, null)->>'ishlatilgan')::bigint <> used0 + 3500 then raise exception 'ACC4 tizim hujjatlari hajmga kirmadi: % -> %', used0, public._t2_hm_kvota_v1(k, null); end if;
  if (public._t2_hm_kvota_v1(null, a)->>'ishlatilgan')::bigint < 0 then raise exception 'ACC4 shaxsiy'; end if;

  raise notice 'ACC OK: t2_disk_tizim_hujjat_v1 (K=%, A=%, O=%, SH=%)', k, a, o, sh;
end $$;
