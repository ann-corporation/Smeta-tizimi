-- T2_YUK_BIRJASI v1 (egasi 2026-11-04: «Yandex Dostavka, lekin yuk uchun»): yuk e'loni, takliflar/qarshi taklif, bron, yo'lda, yetkazildi, yopildi,
-- isbot (R2), baho, nizo, platforma orqali to'lov (escrow — LITSENZIYALI provayder, stub bilan), komissiya sozlamasi.
-- Hujjat: docs/architecture/YUK_BIRJASI_V1.md. Jadvallar `t2_yb_*` (entity_jadval regex `^t2_` t2_outbox uchun shart).
-- Qarorlar: yakka haydovchi = alohida profil (kompaniyasiz, foydalanuvchi bilan); firma tashuvchi = kompaniya a'zosi (logistics.dispatch).
-- Yuk egasi tomoni = kompaniya a'zosi (procurement.*); yangi capability YO'Q. Narx doim QQS SIZ; QQS alohida (taklif.qqs_foiz). Noma'lum = NULL.
-- Pul platformada USHLANMAYDI: t2_yb_tolov — provayder (Click/Payme/Uzum) holatining ko'zgusi; o'tishlarni faqat provayder callback RPC (service_role) qiladi.
-- Fayl/foto bazaga yozilmaydi: faqat R2 kaliti + sha256 (t2_yb_dalil).
-- Migratsiyani FAQAT L0 qo'llaydi. Rollback: .rollback.sql. Qabul: .acceptance.sql.
begin;

-- 0. Idempotentlik jurnali (hamma yozuvchi RPC uchun bitta; actor bo'yicha — yakka haydovchida kompaniya yo'q)
create table if not exists public.t2_yb_operation (
  actor_id bigint not null,
  operation_id uuid not null,
  amal text not null,
  natija jsonb not null,
  yaratildi timestamptz not null default now(),
  primary key (actor_id, operation_id)
);

-- 1. Sozlamalar (komissiya va narx dvigateli parametrlari — kod emas, qiymat; egasi o'zgartiradi)
create table if not exists public.t2_yb_sozlama (
  kalit text primary key check (kalit ~ '^[a-z0-9_]{2,60}$'),
  qiymat jsonb not null,
  izoh text,
  yangilandi timestamptz not null default now()
);
insert into public.t2_yb_sozlama (kalit, qiymat, izoh) values
  ('komissiya_foiz', '0'::jsonb, 'Platforma komissiyasi, % (tashuvchidan, QQS siz summadan). Pilotda 0; keyin 3 (egasi qarori 2026-11-04).'),
  ('stavka_tkm', 'null'::jsonb, 'So''m / tonna-km (QQS siz). NULL = kiritilmagan; bozor kalibrovkasidan keyin to''ldiriladi.'),
  ('min_tarif', 'null'::jsonb, 'Eng kam reys narxi, so''m QQS siz. NULL = kiritilmagan.'),
  ('qqs_foiz', '12'::jsonb, 'Sukut QQS stavkasi (tekshirish kerak; QQS to''lovchi bo''lmagan tashuvchi taklifda 0 beradi).'),
  ('k_yuk', '{"sochma":1.0,"qoplangan":1.0,"mo_rt":1.3,"xavfli":1.6,"negabarit":1.5}'::jsonb, 'Yuk turi koeffitsiyenti (TAXMINIY, kalibrovka kerak).'),
  ('k_qaytish', '{"bir_tomon":1.7,"qaytishda_yuk":1.0}'::jsonb, 'Bo''sh qaytish koeffitsiyenti (TAXMINIY).'),
  ('k_shoshilinch', '{"bugun":1.3,"ertaga":1.1,"oddiy":1.0}'::jsonb, 'Shoshilinchlik koeffitsiyenti (TAXMINIY).'),
  ('k_mashina', '{"yuk":1.0,"samosval":1.0,"tent":1.0,"ref":1.0}'::jsonb, 'Mashina turi koeffitsiyenti (TAXMINIY).'),
  ('diapazon_foiz', '15'::jsonb, 'Tavsiya narx diapazoni, ±%.'),
  ('tasdiq_soat', '48'::jsonb, 'Yetkazildi → yopildi avtomatik tasdiq muddati, soat.')
on conflict (kalit) do nothing;

-- 2. Tashuvchi profili (yakka haydovchi: kompaniya_id NULL; firma: kompaniya_id bor)
create table if not exists public.t2_yb_tashuvchi (
  id bigserial primary key,
  foydalanuvchi_id bigint not null unique references public.t2_foydalanuvchi(id) on delete cascade,
  kompaniya_id bigint references public.t2_kompaniya(id) on delete set null,
  tur text not null check (tur in ('yakka', 'firma')),
  ism text not null check (length(btrim(ism)) between 1 and 200),
  telefon text check (telefon is null or length(telefon) <= 30),
  daraja smallint not null default 0 check (daraja between 0 and 3),
  reyting_ortacha numeric(3, 2),
  reyting_soni integer not null default 0,
  bekor_soni integer not null default 0,
  holat text not null default 'faol' check (holat in ('faol', 'bloklangan')),
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  check (tur = 'yakka' or kompaniya_id is not null)
);
create index if not exists t2_yb_tashuvchi_kompaniya_idx on public.t2_yb_tashuvchi (kompaniya_id) where kompaniya_id is not null;

create table if not exists public.t2_yb_mashina (
  id bigserial primary key,
  tashuvchi_id bigint not null references public.t2_yb_tashuvchi(id) on delete cascade,
  davlat_raqami text not null check (length(btrim(davlat_raqami)) between 3 and 30),
  turi text not null default 'yuk' check (turi in ('yuk', 'samosval', 'tent', 'ref', 'boshqa')),
  yuk_t numeric(10, 3) check (yuk_t is null or yuk_t > 0),
  yuk_m3 numeric(10, 3) check (yuk_m3 is null or yuk_m3 > 0),
  tr_mashina_id bigint references public.t2_tr_mashina(id) on delete set null,
  holat text not null default 'faol' check (holat in ('faol', 'nofaol')),
  yaratildi timestamptz not null default now(),
  unique (tashuvchi_id, davlat_raqami)
);

-- 3. Yuk e'loni
create table if not exists public.t2_yb_yuk (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  yaratuvchi_id bigint not null references public.t2_foydalanuvchi(id),
  nom text not null check (length(btrim(nom)) between 1 and 200),
  yuk_turi text not null default 'sochma' check (yuk_turi in ('sochma', 'qoplangan', 'mo_rt', 'xavfli', 'negabarit')),
  a_nom text, a_lat numeric(9, 6), a_lng numeric(9, 6), a_obyekt_id bigint references public.t2_obyekt(id) on delete set null,
  b_nom text, b_lat numeric(9, 6), b_lng numeric(9, 6), b_obyekt_id bigint references public.t2_obyekt(id) on delete set null,
  masofa_km numeric(10, 1) check (masofa_km is null or masofa_km >= 0),
  tonna numeric(10, 3) check (tonna is null or tonna > 0),
  hajm_m3 numeric(10, 3) check (hajm_m3 is null or hajm_m3 > 0),
  sana_dan date,
  sana_gacha date,
  tolov_shakli text not null default 'otkazma' check (tolov_shakli in ('naqd', 'otkazma', 'ikkalasi')),
  escrow boolean not null default false,
  narx_taklif_qqs_siz numeric(16, 2) check (narx_taklif_qqs_siz is null or narx_taklif_qqs_siz >= 0),
  narx_tavsiya_qqs_siz numeric(16, 2) check (narx_tavsiya_qqs_siz is null or narx_tavsiya_qqs_siz >= 0),
  narx_hisob jsonb,
  qqs_foiz numeric(5, 2) not null default 12 check (qqs_foiz >= 0 and qqs_foiz < 100),
  izoh text,
  holat text not null default 'qoralama' check (holat in ('qoralama', 'elon', 'takliflar', 'bron', 'yolda', 'yetkazildi', 'yopildi', 'bekor', 'muddat_tugadi', 'nizo')),
  tanlangan_taklif_id bigint,
  versiya integer not null default 1,
  elon_vaqt timestamptz,
  yopildi_vaqt timestamptz,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  check (not escrow or tolov_shakli = 'otkazma')
);
create index if not exists t2_yb_yuk_kompaniya_idx on public.t2_yb_yuk (kompaniya_id, holat);
create index if not exists t2_yb_yuk_lenta_idx on public.t2_yb_yuk (holat, sana_gacha) where holat in ('elon', 'takliflar');

-- 4. Taklif va qarshi taklif (raundlar). t2_birja_taklif kompaniya-markazli — yakka haydovchiga sig'maydi; mexanika (raund, g'olib) shu yerda.
create table if not exists public.t2_yb_taklif (
  id bigserial primary key,
  yuk_id bigint not null references public.t2_yb_yuk(id) on delete cascade,
  tashuvchi_id bigint not null references public.t2_yb_tashuvchi(id) on delete cascade,
  mashina_id bigint references public.t2_yb_mashina(id) on delete set null,
  kimdan text not null check (kimdan in ('tashuvchi', 'ega')),
  raund integer not null default 1 check (raund >= 1),
  ota_taklif_id bigint references public.t2_yb_taklif(id) on delete set null,
  narx_qqs_siz numeric(16, 2) not null check (narx_qqs_siz > 0),
  qqs_foiz numeric(5, 2) not null default 12 check (qqs_foiz >= 0 and qqs_foiz < 100),
  izoh text,
  holat text not null default 'faol' check (holat in ('faol', 'qabul', 'rad', 'qaytarildi', 'eskirdi')),
  yaratildi timestamptz not null default now()
);
create unique index if not exists t2_yb_taklif_faol_uniq on public.t2_yb_taklif (yuk_id, tashuvchi_id) where holat = 'faol';
create index if not exists t2_yb_taklif_yuk_idx on public.t2_yb_taklif (yuk_id, id);

