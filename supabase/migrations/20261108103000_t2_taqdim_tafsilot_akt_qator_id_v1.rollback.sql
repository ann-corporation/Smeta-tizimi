-- Rollback: eski t2_tomon_taqdim_tafsilot_v1 (additiv maydonlarsiz).
create or replace function public.t2_tomon_taqdim_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.t2_tomon_taqdim; v_qatorlar jsonb := '[]'::jsonb; v_jami integer := 0; v_xesh_hozir text; v_hodisalar jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id;
  if not found or (q.taqdim_etuvchi_kompaniya_id <> p_kompaniya_id and q.qabul_qiluvchi_kompaniya_id <> p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taqdim topilmadi');
  end if;
  if q.resurs = 'f2' and q.manba_jadval = 't2_akt' then
    select count(*) into v_jami from public.t2_akt_qator where akt_id = q.manba_id;
    select coalesce(jsonb_agg(z order by (z->>'tartib')::bigint), '[]'::jsonb) into v_qatorlar from (
      select jsonb_build_object('qator_id', aq.qator_id, 'tartib', row_number() over (order by qq.tartib, qq.id), 'kod', qq.kod, 'nom', qq.nom, 'birlik', qq.birlik, 'tur', qq.tur, 'kat', qq.kat,
             'hajm', coalesce(aq.certified_quantity, aq.hajm), 'narx', coalesce(aq.certified_unit_price, aq.narx), 'summa', coalesce(aq.certified_amount, aq.summa), 'narx_manba', aq.narx_manba) z
        from public.t2_akt_qator aq join public.t2_qator qq on qq.id = aq.qator_id
       where aq.akt_id = q.manba_id order by qq.tartib, qq.id limit 5000) s;
    v_xesh_hozir := public._t2_tomon_f2_xesh(q.manba_id);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'tur', e.tur, 'matn', e.matn, 'vaqt', e.vaqt, 'meni', e.kompaniya_id = p_kompaniya_id,
           'kompaniya_nom', (select nom from public.t2_kompaniya where id = e.kompaniya_id)) order by e.id), '[]'::jsonb)
    into v_hodisalar from public.t2_tomon_hodisa e where e.taqdim_id = q.id;
  return jsonb_build_object('ok', true,
    'taqdim', jsonb_build_object('id', q.id, 'aloqa_id', q.aloqa_id, 'resurs', q.resurs, 'nom', q.nom, 'oy', q.oy, 'summa', q.summa, 'holat', q.holat, 'snapshot', q.snapshot,
        'kelgan', q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id, 'obyekt_nom', (select o.nom from public.t2_obyekt o where o.id = q.obyekt_id),
        'etuvchi_nom', (select nom from public.t2_kompaniya where id = q.taqdim_etuvchi_kompaniya_id), 'qabul_qiluvchi_nom', (select nom from public.t2_kompaniya where id = q.qabul_qiluvchi_kompaniya_id),
        'taqdim_vaqti', q.taqdim_vaqti, 'taqdim_izoh', q.taqdim_izoh, 'qaror_vaqti', q.qaror_vaqti, 'qaror_izoh', q.qaror_izoh, 'oldingi_taqdim_id', q.oldingi_taqdim_id,
        'document_id', case when q.manba_jadval = 't2_document_registry' then q.manba_id end),
    'qatorlar', v_qatorlar, 'qator_jami', v_jami, 'qisqartirilgan', v_jami > 5000,
    'butunlik_ok', case when q.resurs = 'f2' then v_xesh_hozir is not distinct from q.snapshot_xesh else null end,
    'hodisalar', v_hodisalar);
end $$;
revoke all on function public.t2_tomon_taqdim_tafsilot_v1(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_tomon_taqdim_tafsilot_v1(bigint, bigint, bigint) to service_role;