-- Rollback: 20261218400000 — Jarvis suhbatlari. Faqat shu migratsiya yaratgan obyektlar o'chadi (saqlangan suhbatlar yo'qoladi; brauzerdagi zaxira nusxa qoladi).
drop function if exists public.t2_jarvis_suhbat_ochir_v1(bigint, bigint, text);
drop function if exists public.t2_jarvis_suhbat_ol_v1(bigint, bigint, text);
drop function if exists public.t2_jarvis_suhbat_royxat_v1(bigint, bigint);
drop function if exists public.t2_jarvis_suhbat_saqla_v1(bigint, bigint, text, text, jsonb);
drop function if exists public._t2_jarvis_suhbat_tozala(bigint, bigint);
drop table if exists public.t2_jarvis_suhbat;
