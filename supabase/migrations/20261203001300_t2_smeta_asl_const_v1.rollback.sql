-- 20261203001300 rollback — smeta jamlari avvalgi (asl + qo'shimcha + zamena) ta'rifga qaytadi; ma'lumotga tegilmaydi.
-- _t2_summa_agg_v1 (7 arg) — 20261121000000 dagi tana AYNAN; t2_obyekt_jami — avvalgi ta'rif; t2_object_financials_v1 — teskari replace();
-- so'ng yangi funksiyalar olib tashlanadi (t2_smeta_ozgarish_qatlam_v1, _t2_smeta_qatlam_qator_v1, t2_qator_asl_v1).
begin;

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
       and (p_olchov <> 'smeta' or exists (select 1 from public.t2_qator qq where qq.id = y.qator_id and qq.versiya_holat = 'faol'))
  ),
  yr as (
    select b.id as bolim_id, b.qator_id as id from bolim0 b
    union all
    select yr.bolim_id, q.id from public.t2_qator q join yr on q.ota_id = yr.id
  ),
  yb as (select distinct on (yr.id) yr.id, yr.bolim_id from yr order by yr.id, yr.bolim_id),
  ota as (select distinct q.ota_id as id from public.t2_qator q where q.obyekt_id = any(p_obyekt_ids) and q.ota_id is not null),
  miqdor as (
    select q.id as qator_id, q.summa as s, q.hajm as h, (q.summa is null and coalesce(q.hajm, 0) <> 0) as nom, null::numeric as osh
      from public.t2_qator q
     where p_olchov = 'smeta' and q.obyekt_id = any(p_obyekt_ids) and q.versiya_holat = 'faol'
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
           sum(case when p_olchov = 'smeta' and b.svod_summa is not null then round(b.svod_summa / (1 + b.qqs_stavka / 100), 2)
                    else coalesce(bs.s, 0) end) as qqssiz,
           -- Svod summasi (QQS BILAN, yakuniy) bor bo'limlar: yadro 'qqsdan_keyin' — НДС dan keyin aynan.
           sum(b.svod_summa) filter (where p_olchov = 'smeta' and b.svod_summa is not null) as summa_qqs_bilan,
           sum(round(b.svod_summa / (1 + b.qqs_stavka / 100), 2)) filter (where p_olchov = 'smeta' and b.svod_summa is not null) as summa_qqssiz,
           count(*) filter (where p_olchov = 'smeta' and b.svod_summa is not null) as summa_soni
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

CREATE OR REPLACE VIEW public.t2_obyekt_jami AS
 SELECT o.id,
    o.nom,
    o.tur,
    COALESCE(a.qator_soni, 0::bigint) AS qator_soni,
    COALESCE(a.razdel, 0::bigint) AS razdel,
    COALESCE(a.ish, 0::bigint) AS ish,
    COALESCE(a.resurs, 0::bigint) AS resurs,
    a.jami,
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
            sum(q.summa) FILTER (WHERE q.tur = 'rz'::text) AS jami,
            count(DISTINCT ROW(upper(btrim(COALESCE(q.nom, ''::text))), COALESCE(q.birlik, ''::text))) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.narx IS NULL AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text) AS narxsiz,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ЧЕЛ'::text) AS chel,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАШ'::text) AS mash,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАТ'::text) AS mat,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ОБ'::text) AS ob
           FROM t2_qator q
          WHERE q.obyekt_id = o.id AND q.versiya_holat = 'faol'::text) a ON true
  WHERE o.holat <> 'bekor'::text;

do $do$
declare d text; n text;
  q_eski constant text := 'select id,obyekt_id,ota_id,tur,nom,hajm,narx,summa,norma,versiya_holat' || E'\n' || '    from public.t2_qator';
  q_yangi constant text := 'select id,obyekt_id,ota_id,tur,nom,hajm,narx,summa,norma,versiya_holat,change_type,qoshimcha,zamena' || E'\n' || '    from public.t2_qator';
  s_eski constant text := $s$case when versiya_holat <> 'faol' then 0::numeric when driver_labor then coalesce(summa,0) else summa end as smeta_value$s$;
  s_yangi constant text := $s$case when versiya_holat <> 'faol' or not public.t2_qator_asl_v1(change_type,qoshimcha,zamena) then 0::numeric when driver_labor then coalesce(summa,0) else summa end as smeta_value$s$;
begin
  d := pg_get_functiondef('public.t2_object_financials_v1(bigint,bigint,bigint[])'::regprocedure);
  if position(s_yangi in d) = 0 or position(q_yangi in d) = 0 then
    raise exception 'SMETA_ASL_ROLLBACK: t2_object_financials_v1 da 20261203001300 langari topilmadi';
  end if;
  n := replace(replace(d, q_yangi, q_eski), s_yangi, s_eski);
  execute n;
end $do$;

do $do$
declare d text;
  v_eski constant text := $s$WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.versiya_holat = 'faol'::text$s$;
  v_yangi constant text := $s$ AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)$s$;
  f1_eski constant text := $s$where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob') and versiya_holat = 'faol';$s$;
  f1_yangi constant text := $s$where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob') and versiya_holat = 'faol' and public.t2_qator_asl_v1(change_type, qoshimcha, zamena);$s$;
  f2_eski constant text := $s$where q.obyekt_id = p_obyekt_id and q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol'$s$;
  f2_yangi constant text := $s$where q.obyekt_id = p_obyekt_id and q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol' and public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)$s$;
begin
  -- pg_get_viewdef funksiya nomini search_path bo'yicha (public. siz) chiqaradi.
  d := pg_get_viewdef('public.t2_obyekt_nakrutka'::regclass, true);
  d := replace(replace(d, v_eski || replace(v_yangi, ' t2_', ' public.t2_'), v_eski), v_eski || v_yangi, v_eski);
  if position('t2_qator_asl_v1' in d) > 0 then raise exception 'SMETA_ASL_ROLLBACK: t2_obyekt_nakrutka langari topilmadi'; end if;
  execute 'create or replace view public.t2_obyekt_nakrutka as ' || rtrim(d, E'; \n');
  d := pg_get_functiondef('public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint)'::regprocedure);
  if position(f1_yangi in d) = 0 or position(f2_yangi in d) = 0 then raise exception 'SMETA_ASL_ROLLBACK: t2_obyekt_nakrutka_v1 langari topilmadi'; end if;
  execute replace(replace(d, f1_yangi, f1_eski), f2_yangi, f2_eski);
end $do$;

drop function if exists public.t2_smeta_ozgarish_qatlam_v1(bigint, bigint);
drop function if exists public._t2_smeta_qatlam_qator_v1(bigint[]);
drop function if exists public.t2_qator_asl_v1(text, boolean, boolean);

commit;
