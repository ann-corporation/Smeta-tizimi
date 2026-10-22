-- Rollback: token saga. Token daftari (t2_token_harakat) o'zgarmaydi — operator qaytarishlari daftarda qoladi.
-- Saga jadvali faqat holat yozuvi; ma'lumot yo'qolmasligi uchun jadval O'CHIRILMAYDI, faqat trigger va RPC lar olinadi.
drop trigger if exists t2_token_saga_trg on public.t2_token_harakat;
drop function if exists public._t2_token_saga_trg();
drop function if exists public.t2_token_yakunla_v1(bigint, bigint, uuid);
drop function if exists public.t2_boshqaruv_token_saga_v1(bigint);
drop function if exists public.t2_boshqaruv_token_saga_hal_v1(bigint, uuid, text, text);

-- t2_token_qaytar_v1 — asl ko'rinish.
create or replace function public.t2_token_qaytar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sarf_operation_id uuid, p_operation_id uuid, p_sabab text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_sarf public.t2_token_harakat%rowtype;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if exists (select 1 from public.t2_token_harakat where operation_id = p_operation_id) then return jsonb_build_object('ok', true, 'takror', true); end if;
  select * into v_sarf from public.t2_token_harakat where operation_id = p_sarf_operation_id and kompaniya_id = p_kompaniya_id and tur = 'sarf';
  if not found then return jsonb_build_object('ok', false, 'code', 'SARF_TOPILMADI'); end if;
  if v_sarf.yaratildi < now() - interval '24 hours' then return jsonb_build_object('ok', false, 'code', 'MUDDAT_OTGAN'); end if;
  if exists (select 1 from public.t2_token_harakat where bogliq_operation_id = p_sarf_operation_id and tur = 'qaytarish') then
    return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_QAYTARILGAN');
  end if;
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, izoh, operation_id, bogliq_operation_id)
  values (p_kompaniya_id, p_actor_id, -v_sarf.miqdor, 'qaytarish', v_sarf.amal, left(coalesce(p_sabab, ''), 300), p_operation_id, p_sarf_operation_id);
  return jsonb_build_object('ok', true, 'qaytarildi', -v_sarf.miqdor, 'balans', public.t2_token_balans(p_kompaniya_id));
end $function$;
revoke all on function public.t2_token_qaytar_v1(bigint, bigint, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.t2_token_qaytar_v1(bigint, bigint, uuid, uuid, text) to service_role;
