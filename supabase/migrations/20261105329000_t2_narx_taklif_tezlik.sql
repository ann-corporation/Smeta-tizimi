-- t2_narx_taklif tezligi (2026-10-03). Platforma katalogi (kompaniya_id NULL) qo'shilgach bog'lanish
-- "(mq.kompaniya_id = q.kompaniya_id OR mq.kompaniya_id IS NULL) AND (kod mosligi OR nom+birlik mosligi)" — hech bir
-- indeksga tushmaydi: Game Club (2 531 resurs) × katalogning 26 ming qatori = 66 mln juftlik, 20,7 s. Egasi yuklayotgan
-- to'liq katalog (213 691 qator) bilan sahifa umuman ochilmasdi.
-- Endi: kompaniyasiz indekslar (kod_key; nom_key+birlik_key) va ikki indeksli tarmoq (kod / nom+birlik), har tarmoq
-- kompaniya/obyekt ustunini olib yuradi — tashqi "kompaniya_id = … and obyekt_id = …" filtri tarmoqlar ichiga tushadi.
-- Ustunlar va ma'no o'zgarmaydi (kod mosligi bo'lgan juftlik nom tarmog'ida takrorlanmaydi).
begin;

create index if not exists t2_narx_manba_qator_kod_global_idx on public.t2_narx_manba_qator (kod_key)
  where kod_key is not null and kod_key <> '' and not sarlavha and narx is not null;
create index if not exists t2_narx_manba_qator_nom_global_idx on public.t2_narx_manba_qator (nom_key, birlik_key)
  where not sarlavha and narx is not null;

create or replace view public.t2_narx_taklif as
with juft as not materialized (
  select q.kompaniya_id, q.obyekt_id, q.id as qator_id, mq.id as mq_id, 'kod'::text as moslik
  from public.t2_qator q join public.t2_narx_manba_qator mq
    on mq.kod_key = public.t2_resurs_nom_kalit(q.kod) and mq.kod_key is not null and mq.kod_key <> ''
   and not mq.sarlavha and mq.narx is not null
   and (mq.kompaniya_id = q.kompaniya_id or mq.kompaniya_id is null)
  where q.tur = any (array['rs', 'mat', 'ob']) and q.kod is not null
  union all
  select q.kompaniya_id, q.obyekt_id, q.id, mq.id, 'nom_birlik'::text
  from public.t2_qator q join public.t2_narx_manba_qator mq
    on mq.nom_key = q.nom_key and mq.birlik_key is not distinct from q.birlik_key and not mq.sarlavha and mq.narx is not null
   and (mq.kompaniya_id = q.kompaniya_id or mq.kompaniya_id is null)
  where q.tur = any (array['rs', 'mat', 'ob'])
    and not (mq.kod_key is not null and mq.kod_key <> '' and mq.kod_key = public.t2_resurs_nom_kalit(q.kod))
)
select j.kompaniya_id, j.obyekt_id, q.id as qator_id, q.tur, q.kat, q.kod, q.nom, q.birlik, q.narx as smeta_narx,
  mq.id as manba_qator_id, mq.manba_id, m.tur as manba_tur, m.nom as manba_nom, m.raqam as manba_raqam, m.sana as manba_sana,
  coalesce(mq.yil, m.yil) as yil, coalesce(mq.kvartal, m.kvartal) as kvartal, coalesce(mq.hudud, m.region) as region,
  m.yetkazuvchi, coalesce(mq.nds_holati, m.nds_holati) as nds_holati,
  mq.kod as manba_kod, mq.nom as manba_nom_qator, mq.birlik as manba_birlik, mq.narx as manba_narx,
  j.moslik,
  mq.ishlab_chiqaruvchi, mq.nds_izoh, mq.narx_varianti, mq.guruh as manba_guruh, m.kompaniya_id is null as platforma
from juft j
join public.t2_qator q on q.id = j.qator_id
join public.t2_narx_manba_qator mq on mq.id = j.mq_id
join public.t2_narx_manba m on m.id = mq.manba_id and m.holat = 'faol';

commit;
