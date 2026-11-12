-- Acceptance t2_hisob_yadro_v2 (faqat o'qish; chegarali: ~30 s). Migratsiyadan KEYIN har bir so'rov kutilgan natijani beradi.
set local statement_timeout = '150s';

-- 1) Bargli (ichki rz siz) bo'limlarda saqlangan rz.summa = barglar yig'indisi: 0 qator kutiladi.
with recursive bl as (
  select b.id, b.summa,
         exists (select 1 from public.t2_qator c where c.ota_id = b.id and c.versiya_holat = 'faol' and c.tur in ('rs', 'mat', 'ob')) as has,
         (select sum(c.summa) from public.t2_qator c where c.ota_id = b.id and c.versiya_holat = 'faol' and c.tur in ('rs', 'mat', 'ob')) as nb
    from public.t2_qator b where b.tur = 'bl' and b.versiya_holat = 'faol'
), rz as (
  select r.id, r.obyekt_id, r.summa from public.t2_qator r
   where r.tur = 'rz' and r.versiya_holat = 'faol'
     and not exists (select 1 from public.t2_qator k where k.ota_id = r.id and k.tur = 'rz')
     and exists (select 1 from public.t2_qator k where k.ota_id = r.id and k.versiya_holat = 'faol')
), leaf as (
  select r.id, (with recursive d(id) as (select r.id union all select c.id from d join public.t2_qator c on c.ota_id = d.id and c.versiya_holat = 'faol')
                select sum(l.summa) from d join public.t2_qator l on l.id = d.id
                 where l.tur <> 'rz' and not exists (select 1 from public.t2_qator c2 where c2.ota_id = l.id and c2.versiya_holat = 'faol')) as ls
    from rz r
)
select rz.obyekt_id, rz.id, rz.summa, leaf.ls
  from rz join leaf on leaf.id = rz.id
 where abs(coalesce(rz.summa, 0) - coalesce(leaf.ls, 0)) > 0.5;

-- 2) Langarlar yozilgan: 3 qator, har birida 't' (t = true).
select 'nakopitelniy' as nom, position('hisob_yadro_v2' in pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure)) > 0 as t
union all
select 'agent_fakt', position('hisob_yadro_v2' in pg_get_functiondef('public.t2_agent_fakt_v1(bigint,bigint,text[],bigint)'::regprocedure)) > 0;

-- 3) Qo'lda (aktor bilan): har obyektda select (public.t2_nakopitelniy_v2(<obyekt>, <aktor>))->'jami'->>'fakt_summa'
--    = (select (paket->>'ustamasiz') from public._t2_summa_paket_v1(array[<obyekt>::bigint], 'fakt')) bilan «yadro»/«narx qoidasi» farqidan tashqari mos.