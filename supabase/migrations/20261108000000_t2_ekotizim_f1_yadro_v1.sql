-- T2 EKOTIZIM F1 — YADRO (docs/architecture/ekotizim E1, E2, E3 §6, E7).
-- Holat: TAKLIF. Prodga faqat koordinator (parent) orqali. Egasi tasdig'i talab qilinadigan (⚠) narsa YO'Q:
--   capability/rol kengaytmasi alohida faylda — 20261108010000_t2_ekotizim_f1_ruxsat_v1.sql.
-- Faqat ADDITIV: yangi jadvallar, nullable ustunlar, yangi funksiyalar, AFTER INSERT trigger. DROP/UPDATE yo'q.
-- Mavjud RPC lar o'zgarmaydi. Barcha yangi jadvallar: RLS on + policy yo'q + anon/authenticated ga ruxsat yo'q.

begin;

-- ════════════════════════════════════════════════════════════════════════
-- 1. Yo'nalish katalogi (shaxs yo'nalishi / tashkilot faoliyati / munosabat roli — BITTA katalog)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.t2_yonalish (
  kalit            text primary key check (kalit ~ '^[a-z][a-z0-9_]{1,40}$'),
  nom              text not null check (length(btrim(nom)) between 2 and 80),
  nom_ru           text not null check (length(btrim(nom_ru)) between 2 and 80),
  guruh            text not null check (guruh in ('buyurtma','pudrat','loyiha','nazorat','taminot','logistika','moliya','ichki','boshqa')),
  qollanish        text[] not null default array['shaxs','tashkilot','munosabat']
                   check (cardinality(qollanish) >= 1 and qollanish <@ array['shaxs','tashkilot','munosabat']),
  eski_taxalluslar text[] not null default '{}',
  faol             boolean not null default true,
  tartib           integer not null default 0
);

insert into public.t2_yonalish (kalit, nom, nom_ru, guruh, qollanish, eski_taxalluslar, tartib) values
  ('buyurtmachi',        'Buyurtmachi',            'Заказчик',                'buyurtma',  '{tashkilot,munosabat}',       '{zakazchik,Buyurtmachi}', 10),
  ('investor',           'Investor',               'Инвестор',                'buyurtma',  '{shaxs,tashkilot,munosabat}', '{}', 20),
  ('bosh_pudratchi',     'Bosh pudratchi',         'Генподрядчик',            'pudrat',    '{tashkilot,munosabat}',       '{pudratchi,Pudratchi}', 30),
  ('subpudratchi',       'Subpudratchi',           'Субподрядчик',            'pudrat',    '{tashkilot,munosabat}',       '{}', 40),
  ('brigada',            'Brigada',                'Бригада',                 'pudrat',    '{shaxs,tashkilot,munosabat}', '{}', 50),
  ('loyihachi',          'Loyihachi',              'Проектировщик',           'loyiha',    '{shaxs,tashkilot,munosabat}', '{}', 60),
  ('ekspertiza',         'Ekspertiza',             'Экспертиза',              'loyiha',    '{tashkilot,munosabat}',       '{}', 70),
  ('texnadzor',          'Texnik nazorat',         'Технадзор',               'nazorat',   '{shaxs,tashkilot,munosabat}', '{}', 80),
  ('mualliflik_nazorati','Mualliflik nazorati',    'Авторский надзор',        'nazorat',   '{shaxs,tashkilot,munosabat}', '{}', 90),
  ('inspeksiya',         'Davlat inspeksiyasi',    'Госинспекция',            'nazorat',   '{tashkilot,munosabat}',       '{}', 100),
  ('laboratoriya',       'Laboratoriya',           'Лаборатория',             'nazorat',   '{tashkilot,munosabat}',       '{}', 110),
  ('yetkazuvchi',        'Yetkazuvchi',            'Поставщик',               'taminot',   '{shaxs,tashkilot,munosabat}', '{taminotchi,ta''minotchi}', 120),
  ('texnika_ijarachi',   'Texnika ijarasi',        'Аренда техники',          'taminot',   '{shaxs,tashkilot,munosabat}', '{}', 130),
  ('tashuvchi',          'Tashuvchi',              'Перевозчик',              'logistika', '{tashkilot,munosabat}',       '{}', 140),
  ('haydovchi',          'Haydovchi',              'Водитель',                'logistika', '{shaxs,munosabat}',           '{}', 150),
  ('bank',               'Bank',                   'Банк',                    'moliya',    '{tashkilot,munosabat}',       '{}', 160),
  ('sugurta',            'Sug''urta',              'Страхование',             'moliya',    '{tashkilot,munosabat}',       '{}', 170),
  ('mehmon',             'Mehmon',                 'Гость',                   'boshqa',    '{munosabat}',                 '{}', 180),
  ('usta',               'Usta',                   'Мастер',                  'pudrat',    '{shaxs}', '{}', 200),
  ('brigadir',           'Brigadir',               'Бригадир',                'pudrat',    '{shaxs}', '{}', 210),
  ('pto',                'PTO muhandisi',          'Инженер ПТО',             'ichki',     '{shaxs}', '{}', 220),
  ('smetachi',           'Smetachi',               'Сметчик',                 'ichki',     '{shaxs}', '{}', 230),
  ('prorab',             'Prorab',                 'Прораб',                  'pudrat',    '{shaxs}', '{}', 240),
  ('omborchi',           'Omborchi',               'Кладовщик',               'ichki',     '{shaxs}', '{}', 250),
  ('mexanik',            'Mexanik',                'Механик',                 'ichki',     '{shaxs}', '{}', 260),
  ('operator',           'Texnika operatori',      'Машинист',                'ichki',     '{shaxs}', '{}', 270),
  ('buxgalter',          'Buxgalter',              'Бухгалтер',               'ichki',     '{shaxs}', '{bugalter}', 280),
  ('kadr',               'Kadrlar xodimi',         'Специалист по кадрам',    'ichki',     '{shaxs}', '{}', 290),
  ('rahbar',             'Rahbar',                 'Руководитель',            'ichki',     '{shaxs}', '{}', 300),
  ('inspektor',          'Inspektor',              'Инспектор',               'nazorat',   '{shaxs}', '{}', 310)
