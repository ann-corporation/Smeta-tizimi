-- 20261203001300 — SMETA (ASL) CONST + ASOSLANGAN O'ZGARISHLAR QATLAMI (egasi 2026-11-06).
--
-- Egasi: «smeta — const; undan boshqa farqlari asoslanib ko'rsatilishi kerak». Amfiteatr (obyekt 151) smeta qiymati o'sib
-- borardi: qo'shimcha ish (ADDITIONAL) va zamena (REPLACEMENT) qatorlari smeta jamiga qo'shilardi, zamena esa almashtirgan
-- asl qator ham to'liq sanalgan holda QO'SHILARDI (amalda ikki marta).
--
-- QOIDA (yagona ta'rif, TS `lib/lrv-ozgarish` guruhi bilan bir xil):
--   asl smeta qatori  = faol (versiya_holat = 'faol') VA change_type IS NULL VA qoshimcha = false VA zamena = false
--                       (`public.t2_qator_asl_v1`); qo'shimcha/zamena ostidagi hamma narsa ota-zanjirdan meros oladi.
--   «Smeta (asl)»     = faqat asl barglar — CONST (qo'shimcha/zamena/bajarilmadi qo'shilganda o'zgarmaydi).
--   «O'zgarishlar»    = qo'shimcha ishlar (+) + zamena farqi (zamena summa − asl qatorning almashtirilgan qismi; hech qachon
--                       ikki marta emas) + narx farqi (alohida manba yo'q — null) − bajarilmaydi (t2_qator_bajarilmadi).
--   «Smeta + o'zgarishlar» — alohida HOSILA ko'rsatkich (o'lchov 'smeta_joriy'), asl smeta o'rnini bosmaydi.
--
-- Almashtirilgan qism (REJA darajasida, t2_zamena_qoplash / t2_almashtirilgan_oz_hajm ning 100% bajarilgandagi holati):
--   almashtirish_hajm kiritilgan → shu hajm (aslning birligida); birlik bir xil → zamena hajmi 1:1; birlik farqli → asl to'liq.
--   ulush = least(Σ / asl hajmi, 1); asl hajmi noma'lum (0/NULL) va miqdor kiritilmagan → 1; miqdor kiritilgan → noaniq (NULL,
--   to'qilmaydi, sanab ko'rsatiladi). Ish (bl) almashtirilsa uning barglari shu ulushda. NARXSIZ zamena (barcha barg summasi
--   NULL) aslni kamaytirmaydi — farqi noma'lum (NULL ≠ 0), ro'yxatda «narxsiz» bilan.
-- Bajarilmaydi: hajm NULL → qator to'liq; aks holda hajm / smeta hajmi. Sabab 'zamena' bo'lsa zamena bilan ustma-ust
--   tushadi (greatest), boshqa sabab qo'shiladi; jami kamayish ≤ 100%.
--
-- O'ZGARADI (faqat «smeta» o'qishi; F2 / fakt / nakopitelniy puli O'ZGARMAYDI, qo'shimcha/zamena qatorlari saqlanadi):
--   1) public.t2_qator_asl_v1(change_type, qoshimcha, zamena) — yagona predikat (immutable, inline).
--   2) public._t2_smeta_qatlam_qator_v1(obyekt_ids) — barg darajasidagi qatlam (sinf, almashtirilgan/bajarilmadi ulushi,
--      joriy summa). Bitta ta'rif: summa agregati ham, o'zgarishlar RPC si ham shundan o'qiydi.
--   3) public._t2_summa_agg_v1 (7 arg): 'smeta' — faqat asl barglar; yangi 'smeta_joriy' — smeta + o'zgarishlar.
--      _t2_summa_paket_v1 / t2_rahbar_panel_v1 (obyekt kartalari, portfel) shu orqali avtomatik asl bo'ladi.
--   4) public.t2_obyekt_jami: jami / chel / mash / mat / ob — asl smeta (F2 reestri, shartnoma liniyasi, rahbar ustama, obyektlar).
--      jami = Σ asl rz.summa − Σ asl otaga bevosita ulangan qo'shimcha/zamena tugunlari summasi (t2_rollup rz ga qo'shgani).
--   5) public.t2_object_financials_v1 (PTO obyekt kartasi): smeta_value faqat asl (fakt / F2 / ostatka o'zgarmaydi).
--   5b) public.t2_obyekt_nakrutka (portfel ustamalisi) va public.t2_obyekt_nakrutka_v1 (obyekt ustamasi, SummaJuft kesimi):
--       kategoriya summalari faqat asl. Nakopitelniy / F3 (t2_nakopitelniy_v2) O'ZGARMAYDI — u yuridik F2 hujjati, smeta ustuni
--       qatorlar bo'yicha (asl + qo'shimcha) va Fakt Studio «Nakopitelniy smeta = daraxt smeta + qo'shimcha» bilan solishtiriladi.
--   6) public.t2_smeta_ozgarish_qatlam_v1(obyekt, actor) — «Smeta (asl)» · «O'zgarishlar» (har qator asosi: sabab, hujjat,
--      F2 akt, kim, qachon) · «Smeta + o'zgarishlar». smeta.read; BFF /api/sb soro 'smeta_ozgarish_qatlam_v1' (obyekt_actor).
-- Migratsiyani L0 qo'llaydi. Rollback: .rollback.sql. Qabul: .acceptance.sql (sintetik, ROLLBACK).
begin;

