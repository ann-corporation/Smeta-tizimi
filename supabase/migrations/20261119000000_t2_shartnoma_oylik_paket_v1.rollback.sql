-- ROLLBACK 20261119000000_t2_shartnoma_oylik_paket_v1: shartnoma oylik paketi RPC lari, yordamchi funksiyalar va jadval olib tashlanadi.
-- DIQQAT: jadval o'chsa topshirish tarixi (manifest, versiyalar) yo'qoladi. ZIP baytlari kanonik saqlashda (turi 'shartnoma_oylik_paket') qoladi.
begin;
drop function if exists public.t2_shartnoma_oylik_paket_tekshir_v1(bigint, bigint, text);
drop function if exists public.t2_shartnoma_oylik_paket_royxat_v1(bigint, bigint, bigint, text);
drop function if exists public.t2_shartnoma_oylik_paket_saqla_v1(bigint, bigint, bigint, text, jsonb, bigint, text, bigint, uuid);
drop function if exists public._t2_shartnoma_oy_iz_v1(bigint, date);
drop function if exists public._t2_shartnoma_obyektlari_v1(bigint);
drop function if exists public._t2_oy_iz_v1(bigint, date);
drop table if exists public.t2_shartnoma_oylik_paket;
commit;