on conflict (kalit) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Tashkilot faoliyati va shaxs yo'nalishi (qidiruv/moslash uchun; RUXSAT BERMAYDI)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.t2_kompaniya_faoliyat (
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  yonalish     text   not null references public.t2_yonalish(kalit),
  hudud        text check (hudud is null or length(hudud) <= 120),
  izoh         text check (izoh is null or length(izoh) <= 500),
  holat        text not null default 'faol' check (holat in ('faol','olib_tashlandi')),
  yaratildi    timestamptz not null default now(),
  yangilandi   timestamptz not null default now(),
  primary key (kompaniya_id, yonalish)
);
create index if not exists t2_kompaniya_faoliyat_yonalish_idx on public.t2_kompaniya_faoliyat (yonalish, kompaniya_id) where holat = 'faol';

create table if not exists public.t2_shaxs_yonalish (
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id),
  yonalish         text   not null references public.t2_yonalish(kalit),
  hudud            text check (hudud is null or length(hudud) <= 120),
  tajriba_yil      smallint check (tajriba_yil is null or tajriba_yil between 0 and 70),
  ochiq            boolean not null default false,          -- katalogda ko'rinishi (default yopiq)
  tasdiqlangan     boolean not null default false,          -- kelajak: hujjat/ish tarixi bilan tasdiq
  holat            text not null default 'faol' check (holat in ('faol','olib_tashlandi')),
  yaratildi        timestamptz not null default now(),
  yangilandi       timestamptz not null default now(),
  primary key (foydalanuvchi_id, yonalish)
);
create index if not exists t2_shaxs_yonalish_qidiruv_idx on public.t2_shaxs_yonalish (yonalish, foydalanuvchi_id) where holat = 'faol' and ochiq;

-- ════════════════════════════════════════════════════════════════════════
-- 3. Mavjud jadvallarga additiv ustunlar
-- ════════════════════════════════════════════════════════════════════════
alter table public.t2_kontragent     add column if not exists tomon_kompaniya_id bigint references public.t2_kompaniya(id);
create index if not exists t2_kontragent_tomon_kompaniya_idx on public.t2_kontragent (tomon_kompaniya_id) where tomon_kompaniya_id is not null;

alter table public.t2_kadr_mustaqil  add column if not exists foydalanuvchi_id bigint references public.t2_foydalanuvchi(id);
create index if not exists t2_kadr_mustaqil_foydalanuvchi_idx on public.t2_kadr_mustaqil (foydalanuvchi_id) where foydalanuvchi_id is not null;

-- Telefon — profil maydoni, TASDIQLANMAGAN (SMS OTP egasi qarori bilan keyin). Login uchun ishlatilmaydi.
alter table public.t2_foydalanuvchi  add column if not exists telefon text;
alter table public.t2_foydalanuvchi  add column if not exists telefon_tasdiqlangan boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_foydalanuvchi_telefon_check') then
    alter table public.t2_foydalanuvchi add constraint t2_foydalanuvchi_telefon_check check (telefon is null or telefon ~ '^\+[0-9]{9,15}$');
  end if;
end $$;

-- Obyekt joylashuvi (E3 §4.4.3). lat/lng mavjud.
alter table public.t2_obyekt add column if not exists manzil           text;
alter table public.t2_obyekt add column if not exists geozona_radius_m integer;
alter table public.t2_obyekt add column if not exists chegara_geojson  jsonb;
alter table public.t2_obyekt add column if not exists chegara_r2_key   text;
alter table public.t2_obyekt add column if not exists geokod_manba     text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_obyekt_joylashuv_check') then
    alter table public.t2_obyekt add constraint t2_obyekt_joylashuv_check check (
          (manzil is null or length(manzil) <= 500)
      and (geozona_radius_m is null or geozona_radius_m between 10 and 5000)
      and (chegara_geojson is null or (jsonb_typeof(chegara_geojson) = 'object' and octet_length(chegara_geojson::text) <= 16384))
      and (geokod_manba is null or geokod_manba in ('provayder','qolda','import')));
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 4. Grant shablonlari (taklif yuborishda kutilgan_grantlar ni to'ldirish uchun)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.t2_tomon_grant_shablon (
  id         bigint generated always as identity primary key,
  aloqa_turi text not null check (aloqa_turi ~ '^[a-z][a-z0-9_]{1,40}$'),
  qabul_rol  text not null references public.t2_yonalish(kalit),
  resurs     text not null references public.t2_tomon_resurs(kalit),
  amallar    text[] not null check (cardinality(amallar) between 1 and 10),
  faol       boolean not null default true,
  tartib     integer not null default 0,
  unique (aloqa_turi, qabul_rol, resurs)
);
insert into public.t2_tomon_grant_shablon (aloqa_turi, qabul_rol, resurs, amallar, tartib) values
  ('shartnoma', 'buyurtmachi', 'obyekt_holat',     '{korish}', 10),
  ('shartnoma', 'buyurtmachi', 'shartnoma_xulosa', '{korish}', 20),
  ('shartnoma', 'buyurtmachi', 'f2',               '{korish,tafsilot}', 30),
  ('shartnoma', 'buyurtmachi', 'tolov_holati',     '{korish}', 40),
  ('nazorat',   'texnadzor',   'obyekt_holat',     '{korish}', 10),
  ('nazorat',   'texnadzor',   'hujjat',           '{korish}', 20),
  ('nazorat',   'texnadzor',   'aosr',             '{korish,izoh,qaror}', 30),
  ('nazorat',   'inspeksiya',  'obyekt_holat',     '{korish}', 10),
  ('nazorat',   'inspeksiya',  'aosr',             '{korish,izoh}', 20),
  ('nazorat',   'laboratoriya','obyekt_holat',     '{korish}', 10),
  ('subpudrat', 'subpudratchi','obyekt_holat',     '{korish}', 10),
  ('subpudrat', 'subpudratchi','hujjat',           '{korish}', 20),
  ('subpudrat', 'subpudratchi','grafik',           '{korish}', 30)
