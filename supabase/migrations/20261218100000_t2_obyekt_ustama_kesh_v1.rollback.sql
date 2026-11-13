-- Rollback 20261218100000: v2 ni oldingi (20261217800000, jonli hisob) ko'rinishga qaytaradi, kesh funksiyalari/jadvali/cron ni olib tashlaydi.
do $c$
begin
  if to_regnamespace('cron') is not null and exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 't2_obyekt_ustama_yangila') then perform cron.unschedule('t2_obyekt_ustama_yangila'); end if;
  end if;
end $c$;

create or replace function public.t2_zakazchik_obyektlar_v2(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint default null, p_ustama boolean default false)
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
                 'royxat', coalesce(jsonb_agg(jsonb_build_object('akt_id', t.id, 'raqam', t.raqam, 'oy', t.oy, 'jami', t.hujjat_jami)
                              || case when p_ustama then jsonb_build_object('ustama', public._t2_f2_ustamali(c.id, coalesce(t.shartnoma_id, (select b2.shartnoma_id from public.t2_shartnoma_bog b2 where b2.obyekt_id = o.id and b2.holat = 'faol' order by b2.shartnoma_id limit 1)), array[t.id])) else '{}'::jsonb end
                              order by t.oy desc nulls last, t.id desc), '[]'::jsonb))
                 || case when p_ustama and count(*) > 0 then jsonb_build_object('ustama_jami', public._t2_f2_ustamali(c.id, (select b3.shartnoma_id from public.t2_shartnoma_bog b3 where b3.obyekt_id = o.id and b3.holat = 'faol' order by b3.shartnoma_id limit 1), array_agg(t.id))) else '{}'::jsonb end
            from public.t2_akt t where t.obyekt_id = o.id and t.kompaniya_id = c.id and t.tur = 'f2' and t.lifecycle_status = 'approved') end,
      'kutayotgan_taqdim', (select count(*) from public.t2_tomon_taqdim q where q.obyekt_id = o.id and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat in ('yuborilgan','ko_rilmoqda'))
    ) x
      from public.t2_tomon_aloqa a
      join public.t2_kompaniya c on c.id = public._t2_tomon_qarshi(a, p_kompaniya_id)
      join public.t2_obyekt o on o.kompaniya_id = c.id and o.holat = 'faol' and (p_obyekt_id is null or o.id = p_obyekt_id)
     where a.holat = 'faol' and (a.taklif_kompaniya_id = p_kompaniya_id or a.qabul_kompaniya_id = p_kompaniya_id)
       and public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'obyekt_holat', 'korish', o.id)
  ) s;
  return v;
end $$;
revoke all on function public.t2_zakazchik_obyektlar_v2(bigint, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.t2_zakazchik_obyektlar_v2(bigint, bigint, bigint, boolean) to service_role;

drop function if exists public._t2_obyekt_ustama_oqi_v1(bigint);
drop function if exists public.t2_obyekt_ustama_yangila_v1(integer);
drop function if exists public._t2_obyekt_ustama_hisobla_v1(bigint);
drop table if exists public.t2_obyekt_ustama_kesh;