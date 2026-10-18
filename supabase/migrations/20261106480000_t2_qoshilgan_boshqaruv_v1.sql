-- T2-F2-IMPORT-TUZATISH-001 — foydalanuvchi QO'SHGAN smeta qatorlarini to'liq boshqarish (egasi, 2026-10-18):
--   "smetadan olingan ma'lumotlar const — o'zgarmas, lekin undan tashqarisi to'liq boshqariluvchan: tahrirlash, joyini
--    o'zgartirish, o'chirish, almashtirish. Resursga ham ish turi zamena qilish mumkin bo'lishi kerak: masalan ГПС ni
--    hokimiyat karyer bergan — ГПС ning o'zini ololmaymiz, lekin qazib olish va tashishni olamiz".
-- O'chirish/tahrirlash mavjud (`t2_ish_abc_ochir_v1` / `t2_ish_abc_tahrir_v1`). Bu migratsiya qo'shadi:
--   1) t2_resurs_ish_zamena_v1 — smeta RESURSI o'rniga bir yoki bir nechta ISH (o'z resurslari bilan), o'sha bo'limda,
--      resursning ishidan keyin; asl resurs o'zgarmaydi; yangi ishlar `zamena=true`, `replaces_line_id = resurs`.
--      `p_eski_qator_id` berilsa — oldingi shunday zamenani arxivlab almashtiradi (tahrirlash).
--   2) t2_qoshilgan_kochir_v1 — qo'shilgan qatorni (bolalari bilan) boshqa joyga ko'chirish.
-- Qonunlar: faqat `qoshimcha=true` qatorlar; asl smeta qatori rad; F2 aktidagi qator ko'chirilmaydi; ruxsat
-- `smeta.write` (rollar konstruktori); idempotent `operation_id`; har amal auditda. Additiv: jadval yo'q, faqat funksiyalar.

begin;

-- Explicit zero is a supplied price, not missing.
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
  perform public.t2_require_permission_v2(p_kompaniya_id,p_actor_id,'smeta.write');
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') and not public.t2_permission_allowed_v2(p_kompaniya_id,p_actor_id,'smeta.write') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
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
    v_narx := nullif(v_r->>'narx', '')::numeric; if v_narx < 0 then v_narx := null; end if;
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
      v_narx := nullif(v_r->>'narx', '')::numeric; if v_narx < 0 then v_narx := null; end if;
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


