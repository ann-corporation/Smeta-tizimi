begin;
-- Fail closed: never roll back enforcement while individual deny rules exist.
DO $$ BEGIN IF EXISTS(select 1 from public.t2_azolik_ruxsat_qoshimcha where not berilgan) THEN RAISE EXCEPTION 'INDIVIDUAL_DENIES_EXIST: keep enforcement; migrate decisions explicitly first'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.t2_fakt_smetadan_tashqari_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_command text, p_ota_qator_id bigint, p_almashtirilayotgan_qator_id bigint, p_nom text, p_birlik text, p_kod text, p_hajm numeric, p_sana date, p_sabab text, p_resurslar jsonb, p_ish_turi_id bigint, p_katalogga_saqla boolean, p_operation_id uuid, p_kutilgan_versiya integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_req jsonb; v_add jsonb; v_fakt jsonb; v_qator_id bigint; v_kind text; v_ish_turi_id bigint := p_ish_turi_id;
  v_tur public.t2_ish_turi%rowtype; v_nom text := p_nom; v_birlik text := p_birlik; v_kod text := p_kod;
  v_ota bigint := p_ota_qator_id; v_versiya integer := p_kutilgan_versiya; v_rol text;
  v_res jsonb; v_res_add jsonb; v_i integer := 0; v_fakt_qatorlar jsonb := '[]'::jsonb; v_res_ids bigint[] := '{}';
  v_takror boolean;
begin
  if p_command not in ('additional', 'replacement') then return jsonb_build_object('ok', false, 'code', 'COMMAND_INVALID'); end if;
  if p_hajm is null or p_hajm <= 0 then return jsonb_build_object('ok', false, 'code', 'FAKT_HAJM_REQUIRED'); end if;
  if p_sana is null then return jsonb_build_object('ok', false, 'code', 'FAKT_DATE_REQUIRED'); end if;
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_resurslar is not null and (jsonb_typeof(p_resurslar) <> 'array' or jsonb_array_length(p_resurslar) > 50) then
    return jsonb_build_object('ok', false, 'code', 'RESURSLAR_0_50');
  end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then
    return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED');
  end if;
  select true, response into v_takror, v_add from public.t2_addrepl_command where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'qator_id', v_add->'qator_id', 'change_id', v_add->'change_id'); end if;
  v_takror := false;

  if v_ish_turi_id is not null then
    select * into v_tur from public.t2_ish_turi where id = v_ish_turi_id and kompaniya_id = p_kompaniya_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'ISH_TURI_NOT_FOUND'); end if;
    v_nom := coalesce(nullif(btrim(v_nom), ''), v_tur.nomi);
    v_birlik := coalesce(nullif(btrim(v_birlik), ''), v_tur.birligi);
    v_kod := coalesce(nullif(btrim(v_kod), ''), v_tur.kod);
  end if;

  if p_command = 'additional' and v_ota is null then
    perform 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'OBJECT_ACCESS_DENIED'); end if;
    select id, versiya into v_ota, v_versiya from public.t2_qator
     where obyekt_id = p_obyekt_id and tur = 'rz' and ota_id is null and nom = 'СМЕТАДАН ТАШҚАРИ ИШЛАР'
     order by id limit 1;
    if v_ota is null then
      insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, daraja, tartib, tur, nom, qoshimcha, change_type)
        values (p_obyekt_id, p_kompaniya_id, null, 0,
                (select coalesce(max(tartib), 0) + 1 from public.t2_qator where obyekt_id = p_obyekt_id),
                'rz', 'СМЕТАДАН ТАШҚАРИ ИШЛАР', true, 'ADDITIONAL')
        returning id, versiya into v_ota, v_versiya;
    end if;
  end if;
  if v_ota is null then return jsonb_build_object('ok', false, 'code', 'PARENT_REQUIRED'); end if;

  v_req := jsonb_strip_nulls(jsonb_build_object(
    'command', p_command, 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
    'ota_qator_id', v_ota, 'almashtirilayotgan_qator_id', p_almashtirilayotgan_qator_id,
    'nom', v_nom, 'birlik', v_birlik, 'hajm', p_hajm, 'kod', nullif(btrim(v_kod), ''),
    'sabab', p_sabab, 'operation_id', p_operation_id, 'kutilgan_versiya', v_versiya));
  v_add := public.t2_addrepl_execute_v1(v_req);
  v_qator_id := (v_add->>'qator_id')::bigint;
  if v_qator_id is null then return jsonb_build_object('ok', false, 'code', 'LINE_NOT_CREATED', 'natija', v_add); end if;
  select tur into v_kind from public.t2_qator where id = v_qator_id;
  if v_kind not in ('bl', 'mat', 'ob') then
    raise exception 'RS_FAKT_YOQ: RS qatori norma orqali hisoblanadi — zamenani ish yoki material qatorida qiling';
  end if;
  if v_kind = 'ob' then update public.t2_qator set kat = 'ОБ' where id = v_qator_id; end if;
  v_fakt_qatorlar := v_fakt_qatorlar || jsonb_build_array(jsonb_build_object('qator_id', v_qator_id, 'hajm', p_hajm));

  if p_resurslar is not null and jsonb_array_length(p_resurslar) > 0 then
    if v_kind <> 'bl' then raise exception 'RESURS_FAQAT_ISH_OSTIGA'; end if;
    for v_res in select value from jsonb_array_elements(p_resurslar) loop
      v_i := v_i + 1;
      if coalesce(v_res->>'tur', '') not in ('mat', 'ob') or nullif(btrim(v_res->>'nom'), '') is null
         or nullif(btrim(v_res->>'birlik'), '') is null or coalesce((v_res->>'hajm')::numeric, 0) <= 0 then
        raise exception 'RESURS_INVALID: % (tur mat/ob, nom, birlik, hajm > 0)', v_i;
      end if;
      v_res_add := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
        'command', 'resource', 'tur', v_res->>'tur', 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id,
        'obyekt_id', p_obyekt_id, 'ota_qator_id', v_qator_id, 'nom', btrim(v_res->>'nom'), 'birlik', btrim(v_res->>'birlik'),
        'hajm', (v_res->>'hajm')::numeric, 'kod', nullif(btrim(v_res->>'kod'), ''), 'sabab', p_sabab,
        'operation_id', md5(p_operation_id::text || ':res:' || v_i)::uuid,
        'kutilgan_versiya', (select versiya from public.t2_qator where id = v_qator_id))));
      v_res_ids := v_res_ids || (v_res_add->>'qator_id')::bigint;
      if v_res->>'tur' = 'ob' then update public.t2_qator set kat = 'ОБ' where id = (v_res_add->>'qator_id')::bigint; end if;
      v_fakt_qatorlar := v_fakt_qatorlar || jsonb_build_array(jsonb_build_object(
        'qator_id', (v_res_add->>'qator_id')::bigint, 'hajm', (v_res->>'hajm')::numeric));
    end loop;
  end if;

  v_fakt := public.t2_fakt_yoz_v2(p_obyekt_id, p_sana, v_fakt_qatorlar, p_actor_id,
    md5(p_operation_id::text || ':fakt')::uuid, left('Smetadan tashqari: ' || coalesce(p_sabab, ''), 500), null, 'actor:' || p_actor_id);
  if coalesce((v_fakt->>'ok')::boolean, false) is not true then
    raise exception 'FAKT_NOT_WRITTEN: %', coalesce(v_fakt->>'code', v_fakt->>'error', v_fakt::text);
  end if;

  if coalesce(p_katalogga_saqla, false) and v_ish_turi_id is null then
    select id into v_ish_turi_id from public.t2_ish_turi
     where kompaniya_id = p_kompaniya_id and lower(btrim(nomi)) = lower(btrim(v_nom)) and lower(btrim(birligi)) = lower(btrim(v_birlik))
     limit 1;
    if v_ish_turi_id is null then
      insert into public.t2_ish_turi(kompaniya_id, kod, nomi, birligi, kategoriya)
        values (p_kompaniya_id, coalesce(nullif(btrim(v_kod), ''), 'ИТ-' || p_operation_id::text), btrim(v_nom), btrim(v_birlik), 'smetadan_tashqari')
        on conflict (kompaniya_id, kod) do nothing
        returning id into v_ish_turi_id;
      if v_ish_turi_id is not null and nullif(btrim(v_kod), '') is null then
        update public.t2_ish_turi set kod = 'ИТ-' || v_ish_turi_id where id = v_ish_turi_id;
      end if;
    end if;
  end if;

  if not v_takror then
    perform public.t2_audit_yoz(p_kompaniya_id, 'fakt_smetadan_tashqari', 'fakt', p_obyekt_id,
      format('qator=%s tur=%s hajm=%s resurs=%s ish_turi=%s', v_qator_id, p_command, p_hajm, cardinality(v_res_ids), coalesce(v_ish_turi_id::text, '-')),
      'actor:' || p_actor_id, null);
  end if;
  return jsonb_build_object('ok', true, 'qator_id', v_qator_id, 'resurs_ids', to_jsonb(v_res_ids), 'bolim_id', v_ota,
    'change_id', v_add->'change_id', 'ish_turi_id', v_ish_turi_id, 'takror', v_takror);
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_ish_abc_ochir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_id bigint, p_sabab text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rol text; v_prev jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:' || p_obyekt_id, 0));
  v_res := public.t2_ish_abc_ochir_ichki(p_kompaniya_id, p_obyekt_id, p_qator_id, p_actor_id, p_sabab, p_operation_id);
  if coalesce((v_res->>'ok')::boolean, false) then
    insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_abc_ochir', v_res);
  end if;
  return v_res;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_ish_abc_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_command text, p_ota_qator_id bigint, p_almashtirilayotgan_qator_id bigint, p_ish jsonb, p_resurslar jsonb, p_fakt_hajm numeric, p_sana date, p_sabab text, p_operation_id uuid, p_kutilgan_versiya integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rol text; v_prev jsonb; v_ota bigint := p_ota_qator_id; v_versiya integer := p_kutilgan_versiya;
  v_add jsonb; v_id bigint; v_kind text; v_res jsonb; v_r jsonb; v_rid bigint; v_i integer := 0;
  v_ish_hajm numeric; v_hajm numeric; v_narx numeric; v_kat text; v_ids bigint[] := '{}'; v_eski public.t2_qator%rowtype;
  v_fakt jsonb; v_manba text; v_norma numeric; v_rtur text; v_fakt_q jsonb := '[]'::jsonb;
