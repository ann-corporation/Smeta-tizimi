-- ROLLBACK: 20261110100000_t2_bugalter_f2_yozish_yopiq_v1 — bugalter ga F2 yozish capability larini QAYTARADI
-- (asl tana: A = 20261017100629, B = 20261108010000). Joriy tana qaysi variantda ekani tekshiriladi.
begin;

do $rb$
declare
  v_def text := pg_get_functiondef('public.t2_role_permissions_v2(text)'::regprocedure);
  v_ekotizim boolean := position('''omborchi''' in v_def) > 0;
begin
  if position('if p_rol in (''pto'',''prorab'',''bugalter'') then' in v_def) > 0 then
    raise notice 't2_role_permissions_v2: bugalter allaqachon asl holatda — o''zgarish yo''q';
    return;
  end if;
  if position('if p_rol in (''pto'',''prorab'') then' in v_def) = 0 then
    raise exception 'ROLE_PERMISSIONS_REBASE_REQUIRED: tana kutilgan variantga mos emas';
  end if;

  if not v_ekotizim then
    -- A — 20261017100629 dagi asl tana (prod dagi bilan aynan bir xil).
    execute $fn$
create or replace function public.t2_role_permissions_v2(p_rol text)
returns text[] language plpgsql immutable set search_path=public,pg_temp as $$
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
end $$;
$fn$;
  else
    -- B — 20261108010000 dagi asl tana.
    execute $fn$
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
$fn$;
  end if;
end $rb$;

revoke all on function public.t2_role_permissions_v2(text) from public, anon, authenticated;
grant execute on function public.t2_role_permissions_v2(text) to service_role;

commit;
