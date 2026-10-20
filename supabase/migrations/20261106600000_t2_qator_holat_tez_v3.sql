-- t2_qator_holat v3: same as v2 but without a CTE — through the view a CTE hid the ordered index path (v2 still sorted 25k rows).
-- Before: every 1000-row page (/api/sb paginates in parallel with offset + the qator_id>cursor) re-aggregated ALL
-- object rows plus akt_qator, then sorted them (external merge on disk); 25k rows = ~26 full passes.
-- Now: ORDER BY qator_id LIMIT N reads the (obyekt_id, id) index and only probes akt_qator for the rows it needs.
-- Semantics are unchanged: the same columns, order and types; NULL ≠ 0; the BL_NORMA derivation is untouched
-- (verified with EXCEPT in both directions over all rows before applying).
-- Planner notes: no CTE (a CTE inside the view hides the ordered index path), and the bl lateral must not reference d.
create or replace view public.t2_qator_holat as
select q.id, q.id as qator_id, q.obyekt_id, q.tur, q.raqam, q.kod, q.nom, q.birlik, q.kat,
  q.hajm as smeta_hajm, q.narx as smeta_narx, q.summa as smeta_summa,
  e.fakt_hajm, e.fakt_summa, d.f2_hajm, d.f2_summa_malum as f2_summa,
  q.hajm - d.f2_hajm as qoldiq_hajm,
  q.summa - d.f2_summa_malum as qoldiq_summa,
  greatest(e.fakt_hajm - d.f2_hajm, 0::numeric) as f2_mumkin_hajm,
  greatest(e.fakt_summa - d.f2_summa_malum, 0::numeric) as f2_mumkin_summa,
  case when d.f2_hajm <> 0::numeric then round(d.f2_summa_malum / d.f2_hajm, 2) else null::numeric end as f2_narx,
  case when e.fakt_hajm <> 0::numeric then round(e.fakt_summa / e.fakt_hajm, 2) else null::numeric end as fakt_narx,
  case when d.f2_hajm <> 0::numeric and q.narx is not null and q.narx <> 0::numeric
       then round((d.f2_summa_malum / d.f2_hajm - q.narx) / q.narx * 100::numeric, 1) else null::numeric end as f2_narx_farq_foiz,
  q.ota_id, q.norma, d.direct_fakt_hajm, d.direct_fakt_summa, e.fakt_manbasi, d.f2_summa_nomalum
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
-- A resource (rs) with a norm under a BL: the BL's direct fakt (used × norm only when the rs has no own fakt).
left join lateral (
  select coalesce(sum(paq.hajm) filter (where pa.tur = 'fakt' and pa.holat <> 'bekor'), 0::numeric) as fakt_hajm
  from public.t2_qator p
  left join public.t2_akt_qator paq on paq.qator_id = p.id
  left join public.t2_akt pa on pa.id = paq.akt_id
  where q.tur = 'rs' and q.norma is not null
    and p.id = q.ota_id and p.obyekt_id = q.obyekt_id and p.tur = 'bl'
  group by p.id
) bl on true
cross join lateral (
  select
    case when bl.fakt_hajm is not null and d.direct_fakt_hajm = 0::numeric then bl.fakt_hajm * q.norma else d.direct_fakt_hajm end as fakt_hajm,
    case when bl.fakt_hajm is not null and d.direct_fakt_hajm = 0::numeric
         then case when q.narx is null then null::numeric else bl.fakt_hajm * q.norma * q.narx end
         else d.direct_fakt_summa end as fakt_summa,
    case when bl.fakt_hajm is not null and d.direct_fakt_hajm = 0::numeric then 'BL_NORMA'::text else 'DIRECT'::text end as fakt_manbasi
) e;
