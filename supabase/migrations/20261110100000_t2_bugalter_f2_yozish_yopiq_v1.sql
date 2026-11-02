-- ⚠ T2 — BUXGALTER F2 NI FAQAT O'QIYDI (egasi qarori 2026-10-26, Codex review JQA-10).
-- HOLAT: koordinator prodga qo'llaydi (BEGIN..ROLLBACK acceptance dan keyin). Frontend aksi: lib/nav/menyuRolYopiq.ts,
--        lib/company-authorization/effective-authorization.ts (ROLE_PERMISSIONS mirror).
--
-- Nima o'zgaradi: t2_role_permissions_v2 — `bugalter` endi f2.import, f2.prepare, f2.approve, f2.cancel, f2.correct
-- OLMAYDI. f2.read (va smeta/fakt/narx.read) qoladi; boshqa hech bir rol o'zgarmaydi.
-- Ta'sir: t2_azolik_permissions_v2 → t2_permission_allowed_v2 / t2_require_permission_v2 orqali capability ga tayanadigan
-- RPC lar (t2_akt_lifecycle_transition_v1, t2_akt_correction_create_v1, t2_f2_import_job_*_v1, t2_f2_import_draft_saqla_v1,
-- t2_f2_qoralama_yangila_v1 …) buxgalterni PERMISSION_DENIED bilan rad etadi; t2_men_v1 permissions dan ham chiqadi.
--
-- ⚠ IKKI VARIANT: prod da hozir 20261017100629 dagi tana turibdi (20261108010000 «ekotizim» hali qo'llanmagan).
-- Repo da esa 20261108010000 tanasi oxirgisi. Shuning uchun joriy tana tekshiriladi va MOS to'liq tana yoziladi:
--   A) 20261017100629 tanasi (prod)          → A' (bugalter satridan olib tashlangan)
--   B) 20261108010000 tanasi (ekotizim bilan) → B' (bugalter satridan olib tashlangan)
-- Allaqachon olib tashlangan bo'lsa — hech narsa qilinmaydi (idempotent). Boshqa noma'lum tana — xato (qo'lda rebase).
-- MUHIM: 20261108010000 keyinroq prodga qo'llansa, u bugalterni QAYTA qo'shadi → undan keyin SHU migratsiyani yana
-- qo'llang (u B variantini taniydi).

begin;

do $mig$
declare
  v_def text := pg_get_functiondef('public.t2_role_permissions_v2(text)'::regprocedure);
  v_eski_satr constant text := 'if p_rol in (''pto'',''prorab'',''bugalter'') then';
  v_yangi_satr constant text := 'if p_rol in (''pto'',''prorab'') then';
  v_ekotizim boolean;
begin
  if position(v_eski_satr in v_def) = 0 then
    if position(v_yangi_satr in v_def) > 0 then
      raise notice 't2_role_permissions_v2: bugalter F2 yozish allaqachon yopiq — o''zgarish yo''q';
      return;
    end if;
    raise exception 'ROLE_PERMISSIONS_REBASE_REQUIRED: t2_role_permissions_v2 tanasi kutilgan variantlarga mos emas';
  end if;
  v_ekotizim := position('''omborchi''' in v_def) > 0;

  if not v_ekotizim then
    -- A' — 20261017100629 tanasi, faqat bugalter F2 yozish capability laridan mahrum.
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
  -- Egasi 2026-10-26: buxgalter F2 ni faqat o'qiydi (import/tayyorlash/tasdiqlash/bekor/tuzatish — yo'q).
  if p_rol in ('pto','prorab') then p:=p||array['f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct']; end if;
  if 'object.write'=any(p) then p:=p||array['smeta.write','fakt.write','narx.write']; end if;
  return p;
end $$;
$fn$;
  else
    -- B' — 20261108010000 (ekotizim) tanasi, faqat bugalter F2 yozish capability laridan mahrum.
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
$fn$;
  end if;

  -- Natija tekshiruvi (shu tranzaksiya ichida): bugalter F2 yozmaydi, pto/prorab yozadi, f2.read qoladi.
  if array['f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct'] && public.t2_role_permissions_v2('bugalter') then
    raise exception 'BUGALTER_F2_YOZISH_QOLDI';
  end if;
  if not ('f2.read' = any (public.t2_role_permissions_v2('bugalter'))) then raise exception 'BUGALTER_F2_READ_YOQOLDI'; end if;
  if not (array['f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct'] <@ public.t2_role_permissions_v2('pto'))
     or not (array['f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct'] <@ public.t2_role_permissions_v2('prorab')) then
    raise exception 'PTO_PRORAB_F2_YOZISH_YOQOLDI';
  end if;
end $mig$;

-- Imtiyozlar (CREATE OR REPLACE saqlaydi; aniq qayta tasdiqlanadi).
revoke all on function public.t2_role_permissions_v2(text) from public, anon, authenticated;
grant execute on function public.t2_role_permissions_v2(text) to service_role;

commit;
