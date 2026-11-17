-- Acceptance: 20270109000000_t2_f2_resurs_tushgan_v1 (faqat sinov tranzaksiyasida, ROLLBACK bilan)
do $$
declare v_akt record; v_r jsonb; v_n int;
begin
  -- Sun'iy holat: ochiq F2 qoralamadan bitta BL ning bitta resursini olib tashlaymiz va tekshiruv uni topishi kerak.
  select aq.akt_id, a.kompaniya_id, a.versiya, c.id rs_id into v_akt
    from public.t2_akt a
    join public.t2_akt_qator aq on aq.akt_id = a.id
    join public.t2_qator p on p.id = aq.qator_id and p.tur = 'bl'
    join public.t2_qator c on c.ota_id = p.id
    join public.t2_qator_holat h on h.qator_id = c.id and h.versiya_holat = 'faol' and coalesce(h.f2_mumkin_hajm, 0) <> 0
    join public.t2_akt_qator ac on ac.akt_id = a.id and ac.qator_id = c.id
   where a.tur = 'f2' and a.holat = 'qoralama' and coalesce(a.lifecycle_status, 'draft') = 'draft' and coalesce(aq.hajm, 0) <> 0
     and not exists (select 1 from public.t2_qator z where z.replaces_line_id = c.id)
   limit 1;
  if v_akt.akt_id is null then raise notice 'SKIP: mos qoralama yo''q'; return; end if;

  v_n := public._t2_f2_resurs_tushgan_soni_v1(v_akt.akt_id);
  delete from public.t2_akt_qator where akt_id = v_akt.akt_id and qator_id = v_akt.rs_id;
  if public._t2_f2_resurs_tushgan_soni_v1(v_akt.akt_id) <> v_n + 1 then
    raise exception 'ACC1: tushgan resurs topilmadi (akt %, rs %)', v_akt.akt_id, v_akt.rs_id;
  end if;
  if not exists (select 1 from jsonb_array_elements(public._t2_f2_resurs_tushgan_v1(v_akt.akt_id, 500)) e
                  where (e->>'qator_id')::bigint = v_akt.rs_id) then
    raise exception 'ACC2: ro''yxatda rs % yo''q', v_akt.rs_id;
  end if;

  -- Yuborish bloklanadi
  v_r := public.t2_akt_lifecycle_transition_v1(v_akt.kompaniya_id, v_akt.akt_id, 'submitted', 183, v_akt.versiya,
           gen_random_uuid(), null);
  if v_r->>'code' is distinct from 'F2_RESURS_TUSHGAN' then
    raise exception 'ACC3: yuborish bloklanmadi: %', v_r;
  end if;
  raise notice 'ACC OK: akt % rs % — topildi va yuborish bloklandi', v_akt.akt_id, v_akt.rs_id;
end $$;
