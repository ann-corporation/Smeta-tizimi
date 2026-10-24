-- P2 TENDER (E7 §3) — t2_birja_rfq / t2_birja_taklif BASELINE + KENGAYTMA.
-- Egasi: tomon-yetkazuvchi. Kontrakt: docs/architecture/ekotizim/E2 §5, E3 §5.7, E7 §3.
--
-- 1) BASELINE: prodda ikkala jadval allaqachon bor (sinov qatorlari: rfq id 3,4; taklif id 3), lekin hech bir migratsiyada yo'q
--    (faqat tizim02/sinov/06_sklad_va_b2b.sql). `create table if not exists` prod tuzilishini aynan takrorlaydi — prodda no-op,
--    toza bazada jadvalni yaratadi. Yangi PARALLEL RFQ jadvali YO'Q.
-- 2) KENGAYTMA (faqat additiv): ko'p qator (t2_birja_rfq_qator), takliflar qatorlari (t2_birja_taklif_qator), taklif qilingan
--    yetkazuvchilar (t2_birja_rfq_oluvchi), muddat, yetkazish, NDS (qqs_foiz — narx doim NDS siz), g'olib belgilash.
-- 3) ESKI SINOV QATORLARI QABUL QILINADI: rfq/taklif o'zgarmaydi; ularga bittadan qator (qator_no=1) backfill qilinadi;
--    eski holat so'zlari ('ochiq','yopiq','faol','bekor') check'da SAQLANADI (eski RPC va UI sinmasin), yangi so'zlar qo'shiladi.
-- Hamma jadval: RLS yoqilgan, policy YO'Q, anon/authenticated ga GRANT YO'Q; kirish faqat SECURITY DEFINER RPC (keyingi migratsiyalar).

-- ───────────────────────── 1. Baseline (prod shakli) ─────────────────────────
create table if not exists public.t2_birja_rfq (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  nom text not null,
  birlik text not null,
  hajm numeric not null,
  izoh text,
  holat text not null default 'ochiq',
  versiya integer not null default 1,
  operation_id uuid,
  kim text,
  yaratilgan_vaqt timestamptz not null default now()
);
create table if not exists public.t2_birja_taklif (
  id bigint generated always as identity primary key,
  rfq_id bigint not null references public.t2_birja_rfq(id) on delete cascade,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  narx numeric not null,
  izoh text,
  holat text not null default 'faol',
  operation_id uuid,
  kim text,
  yaratilgan_vaqt timestamptz not null default now()
);
create unique index if not exists t2_birja_rfq_opid_uniq on public.t2_birja_rfq (operation_id) where operation_id is not null;
create unique index if not exists t2_birja_taklif_opid_uniq on public.t2_birja_taklif (operation_id) where operation_id is not null;
create index if not exists ix_fk_t2_birja_rfq_kompaniya_id_fkey on public.t2_birja_rfq (kompaniya_id);
create index if not exists ix_fk_t2_birja_taklif_kompaniya_id_fkey on public.t2_birja_taklif (kompaniya_id);
create index if not exists ix_fk_t2_birja_taklif_rfq_id_fkey on public.t2_birja_taklif (rfq_id);
alter table public.t2_birja_rfq enable row level security;
alter table public.t2_birja_taklif enable row level security;
revoke all on table public.t2_birja_rfq, public.t2_birja_taklif from anon, authenticated;

