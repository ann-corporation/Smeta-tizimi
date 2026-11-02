-- Supabase security adviser (2026-10-25) topilmalari:
-- 1) t2_almashtirilgan_summa_hisob — search_path o'zgaruvchan edi.
-- 2) t2_akt_raqam_takror_v1 — trigger funksiyasi, SECURITY DEFINER; anon/authenticated bevosita chaqira olardi.
ALTER FUNCTION public.t2_almashtirilgan_summa_hisob SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.t2_akt_raqam_takror_v1() FROM PUBLIC, anon, authenticated;