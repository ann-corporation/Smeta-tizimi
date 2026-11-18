-- Scoped exact lookup for the current estimate. Neither prices nor amounts are projected.
create function public.t2_jarvis_smeta_qator_aniq_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_kod text
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_kod text := regexp_replace(translate(upper(btrim(p_kod)), 'ЕСАКМНРХ‐‑–—', 'ECAKMHPX----'), '[[:space:]]+', ' ', 'g');
begin
  if coalesce(p_actor_id, 0) <= 0 or coalesce(p_kompaniya_id, 0) <= 0 or coalesce(p_obyekt_id, 0) <= 0 or
     coalesce(v_kod, '') !~ '^[A-ZЦУЮ]{1,3}[0-9]{1,4}(-[0-9]{1,5}){1,5}( K-[0-9]{1,4}){0,4}$' then
    return jsonb_build_object('ok', false, 'code', 'QATOR_QUERY_INVALID');
  end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.read');
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    raise exception 'Estimate object outside company' using errcode = '42501';
  end if;

  return (
    with recursive matches as (
      select q.id, q.ota_id, q.tartib, q.kod, q.nom, q.tur, q.birlik, q.hajm
      from public.t2_qator q
      where q.obyekt_id = p_obyekt_id and q.kompaniya_id = p_kompaniya_id and q.versiya_holat = 'faol'
        and regexp_replace(translate(upper(btrim(q.kod)), 'ЕСАКМНРХ‐‑–—', 'ECAKMHPX----'), '[[:space:]]+', ' ', 'g') = v_kod
      order by q.tartib, q.id limit 6
    ), ancestors as (
      select q.id as row_id, q.id as ancestor_id, q.ota_id, q.nom, 0 as depth, array[q.id] as visited
      from matches q
      union all
      select a.row_id, q.id, q.ota_id, q.nom, a.depth + 1, a.visited || q.id
      from ancestors a join public.t2_qator q on q.id = a.ota_id
      where a.depth < 16 and not q.id = any(a.visited)
        and q.obyekt_id = p_obyekt_id and q.kompaniya_id = p_kompaniya_id and q.versiya_holat = 'faol'
    )
    select jsonb_build_object('ok', true, 'kompaniya_id', p_kompaniya_id, 'obyekt_id', p_obyekt_id,
      'qatorlar', coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kod', m.kod, 'nom', m.nom, 'tur', m.tur, 'birlik', m.birlik, 'hajm', m.hajm,
        'ierarxiya', path.names, 'ierarxiya_toliq', path.complete) order by m.tartib, m.id), '[]'::jsonb))
    from matches m cross join lateral (
      select coalesce(jsonb_agg(a.nom order by a.depth desc) filter (where a.depth > 0), '[]'::jsonb) as names,
        bool_or(a.ota_id is null) as complete
      from ancestors a where a.row_id = m.id
    ) path
  );
end
$$;

revoke all on function public.t2_jarvis_smeta_qator_aniq_v1(bigint,bigint,bigint,text) from public, anon, authenticated;
grant execute on function public.t2_jarvis_smeta_qator_aniq_v1(bigint,bigint,bigint,text) to service_role;
