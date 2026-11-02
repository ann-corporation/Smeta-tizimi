-- Rollback: 20261111450000_t2_kompaniya_ochish_cheklov_v1 — uch funksiyaning avvalgi (cheklovsiz) tanalarini qaytaradi.
begin;
create or replace function public.t2_ish_joyi_turi_v1(p_actor_id bigint, p_kompaniya_id bigint, p_turi text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_turi not in ('shaxsiy', 'tashkilot') then return jsonb_build_object('ok', false, 'code', 'TURI_NOTOGRI'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.profile.update');
  update public.t2_kompaniya set turi = p_turi where id = p_kompaniya_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_joyi_turi', 'kompaniya', null, format('turi=%s', p_turi), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'kompaniya_id', p_kompaniya_id, 'turi', p_turi);
end $function$;
create or replace function public.t2_ish_joyi_yarat_v1(p_actor_id bigint, p_nom text, p_turi text, p_operation_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_prev jsonb; v_k jsonb; v_kid bigint; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev || '{"takror":true}'::jsonb; end if;
  if p_turi not in ('shaxsiy', 'tashkilot') then return jsonb_build_object('ok', false, 'code', 'TURI_NOTOGRI'); end if;
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and coalesce(holat, 'faol') = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_joyi_yarat:' || p_actor_id, 0));
  if (select count(*) from public.t2_onboarding_command_log where actor_id = p_actor_id and command = 'ish_joyi_yarat'
        and created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT_KUN', 'xabar', 'Bir kunda 3 tadan ortiq ish joyi ochib bo''lmaydi.');
  end if;
  if (select count(*) from public.t2_azolik where foydalanuvchi_id = p_actor_id and holat = 'faol' and rol = 'boss') >= 20 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT_JAMI', 'xabar', 'Bitta foydalanuvchida 20 tadan ortiq ish joyi bo''lmaydi.');
  end if;
  v_k := public._t2_kompaniya_yarat_asosiy(p_actor_id, p_nom, null, null);
  if coalesce((v_k->>'ok')::boolean, false) is not true then return v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  update public.t2_kompaniya set turi = p_turi where id = v_kid;
  insert into public.t2_obuna(kompaniya_id, tarif_kod, boshlandi, tugaydi, kim)
    values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'ish_joyi_yarat');
  perform public.t2_audit_yoz(v_kid, 'ish_joyi_yarat', 'kompaniya', null, format('nom=%s turi=%s', btrim(p_nom), p_turi), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'kompaniya_id', v_kid, 'kod', v_k->>'kod', 'turi', p_turi);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_joyi_yarat', v_res);
  return v_res;
end $function$;
create or replace function public.t2_kompaniya_royxat_soraw_v1(
  p_actor_id bigint, p_nom text, p_inn text, p_telefon text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev jsonb; v_royxat_id bigint; v_nom text;
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
  if p_inn is not null and p_inn <> '' and p_inn !~ '^\d{9}$' then
    return jsonb_build_object('ok',false,'code','INN_INVALID','xato','STIR 9 ta raqam');
  end if;

  insert into public.t2_kompaniya_royxat (actor_id, nom, inn, telefon, operation_id)
  values (p_actor_id, v_nom, nullif(p_inn,''), nullif(p_telefon,''), p_operation_id)
  returning id into v_royxat_id;

  -- `t2_audit_log.kompaniya_id` NOT NULL — bu bosqichda kompaniya hali
  -- yo'q, shuning uchun umumiy audit jurnaliga yozilmaydi. `t2_kompaniya_
  -- royxat` jadvalining o'zi (actor_id/created_at/decided_by/decided_at)
  -- shu bosqich uchun yetarli audit izi.

  v_prev := jsonb_build_object('ok',true,'royxat_id',v_royxat_id,'holat','kutilmoqda');
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'kompaniya_royxat_soraw', v_prev);
  return v_prev;
end $$;
commit;
