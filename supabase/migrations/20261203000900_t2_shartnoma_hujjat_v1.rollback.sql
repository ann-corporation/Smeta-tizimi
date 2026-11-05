-- ROLLBACK 20261203000900_t2_shartnoma_hujjat_v1: shartnoma/DS ↔ hujjat bog'i RPC lari va jadvali olib tashlanadi.
-- DIQQAT: bog'lar (qaysi fayl qaysi shartnoma/DS ga tegishli) yo'qoladi. Fayllarning o'zi kanonik saqlashda
-- (t2_document_registry, document_type 'shartnoma', R2) va t2_shartnoma_ds qatorlari o'zgarmaydi.
begin;
drop function if exists public.t2_shartnoma_hujjat_royxat_v1(bigint, bigint, bigint);
drop function if exists public.t2_shartnoma_hujjat_ajrat_v1(bigint, bigint, bigint, uuid);
drop function if exists public.t2_shartnoma_hujjat_bogla_v1(bigint, bigint, bigint, bigint, bigint, text, text, uuid);
drop table if exists public.t2_shartnoma_hujjat;
commit;
