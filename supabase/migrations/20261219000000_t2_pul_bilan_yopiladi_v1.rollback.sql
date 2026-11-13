-- Rollback: 20261219000000_t2_pul_bilan_yopiladi_v1. t2_nakopitelniy_v2 avvalgi ta'rifga qaytadi (saqlangan _pre_ nusxadan); predikat o'chadi.
do $r$
declare d text;
begin
  if to_regprocedure('public.t2_nakopitelniy_v2_pre_20261219000000(bigint,bigint,date,integer,boolean,integer)') is not null then
    d := pg_get_functiondef('public.t2_nakopitelniy_v2_pre_20261219000000(bigint,bigint,date,integer,boolean,integer)'::regprocedure);
    d := replace(d, 'public.t2_nakopitelniy_v2_pre_20261219000000(', 'public.t2_nakopitelniy_v2(');
    execute d;
    revoke all on function public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer) from public, anon, authenticated;
    grant execute on function public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer) to service_role;
    drop function public.t2_nakopitelniy_v2_pre_20261219000000(bigint,bigint,date,integer,boolean,integer);
  end if;
end $r$;
drop function if exists public.t2_pul_bilan_yopiladi_v1(text, numeric);
