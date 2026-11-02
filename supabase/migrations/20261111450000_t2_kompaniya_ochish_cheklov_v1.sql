-- AKKAUNT-KIRISH-20261026 — kompaniya ochishni cheklash (egasi 2026-10-26).
-- Egasi: «xohlagan odam xohlaganicha kompaniya ochib tizimni to'ldirib tashlaydi». Qarori: «1 ta shaxsiy ish joyi» —
--   har odamga bitta shaxsiy ish joyi (yakka smetachi uchun); HAQIQIY kompaniya (tashkilot, STIR bilan) faqat
--   platforma superadmini tasdig'i bilan.
--
-- Avval (20261106740000 «Telegram modeli»): t2_ish_joyi_yarat_v1 har kimga kuniga 3, jami 20 tagacha ish joyini — shu
-- jumladan 'tashkilot' turini ham — DARHOL ochishga ruxsat berardi; t2_ish_joyi_turi_v1 bilan boss shaxsiy joyni
-- 'tashkilot' ga aylantira olardi; t2_kompaniya_royxat_soraw_v1 da cheklov yo'q edi (cheksiz so'rov, STIR ixtiyoriy).
-- Endi:
--   1) t2_ish_joyi_yarat_v1 — faqat 'shaxsiy' va faqat bitta (o'zi rahbar bo'lgan faol shaxsiy ish joyi bo'lmasa).
--      'tashkilot' → TASHKILOT_SOROV_ORQALI (so'rov yuborish kerak).
--   2) t2_ish_joyi_turi_v1 — turini faqat platforma superadmini o'zgartiradi.
--   3) t2_kompaniya_royxat_soraw_v1 — STIR majburiy (9 raqam); bir vaqtda 1 ta kutilayotgan so'rov; 30 kunda 3 ta;
--      shu STIR bilan tashkilot allaqachon bo'lsa yoki boshqa kutilayotgan so'rovda bo'lsa — rad.
-- Ro'yxatdan o'tishdagi avtomatik shaxsiy ish joyi (email/Google) o'zgarmaydi: yangi hisobga 1 ta.

begin;

create or replace function public.t2_ish_joyi_yarat_v1(p_actor_id bigint, p_nom text, p_turi text, p_operation_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_prev jsonb; v_k jsonb; v_kid bigint; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev || '{"takror":true}'::jsonb; end if;
  if p_turi not in ('shaxsiy', 'tashkilot') then return jsonb_build_object('ok', false, 'code', 'TURI_NOTOGRI'); end if;
  if p_turi = 'tashkilot' then
    return jsonb_build_object('ok', false, 'code', 'TASHKILOT_SOROV_ORQALI',
      'xabar', 'Tashkilot (kompaniya) faqat so''rov orqali ochiladi: STIR bilan so''rov yuboring, platforma administratori tasdiqlaydi.');
  end if;
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and coalesce(holat, 'faol') = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_joyi_yarat:' || p_actor_id, 0));
  if exists (select 1 from public.t2_azolik a join public.t2_kompaniya k on k.id = a.kompaniya_id
              where a.foydalanuvchi_id = p_actor_id and a.holat = 'faol' and a.rol = 'boss' and k.turi = 'shaxsiy' and k.faol) then
    return jsonb_build_object('ok', false, 'code', 'SHAXSIY_BOR', 'xabar', 'Sizda shaxsiy ish joyi allaqachon bor. Har odamga bitta.');
  end if;
  v_k := public._t2_kompaniya_yarat_asosiy(p_actor_id, p_nom, null, null);
  if coalesce((v_k->>'ok')::boolean, false) is not true then return v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  update public.t2_kompaniya set turi = 'shaxsiy' where id = v_kid;
  insert into public.t2_obuna(kompaniya_id, tarif_kod, boshlandi, tugaydi, kim)
    values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'ish_joyi_yarat');
  perform public.t2_audit_yoz(v_kid, 'ish_joyi_yarat', 'kompaniya', null, format('nom=%s turi=shaxsiy', btrim(p_nom)), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'kompaniya_id', v_kid, 'kod', v_k->>'kod', 'turi', 'shaxsiy');
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_joyi_yarat', v_res);
  return v_res;