-- 5. Bron (kelishilgan shartlar muzlatilgan)
create table if not exists public.t2_yb_bron (
  id bigserial primary key,
  yuk_id bigint not null references public.t2_yb_yuk(id) on delete cascade,
  taklif_id bigint not null references public.t2_yb_taklif(id),
  tashuvchi_id bigint not null references public.t2_yb_tashuvchi(id),
  mashina_id bigint not null references public.t2_yb_mashina(id),
  narx_qqs_siz numeric(16, 2) not null check (narx_qqs_siz > 0),
  qqs_foiz numeric(5, 2) not null check (qqs_foiz >= 0 and qqs_foiz < 100),
  tolov_shakli text not null check (tolov_shakli in ('naqd', 'otkazma')),
  qabul_kod text not null check (qabul_kod ~ '^[0-9]{4}$'),
  holat text not null default 'bron' check (holat in ('bron', 'yolda', 'yetkazildi', 'yopildi', 'bekor', 'nizo')),
  bekor_kim text check (bekor_kim is null or bekor_kim in ('ega', 'tashuvchi')),
  bekor_sabab text,
  tr_reys_id bigint references public.t2_tr_reys(id) on delete set null,
  yuklandi_vaqt timestamptz,
  yetkazildi_vaqt timestamptz,
  yaratildi timestamptz not null default now()
);
create unique index if not exists t2_yb_bron_faol_uniq on public.t2_yb_bron (yuk_id) where holat not in ('bekor');
alter table public.t2_yb_yuk drop constraint if exists t2_yb_yuk_tanlangan_fk;
alter table public.t2_yb_yuk add constraint t2_yb_yuk_tanlangan_fk foreign key (tanlangan_taklif_id) references public.t2_yb_taklif(id) on delete set null;

-- 6. Isbot (yuklash/yetkazish/nizo): fayl R2 da, bazada faqat kalit va xesh
create table if not exists public.t2_yb_dalil (
  id bigserial primary key,
  bron_id bigint not null references public.t2_yb_bron(id) on delete cascade,
  tur text not null check (tur in ('yuklash', 'yetkazish', 'nizo')),
  document_id bigint references public.t2_document_registry(id) on delete set null,
  r2_kalit text check (r2_kalit is null or length(r2_kalit) between 3 and 500),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  yaratuvchi_id bigint not null references public.t2_foydalanuvchi(id),
  yaratildi timestamptz not null default now(),
  check (document_id is not null or r2_kalit is not null)
);
create index if not exists t2_yb_dalil_bron_idx on public.t2_yb_dalil (bron_id, tur);

-- 7. Baho (ikki tomonlama) va nizo
create table if not exists public.t2_yb_baho (
  id bigserial primary key,
  bron_id bigint not null references public.t2_yb_bron(id) on delete cascade,
  kimdan_turi text not null check (kimdan_turi in ('ega', 'tashuvchi')),
  kimdan_id bigint not null references public.t2_foydalanuvchi(id),
  ball smallint not null check (ball between 1 and 5),
  izoh text check (izoh is null or length(izoh) <= 1000),
  yaratildi timestamptz not null default now(),
  unique (bron_id, kimdan_turi)
);
create table if not exists public.t2_yb_nizo (
  id bigserial primary key,
  bron_id bigint not null references public.t2_yb_bron(id) on delete cascade,
  ochgan_turi text not null check (ochgan_turi in ('ega', 'tashuvchi')),
  ochgan_id bigint not null references public.t2_foydalanuvchi(id),
  sabab text not null check (length(btrim(sabab)) between 3 and 2000),
  holat text not null default 'ochiq' check (holat in ('ochiq', 'hal')),
  qaror text check (qaror is null or qaror in ('tashuvchiga', 'egaga')),
  qaror_izoh text,
  moderator_id bigint references public.t2_foydalanuvchi(id),
  yaratildi timestamptz not null default now(),
  hal_vaqt timestamptz
);
create unique index if not exists t2_yb_nizo_ochiq_uniq on public.t2_yb_nizo (bron_id) where holat = 'ochiq';

