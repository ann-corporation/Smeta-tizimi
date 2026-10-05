-- Tomon resurs katalogini UI ga berish (faqat faol a'zo; faol resurslar). Yangi resurs = t2_tomon_resurs ga bitta qator.
create or replace function public.t2_tomon_resurslar_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  return coalesce((select jsonb_agg(jsonb_build_object('kalit', r.kalit, 'nom', r.nom, 'nom_ru', r.nom_ru, 'guruh', r.guruh, 'amallar', r.amallar,
                                                       'taqdim_mumkin', r.taqdim_mumkin, 'izoh', r.izoh) order by r.tartib, r.kalit)
                     from public.t2_tomon_resurs r where r.faol), '[]'::jsonb);
end $$;
revoke all on function public.t2_tomon_resurslar_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_tomon_resurslar_v1(bigint, bigint) to service_role;
