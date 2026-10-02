-- T2-PTO-TIJORAT-001: Google (Gmail) bilan kirish (egasi, 2026-10-02: "gmail bilan kirishni ham qo'llay oladigan qil").
-- Server (/api/kirish-google) Google ID tokenini imzosi, aud, iss, exp va email_verified bo'yicha TEKSHIRGANDAN keyin
-- chaqiradi. Bu yerda: google_sub yoki tasdiqlangan email bo'yicha mavjud foydalanuvchi; bo'lmasa — o'zi ro'yxatdagidek
-- yangi hisob (o'z kompaniyasi boss, bepul tarif tokenlari, demo). Parol saqlanmaydi.
begin;

alter table public.t2_foydalanuvchi add column if not exists google_sub text;
create unique index if not exists t2_foydalanuvchi_google_sub_uq on public.t2_foydalanuvchi(google_sub) where google_sub is not null;

create or replace function public.t2_google_kirish_v1(p_email text, p_ism text, p_sub text, p_ip_belgi text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_u public.t2_foydalanuvchi%rowtype; v_rol text;
  v_k jsonb; v_kid bigint; v_demo bigint; v_manba bigint; v_ism text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if coalesce(btrim(p_sub), '') = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then return jsonb_build_object('ok', false, 'code', 'GOOGLE_MALUMOT_NOTOGRI'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_google_kirish:' || p_sub, 0));

  select * into v_u from public.t2_foydalanuvchi where google_sub = p_sub;
  if not found then
    select * into v_u from public.t2_foydalanuvchi where lower(email) = v_email or lower(login) = v_email order by id limit 1;
    if found then
      if v_u.google_sub is not null and v_u.google_sub <> p_sub then return jsonb_build_object('ok', false, 'code', 'GOOGLE_BOSHQA_HISOB'); end if;
      -- O'zi ro'yxatdan (parol bilan) o'tgan hisobning emaili TASDIQLANMAGAN: begona odam birovning emailini login qilib
      -- oldindan band qilgan bo'lishi mumkin — avtomatik ulamaymiz (egasi qo'shgan a'zolar emaili — ishonchli).
      if exists (select 1 from public.t2_ozi_royxat_log where foydalanuvchi_id = v_u.id) then
        return jsonb_build_object('ok', false, 'code', 'EMAIL_PAROL_BILAN', 'xabar', 'Bu email parol bilan ro''yxatdan o''tgan. Login va parol bilan kiring.');
      end if;
      update public.t2_foydalanuvchi set google_sub = p_sub, email = coalesce(email, v_email) where id = v_u.id;
    end if;
  end if;

  if v_u.id is not null then
    if v_u.holat is distinct from 'faol' then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
    select a.rol into v_rol from public.t2_azolik a where a.foydalanuvchi_id = v_u.id and a.holat = 'faol' order by a.id limit 1;
    return jsonb_build_object('ok', true, 'yangi', false, 'login', v_u.login, 'foydalanuvchi_id', v_u.id, 'rol', coalesce(v_rol, 'kuzatuvchi'));
  end if;

  -- Yangi hisob: o'zi ro'yxat qoidalari (qurilma limiti, bepul tarif, demo).
  perform pg_advisory_xact_lock(hashtextextended('t2_ozi_royxat', 0));
  if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = p_ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu qurilmadan bugun ro''yxatdan o''tish limiti tugadi. Ertaga urinib ko''ring.');
  end if;
  v_ism := coalesce(nullif(btrim(left(coalesce(p_ism, ''), 200)), ''), split_part(v_email, '@', 1));
  insert into public.t2_foydalanuvchi(login, email, ism, holat, google_sub)
  values (v_email, v_email, v_ism, 'faol', p_sub) returning * into v_u;
  v_k := public._t2_kompaniya_yarat_asosiy(v_u.id, v_ism || ' — PTO', null, null);
  if coalesce((v_k->>'ok')::boolean, false) is not true then raise exception 'KOMPANIYA_YARATILMADI: %', v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  insert into public.t2_obuna(kompaniya_id, tarif_kod, boshlandi, tugaydi, kim) values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'google');
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, izoh, operation_id)
  values (v_kid, v_u.id, (select oylik_token from public.t2_tarif where kod = 'free'), 'oylik', 'Bepul sinov — 1-oy', gen_random_uuid());
  select obyekt_id into v_manba from public.t2_demo_manba where id = 1;
  if v_manba is not null then v_demo := public._t2_demo_nusxa(v_kid, v_manba); end if;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_u.id, v_kid, p_operation_id);
  perform public.t2_audit_yoz(v_kid, 'ozi_royxat', 'kompaniya', v_demo, format('google login=%s', v_email), 'google', p_ip_belgi);
  return jsonb_build_object('ok', true, 'yangi', true, 'login', v_email, 'foydalanuvchi_id', v_u.id, 'rol', 'boss', 'demo_obyekt_id', v_demo);
end $$;
revoke all on function public.t2_google_kirish_v1(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_google_kirish_v1(text, text, text, text, uuid) to service_role;

commit;
