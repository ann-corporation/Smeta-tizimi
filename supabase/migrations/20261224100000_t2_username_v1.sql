-- T2-USERNAME-V1 (2026-11-15): Telegram'dagi kabi tizim darajasidagi @username + telefon/email bo'yicha aniq (exact) qidiruv.
-- Egasi talabi: har foydalanuvchining noyob @username i bor; odamni kompaniyaga qo'shish, taklif, topshiriq, eslatishda @username YOKI telefon YOKI email
-- bilan topiladi. Mantiq SERVERDA: sayt, Android, Windows va Telegram bot bir xil RPC ni chaqiradi (docs/architecture/USERNAME_V1.md).
--
--  1) t2_foydalanuvchi: username (kichik harf, 5..32, [a-z0-9_], harf bilan boshlanadi, "__" va oxirgi "_" yo'q, band so'zlar yo'q, noyob),
--     telefon_qidiruv ('hammasi' | 'kompaniyadosh' | 'hech', sukut 'hammasi' — faqat ANIQ moslik).
--  2) t2_username_zahira (band so'zlar), t2_username_ushlash (bo'shatilgan nom 7 kun avvalgi egasi uchun band), t2_username_tarix (o'zgartirish tarixi -> sutkasiga 5 ta limit), t2_qidiruv_log (kim, qaysi tur, topildimi — QIYMAT SAQLANMAYDI).
--  3) RPC lar (service_role, actor = p_actor_id): belgila, tekshir(+variantlar), ol, sozlama, qidir (username|telefon|email, exact), kompaniyadosh_qidir (prefiks, faqat
--     kompaniyadoshlar orasida), ommaviy (id -> username, faqat kompaniyadoshlar), taklif yubor / royxat / javob (KUTILADIGAN taklif — hech kim jimgina a'zo qilinmaydi).
-- Telefon/email HECH QACHON javobda qaytmaydi. Qidiruv: soatiga 30 (telefon/email) va 120 (username) — _t2_kirish_limit_v1 orqali; har qidiruv logga yoziladi.
-- Migratsiya faylida begin/commit YO'Q (tashqi tranzaksiya qo'llovchi tomonidan). Qo'llash — egasi tasdig'idan keyin.

-- ───────── 1. ustunlar ─────────
alter table public.t2_foydalanuvchi
  add column if not exists username text,
  add column if not exists telefon_qidiruv text not null default 'hammasi';

