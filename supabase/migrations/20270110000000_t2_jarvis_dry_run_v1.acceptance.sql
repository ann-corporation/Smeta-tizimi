-- Qabul sinovi: faqat ROLLBACK ichida (rb_run). Prod sinovi 2026-11-18: fakt_yoz preview +1, fakt o'zgarmadi, t2_akt_bekor 42501 bilan rad etildi.
do $$ declare v_r jsonb; v_before numeric; v_after numeric;
begin
  select fakt_hajm into v_before from public.t2_qator_holat where qator_id = 1074089;
  v_r := public.t2_jarvis_dry_run_v1(183, 123, 162, jsonb_build_array(jsonb_build_object('rpc','t2_fakt_yoz_v2','args', jsonb_build_object(
     'p_obyekt_id', 162, 'p_qatorlar', jsonb_build_array(jsonb_build_object('qator_id', 1074089, 'hajm', 1)), 'p_operation_id', gen_random_uuid(), 'p_sana', current_date, 'p_izoh', 'sinov', 'p_raqam', null, 'p_actor_label', 'jarvis'))),
     'fakt', null, array[1074089]::bigint[]);
  select fakt_hajm into v_after from public.t2_qator_holat where qator_id = 1074089;
  if v_after is distinct from v_before then raise exception 'ACC: yozildi!'; end if;
  if (v_r->'keyin'->'qatorlar'->0->>'fakt_hajm')::numeric is distinct from v_before + 1 then raise exception 'ACC: preview noto''g''ri %', left(v_r::text, 600); end if;
  begin perform public.t2_jarvis_dry_run_v1(183, 123, 162, '[{"rpc":"t2_akt_bekor","args":{}}]'::jsonb); raise exception 'ACC: oq royxat ishlamadi';
  exception when sqlstate '42501' then null; end;
  raise notice 'ACC OK % -> %', v_before, v_r->'keyin'->'qatorlar'->0->>'fakt_hajm';
end $$;