on conflict (aloqa_turi, qabul_rol, resurs) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- 5. Outbox — yagona hodisa shinasi (E3 §6)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.t2_outbox (
  id                    bigint generated always as identity primary key,
  kompaniya_id          bigint not null references public.t2_kompaniya(id),
  mavzu                 text   not null check (mavzu ~ '^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$'),
  entity_jadval         text   not null check (entity_jadval ~ '^t2_[a-z0-9_]+$'),
  entity_id             bigint not null,
  obyekt_id             bigint,
  aloqa_id              bigint,
  qabul_kompaniya_idlar bigint[] not null default '{}',
  foydalanuvchi_idlar   bigint[] not null default '{}',     -- aniq qabul qiluvchi odamlar (masalan ijrochi usta)
  payload               jsonb  not null default '{}'::jsonb check (octet_length(payload::text) <= 4096),
  actor_id              bigint,
  operation_id          uuid,
  yaratildi             timestamptz not null default now(),
  unique (kompaniya_id, mavzu, operation_id)
);
create index if not exists t2_outbox_yaratildi_idx on public.t2_outbox (yaratildi);
create index if not exists t2_outbox_obyekt_idx    on public.t2_outbox (obyekt_id, id desc) where obyekt_id is not null;

create table if not exists public.t2_outbox_kursor (
  iste_molchi text primary key check (iste_molchi ~ '^[a-z][a-z0-9_]{1,40}$'),
  oxirgi_id   bigint not null default 0,
  yangilandi  timestamptz not null default now()
);

-- Domen RPC lari ichidan chaqiriladi (bitta tranzaksiya). Idempotent: (kompaniya, mavzu, operation_id).
create or replace function public.t2_outbox_yoz(
  p_kompaniya_id bigint, p_mavzu text, p_entity_jadval text, p_entity_id bigint, p_payload jsonb,
  p_actor_id bigint, p_operation_id uuid,
  p_obyekt_id bigint default null, p_aloqa_id bigint default null,
  p_qabul_kompaniya_idlar bigint[] default '{}', p_foydalanuvchi_idlar bigint[] default '{}')
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  insert into public.t2_outbox (kompaniya_id, mavzu, entity_jadval, entity_id, obyekt_id, aloqa_id,
                                qabul_kompaniya_idlar, foydalanuvchi_idlar, payload, actor_id, operation_id)
  values (p_kompaniya_id, p_mavzu, p_entity_jadval, p_entity_id, p_obyekt_id, p_aloqa_id,
          coalesce(p_qabul_kompaniya_idlar, '{}'), coalesce(p_foydalanuvchi_idlar, '{}'),
          coalesce(p_payload, '{}'::jsonb), p_actor_id, p_operation_id)
  on conflict (kompaniya_id, mavzu, operation_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.t2_outbox
     where kompaniya_id = p_kompaniya_id and mavzu = p_mavzu and operation_id = p_operation_id;
  end if;
  return v_id;
end $$;

-- t2_tomon_hodisa → outbox (mavjud tomon RPC lariga tegmasdan). Xato bo'lsa tomon amali BUZILMAYDI (warning).
create or replace function public._t2_tomon_hodisa_outbox() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_qarshi bigint;
begin
  if new.kompaniya_id is null or new.tur in ('qidiruv', 'kod_xato') then return new; end if;
  begin
    select case when a.taklif_kompaniya_id = new.kompaniya_id then a.qabul_kompaniya_id else a.taklif_kompaniya_id end
      into v_qarshi from public.t2_tomon_aloqa a where a.id = new.aloqa_id;
    perform public.t2_outbox_yoz(new.kompaniya_id, 'tomon.' || new.tur, 't2_tomon_hodisa', new.id,
      jsonb_strip_nulls(jsonb_build_object('aloqa_id', new.aloqa_id, 'taqdim_id', new.taqdim_id,
                                           'murojaat_id', new.murojaat_id, 'tur', new.tur)),
      new.actor_id, null, null, new.aloqa_id,
      case when v_qarshi is null then '{}'::bigint[] else array[v_qarshi] end, '{}'::bigint[]);
  exception when others then
    raise warning 'T2_OUTBOX: tomon hodisasi % outbox ga yozilmadi: %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists t2_tomon_hodisa_outbox_trg on public.t2_tomon_hodisa;
create trigger t2_tomon_hodisa_outbox_trg after insert on public.t2_tomon_hodisa
  for each row execute function public._t2_tomon_hodisa_outbox();

-- ════════════════════════════════════════════════════════════════════════
-- 6. Bildirishnoma (outbox iste'molchisi)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.t2_bildirishnoma (
  id               bigint generated always as identity primary key,
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id),
  kompaniya_id     bigint references public.t2_kompaniya(id),   -- qabul qiluvchining konteksti; NULL = shaxsiy (aniq qabul qiluvchi)
  outbox_id        bigint not null references public.t2_outbox(id),
  mavzu            text   not null,
  sarlavha_kalit   text   not null,                              -- i18n kaliti (UI tarjima qiladi)
  parametrlar      jsonb  not null default '{}'::jsonb,
  havola           text check (havola is null or (havola ~ '^/' and length(havola) <= 300)),
  oqildi           timestamptz,
  yaratildi        timestamptz not null default now(),
  unique (foydalanuvchi_id, outbox_id)
);
create index if not exists t2_bildirishnoma_user_idx        on public.t2_bildirishnoma (foydalanuvchi_id, id desc);
create index if not exists t2_bildirishnoma_oqilmagan_idx   on public.t2_bildirishnoma (foydalanuvchi_id, id desc) where oqildi is null;

