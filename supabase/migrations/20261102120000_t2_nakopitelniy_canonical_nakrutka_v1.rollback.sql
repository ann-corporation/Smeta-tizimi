-- Restore the previous legacy-compatible view definition.
begin;

create or replace view public.t2_obyekt_nakrutka as
with kat as (
  select q.obyekt_id,
    coalesce(sum(q.summa) filter (where q.kat = 'ЧЕЛ'), 0::numeric) as chel,
    coalesce(sum(q.summa) filter (where q.kat = 'МАШ'), 0::numeric) as mash,
    coalesce(sum(q.summa) filter (where q.kat in ('МАТ','М/К','КАБ')), 0::numeric) as mat,
    coalesce(sum(q.summa) filter (where q.kat = 'ОБ'), 0::numeric) as ob,
    coalesce(sum(q.summa) filter (where q.kat = 'М/К'), 0::numeric) as mk,
    coalesce(sum(q.summa) filter (where q.kat = 'КАБ'), 0::numeric) as kab
  from public.t2_qator q
  where q.tur in ('rs','mat','ob')
  group by q.obyekt_id
), bog as (
  select b.obyekt_id, b.shartnoma_id
  from public.t2_shartnoma_bog b
), nk_shartnoma as (
  select ob.obyekt_id, ob.shartnoma_id, jsonb_object_agg(n.koef, n.qiymat) as nk
  from bog ob join public.t2_nakrutka n on n.shartnoma_id = ob.shartnoma_id
  group by ob.obyekt_id, ob.shartnoma_id
), nk_default as (
  select o.id as obyekt_id, jsonb_object_agg(n.koef, n.qiymat) as nk
  from public.t2_obyekt o
  join public.t2_nakrutka n on n.kompaniya_id = o.kompaniya_id and n.shartnoma_id is null
  group by o.id
), resolved as (
  select k.obyekt_id, bog.shartnoma_id,
    coalesce(nks.nk, nkd.nk, '{}'::jsonb) as nk
  from kat k
  left join bog on bog.obyekt_id = k.obyekt_id
  left join nk_shartnoma nks on nks.obyekt_id = k.obyekt_id
  left join nk_default nkd on nkd.obyekt_id = k.obyekt_id
)
select k.obyekt_id, r.shartnoma_id, k.chel, k.mash, k.mat, k.ob,
  (h.h ->> 'pryamye')::numeric as pryamye,
  (h.h ->> 'tr_mat')::numeric as tr_mat,
  (h.h ->> 'skl_mat')::numeric as skl_mat,
  (h.h ->> 'tr_kab')::numeric as tr_kab,
  (h.h ->> 'itogo1')::numeric as itogo1,
  (h.h ->> 'prochie')::numeric as prochie,
  (h.h ->> 'itogo2')::numeric as itogo2,
  (h.h ->> 'tr_ob')::numeric as tr_ob,
  (h.h ->> 'zag_ob')::numeric as zag_ob,
  (h.h ->> 'itogo3')::numeric as itogo3,
  (h.h ->> 'strax')::numeric as strax,
  (h.h ->> 'risk')::numeric as risk,
  (h.h ->> 'itogo4')::numeric as itogo4,
  (h.h ->> 'nds')::numeric as nds,
  (h.h ->> 'vsego')::numeric as vsego,
  (kf.kf ->> 'ЧЕЛ')::numeric as kf_chel,
  (kf.kf ->> 'МАШ')::numeric as kf_mash,
  (kf.kf ->> 'МАТ')::numeric as kf_mat,
  (kf.kf ->> 'ОБ')::numeric as kf_ob,
  (kf.kf ->> 'М/К')::numeric as kf_mk,
  (kf.kf ->> 'КАБ')::numeric as kf_kab,
  (kf.kf ->> 'БЕЗСКЛАД')::numeric as kf_bezsklad,
  k.mk, k.kab
from kat k
join resolved r on r.obyekt_id = k.obyekt_id
cross join lateral (select public.t2_nakrutka_hisob(k.chel,k.mash,k.mat,k.ob,k.mk,k.kab,0::numeric,r.nk) as h) h
cross join lateral (select public.t2_nakrutka_koef(r.nk) as kf) kf;

commit;
