-- Acceptance: 20261214000000_t2_buyurtmachi_bugun_tolov_v1 (migratsiyadan KEYIN ishga tushiriladi; hammasi ROLLBACK).
begin;
set local statement_timeout = '300s';

do $$
begin
  if not exists (select 1 from public.t2_tomon_resurs where kalit = 'fakt' and faol) then raise exception 'fakt resursi faol emas'; end if;
  if not exists (select 1 from public.t2_tomon_resurs where kalit = 'tolov_holati' and faol) then raise exception 'tolov_holati resursi faol emas'; end if;
  if to_regclass('public.t2_tomon_tolov') is null then raise exception 't2_tomon_tolov yo''q'; end if;
  if exists (select 1 from pg_class where oid = 'public.t2_tomon_tolov'::regclass and not relrowsecurity) then raise exception 'RLS yoqilmagan'; end if;
  if has_table_privilege('anon', 'public.t2_tomon_tolov', 'select') or has_table_privilege('authenticated', 'public.t2_tomon_tolov', 'select') then raise exception 'anon/authenticated huquqi ochiq'; end if;
  if to_regprocedure('public.t2_zakazchik_bugun_v1(bigint,bigint)') is null then raise exception 't2_zakazchik_bugun_v1 yo''q'; end if;
  if has_function_privilege('authenticated', 'public.t2_zakazchik_bugun_v1(bigint,bigint)', 'execute') then raise exception 'authenticated RPC ni chaqira oladi'; end if;
  if to_regprocedure('public.t2_zakazchik_tolov_yoz_v1(bigint,bigint,bigint,bigint,numeric,date,text,text,uuid)') is null then raise exception 'tolov_yoz yo''q'; end if;
  if to_regprocedure('public.t2_tomon_tolov_qaror_v1(bigint,bigint,bigint,text,text)') is null then raise exception 'tolov_qaror yo''q'; end if;
end $$;

-- Cheklovlar: summa > 0, holat ro'yxati, t2_tolov.manba yangi qiymatni qabul qiladi
do $$
declare v_ok boolean;
begin
  select exists (select 1 from pg_constraint where conrelid = 'public.t2_tolov'::regclass and contype = 'c'
                  and pg_get_constraintdef(oid) like '%zakazchik_xabar%') into v_ok;
  if not v_ok then raise exception 't2_tolov.manba cheklovi yangilanmagan'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.t2_tomon_tolov'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%summa > 0%') then
    raise exception 'summa > 0 cheklovi yo''q';
  end if;
end $$;

-- Biznes tekshiruvi (haqiqiy buyurtmachi/pudratchi juftligi bo'lsa): begona aktor rad etiladi
do $$
declare v_a record; v_r jsonb;
begin
  select a.* into v_a from public.t2_tomon_aloqa a where a.holat = 'faol' and a.qabul_kompaniya_id is not null limit 1;
  if v_a.id is null then raise notice 'faol aloqa yo''q - biznes tekshiruvi o''tkazib yuborildi'; return; end if;
  begin
    perform public.t2_zakazchik_bugun_v1(-1, v_a.taklif_kompaniya_id);
    raise exception 'begona aktor bugun ro''yxatini ola oldi';
  exception when sqlstate '42501' then null;
  end;
end $$;

rollback;
