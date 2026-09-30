-- T2-BEZ-SKLAD-V1
--
-- БЕЗСКЛАД is a canonical resource category for ready-to-use materials
-- (товарный бетон, бетонные смеси, раствор, асфальтобетон). It is not a
-- warehouse entity and it never receives warehouse markup. The client may
-- propose this category only from a deterministic keyword rule or explicit
-- operator correction; the registry remains the source used by import RPCs.
--
-- This migration is additive/source-ready. It does not apply to production
-- from this branch. Rollback refuses to mutate rows if BEZСКЛАД data exists.

begin;

-- Claude ko'rib chiqishi (2026-10-01): smeta qatorlari ham БЕЗСКЛАД qabul qilsin — aks holda
-- klassifikator betonni БЕЗСКЛАД deb belgilaganda import t2_qator_kat_check da yiqilardi.
alter table public.t2_qator drop constraint if exists t2_qator_kat_check;
alter table public.t2_qator add constraint t2_qator_kat_check
  check (kat = any (array['ЧЕЛ','МАШ','МАТ','ОБ','М/К','КАБ','БЕЗСКЛАД']));

alter table public.t2_resurs_kategoriya
  drop constraint if exists t2_resurs_kategoriya_kategoriya_check;
alter table public.t2_resurs_kategoriya
  add constraint t2_resurs_kategoriya_kategoriya_check
  check (kategoriya in ('ЧЕЛ','МАШ','МАТ','ОБ','М/К','КАБ','БЕЗСКЛАД'));

create or replace function public.t2_resurs_kategoriya_belgila_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_nom text, p_birlik text,
  p_kategoriya text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_prev jsonb; v_rol text; v_row public.t2_resurs_kategoriya;
  v_nom_key text; v_bir_key text;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin','superadmin','boss','director','pto') then
    raise exception 'WRITE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if p_kategoriya not in ('ЧЕЛ','МАШ','МАТ','ОБ','М/К','КАБ','БЕЗСКЛАД') then
    return jsonb_build_object('ok',false,'code','KATEGORIYA_INVALID');
  end if;
  v_nom_key := public.t2_resurs_nom_kalit(p_nom);
  v_bir_key := public.t2_resurs_birlik_kalit(p_birlik);
  if v_nom_key = '' or v_bir_key = '' then
    return jsonb_build_object('ok',false,'code','NOM_BIRLIK_REQUIRED');
  end if;

  insert into public.t2_resurs_kategoriya(kompaniya_id, nom_key, birlik_key, kategoriya, actor_id)
    values (p_kompaniya_id, v_nom_key, v_bir_key, p_kategoriya, p_actor_id)
    on conflict (kompaniya_id, nom_key, birlik_key)
    do update set kategoriya = excluded.kategoriya, actor_id = excluded.actor_id,
      yangilandi = now(), versiya = t2_resurs_kategoriya.versiya + 1
    returning * into v_row;

  v_prev := jsonb_build_object('ok',true,'id',v_row.id,'kategoriya',v_row.kategoriya,'versiya',v_row.versiya);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'resurs_kategoriya_belgila', v_prev);
  return v_prev;
end $$;

