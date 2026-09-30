-- T2-IJRO-AOSR-LAB-001 — ijro hujjatlari: АОСР to'liq blank maydonlari,
-- laboratoriya (alohida kompaniya — kontragent) protokollari, kompaniya logosi.
-- Egasi 2026-09-30: migratsiyaga ruxsat berdi; laboratoriya — alohida kompaniya.
-- Faqat ADDITIV: yangi ustunlar (nullable/default), yangi jadvallar, yangi
-- funksiyalar/view'lar. Mavjud ma'lumot o'zgartirilmaydi. Rollback: *.rollback.sql.
--
-- Blank manbasi: ШНК 3.01.01-22 Прил.№6 (egasining AKT_SYSTEM_TEMPLATES —
-- TPL_WITH_SUB / TEMPLATE_NO_SUB_SHEET). Maydonlar blank bo'limlariga mos:
--   1. ish tavsifi · 2. loyiha hujjati (tashkilot, chizma) · 3. materiallar ·
--   4. chetlanishlar · 5. sanalar · qaror: keyingi ishlar · komissiya/imzolar.

begin;

-- ── 1. АОСР: blank maydonlari ─────────────────────────────────────────
alter table public.t2_aosr
  add column if not exists tur text not null default 'aosr',
  add column if not exists blank_varianti text not null default 'subpudratchisiz',
  add column if not exists ish_tavsifi text,
  add column if not exists loyiha_tashkiloti text,
  add column if not exists loyiha_hujjati text,
  add column if not exists materiallar text,
  add column if not exists chetlanishlar text,
  add column if not exists keyingi_ishlar text,
  add column if not exists komissiya jsonb not null default '[]'::jsonb,
  add column if not exists sana date;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_aosr_tur_check') then
    alter table public.t2_aosr add constraint t2_aosr_tur_check
      check (tur in ('aosr', 'oraliq_qabul', 'sinov'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 't2_aosr_blank_varianti_check') then
    alter table public.t2_aosr add constraint t2_aosr_blank_varianti_check
      check (blank_varianti in ('subpudratchili', 'subpudratchisiz'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 't2_aosr_komissiya_array_check') then
    alter table public.t2_aosr add constraint t2_aosr_komissiya_array_check
      check (jsonb_typeof(komissiya) = 'array');
  end if;
end $$;

-- Obyekt ichida tur+raqam takrorlanmasin (bekor qilinganlar hisobga olinmaydi).
create unique index if not exists t2_aosr_obyekt_tur_raqam_uq
  on public.t2_aosr (obyekt_id, tur, raqam)
  where raqam is not null and holat <> 'bekor';

-- ── 2. Laboratoriya — kontragent roli ─────────────────────────────────
-- Constraint kengaytiriladi (eski qiymatlar saqlanadi, 'laboratoriya' qo'shiladi).
alter table public.t2_kontragent drop constraint if exists t2_kontragent_mavqe_check;
alter table public.t2_kontragent add constraint t2_kontragent_mavqe_check
  check (mavqe is null or mavqe in ('buyurtmachi', 'pudratchi', 'subpudratchi', 'loyihachi', 'taminotchi', 'laboratoriya'));

-- ── 3. Laboratoriya protokollari ──────────────────────────────────────
create table if not exists public.t2_lab_protokol (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  obyekt_id bigint not null references public.t2_obyekt(id) on delete cascade,
  laboratoriya_id bigint references public.t2_kontragent(id),
  raqam text not null,
  sana date,
  sinov_turi text not null default 'beton'
    check (sinov_turi in ('beton', 'grunt', 'armatura', 'payvand', 'material', 'boshqa')),
  konstruksiya text,
  marka text,
  hajm numeric,              -- NULL ≠ 0: noma'lum hajm bo'sh qoladi
  birlik text,
  natija text not null default 'kutilmoqda'
    check (natija in ('mos', 'mos_emas', 'kutilmoqda')),
  invoys_raqam text,
  invoys_sana date,
  summa numeric,             -- NULL ≠ 0
  fayl_document_id text,     -- kanonik hujjat reestri (R2) identifikatori
  izoh text,
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  versiya integer not null default 1,
  operation_id uuid unique,
  kim text,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create unique index if not exists t2_lab_protokol_raqam_uq
  on public.t2_lab_protokol (obyekt_id, coalesce(laboratoriya_id, 0), raqam)
  where holat <> 'bekor';
create index if not exists t2_lab_protokol_obyekt_idx on public.t2_lab_protokol (obyekt_id);
create index if not exists t2_lab_protokol_kompaniya_idx on public.t2_lab_protokol (kompaniya_id);

-- Protokol ↔ АОСР va/yoki smeta qatori (ko'p-ko'pga).
create table if not exists public.t2_lab_protokol_bog (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  protokol_id bigint not null references public.t2_lab_protokol(id) on delete cascade,
  aosr_id bigint references public.t2_aosr(id) on delete cascade,
  qator_id bigint references public.t2_qator(id) on delete cascade,
  yaratildi timestamptz not null default now(),
  check (aosr_id is not null or qator_id is not null)
);
create unique index if not exists t2_lab_protokol_bog_aosr_uq
  on public.t2_lab_protokol_bog (protokol_id, aosr_id) where aosr_id is not null;
create unique index if not exists t2_lab_protokol_bog_qator_uq
  on public.t2_lab_protokol_bog (protokol_id, qator_id) where qator_id is not null;

alter table public.t2_lab_protokol enable row level security;
alter table public.t2_lab_protokol_bog enable row level security;
revoke all on public.t2_lab_protokol, public.t2_lab_protokol_bog from anon, authenticated;

-- ── 4. Kompaniya logosi ───────────────────────────────────────────────
-- Kichik rasm (≤ 300 KB) base64 — hujjat generatori brauzerda Excel ichiga
-- joylaydi. Alohida jadval: t2_kompaniya o'qishlari og'irlashmaydi.
create table if not exists public.t2_kompaniya_logo (
  kompaniya_id bigint primary key references public.t2_kompaniya(id) on delete cascade,
  mime text not null check (mime in ('image/png', 'image/jpeg')),
  data_b64 text not null check (length(data_b64) <= 409600),
  sha256 text,
  versiya integer not null default 1,
  kim text,
  yangilandi timestamptz not null default now()
);
alter table public.t2_kompaniya_logo enable row level security;
revoke all on public.t2_kompaniya_logo from anon, authenticated;

-- ── 5. O'qish view'lari ───────────────────────────────────────────────
create or replace view public.t2_aosr_reestr_v2 as
select a.id, a.kompaniya_id, a.obyekt_id, o.nom as obyekt, a.tur, a.raqam, a.sana,
       a.ish_nomi, a.ish_tavsifi, a.boshlanish_sana, a.tugash_sana, a.bajarilgan,
       a.blank_varianti, a.loyiha_tashkiloti, a.loyiha_hujjati, a.materiallar,
       a.chetlanishlar, a.keyingi_ishlar, a.komissiya, a.pdf_url, a.izoh, a.holat,
       a.versiya, a.yaratildi, a.yangilandi,
       (select count(*) from public.t2_aosr_bog b where b.aosr_id = a.id) as boglangan_ish_soni,
       (select count(*) from public.t2_lab_protokol_bog pb
          join public.t2_lab_protokol p on p.id = pb.protokol_id and p.holat <> 'bekor'
         where pb.aosr_id = a.id) as protokol_soni
from public.t2_aosr a
join public.t2_obyekt o on o.id = a.obyekt_id;

create or replace view public.t2_lab_protokol_reestr as
select p.id, p.kompaniya_id, p.obyekt_id, o.nom as obyekt, p.laboratoriya_id,
       k.nom as laboratoriya, k.inn as laboratoriya_inn,
       p.raqam, p.sana, p.sinov_turi, p.konstruksiya, p.marka, p.hajm, p.birlik,
       p.natija, p.invoys_raqam, p.invoys_sana, p.summa, p.fayl_document_id,
       p.izoh, p.holat, p.versiya, p.yaratildi, p.yangilandi,
       coalesce((select array_agg(b.aosr_id order by b.aosr_id) from public.t2_lab_protokol_bog b
                  where b.protokol_id = p.id and b.aosr_id is not null), '{}') as aosr_ids,
       coalesce((select array_agg(b.qator_id order by b.qator_id) from public.t2_lab_protokol_bog b
                  where b.protokol_id = p.id and b.qator_id is not null), '{}') as qator_ids
from public.t2_lab_protokol p
join public.t2_obyekt o on o.id = p.obyekt_id
left join public.t2_kontragent k on k.id = p.laboratoriya_id;

revoke all on public.t2_aosr_reestr_v2, public.t2_lab_protokol_reestr from anon, authenticated;

-- ── 6. Yozish RPC'lari (server /api/sb-yoz orqali; kompaniya a'zoligi u yerda) ──

-- АОСР yaratish/tahrirlash (v2): barcha blank maydonlari. p_malumot ichida
-- KALIT BOR bo'lsa — qiymat yoziladi (null ham), kalit yo'q bo'lsa — o'zgarmaydi.
create or replace function public.t2_aosr_yoz_v2(
  p_kompaniya_id bigint, p_obyekt_id bigint, p_malumot jsonb,
  p_id bigint default null, p_kutilgan_versiya integer default null,
  p_operation_id uuid default null, p_kim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_komp bigint; v_bordagi integer; v_id bigint; m jsonb := coalesce(p_malumot, '{}'::jsonb);
  v_komissiya jsonb;
begin
  select kompaniya_id into v_komp from t2_obyekt where id = p_obyekt_id;
  if v_komp is null or v_komp <> p_kompaniya_id then
    return jsonb_build_object('ok', false, 'error', 'Obyekt bu kompaniyaga tegishli emas');
  end if;
  if m ? 'tur' and (m->>'tur') not in ('aosr', 'oraliq_qabul', 'sinov') then
    return jsonb_build_object('ok', false, 'error', 'tur noto''g''ri');
  end if;
  if m ? 'blank_varianti' and (m->>'blank_varianti') not in ('subpudratchili', 'subpudratchisiz') then
    return jsonb_build_object('ok', false, 'error', 'blank_varianti noto''g''ri');
  end if;
  if m ? 'holat' and (m->>'holat') not in ('yangi', 'tasdiqlangan', 'qogoz') then
    return jsonb_build_object('ok', false, 'error', 'holat noto''g''ri (bekor — alohida amal)');
  end if;
  v_komissiya := case when m ? 'komissiya' then m->'komissiya' else null end;
  if v_komissiya is not null and jsonb_typeof(v_komissiya) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'komissiya ro''yxat bo''lishi shart');
  end if;

  if p_id is not null then
    select versiya into v_bordagi from t2_aosr where id = p_id and obyekt_id = p_obyekt_id for update;
    if v_bordagi is null then
      return jsonb_build_object('ok', false, 'error', 'Akt topilmadi');
    end if;
    if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_bordagi then
      return jsonb_build_object('ok', false, 'sabab', 'versiya',
        'bordagi_versiya', v_bordagi, 'siz_yuborgan', p_kutilgan_versiya);
    end if;
    update t2_aosr set
      tur               = case when m ? 'tur' then m->>'tur' else tur end,
      raqam             = case when m ? 'raqam' then nullif(m->>'raqam', '') else raqam end,
      sana              = case when m ? 'sana' then (m->>'sana')::date else sana end,
      ish_nomi          = case when m ? 'ish_nomi' then m->>'ish_nomi' else ish_nomi end,
      ish_tavsifi       = case when m ? 'ish_tavsifi' then m->>'ish_tavsifi' else ish_tavsifi end,
      boshlanish_sana   = case when m ? 'boshlanish_sana' then (m->>'boshlanish_sana')::date else boshlanish_sana end,
      tugash_sana       = case when m ? 'tugash_sana' then (m->>'tugash_sana')::date else tugash_sana end,
      bajarilgan        = case when m ? 'bajarilgan' then m->>'bajarilgan' else bajarilgan end,
      blank_varianti    = case when m ? 'blank_varianti' then m->>'blank_varianti' else blank_varianti end,
      loyiha_tashkiloti = case when m ? 'loyiha_tashkiloti' then m->>'loyiha_tashkiloti' else loyiha_tashkiloti end,
      loyiha_hujjati    = case when m ? 'loyiha_hujjati' then m->>'loyiha_hujjati' else loyiha_hujjati end,
      materiallar       = case when m ? 'materiallar' then m->>'materiallar' else materiallar end,
      chetlanishlar     = case when m ? 'chetlanishlar' then m->>'chetlanishlar' else chetlanishlar end,
      keyingi_ishlar    = case when m ? 'keyingi_ishlar' then m->>'keyingi_ishlar' else keyingi_ishlar end,
      komissiya         = coalesce(v_komissiya, komissiya),
      izoh              = case when m ? 'izoh' then m->>'izoh' else izoh end,
      holat             = case when m ? 'holat' then m->>'holat' else holat end,
      versiya = versiya + 1, yangilandi = now()
    where id = p_id;
    return jsonb_build_object('ok', true, 'id', p_id, 'versiya', v_bordagi + 1, 'takror', false);
  end if;

  if p_operation_id is null then
    return jsonb_build_object('ok', false, 'error', 'operation_id majburiy');
  end if;
  select id into v_id from t2_aosr where operation_id = p_operation_id;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'takror', true);
  end if;

  insert into t2_aosr (kompaniya_id, obyekt_id, tur, raqam, sana, ish_nomi, ish_tavsifi,
    boshlanish_sana, tugash_sana, bajarilgan, blank_varianti, loyiha_tashkiloti, loyiha_hujjati,
    materiallar, chetlanishlar, keyingi_ishlar, komissiya, izoh, holat, operation_id, manba, kim)
  values (v_komp, p_obyekt_id, coalesce(m->>'tur', 'aosr'), nullif(m->>'raqam', ''), (m->>'sana')::date,
    m->>'ish_nomi', m->>'ish_tavsifi', (m->>'boshlanish_sana')::date, (m->>'tugash_sana')::date,
    m->>'bajarilgan', coalesce(m->>'blank_varianti', 'subpudratchisiz'), m->>'loyiha_tashkiloti',
    m->>'loyiha_hujjati', m->>'materiallar', m->>'chetlanishlar', m->>'keyingi_ishlar',
    coalesce(v_komissiya, '[]'::jsonb), m->>'izoh', coalesce(m->>'holat', 'yangi'),
    p_operation_id, 'frontend', p_kim)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'versiya', 1, 'takror', false);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Bu obyektda shu raqamli akt allaqachon bor');
  when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'error', 'Sana noto''g''ri');
