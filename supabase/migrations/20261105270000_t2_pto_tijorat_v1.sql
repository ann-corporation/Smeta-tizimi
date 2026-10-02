-- T2-PTO-TIJORAT-001 — sotiladigan PTO: token (kredit) daftari, narxlar, tariflar, obuna, o'zi ro'yxatdan o'tish, demo.
-- Egasi (2026-10-02): "pulga foydalanuvchi token oladi; fayllar va AI shu token bilan; tashqaridan kiradigan odam
-- mening aralashuvimsiz demoda sinab ko'ra olishi kerak". Batafsil model: Obsidian BUSINESS_MODEL "TOKEN TIZIMI".
-- Qonunlar: daftar O'ZGARMAS (faqat INSERT), operation_id idempotent, minus balans yo'q, kompaniya — tenant.

begin;

-- ═══ 1. Narxlar, tariflar ═══
create table if not exists public.t2_token_narx (
  amal text primary key,
  nom text not null,
  tur text not null check (tur in ('qatiy', 'yacheyka', 'ai')),
  narx numeric(12,4) not null check (narx >= 0),          -- qatiy: 1 marta; qator: har `birlik` qatorga; ai: 1000 LLM token uchun
  birlik integer not null default 1 check (birlik > 0),
  minimum numeric(12,2) not null default 0,
  faol boolean not null default true,
  yangilandi timestamptz not null default now());
alter table public.t2_token_narx enable row level security;
revoke all on public.t2_token_narx from anon, authenticated;
insert into public.t2_token_narx(amal, nom, tur, narx, birlik, minimum) values
  -- Egasi 2026-10-02: fayl/hujjat narxi — ishlangan YACHEYKALAR soniga ko'ra (qiymat yoki formulali kataklar).
  ('smeta_import',   'Smeta import (ABC/TN, LRV/RES)', 'yacheyka', 1, 500, 1),
  ('f2_import',      'F2 import',                      'yacheyka', 1, 500, 1),
  ('katalog_import', 'Katalog import',                 'yacheyka', 1, 5000, 1),
  ('f2_qoralama',    'F2 qoralama yaratish',           'yacheyka', 1, 500, 1),
  ('hujjat',         'Hujjat (Excel / ko''rish)',      'yacheyka', 1, 500, 1),
  ('ai_kirish',      'AI — kiruvchi (1000 LLM token)', 'ai', 1.2, 1000, 0),
  ('ai_chiqish',     'AI — chiquvchi (1000 LLM token)','ai', 5.7, 1000, 0)
on conflict (amal) do nothing;

create table if not exists public.t2_tarif (
  kod text primary key, nom text not null, oylik_token numeric(12,2) not null, narx_som numeric(14,2) not null,
  faol boolean not null default true, tartib int not null default 0);
alter table public.t2_tarif enable row level security;
revoke all on public.t2_tarif from anon, authenticated;
insert into public.t2_tarif(kod, nom, oylik_token, narx_som, tartib) values
  ('free', 'Bepul (sinash)', 300, 0, 0),
  ('pto_start', 'PTO Start', 1500, 99000, 1),
  ('pto_pro', 'PTO Pro', 4500, 249000, 2),
  ('pto_expert', 'PTO Expert', 10000, 449000, 3)
on conflict (kod) do nothing;

create table if not exists public.t2_obuna (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  tarif_kod text not null references public.t2_tarif(kod),
  boshlandi date not null default current_date, tugaydi date,
  holat text not null default 'faol' check (holat in ('faol', 'tugagan', 'bekor')),
  kim text, yaratildi timestamptz not null default now());
create index if not exists t2_obuna_komp_idx on public.t2_obuna(kompaniya_id, holat);
alter table public.t2_obuna enable row level security;
revoke all on public.t2_obuna from anon, authenticated;

-- ═══ 2. Daftar (ledger) — faqat INSERT ═══
create table if not exists public.t2_token_harakat (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  foydalanuvchi_id bigint,
  miqdor numeric(14,2) not null check (miqdor <> 0),
  tur text not null check (tur in ('oylik', 'toldirish', 'bonus', 'sarf', 'qaytarish', 'tuzatish')),
  amal text, birlik_soni numeric(14,2), izoh text, meta jsonb not null default '{}'::jsonb,
  operation_id uuid not null unique,
  bogliq_operation_id uuid,                                    -- qaytarish: qaysi sarf
  yaratildi timestamptz not null default now());
