-- ROLLBACK: 20261108010000_t2_ekotizim_f1_ruxsat_v1.sql — prod dagi (2026-10-24) aniq ta'riflarni tiklaydi.
-- Oldin: yangi rollardagi (omborchi, mexanik, kadr, taminotchi, usta, brigadir, haydovchi, inspektor, loyihachi)
-- faol ish joyi takliflarini bekor qiling — aks holda check constraint qayta qo'shilmaydi:
--   update t2_ish_joyi_taklif set holat='bekor', bekor_vaqti=now() where rol not in (...eski 7 rol...);
--   (ular qatorlari baribir qoladi; constraint ularni rad etadi — shuning uchun pastda NOT VALID).
-- Yangi rolli t2_azolik qatorlari qolsa, ular eski funksiya bo'yicha bo'sh ruxsat oladi (xavfsiz tomonga).

begin;

create or replace function public.t2_permission_catalog_v2()
 returns text[] language sql immutable set search_path to 'public', 'pg_temp' as $function$
  select array['company.read','company.profile.update','company.member.manage','control.company.read','control.company.write',
    'project.read','project.write','object.read','object.write','document.read','document.write','financial.read','financial.write',
    'f2.read','f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct','smeta.read','smeta.write','fakt.read','fakt.write','narx.read','narx.write']::text[];
$function$;

create or replace function public.t2_role_permissions_v2(p_rol text)
 returns text[] language plpgsql immutable set search_path to 'public', 'pg_temp' as $function$
declare p text[];
begin
  if p_rol in ('boss','admin','superadmin') then return public.t2_permission_catalog_v2(); end if;
  p:=case p_rol
    when 'rahbar' then array['company.read','control.company.read','project.read','object.read','document.read','financial.read']
    when 'bugalter' then array['company.read','financial.read','financial.write','document.read']
    when 'pto' then array['company.read','project.read','project.write','object.read','object.write','document.read','document.write','financial.read','financial.write']
    when 'prorab' then array['company.read','project.read','project.write','object.read','object.write','document.read','document.write']
    when 'buyurtmachi' then array['company.read','project.read','object.read','document.read','financial.read']
    when 'pudratchi' then array['company.read','project.read','object.read','document.read']
    when 'kuzatuvchi' then array['company.read','project.read','object.read','document.read'] else array[]::text[] end;
  if 'document.read'=any(p) then p:=p||array['f2.read','smeta.read','fakt.read','narx.read']; end if;
  if p_rol in ('pto','prorab','bugalter') then p:=p||array['f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct']; end if;
  if 'object.write'=any(p) then p:=p||array['smeta.write','fakt.write','narx.write']; end if;
  return p;
end $function$;

alter table public.t2_ish_joyi_taklif drop constraint if exists t2_ish_joyi_taklif_rol_check;
alter table public.t2_ish_joyi_taklif add constraint t2_ish_joyi_taklif_rol_check
  check (rol = any (array['rahbar','bugalter','pto','prorab','buyurtmachi','pudratchi','kuzatuvchi'])) not valid;

create or replace function public.t2_ish_joyi_taklif_yarat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kod_xesh text, p_rol text, p_muddat_soat integer, p_max_soni integer, p_izoh text, p_operation_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_prev jsonb; v_id bigint; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev || '{"takror":true}'::jsonb; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.member.manage');
  if p_kod_xesh !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'code', 'KOD_NOTOGRI'); end if;
  if p_rol not in ('rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi') then
    return jsonb_build_object('ok', false, 'code', 'ROL_NOTOGRI', 'xabar', 'Havola orqali rahbar (boss) yoki admin berilmaydi.');
  end if;
  if p_muddat_soat is null or p_muddat_soat < 1 or p_muddat_soat > 24 * 30 then return jsonb_build_object('ok', false, 'code', 'MUDDAT_NOTOGRI'); end if;
  if p_max_soni is null or p_max_soni < 1 or p_max_soni > 500 then return jsonb_build_object('ok', false, 'code', 'SONI_NOTOGRI'); end if;
  insert into public.t2_ish_joyi_taklif (kompaniya_id, kod_xesh, rol, muddat, max_soni, izoh, yaratdi_actor_id)
    values (p_kompaniya_id, p_kod_xesh, p_rol, now() + make_interval(hours => p_muddat_soat), p_max_soni, left(nullif(btrim(p_izoh), ''), 200), p_actor_id)
    returning id into v_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_joyi_taklif_yarat', 'kompaniya', null, format('taklif=%s rol=%s soni=%s', v_id, p_rol, p_max_soni), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'taklif_id', v_id);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_joyi_taklif_yarat', v_res);
  return v_res;
end $function$;

commit;