create or replace function public.t2_ish_abc_ochir_ichki(p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_id bigint,
  p_actor_id bigint, p_sabab text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.t2_qator%rowtype; v_ids bigint[]; v_n int; v_smeta int; v_f2 int; v_bog int; v_ota bigint; v_qj jsonb; v_fj jsonb;
begin
  select * into v_r from public.t2_qator where id = p_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'QATOR_NOT_FOUND'); end if;
  if not coalesce(v_r.qoshimcha, false) then
    return jsonb_build_object('ok', false, 'code', 'SMETA_QATORI_OZGARMAS', 'xabar', 'Smetaning asl qatori o''chirilmaydi va o''zgartirilmaydi.');
  end if;
  with recursive t(id) as (select p_qator_id union select q.id from public.t2_qator q join t on q.ota_id = t.id)
  select array_agg(id) into v_ids from t;
  perform 1 from public.t2_qator where id = any(v_ids) order by id for update;
  if exists(select 1 from public.t2_qator where id=any(v_ids) and
    (kompaniya_id is distinct from p_kompaniya_id or obyekt_id is distinct from p_obyekt_id)) then
    return jsonb_build_object('ok',false,'code','SCOPE_INVALID');
  end if;
  -- Never archive away Fakt/F2 history as an importer correction.
  if exists(select 1 from public.t2_akt_qator where qator_id=any(v_ids)) then
    return jsonb_build_object('ok',false,'code','QATOR_TARIXDA','xabar','Qator Fakt/F2 hujjatida ishlatilgan. Tarix saqlanadi; tuzatish hujjati kerak.');
  end if;
  if exists(select 1 from public.t2_qator where replaces_line_id=any(v_ids) and not(id=any(v_ids))) then
    return jsonb_build_object('ok',false,'code','BOGLANGAN');
  end if;
  if exists(select 1 from public.t2_qator q join public.t2_smeta_ozgarish z on z.id=q.change_id
    where q.id=any(v_ids) and z.holat is distinct from 'qoralama') then
    return jsonb_build_object('ok',false,'code','TASDIQLANGAN_OZGARISH');
  end if;
  v_n := cardinality(v_ids);
  select count(*) into v_smeta from public.t2_qator where id = any(v_ids) and not coalesce(qoshimcha, false);
  if v_smeta > 0 then
    return jsonb_build_object('ok', false, 'code', 'SMETA_QATORI_OZGARMAS', 'xabar', format('Ichida %s ta asl smeta qatori bor — o''chirilmaydi.', v_smeta));
  end if;
  select count(*) into v_f2 from unnest(v_ids) x where public.t2_qator_f2da(x);
  if v_f2 > 0 then
    return jsonb_build_object('ok', false, 'code', 'F2_DA', 'xabar', format('%s ta qator F2 aktida — avval F2 ni bekor qiling.', v_f2));
  end if;
  select (select count(*) from public.t2_aosr_bog where qator_id = any(v_ids)) + (select count(*) from public.t2_lab_protokol_bog where qator_id = any(v_ids))
       + (select count(*) from public.t2_narx_dalil where qator_id = any(v_ids)) + (select count(*) from public.t2_price_basis_line where qator_id = any(v_ids))
    into v_bog;
  if v_bog > 0 then
    return jsonb_build_object('ok', false, 'code', 'BOGLANGAN', 'xabar', format('%s ta bog''lanish (АОСР / laboratoriya / narx dalili) — avval ularni yeching.', v_bog));
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.daraja, q.id), '[]'::jsonb) into v_qj from public.t2_qator q where q.id = any(v_ids);
  select coalesce(jsonb_agg(to_jsonb(aq)), '[]'::jsonb) into v_fj
    from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id where aq.qator_id = any(v_ids) and a.tur = 'fakt';
  insert into public.t2_qator_ochirilgan(kompaniya_id, obyekt_id, ildiz_qator_id, qatorlar, fakt_qatorlari, sabab, kim, operation_id)
    values (p_kompaniya_id, p_obyekt_id, p_qator_id, v_qj, v_fj, p_sabab, 'actor:' || p_actor_id, p_operation_id);

  delete from public.t2_akt_qator aq using public.t2_akt a where a.id = aq.akt_id and a.tur = 'fakt' and aq.qator_id = any(v_ids);
  update public.t2_smeta_ozgarish z set holat = 'bekor'
   where z.id in (select change_id from public.t2_qator where id = any(v_ids) and change_id is not null)
     and not exists (select 1 from public.t2_qator q where q.change_id = z.id and not (q.id = any(v_ids)));
  v_ota := v_r.ota_id;
  delete from public.t2_qator where id = p_qator_id;            -- ota_id ON DELETE CASCADE — bolalar ham
  -- Ota ish (bl) bo'lsa — uning summasi resurslardan qayta hisoblanadi.
  if v_ota is not null and exists (select 1 from public.t2_qator where id = v_ota and tur = 'bl') then
    update public.t2_qator set summa = (select sum(summa) from public.t2_qator where ota_id = v_ota and tur in ('rs', 'mat', 'ob'))
     where id = v_ota and coalesce(qoshimcha, false);
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_abc_ochir', 'smeta', p_obyekt_id,
    format('ildiz=%s qatorlar=%s fakt=%s sabab=%s', p_qator_id, v_n, jsonb_array_length(v_fj), coalesce(p_sabab, '-')), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'ochirildi', v_n, 'fakt_ochirildi', jsonb_array_length(v_fj), 'ota_id', v_ota,
    'tur', v_r.tur, 'zamena', coalesce(v_r.zamena, false), 'replaces_line_id', v_r.replaces_line_id);
end $$;

