-- Acceptance: 20261223000000 — Telegram kunlik xulosa kaliti. SINTETIK yozuvlar (o'zi yaratadi). BEGIN … ROLLBACK.
-- K1 funksiyalar bor, anon/authenticated chaqira olmaydi, service_role chaqira oladi.
-- K2 sozlama 'kunlik' boolean qabul qiladi, boolean bo'lmasa rad; noma'lum kalit e'tiborsiz.
-- K3 kunlik_royxat faqat kunlik=true faol ulanishlarni (faol foydalanuvchi) kursor bo'yicha qaytaradi.
begin;
do $acc$
declare
  v_a bigint; v_tg bigint := 900000000000 + (random() * 1000000)::bigint; r jsonb; f text;
begin
  foreach f in array array['t2_telegram_sozlama_v1(bigint,jsonb)','t2_telegram_kunlik_royxat_v1(integer,bigint)'] loop
    if to_regprocedure('public.' || f) is null then raise exception 'ACCEPT_FAIL: % yo''q', f; end if;
    if has_function_privilege('anon', 'public.' || f, 'execute') or has_function_privilege('authenticated', 'public.' || f, 'execute') then raise exception 'ACCEPT_FAIL: % ochiq', f; end if;
    if not has_function_privilege('service_role', 'public.' || f, 'execute') then raise exception 'ACCEPT_FAIL: % service_role ga yopiq', f; end if;
  end loop;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tg-kunlik-sinov-' || v_tg || '@sinov.invalid', 'Sinov K', 'faol') returning id into v_a;
  insert into public.t2_telegram_ulanish (foydalanuvchi_id, telegram_user_id, chat_id, til) values (v_a, v_tg, v_tg, 'uz');
  r := public.t2_telegram_sozlama_v1(v_a, jsonb_build_object('kunlik', 'ha'));
  if coalesce((r->>'ok')::boolean, true) is not false or r->>'code' <> 'SOZLAMA_NOTOGRI' then raise exception 'ACCEPT_FAIL: boolean bo''lmagan kunlik qabul qilindi'; end if;
  r := public.t2_telegram_sozlama_v1(v_a, jsonb_build_object('kunlik', true, 'yomon', true));
  if (r->'bildirishnoma'->>'kunlik') <> 'true' or (r->'bildirishnoma') ? 'yomon' then raise exception 'ACCEPT_FAIL: sozlama whitelist'; end if;
  r := public.t2_telegram_kunlik_royxat_v1(50, (v_a - 1));
  if not (r->'foydalanuvchilar') @> to_jsonb(v_a) then raise exception 'ACCEPT_FAIL: kunlik=true foydalanuvchi royxatda yo''q'; end if;
  perform public.t2_telegram_sozlama_v1(v_a, jsonb_build_object('kunlik', false));
  r := public.t2_telegram_kunlik_royxat_v1(50, (v_a - 1));
  if (r->'foydalanuvchilar') @> to_jsonb(v_a) then raise exception 'ACCEPT_FAIL: kunlik=false royxatda qoldi'; end if;
  raise notice 'ACCEPT OK: 20261223000000_t2_telegram_kunlik_v1';
end $acc$;
rollback;