create index if not exists t2_token_harakat_komp_idx on public.t2_token_harakat(kompaniya_id, yaratildi desc);
create unique index if not exists t2_token_qaytarish_bir_marta on public.t2_token_harakat(bogliq_operation_id) where tur = 'qaytarish';
alter table public.t2_token_harakat enable row level security;
revoke all on public.t2_token_harakat from anon, authenticated;

create or replace function public.t2_token_harakat_ozgarmas_trg() returns trigger language plpgsql as $$
begin raise exception 'TOKEN_DAFTAR_OZGARMAS: token daftari faqat yoziladi (tuzatish — yangi harakat bilan)'; end $$;
drop trigger if exists t2_token_harakat_ozgarmas on public.t2_token_harakat;
create trigger t2_token_harakat_ozgarmas before update or delete on public.t2_token_harakat
  for each row execute function public.t2_token_harakat_ozgarmas_trg();

create or replace function public.t2_token_balans(p_kompaniya_id bigint) returns numeric
language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(miqdor), 0) from public.t2_token_harakat where kompaniya_id = p_kompaniya_id $$;

/* Narx hisobi (sof): qatiy — narx; qator — max(minimum, ceil(n / birlik) × narx); ai — ceil(n / 1000 × narx). */
create or replace function public.t2_token_hisobla(p_amal text, p_birlik_soni numeric) returns numeric
language plpgsql stable set search_path = public, pg_temp as $$
declare v public.t2_token_narx%rowtype;
begin
  select * into v from public.t2_token_narx where amal = p_amal and faol;
  if not found then return null; end if;
  if v.tur = 'qatiy' then return v.narx; end if;
  if v.tur = 'yacheyka' then return greatest(v.minimum, ceil(greatest(coalesce(p_birlik_soni, 0), 0) / v.birlik) * v.narx); end if;
  return greatest(v.minimum, ceil(greatest(coalesce(p_birlik_soni, 0), 0) / v.birlik * v.narx * 100) / 100);
end $$;

-- ═══ 3. O'qish: balans, tarif, narxlar, oxirgi harakatlar ═══
create or replace function public.t2_token_holat_v1(p_kompaniya_id bigint, p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  return jsonb_build_object(
    'balans', public.t2_token_balans(p_kompaniya_id),
    'obuna', (select jsonb_build_object('tarif', o.tarif_kod, 'nom', t.nom, 'oylik_token', t.oylik_token, 'boshlandi', o.boshlandi, 'tugaydi', o.tugaydi)
                from public.t2_obuna o join public.t2_tarif t on t.kod = o.tarif_kod
               where o.kompaniya_id = p_kompaniya_id and o.holat = 'faol' order by o.id desc limit 1),
    'tariflar', (select coalesce(jsonb_agg(jsonb_build_object('kod', kod, 'nom', nom, 'oylik_token', oylik_token, 'narx_som', narx_som) order by tartib), '[]'::jsonb) from public.t2_tarif where faol),
    'narxlar', (select coalesce(jsonb_agg(jsonb_build_object('amal', amal, 'nom', nom, 'tur', tur, 'narx', narx, 'birlik', birlik, 'minimum', minimum) order by amal), '[]'::jsonb) from public.t2_token_narx where faol),
    'harakatlar', (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('id', h.id, 'miqdor', h.miqdor, 'tur', h.tur, 'amal', h.amal, 'birlik_soni', h.birlik_soni, 'izoh', h.izoh, 'yaratildi', h.yaratildi) x
          from public.t2_token_harakat h where h.kompaniya_id = p_kompaniya_id order by h.id desc limit 100) q),
    'superadmin', public.t2_platforma_superadmin(p_actor_id),
    'demo_obyekt_id', (select obyekt_id from public.t2_demo_manba where id = 1));
end $$;

