-- acceptance 20270119000002 (ROLLBACK ichida)
do $t$
declare v_k bigint; v_u bigint; v_r jsonb; v_id bigint;
begin
  select a.kompaniya_id, a.foydalanuvchi_id into v_k, v_u from public.t2_azolik a where a.holat = 'faol' and a.rol in ('pto', 'admin', 'boss') limit 1;
  if v_k is null then raise notice 'SKIP: azo yoq'; return; end if;
  v_r := public.t2_hujjat_paket_royxat_v1(v_u, v_k, '{"sahifa_limit":5}'::jsonb);
  if (v_r->>'ok')::boolean is not true then raise exception 'R1: royxat %', v_r; end if;
  if jsonb_array_length(v_r->'nomzodlar') > 5 then raise exception 'R2: sahifa_limit buzildi'; end if;
  if (v_r->>'jami')::int < jsonb_array_length(v_r->'nomzodlar') then raise exception 'R3: jami'; end if;
  if jsonb_typeof(v_r->'barcha_kalitlar') <> 'array' then raise exception 'R4: barcha_kalitlar'; end if;
  v_r := public.t2_hujjat_filtr_saqla_v1(v_u, v_k, 'Sinov toplami', '{"turlar":["f2"]}'::jsonb);
  if (v_r->>'ok')::boolean is not true then raise exception 'R5: saqla %', v_r; end if;
  v_id := (v_r->>'id')::bigint;
  v_r := public.t2_hujjat_filtr_saqla_v1(v_u, v_k, 'sinov TOPLAMI', '{"turlar":["f2","forma3"]}'::jsonb);   -- nom registrsiz: almashtiradi
  if (select count(*) from public.t2_hujjat_filtr where kompaniya_id = v_k and foydalanuvchi_id = v_u and lower(nom) = 'sinov toplami') <> 1 then raise exception 'R6: takror nom'; end if;
  if jsonb_array_length(public.t2_hujjat_filtr_royxat_v1(v_u, v_k)->'filtrlar') < 1 then raise exception 'R7: filtr royxat'; end if;
  if (public.t2_hujjat_filtr_ochir_v1(v_u, v_k, v_id)->>'ok')::boolean is not true then raise exception 'R8: ochir'; end if;
  if (public.t2_hujjat_filtr_saqla_v1(v_u, v_k, '', '{}'::jsonb)->>'code') <> 'NOM_NOTOGRI' then raise exception 'R9: bosh nom'; end if;
  raise notice 'OK: paket royxat/filtr acceptance';
end $t$;
