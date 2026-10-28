-- Rollback T2-FAKT-F2-RS-001: t2_fakt_yoz_v2, t2_akt_yarat va t2_qator_holat avvalgi (prod) ta'rifiga; manba_akt_qator_id
-- ustuni va hajm CHECK bo'shatilishi olib tashlanadi (eski CHECK NOT VALID — mavjud 0 hajmli nusxa qatorlari bo'lsa ham qaytadi).
-- Yozilgan fakt hujjatlari o'chirilmaydi: rs ga yozilgan «Fakt = F2» qatorlari akt_bekor bilan bekor qilinadi (kerak bo'lsa).
begin;

create or replace function public.t2_fakt_yoz_v2(p_obyekt_id bigint, p_sana date, p_qatorlar jsonb, p_actor_id bigint, p_operation_id uuid, p_izoh text default null::text, p_raqam text default null::text, p_actor_label text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_kompaniya_id bigint; v_result jsonb;
begin
  select o.kompaniya_id into v_kompaniya_id from public.t2_obyekt o where o.id=p_obyekt_id;
  if v_kompaniya_id is null then return jsonb_build_object('ok',false,'code','OBYEKT_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_kompaniya_id,p_actor_id);
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  if p_sana is null then return jsonb_build_object('ok',false,'code','FAKT_DATE_REQUIRED'); end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar)=0 then return jsonb_build_object('ok',false,'code','FAKT_LINES_REQUIRED'); end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x where coalesce(x->>'qator_id','') !~ '^[1-9][0-9]*$' or coalesce(x->>'hajm','') !~ '^-?[0-9]+(\.[0-9]+)?$' or (x->>'hajm')::numeric=0) then return jsonb_build_object('ok',false,'code','FAKT_LINE_INVALID'); end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x group by x->>'qator_id' having count(*)>1) then return jsonb_build_object('ok',false,'code','DUPLICATE_FAKT_SOURCE_LINE'); end if;
  if exists (
    select 1 from jsonb_array_elements(p_qatorlar) x left join public.t2_qator q on q.id=(x->>'qator_id')::bigint
    where q.id is null or q.obyekt_id<>p_obyekt_id
  ) then return jsonb_build_object('ok',false,'code','FAKT_LINE_OUTSIDE_OBJECT'); end if;
  if exists (
    select 1 from jsonb_array_elements(p_qatorlar) x join public.t2_qator q on q.id=(x->>'qator_id')::bigint
    where q.tur not in ('bl','mat','ob')
  ) then return jsonb_build_object('ok',false,'code','FAKT_DERIVED_OR_ROLLUP_LINE','message','Fakt faqat BL, MAT yoki OB qatoriga kiritiladi; RS norma orqali BL Faktdan hisoblanadi.'); end if;
  select public.t2_fakt_yoz(p_obyekt_id,p_sana,p_qatorlar,p_actor_label,p_operation_id,p_izoh,p_raqam) into v_result;
  return coalesce(v_result,jsonb_build_object('ok',false,'code','FAKT_ENGINE_NO_RESULT')) || jsonb_build_object('contract','FAKT_V2','actor_id',p_actor_id,'entry_policy','BL_MAT_OB_ONLY');
end $function$;

