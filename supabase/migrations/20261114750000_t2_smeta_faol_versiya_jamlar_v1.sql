-- 2-lot faollashtirishdan keyin smeta jamlari faqat faol versiya qatorlaridan (versiya_holat='faol').
-- F2/fakt qatorlarini yig'ish o'zgarmaydi (almashtirilgan qatorlardagi tarix saqlanadi).

CREATE OR REPLACE FUNCTION public._t2_summa_agg_v1(p_obyekt_ids bigint[], p_olchov text, p_akt_ids bigint[] DEFAULT NULL::bigint[], p_dan date DEFAULT NULL::date, p_gacha date DEFAULT NULL::date)
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
           b.id as bolim_id, b.turi, b.kontragent_nom
      from qm
      join public.t2_qator q on q.id = qm.qator_id and q.obyekt_id = any(p_obyekt_ids)
      left join ota on ota.id = q.id
      left join yb on yb.id = q.id
      left join bolim0 b on b.id = yb.bolim_id
     where ota.id is null
  ),
  bs as (select r.bolim_id, sum(r.s) as s from r where r.bolim_id is not null group by r.bolim_id),
  svq as (
    select b.obyekt_id,
           sum(case when p_olchov = 'smeta' and b.svod_summa is not null then round(b.svod_summa / (1 + b.qqs_stavka / 100), 2)
                    else coalesce(bs.s, 0) end) as qqssiz
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
      'chel_soat', coalesce(ag.chel_soat, 0), 'mash_soat', coalesce(ag.mash_soat, 0), 'mashinist_soat', coalesce(ag.mashinist_soat, 0),
      'narxsiz_soni', coalesce(ag.narxsiz_soni, 0), 'qator_soni', coalesce(ag.qator_soni, 0),
      'subpudratchilar', coalesce(sub.royxat, '[]'::jsonb))
    || case when p_olchov = 'fakt' then jsonb_build_object('smetadan_oshgan', coalesce(ag.osh, 0), 'smetadan_oshgan_soni', coalesce(ag.osh_soni, 0))
            else '{}'::jsonb end
  from unnest(p_obyekt_ids) as o(id)
  left join ag on ag.obyekt_id = o.id
  left join svq on svq.obyekt_id = o.id
  left join sub on sub.obyekt_id = o.id;
$function$
;