begin
  if p_command not in ('additional', 'replacement', 'resurs_zamena') then return jsonb_build_object('ok', false, 'code', 'COMMAND_INVALID'); end if;
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if nullif(btrim(coalesce(p_sabab, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  if p_resurslar is not null and (jsonb_typeof(p_resurslar) <> 'array' or jsonb_array_length(p_resurslar) > 60) then
    return jsonb_build_object('ok', false, 'code', 'RESURSLAR_0_60');
  end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  select response into v_prev from public.t2_addrepl_command where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'qator_id', v_prev->'qator_id'); end if;

  if p_command = 'resurs_zamena' then
    select * into v_eski from public.t2_qator where id = p_almashtirilayotgan_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id;
    if not found or v_eski.tur not in ('rs', 'mat', 'ob') or v_eski.ota_id is null then return jsonb_build_object('ok', false, 'code', 'RESURS_NOT_FOUND'); end if;
    v_r := p_resurslar->0;
    if v_r is null then return jsonb_build_object('ok', false, 'code', 'RESURS_REQUIRED'); end if;
    select hajm, versiya into v_ish_hajm, v_versiya from public.t2_qator where id = v_eski.ota_id;
    v_norma := nullif(v_r->>'norma', '')::numeric; if v_norma <= 0 then v_norma := null; end if;
    v_hajm := case when v_norma is not null and v_ish_hajm is not null then round(v_norma * v_ish_hajm, 6) else nullif(v_r->>'hajm', '')::numeric end;
    v_add := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
      'command', 'replacement', 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
      'ota_qator_id', v_eski.ota_id, 'almashtirilayotgan_qator_id', v_eski.id, 'nom', btrim(v_r->>'nom'), 'birlik', btrim(v_r->>'birlik'),
      'hajm', v_hajm, 'kod', nullif(btrim(coalesce(v_r->>'kod', '')), ''), 'sabab', p_sabab, 'operation_id', p_operation_id, 'kutilgan_versiya', v_versiya)));
    v_id := (v_add->>'qator_id')::bigint;
    v_narx := nullif(v_r->>'narx', '')::numeric; if v_narx <= 0 then v_narx := null; end if;
    v_kat := coalesce(nullif(v_r->>'kat', ''), v_eski.kat);
    update public.t2_qator set norma = v_norma, kat = case when v_kat in ('ЧЕЛ','МАШ','МАТ','ОБ','М/К','КАБ','БЕЗСКЛАД') then v_kat else kat end,
           narx = v_narx, summa = case when v_narx is null or v_hajm is null then null else round(v_hajm * v_narx, 2) end,
           narx_usul = upper(coalesce(nullif(v_r->>'narx_manba', ''), 'qolda'))
     where id = v_id;
    perform public.t2_audit_yoz(p_kompaniya_id, 'resurs_zamena', 'smeta', p_obyekt_id, format('yangi=%s eski=%s', v_id, v_eski.id), 'actor:' || p_actor_id, null);
    return jsonb_build_object('ok', true, 'qator_id', v_id, 'change_id', v_add->'change_id');
  end if;

  if p_ish is null or nullif(btrim(coalesce(p_ish->>'nom', '')), '') is null or nullif(btrim(coalesce(p_ish->>'birlik', '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'ISH_NOM_BIRLIK_REQUIRED');
  end if;
  v_ish_hajm := nullif(p_ish->>'hajm', '')::numeric;
  if v_ish_hajm is null or v_ish_hajm <= 0 then return jsonb_build_object('ok', false, 'code', 'ISH_HAJM_REQUIRED'); end if;
  if p_command = 'additional' and v_ota is null then
    perform 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'OBJECT_ACCESS_DENIED'); end if;
    select id, versiya into v_ota, v_versiya from public.t2_qator
     where obyekt_id = p_obyekt_id and tur = 'rz' and ota_id is null and nom = 'СМЕТАДАН ТАШҚАРИ ИШЛАР' order by id limit 1;
    if v_ota is null then
      insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, daraja, tartib, tur, nom, qoshimcha, change_type)
        values (p_obyekt_id, p_kompaniya_id, null, 0, (select coalesce(max(tartib), 0) + 1 from public.t2_qator where obyekt_id = p_obyekt_id),
                'rz', 'СМЕТАДАН ТАШҚАРИ ИШЛАР', true, 'ADDITIONAL')
        returning id, versiya into v_ota, v_versiya;
    end if;
  end if;
  if v_ota is null then return jsonb_build_object('ok', false, 'code', 'PARENT_REQUIRED'); end if;

  v_add := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
    'command', p_command, 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
    'ota_qator_id', v_ota, 'almashtirilayotgan_qator_id', p_almashtirilayotgan_qator_id,
    'nom', btrim(p_ish->>'nom'), 'birlik', btrim(p_ish->>'birlik'), 'hajm', v_ish_hajm,
    'kod', nullif(btrim(coalesce(p_ish->>'kod', '')), ''), 'sabab', p_sabab, 'operation_id', p_operation_id, 'kutilgan_versiya', v_versiya)));
  v_id := (v_add->>'qator_id')::bigint;
  select tur into v_kind from public.t2_qator where id = v_id;

  if p_resurslar is not null and jsonb_array_length(p_resurslar) > 0 then
    if v_kind <> 'bl' then raise exception 'RESURS_FAQAT_ISH_OSTIGA'; end if;
    for v_r in select value from jsonb_array_elements(p_resurslar) loop
      v_i := v_i + 1;
      v_norma := nullif(v_r->>'norma', '')::numeric; if v_norma <= 0 then v_norma := null; end if;
      v_hajm := case when v_norma is not null then round(v_norma * v_ish_hajm, 6) else nullif(v_r->>'hajm', '')::numeric end;
      if nullif(btrim(coalesce(v_r->>'nom', '')), '') is null or nullif(btrim(coalesce(v_r->>'birlik', '')), '') is null
         or coalesce(v_hajm, 0) <= 0 then
        raise exception 'RESURS_INVALID: % (nom, birlik va norma yoki aniq hajm > 0)', v_i;
      end if;
      v_kat := nullif(v_r->>'kat', '');
      v_rtur := case when v_norma is not null then 'rs' when v_kat = 'ОБ' then 'ob' else 'mat' end;
      v_res := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
        'command', 'resource', 'tur', v_rtur, 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
        'ota_qator_id', v_id, 'nom', btrim(v_r->>'nom'), 'birlik', btrim(v_r->>'birlik'), 'hajm', v_hajm,
        'kod', nullif(btrim(coalesce(v_r->>'kod', '')), ''), 'sabab', p_sabab,
        'operation_id', md5(p_operation_id::text || ':abc:' || v_i)::uuid,
        'kutilgan_versiya', (select versiya from public.t2_qator where id = v_id))));
      v_rid := (v_res->>'qator_id')::bigint;
      v_narx := nullif(v_r->>'narx', '')::numeric; if v_narx <= 0 then v_narx := null; end if;
      v_manba := upper(coalesce(nullif(v_r->>'narx_manba', ''), 'qolda'));
      update public.t2_qator set norma = v_norma,
             kat = case when v_kat in ('ЧЕЛ','МАШ','МАТ','ОБ','М/К','КАБ','БЕЗСКЛАД') then v_kat else kat end,
             narx = v_narx, summa = case when v_narx is null then null else round(v_hajm * v_narx, 2) end,
             narx_usul = case when v_narx is null then null else v_manba end
       where id = v_rid;
      v_ids := v_ids || v_rid;
      if v_rtur <> 'rs' then v_fakt_q := v_fakt_q || jsonb_build_array(jsonb_build_object('qator_id', v_rid, 'hajm', v_hajm)); end if;
    end loop;
    update public.t2_qator set summa = (select sum(summa) from public.t2_qator where ota_id = v_id and tur in ('rs', 'mat', 'ob'))
     where id = v_id;
  end if;

  if coalesce(p_fakt_hajm, 0) > 0 then
    if v_kind not in ('bl', 'mat', 'ob') then raise exception 'FAKT_FAQAT_ISH_YOKI_MATERIAL'; end if;
    v_fakt := public.t2_fakt_yoz_v2(p_obyekt_id, coalesce(p_sana, current_date),
      jsonb_build_array(jsonb_build_object('qator_id', v_id, 'hajm', p_fakt_hajm)) || v_fakt_q, p_actor_id,
      md5(p_operation_id::text || ':abc:fakt')::uuid, left('ABC: ' || p_sabab, 500), null, 'actor:' || p_actor_id);
    if coalesce((v_fakt->>'ok')::boolean, false) is not true then
      raise exception 'FAKT_NOT_WRITTEN: %', coalesce(v_fakt->>'code', v_fakt->>'error', v_fakt::text);
    end if;
  end if;

  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_abc_' || p_command, 'smeta', p_obyekt_id,
    format('qator=%s resurs=%s fakt=%s', v_id, cardinality(v_ids), coalesce(p_fakt_hajm, 0)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'qator_id', v_id, 'resurs_ids', to_jsonb(v_ids), 'bolim_id', v_ota, 'change_id', v_add->'change_id');
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_ish_abc_tahrir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_id bigint, p_ish jsonb, p_resurslar jsonb, p_fakt_hajm numeric, p_sana date, p_sabab text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rol text; v_prev jsonb; v_o jsonb; v_cmd text; v_ota bigint; v_old bigint; v_ver integer; v_new jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:' || p_obyekt_id, 0));
  v_o := public.t2_ish_abc_ochir_ichki(p_kompaniya_id, p_obyekt_id, p_qator_id, p_actor_id, 'tahrir: ' || coalesce(p_sabab, ''), p_operation_id);
  if not coalesce((v_o->>'ok')::boolean, false) then return v_o; end if;
  v_ota := (v_o->>'ota_id')::bigint; v_old := nullif(v_o->>'replaces_line_id', '')::bigint;
  v_cmd := case when (v_o->>'tur') in ('rs', 'mat', 'ob') and v_old is not null then 'resurs_zamena'
                when coalesce((v_o->>'zamena')::boolean, false) and v_old is not null then 'replacement'
                when (v_o->>'tur') = 'bl' then 'additional' else null end;
  if v_cmd is null then raise exception 'TAHRIR_ISH_ORQALI: resursni o''z ishi orqali tahrirlang'; end if;
  select versiya into v_ver from public.t2_qator where id = v_ota;
  v_new := public.t2_ish_abc_saqla_v1(p_actor_id, p_kompaniya_id, p_obyekt_id, v_cmd,
    case when v_cmd = 'resurs_zamena' then null else v_ota end, v_old, p_ish, p_resurslar, p_fakt_hajm, p_sana, p_sabab,
    md5(p_operation_id::text || ':tahrir:yangi')::uuid, v_ver);
  if not coalesce((v_new->>'ok')::boolean, false) then raise exception 'TAHRIR_YIQILDI: %', coalesce(v_new->>'code', v_new::text); end if;
  v_new := v_new || jsonb_build_object('eski_ochirildi', v_o->'ochirildi');
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_abc_tahrir', v_new);
  return v_new;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_ish_turi_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint, p_kod text, p_nomi text, p_birligi text, p_narx numeric, p_norma numeric, p_kategoriya text, p_kutilgan_versiya integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rol text; v_row public.t2_ish_turi%rowtype;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then
    return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED');
  end if;
  if nullif(btrim(p_kod), '') is null or nullif(btrim(p_nomi), '') is null or nullif(btrim(p_birligi), '') is null then
    return jsonb_build_object('ok', false, 'code', 'KOD_NOM_BIRLIK_REQUIRED');
  end if;
  if p_narx is not null and p_narx < 0 then return jsonb_build_object('ok', false, 'code', 'NARX_INVALID'); end if;
  if p_id is null then
    if exists (select 1 from public.t2_ish_turi where kompaniya_id = p_kompaniya_id and kod = btrim(p_kod)) then
      return jsonb_build_object('ok', false, 'code', 'KOD_BAND');
    end if;
    insert into public.t2_ish_turi(kompaniya_id, kod, nomi, birligi, narx, norma, kategoriya)
      values (p_kompaniya_id, btrim(p_kod), btrim(p_nomi), btrim(p_birligi), coalesce(p_narx, 0), coalesce(p_norma, 0), nullif(btrim(p_kategoriya), ''))
      returning * into v_row;
  else
    update public.t2_ish_turi set kod = btrim(p_kod), nomi = btrim(p_nomi), birligi = btrim(p_birligi),
        narx = coalesce(p_narx, 0), norma = coalesce(p_norma, 0), kategoriya = nullif(btrim(p_kategoriya), ''), versiya = versiya + 1
     where id = p_id and kompaniya_id = p_kompaniya_id and versiya = p_kutilgan_versiya
     returning * into v_row;
    if not found then return jsonb_build_object('ok', false, 'code', 'STALE_OR_NOT_FOUND'); end if;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_turi_saqla', 'katalog', null, 'ish_turi:' || v_row.id || ' ' || v_row.kod, 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', v_row.id, 'versiya', v_row.versiya);
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_nakrutka_koef_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_shartnoma_id bigint, p_koef_kod text, p_qiymat numeric, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_prev jsonb; v_rol text; v_row public.t2_nakrutka_koef;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin','superadmin','boss','director','pto') then
    raise exception 'WRITE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if not (public.t2_nakrutka_default_v1() ? p_koef_kod) then
    return jsonb_build_object('ok',false,'code','KOEF_KOD_INVALID');
  end if;
  if p_shartnoma_id is not null and not exists(
      select 1 from public.t2_shartnoma s where s.id=p_shartnoma_id and s.kompaniya_id=p_kompaniya_id) then
    return jsonb_build_object('ok',false,'code','SHARTNOMA_SCOPE_MISMATCH');
  end if;

  insert into public.t2_nakrutka_koef(kompaniya_id, shartnoma_id, koef_kod, qiymat, actor_id)
    values (p_kompaniya_id, p_shartnoma_id, p_koef_kod, p_qiymat, p_actor_id)
    on conflict (kompaniya_id, koef_kod) where shartnoma_id is null
    do update set qiymat = excluded.qiymat, actor_id = excluded.actor_id,
      yangilandi = now(), versiya = t2_nakrutka_koef.versiya + 1
    returning * into v_row;
  if v_row.id is null then
    insert into public.t2_nakrutka_koef(kompaniya_id, shartnoma_id, koef_kod, qiymat, actor_id)
      values (p_kompaniya_id, p_shartnoma_id, p_koef_kod, p_qiymat, p_actor_id)
      on conflict (kompaniya_id, shartnoma_id, koef_kod)
      do update set qiymat = excluded.qiymat, actor_id = excluded.actor_id,
        yangilandi = now(), versiya = t2_nakrutka_koef.versiya + 1
      returning * into v_row;
  end if;

  v_prev := jsonb_build_object('ok',true,'id',v_row.id,'koef_kod',v_row.koef_kod,'qiymat',v_row.qiymat,'versiya',v_row.versiya);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'nakrutka_koef_saqla', v_prev);
  return v_prev;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_obyekt_yarat_v1(p_kompaniya_id bigint, p_actor_id bigint, p_loyiha_id bigint, p_nom text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_prev jsonb; v_rol text; v_obyekt public.t2_obyekt; v_nom text;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin','superadmin','boss','director','pto') then
    raise exception 'WRITE_ROLE_REQUIRED' using errcode='42501';
  end if;

  v_nom := nullif(btrim(p_nom),'');
  if v_nom is null then
    return jsonb_build_object('ok',false,'code','OBYEKT_NOM_REQUIRED');
  end if;
  if p_loyiha_id is not null and not exists(
      select 1 from public.t2_loyiha where id=p_loyiha_id and kompaniya_id=p_kompaniya_id) then
    return jsonb_build_object('ok',false,'code','PROJECT_COMPANY_MISMATCH');
  end if;

  if exists(
      select 1 from public.t2_obyekt
      where kompaniya_id = p_kompaniya_id and nom = v_nom and holat <> 'bekor') then
    return jsonb_build_object('ok',false,'code','OBYEKT_NOM_MAVJUD',
      'xato', format('"%s" nomli obyekt allaqachon mavjud. Boshqa nom tanlang.', v_nom));
  end if;

  begin
    insert into public.t2_obyekt(nom, tur, kompaniya_id, loyiha_id, storage_status, operation_id)
      values (v_nom, 'obyekt', p_kompaniya_id, p_loyiha_id, 'ready', p_operation_id)
      returning * into v_obyekt;
  exception when unique_violation then
    return jsonb_build_object('ok',false,'code','OBYEKT_NOM_MAVJUD',
      'xato', format('"%s" nomli obyekt allaqachon mavjud. Boshqa nom tanlang.', v_nom));
  end;

  perform public.t2_audit_yoz(p_kompaniya_id,'obyekt_yarat','obyekt',v_obyekt.id,
    format('nom=%s; loyiha_id=%s; actor_id=%s',v_obyekt.nom,p_loyiha_id,p_actor_id),'actor:'||p_actor_id,null);

  v_prev := jsonb_build_object('ok',true,'obyekt_id',v_obyekt.id,'nom',v_obyekt.nom,'loyiha_id',v_obyekt.loyiha_id,'versiya',v_obyekt.versiya);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'obyekt_yarat', v_prev);
  return v_prev;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_resurs_kategoriya_belgila_v1(p_kompaniya_id bigint, p_actor_id bigint, p_nom text, p_birlik text, p_kategoriya text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_prev jsonb; v_rol text; v_row public.t2_resurs_kategoriya;
  v_nom_key text; v_bir_key text;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin','superadmin','boss','director','pto') then
    raise exception 'WRITE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if p_kategoriya not in ('ЧЕЛ','МАШ','МАТ','ОБ','М/К','КАБ','БЕЗСКЛАД') then
    return jsonb_build_object('ok',false,'code','KATEGORIYA_INVALID');
  end if;
  v_nom_key := public.t2_resurs_nom_kalit(p_nom);
  v_bir_key := public.t2_resurs_birlik_kalit(p_birlik);
  if v_nom_key = '' or v_bir_key = '' then
    return jsonb_build_object('ok',false,'code','NOM_BIRLIK_REQUIRED');
  end if;
  insert into public.t2_resurs_kategoriya(kompaniya_id, nom_key, birlik_key, kategoriya, actor_id)
    values (p_kompaniya_id, v_nom_key, v_bir_key, p_kategoriya, p_actor_id)
    on conflict (kompaniya_id, nom_key, birlik_key)
    do update set kategoriya = excluded.kategoriya, actor_id = excluded.actor_id,
      yangilandi = now(), versiya = t2_resurs_kategoriya.versiya + 1
    returning * into v_row;
  v_prev := jsonb_build_object('ok',true,'id',v_row.id,'kategoriya',v_row.kategoriya,'versiya',v_row.versiya);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'resurs_kategoriya_belgila', v_prev);
  return v_prev;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_smeta_import_bulk_unlocked_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_operation_id uuid, p_source_document_id bigint, p_qatorlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_prev jsonb; v_rol text; v_soni integer;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin','superadmin','boss','director','pto') then
    raise exception 'WRITE_ROLE_REQUIRED' using errcode='42501';
  end if;

  if not exists (select 1 from public.t2_obyekt where id=p_obyekt_id and kompaniya_id=p_kompaniya_id) then
    return jsonb_build_object('ok',false,'code','OBJECT_ACCESS_DENIED');
  end if;
  if exists (select 1 from public.t2_qator where obyekt_id=p_obyekt_id) then
    return jsonb_build_object('ok',false,'code','SMETA_ALREADY_EXISTS');
  end if;
  if p_source_document_id is not null and not exists(
      select 1 from public.t2_document_registry d
      where d.id=p_source_document_id and d.kompaniya_id=p_kompaniya_id
        and (d.obyekt_id is null or d.obyekt_id=p_obyekt_id)) then
    return jsonb_build_object('ok',false,'code','SOURCE_DOCUMENT_SCOPE_MISMATCH');
  end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0
     or jsonb_array_length(p_qatorlar) > 60000 then
    return jsonb_build_object('ok',false,'code','BAD_PAYLOAD');
  end if;

  perform set_config('t2.manba', 'import', true);

  create temporary table t2_imp_qator(
    local_id text primary key, parent_local_id text, tur text, kod text, nom text,
    birlik text, hajm numeric, narx numeric, summa numeric, kat text, norma numeric,
    ordinal integer, new_id bigint, ota_id bigint, daraja integer
  ) on commit drop;

  insert into t2_imp_qator(local_id, parent_local_id, tur, kod, nom, birlik,
                           hajm, narx, summa, kat, norma, ordinal, new_id)
  select x->>'local_id', nullif(x->>'parent_local_id',''), x->>'tur',
         nullif(x->>'kod',''), nullif(x->>'nom',''), nullif(x->>'birlik',''),
         public.t2_son_tez(x->>'hajm'), public.t2_son_tez(x->>'narx'), public.t2_son_tez(x->>'summa'),
         case when (x->>'tur') in ('rs','mat','ob') then
           coalesce((select rk.kategoriya from public.t2_resurs_kategoriya rk
                      where rk.kompaniya_id = p_kompaniya_id
                        and rk.nom_key = public.t2_resurs_nom_kalit(x->>'nom')
                        and rk.birlik_key = public.t2_resurs_birlik_kalit(x->>'birlik')),
                    public.t2_kat_birlik(x->>'birlik', x->>'nom')) end,
         case when (x->>'tur') = 'rs' and public.t2_son_tez(x->>'norma') > 0
              then public.t2_son_tez(x->>'norma') end,
         (ordinality)::integer,
         nextval(pg_get_serial_sequence('public.t2_qator','id'))
  from jsonb_array_elements(p_qatorlar) with ordinality as t(x, ordinality);

  update t2_imp_qator m set ota_id = p.new_id
    from t2_imp_qator p where p.local_id = m.parent_local_id;

  with recursive d as (
    select local_id, 0 as lvl from t2_imp_qator where parent_local_id is null
    union all
    select r.local_id, d.lvl + 1 from t2_imp_qator r join d on r.parent_local_id = d.local_id
  )
  update t2_imp_qator m set daraja = d.lvl from d where d.local_id = m.local_id;

  insert into public.t2_qator(id, obyekt_id, kompaniya_id, tur, kod, nom, birlik,
    hajm, narx, summa, source_document_id, tartib, daraja, kat, ota_id, norma)
  overriding system value
  select new_id, p_obyekt_id, p_kompaniya_id, tur, kod, nom, birlik,
    hajm, narx, summa, p_source_document_id, ordinal, coalesce(daraja,0), kat, ota_id, norma
  from t2_imp_qator order by ordinal;

  select count(*) into v_soni from t2_imp_qator;

  if v_soni < 5000 then
    begin
      perform public.t2_rollup(p_obyekt_id);
    perform public.t2_signal_refresh_object(p_kompaniya_id, p_obyekt_id);
    exception when others then
      raise warning 't2_smeta_import_bulk_v1: signal refresh failed (non-fatal): %', sqlerrm;
    end;
  end if;

  perform public.t2_audit_yoz(p_kompaniya_id,'smeta_import_bulk','smeta',p_obyekt_id,
    format('qator_soni=%s; source_document_id=%s',v_soni,p_source_document_id),'actor:'||p_actor_id,null);

  v_prev := jsonb_build_object('ok',true,'obyekt_id',p_obyekt_id,'qator_soni',v_soni);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'smeta_import_bulk', v_prev);
  return v_prev;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_smeta_import_ruxsat(p_kompaniya_id bigint, p_actor_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin','superadmin','boss','director','pto') then
    raise exception 'WRITE_ROLE_REQUIRED' using errcode='42501';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_smeta_narxla_res_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_operation_id uuid, p_narxlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rol text;
  v_obyekt_kompaniya bigint;
  v_old jsonb;
  v_kiritilgan integer := 0;
  v_yaroqli integer := 0;
  v_ziddiyatli integer := 0;
  v_narxsiz integer := 0;
  v_mos integer := 0;
  v_yozildi integer := 0;
  v_natija jsonb;
begin
  if p_kompaniya_id is null or p_kompaniya_id <= 0
     or p_actor_id is null or p_actor_id <= 0
     or p_obyekt_id is null or p_obyekt_id <= 0
     or p_operation_id is null then
    raise exception 'kompaniya, actor, obyekt va operation_id majburiy' using errcode = '22023';
  end if;
  if jsonb_typeof(p_narxlar) <> 'array' then
    raise exception 'p_narxlar JSON array bo''lishi shart' using errcode = '22023';
  end if;
  if jsonb_array_length(p_narxlar) = 0 or jsonb_array_length(p_narxlar) > 10000 then
    raise exception 'p_narxlar 1..10000 qator bo''lishi shart' using errcode = '22023';
  end if;

  select o.kompaniya_id into v_obyekt_kompaniya
    from public.t2_obyekt o
   where o.id = p_obyekt_id and o.holat <> 'bekor';
  if not found or v_obyekt_kompaniya <> p_kompaniya_id then
    raise exception 'obyekt boshqa tenantga tegishli yoki faol emas' using errcode = '42501';
  end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then
    raise exception 'bu rol RES narxlashga ruxsatli emas' using errcode = '42501';
  end if;

  select natija into v_old
    from public.t2_onboarding_command_log
   where operation_id = p_operation_id;
  if found then
    return v_old || jsonb_build_object('takror', true);
  end if;

  perform set_config('t2.manba', 'narxlash', true);
  perform set_config('t2.kim', 'actor:' || p_actor_id::text, true);

  with source_raw as (
    select
      nullif(regexp_replace(upper(coalesce(x.kod, '')), '[[:space:][:punct:]]', '', 'g'), '') as kod_key,
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(kod text, nom text, birlik text, narx numeric)
  ), source_valid as (
    select * from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx > 0
  ), source_grouped as (
    select kod_key, nom_key, birlik_key, min(narx) as narx, count(distinct narx) as narx_soni
      from source_valid
     group by kod_key, nom_key, birlik_key
  )
  select (select count(*) from source_raw),
         (select count(*) from source_grouped where narx_soni = 1),
         (select count(*) from source_grouped where narx_soni <> 1)
    into v_kiritilgan, v_yaroqli, v_ziddiyatli;

  with source_raw as (
    select
      nullif(regexp_replace(upper(coalesce(x.kod, '')), '[[:space:][:punct:]]', '', 'g'), '') as kod_key,
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(kod text, nom text, birlik text, narx numeric)
  ), source_grouped as (
    select kod_key, nom_key, birlik_key, min(narx) as narx
      from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx > 0
     group by kod_key, nom_key, birlik_key
    having count(distinct narx) = 1
  ), target as (
    select q.id, q.hajm
      from public.t2_qator q
     where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
       and q.tur in ('rs', 'mat', 'ob') and (q.narx is null or q.narx = 0)
  ), candidate as (
    select t.id, s.narx
      from target t
      join public.t2_qator q on q.id = t.id
      join source_grouped s
        on public.t2_resurs_nom_kalit(q.nom) = s.nom_key
       and public.t2_resurs_birlik_kalit(q.birlik) = s.birlik_key
       and (s.kod_key is null or s.kod_key = regexp_replace(upper(coalesce(q.kod, '')), '[[:space:][:punct:]]', '', 'g'))
  ), target_unique as (
    select id, min(narx) as narx
      from candidate
     group by id
    having count(distinct narx) = 1
  )
  select (select count(*) from target), (select count(*) from target_unique)
    into v_narxsiz, v_mos;

  with source_raw as (
    select
      nullif(regexp_replace(upper(coalesce(x.kod, '')), '[[:space:][:punct:]]', '', 'g'), '') as kod_key,
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(kod text, nom text, birlik text, narx numeric)
  ), source_grouped as (
    select kod_key, nom_key, birlik_key, min(narx) as narx
      from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx > 0
     group by kod_key, nom_key, birlik_key
    having count(distinct narx) = 1
  ), candidate as (
    select q.id, s.narx
      from public.t2_qator q
      join source_grouped s
        on public.t2_resurs_nom_kalit(q.nom) = s.nom_key
       and public.t2_resurs_birlik_kalit(q.birlik) = s.birlik_key
       and (s.kod_key is null or s.kod_key = regexp_replace(upper(coalesce(q.kod, '')), '[[:space:][:punct:]]', '', 'g'))
     where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
       and q.tur in ('rs', 'mat', 'ob') and (q.narx is null or q.narx = 0)
  ), target_unique as (
    select id, min(narx) as narx
      from candidate
     group by id
    having count(distinct narx) = 1
  ), updated as (
    update public.t2_qator q
       set narx = u.narx,
           summa = case when q.hajm is null then null else q.hajm * u.narx end,
           narx_usul = 'RES'
      from target_unique u
     where q.id = u.id and (q.narx is null or q.narx = 0)
    returning q.id
  )
  select count(*) into v_yozildi from updated;

  perform public.t2_rollup(p_obyekt_id);
  if v_narxsiz < 5000 then
    perform public.t2_signal_refresh_object(p_kompaniya_id, p_obyekt_id);
  end if;

  v_natija := jsonb_build_object(
    'ok', true, 'takror', false, 'obyekt_id', p_obyekt_id,
    'kiritilgan', v_kiritilgan, 'yaroqli_manba', v_yaroqli,
    'ziddiyatli_manba', v_ziddiyatli, 'narxsiz', v_narxsiz,
    'mos', v_mos, 'yozildi', v_yozildi, 'narxsiz_qoldi', greatest(v_narxsiz - v_yozildi, 0)
  );

  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
  values (p_operation_id, p_actor_id, 't2_smeta_narxla_res_v1', v_natija);
  perform public.t2_audit_yoz(p_kompaniya_id, 'smeta_narxla_res', 'smeta', p_obyekt_id,
    format('RES qator=%s; mos=%s; yozildi=%s', v_kiritilgan, v_mos, v_yozildi),
    'actor:' || p_actor_id::text, null);
  return v_natija;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.t2_smeta_narxla_res_v2(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_operation_id uuid, p_narxlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rol text;
  v_obyekt_kompaniya bigint;
  v_old jsonb;
  v_old_actor bigint;
  v_old_command text;
  v_kiritilgan integer := 0;
  v_yaroqli integer := 0;
  v_ziddiyatli integer := 0;
  v_narxsiz integer := 0;
  v_mos integer := 0;
  v_yozildi integer := 0;
  v_natija jsonb;
begin
  if p_kompaniya_id is null or p_kompaniya_id <= 0
     or p_actor_id is null or p_actor_id <= 0
     or p_obyekt_id is null or p_obyekt_id <= 0
     or p_operation_id is null then
    raise exception 'kompaniya, actor, obyekt va operation_id majburiy' using errcode = '22023';
  end if;
  if p_narxlar is null or jsonb_typeof(p_narxlar) <> 'array' then
    raise exception 'p_narxlar JSON array bo''lishi shart' using errcode = '22023';
  end if;
  if jsonb_array_length(p_narxlar) = 0 or jsonb_array_length(p_narxlar) > 10000 then
    raise exception 'p_narxlar 1..10000 qator bo''lishi shart' using errcode = '22023';
  end if;

  select o.kompaniya_id into v_obyekt_kompaniya
    from public.t2_obyekt o
   where o.id = p_obyekt_id and o.holat <> 'bekor';
  if not found or v_obyekt_kompaniya <> p_kompaniya_id then
    raise exception 'obyekt boshqa tenantga tegishli yoki faol emas' using errcode = '42501';
  end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then
    raise exception 'bu rol RES narxlashga ruxsatli emas' using errcode = '42501';
  end if;

  -- Idempotent javob faqat actor + tenant tekshirilgandan keyin qaytariladi.
  --
  -- ⚠️ 2026-09-08 (Claude, ko'rib chiqishda topildi): bu yerda avval
  -- `return v_old;` turardi — ya'ni takroriy chaqiruvda ham saqlangan
  -- javobdagi `takror: false` qaytardi. Yozuv takrorlanmasdi (bu to'g'ri
  -- ishlagan), lekin CHAQIRUVCHI buni yangi narxlash deb o'qirdi va
  -- ekranda "N qator narxlandi" ni QAYTA ko'rsatardi. Shu sabab bu
  -- fayl bilan birga kelgan acceptance testining o'zi ham yiqilardi
  -- (u aynan `takror = true` ni talab qiladi). Endi bayroq to'g'ri.
  perform pg_advisory_xact_lock(hashtextextended('t2_smeta_narxla_res_v2:' || p_operation_id::text, 0));
  select natija, actor_id, command into v_old, v_old_actor, v_old_command
    from public.t2_onboarding_command_log
   where operation_id = p_operation_id;
  if found then
    if v_old_actor is distinct from p_actor_id or v_old_command is distinct from 't2_smeta_narxla_res_v2'
       or (v_old->>'obyekt_id')::bigint is distinct from p_obyekt_id then
      raise exception 'operation_id boshqa actor, obyekt yoki amalga tegishli' using errcode = '42501';
    end if;
    return v_old || jsonb_build_object('takror', true);
  end if;

  perform set_config('t2.manba', 'narxlash', true);
  perform set_config('t2.kim', 'actor:' || p_actor_id::text, true);

  with source_raw as (
    select
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(nom text, birlik text, narx numeric)
  ), source_valid as (
    select * from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx >= 0 and narx not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ), source_grouped as (
    select nom_key, birlik_key, min(narx) as narx, count(distinct narx) as narx_soni
      from source_valid
     group by nom_key, birlik_key
  )
  select (select count(*) from source_raw),
         (select count(*) from source_grouped where narx_soni = 1),
         (select count(*) from source_grouped where narx_soni <> 1)
    into v_kiritilgan, v_yaroqli, v_ziddiyatli;

  with source_raw as (
    select
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(nom text, birlik text, narx numeric)
  ), source_grouped as (
    select nom_key, birlik_key, min(narx) as narx
      from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx >= 0 and narx not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     group by nom_key, birlik_key
    having count(distinct narx) = 1
  ), target as (
    select q.id, q.hajm
      from public.t2_qator q
     where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
       and q.tur in ('rs', 'mat', 'ob') and q.narx is null
  ), candidate as (
    select t.id, s.narx
      from target t
      join public.t2_qator q on q.id = t.id
      join source_grouped s
        on public.t2_resurs_nom_kalit(q.nom) = s.nom_key
       and public.t2_resurs_birlik_kalit(q.birlik) = s.birlik_key
  ), target_unique as (
    select id, min(narx) as narx
      from candidate
     group by id
    having count(distinct narx) = 1
  )
  select (select count(*) from target), (select count(*) from target_unique)
    into v_narxsiz, v_mos;

  with source_raw as (
    select
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(nom text, birlik text, narx numeric)
  ), source_grouped as (
    select nom_key, birlik_key, min(narx) as narx
      from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx >= 0 and narx not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     group by nom_key, birlik_key
    having count(distinct narx) = 1
  ), candidate as (
    select q.id, s.narx
      from public.t2_qator q
      join source_grouped s
        on public.t2_resurs_nom_kalit(q.nom) = s.nom_key
       and public.t2_resurs_birlik_kalit(q.birlik) = s.birlik_key
     where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
       and q.tur in ('rs', 'mat', 'ob') and q.narx is null
  ), target_unique as (
    select id, min(narx) as narx
      from candidate
     group by id
    having count(distinct narx) = 1
  ), updated as (
    update public.t2_qator q
       set narx = u.narx,
           summa = case when q.hajm is null then null else q.hajm * u.narx end,
           narx_usul = 'RES'
      from target_unique u
     where q.id = u.id and q.narx is null
    returning q.id
  )
  select count(*) into v_yozildi from updated;

  perform public.t2_rollup(p_obyekt_id);
  if v_narxsiz < 5000 then
    perform public.t2_signal_refresh_object(p_kompaniya_id, p_obyekt_id);
  end if;

  v_natija := jsonb_build_object(
    'ok', true, 'takror', false, 'obyekt_id', p_obyekt_id,
    'kiritilgan', v_kiritilgan, 'yaroqli_manba', v_yaroqli,
    'ziddiyatli_manba', v_ziddiyatli, 'narxsiz', v_narxsiz,
    'mos', v_mos, 'yozildi', v_yozildi, 'narxsiz_qoldi', greatest(v_narxsiz - v_yozildi, 0)
  );

  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
  values (p_operation_id, p_actor_id, 't2_smeta_narxla_res_v2', v_natija);
  perform public.t2_audit_yoz(p_kompaniya_id, 'smeta_narxla_res', 'smeta', p_obyekt_id,
    format('RES qator=%s; mos=%s; yozildi=%s', v_kiritilgan, v_mos, v_yozildi),
    'actor:' || p_actor_id::text, null);
  return v_natija;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.t2_smeta_studio_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_draft_uid uuid, p_expected_version integer, p_hujjat jsonb, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_prev record; v_rol text; v_row public.t2_smeta_studio_qoralama%rowtype; v_res jsonb;
  v_bolim int; v_ish int; v_nom text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select actor_id, command, natija into v_prev from public.t2_kompaniya_command_log where operation_id = p_operation_id;
  if found then
    if v_prev.actor_id is distinct from p_actor_id or v_prev.command <> 'smeta_studio_saqla_v1' then
      return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REUSED');
    end if;
    return v_prev.natija;
  end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol = 'rahbar' then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBJECT_NOT_IN_COMPANY');
  end if;
  if p_draft_uid is null or p_hujjat is null or jsonb_typeof(p_hujjat) <> 'object'
     or p_hujjat->>'schema' <> 'smeta-studio-v1' or p_hujjat->>'draftId' is distinct from p_draft_uid::text
     or jsonb_typeof(p_hujjat->'sections') <> 'object' or jsonb_typeof(p_hujjat->'occurrences') <> 'object'
     or jsonb_typeof(p_hujjat->'rootOrder') <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'DOCUMENT_INVALID');
  end if;
  select count(*) into v_bolim from jsonb_object_keys(p_hujjat->'sections');
  select count(*) into v_ish from jsonb_object_keys(p_hujjat->'occurrences');
  if v_bolim > 2000 or v_ish > 5000 then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_TOO_LARGE'); end if;
  v_nom := left(coalesce(nullif(btrim(p_hujjat->'context'->>'title'), ''), nullif(btrim(p_hujjat->'context'->>'objectLabel'), ''), ''), 300);
  select * into v_row from public.t2_smeta_studio_qoralama where kompaniya_id = p_kompaniya_id and draft_uid = p_draft_uid for update;
  if not found then
    if coalesce(p_expected_version, -1) <> 0 then return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'versiya', null); end if;
    insert into public.t2_smeta_studio_qoralama (kompaniya_id, obyekt_id, draft_uid, nom, katalog_revision, hujjat, bolim_soni, ish_soni, yaratdi_actor, yangiladi_actor)
    values (p_kompaniya_id, p_obyekt_id, p_draft_uid, v_nom, left(p_hujjat->'occurrences'->(select k from jsonb_object_keys(p_hujjat->'occurrences') k limit 1)->'source'->>'catalogRevision', 64),
            p_hujjat, v_bolim, v_ish, p_actor_id, p_actor_id)
    returning * into v_row;
  else
    if v_row.holat <> 'qoralama' then return jsonb_build_object('ok', false, 'code', 'DRAFT_ARCHIVED'); end if;
    if p_expected_version is distinct from v_row.versiya then
      return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'versiya', v_row.versiya);
    end if;
    update public.t2_smeta_studio_qoralama set obyekt_id = p_obyekt_id, nom = v_nom, hujjat = p_hujjat, bolim_soni = v_bolim, ish_soni = v_ish,
      versiya = versiya + 1, yangiladi_actor = p_actor_id, yangilandi = now()
    where id = v_row.id returning * into v_row;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'smeta_studio_saqla', 'smeta', p_obyekt_id,
    'qoralama ' || v_row.id || ' v' || v_row.versiya || ' (' || v_bolim || ' bo''lim, ' || v_ish || ' ish)', 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'id', v_row.id, 'draft_uid', v_row.draft_uid, 'versiya', v_row.versiya, 'yangilandi', v_row.yangilandi);
  insert into public.t2_kompaniya_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'smeta_studio_saqla_v1', v_res);
  return v_res;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_f2_import_job_yarat_v1(p_obyekt_id bigint, p_actor_id bigint, p_source_document_id bigint, p_operation_id uuid, p_total_rows integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_komp bigint; v_loyiha bigint; v_job_id bigint; v_bor bigint;
begin
  select kompaniya_id, loyiha_id into v_komp, v_loyiha from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok',false,'code','OBYEKT_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);

  if p_operation_id is null then
    return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED');
  end if;
  if p_total_rows is null or p_total_rows not between 1 and 100000 then
    return jsonb_build_object('ok',false,'code','TOTAL_ROWS_OUT_OF_RANGE');
  end if;
  if p_source_document_id is not null and not exists (
    select 1 from public.t2_document_registry d
    where d.id = p_source_document_id and d.kompaniya_id = v_komp
      and d.loyiha_id = v_loyiha and d.status = 'active'
      and (d.obyekt_id is null or d.obyekt_id = p_obyekt_id)
  ) then
    return jsonb_build_object('ok',false,'code','SOURCE_DOCUMENT_SCOPE_MISMATCH');
  end if;

  select id into v_bor from public.t2_f2_import_job
    where kompaniya_id = v_komp and operation_id = p_operation_id;
  if found then
    return jsonb_build_object('ok',true,'takror',true,'job_id',v_bor);
  end if;

  insert into public.t2_f2_import_job
    (kompaniya_id, loyiha_id, obyekt_id, source_document_id, operation_id, total_rows, actor_id)
  values (v_komp, v_loyiha, p_obyekt_id, p_source_document_id, p_operation_id, p_total_rows, p_actor_id)
  returning id into v_job_id;

  perform public.t2_audit_yoz(v_komp, 'f2_import_job_yarat', 'f2', p_obyekt_id,
    format('obyekt=%s total_rows=%s', p_obyekt_id, coalesce(p_total_rows::text,'?')),
    'actor:'||p_actor_id, null);

  return jsonb_build_object('ok',true,'takror',false,'job_id',v_job_id,'status','queued');
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_f2_import_job_ilgarilash_v1(p_job_id bigint, p_actor_id bigint, p_expected_versiya integer, p_processed_delta integer, p_matched_delta integer, p_unmatched_delta integer, p_cursor jsonb DEFAULT NULL::jsonb, p_status text DEFAULT NULL::text, p_last_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_komp bigint; v_obyekt bigint; v_new_versiya integer; v_status text;
begin
  select kompaniya_id, obyekt_id, status into v_komp, v_obyekt, v_status from public.t2_f2_import_job where id = p_job_id;
  if v_komp is null then return jsonb_build_object('ok',false,'code','JOB_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);

  if p_processed_delta is null or p_matched_delta is null or p_unmatched_delta is null
     or p_processed_delta < 0 or p_matched_delta < 0 or p_unmatched_delta < 0
     or p_matched_delta + p_unmatched_delta > p_processed_delta then
    return jsonb_build_object('ok',false,'code','BAD_PROGRESS_DELTA');
  end if;
  if v_status in ('completed','failed','cancelled') then
    return jsonb_build_object('ok',false,'code','TERMINAL_JOB');
  end if;

  if p_status is not null and p_status not in ('queued','running','paused','completed','failed','cancelled') then
    return jsonb_build_object('ok',false,'code','BAD_STATUS');
  end if;
  if p_status is not null and not (
    (v_status = 'queued' and p_status in ('running','failed','cancelled')) or
    (v_status = 'running' and p_status in ('running','paused','completed','failed','cancelled')) or
    (v_status = 'paused' and p_status in ('running','failed','cancelled'))
  ) then
    return jsonb_build_object('ok',false,'code','BAD_STATUS_TRANSITION');
  end if;

  update public.t2_f2_import_job set
    processed_rows = processed_rows + coalesce(p_processed_delta,0),
    matched_rows   = matched_rows   + coalesce(p_matched_delta,0),
    unmatched_rows = unmatched_rows + coalesce(p_unmatched_delta,0),
    cursor         = coalesce(p_cursor, cursor),
    status         = coalesce(p_status, status),
    last_error     = p_last_error,
    completed_at   = case when p_status in ('completed','failed','cancelled') then now() else completed_at end,
    versiya        = versiya + 1,
    updated_at     = now()
  where id = p_job_id and versiya = p_expected_versiya
    and (p_status is distinct from 'completed' or processed_rows + p_processed_delta = total_rows)
  returning versiya into v_new_versiya;

  if v_new_versiya is null then
    return jsonb_build_object('ok',false,'code', case when p_status = 'completed' then 'INCOMPLETE_JOB' else 'STALE_VERSION' end);
  end if;
  if p_status in ('running','paused','completed','failed','cancelled') then
    perform public.t2_audit_yoz(v_komp, 'f2_import_job_holat', 'f2', v_obyekt,
      format('status=%s processed_delta=%s', p_status, p_processed_delta),
      'actor:'||p_actor_id, null);
  end if;
  return jsonb_build_object('ok',true,'job_id',p_job_id,'versiya',v_new_versiya);
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_f2_import_job_recover_v1(p_job_id bigint, p_actor_id bigint, p_expected_versiya integer, p_operation_id uuid, p_stale_after_seconds integer DEFAULT 900)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_job public.t2_f2_import_job;
  v_recovery public.t2_f2_import_job_recovery;
  v_stale boolean;
  v_new_version integer;
  v_reason text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_expected_versiya is null then return jsonb_build_object('ok', false, 'code', 'EXPECTED_VERSION_REQUIRED'); end if;
  if p_stale_after_seconds is null or p_stale_after_seconds not between 60 and 86400 then
    return jsonb_build_object('ok', false, 'code', 'STALE_WINDOW_OUT_OF_RANGE');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  select * into v_recovery from public.t2_f2_import_job_recovery where operation_id = p_operation_id;
  if found then
    perform public.t2_actor_kompaniya_azo_tekshir(v_recovery.kompaniya_id, p_actor_id);
    if v_recovery.job_id <> p_job_id then
      return jsonb_build_object('ok', false, 'code', 'OPERATION_REPLAY_CONFLICT');
    end if;
    return jsonb_build_object('ok', true, 'retry', true, 'job_id', v_recovery.job_id,
      'status', v_recovery.to_status, 'recovery_id', v_recovery.id);
  end if;

  select * into v_job from public.t2_f2_import_job where id = p_job_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'JOB_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_job.kompaniya_id, p_actor_id);

  if v_job.versiya <> p_expected_versiya then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_job.versiya);
  end if;
  if v_job.status in ('completed','failed','cancelled') then
    return jsonb_build_object('ok', false, 'code', 'TERMINAL_JOB', 'status', v_job.status);
  end if;
  if v_job.status not in ('running','review') then
    return jsonb_build_object('ok', false, 'code', 'JOB_NOT_RECOVERABLE', 'status', v_job.status);
  end if;

  -- `review` is explicitly held for human review; it is recoverable even if
  -- recently updated. `running` requires a stale timestamp or expired lease.
  v_stale := v_job.status = 'review'
    or v_job.updated_at < now() - make_interval(secs => p_stale_after_seconds)
    or (v_job.lease_expires_at is not null and v_job.lease_expires_at <= now());
  if not v_stale then
    return jsonb_build_object('ok', false, 'code', 'JOB_NOT_STALE', 'status', v_job.status,
      'updated_at', v_job.updated_at, 'lease_expires_at', v_job.lease_expires_at);
  end if;

  v_reason := case when v_job.status = 'review'
    then 'review_job_recovery_required'
    else 'worker_lease_expired_recovery_required' end;
  update public.t2_f2_import_job
  set status = 'paused',
      last_error = v_reason,
      recovery_required = true,
      recovery_count = recovery_count + 1,
      lease_token = null,
      lease_expires_at = null,
      last_heartbeat_at = now(),
      versiya = versiya + 1,
      updated_at = now()
  where id = p_job_id and versiya = p_expected_versiya
  returning versiya into v_new_version;
  if not found then return jsonb_build_object('ok', false, 'code', 'STALE_VERSION'); end if;

  insert into public.t2_f2_import_job_recovery
    (kompaniya_id, job_id, from_status, to_status, operation_id, actor_id, reason, cursor_snapshot)
  values
    (v_job.kompaniya_id, p_job_id, v_job.status, 'paused', p_operation_id, p_actor_id, v_reason, v_job.cursor)
  returning * into v_recovery;

  perform public.t2_audit_yoz(v_job.kompaniya_id, 'f2_import_job_recovered', 'f2', v_job.obyekt_id,
    format('job_id=%s; from=%s; to=paused; versiya=%s; operation_id=%s', p_job_id, v_job.status, v_new_version, p_operation_id),
    'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'job_id', p_job_id, 'from_status', v_job.status,
    'status', 'paused', 'recovery_required', true, 'versiya', v_new_version,
    'recovery_id', v_recovery.id, 'completed_at', null);
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_f2_import_job_cancel_v1(p_job_id bigint, p_actor_id bigint, p_expected_versiya integer, p_operation_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_job public.t2_f2_import_job;
  v_event public.t2_f2_import_job_cancel_event;
  v_reason text := nullif(btrim(p_reason), '');
  v_new_version integer;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_expected_versiya is null then return jsonb_build_object('ok', false, 'code', 'EXPECTED_VERSION_REQUIRED'); end if;
  if v_reason is null then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  if length(v_reason) > 2000 then return jsonb_build_object('ok', false, 'code', 'REASON_TOO_LONG'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select * into v_event from public.t2_f2_import_job_cancel_event where operation_id = p_operation_id;
  if found then
    perform public.t2_actor_kompaniya_azo_tekshir(v_event.kompaniya_id, p_actor_id);
    if v_event.job_id <> p_job_id then
      return jsonb_build_object('ok', false, 'code', 'OPERATION_REPLAY_CONFLICT');
    end if;
    return jsonb_build_object('ok', true, 'retry', v_event.to_status = 'cancelled', 'job_id', v_event.job_id, 'status', v_event.to_status);
  end if;
  select * into v_job from public.t2_f2_import_job where id = p_job_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'JOB_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_job.kompaniya_id, p_actor_id);
  if v_job.versiya <> p_expected_versiya then return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_job.versiya); end if;
  if v_job.status in ('completed','failed','cancelled') then
    insert into public.t2_f2_import_job_cancel_event
      (kompaniya_id, job_id, from_status, to_status, operation_id, actor_id, reason)
    values (v_job.kompaniya_id, p_job_id, v_job.status, v_job.status, p_operation_id, p_actor_id, v_reason);
    return jsonb_build_object('ok', v_job.status = 'cancelled', 'retry', v_job.status = 'cancelled', 'job_id', p_job_id, 'status', v_job.status, 'versiya', v_job.versiya);
  end if;

  update public.t2_f2_import_job
  set status = 'cancelled', last_error = v_reason, recovery_required = false,
      lease_token = null, lease_expires_at = null, completed_at = now(),
      versiya = versiya + 1, updated_at = now()
  where id = p_job_id and versiya = p_expected_versiya
  returning versiya into v_new_version;
  if not found then return jsonb_build_object('ok', false, 'code', 'STALE_VERSION'); end if;
  insert into public.t2_f2_import_job_cancel_event
    (kompaniya_id, job_id, from_status, to_status, operation_id, actor_id, reason)
  values (v_job.kompaniya_id, p_job_id, v_job.status, 'cancelled', p_operation_id, p_actor_id, v_reason);
  perform public.t2_audit_yoz(v_job.kompaniya_id, 'f2_import_job_cancelled', 'f2', v_job.obyekt_id,
    format('job_id=%s; reason=%s; operation_id=%s', p_job_id, v_reason, p_operation_id),
    'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'job_id', p_job_id, 'status', 'cancelled', 'versiya', v_new_version, 'completed_at', now());
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_f2_import_draft_saqla_v1(p_job_id bigint, p_actor_id bigint, p_qatorlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_komp bigint; v_obyekt bigint; v_soni integer;
begin
  select kompaniya_id, obyekt_id into v_komp, v_obyekt from public.t2_f2_import_job where id = p_job_id;
  if v_komp is null then return jsonb_build_object('ok',false,'code','JOB_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);

  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array'
     or jsonb_array_length(p_qatorlar) = 0 or jsonb_array_length(p_qatorlar) > 5000 then
    return jsonb_build_object('ok',false,'code','BAD_PAYLOAD');
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_qatorlar) x
    where jsonb_typeof(x) <> 'object'
      or nullif(btrim(x->>'uid'),'') is null
      or x->>'holat' not in ('avto_moslashti','qolda_moslashtirildi','otkazib_yuborildi','hal_qilinmagan')
      or (x ? 'expected_versiya' and (jsonb_typeof(x->'expected_versiya') <> 'number'
          or (x->>'expected_versiya') !~ '^[0-9]+$'))
  ) or exists (
    select 1 from jsonb_array_elements(p_qatorlar) x
    group by x->>'uid' having count(*) > 1
  ) then
    return jsonb_build_object('ok',false,'code','BAD_DRAFT_PAYLOAD');
  end if;

  perform pg_advisory_xact_lock(p_job_id);
  perform 1 from public.t2_f2_import_draft_qator d
    join jsonb_array_elements(p_qatorlar) x on x->>'uid' = d.uid
    where d.job_id = p_job_id
    for update;

  if exists (
    select 1 from public.t2_f2_import_draft_qator d
    join jsonb_array_elements(p_qatorlar) x on x->>'uid' = d.uid
    where d.job_id = p_job_id
      and ((x->>'expected_versiya') is null or (x->>'expected_versiya')::integer <> d.versiya)
  ) then
    return jsonb_build_object('ok',false,'code','STALE_DRAFT_VERSION');
  end if;

  with kir as (
    select
      (x->>'uid') as uid, (x->>'holat') as holat,
      nullif(x->>'expected_versiya','')::integer as expected_versiya,
      nullif(x->>'lrv_varaq','') as lrv_varaq, nullif(x->>'lrv_row','')::integer as lrv_row,
      nullif(x->>'kod','') as kod, nullif(x->>'hajm','')::numeric as hajm,
      nullif(x->>'narx','')::numeric as narx, nullif(x->>'summa','')::numeric as summa,
      nullif(x->>'sabab','') as sabab, nullif(x->>'tur','') as tur
    from jsonb_array_elements(p_qatorlar) x
  )
  insert into public.t2_f2_import_draft_qator
    (job_id, uid, holat, lrv_varaq, lrv_row, kod, hajm, narx, summa, sabab, tur, actor_id)
  select p_job_id, k.uid, k.holat, k.lrv_varaq, k.lrv_row, k.kod, k.hajm, k.narx, k.summa, k.sabab, k.tur, p_actor_id
  from kir k
  where k.uid is not null and k.holat is not null
  on conflict (job_id, uid) do update set
    holat = excluded.holat, lrv_varaq = excluded.lrv_varaq, lrv_row = excluded.lrv_row,
    kod = excluded.kod, hajm = excluded.hajm, narx = excluded.narx, summa = excluded.summa,
    sabab = excluded.sabab, tur = excluded.tur, actor_id = excluded.actor_id,
    versiya = public.t2_f2_import_draft_qator.versiya + 1, yangilandi = now();
  get diagnostics v_soni = row_count;

  perform public.t2_audit_yoz(v_komp, 'f2_import_draft_saqla', 'f2', v_obyekt,
    format('draft_rows=%s', v_soni), 'actor:'||p_actor_id, null);

  return jsonb_build_object('ok',true,'job_id',p_job_id,'saqlandi',v_soni);
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_akt_correction_create_v1(p_kompaniya_id bigint, p_actor_id bigint, p_source_akt_id bigint, p_operation_id uuid, p_expected_source_version integer, p_revision_id bigint DEFAULT NULL::bigint, p_reason text DEFAULT NULL::text, p_raqam text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source public.t2_akt;
  v_replacement public.t2_akt;
  v_link public.t2_akt_correction_link;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_expected_source_version is null then return jsonb_build_object('ok', false, 'code', 'EXPECTED_VERSION_REQUIRED'); end if;
  if v_reason is not null and length(v_reason) > 2000 then return jsonb_build_object('ok', false, 'code', 'REASON_TOO_LONG'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);

  select * into v_link from public.t2_akt_correction_link where operation_id = p_operation_id;
  if found then
    if v_link.kompaniya_id <> p_kompaniya_id or v_link.original_akt_id <> p_source_akt_id then
      return jsonb_build_object('ok', false, 'code', 'OPERATION_REPLAY_CONFLICT');
    end if;
    return jsonb_build_object('ok', true, 'retry', true, 'original_akt_id', v_link.original_akt_id,
      'replacement_akt_id', v_link.replacement_akt_id, 'status', 'draft');
  end if;

  select * into v_source
  from public.t2_akt
  where id = p_source_akt_id and kompaniya_id = p_kompaniya_id
  for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'AKT_NOT_FOUND'); end if;
  if v_source.lifecycle_status <> 'approved' then
    return jsonb_build_object('ok', false, 'code', 'CORRECTION_REQUIRES_APPROVED', 'status', v_source.lifecycle_status);
  end if;
  if v_source.versiya <> p_expected_source_version then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'version', v_source.versiya);
  end if;
  if p_revision_id is not null and not exists (
    select 1 from public.t2_smeta_revision r
    where r.id = p_revision_id and r.kompaniya_id = p_kompaniya_id and r.obyekt_id = v_source.obyekt_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'REVISION_TENANT_MISMATCH');
  end if;

  -- Deliberately copy the header only. Child financial rows are not copied or
  -- recalculated behind the user's back; the new draft must be imported and
  -- reviewed as a new revision.
  insert into public.t2_akt
    (obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, fayl_id, izoh,
     versiya, operation_id, manba, kim, shartnoma_id, sana, forma3_id, davr_muhr,
     revision_id, lifecycle_status, lifecycle_updated_at, lifecycle_updated_by,
     lifecycle_reason, correction_of_akt_id)
  values
    (v_source.obyekt_id, v_source.kompaniya_id, v_source.tur,
     coalesce(nullif(btrim(p_raqam), ''), coalesce(nullif(btrim(v_source.raqam), ''), 'F2') || ' — корректировка ' || (select count(*) + 1 from public.t2_akt_correction_link where original_akt_id=v_source.id)::text), v_source.oy, v_source.hujjat_jami, 'qoralama',
     v_source.fayl_id, v_reason, 1, p_operation_id, 'correction',
     'actor:' || p_actor_id, v_source.shartnoma_id, v_source.sana, v_source.forma3_id,
     v_source.davr_muhr, coalesce(p_revision_id, v_source.revision_id), 'draft', now(),
     p_actor_id, v_reason, v_source.id)
  returning * into v_replacement;

  insert into public.t2_akt_correction_link
    (kompaniya_id, original_akt_id, replacement_akt_id, reason, actor_id, operation_id)
  values
    (p_kompaniya_id, v_source.id, v_replacement.id, v_reason, p_actor_id, p_operation_id)
  returning * into v_link;

  insert into public.t2_akt_holat_tarix
    (kompaniya_id, akt_id, from_status, to_status, reason, actor_id, operation_id)
  values
    (p_kompaniya_id, v_replacement.id, null, 'draft', v_reason, p_actor_id, p_operation_id);

  perform public.t2_audit_yoz(p_kompaniya_id, 'akt_correction_created', 'f2', v_source.obyekt_id,
    format('original_akt_id=%s; replacement_akt_id=%s; actor_id=%s; operation_id=%s', v_source.id, v_replacement.id, p_actor_id, p_operation_id),
    'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'original_akt_id', v_source.id,
    'replacement_akt_id', v_replacement.id, 'status', v_replacement.lifecycle_status,
    'version', v_replacement.versiya, 'link_id', v_link.id);
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_akt_lifecycle_transition_v1(p_kompaniya_id bigint, p_akt_id bigint, p_to_status text, p_actor_id bigint, p_expected_version integer, p_operation_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_akt public.t2_akt;
  v_history public.t2_akt_holat_tarix;
  v_new_version integer;
  v_reason text := nullif(btrim(p_reason), '');
  v_allowed boolean := false;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_expected_version is null then return jsonb_build_object('ok', false, 'code', 'EXPECTED_VERSION_REQUIRED'); end if;
  if p_to_status is null or p_to_status not in ('draft','submitted','checked','approved','rejected','cancelled','superseded') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LIFECYCLE_STATUS');
  end if;
  if p_to_status in ('rejected','cancelled') and v_reason is null then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;
  if v_reason is not null and length(v_reason) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'REASON_TOO_LONG');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);

  if exists (
    select 1 from public.t2_akt_holat_tarix h
    where h.operation_id = p_operation_id and h.akt_id <> p_akt_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'OPERATION_REPLAY_CONFLICT');
  end if;

  select * into v_akt
  from public.t2_akt
  where id = p_akt_id and kompaniya_id = p_kompaniya_id
  for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'AKT_NOT_FOUND'); end if;

  select * into v_history
  from public.t2_akt_holat_tarix h
  where h.akt_id = p_akt_id and h.operation_id = p_operation_id
  order by h.id desc limit 1;
  if found then
    if v_history.to_status <> p_to_status then
      return jsonb_build_object('ok', false, 'code', 'OPERATION_REPLAY_CONFLICT');
    end if;
    return jsonb_build_object('ok', true, 'retry', true, 'akt_id', p_akt_id,
      'from_status', v_history.from_status, 'status', v_history.to_status,
      'version', v_akt.versiya, 'history_id', v_history.id);
  end if;

  if v_akt.versiya <> p_expected_version then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'version', v_akt.versiya);
  end if;

  v_allowed := (v_akt.lifecycle_status, p_to_status) in (
    ('draft','submitted'), ('draft','cancelled'),
    ('submitted','checked'), ('submitted','cancelled'),
    ('checked','approved'), ('checked','rejected'), ('checked','cancelled'),
    ('rejected','submitted'), ('rejected','cancelled'),
    ('cancelled','cancelled'), ('superseded','superseded'), ('approved','approved')
  );
  if not v_allowed then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LIFECYCLE_TRANSITION',
      'from_status', v_akt.lifecycle_status, 'to_status', p_to_status);
  end if;

  -- Same-state approved retry is an audit-safe idempotent acknowledgement;
  -- no UPDATE is issued, so approved immutability is preserved.
  if v_akt.lifecycle_status = p_to_status then
    insert into public.t2_akt_holat_tarix
      (kompaniya_id, akt_id, from_status, to_status, reason, actor_id, operation_id)
    values
      (p_kompaniya_id, p_akt_id, v_akt.lifecycle_status, p_to_status,
       v_reason, p_actor_id, p_operation_id)
    returning * into v_history;
    perform public.t2_audit_yoz(p_kompaniya_id, 'akt_lifecycle_retry', 'f2', v_akt.obyekt_id,
      format('akt_id=%s; from=%s; to=%s; actor_id=%s; operation_id=%s', p_akt_id, v_akt.lifecycle_status, p_to_status, p_actor_id, p_operation_id),
      'actor:' || p_actor_id, null);
    return jsonb_build_object('ok', true, 'retry', true, 'akt_id', p_akt_id,
      'from_status', v_akt.lifecycle_status, 'status', p_to_status,
      'version', v_akt.versiya, 'history_id', v_history.id);
  end if;

  perform set_config('t2.akt.lifecycle_transition', '1', true);
  perform set_config('t2.akt.actor_id', p_actor_id::text, true);
  perform set_config('t2.akt.operation_id', p_operation_id::text, true);
  perform set_config('t2.akt.reason', coalesce(v_reason, ''), true);

  update public.t2_akt
  set lifecycle_status = p_to_status,
      lifecycle_updated_at = now(),
      lifecycle_updated_by = p_actor_id,
      lifecycle_reason = v_reason,
      lifecycle_submitted_at = case when p_to_status = 'submitted' then coalesce(lifecycle_submitted_at, now()) else lifecycle_submitted_at end,
      lifecycle_checked_at = case when p_to_status = 'checked' then coalesce(lifecycle_checked_at, now()) else lifecycle_checked_at end,
      lifecycle_approved_at = case when p_to_status = 'approved' then coalesce(lifecycle_approved_at, now()) else lifecycle_approved_at end,
      lifecycle_rejected_at = case when p_to_status = 'rejected' then coalesce(lifecycle_rejected_at, now()) else lifecycle_rejected_at end,
      lifecycle_cancelled_at = case when p_to_status = 'cancelled' then coalesce(lifecycle_cancelled_at, now()) else lifecycle_cancelled_at end,
      lifecycle_superseded_at = case when p_to_status = 'superseded' then coalesce(lifecycle_superseded_at, now()) else lifecycle_superseded_at end,
      versiya = versiya + 1,
      yangilandi = now()
  where id = p_akt_id and kompaniya_id = p_kompaniya_id and versiya = p_expected_version
  returning versiya into v_new_version;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION');
  end if;

  select * into v_history
  from public.t2_akt_holat_tarix h
  where h.akt_id = p_akt_id and h.operation_id = p_operation_id
  order by h.id desc limit 1;
  perform public.t2_audit_yoz(p_kompaniya_id, 'akt_lifecycle_transition', 'f2', v_akt.obyekt_id,
    format('akt_id=%s; from=%s; to=%s; actor_id=%s; operation_id=%s', p_akt_id, v_akt.lifecycle_status, p_to_status, p_actor_id, p_operation_id),
    'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'akt_id', p_akt_id,
    'from_status', v_akt.lifecycle_status, 'status', p_to_status,
    'version', v_new_version, 'history_id', v_history.id);
