-- Qabul (BEGIN..ROLLBACK, faqat o'qish): har obyektda smeta paketi = t2_obyekt_nakrutka (ikkalasi ham faqat faol qatorlar).
-- Almashtirilgan qatorli obyektlar bo'lsa — ular ham tekshiriladi (farq 0,01 dan oshmasin).
begin;
do $t$
declare v_n int; v_farq int; v_alm int;
begin
  select count(distinct obyekt_id) into v_alm from public.t2_qator where versiya_holat = 'almashtirilgan';
  with p as (
    select x.obyekt_id, (x.paket->>'qqs_bilan')::numeric as v
      from public._t2_summa_paket_v1((select array_agg(id) from public.t2_obyekt), 'smeta') x
  )
  select count(*), count(*) filter (where abs(p.v - n.vsego) > 0.01) into v_n, v_farq
    from p join public.t2_obyekt_nakrutka n on n.obyekt_id = p.obyekt_id;
  if v_farq > 0 then raise exception 'ACCEPT_FAIL: % / % obyektda smeta paketi ≠ t2_obyekt_nakrutka', v_farq, v_n; end if;
  raise notice 'ACCEPT_OK summa_paket_faol_qator: % obyekt, almashtirilgan qatorli % ta', v_n, v_alm;
end $t$;
rollback;
