-- T2-MCP-GOOGLE-001: masofaviy MCP (smeta-mcp-remote) login sahifasida "Google bilan kirish" uchun FAQAT-QIDIRUV RPC.
--
-- Farqi t2_google_kirish_v1 dan: bu funksiya HECH QACHON foydalanuvchi, kompaniya, obuna yoki token yaratmaydi.
-- Worker Google id_token imzosi, aud, iss, exp, nonce va email_verified ni TEKSHIRGANDAN keyin chaqiradi.
-- Qoidalar:
--  1) google_sub bo'yicha ulangan faol foydalanuvchi -> ok.
--  2) aks holda email bo'yicha (faqat t2_foydalanuvchi.email; login emas) ANIQ BITTA faol foydalanuvchi -> google_sub ulanadi -> ok.
--     Bir nechta mos kelsa -> rad (noaniqlik). Mos kelmasa -> GOOGLE_ULANMAGAN.
--  3) Email tasdiqlanmagan o'zi ro'yxatdan o'tgan hisob (t2_ozi_royxat_log bor, email_tasdiqlandi_at yo'q) avtomatik ulanmaydi
--     (EMAIL_PAROL_BILAN) - birovning emailini oldindan band qilib qo'yishdan himoya (t2_google_kirish_v1 dagi qoida bilan bir xil).
--  4) Bitta google_sub ikkinchi foydalanuvchiga ulanmaydi (unique indeks + GOOGLE_BOSHQA_HISOB).
-- Kompaniya a'zoligi va rol bu yerda tekshirilmaydi: Worker keyin jonli vakolatni (t2_men_v1) tekshiradi, a'zosiz hisob rad etiladi.
-- Ruxsat: faqat service_role. Ustun google_sub (20261105290000) mavjud deb faraz qilinadi.
begin;

create or replace function public.t2_google_mcp_kirish_v1(p_email text, p_sub text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_u public.t2_foydalanuvchi%rowtype; v_n int;
begin
  if coalesce(btrim(p_sub), '') = '' or length(p_sub) > 255 or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'code', 'GOOGLE_MALUMOT_NOTOGRI');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_google_kirish:' || p_sub, 0));

  select * into v_u from public.t2_foydalanuvchi where google_sub = p_sub;
  if not found then
    select count(*) into v_n from public.t2_foydalanuvchi where lower(btrim(email)) = v_email and holat = 'faol';
    if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'GOOGLE_ULANMAGAN'); end if;
    if v_n > 1 then return jsonb_build_object('ok', false, 'code', 'EMAIL_NOANIQ'); end if;
    select * into v_u from public.t2_foydalanuvchi where lower(btrim(email)) = v_email and holat = 'faol';
    if v_u.google_sub is not null and v_u.google_sub <> p_sub then return jsonb_build_object('ok', false, 'code', 'GOOGLE_BOSHQA_HISOB'); end if;
    if v_u.email_tasdiqlandi_at is null and exists (select 1 from public.t2_ozi_royxat_log where foydalanuvchi_id = v_u.id) then
      return jsonb_build_object('ok', false, 'code', 'EMAIL_PAROL_BILAN');
    end if;
    update public.t2_foydalanuvchi set google_sub = p_sub where id = v_u.id and google_sub is null;
  end if;

  if v_u.holat is distinct from 'faol' then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
  return jsonb_build_object('ok', true, 'foydalanuvchi_id', v_u.id, 'login', v_u.login);
end $$;

revoke all on function public.t2_google_mcp_kirish_v1(text, text) from public, anon, authenticated;
grant execute on function public.t2_google_mcp_kirish_v1(text, text) to service_role;

commit;
