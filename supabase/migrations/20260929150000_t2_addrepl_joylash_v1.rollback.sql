-- Rollback: joylash blokini ORDERING_GAP_REQUIRED shakliga qaytarish va
-- t2_ish_resurslar_bilan_yarat_v1 ni 20260928160000 dagi ko'rinishiga qaytarish.
-- Allaqachon yaratilgan qatorlarning tartibi o'zgartirilmaydi (ular to'g'ri joyda).
begin;
do $rb$
declare
  d text;
  yangi text := $e$ if after_id is not null then
   select tartib+1 into ordering from public.t2_qator where id=after_id and obyekt_id=o and ota_id=parent_id;
   if not found then raise exception 'ORDERING_SCOPE_INVALID'; end if;
   if exists(select 1 from public.t2_qator where obyekt_id=o and tartib=ordering) then
     raise exception 'ORDERING_GAP_REQUIRED';
   end if;
 else$e$;
  bosh integer; oxir integer;
begin
  select pg_get_functiondef('public.t2_addrepl_execute_v1(jsonb)'::regprocedure) into d;
  bosh := position(' if after_id is not null then' in d);
  oxir := position(E'\n else select coalesce(max(tartib),0)+1' in d);
  if bosh = 0 or oxir = 0 then raise exception 'ROLLBACK_ANCHOR_NOT_FOUND'; end if;
  execute substr(d, 1, bosh - 1) || yangi || substr(d, oxir + length(E'\n else'));
end
$rb$;
revoke all on function public.t2_addrepl_execute_v1(jsonb) from public, anon, authenticated;
commit;
-- t2_ish_resurslar_bilan_yarat_v1: 20260928160000_t2_ish_resurslar_bilan_yarat_v1.sql ni qayta qo'llang.
