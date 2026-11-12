-- Acceptance t2_hisob_yadro_yagona_v1: faqat o'qish. Migratsiyadan KEYIN har bir so'rov 0 qator (yoki ko'rsatilgan qiymat) qaytarishi kerak.

-- 1) Har obyektda t2_obyekt_jami.jami = server summa paketi (smeta, прямые) — 0 qator kutiladi (farq > 1 so'm).
select j.id, j.jami, (p.paket->>'ustamasiz')::numeric as paket_ustamasiz
  from public.t2_obyekt_jami j
  join lateral public._t2_summa_paket_v1(array[j.id], 'smeta') p on true
 where abs(coalesce(j.jami, 0) - coalesce((p.paket->>'ustamasiz')::numeric, 0)) > 1;

-- 2) Mindmap: smeta shu qoidada (langar yozilgan).
select 1 where position('hisob_yadro_v1' in pg_get_functiondef('public.t2_mindmap_grafi(bigint)'::regprocedure)) = 0;

-- 3) Ustunlar tarkibi o'zgarmagan (19 ustun).
select count(*) as ustun_soni from information_schema.columns where table_schema = 'public' and table_name = 't2_obyekt_jami'; -- 19
