-- 20261124000000 — UY SOTISH (ko'chmas mulk sotuvi) v1: yadro (egasi 2026-11-03: «tashkilot uy ham sotadi … 0 dan 100 gacha»).
--
-- Tizimda faqat bo'sh UI (test02/TestSotuvCrm) bor edi — jadval/RPC yo'q. Bu migratsiya sotuv YADROSINI quradi:
--   Inventar   — t2_sotuv_birlik (xonadon/uy/tijorat/parking/ombor) bino = mavjud t2_obyekt; loyiha (JK) = t2_loyiha;
--                t2_sotuv_planirovka; t2_sotuv_narx_tarix (har narx o'zgarishi sababi bilan, o'chirilmaydi).
--   Loyiha     — t2_sotuv_loyiha: reyestr raqami (reklama faqat reyestrdan keyin — PP-4732), eskrou hisobi, topshirish muddati.
--   Mijoz      — t2_sotuv_mijoz (jismoniy/yuridik; telefon bo'yicha dublikat yo'q; shaxsiy ma'lumotga rozilik sanasi).
--   Bitim      — t2_sotuv_bitim: lid → aloqa → ko'rsatildi → bron → shartnoma → to'lov → topshirildi | bekor (bitta jadval,
--                lid ham bitim — Profitbase/MacroCRM modeli). To'lov turi: to'liq / muddatli / ipoteka / eskrou.
--   Bron       — t2_sotuv_bron: QATTIQ QULF (bir birlikda bitta faol bron — partial unique index), muddat tugasa
--                avtomatik bo'shaydi (o'qishda va yangi bronda «muddati_otdi» deb yopiladi; cron kerak emas).
--   Grafik     — t2_sotuv_grafik: versiyali (qayta tuzish — yangi versiya, eskisi saqlanadi); Σ = bitim summasi (±1).
--   To'lov     — t2_sotuv_tolov (naqd/karta/bank/eskrou/payme/click/uzum; qaytarim alohida tur); grafikka FIFO taqsimlanadi.
--   Audit      — t2_sotuv_audit: har yozuvchi amal (eski → yangi).
-- Ruxsatlar   — yangi capability: sales.read, sales.write, sales.price, sales.payment; yangi rol «sotuvchi».
--                boss/admin/superadmin — hammasi (mavjud qoida); rahbar — sales.read; bugalter — sales.read + sales.payment.
-- NULL ≠ 0: narxsiz birlik — narx null («kiritilmagan»), summasi hisoblanmaydi. Hech qanday real ma'lumot yozilmaydi.
-- Additiv; prodga faqat L0 qo'llaydi (BEGIN..ROLLBACK acceptance bilan).

begin;

-- ───────────── 0. Ruxsatlar katalogi + «sotuvchi» roli ─────────────
create or replace function public.t2_permission_catalog_v2()
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select array['company.read','company.profile.update','company.member.manage','control.company.read','control.company.write',
    'project.read','project.write','object.read','object.write','document.read','document.write','financial.read','financial.write',
    'f2.read','f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct','smeta.read','smeta.write','fakt.read','fakt.write','narx.read','narx.write',
    -- ekotizim (E2 §3.1)
    'procurement.read','procurement.write','procurement.approve',
    'supply.offer','supply.fulfil',
    'logistics.read','logistics.dispatch','logistics.trip',
    'warehouse.read','warehouse.write','warehouse.receive',
    'quality.read','quality.inspect','quality.decide',
    'design.read','design.write','design.issue',
    'hr.read','hr.write','hr.pii.read','hr.pii.write','hr.tabel.write',
    'payroll.read','payroll.write',
    'machinery.read','machinery.write','machinery.log',
    'accounting.read','accounting.write','accounting.approve',
    'self.work.read','self.work.write',
    -- uy sotish (20261124000000)
    'sales.read','sales.write','sales.price','sales.payment']::text[];
$$;

create or replace function public.t2_role_permissions_v2(p_rol text)
returns text[] language plpgsql immutable set search_path = public, pg_temp as $$
declare p text[];
begin
  if p_rol in ('boss','admin','superadmin') then return public.t2_permission_catalog_v2(); end if;

  -- Yangi (ekotizim) rollari — ANIQ ro'yxat; eski «document.read → f2/smeta/narx» kengaytmasi ularga QO'LLANMAYDI.
  p := case p_rol
    when 'omborchi'   then array['company.read','object.read','document.read','fakt.read','warehouse.read','warehouse.write','warehouse.receive','procurement.read','logistics.read']
    when 'mexanik'    then array['company.read','object.read','document.read','machinery.read','machinery.write','machinery.log','warehouse.read']
    when 'kadr'       then array['company.read','object.read','document.read','hr.read','hr.write','hr.pii.read','hr.pii.write','hr.tabel.write']
    when 'taminotchi' then array['company.read','object.read','document.read','procurement.read','procurement.write','procurement.approve','supply.offer','supply.fulfil','logistics.read','logistics.dispatch','warehouse.read']
    when 'usta'       then array['company.read','object.read','document.read','fakt.read','self.work.read','self.work.write']
    when 'brigadir'   then array['company.read','object.read','document.read','fakt.read','self.work.read','self.work.write','hr.tabel.write']
    when 'haydovchi'  then array['company.read','self.work.read','self.work.write','logistics.trip','machinery.log']
    when 'inspektor'  then array['company.read','object.read','document.read','quality.read','quality.inspect','quality.decide']
    when 'loyihachi'  then array['company.read','object.read','document.read','document.write','design.read','design.write','design.issue']
    -- Uy sotish menejeri: inventar va bitimlar; narx o'zgartirish (sales.price) va to'lov kiritish (sales.payment) — alohida beriladi.
    when 'sotuvchi'   then array['company.read','project.read','object.read','sales.read','sales.write']
    else null end;
  if p is not null then return p; end if;

  -- Mavjud rollar — o'zgarishsiz (20261110100000 dagi bilan bir xil) ...
  p:=case p_rol
    when 'rahbar' then array['company.read','control.company.read','project.read','object.read','document.read','financial.read']
    when 'bugalter' then array['company.read','financial.read','financial.write','document.read']
    when 'pto' then array['company.read','project.read','project.write','object.read','object.write','document.read','document.write','financial.read','financial.write']
    when 'prorab' then array['company.read','project.read','project.write','object.read','object.write','document.read','document.write']
    when 'buyurtmachi' then array['company.read','project.read','object.read','document.read','financial.read']
    when 'pudratchi' then array['company.read','project.read','object.read','document.read']
    when 'kuzatuvchi' then array['company.read','project.read','object.read','document.read'] else array[]::text[] end;
  if 'document.read'=any(p) then p:=p||array['f2.read','smeta.read','fakt.read','narx.read']; end if;
  -- Egasi 2026-10-26: buxgalter F2 ni faqat o'qiydi (import/tayyorlash/tasdiqlash/bekor/tuzatish — yo'q).
  if p_rol in ('pto','prorab') then p:=p||array['f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct']; end if;
  if 'object.write'=any(p) then p:=p||array['smeta.write','fakt.write','narx.write']; end if;

  -- ... + faqat yangi domen capability lari.
  p := p || case p_rol
    when 'rahbar'   then array['procurement.read','logistics.read','warehouse.read','quality.read','design.read','hr.read','payroll.read','machinery.read','sales.read']
    when 'bugalter' then array['accounting.approve','payroll.read','payroll.write','procurement.read','warehouse.read','hr.read','sales.read','sales.payment']
    when 'pto'      then array['procurement.read','procurement.write','warehouse.read','logistics.read','quality.read','design.read','hr.read','machinery.read']
    when 'prorab'   then array['procurement.read','procurement.write','warehouse.read','warehouse.receive','logistics.read','quality.read','design.read','hr.read','hr.tabel.write','machinery.read']
    else array[]::text[] end;
  -- financial.* ↔ accounting.* taxallusi
  if 'financial.read'  = any(p) then p := p || array['accounting.read'];  end if;
  if 'financial.write' = any(p) then p := p || array['accounting.write']; end if;
  return coalesce((select array_agg(distinct x order by x) from unnest(p) x), array[]::text[]);
end $$;

do $do$ begin
  if to_regclass('public.t2_ish_joyi_taklif') is not null then
    alter table public.t2_ish_joyi_taklif drop constraint if exists t2_ish_joyi_taklif_rol_check;
    alter table public.t2_ish_joyi_taklif add constraint t2_ish_joyi_taklif_rol_check check (rol = any (array[
      'rahbar','bugalter','pto','prorab','buyurtmachi','pudratchi','kuzatuvchi','omborchi','mexanik','kadr','taminotchi','usta','brigadir',
      'haydovchi','inspektor','loyihachi','sotuvchi']::text[]));
  end if;
end $do$;

-- Havola orqali taklif: rollar ro'yxatiga «sotuvchi» (funksiya tanasi o'zgarmaydi — faqat shu ro'yxat).
do $do$ declare f record; d text; begin
  for f in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 't2_ish_joyi_taklif_yarat_v1' loop
    d := pg_get_functiondef(f.oid);
    if position('sotuvchi' in d) = 0 and position($s$'inspektor', 'loyihachi')$s$ in d) > 0 then
      execute replace(d, $s$'inspektor', 'loyihachi')$s$, $s$'inspektor', 'loyihachi', 'sotuvchi')$s$);
    end if;
  end loop;
