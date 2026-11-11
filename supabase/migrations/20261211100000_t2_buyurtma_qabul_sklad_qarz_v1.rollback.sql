-- ROLLBACK: 20261211100000_t2_buyurtma_qabul_sklad_qarz_v1
-- DIQQAT: ustunlarni tashlash t2_sklad_harakat.narx va buyurtma bog'lanishini yo'qotadi; yozilgan kirim/qarz QATORLARI qoladi (faqat bog'i uziladi).
alter function public.t2_buyurtma_tafsilot_v1(bigint, bigint, bigint) volatile;
alter function public.t2_buyurtmalar_v1(bigint, bigint, text, text, text, integer, bigint) volatile;
drop function if exists public.t2_buyurtma_qabul_yakunla_v1(bigint, bigint, uuid, bigint, bigint);
drop index if exists public.t2_qarz_asos_buyurtma_qator_uq;
drop index if exists public.t2_sklad_harakat_buyurtma_qator_uq;
alter table public.t2_qarz_asos drop column if exists buyurtma_qator_id;
alter table public.t2_sklad_harakat drop constraint if exists t2_sklad_harakat_narx_nonneg_chk;
alter table public.t2_sklad_harakat drop column if exists buyurtma_qator_id;
alter table public.t2_sklad_harakat drop column if exists buyurtma_id;
alter table public.t2_sklad_harakat drop column if exists narx;