CREATE OR REPLACE FUNCTION public.t2_svod_yaxlit_obyekt_v1(p_obyekt_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with recursive yr as (
    select y.id as bolim_id, y.qator_id as id
    from public.t2_svod_yaxlit y where y.obyekt_id = p_obyekt_id and y.faol
      and exists (select 1 from public.t2_qator qq where qq.id = y.qator_id and qq.versiya_holat = 'faol')
    union all
    select yr.bolim_id, q.id from public.t2_qator q join yr on q.ota_id = yr.id
  ), b as (
    select y.id, y.qator_id, y.svod_summa, y.qqs_stavka, y.dalil, y.turi, y.kontragent_nom,
      coalesce(sum(q.summa) filter (where q.tur in ('rs','mat','ob')), 0) as barglar,
      count(*) filter (where q.tur in ('rs','mat','ob') and q.summa is null) as summasiz,
      coalesce(sum(q.summa) filter (where q.tur = 'bl' and not exists (select 1 from public.t2_qator c where c.ota_id = q.id)), 0) as yaxlit_ish
    from public.t2_svod_yaxlit y
    join yr on yr.bolim_id = y.id
    join public.t2_qator q on q.id = yr.id
    group by y.id, y.qator_id, y.svod_summa, y.qqs_stavka, y.dalil, y.turi, y.kontragent_nom
  ), bq as (
    select b.*, case when b.svod_summa is not null then round(b.svod_summa / (1 + b.qqs_stavka / 100), 2)
                     else round(b.barglar + b.yaxlit_ish, 2) end as qqssiz
    from b
  )
  select case when count(*) = 0 then null else jsonb_build_object(
    'qqssiz', round(sum(qqssiz), 2),
    'barglar', round(sum(barglar), 2),
    'summasiz', sum(summasiz),
    'bolimlar', jsonb_agg(jsonb_build_object(
      'id', bq.id, 'qator_id', bq.qator_id, 'nom', (select q.nom from public.t2_qator q where q.id = bq.qator_id),
      'svod_summa', bq.svod_summa, 'qqs_stavka', bq.qqs_stavka, 'qqssiz', bq.qqssiz, 'barglar', round(bq.barglar, 2),
      'asos', case when bq.svod_summa is not null then 'svod' else 'barglar' end, 'dalil', bq.dalil,
      'turi', bq.turi, 'kontragent_nom', bq.kontragent_nom) order by bq.qator_id)) end
  from bq;
$function$
;

CREATE OR REPLACE FUNCTION public.t2_obyekt_nakrutka(p_obyekt_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_chel numeric; v_mash numeric; v_mat numeric; v_ob numeric;
  v_shartnoma_id bigint; v_nk jsonb; v_hisob jsonb; v_kf jsonb;
begin
  select
    coalesce(sum(summa) filter (where kat='ЧЕЛ'), 0),
    coalesce(sum(summa) filter (where kat='МАШ'), 0),
    coalesce(sum(summa) filter (where kat='МАТ'), 0),
    coalesce(sum(summa) filter (where kat='ОБ'), 0)
  into v_chel, v_mash, v_mat, v_ob
  from t2_qator where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob') and versiya_holat = 'faol';

  select shartnoma_id into v_shartnoma_id
  from t2_shartnoma_bog where obyekt_id = p_obyekt_id;

  /* ⚠️ Shartnomaga xos override BOR bo'lsa o'shani, YO'Q bo'lsa umumiy
     default'ni oladi — bitta so'rovda, COALESCE bilan ustuvorlik. */
  select jsonb_object_agg(koef, qiymat) into v_nk
  from (
    select distinct on (koef) koef, qiymat
    from t2_nakrutka
    where (shartnoma_id = v_shartnoma_id or shartnoma_id is null)
      and kompaniya_id = (select kompaniya_id from t2_obyekt where id = p_obyekt_id)
    order by koef, (shartnoma_id is null)   -- false (override bor) birinchi
  ) t;

  v_hisob := t2_nakrutka_hisob(v_chel, v_mash, v_mat, v_ob, 0, 0, 0, coalesce(v_nk, '{}'::jsonb));
  v_kf := t2_nakrutka_koef(coalesce(v_nk, '{}'::jsonb));

  return jsonb_build_object(
    'obyekt_id', p_obyekt_id, 'shartnoma_id', v_shartnoma_id,
    'cats', jsonb_build_object('chel', v_chel, 'mash', v_mash, 'mat', v_mat, 'ob', v_ob),
    'nakrutka', v_hisob, 'kf', v_kf,
    'narxlar', jsonb_build_object(
      'chel', jsonb_build_object('sof', v_chel, 'bilan', v_chel * (v_kf->>'ЧЕЛ')::numeric),
      'mash', jsonb_build_object('sof', v_mash, 'bilan', v_mash * (v_kf->>'МАШ')::numeric),
      'mat',  jsonb_build_object('sof', v_mat,  'bilan', v_mat  * (v_kf->>'МАТ')::numeric),
      'ob',   jsonb_build_object('sof', v_ob,   'bilan', v_ob   * (v_kf->>'ОБ')::numeric)
    )
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_obyekt_nakrutka_v1(p_obyekt_id bigint, p_actor_id bigint, p_shartnoma_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_komp bigint; v_rol text; v_cats jsonb; v_nk_javob jsonb; v_shartnoma_id bigint := p_shartnoma_id;
  v_nk jsonb; v_podval_id bigint; v_podval_nk jsonb; v_manba text;
  v_yax jsonb; v_cats_kaskad jsonb; v_javob jsonb;
begin
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok',false,'code','OBYEKT_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_shartnoma_id is null then
    select sb.shartnoma_id into v_shartnoma_id
    from public.t2_shartnoma_bog sb
    where sb.obyekt_id = p_obyekt_id and sb.holat = 'faol' limit 1;
  end if;

  select jsonb_build_object(
    'chel', coalesce(sum(summa) filter (where kat='ЧЕЛ'), 0),
    'mash', coalesce(sum(summa) filter (where kat='МАШ'), 0),
    'mat',  coalesce(sum(summa) filter (where kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0),
    'ob',   coalesce(sum(summa) filter (where kat='ОБ'), 0),
    'mk',   coalesce(sum(summa) filter (where kat='М/К'), 0),
    'kab',  coalesce(sum(summa) filter (where kat='КАБ'), 0),
    'bez',  coalesce(sum(summa) filter (where kat='БЕЗСКЛАД'), 0))
  into v_cats
  from public.t2_qator
  where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob') and versiya_holat = 'faol';

  v_nk_javob := public.t2_nakrutka_koef_ol_v1(v_komp, p_actor_id, v_shartnoma_id);
  v_nk := v_nk_javob->'koeffitsientlar';
  v_manba := case when v_shartnoma_id is not null and exists (
                    select 1 from public.t2_nakrutka_koef n where n.kompaniya_id = v_komp and n.shartnoma_id = v_shartnoma_id) then 'shartnoma'
                  when exists (select 1 from public.t2_nakrutka_koef n where n.kompaniya_id = v_komp and n.shartnoma_id is null) then 'kompaniya'
                  else 'sukut' end;
  select p.id, public.t2_nakrutka_podval_smeta_nk_v1(p.qatorlar) into v_podval_id, v_podval_nk
  from public.t2_nakrutka_podval p
  where p.obyekt_id = p_obyekt_id and p.kompaniya_id = v_komp and p.faol
  order by p.id desc limit 1;
  if v_podval_nk is not null and v_podval_nk <> '{}'::jsonb then
    v_nk := v_nk || v_podval_nk;
    v_manba := 'smeta_podvali';
  else
    v_podval_id := null;
  end if;

  v_yax := public.t2_svod_yaxlit_obyekt_v1(p_obyekt_id);
  if v_yax is null then
    return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'shartnoma_id', v_shartnoma_id,
      'cats', v_cats, 'koeffitsientlar', v_nk,
      'nakrutka', public.t2_nakrutka_hisobla_v1(v_cats, v_nk),
      'jadval', public.t2_nakrutka_koef_jadval_v1(v_nk),
      'nk_manba', v_manba, 'nakrutka_podval_id', v_podval_id);
  end if;

  with recursive yr as (
    select y.qator_id as id from public.t2_svod_yaxlit y where y.obyekt_id = p_obyekt_id and y.faol
    union
    select q.id from public.t2_qator q join yr on q.ota_id = yr.id
  )
  select jsonb_build_object(
    'chel', coalesce(sum(summa) filter (where kat='ЧЕЛ'), 0),
    'mash', coalesce(sum(summa) filter (where kat='МАШ'), 0),
    'mat',  coalesce(sum(summa) filter (where kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0),
    'ob',   coalesce(sum(summa) filter (where kat='ОБ'), 0),
    'mk',   coalesce(sum(summa) filter (where kat='М/К'), 0),
    'kab',  coalesce(sum(summa) filter (where kat='КАБ'), 0),
    'bez',  coalesce(sum(summa) filter (where kat='БЕЗСКЛАД'), 0))
  into v_cats_kaskad
  from public.t2_qator q
  where q.obyekt_id = p_obyekt_id and q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol'
    and not exists (select 1 from yr where yr.id = q.id);

  v_javob := jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'shartnoma_id', v_shartnoma_id,
    'cats', v_cats, 'cats_kaskad', v_cats_kaskad, 'koeffitsientlar', v_nk,
    'nakrutka', public.t2_nakrutka_yaxlit_qosh_v1(public.t2_nakrutka_hisobla_v1(v_cats_kaskad, v_nk),
                  (v_yax->>'qqssiz')::numeric, (v_yax->>'barglar')::numeric, v_nk),
    'jadval', public.t2_nakrutka_koef_jadval_v1(v_nk),
    'nk_manba', v_manba, 'nakrutka_podval_id', v_podval_id,
    'svod_yaxlit', v_yax);
  return v_javob;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_obyekt_yakunlash_v1(p_obyekt_id bigint, p_actor_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_komp bigint; v_loyiha bigint; v_rol text; v_nom text;
  v_docs jsonb; v_reqs jsonb; v_periods jsonb; v_forma3 jsonb; v_blockers jsonb;
begin
  select kompaniya_id, loyiha_id, nom into v_komp, v_loyiha, v_nom from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok',false,'code','OBYEKT_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'requirementId', 'req-'||t.id, 'type', t.turi, 'label', t.nom,
           'required', t.majburiy, 'requiresApproved', t.tasdiq_kerak, 'evidenceRule', t.evidence_rule
         ) order by t.tartib), '[]'::jsonb)
    into v_reqs
  from (
    select distinct on (turi) *
    from public.t2_yakunlash_talab
    where faol
      and (kompaniya_id is null or kompaniya_id = v_komp)
      and (loyiha_id is null or loyiha_id = v_loyiha)
    order by turi, (loyiha_id is not null) desc, (kompaniya_id is not null) desc, tartib
  ) t;

  select coalesce(jsonb_agg(d order by (d->>'documentId')), '[]'::jsonb) into v_docs from (
    select jsonb_build_object('documentId','akt-'||a.id, 'objectId', p_obyekt_id::text, 'type',
             case a.tur when 'f2' then 'f2' else 'act' end,
             'status', case a.holat when 'tasdiqlangan' then 'approved' when 'bekor' then 'rejected' else 'pending' end,
             'periodId', to_char(a.oy,'YYYY-MM'), 'revisionId', 'rev-'||coalesce(a.revision_id::text,'0')) d
    from public.t2_akt a where a.obyekt_id = p_obyekt_id and a.tur in ('f2','fakt')
    union all
    select jsonb_build_object('documentId','aosr-'||s.id, 'objectId', p_obyekt_id::text, 'type','aosr',
             'status', case s.holat when 'tasdiqlangan' then 'approved' when 'rad' then 'rejected'
                                    when 'imzolangan' then 'approved' else 'pending' end) d
    from public.t2_aosr s where s.obyekt_id = p_obyekt_id
    union all
    select jsonb_build_object('documentId','shartnoma-'||c.id, 'objectId', p_obyekt_id::text, 'type','contract',
             'status', case c.holat when 'faol' then 'approved' when 'bekor' then 'superseded' else 'pending' end) d
    from public.t2_shartnoma c where c.loyiha_id = v_loyiha
    union all
    select jsonb_build_object('documentId','forma3-'||f.id, 'objectId', p_obyekt_id::text, 'type','forma3',
             'status', case when f.qoida_holat = 'FORMA3_RULE_UNRESOLVED' then 'pending'
                            when f.holat = 'imzolangan' then 'approved' else 'pending' end) d
    from public.t2_forma3 f where f.obyekt_id = p_obyekt_id or (f.loyiha_id = v_loyiha and f.obyekt_id is null)
    union all
    select jsonb_build_object('documentId','change-'||o.id, 'objectId', p_obyekt_id::text, 'type','change_evidence',
             'status', case when o.holat = 'tasdiqlangan' and o.evidence_hujjat_id is not null then 'approved'
                            when o.holat = 'tasdiqlangan' then 'pending' else 'pending' end,
             'evidenceIds', case when o.evidence_hujjat_id is not null then jsonb_build_array('hujjat-'||o.evidence_hujjat_id) else '[]'::jsonb end) d
    from public.t2_smeta_ozgarish o where o.obyekt_id = p_obyekt_id and o.holat = 'tasdiqlangan'
  ) s;

  select coalesce(jsonb_agg(p order by (p->>'periodId')), '[]'::jsonb) into v_periods from (
    select jsonb_build_object(
      'periodId', to_char(a.oy,'YYYY-MM'),
      'revisionId', 'rev-'||coalesce(max(a.revision_id)::text,'0'),
      'frozen', bool_and(a.davr_muhr) or bool_and(a.holat = 'tasdiqlangan'),
      'previousQuantity', 0, 'currentQuantity', coalesce(sum(aq.hajm),0),
      'cumulativeQuantity', coalesce(sum(aq.hajm),0),
      'approvedQuantity', (select coalesce(sum(q.hajm),0) from public.t2_qator q where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol'),
      'previousValue', 0, 'currentValue', coalesce(sum(aq.summa),0),
      'cumulativeValue', coalesce(sum(aq.summa),0),
      'approvedValue', (select coalesce(sum(q.summa),0) from public.t2_qator q where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol'),
      'referencePriceSourceId', 'baseline-rev-'||coalesce(max(a.revision_id)::text,'0'),
      'actualPriceSourceId', case when bool_or(aq.actual_narx is not null) then 'actual-'||to_char(a.oy,'YYYYMM') else null end,
      'approvedChangeIds', '[]'::jsonb, 'includedApprovedChangeIds', '[]'::jsonb) p
    from public.t2_akt a join public.t2_akt_qator aq on aq.akt_id = a.id
    where a.obyekt_id = p_obyekt_id and a.tur = 'f2' and a.holat = 'tasdiqlangan'
    group by a.oy
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'raqam', f.raqam,
           'davr', to_char(f.davr_boshi,'YYYY-MM')||'..'||to_char(f.davr_oxiri,'YYYY-MM'),
           'holat', f.holat, 'qoida_holat', f.qoida_holat, 'bajarilgan_f2_summa', f.bajarilgan_f2_summa)
         order by f.davr_boshi), '[]'::jsonb) into v_forma3
  from public.t2_forma3 f where f.obyekt_id = p_obyekt_id or (f.loyiha_id = v_loyiha and f.obyekt_id is null);

  return jsonb_build_object(
    'ok', true, 'generated_at', now(),
    'objectId', p_obyekt_id::text, 'obyekt_nom', v_nom, 'loyiha_id', v_loyiha, 'kompaniya_id', v_komp,
    'documents', v_docs,
    'requirements', v_reqs,
    'exportPeriods', v_periods,
    'forma3', v_forma3,
    'forma3_unresolved', exists (select 1 from public.t2_forma3 f
       where (f.obyekt_id = p_obyekt_id or (f.loyiha_id = v_loyiha and f.obyekt_id is null))
         and f.qoida_holat = 'FORMA3_RULE_UNRESOLVED'));
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_pul_tahlil_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint DEFAULT NULL::bigint, p_shartnoma_id bigint DEFAULT NULL::bigint, p_davr_gacha date DEFAULT NULL::date, p_davr_dan date DEFAULT NULL::date, p_dalil_kat text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_obyektlar bigint[]; v_gacha date; v_dan date;
  v_kesim jsonb := '[]'::jsonb; v_jami jsonb;
  v_zanjirlar jsonb := '[]'::jsonb; v_zanjir_jami jsonb := '{}'::jsonb;
  v_f2_zanjirlar jsonb := '[]'::jsonb; v_f2_zanjir_jami jsonb := '{}'::jsonb;
  v_dalil jsonb := null; v_z jsonb; v_k text; v_n bigint; v_koef jsonb := null; v_koefmap jsonb := '{}'::jsonb;
  v_tot jsonb := '{}'::jsonb; r record; ns jsonb; nf jsonb; v_cs jsonb; v_cf jsonb; c jsonb;
  v_rows jsonb := '[]'::jsonb; v_cfmap jsonb := '{}'::jsonb; v_cfk text; v_kk text; t jsonb; v_ota text; v_tartib numeric;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');

  if p_obyekt_id is not null then
    if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH');
    end if;
    v_obyektlar := array[p_obyekt_id];
  elsif p_shartnoma_id is not null then
    if not exists (select 1 from public.t2_shartnoma where id = p_shartnoma_id and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_SCOPE_MISMATCH');
    end if;
    select coalesce(array_agg(distinct b.obyekt_id), '{}') into v_obyektlar
      from public.t2_shartnoma_bog b join public.t2_obyekt o on o.id = b.obyekt_id
     where b.shartnoma_id = p_shartnoma_id and b.holat = 'faol' and o.kompaniya_id = p_kompaniya_id;
  else
    select coalesce(array_agg(id), '{}') into v_obyektlar from public.t2_obyekt where kompaniya_id = p_kompaniya_id;
  end if;

  v_gacha := case when p_davr_gacha is null then null else date_trunc('month', p_davr_gacha)::date end;
  v_dan   := case when p_davr_dan   is null then null else date_trunc('month', p_davr_dan)::date end;

  foreach v_n in array coalesce(v_obyektlar, '{}') loop
    v_z := public.t2_obyekt_nakrutka_v1(v_n, p_actor_id, p_shartnoma_id);
    if v_z->>'ok' = 'true' then
      v_zanjirlar := v_zanjirlar || jsonb_build_array(jsonb_build_object(
        'obyekt_id', v_n, 'shartnoma_id', v_z->'shartnoma_id', 'cats', v_z->'cats', 'nakrutka', v_z->'nakrutka'));
      v_koefmap := v_koefmap || jsonb_build_object(v_n::text, v_z->'koeffitsientlar');
      if v_koef is null then v_koef := v_z->'koeffitsientlar'; end if;
      for v_k in select jsonb_object_keys(v_z->'nakrutka') loop
        v_zanjir_jami := jsonb_set(v_zanjir_jami, array[v_k],
          to_jsonb(coalesce((v_zanjir_jami->>v_k)::numeric, 0) + coalesce((v_z->'nakrutka'->>v_k)::numeric, 0)));
      end loop;
    end if;
  end loop;

  for r in
    with q as (
      select qq.id, qq.obyekt_id, qq.tur, qq.nom, qq.summa, qq.versiya_holat as vh,
             case when qq.kat in ('ЧЕЛ','МАШ','М/К','КАБ','БЕЗСКЛАД','ОБ') then qq.kat
                  when qq.kat = 'МАТ' then 'МАТ_ODDIY' else 'KATSIZ' end as kk
        from public.t2_qator qq where qq.obyekt_id = any(v_obyektlar)
    )
    select q.obyekt_id as o_id, q.kk as kkk,
      coalesce(sum(q.summa) filter (where q.tur in ('rs','mat','ob') and q.vh = 'faol'), 0) as smeta,
      count(*) filter (where q.tur in ('rs','mat','ob') and q.summa is null and q.vh = 'faol') as smeta_nom,
      coalesce(sum(x.f2), 0) as f2, coalesce(sum(x.f2_nom), 0) as f2_nom
    from q left join (
      select aq.qator_id, sum(coalesce(aq.certified_amount, aq.summa)) as f2,
             count(*) filter (where q2.tur not in ('rz','bl') and coalesce(q2.nom,'') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'
                               and coalesce(aq.certified_amount, aq.summa) is null
                               and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as f2_nom
        from public.t2_akt_qator aq
        join public.t2_qator q2 on q2.id = aq.qator_id and q2.obyekt_id = any(v_obyektlar)
        join public.t2_akt a on a.id = aq.akt_id and a.holat <> 'bekor'
       where a.tur = 'f2' and a.holat = 'tasdiqlangan'
         and (v_gacha is null or a.oy <= v_gacha) and (v_dan is null or a.oy >= v_dan)
       group by aq.qator_id
    ) x on x.qator_id = q.id
    group by q.obyekt_id, q.kk
  loop
    c := v_koefmap -> (r.o_id::text);
    for v_cfk in select unnest(case r.kkk when 'ЧЕЛ' then array['chel'] when 'МАШ' then array['mash']
        when 'МАТ_ODDIY' then array['mat'] when 'М/К' then array['mat','mk'] when 'КАБ' then array['mat','kab']
        when 'БЕЗСКЛАД' then array['mat','bez'] when 'ОБ' then array['ob'] else array[]::text[] end) loop
      v_cfmap := jsonb_set(v_cfmap, array[r.o_id::text], coalesce(v_cfmap -> (r.o_id::text), '{}'::jsonb)
        || jsonb_build_object(v_cfk, coalesce((v_cfmap -> (r.o_id::text) ->> v_cfk)::numeric, 0) + r.f2));
    end loop;
    v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'smeta', r.smeta);
    v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'smeta_nom', r.smeta_nom);
    v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'f2', r.f2);
    v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'f2_nom', r.f2_nom);
    v_cs := public.t2_pul_cats_v1(r.kkk, r.smeta);
    if v_cs is not null and c is not null then
      ns := public.t2_nakrutka_hisobla_v1(v_cs, c); nf := public.t2_nakrutka_hisobla_v1(public.t2_pul_cats_v1(r.kkk, r.f2), c);
      v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 's_i4', (ns->>'itogo4')::numeric);
      v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 's_nds', (ns->>'nds')::numeric);
      v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 's_v', (ns->>'vsego')::numeric);
      v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'f_i4', (nf->>'itogo4')::numeric);
      v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'f_nds', (nf->>'nds')::numeric);
      v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'f_v', (nf->>'vsego')::numeric);
    end if;
  end loop;

  foreach v_n in array coalesce(v_obyektlar, '{}') loop
    c := v_koefmap -> (v_n::text);
    continue when c is null;
    -- PUL_TEZLIK v1: asosiy so'rovdagi (obyekt, kk) f2 yig'indisidan (bir xil filtrlar) - qayta so'rov yo'q.
    v_cf := jsonb_build_object('chel', 0, 'mash', 0, 'mat', 0, 'ob', 0, 'mk', 0, 'kab', 0, 'bez', 0)
            || coalesce(v_cfmap -> (v_n::text), '{}'::jsonb);
    nf := public.t2_nakrutka_hisobla_v1(v_cf, c);
    v_f2_zanjirlar := v_f2_zanjirlar || jsonb_build_array(jsonb_build_object('obyekt_id', v_n, 'cats', v_cf, 'nakrutka', nf));
    for v_k in select jsonb_object_keys(nf) loop
      v_f2_zanjir_jami := jsonb_set(v_f2_zanjir_jami, array[v_k],
        to_jsonb(coalesce((v_f2_zanjir_jami->>v_k)::numeric, 0) + coalesce((nf->>v_k)::numeric, 0)));
    end loop;
  end loop;

  for v_kk, v_ota, v_tartib in select * from (values ('ЧЕЛ',null,1),('МАШ',null,2),('МАТ_ODDIY','МАТ',3.1),('М/К','МАТ',3.2),('КАБ','МАТ',3.3),('БЕЗСКЛАД','МАТ',3.4),('ОБ',null,4),('KATSIZ',null,5)) k(a,b,o) order by 3 loop
    t := coalesce(v_tot -> v_kk, '{}'::jsonb);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('kat', v_kk, 'ota', v_ota, 'tartib', v_tartib,
      'smeta', coalesce((t->>'smeta')::numeric, 0), 'smeta_nom', coalesce((t->>'smeta_nom')::numeric, 0),
      'f2', coalesce((t->>'f2')::numeric, 0), 'f2_nom', coalesce((t->>'f2_nom')::numeric, 0),
      's_i4', t->'s_i4', 's_nds', t->'s_nds', 's_v', t->'s_v', 'f_i4', t->'f_i4', 'f_nds', t->'f_nds', 'f_v', t->'f_v'));
  end loop;

  for t in select * from jsonb_array_elements(v_rows) loop
    v_kesim := v_kesim || jsonb_build_array(jsonb_build_object(
      'kat', t->>'kat', 'ota', t->'ota',
      'smeta_ustamasiz', (t->>'smeta')::numeric, 'smeta_nomalum', (t->>'smeta_nom')::numeric,
      'f2_yopilgan', (t->>'f2')::numeric, 'f2_nomalum', (t->>'f2_nom')::numeric,
      'smeta_ustamali', case when t->'s_v' = 'null'::jsonb or t->'s_v' is null then null
        else jsonb_build_object('itogo4', t->'s_i4', 'nds', t->'s_nds', 'vsego', t->'s_v') end,
      'f2_ustamali', case when t->'f_v' = 'null'::jsonb or t->'f_v' is null then null
        else jsonb_build_object('itogo4', t->'f_i4', 'nds', t->'f_nds', 'vsego', t->'f_v') end,
      'xarajat', null, 'farq', null, 'farq_foiz', null, 'xarajat_holat', 'kiritilmagan'));
  end loop;
  declare m jsonb; i4s numeric; nds_s numeric; v_s numeric; i4f numeric; nds_f numeric; v_f_ numeric;
  begin
    select jsonb_build_object(
        'smeta_ustamasiz', sum((x->>'smeta_ustamasiz')::numeric), 'smeta_nomalum', sum((x->>'smeta_nomalum')::numeric),
        'f2_yopilgan', sum((x->>'f2_yopilgan')::numeric), 'f2_nomalum', sum((x->>'f2_nomalum')::numeric)),
      sum((x->'smeta_ustamali'->>'itogo4')::numeric), sum((x->'smeta_ustamali'->>'nds')::numeric), sum((x->'smeta_ustamali'->>'vsego')::numeric),
      sum((x->'f2_ustamali'->>'itogo4')::numeric), sum((x->'f2_ustamali'->>'nds')::numeric), sum((x->'f2_ustamali'->>'vsego')::numeric)
      into m, i4s, nds_s, v_s, i4f, nds_f, v_f_
      from jsonb_array_elements(v_kesim) x where x->>'ota' = 'МАТ';
    m := m || jsonb_build_object('kat', 'МАТ', 'ota', null,
      'smeta_ustamali', case when v_s is null then null else jsonb_build_object('itogo4', i4s, 'nds', nds_s, 'vsego', v_s) end,
      'f2_ustamali', case when v_f_ is null then null else jsonb_build_object('itogo4', i4f, 'nds', nds_f, 'vsego', v_f_) end,
      'xarajat', null, 'farq', null, 'farq_foiz', null, 'xarajat_holat', 'kiritilmagan');
    select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into v_kesim from (
      select x as e, case x->>'kat' when 'ЧЕЛ' then 1 when 'МАШ' then 2 when 'МАТ_ODDIY' then 3.1 when 'М/К' then 3.2 when 'КАБ' then 3.3
                                    when 'БЕЗСКЛАД' then 3.4 when 'ОБ' then 4 else 5 end as ord from jsonb_array_elements(v_kesim) x
      union all select m, 3.0) s(e, ord);
  end;

  select jsonb_build_object(
      'smeta_ustamasiz', coalesce(sum((x->>'smeta_ustamasiz')::numeric), 0), 'smeta_nomalum', coalesce(sum((x->>'smeta_nomalum')::numeric), 0),
      'f2_yopilgan', coalesce(sum((x->>'f2_yopilgan')::numeric), 0), 'f2_nomalum', coalesce(sum((x->>'f2_nomalum')::numeric), 0),
      'smeta_ustamali', case when v_zanjir_jami ? 'vsego' then jsonb_build_object('itogo4', v_zanjir_jami->'itogo4', 'nds', v_zanjir_jami->'nds', 'vsego', v_zanjir_jami->'vsego') end,
      'f2_ustamali', case when v_f2_zanjir_jami ? 'vsego' then jsonb_build_object('itogo4', v_f2_zanjir_jami->'itogo4', 'nds', v_f2_zanjir_jami->'nds', 'vsego', v_f2_zanjir_jami->'vsego') end,
      'xarajat', null, 'farq', null, 'farq_foiz', null)
    into v_jami from jsonb_array_elements(v_kesim) x where x->>'ota' is null;

  v_kesim := v_kesim || jsonb_build_array(
    jsonb_build_object('kat','SUB','ota',null,'smeta_ustamasiz',null,'f2_yopilgan',null,'smeta_ustamali',null,'f2_ustamali',null,'xarajat',null,'farq',null,'farq_foiz',null,'xarajat_holat','hisoblanmagan'),
    jsonb_build_object('kat','OTK','ota',null,'smeta_ustamasiz',null,'f2_yopilgan',null,'smeta_ustamali',null,'f2_ustamali',null,'xarajat',null,'farq',null,'farq_foiz',null,'xarajat_holat','hisoblanmagan'));

  if p_dalil_kat is not null then
    select coalesce(jsonb_agg(d.j order by d.ord desc), '[]'::jsonb) into v_dalil from (
      select coalesce(abs(x.f2), 0) + coalesce(abs(qq.summa), 0) as ord, jsonb_build_object(
        'qator_id', qq.id, 'obyekt_id', qq.obyekt_id, 'kod', qq.kod, 'nom', qq.nom, 'tur', qq.tur, 'kat', qq.kat,
        'smeta_summa', qq.summa, 'f2_summa', x.f2, 'aktlar', x.aktlar) as j
      from public.t2_qator qq
      left join lateral (
        select sum(coalesce(aq.certified_amount, aq.summa)) as f2,
               jsonb_agg(distinct jsonb_build_object('akt_id', a.id, 'raqam', a.raqam, 'oy', to_char(a.oy,'YYYY-MM'))) as aktlar
          from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id and a.holat <> 'bekor'
         where aq.qator_id = qq.id and a.tur = 'f2' and a.holat = 'tasdiqlangan'
           and (v_gacha is null or a.oy <= v_gacha) and (v_dan is null or a.oy >= v_dan)
      ) x on true
      where qq.obyekt_id = any(v_obyektlar)
        and (case when p_dalil_kat = 'МАТ' then qq.kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')
                  else (case when qq.kat in ('ЧЕЛ','МАШ','МАТ','М/К','КАБ','БЕЗСКЛАД','ОБ') then qq.kat else 'KATSIZ' end)
                       = (case when p_dalil_kat = 'МАТ_ODDIY' then 'МАТ' else p_dalil_kat end) end)
        and (qq.summa is not null or x.f2 is not null)
      order by 1 desc limit 300
    ) d;
  end if;

  return jsonb_build_object(
    'ok', true, 'generated_at', now(),
    'qamrov', jsonb_build_object('obyekt_id', p_obyekt_id, 'shartnoma_id', p_shartnoma_id, 'obyektlar', to_jsonb(v_obyektlar),
                                 'davr_dan', v_dan, 'davr_gacha', v_gacha),
    'kesimlar', v_kesim, 'jami', v_jami,
    'zanjir', jsonb_build_object('obyektlar', v_zanjirlar, 'jami', v_zanjir_jami, 'koeffitsientlar', v_koef,
                                 'f2_obyektlar', v_f2_zanjirlar, 'f2_jami', v_f2_zanjir_jami, 'manba', 't2_obyekt_nakrutka_v1 + t2_nakrutka_hisobla_v1'),
    'dalil_kat', p_dalil_kat, 'dalil', v_dalil);