revoke all on function public.t2_resurs_kategoriya_belgila_v1(bigint,bigint,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.t2_resurs_kategoriya_belgila_v1(bigint,bigint,text,text,text,uuid) to service_role;

-- The compatibility view keeps its existing columns/order. Only the internal
-- cascade input changes: the material bucket includes BEZСКЛАД and passes its
-- separate `bez` sub-bucket, so warehouse markup excludes it.
create or replace view public.t2_obyekt_nakrutka as
with kat as (
  select q.obyekt_id,
    coalesce(sum(q.summa) filter (where q.kat = 'ЧЕЛ'), 0::numeric) as chel,
    coalesce(sum(q.summa) filter (where q.kat = 'МАШ'), 0::numeric) as mash,
    coalesce(sum(q.summa) filter (where q.kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0::numeric) as mat,
    coalesce(sum(q.summa) filter (where q.kat = 'ОБ'), 0::numeric) as ob,
    coalesce(sum(q.summa) filter (where q.kat = 'М/К'), 0::numeric) as mk,
    coalesce(sum(q.summa) filter (where q.kat = 'КАБ'), 0::numeric) as kab,
    coalesce(sum(q.summa) filter (where q.kat = 'БЕЗСКЛАД'), 0::numeric) as bez
  from public.t2_qator q
  where q.tur in ('rs','mat','ob')
  group by q.obyekt_id
), bog as (
  select distinct on (b.obyekt_id) b.obyekt_id, b.shartnoma_id
  from public.t2_shartnoma_bog b
  join public.t2_shartnoma s on s.id = b.shartnoma_id
  where b.holat = 'faol' and s.holat <> 'bekor'
  order by b.obyekt_id, b.shartnoma_id
), effective as (
  select k.obyekt_id, b.shartnoma_id, k.chel, k.mash, k.mat, k.ob, k.mk, k.kab, k.bez,
    public.t2_nakrutka_default_v1()
      || coalesce(company.nk, '{}'::jsonb)
      || coalesce(contract.nk, '{}'::jsonb) as nk
  from kat k
  join public.t2_obyekt o on o.id = k.obyekt_id
  left join bog b on b.obyekt_id = k.obyekt_id
  left join lateral (
    select jsonb_object_agg(n.koef_kod, to_jsonb(n.qiymat)) as nk
    from public.t2_nakrutka_koef n
    where n.kompaniya_id = o.kompaniya_id and n.shartnoma_id is null
  ) company on true
  left join lateral (
    select jsonb_object_agg(n.koef_kod, to_jsonb(n.qiymat)) as nk
    from public.t2_nakrutka_koef n
    where n.kompaniya_id = o.kompaniya_id and n.shartnoma_id = b.shartnoma_id
  ) contract on true
), calc as (
  select e.*, public.t2_nakrutka_hisobla_v1(
    jsonb_build_object('chel',e.chel,'mash',e.mash,'mat',e.mat,'ob',e.ob,'mk',e.mk,'kab',e.kab,'bez',e.bez), e.nk) as h,
    public.t2_nakrutka_koef_jadval_v1(e.nk) as kf
  from effective e
)
select c.obyekt_id, c.shartnoma_id, c.chel, c.mash, c.mat, c.ob,
  (c.h ->> 'pryamye')::numeric as pryamye,
  (c.h ->> 'tr_mat')::numeric as tr_mat,
  (c.h ->> 'skl_mat')::numeric as skl_mat,
  (c.h ->> 'tr_kab')::numeric as tr_kab,
  (c.h ->> 'itogo1')::numeric as itogo1,
  (c.h ->> 'prochie')::numeric as prochie,
  (c.h ->> 'itogo2')::numeric as itogo2,
  (c.h ->> 'tr_ob')::numeric as tr_ob,
  (c.h ->> 'zag_ob')::numeric as zag_ob,
  (c.h ->> 'itogo3')::numeric as itogo3,
  (c.h ->> 'strax')::numeric as strax,
  (c.h ->> 'risk')::numeric as risk,
  (c.h ->> 'itogo4')::numeric as itogo4,
  (c.h ->> 'nds')::numeric as nds,
  (c.h ->> 'vsego')::numeric as vsego,
  (c.kf ->> 'ЧЕЛ')::numeric as kf_chel,
  (c.kf ->> 'МАШ')::numeric as kf_mash,
  (c.kf ->> 'МАТ')::numeric as kf_mat,
  (c.kf ->> 'ОБ')::numeric as kf_ob,
  (c.kf ->> 'М/К')::numeric as kf_mk,
  (c.kf ->> 'КАБ')::numeric as kf_kab,
  (c.kf ->> 'БЕЗСКЛАД')::numeric as kf_bezsklad,
  c.mk, c.kab
from calc c;

create or replace function public.t2_obyekt_nakrutka_v1(
  p_obyekt_id bigint, p_actor_id bigint, p_shartnoma_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_komp bigint; v_rol text; v_cats jsonb; v_nk_javob jsonb; v_shartnoma_id bigint := p_shartnoma_id;
begin
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok',false,'code','OBYEKT_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_shartnoma_id is null then
    select sb.shartnoma_id into v_shartnoma_id
    from public.t2_shartnoma_bog sb
    where sb.obyekt_id = p_obyekt_id and sb.holat = 'faol' limit 1;
  end if;

  select jsonb_build_object(
    'chel', coalesce(sum(summa) filter (where kat='ЧЕЛ'), 0),
    'mash', coalesce(sum(summa) filter (where kat='МАШ'), 0),
    'mat',  coalesce(sum(summa) filter (where kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0),
    'ob',   coalesce(sum(summa) filter (where kat='ОБ'), 0),
    'mk',   coalesce(sum(summa) filter (where kat='М/К'), 0),
    'kab',  coalesce(sum(summa) filter (where kat='КАБ'), 0),
    'bez',  coalesce(sum(summa) filter (where kat='БЕЗСКЛАД'), 0))
  into v_cats
  from public.t2_qator
  where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob');

  v_nk_javob := public.t2_nakrutka_koef_ol_v1(v_komp, p_actor_id, v_shartnoma_id);
  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'shartnoma_id', v_shartnoma_id,
    'cats', v_cats, 'koeffitsientlar', v_nk_javob->'koeffitsientlar',
    'nakrutka', public.t2_nakrutka_hisobla_v1(v_cats, v_nk_javob->'koeffitsientlar'),
    'jadval', v_nk_javob->'jadval');
end $$;
revoke all on function public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint) from public, anon, authenticated;
grant execute on function public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint) to service_role;

commit;
