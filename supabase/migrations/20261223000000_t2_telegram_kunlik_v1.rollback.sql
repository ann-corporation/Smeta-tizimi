-- T2-TELEGRAM-V2-KUNLIK rollback: kunlik royxat funksiyasi olib tashlanadi; sozlama_v1 asl whitelist ga (topshiriq, f2, signal) qaytariladi.
-- ulanish.bildirishnoma ichidagi 'kunlik' kalitlari zararsiz qoladi (manzil_v1 faqat so'ralgan kalitni o'qiydi).
begin;
drop function if exists public.t2_telegram_kunlik_royxat_v1(integer,bigint);
create or replace function public.t2_telegram_sozlama_v1(p_actor_id bigint, p_bildirishnoma jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_toza jsonb := '{}'::jsonb; k text;
begin
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if p_bildirishnoma is null or jsonb_typeof(p_bildirishnoma) <> 'object' then return jsonb_build_object('ok',false,'code','SOZLAMA_NOTOGRI'); end if;
  foreach k in array array['topshiriq','f2','signal'] loop
    if p_bildirishnoma ? k then
      if jsonb_typeof(p_bildirishnoma -> k) <> 'boolean' then return jsonb_build_object('ok',false,'code','SOZLAMA_NOTOGRI'); end if;
      v_toza := v_toza || jsonb_build_object(k, p_bildirishnoma -> k);
    end if;
  end loop;
  update public.t2_telegram_ulanish set bildirishnoma = bildirishnoma || v_toza where foydalanuvchi_id = p_actor_id and holat = 'faol';
  if not found then return jsonb_build_object('ok',false,'code','ULANMAGAN'); end if;
  return jsonb_build_object('ok',true,'bildirishnoma',(select bildirishnoma from public.t2_telegram_ulanish where foydalanuvchi_id = p_actor_id and holat = 'faol'));
end $$;
revoke all on function public.t2_telegram_sozlama_v1(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.t2_telegram_sozlama_v1(bigint,jsonb) to service_role;
commit;