end;
$$;

-- Laboratoriya protokoli yaratish/tahrirlash.
create or replace function public.t2_lab_protokol_yoz_v1(
  p_kompaniya_id bigint, p_obyekt_id bigint, p_malumot jsonb,
  p_id bigint default null, p_kutilgan_versiya integer default null,
  p_operation_id uuid default null, p_kim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_komp bigint; v_bordagi integer; v_id bigint; m jsonb := coalesce(p_malumot, '{}'::jsonb);
  v_lab bigint;
begin
  select kompaniya_id into v_komp from t2_obyekt where id = p_obyekt_id;
  if v_komp is null or v_komp <> p_kompaniya_id then
    return jsonb_build_object('ok', false, 'error', 'Obyekt bu kompaniyaga tegishli emas');
  end if;
  if m ? 'laboratoriya_id' and m->>'laboratoriya_id' is not null then
    select id into v_lab from t2_kontragent
     where id = (m->>'laboratoriya_id')::bigint and kompaniya_id = p_kompaniya_id
       and mavqe = 'laboratoriya' and holat = 'faol';
    if v_lab is null then
      return jsonb_build_object('ok', false, 'error', 'Laboratoriya topilmadi (kontragentlar ro''yxatida "laboratoriya" roli bilan bo''lishi shart)');
    end if;
  end if;
  if m ? 'sinov_turi' and (m->>'sinov_turi') not in ('beton', 'grunt', 'armatura', 'payvand', 'material', 'boshqa') then
    return jsonb_build_object('ok', false, 'error', 'sinov_turi noto''g''ri');
  end if;
  if m ? 'natija' and (m->>'natija') not in ('mos', 'mos_emas', 'kutilmoqda') then
    return jsonb_build_object('ok', false, 'error', 'natija noto''g''ri');
  end if;

  if p_id is not null then
    select versiya into v_bordagi from t2_lab_protokol
     where id = p_id and obyekt_id = p_obyekt_id and holat <> 'bekor' for update;
    if v_bordagi is null then
      return jsonb_build_object('ok', false, 'error', 'Protokol topilmadi');
    end if;
    if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_bordagi then
      return jsonb_build_object('ok', false, 'sabab', 'versiya',
        'bordagi_versiya', v_bordagi, 'siz_yuborgan', p_kutilgan_versiya);
    end if;
    if m ? 'raqam' and coalesce(trim(m->>'raqam'), '') = '' then
      return jsonb_build_object('ok', false, 'error', 'Protokol raqami bo''sh bo''lmasin');
    end if;
    update t2_lab_protokol set
      laboratoriya_id  = case when m ? 'laboratoriya_id' then v_lab else laboratoriya_id end,
      raqam            = case when m ? 'raqam' then trim(m->>'raqam') else raqam end,
      sana             = case when m ? 'sana' then (m->>'sana')::date else sana end,
      sinov_turi       = case when m ? 'sinov_turi' then m->>'sinov_turi' else sinov_turi end,
      konstruksiya     = case when m ? 'konstruksiya' then m->>'konstruksiya' else konstruksiya end,
      marka            = case when m ? 'marka' then m->>'marka' else marka end,
      hajm             = case when m ? 'hajm' then (m->>'hajm')::numeric else hajm end,
      birlik           = case when m ? 'birlik' then m->>'birlik' else birlik end,
      natija           = case when m ? 'natija' then m->>'natija' else natija end,
      invoys_raqam     = case when m ? 'invoys_raqam' then m->>'invoys_raqam' else invoys_raqam end,
      invoys_sana      = case when m ? 'invoys_sana' then (m->>'invoys_sana')::date else invoys_sana end,
      summa            = case when m ? 'summa' then (m->>'summa')::numeric else summa end,
      fayl_document_id = case when m ? 'fayl_document_id' then m->>'fayl_document_id' else fayl_document_id end,
      izoh             = case when m ? 'izoh' then m->>'izoh' else izoh end,
      versiya = versiya + 1, yangilandi = now()
    where id = p_id;
    return jsonb_build_object('ok', true, 'id', p_id, 'versiya', v_bordagi + 1, 'takror', false);
  end if;

  if p_operation_id is null then
    return jsonb_build_object('ok', false, 'error', 'operation_id majburiy');
  end if;
  select id into v_id from t2_lab_protokol where operation_id = p_operation_id;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'takror', true);
  end if;
  if coalesce(trim(m->>'raqam'), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Protokol raqami majburiy');
  end if;

  insert into t2_lab_protokol (kompaniya_id, obyekt_id, laboratoriya_id, raqam, sana, sinov_turi,
    konstruksiya, marka, hajm, birlik, natija, invoys_raqam, invoys_sana, summa, fayl_document_id,
    izoh, operation_id, kim)
  values (v_komp, p_obyekt_id, v_lab, trim(m->>'raqam'), (m->>'sana')::date,
    coalesce(m->>'sinov_turi', 'beton'), m->>'konstruksiya', m->>'marka', (m->>'hajm')::numeric,
    m->>'birlik', coalesce(m->>'natija', 'kutilmoqda'), m->>'invoys_raqam', (m->>'invoys_sana')::date,
    (m->>'summa')::numeric, m->>'fayl_document_id', m->>'izoh', p_operation_id, p_kim)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'versiya', 1, 'takror', false);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Bu laboratoriyaning shu raqamli protokoli allaqachon bor');
  when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'error', 'Sana noto''g''ri');
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'Son noto''g''ri (hajm/summa)');
end;
$$;