-- 1) Yagona predikat.
create or replace function public.t2_qator_asl_v1(p_change_type text, p_qoshimcha boolean, p_zamena boolean)
returns boolean language sql immutable parallel safe set search_path = public, pg_temp as $fn$
  select p_change_type is null and not coalesce(p_qoshimcha, false) and not coalesce(p_zamena, false)
$fn$;
comment on function public.t2_qator_asl_v1(text, boolean, boolean) is
  'Asl smeta qatori predikati (egasi 2026-11-06 «smeta — const»): change_type NULL, qoshimcha = false, zamena = false. Versiya filtri chaqiruvchida (versiya_holat = faol).';
revoke all on function public.t2_qator_asl_v1(text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.t2_qator_asl_v1(text, boolean, boolean) to service_role;

-- 2) Barg darajasidagi smeta qatlami (faqat faol versiya).
create or replace function public._t2_smeta_qatlam_qator_v1(p_obyekt_ids bigint[])
returns table(obyekt_id bigint, qator_id bigint, sinf text, ildiz_id bigint, zamena_id bigint, kat text, summa numeric, hajm numeric,
              almashtirilgan_asl_id bigint, almashtirilgan_ulush numeric, bajarilmadi_ulush numeric,
              almashtirilgan_summa numeric, bajarilmadi_summa numeric, joriy_summa numeric, joriy_hajm numeric)
