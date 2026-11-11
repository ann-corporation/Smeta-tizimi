-- Acceptance: 20261214200000_t2_loyihachi_chizma_v1 (BEGIN..ROLLBACK; prodga yozuv qolmaydi).
begin;
set local statement_timeout = '300s';

do $$
declare v_fn text; v_n integer;
begin
  -- 1. Jadvallar va RLS
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('t2_chizma_toplam', 't2_chizma_revizya', 't2_chizma_boglanish', 't2_chizma_taklif') and c.relrowsecurity;
  if v_n <> 4 then raise exception 'ACCEPT: 4 jadval va RLS kutilgan, bor %', v_n; end if;

  -- 2. Barcha RPC lar mavjud va faqat service_role chaqiradi
  foreach v_fn in array array['t2_chizma_toplam_saqla_v1','t2_chizma_revizya_yarat_v1','t2_chizma_revizya_tahrir_v1','t2_chizma_taklif_yoz_v1','t2_chizma_chiqar_v1',
    't2_chizma_bekor_v1','t2_chizma_royxat_v1','t2_chizma_taklif_royxat_v1','t2_chizma_qaror_v1','t2_chizma_boglash_v1','t2_chizma_taasir_v1','t2_chizma_taklif_pto_v1',
    't2_chizma_fayl_ol_v1','t2_loyihachi_bugun_v1'] loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_fn) then raise exception 'ACCEPT: % yo''q', v_fn; end if;
    if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_fn and has_function_privilege('anon', p.oid, 'execute')) then
      raise exception 'ACCEPT: % anon uchun ochiq', v_fn; end if;
  end loop;

  -- 3. Resurs va taqdim manbasi
  if not exists (select 1 from public.t2_tomon_resurs where kalit = 'chizma' and faol and taqdim_mumkin) then raise exception 'ACCEPT: chizma resursi yo''q'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.t2_tomon_taqdim'::regclass and pg_get_constraintdef(oid) like '%t2_chizma_revizya%') then
    raise exception 'ACCEPT: taqdim manba cheklovi chizmani o''z ichiga olmaydi'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.t2_tomon_taqdim'::regclass and pg_get_constraintdef(oid) like '%t2_aosr%') then
    raise exception 'ACCEPT: mavjud t2_aosr manbasi yo''qolgan'; end if;

  -- 4. Rol -> murojaat: loyihachi va pudratchi roli bor, qaror huquqi (texnadzor) saqlangan
  if not public._t2_tomon_rol_ok('loyihachi', 'murojaat') or not public._t2_tomon_rol_ok('pto', 'murojaat') or not public._t2_tomon_rol_ok('buyurtmachi', 'murojaat') then
    raise exception 'ACCEPT: murojaat roli tuzatilmagan'; end if;
  if public._t2_tomon_rol_ok('kuzatuvchi', 'murojaat') then raise exception 'ACCEPT: kuzatuvchi murojaat yoza olmasligi kerak'; end if;
  if not public._t2_tomon_rol_ok('inspektor', 'qaror') then raise exception 'ACCEPT: inspektor qarori yo''qolgan'; end if;
end $$;

-- 5. Cheklovlar: bog'lanish aynan bitta manbaga; taklif turi
do $$
declare v_ok boolean := false;
begin
  begin
    insert into public.t2_chizma_boglanish (kompaniya_id, toplam_id, obyekt_id, qator_id, aosr_id, revizya, actor_id) values (1, 1, 1, 1, 1, 0, 1);
  exception when check_violation or foreign_key_violation then v_ok := true; end;
  if not v_ok then raise exception 'ACCEPT: bog''lanish cheklovi ishlamadi'; end if;
end $$;

-- 6. Haqiqiy a'zosiz actor RPC ga kira olmaydi (42501)
do $$
begin
  begin
    perform public.t2_chizma_royxat_v1(-1, -1, null);
    raise exception 'ACCEPT: a''zosiz actor o''tib ketdi';
  exception when sqlstate '42501' then null; end;
end $$;

rollback;
