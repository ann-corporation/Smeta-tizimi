-- Rollback: 20261108100000_t2_izoh_v1. Izohlar yo'qoladi (faqat izoh ipi; akt/qatorlarga tegmaydi).
drop function if exists public.t2_izohlar_v1(bigint, bigint, bigint, bigint, integer, bigint);
drop function if exists public.t2_izoh_hal_v1(bigint, bigint, uuid, bigint, integer, boolean);
drop function if exists public.t2_izoh_yoz_v1(bigint, bigint, uuid, bigint, text, bigint, text, bigint);
drop function if exists public._t2_izoh_taqdim(bigint, bigint, bigint, bigint);
drop function if exists public._t2_izoh_manba(text, bigint);
drop table if exists public.t2_izoh;