end $do$;

-- ───────────── 1. Jadvallar ─────────────
create table if not exists public.t2_sotuv_loyiha (
  loyiha_id bigint primary key references public.t2_loyiha(id) on delete cascade,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  reyestr_raqam text, reyestr_sana date,
  eskrou_bank text, eskrou_hisob text,
  topshirish_sana date, tavsif text,
  sotuvda boolean not null default false,
  bron_soat integer not null default 72 check (bron_soat between 1 and 720),
  versiya integer not null default 1,
  yangilandi timestamptz not null default now(),
  constraint t2_sotuv_loyiha_reyestr_chk check (not sotuvda or nullif(btrim(coalesce(reyestr_raqam, '')), '') is not null)
);
comment on table public.t2_sotuv_loyiha is 'Sotuv sozlamasi loyiha (turar-joy majmuasi) bo''yicha: reyestr raqamisiz sotuvga/reklamaga chiqarilmaydi (PP-4732).';

create table if not exists public.t2_sotuv_planirovka (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  loyiha_id bigint references public.t2_loyiha(id),
  nom text not null check (length(btrim(nom)) > 0),
  xona_soni smallint check (xona_soni between 0 and 20),
  maydon numeric(10,2) check (maydon > 0),
  maydon_yashash numeric(10,2), maydon_oshxona numeric(10,2),
  fayl_kalit text, izoh text,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now()
);

create table if not exists public.t2_sotuv_birlik (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  podyezd smallint not null default 1 check (podyezd between 1 and 99),
  qavat smallint not null check (qavat between -5 and 150),
  raqam text not null check (length(btrim(raqam)) > 0),
  tur text not null default 'xonadon' check (tur in ('xonadon','uy','tijorat','parking','ombor')),
  xona_soni smallint check (xona_soni between 0 and 20),
  maydon numeric(10,2) not null check (maydon > 0),
  maydon_yashash numeric(10,2), maydon_oshxona numeric(10,2), maydon_balkon numeric(10,2),
  shift numeric(4,2), pardoz text check (pardoz in ('karobka','qora','oq','tamirli')),
  yon text, manzara text,
  planirovka_id bigint references public.t2_sotuv_planirovka(id),
  narx_m2 numeric(18,2) check (narx_m2 is null or narx_m2 > 0),
  narx_jami numeric(20,2) generated always as (round(maydon * narx_m2, 2)) stored,
  valyuta text not null default 'UZS' check (valyuta in ('UZS','USD')),
  holat text not null default 'bosh' check (holat in ('bosh','bron','sotilgan','sotuvda_emas','zaxira')),
  izoh text,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  unique (obyekt_id, raqam)
);
create index if not exists t2_sotuv_birlik_komp_idx on public.t2_sotuv_birlik (kompaniya_id, obyekt_id);

