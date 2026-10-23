-- Acceptance: 20261106860000 — ro'yxat F2 V3 qoralamalarini qaytaradi; a'zo bo'lmagan actor rad etiladi. BEGIN … ROLLBACK.
begin;
do $acc$
declare v_k bigint; v_a bigint; r jsonb; n int; x jsonb;
begin
  select j.kompaniya_id, z.foydalanuvchi_id into v_k, v_a from public.t2_f2_import_job j
    join public.t2_azolik z on z.kompaniya_id = j.kompaniya_id and z.holat = 'faol'
   where j.cursor->>'phase' = 'f2_v3_review' limit 1;
  if v_k is null then raise notice 'F2 V3 qoralamasi yo''q — tekshiruv o''tkazib yuborildi'; return; end if;
  r := public.t2_f2_import_job_royxat_v1(v_k, v_a, null);
  if r->>'ok' <> 'true' then raise exception 'ok emas: %', r; end if;
  select count(*) into n from public.t2_f2_import_job where kompaniya_id = v_k and cursor->>'phase' = 'f2_v3_review' and status not in ('cancelled', 'failed');
  if jsonb_array_length(r->'qatorlar') <> n then raise exception 'soni mos emas'; end if;
  for x in select * from jsonb_array_elements(r->'qatorlar') loop
    if (x->>'aniq')::int + (x->>'taklif')::int + (x->>'topilmadi')::int + (x->>'otkaz')::int
       <> (select count(*) from public.t2_f2_import_draft_qator where job_id = (x->>'job_id')::bigint) then
      raise exception 'job % hisob mos emas', x->>'job_id';
    end if;
  end loop;
  begin
    perform public.t2_f2_import_job_royxat_v1(v_k, -1, null);
    raise exception 'begona actor rad etilmadi';
  exception when others then
    if sqlerrm = 'begona actor rad etilmadi' then raise; end if;
  end;
end $acc$;
rollback;
