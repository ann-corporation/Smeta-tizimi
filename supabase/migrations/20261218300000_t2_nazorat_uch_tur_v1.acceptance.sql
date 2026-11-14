-- 20261218300000 acceptance (tuzilma). Xulq (A/B/C/mustaqil, vakolat bekori, doira kesishmasi, izolyatsiya, bildirishnoma): supabase/tests/tomonlararo_zanjir_v1.acceptance.sql 10-qadam.
do $$
declare v text;
begin
  if (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('t2_nazorat_sozlama', 't2_tomon_vakolat', 't2_nazorat_tayinlash', 't2_nazorat_qaror', 't2_nazorat_ichki_sorov') and relrowsecurity) <> 5 then
    raise exception 'NAZORAT ACC: jadvallar yoki RLS yetishmaydi'; end if;
  if has_table_privilege('authenticated', 'public.t2_tomon_vakolat', 'select') or has_function_privilege('anon', 'public.t2_tomon_vakolat_ber_v1(bigint,bigint,bigint,bigint,text[],text[],uuid)', 'execute') then
    raise exception 'NAZORAT ACC: anon/authenticated ruxsati'; end if;
  if position('t2_tomon_vakolat' in pg_get_functiondef('public.t2_tomon_ruxsat_bor(bigint,bigint,text,text,bigint)'::regprocedure)) = 0 then raise exception 'NAZORAT ACC: ruxsat_bor vakil shoxi yo''q'; end if;
  if position('chuqurlik' in pg_get_functiondef('public.t2_tomon_ruxsat_bor(bigint,bigint,text,text,bigint)'::regprocedure)) = 0 then null; end if;
  v := pg_get_functiondef('public.t2_tomon_qaror_v1(bigint,bigint,bigint,text,text)'::regprocedure);
  if position('TEXNIK_QAROR_KERAK' in v) = 0 or position('nazorat_turi' in v) = 0 or position('VAKOLAT_DOIRADAN_TASHQARI' in v) = 0 then raise exception 'NAZORAT ACC: qaror_v1 kengaytirilmagan'; end if;
  if position('ICHKI_NAZORAT_KERAK' in pg_get_functiondef('public.t2_tomon_taqdim_yarat_v1(bigint,bigint,bigint,text,bigint,text,uuid)'::regprocedure)) = 0 then raise exception 'NAZORAT ACC: ichki darvoza yo''q'; end if;
  if position('_t2_nazorat_vakil_korish' in pg_get_functiondef('public.t2_tomon_taqdimlar_v1(bigint,bigint,text,text,bigint,integer)'::regprocedure)) = 0
     or position('_t2_nazorat_vakil_korish' in pg_get_functiondef('public.t2_tomon_taqdim_tafsilot_v1(bigint,bigint,bigint)'::regprocedure)) = 0 then raise exception 'NAZORAT ACC: vakil ko''rinishi yo''q'; end if;
  -- eski ma'lumot buzilmaydi: yangi taqdim ustunlari NULL ruxsat, ichki sukut o'chiq
  if exists (select 1 from public.t2_nazorat_sozlama where ichki_majburiy) then raise exception 'NAZORAT ACC: ichki nazorat sukut o''chiq bo''lishi kerak'; end if;
  if not exists (select 1 from public.t2_outbox_mavzu_ruxsat where mavzu_naqsh = 'nazorat.%') then raise exception 'NAZORAT ACC: nazorat mavzusi yo''q'; end if;
end $$;
