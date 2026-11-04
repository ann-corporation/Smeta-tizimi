-- Qabul testi (o'z-o'zini urug'laydi, hamma narsa ROLLBACK): ilova modullari mavjud, sukut 'on', kompaniya override ishlaydi.
-- Fikstura prod NOT NULL cheklovlariga mos: t2_capability_override(capability_kod, scope, scope_id, holat) - id identity (ALWAYS), qolganlari null/default.
begin;

do $$
declare
  v_kodlar text[] := array['module.moliya','module.sotuv','module.xarid','module.hr','module.logistika','module.hujjat','module.desktop'];
  v_k text; v_e jsonb; v_son int;
  v_kid constant bigint := 987654321; -- bo'lmagan kompaniya: effective_v1 a'zolik so'ramaydi
begin
  select count(*) into v_son from public.t2_capability where turi = 'module' and kod = any (v_kodlar) and default_holat = 'on' and kill_switch = false;
  if v_son <> 7 then raise exception 'ACCEPT_FAIL: 7 ta ilova moduli (default on) kutilgan, bor: %', v_son; end if;

  foreach v_k in array v_kodlar loop
    v_e := public.t2_capability_effective_v1(v_k, v_kid, null);
    if v_e->>'holat' is distinct from 'on' then raise exception 'ACCEPT_FAIL: % sukut on emas: %', v_k, v_e; end if;
  end loop;

  -- kompaniya override: o'chirish faqat shu kompaniyaga ta'sir qiladi
  insert into public.t2_capability_override (capability_kod, scope, scope_id, holat, sabab) values ('module.sotuv', 'company', v_kid, 'off', 'acceptance');
  if public.t2_capability_effective_v1('module.sotuv', v_kid, null)->>'holat' is distinct from 'off' then raise exception 'ACCEPT_FAIL: override off ishlamadi'; end if;
  if public.t2_capability_effective_v1('module.sotuv', v_kid + 1, null)->>'holat' is distinct from 'on' then raise exception 'ACCEPT_FAIL: override boshqa kompaniyaga tarqaldi'; end if;
  if public.t2_capability_effective_v1('module.moliya', v_kid, null)->>'holat' is distinct from 'on' then raise exception 'ACCEPT_FAIL: boshqa modul o''zgardi'; end if;

  -- mavjud modullar tegilmagan
  select count(*) into v_son from public.t2_capability where turi = 'module' and kod in ('module.narx','module.loyiha','module.erp','module.aosr');
  if v_son <> 4 then raise exception 'ACCEPT_FAIL: eski modullar saqlanmagan (%)', v_son; end if;
end $$;

rollback;