-- Protokolni bekor qilish (o'chirilmaydi — tarix saqlanadi).
create or replace function public.t2_lab_protokol_bekor_v1(
  p_kompaniya_id bigint, p_id bigint, p_kutilgan_versiya integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_bordagi integer;
begin
  select versiya into v_bordagi from t2_lab_protokol
   where id = p_id and kompaniya_id = p_kompaniya_id and holat <> 'bekor' for update;
  if v_bordagi is null then
    return jsonb_build_object('ok', false, 'error', 'Protokol topilmadi');
  end if;
  if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_bordagi then
    return jsonb_build_object('ok', false, 'sabab', 'versiya', 'bordagi_versiya', v_bordagi);
  end if;
  update t2_lab_protokol set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id, 'versiya', v_bordagi + 1);
end;
$$;

-- Protokolni АОСР'larga va/yoki smeta qatorlariga bog'lash (to'liq almashtirish).
create or replace function public.t2_lab_protokol_bog_saqla_v1(
  p_kompaniya_id bigint, p_protokol_id bigint, p_aosr_ids bigint[], p_qator_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_obyekt bigint; v_yomon int;
begin
  select obyekt_id into v_obyekt from t2_lab_protokol
   where id = p_protokol_id and kompaniya_id = p_kompaniya_id and holat <> 'bekor';
  if v_obyekt is null then
    return jsonb_build_object('ok', false, 'error', 'Protokol topilmadi');
  end if;
  select count(*) into v_yomon from unnest(coalesce(p_aosr_ids, '{}')) x
   where not exists (select 1 from t2_aosr a where a.id = x and a.obyekt_id = v_obyekt);
  if v_yomon > 0 then
    return jsonb_build_object('ok', false, 'error', 'Akt(lar) shu obyektga tegishli emas');
  end if;
  select count(*) into v_yomon from unnest(coalesce(p_qator_ids, '{}')) x
   where not exists (select 1 from t2_qator q where q.id = x and q.obyekt_id = v_obyekt);
  if v_yomon > 0 then
    return jsonb_build_object('ok', false, 'error', 'Smeta qator(lar)i shu obyektga tegishli emas');
  end if;
  delete from t2_lab_protokol_bog where protokol_id = p_protokol_id;
  insert into t2_lab_protokol_bog (kompaniya_id, protokol_id, aosr_id)
    select p_kompaniya_id, p_protokol_id, x from (select distinct unnest(coalesce(p_aosr_ids, '{}')) x) s;
  insert into t2_lab_protokol_bog (kompaniya_id, protokol_id, qator_id)
    select p_kompaniya_id, p_protokol_id, x from (select distinct unnest(coalesce(p_qator_ids, '{}')) x) s;
  return jsonb_build_object('ok', true, 'aosr', coalesce(array_length(p_aosr_ids, 1), 0),
    'qator', coalesce(array_length(p_qator_ids, 1), 0));
end;
$$;

-- Kompaniya logosi (yuklash / almashtirish / olib tashlash — p_data_b64 null).
create or replace function public.t2_kompaniya_logo_saqla_v1(
  p_kompaniya_id bigint, p_mime text, p_data_b64 text, p_sha256 text default null, p_kim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from t2_kompaniya where id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'error', 'Kompaniya topilmadi');
  end if;
  if p_data_b64 is null then
    delete from t2_kompaniya_logo where kompaniya_id = p_kompaniya_id;
    return jsonb_build_object('ok', true, 'olib_tashlandi', true);
  end if;
  if p_mime not in ('image/png', 'image/jpeg') then
    return jsonb_build_object('ok', false, 'error', 'Faqat PNG yoki JPEG');
  end if;
  if length(p_data_b64) > 409600 then
    return jsonb_build_object('ok', false, 'error', 'Logo juda katta (≤ 300 KB)');
  end if;
  insert into t2_kompaniya_logo (kompaniya_id, mime, data_b64, sha256, kim)
  values (p_kompaniya_id, p_mime, p_data_b64, p_sha256, p_kim)
  on conflict (kompaniya_id) do update set mime = excluded.mime, data_b64 = excluded.data_b64,
    sha256 = excluded.sha256, kim = excluded.kim, versiya = t2_kompaniya_logo.versiya + 1, yangilandi = now();
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.t2_aosr_yoz_v2(bigint, bigint, jsonb, bigint, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.t2_lab_protokol_yoz_v1(bigint, bigint, jsonb, bigint, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.t2_lab_protokol_bekor_v1(bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.t2_lab_protokol_bog_saqla_v1(bigint, bigint, bigint[], bigint[]) from public, anon, authenticated;
revoke all on function public.t2_kompaniya_logo_saqla_v1(bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.t2_aosr_yoz_v2(bigint, bigint, jsonb, bigint, integer, uuid, text) to service_role;
grant execute on function public.t2_lab_protokol_yoz_v1(bigint, bigint, jsonb, bigint, integer, uuid, text) to service_role;
grant execute on function public.t2_lab_protokol_bekor_v1(bigint, bigint, integer) to service_role;
grant execute on function public.t2_lab_protokol_bog_saqla_v1(bigint, bigint, bigint[], bigint[]) to service_role;
grant execute on function public.t2_kompaniya_logo_saqla_v1(bigint, text, text, text, text) to service_role;

commit;