do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_foydalanuvchi_username_chk') then
    alter table public.t2_foydalanuvchi add constraint t2_foydalanuvchi_username_chk
      check (username is null or (username ~ '^[a-z][a-z0-9_]{4,31}$' and username !~ '__' and username !~ '_$'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 't2_foydalanuvchi_telefon_qidiruv_chk') then
    alter table public.t2_foydalanuvchi add constraint t2_foydalanuvchi_telefon_qidiruv_chk
      check (telefon_qidiruv in ('hammasi','kompaniyadosh','hech'));
  end if;
end $c$;

-- Katta-kichik harfga befarq noyoblik (qiymat doim kichik harfda saqlanadi, indeks lower() bilan ham himoyalaydi).
create unique index if not exists t2_foydalanuvchi_username_uq on public.t2_foydalanuvchi (lower(username)) where username is not null;
create index if not exists t2_foydalanuvchi_username_prefiks_idx on public.t2_foydalanuvchi (username text_pattern_ops) where username is not null;
create index if not exists t2_foydalanuvchi_email_lower_idx on public.t2_foydalanuvchi (lower(email)) where email is not null;

-- ───────── 2. yordamchi jadvallar ─────────
create table if not exists public.t2_username_zahira (nom text primary key check (nom = lower(nom)));
insert into public.t2_username_zahira (nom) values
  ('admin'),('administrator'),('support'),('qurai'),('qur_uz'),('quruz'),('smeta'),('system'),('bot'),('root'),('api'),('www'),('help'),('info'),
  ('moderator'),('superadmin'),('boss'),('official'),('telegram'),('everyone'),('all'),('here'),('channel'),('null'),('undefined'),('owner'),('staff'),
  ('security'),('billing'),('payment'),('noreply'),('jarvis'),('anonymous'),('settings'),('login'),('logout'),('register')
on conflict do nothing;

create table if not exists public.t2_username_tarix (
  id bigint generated always as identity primary key,
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  eski text, yangi text, yaratildi timestamptz not null default now());
create index if not exists t2_username_tarix_user_idx on public.t2_username_tarix (foydalanuvchi_id, yaratildi desc);

-- Bo'shatilgan/o'zgartirilgan username 7 kun avvalgi egasi uchun «band» (ushlab turiladi); shu muddatda faqat avvalgi egasi qaytarib ola oladi.
create table if not exists public.t2_username_ushlash (
  nom text primary key check (nom = lower(nom)),
  egasi_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  tugaydi timestamptz not null);
create index if not exists t2_username_ushlash_egasi_idx on public.t2_username_ushlash (egasi_id);

create table if not exists public.t2_qidiruv_log (
  id bigint generated always as identity primary key,
  actor_id bigint not null, tur text not null check (tur in ('username','telefon','email','noaniq')), topildi boolean not null,
  yaratildi timestamptz not null default now());
create index if not exists t2_qidiruv_log_actor_idx on public.t2_qidiruv_log (actor_id, yaratildi desc);

create table if not exists public.t2_kompaniya_taklif (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  taklif_qilingan_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  taklif_qiluvchi_id bigint not null references public.t2_foydalanuvchi(id),
  rol text not null,
  holat text not null default 'kutmoqda' check (holat in ('kutmoqda','qabul','rad','bekor','muddati_otdi')),
  tugaydi timestamptz not null default now() + interval '14 days',
  yaratildi timestamptz not null default now(), javob_vaqti timestamptz);
create unique index if not exists t2_kompaniya_taklif_kutmoqda_uq on public.t2_kompaniya_taklif (kompaniya_id, taklif_qilingan_id) where holat = 'kutmoqda';
create index if not exists t2_kompaniya_taklif_user_idx on public.t2_kompaniya_taklif (taklif_qilingan_id) where holat = 'kutmoqda';

alter table public.t2_username_zahira enable row level security;
alter table public.t2_username_tarix enable row level security;
alter table public.t2_username_ushlash enable row level security;
alter table public.t2_qidiruv_log enable row level security;
alter table public.t2_kompaniya_taklif enable row level security;
revoke all on public.t2_username_zahira, public.t2_username_tarix, public.t2_username_ushlash, public.t2_qidiruv_log, public.t2_kompaniya_taklif from public, anon, authenticated;

-- ───────── 3. ichki yordamchilar ─────────
-- null = yaroqli; aks holda sabab kodi. Kiruvchi qiymat '@' siz, kichik harfga keltirilgan bo'lishi kerak.
create or replace function public._t2_username_xato_v1(p text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $f$
begin
  if p is null or length(p) < 5 then return 'USERNAME_QISQA'; end if;
  if length(p) > 32 then return 'USERNAME_UZUN'; end if;
  if p !~ '^[a-z0-9_]+$' then return 'USERNAME_FORMAT'; end if;
  if p !~ '^[a-z]' then return 'USERNAME_BOSHLANISH'; end if;
  if p ~ '__' or p ~ '_$' then return 'USERNAME_UNDERSCORE'; end if;
  if exists (select 1 from public.t2_username_zahira where nom = p) or p like 'qurai%' or p like 'admin\_%' escape '\' then return 'USERNAME_BAND_SOZ'; end if;
  return null;
end $f$;

-- true = p_nom boshqa foydalanuvchi uchun 7 kunlik ushlashda (p_actor_id — o'zi bo'lsa ushlash to'siq emas).
create or replace function public._t2_username_ushlangan_v1(p_nom text, p_actor_id bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $f$
  select exists (select 1 from public.t2_username_ushlash where nom = p_nom and tugaydi > now() and egasi_id is distinct from p_actor_id) $f$;

create or replace function public._t2_username_norm_v1(p text) returns text
language sql immutable as $f$ select nullif(lower(regexp_replace(btrim(coalesce(p,'')), '^@+', '')), '') $f$;

create or replace function public._t2_azo_kompaniyadosh_v1(p_a bigint, p_b bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $f$
  select p_a = p_b or exists (
    select 1 from public.t2_azolik x join public.t2_azolik y on y.kompaniya_id = x.kompaniya_id and y.holat = 'faol'
     where x.foydalanuvchi_id = p_a and x.holat = 'faol' and y.foydalanuvchi_id = p_b) $f$;

-- Qiymatdan foydalanuvchini topish (ANIQ moslik). Qaytaradi: tur + id (privacy qoidasi qo'llangan; topilmasa id null).
create or replace function public._t2_foydalanuvchi_qidir_ichki_v1(p_actor_id bigint, p_qiymat text, out o_tur text, out o_id bigint)
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_q text := btrim(coalesce(p_qiymat,'')); v_tel text; v_u record;
begin
  o_id := null;
  if v_q = '' or length(v_q) > 254 then o_tur := 'noaniq'; return; end if;
  if left(v_q,1) = '@' or v_q ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$' then
    o_tur := 'username';
    select id into o_id from public.t2_foydalanuvchi where lower(username) = public._t2_username_norm_v1(v_q) and coalesce(holat,'faol') = 'faol';
    return;
  elsif position('@' in v_q) > 1 then
    o_tur := 'email';
    select id, telefon_qidiruv into v_u from public.t2_foydalanuvchi where lower(email) = lower(v_q) and coalesce(holat,'faol') = 'faol' order by id limit 1;
  else
    v_tel := public.t2_telefon_norm_v1(v_q);
    if v_tel is null then o_tur := 'noaniq'; return; end if;
    o_tur := 'telefon';
    select id, telefon_qidiruv into v_u from public.t2_foydalanuvchi where telefon_e164 = v_tel and coalesce(holat,'faol') = 'faol';
  end if;
  if not found then return; end if;
  -- Telegram'dagi «meni telefon bo'yicha kim topadi» qoidasi (email uchun ham shu sozlama).
  if v_u.telefon_qidiruv = 'hech' and v_u.id <> p_actor_id then return; end if;
  if v_u.telefon_qidiruv = 'kompaniyadosh' and not public._t2_azo_kompaniyadosh_v1(p_actor_id, v_u.id) then return; end if;
  o_id := v_u.id;
end $f$;

create or replace function public._t2_profil_min_v1(p_id bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $f$
  select jsonb_build_object('id', u.id, 'ism', coalesce(nullif(btrim(u.ism),''), u.username, 'Foydalanuvchi'), 'username', u.username, 'avatar_rang', u.avatar_rang)
    from public.t2_foydalanuvchi u where u.id = p_id $f$;

create or replace function public._t2_actor_faol_v1(p_actor_id bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $f$
  select p_actor_id is not null and p_actor_id > 0 and exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and coalesce(holat,'faol') = 'faol') $f$;

-- ───────── 4. o'z username i ─────────
create or replace function public.t2_username_ol_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare v_u public.t2_foydalanuvchi%rowtype; v_n integer;
begin
  if not public._t2_actor_faol_v1(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  select * into v_u from public.t2_foydalanuvchi where id = p_actor_id;
  select count(*) into v_n from public.t2_username_tarix where foydalanuvchi_id = p_actor_id and yaratildi > now() - interval '1 day';
  return jsonb_build_object('ok', true, 'username', v_u.username, 'ism', v_u.ism, 'telefon_qidiruv', v_u.telefon_qidiruv, 'bugun_qoldi', greatest(5 - v_n, 0));
end $f$;

create or replace function public.t2_username_belgila_v1(p_actor_id bigint, p_username text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_prev jsonb; v_yangi text := public._t2_username_norm_v1(p_username); v_eski text; v_xato text; v_n integer; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id and actor_id = p_actor_id and command = 'username_belgila';
  if found then return v_prev; end if;
  if not public._t2_actor_faol_v1(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_username:' || p_actor_id::text, 0));
  select username into v_eski from public.t2_foydalanuvchi where id = p_actor_id for update;
  if v_yangi is not distinct from v_eski then return jsonb_build_object('ok', true, 'username', v_eski, 'o_zgarmadi', true); end if;
  if v_yangi is not null then
    v_xato := public._t2_username_xato_v1(v_yangi);
    if v_xato is not null then return jsonb_build_object('ok', false, 'code', v_xato); end if;
    if exists (select 1 from public.t2_foydalanuvchi where lower(username) = v_yangi and id <> p_actor_id) then return jsonb_build_object('ok', false, 'code', 'USERNAME_BAND'); end if;
    if public._t2_username_ushlangan_v1(v_yangi, p_actor_id) then return jsonb_build_object('ok', false, 'code', 'USERNAME_USHLANGAN'); end if;
  end if;
  -- birinchi marta belgilash (eski null) limitga kirmaydi; keyingi o'zgartirish/o'chirish — sutkasiga 5 ta.
  if v_eski is not null then
    select count(*) into v_n from public.t2_username_tarix where foydalanuvchi_id = p_actor_id and eski is not null and yaratildi > now() - interval '1 day';
    if v_n >= 5 then return jsonb_build_object('ok', false, 'code', 'USERNAME_LIMIT'); end if;
  end if;
  begin
    update public.t2_foydalanuvchi set username = v_yangi where id = p_actor_id;
  exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'USERNAME_BAND');
  end;
  insert into public.t2_username_tarix (foydalanuvchi_id, eski, yangi) values (p_actor_id, v_eski, v_yangi);
  -- eski nom 7 kun avvalgi egasi uchun ushlanadi; yangi nomni o'zi qaytarib olgan bo'lsa ushlash tugaydi.
  if v_eski is not null then
    insert into public.t2_username_ushlash (nom, egasi_id, tugaydi) values (v_eski, p_actor_id, now() + interval '7 days')
      on conflict (nom) do update set egasi_id = excluded.egasi_id, tugaydi = excluded.tugaydi;
  end if;
  if v_yangi is not null then delete from public.t2_username_ushlash where nom = v_yangi and egasi_id = p_actor_id; end if;
  v_res := jsonb_build_object('ok', true, 'username', v_yangi);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'username_belgila', v_res);
  return v_res;
end $f$;

-- Bo'shligi tekshiruvi + (ixtiyoriy) variantlardan bo'shlarini qaytaradi (takliflar mijozda ismdan yasaladi, bu yerda faqat bo'shligi tasdiqlanadi).
create or replace function public.t2_username_tekshir_v1(p_actor_id bigint, p_username text, p_variantlar text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_u text := public._t2_username_norm_v1(p_username); v_xato text; v_band boolean := false; v_ush boolean := false; v_bosh text[] := '{}'; v text;
begin
  if not public._t2_actor_faol_v1(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  if not public._t2_kirish_limit_v1('username_tekshir', p_actor_id::text, interval '1 hour', 240) then return jsonb_build_object('ok', false, 'code', 'LIMIT'); end if;
  if v_u is not null then
    v_xato := public._t2_username_xato_v1(v_u);
    if v_xato is null then
      v_band := exists (select 1 from public.t2_foydalanuvchi where lower(username) = v_u and id <> p_actor_id);
      v_ush := public._t2_username_ushlangan_v1(v_u, p_actor_id);
    end if;
  else v_xato := 'USERNAME_QISQA'; end if;
  foreach v in array coalesce(p_variantlar, '{}') loop
    exit when array_length(v_bosh, 1) >= 5;
    v := public._t2_username_norm_v1(v);
    if v is not null and public._t2_username_xato_v1(v) is null and not exists (select 1 from public.t2_foydalanuvchi where lower(username) = v and id <> p_actor_id) and not public._t2_username_ushlangan_v1(v, p_actor_id) then
      v_bosh := array_append(v_bosh, v);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'yaroqli', v_xato is null, 'sabab', v_xato, 'bosh', v_xato is null and not v_band and not v_ush, 'band', v_band or v_ush, 'ushlangan', v_ush, 'variantlar', to_jsonb(v_bosh));
end $f$;

create or replace function public.t2_username_sozlama_v1(p_actor_id bigint, p_telefon_qidiruv text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  if not public._t2_actor_faol_v1(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  if p_telefon_qidiruv is null or p_telefon_qidiruv not in ('hammasi','kompaniyadosh','hech') then return jsonb_build_object('ok', false, 'code', 'SOZLAMA_NOTOGRI'); end if;
  update public.t2_foydalanuvchi set telefon_qidiruv = p_telefon_qidiruv where id = p_actor_id;
  return jsonb_build_object('ok', true, 'telefon_qidiruv', p_telefon_qidiruv);
end $f$;

-- ───────── 5. qidiruv ─────────
-- Aniq moslik (username | telefon | email — turi avtomatik). Javob: id, ism, username, avatar_rang. Telefon/email qaytmaydi.
create or replace function public.t2_foydalanuvchi_qidir_v1(p_actor_id bigint, p_qiymat text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_tur text; v_id bigint; v_limit boolean;
begin
  if not public._t2_actor_faol_v1(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  select o_tur, o_id into v_tur, v_id from public._t2_foydalanuvchi_qidir_ichki_v1(p_actor_id, p_qiymat);
  if v_tur = 'username' then v_limit := public._t2_kirish_limit_v1('qidiruv_un', p_actor_id::text, interval '1 hour', 120);
  else v_limit := public._t2_kirish_limit_v1('qidiruv_tel', p_actor_id::text, interval '1 hour', 30); end if;
  if not v_limit then return jsonb_build_object('ok', false, 'code', 'LIMIT'); end if;
  insert into public.t2_qidiruv_log (actor_id, tur, topildi) values (p_actor_id, v_tur, v_id is not null);
  if v_id is null then return jsonb_build_object('ok', true, 'topildi', false, 'tur', v_tur); end if;
  return jsonb_build_object('ok', true, 'topildi', true, 'tur', v_tur, 'profil', public._t2_profil_min_v1(v_id));
end $f$;

-- Autocomplete: FAQAT o'z kompaniyadoshlari orasida prefiks (ism yoki username), kamida 2 belgi, 8 tagacha. Begonalar orasida prefiks qidiruvi yo'q (enumeration).
create or replace function public.t2_foydalanuvchi_kompaniyadosh_qidir_v1(p_actor_id bigint, p_prefiks text, p_kompaniya_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare v_p text := lower(regexp_replace(btrim(coalesce(p_prefiks,'')), '^@+', '')); v_r jsonb;
begin
  if not public._t2_actor_faol_v1(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  if length(v_p) < 2 or length(v_p) > 32 then return jsonb_build_object('ok', true, 'royxat', '[]'::jsonb); end if;
  v_p := replace(replace(replace(v_p, '\', '\\'), '%', '\%'), '_', '\_');
  select coalesce(jsonb_agg(public._t2_profil_min_v1(x.id)), '[]'::jsonb) into v_r from (
    select distinct u.id from public.t2_azolik a join public.t2_azolik b on b.kompaniya_id = a.kompaniya_id and b.holat = 'faol'
      join public.t2_foydalanuvchi u on u.id = b.foydalanuvchi_id and coalesce(u.holat,'faol') = 'faol'
     where a.foydalanuvchi_id = p_actor_id and a.holat = 'faol' and u.id <> p_actor_id
       and (p_kompaniya_id is null or a.kompaniya_id = p_kompaniya_id)
       and (lower(coalesce(u.username,'')) like v_p || '%' escape '\' or lower(coalesce(u.ism,'')) like '%' || v_p || '%' escape '\')
     order by u.id limit 8) x;
  return jsonb_build_object('ok', true, 'royxat', v_r);
end $f$;

-- A'zolar ro'yxatida @username ko'rsatish uchun: id -> username (faqat kompaniyadoshlar; boshqalar uchun yo'q).
create or replace function public.t2_username_ommaviy_v1(p_actor_id bigint, p_idlar bigint[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare v_r jsonb;
begin
  if not public._t2_actor_faol_v1(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  select coalesce(jsonb_object_agg(u.id::text, u.username), '{}'::jsonb) into v_r
    from public.t2_foydalanuvchi u
   where u.id = any (coalesce(p_idlar[1:200], '{}'::bigint[])) and u.username is not null and public._t2_azo_kompaniyadosh_v1(p_actor_id, u.id);
  return jsonb_build_object('ok', true, 'username', v_r);
end $f$;

-- ───────── 6. @username / telefon / email orqali KOMPANIYAGA TAKLIF (kutiladi; maqsad qabul qilmaguncha a'zo bo'lmaydi) ─────────
create or replace function public.t2_kompaniya_taklif_yubor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_qiymat text, p_rol text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_prev jsonb; v_huquq text; v_tur text; v_id bigint; v_tid bigint; v_res jsonb; v_tel text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id and actor_id = p_actor_id and command = 'kompaniya_taklif_yubor';
  if found then return v_prev; end if;
  if not public._t2_actor_faol_v1(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  v_huquq := public._t2_kirish_taklif_huquq_v1(p_actor_id, p_kompaniya_id);
  if v_huquq is distinct from 'boshqaruv' then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if p_rol is null or p_rol not in ('rahbar','bugalter','pto','prorab','buyurtmachi','pudratchi','kuzatuvchi') then return jsonb_build_object('ok', false, 'code', 'ROL_NOTOGRI'); end if;
  if not exists (select 1 from public.t2_kompaniya where id = p_kompaniya_id and faol) then return jsonb_build_object('ok', false, 'code', 'COMPANY_NOT_FOUND'); end if;
  if not public._t2_kirish_limit_v1('taklif_un', p_actor_id::text, interval '1 hour', 60) then return jsonb_build_object('ok', false, 'code', 'LIMIT'); end if;
  select o_tur, o_id into v_tur, v_id from public._t2_foydalanuvchi_qidir_ichki_v1(p_actor_id, p_qiymat);
  if v_tur = 'noaniq' then return jsonb_build_object('ok', false, 'code', 'QIYMAT_NOTOGRI'); end if;
  insert into public.t2_qidiruv_log (actor_id, tur, topildi) values (p_actor_id, v_tur, v_id is not null);
  if v_id is null then
    -- Hisob yo'q (yoki yashirin): telefon bo'lsa — mavjud «kirish-taklif» (havola/kod) oqimiga o'tish mumkin; telefonni faqat so'rovchi yozganicha normallashtirib qaytaramiz.
    v_tel := case when v_tur = 'telefon' then public.t2_telefon_norm_v1(p_qiymat) end;
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'tur', v_tur, 'telefon_taklif', v_tur = 'telefon', 'telefon', v_tel);
  end if;
  if exists (select 1 from public.t2_azolik where foydalanuvchi_id = v_id and kompaniya_id = p_kompaniya_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'ALREADY_MEMBER'); end if;
  update public.t2_kompaniya_taklif set holat = 'muddati_otdi' where kompaniya_id = p_kompaniya_id and taklif_qilingan_id = v_id and holat = 'kutmoqda' and tugaydi <= now();
  insert into public.t2_kompaniya_taklif (kompaniya_id, taklif_qilingan_id, taklif_qiluvchi_id, rol) values (p_kompaniya_id, v_id, p_actor_id, p_rol)
    on conflict (kompaniya_id, taklif_qilingan_id) where holat = 'kutmoqda' do update set rol = excluded.rol, tugaydi = now() + interval '14 days', taklif_qiluvchi_id = excluded.taklif_qiluvchi_id
    returning id into v_tid;
  perform public.t2_audit_yoz(p_kompaniya_id, 'kompaniya_taklif_yubor', 'onboarding', null, format('taklif=%s rol=%s tur=%s', v_tid, p_rol, v_tur), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'taklif_id', v_tid, 'holat', 'kutmoqda', 'profil', public._t2_profil_min_v1(v_id));
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'kompaniya_taklif_yubor', v_res);
  return v_res;
end $f$;

create or replace function public.t2_kompaniya_taklif_royxat_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare v_r jsonb;
begin
  if not public._t2_actor_faol_v1(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kompaniya_id', t.kompaniya_id, 'kompaniya_nom', k.nom, 'rol', t.rol, 'tugaydi', t.tugaydi,
           'taklif_qiluvchi', public._t2_profil_min_v1(t.taklif_qiluvchi_id)) order by t.yaratildi desc), '[]'::jsonb) into v_r
    from public.t2_kompaniya_taklif t join public.t2_kompaniya k on k.id = t.kompaniya_id
   where t.taklif_qilingan_id = p_actor_id and t.holat = 'kutmoqda' and t.tugaydi > now() and k.faol;
  return jsonb_build_object('ok', true, 'royxat', v_r);
end $f$;

create or replace function public.t2_kompaniya_taklif_javob_v1(p_actor_id bigint, p_taklif_id bigint, p_qabul boolean, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_prev jsonb; t public.t2_kompaniya_taklif%rowtype; v_az bigint; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id and actor_id = p_actor_id and command = 'taklif_javob';
  if found then return v_prev; end if;
  if not public._t2_actor_faol_v1(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  select * into t from public.t2_kompaniya_taklif where id = p_taklif_id and taklif_qilingan_id = p_actor_id for update;
  if not found or t.holat <> 'kutmoqda' then return jsonb_build_object('ok', false, 'code', 'TAKLIF_TOPILMADI'); end if;
  if t.tugaydi <= now() then update public.t2_kompaniya_taklif set holat = 'muddati_otdi' where id = t.id; return jsonb_build_object('ok', false, 'code', 'TAKLIF_MUDDATI_OTGAN'); end if;
  if coalesce(p_qabul, false) then
    -- Taklif qiluvchi hali ham shu kompaniya direktori bo'lishi shart (huquqi olingan bo'lsa taklif yaroqsiz).
    if public._t2_kirish_taklif_huquq_v1(t.taklif_qiluvchi_id, t.kompaniya_id) is distinct from 'boshqaruv'
       or not exists (select 1 from public.t2_kompaniya where id = t.kompaniya_id and faol) then
      update public.t2_kompaniya_taklif set holat = 'bekor', javob_vaqti = now() where id = t.id;
      return jsonb_build_object('ok', false, 'code', 'TAKLIF_YAROQSIZ');
    end if;
    select id into v_az from public.t2_azolik where foydalanuvchi_id = p_actor_id and kompaniya_id = t.kompaniya_id order by case when holat = 'faol' then 0 else 1 end, id limit 1 for update;
    if v_az is null then
      insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (p_actor_id, t.kompaniya_id, t.rol, 'faol') returning id into v_az;
    else
      update public.t2_azolik set rol = case when holat = 'faol' then rol else t.rol end, holat = 'faol' where id = v_az;
    end if;
    update public.t2_kompaniya_taklif set holat = 'qabul', javob_vaqti = now() where id = t.id;
    perform public.t2_audit_yoz(t.kompaniya_id, 'taklif_qabul', 'onboarding', null, format('taklif=%s azolik=%s rol=%s', t.id, v_az, t.rol), 'actor:' || p_actor_id, null);
    v_res := jsonb_build_object('ok', true, 'holat', 'qabul', 'kompaniya_id', t.kompaniya_id, 'azolik_id', v_az, 'rol', t.rol);
  else
    update public.t2_kompaniya_taklif set holat = 'rad', javob_vaqti = now() where id = t.id;
    v_res := jsonb_build_object('ok', true, 'holat', 'rad');
  end if;
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'taklif_javob', v_res);
  return v_res;
end $f$;

-- ───────── 7. huquqlar (faqat service_role) ─────────
revoke all on function public._t2_username_xato_v1(text), public._t2_username_norm_v1(text), public._t2_azo_kompaniyadosh_v1(bigint,bigint), public._t2_username_ushlangan_v1(text,bigint),
  public._t2_foydalanuvchi_qidir_ichki_v1(bigint,text), public._t2_profil_min_v1(bigint), public._t2_actor_faol_v1(bigint),
  public.t2_username_ol_v1(bigint), public.t2_username_belgila_v1(bigint,text,uuid), public.t2_username_tekshir_v1(bigint,text,text[]),
  public.t2_username_sozlama_v1(bigint,text), public.t2_foydalanuvchi_qidir_v1(bigint,text), public.t2_foydalanuvchi_kompaniyadosh_qidir_v1(bigint,text,bigint),
  public.t2_username_ommaviy_v1(bigint,bigint[]), public.t2_kompaniya_taklif_yubor_v1(bigint,bigint,text,text,uuid),
  public.t2_kompaniya_taklif_royxat_v1(bigint), public.t2_kompaniya_taklif_javob_v1(bigint,bigint,boolean,uuid) from public, anon, authenticated;
grant execute on function public._t2_username_xato_v1(text), public._t2_username_norm_v1(text), public._t2_azo_kompaniyadosh_v1(bigint,bigint), public._t2_username_ushlangan_v1(text,bigint),
  public._t2_foydalanuvchi_qidir_ichki_v1(bigint,text), public._t2_profil_min_v1(bigint), public._t2_actor_faol_v1(bigint),
  public.t2_username_ol_v1(bigint), public.t2_username_belgila_v1(bigint,text,uuid), public.t2_username_tekshir_v1(bigint,text,text[]),
  public.t2_username_sozlama_v1(bigint,text), public.t2_foydalanuvchi_qidir_v1(bigint,text), public.t2_foydalanuvchi_kompaniyadosh_qidir_v1(bigint,text,bigint),
  public.t2_username_ommaviy_v1(bigint,bigint[]), public.t2_kompaniya_taklif_yubor_v1(bigint,bigint,text,text,uuid),
  public.t2_kompaniya_taklif_royxat_v1(bigint), public.t2_kompaniya_taklif_javob_v1(bigint,bigint,boolean,uuid) to service_role;

notify pgrst, 'reload schema';