-- 8. To'lov ko'zgusi (platforma pulni USHLAMAYDI — litsenziyali provayder; holatni faqat provayder callback o'zgartiradi)
create table if not exists public.t2_yb_tolov (
  id bigserial primary key,
  bron_id bigint not null unique references public.t2_yb_bron(id) on delete cascade,
  yuk_id bigint not null references public.t2_yb_yuk(id) on delete cascade,
  provider text,
  provider_ref text,
  holat text not null default 'kutilmoqda' check (holat in ('kutilmoqda', 'ushlab_turibdi', 'chiqarish_sorovi', 'chiqarildi', 'qaytarish_sorovi', 'qaytarildi', 'muzlatilgan', 'xato', 'bekor')),
  summa_qqs_siz numeric(16, 2) not null check (summa_qqs_siz > 0),
  qqs_foiz numeric(5, 2) not null,
  summa_jami numeric(16, 2) not null,
  komissiya_foiz numeric(6, 3) not null default 0 check (komissiya_foiz >= 0 and komissiya_foiz < 100),
  komissiya_summa numeric(16, 2),
  tashuvchiga_summa numeric(16, 2),
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create table if not exists public.t2_yb_tolov_hodisa (
  operation_id uuid primary key,
  tolov_id bigint not null references public.t2_yb_tolov(id) on delete cascade,
  hodisa text not null,
  provider_ref text,
  natija text not null,
  yaratildi timestamptz not null default now()
);

-- 9. O'zgarmas hodisa jurnali
create table if not exists public.t2_yb_hodisa (
  id bigserial primary key,
  yuk_id bigint not null references public.t2_yb_yuk(id) on delete cascade,
  bron_id bigint references public.t2_yb_bron(id) on delete cascade,
  tur text not null check (tur ~ '^[a-z_]{2,40}$'),
  actor_id bigint,
  meta jsonb not null default '{}'::jsonb,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_yb_hodisa_yuk_idx on public.t2_yb_hodisa (yuk_id, id);
create or replace function public._t2_yb_hodisa_ozgarmas() returns trigger language plpgsql as $$
begin raise exception 'YB_HODISA_OZGARMAS' using errcode = '42501'; end $$;
drop trigger if exists t2_yb_hodisa_ozgarmas on public.t2_yb_hodisa;
create trigger t2_yb_hodisa_ozgarmas before update or delete on public.t2_yb_hodisa for each row execute function public._t2_yb_hodisa_ozgarmas();

do $rls$ declare t text; begin
  foreach t in array array['t2_yb_operation', 't2_yb_sozlama', 't2_yb_tashuvchi', 't2_yb_mashina', 't2_yb_yuk', 't2_yb_taklif', 't2_yb_bron', 't2_yb_dalil',
    't2_yb_baho', 't2_yb_nizo', 't2_yb_tolov', 't2_yb_tolov_hodisa', 't2_yb_hodisa'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $rls$;

-- ───────────────────────── Yordamchilar ─────────────────────────
create or replace function public._t2_yb_son(j jsonb, k text) returns numeric
language plpgsql immutable set search_path = public, pg_temp as $$
declare v text := nullif(btrim(j ->> k), '');
begin
  if v is null then return null; end if;
  return v::numeric;
exception when others then raise exception 'YB_SON_NOTOGRI:%', k using errcode = '22023';
end $$;

create or replace function public._t2_yb_matn(j jsonb, k text, p_max int default 300) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare v text := nullif(btrim(j ->> k), '');
begin
  if v is null then return null; end if;
  return left(v, p_max);
end $$;

create or replace function public._t2_yb_sana(j jsonb, k text) returns date
language plpgsql immutable set search_path = public, pg_temp as $$
declare v text := nullif(btrim(j ->> k), '');
begin
  if v is null then return null; end if;
  return v::date;
exception when others then raise exception 'YB_SANA_NOTOGRI:%', k using errcode = '22023';
end $$;

create or replace function public._t2_yb_takror(p_actor bigint, p_op uuid, p_amal text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v record;
begin
  if p_op is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select amal, natija into v from public.t2_yb_operation where actor_id = p_actor and operation_id = p_op;
  if found then
    if v.amal <> p_amal then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_CONFLICT'); end if;
    return v.natija || jsonb_build_object('takror', true);
  end if;
  return null;
end $$;

create or replace function public._t2_yb_saqla_op(p_actor bigint, p_op uuid, p_amal text, p_natija jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.t2_yb_operation (actor_id, operation_id, amal, natija) values (p_actor, p_op, p_amal, p_natija) on conflict do nothing;
  return p_natija;
end $$;

create or replace function public._t2_yb_param(p_kalit text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select qiymat from public.t2_yb_sozlama where kalit = p_kalit
$$;

create or replace function public._t2_yb_hodisa(p_yuk bigint, p_bron bigint, p_tur text, p_actor bigint, p_meta jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.t2_yb_hodisa (yuk_id, bron_id, tur, actor_id, meta) values (p_yuk, p_bron, p_tur, p_actor, coalesce(p_meta, '{}'::jsonb));
end $$;

-- Bildirishnoma (t2_outbox → t2_bildirishnoma). Xato bo'lsa biznes amal BUZILMAYDI.
create or replace function public._t2_yb_outbox(p_yuk public.t2_yb_yuk, p_mavzu text, p_actor bigint, p_op uuid, p_foyd bigint[], p_payload jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_outbox_yoz(p_yuk.kompaniya_id, p_mavzu, 't2_yb_yuk', p_yuk.id,
    jsonb_strip_nulls(coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('yuk_id', p_yuk.id, 'holat', p_yuk.holat)),
    p_actor, p_op, null, null, '{}'::bigint[], coalesce(p_foyd, '{}'::bigint[]));
exception when others then
  raise warning 't2_yb outbox xatosi: %', sqlerrm;
end $$;

create or replace function public._t2_yb_tashuvchi_ruxsat(p_t public.t2_yb_tashuvchi, p_actor bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_t.holat = 'faol' and (p_t.foydalanuvchi_id = p_actor
    or (p_t.kompaniya_id is not null and public.t2_permission_allowed_v2(p_t.kompaniya_id, p_actor, 'logistics.dispatch')))
$$;

-- Tashuvchi tomoni: data.tashuvchi_id berilsa o'sha (firma xodimi), aks holda actor o'z profili
create or replace function public._t2_yb_tashuvchi_tanla(p_actor bigint, p_data jsonb) returns public.t2_yb_tashuvchi
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v public.t2_yb_tashuvchi; v_id bigint := public._t2_yb_son(p_data, 'tashuvchi_id')::bigint;
begin
  if v_id is null then
    select * into v from public.t2_yb_tashuvchi where foydalanuvchi_id = p_actor;
  else
    select * into v from public.t2_yb_tashuvchi where id = v_id;
  end if;
  if not found then raise exception 'YB_TASHUVCHI_YOQ' using errcode = 'P0002'; end if;
  if not public._t2_yb_tashuvchi_ruxsat(v, p_actor) then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  return v;
end $$;

create or replace function public._t2_yb_tolov_chiqarish(p_bron bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.t2_yb_tolov set holat = 'chiqarish_sorovi', yangilandi = now(),
    komissiya_summa = round(summa_qqs_siz * komissiya_foiz / 100, 2),
    tashuvchiga_summa = summa_jami - round(summa_qqs_siz * komissiya_foiz / 100, 2)
  where bron_id = p_bron and holat = 'ushlab_turibdi';
end $$;

create or replace function public._t2_yb_tolov_qaytar(p_bron bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.t2_yb_tolov set holat = case when holat = 'kutilmoqda' then 'bekor' else 'qaytarish_sorovi' end, yangilandi = now()
  where bron_id = p_bron and holat in ('kutilmoqda', 'ushlab_turibdi', 'muzlatilgan');
end $$;

create or replace function public._t2_yb_tashuvchi_foydalanuvchilar(p_tashuvchi bigint) returns bigint[]
language sql stable security definer set search_path = public, pg_temp as $$
  select array[foydalanuvchi_id] from public.t2_yb_tashuvchi where id = p_tashuvchi
$$;

-- Bron yaratish (bitta qulf ostida): g'olib taklif, qolganlar rad, escrow qatori, qabul kodi
create or replace function public._t2_yb_bron_yarat(p_yuk_id bigint, p_taklif_id bigint, p_actor bigint, p_op uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare y public.t2_yb_yuk; t public.t2_yb_taklif; m public.t2_yb_mashina; tsh public.t2_yb_tashuvchi; v_bron bigint; v_kod text;
begin
  select * into y from public.t2_yb_yuk where id = p_yuk_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'YUK_TOPILMADI'); end if;
  if y.holat not in ('elon', 'takliflar') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', y.holat); end if;
  select * into t from public.t2_yb_taklif where id = p_taklif_id and yuk_id = y.id and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TAKLIF_TOPILMADI'); end if;
  select * into tsh from public.t2_yb_tashuvchi where id = t.tashuvchi_id;
  if tsh.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'TASHUVCHI_BLOKLANGAN'); end if;
  if t.mashina_id is null then return jsonb_build_object('ok', false, 'code', 'MASHINA_KERAK'); end if;
  select * into m from public.t2_yb_mashina where id = t.mashina_id and tashuvchi_id = t.tashuvchi_id and holat = 'faol';
  if not found then return jsonb_build_object('ok', false, 'code', 'MASHINA_TOPILMADI'); end if;
  if m.yuk_t is not null and y.tonna is not null and m.yuk_t < y.tonna then return jsonb_build_object('ok', false, 'code', 'SIGIM_YETMAYDI'); end if;
  v_kod := lpad((floor(random() * 10000))::int::text, 4, '0');
  update public.t2_yb_taklif set holat = 'qabul' where id = t.id;
  update public.t2_yb_taklif set holat = 'rad' where yuk_id = y.id and holat = 'faol' and id <> t.id;
  insert into public.t2_yb_bron (yuk_id, taklif_id, tashuvchi_id, mashina_id, narx_qqs_siz, qqs_foiz, tolov_shakli, qabul_kod)
  values (y.id, t.id, t.tashuvchi_id, m.id, t.narx_qqs_siz, t.qqs_foiz, case when y.tolov_shakli = 'naqd' then 'naqd' else 'otkazma' end, v_kod)
  returning id into v_bron;
  update public.t2_yb_yuk set holat = 'bron', tanlangan_taklif_id = t.id, versiya = versiya + 1, yangilandi = now() where id = y.id returning * into y;
  if y.escrow then
    insert into public.t2_yb_tolov (bron_id, yuk_id, holat, summa_qqs_siz, qqs_foiz, summa_jami, komissiya_foiz)
    values (v_bron, y.id, 'kutilmoqda', t.narx_qqs_siz, t.qqs_foiz, round(t.narx_qqs_siz * (1 + t.qqs_foiz / 100), 2),
      coalesce((public._t2_yb_param('komissiya_foiz') #>> '{}')::numeric, 0));
  end if;
  perform public._t2_yb_hodisa(y.id, v_bron, 'bron', p_actor, jsonb_build_object('taklif_id', t.id, 'narx_qqs_siz', t.narx_qqs_siz, 'tashuvchi_id', t.tashuvchi_id));
  perform public._t2_yb_outbox(y, 'yuk.bron', p_actor, p_op, array[tsh.foydalanuvchi_id], jsonb_build_object('bron_id', v_bron));
  return jsonb_build_object('ok', true, 'yuk_id', y.id, 'bron_id', v_bron, 'holat', y.holat, 'versiya', y.versiya, 'escrow', y.escrow);
end $$;

-- Yopish (ichki): yetkazildi → yopildi; escrow bo'lsa chiqarish so'rovi
create or replace function public._t2_yb_yop(p_yuk_id bigint, p_actor bigint, p_op uuid, p_sabab text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare y public.t2_yb_yuk; b public.t2_yb_bron;
begin
  select * into y from public.t2_yb_yuk where id = p_yuk_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'YUK_TOPILMADI'); end if;
  select * into b from public.t2_yb_bron where yuk_id = y.id and holat in ('yetkazildi', 'nizo') for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', y.holat); end if;
  update public.t2_yb_bron set holat = 'yopildi' where id = b.id;
  update public.t2_yb_yuk set holat = 'yopildi', yopildi_vaqt = now(), versiya = versiya + 1, yangilandi = now() where id = y.id returning * into y;
  update public.t2_yb_tolov set holat = 'ushlab_turibdi' where bron_id = b.id and holat = 'muzlatilgan';
  perform public._t2_yb_tolov_chiqarish(b.id);
  perform public._t2_yb_hodisa(y.id, b.id, 'yopildi', p_actor, jsonb_build_object('sabab', p_sabab));
  perform public._t2_yb_outbox(y, 'yuk.yopildi', p_actor, p_op, public._t2_yb_tashuvchi_foydalanuvchilar(b.tashuvchi_id), jsonb_build_object('bron_id', b.id));
  return jsonb_build_object('ok', true, 'yuk_id', y.id, 'bron_id', b.id, 'holat', y.holat, 'versiya', y.versiya);
end $$;

-- Baho (ichki): tomon aniqlangan, bron yopilgan yoki yetkazilgan
create or replace function public._t2_yb_baho_yoz(p_bron_id bigint, p_tomon text, p_actor bigint, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.t2_yb_bron; v_ball integer := public._t2_yb_son(p_data, 'ball')::integer; v_tsh bigint;
begin
  select * into b from public.t2_yb_bron where id = p_bron_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  if b.holat not in ('yetkazildi', 'yopildi') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', b.holat); end if;
  if v_ball is null or v_ball not between 1 and 5 then return jsonb_build_object('ok', false, 'code', 'BALL_NOTOGRI'); end if;
  if exists (select 1 from public.t2_yb_baho where bron_id = b.id and kimdan_turi = p_tomon) then return jsonb_build_object('ok', false, 'code', 'BAHO_BERILGAN'); end if;
  insert into public.t2_yb_baho (bron_id, kimdan_turi, kimdan_id, ball, izoh) values (b.id, p_tomon, p_actor, v_ball, public._t2_yb_matn(p_data, 'izoh', 1000));
  if p_tomon = 'ega' then
    v_tsh := b.tashuvchi_id;
    update public.t2_yb_tashuvchi t set reyting_soni = x.soni, reyting_ortacha = round(x.ort, 2)
    from (select count(*) as soni, avg(h.ball) as ort from public.t2_yb_baho h join public.t2_yb_bron br on br.id = h.bron_id
          where br.tashuvchi_id = v_tsh and h.kimdan_turi = 'ega') x where t.id = v_tsh;
  end if;
  perform public._t2_yb_hodisa(b.yuk_id, b.id, 'baho', p_actor, jsonb_build_object('tomon', p_tomon, 'ball', v_ball));
  return jsonb_build_object('ok', true, 'bron_id', b.id);
end $$;

-- Nizo ochish (ichki)
create or replace function public._t2_yb_nizo_och(p_bron_id bigint, p_tomon text, p_actor bigint, p_data jsonb, p_op uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.t2_yb_bron; y public.t2_yb_yuk; v_sabab text := public._t2_yb_matn(p_data, 'sabab', 2000); v_id bigint;
begin
  select * into b from public.t2_yb_bron where id = p_bron_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  if b.holat not in ('yolda', 'yetkazildi') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', b.holat); end if;
  if v_sabab is null or length(v_sabab) < 3 then return jsonb_build_object('ok', false, 'code', 'SABAB_KERAK'); end if;
  insert into public.t2_yb_nizo (bron_id, ochgan_turi, ochgan_id, sabab) values (b.id, p_tomon, p_actor, v_sabab) returning id into v_id;
  update public.t2_yb_bron set holat = 'nizo' where id = b.id;
  update public.t2_yb_yuk set holat = 'nizo', versiya = versiya + 1, yangilandi = now() where id = b.yuk_id returning * into y;
  update public.t2_yb_tolov set holat = 'muzlatilgan', yangilandi = now() where bron_id = b.id and holat = 'ushlab_turibdi';
  perform public._t2_yb_hodisa(b.yuk_id, b.id, 'nizo', p_actor, jsonb_build_object('nizo_id', v_id, 'tomon', p_tomon));
  perform public._t2_yb_outbox(y, 'yuk.nizo', p_actor, p_op, public._t2_yb_tashuvchi_foydalanuvchilar(b.tashuvchi_id), jsonb_build_object('bron_id', b.id));
  return jsonb_build_object('ok', true, 'nizo_id', v_id, 'bron_id', b.id);
end $$;

-- ───────────────────────── YUK EGASI TOMONI (kompaniya a'zosi) ─────────────────────────
-- Imzo: (p_kompaniya_id, p_actor_id, p_operation_id, p_data). Ruxsat: procurement.write | procurement.approve (yangi capability yo'q).
create or replace function public.t2_yb_yuk_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; v_id bigint := public._t2_yb_son(p_data, 'id')::bigint; v_ver integer := public._t2_yb_son(p_data, 'versiya')::integer; v_n integer;
  v_nom text := public._t2_yb_matn(p_data, 'nom', 200); v_tolov text := coalesce(public._t2_yb_matn(p_data, 'tolov_shakli', 20), 'otkazma');
  v_escrow boolean := coalesce((p_data ->> 'escrow')::boolean, false); v_tonna numeric := public._t2_yb_son(p_data, 'tonna');
  v_ao bigint := public._t2_yb_son(p_data, 'a_obyekt_id')::bigint; v_bo bigint := public._t2_yb_son(p_data, 'b_obyekt_id')::bigint;
  v_qqs numeric := coalesce(public._t2_yb_son(p_data, 'qqs_foiz'), (public._t2_yb_param('qqs_foiz') #>> '{}')::numeric, 12);
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.write');
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'yuk_saqla'); if v_t is not null then return v_t; end if;
  if v_nom is null then return jsonb_build_object('ok', false, 'code', 'NOM_REQUIRED'); end if;
  if v_tolov not in ('naqd', 'otkazma', 'ikkalasi') then return jsonb_build_object('ok', false, 'code', 'TOLOV_SHAKLI_NOTOGRI'); end if;
  if v_escrow and v_tolov <> 'otkazma' then return jsonb_build_object('ok', false, 'code', 'ESCROW_FAQAT_OTKAZMA'); end if;
  if v_tonna is not null and v_tonna <= 0 then return jsonb_build_object('ok', false, 'code', 'TONNA_NOTOGRI'); end if;
  if v_qqs < 0 or v_qqs >= 100 then return jsonb_build_object('ok', false, 'code', 'QQS_NOTOGRI'); end if;
  if v_ao is not null and not exists (select 1 from public.t2_obyekt where id = v_ao and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH'); end if;
  if v_bo is not null and not exists (select 1 from public.t2_obyekt where id = v_bo and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH'); end if;
  if v_id is null then
    insert into public.t2_yb_yuk (kompaniya_id, yaratuvchi_id, nom, yuk_turi, a_nom, a_lat, a_lng, a_obyekt_id, b_nom, b_lat, b_lng, b_obyekt_id, masofa_km, tonna, hajm_m3,
      sana_dan, sana_gacha, tolov_shakli, escrow, narx_taklif_qqs_siz, narx_tavsiya_qqs_siz, narx_hisob, qqs_foiz, izoh)
    values (p_kompaniya_id, p_actor_id, v_nom, coalesce(public._t2_yb_matn(p_data, 'yuk_turi', 20), 'sochma'),
      public._t2_yb_matn(p_data, 'a_nom', 200), public._t2_yb_son(p_data, 'a_lat'), public._t2_yb_son(p_data, 'a_lng'), v_ao,
      public._t2_yb_matn(p_data, 'b_nom', 200), public._t2_yb_son(p_data, 'b_lat'), public._t2_yb_son(p_data, 'b_lng'), v_bo,
      public._t2_yb_son(p_data, 'masofa_km'), v_tonna, public._t2_yb_son(p_data, 'hajm_m3'),
      public._t2_yb_sana(p_data, 'sana_dan'), public._t2_yb_sana(p_data, 'sana_gacha'), v_tolov, v_escrow,
      public._t2_yb_son(p_data, 'narx_taklif_qqs_siz'), public._t2_yb_son(p_data, 'narx_tavsiya_qqs_siz'),
      case when jsonb_typeof(p_data -> 'narx_hisob') = 'object' then p_data -> 'narx_hisob' else null end, v_qqs, public._t2_yb_matn(p_data, 'izoh', 2000))
    returning id into v_id;
    v_ver := 1;
    perform public._t2_yb_hodisa(v_id, null, 'yaratildi', p_actor_id);
  else
    update public.t2_yb_yuk set nom = v_nom, yuk_turi = coalesce(public._t2_yb_matn(p_data, 'yuk_turi', 20), yuk_turi),
      a_nom = public._t2_yb_matn(p_data, 'a_nom', 200), a_lat = public._t2_yb_son(p_data, 'a_lat'), a_lng = public._t2_yb_son(p_data, 'a_lng'), a_obyekt_id = v_ao,
      b_nom = public._t2_yb_matn(p_data, 'b_nom', 200), b_lat = public._t2_yb_son(p_data, 'b_lat'), b_lng = public._t2_yb_son(p_data, 'b_lng'), b_obyekt_id = v_bo,
      masofa_km = public._t2_yb_son(p_data, 'masofa_km'), tonna = v_tonna, hajm_m3 = public._t2_yb_son(p_data, 'hajm_m3'),
      sana_dan = public._t2_yb_sana(p_data, 'sana_dan'), sana_gacha = public._t2_yb_sana(p_data, 'sana_gacha'), tolov_shakli = v_tolov, escrow = v_escrow,
      narx_taklif_qqs_siz = public._t2_yb_son(p_data, 'narx_taklif_qqs_siz'), narx_tavsiya_qqs_siz = public._t2_yb_son(p_data, 'narx_tavsiya_qqs_siz'),
      narx_hisob = case when jsonb_typeof(p_data -> 'narx_hisob') = 'object' then p_data -> 'narx_hisob' else null end,
      qqs_foiz = v_qqs, izoh = public._t2_yb_matn(p_data, 'izoh', 2000), versiya = versiya + 1, yangilandi = now()
    where id = v_id and kompaniya_id = p_kompaniya_id and versiya = v_ver and holat = 'qoralama';
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'code', case
        when not exists (select 1 from public.t2_yb_yuk where id = v_id and kompaniya_id = p_kompaniya_id) then 'NOT_FOUND'
        when exists (select 1 from public.t2_yb_yuk where id = v_id and kompaniya_id = p_kompaniya_id and holat <> 'qoralama') then 'HOLAT'
        else 'VERSION_CONFLICT' end);
    end if;
    v_ver := v_ver + 1;
  end if;
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'yuk_saqla', jsonb_build_object('ok', true, 'id', v_id, 'versiya', v_ver));
end $$;

create or replace function public.t2_yb_yuk_elon_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; y public.t2_yb_yuk; v_id bigint := public._t2_yb_son(p_data, 'id')::bigint; v_ver integer := public._t2_yb_son(p_data, 'versiya')::integer;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.write');
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'yuk_elon'); if v_t is not null then return v_t; end if;
  select * into y from public.t2_yb_yuk where id = v_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if y.versiya <> v_ver then return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT'); end if;
  if y.holat <> 'qoralama' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', y.holat); end if;
  if y.a_nom is null or y.b_nom is null then return jsonb_build_object('ok', false, 'code', 'MARSHRUT_KERAK'); end if;
  if y.tonna is null and y.hajm_m3 is null then return jsonb_build_object('ok', false, 'code', 'HAJM_KERAK'); end if;
  if y.sana_dan is null then return jsonb_build_object('ok', false, 'code', 'SANA_KERAK'); end if;
  if y.sana_gacha is not null and y.sana_gacha < y.sana_dan then return jsonb_build_object('ok', false, 'code', 'SANA_NOTOGRI'); end if;
  update public.t2_yb_yuk set holat = 'elon', elon_vaqt = now(), versiya = versiya + 1, yangilandi = now() where id = y.id returning * into y;
  perform public._t2_yb_hodisa(y.id, null, 'elon', p_actor_id);
  perform public._t2_yb_outbox(y, 'yuk.elon', p_actor_id, p_operation_id, '{}'::bigint[]);
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'yuk_elon', jsonb_build_object('ok', true, 'id', y.id, 'versiya', y.versiya, 'holat', y.holat));
end $$;

-- Taklifga javob: qabul (→ bron) | qarshi (qarshi taklif) | rad
create or replace function public.t2_yb_yuk_javob_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; y public.t2_yb_yuk; t public.t2_yb_taklif; v_harakat text := public._t2_yb_matn(p_data, 'harakat', 20);
  v_narx numeric := public._t2_yb_son(p_data, 'narx_qqs_siz'); v_r jsonb; v_new bigint;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.approve');
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'yuk_javob'); if v_t is not null then return v_t; end if;
  if v_harakat is null or v_harakat not in ('qabul', 'qarshi', 'rad') then return jsonb_build_object('ok', false, 'code', 'HARAKAT_NOTOGRI'); end if;
  select * into y from public.t2_yb_yuk where id = public._t2_yb_son(p_data, 'yuk_id')::bigint and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if y.holat not in ('elon', 'takliflar') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', y.holat); end if;
  select * into t from public.t2_yb_taklif where id = public._t2_yb_son(p_data, 'taklif_id')::bigint and yuk_id = y.id and holat = 'faol' and kimdan = 'tashuvchi' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TAKLIF_TOPILMADI'); end if;
  if v_harakat = 'qabul' then
    v_r := public._t2_yb_bron_yarat(y.id, t.id, p_actor_id, p_operation_id);
    if not (v_r ->> 'ok')::boolean then return v_r; end if;
    return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'yuk_javob', v_r);
  elsif v_harakat = 'rad' then
    update public.t2_yb_taklif set holat = 'rad' where id = t.id;
    if not exists (select 1 from public.t2_yb_taklif where yuk_id = y.id and holat = 'faol') then
      update public.t2_yb_yuk set holat = 'elon', versiya = versiya + 1, yangilandi = now() where id = y.id returning * into y;
    end if;
    perform public._t2_yb_hodisa(y.id, null, 'taklif_rad', p_actor_id, jsonb_build_object('taklif_id', t.id));
    return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'yuk_javob', jsonb_build_object('ok', true, 'yuk_id', y.id, 'holat', y.holat));
  end if;
  if v_narx is null or v_narx <= 0 then return jsonb_build_object('ok', false, 'code', 'NARX_KERAK'); end if;
  update public.t2_yb_taklif set holat = 'eskirdi' where id = t.id;
  insert into public.t2_yb_taklif (yuk_id, tashuvchi_id, mashina_id, kimdan, raund, ota_taklif_id, narx_qqs_siz, qqs_foiz, izoh)
  values (y.id, t.tashuvchi_id, t.mashina_id, 'ega', t.raund + 1, t.id, v_narx, t.qqs_foiz, public._t2_yb_matn(p_data, 'izoh', 1000)) returning id into v_new;
  perform public._t2_yb_hodisa(y.id, null, 'qarshi_taklif', p_actor_id, jsonb_build_object('taklif_id', v_new, 'narx_qqs_siz', v_narx));
  perform public._t2_yb_outbox(y, 'yuk.taklif', p_actor_id, p_operation_id, public._t2_yb_tashuvchi_foydalanuvchilar(t.tashuvchi_id), jsonb_build_object('taklif_id', v_new));
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'yuk_javob', jsonb_build_object('ok', true, 'yuk_id', y.id, 'taklif_id', v_new, 'holat', y.holat));
end $$;

create or replace function public.t2_yb_yuk_bekor_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; y public.t2_yb_yuk; b public.t2_yb_bron; v_sabab text := public._t2_yb_matn(p_data, 'sabab', 1000);
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.write');
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'yuk_bekor'); if v_t is not null then return v_t; end if;
  select * into y from public.t2_yb_yuk where id = public._t2_yb_son(p_data, 'yuk_id')::bigint and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if y.holat = 'bron' then
    if v_sabab is null then return jsonb_build_object('ok', false, 'code', 'SABAB_KERAK'); end if;
    select * into b from public.t2_yb_bron where yuk_id = y.id and holat = 'bron' for update;
    update public.t2_yb_bron set holat = 'bekor', bekor_kim = 'ega', bekor_sabab = v_sabab where id = b.id;
    perform public._t2_yb_tolov_qaytar(b.id);
    perform public._t2_yb_outbox(y, 'yuk.bekor', p_actor_id, p_operation_id, public._t2_yb_tashuvchi_foydalanuvchilar(b.tashuvchi_id), jsonb_build_object('bron_id', b.id));
  elsif y.holat not in ('qoralama', 'elon', 'takliflar') then
    return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', y.holat);
  end if;
  update public.t2_yb_taklif set holat = 'rad' where yuk_id = y.id and holat = 'faol';
  update public.t2_yb_yuk set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = y.id returning * into y;
  perform public._t2_yb_hodisa(y.id, b.id, 'bekor', p_actor_id, jsonb_build_object('kim', 'ega', 'sabab', v_sabab));
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'yuk_bekor', jsonb_build_object('ok', true, 'id', y.id, 'holat', y.holat, 'versiya', y.versiya));
end $$;

-- Yetkazib berildi → yopildi (ega tasdig'i)
create or replace function public.t2_yb_yuk_tasdiq_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; y public.t2_yb_yuk; v_r jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.approve');
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'yuk_tasdiq'); if v_t is not null then return v_t; end if;
  select * into y from public.t2_yb_yuk where id = public._t2_yb_son(p_data, 'yuk_id')::bigint and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if y.holat <> 'yetkazildi' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', y.holat); end if;
  v_r := public._t2_yb_yop(y.id, p_actor_id, p_operation_id, 'ega_tasdiqladi');
  if (v_r ->> 'ok')::boolean then return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'yuk_tasdiq', v_r); end if;
  return v_r;
end $$;

create or replace function public.t2_yb_yuk_baho_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; v_r jsonb; b public.t2_yb_bron;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.write');
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'yuk_baho'); if v_t is not null then return v_t; end if;
  select b2.* into b from public.t2_yb_bron b2 join public.t2_yb_yuk y on y.id = b2.yuk_id
   where b2.id = public._t2_yb_son(p_data, 'bron_id')::bigint and y.kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  v_r := public._t2_yb_baho_yoz(b.id, 'ega', p_actor_id, p_data);
  if (v_r ->> 'ok')::boolean then return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'yuk_baho', v_r); end if;
  return v_r;
end $$;

create or replace function public.t2_yb_yuk_nizo_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; v_r jsonb; b public.t2_yb_bron;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.write');
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'yuk_nizo'); if v_t is not null then return v_t; end if;
  select b2.* into b from public.t2_yb_bron b2 join public.t2_yb_yuk y on y.id = b2.yuk_id
   where b2.id = public._t2_yb_son(p_data, 'bron_id')::bigint and y.kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  v_r := public._t2_yb_nizo_och(b.id, 'ega', p_actor_id, p_data, p_operation_id);
  if (v_r ->> 'ok')::boolean then return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'yuk_nizo', v_r); end if;
  return v_r;
end $$;

-- ───────────────────────── TASHUVCHI TOMONI (yakka haydovchi + firma xodimi) — FAQAT service_role (bot/API) ─────────────────────────
-- Imzo: (p_actor_id = foydalanuvchi, p_operation_id, p_data). Yakka haydovchida kompaniya yo'q; firma xodimi uchun data.tashuvchi_id + logistics.dispatch.
create or replace function public.t2_yb_tashuvchi_saqla_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; tsh public.t2_yb_tashuvchi; v_ism text := public._t2_yb_matn(p_data, 'ism', 200); v_kid bigint := public._t2_yb_son(p_data, 'kompaniya_id')::bigint;
  v_tur text; v_raqam text := public._t2_yb_matn(p_data, 'davlat_raqami', 30); v_mid bigint;
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'tashuvchi_saqla'); if v_t is not null then return v_t; end if;
  if v_ism is null then return jsonb_build_object('ok', false, 'code', 'ISM_KERAK'); end if;
  v_tur := case when v_kid is null then 'yakka' else 'firma' end;
  if v_kid is not null then
    if not public.t2_permission_allowed_v2(v_kid, p_actor_id, 'logistics.dispatch') then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  end if;
  select * into tsh from public.t2_yb_tashuvchi where foydalanuvchi_id = p_actor_id for update;
  if not found then
    insert into public.t2_yb_tashuvchi (foydalanuvchi_id, kompaniya_id, tur, ism, telefon) values (p_actor_id, v_kid, v_tur, v_ism, public._t2_yb_matn(p_data, 'telefon', 30)) returning * into tsh;
  else
    update public.t2_yb_tashuvchi set ism = v_ism, telefon = coalesce(public._t2_yb_matn(p_data, 'telefon', 30), telefon), kompaniya_id = v_kid, tur = v_tur,
      versiya = versiya + 1 where id = tsh.id returning * into tsh;
  end if;
  if v_raqam is not null then
    insert into public.t2_yb_mashina (tashuvchi_id, davlat_raqami, turi, yuk_t, yuk_m3)
    values (tsh.id, v_raqam, coalesce(public._t2_yb_matn(p_data, 'turi', 20), 'yuk'), public._t2_yb_son(p_data, 'yuk_t'), public._t2_yb_son(p_data, 'yuk_m3'))
    on conflict (tashuvchi_id, davlat_raqami) do update set turi = excluded.turi, yuk_t = excluded.yuk_t, yuk_m3 = excluded.yuk_m3, holat = 'faol'
    returning id into v_mid;
  end if;
  if tsh.daraja = 0 and exists (select 1 from public.t2_yb_mashina where tashuvchi_id = tsh.id and holat = 'faol' and yuk_t is not null) then
    update public.t2_yb_tashuvchi set daraja = 1 where id = tsh.id returning * into tsh;
  end if;
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'tashuvchi_saqla', jsonb_build_object('ok', true, 'tashuvchi_id', tsh.id, 'mashina_id', v_mid, 'daraja', tsh.daraja, 'tur', tsh.tur));
end $$;

-- Taklif / bron (qat'iy narxda) / eganing qarshi taklifini qabul / qaytarib olish
create or replace function public.t2_yb_taklif_ber_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; tsh public.t2_yb_tashuvchi; y public.t2_yb_yuk; o public.t2_yb_taklif; v_harakat text := coalesce(public._t2_yb_matn(p_data, 'harakat', 20), 'taklif');
  v_narx numeric := public._t2_yb_son(p_data, 'narx_qqs_siz'); v_mid bigint := public._t2_yb_son(p_data, 'mashina_id')::bigint; v_qqs numeric := public._t2_yb_son(p_data, 'qqs_foiz');
  v_new bigint; v_raund integer; v_r jsonb;
begin
  tsh := public._t2_yb_tashuvchi_tanla(p_actor_id, p_data);
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'taklif_ber'); if v_t is not null then return v_t; end if;
  if v_harakat not in ('taklif', 'bron', 'qabul', 'qaytar') then return jsonb_build_object('ok', false, 'code', 'HARAKAT_NOTOGRI'); end if;
  select * into y from public.t2_yb_yuk where id = public._t2_yb_son(p_data, 'yuk_id')::bigint for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'YUK_TOPILMADI'); end if;
  if v_harakat = 'qaytar' then
    update public.t2_yb_taklif set holat = 'qaytarildi' where yuk_id = y.id and tashuvchi_id = tsh.id and holat = 'faol';
    if not exists (select 1 from public.t2_yb_taklif where yuk_id = y.id and holat = 'faol') and y.holat = 'takliflar' then
      update public.t2_yb_yuk set holat = 'elon', versiya = versiya + 1, yangilandi = now() where id = y.id;
    end if;
    return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'taklif_ber', jsonb_build_object('ok', true, 'yuk_id', y.id));
  end if;
  if y.holat not in ('elon', 'takliflar') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', y.holat); end if;
  if tsh.daraja < 1 then return jsonb_build_object('ok', false, 'code', 'DARAJA_YETARLI_EMAS'); end if;
  if v_mid is null then select id into v_mid from public.t2_yb_mashina where tashuvchi_id = tsh.id and holat = 'faol' order by id limit 1; end if;
  if v_mid is null or not exists (select 1 from public.t2_yb_mashina where id = v_mid and tashuvchi_id = tsh.id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'MASHINA_KERAK');
  end if;
  v_qqs := coalesce(v_qqs, y.qqs_foiz);
  if v_qqs < 0 or v_qqs >= 100 then return jsonb_build_object('ok', false, 'code', 'QQS_NOTOGRI'); end if;
  if v_harakat = 'qabul' then
    select * into o from public.t2_yb_taklif where id = public._t2_yb_son(p_data, 'taklif_id')::bigint and yuk_id = y.id and tashuvchi_id = tsh.id and kimdan = 'ega' and holat = 'faol' for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'TAKLIF_TOPILMADI'); end if;
    v_r := public._t2_yb_bron_yarat(y.id, o.id, p_actor_id, p_operation_id);
    if (v_r ->> 'ok')::boolean then return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'taklif_ber', v_r); end if;
    return v_r;
  end if;
  if v_harakat = 'bron' then
    if y.narx_taklif_qqs_siz is null then return jsonb_build_object('ok', false, 'code', 'QATIY_NARX_YOQ'); end if;
    v_narx := y.narx_taklif_qqs_siz;
  end if;
  if v_narx is null or v_narx <= 0 then return jsonb_build_object('ok', false, 'code', 'NARX_KERAK'); end if;
  select coalesce(max(raund), 0) + 1 into v_raund from public.t2_yb_taklif where yuk_id = y.id and tashuvchi_id = tsh.id;
  update public.t2_yb_taklif set holat = 'eskirdi' where yuk_id = y.id and tashuvchi_id = tsh.id and holat = 'faol';
  insert into public.t2_yb_taklif (yuk_id, tashuvchi_id, mashina_id, kimdan, raund, narx_qqs_siz, qqs_foiz, izoh)
  values (y.id, tsh.id, v_mid, 'tashuvchi', v_raund, v_narx, v_qqs, public._t2_yb_matn(p_data, 'izoh', 1000)) returning id into v_new;
  if y.holat = 'elon' then update public.t2_yb_yuk set holat = 'takliflar', versiya = versiya + 1, yangilandi = now() where id = y.id returning * into y; end if;
  perform public._t2_yb_hodisa(y.id, null, 'taklif', p_actor_id, jsonb_build_object('taklif_id', v_new, 'narx_qqs_siz', v_narx, 'raund', v_raund, 'tashuvchi_id', tsh.id));
  perform public._t2_yb_outbox(y, 'yuk.taklif', p_actor_id, p_operation_id, '{}'::bigint[], jsonb_build_object('taklif_id', v_new));
  if v_harakat = 'bron' then
    v_r := public._t2_yb_bron_yarat(y.id, v_new, p_actor_id, p_operation_id);
    if (v_r ->> 'ok')::boolean then return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'taklif_ber', v_r); end if;
    raise exception 'YB_BRON_RAD:%', v_r ->> 'code' using errcode = 'P0001';
  end if;
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'taklif_ber', jsonb_build_object('ok', true, 'yuk_id', y.id, 'taklif_id', v_new, 'raund', v_raund, 'holat', y.holat));
end $$;

