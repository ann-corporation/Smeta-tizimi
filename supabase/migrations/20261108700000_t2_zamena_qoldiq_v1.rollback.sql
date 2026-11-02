-- ROLLBACK: 20261108700000_t2_zamena_qoldiq_v1.sql
-- View ustun sonini kamaytira olmaydi (create or replace): almashtirilgan_hajm/almashtirilgan_summa ustunlari NULL o'zgarmasi bo'lib qoladi,
-- qoldiq_* ifodalari esa avvalgi (zamenasiz) holatga qaytadi.
begin;

do $do$
declare d text; n text;
begin
  d := pg_get_viewdef('public.t2_qator_holat'::regclass, true);
  n := d;
  n := replace(n, 'q.hajm - d.f2_hajm - al.v AS qoldiq_hajm,', 'q.hajm - d.f2_hajm AS qoldiq_hajm,');
  n := replace(n, 'q.summa - d.f2_summa_malum - COALESCE(public.t2_almashtirilgan_summa_hisob(al.v, q.hajm, q.narx, q.summa), 0::numeric) AS qoldiq_summa,', 'q.summa - d.f2_summa_malum AS qoldiq_summa,');
  n := replace(n, E'al.v AS almashtirilgan_hajm,\n    public.t2_almashtirilgan_summa_hisob(al.v, q.hajm, q.narx, q.summa) AS almashtirilgan_summa', 'NULL::numeric AS almashtirilgan_hajm,' || E'\n    NULL::numeric AS almashtirilgan_summa');
  n := replace(n, E'\n     CROSS JOIN LATERAL ( SELECT CASE WHEN EXISTS (SELECT 1 FROM public.t2_qator zz WHERE zz.replaces_line_id = q.id) OR EXISTS (SELECT 1 FROM public.t2_qator zz WHERE zz.replaces_line_id = q.ota_id) THEN public.t2_almashtirilgan_hajm(q.id) ELSE 0::numeric END AS v) al', '');
  if position('al.v' in n) > 0 then raise exception 'ROLLBACK: t2_qator_holat langari topilmadi'; end if;
  execute 'create or replace view public.t2_qator_holat as ' || rtrim(n, E'; \n');
end $do$;

do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure);
  n := d;
  n := replace(n, E'\n    left join lateral (select case when exists (select 1 from public.t2_qator zz where zz.replaces_line_id = q.id) or exists (select 1 from public.t2_qator zz where zz.replaces_line_id = q.ota_id) then public.t2_almashtirilgan_hajm(q.id) else 0::numeric end as v) al on true', '');
  n := replace(n, 'where (not v_faol or coalesce(al.v,0) <> 0 or ', 'where (not v_faol or ');
  n := replace(n, E'\'almashtirilgan_hajm\', coalesce(al.v,0),\n      \'qoldiq_hajm\',  coalesce(q.hajm,0) - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)) - coalesce(al.v,0),',
                  E'\'qoldiq_hajm\',  coalesce(q.hajm,0) - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)),');
  n := replace(n, E'\'almashtirilgan_summa\', public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),\n      \'qoldiq_summa\', coalesce(q.summa,0) - (coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0)) - coalesce(public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),0),',
                  E'\'qoldiq_summa\', coalesce(q.summa,0) - (coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0)),');
  n := regexp_replace(n, E'''qoldiq_summa'', smeta_summa - jami_summa - \\(select.*?zz\\.replaces_line_id = o\\.ota_id\\)\\)\\),', '''qoldiq_summa'', smeta_summa - jami_summa,', 's');
  if position('t2_almashtirilgan' in n) > 0 or position('al.v' in n) > 0 then raise exception 'ROLLBACK: t2_nakopitelniy_v2 langari topilmadi'; end if;
  execute n;
end $do$;

drop function if exists public.t2_zamena_almashtirish_belgila_v1(bigint, bigint, bigint, numeric);
drop function if exists public.t2_almashtirilgan_hajm(bigint);
drop function if exists public.t2_almashtirilgan_oz_hajm(bigint);
drop function if exists public.t2_almashtirilgan_summa_hisob(numeric, numeric, numeric, numeric);
drop view if exists public.t2_zamena_qoplash;
alter table public.t2_qator drop constraint if exists t2_qator_almashtirish_hajm_chk;
alter table public.t2_qator drop column if exists almashtirish_hajm;

commit;