-- ═══ 4. Sarf (atomik, idempotent, minus yo'q) ═══
create or replace function public.t2_token_sarfla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_amal text, p_birlik_soni numeric,
  p_operation_id uuid, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev public.t2_token_harakat%rowtype; v_narx numeric; v_balans numeric;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select * into v_prev from public.t2_token_harakat where operation_id = p_operation_id;
  if found then
    if v_prev.kompaniya_id <> p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_BAND'); end if;
    return jsonb_build_object('ok', true, 'takror', true, 'sarflandi', -v_prev.miqdor, 'balans', public.t2_token_balans(p_kompaniya_id));
  end if;
  v_narx := public.t2_token_hisobla(p_amal, p_birlik_soni);
  if v_narx is null then return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_token:' || p_kompaniya_id, 0));
  v_balans := public.t2_token_balans(p_kompaniya_id);
  if v_narx > 0 and v_balans < v_narx then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_YETMAYDI', 'kerak', v_narx, 'balans', v_balans);
  end if;
  if v_narx > 0 then
    insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, birlik_soni, meta, operation_id)
    values (p_kompaniya_id, p_actor_id, -v_narx, 'sarf', p_amal, p_birlik_soni, coalesce(p_meta, '{}'::jsonb), p_operation_id);
  end if;
  return jsonb_build_object('ok', true, 'sarflandi', v_narx, 'balans', v_balans - v_narx);
end $$;

/* Amal muvaffaqiyatsiz bo'lsa — o'z sarfini bir marta qaytarish (faqat 24 soat ichida, faqat o'z kompaniyasi). */
create or replace function public.t2_token_qaytar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sarf_operation_id uuid, p_operation_id uuid, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sarf public.t2_token_harakat%rowtype;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if exists (select 1 from public.t2_token_harakat where operation_id = p_operation_id) then return jsonb_build_object('ok', true, 'takror', true); end if;
  select * into v_sarf from public.t2_token_harakat where operation_id = p_sarf_operation_id and kompaniya_id = p_kompaniya_id and tur = 'sarf';
  if not found then return jsonb_build_object('ok', false, 'code', 'SARF_TOPILMADI'); end if;
  if v_sarf.yaratildi < now() - interval '24 hours' then return jsonb_build_object('ok', false, 'code', 'MUDDAT_OTGAN'); end if;
  if exists (select 1 from public.t2_token_harakat where bogliq_operation_id = p_sarf_operation_id and tur = 'qaytarish') then
    return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_QAYTARILGAN');
  end if;
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, izoh, operation_id, bogliq_operation_id)
  values (p_kompaniya_id, p_actor_id, -v_sarf.miqdor, 'qaytarish', v_sarf.amal, left(coalesce(p_sabab, ''), 300), p_operation_id, p_sarf_operation_id);
  return jsonb_build_object('ok', true, 'qaytarildi', -v_sarf.miqdor, 'balans', public.t2_token_balans(p_kompaniya_id));
end $$;

-- ═══ 5. Superadmin: to'ldirish va obuna (to'lov qo'lda tasdiqlanadi) ═══
create or replace function public.t2_token_toldir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_miqdor numeric, p_tur text, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'SUPERADMIN_KERAK'); end if;
  if exists (select 1 from public.t2_token_harakat where operation_id = p_operation_id) then return jsonb_build_object('ok', true, 'takror', true); end if;
  if p_tur not in ('toldirish', 'bonus', 'tuzatish') or p_miqdor is null or p_miqdor = 0 then return jsonb_build_object('ok', false, 'code', 'NOTOGRI_MIQDOR'); end if;
  if p_tur <> 'tuzatish' and p_miqdor < 0 then return jsonb_build_object('ok', false, 'code', 'NOTOGRI_MIQDOR'); end if;
  if nullif(btrim(coalesce(p_izoh, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'IZOH_MAJBURIY'); end if;
  if not exists (select 1 from public.t2_kompaniya where id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_YOQ'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_token:' || p_kompaniya_id, 0));
  if p_miqdor < 0 and public.t2_token_balans(p_kompaniya_id) + p_miqdor < 0 then return jsonb_build_object('ok', false, 'code', 'BALANS_MINUS'); end if;
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, izoh, operation_id)
  values (p_kompaniya_id, p_actor_id, p_miqdor, p_tur, left(p_izoh, 500), p_operation_id);
  perform public.t2_audit_yoz(p_kompaniya_id, 'token_' || p_tur, 'token', null, format('miqdor=%s izoh=%s', p_miqdor, left(p_izoh, 200)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'balans', public.t2_token_balans(p_kompaniya_id));
end $$;

create or replace function public.t2_obuna_belgila_v1(p_actor_id bigint, p_kompaniya_id bigint, p_tarif_kod text, p_oylar int, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t public.t2_tarif%rowtype;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'SUPERADMIN_KERAK'); end if;
  if exists (select 1 from public.t2_token_harakat where operation_id = p_operation_id) then return jsonb_build_object('ok', true, 'takror', true); end if;
  select * into v_t from public.t2_tarif where kod = p_tarif_kod and faol;
  if not found then return jsonb_build_object('ok', false, 'code', 'TARIF_YOQ'); end if;
  if p_oylar is null or p_oylar < 1 or p_oylar > 24 then return jsonb_build_object('ok', false, 'code', 'OYLAR_1_24'); end if;
  update public.t2_obuna set holat = 'tugagan' where kompaniya_id = p_kompaniya_id and holat = 'faol';
  insert into public.t2_obuna(kompaniya_id, tarif_kod, boshlandi, tugaydi, kim)
  values (p_kompaniya_id, p_tarif_kod, current_date, (current_date + make_interval(months => p_oylar))::date, 'actor:' || p_actor_id);
  if v_t.oylik_token > 0 then
    insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, izoh, operation_id)
    values (p_kompaniya_id, p_actor_id, v_t.oylik_token, 'oylik', v_t.nom || ' — 1-oy', p_operation_id);
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'obuna_belgila', 'token', null, format('tarif=%s oylar=%s', p_tarif_kod, p_oylar), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'balans', public.t2_token_balans(p_kompaniya_id));
end $$;

