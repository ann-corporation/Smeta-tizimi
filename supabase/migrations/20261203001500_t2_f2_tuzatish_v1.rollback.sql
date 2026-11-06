-- ROLLBACK: 20261203001500_t2_f2_tuzatish_v1.sql
-- O'zgargan funksiyalar *_pre_20261203001500 nusxalaridan AYNAN qaytariladi, nusxalar va yangi yordamchilar o'chiriladi,
-- trigger nomi qaytariladi. t2_qator_holat.fakt_summa_nomalum ustuni QOLADI (CREATE OR REPLACE VIEW ustunni olib tashlay
-- olmaydi, 17 ta bog'liq view bor); u qo'shimcha va hech kim unga tayanmaydi — zararsiz.
-- Ma'lumot: rollback dan keyin storno qatorlari (bir qator_id da bir nechta storno) va rad etilgandan qaytgan qoralamalar
-- joyida qoladi — o'chirilmaydi (yuridik iz).
begin;

do $do$
declare s text; f text; a text; d text;
begin
  foreach s in array array[
    't2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text)',
    't2_f2_qoralama_yangila_v1(bigint,bigint,bigint,integer,jsonb,uuid,text)',
    't2_akt_lifecycle_transition_v1(bigint,bigint,text,bigint,integer,uuid,text)',
    't2_akt_lifecycle_projection_guard_v1()',
    't2_akt_qator_versiya_guard()',
    '_t2_f2_takror_xato(jsonb)',
    '_t2_f2_storno_manba_xato(jsonb,bigint,bigint)'] loop
    f := split_part(s, '(', 1); a := split_part(s, '(', 2);
    if to_regprocedure(format('public.%s_pre_20261203001500(%s', f, a)) is null then
      raise exception 'F2_TUZATISH ROLLBACK: % zaxira nusxasi topilmadi', f;
    end if;
    d := pg_get_functiondef(format('public.%s_pre_20261203001500(%s', f, a)::regprocedure);
    execute replace(d, format('FUNCTION public.%s_pre_20261203001500(', f), format('FUNCTION public.%s(', f));
    execute format('drop function public.%s_pre_20261203001500(%s', f, a);
  end loop;
  if position('f2_tuzatish_20261203001500' in pg_get_functiondef('public.t2_akt_lifecycle_transition_v1(bigint,bigint,text,bigint,integer,uuid,text)'::regprocedure)) > 0
     or position('f2_tuzatish_20261203001500' in pg_get_functiondef('public.t2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text)'::regprocedure)) > 0
     or position('20261203001500' in pg_get_functiondef('public.t2_f2_qoralama_yangila_v1(bigint,bigint,bigint,integer,jsonb,uuid,text)'::regprocedure)) > 0 then
    raise exception 'F2_TUZATISH ROLLBACK: eski ta''rif qaytmadi';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.t2_akt'::regclass and tgname = 't2_akt_zz_raqam_takror') then
    alter trigger t2_akt_zz_raqam_takror on public.t2_akt rename to t2_akt_raqam_takror;
  end if;
end $do$;

drop function if exists public._t2_f2_storno_qator_xato(jsonb, bigint);
drop function if exists public._t2_f2_almashtirilgan_oddiy(jsonb);
drop function if exists public._t2_f2_storno_ruxsat(jsonb);
drop function if exists public._t2_f2_akt_bogliq_v1(bigint);
drop function if exists public._t2_f2_akt_paket_v1(bigint);
drop function if exists public._t2_f2_narxsiz_avto_soni(bigint);
drop function if exists public._t2_f2_storno_manba_qator(jsonb);

commit;
