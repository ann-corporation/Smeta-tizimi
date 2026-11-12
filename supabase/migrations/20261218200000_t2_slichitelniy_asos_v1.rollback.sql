-- ROLLBACK 20261218200000_t2_slichitelniy_asos_v1
-- Funksiyalar olib tashlanadi; t2_aosr_bog.hajm ustuni va uning cheklovi tushiriladi (shu ustundagi hajm qiymatlari YO'QOLADI:
-- АОСР <-> qator bog'ining o'zi (aosr_id, qator_id) saqlanadi, faqat hajm tafsiloti ketadi).
set local statement_timeout = '300s';

drop function if exists public.t2_aosr_asos_qoralama_v1(bigint, bigint, bigint, bigint[], uuid, text);
drop function if exists public.t2_aosr_bog_hajm_v1(bigint, bigint, bigint, jsonb, uuid);
drop function if exists public.t2_aosr_slichitelniy_v1(bigint, bigint, bigint, integer);

alter table public.t2_aosr_bog drop constraint if exists t2_aosr_bog_hajm_check;
alter table public.t2_aosr_bog drop column if exists hajm;
