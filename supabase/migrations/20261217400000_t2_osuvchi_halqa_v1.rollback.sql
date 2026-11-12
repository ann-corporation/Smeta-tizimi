-- Rollback: 20261217400000 — O'rganish halqasi. Faqat shu migratsiya yaratgan obyektlar o'chadi (o'rganilgan tajriba ma'lumoti ham yo'qoladi).
drop function if exists public.t2_osuvchi_platforma_ol_v1(bigint, text, jsonb);
drop function if exists public.t2_osuvchi_ol_v1(bigint, bigint, text, jsonb);
drop function if exists public.t2_osuvchi_yoz_v1(bigint, bigint, uuid, text, jsonb);
drop function if exists public._t2_friksiya_tozala();
drop function if exists public._t2_friksiya_reyting(bigint, integer, integer);
drop function if exists public._t2_friksiya_dori(bigint, bigint, bigint, bigint, bigint, bigint, text);
drop function if exists public._t2_tajriba_taklif(bigint, bigint, text, text);
drop function if exists public._t2_tajriba_toza(text);
drop table if exists public.t2_osuvchi_op;
drop table if exists public.t2_friksiya_hafta;
drop table if exists public.t2_friksiya;
drop table if exists public.t2_osuvchi_taklif;
drop table if exists public.t2_tajriba_tizim;
drop table if exists public.t2_tajriba;
drop table if exists public.t2_tajriba_sozlama;
