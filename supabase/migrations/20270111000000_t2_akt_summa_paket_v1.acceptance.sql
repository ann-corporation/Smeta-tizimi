-- Qabul sinovi (faqat ROLLBACK ichida): mavjud tasdiqlangan F2 akt uchun paket yadro bilan bir xil bo'lishi kerak.
do $$ declare v_akt record; v_r jsonb; v_actor bigint;
begin
  select a.id, a.obyekt_id, a.kompaniya_id into v_akt from public.t2_akt a where a.tur = 'f2' and a.lifecycle_status = 'approved' order by a.id desc limit 1;
  select m.foydalanuvchi_id into v_actor from public.t2_azolik m where m.kompaniya_id = v_akt.kompaniya_id and m.holat = 'faol' order by m.id limit 1;
  v_r := public.t2_akt_summa_paket_v1(v_akt.id, v_actor);
  if (v_r->>'ok')::boolean is not true or v_r->'paket'->>'qqs_bilan' is null then raise exception 'ACC: paket yoq %', left(v_r::text, 300); end if;
  if v_r->'paket' is distinct from (select x.paket from public._t2_summa_paket_v1(array[v_akt.obyekt_id], 'aktlar', array[v_akt.id]) x limit 1) then raise exception 'ACC: yadrodan farq'; end if;
  if (public.t2_akt_summa_paket_v1(-1, v_actor)->>'code') <> 'AKT_NOT_FOUND' then raise exception 'ACC: yoq akt'; end if;
  raise notice 'ACC OK akt % qqs_bilan %', v_akt.id, v_r->'paket'->>'qqs_bilan';
end $$;