-- T2-EMAIL-KOD-KIRISH-001 (egasi 2026-10-26): «pochtaga raqam keladi, keyin login bo'ladi» — parolsiz kirish va ro'yxat.
-- Bitta oqim: email → 6 xonali kod (10 daqiqa, 5 urinish) → mavjud hisob bo'lsa KIRISH, bo'lmasa YANGI hisob
-- (o'z kompaniyasi, bepul tarif, demo — Google bilan ro'yxatdagi bilan aynan bir xil). Birlashtirilgan hisob → omon qolgan.
-- Talab: 20261105333000_t2_ozi_royxat_email_tasdiq_v1 (t2_royxat_email_tasdiq jadvali) avval qo'llangan bo'lsin.
-- Kodning o'zi bazaga yozilmaydi — Pages Function HMAC xeshini uzatadi.
-- Qo'shimcha: t2_google_kirish_v1 — email kod bilan TASDIQLANGAN hisob Google bilan ham avtomatik ulanadi
-- (avval o'zi ro'yxatdan o'tgan har qanday hisob uchun EMAIL_PAROL_BILAN rad etilardi; tasdiqlangan email — ishonchli).

begin;

alter table public.t2_royxat_email_tasdiq add column if not exists maqsad text not null default 'royxat';
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_royxat_email_tasdiq_maqsad_check') then
    alter table public.t2_royxat_email_tasdiq add constraint t2_royxat_email_tasdiq_maqsad_check check (maqsad in ('royxat','kirish'));
  end if;
end $c$;

-- Kod so'rash (kirish/ro'yxat uchun umumiy). Hisob bor-yo'qligi javobda OSHKOR QILINMAYDI.
create or replace function public.t2_email_kod_yarat_v1(p_email text, p_kod_xesh text, p_ip_belgi text)
returns jsonb language plpgsql security definer set search_path=public, pg_temp as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_id uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' or length(v_email) > 254 or length(coalesce(p_kod_xesh, '')) < 32 then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_NOTOGRI', 'xabar', 'Email manzilini to''g''ri kiriting.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_royxat_email:' || v_email, 0));
  if exists (select 1 from public.t2_royxat_email_tasdiq where email = v_email and yaratildi > now() - interval '1 minute'
             and yuborildi_at is not null and ishlatildi_at is null and bekor_qilindi_at is null) then
    return jsonb_build_object('ok', false, 'code', 'KOD_KUTILMOQDA', 'xabar', 'Kod yuborilgan. Bir daqiqadan keyin qayta so''rash mumkin.');
  end if;
  if (select count(*) from public.t2_royxat_email_tasdiq where email = v_email and yaratildi > now() - interval '1 hour') >= 6 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu email uchun kod so''rash limiti tugadi. Bir soatdan keyin urinib ko''ring.');
  end if;
  if (select count(*) from public.t2_royxat_email_tasdiq where coalesce(ip_belgi,'') = coalesce(p_ip_belgi,'') and yaratildi > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Kod so''rash limiti tugadi. Keyinroq urinib ko''ring.');
  end if;
  -- Avvalgi ochiq kodlar bekor (eng oxirgisi amal qiladi).
  update public.t2_royxat_email_tasdiq set bekor_qilindi_at = now()
   where email = v_email and maqsad = 'kirish' and ishlatildi_at is null and bekor_qilindi_at is null;
  insert into public.t2_royxat_email_tasdiq(email, kod_xesh, ip_belgi, tugaydi, maqsad)
  values (v_email, p_kod_xesh, p_ip_belgi, now() + interval '10 minutes', 'kirish') returning id into v_id;
  return jsonb_build_object('ok', true, 'tasdiqlash_id', v_id, 'tugaydi', now() + interval '10 minutes');
end $$;

-- Kodni tekshirish → kirish yoki yangi hisob. Javob: {ok, yangi, foydalanuvchi_id, login, rol, azoliklar, demo_obyekt_id}.
create or replace function public.t2_email_kod_kirish_v1(p_tasdiqlash_id uuid, p_kod_xesh text, p_email text, p_ism text, p_ip_belgi text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public, pg_temp as $$
declare v public.t2_royxat_email_tasdiq%rowtype; v_email text := lower(btrim(coalesce(p_email,'')));
  v_u public.t2_foydalanuvchi%rowtype; v_final bigint; v_rol text; v_k jsonb; v_kid bigint; v_demo bigint; v_manba bigint; v_ism text; v_az jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select * into v from public.t2_royxat_email_tasdiq where id = p_tasdiqlash_id for update;
  if not found or v.maqsad <> 'kirish' or v.bekor_qilindi_at is not null or v.yuborildi_at is null then
    return jsonb_build_object('ok',false,'code','KOD_TOPILMADI','xabar','Kod topilmadi. Yangisini so''rang.');
  end if;
  if v.ishlatildi_at is not null then return jsonb_build_object('ok',false,'code','KOD_ISHLATILGAN','xabar','Bu kod allaqachon ishlatilgan. Yangisini so''rang.'); end if;
  if v.tugaydi <= now() then return jsonb_build_object('ok',false,'code','KOD_MUDDATI_OTGAN','xabar','Kodning muddati tugagan. Yangisini so''rang.'); end if;
  if v.urinishlar >= 5 then return jsonb_build_object('ok',false,'code','KOD_URINISH_LIMITI','xabar','Urinishlar tugadi. Yangi kod so''rang.'); end if;
  if v.email <> v_email then return jsonb_build_object('ok',false,'code','EMAIL_MOS_EMAS','xabar','Kod boshqa email uchun yuborilgan.'); end if;
  if v.kod_xesh <> coalesce(p_kod_xesh,'') then
    update public.t2_royxat_email_tasdiq set urinishlar = urinishlar + 1 where id = v.id;
    return jsonb_build_object('ok',false,'code','KOD_NOTOGRI','xabar','Kod noto''g''ri.','qolgan_urinish', 4 - v.urinishlar);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('t2_royxat_email:' || v_email, 0));
  -- Mavjud hisob: faol bo'lsa o'zi; birlashtirilgan bo'lsa — omon qolgan hisob.
  select * into v_u from public.t2_foydalanuvchi where lower(email) = v_email or lower(login) = v_email
   order by (holat = 'faol') desc, id limit 1;
  if found then
    if v_u.holat = 'birlashtirildi' then
      v_final := public._t2_hisob_oxirgi(v_u.id);
      if v_final is null then return jsonb_build_object('ok',false,'code','FOYDALANUVCHI_FAOL_EMAS','xabar','Hisob faol emas.'); end if;
      select * into v_u from public.t2_foydalanuvchi where id = v_final;
    end if;
    if v_u.holat is distinct from 'faol' then return jsonb_build_object('ok',false,'code','FOYDALANUVCHI_FAOL_EMAS','xabar','Hisob faol emas.'); end if;
    update public.t2_royxat_email_tasdiq set ishlatildi_at = now() where id = v.id;
    update public.t2_foydalanuvchi set email = coalesce(nullif(btrim(email),''), v_email), email_tasdiqlandi_at = coalesce(email_tasdiqlandi_at, now()) where id = v_u.id;
    v_rol := public._t2_asosiy_rol(v_u.id);
    select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', a.kompaniya_id, 'rol', a.rol)), '[]'::jsonb) into v_az
      from public.t2_azolik a where a.foydalanuvchi_id = v_u.id and a.holat = 'faol';
    return jsonb_build_object('ok',true,'yangi',false,'foydalanuvchi_id',v_u.id,'login',v_u.login,'rol',coalesce(v_rol,'kuzatuvchi'),'azoliklar',v_az);
  end if;

  -- Yangi hisob (Google bilan ro'yxat qoidalari bilan aynan): qurilma limiti, o'z kompaniyasi, bepul tarif, demo.
  perform pg_advisory_xact_lock(hashtextextended('t2_ozi_royxat', 0));
  if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = p_ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu qurilmadan bugun ro''yxatdan o''tish limiti tugadi. Ertaga urinib ko''ring.');
  end if;
  v_ism := coalesce(nullif(btrim(left(coalesce(p_ism, ''), 200)), ''), split_part(v_email, '@', 1));
  insert into public.t2_foydalanuvchi(login, email, ism, holat, email_tasdiqlandi_at)
  values (v_email, v_email, v_ism, 'faol', now()) returning * into v_u;
  v_k := public._t2_kompaniya_yarat_asosiy(v_u.id, v_ism || ' — PTO', null, null);
  if coalesce((v_k->>'ok')::boolean, false) is not true then raise exception 'KOMPANIYA_YARATILMADI: %', v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  insert into public.t2_obuna(kompaniya_id, tarif_kod, boshlandi, tugaydi, kim) values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'email');
  perform public._t2_sinov_bonus(v_kid, v_u.id);
  select obyekt_id into v_manba from public.t2_demo_manba where id = 1;
  if v_manba is not null then v_demo := public._t2_demo_nusxa(v_kid, v_manba); end if;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_u.id, v_kid, p_operation_id);
  update public.t2_royxat_email_tasdiq set ishlatildi_at = now() where id = v.id;
  perform public.t2_audit_yoz(v_kid, 'ozi_royxat', 'kompaniya', v_demo, format('email kod login=%s', v_email), 'email', p_ip_belgi);
  select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', a.kompaniya_id, 'rol', a.rol)), '[]'::jsonb) into v_az
    from public.t2_azolik a where a.foydalanuvchi_id = v_u.id and a.holat = 'faol';
  return jsonb_build_object('ok',true,'yangi',true,'foydalanuvchi_id',v_u.id,'login',v_email,'rol','boss','azoliklar',v_az,'demo_obyekt_id',v_demo);
