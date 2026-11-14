-- Qaytarish: svod bo'limida fakt yana yaxlit (F-2 dan farqli).
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public._t2_summa_agg_v1(bigint[],text,bigint[],date,date,text,text)'::regprocedure);
  n := replace(d, $b$p_olchov in ('f2', 'f2_qoralama', 'aktlar', 'fakt') and b.turi = 'svod'$b$, $a$p_olchov in ('f2', 'f2_qoralama', 'aktlar') and b.turi = 'svod'$a$);
  if n = d then raise exception 'FAKT_SVOD rollback: shart topilmadi'; end if;
  execute n;
end
$mig$;