-- Fon ishi (Cloudflare Cron → shlyuz, har 1 daq). Kursor bilan, at-least-once; unique(foydalanuvchi_id, outbox_id) — takrorga chidamli.
-- 60 s kechikish: kech commit bo'lgan kichik id larni o'tkazib yubormaslik uchun (60 s dan uzun tranzaksiya — ma'lum cheklov).
create or replace function public.t2_outbox_ishlov_v1(p_iste_molchi text default 'bildirishnoma', p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_oxirgi bigint; v_chegara bigint; v_max bigint; v_soni integer := 0; v_bild integer := 0;
begin
  if p_iste_molchi is distinct from 'bildirishnoma' then
    return jsonb_build_object('ok', false, 'code', 'ISTE_MOLCHI_NOMALUM');
  end if;
  insert into public.t2_outbox_kursor (iste_molchi) values (p_iste_molchi) on conflict do nothing;
  select oxirgi_id into v_oxirgi from public.t2_outbox_kursor where iste_molchi = p_iste_molchi for update;
  -- Kursor «teshik» qoldirmasligi uchun: birinchi hali-yangi hodisagacha (id tartibida) to'xtaymiz.
  select min(o.id) into v_chegara from public.t2_outbox o
   where o.id > v_oxirgi and o.yaratildi >= now() - interval '60 seconds';

  with partiya as (
    select o.* from public.t2_outbox o
     where o.id > v_oxirgi and (v_chegara is null or o.id < v_chegara)
     order by o.id limit least(greatest(coalesce(p_limit, 500), 1), 2000)
  ), qabul as (
    -- (a) qabul qiluvchi kompaniyalarning boshqaruvchi a'zolari
    select p.id outbox_id, p.mavzu, p.payload, a.foydalanuvchi_id, a.kompaniya_id
      from partiya p
      join public.t2_azolik a on a.kompaniya_id = any (p.qabul_kompaniya_idlar)
                             and a.holat = 'faol' and a.rol in ('boss', 'admin', 'rahbar', 'director', 'pto')
     where a.foydalanuvchi_id is distinct from p.actor_id
    union
    -- (b) aniq ko'rsatilgan odamlar
    select p.id, p.mavzu, p.payload, u.uid, null::bigint
      from partiya p cross join lateral unnest(p.foydalanuvchi_idlar) as u(uid)
     where u.uid is distinct from p.actor_id
  ), ins as (
    insert into public.t2_bildirishnoma (foydalanuvchi_id, kompaniya_id, outbox_id, mavzu, sarlavha_kalit, parametrlar)
    select q.foydalanuvchi_id, q.kompaniya_id, q.outbox_id, q.mavzu, 'bildirishnoma.' || q.mavzu, q.payload
      from qabul q
      join public.t2_foydalanuvchi f on f.id = q.foydalanuvchi_id and f.holat = 'faol'
    on conflict (foydalanuvchi_id, outbox_id) do nothing
    returning 1
  )
  select (select count(*) from partiya), (select max(id) from partiya), (select count(*) from ins)
    into v_soni, v_max, v_bild;

  if v_max is not null then
    update public.t2_outbox_kursor set oxirgi_id = v_max, yangilandi = now() where iste_molchi = p_iste_molchi;
  end if;
  return jsonb_build_object('ok', true, 'hodisa', v_soni, 'bildirishnoma', v_bild, 'kursor', coalesce(v_max, v_oxirgi));
end $$;

create or replace function public.t2_bildirishnomalar_v1(
  p_actor_id bigint, p_faqat_oqilmagan boolean default false, p_limit integer default 50, p_keyin_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb; v_oqilmagan integer;
begin
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ACTOR');
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id desc), '[]'::jsonb) into v from (
    select b.id, b.kompaniya_id, b.mavzu, b.sarlavha_kalit, b.parametrlar, b.havola, b.oqildi, b.yaratildi
      from public.t2_bildirishnoma b
     where b.foydalanuvchi_id = p_actor_id
       and (not coalesce(p_faqat_oqilmagan, false) or b.oqildi is null)
       and (p_keyin_id is null or b.id < p_keyin_id)
       -- kompaniyadan chiqqan odam o'sha kompaniya bildirishnomalarini ko'rmaydi
       and (b.kompaniya_id is null or exists (select 1 from public.t2_azolik a
              where a.foydalanuvchi_id = p_actor_id and a.kompaniya_id = b.kompaniya_id and a.holat = 'faol'))
     order by b.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200)) r;
  select count(*) into v_oqilmagan from public.t2_bildirishnoma b
   where b.foydalanuvchi_id = p_actor_id and b.oqildi is null
     and (b.kompaniya_id is null or exists (select 1 from public.t2_azolik a
            where a.foydalanuvchi_id = p_actor_id and a.kompaniya_id = b.kompaniya_id and a.holat = 'faol'));
  return jsonb_build_object('ok', true, 'qatorlar', v, 'oqilmagan', v_oqilmagan);
end $$;

