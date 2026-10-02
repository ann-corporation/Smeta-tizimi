-- Chel.-soat narxi obyekt HUDUDIDAN (egasi 2026-10-03: "maps dan lokatsiyasi berilishini qo'shishimiz kerak, tizim
-- shundan katalogdagi mos regionni aniqlay oladi yoki qo'lda manzil tanlanishi kerak").
-- Avval: ish haqi katalogi qatorlari HUDUD nomi bilan ("Город Ташкент", "Навоийская область"), smetada esa "Затраты труда
-- рабочих" — nom bo'yicha bog'lanish hech qachon ishlamasdi (chel.-soat taklifi umuman yo'q edi).
-- Endi: (1) t2_hudud_kalit — har xil yozuvni 14 kanonik hududga keltiradi; (2) t2_obyekt.hudud (operator tasdiqlaydi:
-- xaritadan taklif yoki qo'lda); (3) t2_narx_taklif ga uchinchi tarmoq: ЧЕЛ resurs × obyekt hududi × ish haqi
-- katalogining shu hududdagi ENG YANGI davri (barcha ijtimoiy soliq variantlari — operator tanlaydi).
begin;

create or replace function public.t2_hudud_kalit(p text) returns text
language sql immutable parallel safe as $$
  select case
    when t ~ '(каракалп|qoraqalp|karakalp)' then 'qoraqalpogiston'
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

alter table public.t2_obyekt add column if not exists hudud text;
alter table public.t2_obyekt drop constraint if exists t2_obyekt_hudud_check;
alter table public.t2_obyekt add constraint t2_obyekt_hudud_check check (hudud is null or hudud in (
  'qoraqalpogiston','andijon','buxoro','jizzax','qashqadaryo','navoiy','namangan','samarqand','surxondaryo',
  'sirdaryo','toshkent_vil','fargona','xorazm','toshkent_sh'));

-- Obyekt hududini belgilash: a'zo (rahbar emas) — actor sessiyadan, kompaniya obyektdan.
create or replace function public.t2_obyekt_hudud_belgila_v1(p_actor_id bigint, p_obyekt_id bigint, p_hudud text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_komp bigint; v_rol text;
begin
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok', false, 'error', 'Obyekt topilmadi'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol = 'rahbar' then return jsonb_build_object('ok', false, 'error', 'Ruxsat yo''q'); end if;
  if p_hudud is not null and p_hudud not in ('qoraqalpogiston','andijon','buxoro','jizzax','qashqadaryo','navoiy','namangan',
      'samarqand','surxondaryo','sirdaryo','toshkent_vil','fargona','xorazm','toshkent_sh') then
    return jsonb_build_object('ok', false, 'error', 'Hudud noto''g''ri');
  end if;
  update public.t2_obyekt set hudud = p_hudud where id = p_obyekt_id;
  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'hudud', p_hudud);
end $$;
revoke execute on function public.t2_obyekt_hudud_belgila_v1(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.t2_obyekt_hudud_belgila_v1(bigint, bigint, text) to service_role;

create index if not exists t2_narx_manba_qator_hudud_kalit_idx on public.t2_narx_manba_qator (public.t2_hudud_kalit(hudud))
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
  union all
  -- Chel.-soat: ЧЕЛ resurs × obyekt hududi × ish haqi katalogining shu hududdagi eng yangi davri.
  select q.kompaniya_id, q.obyekt_id, q.id, mq.id, 'hudud'::text
  from public.t2_qator q
  join public.t2_obyekt o on o.id = q.obyekt_id and o.hudud is not null
  join public.t2_narx_manba_qator mq on public.t2_hudud_kalit(mq.hudud) = o.hudud and not mq.sarlavha and mq.narx is not null
   and (mq.kompaniya_id = q.kompaniya_id or mq.kompaniya_id is null)
  join public.t2_narx_manba m2 on m2.id = mq.manba_id and m2.tur = 'chel_chas' and m2.holat = 'faol'
  where q.tur = any (array['rs', 'mat', 'ob']) and upper(btrim(coalesce(q.kat, ''))) = 'ЧЕЛ'
    and coalesce(mq.yil, m2.yil, 0) * 10 + coalesce(mq.kvartal, m2.kvartal, 0) = (
      select max(coalesce(x.yil, xm.yil, 0) * 10 + coalesce(x.kvartal, xm.kvartal, 0))
      from public.t2_narx_manba_qator x join public.t2_narx_manba xm on xm.id = x.manba_id and xm.tur = 'chel_chas' and xm.holat = 'faol'
      where public.t2_hudud_kalit(x.hudud) = o.hudud and not x.sarlavha and x.narx is not null
        and (x.kompaniya_id = q.kompaniya_id or x.kompaniya_id is null))
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
