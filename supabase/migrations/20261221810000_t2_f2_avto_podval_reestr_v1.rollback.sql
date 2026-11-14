-- Teskari: triggerlar va yordamchilar olib tashlanadi; t2_akt_yarat_v2 javobidan 'podval' olinadi.
-- Yozilgan t2_akt_podval / t2_f2_reestr_jami qatorlari QOLADI (ma'lumot; kerak bo'lsa qo'lda: kim like 'avto:%').
drop trigger if exists t2_akt_podval_avto on public.t2_akt;
drop trigger if exists t2_akt_reestr_avto on public.t2_akt;
do $rb$
declare v_def text; v_a constant text := '''podval'', public._t2_akt_podval_holat_v1(v_akt_id), ';
begin
  select pg_get_functiondef('public.t2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text)'::regprocedure) into v_def;
  if position(v_a in v_def) > 0 then execute replace(v_def, v_a, ''); end if;
end $rb$;
drop function if exists public.t2_f2_reestr_toldir_v1(bigint, boolean);
drop function if exists public.t2_akt_podval_backfill_qoralama_v1(bigint);
drop function if exists public._t2_akt_reestr_avto_trg_v1();
drop function if exists public._t2_f2_reestr_bekor_v1(bigint);
drop function if exists public._t2_f2_reestr_avto_v1(bigint);
drop function if exists public._t2_akt_podval_avto_trg_v1();
drop function if exists public._t2_akt_podval_holat_v1(bigint);
drop function if exists public._t2_akt_podval_smeta_v1(bigint, text, boolean);