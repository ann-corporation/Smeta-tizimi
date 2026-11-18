-- Acceptance: 20270113900000_t2_f2_qol_olib_tashla_himoya_v1 (faqat sinov tranzaksiyasida, ROLLBACK bilan; migratsiya SQL idan keyin).
-- Isbot: olib tashlangan resurs tombstone (ota ish qatorida qolTahrir.olib) bilan belgilanadi; mijoz yuki (mavjud qatorlar, MCP/Jarvis/F2 sahifa
-- yo'li) bilan `t2_f2_qoralama_yangila_v1` dan keyin resurs QAYTMAYDI, tombstone saqlanadi, boshqa qatorlar soni o'zgarmaydi.
do $$
declare
  v record; v_a record; v_payload jsonb; v_r jsonb; v_n integer; v_oldin integer; v_keyin integer; v_ota bigint;
begin
  for v_a in select a.id, a.kompaniya_id, a.versiya from public.t2_akt a
              where a.tur = 'f2' and a.holat = 'qoralama' and coalesce(a.lifecycle_status, 'draft') = 'draft'
                and not exists (select 1 from public.t2_akt_qator s where s.akt_id = a.id and (s.manba_akt_qator_id is not null or s.raw_snapshot->>'source' = 'storno'))
              order by a.id limit 20
  loop
    select ac.qator_id as rs_id, c.ota_id as ota_id, null::bigint as akt_id, null::bigint as kompaniya_id, null::int as versiya into v
      from public.t2_akt_qator ac
      join public.t2_qator c on c.id = ac.qator_id and c.tur = 'rs' and coalesce(c.norma, 0) > 0
      join public.t2_akt_qator pa on pa.akt_id = ac.akt_id and pa.qator_id = c.ota_id
     where ac.akt_id = v_a.id
       and not exists (select 1 from public.t2_qator z where z.replaces_line_id = c.id)
     limit 1;
    if v.rs_id is not null then v.akt_id := v_a.id; v.kompaniya_id := v_a.kompaniya_id; v.versiya := v_a.versiya; exit; end if;
  end loop;
  if v.akt_id is null then raise notice 'SKIP: mos qoralama yo''q'; return; end if;

  -- olib tashlash (mcp olib_tashla ekvivalenti): qator o'chadi, tombstone ota ishga yoziladi
  delete from public.t2_akt_qator where akt_id = v.akt_id and qator_id = v.rs_id;
  select count(*) into v_oldin from public.t2_akt_qator where akt_id = v.akt_id;
  v_n := public._t2_f2_qol_olib_belgila_v1(v.akt_id, jsonb_build_array(v.rs_id));
  if v_n <> 1 then raise exception 'ACC1: tombstone % ota qatorga yozildi (1 kutilgan)', v_n; end if;
  if not exists (select 1 from public.t2_akt_qator where akt_id = v.akt_id and qator_id = v.ota_id
                  and raw_snapshot->'qolTahrir'->'olib' @> to_jsonb(array[v.rs_id])) then
    raise exception 'ACC2: tombstone ota qatorda yo''q';
  end if;

  -- «yangilash»: mijoz yuki = mavjud qatorlar (tombstone bilan); server almashtiradi
  select jsonb_agg(jsonb_build_object('qator_id', qator_id, 'certified_quantity', certified_quantity,
           'certified_unit_price', certified_unit_price, 'certified_amount', certified_amount,
           'price_intentionally_absent', certified_unit_price is null, 'certified_source_hash', certified_source_hash,
           'raw_snapshot', raw_snapshot, 'izoh', izoh) order by id) into v_payload
    from public.t2_akt_qator where akt_id = v.akt_id;
  v_r := public.t2_f2_qoralama_yangila_v1(183, v.kompaniya_id, v.akt_id, v.versiya, v_payload, gen_random_uuid(), 'acceptance');
  if coalesce((v_r->>'ok')::boolean, false) is not true then raise exception 'ACC3: yangilash rad: %', v_r; end if;

  select count(*) into v_keyin from public.t2_akt_qator where akt_id = v.akt_id;
  if v_keyin <> v_oldin then raise exception 'ACC4: qatorlar soni % -> %', v_oldin, v_keyin; end if;
  if exists (select 1 from public.t2_akt_qator where akt_id = v.akt_id and qator_id = v.rs_id) then
    raise exception 'ACC5: olib tashlangan qator qaytdi';
  end if;
  if not exists (select 1 from public.t2_akt_qator where akt_id = v.akt_id and qator_id = v.ota_id
                  and raw_snapshot->'qolTahrir'->'olib' @> to_jsonb(array[v.rs_id])) then
    raise exception 'ACC6: tombstone yangilashdan keyin yo''qoldi';
  end if;
  raise notice 'ACC OK: akt % rs % — olib tashlangan qator qaytmadi, tombstone saqlandi', v.akt_id, v.rs_id;
end $$;
