-- Rollback: 20270102000000 — sinov RPClari olib tashlanadi, ozi_och avvalgi (20261217210000) matniga qaytadi, bonus 500.
-- Diqqat: allaqachon yaratilgan sinov kompaniyalari/tokenlar/demo nusxalar O'CHIRILMAYDI (foydalanuvchi ma'lumoti); namuna manba obyekt ham qoladi.
begin;
update public.t2_token_sozlama set royxat_bonus_token = 500, yangilandi = now() where id = 1;
drop function if exists public.t2_sinov_boshlash_v1(bigint, uuid);
drop function if exists public.t2_sinov_demo_v1(bigint, uuid);
drop function if exists public.t2_sinov_holat_v1(bigint);

create or replace function public.t2_kompaniya_ozi_och_v1(p_actor_id bigint, p_nom text, p_inn text, p_telefon text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_prev public.t2_onboarding_command_log%rowtype; v_nom text := btrim(coalesce(p_nom, '')); v_inn text := nullif(btrim(coalesce(p_inn, '')), '');
  v_tel text := nullif(btrim(left(coalesce(p_telefon, ''), 40)), ''); v_k jsonb; v_kid bigint; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then
    if v_prev.actor_id <> p_actor_id or v_prev.command <> 'kompaniya_ozi_och' then return jsonb_build_object('ok', false, 'code', 'OPERATION_CONFLICT'); end if;
    return v_prev.natija || '{"takror":true}'::jsonb;
  end if;
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_kompaniya_ozi_och:' || p_actor_id, 0));
  if exists (select 1 from public.t2_onboarding_command_log where actor_id = p_actor_id and command = 'kompaniya_ozi_och') then
    return jsonb_build_object('ok', false, 'code', 'OZI_OCHILGAN', 'xato', 'Siz allaqachon o''zingiz kompaniya ochgansiz. Qo''shimcha kompaniya — so''rov orqali (STIR bilan).');
  end if;
  if length(v_nom) < 2 or length(v_nom) > 200 then return jsonb_build_object('ok', false, 'code', 'COMPANY_NAME_REQUIRED'); end if;
  if v_inn is not null and v_inn !~ '^[0-9]{9}$' then return jsonb_build_object('ok', false, 'code', 'INN_INVALID', 'xato', 'STIR 9 ta raqam'); end if;
  if v_inn is not null then
    perform pg_advisory_xact_lock(hashtextextended('t2_kompaniya_inn:' || v_inn, 0));
    if exists (select 1 from public.t2_kompaniya where inn = v_inn)
       or exists (select 1 from public.t2_kompaniya_royxat where inn = v_inn and holat = 'kutilmoqda') then
      return jsonb_build_object('ok', false, 'code', 'INN_BAND', 'xato', 'Bu kompaniya tizimda mavjud. Uning egasidan taklif so''rang.');
    end if;
  end if;
  v_k := public._t2_kompaniya_yarat_asosiy(p_actor_id, v_nom, v_inn, v_tel);
  if coalesce((v_k->>'ok')::boolean, false) is not true then return v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  insert into public.t2_obuna (kompaniya_id, tarif_kod, boshlandi, tugaydi, kim) values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'ozi_och');
  perform public._t2_sinov_bonus(v_kid, p_actor_id);
  perform public.t2_audit_yoz(v_kid, 'kompaniya_ozi_och', 'onboarding', null, format('kompaniya=%s boss=azolik:%s (tasdiqsiz, 1-kompaniya)', v_kid, v_k->>'azolik_id'), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'kompaniya_id', v_kid, 'kod', v_k->>'kod', 'rol', 'boss', 'azolik_id', (v_k->>'azolik_id')::bigint);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'kompaniya_ozi_och', v_res);
  return v_res;
end $f$;
revoke all on function public.t2_kompaniya_ozi_och_v1(bigint, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_kompaniya_ozi_och_v1(bigint, text, text, text, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
