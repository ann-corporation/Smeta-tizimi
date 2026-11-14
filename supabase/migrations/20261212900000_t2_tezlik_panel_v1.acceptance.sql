-- Acceptance t2_tezlik_panel_v1: haqiqiy ma'lumot, BEGIN..ROLLBACK. Migratsiyadan KEYIN ishlaydi.
-- Cheklangan: eng katta kompaniya; eski hisoblar BIR martadan. ESKI _t2_summa_agg_v1 matni vaqtinchalik _ac_agg_eski sifatida shu tranzaksiyada
-- yaratiladi (ROLLBACK bilan yo'qoladi) va yangisi bilan o'lchovma-o'lchov solishtiriladi. Kutiladi: hamma tekshiruv bad = 0. Vaqt < 3 daqiqa.
begin;
set local statement_timeout = '300s';

create temp table _ac_komp on commit drop as
select o.kompaniya_id as id from public.t2_obyekt o where o.holat <> 'bekor' group by o.kompaniya_id order by count(*) desc, o.kompaniya_id limit 1;
create temp table _ac_ids on commit drop as
select array(select o.id from public.t2_obyekt o join _ac_komp k on k.id = o.kompaniya_id order by o.id) as ids;

-- 1) _t2_fakt_olchov_v1 == _t2_qator_holat_v2 (7 ustun, qator darajasida, ikki yo'nalishda).
create temp table _ac_eski on commit drop as
select h.qator_id, h.obyekt_id, h.smeta_hajm, h.smeta_narx, h.fakt_hajm, h.fakt_summa, h.f2_hajm
  from public._t2_qator_holat_v2((select ids from _ac_ids)) h;
create temp table _ac_yangi on commit drop as
select y.qator_id, y.obyekt_id, y.smeta_hajm, y.smeta_narx, y.fakt_hajm, y.fakt_summa, y.f2_hajm
  from public._t2_fakt_olchov_v1((select ids from _ac_ids)) y;
select 'fakt_olchov_soni' as tekshiruv, case when (select count(*) from _ac_eski) = (select count(*) from _ac_yangi) then 0 else 1 end as bad;
select 'fakt_olchov_farq' as tekshiruv, count(*) as bad from (
  (select * from _ac_eski except all select * from _ac_yangi)
  union all
  (select * from _ac_yangi except all select * from _ac_eski)) d;

-- 2) _t2_summa_agg_v1: ESKI matn (nomi _ac_agg_eski) vs YANGI (migratsiyadan keyingi), har o'lchov uchun.
create function public._ac_agg_eski(p_obyekt_ids bigint[], p_olchov text, p_akt_ids bigint[], p_dan date, p_gacha date, p_podval text, p_blok text)
returns table(obyekt_id bigint, agg jsonb) language sql stable set search_path to 'public', 'pg_temp' as $ac$

  with recursive
  bolim0 as (
    select y.id, y.obyekt_id, y.qator_id, y.turi, y.kontragent_nom, y.svod_summa, y.qqs_stavka
      from public.t2_svod_yaxlit y where y.faol and y.obyekt_id = any(p_obyekt_ids)
       and (p_olchov not in ('smeta', 'smeta_joriy') or exists (select 1 from public.t2_qator qq where qq.id = y.qator_id and qq.versiya_holat = 'faol'
              and (p_olchov = 'smeta_joriy' or public.t2_qator_asl_v1(qq.change_type, qq.qoshimcha, qq.zamena))))
  ),
  yr as (
    select b.id as bolim_id, b.qator_id as id from bolim0 b
    union all
    select yr.bolim_id, q.id from public.t2_qator q join yr on q.ota_id = yr.id
  ),
  yb as (select distinct on (yr.id) yr.id, yr.bolim_id from yr order by yr.id, yr.bolim_id),
  ota as (select distinct q.ota_id as id from public.t2_qator q where q.obyekt_id = any(p_obyekt_ids) and q.ota_id is not null),
  miqdor as (
    -- Smeta (asl) — CONST: qo'shimcha/zamena qatorlari kirmaydi (egasi 2026-11-06).
    select q.id as qator_id, q.summa as s, q.hajm as h, (q.summa is null and coalesce(q.hajm, 0) <> 0) as nom, null::numeric as osh
      from public.t2_qator q
     where p_olchov = 'smeta' and q.obyekt_id = any(p_obyekt_ids) and q.versiya_holat = 'faol'
       and public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)
    union all
    -- Smeta + o'zgarishlar (hosila): asl − almashtirilgan − bajarilmadi + qo'shimcha + zamena.
    select l.qator_id, l.joriy_summa, l.joriy_hajm, (l.joriy_summa is null and coalesce(l.joriy_hajm, 0) <> 0), null::numeric
      from public._t2_smeta_qatlam_qator_v1(p_obyekt_ids) l
     where p_olchov = 'smeta_joriy'
    union all
    select h.qator_id, h.fakt_summa, h.fakt_hajm, (h.fakt_summa is null and coalesce(h.fakt_hajm, 0) <> 0),
           case when coalesce(h.f2_hajm, 0) > coalesce(h.smeta_hajm, 0) and h.smeta_narx is not null
                then (h.f2_hajm - coalesce(h.smeta_hajm, 0)) * h.smeta_narx end
      from public._t2_qator_holat_v2(p_obyekt_ids) h
     where p_olchov = 'fakt'
    union all
    select aq.qator_id, coalesce(aq.certified_amount, aq.summa), coalesce(aq.certified_quantity, aq.hajm, 0),
           (coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0), null::numeric
      from public.t2_akt a
      join public.t2_akt_qator aq on aq.akt_id = a.id
     where p_olchov in ('f2', 'f2_qoralama', 'aktlar')
       and a.obyekt_id = any(p_obyekt_ids)
       and case p_olchov
             when 'f2' then a.tur = 'f2' and a.holat = 'tasdiqlangan'
             when 'f2_qoralama' then a.tur = 'f2' and a.holat = 'qoralama'
             else a.id = any(coalesce(p_akt_ids, '{}'::bigint[])) end
       and case coalesce(p_podval, 'hammasi')
             when 'siz' then not exists (select 1 from public.t2_akt_podval ap where ap.akt_id = a.id and ap.blok = coalesce(aq.raw_snapshot->>'stornoOf', ''))
             when 'bor' then exists (select 1 from public.t2_akt_podval ap where ap.akt_id = a.id and ap.blok = coalesce(aq.raw_snapshot->>'stornoOf', '')
                                        and (p_blok is null or ap.blok = p_blok))
             else true end
       and (p_dan is null or a.oy >= p_dan)
       and (p_gacha is null or a.oy <= p_gacha)
  ),
  qm as (
    select m.qator_id, sum(m.s) as s, sum(m.h) as h, bool_or(m.nom) as nom_bor, sum(m.osh) as osh
      from miqdor m group by m.qator_id
  ),
  r as (
    select q.obyekt_id, q.id, q.tur, q.kat, coalesce(q.birlik, '') as birlik, qm.s, qm.h, qm.osh,
           (qm.nom_bor and q.tur not in ('rz', 'bl') and coalesce(q.nom, '') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ') as narxsiz,
           case when u.ustama_bor then null else b.id end as bolim_id,
           case when u.ustama_bor then null else b.turi end as turi,
           case when u.ustama_bor then null else b.kontragent_nom end as kontragent_nom
      from qm
      join public.t2_qator q on q.id = qm.qator_id and q.obyekt_id = any(p_obyekt_ids)
      left join ota on ota.id = q.id
      left join yb on yb.id = q.id
      left join bolim0 b on b.id = yb.bolim_id
      -- F2 o'lchovlarida svod bo'limi ichidagi pudratchi mehnati (ЧЕЛ/МАШ) yaxlit emas (TS: f2YaxlitdanChiqadi)
      cross join lateral (select (p_olchov in ('f2', 'f2_qoralama', 'aktlar') and b.turi = 'svod' and q.kat in ('ЧЕЛ', 'МАШ')) as ustama_bor) u
     where ota.id is null
  ),
  bs as (select r.bolim_id, sum(r.s) as s from r where r.bolim_id is not null group by r.bolim_id),
  svq as (
    select b.obyekt_id,
           sum(case when p_olchov in ('smeta', 'smeta_joriy') and b.svod_summa is not null then round(b.svod_summa / (1 + b.qqs_stavka / 100), 2)
                    else coalesce(bs.s, 0) end) as qqssiz,
           -- Svod summasi (QQS BILAN, yakuniy) bor bo'limlar: yadro 'qqsdan_keyin' — НДС dan keyin aynan.
           sum(b.svod_summa) filter (where p_olchov in ('smeta', 'smeta_joriy') and b.svod_summa is not null) as summa_qqs_bilan,
           sum(round(b.svod_summa / (1 + b.qqs_stavka / 100), 2)) filter (where p_olchov in ('smeta', 'smeta_joriy') and b.svod_summa is not null) as summa_qqssiz,
           count(*) filter (where p_olchov in ('smeta', 'smeta_joriy') and b.svod_summa is not null) as summa_soni
      from bolim0 b left join bs on bs.bolim_id = b.id
     where b.turi = 'svod'
     group by b.obyekt_id
  ),
  sub as (
    select x.obyekt_id, jsonb_agg(jsonb_build_object('kontragent', x.k, 'summa', x.summa) order by x.summa desc) as royxat
      from (select r.obyekt_id, coalesce(r.kontragent_nom, '—') as k, round(sum(r.s), 2) as summa
              from r where r.turi = 'subpudrat' group by 1, 2) x
     group by x.obyekt_id
  ),
  ag as (
    select r.obyekt_id,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'ЧЕЛ'), 0) as chel,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'МАШ'), 0) as mash,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0) as mat,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'ОБ'), 0) as ob,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'М/К'), 0) as mk,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'КАБ'), 0) as kab,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'БЕЗСКЛАД'), 0) as bez,
      coalesce(sum(r.s) filter (where r.bolim_id is null and (r.kat is null or r.kat not in ('ЧЕЛ','МАШ','МАТ','М/К','КАБ','БЕЗСКЛАД','ОБ'))), 0) as nomalum,
      coalesce(sum(r.s) filter (where r.turi = 'svod'), 0) as svod,
      coalesce(sum(r.s) filter (where r.turi = 'subpudrat'), 0) as subpudrat,
      coalesce(sum(r.s) filter (where r.turi = 'ustamasiz'), 0) as ustamasiz,
      coalesce(sum(r.h) filter (where r.bolim_id is null and r.kat = 'ЧЕЛ' and r.birlik ~ '^(ЧЕЛ|чел|Чел)'), 0) as chel_soat,
      coalesce(sum(r.h) filter (where r.bolim_id is null and r.kat = 'МАШ' and r.birlik ~ '^(МАШ|маш|Маш)'), 0) as mash_soat,
      coalesce(sum(r.h) filter (where r.bolim_id is null and r.kat = 'МАШ' and r.birlik ~ '^(ЧЕЛ|чел|Чел)'), 0) as mashinist_soat,
      count(*) filter (where r.narxsiz) as narxsiz_soni,
      count(*) filter (where r.s is not null and r.s <> 0) as qator_soni,
      sum(r.osh) filter (where r.osh > 0) as osh,
      count(*) filter (where r.osh > 0) as osh_soni
    from r group by r.obyekt_id
  )
  select o.id,
    jsonb_build_object('chel', coalesce(ag.chel, 0), 'mash', coalesce(ag.mash, 0), 'mat', coalesce(ag.mat, 0), 'ob', coalesce(ag.ob, 0),
      'mk', coalesce(ag.mk, 0), 'kab', coalesce(ag.kab, 0), 'bez', coalesce(ag.bez, 0), 'nomalum', coalesce(ag.nomalum, 0),
      'svod', coalesce(ag.svod, 0), 'svod_qqssiz', coalesce(svq.qqssiz, 0), 'subpudrat', coalesce(ag.subpudrat, 0), 'ustamasiz', coalesce(ag.ustamasiz, 0),
      'svod_qqs_bilan', coalesce(svq.summa_qqs_bilan, 0), 'svod_summa_qqssiz', coalesce(svq.summa_qqssiz, 0), 'svod_summa_soni', coalesce(svq.summa_soni, 0),
      'chel_soat', coalesce(ag.chel_soat, 0), 'mash_soat', coalesce(ag.mash_soat, 0), 'mashinist_soat', coalesce(ag.mashinist_soat, 0),
      'narxsiz_soni', coalesce(ag.narxsiz_soni, 0), 'qator_soni', coalesce(ag.qator_soni, 0),
      'subpudratchilar', coalesce(sub.royxat, '[]'::jsonb))
    || case when p_olchov = 'fakt' then jsonb_build_object('smetadan_oshgan', coalesce(ag.osh, 0), 'smetadan_oshgan_soni', coalesce(ag.osh_soni, 0))
            else '{}'::jsonb end
  from unnest(p_obyekt_ids) as o(id)
  left join ag on ag.obyekt_id = o.id
  left join svq on svq.obyekt_id = o.id
  left join sub on sub.obyekt_id = o.id
$ac$;

create temp table _ac_m on commit drop as select unnest(array['smeta','smeta_joriy','fakt','f2','f2_qoralama']) as m;
select 'agg_' || m.m || '_farq' as tekshiruv, (
  select count(*) from (
    (select * from public._ac_agg_eski((select ids from _ac_ids), m.m, null, null, null, 'siz', null)
     except all select * from public._t2_summa_agg_v1((select ids from _ac_ids), m.m, null, null, null, 'siz', null))
    union all
    (select * from public._t2_summa_agg_v1((select ids from _ac_ids), m.m, null, null, null, 'siz', null)
     except all select * from public._ac_agg_eski((select ids from _ac_ids), m.m, null, null, null, 'siz', null))) d) as bad
  from _ac_m m order by m.m;
select 'anchor' as tekshiruv, case when position('tezlik_panel_v1' in pg_get_functiondef('public._t2_summa_agg_v1(bigint[],text,bigint[],date,date,text,text)'::regprocedure)) > 0 then 0 else 1 end as bad;

rollback;
