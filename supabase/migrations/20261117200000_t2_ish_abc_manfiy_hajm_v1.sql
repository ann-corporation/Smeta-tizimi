-- Smetadan tashqari ish (t2_ish_abc_saqla_v1): manfiy hajm ruxsat — noto'g'ri olingan hajmni yopish/tuzatish
-- (egasi 2026-11-02, «minus qator yuridik» qoidasi). Faqat 0 rad etiladi. Prodga 2026-11-02 da qo'llangan.
do $p$
declare d text; n int;
  a1 text := $x$if v_ish_hajm is null or v_ish_hajm <= 0 then$x$;
  b1 text := $x$if v_ish_hajm is null or v_ish_hajm = 0 then$x$;
  a2 text := $x$or coalesce(v_hajm, 0) <= 0 then$x$;
  b2 text := $x$or coalesce(v_hajm, 0) = 0 then$x$;
  a3 text := $x$if coalesce(p_fakt_hajm, 0) > 0 then$x$;
  b3 text := $x$if coalesce(p_fakt_hajm, 0) <> 0 then$x$;
begin
  select pg_get_functiondef('public.t2_ish_abc_saqla_v1(bigint,bigint,bigint,text,bigint,bigint,jsonb,jsonb,numeric,date,text,uuid,integer)'::regprocedure) into d;
  n := (length(d) - length(replace(d, a1, ''))) / length(a1); if n <> 1 then raise exception 'ANCHOR a1 % marta', n; end if;
  n := (length(d) - length(replace(d, a2, ''))) / length(a2); if n <> 1 then raise exception 'ANCHOR a2 % marta', n; end if;
  n := (length(d) - length(replace(d, a3, ''))) / length(a3); if n <> 1 then raise exception 'ANCHOR a3 % marta', n; end if;
  d := replace(replace(replace(d, a1, b1), a2, b2), a3, b3);
  d := replace(d, $x$(nom, birlik va norma yoki aniq hajm > 0)$x$, $x$(nom, birlik va norma yoki aniq hajm <> 0)$x$);
  execute d;
end $p$;