-- ═══ 6. O'zi ro'yxatdan o'tish + demo ═══
create table if not exists public.t2_ozi_royxat_log (
  id bigint generated always as identity primary key, ip_belgi text, foydalanuvchi_id bigint, kompaniya_id bigint,
  operation_id uuid unique, yaratildi timestamptz not null default now());
create index if not exists t2_ozi_royxat_ip_idx on public.t2_ozi_royxat_log(ip_belgi, yaratildi);
alter table public.t2_ozi_royxat_log enable row level security;
revoke all on public.t2_ozi_royxat_log from anon, authenticated;

/* Demo manbasi — egasi tanlaydi (real loyiha narxlari begonalarga ko'rinmasligi uchun sukut — YO'Q). */
create table if not exists public.t2_demo_manba (id int primary key default 1 check (id = 1), obyekt_id bigint references public.t2_obyekt(id), yangilandi timestamptz not null default now());
alter table public.t2_demo_manba enable row level security;
revoke all on public.t2_demo_manba from anon, authenticated;

create or replace function public._t2_demo_nusxa(p_kompaniya_id bigint, p_manba_obyekt_id bigint) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_loyiha bigint; v_obyekt bigint; v_nom text;
begin
  select nom into v_nom from public.t2_obyekt where id = p_manba_obyekt_id;
  if v_nom is null then return null; end if;
  insert into public.t2_loyiha(kompaniya_id, nom, izoh) values (p_kompaniya_id, 'Demo loyiha', 'Sinash uchun namuna') returning id into v_loyiha;
  insert into public.t2_obyekt(nom, kompaniya_id, loyiha_id, izoh) values ('DEMO — ' || v_nom, p_kompaniya_id, v_loyiha, 'Namuna smeta: bemalol sinab ko''ring') returning id into v_obyekt;
  create temp table _demo_map on commit drop as
    select q.id eski, nextval(pg_get_serial_sequence('public.t2_qator', 'id')) yangi from public.t2_qator q where q.obyekt_id = p_manba_obyekt_id;
  insert into public.t2_qator(id, obyekt_id, kompaniya_id, ota_id, daraja, tartib, tur, kod, nom, birlik, hajm, narx, kat, summa, narx_usul, d1, d2, d3, nom_key, birlik_key, norma, raqam)
  overriding system value
  select m.yangi, v_obyekt, p_kompaniya_id, mo.yangi, q.daraja, q.tartib, q.tur, q.kod, q.nom, q.birlik, q.hajm, q.narx, q.kat, q.summa, q.narx_usul, q.d1, q.d2, q.d3, q.nom_key, q.birlik_key, q.norma, q.raqam
    from public.t2_qator q join _demo_map m on m.eski = q.id left join _demo_map mo on mo.eski = q.ota_id
   where q.obyekt_id = p_manba_obyekt_id and q.qoshimcha is not true
   order by q.daraja, q.id;
  return v_obyekt;
end $$;