create or replace function public.t2_bildirishnoma_oqildi_v1(p_actor_id bigint, p_idlar bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v integer;
begin
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ACTOR');
  end if;
  if p_idlar is null or cardinality(p_idlar) > 500 then return jsonb_build_object('ok', false, 'code', 'ROYXAT'); end if;
  update public.t2_bildirishnoma set oqildi = now()
   where foydalanuvchi_id = p_actor_id and id = any (p_idlar) and oqildi is null;
  get diagnostics v = row_count;
  return jsonb_build_object('ok', true, 'belgilandi', v);
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 7. Primitiv kataloglari (E7 §3) — primitiv jadvallari F1b da builderlar tomonidan
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.t2_primitiv_tur (
  primitiv text not null check (primitiv in ('topshiriq','tender','buyurtma')),
  kalit    text not null check (kalit ~ '^[a-z][a-z0-9_]{1,40}$'),
  nom      text not null, nom_ru text not null,
  faol     boolean not null default true,
  tartib   integer not null default 0,
  primary key (primitiv, kalit)
);
insert into public.t2_primitiv_tur (primitiv, kalit, nom, nom_ru, tartib) values
  ('topshiriq','ish','Ish topshirig''i','Задание на работу',10),
  ('topshiriq','reys','Reys','Рейс',20),
  ('topshiriq','tamir','Ta''mir','Ремонт',30),
  ('topshiriq','tekshiruv','Tekshiruv','Проверка',40),
  ('topshiriq','tuzatish','Kamchilikni tuzatish','Устранение замечания',50),
  ('topshiriq','boshqa','Boshqa','Другое',90),
  ('tender','material','Material','Материал',10),
  ('tender','xizmat','Xizmat','Услуга',20),
  ('tender','subpudrat','Subpudrat','Субподряд',30),
  ('tender','transport','Transport','Перевозка',40),
  ('tender','texnika_ijara','Texnika ijarasi','Аренда техники',50),
  ('tender','loyihalash','Loyihalash','Проектирование',60),
  ('tender','laboratoriya','Laboratoriya sinovi','Лабораторные испытания',70),
  ('buyurtma','material','Material','Материал',10),
  ('buyurtma','xizmat','Xizmat','Услуга',20),
  ('buyurtma','subpudrat','Subpudrat','Субподряд',30),
  ('buyurtma','transport','Transport','Перевозка',40),
  ('buyurtma','texnika_ijara','Texnika ijarasi','Аренда техники',50),
  ('buyurtma','loyihalash','Loyihalash','Проектирование',60),
  ('buyurtma','laboratoriya','Laboratoriya sinovi','Лабораторные испытания',70)
on conflict (primitiv, kalit) do nothing;

create table if not exists public.t2_bosqich_katalog (
  primitiv text not null,
  tur      text not null,
  kalit    text not null check (kalit ~ '^[a-z][a-z0-9_]{1,40}$'),
  nom      text not null, nom_ru text not null,
  kim      text not null check (kim in ('beruvchi','ijrochi','ikkalasi')),
  tartib   integer not null default 0,
  faol     boolean not null default true,
  primary key (primitiv, tur, kalit),
  foreign key (primitiv, tur) references public.t2_primitiv_tur (primitiv, kalit)
);
insert into public.t2_bosqich_katalog (primitiv, tur, kalit, nom, nom_ru, kim, tartib) values
  ('buyurtma','material','tayyorlanmoqda','Tayyorlanmoqda','Готовится','ijrochi',10),
  ('buyurtma','material','yuklashga_tayyor','Yuklashga tayyor','Готов к отгрузке','ijrochi',20),
  ('buyurtma','material','yolda','Yo''lda','В пути','ijrochi',30),
  ('buyurtma','material','yetkazildi','Yetkazildi','Доставлено','ijrochi',40),
  ('buyurtma','transport','biriktirildi','Biriktirildi','Назначен','ijrochi',10),
  ('buyurtma','transport','yuklanmoqda','Yuklanmoqda','Погрузка','ijrochi',20),
  ('buyurtma','transport','yolda','Yo''lda','В пути','ijrochi',30),
  ('buyurtma','transport','yetib_keldi','Yetib keldi','Прибыл','ijrochi',40)
on conflict (primitiv, tur, kalit) do nothing;

create table if not exists public.t2_primitiv_dalil (
  id                 bigint generated always as identity primary key,
  kompaniya_id       bigint not null references public.t2_kompaniya(id),     -- biriktiruvchi tenant (hujjat egasi)
  primitiv           text   not null check (primitiv in ('topshiriq','tender','tender_taklif','buyurtma','murojaat')),
  primitiv_id        bigint not null,                                         -- FK primitiv jadvallari paydo bo'lgach (F1b)
  hujjat_id          bigint not null references public.t2_document_registry(id),
  biriktirdi_actor_id bigint not null references public.t2_foydalanuvchi(id),
  holat              text   not null default 'faol' check (holat in ('faol','bekor')),
  yaratildi          timestamptz not null default now(),
  unique (primitiv, primitiv_id, hujjat_id)
);
create index if not exists t2_primitiv_dalil_idx on public.t2_primitiv_dalil (primitiv, primitiv_id);

-- Reyting: faqat yakunlangan primitivdan keyin (RPC t2_baho_ber_v1 — F1b, primitiv jadvallari bilan birga).
create table if not exists public.t2_baho (
  id                          bigint generated always as identity primary key,
  baholovchi_kompaniya_id     bigint not null references public.t2_kompaniya(id),
  baholovchi_actor_id         bigint not null references public.t2_foydalanuvchi(id),
  baholangan_kompaniya_id     bigint not null references public.t2_kompaniya(id),
  baholangan_foydalanuvchi_id bigint references public.t2_foydalanuvchi(id),
  manba_jadval                text not null check (manba_jadval in ('t2_topshiriq','t2_buyurtma','t2_birja_rfq')),
  manba_id                    bigint not null,
  ball                        smallint not null check (ball between 1 and 5),
  izoh                        text check (izoh is null or length(izoh) <= 1000),
  operation_id                uuid not null,
  yaratildi                   timestamptz not null default now(),
  check (baholovchi_kompaniya_id <> baholangan_kompaniya_id),
  unique (baholovchi_kompaniya_id, manba_jadval, manba_id),
  unique (baholovchi_kompaniya_id, operation_id)
);
create index if not exists t2_baho_baholangan_idx on public.t2_baho (baholangan_kompaniya_id);

-- ════════════════════════════════════════════════════════════════════════
-- 8. Obyekt doirasi yordamchisi (E2 §3.4). Mavjud RPC larga TATBIQ ETILMAYDI (⚠ alohida qaror);
--    faqat yangi (ekotizim) RPC lari chaqiradi.
-- ════════════════════════════════════════════════════════════════════════
create or replace function public._t2_obyekt_doira_ok(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rol text;
begin
  if p_actor_id is null or p_kompaniya_id is null then return false; end if;
  if public.t2_platforma_superadmin(p_actor_id) then
    return p_obyekt_id is null or exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id);
  end if;
  select a.rol into v_rol from public.t2_azolik a
   where a.kompaniya_id = p_kompaniya_id and a.foydalanuvchi_id = p_actor_id and a.holat = 'faol';
  if v_rol is null then return false; end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return false;
  end if;
  -- Dala rollari: faqat aniq biriktirilgan obyektlar (default — hech narsa).
  if v_rol in ('usta', 'brigadir', 'haydovchi', 'inspektor') then
    return p_obyekt_id is not null and exists (
      select 1 from public.t2_obyekt_foydalanuvchi_ruxsat r
       where r.obyekt_id = p_obyekt_id and r.foydalanuvchi_id = p_actor_id and r.holat = 'faol');
  end if;
  -- Ofis rollari: agar shu kompaniyada biror faol obyekt ruxsati bo'lsa — faqat o'shalar; bo'lmasa hammasi.
  if p_obyekt_id is null then return true; end if;
  if exists (select 1 from public.t2_obyekt_foydalanuvchi_ruxsat r join public.t2_obyekt o on o.id = r.obyekt_id
              where r.foydalanuvchi_id = p_actor_id and r.holat = 'faol' and o.kompaniya_id = p_kompaniya_id) then
    return exists (select 1 from public.t2_obyekt_foydalanuvchi_ruxsat r
                    where r.obyekt_id = p_obyekt_id and r.foydalanuvchi_id = p_actor_id and r.holat = 'faol');
  end if;
  return true;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 9. Shaxs-birinchi RPC lari (E7 §1–2)
-- ════════════════════════════════════════════════════════════════════════
-- O'z yo'nalishlarini saqlash (to'liq ro'yxat; ro'yxatda yo'qlari 'olib_tashlandi'). Ruxsat bermaydi.
create or replace function public.t2_shaxs_yonalish_saqla_v1(p_actor_id bigint, p_yonalishlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_soni integer; v_notogri text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ACTOR');
  end if;
  if p_yonalishlar is null or jsonb_typeof(p_yonalishlar) <> 'array' or jsonb_array_length(p_yonalishlar) > 10 then
    return jsonb_build_object('ok', false, 'code', 'ROYXAT', 'xabar', 'Ko''pi bilan 10 ta yo''nalish');
  end if;
  select min(coalesce(e->>'yonalish', '<bosh>')) into v_notogri from jsonb_array_elements(p_yonalishlar) e
   where not exists (select 1 from public.t2_yonalish y where y.kalit = e->>'yonalish' and y.faol and 'shaxs' = any (y.qollanish));
  if v_notogri is not null then return jsonb_build_object('ok', false, 'code', 'YONALISH_NOTOGRI', 'yonalish', v_notogri); end if;

  insert into public.t2_shaxs_yonalish (foydalanuvchi_id, yonalish, hudud, tajriba_yil, ochiq, holat, yangilandi)
  select distinct on (e->>'yonalish') p_actor_id, e->>'yonalish', left(nullif(btrim(e->>'hudud'), ''), 120),
         case when (e->>'tajriba_yil') ~ '^[0-9]{1,2}$' then (e->>'tajriba_yil')::smallint end,
         case when e->>'ochiq' in ('true', 'false') then (e->>'ochiq')::boolean else false end, 'faol', now()
    from jsonb_array_elements(p_yonalishlar) e
  on conflict (foydalanuvchi_id, yonalish) do update
     set hudud = excluded.hudud, tajriba_yil = excluded.tajriba_yil, ochiq = excluded.ochiq, holat = 'faol', yangilandi = now();

  update public.t2_shaxs_yonalish set holat = 'olib_tashlandi', ochiq = false, yangilandi = now()
   where foydalanuvchi_id = p_actor_id and holat = 'faol'
     and yonalish not in (select e->>'yonalish' from jsonb_array_elements(p_yonalishlar) e);

  select count(*) into v_soni from public.t2_shaxs_yonalish where foydalanuvchi_id = p_actor_id and holat = 'faol';
  return jsonb_build_object('ok', true, 'soni', v_soni);
end $$;

-- Tashkilot faoliyati (profil). company.profile.update kerak.
create or replace function public.t2_kompaniya_faoliyat_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_faoliyatlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_soni integer; v_notogri text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.profile.update');
  if p_faoliyatlar is null or jsonb_typeof(p_faoliyatlar) <> 'array' or jsonb_array_length(p_faoliyatlar) > 15 then
    return jsonb_build_object('ok', false, 'code', 'ROYXAT');
  end if;
  select min(coalesce(e->>'yonalish', '<bosh>')) into v_notogri from jsonb_array_elements(p_faoliyatlar) e
   where not exists (select 1 from public.t2_yonalish y where y.kalit = e->>'yonalish' and y.faol and 'tashkilot' = any (y.qollanish));
  if v_notogri is not null then return jsonb_build_object('ok', false, 'code', 'YONALISH_NOTOGRI', 'yonalish', v_notogri); end if;

  insert into public.t2_kompaniya_faoliyat (kompaniya_id, yonalish, hudud, izoh, holat, yangilandi)
  select distinct on (e->>'yonalish') p_kompaniya_id, e->>'yonalish', left(nullif(btrim(e->>'hudud'), ''), 120), left(nullif(btrim(e->>'izoh'), ''), 500), 'faol', now()
    from jsonb_array_elements(p_faoliyatlar) e
  on conflict (kompaniya_id, yonalish) do update set hudud = excluded.hudud, izoh = excluded.izoh, holat = 'faol', yangilandi = now();

  update public.t2_kompaniya_faoliyat set holat = 'olib_tashlandi', yangilandi = now()
   where kompaniya_id = p_kompaniya_id and holat = 'faol'
     and yonalish not in (select e->>'yonalish' from jsonb_array_elements(p_faoliyatlar) e);

  perform public.t2_audit_yoz(p_kompaniya_id, 'kompaniya_faoliyat_saqla', 'kompaniya', null,
    'faoliyat=' || coalesce((select string_agg(e->>'yonalish', ',') from jsonb_array_elements(p_faoliyatlar) e), ''),
    'actor:' || p_actor_id, null);
  select count(*) into v_soni from public.t2_kompaniya_faoliyat where kompaniya_id = p_kompaniya_id and holat = 'faol';
  return jsonb_build_object('ok', true, 'soni', v_soni);
end $$;

-- Katalog qidiruvi: faqat OCHIQ profillar, minimal maydonlar. Telefon/email/rekvizit/narx QAYTARILMAYDI.
-- Kursor: p_keyin = '<tur>:<id>' (tur: s=shaxs, t=tashkilot). Tartib: tur, id.
create or replace function public.t2_katalog_qidir_v1(
  p_actor_id bigint, p_yonalish text default null, p_hudud text default null, p_matn text default null,
  p_tur text default null, p_limit integer default 20, p_keyin text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb; v_soni integer; v_oxirgi text; v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
        v_ktur text := split_part(coalesce(p_keyin, ''), ':', 1);
        v_kid bigint := case when coalesce(p_keyin, '') ~ '^[st]:[0-9]{1,18}$' then split_part(p_keyin, ':', 2)::bigint end;
        v_matn text := nullif(btrim(coalesce(p_matn, '')), '');
        v_hudud text := nullif(btrim(coalesce(p_hudud, '')), '');
begin
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ACTOR');
  end if;
  if p_tur is not null and p_tur not in ('shaxs', 'tashkilot') then return jsonb_build_object('ok', false, 'code', 'TUR'); end if;
  if v_matn is not null and length(v_matn) > 80 then return jsonb_build_object('ok', false, 'code', 'MATN'); end if;

  with shaxslar as (
    select 's'::text t, f.id, f.ism nom,
           array_agg(sy.yonalish order by sy.yonalish) yonalishlar,
           max(sy.hudud) hudud,
           (select min(k.id) from public.t2_azolik a join public.t2_kompaniya k on k.id = a.kompaniya_id
             where a.foydalanuvchi_id = f.id and a.holat = 'faol' and a.rol = 'boss' and k.turi = 'shaxsiy' and k.faol) kompaniya_id
      from public.t2_foydalanuvchi f
      join public.t2_shaxs_yonalish sy on sy.foydalanuvchi_id = f.id and sy.holat = 'faol' and sy.ochiq
      join public.t2_mutaxassis_profil mp on mp.foydalanuvchi_id = f.id and mp.ochiq
     where f.holat = 'faol' and coalesce(p_tur, 'shaxs') = 'shaxs'
       and (p_yonalish is null or sy.yonalish = p_yonalish)
       and (v_hudud is null or sy.hudud ilike '%' || v_hudud || '%')
       and (v_matn is null or f.ism ilike '%' || v_matn || '%')
     group by f.id, f.ism
  ), tashkilotlar as (
    select 't'::text t, k.id, k.nom,
           array_agg(kf.yonalish order by kf.yonalish) yonalishlar,
           max(kf.hudud) hudud, k.id kompaniya_id
      from public.t2_kompaniya k
      join public.t2_kompaniya_faoliyat kf on kf.kompaniya_id = k.id and kf.holat = 'faol'
     where k.faol and coalesce(k.ochiq_profil, false) and k.turi = 'tashkilot' and coalesce(p_tur, 'tashkilot') = 'tashkilot'
       and (p_yonalish is null or kf.yonalish = p_yonalish)
       and (v_hudud is null or kf.hudud ilike '%' || v_hudud || '%')
       and (v_matn is null or k.nom ilike '%' || v_matn || '%')
     group by k.id, k.nom
  ), hammasi as (
    select * from shaxslar union all select * from tashkilotlar
  ), sahifa as (
    select h.* from hammasi h
     where v_kid is null or (h.t, h.id) > (v_ktur, v_kid)
     order by h.t, h.id limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
              'tur', case s.t when 's' then 'shaxs' else 'tashkilot' end, 'id', s.id, 'nom', s.nom,
              'yonalishlar', to_jsonb(s.yonalishlar), 'hudud', s.hudud, 'kompaniya_id', s.kompaniya_id,
              'reyting', (select round(avg(b.ball)::numeric, 2) from public.t2_baho b where b.baholangan_kompaniya_id = s.kompaniya_id),
              'baho_soni', (select count(*) from public.t2_baho b where b.baholangan_kompaniya_id = s.kompaniya_id)
            ) order by s.t, s.id), '[]'::jsonb),
         count(*),
         (array_agg(s.t || ':' || s.id order by s.t desc, s.id desc))[1]
    into v, v_soni, v_oxirgi
    from sahifa s;
  return jsonb_build_object('ok', true, 'qatorlar', v, 'keyin', case when v_soni = v_limit then v_oxirgi end);
end $$;

-- Kontragentni platformadagi tomon kompaniyasiga bog'lash: faqat FAOL aloqa va INN mos bo'lsa.
create or replace function public.t2_kontragent_tomon_bog_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_kontragent_id bigint, p_aloqa_id bigint,
  p_kutilgan_versiya integer, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_k public.t2_kontragent; v_a public.t2_tomon_aloqa; v_qarshi bigint; v_inn text; v_versiya integer;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  select * into v_k from public.t2_kontragent where id = p_kontragent_id and kompaniya_id = p_kompaniya_id and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'KONTRAGENT_YOQ'); end if;
  select * into v_a from public.t2_tomon_aloqa where id = p_aloqa_id and holat = 'faol'
     and p_kompaniya_id in (taklif_kompaniya_id, qabul_kompaniya_id);
  if not found then return jsonb_build_object('ok', false, 'code', 'ALOQA_FAOL_EMAS'); end if;
  v_qarshi := case when v_a.taklif_kompaniya_id = p_kompaniya_id then v_a.qabul_kompaniya_id else v_a.taklif_kompaniya_id end;
  if v_k.tomon_kompaniya_id = v_qarshi then
    return jsonb_build_object('ok', true, 'takror', true, 'versiya', v_k.versiya);
  end if;
  if v_k.tomon_kompaniya_id is not null then return jsonb_build_object('ok', false, 'code', 'BOSHQA_TOMONGA_BOGLANGAN'); end if;
  if v_k.versiya is distinct from p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_k.versiya); end if;
  select inn into v_inn from public.t2_kompaniya where id = v_qarshi;
  if v_inn is null or v_k.inn is null or btrim(v_inn) <> btrim(v_k.inn) then
    return jsonb_build_object('ok', false, 'code', 'INN_MOS_EMAS');
  end if;
  update public.t2_kontragent set tomon_kompaniya_id = v_qarshi, versiya = versiya + 1
   where id = v_k.id returning versiya into v_versiya;
  perform public.t2_audit_yoz(p_kompaniya_id, 'kontragent_tomon_bog', 'kontragent', null,
    format('kontragent=%s tomon=%s aloqa=%s', v_k.id, v_qarshi, p_aloqa_id), 'actor:' || p_actor_id, null);
  perform public.t2_outbox_yoz(p_kompaniya_id, 'kontragent.tomon_boglandi', 't2_kontragent', v_k.id,
    jsonb_build_object('tomon_kompaniya_id', v_qarshi), p_actor_id, p_operation_id, null, p_aloqa_id, array[v_qarshi], '{}');
  return jsonb_build_object('ok', true, 'versiya', v_versiya, 'tomon_kompaniya_id', v_qarshi);
