-- Hujjat PAKETI narxi: bitta yechim = paketdagi har fayl narxlarining YIG'INDISI (yashirin chegirma yo'q).
-- Egasi qoidasi: har hujjat token oladi; ko'p fayl (masalan АОСР «Butun paket») bitta paket sifatida bir marta yechiladi,
-- lekin summa har fayl narxining (t2_token_hisobla_v2) yig'indisiga teng. Narx qoidasi o'zgarmaydi — faqat yig'ish.
-- Mijoz p_meta.fayl_yacheykalar = [n1, n2, ...] (har fayl hisoblangan katak soni) yuboradi; bo'lmasa — eski yo'l.

create or replace function public.t2_token_hisobla_paket_v1(p_amal text, p_fayllar numeric[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare x numeric; h jsonb; v_birinchi jsonb; v_som numeric := 0; v_token numeric := 0; v_tannarx numeric := 0; v_n numeric := 0; v_soni integer := 0;
begin
  if p_fayllar is null or coalesce(array_length(p_fayllar, 1), 0) = 0 then return null; end if;
  foreach x in array p_fayllar loop
    h := public.t2_token_hisobla_v2(p_amal, x);
    if h is null then return null; end if;
    v_birinchi := coalesce(v_birinchi, h);
    v_som := v_som + (h->>'yakuniy_som')::numeric;
    v_token := v_token + (h->>'token')::numeric;
    v_tannarx := v_tannarx + (h->>'tannarx_som')::numeric;
    v_n := v_n + coalesce(x, 0);
    v_soni := v_soni + 1;
  end loop;
  return v_birinchi || jsonb_build_object('nom', (v_birinchi->>'nom') || ' (paket: ' || v_soni || ' fayl)', 'birlik_soni', v_n,
    'fayl_soni', v_soni, 'tannarx_som', v_tannarx, 'yakuniy_som', v_som, 'token', v_token);
end $$;

revoke all on function public.t2_token_hisobla_paket_v1(text, numeric[]) from public, anon, authenticated;
grant execute on function public.t2_token_hisobla_paket_v1(text, numeric[]) to service_role;

-- Sarf: 20261105310000 dagi tana + paket tarmog'i (p_meta.fayl_yacheykalar). Qolgan hamma narsa o'zgarmagan.
create or replace function public.t2_token_sarfla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_amal text, p_birlik_soni numeric,
  p_operation_id uuid, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev public.t2_token_harakat%rowtype; v_h jsonb; v_narx numeric; v_balans numeric; v_xesh text := nullif(p_meta->>'xesh', '');
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select * into v_prev from public.t2_token_harakat where operation_id = p_operation_id;
  if found then
    if v_prev.kompaniya_id <> p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_BAND'); end if;
    return jsonb_build_object('ok', true, 'takror', true, 'sarflandi', -v_prev.miqdor, 'balans', public.t2_token_balans(p_kompaniya_id));
  end if;
  if jsonb_typeof(p_meta->'fayl_yacheykalar') = 'array' and jsonb_array_length(p_meta->'fayl_yacheykalar') between 1 and 2000 then
    v_h := public.t2_token_hisobla_paket_v1(p_amal, array(select e.value::numeric from jsonb_array_elements_text(p_meta->'fayl_yacheykalar') as e));
  else
    v_h := public.t2_token_hisobla_v2(p_amal, p_birlik_soni);
  end if;
  if v_h is null then return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM'); end if;
  v_narx := (v_h->>'token')::numeric;
  perform pg_advisory_xact_lock(hashtextextended('t2_token:' || p_kompaniya_id, 0));
  -- Bir xil hujjat (mazmun xeshi) shu kompaniyada allaqachon to'langan va qaytarilmagan bo'lsa — qayta to'lov yo'q.
  if v_xesh is not null and exists (
       select 1 from public.t2_token_harakat h
        where h.kompaniya_id = p_kompaniya_id and h.tur = 'sarf' and h.amal = p_amal and h.meta->>'xesh' = v_xesh
          and not exists (select 1 from public.t2_token_harakat q where q.tur = 'qaytarish' and q.bogliq_operation_id = h.operation_id)) then
    return jsonb_build_object('ok', true, 'sarflandi', 0, 'bepul_takror', true, 'hisob', v_h, 'balans', public.t2_token_balans(p_kompaniya_id));
  end if;
  v_balans := public.t2_token_balans(p_kompaniya_id);
  if v_narx > 0 and v_balans < v_narx then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_YETMAYDI', 'kerak', v_narx, 'balans', v_balans, 'hisob', v_h);
  end if;
  if v_narx > 0 then
    insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, birlik_soni, meta, operation_id)
    values (p_kompaniya_id, p_actor_id, -v_narx, 'sarf', p_amal, p_birlik_soni, coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('hisob', v_h), p_operation_id);
  end if;
  return jsonb_build_object('ok', true, 'sarflandi', v_narx, 'hisob', v_h, 'balans', v_balans - v_narx);
end $$;
