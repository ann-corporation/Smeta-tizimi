-- Rollback: 20261114700000 — versiya faollashtirish. Faqat birorta obyekt faollashtirilmagan bo'lsa (almashtirilgan
-- qator yo'q) — aks holda RAD (ma'lumot yo'qolmasin: avval snapshot'dan tiklang). View/funksiyalar avvalgi holatiga.
begin;
do $r$
declare v text; d text;
begin
  if exists (select 1 from public.t2_qator where versiya_holat <> 'faol') then
    raise exception 'ROLLBACK_RAD: almashtirilgan qatorlar bor — avval obyektlarni snapshot''dan tiklang';
  end if;
  drop function if exists public.t2_smeta_versiya_faollashtir_v1(bigint,bigint,bigint,jsonb,jsonb,uuid);
  drop trigger if exists t2_akt_qator_versiya_guard_trg on public.t2_akt_qator;
  drop function if exists public.t2_akt_qator_versiya_guard();

  v := pg_get_viewdef('public.t2_obyekt_jami'::regclass, true);
  if position($a$ AND q.versiya_holat = 'faol'::text) a ON true$a$ in v) = 0 then raise exception 'ROLLBACK_ANCHOR_MISSING: t2_obyekt_jami'; end if;
  execute 'create or replace view public.t2_obyekt_jami as ' || replace(v, $a$ AND q.versiya_holat = 'faol'::text) a ON true$a$, ') a ON true');

  v := pg_get_viewdef('public.t2_obyekt_nakrutka'::regclass, true);
  d := $a$WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.versiya_holat = 'faol'::text$a$;
  if position(d in v) = 0 then raise exception 'ROLLBACK_ANCHOR_MISSING: t2_obyekt_nakrutka'; end if;
  execute 'create or replace view public.t2_obyekt_nakrutka as ' || replace(v, d, $b$WHERE q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])$b$);

  v := pg_get_viewdef('public.t2_daraxt'::regclass, true);
  d := E'\n  WHERE q.versiya_holat = ''faol''::text;';
  if position(d in v) = 0 then raise exception 'ROLLBACK_ANCHOR_MISSING: t2_daraxt'; end if;
  execute 'create or replace view public.t2_daraxt as ' || replace(v, d, ';');

  -- t2_qator_holat: unga bog'liq view'lar bor — ustun olib tashlanmaydi, t2_qator ustunidan uziladi ('faol' doimiy).
  v := pg_get_viewdef('public.t2_qator_holat'::regclass, true);
  d := $a$,
    q.versiya_holat
   FROM t2_qator q$a$;
  if position(d in v) = 0 then raise exception 'ROLLBACK_ANCHOR_MISSING: t2_qator_holat'; end if;
  execute 'create or replace view public.t2_qator_holat as ' || replace(v, d, $b$,
    'faol'::text AS versiya_holat
   FROM t2_qator q$b$);
  select pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure) into d;
  if position('versiya_faollashtir_v1' in d) = 0 then raise exception 'ROLLBACK_ANCHOR_MISSING: t2_nakopitelniy_v2'; end if;
  d := replace(d, $x$'tur', q.tur, 'kat', q.kat, 'versiya_holat', q.versiya_holat,$x$, $x$'tur', q.tur, 'kat', q.kat,$x$);
  d := replace(d, $x$'qoldiq_hajm',  case when q.versiya_holat = 'almashtirilgan' then coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0) + coalesce(al.v,0) else coalesce(q.hajm,0) end$x$,
    $x$'qoldiq_hajm',  coalesce(q.hajm,0)$x$);
  d := replace(d, $x$'qoldiq_summa', case when q.versiya_holat = 'almashtirilgan' then coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0) + coalesce(public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),0) else coalesce(q.summa,0) end$x$,
    $x$'qoldiq_summa', coalesce(q.summa,0)$x$);
  d := replace(d, $x$where ((not v_faol and (q.versiya_holat = 'faol' or coalesce(p.oldingi_hajm,0) <> 0 or coalesce(p.joriy_hajm,0) <> 0 or coalesce(p.fakt_hajm,0) <> 0 or coalesce(p.joriy_qoralama_summa,0) <> 0)) or$x$,
    $x$where (not v_faol or$x$);
  d := replace(d, $x$ and q.versiya_holat = 'faol'),0) as smeta_summa,$x$, $x$),0) as smeta_summa,$x$);
  d := replace(d, $x$ and q.summa is null and q.versiya_holat = 'faol') as smeta_summa_nomalum,$x$, $x$ and q.summa is null) as smeta_summa_nomalum,$x$);
  d := replace(d, $x$ and versiya_holat = 'faol'; -- versiya_faollashtir_v1$x$, ';');
  d := replace(d, $x$ and o.tur in ('rs','mat','ob') and o.versiya_holat = 'faol'$x$, $x$ and o.tur in ('rs','mat','ob')$x$);
  if position('versiya_holat' in d) > 0 then raise exception 'ROLLBACK: nakopitelniy da versiya_holat qoldi'; end if;
  execute d;

  select pg_get_functiondef('public.t2_smeta_import_yakunla_unlocked_v1(bigint,bigint,bigint)'::regprocedure) into d;
  if position($x$ and versiya_holat = 'faol') then$x$ in d) = 0 then raise exception 'ROLLBACK_ANCHOR_MISSING: yakunla guard'; end if;
  execute replace(d, $x$ and versiya_holat = 'faol') then$x$, ') then');

  alter table public.t2_qator drop constraint if exists t2_qator_versiya_holat_ck;
  drop index if exists public.t2_qator_almashtirilgan_ix;
  alter table public.t2_qator drop column if exists almashtirgan_versiya_id;
  alter table public.t2_qator drop column if exists versiya_holat;
end $r$;
commit;