CREATE OR REPLACE FUNCTION public.t2_ish_abc_ochir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_id bigint, p_sabab text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rol text; v_prev jsonb; v_request text; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id,p_actor_id,'smeta.write');
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') and not public.t2_permission_allowed_v2(p_kompaniya_id,p_actor_id,'smeta.write') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  perform 1 from public.t2_obyekt where id=p_obyekt_id and kompaniya_id=p_kompaniya_id;
  if not found then return jsonb_build_object('ok',false,'code','OBJECT_SCOPE_INVALID'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:op:' || p_operation_id,0));
  v_request := md5(jsonb_build_array(p_actor_id,p_kompaniya_id,p_obyekt_id,p_qator_id,p_sabab,'ish_abc_ochir')::text);
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then
    if v_prev->>'_request' is distinct from v_request then return jsonb_build_object('ok',false,'code','OPERATION_SCOPE_MISMATCH'); end if;
    return (v_prev - '_request') || jsonb_build_object('takror',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:' || p_obyekt_id, 0));
  v_res := public.t2_ish_abc_ochir_ichki(p_kompaniya_id, p_obyekt_id, p_qator_id, p_actor_id, p_sabab, p_operation_id);
  if coalesce((v_res->>'ok')::boolean, false) then
    insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_abc_ochir', v_res || jsonb_build_object('_request',v_request));
  end if;
  return v_res;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_ish_abc_tahrir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_id bigint, p_ish jsonb, p_resurslar jsonb, p_fakt_hajm numeric, p_sana date, p_sabab text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rol text; v_prev jsonb; v_request text; v_o jsonb; v_cmd text; v_ota bigint; v_old bigint; v_ver integer; v_new jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id,p_actor_id,'smeta.write');
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') and not public.t2_permission_allowed_v2(p_kompaniya_id,p_actor_id,'smeta.write') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  perform 1 from public.t2_obyekt where id=p_obyekt_id and kompaniya_id=p_kompaniya_id;
  if not found then return jsonb_build_object('ok',false,'code','OBJECT_SCOPE_INVALID'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:op:' || p_operation_id,0));
  v_request := md5(jsonb_build_array(p_actor_id,p_kompaniya_id,p_obyekt_id,p_qator_id,p_sabab,p_ish,p_resurslar,p_fakt_hajm,p_sana,'ish_abc_tahrir')::text);
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then
    if v_prev->>'_request' is distinct from v_request then return jsonb_build_object('ok',false,'code','OPERATION_SCOPE_MISMATCH'); end if;
    return (v_prev - '_request') || jsonb_build_object('takror',true);
  end if;
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
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_abc_tahrir', v_new || jsonb_build_object('_request',v_request));
  return v_new;
end $function$
;


create or replace function public.t2_resurs_ish_zamena_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_resurs_qator_id bigint,
  p_ishlar jsonb, p_sabab text, p_operation_id uuid, p_eski_qator_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
  v_request := md5(jsonb_build_array(p_actor_id,p_kompaniya_id,p_obyekt_id,p_resurs_qator_id,p_ishlar,p_sabab,p_eski_qator_id,'resurs_ish_zamena')::text);
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
  select * into v_w from public.t2_qator where id = v_r.ota_id;
  if not found or v_w.tur <> 'bl' then return jsonb_build_object('ok', false, 'code', 'RESURS_ISHSIZ', 'xabar', 'Resurs ish ichida emas — ish zamenasi uchun bo''lim aniqlanmadi.'); end if;
  select * into v_z from public.t2_qator where id = v_w.ota_id;
  if not found or v_z.tur <> 'rz' then return jsonb_build_object('ok', false, 'code', 'BOLIM_NOT_FOUND'); end if;

  if p_eski_qator_id is not null then
    select * into v_eski from public.t2_qator where id = p_eski_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id;
    if not found or not coalesce(v_eski.zamena, false) or v_eski.replaces_line_id is distinct from v_r.id then
      return jsonb_build_object('ok', false, 'code', 'ESKI_ZAMENA_NOTOGRI', 'xabar', 'Almashtiriladigan eski qator shu resursning ish zamenasi emas.');
    end if;
    v_o := public.t2_ish_abc_ochir_ichki(p_kompaniya_id, p_obyekt_id, p_eski_qator_id, p_actor_id, 'tahrir: ' || p_sabab, p_operation_id);
    if not coalesce((v_o->>'ok')::boolean, false) then return v_o; end if;
  end if;

  -- Yangi ishlar resursning ishidan (va uning resurslaridan) keyin turadi; boshqa qatorlar surilmaydi.
  with recursive t(id, tartib) as (
    select v_w.id, v_w.tartib union all select q.id, q.tartib from public.t2_qator q join t on q.ota_id = t.id)
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
end $$;

create or replace function public.t2_qoshilgan_kochir_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_id bigint,
  p_yangi_ota_id bigint, p_keyin_qator_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_request text; v_r public.t2_qator%rowtype; v_p public.t2_qator%rowtype; v_ids bigint[]; v_tartib int; v_delta int; v_natija jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  perform 1 from public.t2_obyekt where id=p_obyekt_id and kompaniya_id=p_kompaniya_id;
  if not found then return jsonb_build_object('ok',false,'code','OBJECT_SCOPE_INVALID'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:op:' || p_operation_id,0));
  v_request := md5(jsonb_build_array(p_actor_id,p_kompaniya_id,p_obyekt_id,p_qator_id,p_yangi_ota_id,p_keyin_qator_id,'qoshilgan_kochir')::text);
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then
    if v_prev->>'_request' is distinct from v_request then return jsonb_build_object('ok',false,'code','OPERATION_SCOPE_MISMATCH'); end if;
    return (v_prev - '_request') || jsonb_build_object('takror',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:' || p_obyekt_id, 0));

  select * into v_r from public.t2_qator where id = p_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'QATOR_NOT_FOUND'); end if;
  if not coalesce(v_r.qoshimcha, false) then
    return jsonb_build_object('ok', false, 'code', 'SMETA_QATORI_OZGARMAS', 'xabar', 'Smetaning asl qatori ko''chirilmaydi.');
  end if;
  select * into v_p from public.t2_qator where id = p_yangi_ota_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'OTA_NOT_FOUND'); end if;
  if (v_r.tur = 'bl' and v_p.tur <> 'rz') or (v_r.tur in ('rs', 'mat', 'ob') and v_p.tur not in ('rz', 'bl')) or v_r.tur = 'rz' then
    return jsonb_build_object('ok', false, 'code', 'TUZILMA_NOTOGRI', 'xabar', 'Ish faqat bo''limga, resurs — ishga yoki bo''limga ko''chiriladi.');
  end if;
  with recursive t(id) as (select p_qator_id union select q.id from public.t2_qator q join t on q.ota_id = t.id)
  select array_agg(id) into v_ids from t;
  if p_yangi_ota_id = any(v_ids) then return jsonb_build_object('ok', false, 'code', 'TUZILMA_NOTOGRI', 'xabar', 'Qator o''z ichiga ko''chirilmaydi.'); end if;
  if coalesce(v_r.zamena, false) and p_yangi_ota_id is distinct from v_r.ota_id then
    return jsonb_build_object('ok', false, 'code', 'ZAMENA_JOYI', 'xabar', 'Zamena o''zi almashtirgan qator yonida turadi — faqat shu bo''lim ichida tartibini o''zgartirish mumkin.');
  end if;
  if exists (select 1 from public.t2_akt_qator where qator_id=any(v_ids)) then
    return jsonb_build_object('ok', false, 'code', 'QATOR_TARIXDA', 'xabar', 'Qator F2 aktida — ko''chirilmaydi (tasdiqlangan hujjat o''zgarmaydi).');
  end if;

  if p_keyin_qator_id is null or p_keyin_qator_id = p_yangi_ota_id then
    v_tartib := v_p.tartib;
  else
    perform 1 from public.t2_qator where id = p_keyin_qator_id and ota_id = p_yangi_ota_id and not (id = any(v_ids));
    if not found then return jsonb_build_object('ok', false, 'code', 'JOY_NOTOGRI', 'xabar', 'Tanlangan joy shu bo''lim/ish ichida emas.'); end if;
    with recursive t(id, tartib) as (
      select q0.id, q0.tartib from public.t2_qator q0 where q0.id = p_keyin_qator_id
      union all select q1.id, q1.tartib from public.t2_qator q1 join t on q1.ota_id = t.id)
    select max(t.tartib) into v_tartib from t;
  end if;
  v_delta := coalesce(v_p.daraja, 0) + 1 - coalesce(v_r.daraja, 0);
  update public.t2_qator set ota_id = p_yangi_ota_id where id = p_qator_id;
  update public.t2_qator set daraja = coalesce(daraja, 0) + v_delta, tartib = v_tartib where id = any(v_ids);
  update public.t2_qator set yangilandi = clock_timestamp() where id in (p_yangi_ota_id, v_r.ota_id);
  perform public.t2_audit_yoz(p_kompaniya_id, 'qoshilgan_kochir', 'smeta', p_obyekt_id,
    format('qator=%s ota %s->%s keyin=%s', p_qator_id, coalesce(v_r.ota_id::text, '-'), p_yangi_ota_id, coalesce(p_keyin_qator_id::text, '-')),
    'actor:' || p_actor_id, null);
  v_natija := jsonb_build_object('ok', true, 'qator_id', p_qator_id, 'kochdi', cardinality(v_ids), 'ota_id', p_yangi_ota_id);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'qoshilgan_kochir', v_natija || jsonb_build_object('_request',v_request));
  return v_natija;
end $$;

revoke all on function public.t2_resurs_ish_zamena_v1(bigint, bigint, bigint, bigint, jsonb, text, uuid, bigint) from public, anon, authenticated;
revoke all on function public.t2_qoshilgan_kochir_v1(bigint, bigint, bigint, bigint, bigint, bigint, uuid) from public, anon, authenticated;
grant execute on function public.t2_resurs_ish_zamena_v1(bigint, bigint, bigint, bigint, jsonb, text, uuid, bigint) to service_role;
grant execute on function public.t2_qoshilgan_kochir_v1(bigint, bigint, bigint, bigint, bigint, bigint, uuid) to service_role;

commit;
