-- Acceptance t2_tezlik_paket_v1: haqiqiy ma'lumot, BEGIN..ROLLBACK (yozuv qolmaydi). Migratsiyadan KEYIN ishlaydi.
-- Cheklangan: eng katta kompaniya + tanlama (5 eng katta + 5 tasodifiy obyekt); eski og'ir _t2_qator_holat_v2 BIR marta (temp jadvalga).
-- Kutiladi: hamma tekshiruv `bad = 0`. Umumiy vaqt < 3 daqiqa.
begin;
set local statement_timeout = '300s';

create temp table _ac_komp on commit drop as
select o.kompaniya_id as id from public.t2_obyekt o where o.holat <> 'bekor' group by o.kompaniya_id order by count(*) desc, o.kompaniya_id limit 1;

create temp table _ac_ob on commit drop as
select x.id, x.kompaniya_id
  from (select o.id, o.kompaniya_id,
               row_number() over (order by (select count(*) from public.t2_qator q where q.obyekt_id = o.id) desc, o.id) as rn,
               row_number() over (order by md5(o.id::text)) as rr
          from public.t2_obyekt o join _ac_komp k on k.id = o.kompaniya_id
         where o.holat <> 'bekor') x
 where x.rn <= 5 or x.rr <= 5;

-- 1) PAKET == har obyekt alohida (tanlama; shartnomasiz va bog'langan shartnoma bilan).
create temp table _ac_juft on commit drop as
select s.kompaniya_id, (select a.foydalanuvchi_id from public.t2_azolik a where a.kompaniya_id = s.kompaniya_id and a.holat = 'faol' order by a.id limit 1) as actor_id,
       s.id as obyekt_id, null::bigint as shartnoma_id
  from _ac_ob s
union all
select s.kompaniya_id, (select a.foydalanuvchi_id from public.t2_azolik a where a.kompaniya_id = s.kompaniya_id and a.holat = 'faol' order by a.id limit 1),
       sb.obyekt_id, sb.shartnoma_id
  from _ac_ob s join public.t2_shartnoma_bog sb on sb.obyekt_id = s.id and sb.holat = 'faol';
delete from _ac_juft where actor_id is null;

create temp table _ac_paket on commit drop as
select c.kompaniya_id, c.actor_id,
       (e.value->>'obyekt_id')::bigint as obyekt_id, nullif(e.value->>'shartnoma_id','')::bigint as shartnoma_id,
       e.value->'natija' as natija
  from (select j.kompaniya_id, j.actor_id,
               jsonb_agg(jsonb_build_object('obyekt_id', j.obyekt_id, 'shartnoma_id', j.shartnoma_id)) as juftlar
          from _ac_juft j group by j.kompaniya_id, j.actor_id) c
  cross join lateral (select (public.t2_obyekt_nakrutka_paket_v1(c.actor_id, c.juftlar))->'natijalar' as n) r
  cross join lateral jsonb_array_elements(r.n) e;

select 'paket_vs_yakka_farq' as tekshiruv, count(*) as bad
  from _ac_paket p
 where p.natija is distinct from public.t2_obyekt_nakrutka_v1(p.obyekt_id, p.actor_id, p.shartnoma_id);
select 'paket_juft_yoqolgan' as tekshiruv, count(*) as bad
  from _ac_juft j
 where not exists (select 1 from _ac_paket p where p.obyekt_id = j.obyekt_id and p.shartnoma_id is not distinct from j.shartnoma_id);

-- 2) Chegara holatlari.
select 'begona_actor_ok_emas' as tekshiruv, count(*) as bad
  from (select (public.t2_obyekt_nakrutka_paket_v1(9999999, jsonb_build_array(jsonb_build_object('obyekt_id', (select min(id) from _ac_ob))))->'natijalar'->0->'natija'->>'ok') as ok) x
 where x.ok is distinct from 'false';
select 'juftlar_notogri' as tekshiruv, count(*) as bad
  from (select (public.t2_obyekt_nakrutka_paket_v1(1, '{}'::jsonb))->>'code' as c) x where x.c is distinct from 'JUFTLAR_NOTOGRI';

-- 3) ESKI og'ir hisob BIR marta (butun kompaniya) temp jadvalga; yangi funksiya shunga solishtiriladi.
create temp table _ac_eski on commit drop as
select h.qator_id, h.obyekt_id, h.smeta_hajm, h.fakt_hajm, h.f2_hajm
  from public._t2_qator_holat_v2(array(select o.id from public.t2_obyekt o join _ac_komp k on k.id = o.kompaniya_id)) h;
create temp table _ac_yangi on commit drop as
select y.obyekt_id, y.smeta_hajm, y.fakt_hajm, y.f2_hajm
  from public._t2_ortiqcha_olchov_v1(array(select o.id from public.t2_obyekt o join _ac_komp k on k.id = o.kompaniya_id)) y;

select 'ortiqcha_olchov_soni' as tekshiruv, case when (select count(*) from _ac_eski) = (select count(*) from _ac_yangi) then 0 else 1 end as bad;
select 'ortiqcha_olchov_farq' as tekshiruv, count(*) as bad
  from (
    (select obyekt_id, smeta_hajm, fakt_hajm, f2_hajm from _ac_eski except all select obyekt_id, smeta_hajm, fakt_hajm, f2_hajm from _ac_yangi)
    union all
    (select obyekt_id, smeta_hajm, fakt_hajm, f2_hajm from _ac_yangi except all select obyekt_id, smeta_hajm, fakt_hajm, f2_hajm from _ac_eski)
  ) d;

-- 4) Mindmap (shu kompaniya, bir marta): obyekt tugunlaridagi ortiqcha_soni == eski hisob (_ac_eski asosida).
select 'mindmap_ortiqcha_farq' as tekshiruv, count(*) as bad
  from (select t->>'id' as id, (t->'meta'->>'ortiqcha_soni')::int as soni
          from jsonb_array_elements(public.t2_mindmap_grafi((select id from _ac_komp))->'tugunlar') t where t->>'tur' = 'obyekt') g
  left join (
    select 'obyekt:' || r.obyekt_id as id, count(*)::int as n
      from (select qh.obyekt_id, (qh.f2_hajm - qh.fakt_hajm) as a1,
                   case when qh.smeta_hajm >= 0 then qh.f2_hajm - qh.smeta_hajm end as a2
              from _ac_eski qh
             where coalesce(qh.f2_hajm,0) > coalesce(qh.fakt_hajm,0)
                or (qh.smeta_hajm >= 0 and coalesce(qh.f2_hajm,0) > qh.smeta_hajm)
                or (qh.smeta_hajm >= 0 and coalesce(qh.fakt_hajm,0) > qh.smeta_hajm)) r
     where (r.a1 > 0 or r.a2 > 0) group by r.obyekt_id) o on o.id = g.id
 where g.soni is distinct from coalesce(o.n, 0);
select 'mindmap_anchor' as tekshiruv, case when position('tezlik_v2' in pg_get_functiondef('public.t2_mindmap_grafi(bigint)'::regprocedure)) > 0 then 0 else 1 end as bad;

rollback;