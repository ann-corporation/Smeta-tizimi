-- 20261217700000 acceptance (tuzilma). Xulq: supabase/tests/tomonlararo_zanjir_v1.acceptance.sql (A: rolga qarab bildirishnoma, B: ochiq lot v2, C: lab protokol fayli).
do $$
begin
  if not exists (select 1 from public.t2_outbox_mavzu_ruxsat where mavzu_naqsh = 'lab.natija') or (select count(*) from public.t2_outbox_mavzu_ruxsat) < 8 then raise exception 'ACC A: mavzu->ruxsat jadvali to''liq emas'; end if;
  if position('t2_outbox_mavzu_ruxsat' in pg_get_functiondef('public.t2_outbox_ishlov_v1(text,integer)'::regprocedure)) = 0 then raise exception 'ACC A: dispetcher jadvalni ishlatmayapti'; end if;
  if has_table_privilege('authenticated', 'public.t2_outbox_mavzu_ruxsat', 'select') then raise exception 'ACC A: jadval ochiq'; end if;
  if position('OCHIQ_V2_KERAK' in pg_get_functiondef('public.t2_tender_elon_v1(bigint,bigint,uuid,text,text,bigint[],bigint,timestamp with time zone,jsonb,jsonb)'::regprocedure)) = 0 then raise exception 'ACC B: v1 ochiq rad etilmagan'; end if;
  if exists (select 1 from public.t2_birja_rfq where doira = 'ochiq' and not protsess_v2 and holat = 'elon') then raise exception 'ACC B: v1 ochiq e''londagi lot qolgan'; end if;
  if position('lab_natija' in pg_get_functiondef('public.t2_tomon_hujjat_ol_v1(bigint,bigint)'::regprocedure)) = 0 then raise exception 'ACC C: hujjat_ol lab protokolini bilmaydi'; end if;
end $$;
