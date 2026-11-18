-- MINUS qator (normaga keltirish, hajm < 0) <-> asos (BASE) qator JUFTI: deterministik, JADVALSIZ (hosila funksiya).
-- Sabab: asos ish fakti yozilganda uning MINUS jufti (masalan E6-1-97-1 "УСТАНОВКА АРМАТУРЫ/ИСКЛЮЧИТЬ ЗАТ/ТРУДА/" <-> E6-2-11-3,
-- E15-2-19-11/12 <-> E15-2-19-7/8, E15-1-5-1 <-> E15-1-1-x) faktsiz qolib, F2 qoralamada tushib ketmasligi uchun.
-- Qoidalar (bir obyekt, faol versiya, bir bo'lim = bir ota_id, bir xil birlik, MINUS dan OLDINGI musbat BL qatorlar; birinchi mos daraja yutadi):
--   1 havola_hajm : nom ichidagi "К НОРМЕ xx-xx-xx-xx" havolasi = asos kodi (ENiR/ShNK formatlari normallashtiriladi) VA |hajm| teng
--   2 havola      : havola = asos kodi (hajm farqli)
--   3 hajm_oila3  : |hajm| teng + norma oilasi (xx-xx-xx) bir xil
--   4 hajm_oila2  : |hajm| teng + (xx-xx) bir xil
--   5 hajm_bob    : |hajm| teng + bob (xx) bir xil
--   6 hajm        : faqat |hajm| teng
-- Bir darajada nomzod bitta -> holat 'aniq'; bir nechta -> 'noaniq' (TAXMIN QILINMAYDI, ro'yxatda hisobot); hech biri yo'q -> 'juftsiz'.
-- Fakt ergashishi (20270108000100) faqat 'aniq' juftlarni ishlatadi. Hech narsa yozilmaydi; BEGIN/COMMIT/ROLLBACK yo'q.

create or replace function public._t2_norma_kalit_v1(p_kod text)
returns text language sql immutable parallel safe set search_path = public, pg_temp as $f$
  -- "E15-2-19-12 ШНК.ДОП.12 К=7" -> '15-2-19-12'; "Е1502-019-11 ДОП..." -> '15-2-19-11'; "Ц3-5-1-7 ..." -> '3-5-1-7'; boshqasi -> null.
  with k as (select regexp_replace(upper(split_part(btrim(coalesce(p_kod, '')), ' ', 1)), '^[A-ZА-ЯЁ]+', '') as kb)
  select case
    when kb ~ '^[0-9]{4}-[0-9]{1,6}-[0-9]{1,6}$' then
      substr(kb, 1, 2)::int || '-' || substr(kb, 3, 2)::int || '-' || split_part(kb, '-', 2)::int || '-' || split_part(kb, '-', 3)::int
    when kb ~ '^[0-9]{1,2}-[0-9]{1,6}-[0-9]{1,6}-[0-9]{1,6}' then
      split_part(kb, '-', 1)::int || '-' || split_part(kb, '-', 2)::int || '-' || split_part(kb, '-', 3)::int || '-'
      || substring(split_part(kb, '-', 4) from '^[0-9]{1,6}')::int
  end from k
$f$;

create or replace function public._t2_norma_havolalar_v1(p_nom text)
returns text[] language sql immutable parallel safe set search_path = public, pg_temp as $f$
  select coalesce(array_agg(distinct (x[1]::int || '-' || x[2]::int || '-' || x[3]::int || '-' || x[4]::int)), '{}'::text[])
    from regexp_matches(coalesce(p_nom, ''), '(?<![0-9-])([0-9]{1,2})-([0-9]{1,2})-([0-9]{1,3})-([0-9]{1,3})(?![0-9])', 'g') x
$f$;

create or replace function public.t2_fakt_minus_juft_v1(p_obyekt_id bigint)
returns table(minus_id bigint, baza_id bigint, qoida text, daraja integer, nomzodlar bigint[], holat text)
language sql stable set search_path = public, pg_temp as $f$
  with b as (
    select q.id, q.ota_id, q.tartib, q.hajm, q.nom,
           public._t2_norma_kalit_v1(q.kod) as kk,
           split_part(coalesce(public.t2_birlik_key(q.birlik), ''), ' ', 1) as bk
      from public.t2_qator q
     where q.obyekt_id = p_obyekt_id and q.tur = 'bl' and q.versiya_holat = 'faol' and q.hajm is not null and q.hajm <> 0),
  m as (select b.*, public._t2_norma_havolalar_v1(b.nom) as refs from b where b.hajm < 0),
  c as (select * from b where b.hajm > 0),
  j as (
    select m.id as mid, c.id as cid, c.tartib as ctart,
           (c.kk is not null and c.kk = any(m.refs)) as r1,
           (abs(abs(m.hajm) - c.hajm) <= greatest(0.0001, c.hajm * 0.000001)) as vol,
           (m.kk is not null and c.kk is not null and split_part(m.kk, '-', 1) || '-' || split_part(m.kk, '-', 2) || '-' || split_part(m.kk, '-', 3)
              = split_part(c.kk, '-', 1) || '-' || split_part(c.kk, '-', 2) || '-' || split_part(c.kk, '-', 3)) as f3,
           (m.kk is not null and c.kk is not null and split_part(m.kk, '-', 1) || '-' || split_part(m.kk, '-', 2)
              = split_part(c.kk, '-', 1) || '-' || split_part(c.kk, '-', 2)) as f2,
           (m.kk is not null and c.kk is not null and split_part(m.kk, '-', 1) = split_part(c.kk, '-', 1)) as f1
      from m join c on c.ota_id is not distinct from m.ota_id and c.tartib < m.tartib and c.bk = m.bk),
  t as (
    select j.*, case when r1 and vol then 1 when r1 then 2 when vol and f3 then 3 when vol and f2 then 4 when vol and f1 then 5 when vol then 6 end as tier
      from j),
  best as (select mid, min(tier) as bt from t where tier is not null group by mid),
  agg as (
    select t.mid, best.bt, array_agg(t.cid order by t.ctart desc) as cids
      from t join best on best.mid = t.mid and t.tier = best.bt group by t.mid, best.bt)
  select m.id,
         case when a.bt is not null and cardinality(a.cids) = 1 then a.cids[1] end,
         case a.bt when 1 then 'havola_hajm' when 2 then 'havola' when 3 then 'hajm_oila3' when 4 then 'hajm_oila2' when 5 then 'hajm_bob' when 6 then 'hajm' end,
         a.bt::integer,
         a.cids,
         case when a.bt is null then 'juftsiz' when cardinality(a.cids) = 1 then 'aniq' else 'noaniq' end
    from m left join agg a on a.mid = m.id
   order by m.tartib, m.id
$f$;
comment on function public.t2_fakt_minus_juft_v1(bigint) is
  'MINUS qator (hajm<0) -> asos BL qator jufti (hosila, jadvalsiz). holat: aniq | noaniq (bir nechta nomzod, taxmin qilinmaydi) | juftsiz. Qoidalar migratsiya sarlavhasida.';

revoke all on function public._t2_norma_kalit_v1(text), public._t2_norma_havolalar_v1(text), public.t2_fakt_minus_juft_v1(bigint) from public, anon, authenticated;
grant execute on function public._t2_norma_kalit_v1(text), public._t2_norma_havolalar_v1(text), public.t2_fakt_minus_juft_v1(bigint) to service_role;

-- Hisobot: aniqlanmagan juftlar (noaniq/juftsiz) — bitta obyekt yoki (null) hamma MINUS qatorli obyektlar. Faqat o'qiydi.
create or replace function public.t2_fakt_minus_juft_hisobot_v1(p_obyekt_id bigint default null)
returns table(obyekt_id bigint, minus_id bigint, kod text, nom text, birlik text, hajm numeric, holat text, nomzodlar bigint[])
language sql stable set search_path = public, pg_temp as $f$
  select q.obyekt_id, q.id, q.kod, left(q.nom, 120), q.birlik, q.hajm, j.holat, j.nomzodlar
    from (select distinct z.obyekt_id as oid from public.t2_qator z
           where z.tur = 'bl' and z.hajm < 0 and z.versiya_holat = 'faol' and (p_obyekt_id is null or z.obyekt_id = p_obyekt_id)) o
   cross join lateral public.t2_fakt_minus_juft_v1(o.oid) j
    join public.t2_qator q on q.id = j.minus_id
   where j.holat <> 'aniq'
   order by q.obyekt_id, q.tartib, q.id
$f$;
revoke all on function public.t2_fakt_minus_juft_hisobot_v1(bigint) from public, anon, authenticated;
grant execute on function public.t2_fakt_minus_juft_hisobot_v1(bigint) to service_role;