end $function$
;

CREATE OR REPLACE VIEW public.t2_lrv AS
 WITH rz AS NOT MATERIALIZED (
         SELECT q_1.id,
            q_1.obyekt_id,
            COALESCE(r.nom, q_1.nom) AS razdel_nom,
            COALESCE(r.d1, q_1.d1) AS d1,
            COALESCE(r.d2, q_1.d2) AS d2,
            COALESCE(r.d3, q_1.d3) AS d3
           FROM (t2_qator q_1
             LEFT JOIN LATERAL ( SELECT p.nom,
                    p.d1,
                    p.d2,
                    p.d3
                   FROM t2_qator p
                  WHERE ((p.tur = 'rz'::text) AND ((p.id = q_1.ota_id) OR (p.id = ( SELECT o_1.ota_id
                           FROM t2_qator o_1
                          WHERE (o_1.id = q_1.ota_id)))))
                 LIMIT 1) r ON (true))
        )
 SELECT q.obyekt_id,
    o.nom AS "ОБЪЕКТ",
    q.tartib AS _tartib,
    q.daraja AS _daraja,
    q.id AS _id,
    q.ota_id AS _ota_id,
    q.xom_qator AS "№",
    q.kod AS "КОД",
    q.nom AS "НАИМЕНОВАНИЕ",
    q.birlik AS "ЕД. ИЗМ.",
    NULL::numeric AS "ҲАЖМ (ед)",
    q.hajm AS "ҲАЖМ (жами)",
    q.narx AS "НАРХ (1 ед)",
    q.summa AS "СУММА",
    q.tur AS "ТИП",
        CASE
            WHEN (q.kat = 'ЧЕЛ'::text) THEN q.summa
            ELSE NULL::numeric
        END AS "ЧЕЛ",
        CASE
            WHEN (q.kat = 'МАШ'::text) THEN q.summa
            ELSE NULL::numeric
        END AS "МАШ",
        CASE
            WHEN (q.kat = 'МАТ'::text) THEN q.summa
            ELSE NULL::numeric
        END AS "МАТ",
        CASE
            WHEN (q.kat = 'ОБ'::text) THEN q.summa
            ELSE NULL::numeric
        END AS "ОБ",
    NULL::numeric AS "БЕЗ СКЛАД",
        CASE
            WHEN (q.kat = 'М/К'::text) THEN q.summa
            ELSE NULL::numeric
        END AS "М/К",
        CASE
            WHEN (q.kat = 'КАБ'::text) THEN q.summa
            ELSE NULL::numeric
        END AS "ПРОВОД",
    NULL::numeric AS "Факт объем",
    NULL::numeric AS "Остатка объем",
    NULL::numeric AS "Забран на Ф2",
    NULL::numeric AS "Остатка Ф2",
    rz.d1 AS "ҚАВАТ 1",
    rz.d2 AS "ҚАВАТ 2",
    rz.d3 AS "ҚАВАТ 3",
    NULL::text AS "ВИД РАБОТ",
    rz.razdel_nom AS "РАЗДЕЛ",
        CASE
            WHEN (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) THEN q.summa
            ELSE NULL::numeric
        END AS "Стоимость ресурс",
    NULL::numeric AS "Стоимость Факт рес",
    NULL::numeric AS "Стоимость Ф2 ресур",
    NULL::numeric AS "Стоимость остатка",
    q.narx_usul AS _narx_usul,
    q.qoshimcha AS _qoshimcha,
    q.zamena AS _zamena,
    q.versiya_holat AS _versiya_holat
   FROM ((t2_qator q
     JOIN t2_obyekt o ON ((o.id = q.obyekt_id)))
     LEFT JOIN rz ON (((rz.id = q.id) AND (rz.obyekt_id = q.obyekt_id))))
  WHERE (q.versiya_holat = 'faol'::text)
  ORDER BY q.obyekt_id, q.tartib;

