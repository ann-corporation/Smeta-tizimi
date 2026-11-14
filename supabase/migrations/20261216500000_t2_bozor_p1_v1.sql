-- T2 BOZOR — Phase 1 (docs/architecture/BOZOR_TENDER_LOGISTIKA.md §A, §G). ADDITIVE: mavjud t2_* jadval/RPC larga tegilmaydi.
-- Ochiq qatlam yopiq yetkazuvchi oqimi ustida: sotuvchi = FOYDALANUVCHI (kompaniyasiz «yakka» ham mumkin, t2_bz_profil), xaridor = kompaniya a'zosi.
-- Jadvallar (hammasi RLS yoqilgan, anon/authenticated ga yopiq; faqat service_role RPC orqali — /api/bozor va /api/bozor-ochiq shlyuzlari):
--   t2_bz_sozlama (monetizatsiya/moderatsiya, default OFF), t2_bz_profil, t2_bz_elon (tovar|xizmat|ijara), t2_bz_sorov (bir bosishda narx so'rash),
--   t2_bz_taklif, t2_bz_shikoyat, t2_bz_audit, t2_reyting_baho (UMUMIY reyting: bozor|tender|yuk — keyingi mahsulotlar shu jadvaldan foydalanadi).
-- Pul: narx QQS SIZ (birlik); qqs_bor faqat yorliq. NULL = noma'lum (0 emas).
-- G'olib tanlash: BITTA tranzaksiyada — taklif tanlanadi, qolganlari rad; sotuvchida kompaniya bo'lsa mavjud t2_buyurtma_yarat_v1 (aloqa 'bozor' bo'lmasa
--   ochiq so'rovga javob sifatida yaratiladi), narx manbasi t2_narx_manba_yoz_v1 (tur 'kp') — bir nechta taklif bo'lsa O'RTACHA arifmetik (QQS siz) + ogohlantirish.
--   Material buyurtmasi uchun mavjud t2_buyurtma_narx_manba_trg ham g'olib narxini manba qiladi (o'zgartirilmagan mexanizm).
-- Prodga: AVVAL shu SQL prodda (BEGIN..ROLLBACK acceptance bilan), KEYIN PR merge. Rollback: .rollback.sql. BEGIN/COMMIT yo'q.
set local statement_timeout = '300s';

-- 1. Sozlamalar (default OFF)
create table if not exists public.t2_bz_sozlama (
  kalit text primary key check (kalit ~ '^[a-z_]{2,60}$'),
  qiymat jsonb not null,
  izoh text,
  yangilandi timestamptz not null default now()
);
insert into public.t2_bz_sozlama (kalit, qiymat, izoh) values
  ('boost_yoqilgan', 'false'::jsonb, 'E''lonni yuqoriga chiqarish (boost) — pul YECHILMAYDI, faqat ma''lumot tayyor'),
  ('boost_token_narx', '0'::jsonb, 'Boost narxi (token); boost_yoqilgan=false bo''lsa ishlatilmaydi'),
  ('komissiya_yoqilgan', 'false'::jsonb, 'Yopilgan bitimdan komissiya — hozir YECHILMAYDI'),
  ('komissiya_foiz', '0'::jsonb, 'Komissiya foizi (komissiya_yoqilgan=true bo''lganda)'),
  ('taqiqlangan_sozlar', '[]'::jsonb, 'E''lon matnida taqiqlangan so''zlar (kichik harf, massiv)'),
  ('shikoyat_chegara', '3'::jsonb, 'Shuncha alohida shikoyatdan keyin e''lon avtomatik yashiriladi'),
  ('hujjat_token', 'true'::jsonb, 'Hujjat/paket/eksport natijasi mavjud token yo''li bilan yechiladi (bepul qilinmaydi)')
on conflict (kalit) do nothing;

-- 2. Sotuvchi profili (vitrina). kompaniya_id bo'sh = yakka shaxs
create table if not exists public.t2_bz_profil (
  foydalanuvchi_id bigint primary key references public.t2_foydalanuvchi(id),
  kompaniya_id bigint references public.t2_kompaniya(id),
  tur text not null default 'yakka' check (tur in ('yakka', 'firma', 'usta')),
  nom text not null check (length(btrim(nom)) between 2 and 120),
  telefon text check (telefon is null or length(telefon) <= 30),
  hudud text check (hudud is null or length(hudud) <= 80),
  tavsif text check (tavsif is null or length(tavsif) <= 1000),
  holat text not null default 'faol' check (holat in ('faol', 'bloklangan')),
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);

-- 3. E'lon: tovar | xizmat (ish, usta) | ijara (texnika)
create table if not exists public.t2_bz_elon (
  id bigint generated always as identity primary key,
  sotuvchi_id bigint not null references public.t2_bz_profil(foydalanuvchi_id),
  tur text not null check (tur in ('tovar', 'xizmat', 'ijara')),
  holat text not null default 'qoralama' check (holat in ('qoralama', 'faol', 'toxtatilgan', 'yashirin')),
  sarlavha text not null check (length(btrim(sarlavha)) between 3 and 160),
  tavsif text check (tavsif is null or length(tavsif) <= 2000),
  kategoriya text check (kategoriya is null or kategoriya ~ '^[a-z0-9_]{2,40}$'),
  pozitsiya_kodi text check (pozitsiya_kodi is null or length(pozitsiya_kodi) <= 60),
  birlik text not null check (length(btrim(birlik)) between 1 and 40),
  narx_qqs_siz numeric(18, 2) check (narx_qqs_siz is null or narx_qqs_siz > 0),
  qqs_bor boolean not null default true,
  min_hajm numeric(18, 3) check (min_hajm is null or min_hajm > 0),
  hudud text check (hudud is null or length(hudud) <= 80),
  radius_km integer check (radius_km is null or radius_km between 0 and 5000),
  rasmlar text[] not null default '{}'::text[] check (cardinality(rasmlar) <= 8),
  qidiruv_kalit text not null default '',
  shikoyat_soni integer not null default 0,
  yashirin_sabab text check (yashirin_sabab is null or length(yashirin_sabab) <= 300),
  boost_gacha timestamptz,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create index if not exists t2_bz_elon_faol_idx on public.t2_bz_elon (tur, kategoriya, hudud, id desc) where holat = 'faol';
create index if not exists t2_bz_elon_sotuvchi_idx on public.t2_bz_elon (sotuvchi_id, id desc);

-- 4. So'rov (xaridor RFQ) + takliflar + g'olib
create table if not exists public.t2_bz_sorov (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  actor_id bigint not null references public.t2_foydalanuvchi(id),
  holat text not null default 'ochiq' check (holat in ('ochiq', 'tanlandi', 'yetkazildi', 'qabul_qilindi', 'bekor')),
  nom text not null check (length(btrim(nom)) between 2 and 300),
  birlik text not null check (length(btrim(birlik)) between 1 and 40),
  hajm numeric(18, 3) not null check (hajm > 0),
  hudud text check (hudud is null or length(hudud) <= 80),
  resurs_kodi text check (resurs_kodi is null or length(resurs_kodi) <= 60),
  zayavka_id bigint,
  obyekt_id bigint,
  tur text not null default 'tovar' check (tur in ('tovar', 'xizmat', 'ijara')),
  muddat_sana date,
  golib_taklif_id bigint,
  taklif_soni integer not null default 0,
  urtacha_narx numeric(18, 2),
  buyurtma_id bigint references public.t2_buyurtma(id),
  narx_manba_id bigint,
  operation_id uuid not null,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  unique (kompaniya_id, operation_id)
);
create index if not exists t2_bz_sorov_ochiq_idx on public.t2_bz_sorov (holat, id desc);
create index if not exists t2_bz_sorov_kompaniya_idx on public.t2_bz_sorov (kompaniya_id, id desc);

create table if not exists public.t2_bz_taklif (
  id bigint generated always as identity primary key,
  sorov_id bigint not null references public.t2_bz_sorov(id) on delete cascade,
  sotuvchi_id bigint not null references public.t2_bz_profil(foydalanuvchi_id),
  elon_id bigint references public.t2_bz_elon(id) on delete set null,
  narx_qqs_siz numeric(18, 2) not null check (narx_qqs_siz > 0),
  muddat_kun integer check (muddat_kun is null or muddat_kun between 0 and 365),
  yetkazish boolean not null default false,
  izoh text check (izoh is null or length(izoh) <= 600),
  holat text not null default 'yuborildi' check (holat in ('yuborildi', 'tanlandi', 'rad')),
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  unique (sorov_id, sotuvchi_id)
);

create table if not exists public.t2_bz_shikoyat (
  id bigint generated always as identity primary key,
  elon_id bigint not null references public.t2_bz_elon(id) on delete cascade,
  shikoyatchi_id bigint not null references public.t2_foydalanuvchi(id),
  sabab text not null check (length(btrim(sabab)) between 3 and 300),
  yaratildi timestamptz not null default now(),
  unique (elon_id, shikoyatchi_id)
);

create table if not exists public.t2_bz_audit (
  id bigint generated always as identity primary key,
  vaqt timestamptz not null default now(),
  actor_id bigint,
  amal text not null,
  obyekt text not null,
  obyekt_id bigint,
  tafsilot jsonb not null default '{}'::jsonb check (octet_length(tafsilot::text) <= 2048)
);
create index if not exists t2_bz_audit_obyekt_idx on public.t2_bz_audit (obyekt, obyekt_id, id desc);

-- 5. UMUMIY reyting (bozor | tender | yuk). Kim kimga, bitim, ball 1..5. Bitta bitimda bitta tomon bir marta.
create table if not exists public.t2_reyting_baho (
  id bigint generated always as identity primary key,
  tur text not null check (tur in ('bozor', 'tender', 'yuk')),
  bitim_id bigint not null,
  kimdan_id bigint not null references public.t2_foydalanuvchi(id),
  kimga_id bigint not null references public.t2_foydalanuvchi(id),
  ball smallint not null check (ball between 1 and 5),
  izoh text check (izoh is null or length(izoh) <= 400),
  yaratildi timestamptz not null default now(),
  unique (tur, bitim_id, kimdan_id),
  check (kimdan_id <> kimga_id)
);
create index if not exists t2_reyting_baho_kimga_idx on public.t2_reyting_baho (kimga_id);

do $rls$ declare t text; begin
  foreach t in array array['t2_bz_sozlama', 't2_bz_profil', 't2_bz_elon', 't2_bz_sorov', 't2_bz_taklif', 't2_bz_shikoyat', 't2_bz_audit', 't2_reyting_baho'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $rls$;

-- 6. Yordamchilar
create or replace function public._t2_bz_kalit(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  -- Lotin/kirill farqsiz qidiruv kaliti: kichik harf, kirill -> lotin, apostrof olib tashlanadi, ortiqcha belgilar bo'shliq
  select btrim(regexp_replace(translate(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(coalesce(p, '')),
    'ё', 'yo'), 'ж', 'j'), 'ц', 's'), 'ч', 'ch'), 'ш', 'sh'), 'щ', 'sh'), 'ю', 'yu'), 'я', 'ya'), 'ъ', ''), 'ь', ''),
    'абвгдезийклмнопрстуфхыэўқғҳ''’ʻʼ`', 'abvgdeziyklmnoprstufxieoqgh'), '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public._t2_bz_matn(p jsonb, k text, mx integer) returns text