end $function$
;
CREATE OR REPLACE FUNCTION public.t2_azolik_ruxsat_qoshimcha_ber_v1(p_actor_id bigint, p_kompaniya_id bigint, p_azolik_id bigint, p_ruxsat text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rol text; v_prev jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin','superadmin','boss') then
    return jsonb_build_object('ok',false,'code','MANAGE_ROLE_REQUIRED');
  end if;
  if p_ruxsat is null or p_ruxsat like 'control.global%' or p_ruxsat not in (
    'company.read','company.profile.update','company.member.manage',
    'control.company.read','control.company.write',
    'project.read','project.write','object.read','object.write',
    'document.read','document.write','financial.read','financial.write'
  ) then
    return jsonb_build_object('ok',false,'code','RUXSAT_NOTOGRI');
  end if;
  if not exists (select 1 from public.t2_azolik where id = p_azolik_id and kompaniya_id = p_kompaniya_id and holat = 'faol') then
    return jsonb_build_object('ok',false,'code','AZOLIK_TOPILMADI');
  end if;

  insert into public.t2_azolik_ruxsat_qoshimcha (azolik_id, ruxsat, berdi_actor_id)
    values (p_azolik_id, p_ruxsat, p_actor_id)
    on conflict (azolik_id, ruxsat) do nothing;

  perform public.t2_audit_yoz(p_kompaniya_id,'azolik_ruxsat_ber','azolik',null,
    format('azolik_id=%s; ruxsat=%s; actor_id=%s',p_azolik_id,p_ruxsat,p_actor_id),'actor:'||p_actor_id,null);

  v_prev := jsonb_build_object('ok',true,'azolik_id',p_azolik_id,'ruxsat',p_ruxsat);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'azolik_ruxsat_ber', v_prev);
  return v_prev;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_azolik_ruxsat_qoshimcha_olib_tashla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_azolik_id bigint, p_ruxsat text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rol text; v_prev jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin','superadmin','boss') then
    return jsonb_build_object('ok',false,'code','MANAGE_ROLE_REQUIRED');
  end if;
  if not exists (select 1 from public.t2_azolik where id = p_azolik_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok',false,'code','AZOLIK_TOPILMADI');
  end if;

  delete from public.t2_azolik_ruxsat_qoshimcha where azolik_id = p_azolik_id and ruxsat = p_ruxsat;

  perform public.t2_audit_yoz(p_kompaniya_id,'azolik_ruxsat_olib_tashla','azolik',null,
    format('azolik_id=%s; ruxsat=%s; actor_id=%s',p_azolik_id,p_ruxsat,p_actor_id),'actor:'||p_actor_id,null);

  v_prev := jsonb_build_object('ok',true,'azolik_id',p_azolik_id,'ruxsat',p_ruxsat);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'azolik_ruxsat_olib_tashla', v_prev);
  return v_prev;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_azolik_ruxsat_qoshimcha_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin','superadmin','boss') then
    return jsonb_build_object('ok',false,'code','MANAGE_ROLE_REQUIRED');
  end if;
  return jsonb_build_object('ok',true,'azolar',coalesce((
    select jsonb_agg(jsonb_build_object(
      'azolik_id', a.id, 'foydalanuvchi_id', a.foydalanuvchi_id,
      'login', u.login, 'ism', u.ism, 'rol', a.rol,
      'qoshimcha_ruxsatlar', coalesce((
        select jsonb_agg(q.ruxsat order by q.ruxsat)
        from public.t2_azolik_ruxsat_qoshimcha q where q.azolik_id = a.id
      ), '[]'::jsonb)
    ) order by u.login)
    from public.t2_azolik a
    join public.t2_foydalanuvchi u on u.id = a.foydalanuvchi_id
    where a.kompaniya_id = p_kompaniya_id and a.holat = 'faol'
  ), '[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_effective_authorization_v1(p_actor_id bigint, p_kompaniya_id bigint DEFAULT NULL::bigint, p_loyiha_id bigint DEFAULT NULL::bigint, p_obyekt_id bigint DEFAULT NULL::bigint, p_permission text DEFAULT 'company.read'::text, p_capability_kod text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_platform text := 'none'; v_membership text := null; v_azolik_id bigint := null;
  v_permissions text[] := array[]::text[];
  v_project_ok boolean := true; v_object_ok boolean := true;
  v_project_scope text := 'none'; v_object_scope text := 'none';
  v_cap jsonb := '{}'::jsonb; v_needed integer := 0;
  v_allowed boolean := false; v_reason text := 'ALLOW';
begin
  -- p_actor_id client bodydan emas, verified sessiondan Cloudflare BFF kiritadi.
  if p_actor_id is null or p_actor_id <= 0 or not exists (
    select 1 from public.t2_foydalanuvchi u where u.id = p_actor_id and u.holat = 'faol'
  ) then
    return jsonb_build_object('ok', true, 'allowed', false, 'reason', 'AUTH_REQUIRED');
  end if;
  if p_permission not in (
    'company.read','company.profile.update','company.member.manage',
    'control.company.read','control.company.write','control.global.read','control.global.write',
    'project.read','project.write','object.read','object.write',
    'document.read','document.write','financial.read','financial.write'
  ) then
    return jsonb_build_object('ok', true, 'allowed', false, 'reason', 'UNKNOWN_PERMISSION');
  end if;

  -- Platform signal barcha active membershiplardan, target company roli esa alohida olinadi.
  select a.rol into v_platform from public.t2_azolik a
  where a.foydalanuvchi_id = p_actor_id and a.holat = 'faol'
    and a.rol in ('superadmin','admin')
  order by case a.rol when 'superadmin' then 0 else 1 end limit 1;
  v_platform := coalesce(v_platform, 'none');

  if p_kompaniya_id is null then
    v_permissions := case v_platform
      when 'superadmin' then array['control.global.read','control.global.write']
      when 'admin' then array['control.global.read'] else array[]::text[] end;
    if cardinality(v_permissions) = 0 or not p_permission = any(v_permissions) then
      return jsonb_build_object('ok', true, 'allowed', false,
        'reason', 'PLATFORM_ROLE_REQUIRED', 'platform_role', v_platform);
    end if;
  else
    if not exists (select 1 from public.t2_kompaniya k where k.id = p_kompaniya_id and k.faol = true) then
      return jsonb_build_object('ok', true, 'allowed', false, 'reason', 'TARGET_SCOPE_INVALID');
    end if;
    select a.id, a.rol into v_azolik_id, v_membership from public.t2_azolik a
    where a.foydalanuvchi_id = p_actor_id and a.kompaniya_id = p_kompaniya_id and a.holat = 'faol' limit 1;
    -- Superadmin explicit p_kompaniya_id bilan synthetic membershipsiz ishlaydi.
    -- Domain command actor+targetni t2_audit_yoz orqali audit qiladi.
    if v_platform = 'superadmin' then
      v_permissions := array['company.read','company.profile.update','company.member.manage',
        'control.company.read','control.company.write','project.read','project.write',
        'object.read','object.write','document.read','document.write','financial.read','financial.write'];
    else
      if v_membership is null then
        return jsonb_build_object('ok', true, 'allowed', false,
          'reason', 'COMPANY_MEMBERSHIP_REQUIRED', 'platform_role', v_platform);
      end if;
      v_permissions := case v_membership
        when 'admin' then array['company.read','company.profile.update','company.member.manage','control.company.read','control.company.write','project.read','project.write','object.read','object.write','document.read','document.write','financial.read','financial.write']
        when 'boss' then array['company.read','company.profile.update','company.member.manage','control.company.read','control.company.write','project.read','project.write','object.read','object.write','document.read','document.write','financial.read','financial.write']
        when 'rahbar' then array['company.read','control.company.read','project.read','object.read','document.read','financial.read']
        when 'bugalter' then array['company.read','financial.read','financial.write','document.read']
        when 'pto' then array['company.read','project.read','project.write','object.read','object.write','document.read','document.write','financial.read','financial.write']
        when 'prorab' then array['company.read','project.read','project.write','object.read','object.write','document.read','document.write']
        when 'buyurtmachi' then array['company.read','project.read','object.read','document.read','financial.read']
        when 'pudratchi' then array['company.read','project.read','object.read','document.read']
        when 'kuzatuvchi' then array['company.read','project.read','object.read','document.read']
        else array[]::text[] end;
      if cardinality(v_permissions) = 0 then
        return jsonb_build_object('ok', true, 'allowed', false,
          'reason', 'UNKNOWN_ROLE', 'membership_role', v_membership);
      end if;
      -- T2-RUXSAT-QOSHIMCHA-001: rolning qattiq to'plamiga qo'shimcha
      -- ravishda, shu ANIQ a'zolikka (kompaniyaga xos) berilgan qo'shimcha
      -- ruxsatlar ham qo'shiladi.
      if v_azolik_id is not null then
        select v_permissions || coalesce(array_agg(q.ruxsat), array[]::text[])
          into v_permissions
        from public.t2_azolik_ruxsat_qoshimcha q where q.azolik_id = v_azolik_id;
      end if;
    end if;
  end if;

  if p_capability_kod is not null then
    v_cap := public.t2_capability_effective_v1(p_capability_kod, p_kompaniya_id, p_loyiha_id);
    if coalesce(v_cap ->> 'holat', 'off') <> 'on' or (v_cap ->> 'manba') = 'killswitch' then
      return jsonb_build_object('ok', true, 'allowed', false, 'reason', 'CAPABILITY_DISABLED',
        'platform_role', v_platform, 'membership_role', v_membership, 'effective_capability', v_cap);
    end if;
  end if;

  if p_loyiha_id is not null then
    select exists (select 1 from public.t2_loyiha l where l.id = p_loyiha_id
      and l.kompaniya_id = p_kompaniya_id and l.holat = 'faol') into v_project_ok;
  end if;
  if p_obyekt_id is not null then
    select exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id
      and o.kompaniya_id = p_kompaniya_id and (p_loyiha_id is null or o.loyiha_id = p_loyiha_id)
      and o.holat = 'faol') into v_object_ok;
  end if;
  if not v_project_ok or not v_object_ok then
    return jsonb_build_object('ok', true, 'allowed', false, 'reason', 'TARGET_SCOPE_INVALID');
  end if;
  v_allowed := p_permission = any(v_permissions);
  if not v_allowed then v_reason := 'PERMISSION_DENIED'; end if;

  -- Membershipning o‘zi barcha loyiha/obyektlarga ruxsat bermaydi.
  if v_allowed and p_permission in ('project.read','project.write','object.read','object.write')
     and v_platform <> 'superadmin' and coalesce(v_membership,'') not in ('boss','admin') then
    if p_loyiha_id is null then
      return jsonb_build_object('ok', true, 'allowed', false, 'reason', 'TARGET_SCOPE_INVALID');
    end if;
    select coalesce(r.ruxsat, 'none') into v_project_scope
    from public.t2_loyiha_foydalanuvchi_ruxsat r
    where r.loyiha_id = p_loyiha_id and r.foydalanuvchi_id = p_actor_id and r.holat = 'faol';
    if p_obyekt_id is not null then
      select coalesce(r.ruxsat, 'none') into v_object_scope
      from public.t2_obyekt_foydalanuvchi_ruxsat r
      where r.obyekt_id = p_obyekt_id and r.foydalanuvchi_id = p_actor_id and r.holat = 'faol';
    end if;
    v_needed := case when p_permission like '%.write' then 2 else 1 end;
    if greatest(case v_project_scope when 'manage' then 3 when 'write' then 2 when 'read' then 1 else 0 end,
      case v_object_scope when 'manage' then 3 when 'write' then 2 when 'read' then 1 else 0 end) < v_needed then
      return jsonb_build_object('ok', true, 'allowed', false,
        'reason', case when p_obyekt_id is null then 'PROJECT_SCOPE_DENIED' else 'OBJECT_SCOPE_DENIED' end,
        'platform_role', v_platform, 'membership_role', v_membership);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'allowed', v_allowed, 'reason', v_reason,
    'platform_role', v_platform, 'membership_role', v_membership,
    'permissions', to_jsonb(v_permissions), 'effective_capability', v_cap,
    'company_id', p_kompaniya_id, 'loyiha_id', p_loyiha_id, 'obyekt_id', p_obyekt_id);
