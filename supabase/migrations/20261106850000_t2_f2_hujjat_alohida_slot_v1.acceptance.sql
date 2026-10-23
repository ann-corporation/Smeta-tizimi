-- Acceptance: 20261106850000 — ikki xil F2 fayli bir obyektda ikkalasi ham 'active'; bir xil fayl takror — dedup.
-- BEGIN … ROLLBACK ichida ishlaydi (hech narsa saqlanmaydi). Sun'iy sha256 qiymatlari.
begin;
do $acc$
declare v_k bigint; v_l bigint; v_o bigint; v_a bigint; r1 jsonb; r2 jsonb; r3 jsonb; f jsonb;
  s1 text := repeat('a1', 32); s2 text := repeat('b2', 32);
begin
  select o.kompaniya_id, o.loyiha_id, o.id, z.foydalanuvchi_id into v_k, v_l, v_o, v_a
    from public.t2_obyekt o
    join public.t2_azolik z on z.kompaniya_id = o.kompaniya_id and z.holat = 'faol'
    join public.t2_foydalanuvchi u on u.id = z.foydalanuvchi_id and u.holat = 'faol'
    join public.t2_kompaniya k on k.id = o.kompaniya_id and k.faol
   order by o.id limit 1;
  if v_o is null then raise exception 'test obyekti topilmadi'; end if;

  r1 := public.t2_document_canonical_reserve_v1(v_k, v_a, v_l, v_o, 'f2_akt', 'a.xlsx', 'application/octet-stream', 10, s1, gen_random_uuid(), null);
  f := public.t2_document_canonical_finalize_v1(v_k, v_a, (r1->>'document_id')::bigint,
    (select operation_id from public.t2_document_registry where id = (r1->>'document_id')::bigint), r1->>'r2_key', s1, 10, true, 'server');
  if f->>'ok' <> 'true' then raise exception 'finalize 1: %', f; end if;
  r2 := public.t2_document_canonical_reserve_v1(v_k, v_a, v_l, v_o, 'f2_akt', 'b.xlsx', 'application/octet-stream', 10, s2, gen_random_uuid(), null);
  f := public.t2_document_canonical_finalize_v1(v_k, v_a, (r2->>'document_id')::bigint,
    (select operation_id from public.t2_document_registry where id = (r2->>'document_id')::bigint), r2->>'r2_key', s2, 10, true, 'server');
  if f->>'ok' <> 'true' then raise exception 'finalize 2: %', f; end if;

  if (select count(*) from public.t2_document_registry
       where id in ((r1->>'document_id')::bigint, (r2->>'document_id')::bigint) and status = 'active') <> 2 then
    raise exception 'ikkinchi F2 fayli birinchisini superseded qildi';
  end if;
  if (select source_slot_key from public.t2_document_registry where id = (r1->>'document_id')::bigint) <> 'f2:' || s1 then
    raise exception 'slot yozilmadi';
  end if;
  r3 := public.t2_document_canonical_reserve_v1(v_k, v_a, v_l, v_o, 'f2_akt', 'a-nusxa.xlsx', 'application/octet-stream', 10, s1, gen_random_uuid(), null);
  if (r3->>'document_id') <> (r1->>'document_id') or (r3->>'dedup') <> 'true' then raise exception 'takror fayl dedup bo''lmadi: %', r3; end if;

  -- smeta hujjatlari (slotsiz) o'zgarmagan: f2_akt dan boshqa tur slot olmaydi.
  r3 := public.t2_document_canonical_reserve_v1(v_k, v_a, v_l, v_o, 'hujjat', 'c.pdf', 'application/pdf', 10, repeat('c3', 32), gen_random_uuid(), null);
  if (select source_slot_key from public.t2_document_registry where id = (r3->>'document_id')::bigint) is not null then
    raise exception 'f2_akt dan boshqa turga slot qo''yildi';
  end if;

  -- invariant: har slotda ko'pi bilan bitta active f2_akt
  if exists (select 1 from public.t2_document_registry where document_type = 'f2_akt' and status = 'active'
              group by kompaniya_id, loyiha_id, obyekt_id, source_slot_key having count(*) > 1) then
    raise exception 'slotda bir nechta active';
  end if;
  if exists (select 1 from public.t2_document_registry where document_type = 'f2_akt' and source_slot_key is null and sha256 is not null) then
    raise exception 'slotsiz f2_akt qoldi';
  end if;
  raise notice 'ACCEPTANCE OK';
end $acc$;
rollback;
