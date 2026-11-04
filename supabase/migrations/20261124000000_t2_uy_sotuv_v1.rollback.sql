-- ROLLBACK 20261124000000_t2_uy_sotuv_v1: sotuv jadvallari va RPC lari olib tashlanadi (MA'LUMOT O'CHADI — faqat modul
-- ishlatilmagan bo'lsa qo'llang), ruxsatlar katalogi va rollar 20261110100000 holatiga qaytadi, «sotuvchi» roli taklif cheklovidan olinadi.
begin;

do $do$ begin
  if exists (select 1 from public.t2_sotuv_bitim limit 1) then
    raise exception 'ROLLBACK_BLOCKED: t2_sotuv_bitim da ma''lumot bor — avval eksport qiling';
  end if;
end $do$;

drop function if exists public.t2_sotuv_panel_v1(bigint,bigint,bigint);
drop function if exists public.t2_sotuv_mijozlar_v1(bigint,bigint,text);
drop function if exists public.t2_sotuv_bitim_v1(bigint,bigint,bigint);
drop function if exists public.t2_sotuv_bitimlar_v1(bigint,bigint,jsonb);
drop function if exists public.t2_sotuv_shaxmatka_v1(bigint,bigint,bigint);
drop function if exists public._t2_sotuv_samarali_holat(text,timestamptz);
drop function if exists public.t2_sotuv_tolov_bekor_v1(bigint,bigint,bigint,text);
drop function if exists public.t2_sotuv_tolov_yoz_v1(bigint,bigint,bigint,date,numeric,text,text,text,text,uuid);
drop function if exists public.t2_sotuv_grafik_saqla_v1(bigint,bigint,bigint,jsonb,uuid);
drop function if exists public.t2_sotuv_bron_bekor_v1(bigint,bigint,bigint,text);
drop function if exists public.t2_sotuv_bron_v1(bigint,bigint,bigint,bigint,integer,numeric,uuid);
drop function if exists public.t2_sotuv_bitim_saqla_v1(bigint,bigint,jsonb,uuid);
drop function if exists public._t2_sotuv_mijoz_upsert(bigint,bigint,jsonb);
drop function if exists public.t2_sotuv_birlik_holat_v1(bigint,bigint,bigint,text,text,integer);
drop function if exists public.t2_sotuv_narx_ozgartir_v1(bigint,bigint,bigint[],text,numeric,text,uuid);
drop function if exists public.t2_sotuv_birlik_saqla_v1(bigint,bigint,bigint,jsonb,uuid);
drop function if exists public.t2_sotuv_loyiha_saqla_v1(bigint,bigint,bigint,jsonb,uuid);
drop function if exists public._t2_sotuv_bron_tozala(bigint);
drop function if exists public._t2_sotuv_audit(bigint,text,bigint,text,jsonb,jsonb,bigint,uuid);
drop function if exists public._t2_sotuv_op_yoz(uuid,bigint,text,jsonb);
drop function if exists public._t2_sotuv_op(uuid,bigint);
drop function if exists public._t2_sotuv_tel(text);

drop table if exists public.t2_sotuv_operatsiya, public.t2_sotuv_audit, public.t2_sotuv_tolov, public.t2_sotuv_grafik, public.t2_sotuv_bron,
  public.t2_sotuv_bitim, public.t2_sotuv_mijoz, public.t2_sotuv_narx_tarix, public.t2_sotuv_birlik, public.t2_sotuv_planirovka, public.t2_sotuv_loyiha;

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

  -- Mavjud rollar — o'zgarishsiz (20261110100000 dagi bilan bir xil) ...
  p:=case p_rol
    when 'rahbar' then array['company.read','control.company.read','project.read','object.read','document.read','financial.read']
    when 'bugalter' then array['company.read','financial.read','financial.write','document.read']
    when 'pto' then array['company.read','project.read','project.write','object.read','object.write','document.read','document.write','financial.read','financial.write']
    when 'prorab' then array['company.read','project.read','project.write','object.read','object.write','document.read','document.write']
    when 'buyurtmachi' then array['company.read','project.read','object.read','document.read','financial.read']
    when 'pudratchi' then array['company.read','project.read','object.read','document.read']
    when 'kuzatuvchi' then array['company.read','project.read','object.read','document.read'] else array[]::text[] end;
  if 'document.read'=any(p) then p:=p||array['f2.read','smeta.read','fakt.read','narx.read']; end if;
  -- Egasi 2026-10-26: buxgalter F2 ni faqat o'qiydi (import/tayyorlash/tasdiqlash/bekor/tuzatish — yo'q).
  if p_rol in ('pto','prorab') then p:=p||array['f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct']; end if;
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

do $do$ begin
  if to_regclass('public.t2_ish_joyi_taklif') is not null then
    delete from public.t2_ish_joyi_taklif where rol = 'sotuvchi';
    alter table public.t2_ish_joyi_taklif drop constraint if exists t2_ish_joyi_taklif_rol_check;
    alter table public.t2_ish_joyi_taklif add constraint t2_ish_joyi_taklif_rol_check check (rol = any (array[
      'rahbar','bugalter','pto','prorab','buyurtmachi','pudratchi','kuzatuvchi','omborchi','mexanik','kadr','taminotchi','usta','brigadir',
      'haydovchi','inspektor','loyihachi']::text[]));
  end if;
end $do$;

do $do$ declare f record; d text; begin
  for f in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 't2_ish_joyi_taklif_yarat_v1' loop
    d := pg_get_functiondef(f.oid);
    if position($s$'loyihachi', 'sotuvchi')$s$ in d) > 0 then
      execute replace(d, $s$'loyihachi', 'sotuvchi')$s$, $s$'loyihachi')$s$);
    end if;
  end loop;
end $do$;

commit;