-- Yo'lda / yetkazildi (haydovchi harakati). Yuklash: dalil (foto/kod) kerak; escrow bo'lsa pul ushlangan bo'lishi shart.
create or replace function public.t2_yb_yuritish_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; tsh public.t2_yb_tashuvchi; b public.t2_yb_bron; y public.t2_yb_yuk; v_harakat text := public._t2_yb_matn(p_data, 'harakat', 20); v_kod text := public._t2_yb_matn(p_data, 'kod', 10);
begin
  tsh := public._t2_yb_tashuvchi_tanla(p_actor_id, p_data);
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'yuritish'); if v_t is not null then return v_t; end if;
  if v_harakat is null or v_harakat not in ('yukladim', 'yetkazdim') then return jsonb_build_object('ok', false, 'code', 'HARAKAT_NOTOGRI'); end if;
  select * into b from public.t2_yb_bron where id = public._t2_yb_son(p_data, 'bron_id')::bigint and tashuvchi_id = tsh.id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  select * into y from public.t2_yb_yuk where id = b.yuk_id for update;
  if v_harakat = 'yukladim' then
    if b.holat <> 'bron' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', b.holat); end if;
    if y.escrow and not exists (select 1 from public.t2_yb_tolov where bron_id = b.id and holat = 'ushlab_turibdi') then return jsonb_build_object('ok', false, 'code', 'TOLOV_USHLANMAGAN'); end if;
    if not exists (select 1 from public.t2_yb_dalil where bron_id = b.id and tur = 'yuklash') then return jsonb_build_object('ok', false, 'code', 'DALIL_KERAK'); end if;
    update public.t2_yb_bron set holat = 'yolda', yuklandi_vaqt = now() where id = b.id;
    update public.t2_yb_yuk set holat = 'yolda', versiya = versiya + 1, yangilandi = now() where id = y.id returning * into y;
    perform public._t2_yb_hodisa(y.id, b.id, 'yolda', p_actor_id);
    perform public._t2_yb_outbox(y, 'yuk.yolda', p_actor_id, p_operation_id, '{}'::bigint[], jsonb_build_object('bron_id', b.id));
    return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'yuritish', jsonb_build_object('ok', true, 'bron_id', b.id, 'holat', y.holat));
  end if;
  if b.holat <> 'yolda' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', b.holat); end if;
  if v_kod is not null and v_kod <> b.qabul_kod then
    perform public._t2_yb_hodisa(y.id, b.id, 'kod_xato', p_actor_id);
    return jsonb_build_object('ok', false, 'code', 'KOD_NOTOGRI');
  end if;
  if v_kod is null and not exists (select 1 from public.t2_yb_dalil where bron_id = b.id and tur = 'yetkazish') then return jsonb_build_object('ok', false, 'code', 'DALIL_KERAK'); end if;
  update public.t2_yb_bron set holat = 'yetkazildi', yetkazildi_vaqt = now() where id = b.id;
  update public.t2_yb_yuk set holat = 'yetkazildi', versiya = versiya + 1, yangilandi = now() where id = y.id returning * into y;
  perform public._t2_yb_hodisa(y.id, b.id, 'yetkazildi', p_actor_id, jsonb_build_object('kod_bilan', v_kod is not null));
  perform public._t2_yb_outbox(y, 'yuk.yetkazildi', p_actor_id, p_operation_id, '{}'::bigint[], jsonb_build_object('bron_id', b.id));
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'yuritish', jsonb_build_object('ok', true, 'bron_id', b.id, 'holat', y.holat));
end $$;