language sql stable set search_path = public, pg_temp as $fn$
  with recursive
  q0 as (
    select q.id, q.obyekt_id, q.ota_id, q.kat, q.hajm, q.summa, q.birlik, q.birlik_key, q.replaces_line_id, q.almashtirish_hajm,
           (coalesce(q.zamena, false) or q.change_type = 'REPLACEMENT') as zm,
           not public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena) as yangi
      from public.t2_qator q
     where q.obyekt_id = any(p_obyekt_ids) and q.versiya_holat = 'faol'
  ),
  -- Tasnif yuqoridan pastga (meros): zamena ichidagi hamma narsa — zamena; qo'shimcha ichida — qo'shimcha.
  t(id, sinf, ildiz_id, zamena_id, d) as (
    select q.id, case when q.zm then 'zamena' when q.yangi then 'qoshimcha' else 'asl' end,
           case when q.yangi then q.id end, case when q.zm then q.id end, 0
      from q0 q where q.ota_id is null or not exists (select 1 from q0 p where p.id = q.ota_id)
    union all
    select c.id,
           case when t.sinf = 'zamena' or c.zm then 'zamena' when t.sinf = 'qoshimcha' or c.yangi then 'qoshimcha' else 'asl' end,
           coalesce(t.ildiz_id, case when c.yangi then c.id end),
           coalesce(t.zamena_id, case when c.zm then c.id end), t.d + 1
      from q0 c join t on c.ota_id = t.id
     where t.d < 60
  ),
  -- Barg: bolasi yo'q qator (_t2_summa_agg_v1 bilan bir xil — bola versiyasidan qat'i nazar).
  barg as (
    select q.*, t.sinf, t.ildiz_id, t.zamena_id
      from q0 q join t on t.id = q.id
     where not exists (select 1 from public.t2_qator b where b.ota_id = q.id)
  ),
  zs as (select b.zamena_id, count(b.summa) as narxli from barg b where b.zamena_id is not null group by b.zamena_id),
  -- Narxli zamena ildizlari → asl qatorning almashtirilgan hajmi (aslning birligida, reja 100%).
  zr as (
    select z.replaces_line_id as asl_id, o.hajm as asl_hajm, z.almashtirish_hajm is not null as miqdor_berilgan,
           case when z.almashtirish_hajm is not null then z.almashtirish_hajm
                when coalesce(z.birlik_key, lower(btrim(z.birlik))) is not distinct from coalesce(o.birlik_key, lower(btrim(o.birlik))) then z.hajm
                else o.hajm end as alm_hajm
      from q0 z
      join zs on zs.zamena_id = z.id and zs.narxli > 0
      join q0 o on o.id = z.replaces_line_id
  ),
  ou as (
    select zr.asl_id,
           case when max(zr.asl_hajm) > 0 then least(greatest(coalesce(sum(zr.alm_hajm), 0), 0) / max(zr.asl_hajm), 1)
                when not bool_or(zr.miqdor_berilgan) then 1::numeric end as ulush
      from zr group by zr.asl_id
  ),
  bj as (
    select b.qator_id as id,
           max(case when b.hajm is null then 1::numeric when x.hajm > 0 then least(b.hajm / x.hajm, 1) end) filter (where b.sabab_kod = 'zamena') as bz,
           max(case when b.hajm is null then 1::numeric when x.hajm > 0 then least(b.hajm / x.hajm, 1) end) filter (where b.sabab_kod <> 'zamena') as bb
      from public.t2_qator_bajarilmadi b join q0 x on x.id = b.qator_id
     where b.holat = 'faol'
     group by b.qator_id
  ),
  -- Barg (zamena tarkibidan tashqari) → o'zi va otalari.
  anc(barg_id, cur, d) as (
    select b.id, b.id, 0 from barg b where b.zamena_id is null
    union all
    select a.barg_id, q.ota_id, a.d + 1 from anc a join q0 q on q.id = a.cur where q.ota_id is not null and a.d < 60
  ),
  la as (
    select distinct on (a.barg_id) a.barg_id, ou.asl_id, ou.ulush
      from anc a join ou on ou.asl_id = a.cur
     where ou.ulush is not null
     order by a.barg_id, ou.ulush desc, a.d
  ),
  lb as (select a.barg_id, max(bj.bz) as bz, max(bj.bb) as bb from anc a join bj on bj.id = a.cur group by a.barg_id),
  k as (
    select b.*, la.asl_id as alm_asl_id, coalesce(la.ulush, 0) as alm,
           least(1::numeric, greatest(coalesce(la.ulush, 0), coalesce(lb.bz, 0)) + coalesce(lb.bb, 0)) as jami_kamayish
      from barg b
      left join la on la.barg_id = b.id
      left join lb on lb.barg_id = b.id
  )
  select k.obyekt_id, k.id as qator_id, k.sinf, k.ildiz_id, k.zamena_id, k.kat, k.summa, k.hajm,
         k.alm_asl_id as almashtirilgan_asl_id, k.alm as almashtirilgan_ulush, k.jami_kamayish - k.alm as bajarilmadi_ulush,
         k.summa * k.alm as almashtirilgan_summa, k.summa * (k.jami_kamayish - k.alm) as bajarilmadi_summa,
         k.summa * (1 - k.jami_kamayish) as joriy_summa, k.hajm * (1 - k.jami_kamayish) as joriy_hajm
    from k;
$fn$;
comment on function public._t2_smeta_qatlam_qator_v1(bigint[]) is
  'Smeta qatlami (egasi 2026-11-06): faol barglar — sinf asl|qoshimcha|zamena (ota-zanjirdan meros), zamena (reja) almashtirgan va bajarilmadi ulushi, joriy summa (smeta + o''zgarishlar). Yagona ta''rif: _t2_summa_agg_v1 smeta_joriy va t2_smeta_ozgarish_qatlam_v1.';
revoke all on function public._t2_smeta_qatlam_qator_v1(bigint[]) from public, anon, authenticated;
grant execute on function public._t2_smeta_qatlam_qator_v1(bigint[]) to service_role;

