-- ⚠ T2 EKOTIZIM F1 — RUXSAT KENGAYTMASI (docs/architecture/ekotizim/E2_TENANCY_RUXSAT.md §3.1–3.2).
-- HOLAT: EGASI TASDIQLADI (2026-10-24); prodga koordinator qo'llaydi (frontend PERMISSIONS PR i bilan birga).
-- Yadro migratsiyasi (20261108000000) bunga bog'liq EMAS — alohida qo'llanadi.
--
-- Nima o'zgaradi:
--   1) t2_permission_catalog_v2 — 25 ta mavjud capability + yangi domen capability lari.
--      boss/admin/superadmin butun katalogni avtomatik oladi (mavjud qoida).
--   2) t2_role_permissions_v2 — yangi a'zo rollari (omborchi, mexanik, kadr, taminotchi, usta, brigadir, haydovchi,
--      inspektor, loyihachi) aniq ro'yxat bilan; mavjud rollarga faqat YANGI domen capability lari qo'shiladi,
--      mavjud 25 tadan hech biri olib tashlanmaydi yoki qo'shilmaydi. financial.* bor joyda accounting.* ham (taxallus).
--   3) t2_ish_joyi_taklif — havola orqali yangi rollarni berish (boss/admin hali ham berilmaydi).
-- Ta'sir: t2_men_v1 → shlyuz (≤60 s kesh) yangi capability larni ko'radi. Eski kod yangi capability nomlarini
-- ishlatmaydi, shuning uchun mavjud ekranlar o'zgarmaydi. azolik.ruxsat_versiya o'zgarmaydi (rol o'zgarmadi).

begin;

create or replace function public.t2_permission_catalog_v2()
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select array['company.read','company.profile.update','company.member.manage','control.company.read','control.company.write',
    'project.read','project.write','object.read','object.write','document.read','document.write','financial.read','financial.write',
    'f2.read','f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct','smeta.read','smeta.write','fakt.read','fakt.write','narx.read','narx.write',
    -- ekotizim (E2 §3.1)
    'procurement.read','procurement.write','procurement.approve',
    'supply.offer','supply.fulfil',
    'logistics.read','logistics.dispatch','logistics.trip',
    'warehouse.read','warehouse.write','warehouse.receive',
    'quality.read','quality.inspect','quality.decide',
    'design.read','design.write','design.issue',
    'hr.read','hr.write','hr.pii.read','hr.pii.write','hr.tabel.write',
    'payroll.read','payroll.write',
    'machinery.read','machinery.write','machinery.log',
    'accounting.read','accounting.write','accounting.approve',
    'self.work.read','self.work.write']::text[];
$$;

create or replace function public.t2_role_permissions_v2(p_rol text)
returns text[] language plpgsql immutable set search_path = public, pg_temp as $$
declare p text[];
begin
  if p_rol in ('boss','admin','superadmin') then return public.t2_permission_catalog_v2(); end if;

  -- Yangi (ekotizim) rollari — ANIQ ro'yxat; eski «document.read → f2/smeta/narx» kengaytmasi ularga QO'LLANMAYDI.
  p := case p_rol
    when 'omborchi'   then array['company.read','object.read','document.read','fakt.read','warehouse.read','warehouse.write','warehouse.receive','procurement.read','logistics.read']
    when 'mexanik'    then array['company.read','object.read','document.read','machinery.read','machinery.write','machinery.log','warehouse.read']
    when 'kadr'       then array['company.read','object.read','document.read','hr.read','hr.write','hr.pii.read','hr.pii.write','hr.tabel.write']
    when 'taminotchi' then array['company.read','object.read','document.read','procurement.read','procurement.write','procurement.approve','supply.offer','supply.fulfil','logistics.read','logistics.dispatch','warehouse.read']
    when 'usta'       then array['company.read','object.read','document.read','fakt.read','self.work.read','self.work.write']
    when 'brigadir'   then array['company.read','object.read','document.read','fakt.read','self.work.read','self.work.write','hr.tabel.write']
    when 'haydovchi'  then array['company.read','self.work.read','self.work.write','logistics.trip','machinery.log']
    when 'inspektor'  then array['company.read','object.read','document.read','quality.read','quality.inspect','quality.decide']
    when 'loyihachi'  then array['company.read','object.read','document.read','document.write','design.read','design.write','design.issue']
    else null end;
  if p is not null then return p; end if;

  -- Mavjud rollar — o'zgarishsiz (20261017100629 dagi bilan bir xil) ...
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

  -- ... + faqat yangi domen capability lari.
  p := p || case p_rol
    when 'rahbar'   then array['procurement.read','logistics.read','warehouse.read','quality.read','design.read','hr.read','payroll.read','machinery.read']
    when 'bugalter' then array['accounting.approve','payroll.read','payroll.write','procurement.read','warehouse.read','hr.read']
    when 'pto'      then array['procurement.read','procurement.write','warehouse.read','logistics.read','quality.read','design.read','hr.read','machinery.read']
    when 'prorab'   then array['procurement.read','procurement.write','warehouse.read','warehouse.receive','logistics.read','quality.read','design.read','hr.read','hr.tabel.write','machinery.read']
    else array[]::text[] end;
  -- financial.* ↔ accounting.* taxallusi
  if 'financial.read'  = any(p) then p := p || array['accounting.read'];  end if;
  if 'financial.write' = any(p) then p := p || array['accounting.write']; end if;
  return coalesce((select array_agg(distinct x order by x) from unnest(p) x), array[]::text[]);
end $$;

-- Havola (ish joyi taklifi) orqali beriladigan rollar
alter table public.t2_ish_joyi_taklif drop constraint if exists t2_ish_joyi_taklif_rol_check;
alter table public.t2_ish_joyi_taklif add constraint t2_ish_joyi_taklif_rol_check check (rol = any (array[
  'rahbar','bugalter','pto','prorab','buyurtmachi','pudratchi','kuzatuvchi',
  'omborchi','mexanik','kadr','taminotchi','usta','brigadir','haydovchi','inspektor','loyihachi']));

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
  if p_rol not in ('rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi',
                   'omborchi', 'mexanik', 'kadr', 'taminotchi', 'usta', 'brigadir', 'haydovchi', 'inspektor', 'loyihachi') then
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
