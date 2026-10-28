-- Rollback: t2_mindmap_v4_odamlar. Jadvallar/ma'lumotlar o'zgarmagan (faqat funksiyalar). Berilgan mas'ullik qatorlari saqlanadi.
begin;
drop function if exists public.t2_mindmap_grafi_v4(bigint, bigint);
drop function if exists public.t2_mindmap_masul_v1(bigint, bigint, bigint, bigint, bigint, text, uuid);
commit;