-- t2_qator_holat — oldingi (prod) ta'rif: rs hosilasi = bl fakti × norma.
create or replace view public.t2_qator_holat as
 SELECT q.id,
    q.id AS qator_id,
    q.obyekt_id,
    q.tur,
    q.raqam,
    q.kod,
    q.nom,
    q.birlik,
    q.kat,
    q.hajm AS smeta_hajm,
    q.narx AS smeta_narx,
    q.summa AS smeta_summa,
    e.fakt_hajm,
    e.fakt_summa,
    d.f2_hajm,
    d.f2_summa_malum AS f2_summa,
    q.hajm - d.f2_hajm - al.v AS qoldiq_hajm,
    q.summa - d.f2_summa_malum - COALESCE(t2_almashtirilgan_summa_hisob(al.v, q.hajm, q.narx, q.summa), 0::numeric) AS qoldiq_summa,
    GREATEST(e.fakt_hajm - d.f2_hajm, 0::numeric) AS f2_mumkin_hajm,
    GREATEST(e.fakt_summa - d.f2_summa_malum, 0::numeric) AS f2_mumkin_summa,
        CASE
            WHEN d.f2_hajm <> 0::numeric THEN round(d.f2_summa_malum / d.f2_hajm, 2)
            ELSE NULL::numeric
        END AS f2_narx,
        CASE
            WHEN e.fakt_hajm <> 0::numeric THEN round(e.fakt_summa / e.fakt_hajm, 2)
            ELSE NULL::numeric
        END AS fakt_narx,
        CASE
            WHEN d.f2_hajm <> 0::numeric AND q.narx IS NOT NULL AND q.narx <> 0::numeric THEN round((d.f2_summa_malum / d.f2_hajm - q.narx) / q.narx * 100::numeric, 1)
            ELSE NULL::numeric
        END AS f2_narx_farq_foiz,
    q.ota_id,
    q.norma,
    d.direct_fakt_hajm,
    d.direct_fakt_summa,
    e.fakt_manbasi,
    d.f2_summa_nomalum,
    al.v AS almashtirilgan_hajm,
    t2_almashtirilgan_summa_hisob(al.v, q.hajm, q.narx, q.summa) AS almashtirilgan_summa
   FROM t2_qator q
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (EXISTS ( SELECT 1
                       FROM t2_qator zz
                      WHERE zz.replaces_line_id = q.id)) OR (EXISTS ( SELECT 1
                       FROM t2_qator zz
                      WHERE zz.replaces_line_id = q.ota_id)) THEN t2_almashtirilgan_hajm(q.id)
                    ELSE 0::numeric
                END AS v) al
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(aq.hajm) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text), 0::numeric) AS direct_fakt_hajm,
            COALESCE(sum(aq.summa) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text), 0::numeric) AS direct_fakt_summa,
            COALESCE(sum(COALESCE(aq.certified_quantity, aq.hajm)) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text), 0::numeric) AS f2_hajm,
            COALESCE(sum(COALESCE(aq.certified_amount, aq.summa)) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text), 0::numeric) AS f2_summa_malum,
            count(*) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text AND (q.tur <> ALL (ARRAY['rz'::text, 'bl'::text])) AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text AND COALESCE(aq.certified_amount, aq.summa) IS NULL AND COALESCE(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) AS f2_summa_nomalum
           FROM t2_akt_qator aq
             LEFT JOIN t2_akt a ON a.id = aq.akt_id
          WHERE aq.qator_id = q.id) d ON true
     LEFT JOIN LATERAL ( SELECT count(p.id) AS bl_soni,
            COALESCE(sum(paq.hajm) FILTER (WHERE pa.tur = 'fakt'::text AND pa.holat <> 'bekor'::text), 0::numeric) AS fakt_hajm
           FROM t2_qator p
             LEFT JOIN t2_akt_qator paq ON paq.qator_id = p.id
             LEFT JOIN t2_akt pa ON pa.id = paq.akt_id
          WHERE q.tur = 'rs'::text AND q.norma IS NOT NULL AND p.id = q.ota_id AND p.obyekt_id = q.obyekt_id AND p.tur = 'bl'::text) bl ON true
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN bl.fakt_hajm * q.norma
                    ELSE d.direct_fakt_hajm
                END AS fakt_hajm,
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN
                    CASE
                        WHEN q.narx IS NULL THEN NULL::numeric
                        ELSE bl.fakt_hajm * q.norma * q.narx
                    END
                    ELSE d.direct_fakt_summa
                END AS fakt_summa,
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN 'BL_NORMA'::text
                    ELSE 'DIRECT'::text
                END AS fakt_manbasi) e;

