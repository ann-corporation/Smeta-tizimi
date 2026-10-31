-- Rollback: 20261116300000_t2_obyekt_rev_v1 — reviziya triggerlari, jadvallari va yamoqlar olib tashlanadi.
-- Tartib: avval paket (20261116400000) rollback qilinadi (u t2_obyekt_rev ni o'qiydi).

-- 1) Yamoqlar: qo'shilgan bitta qatorni olib tashlash (joriy ta'rifdan, langar bo'yicha).
do $$
declare
  v_def text := pg_get_functiondef('snapshot.qaytar(bigint,text,text)'::regprocedure);
  v_qator text := E'  perform public._t2_rev_toliq(v_s.obyekt_id); -- obyekt paketi: replica rejimda triggerlar ishlamagan\n';
begin
  if position(v_qator in v_def) > 0 then execute replace(v_def, v_qator, ''); end if;
end $$;
do $$
declare
  v_def text := pg_get_functiondef('public.t2_smeta_versiya_faollashtir_v1(bigint,bigint,bigint,jsonb,jsonb,uuid)'::regprocedure);
  v_qator text := E'  perform public._t2_rev_toliq(p_obyekt_id); -- obyekt paketi: versiya almashdi — to''liq qayta olish\n';
begin
  if position(v_qator in v_def) > 0 then execute replace(v_def, v_qator, ''); end if;
end $$;

-- 2) Triggerlar.
drop trigger if exists t2_qator_rev_ins on public.t2_qator;
drop trigger if exists t2_qator_rev_upd on public.t2_qator;
drop trigger if exists t2_qator_rev_del on public.t2_qator;
drop trigger if exists t2_akt_qator_rev_ins on public.t2_akt_qator;
drop trigger if exists t2_akt_qator_rev_upd on public.t2_akt_qator;
drop trigger if exists t2_akt_qator_rev_del on public.t2_akt_qator;
drop trigger if exists t2_akt_rev_ins on public.t2_akt;
drop trigger if exists t2_akt_rev_upd on public.t2_akt;
drop trigger if exists t2_akt_rev_del on public.t2_akt;
drop trigger if exists t2_obyekt_rev_ins on public.t2_obyekt;
drop trigger if exists t2_obyekt_rev_upd on public.t2_obyekt;
drop trigger if exists t2_obyekt_rev_del on public.t2_obyekt;
do $$
declare t text;
begin
  foreach t in array array['t2_shartnoma_bog','t2_smeta_versiya','t2_svod_yaxlit','t2_nakrutka','t2_nakrutka_koef','t2_nakrutka_podval'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_rev_ins', t);
    execute format('drop trigger if exists %I on public.%I', t || '_rev_upd', t);
    execute format('drop trigger if exists %I on public.%I', t || '_rev_del', t);
  end loop;
end $$;

-- 3) Funksiyalar va jadvallar.
drop function if exists public._t2_rev_qator_trg();
drop function if exists public._t2_rev_akt_qator_trg();
drop function if exists public._t2_rev_akt_trg();
drop function if exists public._t2_rev_obyekt_trg();
drop function if exists public._t2_rev_meta_obyekt_trg();
drop function if exists public._t2_rev_meta_kompaniya_trg();
drop function if exists public._t2_rev_meta_podval_trg();
drop function if exists public._t2_obyekt_ozgarish_tozala(integer);
drop function if exists public._t2_rev_qator_yoz(bigint, bigint[], boolean[], bigint[]);
drop function if exists public._t2_rev_holat_yoz(bigint, bigint[], boolean);
drop function if exists public._t2_rev_toliq(bigint);
drop function if exists public._t2_rev_oshir(bigint, boolean);
drop table if exists public.t2_obyekt_ozgarish;
drop table if exists public.t2_obyekt_rev;