-- ───────────────────────── 2. RFQ kengaytmasi ─────────────────────────
alter table public.t2_birja_rfq alter column birlik drop not null;   -- ko'p qatorli tenderda sarlavha darajasida birlik/hajm yo'q (NULL ≠ 0)
alter table public.t2_birja_rfq alter column hajm drop not null;
alter table public.t2_birja_rfq add column if not exists obyekt_id bigint references public.t2_obyekt(id);
alter table public.t2_birja_rfq add column if not exists tur text not null default 'material' check (tur ~ '^[a-z_]{2,40}$');
alter table public.t2_birja_rfq add column if not exists doira text not null default 'ochiq' check (doira in ('ochiq', 'taklif'));
alter table public.t2_birja_rfq add column if not exists muddat timestamptz;
alter table public.t2_birja_rfq add column if not exists shart jsonb not null default '{}'::jsonb check (pg_column_size(shart) <= 4096);
alter table public.t2_birja_rfq add column if not exists yaratdi_actor_id bigint references public.t2_foydalanuvchi(id);
alter table public.t2_birja_rfq add column if not exists yopilgan_vaqt timestamptz;
alter table public.t2_birja_rfq add column if not exists yangilandi timestamptz not null default now();
alter table public.t2_birja_rfq drop constraint if exists t2_birja_rfq_holat_check;
alter table public.t2_birja_rfq add constraint t2_birja_rfq_holat_check
  check (holat in ('ochiq', 'yopiq', 'bekor', 'qoralama', 'elon', 'yopildi', 'golib_tanlandi'));   -- 'ochiq'≈'elon', 'yopiq'≈'yopildi' (eski so'zlar)
create index if not exists t2_birja_rfq_k_o_idx on public.t2_birja_rfq (kompaniya_id, obyekt_id, id desc);
create index if not exists t2_birja_rfq_ochiq_idx on public.t2_birja_rfq (id desc) where holat in ('ochiq', 'elon') and doira = 'ochiq';

-- ───────────────────────── 3. RFQ qatorlari ─────────────────────────
create table if not exists public.t2_birja_rfq_qator (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),           -- RFQ egasi
  rfq_id bigint not null references public.t2_birja_rfq(id),
  qator_no integer not null check (qator_no > 0),
  nom text not null check (length(btrim(nom)) between 1 and 300),
  birlik text not null check (length(btrim(birlik)) between 1 and 40),
  miqdor numeric(20,4) not null check (miqdor > 0),
  resurs_kodi text check (resurs_kodi is null or length(resurs_kodi) <= 80),
  zayavka_id bigint references public.t2_erp_taminot(id),                    -- zayavka (yagona) ga havola
  smeta_qator_id bigint,                                                     -- smeta qatori (CONST) ga mantiqiy havola, FK emas
  izoh text check (izoh is null or length(izoh) <= 1000),
  golib_taklif_qator_id bigint,                                              -- shu qator qaysi taklif qatoriga berilgan (NULL = hali yo'q)
  yaratildi timestamptz not null default now(),
  unique (rfq_id, qator_no)
);
create index if not exists t2_birja_rfq_qator_k_idx on public.t2_birja_rfq_qator (kompaniya_id, rfq_id);
alter table public.t2_birja_rfq_qator enable row level security;
revoke all on table public.t2_birja_rfq_qator from anon, authenticated;

-- ───────────────────────── 4. Taklif berish uchun chaqirilganlar ─────────────────────────
create table if not exists public.t2_birja_rfq_oluvchi (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),           -- RFQ egasi
  rfq_id bigint not null references public.t2_birja_rfq(id),
  oluvchi_kompaniya_id bigint not null references public.t2_kompaniya(id),
  aloqa_id bigint not null references public.t2_tomon_aloqa(id),             -- chaqirish paytidagi faol aloqa (ko'rinish har o'qishda qayta tekshiriladi)
  holat text not null default 'yuborildi' check (holat in ('yuborildi', 'ko_rildi', 'rad')),
  yaratildi timestamptz not null default now(),
  unique (rfq_id, oluvchi_kompaniya_id),
  check (kompaniya_id <> oluvchi_kompaniya_id)
);
create index if not exists t2_birja_rfq_oluvchi_idx on public.t2_birja_rfq_oluvchi (oluvchi_kompaniya_id, rfq_id desc);
alter table public.t2_birja_rfq_oluvchi enable row level security;
revoke all on table public.t2_birja_rfq_oluvchi from anon, authenticated;

