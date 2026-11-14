-- Qaytarish: F-2 narx fallback olib tashlanadi (teskari nuqtali almashtirish).
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public._t2_smeta_qatlam_qator_v1(bigint[])'::regprocedure);
  n := replace(d, $b$    select q.id, q.obyekt_id, q.ota_id, q.kat, q.hajm,
           coalesce(q.summa, case when t.sinf = 'zamena' then q.hajm * fz.narx end) as summa,
           q.birlik, q.birlik_key, q.replaces_line_id, q.almashtirish_hajm, q.zm, q.yangi, t.sinf, t.ildiz_id, t.zamena_id
      from q0 q join t on t.id = q.id
      left join lateral (
        select sum(coalesce(aq.certified_amount, aq.summa)) / nullif(sum(coalesce(aq.certified_quantity, aq.hajm)), 0) as narx
          from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id and a.tur = 'f2' and a.holat = 'tasdiqlangan'
         where q.summa is null and t.sinf = 'zamena' and aq.qator_id = q.id and coalesce(aq.certified_amount, aq.summa) is not null
      ) fz on true
$b$, $a$    select q.*, t.sinf, t.ildiz_id, t.zamena_id
      from q0 q join t on t.id = q.id
$a$);
  if n = d then raise exception 'ZAMENA_F2_NARX rollback: barg bloki topilmadi'; end if;
  execute n;
  d := pg_get_functiondef('public.t2_smeta_ozgarish_qatlam_v1(bigint,bigint)'::regprocedure);
  n := replace(d, $b$count(l.summa) as narxli, count(*) filter (where l.summa is not null and lq.summa is null) as f2_narx_soni,$b$, $a$count(l.summa) as narxli,$a$);
  n := replace(n, $b$from l left join q lq on lq.id = l.qator_id where l.sinf = 'zamena' group by l.zamena_id$b$, $a$from l where l.sinf = 'zamena' group by l.zamena_id$a$);
  n := replace(n, $b$ 'narx_manba', case when x.f2_narx_soni > 0 then 'f2_narx' end, 'f2_narx_soni', x.f2_narx_soni, 'narxsiz_barg_soni', x.narxsiz_soni,$b$, '');
  n := replace(n, $b$ 'f2_narx_soni', (select coalesce(sum(f2_narx_soni), 0) from zamena), 'narxsiz_barg_soni', (select coalesce(sum(narxsiz_soni), 0) from zamena),$b$, '');
  if n = d then raise exception 'ZAMENA_F2_NARX rollback: qatlam bloklari topilmadi'; end if;
  execute n;
end
$mig$;