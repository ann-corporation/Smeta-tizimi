-- Rollback: asl (20261106480000) xatti-harakat — faqat ish ichidagi resurs.
create or replace function public.t2_resurs_ish_zamena_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_resurs_qator_id bigint, p_ishlar jsonb, p_sabab text, p_operation_id uuid, p_eski_qator_id bigint default null::bigint, p_kutilgan_versiya integer default null::integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prev jsonb; v_request text; v_r public.t2_qator%rowtype; v_w public.t2_qator%rowtype; v_z public.t2_qator%rowtype;
  v_eski public.t2_qator%rowtype; v_o jsonb; v_i jsonb; v_n int := 0; v_res jsonb; v_id bigint; v_ids bigint[] := '{}';
  v_resurs jsonb := '[]'::jsonb; v_tartib int; v_natija jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  if nullif(btrim(coalesce(p_sabab, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  if p_ishlar is null or jsonb_typeof(p_ishlar) <> 'array' or jsonb_array_length(p_ishlar) not between 1 and 10 then
    return jsonb_build_object('ok', false, 'code', 'ISHLAR_1_10', 'xabar', 'Kamida bitta, ko''pi bilan 10 ta ish kiriting.');
  end if;
  perform 1 from public.t2_obyekt where id=p_obyekt_id and kompaniya_id=p_kompaniya_id;
  if not found then return jsonb_build_object('ok',false,'code','OBJECT_SCOPE_INVALID'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:op:' || p_operation_id,0));
  v_request := md5(jsonb_build_array(p_actor_id,p_kompaniya_id,p_obyekt_id,p_resurs_qator_id,p_ishlar,p_sabab,p_eski_qator_id,p_kutilgan_versiya,'resurs_ish_zamena')::text);
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then
    if v_prev->>'_request' is distinct from v_request then return jsonb_build_object('ok',false,'code','OPERATION_SCOPE_MISMATCH'); end if;
    return (v_prev - '_request') || jsonb_build_object('takror',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:' || p_obyekt_id, 0));
  select * into v_r from public.t2_qator where id = p_resurs_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id;
  if not found or v_r.tur not in ('rs', 'mat', 'ob') then return jsonb_build_object('ok', false, 'code', 'RESURS_NOT_FOUND'); end if;
  if coalesce(v_r.qoshimcha, false) then
    return jsonb_build_object('ok', false, 'code', 'RESURS_QOSHILGAN', 'xabar', 'Bu resursni o''zingiz qo''shgansiz — uni tahrirlang yoki o''chiring.');
  end if;
  select * into v_w from public.t2_qator where id = v_r.ota_id and obyekt_id=p_obyekt_id and kompaniya_id=p_kompaniya_id;
  if not found or v_w.tur <> 'bl' then return jsonb_build_object('ok', false, 'code', 'RESURS_ISHSIZ', 'xabar', 'Resurs ish ichida emas — ish zamenasi uchun bo''lim aniqlanmadi.'); end if;
  select * into v_z from public.t2_qator where id = v_w.ota_id and obyekt_id=p_obyekt_id and kompaniya_id=p_kompaniya_id;
  if not found or v_z.tur <> 'rz' then return jsonb_build_object('ok', false, 'code', 'BOLIM_NOT_FOUND'); end if;
  if p_eski_qator_id is not null then
    select * into v_eski from public.t2_qator where id = p_eski_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
    if not found or not coalesce(v_eski.zamena, false) or v_eski.replaces_line_id is distinct from v_r.id then
      return jsonb_build_object('ok', false, 'code', 'ESKI_ZAMENA_NOTOGRI', 'xabar', 'Almashtiriladigan eski qator shu resursning ish zamenasi emas.');
    end if;
    if p_kutilgan_versiya is null then return jsonb_build_object('ok',false,'code','VERSION_REQUIRED'); end if;
    if v_eski.versiya is distinct from p_kutilgan_versiya then return jsonb_build_object('ok',false,'code','STALE_VERSION'); end if;
    if public.t2_qoshilgan_tarixda(p_eski_qator_id) then return jsonb_build_object('ok',false,'code','QATOR_TARIXDA','xabar','Qator Fakt/F2 hujjatida ishlatilgan. Tarix saqlanadi; tuzatish hujjati kerak.'); end if;
    v_o := public.t2_ish_abc_ochir_ichki(p_kompaniya_id, p_obyekt_id, p_eski_qator_id, p_actor_id, 'tahrir: ' || p_sabab, p_operation_id);
    if not coalesce((v_o->>'ok')::boolean, false) then return v_o; end if;
  end if;
  -- Yangi ishlar langardan (ish yoki ishsiz resurs) va uning bolalaridan keyin turadi; boshqa qatorlar surilmaydi.
  with recursive t(id, tartib) as (
    select v_w.id, v_w.tartib
    union all select q.id, q.tartib from public.t2_qator q join t on q.ota_id = t.id)
  select max(t.tartib) into v_tartib from t;
  for v_i in select value from jsonb_array_elements(p_ishlar) loop
    v_n := v_n + 1;
    v_res := public.t2_ish_abc_saqla_v1(p_actor_id, p_kompaniya_id, p_obyekt_id, 'additional', v_z.id, null,
      v_i->'ish', coalesce(v_i->'resurslar', '[]'::jsonb), null, current_date,
      format('Resurs o''rniga ish: «%s» — %s', coalesce(v_r.nom, ''), p_sabab),
      md5(p_operation_id::text || ':rish:' || v_n)::uuid, (select versiya from public.t2_qator where id = v_z.id));
    if not coalesce((v_res->>'ok')::boolean, false) then
      raise exception 'ISH_YARATILMADI: %', coalesce(v_res->>'code', v_res::text);
    end if;
    v_id := (v_res->>'qator_id')::bigint;
    update public.t2_qator set zamena = true, change_type = 'REPLACEMENT', replaces_line_id = v_r.id where id = v_id;
    with recursive t(id) as (select v_id union all select q.id from public.t2_qator q join t on q.ota_id = t.id)
    update public.t2_qator q set tartib = v_tartib from t where q.id = t.id;
    update public.t2_smeta_ozgarish set tur = 'resurs_almashtirish', kind = 'replacement'
     where id = (v_res->>'change_id')::bigint;
    v_ids := v_ids || v_id;
    v_resurs := v_resurs || jsonb_build_array(coalesce(v_res->'resurs_ids', '[]'::jsonb));
  end loop;
  perform public.t2_audit_yoz(p_kompaniya_id, 'resurs_ish_zamena', 'smeta', p_obyekt_id,
    format('resurs=%s ishlar=%s eski=%s sabab=%s', v_r.id, array_to_string(v_ids, ','), coalesce(p_eski_qator_id::text, '-'), left(p_sabab, 200)),
    'actor:' || p_actor_id, null);
  v_natija := jsonb_build_object('ok', true, 'qator_idlar', to_jsonb(v_ids), 'resurs_idlar', v_resurs,
    'qator_id', v_ids[1], 'resurs_id', v_r.id, 'bolim_id', v_z.id, 'eski_ochirildi', v_o->'ochirildi');
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'resurs_ish_zamena', v_natija || jsonb_build_object('_request',v_request));
  return v_natija;
end $function$;
