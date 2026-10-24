-- T2 NAZORAT: F2 ekrani uchun qator darajasida АОСР holati (FAQAT O'QISH, additiv).
-- Qator -> bog'langan (bekor qilinmagan) aktlarning eng yaxshi holati:
--   tasdiqlangan | qogoz  -> 'tasdiqlangan' (imzolangan)
--   yangi                 -> 'yangi'        (imzo kutilmoqda)
-- Bloklash yo'q: view faqat ma'lumot beradi. Yangi jadval/RLS/permission YO'Q.
-- Ro'yxat/yozuv RPC lari (t2_tekshiruv, kirish nazorati) quality.* ruxsatlari
-- katalogga F1 da qo'shilgach (docs/architecture/ekotizim E2) alohida migratsiyada.
begin;

create or replace view public.t2_aosr_qator_holat as
select b.qator_id,
       a.obyekt_id,
       case when bool_or(a.holat in ('tasdiqlangan', 'qogoz')) then 'tasdiqlangan'
            when bool_or(a.holat = 'yangi') then 'yangi'
       end as akt_holat,
       count(*)::integer as akt_soni
from public.t2_aosr_bog b
join public.t2_aosr a on a.id = b.aosr_id
where a.holat <> 'bekor'
group by b.qator_id, a.obyekt_id;

revoke all on public.t2_aosr_qator_holat from public, anon, authenticated;
grant select on public.t2_aosr_qator_holat to service_role;

commit;
