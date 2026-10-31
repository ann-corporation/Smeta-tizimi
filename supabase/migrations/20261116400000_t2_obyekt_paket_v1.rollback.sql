-- Rollback: 20261116400000_t2_obyekt_paket_v1 — paket va probe RPC olib tashlanadi (20261116300000 dan oldin).
drop function if exists public.t2_obyekt_paket_v1(bigint, bigint);
drop function if exists public.t2_obyekt_rev_v1(bigint, bigint);
