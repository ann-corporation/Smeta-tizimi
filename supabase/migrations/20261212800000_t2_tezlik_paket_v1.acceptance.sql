-- Acceptance t2_tezlik_paket_v1: haqiqiy ma'lumot, BEGIN..ROLLBACK (yozuv qolmaydi). Migratsiyadan KEYIN ishlaydi.
-- Kutiladi: hamma tekshiruv `bad = 0`.
begin;

-- 1) PAKET == har obyekt alohida. Har kompaniya uchun faol a'zo (superadmin ham) nomidan; obyektlar: hammasi, shartnoma: bog'langan bo'lsa u bilan ham.
create temp table _pk_juft on commit drop as
select k.id as kompaniya_id,
       (select a.foydalanuvchi_id from public.t2_azolik a where a.kompaniya_id = k.id and a.holat = 'faol' order by a.id limit 1) as actor_id,
       o.id as obyekt_id, null::bigint as shartnoma_id
  from public.t2_kompaniya k join public.t2_obyekt o on o.kompaniya_id = k.id and o.holat <> 'bekor'
 where k.faol
union all
select k.id,
       (select a.foydalanuvchi_id from public.t2_azolik a where a.kompaniya_id = k.id and a.holat = 'faol' order by a.id limit 1),
       sb.obyekt_id, sb.shartnoma_id
  from public.t2_kompaniya k
  join public.t2_obyekt o on o.kompaniya_id = k.id and o.holat <> 'bekor'
  join public.t2_shartnoma_bog sb on sb.obyekt_id = o.id and sb.holat = 'faol'
 where k.faol;
delete from _pk_juft where actor_id is null;

create temp table _pk_paket on commit drop as
select c.kompaniya_id, c.actor_id,
       (e.value->>'obyekt_id')::bigint as obyekt_id, nullif(e.value->>'shartnoma_id','')::bigint as shartnoma_id,
       e.value->'natija' as natija
  from (select j.kompaniya_id, j.actor_id,
               jsonb_agg(jsonb_build_object('obyekt_id', j.obyekt_id, 'shartnoma_id', j.shartnoma_id)) as juftlar
          from _pk_juft j group by j.kompaniya_id, j.actor_id) c
  cross join lateral (select (public.t2_obyekt_nakrutka_paket_v1(c.actor_id, c.juftlar))->'natijalar' as n) r
  cross join lateral jsonb_array_elements(r.n) e;

select 'paket_vs_yakka_farq' as tekshiruv, count(*) as bad
  from _pk_paket p
 where p.natija is distinct from public.t2_obyekt_nakrutka_v1(p.obyekt_id, p.actor_id, p.shartnoma_id);
select 'paket_juft_yoqolgan' as tekshiruv, count(*) as bad
  from _pk_juft j
 where not exists (select 1 from _pk_paket p where p.obyekt_id = j.obyekt_id and p.shartnoma_id is not distinct from j.shartnoma_id and p.kompaniya_id = j.kompaniya_id);

-- 2) A'zo bo'lmagan actor: batch yiqilmaydi, har juftlik ok=false (yakka funksiya istisno beradi).
select 'begona_actor_ok_emas' as tekshiruv, count(*) as bad
  from (select (public.t2_obyekt_nakrutka_paket_v1(9999999, jsonb_build_array(jsonb_build_object('obyekt_id', (select min(id) from public.t2_obyekt))))->'natijalar'->0->'natija'->>'ok') as ok) x
 where x.ok is distinct from 'false';
select 'juftlar_notogri' as tekshiruv, count(*) as bad
  from (select (public.t2_obyekt_nakrutka_paket_v1(1, '{}'::jsonb))->>'code' as c) x where x.c is distinct from 'JUFTLAR_NOTOGRI';

