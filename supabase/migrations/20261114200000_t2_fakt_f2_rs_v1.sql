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

revoke all on function public.t2_fakt_yoz_v2(bigint,date,jsonb,bigint,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.t2_fakt_yoz_v2(bigint,date,jsonb,bigint,uuid,text,text,text) to service_role;
commit;