-- Isbot fayli (R2 kaliti + sha256, yoki t2_document_registry id)
create or replace function public.t2_yb_dalil_qosh_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; tsh public.t2_yb_tashuvchi; b public.t2_yb_bron; v_tur text := public._t2_yb_matn(p_data, 'tur', 20); v_key text := public._t2_yb_matn(p_data, 'r2_kalit', 500);
  v_sha text := lower(public._t2_yb_matn(p_data, 'sha256', 64)); v_doc bigint := public._t2_yb_son(p_data, 'document_id')::bigint; v_id bigint;
begin
  tsh := public._t2_yb_tashuvchi_tanla(p_actor_id, p_data);
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'dalil_qosh'); if v_t is not null then return v_t; end if;
  if v_tur is null or v_tur not in ('yuklash', 'yetkazish', 'nizo') then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  if v_key is null and v_doc is null then return jsonb_build_object('ok', false, 'code', 'FAYL_KERAK'); end if;
  if v_sha is not null and v_sha !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'code', 'SHA_NOTOGRI'); end if;
  select * into b from public.t2_yb_bron where id = public._t2_yb_son(p_data, 'bron_id')::bigint and tashuvchi_id = tsh.id;
  if not found then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  if b.holat not in ('bron', 'yolda', 'yetkazildi', 'nizo') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', b.holat); end if;
  if (select count(*) from public.t2_yb_dalil where bron_id = b.id) >= 20 then return jsonb_build_object('ok', false, 'code', 'FAYL_CHEGARA'); end if;
  insert into public.t2_yb_dalil (bron_id, tur, document_id, r2_kalit, sha256, yaratuvchi_id) values (b.id, v_tur, v_doc, v_key, v_sha, p_actor_id) returning id into v_id;
  perform public._t2_yb_hodisa(b.yuk_id, b.id, 'dalil', p_actor_id, jsonb_build_object('tur', v_tur, 'dalil_id', v_id));
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'dalil_qosh', jsonb_build_object('ok', true, 'dalil_id', v_id));
end $$;

