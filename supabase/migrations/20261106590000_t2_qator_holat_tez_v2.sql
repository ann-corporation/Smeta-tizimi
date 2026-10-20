-- t2_qator_holat: per-row LATERAL aggregates instead of aggregating the whole object (egasi 2026-10-20: «tezlik»).
-- Semantics unchanged (EXCEPT in both directions over all 222 535 rows = 0). Superseded by 20261106600000 (v3, no CTE):
-- through the view the CTE still hid the ordered (obyekt_id, id) index path.
create or replace view public.t2_qator_holat as
with effective as not materialized (
  select q.id, q.obyekt_id, q.tur, q.raqam, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.norma, q.hajm, q.narx, q.summa,
    d.direct_fakt_hajm, d.direct_fakt_summa, d.f2_hajm, d.f2_summa_malum as f2_summa, d.f2_summa_nomalum,
    case when bl.fakt_hajm is not null and d.direct_fakt_hajm = 0::numeric then bl.fakt_hajm * q.norma else d.direct_fakt_hajm end as fakt_hajm,
    case when bl.fakt_hajm is not null and d.direct_fakt_hajm = 0::numeric then case when q.narx is null then null::numeric else bl.fakt_hajm * q.norma * q.narx end
         else d.direct_fakt_summa end as fakt_summa,
    case when bl.fakt_hajm is not null and d.direct_fakt_hajm = 0::numeric then 'BL_NORMA'::text else 'DIRECT'::text end as fakt_manbasi
  from public.t2_qator q
  cross join lateral (
    select
      coalesce(sum(aq.hajm) filter (where a.tur = 'fakt' and a.holat <> 'bekor'), 0::numeric) as direct_fakt_hajm,
      coalesce(sum(aq.summa) filter (where a.tur = 'fakt' and a.holat <> 'bekor'), 0::numeric) as direct_fakt_summa,
      coalesce(sum(coalesce(aq.certified_quantity, aq.hajm)) filter (where a.tur = 'f2' and a.holat = 'tasdiqlangan'), 0::numeric) as f2_hajm,
      coalesce(sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur = 'f2' and a.holat = 'tasdiqlangan'), 0::numeric) as f2_summa_malum,
      count(*) filter (where a.tur = 'f2' and a.holat = 'tasdiqlangan'
        and (q.tur <> all (array['rz'::text, 'bl'::text]))
        and coalesce(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'
        and coalesce(aq.certified_amount, aq.summa) is null
        and coalesce(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) as f2_summa_nomalum
    from public.t2_akt_qator aq
    left join public.t2_akt a on a.id = aq.akt_id
    where aq.qator_id = q.id
  ) d
  -- Do not reference d here: that blocks the ordered (obyekt_id, id) index read and LIMIT stops working.
  left join lateral (
    select coalesce(sum(paq.hajm) filter (where pa.tur = 'fakt' and pa.holat <> 'bekor'), 0::numeric) as fakt_hajm
    from public.t2_qator p
    left join public.t2_akt_qator paq on paq.qator_id = p.id
    left join public.t2_akt pa on pa.id = paq.akt_id
    where q.tur = 'rs' and q.norma is not null
      and p.id = q.ota_id and p.obyekt_id = q.obyekt_id and p.tur = 'bl'
    group by p.id
  ) bl on true
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
