-- Acceptance: t2_effective_authorization_v1 rol katalogi (20261216800000). BEGIN ... ROLLBACK, hech narsa saqlanmaydi.
-- «Eski» tana shu tranzaksiya ichida _t2_effective_authorization_v1_eski nomi bilan yaratiladi va 9 ta ma'lum rol uchun
-- natija (to'liq jsonb) yangisi bilan har bir ruxsat bo'yicha solishtiriladi. Har qadam xatosi qadam nomi bilan qayta ko'tariladi.
begin;
set local statement_timeout = '300s';

CREATE OR REPLACE FUNCTION public._t2_effective_authorization_v1_eski(p_actor_id bigint, p_kompaniya_id bigint DEFAULT NULL::bigint, p_loyiha_id bigint DEFAULT NULL::bigint, p_obyekt_id bigint DEFAULT NULL::bigint, p_permission text DEFAULT 'company.read'::text, p_capability_kod text DEFAULT NULL::text)
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

do $acc$
declare
  v_s text := 'boshlanish';
  v_k1 bigint := 990200001; v_k2 bigint := 990200002;
  v_roles text[] := array['admin','boss','rahbar','bugalter','pto','prorab','buyurtmachi','pudratchi','kuzatuvchi',
                          'usta','brigadir','inspektor','loyihachi','taminotchi','omborchi','kadr','xyz_yoq_rol'];
  v_known text[] := array['admin','boss','rahbar','bugalter','pto','prorab','buyurtmachi','pudratchi','kuzatuvchi'];
  v_u_other bigint := 990200901; v_u_inactive bigint := 990200902;
  v_i int; v_uid bigint; v_p text; v_n jsonb; v_o jsonb; v_cnt int := 0; v_r text; v_ok boolean;
  v_perms text[];
begin
  v_s := '0 sinov kompaniyalari va a''zolari (sintetik)';
  insert into public.t2_kompaniya (id, nom, kod) overriding system value values (v_k1, 'ACC RUXSAT K1', 'ACC_RUXSAT_K1'), (v_k2, 'ACC RUXSAT K2', 'ACC_RUXSAT_K2');
  for v_i in 1..array_length(v_roles, 1) loop
    insert into public.t2_foydalanuvchi (id, login) overriding system value values (990200100 + v_i, 'acc_ruxsat_' || (990200100 + v_i));
    insert into public.t2_azolik (id, foydalanuvchi_id, kompaniya_id, rol) overriding system value values (990200200 + v_i, 990200100 + v_i, v_k1, v_roles[v_i]);
  end loop;
  insert into public.t2_foydalanuvchi (id, login) overriding system value values (v_u_other, 'acc_ruxsat_other'), (v_u_inactive, 'acc_ruxsat_inactive');
  insert into public.t2_azolik (id, foydalanuvchi_id, kompaniya_id, rol) overriding system value values (990200301, v_u_other, v_k2, 'boss');
  insert into public.t2_azolik (id, foydalanuvchi_id, kompaniya_id, rol, holat) overriding system value values (990200302, v_u_inactive, v_k1, 'usta', 'bekor');

  v_s := '1 ma''lum 9 rol: eski == yangi (to''liq jsonb) har bir ruxsat bo''yicha';
  for v_i in 1..array_length(v_roles, 1) loop
    continue when not (v_roles[v_i] = any(v_known));
    foreach v_p in array (public.t2_permission_catalog_v2() || array['control.global.read','control.global.write','nomalum.ruxsat']) loop
      v_n := public.t2_effective_authorization_v1(990200100 + v_i, v_k1, null, null, v_p, null);
      v_o := public._t2_effective_authorization_v1_eski(990200100 + v_i, v_k1, null, null, v_p, null);
      if v_n is distinct from v_o then raise exception 'rol % ruxsat %: eski % yangi %', v_roles[v_i], v_p, v_o, v_n; end if;
      v_cnt := v_cnt + 1;
    end loop;
  end loop;
  if v_cnt < 9 * 20 then raise exception 'solishtirish soni kam: %', v_cnt; end if;

  v_s := '2 usta: self.work.write ruxsat, smeta.write rad; eski UNKNOWN_ROLE edi';
  v_uid := 990200100 + array_position(v_roles, 'usta');
  v_n := public.t2_effective_authorization_v1(v_uid, v_k1, null, null, 'self.work.write', null);
  if (v_n->>'allowed')::boolean is not true then raise exception 'usta self.work.write: %', v_n; end if;
  v_n := public.t2_effective_authorization_v1(v_uid, v_k1, null, null, 'smeta.write', null);
  if (v_n->>'allowed')::boolean is not false or v_n->>'reason' <> 'PERMISSION_DENIED' then raise exception 'usta smeta.write: %', v_n; end if;
  v_n := public.t2_effective_authorization_v1(v_uid, v_k1, null, null, 'financial.write', null);
  if (v_n->>'allowed')::boolean is not false then raise exception 'usta financial.write: %', v_n; end if;
  v_o := public._t2_effective_authorization_v1_eski(v_uid, v_k1, null, null, 'self.work.write', null);
  if v_o->>'reason' <> 'UNKNOWN_ROLE' then raise exception 'eski tana UNKNOWN_ROLE bermadi (nazorat): %', v_o; end if;

  v_s := '3 inspektor: quality.inspect ruxsat, financial.write rad; brigadir self.work.write';
  v_uid := 990200100 + array_position(v_roles, 'inspektor');
  v_n := public.t2_effective_authorization_v1(v_uid, v_k1, null, null, 'quality.inspect', null);
  if (v_n->>'allowed')::boolean is not true then raise exception 'inspektor quality.inspect: %', v_n; end if;
  v_n := public.t2_effective_authorization_v1(v_uid, v_k1, null, null, 'financial.write', null);
  if (v_n->>'allowed')::boolean is not false then raise exception 'inspektor financial.write: %', v_n; end if;
  v_n := public.t2_effective_authorization_v1(990200100 + array_position(v_roles, 'brigadir'), v_k1, null, null, 'self.work.write', null);
  if (v_n->>'allowed')::boolean is not true then raise exception 'brigadir self.work.write: %', v_n; end if;

  v_s := '4 kuzatuvchi: hech bir yozuv ruxsati yo''q';
  v_uid := 990200100 + array_position(v_roles, 'kuzatuvchi');
  foreach v_p in array public.t2_permission_catalog_v2() loop
    continue when v_p !~ '(\.write|\.manage|\.update|\.approve|\.decide|\.inspect|\.price|\.payment|\.import|\.cancel|\.correct|\.prepare|\.dispatch|\.receive|\.fulfil|\.offer|\.issue|\.log|\.trip)$';
    v_n := public.t2_effective_authorization_v1(v_uid, v_k1, null, null, v_p, null);
    if (v_n->>'allowed')::boolean is not false then raise exception 'kuzatuvchi % ruxsat oldi: %', v_p, v_n; end if;
  end loop;

  v_s := '5 boshqa kompaniya a''zosi (boss ham) — rad';
  v_n := public.t2_effective_authorization_v1(v_u_other, v_k1, null, null, 'company.read', null);
  if (v_n->>'allowed')::boolean is not false or v_n->>'reason' <> 'COMPANY_MEMBERSHIP_REQUIRED' then raise exception 'boshqa kompaniya: %', v_n; end if;

  v_s := '6 nofaol a''zolik (usta, holat=bekor) — rad';
  v_n := public.t2_effective_authorization_v1(v_u_inactive, v_k1, null, null, 'self.work.write', null);
  if (v_n->>'allowed')::boolean is not false or v_n->>'reason' <> 'COMPANY_MEMBERSHIP_REQUIRED' then raise exception 'nofaol: %', v_n; end if;

  v_s := '7 katalogda yo''q rol — UNKNOWN_ROLE (eski bilan bir xil)';
  v_uid := 990200100 + array_position(v_roles, 'xyz_yoq_rol');
  v_n := public.t2_effective_authorization_v1(v_uid, v_k1, null, null, 'company.read', null);
  v_o := public._t2_effective_authorization_v1_eski(v_uid, v_k1, null, null, 'company.read', null);
  if v_n->>'reason' <> 'UNKNOWN_ROLE' or (v_n->>'allowed')::boolean is not false or v_n is distinct from v_o then raise exception 'noma''lum rol: % / %', v_n, v_o; end if;

  v_s := '8 chaquvchilar: t2_kompaniya_sozlama_ol_v1 (company.read; yozish_mumkin = company.profile.update)';
  v_n := public.t2_kompaniya_sozlama_ol_v1(990200100 + array_position(v_roles, 'usta'), v_k1);
  if (v_n->>'ok')::boolean is not true or (v_n->>'yozish_mumkin')::boolean is not false then raise exception 'sozlama_ol usta: %', v_n; end if;
  v_n := public.t2_kompaniya_sozlama_ol_v1(990200100 + array_position(v_roles, 'kuzatuvchi'), v_k1);
  if (v_n->>'ok')::boolean is not true or (v_n->>'yozish_mumkin')::boolean is not false then raise exception 'sozlama_ol kuzatuvchi: %', v_n; end if;
  v_n := public.t2_kompaniya_sozlama_ol_v1(990200100 + array_position(v_roles, 'boss'), v_k1);
  if (v_n->>'yozish_mumkin')::boolean is not true then raise exception 'sozlama_ol boss yozolmadi: %', v_n; end if;
  v_n := public.t2_kompaniya_sozlama_ol_v1(v_u_other, v_k1);
  if (v_n->>'ok')::boolean is not false or v_n->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'sozlama_ol boshqa kompaniya: %', v_n; end if;
  v_n := public.t2_kompaniya_sozlama_ol_v1(990200100 + array_position(v_roles, 'xyz_yoq_rol'), v_k1);
  if (v_n->>'ok')::boolean is not false or v_n->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'sozlama_ol noma''lum rol: %', v_n; end if;

  v_s := '9 chaquvchi: t2_naryad_ol_v1 — usta o''z ruxsati bilan o''tadi; noma''lum rol va boshqa kompaniya a''zosi rad';
  v_n := public.t2_naryad_ol_v1(v_k1, 990200100 + array_position(v_roles, 'usta'), 'royxat', '{}'::jsonb);
  if (v_n->>'ok')::boolean is not true then raise exception 'naryad_ol usta: %', v_n; end if;
  v_ok := false;
  begin
    perform public.t2_naryad_ol_v1(v_k1, 990200100 + array_position(v_roles, 'xyz_yoq_rol'), 'royxat', '{}'::jsonb);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'naryad_ol noma''lum rolga ochiq'; end if;
  v_ok := false;
  begin
    perform public.t2_naryad_ol_v1(v_k1, v_u_other, 'royxat', '{}'::jsonb);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'naryad_ol boshqa kompaniya a''zosiga ochiq'; end if;

  v_s := '10 tuzilma: yangi tana katalogga tayanadi, qattiq rol ro''yxati yo''q';
  select pg_get_functiondef('public.t2_effective_authorization_v1(bigint,bigint,bigint,bigint,text,text)'::regprocedure) into v_r;
  if v_r not like '%t2_role_permissions_v2(v_membership)%' then raise exception 'katalog chaqiruvi yo''q'; end if;
  if v_r like '%when ''prorab'' then array%' or v_r like '%when ''kuzatuvchi'' then array%' then raise exception 'qattiq rol ro''yxati qolgan'; end if;
  if v_r not like '%UNKNOWN_ROLE%' or v_r not like '%COMPANY_MEMBERSHIP_REQUIRED%' or v_r not like '%OBJECT_SCOPE_DENIED%' then raise exception 'boshqa tekshiruv yo''qolgan'; end if;
exception when others then
  raise exception 'ACCEPTANCE qadam [%] yiqildi: % (sqlstate %)', v_s, sqlerrm, sqlstate;
end $acc$;

rollback;