create or replace function public.t2_yb_tashuvchi_baho_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; tsh public.t2_yb_tashuvchi; v_r jsonb;
begin
  tsh := public._t2_yb_tashuvchi_tanla(p_actor_id, p_data);
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'tashuvchi_baho'); if v_t is not null then return v_t; end if;
  if not exists (select 1 from public.t2_yb_bron where id = public._t2_yb_son(p_data, 'bron_id')::bigint and tashuvchi_id = tsh.id) then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  v_r := public._t2_yb_baho_yoz(public._t2_yb_son(p_data, 'bron_id')::bigint, 'tashuvchi', p_actor_id, p_data);
  if (v_r ->> 'ok')::boolean then return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'tashuvchi_baho', v_r); end if;
  return v_r;
end $$;

create or replace function public.t2_yb_tashuvchi_nizo_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; tsh public.t2_yb_tashuvchi; v_r jsonb;
begin
  tsh := public._t2_yb_tashuvchi_tanla(p_actor_id, p_data);
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'tashuvchi_nizo'); if v_t is not null then return v_t; end if;
  if not exists (select 1 from public.t2_yb_bron where id = public._t2_yb_son(p_data, 'bron_id')::bigint and tashuvchi_id = tsh.id) then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  v_r := public._t2_yb_nizo_och(public._t2_yb_son(p_data, 'bron_id')::bigint, 'tashuvchi', p_actor_id, p_data, p_operation_id);
  if (v_r ->> 'ok')::boolean then return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'tashuvchi_nizo', v_r); end if;
  return v_r;
