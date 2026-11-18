-- Acceptance: 20270113800000_t2_f2_qol_tahrir_himoya_v1 (faqat sinov tranzaksiyasida, ROLLBACK bilan; migratsiya SQL idan keyin).
-- Isbot: qo'lda belgilangan resurs hajmi/narxi `t2_f2_qoralama_yangila_v1` dan (mijoz yuki = mavjud qatorlar, MCP/Jarvis yo'li) keyin
-- AYNAN saqlanadi, raw_snapshot.qolTahrir belgisi yo'qolmaydi; belgisiz qatorlarga belgi qo'yilmaydi; qatorlar soni o'zgarmaydi.
do $$
declare
  v record; v_a record; v_payload jsonb; v_r jsonb; v_n integer; v_soni_oldin integer; v_soni_keyin integer;
  v_hajm_oldin numeric; v_narx_oldin numeric; v_belgi jsonb; v_boshqa_belgi integer; v_oldin_belgili boolean;
begin
  -- Tez tanlov: avval aktlar (storno/almashtirilgan yo'q), keyin shu aktdan bitta resurs.
  for v_a in select a.id, a.kompaniya_id, a.versiya from public.t2_akt a
              where a.tur = 'f2' and a.holat = 'qoralama' and coalesce(a.lifecycle_status, 'draft') = 'draft'
                and not exists (select 1 from public.t2_akt_qator s where s.akt_id = a.id and (s.manba_akt_qator_id is not null or s.raw_snapshot->>'source' = 'storno'))
              order by a.id limit 20
  loop
    select ac.qator_id as rs_id, ac.hajm as hajm, null::bigint as akt_id, null::bigint as kompaniya_id, null::int as versiya into v
      from public.t2_akt_qator ac
      join public.t2_qator c on c.id = ac.qator_id and c.tur in ('rs', 'mat', 'ob') and coalesce(c.norma, 0) > 0
      join public.t2_akt_qator pa on pa.akt_id = ac.akt_id and pa.qator_id = c.ota_id and coalesce(pa.hajm, 0) <> 0
     where ac.akt_id = v_a.id and coalesce(ac.hajm, 0) <> 0 and ac.narx is not null
       and not exists (select 1 from public.t2_qator z where z.replaces_line_id = c.id)
     limit 1;
    if v.rs_id is not null then v.akt_id := v_a.id; v.kompaniya_id := v_a.kompaniya_id; v.versiya := v_a.versiya; exit; end if;
  end loop;  if v.akt_id is null then raise notice 'SKIP: mos qoralama yo''q'; return; end if;

  select count(*) into v_soni_oldin from public.t2_akt_qator where akt_id = v.akt_id;
  select count(*) into v_boshqa_belgi from public.t2_akt_qator where akt_id = v.akt_id and raw_snapshot ? 'qolTahrir';

  select raw_snapshot ? 'qolTahrir' into v_oldin_belgili from public.t2_akt_qator where akt_id = v.akt_id and qator_id = v.rs_id;
  -- 1) belgi qo'yish (backfill yordamchisi): faqat shu resurs
  v_n := public._t2_f2_qol_belgila_v1(v.akt_id, jsonb_build_array(jsonb_build_object('qator_id', v.rs_id, 'hajm', v.hajm, 'narx', 1)));
  if v_n <> 1 then raise exception 'ACC1: belgi % qatorga qo''yildi (1 kutilgan)', v_n; end if;
  select raw_snapshot->'qolTahrir', certified_quantity, certified_unit_price into v_belgi, v_hajm_oldin, v_narx_oldin
    from public.t2_akt_qator where akt_id = v.akt_id and qator_id = v.rs_id;
  if v_belgi->>'hajm' is distinct from 'true' or v_belgi->>'narx' is distinct from 'true' or (v_belgi->>'norma') is null then
    raise exception 'ACC2: belgi to''liq emas: %', v_belgi;
  end if;
  if (select count(*) from public.t2_akt_qator where akt_id = v.akt_id and raw_snapshot ? 'qolTahrir') <> v_boshqa_belgi + (case when v_oldin_belgili then 0 else 1 end) then
    raise exception 'ACC3: belgisiz qatorlarga ham belgi qo''yilgan';
  end if;

  -- 2) «yangilash»: mijoz yuki = mavjud qatorlar (raw_snapshot aynan), server qatorlarni to'liq almashtiradi
  select jsonb_agg(jsonb_build_object('qator_id', qator_id, 'certified_quantity', certified_quantity,
           'certified_unit_price', certified_unit_price, 'certified_amount', certified_amount,
           'price_intentionally_absent', certified_unit_price is null, 'certified_source_hash', certified_source_hash,
           'raw_snapshot', raw_snapshot, 'izoh', izoh) order by id) into v_payload
    from public.t2_akt_qator where akt_id = v.akt_id;
  v_r := public.t2_f2_qoralama_yangila_v1(183, v.kompaniya_id, v.akt_id, v.versiya, v_payload, gen_random_uuid(), 'acceptance');
  if coalesce((v_r->>'ok')::boolean, false) is not true then raise exception 'ACC4: yangilash rad: %', v_r; end if;

  -- 3) yangilashdan keyin qo'lda qiymat va belgi saqlangan
  select count(*) into v_soni_keyin from public.t2_akt_qator where akt_id = v.akt_id;
  if v_soni_keyin <> v_soni_oldin then raise exception 'ACC5: qatorlar soni % -> %', v_soni_oldin, v_soni_keyin; end if;
  if not exists (select 1 from public.t2_akt_qator
                  where akt_id = v.akt_id and qator_id = v.rs_id
                    and certified_quantity = v_hajm_oldin and certified_unit_price = v_narx_oldin
                    and raw_snapshot->'qolTahrir'->>'hajm' = 'true' and raw_snapshot->'qolTahrir'->>'narx' = 'true'
                    and (raw_snapshot->'qolTahrir'->>'norma')::numeric = (v_belgi->>'norma')::numeric) then
    raise exception 'ACC6: qo''lda hajm/narx yoki belgi yangilashdan keyin yo''qoldi (akt %, qator %)', v.akt_id, v.rs_id;
  end if;
  raise notice 'ACC OK: akt % qator % — qo''lda hajm/narx va belgi yangilashdan keyin saqlandi', v.akt_id, v.rs_id;
end $$;