create table if not exists public.t2_sotuv_narx_tarix (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null,
  birlik_id bigint not null references public.t2_sotuv_birlik(id) on delete cascade,
  eski_m2 numeric(18,2), yangi_m2 numeric(18,2),
  sabab text not null, actor_id bigint, operation_id uuid,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_sotuv_narx_tarix_birlik_idx on public.t2_sotuv_narx_tarix (birlik_id, yaratildi desc);

create table if not exists public.t2_sotuv_mijoz (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  tur text not null default 'jismoniy' check (tur in ('jismoniy','yuridik')),
  fio text not null check (length(btrim(fio)) > 0),
  telefon text not null,
  telefon_norm text not null check (telefon_norm ~ '^[0-9]{7,15}$'),
  telefon2 text, email text, pinfl text check (pinfl is null or pinfl ~ '^[0-9]{14}$'),
  pasport text, inn text, manzil text,
  manba text, masul_actor_id bigint, izoh text,
  rozilik_sana timestamptz,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  unique (kompaniya_id, telefon_norm)
);

create table if not exists public.t2_sotuv_bitim (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  mijoz_id bigint not null references public.t2_sotuv_mijoz(id),
  birlik_id bigint references public.t2_sotuv_birlik(id),
  loyiha_id bigint references public.t2_loyiha(id),
  bosqich text not null default 'lid' check (bosqich in ('lid','aloqa','korsatildi','bron','shartnoma','tolov','topshirildi','bekor')),
  manba text check (manba in ('sayt','telegram','instagram','olx','uybor','qongiroq','ofis','agent','tavsiya','boshqa')),
  utm jsonb not null default '{}'::jsonb,
  masul_actor_id bigint,
  narx_m2 numeric(18,2), chegirma_foiz numeric(5,2) check (chegirma_foiz is null or (chegirma_foiz >= 0 and chegirma_foiz < 100)),
  summa numeric(20,2) check (summa is null or summa > 0),
  valyuta text not null default 'UZS' check (valyuta in ('UZS','USD')),
  kurs numeric(14,4),
  tolov_turi text check (tolov_turi in ('toliq','muddatli','ipoteka','eskrou')),
  bank text, ipoteka_dastur text, subsidiya_summa numeric(20,2),
  shartnoma_raqam text, shartnoma_sana date, notarius_sana date, kadastr_sana date, eskrou_hisob text,
  topshirildi_sana date, bekor_sabab text,
  keyingi_aloqa timestamptz, izoh text,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create index if not exists t2_sotuv_bitim_komp_idx on public.t2_sotuv_bitim (kompaniya_id, bosqich);
-- Bir birlik — bitta SOTILGAN bitim (shartnoma/to'lov/topshirildi).
create unique index if not exists t2_sotuv_bitim_sotilgan_uq on public.t2_sotuv_bitim (birlik_id)
  where birlik_id is not null and bosqich in ('shartnoma','tolov','topshirildi');

create table if not exists public.t2_sotuv_bron (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null,
  birlik_id bigint not null references public.t2_sotuv_birlik(id),
  bitim_id bigint not null references public.t2_sotuv_bitim(id),
  boshlandi timestamptz not null default now(),
  tugaydi timestamptz not null,
  tolov_summa numeric(20,2),
  holat text not null default 'faol' check (holat in ('faol','bekor','muddati_otdi','shartnoma')),
  sabab text, actor_id bigint, operation_id uuid unique,
  yaratildi timestamptz not null default now(),
  check (tugaydi > boshlandi)
);
-- QATTIQ QULF: bir birlikda bitta faol bron.
create unique index if not exists t2_sotuv_bron_faol_uq on public.t2_sotuv_bron (birlik_id) where holat = 'faol';

create table if not exists public.t2_sotuv_grafik (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null,
  bitim_id bigint not null references public.t2_sotuv_bitim(id) on delete cascade,
  versiya_no integer not null,
  n integer not null,
  sana date not null,
  summa numeric(20,2) not null check (summa > 0),
  tur text not null default 'oylik' check (tur in ('boshlangich','oylik','yakuniy','boshqa')),
  faol boolean not null default true,
  yaratildi timestamptz not null default now(),
  unique (bitim_id, versiya_no, n)
);
create index if not exists t2_sotuv_grafik_faol_idx on public.t2_sotuv_grafik (bitim_id) where faol;

create table if not exists public.t2_sotuv_tolov (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null,
  bitim_id bigint not null references public.t2_sotuv_bitim(id),
  sana date not null,
  summa numeric(20,2) not null check (summa > 0),
  tur text not null default 'tolov' check (tur in ('tolov','bron','qaytarim')),
  usul text not null default 'bank' check (usul in ('naqd','karta','bank','eskrou','payme','click','uzum','boshqa')),
  hujjat_raqam text, izoh text,
  holat text not null default 'faol' check (holat in ('faol','bekor')),
  actor_id bigint, operation_id uuid unique,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_sotuv_tolov_bitim_idx on public.t2_sotuv_tolov (bitim_id) where holat = 'faol';

create table if not exists public.t2_sotuv_audit (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null,
  entity text not null, entity_id bigint not null,
  amal text not null, eski jsonb, yangi jsonb,
  actor_id bigint, operation_id uuid,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_sotuv_audit_ent_idx on public.t2_sotuv_audit (entity, entity_id, yaratildi desc);
-- Bir xil operation_id bilan takror yozuvni ushlash (idempotentlik) uchun.
create table if not exists public.t2_sotuv_operatsiya (
  operation_id uuid primary key,
  kompaniya_id bigint not null,
  amal text not null,
  natija jsonb not null,
  yaratildi timestamptz not null default now()
);

do $do$ declare t text; begin
  foreach t in array array['t2_sotuv_loyiha','t2_sotuv_planirovka','t2_sotuv_birlik','t2_sotuv_narx_tarix','t2_sotuv_mijoz','t2_sotuv_bitim',
                           't2_sotuv_bron','t2_sotuv_grafik','t2_sotuv_tolov','t2_sotuv_audit','t2_sotuv_operatsiya'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $do$;

-- ───────────── 2. Yordamchilar ─────────────
create or replace function public._t2_sotuv_tel(p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when length(d) = 9 then '998' || d else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

create or replace function public._t2_sotuv_op(p_op uuid, p_komp bigint)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select o.natija || jsonb_build_object('takror', true) from public.t2_sotuv_operatsiya o
   where o.operation_id = p_op and o.kompaniya_id = p_komp;
$$;

create or replace function public._t2_sotuv_op_yoz(p_op uuid, p_komp bigint, p_amal text, p_natija jsonb)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
begin
  if p_op is not null then
    insert into public.t2_sotuv_operatsiya (operation_id, kompaniya_id, amal, natija) values (p_op, p_komp, p_amal, p_natija)
    on conflict (operation_id) do nothing;
  end if;
  return p_natija;
end $$;

create or replace function public._t2_sotuv_audit(p_komp bigint, p_entity text, p_id bigint, p_amal text, p_eski jsonb, p_yangi jsonb, p_actor bigint, p_op uuid)
returns void language sql set search_path = public, pg_temp as $$
  insert into public.t2_sotuv_audit (kompaniya_id, entity, entity_id, amal, eski, yangi, actor_id, operation_id)
  values (p_komp, p_entity, p_id, p_amal, p_eski, p_yangi, p_actor, p_op);
$$;

-- Muddati o'tgan bronlarni yopadi va birliklarni bo'shatadi (o'qish va yozishdan oldin chaqiriladi; idempotent).
create or replace function public._t2_sotuv_bron_tozala(p_komp bigint)
returns integer language plpgsql set search_path = public, pg_temp as $$
declare n integer;
begin
  with e as (
    update public.t2_sotuv_bron b set holat = 'muddati_otdi', sabab = coalesce(b.sabab, 'muddat tugadi')
     where b.kompaniya_id = p_komp and b.holat = 'faol' and b.tugaydi <= now()
    returning b.birlik_id, b.bitim_id
  ), u as (
    update public.t2_sotuv_birlik s set holat = 'bosh', versiya = s.versiya + 1, yangilandi = now()
      from e where s.id = e.birlik_id and s.holat = 'bron'
    returning s.id
  ), d as (
    update public.t2_sotuv_bitim t set bosqich = 'korsatildi', versiya = t.versiya + 1, yangilandi = now()
      from e where t.id = e.bitim_id and t.bosqich = 'bron'
    returning t.id
  )
  select count(*) into n from e;
  return n;
end $$;

-- ───────────── 3. Yozuvchi RPC lar ─────────────
-- 3.1 Loyiha sozlamasi (reyestr, eskrou, sotuvga chiqarish).
create or replace function public.t2_sotuv_loyiha_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_loyiha_id bigint, p jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; v_eski jsonb; r jsonb;
begin
  v := public._t2_sotuv_op(p_operation_id, p_kompaniya_id); if v is not null then return v; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.price');
  if not exists (select 1 from public.t2_loyiha where id = p_loyiha_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'LOYIHA_NOT_FOUND'); end if;
  if coalesce((p->>'sotuvda')::boolean, false) and nullif(btrim(coalesce(p->>'reyestr_raqam', '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'REYESTR_KERAK');
  end if;
  select to_jsonb(l) into v_eski from public.t2_sotuv_loyiha l where l.loyiha_id = p_loyiha_id;
  insert into public.t2_sotuv_loyiha as l (loyiha_id, kompaniya_id, reyestr_raqam, reyestr_sana, eskrou_bank, eskrou_hisob, topshirish_sana, tavsif, sotuvda, bron_soat)
  values (p_loyiha_id, p_kompaniya_id, nullif(btrim(p->>'reyestr_raqam'), ''), (p->>'reyestr_sana')::date, p->>'eskrou_bank', p->>'eskrou_hisob',
          (p->>'topshirish_sana')::date, p->>'tavsif', coalesce((p->>'sotuvda')::boolean, false), coalesce((p->>'bron_soat')::int, 72))
  on conflict (loyiha_id) do update set reyestr_raqam = excluded.reyestr_raqam, reyestr_sana = excluded.reyestr_sana, eskrou_bank = excluded.eskrou_bank,
    eskrou_hisob = excluded.eskrou_hisob, topshirish_sana = excluded.topshirish_sana, tavsif = excluded.tavsif, sotuvda = excluded.sotuvda,
    bron_soat = excluded.bron_soat, versiya = l.versiya + 1, yangilandi = now();
  perform public._t2_sotuv_audit(p_kompaniya_id, 'loyiha', p_loyiha_id, 'saqla', v_eski, p, p_actor_id, p_operation_id);
  r := jsonb_build_object('ok', true, 'loyiha_id', p_loyiha_id);
  return public._t2_sotuv_op_yoz(p_operation_id, p_kompaniya_id, 'loyiha_saqla', r);
end $$;

-- 3.2 Birliklar: ommaviy yaratish/yangilash (shaxmatka generatori mijozda; server — tekshiradi va yozadi).
--     Sotilgan/bronlangan birlikning maydoni va narxi bu yerdan O'ZGARTIRILMAYDI.
create or replace function public.t2_sotuv_birlik_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_qatorlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; e jsonb; v_id bigint; v_bor record; n_yangi int := 0; n_yangilandi int := 0; n_otkazildi int := 0; r jsonb;
begin
  v := public._t2_sotuv_op(p_operation_id, p_kompaniya_id); if v is not null then return v; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.write');
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
  if jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 or jsonb_array_length(p_qatorlar) > 3000 then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI'); end if;
  for e in select * from jsonb_array_elements(p_qatorlar) loop
    if nullif(btrim(coalesce(e->>'raqam', '')), '') is null or coalesce((e->>'maydon')::numeric, 0) <= 0 or e->>'qavat' is null then
      return jsonb_build_object('ok', false, 'code', 'QATOR_NOTOGRI', 'qator', e);
    end if;
    select id, holat, narx_m2 into v_bor from public.t2_sotuv_birlik where obyekt_id = p_obyekt_id and raqam = btrim(e->>'raqam') for update;
    if v_bor.id is null then
      insert into public.t2_sotuv_birlik (kompaniya_id, obyekt_id, podyezd, qavat, raqam, tur, xona_soni, maydon, maydon_yashash, maydon_oshxona,
        maydon_balkon, shift, pardoz, yon, manzara, planirovka_id, narx_m2, valyuta, holat, izoh)
      values (p_kompaniya_id, p_obyekt_id, coalesce((e->>'podyezd')::smallint, 1), (e->>'qavat')::smallint, btrim(e->>'raqam'),
        coalesce(e->>'tur', 'xonadon'), (e->>'xona_soni')::smallint, (e->>'maydon')::numeric, (e->>'maydon_yashash')::numeric,
        (e->>'maydon_oshxona')::numeric, (e->>'maydon_balkon')::numeric, (e->>'shift')::numeric, e->>'pardoz', e->>'yon', e->>'manzara',
        (e->>'planirovka_id')::bigint, (e->>'narx_m2')::numeric, coalesce(e->>'valyuta', 'UZS'),
        case when e->>'holat' in ('bosh','sotuvda_emas','zaxira') then e->>'holat' else 'bosh' end, e->>'izoh')
      returning id into v_id;
      if (e->>'narx_m2') is not null then
        insert into public.t2_sotuv_narx_tarix (kompaniya_id, birlik_id, eski_m2, yangi_m2, sabab, actor_id, operation_id)
        values (p_kompaniya_id, v_id, null, (e->>'narx_m2')::numeric, 'boshlang''ich narx', p_actor_id, p_operation_id);
      end if;
      n_yangi := n_yangi + 1;
    elsif v_bor.holat in ('bron', 'sotilgan') then
      n_otkazildi := n_otkazildi + 1;
    else
      update public.t2_sotuv_birlik s set podyezd = coalesce((e->>'podyezd')::smallint, s.podyezd), qavat = (e->>'qavat')::smallint,
        tur = coalesce(e->>'tur', s.tur), xona_soni = (e->>'xona_soni')::smallint, maydon = (e->>'maydon')::numeric,
        maydon_yashash = (e->>'maydon_yashash')::numeric, maydon_oshxona = (e->>'maydon_oshxona')::numeric, maydon_balkon = (e->>'maydon_balkon')::numeric,
        shift = (e->>'shift')::numeric, pardoz = e->>'pardoz', yon = e->>'yon', manzara = e->>'manzara', planirovka_id = (e->>'planirovka_id')::bigint,
        izoh = e->>'izoh', versiya = s.versiya + 1, yangilandi = now()
      where s.id = v_bor.id;
      n_yangilandi := n_yangilandi + 1;
    end if;
  end loop;
  perform public._t2_sotuv_audit(p_kompaniya_id, 'obyekt', p_obyekt_id, 'birlik_saqla', null,
    jsonb_build_object('yangi', n_yangi, 'yangilandi', n_yangilandi, 'otkazildi', n_otkazildi), p_actor_id, p_operation_id);
  r := jsonb_build_object('ok', true, 'yangi', n_yangi, 'yangilandi', n_yangilandi, 'otkazildi', n_otkazildi);
  return public._t2_sotuv_op_yoz(p_operation_id, p_kompaniya_id, 'birlik_saqla', r);
exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok', false, 'code', 'QATOR_NOTOGRI', 'xato', sqlerrm);
end $$;

-- 3.3 Narxni ommaviy o'zgartirish (foiz / m² ga summa / yangi m² narx) — sabab majburiy; bron/sotilgan birliklarga tegmaydi.
create or replace function public.t2_sotuv_narx_ozgartir_v1(p_kompaniya_id bigint, p_actor_id bigint, p_birlik_ids bigint[], p_usul text, p_qiymat numeric,
  p_sabab text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; n int := 0; n_otk int := 0; r jsonb;
begin
  v := public._t2_sotuv_op(p_operation_id, p_kompaniya_id); if v is not null then return v; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.price');
  if p_sabab is null or length(btrim(p_sabab)) < 3 then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  if p_usul not in ('foiz', 'summa_m2', 'yangi_m2') or p_qiymat is null then return jsonb_build_object('ok', false, 'code', 'USUL_NOTOGRI'); end if;
  if p_usul = 'foiz' and (p_qiymat <= -90 or p_qiymat > 500) then return jsonb_build_object('ok', false, 'code', 'FOIZ_NOTOGRI'); end if;
  if p_usul = 'yangi_m2' and p_qiymat <= 0 then return jsonb_build_object('ok', false, 'code', 'NARX_NOTOGRI'); end if;
  with t as (
    select s.id, s.narx_m2 as eski,
           round(case p_usul when 'foiz' then s.narx_m2 * (1 + p_qiymat / 100) when 'summa_m2' then s.narx_m2 + p_qiymat else p_qiymat end, 2) as yangi
      from public.t2_sotuv_birlik s
     where s.kompaniya_id = p_kompaniya_id and s.id = any(coalesce(p_birlik_ids, '{}')) and s.holat in ('bosh', 'sotuvda_emas', 'zaxira')
       and (p_usul = 'yangi_m2' or s.narx_m2 is not null)
     for update
  ), u as (
    update public.t2_sotuv_birlik s set narx_m2 = t.yangi, versiya = s.versiya + 1, yangilandi = now()
      from t where s.id = t.id and t.yangi > 0 and t.yangi is distinct from t.eski
    returning s.id, t.eski, t.yangi
  ), h as (
    insert into public.t2_sotuv_narx_tarix (kompaniya_id, birlik_id, eski_m2, yangi_m2, sabab, actor_id, operation_id)
    select p_kompaniya_id, u.id, u.eski, u.yangi, btrim(p_sabab), p_actor_id, p_operation_id from u
    returning 1
  )
  select count(*) into n from h;
  n_otk := coalesce(array_length(p_birlik_ids, 1), 0) - n;
  r := jsonb_build_object('ok', true, 'ozgardi', n, 'otkazildi', greatest(n_otk, 0));
  perform public._t2_sotuv_audit(p_kompaniya_id, 'narx', 0, p_usul, null, jsonb_build_object('qiymat', p_qiymat, 'sabab', p_sabab, 'soni', n), p_actor_id, p_operation_id);
  return public._t2_sotuv_op_yoz(p_operation_id, p_kompaniya_id, 'narx_ozgartir', r);
end $$;

-- 3.4 Birlik holatini qo'lda (bo'sh / sotuvda emas / ichki zaxira). Bron va sotilgan — faqat bitim orqali.
create or replace function public.t2_sotuv_birlik_holat_v1(p_kompaniya_id bigint, p_actor_id bigint, p_birlik_id bigint, p_holat text, p_sabab text, p_kutilgan_versiya integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare b record;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.price');
  if p_holat not in ('bosh', 'sotuvda_emas', 'zaxira') then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI'); end if;
  perform public._t2_sotuv_bron_tozala(p_kompaniya_id);
  select * into b from public.t2_sotuv_birlik where id = p_birlik_id and kompaniya_id = p_kompaniya_id for update;
  if b.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if b.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA', 'bordagi_versiya', b.versiya); end if;
  if b.holat in ('bron', 'sotilgan') then return jsonb_build_object('ok', false, 'code', 'BITIMDA'); end if;
  update public.t2_sotuv_birlik set holat = p_holat, versiya = versiya + 1, yangilandi = now() where id = p_birlik_id;
  perform public._t2_sotuv_audit(p_kompaniya_id, 'birlik', p_birlik_id, 'holat', jsonb_build_object('holat', b.holat), jsonb_build_object('holat', p_holat, 'sabab', p_sabab), p_actor_id, null);
  return jsonb_build_object('ok', true, 'versiya', b.versiya + 1);
end $$;

-- 3.5 Mijoz (telefon bo'yicha dublikat yo'q: bor bo'lsa — o'sha qaytadi va bo'sh maydonlari to'ldiriladi).
create or replace function public._t2_sotuv_mijoz_upsert(p_komp bigint, p_actor bigint, p jsonb)
returns bigint language plpgsql set search_path = public, pg_temp as $$
declare v_tel text := public._t2_sotuv_tel(p->>'telefon'); v_id bigint;
begin
  if v_tel !~ '^[0-9]{7,15}$' then raise exception 'TELEFON_NOTOGRI' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p->>'fio', '')), '') is null then raise exception 'FIO_REQUIRED' using errcode = '22023'; end if;
  insert into public.t2_sotuv_mijoz as m (kompaniya_id, tur, fio, telefon, telefon_norm, telefon2, email, pinfl, pasport, inn, manzil, manba, masul_actor_id, izoh, rozilik_sana)
  values (p_komp, coalesce(p->>'tur', 'jismoniy'), btrim(p->>'fio'), btrim(p->>'telefon'), v_tel, p->>'telefon2', p->>'email', nullif(p->>'pinfl', ''),
          p->>'pasport', p->>'inn', p->>'manzil', p->>'manba', coalesce((p->>'masul_actor_id')::bigint, p_actor),
          p->>'izoh', case when coalesce((p->>'rozilik')::boolean, false) then now() end)
  on conflict (kompaniya_id, telefon_norm) do update set
    fio = coalesce(nullif(btrim(excluded.fio), ''), m.fio), telefon2 = coalesce(excluded.telefon2, m.telefon2), email = coalesce(excluded.email, m.email),
    pinfl = coalesce(excluded.pinfl, m.pinfl), pasport = coalesce(excluded.pasport, m.pasport), inn = coalesce(excluded.inn, m.inn),
    manzil = coalesce(excluded.manzil, m.manzil), izoh = coalesce(excluded.izoh, m.izoh),
    rozilik_sana = coalesce(m.rozilik_sana, excluded.rozilik_sana), versiya = m.versiya + 1, yangilandi = now()
  returning id into v_id;
  return v_id;
end $$;

-- 3.6 Bitim: yaratish (lid) yoki yangilash. Bosqich o'tishlari tekshiriladi; «shartnoma» — birlikni SOTILGAN qiladi.
create or replace function public.t2_sotuv_bitim_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v jsonb; v_id bigint := (p->>'id')::bigint; b record; v_mijoz bigint; v_bosqich text; v_birlik bigint; v_bir record; r jsonb;
  v_tartib constant text[] := array['lid','aloqa','korsatildi','bron','shartnoma','tolov','topshirildi'];
begin
  v := public._t2_sotuv_op(p_operation_id, p_kompaniya_id); if v is not null then return v; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.write');
  perform public._t2_sotuv_bron_tozala(p_kompaniya_id);

  if v_id is null then
    v_mijoz := coalesce((p->>'mijoz_id')::bigint, public._t2_sotuv_mijoz_upsert(p_kompaniya_id, p_actor_id, coalesce(p->'mijoz', '{}'::jsonb)));
    if not exists (select 1 from public.t2_sotuv_mijoz where id = v_mijoz and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'MIJOZ_NOT_FOUND'); end if;
    insert into public.t2_sotuv_bitim (kompaniya_id, mijoz_id, loyiha_id, manba, utm, masul_actor_id, keyingi_aloqa, izoh)
    values (p_kompaniya_id, v_mijoz, (p->>'loyiha_id')::bigint, p->>'manba', coalesce(p->'utm', '{}'::jsonb),
            coalesce((p->>'masul_actor_id')::bigint, p_actor_id), (p->>'keyingi_aloqa')::timestamptz, p->>'izoh')
    returning id into v_id;
    perform public._t2_sotuv_audit(p_kompaniya_id, 'bitim', v_id, 'yaratildi', null, p, p_actor_id, p_operation_id);
    r := jsonb_build_object('ok', true, 'id', v_id, 'mijoz_id', v_mijoz, 'versiya', 1);
    return public._t2_sotuv_op_yoz(p_operation_id, p_kompaniya_id, 'bitim_saqla', r);
  end if;

  select * into b from public.t2_sotuv_bitim where id = v_id and kompaniya_id = p_kompaniya_id for update;
  if b.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if (p->>'kutilgan_versiya')::int is distinct from b.versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA', 'bordagi_versiya', b.versiya); end if;
  if b.bosqich in ('topshirildi', 'bekor') and coalesce(p->>'bosqich', b.bosqich) <> b.bosqich then
    return jsonb_build_object('ok', false, 'code', 'YOPILGAN'); end if;

  v_bosqich := coalesce(p->>'bosqich', b.bosqich);
  if not (v_bosqich = any(v_tartib) or v_bosqich = 'bekor') then return jsonb_build_object('ok', false, 'code', 'BOSQICH_NOTOGRI'); end if;
  -- Bron bosqichi faqat t2_sotuv_bron_v1 orqali.
  if v_bosqich = 'bron' and b.bosqich <> 'bron' then return jsonb_build_object('ok', false, 'code', 'BRON_ORQALI'); end if;
  v_birlik := coalesce((p->>'birlik_id')::bigint, b.birlik_id);
  if v_birlik is distinct from b.birlik_id and b.bosqich in ('bron', 'shartnoma', 'tolov', 'topshirildi') then
    return jsonb_build_object('ok', false, 'code', 'BIRLIK_QULFLANGAN'); end if;
  if v_birlik is not null then
    select * into v_bir from public.t2_sotuv_birlik where id = v_birlik and kompaniya_id = p_kompaniya_id for update;
    if v_bir.id is null then return jsonb_build_object('ok', false, 'code', 'BIRLIK_NOT_FOUND'); end if;
  end if;

  if v_bosqich in ('shartnoma', 'tolov', 'topshirildi') and b.bosqich not in ('shartnoma', 'tolov', 'topshirildi') then
    if v_birlik is null then return jsonb_build_object('ok', false, 'code', 'BIRLIK_KERAK'); end if;
    if coalesce((p->>'summa')::numeric, b.summa) is null then return jsonb_build_object('ok', false, 'code', 'SUMMA_KERAK'); end if;
    if v_bir.holat = 'sotilgan' then return jsonb_build_object('ok', false, 'code', 'BIRLIK_SOTILGAN'); end if;
    if v_bir.holat = 'bron' and not exists (select 1 from public.t2_sotuv_bron r2 where r2.birlik_id = v_birlik and r2.bitim_id = v_id and r2.holat = 'faol') then
      return jsonb_build_object('ok', false, 'code', 'BIRLIK_BAND'); end if;
    update public.t2_sotuv_bron set holat = 'shartnoma' where birlik_id = v_birlik and bitim_id = v_id and holat = 'faol';
    update public.t2_sotuv_birlik set holat = 'sotilgan', versiya = versiya + 1, yangilandi = now() where id = v_birlik;
  end if;

  if v_bosqich = 'bekor' and b.bosqich <> 'bekor' then
    if nullif(btrim(coalesce(p->>'bekor_sabab', '')), '') is null then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
    update public.t2_sotuv_bron set holat = 'bekor', sabab = coalesce(sabab, p->>'bekor_sabab') where bitim_id = v_id and holat = 'faol';
    if b.birlik_id is not null and b.bosqich in ('bron', 'shartnoma', 'tolov', 'topshirildi') then
      update public.t2_sotuv_birlik set holat = 'bosh', versiya = versiya + 1, yangilandi = now() where id = b.birlik_id and holat in ('bron', 'sotilgan');
    end if;
    update public.t2_sotuv_grafik set faol = false where bitim_id = v_id and faol;
  end if;

  update public.t2_sotuv_bitim t set
    bosqich = v_bosqich, birlik_id = v_birlik,
    loyiha_id = coalesce((p->>'loyiha_id')::bigint, t.loyiha_id),
    manba = coalesce(p->>'manba', t.manba), masul_actor_id = coalesce((p->>'masul_actor_id')::bigint, t.masul_actor_id),
    narx_m2 = coalesce((p->>'narx_m2')::numeric, t.narx_m2), chegirma_foiz = coalesce((p->>'chegirma_foiz')::numeric, t.chegirma_foiz),
    summa = coalesce((p->>'summa')::numeric, t.summa), valyuta = coalesce(p->>'valyuta', t.valyuta), kurs = coalesce((p->>'kurs')::numeric, t.kurs),
    tolov_turi = coalesce(p->>'tolov_turi', t.tolov_turi), bank = coalesce(p->>'bank', t.bank), ipoteka_dastur = coalesce(p->>'ipoteka_dastur', t.ipoteka_dastur),
    subsidiya_summa = coalesce((p->>'subsidiya_summa')::numeric, t.subsidiya_summa),
    shartnoma_raqam = coalesce(p->>'shartnoma_raqam', t.shartnoma_raqam), shartnoma_sana = coalesce((p->>'shartnoma_sana')::date, t.shartnoma_sana),
    notarius_sana = coalesce((p->>'notarius_sana')::date, t.notarius_sana), kadastr_sana = coalesce((p->>'kadastr_sana')::date, t.kadastr_sana),
    eskrou_hisob = coalesce(p->>'eskrou_hisob', t.eskrou_hisob),
    topshirildi_sana = case when v_bosqich = 'topshirildi' then coalesce((p->>'topshirildi_sana')::date, t.topshirildi_sana, current_date) else t.topshirildi_sana end,
    bekor_sabab = case when v_bosqich = 'bekor' then coalesce(p->>'bekor_sabab', t.bekor_sabab) else t.bekor_sabab end,
    keyingi_aloqa = case when p ? 'keyingi_aloqa' then (p->>'keyingi_aloqa')::timestamptz else t.keyingi_aloqa end,
    izoh = coalesce(p->>'izoh', t.izoh),
    versiya = t.versiya + 1, yangilandi = now()
  where t.id = v_id;
  perform public._t2_sotuv_audit(p_kompaniya_id, 'bitim', v_id, 'yangilandi', to_jsonb(b), p, p_actor_id, p_operation_id);
  r := jsonb_build_object('ok', true, 'id', v_id, 'versiya', b.versiya + 1, 'bosqich', v_bosqich);
  return public._t2_sotuv_op_yoz(p_operation_id, p_kompaniya_id, 'bitim_saqla', r);
exception
  when unique_violation then return jsonb_build_object('ok', false, 'code', 'BIRLIK_SOTILGAN');
  when sqlstate '22023' then return jsonb_build_object('ok', false, 'code', sqlerrm);
end $$;

-- 3.7 Bron — QATTIQ QULF, muddati bilan. Boshqa bitimda faol bron bo'lsa — BAND (indeks kafolatlaydi).
create or replace function public.t2_sotuv_bron_v1(p_kompaniya_id bigint, p_actor_id bigint, p_bitim_id bigint, p_birlik_id bigint,
  p_soat integer, p_tolov_summa numeric, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; b record; s record; v_soat int; v_id bigint; v_tugaydi timestamptz; r jsonb;
begin
  v := public._t2_sotuv_op(p_operation_id, p_kompaniya_id); if v is not null then return v; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.write');
  perform public._t2_sotuv_bron_tozala(p_kompaniya_id);
  select * into b from public.t2_sotuv_bitim where id = p_bitim_id and kompaniya_id = p_kompaniya_id for update;
  if b.id is null then return jsonb_build_object('ok', false, 'code', 'BITIM_NOT_FOUND'); end if;
  if b.bosqich in ('shartnoma', 'tolov', 'topshirildi', 'bekor') then return jsonb_build_object('ok', false, 'code', 'BOSQICH_NOTOGRI'); end if;
  select * into s from public.t2_sotuv_birlik where id = p_birlik_id and kompaniya_id = p_kompaniya_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'code', 'BIRLIK_NOT_FOUND'); end if;
  if s.holat <> 'bosh' then return jsonb_build_object('ok', false, 'code', 'BIRLIK_BAND', 'holat', s.holat); end if;
  if s.narx_m2 is null then return jsonb_build_object('ok', false, 'code', 'NARX_YOQ'); end if;
  -- Shu bitimning boshqa birlikdagi faol broni — yopiladi (bir bitim — bitta bron).
  update public.t2_sotuv_bron set holat = 'bekor', sabab = 'boshqa birlik bronlandi' where bitim_id = p_bitim_id and holat = 'faol';
  update public.t2_sotuv_birlik u set holat = 'bosh', versiya = u.versiya + 1, yangilandi = now()
   where u.id = b.birlik_id and b.birlik_id is distinct from p_birlik_id and u.holat = 'bron'
     and not exists (select 1 from public.t2_sotuv_bron x where x.birlik_id = u.id and x.holat = 'faol');
  select coalesce(p_soat, l.bron_soat, 72) into v_soat from (select 1) z left join public.t2_sotuv_loyiha l on l.loyiha_id = coalesce(b.loyiha_id,
    (select o.loyiha_id from public.t2_obyekt o where o.id = s.obyekt_id));
  v_soat := least(greatest(coalesce(v_soat, 72), 1), 720);
  v_tugaydi := now() + make_interval(hours => v_soat);
  insert into public.t2_sotuv_bron (kompaniya_id, birlik_id, bitim_id, tugaydi, tolov_summa, actor_id, operation_id)
  values (p_kompaniya_id, p_birlik_id, p_bitim_id, v_tugaydi, p_tolov_summa, p_actor_id, p_operation_id)
  returning id into v_id;
  update public.t2_sotuv_birlik set holat = 'bron', versiya = versiya + 1, yangilandi = now() where id = p_birlik_id;
  update public.t2_sotuv_bitim set bosqich = 'bron', birlik_id = p_birlik_id,
    loyiha_id = coalesce(loyiha_id, (select o.loyiha_id from public.t2_obyekt o where o.id = s.obyekt_id)),
    narx_m2 = coalesce(narx_m2, s.narx_m2), summa = coalesce(summa, s.narx_jami), versiya = versiya + 1, yangilandi = now()
   where id = p_bitim_id;
  perform public._t2_sotuv_audit(p_kompaniya_id, 'bron', v_id, 'yaratildi', null,
    jsonb_build_object('birlik_id', p_birlik_id, 'bitim_id', p_bitim_id, 'tugaydi', v_tugaydi), p_actor_id, p_operation_id);
  r := jsonb_build_object('ok', true, 'id', v_id, 'tugaydi', v_tugaydi);
  return public._t2_sotuv_op_yoz(p_operation_id, p_kompaniya_id, 'bron', r);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'BIRLIK_BAND');
end $$;

create or replace function public.t2_sotuv_bron_bekor_v1(p_kompaniya_id bigint, p_actor_id bigint, p_bron_id bigint, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.write');
  if p_sabab is null or length(btrim(p_sabab)) = 0 then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  select * into r from public.t2_sotuv_bron where id = p_bron_id and kompaniya_id = p_kompaniya_id and holat = 'faol' for update;
  if r.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  update public.t2_sotuv_bron set holat = 'bekor', sabab = btrim(p_sabab) where id = p_bron_id;
  update public.t2_sotuv_birlik set holat = 'bosh', versiya = versiya + 1, yangilandi = now() where id = r.birlik_id and holat = 'bron';
  update public.t2_sotuv_bitim set bosqich = 'korsatildi', versiya = versiya + 1, yangilandi = now() where id = r.bitim_id and bosqich = 'bron';
  perform public._t2_sotuv_audit(p_kompaniya_id, 'bron', p_bron_id, 'bekor', null, jsonb_build_object('sabab', p_sabab), p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

-- 3.8 To'lov grafigi — yangi versiya (eskisi faol=false bo'lib saqlanadi). Σ = bitim summasi (±1 so'm).
create or replace function public.t2_sotuv_grafik_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_bitim_id bigint, p_qatorlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; b record; v_ver int; v_jami numeric; r jsonb;
begin
  v := public._t2_sotuv_op(p_operation_id, p_kompaniya_id); if v is not null then return v; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.write');
  select * into b from public.t2_sotuv_bitim where id = p_bitim_id and kompaniya_id = p_kompaniya_id for update;
  if b.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if b.bosqich = 'bekor' then return jsonb_build_object('ok', false, 'code', 'YOPILGAN'); end if;
  if b.summa is null then return jsonb_build_object('ok', false, 'code', 'SUMMA_KERAK'); end if;
  if jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 or jsonb_array_length(p_qatorlar) > 600 then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI'); end if;
  select sum((e->>'summa')::numeric) into v_jami from jsonb_array_elements(p_qatorlar) e;
  if abs(v_jami - b.summa) > 1 then return jsonb_build_object('ok', false, 'code', 'JAMI_MOS_EMAS', 'jami', v_jami, 'summa', b.summa); end if;
  select coalesce(max(versiya_no), 0) + 1 into v_ver from public.t2_sotuv_grafik where bitim_id = p_bitim_id;
  update public.t2_sotuv_grafik set faol = false where bitim_id = p_bitim_id and faol;
  insert into public.t2_sotuv_grafik (kompaniya_id, bitim_id, versiya_no, n, sana, summa, tur)
  select p_kompaniya_id, p_bitim_id, v_ver, row_number() over (order by (e->>'sana')::date, ord), (e->>'sana')::date, round((e->>'summa')::numeric, 2),
         coalesce(e->>'tur', 'oylik')
    from jsonb_array_elements(p_qatorlar) with ordinality as x(e, ord);
  perform public._t2_sotuv_audit(p_kompaniya_id, 'grafik', p_bitim_id, 'versiya', null, jsonb_build_object('versiya', v_ver, 'qatorlar', jsonb_array_length(p_qatorlar)), p_actor_id, p_operation_id);
  r := jsonb_build_object('ok', true, 'versiya_no', v_ver);
  return public._t2_sotuv_op_yoz(p_operation_id, p_kompaniya_id, 'grafik_saqla', r);
exception when check_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return jsonb_build_object('ok', false, 'code', 'QATOR_NOTOGRI', 'xato', sqlerrm);
end $$;

-- 3.9 To'lov kiritish / bekor qilish (sales.payment).
create or replace function public.t2_sotuv_tolov_yoz_v1(p_kompaniya_id bigint, p_actor_id bigint, p_bitim_id bigint, p_sana date, p_summa numeric,
  p_tur text, p_usul text, p_hujjat text, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; b record; v_id bigint; r jsonb;
begin
  v := public._t2_sotuv_op(p_operation_id, p_kompaniya_id); if v is not null then return v; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.payment');
  select * into b from public.t2_sotuv_bitim where id = p_bitim_id and kompaniya_id = p_kompaniya_id for update;
  if b.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_summa is null or p_summa <= 0 then return jsonb_build_object('ok', false, 'code', 'SUMMA_NOTOGRI'); end if;
  if p_sana is null or p_sana > current_date + 1 then return jsonb_build_object('ok', false, 'code', 'SANA_NOTOGRI'); end if;
  if coalesce(p_tur, 'tolov') = 'tolov' and b.bosqich not in ('shartnoma', 'tolov', 'topshirildi') then
    return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_KERAK'); end if;
  insert into public.t2_sotuv_tolov (kompaniya_id, bitim_id, sana, summa, tur, usul, hujjat_raqam, izoh, actor_id, operation_id)
  values (p_kompaniya_id, p_bitim_id, p_sana, round(p_summa, 2), coalesce(p_tur, 'tolov'), coalesce(p_usul, 'bank'), p_hujjat, p_izoh, p_actor_id, p_operation_id)
  returning id into v_id;
  if b.bosqich = 'shartnoma' and coalesce(p_tur, 'tolov') = 'tolov' then
    update public.t2_sotuv_bitim set bosqich = 'tolov', versiya = versiya + 1, yangilandi = now() where id = p_bitim_id;
  end if;
  perform public._t2_sotuv_audit(p_kompaniya_id, 'tolov', v_id, 'yaratildi', null,
    jsonb_build_object('bitim_id', p_bitim_id, 'summa', p_summa, 'sana', p_sana, 'tur', p_tur, 'usul', p_usul), p_actor_id, p_operation_id);
  r := jsonb_build_object('ok', true, 'id', v_id);
  return public._t2_sotuv_op_yoz(p_operation_id, p_kompaniya_id, 'tolov_yoz', r);
exception when check_violation then return jsonb_build_object('ok', false, 'code', 'QATOR_NOTOGRI', 'xato', sqlerrm);
end $$;

create or replace function public.t2_sotuv_tolov_bekor_v1(p_kompaniya_id bigint, p_actor_id bigint, p_sotuv_tolov_id bigint, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t record;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.payment');
  if p_sabab is null or length(btrim(p_sabab)) = 0 then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  select * into t from public.t2_sotuv_tolov where id = p_sotuv_tolov_id and kompaniya_id = p_kompaniya_id and holat = 'faol' for update;
  if t.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  update public.t2_sotuv_tolov set holat = 'bekor', izoh = coalesce(izoh || ' · ', '') || 'bekor: ' || btrim(p_sabab) where id = p_sotuv_tolov_id;
  perform public._t2_sotuv_audit(p_kompaniya_id, 'tolov', p_sotuv_tolov_id, 'bekor', to_jsonb(t), jsonb_build_object('sabab', p_sabab), p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

-- ───────────── 4. O'qish RPC lari (stable) ─────────────
-- Samarali holat: muddati o'tgan bron — «bosh» (o'qish yozmaydi; yozuvchi amallar tozalaydi).
create or replace function public._t2_sotuv_samarali_holat(p_holat text, p_bron_tugaydi timestamptz)
returns text language sql stable set search_path = public, pg_temp as $$
  select case when p_holat = 'bron' and (p_bron_tugaydi is null or p_bron_tugaydi <= now()) then 'bosh' else p_holat end;
$$;

-- 4.1 Shaxmatka: bino (obyekt) bo'yicha birliklar + hisoblagichlar. Mijoz ismi faqat sales.write ga ko'rinadi.
create or replace function public.t2_sotuv_shaxmatka_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_yoz boolean; v jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.read');
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
  v_yoz := public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'sales.write');
  with u as (
    select s.*, br.id as bron_id, br.tugaydi as bron_tugaydi, bt.id as bitim_id, m.fio as mijoz_fio,
           public._t2_sotuv_samarali_holat(s.holat, br.tugaydi) as h
      from public.t2_sotuv_birlik s
      left join public.t2_sotuv_bron br on br.birlik_id = s.id and br.holat = 'faol'
      left join lateral (select t.id, t.mijoz_id from public.t2_sotuv_bitim t
                          where t.birlik_id = s.id and t.bosqich in ('bron','shartnoma','tolov','topshirildi')
                          order by t.id desc limit 1) bt on true
      left join public.t2_sotuv_mijoz m on m.id = bt.mijoz_id
     where s.obyekt_id = p_obyekt_id
  )
  select jsonb_build_object('ok', true, 'generated_at', now(), 'obyekt_id', p_obyekt_id,
    'birliklar', coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id, 'podyezd', u.podyezd, 'qavat', u.qavat, 'raqam', u.raqam, 'tur', u.tur, 'xona_soni', u.xona_soni,
      'maydon', u.maydon, 'maydon_yashash', u.maydon_yashash, 'maydon_oshxona', u.maydon_oshxona, 'maydon_balkon', u.maydon_balkon,
      'shift', u.shift, 'pardoz', u.pardoz, 'yon', u.yon, 'manzara', u.manzara, 'planirovka_id', u.planirovka_id,
      'narx_m2', u.narx_m2, 'narx_jami', u.narx_jami, 'valyuta', u.valyuta, 'holat', u.h, 'versiya', u.versiya,
      'bron_id', case when u.h = 'bron' then u.bron_id end, 'bron_tugaydi', case when u.h = 'bron' then u.bron_tugaydi end,
      'bitim_id', case when v_yoz then u.bitim_id end, 'mijoz', case when v_yoz then u.mijoz_fio end)
      order by u.podyezd, u.qavat desc, u.raqam), '[]'::jsonb),
    'hisob', jsonb_build_object(
      'jami', count(u.id), 'bosh', count(*) filter (where u.h = 'bosh'), 'bron', count(*) filter (where u.h = 'bron'),
      'sotilgan', count(*) filter (where u.h = 'sotilgan'), 'sotuvda_emas', count(*) filter (where u.h = 'sotuvda_emas'),
      'zaxira', count(*) filter (where u.h = 'zaxira'),
      'maydon_bosh', round(coalesce(sum(u.maydon) filter (where u.h = 'bosh'), 0), 2),
      'qiymat_bosh', round(sum(u.narx_jami) filter (where u.h = 'bosh'), 2),
      'narxsiz_soni', count(*) filter (where u.narx_m2 is null)),
    'yozish', v_yoz)
  into v from u;
  return v;
end $$;

-- 4.2 Bitimlar (voronka / kanban): filtrlar — bosqich, mas'ul, loyiha, qidiruv (ism/telefon).
create or replace function public.t2_sotuv_bitimlar_v1(p_kompaniya_id bigint, p_actor_id bigint, p_filtr jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb; f jsonb := coalesce(p_filtr, '{}'::jsonb); q text := nullif(btrim(coalesce(f->>'qidiruv', '')), '');
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.write');
  select jsonb_build_object('ok', true, 'generated_at', now(), 'bitimlar', coalesce(jsonb_agg(x.j order by x.y desc), '[]'::jsonb)) into v
  from (
    select t.yangilandi as y, jsonb_build_object(
      'id', t.id, 'bosqich', case when t.bosqich = 'bron' and br.id is null then 'korsatildi' else t.bosqich end,
      'mijoz_id', m.id, 'mijoz', m.fio, 'telefon', m.telefon, 'manba', t.manba, 'masul_actor_id', t.masul_actor_id,
      'loyiha_id', t.loyiha_id, 'birlik_id', t.birlik_id, 'birlik', case when s.id is not null then jsonb_build_object('raqam', s.raqam, 'obyekt_id', s.obyekt_id,
         'qavat', s.qavat, 'xona_soni', s.xona_soni, 'maydon', s.maydon) end,
      'summa', t.summa, 'valyuta', t.valyuta, 'tolov_turi', t.tolov_turi, 'keyingi_aloqa', t.keyingi_aloqa,
      'bron_tugaydi', br.tugaydi, 'versiya', t.versiya, 'yaratildi', t.yaratildi, 'yangilandi', t.yangilandi) as j
    from public.t2_sotuv_bitim t
    join public.t2_sotuv_mijoz m on m.id = t.mijoz_id
    left join public.t2_sotuv_birlik s on s.id = t.birlik_id
    left join public.t2_sotuv_bron br on br.bitim_id = t.id and br.holat = 'faol' and br.tugaydi > now()
    where t.kompaniya_id = p_kompaniya_id
      and (f->>'bosqich' is null or t.bosqich = f->>'bosqich')
      and (f->>'masul_actor_id' is null or t.masul_actor_id = (f->>'masul_actor_id')::bigint)
      and (f->>'loyiha_id' is null or t.loyiha_id = (f->>'loyiha_id')::bigint)
      and (coalesce((f->>'yopilganlar')::boolean, false) or t.bosqich not in ('bekor', 'topshirildi') or t.yangilandi > now() - interval '30 days')
      and (q is null or m.fio ilike '%' || q || '%' or m.telefon_norm like '%' || regexp_replace(q, '[^0-9]', '', 'g') || '%' and regexp_replace(q, '[^0-9]', '', 'g') <> '')
    order by t.yangilandi desc
    limit 1000
  ) x;
  return v;
end $$;

-- 4.3 Bitim kartasi: mijoz, birlik, bron, faol grafik (FIFO taqsimot, kechikish), to'lovlar, audit.
create or replace function public.t2_sotuv_bitim_v1(p_kompaniya_id bigint, p_actor_id bigint, p_bitim_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t record; v_tolandi numeric; v jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.read');
  select * into t from public.t2_sotuv_bitim where id = p_bitim_id and kompaniya_id = p_kompaniya_id;
  if t.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select coalesce(sum(case when tur = 'qaytarim' then -summa else summa end), 0) into v_tolandi
    from public.t2_sotuv_tolov where bitim_id = p_bitim_id and holat = 'faol';
  with g as (
    select g.*, sum(g.summa) over (order by g.sana, g.n) as kum from public.t2_sotuv_grafik g where g.bitim_id = p_bitim_id and g.faol
  ), ga as (
    select g.*, greatest(0, least(g.summa, v_tolandi - (g.kum - g.summa))) as tolangan from g
  )
  select jsonb_build_object('ok', true, 'generated_at', now(),
    'bitim', to_jsonb(t),
    -- Hujjat PII (pinfl/pasport/inn/manzil/email) faqat sales.write ga; buxgalter/rahbar (sales.read) FIO + telefonni ko'radi.
    'mijoz', (select case when public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'sales.write') then to_jsonb(m) - 'telefon_norm'
                          else jsonb_build_object('id', m.id, 'tur', m.tur, 'fio', m.fio, 'telefon', m.telefon) end
                from public.t2_sotuv_mijoz m where m.id = t.mijoz_id),
    'birlik', (select to_jsonb(s) from public.t2_sotuv_birlik s where s.id = t.birlik_id),
    'bron', (select to_jsonb(b) from public.t2_sotuv_bron b where b.bitim_id = t.id order by b.id desc limit 1),
    'grafik', coalesce((select jsonb_agg(jsonb_build_object('id', ga.id, 'n', ga.n, 'sana', ga.sana, 'summa', ga.summa, 'tur', ga.tur,
                 'tolangan', round(ga.tolangan, 2), 'qoldiq', round(ga.summa - ga.tolangan, 2),
                 'kechikkan_kun', case when ga.summa - ga.tolangan > 0.005 and ga.sana < current_date then current_date - ga.sana end) order by ga.sana, ga.n)
               from ga), '[]'::jsonb),
    'grafik_versiya', (select max(versiya_no) from public.t2_sotuv_grafik where bitim_id = t.id and faol),
    'tolovlar', coalesce((select jsonb_agg(to_jsonb(p) order by p.sana, p.id) from public.t2_sotuv_tolov p where p.bitim_id = t.id), '[]'::jsonb),
    'jami', jsonb_build_object('summa', t.summa, 'tolandi', round(v_tolandi, 2),
      'qoldiq', case when t.summa is not null then round(t.summa - v_tolandi, 2) end,
      'muddati_otgan', (select round(coalesce(sum(ga.summa - ga.tolangan), 0), 2) from ga where ga.sana < current_date)),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('amal', a.amal, 'entity', a.entity, 'actor_id', a.actor_id, 'yaratildi', a.yaratildi)
                order by a.yaratildi desc)
               from (select * from public.t2_sotuv_audit a where a.kompaniya_id = p_kompaniya_id
                       and ((a.entity = 'bitim' and a.entity_id = t.id) or (a.entity = 'grafik' and a.entity_id = t.id)) order by a.yaratildi desc limit 50) a), '[]'::jsonb))
  into v from (select 1) z;
  return v;
end $$;

-- 4.4 Mijozlar ro'yxati (qidiruv bilan).
create or replace function public.t2_sotuv_mijozlar_v1(p_kompaniya_id bigint, p_actor_id bigint, p_qidiruv text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q text := nullif(btrim(coalesce(p_qidiruv, '')), ''); d text := regexp_replace(coalesce(p_qidiruv, ''), '[^0-9]', '', 'g'); v jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.write');
  select jsonb_build_object('ok', true, 'mijozlar', coalesce(jsonb_agg(x.j order by x.y desc), '[]'::jsonb)) into v from (
    select m.yangilandi as y, jsonb_build_object('id', m.id, 'tur', m.tur, 'fio', m.fio, 'telefon', m.telefon, 'manba', m.manba,
      'bitim_soni', (select count(*) from public.t2_sotuv_bitim t where t.mijoz_id = m.id),
      'rozilik', m.rozilik_sana is not null, 'yaratildi', m.yaratildi) as j
    from public.t2_sotuv_mijoz m
    where m.kompaniya_id = p_kompaniya_id
      and (q is null or m.fio ilike '%' || q || '%' or (d <> '' and m.telefon_norm like '%' || d || '%'))
    order by m.yangilandi desc limit 500
  ) x;
  return v;
end $$;

-- 4.5 Sotuv paneli: zaxira (bo'sh/bron/sotilgan, m², qiymat), sotilgan summa, tushum, qarzdorlik yoshi, kechikkanlar,
--     kelgusi oylar tushum prognozi (grafikdan), menejerlar, manbalar. p_loyiha_id — ixtiyoriy filtr.
create or replace function public.t2_sotuv_panel_v1(p_kompaniya_id bigint, p_actor_id bigint, p_loyiha_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'sales.read');
  with s as (
    select s.*, public._t2_sotuv_samarali_holat(s.holat, (select b.tugaydi from public.t2_sotuv_bron b where b.birlik_id = s.id and b.holat = 'faol')) as h,
           o.loyiha_id
      from public.t2_sotuv_birlik s join public.t2_obyekt o on o.id = s.obyekt_id
     where s.kompaniya_id = p_kompaniya_id and (p_loyiha_id is null or o.loyiha_id = p_loyiha_id)
  ), t as (
    select t.* from public.t2_sotuv_bitim t
     where t.kompaniya_id = p_kompaniya_id and (p_loyiha_id is null or t.loyiha_id = p_loyiha_id)
  ), sot as (
    select t.* from t where t.bosqich in ('shartnoma', 'tolov', 'topshirildi')
  ), tl as (
    select p.bitim_id, sum(case when p.tur = 'qaytarim' then -p.summa else p.summa end) as summa
      from public.t2_sotuv_tolov p join sot on sot.id = p.bitim_id where p.holat = 'faol' group by p.bitim_id
  ), g as (
    select g.bitim_id, g.sana, g.summa, sum(g.summa) over (partition by g.bitim_id order by g.sana, g.n) as kum
      from public.t2_sotuv_grafik g join sot on sot.id = g.bitim_id where g.faol
  ), ga as (
    select g.*, greatest(0, g.summa - greatest(0, least(g.summa, coalesce(tl.summa, 0) - (g.kum - g.summa)))) as qoldiq
      from g left join tl on tl.bitim_id = g.bitim_id
  )
  select jsonb_build_object('ok', true, 'generated_at', now(),
    'zaxira', (select jsonb_build_object(
        'jami', count(*), 'bosh', count(*) filter (where h = 'bosh'), 'bron', count(*) filter (where h = 'bron'),
        'sotilgan', count(*) filter (where h = 'sotilgan'), 'sotuvda_emas', count(*) filter (where h in ('sotuvda_emas', 'zaxira')),
        'maydon_jami', round(coalesce(sum(maydon), 0), 2), 'maydon_bosh', round(coalesce(sum(maydon) filter (where h = 'bosh'), 0), 2),
        'qiymat_bosh', round(sum(narx_jami) filter (where h = 'bosh'), 2), 'narxsiz_soni', count(*) filter (where narx_m2 is null and h = 'bosh'),
        'ortacha_m2_bosh', round(avg(narx_m2) filter (where h = 'bosh' and narx_m2 is not null), 2)) from s),
    'sotuv', (select jsonb_build_object('soni', count(*), 'summa', round(sum(summa), 2),
        'maydon', round(sum((select s2.maydon from public.t2_sotuv_birlik s2 where s2.id = sot.birlik_id)), 2),
        'ortacha_m2', round(sum(summa) / nullif(sum((select s2.maydon from public.t2_sotuv_birlik s2 where s2.id = sot.birlik_id)), 0), 2)) from sot),
    'tushum', (select round(sum(summa), 2) from tl),
    'qarz', jsonb_build_object(
        'muddati_otgan', (select round(coalesce(sum(qoldiq) filter (where sana < current_date), 0), 2) from ga),
        'k0_30',  (select round(coalesce(sum(qoldiq) filter (where sana < current_date and current_date - sana <= 30), 0), 2) from ga),
        'k31_90', (select round(coalesce(sum(qoldiq) filter (where current_date - sana between 31 and 90), 0), 2) from ga),
        'k90',    (select round(coalesce(sum(qoldiq) filter (where current_date - sana > 90), 0), 2) from ga),
        'kelajak', (select round(coalesce(sum(qoldiq) filter (where sana >= current_date), 0), 2) from ga)),
    'kechikkanlar', (select coalesce(jsonb_agg(x.j order by x.k desc), '[]'::jsonb) from (
        select max(current_date - ga.sana) as k, jsonb_build_object('bitim_id', ga.bitim_id, 'mijoz', m.fio, 'telefon', m.telefon,
          'qarz', round(sum(ga.qoldiq), 2), 'kun', max(current_date - ga.sana)) as j
        from ga join public.t2_sotuv_bitim bt on bt.id = ga.bitim_id join public.t2_sotuv_mijoz m on m.id = bt.mijoz_id
        where ga.sana < current_date and ga.qoldiq > 0.005 group by ga.bitim_id, m.fio, m.telefon order by 1 desc limit 50) x),
    'prognoz', (select coalesce(jsonb_agg(jsonb_build_object('oy', to_char(oy, 'YYYY-MM'), 'summa', round(summa, 2)) order by oy), '[]'::jsonb) from (
        select date_trunc('month', ga.sana)::date as oy, sum(ga.qoldiq) as summa from ga
         where ga.sana >= date_trunc('month', current_date) and ga.sana < date_trunc('month', current_date) + interval '12 months' and ga.qoldiq > 0
         group by 1) p),
    'voronka', (select coalesce(jsonb_object_agg(bosqich, n), '{}'::jsonb) from (select bosqich, count(*) n from t group by bosqich) f),
    'manbalar', (select coalesce(jsonb_agg(jsonb_build_object('manba', coalesce(manba, 'boshqa'), 'lid', n, 'sotildi', sotildi) order by n desc), '[]'::jsonb) from (
        select manba, count(*) n, count(*) filter (where bosqich in ('shartnoma', 'tolov', 'topshirildi')) sotildi from t group by manba) m),
    'menejerlar', (select coalesce(jsonb_agg(jsonb_build_object('actor_id', masul_actor_id, 'ism', (select f.ism from public.t2_foydalanuvchi f where f.id = masul_actor_id),
        'bitim', n, 'sotildi', sotildi, 'summa', round(summa, 2)) order by summa desc nulls last), '[]'::jsonb) from (
        select masul_actor_id, count(*) n, count(*) filter (where bosqich in ('shartnoma', 'tolov', 'topshirildi')) sotildi,
               sum(summa) filter (where bosqich in ('shartnoma', 'tolov', 'topshirildi')) summa from t group by masul_actor_id) mm),
    'oylik_sotuv', (select coalesce(jsonb_agg(jsonb_build_object('oy', to_char(oy, 'YYYY-MM'), 'soni', n, 'summa', round(summa, 2)) order by oy), '[]'::jsonb) from (
        select date_trunc('month', coalesce(shartnoma_sana, yangilandi::date))::date oy, count(*) n, sum(summa) summa from sot
         where coalesce(shartnoma_sana, yangilandi::date) >= date_trunc('month', current_date) - interval '11 months' group by 1) os),
    'binolar', (select coalesce(jsonb_agg(jsonb_build_object('obyekt_id', o.id, 'nom', o.nom, 'loyiha_id', o.loyiha_id,
        'jami', x.jami, 'bosh', x.bosh, 'sotilgan', x.sotilgan) order by o.nom), '[]'::jsonb)
        from (select obyekt_id, count(*) jami, count(*) filter (where h = 'bosh') bosh, count(*) filter (where h = 'sotilgan') sotilgan from s group by obyekt_id) x
        join public.t2_obyekt o on o.id = x.obyekt_id),
    'loyihalar', (select coalesce(jsonb_agg(jsonb_build_object('loyiha_id', l.id, 'nom', l.nom, 'reyestr_raqam', sl.reyestr_raqam, 'sotuvda', coalesce(sl.sotuvda, false),
        'topshirish_sana', sl.topshirish_sana, 'eskrou_hisob', sl.eskrou_hisob, 'bron_soat', coalesce(sl.bron_soat, 72)) order by l.nom), '[]'::jsonb)
        from public.t2_loyiha l left join public.t2_sotuv_loyiha sl on sl.loyiha_id = l.id
        where l.kompaniya_id = p_kompaniya_id and (p_loyiha_id is null or l.id = p_loyiha_id)))
  into v;
  return v;
end $$;

-- ───────────── 5. Grantlar ─────────────
do $do$ declare f text; begin
  foreach f in array array[
    'public._t2_sotuv_tel(text)', 'public._t2_sotuv_op(uuid,bigint)', 'public._t2_sotuv_op_yoz(uuid,bigint,text,jsonb)',
    'public._t2_sotuv_audit(bigint,text,bigint,text,jsonb,jsonb,bigint,uuid)', 'public._t2_sotuv_bron_tozala(bigint)',
    'public._t2_sotuv_mijoz_upsert(bigint,bigint,jsonb)', 'public._t2_sotuv_samarali_holat(text,timestamptz)',
    'public.t2_sotuv_loyiha_saqla_v1(bigint,bigint,bigint,jsonb,uuid)', 'public.t2_sotuv_birlik_saqla_v1(bigint,bigint,bigint,jsonb,uuid)',
    'public.t2_sotuv_narx_ozgartir_v1(bigint,bigint,bigint[],text,numeric,text,uuid)', 'public.t2_sotuv_birlik_holat_v1(bigint,bigint,bigint,text,text,integer)',
    'public.t2_sotuv_bitim_saqla_v1(bigint,bigint,jsonb,uuid)', 'public.t2_sotuv_bron_v1(bigint,bigint,bigint,bigint,integer,numeric,uuid)',
    'public.t2_sotuv_bron_bekor_v1(bigint,bigint,bigint,text)', 'public.t2_sotuv_grafik_saqla_v1(bigint,bigint,bigint,jsonb,uuid)',
    'public.t2_sotuv_tolov_yoz_v1(bigint,bigint,bigint,date,numeric,text,text,text,text,uuid)', 'public.t2_sotuv_tolov_bekor_v1(bigint,bigint,bigint,text)',
    'public.t2_sotuv_shaxmatka_v1(bigint,bigint,bigint)', 'public.t2_sotuv_bitimlar_v1(bigint,bigint,jsonb)', 'public.t2_sotuv_bitim_v1(bigint,bigint,bigint)',
    'public.t2_sotuv_mijozlar_v1(bigint,bigint,text)', 'public.t2_sotuv_panel_v1(bigint,bigint,bigint)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $do$;

commit;
