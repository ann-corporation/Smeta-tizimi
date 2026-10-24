-- Rollback: 20261108102000 - eski t2_zakazchik_obyektlar_v1 / t2_tomon_taqdimlar_v1 ni tiklaydi, yordamchini o'chiradi.
create or replace function public.t2_zakazchik_obyektlar_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by x->>'qarshi_nom', x->>'obyekt_nom'), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'aloqa_id', a.id, 'qarshi_kompaniya_id', c.id, 'qarshi_nom', c.nom, 'qarshi_rol', case when a.taklif_kompaniya_id = p_kompaniya_id then a.qabul_rol else a.taklif_rol end,
      'obyekt_id', o.id, 'obyekt_nom', o.nom,
      'shartnoma', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'shartnoma_xulosa', 'korish', o.id) then (
          select jsonb_build_object('raqam', s.raqam, 'nom', s.nom, 'summa_bez_nds', s.summa_bez_nds, 'jami_nds_bilan', s.jami_nds_bilan)
            from public.t2_shartnoma s join public.t2_shartnoma_bog b on b.shartnoma_id = s.id and b.holat = 'faol'
           where b.obyekt_id = o.id and s.holat = 'faol' order by s.asosiy desc nulls last, s.id limit 1) end,
      'f2', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'f2', 'korish', o.id) then (
          select jsonb_build_object('soni', count(*), 'jami', coalesce(sum(t.hujjat_jami), 0), 'oxirgi_oy', max(t.oy),
                 'royxat', coalesce(jsonb_agg(jsonb_build_object('akt_id', t.id, 'raqam', t.raqam, 'oy', t.oy, 'jami', t.hujjat_jami) order by t.oy desc nulls last, t.id desc), '[]'::jsonb))
            from public.t2_akt t where t.obyekt_id = o.id and t.kompaniya_id = c.id and t.tur = 'f2' and t.lifecycle_status = 'approved') end,
      'kutayotgan_taqdim', (select count(*) from public.t2_tomon_taqdim q where q.obyekt_id = o.id and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat in ('yuborilgan','ko_rilmoqda'))
    ) x
      from public.t2_tomon_aloqa a
      join public.t2_kompaniya c on c.id = public._t2_tomon_qarshi(a, p_kompaniya_id)
      join public.t2_obyekt o on o.kompaniya_id = c.id and o.holat = 'faol'
     where a.holat = 'faol' and (a.taklif_kompaniya_id = p_kompaniya_id or a.qabul_kompaniya_id = p_kompaniya_id)
       and public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'obyekt_holat', 'korish', o.id)
  ) s;
  return v;
end $$;

create or replace function public.t2_tomon_taqdimlar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text, p_holat text, p_aloqa_id bigint, p_limit integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 300);
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', q.id, 'aloqa_id', q.aloqa_id, 'resurs', q.resurs, 'nom', q.nom, 'oy', q.oy, 'summa', q.summa, 'holat', q.holat,
      'kelgan', q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id,
      'qarshi_nom', (select k.nom from public.t2_kompaniya k where k.id = case when q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id then q.taqdim_etuvchi_kompaniya_id else q.qabul_qiluvchi_kompaniya_id end),
      'obyekt_nom', (select o.nom from public.t2_obyekt o where o.id = q.obyekt_id),
      'taqdim_vaqti', q.taqdim_vaqti, 'qaror_vaqti', q.qaror_vaqti, 'qaror_izoh', q.qaror_izoh, 'oldingi_taqdim_id', q.oldingi_taqdim_id) x
      from public.t2_tomon_taqdim q
     where ((p_yonalish = 'kelgan' and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id)
         or (p_yonalish = 'yuborilgan' and q.taqdim_etuvchi_kompaniya_id = p_kompaniya_id)
         or (coalesce(p_yonalish, '') not in ('kelgan','yuborilgan') and (q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id or q.taqdim_etuvchi_kompaniya_id = p_kompaniya_id)))
       and (p_holat is null or p_holat = '' or q.holat = p_holat)
       and (p_aloqa_id is null or q.aloqa_id = p_aloqa_id)
     order by q.id desc limit v_lim
  ) s;
  return v;
end $$;
drop function if exists public._t2_f2_ustamali(bigint, bigint, bigint[]);
