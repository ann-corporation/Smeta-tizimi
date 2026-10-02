-- T2-PTO-TIJORAT-001 tuzatish (egasi sinovi, 2026-10-02): odamlar login o'rniga EMAIL yozadi — "@" va "+" ruxsat,
-- uzunlik 80 gacha; login email bo'lsa t2_foydalanuvchi.email ham to'ldiriladi. Kirish (t2_parol_tekshir_v1) login'ni
-- katta-kichik harfga qaramay solishtiradi — o'zgarish shart emas.
begin;

create or replace function public.t2_ozi_royxat_v1(p_login text, p_parol text, p_ism text, p_telefon text, p_kompaniya_nom text, p_ip_belgi text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_login text := lower(btrim(coalesce(p_login, ''))); v_uid bigint; v_k jsonb; v_kid bigint; v_demo bigint; v_manba bigint; v_prev public.t2_ozi_royxat_log%rowtype;
  v_email text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_prev from public.t2_ozi_royxat_log where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'login', v_login, 'kompaniya_id', v_prev.kompaniya_id); end if;
  if v_login !~ '^[a-z0-9][a-z0-9_.@+-]{2,79}$' or v_login ~ '@.*@' then
    return jsonb_build_object('ok', false, 'code', 'LOGIN_NOTOGRI', 'xabar', 'Login yoki email: lotin harf, raqam, _ . - @ (3–80 belgi)');
  end if;
  v_email := case when v_login ~ '^[^@]+@[^@]+\.[a-z]{2,}$' then v_login end;
  if length(coalesce(p_parol, '')) < 8 then return jsonb_build_object('ok', false, 'code', 'PAROL_QISQA', 'xabar', 'Parol kamida 8 belgi'); end if;
  if length(btrim(coalesce(p_ism, ''))) < 2 then return jsonb_build_object('ok', false, 'code', 'ISM_KERAK'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ozi_royxat', 0));
  if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = p_ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu qurilmadan bugun ro''yxatdan o''tish limiti tugadi. Ertaga urinib ko''ring.');
  end if;
  if exists (select 1 from public.t2_foydalanuvchi where lower(login) = v_login or (v_email is not null and lower(email) = v_email)) then
    return jsonb_build_object('ok', false, 'code', 'LOGIN_BAND', 'xabar', 'Bu login/email band');
  end if;
  insert into public.t2_foydalanuvchi(login, email, ism, holat, parol_hash, parol_yangilandi)
  values (v_login, v_email, btrim(p_ism), 'faol', extensions.crypt(p_parol, extensions.gen_salt('bf', 10)), now()) returning id into v_uid;
  v_k := public._t2_kompaniya_yarat_asosiy(v_uid, coalesce(nullif(btrim(p_kompaniya_nom), ''), btrim(p_ism) || ' — PTO'), null, nullif(btrim(coalesce(p_telefon, '')), ''));
  if coalesce((v_k->>'ok')::boolean, false) is not true then raise exception 'KOMPANIYA_YARATILMADI: %', v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  insert into public.t2_obuna(kompaniya_id, tarif_kod, boshlandi, tugaydi, kim) values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'ozi_royxat');
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, izoh, operation_id)
  values (v_kid, v_uid, (select oylik_token from public.t2_tarif where kod = 'free'), 'oylik', 'Bepul sinov — 1-oy', gen_random_uuid());
  select obyekt_id into v_manba from public.t2_demo_manba where id = 1;
  if v_manba is not null then v_demo := public._t2_demo_nusxa(v_kid, v_manba); end if;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_uid, v_kid, p_operation_id);
  perform public.t2_audit_yoz(v_kid, 'ozi_royxat', 'kompaniya', v_demo, format('login=%s', v_login), 'ozi_royxat', p_ip_belgi);
  return jsonb_build_object('ok', true, 'login', v_login, 'kompaniya_id', v_kid, 'demo_obyekt_id', v_demo);
end $$;
revoke all on function public.t2_ozi_royxat_v1(text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_ozi_royxat_v1(text, text, text, text, text, text, uuid) to service_role;

commit;
