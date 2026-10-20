-- Rollback 20261106590000: restore the previous (whole-object GROUP BY) t2_qator_holat definition.
create or replace view public.t2_qator_holat as
with direct as not materialized (
  select q.id, q.obyekt_id, q.tur, q.raqam, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.norma, q.hajm, q.narx, q.summa,
    coalesce(sum(aq.hajm) filter (where a.tur = 'fakt'::text and a.holat <> 'bekor'::text), 0::numeric) as direct_fakt_hajm,
    coalesce(sum(aq.summa) filter (where a.tur = 'fakt'::text and a.holat <> 'bekor'::text), 0::numeric) as direct_fakt_summa,
    coalesce(sum(coalesce(aq.certified_quantity, aq.hajm)) filter (where a.tur = 'f2'::text and a.holat = 'tasdiqlangan'::text), 0::numeric) as f2_hajm,
    coalesce(sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur = 'f2'::text and a.holat = 'tasdiqlangan'::text), 0::numeric) as f2_summa_malum,
    count(*) filter (where a.tur = 'f2'::text and a.holat = 'tasdiqlangan'::text and (q.tur <> all (array['rz'::text, 'bl'::text]))
      and coalesce(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text and coalesce(aq.certified_amount, aq.summa) is null
      and coalesce(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) as f2_summa_nomalum
  from public.t2_qator q
  left join public.t2_akt_qator aq on aq.qator_id = q.id
  left join public.t2_akt a on a.id = aq.akt_id
  group by q.id, q.obyekt_id, q.tur, q.raqam, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.norma, q.hajm, q.narx, q.summa
), effective as not materialized (
  select d.id, d.obyekt_id, d.tur, d.raqam, d.kod, d.nom, d.birlik, d.kat, d.ota_id, d.norma, d.hajm, d.narx, d.summa,
    d.direct_fakt_hajm, d.direct_fakt_summa, d.f2_hajm, d.f2_summa_malum as f2_summa, d.f2_summa_nomalum,
    case when d.tur = 'rs'::text and d.norma is not null and parent.tur = 'bl'::text and d.direct_fakt_hajm = 0::numeric
         then parent.direct_fakt_hajm * d.norma else d.direct_fakt_hajm end as fakt_hajm,
    case when d.tur = 'rs'::text and d.norma is not null and parent.tur = 'bl'::text and d.direct_fakt_hajm = 0::numeric
         then case when d.narx is null then null::numeric else parent.direct_fakt_hajm * d.norma * d.narx end
         else d.direct_fakt_summa end as fakt_summa,
    case when d.tur = 'rs'::text and d.norma is not null and parent.tur = 'bl'::text and d.direct_fakt_hajm = 0::numeric
         then 'BL_NORMA'::text else 'DIRECT'::text end as fakt_manbasi
  from direct d
  left join direct parent on parent.id = d.ota_id and parent.obyekt_id = d.obyekt_id
)
select id, id as qator_id, obyekt_id, tur, raqam, kod, nom, birlik, kat,
  hajm as smeta_hajm, narx as smeta_narx, summa as smeta_summa,
  fakt_hajm, fakt_summa, f2_hajm, f2_summa,
  hajm - f2_hajm as qoldiq_hajm,
  summa - f2_summa as qoldiq_summa,
  greatest(fakt_hajm - f2_hajm, 0::numeric) as f2_mumkin_hajm,
  greatest(fakt_summa - f2_summa, 0::numeric) as f2_mumkin_summa,
  case when f2_hajm <> 0::numeric then round(f2_summa / f2_hajm, 2) else null::numeric end as f2_narx,
  case when fakt_hajm <> 0::numeric then round(fakt_summa / fakt_hajm, 2) else null::numeric end as fakt_narx,
  case when f2_hajm <> 0::numeric and narx is not null and narx <> 0::numeric
       then round((f2_summa / f2_hajm - narx) / narx * 100::numeric, 1) else null::numeric end as f2_narx_farq_foiz,
  ota_id, norma, direct_fakt_hajm, direct_fakt_summa, fakt_manbasi, f2_summa_nomalum
from effective;
