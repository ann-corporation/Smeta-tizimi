-- Obyekt keshiga `smeta_joriy` (asl smeta + o'zgarishlar) va bajarilish foizi maxrajini shunga o'tkazish.
-- Egasi 2026-11-14: «Stella da bajarilish 652 %» — maxraj asl smeta edi (qo'shimcha/zamena kirmasdi). F-2 reestri (PR #467) tuzatilgan;
-- shu migratsiya serverdagi QOLGAN joylarni tuzatadi: mindmap (meta.fakt_foiz / f2_foiz), AI kontekst (bajarish.fakt_foiz / f2_foiz),
-- rahbar paneli (foiz_smeta, obyektlar[].bajarilish).
-- Qoida: asl smeta summasi ko'rinishda O'ZGARMAYDI (CONST). Faqat nisbat maxraji = smeta_joriy; joriy noma'lum bo'lsa — asl,
-- «foiz_maxraj = asl» belgisi bilan (NULL ≠ 0: noma'lumni 0 deb ko'rsatmaydi).
-- Kesh: yangi ustun t2_obyekt_kesh.smeta_joriy (paket, _t2_summa_paket_v1(..,'smeta_joriy')). Hisoblash xatosi butun keshni buzmasin —
-- yordamchi _t2_kesh_joriy_v1 xatoda NULL qaytaradi. Eski qatorlar t2_obyekt_kesh_yangila_v1 orqali oz-ozdan to'ldiriladi.
-- Funksiyalar joriy prod matniga matn-yamoq (replace) bilan o'zgartiriladi; yamoq topilmasa — migratsiya to'xtaydi (jim o'tmaydi).
alter table public.t2_obyekt_kesh add column if not exists smeta_joriy jsonb;

create or replace function public._t2_kesh_joriy_v1(p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $f$
declare v jsonb;
begin
  select p.paket into v from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta_joriy') p;
  return v;
exception when others then
  return null;   -- kesh hisobi buzilmasin; maxraj asl smetaga yiqiladi (belgi bilan)
end $f$;
revoke all on function public._t2_kesh_joriy_v1(bigint) from public, anon, authenticated;
grant execute on function public._t2_kesh_joriy_v1(bigint) to service_role;

create or replace function pg_temp.rep(d text, a text, b text) returns text language plpgsql as $f$
declare n int;
begin
  n := (length(d) - length(replace(d, a, ''))) / length(a);
  if n <> 1 then raise exception 'KESH_SMETA_JORIY: yamoq topilmadi yoki takror (% marta): %', n, left(a, 80); end if;
  return replace(d, a, b);
end $f$;

do $mig$
declare d text; n text;
begin
  -- 1) Kesh hisobi: smeta_joriy ham yoziladi.
  d := pg_get_functiondef('public._t2_kesh_hisobla_v1(bigint)'::regprocedure);
  n := pg_temp.rep(d, '(obyekt_id, kompaniya_id, smeta, fakt,', '(obyekt_id, kompaniya_id, smeta, smeta_joriy, fakt,');
  n := pg_temp.rep(n, $a$(select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta') p),$a$,
                      $b$(select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta') p),
          public._t2_kesh_joriy_v1(p_obyekt_id),$b$);
  n := pg_temp.rep(n, 'smeta = excluded.smeta, fakt', 'smeta = excluded.smeta, smeta_joriy = excluded.smeta_joriy, fakt');
  execute n;

  -- 2) Kesh o'quvchisi: 'smeta_joriy' o'lchovi ham keshdan (yo'q bo'lsa — jonli hisob, avvalgidek).
  d := pg_get_functiondef('public._t2_summa_paket_kesh_v1(bigint[],text,date,date)'::regprocedure);
  n := pg_temp.rep(d, $a$p_olchov in ('smeta', 'fakt', 'f2', 'f2_qoralama') and p_dan is null$a$, $b$p_olchov in ('smeta', 'smeta_joriy', 'fakt', 'f2', 'f2_qoralama') and p_dan is null$b$);
  n := pg_temp.rep(n, $a$case p_olchov when 'smeta' then k.smeta when 'fakt'$a$, $b$case p_olchov when 'smeta' then k.smeta when 'smeta_joriy' then k.smeta_joriy when 'fakt'$b$);
  execute n;

  -- 3) Yangilash navbati: smeta bor-u smeta_joriy yo'q qatorlar ham (backfill).
  d := pg_get_functiondef('public.t2_obyekt_kesh_yangila_v1(integer,text)'::regprocedure);
  n := pg_temp.rep(d, 'or k.obyekt_id is null or', 'or k.obyekt_id is null or (k.smeta is not null and k.smeta_joriy is null) or');
  execute n;

  -- 4) Mindmap: maxraj = asl + o'zgarish (kesh farqi; kesh eskirgan bo'lsa — asl, belgi bilan).
  d := pg_get_functiondef('public.t2_mindmap_grafi(bigint)'::regprocedure);
  n := pg_temp.rep(d, 'AS smeta,', $b$AS smeta,
         (SELECT (kk.smeta_joriy->>'ustamasiz')::numeric - (kk.smeta->>'ustamasiz')::numeric FROM public.t2_obyekt_kesh kk
           WHERE kk.obyekt_id = o.id AND kk.smeta_joriy IS NOT NULL AND kk.smeta IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.t2_obyekt_kesh_iflos i WHERE i.obyekt_id = o.id)) AS ozgarish,$b$);
  n := pg_temp.rep(n, $a$'fakt_foiz', CASE WHEN m.smeta > 0 THEN round(m.fakt / m.smeta * 100, 1) END,$a$,
                      $b$'fakt_foiz', CASE WHEN m.smeta + coalesce(m.ozgarish, 0) > 0 THEN round(m.fakt / (m.smeta + coalesce(m.ozgarish, 0)) * 100, 1) END,$b$);
  n := pg_temp.rep(n, $a$'f2_foiz',   CASE WHEN m.smeta > 0 THEN round(m.f2   / m.smeta * 100, 1) END,$a$,
                      $b$'f2_foiz',   CASE WHEN m.smeta + coalesce(m.ozgarish, 0) > 0 THEN round(m.f2 / (m.smeta + coalesce(m.ozgarish, 0)) * 100, 1) END,
               'smeta_joriy', m.smeta + m.ozgarish,
               'foiz_maxraj', CASE WHEN m.ozgarish IS NULL THEN 'asl' ELSE 'joriy' END,$b$);
  execute n;

  d := pg_get_functiondef('public.t2_mindmap_grafi_v4(bigint,bigint)'::regprocedure);
  n := pg_temp.rep(d, $a$array['smeta', 'fakt', 'f2', 'f2_qoralama', 'fakt_foiz', 'f2_foiz']$a$, $b$array['smeta', 'smeta_joriy', 'fakt', 'f2', 'f2_qoralama', 'fakt_foiz', 'f2_foiz']$b$);
  execute n;

  -- 5) AI kontekst: bajarish.fakt_foiz / f2_foiz maxraji = smeta_joriy (kesh) → asl (kesh) → rz yig'indisi (belgi bilan).
  d := pg_get_functiondef('public.t2_ai_kontekst(bigint)'::regprocedure);
  n := pg_temp.rep(d, 'v_smeta numeric; v_qator int;', 'v_smeta numeric; v_maxraj numeric; v_maxraj_tur text; v_qator int;');
  n := pg_temp.rep(n, $a$from t2_qator where versiya_holat = 'faol' and obyekt_id = p_obyekt_id and tur = 'rz';$a$,
                      $b$from t2_qator where versiya_holat = 'faol' and obyekt_id = p_obyekt_id and tur = 'rz';

  select case when k.smeta_joriy is not null then (k.smeta_joriy->>'ustamasiz')::numeric else (k.smeta->>'ustamasiz')::numeric end,
         case when k.smeta_joriy is not null then 'joriy' else 'asl' end
    into v_maxraj, v_maxraj_tur
    from public.t2_obyekt_kesh k
   where k.obyekt_id = p_obyekt_id and k.smeta is not null
     and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = p_obyekt_id);
  if v_maxraj is null then v_maxraj := v_smeta; v_maxraj_tur := 'rz_jami'; end if;$b$);
  n := pg_temp.rep(n, $a$'fakt_foiz', case when v_smeta > 0 then round(v_fakt / v_smeta * 100, 2) end,$a$,
                      $b$'fakt_foiz', case when v_maxraj > 0 then round(v_fakt / v_maxraj * 100, 2) end,$b$);
  n := pg_temp.rep(n, $a$'f2_foiz',   case when v_smeta > 0 then round(v_f2 / v_smeta * 100, 2) end$a$,
                      $b$'f2_foiz',   case when v_maxraj > 0 then round(v_f2 / v_maxraj * 100, 2) end,
       'foiz_maxraj', v_maxraj_tur, 'maxraj_summa', v_maxraj$b$);
  execute n;

  -- 6) Rahbar paneli: foiz_smeta va obyektlar[].bajarilish maxraji — keshdagi smeta_joriy (yo'q obyektda — asl; belgi 'joriy').
  d := pg_get_functiondef('public.t2_rahbar_panel_v1(bigint,bigint,date,date,bigint)'::regprocedure);
  n := pg_temp.rep(d, 'v_sm jsonb; v_fk jsonb;', 'v_sm jsonb; v_sj jsonb; v_maxr numeric; v_maxr_joriy boolean; v_fk jsonb;');
  n := pg_temp.rep(n, $a$select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_sm  from public._t2_summa_paket_kesh_v1(v_ob, 'smeta') p;$a$,
                      $b$select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_sm  from public._t2_summa_paket_kesh_v1(v_ob, 'smeta') p;
  select jsonb_object_agg(k.obyekt_id::text, k.smeta_joriy) into v_sj from public.t2_obyekt_kesh k
   where k.obyekt_id = any(v_ob) and k.smeta_joriy is not null
     and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = k.obyekt_id);
  select sum(coalesce((v_sj->(o2::text)->>'qqs_bilan')::numeric, (v_sm->(o2::text)->>'qqs_bilan')::numeric)),
         coalesce(bool_and(jsonb_exists(v_sj, o2::text)), false)
    into v_maxr, v_maxr_joriy from unnest(v_ob) o2;$b$);
  n := pg_temp.rep(n, $a$'foiz_smeta', case when coalesce((j_sm->>'qqs_bilan')::numeric, 0) <> 0 then round((j_f2->>'qqs_bilan')::numeric / (j_sm->>'qqs_bilan')::numeric * 100, 1) end,$a$,
                      $b$'foiz_smeta', case when coalesce(v_maxr, 0) <> 0 then round((j_f2->>'qqs_bilan')::numeric / v_maxr * 100, 1) end,
        'foiz_smeta_joriy', v_maxr_joriy,$b$);
  n := pg_temp.rep(n, 'v_sm->(o.id::text) as sm,', $b$v_sm->(o.id::text) as sm, coalesce(v_sj->(o.id::text), v_sm->(o.id::text)) as smx, (v_sj->(o.id::text)) is not null as smx_joriy,$b$);
  n := pg_temp.rep(n, $a$'fakt', case when coalesce((x.sm->>'ustamasiz')::numeric, 0) <> 0 then round((x.fk->>'ustamasiz')::numeric / (x.sm->>'ustamasiz')::numeric * 100, 1) end,$a$,
                      $b$'fakt', case when coalesce((x.smx->>'ustamasiz')::numeric, 0) <> 0 then round((x.fk->>'ustamasiz')::numeric / (x.smx->>'ustamasiz')::numeric * 100, 1) end,$b$);
  n := pg_temp.rep(n, $a$'f2', case when coalesce((x.sm->>'ustamasiz')::numeric, 0) <> 0 then round((x.f2->>'ustamasiz')::numeric / (x.sm->>'ustamasiz')::numeric * 100, 1) end,$a$,
                      $b$'f2', case when coalesce((x.smx->>'ustamasiz')::numeric, 0) <> 0 then round((x.f2->>'ustamasiz')::numeric / (x.smx->>'ustamasiz')::numeric * 100, 1) end,$b$);
  n := pg_temp.rep(n, $a$'f3', case when x.f3_soni is not null and coalesce((x.sm->>'qqs_bilan')::numeric, 0) <> 0 then round(x.f3_sotuv / (x.sm->>'qqs_bilan')::numeric * 100, 1) end),$a$,
                      $b$'f3', case when x.f3_soni is not null and coalesce((x.smx->>'qqs_bilan')::numeric, 0) <> 0 then round(x.f3_sotuv / (x.smx->>'qqs_bilan')::numeric * 100, 1) end,
             'joriy', x.smx_joriy),$b$);
  execute n;
end
$mig$;
