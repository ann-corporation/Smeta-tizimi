-- Rollback: summa / variance_summa generated ifodasini hajm × narx ga qaytarish.
-- DIQQAT: bu hujjat summasi hajm × narx dan farq qiladigan qatorlarda (masalan F2 da 0 yozilgan
-- material) yana to'qilgan pulni qaytaradi — faqat egasi qarori bilan.
alter table public.t2_akt_qator alter column summa set expression as (
  case when narx is null then null::numeric else hajm * narx end);
alter table public.t2_akt_qator alter column variance_summa set expression as (
  case when narx is null then 0::numeric else hajm * narx end - coalesce(baseline_summa, 0::numeric));
-- t2_akt_yarat_v2: 20260921120000_t2_price_control_v1.sql dagi blokni qayta qo'llang
-- (hujjat_jami qayta hisoblash qadamisiz).
