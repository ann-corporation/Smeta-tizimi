-- Проверяем реальную форму запроса шлюза, включая сортировку/пагинацию.
do $$
declare v_obj bigint; v_plan jsonb;
begin
  if not exists (select 1 from pg_index where indexrelid = 'public.t2_qator_obyekt_id_kursor_idx'::regclass
                 and indisvalid and indisready) then raise exception 'CURSOR_INDEX_NOT_READY'; end if;
  for v_obj in select obyekt_id from public.t2_qator group by obyekt_id order by count(*) desc limit 3 loop
    execute format('explain (format json) select id,nom from public.t2_daraxt where obyekt_id=%s order by id limit 1000',v_obj) into v_plan;
    if v_plan::text not like '%t2_qator_obyekt_id_kursor_idx%' then
      raise exception 'CURSOR_INDEX_NOT_USED object:% plan:%',v_obj,v_plan;
    end if;
  end loop;
  raise notice 'OBJECT_CURSOR_INDEX_ACCEPTANCE_PASS';
end $$;
