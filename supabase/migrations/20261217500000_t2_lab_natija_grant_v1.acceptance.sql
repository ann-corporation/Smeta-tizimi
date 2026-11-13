-- 20261217500000 acceptance. Faqat tranzaksiya + ROLLBACK ichida. Xulq (texnadzor/buyurtmachi o'qiydi, yozmaydi; grantsiz va begona rad; grant bekori
-- ko'rinishni yo'q qiladi; outbox uchinchi tomonga) supabase/tests/tomonlararo_zanjir_v1.acceptance.sql 4-qadamda tekshiriladi; bu yerda tuzilma.
do $$
begin
  if not exists (select 1 from public.t2_tomon_resurs where kalit = 'lab_natija' and faol and amallar = array['korish'] and not taqdim_mumkin) then raise exception 'ACC: lab_natija resursi (faqat korish) yo''q'; end if;
  if (select count(*) from public.t2_tomon_grant_shablon where resurs = 'lab_natija' and faol) < 3 then raise exception 'ACC: grant shablonlari yo''q'; end if;
  if to_regprocedure('public.t2_lab_natija_royxat_v1(bigint,bigint,bigint,integer)') is null or to_regprocedure('public.t2_lab_natija_tafsilot_v1(bigint,bigint,bigint)') is null then raise exception 'ACC: RPC yo''q'; end if;
  if has_function_privilege('anon', 'public.t2_lab_natija_royxat_v1(bigint,bigint,bigint,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_lab_natija_tafsilot_v1(bigint,bigint,bigint)', 'execute') then raise exception 'ACC: anon/authenticated chaqira oladi'; end if;
  if not exists (select 1 from pg_trigger where tgname = 't2_lab_natija_outbox_trg' and not tgisinternal) then raise exception 'ACC: outbox trigger yo''q'; end if;
  -- uchinchi tomon uchun yozish yo'li ochilmaganini tekshirish: t2_lab_sorov_natija_v1 hamon faqat lab_kompaniya_id bo'yicha qidiradi
  if position('lab_kompaniya_id = p_kompaniya_id' in pg_get_functiondef('public.t2_lab_sorov_natija_v1(bigint,bigint,bigint,integer,jsonb,bigint[])'::regprocedure)) = 0 then raise exception 'ACC: natija yozish doirasi o''zgargan'; end if;
  -- pul maydonlari uchinchi tomonga berilmaydi
  if position('summa' in pg_get_functiondef('public.t2_lab_natija_royxat_v1(bigint,bigint,bigint,integer)'::regprocedure)) > 0 then raise exception 'ACC: summa ochilib qolgan'; end if;
end $$;
