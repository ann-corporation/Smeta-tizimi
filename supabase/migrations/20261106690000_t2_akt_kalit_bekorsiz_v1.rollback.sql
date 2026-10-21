-- Rollback: to'liq (bekorlarni ham qamrovchi) unique indeksga qaytish.
-- DIQQAT: agar bekor akt bilan bir xil kalitda yangi faol akt yaratilgan bo'lsa, rollback 23505 bilan to'xtaydi —
-- bu ataylab: ma'lumotni jim o'chirmaymiz. Avval egasi bilan qaysi akt qolishini hal qiling.
begin;
drop index if exists public.t2_akt_kalit_uniq;
create unique index t2_akt_kalit_uniq on public.t2_akt using btree (obyekt_id, tur, oy, coalesce(raqam, ''::text));
commit;