-- 3) Summa agregati: 'smeta' — faqat asl; 'smeta_joriy' — smeta + o'zgarishlar (hosila). Qolgan o'lchovlar 20261121000000 dagidek.
CREATE OR REPLACE FUNCTION public._t2_summa_agg_v1(p_obyekt_ids bigint[], p_olchov text, p_akt_ids bigint[], p_dan date, p_gacha date, p_podval text, p_blok text)
 RETURNS TABLE(obyekt_id bigint, agg jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      from public.t2_qator_holat h
     where p_olchov = 'fakt' and h.obyekt_id = any(p_obyekt_ids)
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
  left join sub on sub.obyekt_id = o.id;
$function$;
revoke all on function public._t2_summa_agg_v1(bigint[], text, bigint[], date, date, text, text) from public, anon, authenticated;
grant execute on function public._t2_summa_agg_v1(bigint[], text, bigint[], date, date, text, text) to service_role;

-- 4) Obyekt jamisi — asl smeta (ustunlar va tartib o'zgarmaydi).
CREATE OR REPLACE VIEW public.t2_obyekt_jami AS
 SELECT o.id,
    o.nom,
    o.tur,
    COALESCE(a.qator_soni, 0::bigint) AS qator_soni,
    COALESCE(a.razdel, 0::bigint) AS razdel,
    COALESCE(a.ish, 0::bigint) AS ish,
    COALESCE(a.resurs, 0::bigint) AS resurs,
    CASE WHEN a.rz_asl IS NULL THEN NULL::numeric ELSE a.rz_asl - COALESCE(a.rz_ozgarish, 0::numeric) END AS jami,
    COALESCE(a.narxsiz, 0::bigint) AS narxsiz,
    a.chel,
    a.mash,
    a.mat,
    a.ob,
    o.yangilandi,
    o.kompaniya_id,
    o.lat,
    o.lng,
    o.versiya,
    o.loyiha_id
   FROM t2_obyekt o
     LEFT JOIN LATERAL ( SELECT count(*) AS qator_soni,
            count(*) FILTER (WHERE q.tur = 'rz'::text) AS razdel,
            count(*) FILTER (WHERE q.tur = 'bl'::text) AS ish,
            count(*) FILTER (WHERE q.tur = 'rs'::text) AS resurs,
            sum(q.summa) FILTER (WHERE q.tur = 'rz'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS rz_asl,
            sum(q.summa) FILTER (WHERE q.tur <> 'rz'::text AND NOT public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)
                                   AND p.versiya_holat = 'faol'::text AND public.t2_qator_asl_v1(p.change_type, p.qoshimcha, p.zamena)) AS rz_ozgarish,
            count(DISTINCT ROW(upper(btrim(COALESCE(q.nom, ''::text))), COALESCE(q.birlik, ''::text))) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.narx IS NULL AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text) AS narxsiz,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ЧЕЛ'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS chel,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАШ'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS mash,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАТ'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS mat,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ОБ'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS ob
           FROM t2_qator q
             LEFT JOIN t2_qator p ON p.id = q.ota_id
          WHERE q.obyekt_id = o.id AND q.versiya_holat = 'faol'::text) a ON true
  WHERE o.holat <> 'bekor'::text;

-- 5) PTO obyekt kartasi: smeta qiymati faqat asl (fakt / F2 / ostatka hisobi o'zgarmaydi). Joriy ta'rifdan replace(); langar
--    aynan 1 marta topilmasa — to'xtaydi (jim o'tmaydi).
do $do$
declare d text; n text;
  q_eski constant text := 'select id,obyekt_id,ota_id,tur,nom,hajm,narx,summa,norma,versiya_holat' || E'\n' || '    from public.t2_qator';
  q_yangi constant text := 'select id,obyekt_id,ota_id,tur,nom,hajm,narx,summa,norma,versiya_holat,change_type,qoshimcha,zamena' || E'\n' || '    from public.t2_qator';
  s_eski constant text := $s$case when versiya_holat <> 'faol' then 0::numeric when driver_labor then coalesce(summa,0) else summa end as smeta_value$s$;
  s_yangi constant text := $s$case when versiya_holat <> 'faol' or not public.t2_qator_asl_v1(change_type,qoshimcha,zamena) then 0::numeric when driver_labor then coalesce(summa,0) else summa end as smeta_value$s$;
begin
  d := pg_get_functiondef('public.t2_object_financials_v1(bigint,bigint,bigint[])'::regprocedure);
  if position('t2_qator_asl_v1' in d) > 0 then raise exception 'SMETA_ASL: t2_object_financials_v1 allaqachon yangilangan'; end if;
  if (length(d) - length(replace(d, q_eski, ''))) / length(q_eski) <> 1 or (length(d) - length(replace(d, s_eski, ''))) / length(s_eski) <> 1 then
    raise exception 'SMETA_ASL: t2_object_financials_v1 langari aynan 1 marta topilmadi (ta''rif o''zgargan)';
  end if;
  n := replace(replace(d, q_eski, q_yangi), s_eski, s_yangi);
  execute n;
