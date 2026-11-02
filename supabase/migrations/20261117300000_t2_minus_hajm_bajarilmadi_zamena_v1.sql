-- Minus hajm foydalanuvchi ishi (egasi 2026-11-02): bajarilmadi va zamena almashtirish hajmida ishora bloklanmaydi.
-- Prodga 2026-11-02 da qo'llangan.
do $p$
declare d text; n int; a text; b text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.oid = (select oid from pg_proc where proname='t2_zamena_almashtirish_belgila_v1' limit 1);
  a := $x$(p_hajm < 0 or p_hajm::text in ('NaN','Infinity','-Infinity'))$x$;
  b := $x$(p_hajm::text in ('NaN','Infinity','-Infinity'))$x$;
  n := (length(d) - length(replace(d, a, ''))) / length(a); if n <> 1 then raise exception 'ANCHOR zamena % marta', n; end if;
  execute replace(d, a, b);
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.oid = (select oid from pg_proc where proname='t2_bajarilmadi_belgila_v1' limit 1);
  a := $x$where qator_id is null or coalesce(hajm, 0) < 0)$x$;
  b := $x$where qator_id is null)$x$;
  n := (length(d) - length(replace(d, a, ''))) / length(a); if n <> 1 then raise exception 'ANCHOR bajarilmadi % marta', n; end if;
  execute replace(d, a, b);
end $p$;
