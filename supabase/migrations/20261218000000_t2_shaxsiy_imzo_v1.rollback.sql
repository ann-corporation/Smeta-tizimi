-- Rollback 20261218000000 (shaxsiy imzo). DIQQAT: jadvallar o'chiriladi - saqlangan imzolar va ochiq kalitlar yo'qoladi
-- (append-only trigger DROP TABLE ga to'sqinlik qilmaydi). Faqat imzolar hali ishlatilmagan bo'lsa qo'llang.
set local statement_timeout = '300s';

drop function if exists public.t2_nashr_tozala_v1(integer);
drop function if exists public.t2_nashr_ruxsat_v1(bigint, text);
drop function if exists public.t2_nashr_ochiq_v1(text);
drop function if exists public._t2_nashr_joriy_v1(public.t2_nashr);
drop function if exists public.t2_nashr_nusxa_v1(bigint, text, bigint);
drop function if exists public.t2_nashr_tayyor_v1(bigint, bigint, bigint, text, text, text, text);
drop table if exists public.t2_nashr;
drop function if exists public._t2_nashr_himoya_trg();
drop function if exists public.t2_imzo_hujjat_ruxsat_v1(bigint, text);
drop function if exists public.t2_imzo_ochiq_v1(text);
drop function if exists public.t2_imzo_mening_v1(bigint, integer);
drop function if exists public.t2_imzo_hujjat_royxat_v1(bigint, bigint);
drop function if exists public._t2_imzo_qator_v1(public.t2_imzo, public.t2_imzo_kalit, public.t2_document_registry);
drop function if exists public.t2_imzo_yoz_v1(bigint, text, bigint, uuid, bigint, text, bigint, text, text, text, text, text, text, text, text, text, text, text);
drop function if exists public.t2_imzo_manba_v1(bigint, bigint, uuid, bigint, text, bigint);
drop function if exists public.t2_imzo_kalit_bekor_v1(bigint, uuid, text, timestamptz);
drop function if exists public.t2_imzo_kalit_yarat_v1(bigint, text, text, text, boolean);
drop function if exists public.t2_imzo_kalit_royxat_v1(bigint);
drop table if exists public.t2_imzo;
drop table if exists public.t2_imzo_kalit;
drop function if exists public._t2_imzo_kalit_himoya_trg();
drop function if exists public._t2_imzo_himoya_trg();