end $do$;

-- 5b) Obyekt ustamasi (t2_obyekt_nakrutka view — portfel ustamalisi; t2_obyekt_nakrutka_v1 — obyekt kartasi / SummaJuft kesimi):
--     kategoriya summalari faqat asl smetadan. Kaskad va koeffitsientlar o'zgarmaydi. replace(), langar aynan 1 marta.
do $do$
declare d text; n text;
  v_eski constant text := $s$WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.versiya_holat = 'faol'::text$s$;
  v_yangi constant text := $s$WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.versiya_holat = 'faol'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)$s$;
  f1_eski constant text := $s$where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob') and versiya_holat = 'faol';$s$;
  f1_yangi constant text := $s$where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob') and versiya_holat = 'faol' and public.t2_qator_asl_v1(change_type, qoshimcha, zamena);$s$;
  f2_eski constant text := $s$where q.obyekt_id = p_obyekt_id and q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol'$s$;
  f2_yangi constant text := $s$where q.obyekt_id = p_obyekt_id and q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol' and public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)$s$;
begin
  d := pg_get_viewdef('public.t2_obyekt_nakrutka'::regclass, true);
  if position('t2_qator_asl_v1' in d) > 0 then raise exception 'SMETA_ASL: t2_obyekt_nakrutka allaqachon yangilangan'; end if;
  if (length(d) - length(replace(d, v_eski, ''))) / length(v_eski) <> 1 then
    raise exception 'SMETA_ASL: t2_obyekt_nakrutka langari aynan 1 marta topilmadi (ta''rif o''zgargan)';
  end if;
  execute 'create or replace view public.t2_obyekt_nakrutka as ' || rtrim(replace(d, v_eski, v_yangi), E'; \n');

  d := pg_get_functiondef('public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint)'::regprocedure);
  if position('t2_qator_asl_v1' in d) > 0 then raise exception 'SMETA_ASL: t2_obyekt_nakrutka_v1 allaqachon yangilangan'; end if;
  if (length(d) - length(replace(d, f1_eski, ''))) / length(f1_eski) <> 1 or (length(d) - length(replace(d, f2_eski, ''))) / length(f2_eski) <> 1 then
    raise exception 'SMETA_ASL: t2_obyekt_nakrutka_v1 langari aynan 1 marta topilmadi (ta''rif o''zgargan)';
  end if;
  execute replace(replace(d, f1_eski, f1_yangi), f2_eski, f2_yangi);
end $do$;

