-- T2-EMAIL-KOD-PRECLAIM-HIMOYA-V1 rollback: t2_email_kod_kirish_v1 prod ta'rifiga (2026-10-27, himoyasiz) AYNAN qaytadi.
-- DIQQAT: rollback hisobni oldindan egallab olish teshigini qayta ochadi. Ma'lumot tegilmaydi.

begin;

CREATE OR REPLACE FUNCTION public.t2_email_kod_kirish_v1(p_tasdiqlash_id uuid, p_kod_xesh text, p_email text, p_ism text, p_ip_belgi text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  perform pg_advisory_xact_lock(hashtextextended('t2_ozi_royxat', 0));
  if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = p_ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu qurilmadan bugun ro''yxatdan o''tish limiti tugadi. Ertaga urinib ko''ring.');
  end if;
  v_ism := coalesce(nullif(btrim(left(coalesce(p_ism, ''), 200)), ''), split_part(v_email, '@', 1));
  insert into public.t2_foydalanuvchi(login, email, ism, holat, email_tasdiqlandi_at)
  values (v_email, v_email, v_ism, 'faol', now()) returning * into v_u;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_u.id, null, p_operation_id);
  update public.t2_royxat_email_tasdiq set ishlatildi_at = now() where id = v.id;
  select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', a.kompaniya_id, 'rol', a.rol)), '[]'::jsonb) into v_az
    from public.t2_azolik a where a.foydalanuvchi_id = v_u.id and a.holat = 'faol';
  return jsonb_build_object('ok',true,'yangi',true,'foydalanuvchi_id',v_u.id,'login',v_email,'rol','kuzatuvchi','azoliklar',v_az,'demo_obyekt_id',null);
end $function$;

revoke all on function public.t2_email_kod_kirish_v1(uuid,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.t2_email_kod_kirish_v1(uuid,text,text,text,text,uuid) to service_role;

commit;
