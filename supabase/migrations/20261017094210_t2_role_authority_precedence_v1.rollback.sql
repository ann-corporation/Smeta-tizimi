begin;
-- Exact pre-change definitions captured from the target database. No business data touched.
CREATE OR REPLACE FUNCTION public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id bigint, p_actor_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rol text; v_komp_bor boolean;
begin
  if p_kompaniya_id is null or p_kompaniya_id <= 0 then raise exception 'kompaniya_id majburiy' using errcode='22023'; end if;
  if p_actor_id is null or p_actor_id <= 0 then raise exception 'authenticated actor majburiy' using errcode='22023'; end if;

  select a.rol into v_rol from public.t2_azolik a
   where a.kompaniya_id=p_kompaniya_id and a.foydalanuvchi_id=p_actor_id and a.holat='faol';
  if found then return v_rol; end if;

  if public.t2_platforma_superadmin(p_actor_id) then
    select exists(select 1 from public.t2_kompaniya where id = p_kompaniya_id) into v_komp_bor;
    if not v_komp_bor then raise exception 'kompaniya topilmadi' using errcode='42501'; end if;
    return 'superadmin';
  end if;

  raise exception 'actor bu kompaniyaning faol a''zosi emas' using errcode='42501';
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
     and v_platform <> 'superadmin' then
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
declare v_u public.t2_foydalanuvchi%rowtype; v_az jsonb;
begin
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  select * into v_u from public.t2_foydalanuvchi where id = p_actor_id;
  if not found then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'azolik_id', a.id, 'kompaniya_id', k.id, 'nom', k.nom, 'kod', k.kod,
           'rol', a.rol, 'is_director', a.rol in ('boss','superadmin'),
           'holat', a.holat, 'faol', k.faol) order by k.nom), '[]'::jsonb)
    into v_az
  from public.t2_azolik a join public.t2_kompaniya k on k.id = a.kompaniya_id
  where a.foydalanuvchi_id = p_actor_id and a.holat = 'faol';

  return jsonb_build_object('ok', true,
    'foydalanuvchi', jsonb_build_object('id', v_u.id, 'login', v_u.login, 'ism', v_u.ism,
                                        'email', v_u.email, 'holat', coalesce(v_u.holat,'faol')),
    'azoliklar', v_az,
    'jami', jsonb_array_length(v_az),
    'onboarding_kerak', jsonb_array_length(v_az) = 0);
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_platforma_superadmin(p_actor_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.t2_azolik a
    where a.foydalanuvchi_id = p_actor_id
      and a.rol = 'superadmin'
      and a.holat = 'faol'
  );
$function$
;
notify pgrst,'reload schema';
commit;