end $$;

-- Tashuvchi bronni yuklashdan oldin bekor qiladi: yuk qayta e'longa chiqadi, bekor_soni oshadi
create or replace function public.t2_yb_bron_bekor_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; tsh public.t2_yb_tashuvchi; b public.t2_yb_bron; y public.t2_yb_yuk; v_sabab text := public._t2_yb_matn(p_data, 'sabab', 1000);
begin
  tsh := public._t2_yb_tashuvchi_tanla(p_actor_id, p_data);
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'bron_bekor'); if v_t is not null then return v_t; end if;
  if v_sabab is null then return jsonb_build_object('ok', false, 'code', 'SABAB_KERAK'); end if;
  select * into b from public.t2_yb_bron where id = public._t2_yb_son(p_data, 'bron_id')::bigint and tashuvchi_id = tsh.id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  if b.holat <> 'bron' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', b.holat); end if;
  update public.t2_yb_bron set holat = 'bekor', bekor_kim = 'tashuvchi', bekor_sabab = v_sabab where id = b.id;
  update public.t2_yb_tashuvchi set bekor_soni = bekor_soni + 1 where id = tsh.id;
  perform public._t2_yb_tolov_qaytar(b.id);
  update public.t2_yb_yuk set holat = 'elon', tanlangan_taklif_id = null, versiya = versiya + 1, yangilandi = now() where id = b.yuk_id returning * into y;
  perform public._t2_yb_hodisa(y.id, b.id, 'bron_bekor', p_actor_id, jsonb_build_object('kim', 'tashuvchi', 'sabab', v_sabab));
  perform public._t2_yb_outbox(y, 'yuk.bekor', p_actor_id, p_operation_id, '{}'::bigint[], jsonb_build_object('bron_id', b.id));
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'bron_bekor', jsonb_build_object('ok', true, 'yuk_id', y.id, 'holat', y.holat));
end $$;

-- ───────────────────────── PROVAYDER CALLBACK, MODERATOR, MUDDAT (service_role) ─────────────────────────
-- Provayder (yoki STUB) hodisasi: hold_ok | hold_xato | release_ok | refund_ok. Idempotent: operation_id (provayder hodisa id).
create or replace function public.t2_yb_tolov_hodisa_v1(p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.t2_yb_tolov; v_h text := public._t2_yb_matn(p_data, 'hodisa', 20); v_ref text := public._t2_yb_matn(p_data, 'provider_ref', 200); v_new text; v_prev record;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_prev from public.t2_yb_tolov_hodisa where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'natija', v_prev.natija); end if;
  select * into v from public.t2_yb_tolov where id = public._t2_yb_son(p_data, 'tolov_id')::bigint for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOLOV_TOPILMADI'); end if;
  v_new := case
    when v_h = 'hold_ok' and v.holat = 'kutilmoqda' then 'ushlab_turibdi'
    when v_h = 'hold_xato' and v.holat = 'kutilmoqda' then 'xato'
    when v_h = 'release_ok' and v.holat = 'chiqarish_sorovi' then 'chiqarildi'
    when v_h = 'refund_ok' and v.holat = 'qaytarish_sorovi' then 'qaytarildi'
    else null end;
  if v_new is null then return jsonb_build_object('ok', false, 'code', 'HOLAT_O_TISH_NOTOGRI', 'hodisa', v_h, 'holat', v.holat); end if;
  update public.t2_yb_tolov set holat = v_new, provider = coalesce(public._t2_yb_matn(p_data, 'provider', 40), provider), provider_ref = coalesce(v_ref, provider_ref), yangilandi = now() where id = v.id;
  insert into public.t2_yb_tolov_hodisa (operation_id, tolov_id, hodisa, provider_ref, natija) values (p_operation_id, v.id, v_h, v_ref, v_new);
  perform public._t2_yb_hodisa(v.yuk_id, v.bron_id, 'tolov_' || v_new, null, jsonb_build_object('hodisa', v_h));
  return jsonb_build_object('ok', true, 'tolov_id', v.id, 'natija', v_new);
end $$;

-- Moderator nizoni hal qiladi (superadmin): tashuvchiga (chiqarish) yoki egaga (qaytarish)
create or replace function public.t2_yb_nizo_hal_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; n public.t2_yb_nizo; b public.t2_yb_bron; y public.t2_yb_yuk; v_q text := public._t2_yb_matn(p_data, 'qaror', 20); v_r jsonb;
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'nizo_hal'); if v_t is not null then return v_t; end if;
  if v_q is null or v_q not in ('tashuvchiga', 'egaga') then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI'); end if;
  select * into n from public.t2_yb_nizo where id = public._t2_yb_son(p_data, 'nizo_id')::bigint and holat = 'ochiq' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NIZO_TOPILMADI'); end if;
  select * into b from public.t2_yb_bron where id = n.bron_id for update;
  update public.t2_yb_nizo set holat = 'hal', qaror = v_q, qaror_izoh = public._t2_yb_matn(p_data, 'izoh', 2000), moderator_id = p_actor_id, hal_vaqt = now() where id = n.id;
  if v_q = 'tashuvchiga' then
    v_r := public._t2_yb_yop(b.yuk_id, p_actor_id, p_operation_id, 'nizo_tashuvchiga');
    if not (v_r ->> 'ok')::boolean then raise exception 'YB_NIZO_YOP:%', v_r ->> 'code' using errcode = 'P0001'; end if;
  else
    update public.t2_yb_bron set holat = 'bekor', bekor_kim = 'tashuvchi', bekor_sabab = 'nizo_egaga' where id = b.id;
    update public.t2_yb_yuk set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = b.yuk_id returning * into y;
    perform public._t2_yb_tolov_qaytar(b.id);
    perform public._t2_yb_hodisa(y.id, b.id, 'nizo_egaga', p_actor_id);
  end if;
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'nizo_hal', jsonb_build_object('ok', true, 'nizo_id', n.id, 'qaror', v_q));
end $$;

-- Texnik xizmat: muddati o'tgan e'lonlar → muddat_tugadi; tasdiqlanmagan yetkazish → avtomatik yopildi (cron/BFF chaqiradi)
create or replace function public.t2_yb_muddat_v1()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m integer; v_y integer := 0; r record; v_soat numeric := coalesce((public._t2_yb_param('tasdiq_soat') #>> '{}')::numeric, 48);
begin
  update public.t2_yb_taklif set holat = 'eskirdi' where holat = 'faol' and yuk_id in (select id from public.t2_yb_yuk where holat in ('elon', 'takliflar') and sana_gacha < current_date);
  with u as (update public.t2_yb_yuk set holat = 'muddat_tugadi', versiya = versiya + 1, yangilandi = now() where holat in ('elon', 'takliflar') and sana_gacha < current_date returning id)
  select count(*) into v_m from u;
  for r in select y.id from public.t2_yb_yuk y join public.t2_yb_bron b on b.yuk_id = y.id and b.holat = 'yetkazildi'
           where y.holat = 'yetkazildi' and b.yetkazildi_vaqt < now() - make_interval(secs => v_soat * 3600) loop
    if (public._t2_yb_yop(r.id, null, null, 'avto_tasdiq') ->> 'ok')::boolean then v_y := v_y + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'muddat_tugadi', v_m, 'avto_yopildi', v_y);
end $$;

-- ───────────────────────── O'QISH ─────────────────────────
-- Yuk egasi: bolim = yuklarim | yuk | sozlama. a'zolik + procurement.read
create or replace function public.t2_yb_ol_v1(p_kompaniya_id bigint, p_actor_id bigint, p_bolim text, p_filtr jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_res jsonb; v_id bigint; v_lim integer := least(greatest(coalesce(public._t2_yb_son(p_filtr, 'limit')::integer, 50), 1), 100); v_holat text := public._t2_yb_matn(p_filtr, 'holat', 20);
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.read');
  if p_bolim = 'sozlama' then
    return jsonb_build_object('ok', true, 'bolim', 'sozlama', 'parametrlar',
      (select coalesce(jsonb_object_agg(kalit, qiymat), '{}'::jsonb) from public.t2_yb_sozlama where kalit not in ('komissiya_foiz', 'tasdiq_soat')),
      'komissiya_foiz', public._t2_yb_param('komissiya_foiz'));
  elsif p_bolim = 'yuklarim' then
    select jsonb_build_object('ok', true, 'bolim', 'yuklarim', 'yuklar', coalesce(jsonb_agg(to_jsonb(z) order by z.id desc), '[]'::jsonb)) into v_res
    from (select y.id, y.nom, y.yuk_turi, y.a_nom, y.b_nom, y.masofa_km, y.tonna, y.hajm_m3, y.sana_dan, y.sana_gacha, y.tolov_shakli, y.escrow, y.narx_taklif_qqs_siz,
            y.narx_tavsiya_qqs_siz, y.qqs_foiz, y.holat, y.versiya, y.yaratildi,
            (select count(*) from public.t2_yb_taklif t where t.yuk_id = y.id and t.holat = 'faol' and t.kimdan = 'tashuvchi') as faol_takliflar
          from public.t2_yb_yuk y where y.kompaniya_id = p_kompaniya_id and (v_holat is null or y.holat = v_holat) order by y.id desc limit v_lim) z;
    return v_res;
  elsif p_bolim = 'yuk' then
    v_id := public._t2_yb_son(p_filtr, 'id')::bigint;
    if not exists (select 1 from public.t2_yb_yuk where id = v_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
    select jsonb_build_object('ok', true, 'bolim', 'yuk',
      'yuk', to_jsonb(y),
      'takliflar', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'kimdan', t.kimdan, 'raund', t.raund, 'narx_qqs_siz', t.narx_qqs_siz, 'qqs_foiz', t.qqs_foiz, 'izoh', t.izoh,
            'holat', t.holat, 'yaratildi', t.yaratildi, 'tashuvchi_id', t.tashuvchi_id, 'tashuvchi', s.ism, 'tur', s.tur, 'daraja', s.daraja, 'reyting', s.reyting_ortacha, 'reyting_soni', s.reyting_soni,
            'mashina', jsonb_build_object('raqam', m.davlat_raqami, 'turi', m.turi, 'yuk_t', m.yuk_t)) order by t.id)
          from public.t2_yb_taklif t join public.t2_yb_tashuvchi s on s.id = t.tashuvchi_id left join public.t2_yb_mashina m on m.id = t.mashina_id where t.yuk_id = y.id), '[]'::jsonb),
      'bron', (select jsonb_build_object('id', b.id, 'holat', b.holat, 'narx_qqs_siz', b.narx_qqs_siz, 'qqs_foiz', b.qqs_foiz, 'tolov_shakli', b.tolov_shakli, 'qabul_kod', b.qabul_kod,
            'tashuvchi', s.ism, 'telefon', s.telefon, 'daraja', s.daraja, 'mashina', m.davlat_raqami, 'yuklandi_vaqt', b.yuklandi_vaqt, 'yetkazildi_vaqt', b.yetkazildi_vaqt, 'bekor_sabab', b.bekor_sabab)
          from public.t2_yb_bron b join public.t2_yb_tashuvchi s on s.id = b.tashuvchi_id join public.t2_yb_mashina m on m.id = b.mashina_id where b.yuk_id = y.id and b.holat <> 'bekor' order by b.id desc limit 1),
      'dalil', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'tur', d.tur, 'r2_kalit', d.r2_kalit, 'document_id', d.document_id, 'sha256', d.sha256, 'yaratildi', d.yaratildi) order by d.id)
          from public.t2_yb_dalil d join public.t2_yb_bron b on b.id = d.bron_id where b.yuk_id = y.id), '[]'::jsonb),
      'tolov', (select jsonb_build_object('id', p.id, 'holat', p.holat, 'summa_qqs_siz', p.summa_qqs_siz, 'summa_jami', p.summa_jami, 'komissiya_foiz', p.komissiya_foiz, 'komissiya_summa', p.komissiya_summa,
            'tashuvchiga_summa', p.tashuvchiga_summa, 'provider', p.provider) from public.t2_yb_tolov p where p.yuk_id = y.id order by p.id desc limit 1),
      'baho', coalesce((select jsonb_agg(jsonb_build_object('kimdan_turi', h.kimdan_turi, 'ball', h.ball, 'izoh', h.izoh)) from public.t2_yb_baho h join public.t2_yb_bron b on b.id = h.bron_id where b.yuk_id = y.id), '[]'::jsonb),
      'nizo', (select jsonb_build_object('id', n.id, 'holat', n.holat, 'sabab', n.sabab, 'qaror', n.qaror) from public.t2_yb_nizo n join public.t2_yb_bron b on b.id = n.bron_id where b.yuk_id = y.id order by n.id desc limit 1),
      'hodisalar', coalesce((select jsonb_agg(jsonb_build_object('tur', e.tur, 'meta', e.meta, 'yaratildi', e.yaratildi) order by e.id desc) from (select * from public.t2_yb_hodisa where yuk_id = y.id order by id desc limit 50) e), '[]'::jsonb))
    into v_res from public.t2_yb_yuk y where y.id = v_id and y.kompaniya_id = p_kompaniya_id;
    return v_res;
  end if;
  return jsonb_build_object('ok', false, 'code', 'BOLIM_INVALID');