end $$;

-- Grant shablonlari (taklif oynasi uchun)
create or replace function public.t2_tomon_grant_shablon_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_turi text, p_qabul_rol text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select coalesce(jsonb_agg(jsonb_build_object('resurs', s.resurs, 'amallar', to_jsonb(s.amallar)) order by s.tartib), '[]'::jsonb) into v
    from public.t2_tomon_grant_shablon s join public.t2_tomon_resurs r on r.kalit = s.resurs and r.faol
   where s.faol and s.aloqa_turi = p_aloqa_turi and s.qabul_rol = p_qabul_rol;
  return jsonb_build_object('ok', true, 'grantlar', v);
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 10. Xavfsizlik: RLS + huquqlar
-- ════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['t2_yonalish','t2_kompaniya_faoliyat','t2_shaxs_yonalish','t2_tomon_grant_shablon','t2_outbox',
                           't2_outbox_kursor','t2_bildirishnoma','t2_primitiv_tur','t2_bosqich_katalog','t2_primitiv_dalil','t2_baho']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Ichki yordamchilar — hech kimga to'g'ridan EXECUTE yo'q (faqat SECURITY DEFINER RPC lar ichidan).
revoke all on function public.t2_outbox_yoz(bigint,text,text,bigint,jsonb,bigint,uuid,bigint,bigint,bigint[],bigint[]) from public, anon, authenticated;
revoke all on function public._t2_tomon_hodisa_outbox() from public, anon, authenticated;
revoke all on function public._t2_obyekt_doira_ok(bigint,bigint,bigint) from public, anon, authenticated;

-- Shlyuz chaqiradigan RPC lar — faqat service_role.
do $$
declare f text;
begin
  foreach f in array array[
    'public.t2_outbox_ishlov_v1(text,integer)',
    'public.t2_bildirishnomalar_v1(bigint,boolean,integer,bigint)',
    'public.t2_bildirishnoma_oqildi_v1(bigint,bigint[])',
    'public.t2_shaxs_yonalish_saqla_v1(bigint,jsonb,uuid)',
    'public.t2_kompaniya_faoliyat_saqla_v1(bigint,bigint,jsonb,uuid)',
    'public.t2_katalog_qidir_v1(bigint,text,text,text,text,integer,text)',
    'public.t2_kontragent_tomon_bog_v1(bigint,bigint,bigint,bigint,integer,uuid)',
    'public.t2_tomon_grant_shablon_v1(bigint,bigint,text,text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
