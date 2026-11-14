-- Rollback: USTAMA_BIR_XIL_V1. t2_nakopitelniy_v2 ni migratsiya oldingi (asl) matniga qaytaradi, yordamchi funksiyani o'chiradi.
do $rb$
declare v_tarif text;
begin
  select tarif into v_tarif from public._t2_fn_zaxira where nom = 't2_nakopitelniy_v2:20261219100000';
  if v_tarif is null then raise exception 'USTAMA_BIR_XIL rollback: asl matn _t2_fn_zaxira da yo''q'; end if;
  execute v_tarif;
  delete from public._t2_fn_zaxira where nom = 't2_nakopitelniy_v2:20261219100000';
end
$rb$;

drop function if exists public._t2_akt_qator_yaxlit_summami_v1(numeric, numeric, numeric);
drop table if exists public._t2_fn_zaxira;  -- boshqa zaxira yozuvi bo'lsa (kelajakda) bu qatorni olib tashlang