-- 6) «Smeta (asl)» · «O'zgarishlar» (asoslangan) · «Smeta + o'zgarishlar» — bitta obyekt uchun o'qish modeli.
create or replace function public.t2_smeta_ozgarish_qatlam_v1(p_obyekt_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint; v_asl jsonb; v_joriy jsonb; v_res jsonb; v_lim constant int := 500;
begin
  select o.kompaniya_id into v_k from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_k is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_k, p_actor_id);
  perform public.t2_require_permission_v2(v_k, p_actor_id, 'smeta.read');

  select p.paket into v_asl from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta') p;
  select p.paket into v_joriy from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta_joriy') p;

  with recursive l as materialized (select * from public._t2_smeta_qatlam_qator_v1(array[p_obyekt_id])),
  q as materialized (
    select q.id, q.ota_id, q.tur, q.kod, q.nom, q.birlik, q.hajm, q.summa, q.change_type, q.change_id, q.replaces_line_id,
           q.almashtirish_hajm, q.yaratildi
      from public.t2_qator q where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol'
  ),
  -- Asos: o'zgarish yozuvi (sabab, holat, dalil hujjat, kim, qachon) + birinchi F2/fakt akti (qator yoki uning barglari).
  asos as (
    select q.id,
           jsonb_strip_nulls(jsonb_build_object(
             'change_id', so.id, 'tur', so.tur, 'sabab', so.sabab, 'holat', so.holat, 'izoh', so.evidence_izoh,
             'hujjat_id', so.evidence_hujjat_id, 'hujjat_nom', oh.nom,
             'kim', coalesce(f.ism, f.login, so.kim), 'qachon', coalesce(so.yaratildi, q.yaratildi), 'tasdiqlandi', so.tasdiqlandi)) as j,
           (nullif(btrim(coalesce(so.sabab, '')), '') is not null or so.evidence_hujjat_id is not null) as asosli
      from q
      left join public.t2_smeta_ozgarish so on so.id = q.change_id
      left join public.t2_obyekt_hujjat oh on oh.id = so.evidence_hujjat_id
      left join public.t2_foydalanuvchi f on f.id = so.actor_id
     where q.change_type is not null or q.change_id is not null
  ),
  akt1 as (
    select x.gid, (array_agg(jsonb_build_object('akt_id', a.id, 'tur', a.tur, 'raqam', a.raqam, 'oy', a.oy) order by a.oy, a.id))[1] as akt
      from (select coalesce(l.zamena_id, l.ildiz_id) as gid, l.qator_id from l where l.sinf <> 'asl'
            union select coalesce(l.zamena_id, l.ildiz_id), coalesce(l.zamena_id, l.ildiz_id) from l where l.sinf <> 'asl') x
      join public.t2_akt_qator aq on aq.qator_id = x.qator_id
      join public.t2_akt a on a.id = aq.akt_id and a.holat not in ('bekor', 'rad')
     group by x.gid
  ),
  qg as (
    select l.ildiz_id as id, count(*) as barg_soni, count(*) filter (where l.summa is null) as narxsiz_soni,
           sum(l.summa) as summa, jsonb_agg(jsonb_build_object('kat', l.kat, 'summa', l.summa)) filter (where l.summa is not null) as kesim
      from l where l.sinf = 'qoshimcha' group by l.ildiz_id
  ),
  qoshimcha as (
    select g.*, q.tur, q.kod, q.nom, q.birlik, q.hajm, q.ota_id, ot.nom as ota_nom, a.j as asos, coalesce(a.asosli, false) or ak.akt is not null as asosli, ak.akt
      from qg g join q on q.id = g.id
      left join q ot on ot.id = q.ota_id
      left join asos a on a.id = g.id
      left join akt1 ak on ak.gid = g.id
  ),
  zg as (
    select l.zamena_id as id, count(*) as barg_soni, count(*) filter (where l.summa is null) as narxsiz_soni, count(l.summa) as narxli,
           sum(l.summa) as summa, jsonb_agg(jsonb_build_object('kat', l.kat, 'summa', l.summa)) filter (where l.summa is not null) as kesim
      from l where l.sinf = 'zamena' group by l.zamena_id
  ),
  -- Asl qator bo'yicha almashtirilgan summa (barglar) — zamenalar orasida almashtirilgan hajm ulushida taqsimlanadi.
  alm as (
    select l.almashtirilgan_asl_id as asl_id, sum(l.almashtirilgan_summa) as summa,
           jsonb_agg(jsonb_build_object('kat', l.kat, 'summa', -l.almashtirilgan_summa)) filter (where l.almashtirilgan_summa is not null and l.almashtirilgan_summa <> 0) as kesim
      from l where l.almashtirilgan_asl_id is not null group by l.almashtirilgan_asl_id
  ),
  zamena as (
    select g.*, z.tur, z.kod, z.nom, z.birlik, z.hajm, z.almashtirish_hajm, z.replaces_line_id as asl_id,
           o.kod as asl_kod, o.nom as asl_nom, o.birlik as asl_birlik, o.hajm as asl_hajm, o.summa as asl_summa,
           case when g.narxli > 0 and al.summa is not null then al.summa * coalesce(sh.ulush, 1) end as almashtirilgan_summa,
           case when g.narxli > 0 then g.summa - coalesce(al.summa * coalesce(sh.ulush, 1), 0) end as farq,
           (g.narxli > 0 and o.id is not null and al.asl_id is null) as almashtirish_noaniq,
           a.j as asos, coalesce(a.asosli, false) or ak.akt is not null as asosli, ak.akt
      from zg g join q z on z.id = g.id
      left join q o on o.id = z.replaces_line_id
      left join alm al on al.asl_id = z.replaces_line_id
      -- Bir aslni bir necha narxli zamena almashtirsa: almashtirilgan summa ular orasida zamena summasi ulushida.
      left join lateral (
        select case when sum(g2.summa) > 0 then g.summa / sum(g2.summa) end as ulush
          from zg g2 join q z2 on z2.id = g2.id
         where z2.replaces_line_id = z.replaces_line_id and g2.narxli > 0) sh on g.narxli > 0
      left join asos a on a.id = g.id
      left join akt1 ak on ak.gid = g.id
  ),
  bajx as (select b.* from public.t2_qator_bajarilmadi b join q on q.id = b.qator_id where b.obyekt_id = p_obyekt_id and b.holat = 'faol'),
  -- Bajarilmadi qatori → o'zi va avlodlari (bargdagi bajarilmadi summasi shu yozuvga tegishli).
  bd(bid, id, d) as (
    select b.id, b.qator_id, 0 from bajx b
    union all
    select bd.bid, c.id, bd.d + 1 from bd join q c on c.ota_id = bd.id where bd.d < 60
  ),
  bs as (select bd.bid, sum(l.bajarilmadi_summa) as summa from bd join l on l.qator_id = bd.id where l.bajarilmadi_summa is not null group by bd.bid),
  baj as (
    select b.id, b.qator_id, b.sabab_kod, b.sabab_izoh, b.hujjat_id, b.sana, b.hajm as bajarilmagan_hajm, b.zamena_qator_id, b.yaratildi,
           coalesce(f.ism, f.login) as kim, q.tur, q.kod, q.nom, q.birlik, q.hajm as smeta_hajm, bs.summa
      from bajx b
      join q on q.id = b.qator_id
      left join bs on bs.bid = b.id
      left join public.t2_foydalanuvchi f on f.id = b.actor_id
  ),
  jam as (
    select coalesce(sum(l.summa) filter (where l.sinf = 'asl'), 0) as asl,
           count(*) filter (where l.sinf = 'asl' and l.summa is null) as asl_narxsiz,
           coalesce(sum(l.summa) filter (where l.sinf = 'qoshimcha'), 0) as qoshimcha,
           coalesce(sum(l.summa) filter (where l.sinf = 'zamena'), 0) as zamena,
           coalesce(sum(l.almashtirilgan_summa), 0) as almashtirilgan,
           coalesce(sum(l.bajarilmadi_summa), 0) as bajarilmadi,
           coalesce(sum(l.joriy_summa), 0) as joriy,
           jsonb_agg(jsonb_build_object('kat', l.kat, 'summa', -l.bajarilmadi_summa)) filter (where coalesce(l.bajarilmadi_summa, 0) <> 0) as baj_kesim
      from l
  )
  select jsonb_build_object(
    'ok', true, 'obyekt_id', p_obyekt_id,
    'asl', jsonb_build_object('paket', v_asl, 'ustamasiz', round(j.asl, 2), 'narxsiz_soni', j.asl_narxsiz),
    'joriy', jsonb_build_object('paket', v_joriy, 'ustamasiz', round(j.joriy, 2)),
    'ozgarish', jsonb_build_object(
      'ustamasiz', round(j.joriy - j.asl, 2),
      'ustamali', case when v_asl is not null and v_joriy is not null then round((v_joriy->>'ustamali')::numeric - (v_asl->>'ustamali')::numeric, 2) end,
      'qqs_bilan', case when v_asl is not null and v_joriy is not null then round((v_joriy->>'qqs_bilan')::numeric - (v_asl->>'qqs_bilan')::numeric, 2) end,
      'qoshimcha', round(j.qoshimcha, 2),
      'zamena_summa', round(j.zamena, 2),
      'almashtirilgan_summa', round(j.almashtirilgan, 2),
      'zamena_farq', round(j.zamena - j.almashtirilgan, 2),
      'bajarilmadi', round(-j.bajarilmadi, 2),
      'narx_farqi', null,
      'narx_farqi_izoh', 'Asl qator narxi o''zgarishi alohida yozilmaydi (asl smeta CONST); narx farqi faqat zamena orqali',
      -- Avvalgi (xato) ko'rinish: asl + qo'shimcha + zamena (almashtirilgan qism ikki marta).
      'avvalgi_jami', round(j.asl + j.qoshimcha + j.zamena, 2),
      'ikki_marta_sanalgan', round(j.almashtirilgan, 2),
      'invariant_ok', abs((j.asl + j.qoshimcha + j.zamena - j.almashtirilgan - j.bajarilmadi) - j.joriy) < 0.01,
      'kesim', jsonb_build_object(
        'qoshimcha', coalesce((select jsonb_agg(e) from qoshimcha x, jsonb_array_elements(coalesce(x.kesim, '[]'::jsonb)) e), '[]'::jsonb),
        'zamena', coalesce((select jsonb_agg(e) from zamena x, jsonb_array_elements(coalesce(x.kesim, '[]'::jsonb)) e), '[]'::jsonb)
                  || coalesce((select jsonb_agg(e) from alm x, jsonb_array_elements(coalesce(x.kesim, '[]'::jsonb)) e), '[]'::jsonb),
        'bajarilmadi', coalesce(j.baj_kesim, '[]'::jsonb))),
    'qoshimcha', jsonb_build_object(
      'soni', (select count(*) from qoshimcha), 'summa', round(j.qoshimcha, 2),
      'narxsiz_soni', (select coalesce(sum(narxsiz_soni), 0) from qoshimcha),
      'asossiz_soni', (select count(*) from qoshimcha where not asosli),
      'qisqartirildi', (select count(*) from qoshimcha) > v_lim,
      'qatorlar', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'qator_id', x.id, 'tur', x.tur, 'kod', x.kod, 'nom', x.nom, 'birlik', x.birlik, 'hajm', x.hajm,
          'ota_id', x.ota_id, 'ota_nom', x.ota_nom, 'summa', round(x.summa, 2), 'barg_soni', x.barg_soni, 'narxsiz_soni', x.narxsiz_soni,
          'asos', x.asos, 'asosli', x.asosli, 'akt', x.akt)) order by x.summa desc nulls last, x.id)
        from (select * from qoshimcha order by summa desc nulls last, id limit v_lim) x), '[]'::jsonb)),
    'zamena', jsonb_build_object(
      'soni', (select count(*) from zamena), 'zamena_summa', round(j.zamena, 2), 'almashtirilgan_summa', round(j.almashtirilgan, 2),
      'farq', round(j.zamena - j.almashtirilgan, 2),
      'narxsiz_soni', (select count(*) from zamena where narxli = 0),
      'noaniq_soni', (select count(*) from zamena where almashtirish_noaniq),
      'asossiz_soni', (select count(*) from zamena where not asosli),
      'qisqartirildi', (select count(*) from zamena) > v_lim,
      'qatorlar', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'qator_id', x.id, 'tur', x.tur, 'kod', x.kod, 'nom', x.nom, 'birlik', x.birlik, 'hajm', x.hajm, 'almashtirish_hajm', x.almashtirish_hajm,
          'summa', round(x.summa, 2), 'narxsiz', x.narxli = 0, 'barg_soni', x.barg_soni,
          'asl_id', x.asl_id, 'asl_kod', x.asl_kod, 'asl_nom', x.asl_nom, 'asl_birlik', x.asl_birlik, 'asl_hajm', x.asl_hajm, 'asl_summa', round(x.asl_summa, 2),
          'almashtirilgan_summa', round(x.almashtirilgan_summa, 2), 'farq', round(x.farq, 2), 'almashtirish_noaniq', x.almashtirish_noaniq,
          'asos', x.asos, 'asosli', x.asosli, 'akt', x.akt)) order by abs(coalesce(x.farq, 0)) desc, x.id)
        from (select * from zamena order by abs(coalesce(farq, 0)) desc, id limit v_lim) x), '[]'::jsonb)),
    'bajarilmadi', jsonb_build_object(
      'soni', (select count(*) from baj), 'summa', round(-j.bajarilmadi, 2),
      'narxsiz_soni', (select count(*) from baj where summa is null),
      'qatorlar', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', x.id, 'qator_id', x.qator_id, 'tur', x.tur, 'kod', x.kod, 'nom', x.nom, 'birlik', x.birlik, 'smeta_hajm', x.smeta_hajm,
          'bajarilmagan_hajm', x.bajarilmagan_hajm, 'summa', round(-x.summa, 2),
          'asos', jsonb_strip_nulls(jsonb_build_object('sabab', x.sabab_kod, 'izoh', x.sabab_izoh, 'hujjat_id', x.hujjat_id,
                   'zamena_qator_id', x.zamena_qator_id, 'kim', x.kim, 'qachon', x.yaratildi, 'sana', x.sana)))) order by x.summa desc nulls last, x.id)
        from (select * from baj order by summa desc nulls last, id limit v_lim) x), '[]'::jsonb)))
  into v_res
  from jam j;
  return v_res;
end $$;
comment on function public.t2_smeta_ozgarish_qatlam_v1(bigint, bigint) is
  'Smeta (asl) CONST + asoslangan o''zgarishlar (egasi 2026-11-06): qo''shimcha (+), zamena farqi (zamena − almashtirilgan qism, ikki marta emas), narx farqi (null — manba yo''q), bajarilmaydi (−); har guruh asosi (sabab, hujjat, akt, kim, qachon); Smeta + o''zgarishlar — alohida hosila. smeta.read.';
revoke all on function public.t2_smeta_ozgarish_qatlam_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_smeta_ozgarish_qatlam_v1(bigint, bigint) to service_role;

commit;