-- t2_akt_yarat — prod ta'rifi (manba_akt_qator_id / certified_amount yozmaydi).
CREATE OR REPLACE FUNCTION public.t2_akt_yarat(p_obyekt_id bigint, p_tur text, p_oy date, p_qatorlar jsonb, p_raqam text DEFAULT NULL::text, p_operation_id uuid DEFAULT NULL::uuid, p_manba text DEFAULT 'frontend'::text, p_kim text DEFAULT NULL::text, p_majburiy boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_akt_id bigint; v_bor bigint; v_komp bigint;
  v_jami numeric; v_soni int; v_narxsiz int; v_buzilish jsonb;
  v_ogoh_soni int := 0; v_izoh text; v_rev bigint; v_actor bigint;
begin
  if p_operation_id is not null then
    select id into v_bor from t2_akt where operation_id = p_operation_id;
    if found then
      return jsonb_build_object('ok',true,'takror',true,'akt_id',v_bor,
        'izoh','Bu operatsiya allaqachon bajarilgan — yangi hujjat yaratilmadi.');
    end if;
  end if;
  if p_tur not in ('fakt','f2') then
    return jsonb_build_object('ok',false,'sabab','tur',
      'xabar','tur faqat «fakt» yoki «f2» bo''ladi, berilgani: '||coalesce(p_tur,'(bo''sh)'));
  end if;
  if p_oy is null then
    return jsonb_build_object('ok',false,'sabab','oy','xabar','Oy ko''rsatilmagan');
  end if;
  if p_qatorlar is null or jsonb_array_length(p_qatorlar)=0 then
    return jsonb_build_object('ok',false,'sabab','bosh','xabar','Hujjatda bironta qator yo''q');
  end if;
  select kompaniya_id into v_komp from t2_obyekt where id=p_obyekt_id;
  if not found then
    return jsonb_build_object('ok',false,'sabab','obyekt','xabar','Obyekt topilmadi: '||p_obyekt_id);
  end if;

  v_actor := (regexp_match(coalesce(p_kim,''), '^actor:(\d+)$'))[1]::bigint;
  perform public.t2_smeta_baseline_kafolat_v1(p_obyekt_id, v_actor);
  select id into v_rev from public.t2_smeta_revision where obyekt_id = p_obyekt_id order by seq desc limit 1;

  drop table if exists _kir;
  create temp table _kir on commit drop as
  select (x->>'qator_id')::bigint qator_id, t2_son(x->>'hajm') hajm,
         case when x ? 'narx' then t2_son(x->>'narx') end narx_kir,
         coalesce((x->>'narx_yoq')::boolean, false) narx_yoq,
         nullif(btrim(coalesce(x->>'narx_manba','')),'') narx_manba_kir,
         case when x ? 'actual_narx' then t2_son(x->>'actual_narx') end actual_kir,
         nullif(x->>'narx_manba_id','')::bigint narx_manba_id_kir,
         nullif(btrim(coalesce(x->>'narx_izoh','')),'') narx_izoh_kir,
         nullif(btrim(coalesce(x->>'izoh','')),'') izoh
  from jsonb_array_elements(p_qatorlar) x;

  if exists (select 1 from _kir k left join t2_qator q
             on q.id=k.qator_id and q.obyekt_id=p_obyekt_id where q.id is null) then
    return jsonb_build_object('ok',false,'sabab','qator',
      'xabar','Ba''zi qatorlar bu obyektga tegishli emas',
      'qatorlar',(select jsonb_agg(k.qator_id) from _kir k left join t2_qator q
                  on q.id=k.qator_id and q.obyekt_id=p_obyekt_id where q.id is null));
  end if;
  if exists (select 1 from _kir where hajm is null) then
    return jsonb_build_object('ok',false,'sabab','hajm',
      'xabar','Ba''zi qatorlarda hajm son emas',
      'qatorlar',(select jsonb_agg(qator_id) from _kir where hajm is null));
  end if;

  select jsonb_agg(jsonb_build_object('qator_id',t.qator_id,'nom',t.nom,
           'bor',t.bor,'qoshilmoqda',t.qosh,'chegara',t.chegara))
    into v_buzilish
  from (select k.qator_id, h.nom,
               case when p_tur='fakt' then h.fakt_hajm else h.f2_hajm end bor,
               k.hajm qosh,
               case when p_tur='fakt' then h.smeta_hajm else h.fakt_hajm end chegara
        from _kir k join t2_qator_holat h on h.id=k.qator_id and h.obyekt_id=p_obyekt_id) t
  where t.chegara is not null
    and (abs(t.bor+t.qosh) > abs(t.chegara)+0.000001 or (t.bor+t.qosh)*t.chegara < 0);

  v_ogoh_soni := coalesce(jsonb_array_length(v_buzilish), 0);

  insert into t2_akt (obyekt_id,kompaniya_id,tur,raqam,oy,holat,operation_id,manba,kim,revision_id)
  values (p_obyekt_id,v_komp,p_tur,p_raqam,date_trunc('month',p_oy)::date,
          'qoralama',p_operation_id,p_manba,p_kim,v_rev)
  returning id into v_akt_id;

  insert into t2_akt_qator (akt_id,qator_id,obyekt_id,kompaniya_id,hajm,narx,izoh,
                            baseline_narx,baseline_summa,actual_narx,narx_manba,narx_manba_id,narx_izoh,revision_id)
  select v_akt_id,k.qator_id,p_obyekt_id,v_komp,k.hajm,
         case when k.narx_yoq then null else coalesce(k.narx_kir,q.narx) end,
         k.izoh,
         q.narx,
         case when k.hajm is not null and q.narx is not null then k.hajm * q.narx end,
         k.actual_kir,
         coalesce(k.narx_manba_kir,
                  case when k.actual_kir is not null then 'qol_nomalum'
                       when k.narx_yoq then 'smeta'
                       when k.narx_kir is not null and q.narx is not null and k.narx_kir <> q.narx then 'qol_nomalum'
                       else 'smeta' end),
         k.narx_manba_id_kir,
         k.narx_izoh_kir,
         v_rev
  from _kir k join t2_qator q on q.id=k.qator_id;

  select count(*),count(*) filter (where summa is null),sum(summa)
    into v_soni,v_narxsiz,v_jami from t2_akt_qator where akt_id=v_akt_id;
  update t2_akt set hujjat_jami=v_jami where id=v_akt_id;

  if v_ogoh_soni > 0 then
    v_izoh := v_ogoh_soni || ' qatorda ' ||
              case when p_tur='fakt' then 'FAKT smetadan' else 'Ф2 FAKTdan' end ||
              ' oshadi — tekshiring';
    update t2_akt set izoh = coalesce(izoh||' | ','') || v_izoh where id = v_akt_id;
  end if;

  return jsonb_build_object('ok',true,'takror',false,'akt_id',v_akt_id,'tur',p_tur,
    'holat','qoralama','oy',to_char(date_trunc('month',p_oy),'YYYY-MM'),'revision_id',v_rev,
    'qator_soni',v_soni,'narxsiz',v_narxsiz,'jami',v_jami,
    'toliq',(v_narxsiz=0),
    'ogohlantirish',v_buzilish,
    'ogohlantirish_soni',v_ogoh_soni,
    'izoh', trim(both ' |' from
      case when v_narxsiz>0 then v_narxsiz||' qatorda narx yo''q — JAMI TO''LIQ EMAS.' else '' end
      || case when v_ogoh_soni>0 then ' | '||v_izoh else '' end
      || case when v_narxsiz=0 and v_ogoh_soni=0 then 'Barcha qator narxlangan, ogohlantirish yo''q.' else '' end));
end $function$;

alter table public.t2_akt_qator drop constraint if exists t2_akt_qator_hajm_check;
alter table public.t2_akt_qator add constraint t2_akt_qator_hajm_check check (hajm <> 0::numeric) not valid;
drop index if exists public.t2_akt_qator_akt_manba_uq;
drop index if exists public.t2_akt_qator_manba_akt_qator_idx;
alter table public.t2_akt_qator drop column if exists manba_akt_qator_id;

revoke all on function public.t2_fakt_yoz_v2(bigint,date,jsonb,bigint,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.t2_fakt_yoz_v2(bigint,date,jsonb,bigint,uuid,text,text,text) to service_role;
commit;
