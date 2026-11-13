-- 20261217000000 acceptance: bekor F2 va fakt hujjatlari direktor panelidagi F2 jamiga kirmaydi. Faqat tranzaksiya + ROLLBACK ichida.
do $$
declare v_k bigint; v_u bigint; v_def text;
begin
  select pg_get_functiondef('public.t2_boss_dashboard_v1(bigint,bigint)'::regprocedure) into v_def;
  if v_def not like '%a.tur=''f2'' and a.holat<>''bekor''%' then raise exception 'dashboard F2 filter missing'; end if;
  if v_def like '%where a.kompaniya_id=p_kompaniya_id;%' then raise exception 'unfiltered F2 aggregate still present'; end if;
end $$;
-- Behavioral proof: supabase/tests/oltin_zanjir_v1.acceptance.sql step 11 (dashboard f2.jami = live F2 total after storno).