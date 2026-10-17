begin;
DO $$ BEGIN IF EXISTS(select 1 from public.t2_azolik where rol='admin' and holat='faol') THEN RAISE EXCEPTION 'COMPANY_ADMINS_EXIST: migrate explicitly before reverting the old director guard'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.t2_azolik_ochir_v1(p_actor_id bigint, p_azolik_id bigint, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_prev jsonb; v_az public.t2_azolik%rowtype; v_boss_soni int;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  select * into v_az from public.t2_azolik where id = p_azolik_id;
  if not found then return jsonb_build_object('ok',false,'code','MEMBERSHIP_NOT_FOUND'); end if;
  if v_az.holat <> 'faol' then return jsonb_build_object('ok',true,'takror',true,'azolik_id',p_azolik_id); end if;
  perform public.t2_azo_actor_director_tekshir(v_az.kompaniya_id, p_actor_id);

  if v_az.rol = 'boss' then
    select count(*) into v_boss_soni from public.t2_azolik
     where kompaniya_id = v_az.kompaniya_id and holat = 'faol' and rol = 'boss';
    if v_boss_soni <= 1 then return jsonb_build_object('ok',false,'code','LAST_DIRECTOR'); end if;
  end if;

  update public.t2_azolik set holat = 'bekor' where id = p_azolik_id;
  perform public.t2_audit_yoz(v_az.kompaniya_id, 'azolik_ochir', 'onboarding', null,
    format('azolik:%s login_uid:%s', p_azolik_id, v_az.foydalanuvchi_id), 'actor:'||p_actor_id, null);

  v_prev := jsonb_build_object('ok',true,'azolik_id',p_azolik_id,'holat','bekor');
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'azolik_ochir', v_prev);
  return v_prev;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_azolik_rol_ozgartir_v1(p_actor_id bigint, p_azolik_id bigint, p_yangi_rol text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_prev jsonb; v_az public.t2_azolik%rowtype; v_boss_soni int;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  select * into v_az from public.t2_azolik where id = p_azolik_id;
  if not found then return jsonb_build_object('ok',false,'code','MEMBERSHIP_NOT_FOUND'); end if;
  perform public.t2_azo_actor_director_tekshir(v_az.kompaniya_id, p_actor_id);

  if p_yangi_rol is null or p_yangi_rol not in ('boss','rahbar','bugalter','pto','prorab','buyurtmachi','pudratchi','kuzatuvchi') then
    return jsonb_build_object('ok',false,'code','ROLE_INVALID');
  end if;

  if v_az.rol = 'boss' and p_yangi_rol <> 'boss' then
    select count(*) into v_boss_soni from public.t2_azolik
     where kompaniya_id = v_az.kompaniya_id and holat = 'faol' and rol = 'boss';
    if v_boss_soni <= 1 then return jsonb_build_object('ok',false,'code','LAST_DIRECTOR'); end if;
  end if;

  update public.t2_azolik set rol = p_yangi_rol where id = p_azolik_id;
  perform public.t2_audit_yoz(v_az.kompaniya_id, 'azolik_rol_ozgartir', 'onboarding', null,
    format('azolik:%s %s->%s', p_azolik_id, v_az.rol, p_yangi_rol), 'actor:'||p_actor_id, null);

  v_prev := jsonb_build_object('ok',true,'azolik_id',p_azolik_id,'rol',p_yangi_rol);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'azolik_rol_ozgartir', v_prev);
  return v_prev;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_azo_actor_director_tekshir(p_kompaniya_id bigint, p_actor_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('boss','superadmin') then
    raise exception 'faqat direktor (boss) yoki superadmin' using errcode='42501';
  end if;
  return v_rol;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_azolik_qosh_v1(p_actor_id bigint, p_kompaniya_id bigint, p_login text, p_rol text, p_email text, p_ism text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_prev jsonb; v_uid bigint; v_azolik bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  perform public.t2_azo_actor_director_tekshir(p_kompaniya_id, p_actor_id);

  if coalesce(btrim(p_login),'') = '' then return jsonb_build_object('ok',false,'code','LOGIN_REQUIRED'); end if;
  if p_rol is null or p_rol not in ('boss','rahbar','bugalter','pto','prorab','buyurtmachi','pudratchi','kuzatuvchi') then
    return jsonb_build_object('ok',false,'code','ROLE_INVALID','xato','superadmin bu yerdan berilmaydi');
  end if;
  if not exists (select 1 from public.t2_kompaniya where id = p_kompaniya_id and faol) then
    return jsonb_build_object('ok',false,'code','COMPANY_NOT_FOUND');
  end if;

  select id into v_uid from public.t2_foydalanuvchi where login = p_login;
  if not found then
    insert into public.t2_foydalanuvchi (login, email, ism, holat)
    values (p_login, nullif(p_email,''), nullif(p_ism,''), 'faol') returning id into v_uid;
  end if;

  if exists (select 1 from public.t2_azolik
             where foydalanuvchi_id = v_uid and kompaniya_id = p_kompaniya_id and holat = 'faol') then
    return jsonb_build_object('ok',false,'code','ALREADY_MEMBER');
  end if;

  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat)
  values (v_uid, p_kompaniya_id, p_rol, 'faol') returning id into v_azolik;

  perform public.t2_audit_yoz(p_kompaniya_id, 'azolik_qosh', 'onboarding', null,
    format('login=%s rol=%s azolik:%s', p_login, p_rol, v_azolik), 'actor:'||p_actor_id, null);

  v_prev := jsonb_build_object('ok',true,'azolik_id',v_azolik,'foydalanuvchi_id',v_uid,'rol',p_rol);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'azolik_qosh', v_prev);
  return v_prev;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_parol_belgila_v1(p_actor_id bigint, p_kompaniya_id bigint, p_foydalanuvchi_id bigint, p_yangi_parol text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_prev jsonb; v_bor boolean;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  perform public.t2_azo_actor_director_tekshir(p_kompaniya_id, p_actor_id);

  if length(coalesce(p_yangi_parol,'')) < 8 then
    return jsonb_build_object('ok',false,'code','PAROL_QISQA','xato','Parol kamida 8 belgi bo''lishi kerak');
  end if;

  select exists(
    select 1 from public.t2_azolik
    where foydalanuvchi_id = p_foydalanuvchi_id and kompaniya_id = p_kompaniya_id and holat = 'faol'
  ) into v_bor;
  if not v_bor then
    return jsonb_build_object('ok',false,'code','AZOLIK_TOPILMADI');
  end if;

  update public.t2_foydalanuvchi
    set parol_hash = extensions.crypt(p_yangi_parol, extensions.gen_salt('bf')),
        parol_yangilandi = now()
    where id = p_foydalanuvchi_id;

  perform public.t2_audit_yoz(p_kompaniya_id, 'parol_belgila', 'onboarding', null,
    format('foydalanuvchi_id=%s', p_foydalanuvchi_id), 'actor:'||p_actor_id, null);

  v_prev := jsonb_build_object('ok',true,'foydalanuvchi_id',p_foydalanuvchi_id);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'parol_belgila', v_prev);
  return v_prev;
end $function$
;
-- Additive helper retained; prior entrypoints restored. No membership/user data removed.
notify pgrst,'reload schema';
commit;
