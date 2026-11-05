-- ROLLBACK: 20261203000100_t2_f2_storno_takror_qator_v1.sql
-- Migratsiyadan oldingi prod ta'riflari *_pre_20261203000100 nusxalaridan AYNAN qaytariladi (pg_get_functiondef), so'ng
-- nusxalar va yordamchilar o'chiriladi. Grantlar create or replace da saqlanadi.
begin;

do $do$
declare f text; args text; d text;
begin
  foreach f in array array['t2_akt_yarat_v2', 't2_f2_qoralama_yangila_v1'] loop
    args := case f when 't2_akt_yarat_v2' then 'bigint,date,jsonb,bigint,text,uuid,text' else 'bigint,bigint,bigint,integer,jsonb,uuid,text' end;
    if to_regprocedure(format('public.%s_pre_20261203000100(%s)', f, args)) is null then
      raise exception 'STORNO_TAKROR ROLLBACK: % zaxira nusxasi topilmadi', f;
    end if;
    d := pg_get_functiondef(format('public.%s_pre_20261203000100(%s)', f, args)::regprocedure);
    execute replace(d, format('FUNCTION public.%s_pre_20261203000100(', f), format('FUNCTION public.%s(', f));
    execute format('drop function public.%s_pre_20261203000100(%s)', f, args);
  end loop;
  if position('_t2_f2_takror_xato' in pg_get_functiondef('public.t2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text)'::regprocedure)) > 0
     or position('_t2_f2_takror_xato' in pg_get_functiondef('public.t2_f2_qoralama_yangila_v1(bigint,bigint,bigint,integer,jsonb,uuid,text)'::regprocedure)) > 0 then
    raise exception 'STORNO_TAKROR ROLLBACK: eski ta''rif qaytmadi';
  end if;
end $do$;

drop function if exists public._t2_f2_storno_manba_xato(jsonb, bigint, bigint);
drop function if exists public._t2_f2_takror_xato(jsonb);
drop function if exists public._t2_f2_storno_qatormi(jsonb);

commit;