end $$;

-- Tashuvchi: bolim = profil | lenta | meniki. FAQAT service_role. Yuk egasi kontakti/koordinatasi lentada YO'Q (bron'gacha yashirin).
create or replace function public.t2_yb_tashuvchi_ol_v1(p_actor_id bigint, p_bolim text, p_filtr jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare tsh public.t2_yb_tashuvchi; v_res jsonb; v_lim integer := least(greatest(coalesce(public._t2_yb_son(p_filtr, 'limit')::integer, 30), 1), 100);
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  if p_bolim = 'profil' then
    select * into tsh from public.t2_yb_tashuvchi where foydalanuvchi_id = p_actor_id;
    if not found then return jsonb_build_object('ok', true, 'bolim', 'profil', 'tashuvchi', null); end if;
    return jsonb_build_object('ok', true, 'bolim', 'profil', 'tashuvchi', to_jsonb(tsh),
      'mashinalar', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.t2_yb_mashina m where m.tashuvchi_id = tsh.id), '[]'::jsonb));
  elsif p_bolim = 'lenta' then
    select jsonb_build_object('ok', true, 'bolim', 'lenta', 'yuklar', coalesce(jsonb_agg(to_jsonb(z) order by z.id desc), '[]'::jsonb)) into v_res
    from (select y.id, y.nom, y.yuk_turi, y.a_nom, y.b_nom, y.masofa_km, y.tonna, y.hajm_m3, y.sana_dan, y.sana_gacha, y.tolov_shakli, y.escrow,
            y.narx_taklif_qqs_siz, y.narx_tavsiya_qqs_siz, y.qqs_foiz, y.holat
          from public.t2_yb_yuk y where y.holat in ('elon', 'takliflar') and (y.sana_gacha is null or y.sana_gacha >= current_date)
            and (public._t2_yb_matn(p_filtr, 'tolov_shakli', 20) is null or y.tolov_shakli in (public._t2_yb_matn(p_filtr, 'tolov_shakli', 20), 'ikkalasi'))
          order by y.id desc limit v_lim) z;
    return v_res;
  elsif p_bolim = 'meniki' then
    select * into tsh from public.t2_yb_tashuvchi where foydalanuvchi_id = p_actor_id;
    if not found then return jsonb_build_object('ok', true, 'bolim', 'meniki', 'takliflar', '[]'::jsonb, 'bronlar', '[]'::jsonb); end if;
    return jsonb_build_object('ok', true, 'bolim', 'meniki',
      'takliflar', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'yuk_id', t.yuk_id, 'kimdan', t.kimdan, 'raund', t.raund, 'narx_qqs_siz', t.narx_qqs_siz, 'holat', t.holat, 'yuk', y.nom) order by t.id desc)
          from public.t2_yb_taklif t join public.t2_yb_yuk y on y.id = t.yuk_id where t.tashuvchi_id = tsh.id and t.holat = 'faol'), '[]'::jsonb),
      'bronlar', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'yuk_id', b.yuk_id, 'holat', b.holat, 'narx_qqs_siz', b.narx_qqs_siz, 'yuk', y.nom, 'a_nom', y.a_nom, 'b_nom', y.b_nom,
            'a_lat', y.a_lat, 'a_lng', y.a_lng, 'b_lat', y.b_lat, 'b_lng', y.b_lng) order by b.id desc)
          from public.t2_yb_bron b join public.t2_yb_yuk y on y.id = b.yuk_id where b.tashuvchi_id = tsh.id and b.holat <> 'bekor'), '[]'::jsonb));
  end if;
  return jsonb_build_object('ok', false, 'code', 'BOLIM_INVALID');
end $$;

-- ───────────────────────── GRANT: faqat service_role ─────────────────────────
do $grant$ declare f text; begin
  foreach f in array array[
    'public._t2_yb_hodisa_ozgarmas()',
    'public._t2_yb_son(jsonb,text)', 'public._t2_yb_matn(jsonb,text,integer)', 'public._t2_yb_sana(jsonb,text)',
    'public._t2_yb_takror(bigint,uuid,text)', 'public._t2_yb_saqla_op(bigint,uuid,text,jsonb)', 'public._t2_yb_param(text)',
    'public._t2_yb_hodisa(bigint,bigint,text,bigint,jsonb)', 'public._t2_yb_outbox(public.t2_yb_yuk,text,bigint,uuid,bigint[],jsonb)',
    'public._t2_yb_tashuvchi_ruxsat(public.t2_yb_tashuvchi,bigint)', 'public._t2_yb_tashuvchi_tanla(bigint,jsonb)',
    'public._t2_yb_tolov_chiqarish(bigint)', 'public._t2_yb_tolov_qaytar(bigint)', 'public._t2_yb_tashuvchi_foydalanuvchilar(bigint)',
    'public._t2_yb_bron_yarat(bigint,bigint,bigint,uuid)', 'public._t2_yb_yop(bigint,bigint,uuid,text)', 'public._t2_yb_baho_yoz(bigint,text,bigint,jsonb)',
    'public._t2_yb_nizo_och(bigint,text,bigint,jsonb,uuid)',
    'public.t2_yb_yuk_saqla_v1(bigint,bigint,uuid,jsonb)', 'public.t2_yb_yuk_elon_v1(bigint,bigint,uuid,jsonb)', 'public.t2_yb_yuk_javob_v1(bigint,bigint,uuid,jsonb)',
    'public.t2_yb_yuk_bekor_v1(bigint,bigint,uuid,jsonb)', 'public.t2_yb_yuk_tasdiq_v1(bigint,bigint,uuid,jsonb)', 'public.t2_yb_yuk_baho_v1(bigint,bigint,uuid,jsonb)',
    'public.t2_yb_yuk_nizo_v1(bigint,bigint,uuid,jsonb)',
    'public.t2_yb_tashuvchi_saqla_v1(bigint,uuid,jsonb)', 'public.t2_yb_taklif_ber_v1(bigint,uuid,jsonb)', 'public.t2_yb_yuritish_v1(bigint,uuid,jsonb)',
    'public.t2_yb_dalil_qosh_v1(bigint,uuid,jsonb)', 'public.t2_yb_tashuvchi_baho_v1(bigint,uuid,jsonb)', 'public.t2_yb_tashuvchi_nizo_v1(bigint,uuid,jsonb)',
    'public.t2_yb_bron_bekor_v1(bigint,uuid,jsonb)', 'public.t2_yb_tolov_hodisa_v1(uuid,jsonb)', 'public.t2_yb_nizo_hal_v1(bigint,uuid,jsonb)', 'public.t2_yb_muddat_v1()',
    'public.t2_yb_ol_v1(bigint,bigint,text,jsonb)', 'public.t2_yb_tashuvchi_ol_v1(bigint,text,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $grant$;

commit;
