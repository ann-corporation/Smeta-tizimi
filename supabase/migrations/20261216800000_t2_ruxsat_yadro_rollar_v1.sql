-- T2-RUXSAT-YADRO-ROLLAR-001: t2_effective_authorization_v1 UNKNOWN_ROLE eshigi yagona rol katalogiga (t2_role_permissions_v2) o'tkaziladi.
-- Boshqa barcha tekshiruvlar (scope, a'zolik, holat, superadmin, capability) o'zgarmagan. BEGIN/COMMIT yo'q.
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
  if p_permission is null or not (p_permission=any(public.t2_permission_catalog_v2()||array['control.global.read','control.global.write'])) then
    return jsonb_build_object('ok', true, 'allowed', false, 'reason', 'UNKNOWN_PERMISSION');
  end if;

  -- Platform signal barcha active membershiplardan, target company roli esa alohida olinadi.
  select a.rol into v_platform from public.t2_azolik a
  where a.foydalanuvchi_id = p_actor_id and a.holat = 'faol'
    and a.rol = 'superadmin'
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
      v_permissions := public.t2_permission_catalog_v2();
    else
      if v_membership is null then
        return jsonb_build_object('ok', true, 'allowed', false,
          'reason', 'COMPANY_MEMBERSHIP_REQUIRED', 'platform_role', v_platform);
      end if;
      -- T2-RUXSAT-YADRO-ROLLAR (20261216800000): rol to'plami qattiq ro'yxatdan emas, yagona katalogdan
      -- (t2_role_permissions_v2) olinadi; katalogda yo'q rol avvalgidek UNKNOWN_ROLE. Quyidagi
      -- t2_azolik_permissions_v2 chaqiruvi haqiqiy (qo'shimcha ruxsatlar bilan) to'plamni baribir belgilaydi.
      v_permissions := public.t2_role_permissions_v2(v_membership);
      if cardinality(v_permissions) = 0 then
        return jsonb_build_object('ok', true, 'allowed', false,
          'reason', 'UNKNOWN_ROLE', 'membership_role', v_membership);
      end if;
      -- T2-RUXSAT-QOSHIMCHA-001: rolning qattiq to'plamiga qo'shimcha
      -- ravishda, shu ANIQ a'zolikka (kompaniyaga xos) berilgan qo'shimcha
      -- ruxsatlar ham qo'shiladi.
      v_permissions := public.t2_azolik_permissions_v2(v_azolik_id);
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
$function$;
