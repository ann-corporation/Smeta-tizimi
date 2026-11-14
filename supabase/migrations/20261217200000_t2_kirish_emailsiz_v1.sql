-- T2-KIRISH-EMAILSIZ-V1 (2026-11-13): emailsiz kirish — (A) kompaniya admini taklifi (telefon + bir martalik kod/havola),
-- (B) Telegram orqali telefon tasdiqlash. Mavjud sessiya mexanizmi (imzola/sess cookie) O'ZGARMAYDI; bu migratsiya faqat
-- hisob/a'zolikni ochadigan RPC lar va ularning jadvallarini qo'shadi. Additiv. BEGIN/COMMIT yo'q.
--
-- Qoidalar (har bir yangi yo'l mavjudlaridan qattiqroq yoki teng):
--  * kod/havola/nonce/brauzer siri bazada FAQAT xesh (HMAC, SESSIYA_KALIT — Cloudflare tomonida hisoblanadi); ochiq qiymat yo'q.
--  * bir martalik: sarflash SQL da atomik (FOR UPDATE + holat o'tishi), muddat, urinish limiti (5), bloklanish.
--  * telefon manbasi saqlanadi: telefon_manba = 'admin' (admin aytgan, tasdiqlanmagan) | 'telegram' (foydalanuvchining o'zi
--    Telegram kontakti bilan tasdiqlagan; telefon_tasdiqlangan = true faqat shu holda).
--  * hisobni egallab olish yo'q: mavjud hisobga telefon/Telegram faqat uning o'z sessiyasi bilan ulanadi; telefon bo'yicha
--    Telegram kirishi faqat telefon_manba='telegram' hisobga; admin taklifi mavjud hisobga faqat autentifikatsiyalangan
--    sessiya bilan (t2_kirish_taklif_ulash_v1, actor sessiyadan).
--  * rol: faqat t2_role_permissions_v2 katalogidagi, boss/admin/superadmin TAKLIF QILINMAYDI; direktor bo'lmagan taklif qiluvchi
--    faqat dala rollari (usta, brigadir, haydovchi) beradi.
--  * Telegram: contact.user_id = jo'natuvchi id (RPC chegarasida ham tekshiriladi); nonce 5 daqiqa, bir martalik, brauzer
--    siri bilan (faqat havola yetarli emas).
--  * limitlar bazada (t2_kirish_limit): telefon / IP-xesh / kompaniya bo'yicha.
--  * Barcha RPC faqat service_role ga.
-- Reja: t2_qator o'quvchisi YO'Q (versiya: texnik).
set local statement_timeout = '300s';

-- ───────── foydalanuvchi: normallashgan telefon + manba ─────────
alter table public.t2_foydalanuvchi add column if not exists telefon_e164 text;
alter table public.t2_foydalanuvchi add column if not exists telefon_manba text;
do $b$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_foydalanuvchi_telefon_manba_chk') then
    alter table public.t2_foydalanuvchi add constraint t2_foydalanuvchi_telefon_manba_chk check (telefon_manba is null or telefon_manba in ('admin', 'telegram'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 't2_foydalanuvchi_telefon_e164_chk') then
    alter table public.t2_foydalanuvchi add constraint t2_foydalanuvchi_telefon_e164_chk check (telefon_e164 is null or telefon_e164 ~ '^\+998[2-9][0-9]{8}$');
  end if;
end $b$;
create unique index if not exists t2_foydalanuvchi_telefon_e164_uq on public.t2_foydalanuvchi (telefon_e164) where telefon_e164 is not null;

-- Telegram hodisa jurnali: yangi amal turlari (telefon orqali kirish auditi). Eski qiymatlar saqlanadi.
alter table public.t2_telegram_hodisa drop constraint if exists t2_telegram_hodisa_amal_check;
alter table public.t2_telegram_hodisa add constraint t2_telegram_hodisa_amal_check
  check (amal = any (array['ulandi'::text, 'uzildi'::text, 'miniapp_kirish'::text, 'kod_yaratildi'::text, 'telefon_tasdiqlandi'::text, 'telefon_kirish'::text, 'kontakt_boshqaniki'::text]));

-- ───────── jadvallar ─────────
create table if not exists public.t2_kirish_limit (
  id bigserial primary key,
  tur text not null,
  kalit text not null,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_kirish_limit_idx on public.t2_kirish_limit (tur, kalit, yaratildi desc);

create table if not exists public.t2_kirish_taklif (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  ism text not null,
  telefon_e164 text not null check (telefon_e164 ~ '^\+998[2-9][0-9]{8}$'),
  rol text not null,
  kod_xesh text not null check (kod_xesh ~ '^[0-9a-f]{64}$'),
  token_xesh text not null unique check (token_xesh ~ '^[0-9a-f]{64}$'),
  holat text not null default 'kutmoqda' check (holat in ('kutmoqda', 'ishlatildi', 'bekor')),
  tugaydi timestamptz not null,
  urinishlar smallint not null default 0,
  yaratdi_actor_id bigint not null,
  yaratildi timestamptz not null default now(),
  ishlatdi_foydalanuvchi_id bigint,
  ishlatildi_at timestamptz,
  ishlatish_turi text check (ishlatish_turi is null or ishlatish_turi in ('yangi_hisob', 'mavjud_hisob')),
  bekor_actor_id bigint,
  bekor_at timestamptz
);
create index if not exists t2_kirish_taklif_komp_idx on public.t2_kirish_taklif (kompaniya_id, holat, yaratildi desc);
create index if not exists t2_kirish_taklif_tel_idx on public.t2_kirish_taklif (telefon_e164) where holat = 'kutmoqda';

create table if not exists public.t2_kirish_nonce (
  id uuid primary key default gen_random_uuid(),
  nonce_xesh text not null unique check (nonce_xesh ~ '^[0-9a-f]{64}$'),
  brauzer_xesh text not null check (brauzer_xesh ~ '^[0-9a-f]{64}$'),
  belgi text not null check (belgi ~ '^[0-9]{4}$'),
  ism text,
  ip_belgi text,
  yaratildi timestamptz not null default now(),
  tugaydi timestamptz not null,
  holat text not null default 'kutmoqda' check (holat in ('kutmoqda', 'kontakt_kutmoqda', 'tasdiqlandi', 'ishlatildi', 'bekor')),
  telegram_user_id bigint,
  chat_id bigint,
  til text,
  telefon_e164 text,
  tasdiqlandi_at timestamptz,
  ishlatildi_at timestamptz,
  xato_urinish smallint not null default 0,
  sorov_soni integer not null default 0
);
create index if not exists t2_kirish_nonce_tg_idx on public.t2_kirish_nonce (telegram_user_id, holat, yaratildi desc);

alter table public.t2_kirish_limit enable row level security;
alter table public.t2_kirish_taklif enable row level security;
alter table public.t2_kirish_nonce enable row level security;
revoke all on public.t2_kirish_limit, public.t2_kirish_taklif, public.t2_kirish_nonce from public, anon, authenticated;
revoke all on sequence public.t2_kirish_limit_id_seq, public.t2_kirish_taklif_id_seq from public, anon, authenticated;

-- ───────── yordamchilar ─────────
-- +998 (O'zbekiston) raqamini E.164 ga keltiradi; yaroqsiz bo'lsa NULL. Faqat raqam, bo'shliq, ( ) . / - va bosh '+'.
create or replace function public.t2_telefon_norm_v1(p text) returns text
language plpgsql immutable set search_path = public, pg_temp as $f$
declare s text := btrim(coalesce(p, '')); d text;
begin
  if s = '' or length(s) > 24 or s !~ '^\+?[0-9 ()./-]+$' then return null; end if;
  d := regexp_replace(s, '[^0-9]', '', 'g');
  if length(d) = 9 then d := '998' || d; end if;
  if d ~ '^998[2-9][0-9]{8}$' then return '+' || d; end if;
  return null;
end $f$;

-- DB tomonidagi limit (email kod namunasi): oynada p_max dan oshsa false; ruxsat berilsa hodisani yozadi.
create or replace function public._t2_kirish_limit_v1(p_tur text, p_kalit text, p_oyna interval, p_max integer) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_n integer; v_k text := coalesce(p_kalit, '');
begin
  perform pg_advisory_xact_lock(hashtextextended('t2_kirish_limit:' || p_tur || ':' || v_k, 0));
  select count(*) into v_n from public.t2_kirish_limit where tur = p_tur and kalit = v_k and yaratildi > now() - p_oyna;
  if v_n >= p_max then return false; end if;
  insert into public.t2_kirish_limit (tur, kalit) values (p_tur, v_k);
  if random() < 0.02 then delete from public.t2_kirish_limit where yaratildi < now() - interval '3 days'; end if;
  return true;
end $f$;

-- Taklif qiluvchi huquqi: 'boshqaruv' (direktor / company.member.manage), 'dala' (kadr: hr.write — faqat dala rollari), null (yo'q).
create or replace function public._t2_kirish_taklif_huquq_v1(p_actor_id bigint, p_kompaniya_id bigint) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare v_rol text;
begin
  if p_actor_id is null or p_actor_id <= 0 or p_kompaniya_id is null or p_kompaniya_id <= 0 then return null; end if;
  if not public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'company.member.manage') then
    if public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'hr.write') then return 'dala'; end if;
    return null;
  end if;
  if public.t2_platforma_superadmin(p_actor_id) then return 'boshqaruv'; end if;
  select a.rol into v_rol from public.t2_azolik a where a.kompaniya_id = p_kompaniya_id and a.foydalanuvchi_id = p_actor_id and a.holat = 'faol' limit 1;
  -- company.member.manage individual ruxsat bilan berilgan, lekin rol direktor emas → faqat dala rollari.
  if v_rol in ('boss', 'admin') then return 'boshqaruv'; end if;
  return 'dala';
end $f$;

-- Taklif qilinadigan rol: katalogda bor, boss/admin/superadmin emas. p_huquq='dala' bo'lsa faqat dala rollari.
create or replace function public._t2_kirish_taklif_rol_yaroqli_v1(p_rol text, p_huquq text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $f$
  select p_rol is not null
    and p_rol in ('rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi', 'omborchi', 'mexanik', 'kadr',
                  'taminotchi', 'usta', 'brigadir', 'haydovchi', 'inspektor', 'loyihachi', 'sotuvchi')
    and coalesce(cardinality(public.t2_role_permissions_v2(p_rol)), 0) > 0
    and (p_huquq = 'boshqaruv' or (p_huquq = 'dala' and p_rol in ('usta', 'brigadir', 'haydovchi')));
$f$;

create or replace function public._t2_kirish_niqob_v1(p_tel text) returns text
language sql immutable set search_path = public, pg_temp as $f$
  select case when p_tel is null then null else left(p_tel, 4) || ' ** *** ' || right(p_tel, 4) end;
$f$;

-- Parol siyosati (taklif orqali o'zi o'rnatadi): >= 8, <= 200, telefon raqamini o'z ichiga olmaydi, bitta belgi takrori emas.
create or replace function public._t2_parol_siyosat_v1(p_parol text, p_tel text) returns text
language plpgsql immutable set search_path = public, pg_temp as $f$
declare v_d text := regexp_replace(coalesce(p_tel, ''), '[^0-9]', '', 'g');
begin
  if length(coalesce(p_parol, '')) < 8 then return 'PAROL_QISQA'; end if;
  if length(p_parol) > 200 then return 'PAROL_UZUN'; end if;
  if p_parol ~ '^(.)\1*$' then return 'PAROL_OSON'; end if;
  if v_d <> '' and (regexp_replace(p_parol, '[^0-9]', '', 'g') like '%' || right(v_d, 9) || '%' or p_parol = p_tel) then return 'PAROL_TELEFON'; end if;
  return null;
end $f$;

-- ───────── A) kompaniya admini taklifi ─────────
create or replace function public.t2_kirish_taklif_yarat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_ism text, p_telefon text, p_rol text,
  p_kod_xesh text, p_token_xesh text, p_muddat_soat integer, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_prev jsonb; v_huquq text; v_tel text := public.t2_telefon_norm_v1(p_telefon); v_ism text := btrim(coalesce(p_ism, ''));
  v_id bigint; v_tugaydi timestamptz; v_res jsonb; v_bor bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id and actor_id = p_actor_id and command = 'kirish_taklif_yarat';
  if found then return v_prev || '{"takror":true}'::jsonb; end if;
  v_huquq := public._t2_kirish_taklif_huquq_v1(p_actor_id, p_kompaniya_id);
  if v_huquq is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if v_tel is null then return jsonb_build_object('ok', false, 'code', 'TELEFON_NOTOGRI'); end if;
  if length(v_ism) < 2 or length(v_ism) > 120 then return jsonb_build_object('ok', false, 'code', 'ISM_NOTOGRI'); end if;
  if not public._t2_kirish_taklif_rol_yaroqli_v1(p_rol, v_huquq) then return jsonb_build_object('ok', false, 'code', 'ROL_NOTOGRI'); end if;
  if coalesce(p_kod_xesh, '') !~ '^[0-9a-f]{64}$' or coalesce(p_token_xesh, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'code', 'KOD_NOTOGRI'); end if;
  if p_muddat_soat is null or p_muddat_soat < 1 or p_muddat_soat > 720 then return jsonb_build_object('ok', false, 'code', 'MUDDAT_NOTOGRI'); end if;
  -- limitlar: taklif qiluvchi / kompaniya / telefon bo'yicha.
  if not public._t2_kirish_limit_v1('taklif_actor', p_actor_id::text, interval '1 hour', 30)
     or not public._t2_kirish_limit_v1('taklif_komp', p_kompaniya_id::text, interval '1 day', 200)
     or not public._t2_kirish_limit_v1('taklif_tel', v_tel, interval '1 day', 10) then
    return jsonb_build_object('ok', false, 'code', 'LIMIT');
  end if;
  if (select count(*) from public.t2_kirish_taklif where kompaniya_id = p_kompaniya_id and holat = 'kutmoqda' and tugaydi > now()) >= 50 then
    return jsonb_build_object('ok', false, 'code', 'KOP_TAKLIF');
  end if;
  select u.id into v_bor from public.t2_foydalanuvchi u join public.t2_azolik a on a.foydalanuvchi_id = u.id
   where (u.telefon_e164 = v_tel or u.login = v_tel) and a.kompaniya_id = p_kompaniya_id and a.holat = 'faol' limit 1;
  if v_bor is not null then return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_AZO'); end if;
  -- shu telefon uchun avvalgi kutayotgan taklif bekor qilinadi (qayta yuborish).
  update public.t2_kirish_taklif set holat = 'bekor', bekor_actor_id = p_actor_id, bekor_at = now()
   where kompaniya_id = p_kompaniya_id and telefon_e164 = v_tel and holat = 'kutmoqda';
  v_tugaydi := now() + make_interval(hours => p_muddat_soat);
  insert into public.t2_kirish_taklif (kompaniya_id, ism, telefon_e164, rol, kod_xesh, token_xesh, tugaydi, yaratdi_actor_id)
    values (p_kompaniya_id, left(v_ism, 120), v_tel, p_rol, p_kod_xesh, p_token_xesh, v_tugaydi, p_actor_id) returning id into v_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'kirish_taklif_yarat', 'kirish', null, format('taklif=%s rol=%s', v_id, p_rol), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'taklif_id', v_id, 'tugaydi', v_tugaydi, 'telefon', public._t2_kirish_niqob_v1(v_tel));
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'kirish_taklif_yarat', v_res);
  return v_res;
end $f$;

create or replace function public.t2_kirish_taklif_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_huquq text := public._t2_kirish_taklif_huquq_v1(p_actor_id, p_kompaniya_id); v_r jsonb;
begin
  if v_huquq is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'ism', t.ism, 'telefon', public._t2_kirish_niqob_v1(t.telefon_e164), 'rol', t.rol, 'yaratildi', t.yaratildi, 'tugaydi', t.tugaydi,
      'holat', case when t.holat = 'bekor' then 'bekor' when t.holat = 'ishlatildi' then 'ishlatildi'
                    when t.urinishlar >= 5 then 'bloklangan' when t.tugaydi <= now() then 'muddati_otgan' else 'kutmoqda' end,
      'urinishlar', t.urinishlar, 'ishlatildi_at', t.ishlatildi_at) order by t.id desc), '[]'::jsonb) into v_r
    from (select * from public.t2_kirish_taklif where kompaniya_id = p_kompaniya_id order by id desc limit 100) t
   where v_huquq = 'boshqaruv' or t.rol in ('usta', 'brigadir', 'haydovchi');
  return jsonb_build_object('ok', true, 'takliflar', v_r);
