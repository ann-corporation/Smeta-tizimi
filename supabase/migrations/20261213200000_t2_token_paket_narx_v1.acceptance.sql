-- Acceptance: paket narxi = har fayl narxlarining yig'indisi; bitta fayl natijasi t2_token_hisobla_v2 bilan bir xil.
-- Bo'sh/yolg'on natija bo'lsa xato ko'taradi (BEGIN/COMMIT yo'q; faqat o'qiydi).
do $$
declare v_bitta jsonb; v_paket jsonb; v_a jsonb; v_b jsonb;
begin
  v_a := public.t2_token_hisobla_v2('hujjat', 120);
  v_b := public.t2_token_hisobla_v2('hujjat', 0);
  if v_a is null or v_b is null then raise exception 'ACCEPT: hujjat narxi topilmadi (t2_token_narx.hujjat faol emas)'; end if;
  v_bitta := public.t2_token_hisobla_paket_v1('hujjat', array[120]::numeric[]);
  if (v_bitta->>'token')::numeric <> (v_a->>'token')::numeric then raise exception 'ACCEPT: bitta fayl paketi != oddiy hisob'; end if;
  v_paket := public.t2_token_hisobla_paket_v1('hujjat', array[120, 0, 120]::numeric[]);
  if (v_paket->>'token')::numeric <> 2 * (v_a->>'token')::numeric + (v_b->>'token')::numeric then raise exception 'ACCEPT: paket token yig''indisi noto''g''ri'; end if;
  if (v_paket->>'yakuniy_som')::numeric <> 2 * (v_a->>'yakuniy_som')::numeric + (v_b->>'yakuniy_som')::numeric then raise exception 'ACCEPT: paket so''m yig''indisi noto''g''ri'; end if;
  if (v_paket->>'fayl_soni')::int <> 3 then raise exception 'ACCEPT: fayl_soni'; end if;
  if public.t2_token_hisobla_paket_v1('hujjat', array[]::numeric[]) is not null then raise exception 'ACCEPT: bo''sh paket null bo''lishi kerak'; end if;
  if public.t2_token_hisobla_paket_v1('yoq_amal', array[1]::numeric[]) is not null then raise exception 'ACCEPT: noma''lum amal null bo''lishi kerak'; end if;
end $$;
