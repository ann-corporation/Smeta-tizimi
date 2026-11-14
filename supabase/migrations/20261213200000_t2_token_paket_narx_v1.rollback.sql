-- Rollback: t2_token_sarfla_v1 ni 20261105310000 dagi asl tanasiga qaytaradi va paket hisob funksiyasini o'chiradi.
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
  v_h := public.t2_token_hisobla_v2(p_amal, p_birlik_soni);
  if v_h is null then return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM'); end if;
  v_narx := (v_h->>'token')::numeric;
  perform pg_advisory_xact_lock(hashtextextended('t2_token:' || p_kompaniya_id, 0));
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

drop function if exists public.t2_token_hisobla_paket_v1(text, numeric[]);