end $f$;

create or replace function public.t2_kirish_taklif_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taklif_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_huquq text := public._t2_kirish_taklif_huquq_v1(p_actor_id, p_kompaniya_id); v public.t2_kirish_taklif%rowtype;
begin
  if v_huquq is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  select * into v from public.t2_kirish_taklif where id = p_taklif_id and kompaniya_id = p_kompaniya_id for update;
  if not found or (v_huquq = 'dala' and v.rol not in ('usta', 'brigadir', 'haydovchi')) then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v.holat <> 'kutmoqda' then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI'); end if;
  update public.t2_kirish_taklif set holat = 'bekor', bekor_actor_id = p_actor_id, bekor_at = now() where id = v.id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'kirish_taklif_bekor', 'kirish', null, format('taklif=%s', v.id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $f$;

-- Yagona qidiruv: havola (token) yoki telefon+kod bo'yicha yaroqli taklifni topadi va qulflaydi. Xato bo'lsa hamma holatda BIR XIL javob.
create or replace function public._t2_kirish_taklif_top_v1(p_token_xesh text, p_telefon text, p_kod_xesh text, p_ip_belgi text) returns public.t2_kirish_taklif
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v public.t2_kirish_taklif%rowtype; v_tel text := public.t2_telefon_norm_v1(p_telefon);
begin
  if not public._t2_kirish_limit_v1('taklif_ip', p_ip_belgi, interval '1 hour', 40) then return null; end if;
  if p_token_xesh is not null then
    if p_token_xesh !~ '^[0-9a-f]{64}$' then return null; end if;
    select * into v from public.t2_kirish_taklif where token_xesh = p_token_xesh for update;
    if not found or v.holat <> 'kutmoqda' or v.tugaydi <= now() or v.urinishlar >= 5 then return null; end if;
    return v;
  end if;
  if v_tel is null or coalesce(p_kod_xesh, '') !~ '^[0-9a-f]{64}$' then return null; end if;
  if not public._t2_kirish_limit_v1('taklif_kod_tel', v_tel, interval '1 hour', 20) then return null; end if;
  perform 1 from public.t2_kirish_taklif where telefon_e164 = v_tel and holat = 'kutmoqda' for update;
  select * into v from public.t2_kirish_taklif
   where telefon_e164 = v_tel and holat = 'kutmoqda' and tugaydi > now() and urinishlar < 5 and kod_xesh = p_kod_xesh order by id desc limit 1;
  if found then return v; end if;
  -- noto'g'ri kod: shu telefonning kutayotgan takliflarida urinish hisobi (5 dan keyin bloklanadi).
  update public.t2_kirish_taklif set urinishlar = least(urinishlar + 1, 100) where telefon_e164 = v_tel and holat = 'kutmoqda' and tugaydi > now();
  return null;
end $f$;

-- Yangi hisob: taklif egasi o'z parolini o'rnatadi; a'zolik AYNAN taklif qilingan rol bilan.
create or replace function public.t2_kirish_taklif_qabul_v1(p_token_xesh text, p_telefon text, p_kod_xesh text, p_parol text, p_ip_belgi text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v public.t2_kirish_taklif%rowtype; v_uid bigint; v_pol text; v_az jsonb; v_bor bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if (p_token_xesh is null) = (p_telefon is null) then return jsonb_build_object('ok', false, 'code', 'TAKLIF_RAD'); end if;
  v := public._t2_kirish_taklif_top_v1(p_token_xesh, p_telefon, p_kod_xesh, p_ip_belgi);
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'TAKLIF_RAD'); end if;
  if not exists (select 1 from public.t2_kompaniya where id = v.kompaniya_id and faol = true) then return jsonb_build_object('ok', false, 'code', 'TAKLIF_RAD'); end if;
  -- Mavjud hisob bo'lsa YANGISI OCHILMAYDI va a'zolik jim berilmaydi: egasi avval kirib, "ulash" yo'lidan foydalanadi.
  select id into v_bor from public.t2_foydalanuvchi where telefon_e164 = v.telefon_e164 or login = v.telefon_e164 limit 1;
  if v_bor is not null then return jsonb_build_object('ok', false, 'code', 'HISOB_BOR'); end if;
  v_pol := public._t2_parol_siyosat_v1(p_parol, v.telefon_e164);
  if v_pol is not null then return jsonb_build_object('ok', false, 'code', v_pol); end if;
  begin
    insert into public.t2_foydalanuvchi (login, ism, holat, parol_hash, parol_yangilandi, telefon, telefon_e164, telefon_manba, telefon_tasdiqlangan)
      values (v.telefon_e164, v.ism, 'faol', extensions.crypt(p_parol, extensions.gen_salt('bf')), now(), v.telefon_e164, v.telefon_e164, 'admin', false)
      returning id into v_uid;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'HISOB_BOR');
  end;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (v_uid, v.kompaniya_id, v.rol, 'faol');
  update public.t2_kirish_taklif set holat = 'ishlatildi', ishlatildi_at = now(), ishlatdi_foydalanuvchi_id = v_uid, ishlatish_turi = 'yangi_hisob' where id = v.id;
  perform public.t2_audit_yoz(v.kompaniya_id, 'kirish_taklif_ishlatildi', 'kirish', null, format('taklif=%s rol=%s yangi_hisob', v.id, v.rol), 'actor:' || v_uid, null);
  select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', a.kompaniya_id, 'rol', a.rol)), '[]'::jsonb) into v_az
    from public.t2_azolik a where a.foydalanuvchi_id = v_uid and a.holat = 'faol';
  return jsonb_build_object('ok', true, 'yangi', true, 'foydalanuvchi_id', v_uid, 'login', v.telefon_e164, 'rol', v.rol, 'azoliklar', v_az);
