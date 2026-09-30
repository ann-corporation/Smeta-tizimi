-- T2-NARX-DALIL-001 — narx manbalari va narx dalili (egasi Q4, Q5 — 2026-10-01).
-- Egasi: "НАПУ kabi tashkilotlarda smeta himoyasida PTO ga har bir narx qayerdan olingani
-- juda kerak — har narxni kataloglar, fakturalar, tijorat takliflari bilan tasdiqlab,
-- hujjat shaklida bera oladigan bo'lsin". "Narx takliflari har smeta yuklanganda individual
-- beriladi, qo'llash — foydalanuvchining o'zi".
--
-- Model:
--   t2_narx_manba        — dalil hujjati (katalog kvartali, faktura, КП, mash-chas kalkulyatsiyasi,
--                          chel-chas e'loni …): rekvizitlar, davr, yetkazuvchi, fayl (kanonik R2).
--   t2_narx_manba_qator  — manbadagi pozitsiyalar (kod, nom, birlik, narx) + moslash kalitlari.
--   t2_narx_dalil        — smeta qatori ↔ manba pozitsiyasi (operator tasdiqlagan bog'lanish):
--                          bog'lash paytidagi smeta narxi va manba narxi saqlanadi (audit).
--   t2_narx_taklif (view) — smeta resurslari uchun ANIQ nomzodlar (kod yoki nom+birlik kaliti).
--                          Qaysi nomzod taklif qilinishi (МАШ — eng qimmat, ЧЕЛ/МАТ — eng yangi
--                          davr) frontend `lib/narx-dalil` qoidalarida; avtomatik yozilmaydi.
-- Faqat ADDITIV.

begin;

create table if not exists public.t2_narx_manba (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  tur text not null check (tur in ('katalog', 'faktura', 'kp', 'kalkulyatsiya_mash', 'chel_chas', 'boshqa')),
  nom text not null,
  raqam text,
  sana date,
  yetkazuvchi text,
  yetkazuvchi_inn text,
  region text,
  yil smallint check (yil is null or yil between 2000 and 2100),
  kvartal smallint check (kvartal is null or kvartal between 1 and 4),
  nds_holati text not null default 'nomalum' check (nds_holati in ('nds_siz', 'nds_bilan', 'nomalum')),
  fayl_document_id text,
  izoh text,
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  versiya integer not null default 1,
  operation_id uuid unique,
  kim text,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create index if not exists t2_narx_manba_komp_idx on public.t2_narx_manba (kompaniya_id, tur);

create table if not exists public.t2_narx_manba_qator (
  id bigint generated always as identity primary key,
  manba_id bigint not null references public.t2_narx_manba(id) on delete cascade,
  kompaniya_id bigint not null,
  tartib integer not null default 0,
  kod text,
  nom text not null,
  birlik text,
  narx numeric,          -- NULL ≠ 0: narxsiz pozitsiya taklif qilinmaydi
  kod_key text,
  nom_key text,
  birlik_key text,
  izoh text
);
create index if not exists t2_narx_manba_qator_manba_idx on public.t2_narx_manba_qator (manba_id);
create index if not exists t2_narx_manba_qator_kod_idx on public.t2_narx_manba_qator (kompaniya_id, kod_key) where kod_key is not null and kod_key <> '';
create index if not exists t2_narx_manba_qator_nom_idx on public.t2_narx_manba_qator (kompaniya_id, nom_key, birlik_key);

create table if not exists public.t2_narx_dalil (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  obyekt_id bigint not null references public.t2_obyekt(id) on delete cascade,
  qator_id bigint not null references public.t2_qator(id) on delete cascade,
  manba_qator_id bigint not null references public.t2_narx_manba_qator(id) on delete cascade,
  manba_id bigint not null references public.t2_narx_manba(id) on delete cascade,
  smeta_narx numeric,
  manba_narx numeric,
  izoh text,
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  kim text,
  vaqt timestamptz not null default now()
);
create unique index if not exists t2_narx_dalil_faol_uq on public.t2_narx_dalil (qator_id) where holat = 'faol';
create index if not exists t2_narx_dalil_obyekt_idx on public.t2_narx_dalil (obyekt_id) where holat = 'faol';

alter table public.t2_narx_manba enable row level security;
alter table public.t2_narx_manba_qator enable row level security;
alter table public.t2_narx_dalil enable row level security;
revoke all on public.t2_narx_manba, public.t2_narx_manba_qator, public.t2_narx_dalil from anon, authenticated;

-- ── O'qish view'lari ──
create or replace view public.t2_narx_manba_royxat as
select m.id, m.kompaniya_id, m.tur, m.nom, m.raqam, m.sana, m.yetkazuvchi, m.yetkazuvchi_inn, m.region,
       m.yil, m.kvartal, m.nds_holati, m.fayl_document_id, m.izoh, m.holat, m.versiya, m.kim, m.yaratildi, m.yangilandi,
       (select count(*) from public.t2_narx_manba_qator q where q.manba_id = m.id) as qator_soni,
       (select count(*) from public.t2_narx_dalil d where d.manba_id = m.id and d.holat = 'faol') as dalil_soni
from public.t2_narx_manba m;

-- Smeta resurslari (rs/mat/ob) uchun ANIQ nomzodlar: kod kaliti yoki nom+birlik kaliti.
create or replace view public.t2_narx_taklif as
select q.kompaniya_id, q.obyekt_id, q.id as qator_id, q.tur, q.kat, q.kod, q.nom, q.birlik, q.narx as smeta_narx,
       mq.id as manba_qator_id, mq.manba_id, m.tur as manba_tur, m.nom as manba_nom, m.raqam as manba_raqam,
       m.sana as manba_sana, m.yil, m.kvartal, m.region, m.yetkazuvchi, m.nds_holati,
       mq.kod as manba_kod, mq.nom as manba_nom_qator, mq.birlik as manba_birlik, mq.narx as manba_narx,
       case when mq.kod_key is not null and mq.kod_key <> '' and mq.kod_key = public.t2_resurs_nom_kalit(q.kod) then 'kod' else 'nom_birlik' end as moslik
from public.t2_qator q
join public.t2_narx_manba_qator mq on mq.kompaniya_id = q.kompaniya_id
  and mq.narx is not null
  and ((mq.kod_key is not null and mq.kod_key <> '' and mq.kod_key = public.t2_resurs_nom_kalit(q.kod))
       or (mq.nom_key = q.nom_key and mq.birlik_key is not distinct from q.birlik_key))
join public.t2_narx_manba m on m.id = mq.manba_id and m.holat = 'faol'
where q.tur in ('rs', 'mat', 'ob');

create or replace view public.t2_narx_dalil_holat as
select d.id, d.kompaniya_id, d.obyekt_id, d.qator_id, q.tur, q.kat, q.kod, q.nom, q.birlik, q.hajm, q.narx as hozirgi_narx,
       d.smeta_narx, d.manba_narx, d.izoh, d.kim, d.vaqt,
       m.id as manba_id, m.tur as manba_tur, m.nom as manba_nom, m.raqam as manba_raqam, m.sana as manba_sana,
       m.yil, m.kvartal, m.region, m.yetkazuvchi, m.yetkazuvchi_inn, m.nds_holati, m.fayl_document_id,
       mq.kod as manba_kod, mq.nom as manba_nom_qator, mq.birlik as manba_birlik
from public.t2_narx_dalil d
join public.t2_qator q on q.id = d.qator_id
join public.t2_narx_manba m on m.id = d.manba_id
join public.t2_narx_manba_qator mq on mq.id = d.manba_qator_id
where d.holat = 'faol';

revoke all on public.t2_narx_manba_royxat, public.t2_narx_taklif, public.t2_narx_dalil_holat from anon, authenticated;

-- ── Yozish RPC'lari ──
-- Manba yaratish/tahrirlash; qatorlar: p_rejim 'almashtir' (hammasi yangidan) yoki 'qosh'
-- (katta kataloglarni bo'laklab yuklash uchun).
create or replace function public.t2_narx_manba_yoz_v1(
  p_kompaniya_id bigint, p_malumot jsonb, p_qatorlar jsonb default null, p_rejim text default 'almashtir',
  p_id bigint default null, p_kutilgan_versiya integer default null, p_operation_id uuid default null, p_kim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare m jsonb := coalesce(p_malumot, '{}'::jsonb); v_id bigint; v_bordagi integer; v_soni int := 0; v_tartib int;
begin
  if p_rejim not in ('almashtir', 'qosh') then
    return jsonb_build_object('ok', false, 'error', 'rejim noto''g''ri');
  end if;
  if p_qatorlar is not null and (jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) > 20000) then
    return jsonb_build_object('ok', false, 'error', 'Qatorlar ro''yxati noto''g''ri yoki juda katta (bir bo''lakda ≤ 20 000)');
  end if;
  if m ? 'tur' and (m->>'tur') not in ('katalog', 'faktura', 'kp', 'kalkulyatsiya_mash', 'chel_chas', 'boshqa') then
    return jsonb_build_object('ok', false, 'error', 'Manba turi noto''g''ri');
  end if;

  if p_id is not null then
    select versiya into v_bordagi from t2_narx_manba where id = p_id and kompaniya_id = p_kompaniya_id and holat = 'faol' for update;
    if v_bordagi is null then return jsonb_build_object('ok', false, 'error', 'Manba topilmadi'); end if;
    if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_bordagi then
      return jsonb_build_object('ok', false, 'sabab', 'versiya', 'bordagi_versiya', v_bordagi);
    end if;
    -- Tekshiruv YANGILASHDAN OLDIN (aks holda rad etilganda ham versiya oshib qolardi).
    if p_qatorlar is not null and p_rejim = 'almashtir' and exists (
         select 1 from t2_narx_dalil d join t2_narx_manba_qator q on q.id = d.manba_qator_id
          where q.manba_id = p_id and d.holat = 'faol') then
      return jsonb_build_object('ok', false, 'error', 'Bu manba pozitsiyalari smeta dalili sifatida bog''langan — almashtirib bo''lmaydi (yangi manba yarating yoki "qo''shish" rejimi)');
    end if;
    update t2_narx_manba set
      tur = case when m ? 'tur' then m->>'tur' else tur end,
      nom = case when m ? 'nom' and coalesce(trim(m->>'nom'), '') <> '' then trim(m->>'nom') else nom end,
      raqam = case when m ? 'raqam' then m->>'raqam' else raqam end,
      sana = case when m ? 'sana' then (m->>'sana')::date else sana end,
      yetkazuvchi = case when m ? 'yetkazuvchi' then m->>'yetkazuvchi' else yetkazuvchi end,
      yetkazuvchi_inn = case when m ? 'yetkazuvchi_inn' then m->>'yetkazuvchi_inn' else yetkazuvchi_inn end,
      region = case when m ? 'region' then m->>'region' else region end,
      yil = case when m ? 'yil' then (m->>'yil')::smallint else yil end,
      kvartal = case when m ? 'kvartal' then (m->>'kvartal')::smallint else kvartal end,
      nds_holati = case when m ? 'nds_holati' then m->>'nds_holati' else nds_holati end,
      fayl_document_id = case when m ? 'fayl_document_id' then m->>'fayl_document_id' else fayl_document_id end,
      izoh = case when m ? 'izoh' then m->>'izoh' else izoh end,
      versiya = versiya + 1, kim = p_kim, yangilandi = now()
    where id = p_id;
    v_id := p_id;
  else
    if p_operation_id is null then return jsonb_build_object('ok', false, 'error', 'operation_id majburiy'); end if;
    select id into v_id from t2_narx_manba where operation_id = p_operation_id;
    if v_id is not null then return jsonb_build_object('ok', true, 'id', v_id, 'takror', true); end if;
    if coalesce(trim(m->>'nom'), '') = '' or coalesce(m->>'tur', '') = '' then
      return jsonb_build_object('ok', false, 'error', 'Manba nomi va turi majburiy');
    end if;
    insert into t2_narx_manba (kompaniya_id, tur, nom, raqam, sana, yetkazuvchi, yetkazuvchi_inn, region, yil, kvartal,
      nds_holati, fayl_document_id, izoh, operation_id, kim)
    values (p_kompaniya_id, m->>'tur', trim(m->>'nom'), m->>'raqam', (m->>'sana')::date, m->>'yetkazuvchi', m->>'yetkazuvchi_inn',
      m->>'region', (m->>'yil')::smallint, (m->>'kvartal')::smallint, coalesce(m->>'nds_holati', 'nomalum'),
      m->>'fayl_document_id', m->>'izoh', p_operation_id, p_kim)
    returning id into v_id;
  end if;

  if p_qatorlar is not null then
    if p_rejim = 'almashtir' then
      delete from t2_narx_manba_qator where manba_id = v_id;
    end if;
    select coalesce(max(tartib), 0) into v_tartib from t2_narx_manba_qator where manba_id = v_id;
    insert into t2_narx_manba_qator (manba_id, kompaniya_id, tartib, kod, nom, birlik, narx, kod_key, nom_key, birlik_key, izoh)
    select v_id, p_kompaniya_id, v_tartib + x.n, nullif(trim(x.e->>'kod'), ''), trim(x.e->>'nom'), nullif(trim(x.e->>'birlik'), ''),
           case when (x.e->>'narx') ~ '^-?[0-9]+(\.[0-9]+)?$' then (x.e->>'narx')::numeric else null end,
           nullif(public.t2_resurs_nom_kalit(x.e->>'kod'), ''), public.t2_resurs_nom_kalit(x.e->>'nom'),
           public.t2_resurs_birlik_kalit(x.e->>'birlik'), x.e->>'izoh'
    from jsonb_array_elements(p_qatorlar) with ordinality as x(e, n)
    where coalesce(trim(x.e->>'nom'), '') <> '';
    get diagnostics v_soni = row_count;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'qator_qoshildi', v_soni);
exception
  when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'error', 'Sana noto''g''ri');
  when invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('ok', false, 'error', 'Son noto''g''ri (yil/kvartal/narx)');
end;
$$;

create or replace function public.t2_narx_manba_bekor_v1(p_kompaniya_id bigint, p_id bigint, p_kutilgan_versiya integer, p_kim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_bordagi integer;
begin
  select versiya into v_bordagi from t2_narx_manba where id = p_id and kompaniya_id = p_kompaniya_id and holat = 'faol' for update;
  if v_bordagi is null then return jsonb_build_object('ok', false, 'error', 'Manba topilmadi'); end if;
  if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_bordagi then
    return jsonb_build_object('ok', false, 'sabab', 'versiya', 'bordagi_versiya', v_bordagi);
  end if;
  if exists (select 1 from t2_narx_dalil where manba_id = p_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'error', 'Manba smeta narxlarining dalili sifatida ishlatilmoqda — avval dalillarni olib tashlang');
  end if;
  update t2_narx_manba set holat = 'bekor', versiya = versiya + 1, kim = p_kim, yangilandi = now() where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

-- Dalil bog'lash (ommaviy): [{qator_id, manba_qator_id, izoh}] — mavjud faol dalil almashtiriladi
-- (eskisi 'bekor' — tarix). Smeta narxi o'zgartirilmaydi: faqat dalil yoziladi.
create or replace function public.t2_narx_dalil_bogla_v1(p_kompaniya_id bigint, p_obyekt_id bigint, p_boglar jsonb, p_kim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_soni int := 0; v_yomon int;
begin
  if not exists (select 1 from t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'error', 'Obyekt bu kompaniyaga tegishli emas');
  end if;
  if p_boglar is null or jsonb_typeof(p_boglar) <> 'array' or jsonb_array_length(p_boglar) = 0 or jsonb_array_length(p_boglar) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'Bog''lanishlar 1..5000 bo''lishi shart');
  end if;
  select count(*) into v_yomon
  from jsonb_array_elements(p_boglar) e
  left join t2_qator q on q.id = (e->>'qator_id')::bigint and q.obyekt_id = p_obyekt_id
  left join t2_narx_manba_qator mq on mq.id = (e->>'manba_qator_id')::bigint and mq.kompaniya_id = p_kompaniya_id
  left join t2_narx_manba m on m.id = mq.manba_id and m.holat = 'faol'
  where q.id is null or mq.id is null or m.id is null;
  if v_yomon > 0 then
    return jsonb_build_object('ok', false, 'error', v_yomon || ' ta bog''lanish noto''g''ri (qator obyektda yoki manba pozitsiyasi topilmadi)');
  end if;
  update t2_narx_dalil d set holat = 'bekor'
   where d.holat = 'faol' and d.qator_id in (select (e->>'qator_id')::bigint from jsonb_array_elements(p_boglar) e);
  insert into t2_narx_dalil (kompaniya_id, obyekt_id, qator_id, manba_qator_id, manba_id, smeta_narx, manba_narx, izoh, kim)
  select p_kompaniya_id, p_obyekt_id, q.id, mq.id, mq.manba_id, q.narx, mq.narx, s.e->>'izoh', p_kim
  from (select distinct on ((x->>'qator_id')::bigint) x as e from jsonb_array_elements(p_boglar) x order by (x->>'qator_id')::bigint) s
  join t2_qator q on q.id = (s.e->>'qator_id')::bigint
  join t2_narx_manba_qator mq on mq.id = (s.e->>'manba_qator_id')::bigint;
  get diagnostics v_soni = row_count;
  return jsonb_build_object('ok', true, 'boglandi', v_soni);
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'error', 'qator_id / manba_qator_id son bo''lishi shart');
end;
$$;

create or replace function public.t2_narx_dalil_ochir_v1(p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_ids bigint[], p_kim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_soni int;
begin
  update t2_narx_dalil set holat = 'bekor', kim = p_kim
   where kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id and holat = 'faol' and qator_id = any(coalesce(p_qator_ids, '{}'));
  get diagnostics v_soni = row_count;
  return jsonb_build_object('ok', true, 'olib_tashlandi', v_soni);
end;
$$;

revoke all on function public.t2_narx_manba_yoz_v1(bigint, jsonb, jsonb, text, bigint, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.t2_narx_manba_bekor_v1(bigint, bigint, integer, text) from public, anon, authenticated;
revoke all on function public.t2_narx_dalil_bogla_v1(bigint, bigint, jsonb, text) from public, anon, authenticated;
revoke all on function public.t2_narx_dalil_ochir_v1(bigint, bigint, bigint[], text) from public, anon, authenticated;
grant execute on function public.t2_narx_manba_yoz_v1(bigint, jsonb, jsonb, text, bigint, integer, uuid, text) to service_role;
grant execute on function public.t2_narx_manba_bekor_v1(bigint, bigint, integer, text) to service_role;
grant execute on function public.t2_narx_dalil_bogla_v1(bigint, bigint, jsonb, text) to service_role;
grant execute on function public.t2_narx_dalil_ochir_v1(bigint, bigint, bigint[], text) to service_role;

commit;
