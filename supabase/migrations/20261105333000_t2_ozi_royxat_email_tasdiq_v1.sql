-- O'zi ro'yxatdan o'tish: email egasi tasdiqlanmaguncha hisob yaratilmaydi.
-- Kodning o'zi bazaga kiritilmaydi; Pages Function HMAC xeshini uzatadi.
alter table public.t2_foydalanuvchi add column if not exists email_tasdiqlandi_at timestamptz;

create table if not exists public.t2_royxat_email_tasdiq (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  kod_xesh text not null,
  ip_belgi text,
  yaratildi timestamptz not null default now(),
  tugaydi timestamptz not null,
  yuborildi_at timestamptz,
  ishlatildi_at timestamptz,
  urinishlar smallint not null default 0 check (urinishlar between 0 and 5),
  bekor_qilindi_at timestamptz
);
create index if not exists t2_royxat_email_tasdiq_email_idx on public.t2_royxat_email_tasdiq (email, yaratildi desc);
revoke all on public.t2_royxat_email_tasdiq from public, anon, authenticated;

create or replace function public.t2_royxat_email_kod_yarat_v1(p_email text, p_kod_xesh text, p_ip_belgi text)
returns jsonb language plpgsql security definer set search_path=public, pg_temp as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_id uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' or length(coalesce(p_kod_xesh, '')) < 32 then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_NOTOGRI');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_royxat_email:' || v_email, 0));
  if exists (select 1 from public.t2_foydalanuvchi where lower(login)=v_email or lower(email)=v_email) then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_BAND', 'xabar', 'Bu email bilan hisob allaqachon bor. Kirishdan foydalaning.');
  end if;
  if exists (select 1 from public.t2_royxat_email_tasdiq where email=v_email and yaratildi > now()-interval '1 minute' and yuborildi_at is not null and ishlatildi_at is null and bekor_qilindi_at is null) then
    return jsonb_build_object('ok', false, 'code', 'KOD_KUTILMOQDA', 'xabar', 'Kod yuborilgan. Bir daqiqa kutib, emailni tekshiring.');
  end if;
  if (select count(*) from public.t2_royxat_email_tasdiq where coalesce(ip_belgi,'')=coalesce(p_ip_belgi,'') and yaratildi > now()-interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Kod so''rash limiti tugadi. Keyinroq urinib ko''ring.');
  end if;
  insert into public.t2_royxat_email_tasdiq(email,kod_xesh,ip_belgi,tugaydi) values(v_email,p_kod_xesh,p_ip_belgi,now()+interval '10 minutes') returning id into v_id;
  return jsonb_build_object('ok', true, 'tasdiqlash_id', v_id, 'tugaydi', now()+interval '10 minutes');
end $$;

create or replace function public.t2_royxat_email_kod_yuborildi_v1(p_tasdiqlash_id uuid)
returns jsonb language plpgsql security definer set search_path=public, pg_temp as $$
begin
  update public.t2_royxat_email_tasdiq set yuborildi_at=now() where id=p_tasdiqlash_id and yuborildi_at is null and ishlatildi_at is null and bekor_qilindi_at is null and tugaydi>now();
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.t2_ozi_royxat_email_tasdiqla_v1(p_tasdiqlash_id uuid, p_kod_xesh text, p_login text, p_parol text, p_ism text, p_telefon text, p_kompaniya_nom text, p_ip_belgi text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public, pg_temp as $$
declare v public.t2_royxat_email_tasdiq%rowtype; v_natija jsonb; v_login text := lower(btrim(coalesce(p_login,'')));
begin
  select * into v from public.t2_royxat_email_tasdiq where id=p_tasdiqlash_id for update;
  if not found or v.bekor_qilindi_at is not null or v.yuborildi_at is null then return jsonb_build_object('ok',false,'code','KOD_TOPILMADI','xabar','Kod qayta so''ralishi kerak.'); end if;
  if v.ishlatildi_at is not null then return jsonb_build_object('ok',false,'code','KOD_ISHLATILGAN','xabar','Bu kod allaqachon ishlatilgan.'); end if;
  if v.tugaydi <= now() then return jsonb_build_object('ok',false,'code','KOD_MUDDATI_OTGAN','xabar','Kodning muddati tugagan. Yangisini so''rang.'); end if;
  if v.urinishlar >= 5 then return jsonb_build_object('ok',false,'code','KOD_URINISH_LIMITI','xabar','Kod urinishlari tugadi. Yangisini so''rang.'); end if;
  if v.email <> v_login then return jsonb_build_object('ok',false,'code','EMAIL_MOS_EMAS','xabar','Tasdiqlangan email bilan ro''yxatdan o''ting.'); end if;
  if v.kod_xesh <> coalesce(p_kod_xesh,'') then update public.t2_royxat_email_tasdiq set urinishlar=urinishlar+1 where id=v.id; return jsonb_build_object('ok',false,'code','KOD_NOTOGRI','xabar','Kod noto''g''ri.'); end if;
  v_natija := public.t2_ozi_royxat_v1(v_login,p_parol,p_ism,p_telefon,p_kompaniya_nom,p_ip_belgi,p_operation_id);
  if coalesce((v_natija->>'ok')::boolean,false) is not true then return v_natija; end if;
  update public.t2_royxat_email_tasdiq set ishlatildi_at=now() where id=v.id;
  update public.t2_foydalanuvchi set email_tasdiqlandi_at=now() where lower(login)=v_login and email_tasdiqlandi_at is null;
  return v_natija;
end $$;

revoke all on function public.t2_royxat_email_kod_yarat_v1(text,text,text), public.t2_royxat_email_kod_yuborildi_v1(uuid), public.t2_ozi_royxat_email_tasdiqla_v1(uuid,text,text,text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.t2_royxat_email_kod_yarat_v1(text,text,text), public.t2_royxat_email_kod_yuborildi_v1(uuid), public.t2_ozi_royxat_email_tasdiqla_v1(uuid,text,text,text,text,text,text,text,uuid) to service_role;
