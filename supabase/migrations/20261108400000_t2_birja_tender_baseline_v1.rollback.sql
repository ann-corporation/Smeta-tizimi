-- ROLLBACK: 20261108400000_t2_birja_tender_baseline_v1
-- Faqat YANGI narsalar olib tashlanadi; t2_birja_rfq / t2_birja_taklif jadvallari va ularning eski (prod) qatorlari QOLADI.
-- Oldin 20261108420000 (tender RPC) va 20261108410000 (buyurtma) rollback qilingan bo'lishi kerak.
begin;

-- Yangi holat so'zlari -> eski so'zlar (check eskisiga qaytishidan oldin)
update public.t2_birja_rfq set holat = 'ochiq' where holat in ('qoralama', 'elon');
update public.t2_birja_rfq set holat = 'yopiq' where holat in ('yopildi', 'golib_tanlandi');
update public.t2_birja_taklif set holat = 'faol' where holat in ('berildi');
update public.t2_birja_taklif set holat = 'bekor' where holat in ('golib', 'yutqazdi', 'qaytarib_olindi');

drop table if exists public.t2_birja_taklif_qator cascade;
drop table if exists public.t2_birja_rfq_oluvchi cascade;
drop table if exists public.t2_birja_rfq_qator cascade;

drop index if exists public.t2_birja_taklif_faol_uq;
drop index if exists public.t2_birja_rfq_k_o_idx;
drop index if exists public.t2_birja_rfq_ochiq_idx;

alter table public.t2_birja_rfq drop constraint if exists t2_birja_rfq_holat_check;
alter table public.t2_birja_rfq add constraint t2_birja_rfq_holat_check check (holat in ('ochiq', 'yopiq', 'bekor'));
alter table public.t2_birja_taklif drop constraint if exists t2_birja_taklif_holat_check;
alter table public.t2_birja_taklif add constraint t2_birja_taklif_holat_check check (holat in ('faol', 'bekor'));

alter table public.t2_birja_rfq
  drop column if exists obyekt_id, drop column if exists tur, drop column if exists doira, drop column if exists muddat,
  drop column if exists shart, drop column if exists yaratdi_actor_id, drop column if exists yopilgan_vaqt, drop column if exists yangilandi;
alter table public.t2_birja_taklif
  drop column if exists versiya, drop column if exists yetkazish_narx, drop column if exists qqs_foiz,
  drop column if exists yaratdi_actor_id, drop column if exists yangilandi;

-- NOT NULL ni faqat NULL qatorlar bo'lmasa tiklaymiz (yangi ko'p qatorli RFQ/taklif qolgan bo'lsa qo'lda hal qilinadi).
do $$ begin
  if not exists (select 1 from public.t2_birja_rfq where birlik is null or hajm is null) then
    alter table public.t2_birja_rfq alter column birlik set not null, alter column hajm set not null;
  else raise notice 'ROLLBACK: birlik/hajm NULL qatorlar bor - NOT NULL tiklanmadi'; end if;
  if not exists (select 1 from public.t2_birja_taklif where narx is null) then
    alter table public.t2_birja_taklif alter column narx set not null;
  else raise notice 'ROLLBACK: narx NULL qatorlar bor - NOT NULL tiklanmadi'; end if;
end $$;
commit;
