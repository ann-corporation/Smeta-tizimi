-- Rollback 20270117000004: ombor lug'ati funksiyalari va jadvali olib tashlanadi (lug'at — faqat sinonim xotirasi; asosiy ombor ma'lumotiga tegmaydi).
drop function if exists public.t2_ombor_lugat_yoz_v1(bigint, bigint, bigint, text, jsonb);
drop function if exists public.t2_ombor_lugat_royxat_v1(bigint, bigint, bigint, text, integer);
drop table if exists public.t2_ombor_lugat;