end
$function$
;

CREATE OR REPLACE FUNCTION public.t2_men_v1(p_actor_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_u public.t2_foydalanuvchi%rowtype; v_az jsonb; v_context jsonb; v_super boolean;
begin
  if p_actor_id is null or p_actor_id<=0 then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  select * into v_u from public.t2_foydalanuvchi where id=p_actor_id and holat='faol';
  if not found then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  v_super:=public.t2_platforma_superadmin(p_actor_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'azolik_id',a.id,'kompaniya_id',k.id,'nom',k.nom,'kod',k.kod,
    'rol',a.rol,'is_director',a.rol in ('boss','admin','superadmin'),
    'holat',a.holat,'faol',k.faol) order by k.nom),'[]'::jsonb) into v_az
    from public.t2_azolik a join public.t2_kompaniya k on k.id=a.kompaniya_id
    where a.foydalanuvchi_id=p_actor_id and a.holat='faol';
  -- Context access is NOT membership. Never create synthetic memberships.
  select coalesce(jsonb_agg(jsonb_build_object(
    'kompaniya_id',k.id,'nom',k.nom,'kod',k.kod,'faol',k.faol,
    'membership_role',a.rol,'effective_role',case when v_super then 'superadmin' else a.rol end,
    'is_director',v_super or a.rol in ('boss','admin','superadmin')) order by k.nom),'[]'::jsonb) into v_context
    from public.t2_kompaniya k left join public.t2_azolik a
      on a.kompaniya_id=k.id and a.foydalanuvchi_id=p_actor_id and a.holat='faol'
    where k.faol=true and (v_super or a.id is not null);
  return jsonb_build_object('ok',true,
    'foydalanuvchi',jsonb_build_object('id',v_u.id,'login',v_u.login,'ism',v_u.ism,'email',v_u.email,'holat',v_u.holat),
    'platform_role',case when v_super then 'superadmin' else 'none' end,
    'context_kompaniyalar',v_context,'azoliklar',v_az,'jami',jsonb_array_length(v_az),
    'onboarding_kerak',not v_super and jsonb_array_length(v_context)=0);
end $function$
;
-- Additive permission metadata is deliberately retained, not dropped.
drop trigger if exists t2_azolik_role_permission_version_v2 on public.t2_azolik;
notify pgrst,'reload schema';
commit;
