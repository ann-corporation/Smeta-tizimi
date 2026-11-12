-- Rollback: 20261218600000_t2_yagona_akkaunt_v1. t2_kirish_usul jadvali va birlashtirish v2 olib tashlanadi; v2 bilan BIRLASHTIRILGAN hisoblar (holat='birlashtirildi', birlashgan_id) QOLADI —
-- ularning a'zolik/usul ko'chishi qaytarilmaydi (ma'lumot yo'qolmaydi). Google/Telegram funksiyalari avvalgi (prod / 20261217200000) tanasiga qaytariladi.
create or replace function public.t2_google_kirish_v1(p_email text, p_ism text, p_sub text, p_ip_belgi text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_u public.t2_foydalanuvchi%rowtype; v_rol text;
  v_k jsonb; v_final bigint; v_kid bigint; v_demo bigint; v_manba bigint; v_ism text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if coalesce(btrim(p_sub), '') = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then return jsonb_build_object('ok', false, 'code', 'GOOGLE_MALUMOT_NOTOGRI'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_google_kirish:' || p_sub, 0));
  select * into v_u from public.t2_foydalanuvchi where google_sub = p_sub;
  if not found then
    select * into v_u from public.t2_foydalanuvchi where lower(email) = v_email or lower(login) = v_email order by id limit 1;
    if found then
      if v_u.holat = 'birlashtirildi' then
        v_final := public._t2_hisob_oxirgi(v_u.id);
        if v_final is null then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
        select * into v_u from public.t2_foydalanuvchi where id = v_final;
      end if;
      if v_u.google_sub is not null and v_u.google_sub <> p_sub then return jsonb_build_object('ok', false, 'code', 'GOOGLE_BOSHQA_HISOB'); end if;
      if v_u.email_tasdiqlandi_at is null and exists (select 1 from public.t2_ozi_royxat_log where foydalanuvchi_id = v_u.id) then
        return jsonb_build_object('ok', false, 'code', 'EMAIL_PAROL_BILAN', 'xabar', 'Bu email parol bilan ro''yxatdan o''tgan. Login va parol bilan kiring.');
      end if;
      update public.t2_foydalanuvchi set google_sub = p_sub, email = coalesce(email, v_email) where id = v_u.id;
    end if;
  end if;
  if v_u.id is not null then
    if v_u.holat = 'birlashtirildi' then
      v_final := public._t2_hisob_oxirgi(v_u.id);
      if v_final is null then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
      select * into v_u from public.t2_foydalanuvchi where id = v_final;
    end if;
    if v_u.holat is distinct from 'faol' then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
    v_rol := public._t2_asosiy_rol(v_u.id);
    return jsonb_build_object('ok', true, 'yangi', false, 'login', v_u.login, 'foydalanuvchi_id', v_u.id, 'rol', coalesce(v_rol, 'kuzatuvchi'));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ozi_royxat', 0));
  if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = p_ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu qurilmadan bugun ro''yxatdan o''tish limiti tugadi. Ertaga urinib ko''ring.');
  end if;
  v_ism := coalesce(nullif(btrim(left(coalesce(p_ism, ''), 200)), ''), split_part(v_email, '@', 1));
  insert into public.t2_foydalanuvchi(login, email, ism, holat, google_sub)
  values (v_email, v_email, v_ism, 'faol', p_sub) returning * into v_u;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_u.id, null, p_operation_id);
  return jsonb_build_object('ok', true, 'yangi', true, 'login', v_email, 'foydalanuvchi_id', v_u.id, 'rol', 'kuzatuvchi', 'demo_obyekt_id', null);
end $f$;

create or replace function public.t2_tg_kirish_holat_v1(p_nonce_xesh text, p_brauzer_xesh text, p_ip_belgi text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v public.t2_kirish_nonce%rowtype; v_tg public.t2_telegram_ulanish%rowtype; v_u public.t2_foydalanuvchi%rowtype; v_uid bigint; v_yangi boolean := false;
  v_az jsonb; v_rol text; v_ism text; v_boshqa bigint;
begin
  if p_operation_id is null or coalesce(p_nonce_xesh, '') !~ '^[0-9a-f]{64}$' or coalesce(p_brauzer_xesh, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI');
  end if;
  select * into v from public.t2_kirish_nonce where nonce_xesh = p_nonce_xesh for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v.brauzer_xesh <> p_brauzer_xesh then
    -- faqat havolani bilgan, lekin brauzer sirini bilmagan: umumiy javob; 5 xatodan keyin nonce o'ladi.
    update public.t2_kirish_nonce set xato_urinish = xato_urinish + 1, holat = case when xato_urinish + 1 >= 5 and holat <> 'ishlatildi' then 'bekor' else holat end where id = v.id;
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI');
  end if;
  if v.holat in ('ishlatildi', 'bekor') then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v.sorov_soni >= 400 then
    update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
    return jsonb_build_object('ok', false, 'code', 'LIMIT');
  end if;
  update public.t2_kirish_nonce set sorov_soni = sorov_soni + 1 where id = v.id;
  if v.tugaydi <= now() then
    update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
    return jsonb_build_object('ok', false, 'code', 'MUDDATI_OTGAN');
  end if;
  if v.holat <> 'tasdiqlandi' then return jsonb_build_object('ok', true, 'holat', 'kutmoqda'); end if;

  -- Tasdiqlangan: hisobni aniqlash. Hisobni egallab olish YO'Q.
  perform pg_advisory_xact_lock(hashtextextended('t2_kirish_tel:' || v.telefon_e164, 0));
  perform pg_advisory_xact_lock(hashtextextended('t2_telegram_tg:' || v.telegram_user_id, 0));
  select * into v_tg from public.t2_telegram_ulanish where telegram_user_id = v.telegram_user_id and holat = 'faol';
  select id into v_boshqa from public.t2_foydalanuvchi where telefon_e164 = v.telefon_e164 or login = v.telefon_e164 order by (telefon_e164 = v.telefon_e164) desc limit 1;
  if found and v_tg.id is null then
    -- telefon bo'yicha mavjud hisob: faqat Telegram o'zi tasdiqlagan (telefon_manba='telegram') hisobga.
    v_uid := public._t2_hisob_oxirgi(v_boshqa);
    select * into v_u from public.t2_foydalanuvchi where id = v_uid;
    if v_uid is null or v_u.holat is distinct from 'faol' or v_u.telefon_manba is distinct from 'telegram' or v_u.telefon_e164 is distinct from v.telefon_e164 then
      update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
      return jsonb_build_object('ok', false, 'code', 'KIRISH_RAD');
    end if;
    update public.t2_telegram_ulanish set holat = 'uzildi', uzildi_at = now(), uzish_manba = 'almashtirildi' where foydalanuvchi_id = v_uid and holat = 'faol';
    insert into public.t2_telegram_ulanish (foydalanuvchi_id, telegram_user_id, chat_id, til) values (v_uid, v.telegram_user_id, v.chat_id, v.til);
  elsif v_tg.id is not null then
    -- Telegram allaqachon bog'langan: o'sha hisob (Mini App bilan bir xil). Telefon boshqa hisobniki bo'lsa — rad.
    v_uid := public._t2_hisob_oxirgi(v_tg.foydalanuvchi_id);
    select * into v_u from public.t2_foydalanuvchi where id = v_uid;
    if v_uid is null or v_u.holat is distinct from 'faol' or (v_boshqa is not null and v_boshqa <> v_tg.foydalanuvchi_id and v_boshqa <> v_uid) then
      update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
      return jsonb_build_object('ok', false, 'code', 'KIRISH_RAD');
    end if;
  else
    -- yangi hisob: email ro'yxatidagi bilan bir xil abuse limiti (qurilma bo'yicha sutkasiga 5); kompaniya/a'zolik YO'Q.
    if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = v.ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
      update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
      return jsonb_build_object('ok', false, 'code', 'LIMIT');
    end if;
    v_ism := coalesce(nullif(btrim(v.ism), ''), 'Foydalanuvchi');
    begin
      insert into public.t2_foydalanuvchi (login, ism, holat, telefon, telefon_e164, telefon_manba, telefon_tasdiqlangan)
        values (v.telefon_e164, v_ism, 'faol', v.telefon_e164, v.telefon_e164, 'telegram', true) returning * into v_u;
    exception when unique_violation then
      update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
      return jsonb_build_object('ok', false, 'code', 'KIRISH_RAD');
    end;
    v_uid := v_u.id; v_yangi := true;
    insert into public.t2_ozi_royxat_log (ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (v.ip_belgi, v_uid, null, p_operation_id);
    insert into public.t2_telegram_ulanish (foydalanuvchi_id, telegram_user_id, chat_id, til) values (v_uid, v.telegram_user_id, v.chat_id, v.til);
  end if;

  update public.t2_kirish_nonce set holat = 'ishlatildi', ishlatildi_at = now() where id = v.id and holat = 'tasdiqlandi';
  insert into public.t2_telegram_hodisa (foydalanuvchi_id, telegram_user_id, amal, manba, operation_id) values (v_uid, v.telegram_user_id, 'telefon_kirish', 'nonce', p_operation_id);
  perform public._t2_telegram_audit(v_uid, 'telegram_telefon_kirish', format('yangi=%s', v_yangi));
  v_rol := public._t2_asosiy_rol(v_uid);
  select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', a.kompaniya_id, 'rol', a.rol)), '[]'::jsonb) into v_az
    from public.t2_azolik a where a.foydalanuvchi_id = v_uid and a.holat = 'faol';
  return jsonb_build_object('ok', true, 'holat', 'tayyor', 'yangi', v_yangi, 'foydalanuvchi_id', v_uid, 'login', v_u.login, 'rol', coalesce(v_rol, 'kuzatuvchi'), 'azoliklar', v_az);
end $f$;

drop trigger if exists t2_usul_sinxron_tg on public.t2_telegram_ulanish;
drop trigger if exists t2_usul_sinxron_foyd on public.t2_foydalanuvchi;
drop function if exists public.t2_usul_uz_v1(bigint, bigint, uuid);
drop function if exists public.t2_kirish_usullari_v1(bigint);
drop function if exists public.t2_hisob_birlashtir_v2(bigint, bigint, text, uuid);
drop function if exists public.t2_google_dokaz_v1(text, text);
drop function if exists public.t2_email_kod_dokaz_v1(uuid, text, text);
drop function if exists public._t2_rol_daraja_v1(text);
drop function if exists public._t2_usul_trg_tg_v1();
drop function if exists public._t2_usul_trg_foyd_v1();
drop function if exists public._t2_usul_sinxron_v1(bigint);
drop function if exists public._t2_usul_want_v1(bigint);
drop table if exists public.t2_kirish_usul;
notify pgrst, 'reload schema';