end $$;

-- t2_google_kirish_v1 — 20261110200000 dagi tana; yagona o'zgarish: email kod bilan TASDIQLANGAN hisob Google bilan ham ulanadi.
create or replace function public.t2_google_kirish_v1(p_email text, p_ism text, p_sub text, p_ip_belgi text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
  v_k := public._t2_kompaniya_yarat_asosiy(v_u.id, v_ism || ' — PTO', null, null);
  if coalesce((v_k->>'ok')::boolean, false) is not true then raise exception 'KOMPANIYA_YARATILMADI: %', v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  insert into public.t2_obuna(kompaniya_id, tarif_kod, boshlandi, tugaydi, kim) values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'google');
  perform public._t2_sinov_bonus(v_kid, v_u.id);
  select obyekt_id into v_manba from public.t2_demo_manba where id = 1;
  if v_manba is not null then v_demo := public._t2_demo_nusxa(v_kid, v_manba); end if;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_u.id, v_kid, p_operation_id);
  perform public.t2_audit_yoz(v_kid, 'ozi_royxat', 'kompaniya', v_demo, format('google login=%s', v_email), 'google', p_ip_belgi);
  return jsonb_build_object('ok', true, 'yangi', true, 'login', v_email, 'foydalanuvchi_id', v_u.id, 'rol', 'boss', 'demo_obyekt_id', v_demo);
end $$;

revoke all on function public.t2_email_kod_yarat_v1(text,text,text), public.t2_email_kod_kirish_v1(uuid,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.t2_email_kod_yarat_v1(text,text,text), public.t2_email_kod_kirish_v1(uuid,text,text,text,text,uuid) to service_role;
revoke all on function public.t2_google_kirish_v1(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_google_kirish_v1(text, text, text, text, uuid) to service_role;

commit;
