-- 20261221800000 ROLLBACK: RS fakt hosila v2 (set-based) yamog'ini olib tashlaydi (3 funksiya + t2_qator_holat) va t2_rs_hosila_v1 view ni o'chiradi.
-- Natija: 20261221700000 (qaytarilgan) holat. Idempotent: yamoq bo'lmasa o'tkazadi.
do $rb$
declare
  v_frag constant text := ' LEFT JOIN (SELECT h0.qator_id, h0.hajm, h0.stale FROM public.t2_rs_hosila_v1 h0 WHERE h0.obyekt_id = ANY(p_obyekt_ids) OFFSET 0) hs ON hs.qator_id = q.id';
  v_cond_new constant text := '(((bl.bl_soni > 0) OR (hs.hajm IS NOT NULL)) AND ((d.direct_fakt_hajm = (0)::numeric) OR COALESCE(hs.stale, false)))';
  v_cond_old constant text := '((bl.bl_soni > 0) AND (d.direct_fakt_hajm = (0)::numeric))';
  v_norma_new constant text := 'COALESCE(hs.hajm, (bl.fakt_hajm - bl.f2s_hajm) * q.norma)';
  v_norma_old constant text := '(bl.fakt_hajm - bl.f2s_hajm) * q.norma';
  r record; v_def text;
begin
  for r in select unnest(array['_t2_fakt_olchov_v1','_t2_qator_holat_v2','_t2_ortiqcha_olchov_v1']) as fn loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = to_regprocedure('public.' || r.fn || '(bigint[])');
    if v_def is null then raise exception 'ROLLBACK: % topilmadi', r.fn; end if;
    if position('t2_rs_hosila_v1' in v_def) = 0 then continue; end if;
    v_def := replace(v_def, v_cond_new, v_cond_old);
    v_def := replace(v_def, v_norma_new, v_norma_old);
    v_def := replace(v_def, v_frag, '');
    if position('t2_rs_hosila_v1' in v_def) > 0 or position('hs.' in v_def) > 0 then raise exception 'ROLLBACK: % da iz qoldi', r.fn; end if;
    execute v_def;
  end loop;

  v_def := pg_get_viewdef('public.t2_qator_holat'::regclass, true);
  if position('t2_rs_hosila_v1' in v_def) > 0 then
    v_def := regexp_replace(v_def, '\s*LEFT JOIN LATERAL \(\s*SELECT h0\.hajm,\s*h0\.stale\s+FROM (?:public\.)?t2_rs_hosila_v1 h0\s+WHERE h0\.qator_id = q\.id AND q\.tur = ''rs''::text AND \(q\.norma IS NULL OR \(EXISTS \(\s*SELECT 1\s+FROM (?:public\.)?t2_qator p0\s+WHERE p0\.id = q\.ota_id AND p0\.tur = ''rz''::text\)\)\)\s+OFFSET 0\) hs ON true', '');
    v_def := replace(v_def, '(bl.bl_soni > 0 OR hs.hajm IS NOT NULL) AND (d.direct_fakt_hajm = 0::numeric OR COALESCE(hs.stale, false))', 'bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric');
    v_def := replace(v_def, v_norma_new, v_norma_old);
    if position('t2_rs_hosila_v1' in v_def) > 0 or position('hs.' in v_def) > 0 then raise exception 'ROLLBACK: view da iz qoldi'; end if;
    execute 'CREATE OR REPLACE VIEW public.t2_qator_holat AS ' || v_def;
  end if;
end
$rb$;

drop view if exists public.t2_rs_hosila_v1;
