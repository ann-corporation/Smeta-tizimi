-- DESIGN ONLY - NOT APPLIED, NOT in supabase/migrations (owner rule: no migration without approval; L0 applies after ROLLBACK test).
-- Three READ-ONLY functions for the nightly experience-index job (functions/_shared/tajriba-tick.ts). NO new table: Studio confirmations
-- are already logged in public.t2_smeta_tanlov_tajriba (see 20261106440000_t2_smeta_xotira_tajriba_v1.sql); object lines are t2_qator.
-- Called only with the service key by /api/tajriba-tick (cron secret); closed to anon/authenticated like the t2_arxiv_* functions.
-- The index itself (derived reference knowledge) lives in R2 normativ/tajriba/v1/, NOT in the database.

-- 1) Approved objects whose lines changed after the cursor (oldest change first). "Approved/active" = active object of the plain
--    'obyekt' type with active (not replaced) work lines; the object's change time = latest line update.
create or replace function public.t2_tajriba_ozgargan_obyektlar_v1(p_vaqt timestamptz, p_limit int default 5)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', z.kompaniya_id, 'obyekt_id', z.obyekt_id, 'yangilandi', z.yangilandi) order by z.yangilandi, z.obyekt_id), '[]'::jsonb)
  from (
    select o.kompaniya_id, o.id as obyekt_id, max(q.yangilandi) as yangilandi
    from public.t2_obyekt o
    join public.t2_qator q on q.obyekt_id = o.id and q.tur = 'bl' and q.versiya_holat = 'faol'
    where o.holat = 'faol' and o.tur = 'obyekt'
    group by o.kompaniya_id, o.id
    having max(q.yangilandi) > p_vaqt
    order by max(q.yangilandi), o.id
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  ) z
$$;

-- 2) The norm lines of one object in smeta order with the names of the two nearest section rows (no price, no quantity, no object name).
--    Added extras and replacements are excluded: they are not the estimator's norm choice for a described work.
create or replace function public.t2_tajriba_obyekt_qatorlar_v1(p_obyekt_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('kod', q.kod, 'nom', q.nom, 'birlik', q.birlik,
           'bolim', (select coalesce(jsonb_agg(s.nom order by s.lvl desc), '[]'::jsonb) from (
              select p.nom, 1 as lvl from public.t2_qator p where p.id = q.ota_id
              union all select g.nom, 2 from public.t2_qator g where g.id = (select p2.ota_id from public.t2_qator p2 where p2.id = q.ota_id)) s))
         order by q.tartib, q.id), '[]'::jsonb)
  from public.t2_qator q
  where q.obyekt_id = p_obyekt_id and q.tur = 'bl' and q.versiya_holat = 'faol'
    and q.kod is not null and q.kod <> '' and q.nom is not null
    and not q.qoshimcha and not q.zamena
$$;

-- 3) Studio confirmations after the cursor id (the user picked or overrode a code), oldest first.
create or replace function public.t2_tajriba_tanlovlar_v1(p_id bigint, p_limit int default 500)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kompaniya_id', t.kompaniya_id, 'norma_kod', t.norma_kod, 'tavsif', t.tavsif, 'birlik', t.birlik) order by t.id), '[]'::jsonb)
  from (select * from public.t2_smeta_tanlov_tajriba where id > p_id order by id limit greatest(1, least(coalesce(p_limit, 500), 1000))) t
$$;

revoke all on function public.t2_tajriba_ozgargan_obyektlar_v1(timestamptz, int) from public, anon, authenticated;
revoke all on function public.t2_tajriba_obyekt_qatorlar_v1(bigint) from public, anon, authenticated;
revoke all on function public.t2_tajriba_tanlovlar_v1(bigint, int) from public, anon, authenticated;
grant execute on function public.t2_tajriba_ozgargan_obyektlar_v1(timestamptz, int) to service_role;
grant execute on function public.t2_tajriba_obyekt_qatorlar_v1(bigint) to service_role;
grant execute on function public.t2_tajriba_tanlovlar_v1(bigint, int) to service_role;

-- ROLLBACK:
--   drop function if exists public.t2_tajriba_ozgargan_obyektlar_v1(timestamptz, int);
--   drop function if exists public.t2_tajriba_obyekt_qatorlar_v1(bigint);
--   drop function if exists public.t2_tajriba_tanlovlar_v1(bigint, int);
