-- T2-TELEGRAM-V2-KUNLIK (2026-11-15, Telegram V2 1-bosqich): kunlik xulosa opt-in kaliti.
-- 1) t2_telegram_sozlama_v1 whitelist ga 'kunlik' qo'shiladi (boshqa mantiq o'zgarmaydi; mavjud ulanishlar uchun sukut — kalit yo'q = o'chiq).
-- 2) t2_telegram_kunlik_royxat_v1(limit, keyin_id): kunlik=true bo'lgan FAOL ulanishlarning faol foydalanuvchi id lari (kursor bo'yicha).
-- Faqat service_role. Real ma'lumotga tegilmaydi; mavjud jadval/ustun o'zgarmaydi.
begin;

create or replace function public.t2_telegram_sozlama_v1(p_actor_id bigint, p_bildirishnoma jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_toza jsonb := '{}'::jsonb; k text;
begin
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if p_bildirishnoma is null or jsonb_typeof(p_bildirishnoma) <> 'object' then return jsonb_build_object('ok',false,'code','SOZLAMA_NOTOGRI'); end if;
  foreach k in array array['topshiriq','f2','signal','kunlik'] loop
    if p_bildirishnoma ? k then
      if jsonb_typeof(p_bildirishnoma -> k) <> 'boolean' then return jsonb_build_object('ok',false,'code','SOZLAMA_NOTOGRI'); end if;
      v_toza := v_toza || jsonb_build_object(k, p_bildirishnoma -> k);
    end if;
  end loop;
  update public.t2_telegram_ulanish set bildirishnoma = bildirishnoma || v_toza where foydalanuvchi_id = p_actor_id and holat = 'faol';
  if not found then return jsonb_build_object('ok',false,'code','ULANMAGAN'); end if;
  return jsonb_build_object('ok',true,'bildirishnoma',(select bildirishnoma from public.t2_telegram_ulanish where foydalanuvchi_id = p_actor_id and holat = 'faol'));
end $$;

create or replace function public.t2_telegram_kunlik_royxat_v1(p_limit integer, p_keyin_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lim integer := least(greatest(coalesce(p_limit, 4), 1), 50); v_ids bigint[]; v_keyingi bigint;
begin
  select coalesce(array_agg(x.foydalanuvchi_id order by x.foydalanuvchi_id), '{}') into v_ids from (
    select u.foydalanuvchi_id from public.t2_telegram_ulanish u
      join public.t2_foydalanuvchi f on f.id = u.foydalanuvchi_id and f.holat = 'faol'
     where u.holat = 'faol' and (u.bildirishnoma ->> 'kunlik') = 'true' and u.foydalanuvchi_id > coalesce(p_keyin_id, 0)
     order by u.foydalanuvchi_id limit v_lim) x;
  if coalesce(array_length(v_ids, 1), 0) = v_lim then
    v_keyingi := v_ids[v_lim];
    if not exists (select 1 from public.t2_telegram_ulanish u join public.t2_foydalanuvchi f on f.id = u.foydalanuvchi_id and f.holat = 'faol'
                    where u.holat = 'faol' and (u.bildirishnoma ->> 'kunlik') = 'true' and u.foydalanuvchi_id > v_keyingi) then v_keyingi := null; end if;
  end if;
  return jsonb_build_object('ok', true, 'foydalanuvchilar', to_jsonb(v_ids), 'keyingi', v_keyingi);
end $$;

revoke all on function public.t2_telegram_sozlama_v1(bigint,jsonb) from public, anon, authenticated;
revoke all on function public.t2_telegram_kunlik_royxat_v1(integer,bigint) from public, anon, authenticated;
grant execute on function public.t2_telegram_sozlama_v1(bigint,jsonb) to service_role;
grant execute on function public.t2_telegram_kunlik_royxat_v1(integer,bigint) to service_role;

commit;