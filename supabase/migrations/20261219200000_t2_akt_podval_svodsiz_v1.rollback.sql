-- Rollback: AKT_PODVAL_SVODSIZ_V1. _t2_summa_agg_v1 (7 arg) ni migratsiya oldingi matniga qaytaradi.
do $rb$
declare v_tarif text;
begin
  select tarif into v_tarif from public._t2_fn_zaxira where nom = '_t2_summa_agg_v1:20261219200000';
  if v_tarif is null then raise exception 'AKT_PODVAL_SVODSIZ rollback: asl matn _t2_fn_zaxira da yo''q'; end if;
  execute v_tarif;
  delete from public._t2_fn_zaxira where nom = '_t2_summa_agg_v1:20261219200000';
end
$rb$;
-- _t2_fn_zaxira jadvali boshqa migratsiyalar ham ishlatadi - o'chirilmaydi.
