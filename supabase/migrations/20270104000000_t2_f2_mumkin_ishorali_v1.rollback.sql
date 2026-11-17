-- Teskari: f2_mumkin_hajm/f2_mumkin_summa yana GREATEST(fakt - F2, 0) (MINUS qatorlar yana 0). BEGIN/COMMIT yo'q.
-- Yordamchi funksiyalar oxirida olinadi (view/funksiya ularga bog'liq edi).
do $rb$
declare
  c_man constant text := '_t2_f2_manfiy_v1(COALESCE(zr.v, q.hajm), e.fakt_hajm, d.f2_hajm)';
  n_h constant text := '_t2_f2_mumkin_v1(e.fakt_hajm - d.f2_hajm, ' || c_man || ') AS f2_mumkin_hajm';
  n_s constant text := '_t2_f2_mumkin_v1(e.fakt_summa - d.f2_summa_malum, ' || c_man || ') AS f2_mumkin_summa';
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = to_regprocedure('public._t2_qator_holat_v2(bigint[])');
  if v_def is not null and position('_t2_f2_mumkin_v1(' in v_def) > 0 then
    v_def := replace(v_def, 'public.' || n_h, n_h);
    v_def := replace(replace(v_def, n_h, 'GREATEST((e.fakt_hajm - d.f2_hajm), (0)::numeric) AS f2_mumkin_hajm'), n_s, 'GREATEST((e.fakt_summa - d.f2_summa_malum), (0)::numeric) AS f2_mumkin_summa');
    execute v_def;
  end if;
  v_def := pg_get_viewdef('public.t2_qator_holat'::regclass, true);
  if position('_t2_f2_mumkin_v1(' in v_def) > 0 then
    v_def := replace(replace(v_def, n_h, 'GREATEST(e.fakt_hajm - d.f2_hajm, 0::numeric) AS f2_mumkin_hajm'), n_s, 'GREATEST(e.fakt_summa - d.f2_summa_malum, 0::numeric) AS f2_mumkin_summa');
    execute 'CREATE OR REPLACE VIEW public.t2_qator_holat AS ' || rtrim(v_def, E'; \n');
  end if;
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 't2_ai_kontekst' and p.pronargs = 1;
  if v_def is not null and position('abs(f2_hajm) > abs(fakt_hajm) + 0.001' in v_def) > 0 then
    execute replace(v_def, 'abs(f2_hajm) > abs(fakt_hajm) + 0.001', 'f2_hajm > fakt_hajm + 0.001');
  end if;
end
$rb$;
drop function if exists public._t2_f2_mumkin_v1(numeric, boolean);
drop function if exists public._t2_f2_manfiy_v1(numeric, numeric, numeric);
