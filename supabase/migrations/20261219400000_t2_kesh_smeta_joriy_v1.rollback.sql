-- Rollback: 20261219300000_t2_kesh_smeta_joriy_v1 — yamoqlarni teskari qaytaradi (topilmasa jim o'tadi), ustun va yordamchini o'chiradi.
create or replace function pg_temp.rb(d text, a text, b text) returns text language sql immutable as $f$ select replace(d, a, b) $f$;

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public._t2_kesh_hisobla_v1(bigint)'::regprocedure);
  n := pg_temp.rb(d, '(obyekt_id, kompaniya_id, smeta, smeta_joriy, fakt,', '(obyekt_id, kompaniya_id, smeta, fakt,');
  n := pg_temp.rb(n, $a$
          public._t2_kesh_joriy_v1(p_obyekt_id),$a$, '');
  n := pg_temp.rb(n, 'smeta = excluded.smeta, smeta_joriy = excluded.smeta_joriy, fakt', 'smeta = excluded.smeta, fakt');
  execute n;

  d := pg_get_functiondef('public._t2_summa_paket_kesh_v1(bigint[],text,date,date)'::regprocedure);
  n := pg_temp.rb(d, $a$p_olchov in ('smeta', 'smeta_joriy', 'fakt', 'f2', 'f2_qoralama') and p_dan is null$a$, $b$p_olchov in ('smeta', 'fakt', 'f2', 'f2_qoralama') and p_dan is null$b$);
  n := pg_temp.rb(n, $a$when 'smeta' then k.smeta when 'smeta_joriy' then k.smeta_joriy when 'fakt'$a$, $b$when 'smeta' then k.smeta when 'fakt'$b$);
  execute n;

  d := pg_get_functiondef('public.t2_obyekt_kesh_yangila_v1(integer,text)'::regprocedure);
  n := pg_temp.rb(d, 'or k.obyekt_id is null or (k.smeta is not null and k.smeta_joriy is null) or', 'or k.obyekt_id is null or');
  execute n;

  d := pg_get_functiondef('public.t2_mindmap_grafi(bigint)'::regprocedure);
  n := pg_temp.rb(d, $a$AS smeta,
         (SELECT (kk.smeta_joriy->>'ustamasiz')::numeric - (kk.smeta->>'ustamasiz')::numeric FROM public.t2_obyekt_kesh kk
           WHERE kk.obyekt_id = o.id AND kk.smeta_joriy IS NOT NULL AND kk.smeta IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.t2_obyekt_kesh_iflos i WHERE i.obyekt_id = o.id)) AS ozgarish,$a$, 'AS smeta,');
  n := pg_temp.rb(n, $a$'fakt_foiz', CASE WHEN m.smeta + coalesce(m.ozgarish, 0) > 0 THEN round(m.fakt / (m.smeta + coalesce(m.ozgarish, 0)) * 100, 1) END,$a$,
                     $b$'fakt_foiz', CASE WHEN m.smeta > 0 THEN round(m.fakt / m.smeta * 100, 1) END,$b$);
  n := pg_temp.rb(n, $a$'f2_foiz',   CASE WHEN m.smeta + coalesce(m.ozgarish, 0) > 0 THEN round(m.f2 / (m.smeta + coalesce(m.ozgarish, 0)) * 100, 1) END,
               'smeta_joriy', m.smeta + m.ozgarish,
               'foiz_maxraj', CASE WHEN m.ozgarish IS NULL THEN 'asl' ELSE 'joriy' END,$a$,
                     $b$'f2_foiz',   CASE WHEN m.smeta > 0 THEN round(m.f2   / m.smeta * 100, 1) END,$b$);
  execute n;

  d := pg_get_functiondef('public.t2_mindmap_grafi_v4(bigint,bigint)'::regprocedure);
  n := pg_temp.rb(d, $a$array['smeta', 'smeta_joriy', 'fakt', 'f2', 'f2_qoralama', 'fakt_foiz', 'f2_foiz']$a$, $b$array['smeta', 'fakt', 'f2', 'f2_qoralama', 'fakt_foiz', 'f2_foiz']$b$);
  execute n;

  d := pg_get_functiondef('public.t2_ai_kontekst(bigint)'::regprocedure);
  n := pg_temp.rb(d, 'v_smeta numeric; v_maxraj numeric; v_maxraj_tur text; v_qator int;', 'v_smeta numeric; v_qator int;');
  n := pg_temp.rb(n, $a$

  select case when k.smeta_joriy is not null then (k.smeta_joriy->>'ustamasiz')::numeric else (k.smeta->>'ustamasiz')::numeric end,
         case when k.smeta_joriy is not null then 'joriy' else 'asl' end
    into v_maxraj, v_maxraj_tur
    from public.t2_obyekt_kesh k
   where k.obyekt_id = p_obyekt_id and k.smeta is not null
     and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = p_obyekt_id);
  if v_maxraj is null then v_maxraj := v_smeta; v_maxraj_tur := 'rz_jami'; end if;$a$, '');
  n := pg_temp.rb(n, $a$'fakt_foiz', case when v_maxraj > 0 then round(v_fakt / v_maxraj * 100, 2) end,$a$,
                     $b$'fakt_foiz', case when v_smeta > 0 then round(v_fakt / v_smeta * 100, 2) end,$b$);
  n := pg_temp.rb(n, $a$'f2_foiz',   case when v_maxraj > 0 then round(v_f2 / v_maxraj * 100, 2) end,
       'foiz_maxraj', v_maxraj_tur, 'maxraj_summa', v_maxraj$a$,
                     $b$'f2_foiz',   case when v_smeta > 0 then round(v_f2 / v_smeta * 100, 2) end$b$);
  execute n;

  d := pg_get_functiondef('public.t2_rahbar_panel_v1(bigint,bigint,date,date,bigint)'::regprocedure);
  n := pg_temp.rb(d, 'v_sm jsonb; v_sj jsonb; v_maxr numeric; v_maxr_joriy boolean; v_fk jsonb;', 'v_sm jsonb; v_fk jsonb;');
  n := pg_temp.rb(n, $a$
  select jsonb_object_agg(k.obyekt_id::text, k.smeta_joriy) into v_sj from public.t2_obyekt_kesh k
   where k.obyekt_id = any(v_ob) and k.smeta_joriy is not null
     and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = k.obyekt_id);
  select sum(coalesce((v_sj->(o2::text)->>'qqs_bilan')::numeric, (v_sm->(o2::text)->>'qqs_bilan')::numeric)),
         coalesce(bool_and(jsonb_exists(v_sj, o2::text)), false)
    into v_maxr, v_maxr_joriy from unnest(v_ob) o2;$a$, '');
  n := pg_temp.rb(n, $a$'foiz_smeta', case when coalesce(v_maxr, 0) <> 0 then round((j_f2->>'qqs_bilan')::numeric / v_maxr * 100, 1) end,
        'foiz_smeta_joriy', v_maxr_joriy,$a$,
                     $b$'foiz_smeta', case when coalesce((j_sm->>'qqs_bilan')::numeric, 0) <> 0 then round((j_f2->>'qqs_bilan')::numeric / (j_sm->>'qqs_bilan')::numeric * 100, 1) end,$b$);
  n := pg_temp.rb(n, 'v_sm->(o.id::text) as sm, coalesce(v_sj->(o.id::text), v_sm->(o.id::text)) as smx, (v_sj->(o.id::text)) is not null as smx_joriy,', 'v_sm->(o.id::text) as sm,');
  n := pg_temp.rb(n, $a$'fakt', case when coalesce((x.smx->>'ustamasiz')::numeric, 0) <> 0 then round((x.fk->>'ustamasiz')::numeric / (x.smx->>'ustamasiz')::numeric * 100, 1) end,$a$,
                     $b$'fakt', case when coalesce((x.sm->>'ustamasiz')::numeric, 0) <> 0 then round((x.fk->>'ustamasiz')::numeric / (x.sm->>'ustamasiz')::numeric * 100, 1) end,$b$);
  n := pg_temp.rb(n, $a$'f2', case when coalesce((x.smx->>'ustamasiz')::numeric, 0) <> 0 then round((x.f2->>'ustamasiz')::numeric / (x.smx->>'ustamasiz')::numeric * 100, 1) end,$a$,
                     $b$'f2', case when coalesce((x.sm->>'ustamasiz')::numeric, 0) <> 0 then round((x.f2->>'ustamasiz')::numeric / (x.sm->>'ustamasiz')::numeric * 100, 1) end,$b$);
  n := pg_temp.rb(n, $a$'f3', case when x.f3_soni is not null and coalesce((x.smx->>'qqs_bilan')::numeric, 0) <> 0 then round(x.f3_sotuv / (x.smx->>'qqs_bilan')::numeric * 100, 1) end,
             'joriy', x.smx_joriy),$a$,
                     $b$'f3', case when x.f3_soni is not null and coalesce((x.sm->>'qqs_bilan')::numeric, 0) <> 0 then round(x.f3_sotuv / (x.sm->>'qqs_bilan')::numeric * 100, 1) end),$b$);
  execute n;
end
$mig$;

drop function if exists public._t2_kesh_joriy_v1(bigint);
alter table public.t2_obyekt_kesh drop column if exists smeta_joriy;
