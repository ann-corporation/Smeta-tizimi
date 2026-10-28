-- T2-FAKT-F2-RS-001 (egasi 2026-10-28, L0 qarori): «Fakt = F2» mehnat/mashina (rs) qatorlarini ham tasdiqlangan F2
-- hajmi va narxi bilan ko'zgulaydi. Oldin t2_fakt_yoz_v2 rs qatorini doim rad etardi (FAKT_DERIVED_OR_ROLLUP_LINE):
-- rs faktga faqat ota BL fakti × norma × smeta narxi bo'lib ergashardi, F2 dagi rs hajm/narxi faktga tushmasdi.
--
-- Yangi qoida (faqat shu RPC; boshqa hech narsa o'zgarmaydi):
--   * bl/mat/ob — avvalgidek;
--   * rs — FAQAT narx_manba = 'f2_sertifikat' (Fakt = F2 ko'zgusi) bilan, hajm musbat yoki manfiy (0 emas);
--   * rs boshqa manba bilan — avvalgidek FAKT_DERIVED_OR_ROLLUP_LINE.
-- Ikki marta sanash yo'q: t2_qator_holat rs uchun o'z (DIRECT) fakti bo'lsa BL_NORMA hosilasini olmaydi
-- (case when bl_soni > 0 and direct_fakt_hajm = 0 then hosila else direct) — acceptance shuni isbotlaydi.
-- Asl smeta (t2_qator) o'zgarmaydi; t2_akt_yarat o'zgarmaydi (narx/narx_yoq/narx_manba/narx_manba_id/narx_izoh ni qabul qiladi).
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
      and not (q.tur='rs' and coalesce(btrim(x->>'narx_manba'),'')='f2_sertifikat')
  ) then return jsonb_build_object('ok',false,'code','FAKT_DERIVED_OR_ROLLUP_LINE','message','Fakt faqat BL, MAT yoki OB qatoriga kiritiladi; RS norma orqali BL Faktdan hisoblanadi (RS faqat «Fakt = F2» — tasdiqlangan F2 narxi bilan).'); end if;
  select public.t2_fakt_yoz(p_obyekt_id,p_sana,p_qatorlar,p_actor_label,p_operation_id,p_izoh,p_raqam) into v_result;
  return coalesce(v_result,jsonb_build_object('ok',false,'code','FAKT_ENGINE_NO_RESULT')) || jsonb_build_object('contract','FAKT_V2','actor_id',p_actor_id,'entry_policy','BL_MAT_OB_RS_F2');
end $function$;

-- ── 2-qism (L0 2026-10-29): t2_qator_holat — rs BL_NORMA hosilasi = (bl fakti − shu bl ning f2_sertifikat manbali
-- fakti) × norma. F2 dan ko'chirilgan ish ulushining mehnat/mashinasi F2 dagi aniq rs qatorlaridan keladi (DIRECT);
-- qo'lda kiritilgan ish fakti avvalgidek ergashadi. f2_sertifikat yozuvi bo'lmagan obyektlarda natija o'zgarmaydi.
-- Qolgan ustunlar va qoidalar prod ta'rifi bilan bir xil (pg_get_viewdef, 2026-10-29).
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
            COALESCE(sum(paq.hajm) FILTER (WHERE pa.tur = 'fakt'::text AND pa.holat <> 'bekor'::text), 0::numeric) AS fakt_hajm,
            -- T2-FAKT-F2-RS-001: F2 dan ko'chirilgan (narx_manba='f2_sertifikat') ish ulushi rs hosilasini bermaydi.
            COALESCE(sum(paq.hajm) FILTER (WHERE pa.tur = 'fakt'::text AND pa.holat <> 'bekor'::text AND paq.narx_manba = 'f2_sertifikat'::text), 0::numeric) AS f2s_hajm
           FROM t2_qator p
             LEFT JOIN t2_akt_qator paq ON paq.qator_id = p.id
             LEFT JOIN t2_akt pa ON pa.id = paq.akt_id
          WHERE q.tur = 'rs'::text AND q.norma IS NOT NULL AND p.id = q.ota_id AND p.obyekt_id = q.obyekt_id AND p.tur = 'bl'::text) bl ON true
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN (bl.fakt_hajm - bl.f2s_hajm) * q.norma
                    ELSE d.direct_fakt_hajm
                END AS fakt_hajm,
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN
                    CASE
                        WHEN q.narx IS NULL THEN NULL::numeric
                        ELSE (bl.fakt_hajm - bl.f2s_hajm) * q.norma * q.narx
                    END
                    ELSE d.direct_fakt_summa
                END AS fakt_summa,
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN 'BL_NORMA'::text
                    ELSE 'DIRECT'::text
                END AS fakt_manbasi) e;

revoke all on function public.t2_fakt_yoz_v2(bigint,date,jsonb,bigint,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.t2_fakt_yoz_v2(bigint,date,jsonb,bigint,uuid,text,text,text) to service_role;
commit;
