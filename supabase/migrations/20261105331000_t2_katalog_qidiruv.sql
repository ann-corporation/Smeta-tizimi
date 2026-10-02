-- Katalogdan qidirish (egasi 2026-10-03: "katalogni yuklab bo'ldi, endi uni qanday ishlatib qayerdan ko'rsam bo'ladi").
-- 213 691 qatorlik platforma katalogida nom bo'yicha qidiruv (trigram indeks — ILIKE '%…%' tez), hudud kaliti bo'yicha
-- filtr. Qoraqalpog'iston varag'i "Республика Кара, сум" deb qisqartirilgan — hudud kaliti tanimasdi (12/14 hudud).
begin;

create extension if not exists pg_trgm with schema extensions;

create index if not exists t2_narx_manba_qator_platforma_nom_trgm on public.t2_narx_manba_qator
  using gin (nom extensions.gin_trgm_ops) where kompaniya_id is null and not sarlavha;

create or replace function public.t2_hudud_kalit(p text) returns text
language sql immutable parallel safe as $$
  select case
    when t ~ '(каракалп|qoraqalp|karakalp|республика\s+кара)' then 'qoraqalpogiston'
    when t ~ '(андижан|andijon|andijan)' then 'andijon'
    when t ~ '(бухар|buxoro|bukhar)' then 'buxoro'
    when t ~ '(джизак|жиззах|jizzax|djizak)' then 'jizzax'
    when t ~ '(кашкадар|қашқадар|qashqadar|kashkadar)' then 'qashqadaryo'
    when t ~ '(навои|навоий|navoi)' then 'navoiy'
    when t ~ '(наманган|namangan)' then 'namangan'
    when t ~ '(самарканд|самарқанд|samarqand|samarkand)' then 'samarqand'
    when t ~ '(сурхандар|surxondar|surkhandar)' then 'surxondaryo'
    when t ~ '(сырдар|сирдар|sirdar|syrdar)' then 'sirdaryo'
    when t ~ '(ферган|фарғон|farg|fergan)' then 'fargona'
    when t ~ '(хорезм|хоразм|xorazm|khorezm)' then 'xorazm'
    when t ~ '(ташкент|тошкент|toshkent|tashkent)' and t ~ '(обл|вилоят|viloyat|region)' then 'toshkent_vil'
    when t ~ '(ташкент|тошкент|toshkent|tashkent)' then 'toshkent_sh'
  end
  from (select lower(coalesce(p, '')) t) x
$$;
-- Ifoda indeksi funksiya o'zgargani uchun qayta quriladi.
reindex index public.t2_narx_manba_qator_hudud_kalit_idx;

create or replace view public.t2_platforma_narx_manba_qator as
select q.id, q.manba_id, q.kod, q.nom, q.birlik, q.narx, q.hudud, q.ishlab_chiqaruvchi, q.nds_holati, q.nds_izoh,
  q.yil, q.kvartal, q.narx_varianti, q.guruh,
  public.t2_hudud_kalit(q.hudud) as hudud_kalit, m.nom as manba_nom, m.tur as manba_tur
from public.t2_narx_manba_qator q
join public.t2_narx_manba m on m.id = q.manba_id and m.holat = 'faol'
where q.kompaniya_id is null and not q.sarlavha;

commit;
