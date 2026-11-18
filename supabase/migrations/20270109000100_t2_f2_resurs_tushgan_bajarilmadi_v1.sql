-- 20270109000100_t2_f2_resurs_tushgan_bajarilmadi_v1
-- Egasi 2026-11-18: «bajarilmadi» deb belgilangan resurs (masalan eski F-2 dan kelgan profil dublikati) tushgan resurs hisoblanmaydi.

create or replace function public._t2_f2_resurs_tushgan_v1(p_akt_id bigint, p_limit int default 200)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select coalesce(jsonb_agg(r order by (r->>'bl_id')::bigint, (r->>'qator_id')::bigint), '[]'::jsonb) from (
    select jsonb_build_object('bl_id', p.id, 'bl_kod', p.kod, 'qator_id', c.id, 'tur', c.tur, 'kod', c.kod,
             'nom', left(c.nom, 120), 'f2_mumkin_hajm', h.f2_mumkin_hajm, 'narx', h.smeta_narx,
             'summa_taxmin', h.f2_mumkin_hajm * h.smeta_narx) r
      from public.t2_akt_qator aq
      join public.t2_qator p on p.id = aq.qator_id and p.tur = 'bl'
      join public.t2_qator c on c.ota_id = p.id
      join public.t2_qator_holat h on h.qator_id = c.id and h.versiya_holat = 'faol'
     where aq.akt_id = p_akt_id and coalesce(aq.hajm, 0) <> 0
       and coalesce(h.f2_mumkin_hajm, 0) <> 0
       and not exists (select 1 from public.t2_akt_qator x where x.akt_id = p_akt_id and x.qator_id = c.id)
       and not exists (select 1 from public.t2_qator z where z.replaces_line_id = c.id)
       and not exists (select 1 from public.t2_qator_bajarilmadi bj where bj.qator_id = c.id and bj.holat = 'faol')
     order by p.id, c.id
     limit greatest(coalesce(p_limit, 200), 1)
  ) s
$f$;

create or replace function public._t2_f2_resurs_tushgan_soni_v1(p_akt_id bigint)
returns int language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select count(*)::int
    from public.t2_akt_qator aq
    join public.t2_qator p on p.id = aq.qator_id and p.tur = 'bl'
    join public.t2_qator c on c.ota_id = p.id
    join public.t2_qator_holat h on h.qator_id = c.id and h.versiya_holat = 'faol'
   where aq.akt_id = p_akt_id and coalesce(aq.hajm, 0) <> 0
     and coalesce(h.f2_mumkin_hajm, 0) <> 0
     and not exists (select 1 from public.t2_akt_qator x where x.akt_id = p_akt_id and x.qator_id = c.id)
     and not exists (select 1 from public.t2_qator z where z.replaces_line_id = c.id)
       and not exists (select 1 from public.t2_qator_bajarilmadi bj where bj.qator_id = c.id and bj.holat = 'faol')
$f$;

