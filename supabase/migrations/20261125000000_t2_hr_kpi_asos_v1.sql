-- T2-HR-KPI-001 (1/2) - HR + KPI: sxema. Dizayn: docs/architecture/HR_KPI_V1.md
-- DUBLIKAT YASALMAYDI - mavjud jadvallar kengaytiriladi:
--   * xodim            = t2_kadr_mustaqil (kanonik; foydalanuvchi_id bor) + t2_hr_xodim (1:1 HR maydonlari);
--   * obyektga biriktirish = t2_kadr_bog (mavjud; ulush_foiz/rol/dan/gacha ustunlari qo'shiladi, mindmap yo'li o'zgarmaydi);
--   * ruxsatlar        = hr.read/write, hr.pii.read/write, hr.tabel.write, payroll.read/write (F1 da bor; yangisi yo'q).
-- YANGI: t2_hr_xodim, t2_hr_xodim_pii, t2_hr_sxema, t2_hr_sozlama, t2_hr_kalendar, t2_hr_tatil, t2_hr_tabel, t2_hr_tuzatma, t2_hr_oylik.
-- Qoidalar: NULL = noma'lum (0 emas); fayl dalillari R2 da (faqat fayl_id); hamma jadval RLS yoqilgan, anon/authenticated yopiq.
begin;

alter table public.t2_kadr_bog add column if not exists ulush_foiz numeric(5,2) not null default 100 check (ulush_foiz > 0 and ulush_foiz <= 100);
alter table public.t2_kadr_bog add column if not exists rol text;
alter table public.t2_kadr_bog add column if not exists dan date;
alter table public.t2_kadr_bog add column if not exists gacha date;
comment on column public.t2_kadr_bog.ulush_foiz is 'Xodimning shu obyektdagi mas''uliyat ulushi (%); F2 KPI shu ulushga ko''paytiriladi. Sukut 100.';
comment on column public.t2_kadr_bog.dan is 'Biriktirish boshlanishi (NULL = cheklovsiz). F2 tasdiq sanasi dan..gacha ichida bo''lsa hisobga kiradi.';

create table if not exists public.t2_hr_sxema (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  nom text not null check (length(btrim(nom)) > 0),
  f2_foiz numeric(7,3) check (f2_foiz is null or (f2_foiz >= 0 and f2_foiz <= 100)),
  f2_baza text not null default 'ustamasiz' check (f2_baza in ('ustamasiz', 'ustamali')),
  f2_rejim text not null default 'obyekt' check (f2_rejim in ('obyekt', 'muallif')),
  izoh text,
  faol boolean not null default true,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  kim text,
  unique (kompaniya_id, nom)
);
comment on table public.t2_hr_sxema is 'KPI sxemasi (kompaniya bo''yicha). f2_foiz NULL = F2 bonusi yo''q. f2_baza: ustamasiz | ustamali (ИТОГО-4); f2_rejim: obyekt (biriktirilgan obyektlar) | muallif (akt muallifi).';

create table if not exists public.t2_hr_sozlama (
  kompaniya_id bigint primary key references public.t2_kompaniya(id) on delete cascade,
  ndfl_foiz numeric(6,3) check (ndfl_foiz is null or (ndfl_foiz >= 0 and ndfl_foiz <= 100)),
  inps_foiz numeric(6,3) check (inps_foiz is null or (inps_foiz >= 0 and inps_foiz <= 100)),
  kun_soat numeric(4,2) not null default 8 check (kun_soat > 0 and kun_soat <= 24),
  versiya integer not null default 1,
  yangilandi timestamptz not null default now(),
  kim text
);
comment on table public.t2_hr_sozlama is 'Ish haqi stavkalari (qattiq kodlanmagan). NULL = kiritilmagan: ushlanma va sof ish haqi NULL (0 emas).';

create table if not exists public.t2_hr_xodim (
  kadr_id bigint primary key references public.t2_kadr_mustaqil(id) on delete cascade,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  rol text not null default 'ishchi' check (rol in ('prorab', 'brigadir', 'usta', 'ishchi', 'muhandis', 'boshqa')),
  grafik smallint not null default 5 check (grafik in (5, 6)),
  baza_turi text not null default 'oylik' check (baza_turi in ('oylik', 'kunlik')),
  baza_summa numeric check (baza_summa is null or baza_summa >= 0),
  sxema_id bigint references public.t2_hr_sxema(id) on delete set null,
  qabul_sana date,
  bosh_sana date,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  kim text
);
comment on column public.t2_hr_xodim.baza_summa is 'oylik: oklad (UZS/oy); kunlik: kunlik stavka. NULL = noma''lum (baza NULL, 0 emas).';
create index if not exists t2_hr_xodim_kompaniya_idx on public.t2_hr_xodim (kompaniya_id);
create index if not exists t2_hr_xodim_sxema_idx on public.t2_hr_xodim (sxema_id) where sxema_id is not null;

create table if not exists public.t2_hr_xodim_pii (
  kadr_id bigint primary key references public.t2_kadr_mustaqil(id) on delete cascade,
  pinfl text check (pinfl is null or pinfl ~ '^[0-9]{14}$'),
  pasport text,
  telefon text check (telefon is null or telefon ~ '^\+[0-9]{9,15}$'),
  manzil text,
  versiya integer not null default 1,
  yangilandi timestamptz not null default now(),
  kim text
);
comment on table public.t2_hr_xodim_pii is 'Xodimning shaxsiy ma''lumotlari. Faqat hr.pii.read / hr.pii.write (RPC ichida); ro''yxatlarda boshqalarga qaytarilmaydi.';

create table if not exists public.t2_hr_kalendar (
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  sana date not null,
  tur text not null check (tur in ('bayram', 'dam', 'ish')),
  nom text,
  yangilandi timestamptz not null default now(),
  primary key (kompaniya_id, sana)
);
comment on table public.t2_hr_kalendar is 'Kompaniya kalendari istisnolari: bayram | dam (qo''shimcha/ko''chirilgan dam) | ish (ko''chirilgan ish kuni). Bayramlar MA''LUMOT (qattiq mantiq emas).';

create table if not exists public.t2_hr_tatil (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  kadr_id bigint not null references public.t2_kadr_mustaqil(id) on delete cascade,
  tur text not null check (tur in ('otpusk', 'otgul', 'kasal')),
  dan date not null,
  gacha date not null,
  holat text not null default 'reja' check (holat in ('reja', 'tasdiqlangan', 'bekor')),
  izoh text,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  kim text,
  check (gacha >= dan)
);
create index if not exists t2_hr_tatil_kompaniya_idx on public.t2_hr_tatil (kompaniya_id, dan);
create index if not exists t2_hr_tatil_kadr_idx on public.t2_hr_tatil (kadr_id, dan);

create table if not exists public.t2_hr_tabel (
  kadr_id bigint not null references public.t2_kadr_mustaqil(id) on delete cascade,
  oy date not null check (oy = date_trunc('month', oy)::date),
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  kunlar jsonb not null default '{}'::jsonb check (jsonb_typeof(kunlar) = 'object'),
  holat text not null default 'qoralama' check (holat in ('qoralama', 'tasdiqlangan')),
  versiya integer not null default 1,
  yangilandi timestamptz not null default now(),
  kim text,
  primary key (kadr_id, oy)
);
comment on column public.t2_hr_tabel.kunlar is '{"<kun>":"K|N|O|B|D"}: K keldi, N kelmadi, O otpusk, B kasal, D otgul. Yozilmagan kun = belgilanmagan.';
create index if not exists t2_hr_tabel_kompaniya_idx on public.t2_hr_tabel (kompaniya_id, oy);

create table if not exists public.t2_hr_tuzatma (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  kadr_id bigint not null references public.t2_kadr_mustaqil(id) on delete cascade,
  oy date not null check (oy = date_trunc('month', oy)::date),
  tur text not null check (tur in ('jarima', 'bonus')),
  sabab text not null default 'boshqa' check (sabab in ('nuqson', 'kechikish', 'xavfsizlik', 'ragbat', 'boshqa')),
  izoh text,
  summa numeric check (summa is null or summa >= 0),
  foiz numeric(7,3) check (foiz is null or (foiz > 0 and foiz <= 100)),
  obyekt_id bigint references public.t2_obyekt(id) on delete set null,
  akt_id bigint references public.t2_akt(id) on delete set null,
  sifat_id bigint references public.t2_erp_sifat(id) on delete set null,
  fayl_id text,
  holat text not null default 'qoralama' check (holat in ('qoralama', 'tasdiqlangan', 'rad', 'bekor')),
  yaratgan bigint,
  qaror_kim bigint,
  qaror_vaqt timestamptz,
  qaror_izoh text,
  versiya integer not null default 1,
  operation_id uuid,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  check ((summa is not null) <> (foiz is not null))
);
comment on column public.t2_hr_tuzatma.foiz is 'Bazadan (kun/oklad bo''yicha hisoblangan ish haqi) foiz. summa YOKI foiz - aynan bittasi.';
comment on column public.t2_hr_tuzatma.fayl_id is 'Dalil fayli: mavjud R2 hujjat yo''lidagi identifikator (DB da fayl saqlanmaydi).';
create index if not exists t2_hr_tuzatma_kompaniya_oy_idx on public.t2_hr_tuzatma (kompaniya_id, oy);
create index if not exists t2_hr_tuzatma_kadr_oy_idx on public.t2_hr_tuzatma (kadr_id, oy);
create index if not exists t2_hr_tuzatma_obyekt_idx on public.t2_hr_tuzatma (obyekt_id) where obyekt_id is not null;
create index if not exists t2_hr_tuzatma_akt_idx on public.t2_hr_tuzatma (akt_id) where akt_id is not null;
create index if not exists t2_hr_tuzatma_sifat_idx on public.t2_hr_tuzatma (sifat_id) where sifat_id is not null;
create unique index if not exists t2_hr_tuzatma_operation_uq on public.t2_hr_tuzatma (operation_id) where operation_id is not null;

create table if not exists public.t2_hr_oylik (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  kadr_id bigint not null references public.t2_kadr_mustaqil(id) on delete cascade,
  oy date not null check (oy = date_trunc('month', oy)::date),
  holat text not null default 'qoralama' check (holat in ('qoralama', 'tasdiqlangan')),
  norma_kun integer,
  kun_ishlagan integer,
  baza numeric,
  kpi_f2 numeric,
  bonus numeric,
  jarima numeric,
  hisoblangan numeric,
  ndfl numeric,
  inps numeric,
  sof numeric,
  toliq boolean not null default false,
  tafsilot jsonb not null default '{}'::jsonb,
  provodka_holat text not null default 'yoq' check (provodka_holat in ('yoq', 'navbatda', 'yozilgan')),
  provodka_id bigint,
  versiya integer not null default 1,
  hisoblangan_vaqt timestamptz not null default now(),
  kim text,
  unique (kadr_id, oy)
);
comment on table public.t2_hr_oylik is 'Oylik ish haqi tasviri (qoralama/tasdiq). NULL = noma''lum. provodka_* - buxgalteriya moduli uchun ilgak (v1 da yozilmaydi).';
create index if not exists t2_hr_oylik_kompaniya_idx on public.t2_hr_oylik (kompaniya_id, oy);

do $rls$
declare t text;
begin
  foreach t in array array['t2_hr_sxema', 't2_hr_sozlama', 't2_hr_xodim', 't2_hr_xodim_pii', 't2_hr_kalendar', 't2_hr_tatil', 't2_hr_tabel', 't2_hr_tuzatma', 't2_hr_oylik'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $rls$;
revoke all on sequence public.t2_hr_sxema_id_seq, public.t2_hr_tatil_id_seq, public.t2_hr_tuzatma_id_seq, public.t2_hr_oylik_id_seq from anon, authenticated;

commit;