end $function$;

create or replace function public.t2_ish_joyi_turi_v1(p_actor_id bigint, p_kompaniya_id bigint, p_turi text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_turi not in ('shaxsiy', 'tashkilot') then return jsonb_build_object('ok', false, 'code', 'TURI_NOTOGRI'); end if;
  if not coalesce(public.t2_platforma_superadmin(p_actor_id), false) then
    return jsonb_build_object('ok', false, 'code', 'SUPERADMIN_REQUIRED',
      'xabar', 'Ish joyi turini faqat platforma administratori o''zgartiradi (tashkilot — so''rov orqali).');
  end if;
  update public.t2_kompaniya set turi = p_turi where id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'COMPANY_NOT_FOUND'); end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_joyi_turi', 'kompaniya', null, format('turi=%s', p_turi), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'kompaniya_id', p_kompaniya_id, 'turi', p_turi);
end $function$;

create or replace function public.t2_kompaniya_royxat_soraw_v1(
  p_actor_id bigint, p_nom text, p_inn text, p_telefon text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev jsonb; v_royxat_id bigint; v_nom text; v_inn text;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and coalesce(holat,'faol') = 'faol') then
    return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND');
  end if;

  v_nom := btrim(coalesce(p_nom,''));
  if length(v_nom) < 2 then return jsonb_build_object('ok',false,'code','COMPANY_NAME_REQUIRED'); end if;
  v_inn := btrim(coalesce(p_inn,''));
  if v_inn !~ '^\d{9}$' then
    return jsonb_build_object('ok',false,'code','INN_REQUIRED','xato','STIR majburiy: 9 ta raqam');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('t2_kompaniya_royxat:' || p_actor_id, 0));
  if exists (select 1 from public.t2_kompaniya_royxat where actor_id = p_actor_id and holat = 'kutilmoqda') then
    return jsonb_build_object('ok',false,'code','SOROV_KUTILMOQDA','xato','Sizda ko''rib chiqilayotgan so''rov bor. Javobini kuting.');
  end if;
  if (select count(*) from public.t2_kompaniya_royxat where actor_id = p_actor_id and created_at > now() - interval '30 days') >= 3 then
    return jsonb_build_object('ok',false,'code','SOROV_LIMIT','xato','30 kunda 3 tadan ortiq so''rov yuborib bo''lmaydi.');
  end if;
  if exists (select 1 from public.t2_kompaniya where inn = v_inn and turi = 'tashkilot') then
    return jsonb_build_object('ok',false,'code','INN_BAND','xato','Bu STIR bilan kompaniya tizimda allaqachon bor. Uning rahbaridan taklif havolasini so''rang.');
  end if;
  if exists (select 1 from public.t2_kompaniya_royxat where inn = v_inn and holat = 'kutilmoqda') then
    return jsonb_build_object('ok',false,'code','INN_KUTILMOQDA','xato','Bu STIR bo''yicha so''rov allaqachon ko''rib chiqilmoqda.');
  end if;

  insert into public.t2_kompaniya_royxat (actor_id, nom, inn, telefon, operation_id)
  values (p_actor_id, v_nom, v_inn, nullif(btrim(coalesce(p_telefon,'')),''), p_operation_id)
  returning id into v_royxat_id;

  v_prev := jsonb_build_object('ok',true,'royxat_id',v_royxat_id,'holat','kutilmoqda');
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'kompaniya_royxat_soraw', v_prev);
  return v_prev;
end $$;

revoke all on function public.t2_ish_joyi_yarat_v1(bigint, text, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_ish_joyi_yarat_v1(bigint, text, text, uuid) to service_role;
revoke all on function public.t2_ish_joyi_turi_v1(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.t2_ish_joyi_turi_v1(bigint, bigint, text) to service_role;
revoke all on function public.t2_kompaniya_royxat_soraw_v1(bigint,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.t2_kompaniya_royxat_soraw_v1(bigint,text,text,text,uuid) to service_role;

commit;
