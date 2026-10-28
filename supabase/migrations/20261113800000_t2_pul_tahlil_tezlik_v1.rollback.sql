-- Rollback: PUL TAHLILI TEZLIK v1 — t2_pul_tahlil_v1 eski nusxadan (t2_pul_tahlil_v1_eski = migratsiyadan oldingi prod
-- ta'rifi) aynan qaytariladi, eski nusxalar va yangi indeks o'chiriladi. Ruxsatlar CREATE OR REPLACE bilan saqlanadi.
begin;
do $do$
declare d text;
begin
  if to_regprocedure('public.t2_pul_tahlil_v1_eski(bigint,bigint,bigint,bigint,date,date,text)') is null then
    raise exception 'PUL_TEZLIK rollback: t2_pul_tahlil_v1_eski topilmadi';
  end if;
  d := pg_get_functiondef('public.t2_pul_tahlil_v1_eski(bigint,bigint,bigint,bigint,date,date,text)'::regprocedure);
  execute replace(d, 'FUNCTION public.t2_pul_tahlil_v1_eski(', 'FUNCTION public.t2_pul_tahlil_v1(');
  if (select md5(prosrc) from pg_proc where oid = 'public.t2_pul_tahlil_v1(bigint,bigint,bigint,bigint,date,date,text)'::regprocedure)
     <> 'daac3ad4809a8267b77c75ac1625d3e0' then
    raise exception 'PUL_TEZLIK rollback: qaytarilgan t2_pul_tahlil_v1 md5 mos emas';
  end if;
end $do$;
drop function if exists public.t2_pul_tahlil_v2_eski(bigint,bigint,bigint,bigint,date,date,text,text);
drop function public.t2_pul_tahlil_v1_eski(bigint,bigint,bigint,bigint,date,date,text);
drop index if exists public.t2_akt_qator_akt_id_id_idx;
commit;
