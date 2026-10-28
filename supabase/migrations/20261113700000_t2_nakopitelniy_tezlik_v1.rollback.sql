-- Rollback: NAKOPITELNIY TEZLIK v1 — eski nusxalardan (*_eski = migratsiyadan oldingi prod ta'rifi) aynan qaytariladi,
-- keyin eski nusxalar o'chiriladi. Ruxsatlar CREATE OR REPLACE bilan saqlanadi.
begin;
do $do$
declare d text;
begin
  if to_regprocedure('public.t2_almashtirilgan_oz_hajm_eski(bigint)') is null
     or to_regprocedure('public.t2_almashtirilgan_hajm_eski(bigint)') is null
     or to_regprocedure('public.t2_nakopitelniy_v2_eski(bigint,bigint,date,integer,boolean,integer)') is null then
    raise exception 'NAK_TEZLIK rollback: eski nusxalar topilmadi';
  end if;
  d := pg_get_functiondef('public.t2_almashtirilgan_oz_hajm_eski(bigint)'::regprocedure);
  execute replace(d, 'FUNCTION public.t2_almashtirilgan_oz_hajm_eski(', 'FUNCTION public.t2_almashtirilgan_oz_hajm(');
  d := pg_get_functiondef('public.t2_almashtirilgan_hajm_eski(bigint)'::regprocedure);
  d := replace(d, 'FUNCTION public.t2_almashtirilgan_hajm_eski(', 'FUNCTION public.t2_almashtirilgan_hajm(');
  execute replace(d, 'public.t2_almashtirilgan_oz_hajm_eski(', 'public.t2_almashtirilgan_oz_hajm(');
  d := pg_get_functiondef('public.t2_nakopitelniy_v2_eski(bigint,bigint,date,integer,boolean,integer)'::regprocedure);
  d := replace(d, 'FUNCTION public.t2_nakopitelniy_v2_eski(', 'FUNCTION public.t2_nakopitelniy_v2(');
  execute replace(d, 'public.t2_almashtirilgan_hajm_eski(', 'public.t2_almashtirilgan_hajm(');
end $do$;
drop function public.t2_nakopitelniy_v2_eski(bigint,bigint,date,integer,boolean,integer);
drop function public.t2_almashtirilgan_hajm_eski(bigint);
drop function public.t2_almashtirilgan_oz_hajm_eski(bigint);
commit;