-- ───────────────────────── 5. Taklif kengaytmasi ─────────────────────────
alter table public.t2_birja_taklif alter column narx drop not null;          -- ko'p qatorli taklifda yagona narx yo'q; qator narxlari t2_birja_taklif_qator da
alter table public.t2_birja_taklif add column if not exists versiya integer not null default 1;
alter table public.t2_birja_taklif add column if not exists yetkazish_narx numeric(20,2) check (yetkazish_narx is null or yetkazish_narx >= 0);  -- NDS siz, butun taklif uchun; NULL = noma'lum
alter table public.t2_birja_taklif add column if not exists qqs_foiz numeric(5,2) check (qqs_foiz is null or qqs_foiz between 0 and 100);       -- ma'lumot uchun; narxlar NDS siz
alter table public.t2_birja_taklif add column if not exists yaratdi_actor_id bigint references public.t2_foydalanuvchi(id);
alter table public.t2_birja_taklif add column if not exists yangilandi timestamptz not null default now();
alter table public.t2_birja_taklif drop constraint if exists t2_birja_taklif_holat_check;
alter table public.t2_birja_taklif add constraint t2_birja_taklif_holat_check
  check (holat in ('faol', 'bekor', 'berildi', 'golib', 'yutqazdi', 'qaytarib_olindi'));   -- 'faol'≈'berildi' (eski)
create unique index if not exists t2_birja_taklif_faol_uq on public.t2_birja_taklif (rfq_id, kompaniya_id) where holat in ('faol', 'berildi');

create table if not exists public.t2_birja_taklif_qator (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),           -- taklif beruvchi (egasi)
  taklif_id bigint not null references public.t2_birja_taklif(id),
  rfq_qator_id bigint not null references public.t2_birja_rfq_qator(id),
  narx numeric(20,2) not null check (narx >= 0),                             -- birlik narxi, NDS siz. Narx bermagan qator umuman yozilmaydi (NULL ≠ 0)
  muddat_kun integer check (muddat_kun is null or muddat_kun between 0 and 3650),
  mavjud_miqdor numeric(20,4) check (mavjud_miqdor is null or mavjud_miqdor > 0),   -- NULL = talab qilingan miqdorning hammasi
  izoh text check (izoh is null or length(izoh) <= 500),
  yaratildi timestamptz not null default now(),
  unique (taklif_id, rfq_qator_id)
);
create index if not exists t2_birja_taklif_qator_k_idx on public.t2_birja_taklif_qator (kompaniya_id, taklif_id);
create index if not exists t2_birja_taklif_qator_rq_idx on public.t2_birja_taklif_qator (rfq_qator_id);
alter table public.t2_birja_taklif_qator enable row level security;
revoke all on table public.t2_birja_taklif_qator from anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_birja_rfq_qator_golib_fk') then
    alter table public.t2_birja_rfq_qator add constraint t2_birja_rfq_qator_golib_fk
      foreign key (golib_taklif_qator_id) references public.t2_birja_taklif_qator(id);
  end if;
end $$;

-- ───────────────────────── 6. Eski sinov qatorlarini qabul qilish (idempotent) ─────────────────────────
insert into public.t2_birja_rfq_qator (kompaniya_id, rfq_id, qator_no, nom, birlik, miqdor, izoh)
select r.kompaniya_id, r.id, 1, r.nom, r.birlik, r.hajm, r.izoh
  from public.t2_birja_rfq r
 where r.hajm > 0 and r.birlik is not null and length(btrim(r.nom)) > 0 and length(btrim(r.birlik)) > 0
   and not exists (select 1 from public.t2_birja_rfq_qator q where q.rfq_id = r.id);

insert into public.t2_birja_taklif_qator (kompaniya_id, taklif_id, rfq_qator_id, narx, izoh)
select t.kompaniya_id, t.id, q.id, t.narx, left(t.izoh, 500)
  from public.t2_birja_taklif t
  join public.t2_birja_rfq_qator q on q.rfq_id = t.rfq_id and q.qator_no = 1
 where t.narx is not null and t.narx >= 0
   and (select count(*) from public.t2_birja_rfq_qator z where z.rfq_id = t.rfq_id) = 1
   and not exists (select 1 from public.t2_birja_taklif_qator x where x.taklif_id = t.id);