language sql immutable set search_path = public, pg_temp as $$
  select nullif(left(btrim(p ->> k), mx), '')
$$;

create or replace function public._t2_bz_son(p jsonb, k text) returns numeric
language sql immutable set search_path = public, pg_temp as $$
  select case when jsonb_typeof(p -> k) in ('number', 'string') and (p ->> k) ~ '^-?[0-9]+(\.[0-9]+)?$' then (p ->> k)::numeric end
$$;

create or replace function public._t2_bz_actor(p_actor_id bigint) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
end $$;

create or replace function public._t2_bz_audit(p_actor bigint, p_amal text, p_obyekt text, p_id bigint, p_t jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.t2_bz_audit (actor_id, amal, obyekt, obyekt_id, tafsilot) values (p_actor, p_amal, p_obyekt, p_id, coalesce(p_t, '{}'::jsonb))
$$;

-- Reyting: foydalanuvchi bo'yicha o'rtacha va soni (barcha mahsulotlar bo'yicha)
create or replace function public._t2_bz_reyting(p_id bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ortacha', round(avg(ball)::numeric, 2), 'soni', count(*)) from public.t2_reyting_baho where kimga_id = p_id
$$;

-- E'lon tekshiruvi: bo'sh narx / taqiqlangan so'z / tur. Xato kodi yoki NULL.
create or replace function public._t2_bz_elon_xato(p_actor bigint, p jsonb, p_faol boolean) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_s text := public._t2_bz_matn(p, 'sarlavha', 160); v_n numeric := public._t2_bz_son(p, 'narx_qqs_siz'); v_so text; v_m text; r jsonb;
begin
  if v_s is null or length(v_s) < 3 then return 'SARLAVHA_KERAK'; end if;
  if public._t2_bz_matn(p, 'tur', 20) is null or (p ->> 'tur') not in ('tovar', 'xizmat', 'ijara') then return 'TUR_NOTOGRI'; end if;
  if public._t2_bz_matn(p, 'birlik', 40) is null then return 'BIRLIK_KERAK'; end if;
  if p ? 'narx_qqs_siz' and p -> 'narx_qqs_siz' <> 'null'::jsonb and (v_n is null or v_n <= 0 or v_n > 1000000000000) then return 'NARX_NOTOGRI'; end if;
  if p_faol and v_n is null then return 'NARX_KERAK'; end if;
  if p ? 'rasmlar' then
    if jsonb_typeof(p -> 'rasmlar') <> 'array' or jsonb_array_length(p -> 'rasmlar') > 8 then return 'RASM_NOTOGRI'; end if;
    for r in select * from jsonb_array_elements(p -> 'rasmlar') loop
      if jsonb_typeof(r) <> 'string' or left(r #>> '{}', length('bz/u' || p_actor::text || '/')) <> 'bz/u' || p_actor::text || '/' or (r #>> '{}') like '%..%' or length(r #>> '{}') > 200 then return 'RASM_NOTOGRI'; end if;
    end loop;
  end if;
  v_m := public._t2_bz_kalit(coalesce(v_s, '') || ' ' || coalesce(p ->> 'tavsif', ''));
  select s into v_so from (select jsonb_array_elements_text(qiymat) s from public.t2_bz_sozlama where kalit = 'taqiqlangan_sozlar') z
    where btrim(s) <> '' and (' ' || v_m || ' ') like '% ' || public._t2_bz_kalit(s) || ' %' limit 1;
  if v_so is not null then return 'TAQIQLANGAN_SOZ'; end if;
  return null;
end $$;

-- 7. PROFIL
create or replace function public.t2_bz_profil_saqla_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_nom text := public._t2_bz_matn(p_data, 'nom', 120); v_tur text := coalesce(public._t2_bz_matn(p_data, 'tur', 20), 'yakka'); v_k bigint := public._t2_bz_son(p_data, 'kompaniya_id')::bigint;
begin
  perform public._t2_bz_actor(p_actor_id);
  if v_nom is null or length(v_nom) < 2 then return jsonb_build_object('ok', false, 'code', 'NOM_KERAK'); end if;
  if v_tur not in ('yakka', 'firma', 'usta') then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  if v_k is not null and not exists (select 1 from public.t2_azolik where foydalanuvchi_id = p_actor_id and kompaniya_id = v_k and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_BEGONA');
  end if;
  if exists (select 1 from public.t2_bz_profil where foydalanuvchi_id = p_actor_id and holat = 'bloklangan') then return jsonb_build_object('ok', false, 'code', 'BLOKLANGAN'); end if;
  insert into public.t2_bz_profil (foydalanuvchi_id, kompaniya_id, tur, nom, telefon, hudud, tavsif)
  values (p_actor_id, v_k, v_tur, v_nom, public._t2_bz_matn(p_data, 'telefon', 30), public._t2_bz_matn(p_data, 'hudud', 80), public._t2_bz_matn(p_data, 'tavsif', 1000))
  on conflict (foydalanuvchi_id) do update set kompaniya_id = excluded.kompaniya_id, tur = excluded.tur, nom = excluded.nom, telefon = excluded.telefon,
    hudud = excluded.hudud, tavsif = excluded.tavsif, yangilandi = now();
  perform public._t2_bz_audit(p_actor_id, 'profil_saqla', 'profil', p_actor_id, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'foydalanuvchi_id', p_actor_id);
end $$;

create or replace function public.t2_bz_profil_ol_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.t2_bz_profil;
begin
  perform public._t2_bz_actor(p_actor_id);
  select * into p from public.t2_bz_profil where foydalanuvchi_id = p_actor_id;
  if not found then return jsonb_build_object('ok', true, 'profil', null); end if;
  return jsonb_build_object('ok', true, 'profil', to_jsonb(p) || jsonb_build_object('reyting', public._t2_bz_reyting(p_actor_id)),
    'sozlama', (select coalesce(jsonb_object_agg(kalit, qiymat), '{}'::jsonb) from public.t2_bz_sozlama where kalit <> 'taqiqlangan_sozlar'));
end $$;

-- 8. E'LON (sotuvchi). Yangi yoki mavjud (id). Faqat o'ziniki; boshqaniki ELON_TOPILMADI.
create or replace function public.t2_bz_elon_saqla_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint := public._t2_bz_son(p_data, 'id')::bigint; v_h text := coalesce(public._t2_bz_matn(p_data, 'holat', 20), 'qoralama'); e public.t2_bz_elon; v_x text; v_r text[];
  v_sar text; v_tav text;
begin
  perform public._t2_bz_actor(p_actor_id);
  if not exists (select 1 from public.t2_bz_profil where foydalanuvchi_id = p_actor_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'PROFIL_KERAK'); end if;
  if v_h not in ('qoralama', 'faol', 'toxtatilgan') then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI'); end if;
  if v_id is not null then
    select * into e from public.t2_bz_elon where id = v_id and sotuvchi_id = p_actor_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'ELON_TOPILMADI'); end if;
    if e.holat = 'yashirin' then return jsonb_build_object('ok', false, 'code', 'YASHIRIN'); end if;
    p_data := to_jsonb(e) - 'rasmlar' - 'qidiruv_kalit' || p_data;
    if not (p_data ? 'rasmlar') then p_data := p_data || jsonb_build_object('rasmlar', to_jsonb(e.rasmlar)); end if;
  end if;
  v_x := public._t2_bz_elon_xato(p_actor_id, p_data, v_h = 'faol');
  if v_x is not null then return jsonb_build_object('ok', false, 'code', v_x); end if;
  select coalesce(array_agg(z), '{}'::text[]) into v_r from jsonb_array_elements_text(coalesce(p_data -> 'rasmlar', '[]'::jsonb)) z;
  v_sar := public._t2_bz_matn(p_data, 'sarlavha', 160); v_tav := public._t2_bz_matn(p_data, 'tavsif', 2000);
  if v_id is null then
    insert into public.t2_bz_elon (sotuvchi_id, tur, holat, sarlavha, tavsif, kategoriya, pozitsiya_kodi, birlik, narx_qqs_siz, qqs_bor, min_hajm, hudud, radius_km, rasmlar, qidiruv_kalit)
    values (p_actor_id, p_data ->> 'tur', v_h, v_sar, v_tav, public._t2_bz_matn(p_data, 'kategoriya', 40), public._t2_bz_matn(p_data, 'pozitsiya_kodi', 60),
      public._t2_bz_matn(p_data, 'birlik', 40), public._t2_bz_son(p_data, 'narx_qqs_siz'), coalesce((p_data ->> 'qqs_bor')::boolean, true), public._t2_bz_son(p_data, 'min_hajm'),
      public._t2_bz_matn(p_data, 'hudud', 80), public._t2_bz_son(p_data, 'radius_km')::integer, v_r, public._t2_bz_kalit(v_sar || ' ' || coalesce(v_tav, '') || ' ' || coalesce(p_data ->> 'kategoriya', '')))
    returning id into v_id;
  else
    update public.t2_bz_elon set tur = p_data ->> 'tur', holat = v_h, sarlavha = v_sar, tavsif = v_tav, kategoriya = public._t2_bz_matn(p_data, 'kategoriya', 40),
      pozitsiya_kodi = public._t2_bz_matn(p_data, 'pozitsiya_kodi', 60), birlik = public._t2_bz_matn(p_data, 'birlik', 40), narx_qqs_siz = public._t2_bz_son(p_data, 'narx_qqs_siz'),
      qqs_bor = coalesce((p_data ->> 'qqs_bor')::boolean, true), min_hajm = public._t2_bz_son(p_data, 'min_hajm'), hudud = public._t2_bz_matn(p_data, 'hudud', 80),
      radius_km = public._t2_bz_son(p_data, 'radius_km')::integer, rasmlar = v_r,
      qidiruv_kalit = public._t2_bz_kalit(v_sar || ' ' || coalesce(v_tav, '') || ' ' || coalesce(p_data ->> 'kategoriya', '')), yangilandi = now()
    where id = v_id;
  end if;
  perform public._t2_bz_audit(p_actor_id, 'elon_saqla', 'elon', v_id, jsonb_build_object('holat', v_h));
  return jsonb_build_object('ok', true, 'id', v_id, 'holat', v_h);
end $$;

create or replace function public.t2_bz_elon_holat_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint := public._t2_bz_son(p_data, 'id')::bigint; v_h text := public._t2_bz_matn(p_data, 'holat', 20); e public.t2_bz_elon;
begin
  perform public._t2_bz_actor(p_actor_id);
  if v_h is null or v_h not in ('faol', 'toxtatilgan', 'qoralama') then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI'); end if;
  select * into e from public.t2_bz_elon where id = v_id and sotuvchi_id = p_actor_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ELON_TOPILMADI'); end if;
  if e.holat = 'yashirin' then return jsonb_build_object('ok', false, 'code', 'YASHIRIN'); end if;
  if v_h = 'faol' and e.narx_qqs_siz is null then return jsonb_build_object('ok', false, 'code', 'NARX_KERAK'); end if;
  update public.t2_bz_elon set holat = v_h, yangilandi = now() where id = e.id;
  perform public._t2_bz_audit(p_actor_id, 'elon_holat', 'elon', e.id, jsonb_build_object('holat', v_h));
  return jsonb_build_object('ok', true, 'id', e.id, 'holat', v_h);
end $$;

-- Mening e'lonlarim + kabinet sanoqlari
create or replace function public.t2_bz_kabinet_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_bz_actor(p_actor_id);
  return jsonb_build_object('ok', true,
    'elonlar', coalesce((select jsonb_agg(to_jsonb(z) order by z.id desc) from (select id, tur, holat, sarlavha, birlik, narx_qqs_siz, qqs_bor, hudud, rasmlar, shikoyat_soni, yashirin_sabab, yaratildi
      from public.t2_bz_elon where sotuvchi_id = p_actor_id order by id desc limit 100) z), '[]'::jsonb),
    'takliflar', coalesce((select jsonb_agg(to_jsonb(z) order by z.id desc) from (select t.id, t.sorov_id, t.narx_qqs_siz, t.muddat_kun, t.yetkazish, t.holat, s.nom as sorov_nom, s.birlik, s.hajm, s.holat as sorov_holat
      from public.t2_bz_taklif t join public.t2_bz_sorov s on s.id = t.sorov_id where t.sotuvchi_id = p_actor_id order by t.id desc limit 100) z), '[]'::jsonb),
    'buyurtmalar', coalesce((select jsonb_agg(to_jsonb(z) order by z.id desc) from (select s.id, s.nom, s.birlik, s.hajm, s.holat, t.narx_qqs_siz, s.hudud, s.buyurtma_id is not null as buyurtma_bor,
      exists (select 1 from public.t2_reyting_baho b where b.tur = 'bozor' and b.bitim_id = s.id and b.kimdan_id = p_actor_id) as baholangan
      from public.t2_bz_sorov s join public.t2_bz_taklif t on t.id = s.golib_taklif_id where t.sotuvchi_id = p_actor_id order by s.id desc limit 100) z), '[]'::jsonb));
end $$;

-- Ochiq so'rovlar (sotuvchi ko'radi): xaridor kompaniyasi YO'Q, faqat nom/birlik/hajm/hudud/muddat. Mening taklifim bo'lsa belgilanadi.
create or replace function public.t2_bz_sorov_ochiq_v1(p_actor_id bigint, p_filtr jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_h text := public._t2_bz_matn(p_filtr, 'hudud', 80);
begin
  perform public._t2_bz_actor(p_actor_id);
  return jsonb_build_object('ok', true, 'sorovlar', coalesce((select jsonb_agg(to_jsonb(z) order by z.id desc) from (
    select s.id, s.tur, s.nom, s.birlik, s.hajm, s.hudud, s.muddat_sana, s.yaratildi, s.taklif_soni,
      (select t.narx_qqs_siz from public.t2_bz_taklif t where t.sorov_id = s.id and t.sotuvchi_id = p_actor_id) as mening_narxim
    from public.t2_bz_sorov s where s.holat = 'ochiq' and (v_h is null or s.hudud is null or s.hudud = v_h) order by s.id desc limit 100) z), '[]'::jsonb));
end $$;

-- 9. TAKLIF BERISH (sotuvchi). Bitta sotuvchi — bitta taklif (qayta bersa yangilanadi, faqat so'rov ochiq).
create or replace function public.t2_bz_taklif_ber_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.t2_bz_sorov; v_n numeric := public._t2_bz_son(p_data, 'narx_qqs_siz'); v_m integer := public._t2_bz_son(p_data, 'muddat_kun')::integer; v_id bigint;
begin
  perform public._t2_bz_actor(p_actor_id);
  if not exists (select 1 from public.t2_bz_profil where foydalanuvchi_id = p_actor_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'PROFIL_KERAK'); end if;
  if v_n is null or v_n <= 0 or v_n > 1000000000000 then return jsonb_build_object('ok', false, 'code', 'NARX_KERAK'); end if;
  if v_m is not null and v_m not between 0 and 365 then return jsonb_build_object('ok', false, 'code', 'MUDDAT_NOTOGRI'); end if;
  select * into s from public.t2_bz_sorov where id = public._t2_bz_son(p_data, 'sorov_id')::bigint for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'SOROV_TOPILMADI'); end if;
  if s.holat <> 'ochiq' then return jsonb_build_object('ok', false, 'code', 'SOROV_YOPIQ'); end if;
  if exists (select 1 from public.t2_azolik a where a.foydalanuvchi_id = p_actor_id and a.kompaniya_id = s.kompaniya_id and a.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'OZ_SOROVINGIZ');
  end if;
  insert into public.t2_bz_taklif (sorov_id, sotuvchi_id, elon_id, narx_qqs_siz, muddat_kun, yetkazish, izoh)
  values (s.id, p_actor_id, (select id from public.t2_bz_elon where id = public._t2_bz_son(p_data, 'elon_id')::bigint and sotuvchi_id = p_actor_id), v_n, v_m,
    coalesce((p_data ->> 'yetkazish')::boolean, false), public._t2_bz_matn(p_data, 'izoh', 600))
  on conflict (sorov_id, sotuvchi_id) do update set narx_qqs_siz = excluded.narx_qqs_siz, muddat_kun = excluded.muddat_kun, yetkazish = excluded.yetkazish,
    izoh = excluded.izoh, elon_id = excluded.elon_id, yangilandi = now()
  returning id into v_id;
  update public.t2_bz_sorov set taklif_soni = (select count(*) from public.t2_bz_taklif where sorov_id = s.id), yangilandi = now() where id = s.id;
  perform public._t2_bz_audit(p_actor_id, 'taklif_ber', 'sorov', s.id, jsonb_build_object('taklif_id', v_id));
  return jsonb_build_object('ok', true, 'id', v_id, 'sorov_id', s.id);
end $$;

-- 10. XARIDOR: so'rov yaratish (smeta qatori / zayavka / narxsiz qator -> bir bosishda). Kompaniya a'zoligi + procurement.write.
create or replace function public.t2_bz_sorov_yarat_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_nom text := public._t2_bz_matn(p_data, 'nom', 300); v_b text := public._t2_bz_matn(p_data, 'birlik', 40); v_h numeric := public._t2_bz_son(p_data, 'hajm'); v_old public.t2_bz_sorov;
  v_tur text := coalesce(public._t2_bz_matn(p_data, 'tur', 20), 'tovar'); v_id bigint; v_ob bigint := public._t2_bz_son(p_data, 'obyekt_id')::bigint; v_d date;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.write');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_old from public.t2_bz_sorov where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'id', v_old.id); end if;
  if v_nom is null or length(v_nom) < 2 then return jsonb_build_object('ok', false, 'code', 'NOM_KERAK'); end if;
  if v_b is null then return jsonb_build_object('ok', false, 'code', 'BIRLIK_KERAK'); end if;
  if v_h is null or v_h <= 0 then return jsonb_build_object('ok', false, 'code', 'HAJM_KERAK'); end if;
  if v_tur not in ('tovar', 'xizmat', 'ijara') then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  if v_ob is not null and not exists (select 1 from public.t2_obyekt where id = v_ob and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA'); end if;
  begin v_d := (p_data ->> 'muddat_sana')::date; exception when others then return jsonb_build_object('ok', false, 'code', 'SANA_NOTOGRI'); end;
  insert into public.t2_bz_sorov (kompaniya_id, actor_id, tur, nom, birlik, hajm, hudud, resurs_kodi, zayavka_id, obyekt_id, muddat_sana, operation_id)
  values (p_kompaniya_id, p_actor_id, v_tur, v_nom, v_b, v_h, public._t2_bz_matn(p_data, 'hudud', 80), public._t2_bz_matn(p_data, 'resurs_kodi', 60),
    public._t2_bz_son(p_data, 'zayavka_id')::bigint, v_ob, v_d, p_operation_id) returning id into v_id;
  perform public._t2_bz_audit(p_actor_id, 'sorov_yarat', 'sorov', v_id, jsonb_build_object('kompaniya_id', p_kompaniya_id));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.t2_bz_sorov_royxat_v1(p_kompaniya_id bigint, p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.read');
  return jsonb_build_object('ok', true, 'sorovlar', coalesce((select jsonb_agg(to_jsonb(z) order by z.id desc) from (
    select s.id, s.tur, s.nom, s.birlik, s.hajm, s.hudud, s.holat, s.taklif_soni, s.urtacha_narx, s.buyurtma_id, s.yaratildi,
      exists (select 1 from public.t2_reyting_baho b where b.tur = 'bozor' and b.bitim_id = s.id and b.kimdan_id = p_actor_id) as baholangan
    from public.t2_bz_sorov s where s.kompaniya_id = p_kompaniya_id order by s.id desc limit 100) z), '[]'::jsonb));
end $$;

-- Taqqos jadvali: takliflar narx bo'yicha; O'RTACHA (arifmetik, QQS siz) + ogohlantirish. Faqat o'z kompaniya so'rovi.
create or replace function public.t2_bz_taqqos_v1(p_kompaniya_id bigint, p_actor_id bigint, p_sorov_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.t2_bz_sorov; v_n integer; v_u numeric;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.read');
  select * into s from public.t2_bz_sorov where id = p_sorov_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'SOROV_TOPILMADI'); end if;
  select count(*), round(avg(narx_qqs_siz), 2) into v_n, v_u from public.t2_bz_taklif where sorov_id = s.id;
  return jsonb_build_object('ok', true, 'sorov', to_jsonb(s) - 'operation_id' - 'actor_id', 'urtacha', v_u, 'soni', v_n,
    'ogohlantirish', case when v_n > 1 then 'urtacha' end,
    'takliflar', coalesce((select jsonb_agg(to_jsonb(z) order by z.narx_qqs_siz, z.id) from (
      select t.id, t.sotuvchi_id, p.nom as sotuvchi_nom, p.tur as sotuvchi_tur, p.kompaniya_id is not null as kompaniyali, t.narx_qqs_siz, t.muddat_kun, t.yetkazish, t.izoh, t.holat,
        (public._t2_bz_reyting(t.sotuvchi_id) ->> 'ortacha')::numeric as reyting, (public._t2_bz_reyting(t.sotuvchi_id) ->> 'soni')::int as reyting_soni
      from public.t2_bz_taklif t join public.t2_bz_profil p on p.foydalanuvchi_id = t.sotuvchi_id where t.sorov_id = s.id) z), '[]'::jsonb));
end $$;

-- 11. G'OLIB TANLASH. Hammasi tekshiriladi, KEYIN yoziladi. Takror chaqiruv (shu taklif) ok+takror, yangi yozuv yaratmaydi.
create or replace function public.t2_bz_golib_tanla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.t2_bz_sorov; t public.t2_bz_taklif; pr public.t2_bz_profil; v_n integer; v_u numeric; v_manba bigint; v_buy jsonb; v_buyid bigint; v_aloqa bigint; v_xato text;
  v_tur text; v_tt text; v_manba_r jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.write');
  select * into s from public.t2_bz_sorov where id = public._t2_bz_son(p_data, 'sorov_id')::bigint and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'SOROV_TOPILMADI'); end if;
  select * into t from public.t2_bz_taklif where id = public._t2_bz_son(p_data, 'taklif_id')::bigint and sorov_id = s.id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TAKLIF_TOPILMADI'); end if;
  if s.holat <> 'ochiq' then
    if s.golib_taklif_id = t.id then return jsonb_build_object('ok', true, 'takror', true, 'sorov_id', s.id, 'buyurtma_id', s.buyurtma_id, 'narx_manba_id', s.narx_manba_id, 'urtacha', s.urtacha_narx); end if;
    return jsonb_build_object('ok', false, 'code', 'SOROV_YOPIQ');
  end if;
  select * into pr from public.t2_bz_profil where foydalanuvchi_id = t.sotuvchi_id;
  select count(*), round(avg(narx_qqs_siz), 2) into v_n, v_u from public.t2_bz_taklif where sorov_id = s.id;
  v_tur := case s.tur when 'tovar' then 'material' when 'xizmat' then 'xizmat' else 'texnika_ijara' end;
  -- Buyurtma faqat sotuvchi kompaniyasi bo'lsa va xaridordan boshqa bo'lsa (t2_buyurtma ikkala tomon kompaniyani talab qiladi). Yakka sotuvchida buyurtma YO'Q — bitim shu so'rovda yuradi.
  if pr.kompaniya_id is not null and pr.kompaniya_id <> p_kompaniya_id and exists (select 1 from public.t2_kompaniya where id = pr.kompaniya_id and faol) then
    v_aloqa := public._t2_yet_aloqa_faol(p_kompaniya_id, pr.kompaniya_id);
    if v_aloqa is null then
      insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, nom, holat, taklif_actor_id, javob_actor_id, javob_vaqti, izoh, operation_id)
      values (p_kompaniya_id, pr.kompaniya_id, 'buyurtmachi', 'yetkazuvchi', 'bozor', left('Bozor so''rovi #' || s.id::text, 200), 'faol', p_actor_id, t.sotuvchi_id, now(),
        'Ochiq bozor so''roviga javob (taklif #' || t.id::text || ')', md5('bz_aloqa:' || s.id::text)::uuid)
      returning id into v_aloqa;
    end if;
    v_buy := public.t2_buyurtma_yarat_v1(p_actor_id, p_kompaniya_id, md5('bz_buyurtma:' || s.id::text)::uuid, v_tur, pr.kompaniya_id, v_aloqa, null, s.obyekt_id,
      jsonb_build_array(jsonb_build_object('nom', s.nom, 'birlik', s.birlik, 'miqdor', s.hajm, 'narx', t.narx_qqs_siz, 'resurs_kodi', s.resurs_kodi)),
      jsonb_build_object('manba', 'bozor', 'sorov_id', s.id, 'taklif_id', t.id, 'muddat_kun', t.muddat_kun, 'yetkazish', t.yetkazish));
    if not coalesce((v_buy ->> 'ok')::boolean, false) then raise exception 'BUYURTMA_RAD: %', coalesce(v_buy ->> 'code', 'XATO') using errcode = 'P0001'; end if;
    v_buyid := (v_buy ->> 'id')::bigint;
  end if;
  -- Narx manbasi (mavjud mexanizm): bozor bahosi = barcha takliflar o'rtachasi (QQS siz); bitta taklif bo'lsa — o'sha narx.
  v_manba_r := public.t2_narx_manba_yoz_v1(p_kompaniya_id,
    jsonb_build_object('tur', 'kp', 'nom', left('Bozor so''rovi #' || s.id::text, 200), 'raqam', 'bozor #' || s.id::text, 'sana', current_date::text, 'yetkazuvchi', pr.nom,
      'region', s.hudud, 'nds_holati', 'nds_siz', 'izoh', 'Bozor takliflari (' || v_n::text || ' ta) o''rtachasi, QQS siz. G''olib taklif #' || t.id::text),
    jsonb_build_array(jsonb_build_object('kod', s.resurs_kodi, 'nom', s.nom, 'birlik', s.birlik, 'narx', v_u, 'hudud', s.hudud)),
    'almashtir', null, null, md5('bz_manba:' || s.id::text)::uuid, 'bozor:' || p_actor_id::text);
  if not coalesce((v_manba_r ->> 'ok')::boolean, false) then raise exception 'MANBA_RAD: %', coalesce(v_manba_r ->> 'error', 'XATO') using errcode = 'P0001'; end if;
  v_manba := (v_manba_r ->> 'id')::bigint;
  update public.t2_bz_taklif set holat = case when id = t.id then 'tanlandi' else 'rad' end, yangilandi = now() where sorov_id = s.id;
  update public.t2_bz_sorov set holat = 'tanlandi', golib_taklif_id = t.id, urtacha_narx = v_u, taklif_soni = v_n, buyurtma_id = v_buyid, narx_manba_id = v_manba, yangilandi = now() where id = s.id;
  perform public._t2_bz_audit(p_actor_id, 'golib_tanla', 'sorov', s.id, jsonb_build_object('taklif_id', t.id, 'buyurtma_id', v_buyid, 'narx_manba_id', v_manba, 'soni', v_n));
  return jsonb_build_object('ok', true, 'sorov_id', s.id, 'buyurtma_id', v_buyid, 'narx_manba_id', v_manba, 'urtacha', v_u, 'soni', v_n, 'ogohlantirish', case when v_n > 1 then 'urtacha' end);
end $$;

-- 12. Yetkazildi (sotuvchi) -> Qabul qilindi (xaridor). Baho FAQAT qabuldan keyin.
create or replace function public.t2_bz_yetkazildi_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.t2_bz_sorov;
begin
  perform public._t2_bz_actor(p_actor_id);
  select s2.* into s from public.t2_bz_sorov s2 join public.t2_bz_taklif t on t.id = s2.golib_taklif_id
    where s2.id = public._t2_bz_son(p_data, 'sorov_id')::bigint and t.sotuvchi_id = p_actor_id for update of s2;
  if not found then return jsonb_build_object('ok', false, 'code', 'SOROV_TOPILMADI'); end if;
  if s.holat = 'yetkazildi' then return jsonb_build_object('ok', true, 'takror', true); end if;
  if s.holat <> 'tanlandi' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', s.holat); end if;
  update public.t2_bz_sorov set holat = 'yetkazildi', yangilandi = now() where id = s.id;
  perform public._t2_bz_audit(p_actor_id, 'yetkazildi', 'sorov', s.id, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'sorov_id', s.id, 'holat', 'yetkazildi');
end $$;

create or replace function public.t2_bz_qabul_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.t2_bz_sorov;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.write');
  select * into s from public.t2_bz_sorov where id = public._t2_bz_son(p_data, 'sorov_id')::bigint and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'SOROV_TOPILMADI'); end if;
  if s.holat = 'qabul_qilindi' then return jsonb_build_object('ok', true, 'takror', true); end if;
  if s.holat <> 'yetkazildi' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', s.holat); end if;
  update public.t2_bz_sorov set holat = 'qabul_qilindi', yangilandi = now() where id = s.id;
  perform public._t2_bz_audit(p_actor_id, 'qabul', 'sorov', s.id, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'sorov_id', s.id, 'holat', 'qabul_qilindi');
end $$;

-- 13. BAHO (ikki tomonlama, umumiy reyting jadvali). Faqat qabul qilingan bitimda; faqat ishtirokchi; bir marta.
create or replace function public.t2_bz_baho_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.t2_bz_sorov; v_b integer := public._t2_bz_son(p_data, 'ball')::integer; v_sot bigint; v_kim bigint;
begin
  perform public._t2_bz_actor(p_actor_id);
  if v_b is null or v_b not between 1 and 5 then return jsonb_build_object('ok', false, 'code', 'BALL_NOTOGRI'); end if;
  select * into s from public.t2_bz_sorov where id = public._t2_bz_son(p_data, 'sorov_id')::bigint;
  if not found then return jsonb_build_object('ok', false, 'code', 'SOROV_TOPILMADI'); end if;
  select t.sotuvchi_id into v_sot from public.t2_bz_taklif t where t.id = s.golib_taklif_id;
  if p_actor_id = v_sot then v_kim := s.actor_id;
  elsif exists (select 1 from public.t2_azolik where foydalanuvchi_id = p_actor_id and kompaniya_id = s.kompaniya_id and holat = 'faol') then v_kim := v_sot;
  else return jsonb_build_object('ok', false, 'code', 'SOROV_TOPILMADI'); end if;
  if s.holat <> 'qabul_qilindi' then return jsonb_build_object('ok', false, 'code', 'QABUL_KERAK'); end if;
  if v_kim = p_actor_id then return jsonb_build_object('ok', false, 'code', 'OZ_OZIGA'); end if;
  if exists (select 1 from public.t2_reyting_baho where tur = 'bozor' and bitim_id = s.id and kimdan_id = p_actor_id) then return jsonb_build_object('ok', true, 'takror', true); end if;
  insert into public.t2_reyting_baho (tur, bitim_id, kimdan_id, kimga_id, ball, izoh) values ('bozor', s.id, p_actor_id, v_kim, v_b, public._t2_bz_matn(p_data, 'izoh', 400));
  return jsonb_build_object('ok', true, 'sorov_id', s.id);
end $$;

-- 14. SHIKOYAT va MODERATSIYA
create or replace function public.t2_bz_shikoyat_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.t2_bz_elon; v_sab text := public._t2_bz_matn(p_data, 'sabab', 300); v_c integer; v_ch integer;
begin
  perform public._t2_bz_actor(p_actor_id);
  if v_sab is null or length(v_sab) < 3 then return jsonb_build_object('ok', false, 'code', 'SABAB_KERAK'); end if;
  select * into e from public.t2_bz_elon where id = public._t2_bz_son(p_data, 'elon_id')::bigint and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ELON_TOPILMADI'); end if;
  if e.sotuvchi_id = p_actor_id then return jsonb_build_object('ok', false, 'code', 'OZ_ELONI'); end if;
  insert into public.t2_bz_shikoyat (elon_id, shikoyatchi_id, sabab) values (e.id, p_actor_id, v_sab) on conflict (elon_id, shikoyatchi_id) do nothing;
  select count(*) into v_c from public.t2_bz_shikoyat where elon_id = e.id;
  select coalesce((qiymat #>> '{}')::integer, 3) into v_ch from public.t2_bz_sozlama where kalit = 'shikoyat_chegara';
  update public.t2_bz_elon set shikoyat_soni = v_c,
    holat = case when v_c >= coalesce(v_ch, 3) then 'yashirin' else holat end,
    yashirin_sabab = case when v_c >= coalesce(v_ch, 3) then 'Avtomatik: shikoyatlar soni chegaradan oshdi' else yashirin_sabab end, yangilandi = now() where id = e.id;
  perform public._t2_bz_audit(p_actor_id, 'shikoyat', 'elon', e.id, jsonb_build_object('soni', v_c));
  return jsonb_build_object('ok', true, 'elon_id', e.id, 'yashirildi', v_c >= coalesce(v_ch, 3));
end $$;

create or replace function public.t2_bz_mod_royxat_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(public.t2_platforma_superadmin(p_actor_id), false) then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'elonlar', coalesce((select jsonb_agg(to_jsonb(z) order by z.shikoyat_soni desc, z.id desc) from (
    select e.id, e.sarlavha, e.tur, e.holat, e.shikoyat_soni, e.yashirin_sabab, e.narx_qqs_siz, e.birlik, p.nom as sotuvchi_nom,
      (select coalesce(jsonb_agg(sabab order by id), '[]'::jsonb) from public.t2_bz_shikoyat s where s.elon_id = e.id) as sabablar
    from public.t2_bz_elon e join public.t2_bz_profil p on p.foydalanuvchi_id = e.sotuvchi_id
    where e.shikoyat_soni > 0 or e.holat = 'yashirin' order by e.shikoyat_soni desc, e.id desc limit 100) z), '[]'::jsonb));
end $$;

create or replace function public.t2_bz_mod_yashir_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.t2_bz_elon; v_y boolean := coalesce((p_data ->> 'yashir')::boolean, true); v_s text := public._t2_bz_matn(p_data, 'sabab', 300);
begin
  if not coalesce(public.t2_platforma_superadmin(p_actor_id), false) then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  select * into e from public.t2_bz_elon where id = public._t2_bz_son(p_data, 'elon_id')::bigint for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ELON_TOPILMADI'); end if;
  if v_y and v_s is null then return jsonb_build_object('ok', false, 'code', 'SABAB_KERAK'); end if;
  update public.t2_bz_elon set holat = case when v_y then 'yashirin' else 'toxtatilgan' end, yashirin_sabab = case when v_y then v_s end, yangilandi = now() where id = e.id;
  perform public._t2_bz_audit(p_actor_id, case when v_y then 'mod_yashir' else 'mod_qaytar' end, 'elon', e.id, jsonb_build_object('sabab', v_s));
  return jsonb_build_object('ok', true, 'id', e.id, 'holat', case when v_y then 'yashirin' else 'toxtatilgan' end);
end $$;

-- 15. OCHIQ O'QISH (kirmasdan). FAQAT holat='faol' e'lonlar; faqat e'lon qilingan maydonlar (telefon, kompaniya_id, foydalanuvchi emaili YO'Q).
create or replace function public.t2_bz_ochiq_qidir_v1(p_filtr jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_tur text := public._t2_bz_matn(p_filtr, 'tur', 20); v_kat text := public._t2_bz_matn(p_filtr, 'kategoriya', 40); v_hud text := public._t2_bz_matn(p_filtr, 'hudud', 80);
  v_q text[]; v_lim integer := least(greatest(coalesce(public._t2_bz_son(p_filtr, 'limit')::integer, 40), 1), 100); v_off integer := greatest(coalesce(public._t2_bz_son(p_filtr, 'offset')::integer, 0), 0);
begin
  select coalesce(array_agg(k), '{}'::text[]) into v_q from (select distinct public._t2_bz_kalit(x) k from jsonb_array_elements_text(
    case when jsonb_typeof(p_filtr -> 'q') = 'array' then p_filtr -> 'q' when p_filtr ? 'q' then jsonb_build_array(p_filtr ->> 'q') else '[]'::jsonb end) x limit 8) z where k <> '';
  return jsonb_build_object('ok', true, 'elonlar', coalesce((select jsonb_agg(to_jsonb(z)) from (
    select e.id, e.tur, e.sarlavha, e.kategoriya, e.birlik, e.narx_qqs_siz, e.qqs_bor, e.min_hajm, e.hudud, e.radius_km, e.rasmlar, e.yaratildi,
      p.foydalanuvchi_id as sotuvchi_id, p.nom as sotuvchi_nom, p.tur as sotuvchi_tur,
      (public._t2_bz_reyting(p.foydalanuvchi_id) ->> 'ortacha')::numeric as sotuvchi_reyting, (public._t2_bz_reyting(p.foydalanuvchi_id) ->> 'soni')::int as sotuvchi_baho_soni
    from public.t2_bz_elon e join public.t2_bz_profil p on p.foydalanuvchi_id = e.sotuvchi_id and p.holat = 'faol'
    where e.holat = 'faol' and (v_tur is null or e.tur = v_tur) and (v_kat is null or e.kategoriya = v_kat) and (v_hud is null or e.hudud is null or e.hudud = v_hud)
      and (cardinality(v_q) = 0 or exists (select 1 from unnest(v_q) w where e.qidiruv_kalit like '%' || w || '%'))
    order by (e.boost_gacha is not null and e.boost_gacha > now() and coalesce((select (qiymat #>> '{}')::boolean from public.t2_bz_sozlama where kalit = 'boost_yoqilgan'), false)) desc, e.id desc
    limit v_lim offset v_off) z), '[]'::jsonb));
end $$;

create or replace function public.t2_bz_ochiq_elon_v1(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e public.t2_bz_elon; p public.t2_bz_profil;
begin
  select * into e from public.t2_bz_elon where id = p_id and holat = 'faol';
  if not found then return jsonb_build_object('ok', false, 'code', 'ELON_TOPILMADI'); end if;
  select * into p from public.t2_bz_profil where foydalanuvchi_id = e.sotuvchi_id and holat = 'faol';
  if not found then return jsonb_build_object('ok', false, 'code', 'ELON_TOPILMADI'); end if;
  return jsonb_build_object('ok', true, 'elon', jsonb_build_object('id', e.id, 'tur', e.tur, 'sarlavha', e.sarlavha, 'tavsif', e.tavsif, 'kategoriya', e.kategoriya, 'birlik', e.birlik,
      'narx_qqs_siz', e.narx_qqs_siz, 'qqs_bor', e.qqs_bor, 'min_hajm', e.min_hajm, 'hudud', e.hudud, 'radius_km', e.radius_km, 'rasmlar', e.rasmlar, 'yaratildi', e.yaratildi),
    'sotuvchi', jsonb_build_object('id', p.foydalanuvchi_id, 'nom', p.nom, 'tur', p.tur, 'hudud', p.hudud, 'reyting', public._t2_bz_reyting(p.foydalanuvchi_id)));
end $$;

create or replace function public.t2_bz_ochiq_sotuvchi_v1(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.t2_bz_profil;
begin
  select * into p from public.t2_bz_profil where foydalanuvchi_id = p_id and holat = 'faol';
  if not found then return jsonb_build_object('ok', false, 'code', 'SOTUVCHI_TOPILMADI'); end if;
  return jsonb_build_object('ok', true, 'sotuvchi', jsonb_build_object('id', p.foydalanuvchi_id, 'nom', p.nom, 'tur', p.tur, 'hudud', p.hudud, 'tavsif', p.tavsif, 'yaratildi', p.yaratildi,
      'reyting', public._t2_bz_reyting(p.foydalanuvchi_id)),
    'elonlar', coalesce((select jsonb_agg(to_jsonb(z) order by z.id desc) from (select id, tur, sarlavha, birlik, narx_qqs_siz, qqs_bor, hudud, rasmlar from public.t2_bz_elon
      where sotuvchi_id = p.foydalanuvchi_id and holat = 'faol' order by id desc limit 50) z), '[]'::jsonb),
    'baholar', coalesce((select jsonb_agg(to_jsonb(z) order by z.yaratildi desc) from (select ball, izoh, yaratildi from public.t2_reyting_baho where kimga_id = p.foydalanuvchi_id order by id desc limit 10) z), '[]'::jsonb));
end $$;

create or replace function public.t2_bz_ochiq_filtr_v1() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true,
    'kategoriyalar', coalesce((select jsonb_agg(jsonb_build_object('kalit', kategoriya, 'soni', n) order by n desc) from (select kategoriya, count(*) n from public.t2_bz_elon where holat = 'faol' and kategoriya is not null group by 1) z), '[]'::jsonb),
    'hududlar', coalesce((select jsonb_agg(jsonb_build_object('nom', hudud, 'soni', n) order by n desc) from (select hudud, count(*) n from public.t2_bz_elon where holat = 'faol' and hudud is not null group by 1) z), '[]'::jsonb))
$$;

-- Rasmni ochiq berish uchun: kalit faqat FAOL e'longa biriktirilgan bo'lsa true (shlyuz R2 dan oqimlaydi)
create or replace function public.t2_bz_ochiq_rasm_v1(p_kalit text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.t2_bz_elon where holat = 'faol' and p_kalit = any (rasmlar))
$$;

do $grant$ declare f text; begin
  foreach f in array array[
    'public._t2_bz_kalit(text)', 'public._t2_bz_matn(jsonb,text,integer)', 'public._t2_bz_son(jsonb,text)', 'public._t2_bz_actor(bigint)',
    'public._t2_bz_audit(bigint,text,text,bigint,jsonb)', 'public._t2_bz_reyting(bigint)', 'public._t2_bz_elon_xato(bigint,jsonb,boolean)',
    'public.t2_bz_profil_saqla_v1(bigint,uuid,jsonb)', 'public.t2_bz_profil_ol_v1(bigint)', 'public.t2_bz_elon_saqla_v1(bigint,uuid,jsonb)', 'public.t2_bz_elon_holat_v1(bigint,uuid,jsonb)',
    'public.t2_bz_kabinet_v1(bigint)', 'public.t2_bz_sorov_ochiq_v1(bigint,jsonb)', 'public.t2_bz_taklif_ber_v1(bigint,uuid,jsonb)',
    'public.t2_bz_sorov_yarat_v1(bigint,bigint,uuid,jsonb)', 'public.t2_bz_sorov_royxat_v1(bigint,bigint)', 'public.t2_bz_taqqos_v1(bigint,bigint,bigint)',
    'public.t2_bz_golib_tanla_v1(bigint,bigint,uuid,jsonb)', 'public.t2_bz_yetkazildi_v1(bigint,uuid,jsonb)', 'public.t2_bz_qabul_v1(bigint,bigint,uuid,jsonb)',
    'public.t2_bz_baho_v1(bigint,uuid,jsonb)', 'public.t2_bz_shikoyat_v1(bigint,uuid,jsonb)', 'public.t2_bz_mod_royxat_v1(bigint)', 'public.t2_bz_mod_yashir_v1(bigint,uuid,jsonb)',
    'public.t2_bz_ochiq_qidir_v1(jsonb)', 'public.t2_bz_ochiq_elon_v1(bigint)', 'public.t2_bz_ochiq_sotuvchi_v1(bigint)', 'public.t2_bz_ochiq_filtr_v1()', 'public.t2_bz_ochiq_rasm_v1(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $grant$;