end $f$;

-- Mavjud hisob: AUTENTIFIKATSIYALANGAN sessiya (p_actor_id — sessiyadan, mijoz yuklamasidan emas) taklifni qabul qiladi.
create or replace function public.t2_kirish_taklif_ulash_v1(p_actor_id bigint, p_token_xesh text, p_telefon text, p_kod_xesh text, p_ip_belgi text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v public.t2_kirish_taklif%rowtype; v_az jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_actor_id is null or p_actor_id <= 0 or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;
  if (p_token_xesh is null) = (p_telefon is null) then return jsonb_build_object('ok', false, 'code', 'TAKLIF_RAD'); end if;
  v := public._t2_kirish_taklif_top_v1(p_token_xesh, p_telefon, p_kod_xesh, p_ip_belgi);
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'TAKLIF_RAD'); end if;
  if not exists (select 1 from public.t2_kompaniya where id = v.kompaniya_id and faol = true) then return jsonb_build_object('ok', false, 'code', 'TAKLIF_RAD'); end if;
  if exists (select 1 from public.t2_azolik where foydalanuvchi_id = p_actor_id and kompaniya_id = v.kompaniya_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_AZO');
  end if;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (p_actor_id, v.kompaniya_id, v.rol, 'faol');
  update public.t2_kirish_taklif set holat = 'ishlatildi', ishlatildi_at = now(), ishlatdi_foydalanuvchi_id = p_actor_id, ishlatish_turi = 'mavjud_hisob' where id = v.id;
  perform public.t2_audit_yoz(v.kompaniya_id, 'kirish_taklif_ishlatildi', 'kirish', null, format('taklif=%s rol=%s mavjud_hisob', v.id, v.rol), 'actor:' || p_actor_id, null);
  select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', a.kompaniya_id, 'rol', a.rol)), '[]'::jsonb) into v_az
    from public.t2_azolik a where a.foydalanuvchi_id = p_actor_id and a.holat = 'faol';
  return jsonb_build_object('ok', true, 'yangi', false, 'foydalanuvchi_id', p_actor_id, 'rol', v.rol, 'kompaniya_id', v.kompaniya_id, 'azoliklar', v_az);
end $f$;

-- Telefon+parol kirishi uchun xato limiti (faqat telefon ko'rinishidagi loginlar; /api/kirish chaqiradi).
create or replace function public.t2_kirish_tel_limit_v1(p_telefon text, p_ip_belgi text, p_xato boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_tel text := public.t2_telefon_norm_v1(p_telefon); v_nt integer; v_ni integer;
begin
  if v_tel is null then return jsonb_build_object('ok', false, 'code', 'TELEFON_NOTOGRI'); end if;
  if coalesce(p_xato, false) then
    insert into public.t2_kirish_limit (tur, kalit) values ('tel_xato', v_tel), ('tel_xato_ip', coalesce(p_ip_belgi, ''));
    return jsonb_build_object('ok', true);
  end if;
  select count(*) into v_nt from public.t2_kirish_limit where tur = 'tel_xato' and kalit = v_tel and yaratildi > now() - interval '15 minutes';
  select count(*) into v_ni from public.t2_kirish_limit where tur = 'tel_xato_ip' and kalit = coalesce(p_ip_belgi, '') and yaratildi > now() - interval '15 minutes';
  if v_nt >= 8 or v_ni >= 40 then return jsonb_build_object('ok', false, 'code', 'LIMIT'); end if;
  return jsonb_build_object('ok', true);
end $f$;

-- ───────── B) Telegram orqali telefon tasdiqlash ─────────
-- 1) brauzer so'raydi (shlyuz nonce/brauzer sirini yaratib, faqat xeshlarni yuboradi)
create or replace function public.t2_tg_kirish_boshla_v1(p_nonce_xesh text, p_brauzer_xesh text, p_belgi text, p_ism text, p_ip_belgi text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_tugaydi timestamptz := now() + interval '5 minutes';
begin
  if coalesce(p_nonce_xesh, '') !~ '^[0-9a-f]{64}$' or coalesce(p_brauzer_xesh, '') !~ '^[0-9a-f]{64}$' or coalesce(p_belgi, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'code', 'NOTOGRI');
  end if;
  if not public._t2_kirish_limit_v1('tg_boshla_ip', p_ip_belgi, interval '1 hour', 12)
     or not public._t2_kirish_limit_v1('tg_boshla_hamma', 'hamma', interval '1 hour', 2000) then
    return jsonb_build_object('ok', false, 'code', 'LIMIT');
  end if;
  insert into public.t2_kirish_nonce (nonce_xesh, brauzer_xesh, belgi, ism, ip_belgi, tugaydi)
    values (p_nonce_xesh, p_brauzer_xesh, p_belgi, left(nullif(btrim(coalesce(p_ism, '')), ''), 120), p_ip_belgi, v_tugaydi);
  return jsonb_build_object('ok', true, 'tugaydi', v_tugaydi);
end $f$;

-- 2) bot: /start kirish_<nonce> — nonce shu Telegram foydalanuvchisiga bog'lanadi (birinchisi g'olib)
create or replace function public.t2_tg_kirish_start_v1(p_nonce_xesh text, p_telegram_user_id bigint, p_chat_id bigint, p_til text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v public.t2_kirish_nonce%rowtype;
begin
  if coalesce(p_nonce_xesh, '') !~ '^[0-9a-f]{64}$' or p_telegram_user_id is null or p_telegram_user_id <= 0 or p_chat_id is null then
    return jsonb_build_object('ok', false, 'code', 'NONCE_RAD');
  end if;
  if not public._t2_kirish_limit_v1('tg_start_user', p_telegram_user_id::text, interval '1 hour', 12) then return jsonb_build_object('ok', false, 'code', 'LIMIT'); end if;
  select * into v from public.t2_kirish_nonce where nonce_xesh = p_nonce_xesh for update;
  if not found or v.holat <> 'kutmoqda' or v.tugaydi <= now() then return jsonb_build_object('ok', false, 'code', 'NONCE_RAD'); end if;
  update public.t2_kirish_nonce set holat = 'kontakt_kutmoqda', telegram_user_id = p_telegram_user_id, chat_id = p_chat_id,
         til = case when p_til in ('uz', 'ru', 'en') then p_til else null end where id = v.id;
  return jsonb_build_object('ok', true, 'belgi', v.belgi);
end $f$;

-- 3) bot: foydalanuvchi o'z kontaktini yubordi. contact.user_id == jo'natuvchi bo'lishi SHART (boshqa odam raqamini yuborib bo'lmaydi).
create or replace function public.t2_tg_kirish_kontakt_v1(p_telegram_user_id bigint, p_contact_user_id bigint, p_telefon text, p_chat_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v public.t2_kirish_nonce%rowtype; v_tel text := public.t2_telefon_norm_v1(p_telefon);
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 then return jsonb_build_object('ok', false, 'code', 'NONCE_RAD'); end if;
  if p_contact_user_id is null or p_contact_user_id <> p_telegram_user_id then
    insert into public.t2_telegram_hodisa (telegram_user_id, amal, manba) values (p_telegram_user_id, 'kontakt_boshqaniki', 'nonce');
    return jsonb_build_object('ok', false, 'code', 'KONTAKT_BOSHQANIKI');
  end if;
  select * into v from public.t2_kirish_nonce
   where telegram_user_id = p_telegram_user_id and holat = 'kontakt_kutmoqda' and tugaydi > now() order by yaratildi desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NONCE_RAD'); end if;
  if v_tel is null then
    update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
    return jsonb_build_object('ok', false, 'code', 'TELEFON_NOTOGRI');
  end if;
  update public.t2_kirish_nonce set holat = 'tasdiqlandi', telefon_e164 = v_tel, tasdiqlandi_at = now(), chat_id = coalesce(p_chat_id, chat_id)
   where id = v.id and holat = 'kontakt_kutmoqda';
  insert into public.t2_telegram_hodisa (telegram_user_id, amal, manba) values (p_telegram_user_id, 'telefon_tasdiqlandi', 'nonce');
  return jsonb_build_object('ok', true);
end $f$;

-- 4) brauzer so'rovi (polling): nonce + brauzer siri. Tasdiqlangan bo'lsa — SHU YERDA atomik sarflanadi va hisob topiladi/ochiladi.
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

