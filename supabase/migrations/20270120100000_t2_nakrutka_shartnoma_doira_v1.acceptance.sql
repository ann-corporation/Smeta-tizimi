-- Qabul sinovi: migratsiyadan keyin tuzilma tekshiruvi (faqat o'qish; oxirida rollback).
-- Mantiqiy sinov: supabase/tests/t2_nakrutka_shartnoma_doira_contract.sql.
begin;
do $$
declare f text;
begin
  foreach f in array array['public.t2_podval_shartnoma_farq_v1(bigint,jsonb)', 'public._t2_nakrutka_qoralama_sinxron_v1(bigint[])',
    'public.t2_nakrutka_podval_saqla_v1(bigint,bigint,bigint,text,jsonb,bigint,integer,uuid,text)'] loop
    if to_regprocedure(f) is null then raise exception 'ACC missing %', f; end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then raise exception 'ACC anon/authenticated must not execute %', f; end if;
    if not has_function_privilege('service_role', f, 'execute') then raise exception 'ACC service_role must execute %', f; end if;
  end loop;
  if (select count(*) from pg_trigger where tgname in ('t2_nakrutka_koef_sinxron', 't2_nakrutka_podval_sinxron') and not tgisinternal) <> 2 then
    raise exception 'ACC sinxron triggerlari 2 ta emas';
  end if;
  if pg_get_functiondef('public.t2_nakrutka_podval_saqla_v1(bigint,bigint,bigint,text,jsonb,bigint,integer,uuid,text)'::regprocedure) not like '%SHARTNOMA_FOIZIDAN_FARQ%' then
    raise exception 'ACC saqla funksiyasida shartnoma tekshiruvi yo''q';
  end if;
end $$;
rollback;