create or replace function public.t2_ozi_royxat_v1(p_login text, p_parol text, p_ism text, p_telefon text, p_kompaniya_nom text, p_ip_belgi text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_login text := lower(btrim(coalesce(p_login, ''))); v_uid bigint; v_k jsonb; v_kid bigint; v_demo bigint; v_manba bigint; v_prev public.t2_ozi_royxat_log%rowtype;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_prev from public.t2_ozi_royxat_log where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'login', v_login, 'kompaniya_id', v_prev.kompaniya_id); end if;
  if v_login !~ '^[a-z0-9][a-z0-9_.-]{2,39}$' then return jsonb_build_object('ok', false, 'code', 'LOGIN_NOTOGRI', 'xabar', 'Login 3–40 belgi: lotin harf, raqam, _ . -'); end if;
  if length(coalesce(p_parol, '')) < 8 then return jsonb_build_object('ok', false, 'code', 'PAROL_QISQA', 'xabar', 'Parol kamida 8 belgi'); end if;
  if length(btrim(coalesce(p_ism, ''))) < 2 then return jsonb_build_object('ok', false, 'code', 'ISM_KERAK'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ozi_royxat', 0));
  if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = p_ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu qurilmadan bugun ro''yxatdan o''tish limiti tugadi. Ertaga urinib ko''ring.');
  end if;
  if exists (select 1 from public.t2_foydalanuvchi where lower(login) = v_login) then return jsonb_build_object('ok', false, 'code', 'LOGIN_BAND', 'xabar', 'Bu login band'); end if;
  insert into public.t2_foydalanuvchi(login, ism, holat, parol_hash, parol_yangilandi)
  values (v_login, btrim(p_ism), 'faol', extensions.crypt(p_parol, extensions.gen_salt('bf', 10)), now()) returning id into v_uid;
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

/* Superadmin demo manbasini tanlaydi (null — demo yo'q). Diqqat: tanlangan obyekt smetasi har yangi foydalanuvchiga nusxalanadi. */
create or replace function public.t2_demo_manba_belgila_v1(p_actor_id bigint, p_obyekt_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'SUPERADMIN_KERAK'); end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt where id = p_obyekt_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ'); end if;
  insert into public.t2_demo_manba(id, obyekt_id, yangilandi) values (1, p_obyekt_id, now())
  on conflict (id) do update set obyekt_id = excluded.obyekt_id, yangilandi = now();
  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id);
end $$;
revoke all on function public.t2_demo_manba_belgila_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_demo_manba_belgila_v1(bigint, bigint) to service_role;

-- ═══ 6b. Mavjud kompaniyalar: token joriy qilingan kuni ish to'xtamasligi uchun boshlang'ich bonus (idempotent) ═══
insert into public.t2_token_harakat(kompaniya_id, miqdor, tur, izoh, operation_id)
select k.id, 10000, 'bonus', 'Mavjud kompaniya — boshlang''ich bonus (token tizimi joriy qilindi, 2026-10-02)', md5('t2_token_boshlangich:' || k.id)::uuid
  from public.t2_kompaniya k
on conflict (operation_id) do nothing;

-- ═══ 7. Huquqlar — faqat service_role (server shlyuzlari) ═══
revoke all on function public.t2_token_holat_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_token_sarfla_v1(bigint, bigint, text, numeric, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.t2_token_qaytar_v1(bigint, bigint, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.t2_token_toldir_v1(bigint, bigint, numeric, text, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_obuna_belgila_v1(bigint, bigint, text, int, uuid) from public, anon, authenticated;
revoke all on function public.t2_ozi_royxat_v1(text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public._t2_demo_nusxa(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_token_balans(bigint) from public, anon, authenticated;
revoke all on function public.t2_token_hisobla(text, numeric) from public, anon, authenticated;
grant execute on function public.t2_token_holat_v1(bigint, bigint) to service_role;
grant execute on function public.t2_token_sarfla_v1(bigint, bigint, text, numeric, uuid, jsonb) to service_role;
grant execute on function public.t2_token_qaytar_v1(bigint, bigint, uuid, uuid, text) to service_role;
grant execute on function public.t2_token_toldir_v1(bigint, bigint, numeric, text, text, uuid) to service_role;
grant execute on function public.t2_obuna_belgila_v1(bigint, bigint, text, int, uuid) to service_role;
grant execute on function public.t2_ozi_royxat_v1(text, text, text, text, text, text, uuid) to service_role;

commit;
