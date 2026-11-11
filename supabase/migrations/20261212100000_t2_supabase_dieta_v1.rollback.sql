-- Rollback 20261212100000: indekslarni to'liq (eski) shaklga qaytaradi, funksiyani olib tashlaydi.
-- DIQQAT: ixchamlangan eski_qatorlar MA'LUMOTI qayta tiklanmaydi (kodda hech kim o'qimagan; zaxira — Supabase backup).
begin;
drop index if exists public.t2_qator_paket_manba_idx;
create index t2_qator_paket_manba_idx on public.t2_qator (smeta_paket_manba_id, id);
drop index if exists public.t2_qator_manba_idx;
create index t2_qator_manba_idx on public.t2_qator (manba_id, xom_qator);
drop function if exists public.t2_dieta_log_kompakt_v1(integer, boolean);
commit;
