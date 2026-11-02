-- T2_EMAIL_KOD_PRECLAIM (20261113600000) — contract test, BEGIN..ROLLBACK, sintetik foydalanuvchilar.
-- Migratsiyadan KEYIN ishga tushiriladi. Muvaffaqiyat: NOTICE 'T2_EMAIL_KOD_PRECLAIM contract OK'; xato — exception.
-- (a) o'zi parol bilan ro'yxatdan o'tgan, email tasdiqlanmagan hisob → email kod RAD, tasdiq belgisi qo'yilmaydi;
-- (b) email tasdiqlangan hisob → email kod bilan kiradi; yangi email → yangi hisob;
-- (c) Google: (a) holatdagi hisob → EMAIL_PAROL_BILAN, google_sub ulanmaydi; tasdiqlangan hisob → kiradi.
begin;
do $$
declare
  s text := substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  e_hujum text := 'pc-hujum-' || s || '@test.invalid';
  e_ok text := 'pc-ok-' || s || '@test.invalid';
  e_yangi text := 'pc-yangi-' || s || '@test.invalid';
  ip text := 'pc-ip-' || s;
  r jsonb; u_hujum bigint; u_ok bigint; t1 uuid; t2 uuid; t3 uuid; f public.t2_foydalanuvchi%rowtype;
begin
  -- (a) hujumchi victim emaili bilan parolli hisob ochadi (email tasdiqlanmaydi)
  r := public.t2_ozi_royxat_v1(e_hujum, 'hujumchi-parol-123', 'Hujumchi', null, null, ip, gen_random_uuid());
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'SETUP_OZI_ROYXAT: %', r; end if;
  select * into f from public.t2_foydalanuvchi where lower(login) = e_hujum;
  u_hujum := f.id;
  if f.email_tasdiqlandi_at is not null or f.parol_hash is null then raise exception 'SETUP_PRECLAIM_HOLAT: %', row_to_json(f); end if;

  insert into public.t2_royxat_email_tasdiq(email, kod_xesh, ip_belgi, tugaydi, yuborildi_at, maqsad)
  values (e_hujum, 'xesh-a', ip, now() + interval '10 minutes', now(), 'kirish') returning id into t1;
  r := public.t2_email_kod_kirish_v1(t1, 'xesh-a', e_hujum, null, ip, gen_random_uuid());
  if coalesce((r->>'ok')::boolean, true) or r->>'code' is distinct from 'EMAIL_TASDIQLANMAGAN_PAROLLI_HISOB' or r ? 'foydalanuvchi_id' then
    raise exception 'A_EMAIL_KOD_RAD_ETILMADI: %', r;
  end if;
  if coalesce(r->>'xabar', '') not like 'Bu email bilan parolli hisob bor.%' then raise exception 'A_XABAR: %', r; end if;
  if (select email_tasdiqlandi_at from public.t2_foydalanuvchi where id = u_hujum) is not null then raise exception 'A_EMAIL_TASDIQLANDI_QOYILDI'; end if;
  if (select ishlatildi_at from public.t2_royxat_email_tasdiq where id = t1) is not null then raise exception 'A_KOD_ISHLATILGAN_BELGILANDI'; end if;

  -- (b) tasdiqlangan parolli hisob → email kod ishlaydi
  insert into public.t2_foydalanuvchi(login, email, ism, holat, parol_hash, email_tasdiqlandi_at)
  values (e_ok, e_ok, 'Tasdiqlangan', 'faol', extensions.crypt('egasi-parol-123', extensions.gen_salt('bf', 4)), now() - interval '1 day')
  returning id into u_ok;
  insert into public.t2_royxat_email_tasdiq(email, kod_xesh, ip_belgi, tugaydi, yuborildi_at, maqsad)
  values (e_ok, 'xesh-b', ip, now() + interval '10 minutes', now(), 'kirish') returning id into t2;
  r := public.t2_email_kod_kirish_v1(t2, 'xesh-b', e_ok, null, ip, gen_random_uuid());
  if not coalesce((r->>'ok')::boolean, false) or (r->>'foydalanuvchi_id')::bigint is distinct from u_ok or (r->>'yangi')::boolean then
    raise exception 'B_TASDIQLANGAN_KIRA_OLMADI: %', r;
  end if;
  if (select ishlatildi_at from public.t2_royxat_email_tasdiq where id = t2) is null then raise exception 'B_KOD_BELGILANMADI'; end if;

  -- (b2) yangi email → yangi hisob, email tasdiqlangan
  insert into public.t2_royxat_email_tasdiq(email, kod_xesh, ip_belgi, tugaydi, yuborildi_at, maqsad)
  values (e_yangi, 'xesh-c', ip || '-2', now() + interval '10 minutes', now(), 'kirish') returning id into t3;
  r := public.t2_email_kod_kirish_v1(t3, 'xesh-c', e_yangi, 'Yangi', ip || '-2', gen_random_uuid());
  if not coalesce((r->>'ok')::boolean, false) or not (r->>'yangi')::boolean then raise exception 'B2_YANGI_HISOB: %', r; end if;
  if (select email_tasdiqlandi_at from public.t2_foydalanuvchi where id = (r->>'foydalanuvchi_id')::bigint) is null then
    raise exception 'B2_YANGI_TASDIQSIZ';
  end if;

  -- (c) Google: preclaim hisobga ulanmaydi
  r := public.t2_google_kirish_v1(e_hujum, 'Egasi', 'pc-sub-a-' || s, ip, gen_random_uuid());
  if coalesce((r->>'ok')::boolean, true) or r->>'code' is distinct from 'EMAIL_PAROL_BILAN' then raise exception 'C_GOOGLE_RAD_ETILMADI: %', r; end if;
  if (select google_sub from public.t2_foydalanuvchi where id = u_hujum) is not null
     or (select email_tasdiqlandi_at from public.t2_foydalanuvchi where id = u_hujum) is not null then
    raise exception 'C_GOOGLE_PRECLAIM_ULANDI';
  end if;
  -- (c2) Google: tasdiqlangan hisob → kiradi va sub ulanadi
  r := public.t2_google_kirish_v1(e_ok, 'Egasi', 'pc-sub-b-' || s, ip, gen_random_uuid());
  if not coalesce((r->>'ok')::boolean, false) or (r->>'foydalanuvchi_id')::bigint is distinct from u_ok then
    raise exception 'C2_GOOGLE_TASDIQLANGAN: %', r;
  end if;
  if (select google_sub from public.t2_foydalanuvchi where id = u_ok) is distinct from 'pc-sub-b-' || s then raise exception 'C2_SUB_ULANMADI'; end if;

  raise notice 'T2_EMAIL_KOD_PRECLAIM contract OK';
end $$;
rollback;