-- ───────── ruxsatlar: faqat service_role ─────────
revoke all on function public.t2_telefon_norm_v1(text) from public, anon, authenticated;
revoke all on function public._t2_kirish_limit_v1(text, text, interval, integer) from public, anon, authenticated;
revoke all on function public._t2_kirish_taklif_huquq_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public._t2_kirish_taklif_rol_yaroqli_v1(text, text) from public, anon, authenticated;
revoke all on function public._t2_kirish_niqob_v1(text) from public, anon, authenticated;
revoke all on function public._t2_parol_siyosat_v1(text, text) from public, anon, authenticated;
revoke all on function public.t2_kirish_taklif_yarat_v1(bigint, bigint, text, text, text, text, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.t2_kirish_taklif_royxat_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_kirish_taklif_bekor_v1(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public._t2_kirish_taklif_top_v1(text, text, text, text) from public, anon, authenticated;
revoke all on function public.t2_kirish_taklif_qabul_v1(text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_kirish_taklif_ulash_v1(bigint, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_kirish_tel_limit_v1(text, text, boolean) from public, anon, authenticated;
revoke all on function public.t2_tg_kirish_boshla_v1(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.t2_tg_kirish_start_v1(text, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.t2_tg_kirish_kontakt_v1(bigint, bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.t2_tg_kirish_holat_v1(text, text, text, uuid) from public, anon, authenticated;

grant execute on function public.t2_telefon_norm_v1(text) to service_role;
grant execute on function public._t2_kirish_limit_v1(text, text, interval, integer) to service_role;
grant execute on function public._t2_kirish_taklif_huquq_v1(bigint, bigint) to service_role;
grant execute on function public._t2_kirish_taklif_rol_yaroqli_v1(text, text) to service_role;
grant execute on function public._t2_kirish_niqob_v1(text) to service_role;
grant execute on function public._t2_parol_siyosat_v1(text, text) to service_role;
grant execute on function public.t2_kirish_taklif_yarat_v1(bigint, bigint, text, text, text, text, text, integer, uuid) to service_role;
grant execute on function public.t2_kirish_taklif_royxat_v1(bigint, bigint) to service_role;
grant execute on function public.t2_kirish_taklif_bekor_v1(bigint, bigint, bigint) to service_role;
grant execute on function public._t2_kirish_taklif_top_v1(text, text, text, text) to service_role;
grant execute on function public.t2_kirish_taklif_qabul_v1(text, text, text, text, text, uuid) to service_role;
grant execute on function public.t2_kirish_taklif_ulash_v1(bigint, text, text, text, text, uuid) to service_role;
grant execute on function public.t2_kirish_tel_limit_v1(text, text, boolean) to service_role;
grant execute on function public.t2_tg_kirish_boshla_v1(text, text, text, text, text) to service_role;
grant execute on function public.t2_tg_kirish_start_v1(text, bigint, bigint, text) to service_role;
grant execute on function public.t2_tg_kirish_kontakt_v1(bigint, bigint, text, bigint) to service_role;
grant execute on function public.t2_tg_kirish_holat_v1(text, text, text, uuid) to service_role;

notify pgrst, 'reload schema';