-- 3) _t2_ortiqcha_olchov_v1 == _t2_qator_holat_v2 (smeta_hajm/fakt_hajm/f2_hajm), obyekt bo'yicha agregat (qator id yo'q), kompaniyama-kompaniya.
select 'ortiqcha_olchov_agregat_farq' as tekshiruv, count(*) as bad
  from (select k.id as kid from public.t2_kompaniya k where exists (select 1 from public.t2_obyekt o where o.kompaniya_id = k.id)) c
  cross join lateral (
    select * from (
      select obyekt_id, count(*) n, sum(coalesce(smeta_hajm,0)) s, sum(coalesce(fakt_hajm,0)) f, sum(coalesce(f2_hajm,0)) t,
             count(*) filter (where smeta_hajm is null) sn, count(*) filter (where fakt_hajm is null) fn
        from public._t2_qator_holat_v2(array(select id from public.t2_obyekt where kompaniya_id = c.kid)) group by obyekt_id
      except
      select obyekt_id, count(*), sum(coalesce(smeta_hajm,0)), sum(coalesce(fakt_hajm,0)), sum(coalesce(f2_hajm,0)),
             count(*) filter (where smeta_hajm is null), count(*) filter (where fakt_hajm is null)
        from public._t2_ortiqcha_olchov_v1(array(select id from public.t2_obyekt where kompaniya_id = c.kid)) group by obyekt_id) a
    union all
    select * from (
      select obyekt_id, count(*), sum(coalesce(smeta_hajm,0)), sum(coalesce(fakt_hajm,0)), sum(coalesce(f2_hajm,0)),
             count(*) filter (where smeta_hajm is null), count(*) filter (where fakt_hajm is null)
        from public._t2_ortiqcha_olchov_v1(array(select id from public.t2_obyekt where kompaniya_id = c.kid)) group by obyekt_id
      except
      select obyekt_id, count(*) n, sum(coalesce(smeta_hajm,0)), sum(coalesce(fakt_hajm,0)), sum(coalesce(f2_hajm,0)),
             count(*) filter (where smeta_hajm is null), count(*) filter (where fakt_hajm is null)
        from public._t2_qator_holat_v2(array(select id from public.t2_obyekt where kompaniya_id = c.kid)) group by obyekt_id) b
  ) d;

-- 4) Mindmap: har obyekt tuguni `ortiqcha_soni` == eski hisob (_t2_qator_holat_v2 asosida ort).
select 'mindmap_ortiqcha_farq' as tekshiruv, count(*) as bad
  from (select k.id as kid from public.t2_kompaniya k where exists (select 1 from public.t2_obyekt o where o.kompaniya_id = k.id)) c
  cross join lateral (
    select t->>'id' as id, (t->'meta'->>'ortiqcha_soni')::int as soni
      from jsonb_array_elements(public.t2_mindmap_grafi(c.kid)->'tugunlar') t where t->>'tur' = 'obyekt') g
  left join lateral (
    select 'obyekt:' || r.obyekt_id as id, count(*)::int as n
      from (select qh.obyekt_id, (qh.f2_hajm - qh.fakt_hajm) as a1,
                   case when qh.smeta_hajm >= 0 then qh.f2_hajm - qh.smeta_hajm end as a2
              from public._t2_qator_holat_v2(array(select id from public.t2_obyekt where kompaniya_id = c.kid)) qh
             where coalesce(qh.f2_hajm,0) > coalesce(qh.fakt_hajm,0)
                or (qh.smeta_hajm >= 0 and coalesce(qh.f2_hajm,0) > qh.smeta_hajm)
                or (qh.smeta_hajm >= 0 and coalesce(qh.fakt_hajm,0) > qh.smeta_hajm)) r
     where (r.a1 > 0 or r.a2 > 0) group by r.obyekt_id) o on o.id = g.id
 where g.soni is distinct from coalesce(o.n, 0);
select 'mindmap_anchor' as tekshiruv, case when position('tezlik_v2' in pg_get_functiondef('public.t2_mindmap_grafi(bigint)'::regprocedure)) > 0 then 0 else 1 end as bad;

rollback;