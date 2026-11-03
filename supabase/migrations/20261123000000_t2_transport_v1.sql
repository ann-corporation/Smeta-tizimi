-- T2_TRANSPORT v1 (egasi: «logistika: xarita, navigatsiya, pul hisobi, narxlash, foyda»): transport bo'limi.
-- Park (mashina/texnika, haydovchi, hujjat muddati), reys (putevoy list: bekatlar, yuk), tannarx modeli, ichki taqsimot (obyektga),
-- tashqi narxlash (tarif), yoqilg'i narxi tarixi, rentabellik KPI. Ombor (C11) jadvallariga TEGILMAYDI; faqat t2_obyekt (lat/lng),
-- t2_kadr_mustaqil / t2_texnika_mustaqil / t2_kontragent ga ixtiyoriy havola. Xarajat obyektga FAQAT mavjud t2_xarajat_kirit_v1 orqali o'tadi.
-- Pul: ichki tannarx QQS SIZ; tashqi narxda QQS 12% alohida (asosiy ko'rsatkich QQS bilan). Noma'lum = NULL (kiritilmagan), 0 emas.
-- Saqlash qoidasi (egasi 2026-11-03): GPS trek / marshrut geometriyasi / foto / PDF Supabase'ga YOZILMAYDI — faqat metadata va hisob qatorlari
-- (reja_km, reja_daqiqa, marshrut_manba, bekat koordinatalari, tasdiq_ref = R2 fayl kaliti uchun joy). Marshrut chizig'i mijozda hisoblanadi.
-- Migratsiyani FAQAT L0 qo'llaydi. Rollback: .rollback.sql. Qabul: .acceptance.sql.
begin;

-- 0. Idempotentlik jurnali (hamma yozuvchi RPC uchun bitta)
create table if not exists public.t2_tr_operation (
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  operation_id uuid not null,
  amal text not null,
  natija jsonb not null,
  yaratildi timestamptz not null default now(),
  primary key (kompaniya_id, operation_id)
);

-- 1. Park
create table if not exists public.t2_tr_mashina (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  nomi text not null check (length(btrim(nomi)) between 1 and 200),
  davlat_raqami text,
  turi text not null default 'yuk' check (turi in ('yuk','samosval','beton_mikser','kran','ekskavator','yuklagich','buldozer','avtobus','yengil','boshqa')),
  yuk_t numeric(10,3) check (yuk_t is null or yuk_t >= 0),
  yuk_m3 numeric(10,3) check (yuk_m3 is null or yuk_m3 >= 0),
  yoqilgi_turi text not null default 'dizel' check (yoqilgi_turi in ('dizel','benzin','metan','propan','elektr')),
  norma_100km numeric(8,3) check (norma_100km is null or norma_100km >= 0),      -- L/100 km
  norma_motosoat numeric(8,3) check (norma_motosoat is null or norma_motosoat >= 0), -- L/moto-soat
  odometr_km numeric(12,1) check (odometr_km is null or odometr_km >= 0),
  motosoat numeric(12,1) check (motosoat is null or motosoat >= 0),
  egalik text not null default 'oz' check (egalik in ('oz','ijara')),
  ijara_km numeric(14,2) check (ijara_km is null or ijara_km >= 0),
  ijara_soat numeric(14,2) check (ijara_soat is null or ijara_soat >= 0),
  ijara_kun numeric(14,2) check (ijara_kun is null or ijara_kun >= 0),
  amort_km numeric(14,2) check (amort_km is null or amort_km >= 0),
  amort_soat numeric(14,2) check (amort_soat is null or amort_soat >= 0),
  kutish_soat_narx numeric(14,2) check (kutish_soat_narx is null or kutish_soat_narx >= 0),
  texnika_id bigint references public.t2_texnika_mustaqil(id) on delete set null,
  haydovchi_id bigint,
  holat text not null default 'faol' check (holat in ('faol','remontda','nofaol')),
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create unique index if not exists t2_tr_mashina_raqam_uq on public.t2_tr_mashina (kompaniya_id, upper(davlat_raqami)) where davlat_raqami is not null;
create index if not exists t2_tr_mashina_k_idx on public.t2_tr_mashina (kompaniya_id);

create table if not exists public.t2_tr_haydovchi (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  ism text not null check (length(btrim(ism)) between 1 and 200),
  telefon text,
  kadr_id bigint references public.t2_kadr_mustaqil(id) on delete set null,
  foydalanuvchi_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  tolov_turi text not null default 'reys' check (tolov_turi in ('reys','km','soat','oylik')),
  tolov_stavka numeric(14,2) check (tolov_stavka is null or tolov_stavka >= 0),
  ijtimoiy_foiz numeric(6,2) not null default 12 check (ijtimoiy_foiz between 0 and 100),
  holat text not null default 'faol' check (holat in ('faol','nofaol')),
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create index if not exists t2_tr_haydovchi_k_idx on public.t2_tr_haydovchi (kompaniya_id);
create index if not exists t2_tr_haydovchi_u_idx on public.t2_tr_haydovchi (foydalanuvchi_id) where foydalanuvchi_id is not null;
alter table public.t2_tr_mashina drop constraint if exists t2_tr_mashina_haydovchi_fk;
alter table public.t2_tr_mashina add constraint t2_tr_mashina_haydovchi_fk foreign key (haydovchi_id) references public.t2_tr_haydovchi(id) on delete set null;

create table if not exists public.t2_tr_hujjat (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  egasi_turi text not null check (egasi_turi in ('mashina','haydovchi')),
  egasi_id bigint not null,
  turi text not null check (turi in ('sugurta','texkoruv','guvohnoma','ruxsatnoma','boshqa')),
  raqam text,
  boshlanish date,
  muddat date not null,
  izoh text,
  holat text not null default 'faol' check (holat in ('faol','bekor')),
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create index if not exists t2_tr_hujjat_k_idx on public.t2_tr_hujjat (kompaniya_id, muddat);

-- 2. Yoqilg'i narxi tarixi va tariflar
create table if not exists public.t2_tr_yoqilgi_narx (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  yoqilgi_turi text not null check (yoqilgi_turi in ('dizel','benzin','metan','propan','elektr')),
  sana date not null,
  narx numeric(14,2) not null check (narx > 0), -- so'm / birlik, QQS SIZ (ichki tannarx)
  izoh text,
  yaratildi timestamptz not null default now(),
  unique (kompaniya_id, yoqilgi_turi, sana)
);

create table if not exists public.t2_tr_tarif (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  nom text not null check (length(btrim(nom)) between 1 and 200),
  zona text,
  mashina_turi text,
  km_narx numeric(14,2) check (km_narx is null or km_narx >= 0),
  tonna_km_narx numeric(14,4) check (tonna_km_narx is null or tonna_km_narx >= 0),
  soat_narx numeric(14,2) check (soat_narx is null or soat_narx >= 0),
  reys_narx numeric(14,2) check (reys_narx is null or reys_narx >= 0),
  minimal_summa numeric(14,2) check (minimal_summa is null or minimal_summa >= 0),
  marja_foiz numeric(6,2) check (marja_foiz is null or (marja_foiz >= 0 and marja_foiz < 100)),
  qqs_foiz numeric(5,2) not null default 12 check (qqs_foiz between 0 and 50),
  qqs_kiritilgan boolean not null default false, -- true: narxlar QQS bilan kiritilgan
  holat text not null default 'faol' check (holat in ('faol','nofaol')),
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create index if not exists t2_tr_tarif_k_idx on public.t2_tr_tarif (kompaniya_id);

-- 3. Reys (putevoy list)
create table if not exists public.t2_tr_reys (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  raqam text,
  holat text not null default 'reja' check (holat in ('reja','yolda','yetkazildi','yopildi','bekor')),
  sana date not null default current_date,
  mashina_id bigint not null references public.t2_tr_mashina(id),
  haydovchi_id bigint references public.t2_tr_haydovchi(id),
  buyurtmachi_turi text not null default 'ichki' check (buyurtmachi_turi in ('ichki','tashqi')),
  kontragent_id bigint references public.t2_kontragent(id) on delete set null,
  mijoz_nom text,
  talab_turi text not null default 'qolda' check (talab_turi in ('qolda','ombor','xarid','obyekt')),
  talab_ref text,
  tarif_id bigint references public.t2_tr_tarif(id) on delete set null,
  reja_km numeric(10,2) check (reja_km is null or reja_km >= 0),
  reja_daqiqa integer check (reja_daqiqa is null or reja_daqiqa >= 0),
  marshrut_manba text check (marshrut_manba is null or marshrut_manba in ('yol','taxminiy','qolda')),
  km_boshi numeric(12,1) check (km_boshi is null or km_boshi >= 0),
  km_oxiri numeric(12,1) check (km_oxiri is null or km_oxiri >= 0),
  moto_boshi numeric(12,1) check (moto_boshi is null or moto_boshi >= 0),
  moto_oxiri numeric(12,1) check (moto_oxiri is null or moto_oxiri >= 0),
  fakt_km numeric(10,2) check (fakt_km is null or fakt_km >= 0),
  bosh_km numeric(10,2) check (bosh_km is null or bosh_km >= 0),
  ish_soat numeric(8,2) check (ish_soat is null or ish_soat >= 0),
  boshlandi timestamptz,
  tugadi timestamptz,
  kutish_daqiqa integer check (kutish_daqiqa is null or kutish_daqiqa >= 0),
  yoqilgi_sarfi_l numeric(10,2) check (yoqilgi_sarfi_l is null or yoqilgi_sarfi_l >= 0),
  yoqilgi_quyildi_l numeric(10,2) check (yoqilgi_quyildi_l is null or yoqilgi_quyildi_l >= 0),
  yoqilgi_narx_fakt numeric(14,2) check (yoqilgi_narx_fakt is null or yoqilgi_narx_fakt > 0),
  norma_koef numeric(5,3) not null default 1 check (norma_koef between 0.5 and 3),
  yol_haqi numeric(14,2) check (yol_haqi is null or yol_haqi >= 0),
  boshqa_xarajat numeric(14,2) check (boshqa_xarajat is null or boshqa_xarajat >= 0),
  boshqa_izoh text,
  narx_qqs_siz numeric(16,2) check (narx_qqs_siz is null or narx_qqs_siz >= 0), -- tashqi: mijozga narx; ichki: ichki o'tkazma qiymati
  qqs_foiz numeric(5,2) not null default 12 check (qqs_foiz between 0 and 50),
  tannarx jsonb,
  bekor_sabab text,
  izoh text,
  versiya integer not null default 1,
  actor_id bigint,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  check (km_boshi is null or km_oxiri is null or km_oxiri >= km_boshi),
  check (moto_boshi is null or moto_oxiri is null or moto_oxiri >= moto_boshi)
);
create index if not exists t2_tr_reys_k_idx on public.t2_tr_reys (kompaniya_id, sana desc);
create index if not exists t2_tr_reys_m_idx on public.t2_tr_reys (mashina_id);
create index if not exists t2_tr_reys_h_idx on public.t2_tr_reys (haydovchi_id);

create table if not exists public.t2_tr_bekat (
  id bigserial primary key,
  reys_id bigint not null references public.t2_tr_reys(id) on delete cascade,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  tartib integer not null check (tartib >= 1),
  turi text not null default 'tushirish' check (turi in ('yuklash','tushirish','oraliq')),
  nom text not null check (length(btrim(nom)) between 1 and 200),
  obyekt_id bigint references public.t2_obyekt(id) on delete set null,
  sklad_id bigint,
  kontragent_id bigint references public.t2_kontragent(id) on delete set null,
  lat numeric(9,6) check (lat is null or lat between -90 and 90),
  lng numeric(9,6) check (lng is null or lng between -180 and 180),
  manzil text,
  reja_vaqt timestamptz,
  kelish_vaqt timestamptz,
  ketish_vaqt timestamptz,
  holat text not null default 'kutilmoqda' check (holat in ('kutilmoqda','yetib_keldi','bajarildi','otkazildi')),
  qabul_qiluvchi text,
  tasdiq_turi text check (tasdiq_turi is null or tasdiq_turi in ('foto','imzo')),
  tasdiq_ref text, -- fayl/imzo havolasi uchun joy (hozircha placeholder)
  izoh text,
  unique (reys_id, tartib)
);

create table if not exists public.t2_tr_yuk (
  id bigserial primary key,
  reys_id bigint not null references public.t2_tr_reys(id) on delete cascade,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  yuklash_tartib integer,
  tushirish_tartib integer,
  nom text not null check (length(btrim(nom)) between 1 and 300),
  birlik text,
  miqdor numeric(16,3) check (miqdor is null or miqdor >= 0),
  ogirlik_t numeric(12,3) check (ogirlik_t is null or ogirlik_t >= 0),
  hajm_m3 numeric(12,3) check (hajm_m3 is null or hajm_m3 >= 0),
  obyekt_id bigint references public.t2_obyekt(id) on delete set null
);
create index if not exists t2_tr_yuk_reys_idx on public.t2_tr_yuk (reys_id);

create table if not exists public.t2_tr_taqsim (
  id bigserial primary key,
  reys_id bigint not null references public.t2_tr_reys(id) on delete cascade,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  obyekt_id bigint not null references public.t2_obyekt(id),
  ulush numeric(10,6) not null check (ulush > 0 and ulush <= 1),
  summa_qqs_siz numeric(16,2) not null,
  asos text not null check (asos in ('ogirlik','teng')),
  xarajat_id bigint,
  holat text not null default 'hisoblangan' check (holat in ('hisoblangan','otkazilgan')),
  yaratildi timestamptz not null default now(),
  unique (reys_id, obyekt_id)
);

do $rls$ declare t text; begin
  foreach t in array array['t2_tr_operation','t2_tr_mashina','t2_tr_haydovchi','t2_tr_hujjat','t2_tr_yoqilgi_narx','t2_tr_tarif','t2_tr_reys','t2_tr_bekat','t2_tr_yuk','t2_tr_taqsim'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $rls$;
revoke all on all sequences in schema public from anon, authenticated;

-- 4. Yordamchilar
create or replace function public._t2_tr_son(j jsonb, k text) returns numeric
language plpgsql immutable set search_path = public, pg_temp as $$
declare v text := nullif(btrim(j ->> k), '');
begin
  if v is null then return null; end if;
  if v !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception 'TR_RAQAM_NOTOGRI:%', k using errcode = '22023'; end if;
  return v::numeric;
end $$;

create or replace function public._t2_tr_matn(j jsonb, k text, p_max int default 300) returns text
language sql immutable set search_path = public, pg_temp as $$
  select nullif(left(btrim(coalesce(j ->> k, '')), p_max), '')
$$;

create or replace function public._t2_tr_sana(j jsonb, k text) returns date
language plpgsql immutable set search_path = public, pg_temp as $$
declare v text := nullif(btrim(j ->> k), '');
begin
  if v is null then return null; end if;
  if v !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'TR_SANA_NOTOGRI:%', k using errcode = '22023'; end if;
  return v::date;
end $$;

create or replace function public._t2_tr_vaqt(j jsonb, k text) returns timestamptz
language plpgsql immutable set search_path = public, pg_temp as $$
declare v text := nullif(btrim(j ->> k), '');
begin
  if v is null then return null; end if;
  return v::timestamptz;
exception when others then raise exception 'TR_VAQT_NOTOGRI:%', k using errcode = '22023';
end $$;

-- Idempotentlik: oldin bajarilgan bo'lsa saqlangan natija qaytadi.
create or replace function public._t2_tr_takror(p_k bigint, p_op uuid, p_amal text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v record;
begin
  if p_op is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select amal, natija into v from public.t2_tr_operation where kompaniya_id = p_k and operation_id = p_op;
  if found then
    if v.amal <> p_amal then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_CONFLICT'); end if;
    return v.natija || jsonb_build_object('takror', true);
  end if;
  return null;
end $$;

create or replace function public._t2_tr_saqla_op(p_k bigint, p_op uuid, p_amal text, p_natija jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.t2_tr_operation (kompaniya_id, operation_id, amal, natija) values (p_k, p_op, p_amal, p_natija)
  on conflict do nothing;
  return p_natija;
end $$;

-- Yoqilg'i narxi: reys sanasidagi (yoki undan oldingi eng so'nggi) narx.
create or replace function public._t2_tr_yoqilgi_narx(p_k bigint, p_tur text, p_sana date) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select narx from public.t2_tr_yoqilgi_narx where kompaniya_id = p_k and yoqilgi_turi = p_tur and sana <= p_sana order by sana desc limit 1
$$;

-- 5. TANNARX MODELI (QQS siz). TS: frontend/src/lib/transport/xarajat.ts bilan bir xil formulalar.
create or replace function public._t2_tr_tannarx_v1(p_reys_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r public.t2_tr_reys; m public.t2_tr_mashina; h public.t2_tr_haydovchi;
  v_km numeric; v_km_m text; v_soat numeric; v_kun numeric;
  v_norma numeric; v_fakt numeric; v_l numeric; v_narx numeric; v_narx_m text; v_yoq numeric; v_og numeric;
  v_hay numeric; v_amo numeric; v_kut numeric; v_jami numeric; v_yet text[] := '{}';
  v_t numeric; v_has boolean;
begin
  select * into r from public.t2_tr_reys where id = p_reys_id;
  if not found then return null; end if;
  select * into m from public.t2_tr_mashina where id = r.mashina_id;
  if r.haydovchi_id is not null then select * into h from public.t2_tr_haydovchi where id = r.haydovchi_id; end if;

  if r.km_boshi is not null and r.km_oxiri is not null then v_km := r.km_oxiri - r.km_boshi; v_km_m := 'fakt';
  elsif r.fakt_km is not null then v_km := r.fakt_km; v_km_m := 'fakt';
  elsif r.reja_km is not null then v_km := r.reja_km; v_km_m := 'reja'; end if;

  if r.moto_boshi is not null and r.moto_oxiri is not null then v_soat := r.moto_oxiri - r.moto_boshi;
  elsif r.ish_soat is not null then v_soat := r.ish_soat;
  elsif r.boshlandi is not null and r.tugadi is not null then v_soat := round(extract(epoch from (r.tugadi - r.boshlandi)) / 3600.0, 2);
  elsif r.reja_daqiqa is not null then v_soat := round(r.reja_daqiqa / 60.0, 2); end if;
  if r.boshlandi is not null and r.tugadi is not null then v_kun := greatest(1, (r.tugadi::date - r.boshlandi::date) + 1); else v_kun := 1; end if;

  -- Yoqilg'i: me'yor = (L/100km * km/100 + L/moto-soat * soat) * koef; haqiqiy sarf bo'lsa — u.
  if m.norma_100km is not null and v_km is not null then v_norma := coalesce(v_norma, 0) + m.norma_100km * v_km / 100.0; end if;
  if m.norma_motosoat is not null and v_soat is not null then v_norma := coalesce(v_norma, 0) + m.norma_motosoat * v_soat; end if;
  if v_norma is not null then v_norma := round(v_norma * r.norma_koef, 2); end if;
  v_fakt := r.yoqilgi_sarfi_l;
  v_l := coalesce(v_fakt, v_norma);
  if r.yoqilgi_narx_fakt is not null then v_narx := r.yoqilgi_narx_fakt; v_narx_m := 'fakt';
  else v_narx := public._t2_tr_yoqilgi_narx(r.kompaniya_id, m.yoqilgi_turi, r.sana); v_narx_m := case when v_narx is null then null else 'tarix' end; end if;
  if v_l is not null and v_narx is not null then v_yoq := round(v_l * v_narx, 2); else v_yet := array_append(v_yet, 'yoqilgi'); end if;
  if v_fakt is not null and v_norma is not null and v_norma > 0 then v_og := round((v_fakt - v_norma) / v_norma * 100.0, 1); end if;

  -- Haydovchi ish haqi (+ ijtimoiy soliq)
  if h.id is null or h.tolov_stavka is null then v_yet := array_append(v_yet, 'haydovchi');
  else
    v_t := case h.tolov_turi when 'reys' then h.tolov_stavka
                              when 'km' then case when v_km is null then null else h.tolov_stavka * v_km end
                              when 'soat' then case when v_soat is null then null else h.tolov_stavka * v_soat end
                              when 'oylik' then h.tolov_stavka / 26.0 * v_kun end;
    if v_t is null then v_yet := array_append(v_yet, 'haydovchi'); else v_hay := round(v_t * (1 + h.ijtimoiy_foiz / 100.0), 2); end if;
  end if;

  -- Amortizatsiya (o'z) yoki ijara
  v_has := false; v_t := 0;
  if m.egalik = 'oz' then
    if m.amort_km is not null and v_km is not null then v_t := v_t + m.amort_km * v_km; v_has := true; end if;
    if m.amort_soat is not null and v_soat is not null then v_t := v_t + m.amort_soat * v_soat; v_has := true; end if;
  else
    if m.ijara_km is not null and v_km is not null then v_t := v_t + m.ijara_km * v_km; v_has := true; end if;
    if m.ijara_soat is not null and v_soat is not null then v_t := v_t + m.ijara_soat * v_soat; v_has := true; end if;
    if m.ijara_kun is not null then v_t := v_t + m.ijara_kun * v_kun; v_has := true; end if;
  end if;
  if v_has then v_amo := round(v_t, 2); else v_yet := array_append(v_yet, 'amortizatsiya'); end if;

  -- Bekor turish
  if coalesce(r.kutish_daqiqa, 0) = 0 then v_kut := 0;
  elsif m.kutish_soat_narx is null then v_yet := array_append(v_yet, 'kutish');
  else v_kut := round(r.kutish_daqiqa / 60.0 * m.kutish_soat_narx, 2); end if;

  v_jami := coalesce(v_yoq, 0) + coalesce(v_hay, 0) + coalesce(v_amo, 0) + coalesce(v_kut, 0) + coalesce(r.yol_haqi, 0) + coalesce(r.boshqa_xarajat, 0);
  return jsonb_build_object(
    'km', v_km, 'km_manba', v_km_m, 'soat', v_soat, 'kun', v_kun,
    'yoqilgi', jsonb_build_object('norma_l', v_norma, 'fakt_l', v_fakt, 'litr', v_l, 'narx', v_narx, 'narx_manba', v_narx_m, 'summa', v_yoq, 'ogish_foiz', v_og),
    'haydovchi', v_hay, 'amortizatsiya', v_amo, 'kutish', v_kut, 'yol_haqi', r.yol_haqi, 'boshqa', r.boshqa_xarajat,
    'jami', v_jami, 'toliq', coalesce(array_length(v_yet, 1), 0) = 0, 'yetishmaydi', to_jsonb(v_yet),
    'qqs', 'ichki tannarx QQS siz');
end $$;

-- 6. YOZUVCHI RPC lar. Hammasi: (kompaniya, actor, operation_id, data jsonb) -> jsonb. a'zolik + ruxsat + idempotent.
create or replace function public.t2_tr_mashina_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; v_id bigint := public._t2_tr_son(p_data, 'id')::bigint; v_ver integer := public._t2_tr_son(p_data, 'versiya')::integer; v_n integer;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'machinery.write');
  v_t := public._t2_tr_takror(p_kompaniya_id, p_operation_id, 'mashina'); if v_t is not null then return v_t; end if;
  if public._t2_tr_matn(p_data, 'nomi', 200) is null then return jsonb_build_object('ok', false, 'code', 'NOMI_REQUIRED'); end if;
  if public._t2_tr_son(p_data, 'texnika_id') is not null and not exists (select 1 from public.t2_texnika_mustaqil where id = public._t2_tr_son(p_data, 'texnika_id')::bigint and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TEXNIKA_SCOPE_MISMATCH'); end if;
  if public._t2_tr_son(p_data, 'haydovchi_id') is not null and not exists (select 1 from public.t2_tr_haydovchi where id = public._t2_tr_son(p_data, 'haydovchi_id')::bigint and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'HAYDOVCHI_SCOPE_MISMATCH'); end if;
  if v_id is null then
    insert into public.t2_tr_mashina (kompaniya_id, nomi, davlat_raqami, turi, yuk_t, yuk_m3, yoqilgi_turi, norma_100km, norma_motosoat, odometr_km, motosoat,
      egalik, ijara_km, ijara_soat, ijara_kun, amort_km, amort_soat, kutish_soat_narx, texnika_id, haydovchi_id, holat)
    values (p_kompaniya_id, public._t2_tr_matn(p_data, 'nomi', 200), public._t2_tr_matn(p_data, 'davlat_raqami', 30), coalesce(public._t2_tr_matn(p_data, 'turi', 30), 'yuk'),
      public._t2_tr_son(p_data, 'yuk_t'), public._t2_tr_son(p_data, 'yuk_m3'), coalesce(public._t2_tr_matn(p_data, 'yoqilgi_turi', 20), 'dizel'),
      public._t2_tr_son(p_data, 'norma_100km'), public._t2_tr_son(p_data, 'norma_motosoat'), public._t2_tr_son(p_data, 'odometr_km'), public._t2_tr_son(p_data, 'motosoat'),
      coalesce(public._t2_tr_matn(p_data, 'egalik', 10), 'oz'), public._t2_tr_son(p_data, 'ijara_km'), public._t2_tr_son(p_data, 'ijara_soat'), public._t2_tr_son(p_data, 'ijara_kun'),
      public._t2_tr_son(p_data, 'amort_km'), public._t2_tr_son(p_data, 'amort_soat'), public._t2_tr_son(p_data, 'kutish_soat_narx'),
      public._t2_tr_son(p_data, 'texnika_id')::bigint, public._t2_tr_son(p_data, 'haydovchi_id')::bigint, coalesce(public._t2_tr_matn(p_data, 'holat', 10), 'faol'))
    returning id into v_id;
    v_ver := 1;
  else
    update public.t2_tr_mashina set nomi = public._t2_tr_matn(p_data, 'nomi', 200), davlat_raqami = public._t2_tr_matn(p_data, 'davlat_raqami', 30),
      turi = coalesce(public._t2_tr_matn(p_data, 'turi', 30), turi), yuk_t = public._t2_tr_son(p_data, 'yuk_t'), yuk_m3 = public._t2_tr_son(p_data, 'yuk_m3'),
      yoqilgi_turi = coalesce(public._t2_tr_matn(p_data, 'yoqilgi_turi', 20), yoqilgi_turi), norma_100km = public._t2_tr_son(p_data, 'norma_100km'),
      norma_motosoat = public._t2_tr_son(p_data, 'norma_motosoat'), odometr_km = public._t2_tr_son(p_data, 'odometr_km'), motosoat = public._t2_tr_son(p_data, 'motosoat'),
      egalik = coalesce(public._t2_tr_matn(p_data, 'egalik', 10), egalik), ijara_km = public._t2_tr_son(p_data, 'ijara_km'), ijara_soat = public._t2_tr_son(p_data, 'ijara_soat'),
      ijara_kun = public._t2_tr_son(p_data, 'ijara_kun'), amort_km = public._t2_tr_son(p_data, 'amort_km'), amort_soat = public._t2_tr_son(p_data, 'amort_soat'),
      kutish_soat_narx = public._t2_tr_son(p_data, 'kutish_soat_narx'), texnika_id = public._t2_tr_son(p_data, 'texnika_id')::bigint,
      haydovchi_id = public._t2_tr_son(p_data, 'haydovchi_id')::bigint, holat = coalesce(public._t2_tr_matn(p_data, 'holat', 10), holat),
      versiya = versiya + 1, yangilandi = now()
    where id = v_id and kompaniya_id = p_kompaniya_id and versiya = v_ver;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'code', case when exists (select 1 from public.t2_tr_mashina where id = v_id and kompaniya_id = p_kompaniya_id) then 'VERSION_CONFLICT' else 'NOT_FOUND' end);
    end if;
    v_ver := v_ver + 1;
  end if;
  return public._t2_tr_saqla_op(p_kompaniya_id, p_operation_id, 'mashina', jsonb_build_object('ok', true, 'id', v_id, 'versiya', v_ver));
end $$;

create or replace function public.t2_tr_haydovchi_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; v_id bigint := public._t2_tr_son(p_data, 'id')::bigint; v_ver integer := public._t2_tr_son(p_data, 'versiya')::integer; v_n integer;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'machinery.write');
  v_t := public._t2_tr_takror(p_kompaniya_id, p_operation_id, 'haydovchi'); if v_t is not null then return v_t; end if;
  if public._t2_tr_matn(p_data, 'ism', 200) is null then return jsonb_build_object('ok', false, 'code', 'ISM_REQUIRED'); end if;
  if public._t2_tr_son(p_data, 'kadr_id') is not null and not exists (select 1 from public.t2_kadr_mustaqil where id = public._t2_tr_son(p_data, 'kadr_id')::bigint and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'KADR_SCOPE_MISMATCH'); end if;
  if public._t2_tr_son(p_data, 'foydalanuvchi_id') is not null and not exists (
      select 1 from public.t2_azolik a where a.kompaniya_id = p_kompaniya_id and a.foydalanuvchi_id = public._t2_tr_son(p_data, 'foydalanuvchi_id')::bigint and a.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_SCOPE_MISMATCH'); end if;
  if v_id is null then
    insert into public.t2_tr_haydovchi (kompaniya_id, ism, telefon, kadr_id, foydalanuvchi_id, tolov_turi, tolov_stavka, ijtimoiy_foiz, holat)
    values (p_kompaniya_id, public._t2_tr_matn(p_data, 'ism', 200), public._t2_tr_matn(p_data, 'telefon', 40), public._t2_tr_son(p_data, 'kadr_id')::bigint,
      public._t2_tr_son(p_data, 'foydalanuvchi_id')::bigint, coalesce(public._t2_tr_matn(p_data, 'tolov_turi', 10), 'reys'), public._t2_tr_son(p_data, 'tolov_stavka'),
      coalesce(public._t2_tr_son(p_data, 'ijtimoiy_foiz'), 12), coalesce(public._t2_tr_matn(p_data, 'holat', 10), 'faol'))
    returning id into v_id; v_ver := 1;
  else
    update public.t2_tr_haydovchi set ism = public._t2_tr_matn(p_data, 'ism', 200), telefon = public._t2_tr_matn(p_data, 'telefon', 40),
      kadr_id = public._t2_tr_son(p_data, 'kadr_id')::bigint, foydalanuvchi_id = public._t2_tr_son(p_data, 'foydalanuvchi_id')::bigint,
      tolov_turi = coalesce(public._t2_tr_matn(p_data, 'tolov_turi', 10), tolov_turi), tolov_stavka = public._t2_tr_son(p_data, 'tolov_stavka'),
      ijtimoiy_foiz = coalesce(public._t2_tr_son(p_data, 'ijtimoiy_foiz'), ijtimoiy_foiz), holat = coalesce(public._t2_tr_matn(p_data, 'holat', 10), holat),
      versiya = versiya + 1, yangilandi = now()
    where id = v_id and kompaniya_id = p_kompaniya_id and versiya = v_ver;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'code', case when exists (select 1 from public.t2_tr_haydovchi where id = v_id and kompaniya_id = p_kompaniya_id) then 'VERSION_CONFLICT' else 'NOT_FOUND' end);
    end if;
    v_ver := v_ver + 1;
  end if;
  return public._t2_tr_saqla_op(p_kompaniya_id, p_operation_id, 'haydovchi', jsonb_build_object('ok', true, 'id', v_id, 'versiya', v_ver));
end $$;

create or replace function public.t2_tr_hujjat_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; v_id bigint := public._t2_tr_son(p_data, 'id')::bigint; v_ver integer := public._t2_tr_son(p_data, 'versiya')::integer; v_n integer;
  v_et text := public._t2_tr_matn(p_data, 'egasi_turi', 10); v_ei bigint := public._t2_tr_son(p_data, 'egasi_id')::bigint;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'machinery.write');
  v_t := public._t2_tr_takror(p_kompaniya_id, p_operation_id, 'hujjat'); if v_t is not null then return v_t; end if;
  if public._t2_tr_sana(p_data, 'muddat') is null then return jsonb_build_object('ok', false, 'code', 'MUDDAT_REQUIRED'); end if;
  if v_et = 'mashina' and not exists (select 1 from public.t2_tr_mashina where id = v_ei and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'EGASI_SCOPE_MISMATCH'); end if;
  if v_et = 'haydovchi' and not exists (select 1 from public.t2_tr_haydovchi where id = v_ei and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'EGASI_SCOPE_MISMATCH'); end if;
  if v_et is null or v_et not in ('mashina', 'haydovchi') then return jsonb_build_object('ok', false, 'code', 'EGASI_TURI_INVALID'); end if;
  if v_id is null then
    insert into public.t2_tr_hujjat (kompaniya_id, egasi_turi, egasi_id, turi, raqam, boshlanish, muddat, izoh, holat)
    values (p_kompaniya_id, v_et, v_ei, coalesce(public._t2_tr_matn(p_data, 'turi', 20), 'boshqa'), public._t2_tr_matn(p_data, 'raqam', 100), public._t2_tr_sana(p_data, 'boshlanish'),
      public._t2_tr_sana(p_data, 'muddat'), public._t2_tr_matn(p_data, 'izoh', 500), coalesce(public._t2_tr_matn(p_data, 'holat', 10), 'faol')) returning id into v_id; v_ver := 1;
  else
    update public.t2_tr_hujjat set turi = coalesce(public._t2_tr_matn(p_data, 'turi', 20), turi), raqam = public._t2_tr_matn(p_data, 'raqam', 100),
      boshlanish = public._t2_tr_sana(p_data, 'boshlanish'), muddat = public._t2_tr_sana(p_data, 'muddat'), izoh = public._t2_tr_matn(p_data, 'izoh', 500),
      holat = coalesce(public._t2_tr_matn(p_data, 'holat', 10), holat), versiya = versiya + 1, yangilandi = now()
    where id = v_id and kompaniya_id = p_kompaniya_id and versiya = v_ver;
    get diagnostics v_n = row_count;
    if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT'); end if;
    v_ver := v_ver + 1;
  end if;
  return public._t2_tr_saqla_op(p_kompaniya_id, p_operation_id, 'hujjat', jsonb_build_object('ok', true, 'id', v_id, 'versiya', v_ver));
end $$;

create or replace function public.t2_tr_yoqilgi_narx_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; v_id bigint;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'logistics.dispatch');
  v_t := public._t2_tr_takror(p_kompaniya_id, p_operation_id, 'yoqilgi_narx'); if v_t is not null then return v_t; end if;
  if public._t2_tr_son(p_data, 'narx') is null or public._t2_tr_son(p_data, 'narx') <= 0 or public._t2_tr_sana(p_data, 'sana') is null then
    return jsonb_build_object('ok', false, 'code', 'NARX_YOKI_SANA_INVALID'); end if;
  insert into public.t2_tr_yoqilgi_narx (kompaniya_id, yoqilgi_turi, sana, narx, izoh)
  values (p_kompaniya_id, public._t2_tr_matn(p_data, 'yoqilgi_turi', 20), public._t2_tr_sana(p_data, 'sana'), public._t2_tr_son(p_data, 'narx'), public._t2_tr_matn(p_data, 'izoh', 300))
  on conflict (kompaniya_id, yoqilgi_turi, sana) do update set narx = excluded.narx, izoh = excluded.izoh
  returning id into v_id;
  return public._t2_tr_saqla_op(p_kompaniya_id, p_operation_id, 'yoqilgi_narx', jsonb_build_object('ok', true, 'id', v_id));
end $$;

create or replace function public.t2_tr_tarif_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; v_id bigint := public._t2_tr_son(p_data, 'id')::bigint; v_ver integer := public._t2_tr_son(p_data, 'versiya')::integer; v_n integer;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'logistics.dispatch');
  v_t := public._t2_tr_takror(p_kompaniya_id, p_operation_id, 'tarif'); if v_t is not null then return v_t; end if;
  if public._t2_tr_matn(p_data, 'nom', 200) is null then return jsonb_build_object('ok', false, 'code', 'NOM_REQUIRED'); end if;
  if v_id is null then
    insert into public.t2_tr_tarif (kompaniya_id, nom, zona, mashina_turi, km_narx, tonna_km_narx, soat_narx, reys_narx, minimal_summa, marja_foiz, qqs_foiz, qqs_kiritilgan, holat)
    values (p_kompaniya_id, public._t2_tr_matn(p_data, 'nom', 200), public._t2_tr_matn(p_data, 'zona', 100), public._t2_tr_matn(p_data, 'mashina_turi', 30),
      public._t2_tr_son(p_data, 'km_narx'), public._t2_tr_son(p_data, 'tonna_km_narx'), public._t2_tr_son(p_data, 'soat_narx'), public._t2_tr_son(p_data, 'reys_narx'),
      public._t2_tr_son(p_data, 'minimal_summa'), public._t2_tr_son(p_data, 'marja_foiz'), coalesce(public._t2_tr_son(p_data, 'qqs_foiz'), 12),
      coalesce((p_data ->> 'qqs_kiritilgan')::boolean, false), coalesce(public._t2_tr_matn(p_data, 'holat', 10), 'faol')) returning id into v_id; v_ver := 1;
  else
    update public.t2_tr_tarif set nom = public._t2_tr_matn(p_data, 'nom', 200), zona = public._t2_tr_matn(p_data, 'zona', 100), mashina_turi = public._t2_tr_matn(p_data, 'mashina_turi', 30),
      km_narx = public._t2_tr_son(p_data, 'km_narx'), tonna_km_narx = public._t2_tr_son(p_data, 'tonna_km_narx'), soat_narx = public._t2_tr_son(p_data, 'soat_narx'),
      reys_narx = public._t2_tr_son(p_data, 'reys_narx'), minimal_summa = public._t2_tr_son(p_data, 'minimal_summa'), marja_foiz = public._t2_tr_son(p_data, 'marja_foiz'),
      qqs_foiz = coalesce(public._t2_tr_son(p_data, 'qqs_foiz'), qqs_foiz), qqs_kiritilgan = coalesce((p_data ->> 'qqs_kiritilgan')::boolean, qqs_kiritilgan),
      holat = coalesce(public._t2_tr_matn(p_data, 'holat', 10), holat), versiya = versiya + 1, yangilandi = now()
    where id = v_id and kompaniya_id = p_kompaniya_id and versiya = v_ver;
    get diagnostics v_n = row_count;
    if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT'); end if;
    v_ver := v_ver + 1;
  end if;
  return public._t2_tr_saqla_op(p_kompaniya_id, p_operation_id, 'tarif', jsonb_build_object('ok', true, 'id', v_id, 'versiya', v_ver));
end $$;

-- Reys rejasi: yaratish/tahrirlash (faqat holat = reja). bekatlar va yuklar to'liq almashtiriladi.
create or replace function public.t2_tr_reys_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; v_id bigint := public._t2_tr_son(p_data, 'id')::bigint; v_ver integer := public._t2_tr_son(p_data, 'versiya')::integer; v_n integer;
  v_b jsonb; v_i int := 0; v_y jsonb; v_hol text; v_mid bigint := public._t2_tr_son(p_data, 'mashina_id')::bigint; v_hid bigint := public._t2_tr_son(p_data, 'haydovchi_id')::bigint;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'logistics.dispatch');
  v_t := public._t2_tr_takror(p_kompaniya_id, p_operation_id, 'reys'); if v_t is not null then return v_t; end if;
  if v_mid is null or not exists (select 1 from public.t2_tr_mashina where id = v_mid and kompaniya_id = p_kompaniya_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'MASHINA_INVALID'); end if;
  if v_hid is not null and not exists (select 1 from public.t2_tr_haydovchi where id = v_hid and kompaniya_id = p_kompaniya_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'HAYDOVCHI_INVALID'); end if;
  if public._t2_tr_son(p_data, 'tarif_id') is not null and not exists (select 1 from public.t2_tr_tarif where id = public._t2_tr_son(p_data, 'tarif_id')::bigint and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'TARIF_SCOPE_MISMATCH'); end if;
  if public._t2_tr_son(p_data, 'kontragent_id') is not null and not exists (select 1 from public.t2_kontragent where id = public._t2_tr_son(p_data, 'kontragent_id')::bigint and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'KONTRAGENT_SCOPE_MISMATCH'); end if;
  if jsonb_typeof(p_data -> 'bekatlar') is distinct from 'array' or jsonb_array_length(p_data -> 'bekatlar') < 2 or jsonb_array_length(p_data -> 'bekatlar') > 30 then return jsonb_build_object('ok', false, 'code', 'BEKATLAR_INVALID'); end if;
  for v_b in select * from jsonb_array_elements(p_data -> 'bekatlar') loop
    if public._t2_tr_matn(v_b, 'nom', 200) is null then return jsonb_build_object('ok', false, 'code', 'BEKAT_NOM_REQUIRED'); end if;
    if public._t2_tr_son(v_b, 'obyekt_id') is not null and not exists (select 1 from public.t2_obyekt where id = public._t2_tr_son(v_b, 'obyekt_id')::bigint and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH'); end if;
  end loop;
  if jsonb_typeof(p_data -> 'yuklar') = 'array' then
    for v_y in select * from jsonb_array_elements(p_data -> 'yuklar') loop
      if public._t2_tr_matn(v_y, 'nom', 300) is null then return jsonb_build_object('ok', false, 'code', 'YUK_NOM_REQUIRED'); end if;
      if public._t2_tr_son(v_y, 'obyekt_id') is not null and not exists (select 1 from public.t2_obyekt where id = public._t2_tr_son(v_y, 'obyekt_id')::bigint and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH'); end if;
    end loop;
  end if;

  if v_id is null then
    insert into public.t2_tr_reys (kompaniya_id, sana, mashina_id, haydovchi_id, buyurtmachi_turi, kontragent_id, mijoz_nom, talab_turi, talab_ref, tarif_id, reja_km, reja_daqiqa, marshrut_manba,
        norma_koef, narx_qqs_siz, qqs_foiz, izoh, actor_id)
    values (p_kompaniya_id, coalesce(public._t2_tr_sana(p_data, 'sana'), current_date), v_mid, v_hid, coalesce(public._t2_tr_matn(p_data, 'buyurtmachi_turi', 10), 'ichki'),
      public._t2_tr_son(p_data, 'kontragent_id')::bigint, public._t2_tr_matn(p_data, 'mijoz_nom', 200), coalesce(public._t2_tr_matn(p_data, 'talab_turi', 10), 'qolda'),
      public._t2_tr_matn(p_data, 'talab_ref', 200), public._t2_tr_son(p_data, 'tarif_id')::bigint, public._t2_tr_son(p_data, 'reja_km'), public._t2_tr_son(p_data, 'reja_daqiqa')::integer,
      public._t2_tr_matn(p_data, 'marshrut_manba', 10), coalesce(public._t2_tr_son(p_data, 'norma_koef'), 1), public._t2_tr_son(p_data, 'narx_qqs_siz'),
      coalesce(public._t2_tr_son(p_data, 'qqs_foiz'), 12), public._t2_tr_matn(p_data, 'izoh', 1000), p_actor_id)
    returning id into v_id;
    update public.t2_tr_reys set raqam = 'R-' || to_char(sana, 'YYMM') || '-' || lpad(v_id::text, 5, '0') where id = v_id;
    v_ver := 1;
  else
    select holat into v_hol from public.t2_tr_reys where id = v_id and kompaniya_id = p_kompaniya_id;
    if v_hol is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
    if v_hol <> 'reja' then return jsonb_build_object('ok', false, 'code', 'REYS_REJA_EMAS'); end if;
    update public.t2_tr_reys set sana = coalesce(public._t2_tr_sana(p_data, 'sana'), sana), mashina_id = v_mid, haydovchi_id = v_hid,
      buyurtmachi_turi = coalesce(public._t2_tr_matn(p_data, 'buyurtmachi_turi', 10), buyurtmachi_turi), kontragent_id = public._t2_tr_son(p_data, 'kontragent_id')::bigint,
      mijoz_nom = public._t2_tr_matn(p_data, 'mijoz_nom', 200), talab_turi = coalesce(public._t2_tr_matn(p_data, 'talab_turi', 10), talab_turi), talab_ref = public._t2_tr_matn(p_data, 'talab_ref', 200),
      tarif_id = public._t2_tr_son(p_data, 'tarif_id')::bigint, reja_km = public._t2_tr_son(p_data, 'reja_km'), reja_daqiqa = public._t2_tr_son(p_data, 'reja_daqiqa')::integer,
      marshrut_manba = public._t2_tr_matn(p_data, 'marshrut_manba', 10), norma_koef = coalesce(public._t2_tr_son(p_data, 'norma_koef'), norma_koef),
      narx_qqs_siz = public._t2_tr_son(p_data, 'narx_qqs_siz'), qqs_foiz = coalesce(public._t2_tr_son(p_data, 'qqs_foiz'), qqs_foiz), izoh = public._t2_tr_matn(p_data, 'izoh', 1000),
      versiya = versiya + 1, yangilandi = now(), actor_id = p_actor_id
    where id = v_id and kompaniya_id = p_kompaniya_id and versiya = v_ver;
    get diagnostics v_n = row_count;
    if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT'); end if;
    delete from public.t2_tr_bekat where reys_id = v_id; delete from public.t2_tr_yuk where reys_id = v_id;
    v_ver := v_ver + 1;
  end if;
  for v_b in select * from jsonb_array_elements(p_data -> 'bekatlar') loop
    v_i := v_i + 1;
    insert into public.t2_tr_bekat (reys_id, kompaniya_id, tartib, turi, nom, obyekt_id, sklad_id, kontragent_id, lat, lng, manzil, reja_vaqt, izoh)
    values (v_id, p_kompaniya_id, v_i, coalesce(public._t2_tr_matn(v_b, 'turi', 10), 'tushirish'), public._t2_tr_matn(v_b, 'nom', 200), public._t2_tr_son(v_b, 'obyekt_id')::bigint,
      public._t2_tr_son(v_b, 'sklad_id')::bigint, null, public._t2_tr_son(v_b, 'lat'), public._t2_tr_son(v_b, 'lng'), public._t2_tr_matn(v_b, 'manzil', 300),
      public._t2_tr_vaqt(v_b, 'reja_vaqt'), public._t2_tr_matn(v_b, 'izoh', 500));
  end loop;
  if jsonb_typeof(p_data -> 'yuklar') = 'array' then
    for v_y in select * from jsonb_array_elements(p_data -> 'yuklar') loop
      insert into public.t2_tr_yuk (reys_id, kompaniya_id, yuklash_tartib, tushirish_tartib, nom, birlik, miqdor, ogirlik_t, hajm_m3, obyekt_id)
      values (v_id, p_kompaniya_id, public._t2_tr_son(v_y, 'yuklash_tartib')::integer, public._t2_tr_son(v_y, 'tushirish_tartib')::integer, public._t2_tr_matn(v_y, 'nom', 300),
        public._t2_tr_matn(v_y, 'birlik', 20), public._t2_tr_son(v_y, 'miqdor'), public._t2_tr_son(v_y, 'ogirlik_t'), public._t2_tr_son(v_y, 'hajm_m3'), public._t2_tr_son(v_y, 'obyekt_id')::bigint);
    end loop;
  end if;
  return public._t2_tr_saqla_op(p_kompaniya_id, p_operation_id, 'reys', jsonb_build_object('ok', true, 'id', v_id, 'versiya', v_ver));
end $$;

-- Haydovchi/dispetcher harakati: boshla -> bekat (har bekat) -> yetkaz. Haydovchi faqat o'z reysida.
create or replace function public.t2_tr_reys_yurish_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; v_id bigint := public._t2_tr_son(p_data, 'id')::bigint; v_ver integer := public._t2_tr_son(p_data, 'versiya')::integer; v_h text := public._t2_tr_matn(p_data, 'harakat', 10);
  r public.t2_tr_reys; v_disp boolean; v_own boolean; v_tartib integer := public._t2_tr_son(p_data, 'bekat_tartib')::integer; v_bh text := public._t2_tr_matn(p_data, 'bekat_holat', 20);
  v_n integer; v_oxirgi_km numeric; v_ochiq integer;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  v_disp := public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'logistics.dispatch');
  if not v_disp then perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'logistics.trip'); end if;
  v_t := public._t2_tr_takror(p_kompaniya_id, p_operation_id, 'yurish'); if v_t is not null then return v_t; end if;
  select * into r from public.t2_tr_reys where id = v_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  v_own := exists (select 1 from public.t2_tr_haydovchi h where h.id = r.haydovchi_id and h.foydalanuvchi_id = p_actor_id);
  if not v_disp and not v_own then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  if v_ver is distinct from r.versiya then return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT'); end if;

  if v_h = 'boshla' then
    if r.holat <> 'reja' then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI', 'holat', r.holat); end if;
    if r.haydovchi_id is null then return jsonb_build_object('ok', false, 'code', 'HAYDOVCHI_YOQ'); end if;
    update public.t2_tr_reys set holat = 'yolda', boshlandi = coalesce(public._t2_tr_vaqt(p_data, 'vaqt'), now()),
      km_boshi = coalesce(public._t2_tr_son(p_data, 'km'), (select odometr_km from public.t2_tr_mashina where id = r.mashina_id)),
      moto_boshi = coalesce(public._t2_tr_son(p_data, 'moto'), (select motosoat from public.t2_tr_mashina where id = r.mashina_id)),
      versiya = versiya + 1, yangilandi = now() where id = r.id;
  elsif v_h = 'bekat' then
    if r.holat <> 'yolda' then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI', 'holat', r.holat); end if;
    if v_bh is null or v_bh not in ('yetib_keldi', 'bajarildi', 'otkazildi') then return jsonb_build_object('ok', false, 'code', 'BEKAT_HOLAT_INVALID'); end if;
    update public.t2_tr_bekat set holat = v_bh,
      kelish_vaqt = case when v_bh = 'yetib_keldi' then coalesce(public._t2_tr_vaqt(p_data, 'vaqt'), now()) else kelish_vaqt end,
      ketish_vaqt = case when v_bh in ('bajarildi', 'otkazildi') then coalesce(public._t2_tr_vaqt(p_data, 'vaqt'), now()) else ketish_vaqt end,
      qabul_qiluvchi = coalesce(public._t2_tr_matn(p_data, 'qabul_qiluvchi', 200), qabul_qiluvchi),
      tasdiq_turi = coalesce(public._t2_tr_matn(p_data, 'tasdiq_turi', 10), tasdiq_turi), tasdiq_ref = coalesce(public._t2_tr_matn(p_data, 'tasdiq_ref', 500), tasdiq_ref),
      lat = coalesce(public._t2_tr_son(p_data, 'lat'), lat), lng = coalesce(public._t2_tr_son(p_data, 'lng'), lng),
      izoh = coalesce(public._t2_tr_matn(p_data, 'izoh', 500), izoh)
    where reys_id = r.id and tartib = v_tartib;
    get diagnostics v_n = row_count;
    if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'BEKAT_YOQ'); end if;
    update public.t2_tr_reys set versiya = versiya + 1, yangilandi = now() where id = r.id;
  elsif v_h = 'yetkaz' then
    if r.holat <> 'yolda' then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI', 'holat', r.holat); end if;
    select count(*) into v_ochiq from public.t2_tr_bekat where reys_id = r.id and holat in ('kutilmoqda', 'yetib_keldi');
    if v_ochiq > 0 then return jsonb_build_object('ok', false, 'code', 'BEKATLAR_YOPILMAGAN', 'soni', v_ochiq); end if;
    v_oxirgi_km := public._t2_tr_son(p_data, 'km');
    if v_oxirgi_km is not null and r.km_boshi is not null and v_oxirgi_km < r.km_boshi then return jsonb_build_object('ok', false, 'code', 'ODOMETR_KICHIK'); end if;
    update public.t2_tr_reys set holat = 'yetkazildi', tugadi = coalesce(public._t2_tr_vaqt(p_data, 'vaqt'), now()),
      km_oxiri = coalesce(v_oxirgi_km, km_oxiri), moto_oxiri = coalesce(public._t2_tr_son(p_data, 'moto'), moto_oxiri),
      bosh_km = coalesce(public._t2_tr_son(p_data, 'bosh_km'), bosh_km), kutish_daqiqa = coalesce(public._t2_tr_son(p_data, 'kutish_daqiqa')::integer, kutish_daqiqa),
      yoqilgi_sarfi_l = coalesce(public._t2_tr_son(p_data, 'yoqilgi_sarfi_l'), yoqilgi_sarfi_l), yoqilgi_quyildi_l = coalesce(public._t2_tr_son(p_data, 'yoqilgi_quyildi_l'), yoqilgi_quyildi_l),
      yol_haqi = coalesce(public._t2_tr_son(p_data, 'yol_haqi'), yol_haqi), boshqa_xarajat = coalesce(public._t2_tr_son(p_data, 'boshqa_xarajat'), boshqa_xarajat),
      boshqa_izoh = coalesce(public._t2_tr_matn(p_data, 'boshqa_izoh', 300), boshqa_izoh), versiya = versiya + 1, yangilandi = now()
    where id = r.id;
    -- Mashina hisoblagichi (odometr/moto-soat) oxirgi qiymatga yangilanadi.
    update public.t2_tr_mashina m set odometr_km = greatest(coalesce(m.odometr_km, 0), coalesce(v_oxirgi_km, m.odometr_km, 0)),
      motosoat = greatest(coalesce(m.motosoat, 0), coalesce(public._t2_tr_son(p_data, 'moto'), m.motosoat, 0)), versiya = m.versiya + 1, yangilandi = now()
    where m.id = r.mashina_id and (v_oxirgi_km is not null or public._t2_tr_son(p_data, 'moto') is not null);
  else
    return jsonb_build_object('ok', false, 'code', 'HARAKAT_INVALID');
  end if;
  return public._t2_tr_saqla_op(p_kompaniya_id, p_operation_id, 'yurish', jsonb_build_object('ok', true, 'id', r.id, 'versiya', r.versiya + 1));
end $$;

-- Reysni yopish (dispetcher): tannarx muhrlanadi, obyektlarga ulush hisoblanadi (ogirlik bo'yicha, bo'lmasa teng).
create or replace function public.t2_tr_reys_yop_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; r public.t2_tr_reys; v_tn jsonb; v_jami numeric; v_sum numeric := 0; v_og numeric; v_kum numeric := 0; v_ush numeric; v_s numeric; v_i int := 0; v_n int; v_asos text; v_row record;
  v_ver integer := public._t2_tr_son(p_data, 'versiya')::integer;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'logistics.dispatch');
  v_t := public._t2_tr_takror(p_kompaniya_id, p_operation_id, 'yop'); if v_t is not null then return v_t; end if;
  select * into r from public.t2_tr_reys where id = public._t2_tr_son(p_data, 'id')::bigint and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.versiya is distinct from v_ver then return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT'); end if;
  if r.holat <> 'yetkazildi' then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI', 'holat', r.holat); end if;
  -- Dispetcher yopishda yetishmagan qiymatlarni kiritishi mumkin (faqat kelgan kalitlar).
  update public.t2_tr_reys set
    yoqilgi_sarfi_l = case when p_data ? 'yoqilgi_sarfi_l' then public._t2_tr_son(p_data, 'yoqilgi_sarfi_l') else yoqilgi_sarfi_l end,
    yoqilgi_quyildi_l = case when p_data ? 'yoqilgi_quyildi_l' then public._t2_tr_son(p_data, 'yoqilgi_quyildi_l') else yoqilgi_quyildi_l end,
    yoqilgi_narx_fakt = case when p_data ? 'yoqilgi_narx_fakt' then public._t2_tr_son(p_data, 'yoqilgi_narx_fakt') else yoqilgi_narx_fakt end,
    yol_haqi = case when p_data ? 'yol_haqi' then public._t2_tr_son(p_data, 'yol_haqi') else yol_haqi end,
    boshqa_xarajat = case when p_data ? 'boshqa_xarajat' then public._t2_tr_son(p_data, 'boshqa_xarajat') else boshqa_xarajat end,
    boshqa_izoh = case when p_data ? 'boshqa_izoh' then public._t2_tr_matn(p_data, 'boshqa_izoh', 300) else boshqa_izoh end,
    kutish_daqiqa = case when p_data ? 'kutish_daqiqa' then public._t2_tr_son(p_data, 'kutish_daqiqa')::integer else kutish_daqiqa end,
    bosh_km = case when p_data ? 'bosh_km' then public._t2_tr_son(p_data, 'bosh_km') else bosh_km end,
    narx_qqs_siz = case when p_data ? 'narx_qqs_siz' then public._t2_tr_son(p_data, 'narx_qqs_siz') else narx_qqs_siz end,
    norma_koef = coalesce(public._t2_tr_son(p_data, 'norma_koef'), norma_koef)
  where id = r.id;
  v_tn := public._t2_tr_tannarx_v1(r.id);
  v_jami := (v_tn ->> 'jami')::numeric;
  -- Ulushlar
  delete from public.t2_tr_taqsim where reys_id = r.id and holat = 'hisoblangan';
  if exists (select 1 from public.t2_tr_yuk where reys_id = r.id and obyekt_id is not null) and not exists (select 1 from public.t2_tr_yuk where reys_id = r.id and obyekt_id is not null and coalesce(ogirlik_t, 0) = 0) then
    v_asos := 'ogirlik';
    select sum(ogirlik_t) into v_og from public.t2_tr_yuk where reys_id = r.id and obyekt_id is not null;
  elsif exists (select 1 from public.t2_tr_yuk where reys_id = r.id and obyekt_id is not null) or exists (select 1 from public.t2_tr_bekat where reys_id = r.id and obyekt_id is not null and turi = 'tushirish') then
    v_asos := 'teng';
  end if;
  if v_asos is not null then
    for v_row in
      select obyekt_id, case when v_asos = 'ogirlik' then sum(ogirlik_t) else 1 end as og
      from (
        select obyekt_id, ogirlik_t from public.t2_tr_yuk where reys_id = r.id and obyekt_id is not null
        union all
        select obyekt_id, null from public.t2_tr_bekat where reys_id = r.id and obyekt_id is not null and turi = 'tushirish' and v_asos = 'teng'
          and not exists (select 1 from public.t2_tr_yuk y where y.reys_id = r.id and y.obyekt_id = t2_tr_bekat.obyekt_id)
      ) q group by obyekt_id order by obyekt_id
    loop
      v_i := v_i + 1;
    end loop;
    v_n := v_i; v_i := 0;
    for v_row in
      select obyekt_id, case when v_asos = 'ogirlik' then sum(ogirlik_t) else 1 end as og
      from (
        select obyekt_id, ogirlik_t from public.t2_tr_yuk where reys_id = r.id and obyekt_id is not null
        union all
        select obyekt_id, null from public.t2_tr_bekat where reys_id = r.id and obyekt_id is not null and turi = 'tushirish' and v_asos = 'teng'
          and not exists (select 1 from public.t2_tr_yuk y where y.reys_id = r.id and y.obyekt_id = t2_tr_bekat.obyekt_id)
      ) q group by obyekt_id order by obyekt_id
    loop
      v_i := v_i + 1;
      v_ush := case when v_asos = 'ogirlik' then v_row.og / v_og else 1.0 / v_n end;
      if v_i = v_n then v_ush := 1 - v_kum; end if;
      v_kum := v_kum + round(v_ush, 6);
      v_s := case when v_i = v_n then round(v_jami - v_sum, 2) else round(v_jami * v_ush, 2) end;
      v_sum := v_sum + v_s;
      insert into public.t2_tr_taqsim (reys_id, kompaniya_id, obyekt_id, ulush, summa_qqs_siz, asos) values (r.id, p_kompaniya_id, v_row.obyekt_id, round(v_ush, 6), v_s, v_asos);
    end loop;
  end if;
  update public.t2_tr_reys set holat = 'yopildi', tannarx = v_tn, versiya = versiya + 1, yangilandi = now() where id = r.id;
  return public._t2_tr_saqla_op(p_kompaniya_id, p_operation_id, 'yop', jsonb_build_object('ok', true, 'id', r.id, 'versiya', r.versiya + 1, 'tannarx', v_tn, 'taqsimot', coalesce(v_asos, 'yoq')));
end $$;

create or replace function public.t2_tr_reys_bekor_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; r public.t2_tr_reys; v_ver integer := public._t2_tr_son(p_data, 'versiya')::integer;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'logistics.dispatch');
  v_t := public._t2_tr_takror(p_kompaniya_id, p_operation_id, 'bekor'); if v_t is not null then return v_t; end if;
  select * into r from public.t2_tr_reys where id = public._t2_tr_son(p_data, 'id')::bigint and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.versiya is distinct from v_ver then return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT'); end if;
  if r.holat not in ('reja', 'yolda', 'yetkazildi') then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI', 'holat', r.holat); end if;
  if public._t2_tr_matn(p_data, 'sabab', 500) is null then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  update public.t2_tr_reys set holat = 'bekor', bekor_sabab = public._t2_tr_matn(p_data, 'sabab', 500), versiya = versiya + 1, yangilandi = now() where id = r.id;
  return public._t2_tr_saqla_op(p_kompaniya_id, p_operation_id, 'bekor', jsonb_build_object('ok', true, 'id', r.id, 'versiya', r.versiya + 1));
end $$;

-- Yopilgan reys tannarxini obyekt xarajatiga o'tkazish: FAQAT mavjud t2_xarajat_kirit_v1 orqali (financial.write; МАШ kategoriyasi, QQS siz).
create or replace function public.t2_tr_xarajat_otkaz_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; r public.t2_tr_reys; v_row record; v_res jsonb; v_op uuid; v_soni int := 0;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  v_t := public._t2_tr_takror(p_kompaniya_id, p_operation_id, 'otkaz'); if v_t is not null then return v_t; end if;
  select * into r from public.t2_tr_reys where id = public._t2_tr_son(p_data, 'id')::bigint and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.holat <> 'yopildi' then return jsonb_build_object('ok', false, 'code', 'REYS_YOPILMAGAN'); end if;
  if not coalesce((r.tannarx ->> 'toliq')::boolean, false) and not coalesce((p_data ->> 'toliq_emas_ham')::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 'TANNARX_TOLIQ_EMAS', 'yetishmaydi', r.tannarx -> 'yetishmaydi');
  end if;
  for v_row in select * from public.t2_tr_taqsim where reys_id = r.id and holat = 'hisoblangan' and summa_qqs_siz <> 0 order by id loop
    -- Deterministik operation_id: bir reys+obyekt ikki marta o'tmaydi.
    v_op := md5('tr-otkaz:' || p_kompaniya_id || ':' || r.id || ':' || v_row.obyekt_id)::uuid;
    v_res := public.t2_xarajat_kirit_v1(p_kompaniya_id, p_actor_id, v_row.obyekt_id, null, r.sana, 'МАШ', v_row.summa_qqs_siz,
      'transport:' || r.raqam, 'Transport reysi ' || r.raqam || ' (QQS siz, ulush ' || round(v_row.ulush * 100, 2) || '%)', v_op);
    if coalesce((v_res ->> 'ok')::boolean, false) then
      update public.t2_tr_taqsim set holat = 'otkazilgan', xarajat_id = (v_res ->> 'xarajat_id')::bigint where id = v_row.id;
      v_soni := v_soni + 1;
    else
      raise exception 'XARAJAT_OTKAZ_XATO:%', coalesce(v_res ->> 'code', 'noma''lum') using errcode = 'P0001';
    end if;
  end loop;
  return public._t2_tr_saqla_op(p_kompaniya_id, p_operation_id, 'otkaz', jsonb_build_object('ok', true, 'id', r.id, 'otkazildi', v_soni));
end $$;

-- 7. O'QISH (stable). bolim: park | sozlama | joylar | reyslar | reys | bugun | kpi
create or replace function public.t2_transport_ol_v1(p_kompaniya_id bigint, p_actor_id bigint, p_bolim text, p_filtr jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_dan date; v_gacha date; v_disp boolean; v_res jsonb; v_id bigint; v_hol text; v_lim int;
  v_kunlar int;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  v_disp := public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'logistics.dispatch');
  if p_bolim = 'bugun' then
    if not (v_disp or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'logistics.trip') or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'logistics.read')) then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  elsif not (v_disp or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'logistics.read') or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'machinery.read')) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  v_dan := coalesce(public._t2_tr_sana(coalesce(p_filtr, '{}'::jsonb), 'dan'), date_trunc('month', current_date)::date);
  v_gacha := coalesce(public._t2_tr_sana(coalesce(p_filtr, '{}'::jsonb), 'gacha'), current_date);
  p_filtr := coalesce(p_filtr, '{}'::jsonb);

  if p_bolim = 'park' then
    return jsonb_build_object('ok', true, 'bolim', 'park',
      'mashinalar', coalesce((select jsonb_agg(to_jsonb(m) order by m.nomi) from public.t2_tr_mashina m where m.kompaniya_id = p_kompaniya_id), '[]'::jsonb),
      'haydovchilar', coalesce((select jsonb_agg(to_jsonb(h) order by h.ism) from public.t2_tr_haydovchi h where h.kompaniya_id = p_kompaniya_id), '[]'::jsonb),
      'hujjatlar', coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object('qolgan_kun', d.muddat - current_date,
          'signal', case when d.muddat < current_date then 'otgan' when d.muddat - current_date <= 30 then 'yaqin' else 'ok' end) order by d.muddat)
          from public.t2_tr_hujjat d where d.kompaniya_id = p_kompaniya_id and d.holat = 'faol'), '[]'::jsonb));
  elsif p_bolim = 'sozlama' then
    return jsonb_build_object('ok', true, 'bolim', 'sozlama',
      'tariflar', coalesce((select jsonb_agg(to_jsonb(t) order by t.nom) from public.t2_tr_tarif t where t.kompaniya_id = p_kompaniya_id), '[]'::jsonb),
      'yoqilgi_narxlari', coalesce((select jsonb_agg(to_jsonb(n) order by n.yoqilgi_turi, n.sana desc) from (select * from public.t2_tr_yoqilgi_narx where kompaniya_id = p_kompaniya_id order by sana desc limit 200) n), '[]'::jsonb));
  elsif p_bolim = 'joylar' then
    return jsonb_build_object('ok', true, 'bolim', 'joylar',
      'obyektlar', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom, 'lat', o.lat, 'lng', o.lng) order by o.nom) from public.t2_obyekt o where o.kompaniya_id = p_kompaniya_id), '[]'::jsonb));
  elsif p_bolim in ('reyslar', 'bugun', 'reys') then
    v_lim := least(greatest(coalesce(public._t2_tr_son(p_filtr, 'limit')::int, 300), 1), 500);
    v_id := public._t2_tr_son(p_filtr, 'id')::bigint; v_hol := public._t2_tr_matn(p_filtr, 'holat', 12);
    if p_bolim = 'bugun' then v_dan := coalesce(public._t2_tr_sana(p_filtr, 'sana'), current_date); v_gacha := v_dan; end if;
    return jsonb_build_object('ok', true, 'bolim', p_bolim, 'reyslar', coalesce((
      select jsonb_agg(x order by x.sana desc, x.id desc) from (
        select r.id, r.raqam, r.holat, r.sana, r.versiya, r.mashina_id, m.nomi as mashina_nomi, m.davlat_raqami, r.haydovchi_id, h.ism as haydovchi_ism, r.buyurtmachi_turi, r.kontragent_id, r.mijoz_nom,
          r.talab_turi, r.talab_ref, r.tarif_id, r.reja_km, r.reja_daqiqa, r.marshrut_manba, r.km_boshi, r.km_oxiri, r.moto_boshi, r.moto_oxiri, r.fakt_km, r.bosh_km, r.ish_soat, r.boshlandi, r.tugadi,
          r.kutish_daqiqa, r.yoqilgi_sarfi_l, r.yoqilgi_quyildi_l, r.yoqilgi_narx_fakt, r.norma_koef, r.yol_haqi, r.boshqa_xarajat, r.boshqa_izoh, r.narx_qqs_siz, r.qqs_foiz, r.bekor_sabab, r.izoh,
          case when r.holat = 'yopildi' then r.tannarx when r.holat in ('yetkazildi', 'yolda', 'reja') then public._t2_tr_tannarx_v1(r.id) else null end as tannarx,
          coalesce((select jsonb_agg(to_jsonb(b) - 'reys_id' - 'kompaniya_id' order by b.tartib) from public.t2_tr_bekat b where b.reys_id = r.id), '[]'::jsonb) as bekatlar,
          coalesce((select jsonb_agg(to_jsonb(y) - 'reys_id' - 'kompaniya_id' order by y.id) from public.t2_tr_yuk y where y.reys_id = r.id), '[]'::jsonb) as yuklar,
          coalesce((select jsonb_agg(to_jsonb(q) - 'reys_id' - 'kompaniya_id' order by q.obyekt_id) from public.t2_tr_taqsim q where q.reys_id = r.id), '[]'::jsonb) as taqsimot
        from public.t2_tr_reys r join public.t2_tr_mashina m on m.id = r.mashina_id left join public.t2_tr_haydovchi h on h.id = r.haydovchi_id
        where r.kompaniya_id = p_kompaniya_id and (v_id is null or r.id = v_id) and r.sana between case when v_id is null then v_dan else date '1900-01-01' end and case when v_id is null then v_gacha else date '2999-12-31' end
          and (v_hol is null or r.holat = v_hol)
          and (public._t2_tr_son(p_filtr, 'mashina_id') is null or r.mashina_id = public._t2_tr_son(p_filtr, 'mashina_id')::bigint)
          and (public._t2_tr_son(p_filtr, 'haydovchi_id') is null or r.haydovchi_id = public._t2_tr_son(p_filtr, 'haydovchi_id')::bigint)
          and (p_bolim <> 'bugun' or v_disp or h.foydalanuvchi_id = p_actor_id)
        order by r.sana desc, r.id desc limit v_lim) x), '[]'::jsonb));
  elsif p_bolim = 'kpi' then
    v_kunlar := greatest(1, (v_gacha - v_dan) + 1);
    with t as (
      select r.*, m.nomi as mashina_nomi, h.ism as haydovchi_ism,
        case when r.holat = 'yopildi' then r.tannarx else public._t2_tr_tannarx_v1(r.id) end as tn,
        (select sum(ogirlik_t) from public.t2_tr_yuk y where y.reys_id = r.id) as yuk_t,
        (select nom from public.t2_tr_bekat b where b.reys_id = r.id order by tartib limit 1) as dan_nom,
        (select nom from public.t2_tr_bekat b where b.reys_id = r.id order by tartib desc limit 1) as gacha_nom
      from public.t2_tr_reys r join public.t2_tr_mashina m on m.id = r.mashina_id left join public.t2_tr_haydovchi h on h.id = r.haydovchi_id
      where r.kompaniya_id = p_kompaniya_id and r.sana between v_dan and v_gacha and r.holat in ('yetkazildi', 'yopildi')
    ), s as (
      select t.*, (tn ->> 'km')::numeric as km, (tn ->> 'jami')::numeric as jami, (tn ->> 'toliq')::boolean as toliq,
        (tn -> 'yoqilgi' ->> 'ogish_foiz')::numeric as ogish, (tn -> 'yoqilgi' ->> 'norma_l')::numeric as norma_l, (tn -> 'yoqilgi' ->> 'fakt_l')::numeric as fakt_l,
        case when yuk_t is not null and (tn ->> 'km') is not null then yuk_t * (tn ->> 'km')::numeric end as tonna_km
      from t
    ), agg as (
      select 'jami'::text as guruh, null::text as kalit, null::text as nom, count(*) as reys, sum(km) as km, sum(bosh_km) filter (where km is not null and bosh_km is not null) as bosh_km,
        sum(km) filter (where bosh_km is not null) as km_bosh_bilan, sum(jami) as xarajat, sum(narx_qqs_siz) as daromad_qqs_siz,
        sum(narx_qqs_siz * (1 + qqs_foiz / 100.0)) filter (where narx_qqs_siz is not null) as daromad_qqs_bilan,
        sum(narx_qqs_siz - jami) filter (where narx_qqs_siz is not null) as foyda,
        sum(jami) filter (where narx_qqs_siz is not null) as xarajat_daromadli, sum(tonna_km) as tonna_km, sum(jami) filter (where tonna_km is not null) as xarajat_tonna_km,
        sum(fakt_l) filter (where fakt_l is not null and norma_l is not null) as fakt_l, sum(norma_l) filter (where fakt_l is not null and norma_l is not null) as norma_l,
        count(*) filter (where not coalesce(toliq, false)) as toliq_emas, count(*) filter (where narx_qqs_siz is null) as narxsiz, sum(yuk_t) as yuk_t
      from s
      union all
      select 'mashina', mashina_id::text, max(mashina_nomi), count(*), sum(km), sum(bosh_km) filter (where km is not null and bosh_km is not null), sum(km) filter (where bosh_km is not null), sum(jami), sum(narx_qqs_siz),
        sum(narx_qqs_siz * (1 + qqs_foiz / 100.0)) filter (where narx_qqs_siz is not null), sum(narx_qqs_siz - jami) filter (where narx_qqs_siz is not null), sum(jami) filter (where narx_qqs_siz is not null),
        sum(tonna_km), sum(jami) filter (where tonna_km is not null), sum(fakt_l) filter (where fakt_l is not null and norma_l is not null), sum(norma_l) filter (where fakt_l is not null and norma_l is not null),
        count(*) filter (where not coalesce(toliq, false)), count(*) filter (where narx_qqs_siz is null), sum(yuk_t)
      from s group by mashina_id
      union all
      select 'haydovchi', haydovchi_id::text, max(haydovchi_ism), count(*), sum(km), sum(bosh_km) filter (where km is not null and bosh_km is not null), sum(km) filter (where bosh_km is not null), sum(jami), sum(narx_qqs_siz),
        sum(narx_qqs_siz * (1 + qqs_foiz / 100.0)) filter (where narx_qqs_siz is not null), sum(narx_qqs_siz - jami) filter (where narx_qqs_siz is not null), sum(jami) filter (where narx_qqs_siz is not null),
        sum(tonna_km), sum(jami) filter (where tonna_km is not null), sum(fakt_l) filter (where fakt_l is not null and norma_l is not null), sum(norma_l) filter (where fakt_l is not null and norma_l is not null),
        count(*) filter (where not coalesce(toliq, false)), count(*) filter (where narx_qqs_siz is null), sum(yuk_t)
      from s where haydovchi_id is not null group by haydovchi_id
      union all
      select 'marshrut', coalesce(dan_nom, '?') || ' → ' || coalesce(gacha_nom, '?'), coalesce(dan_nom, '?') || ' → ' || coalesce(gacha_nom, '?'), count(*), sum(km), sum(bosh_km) filter (where km is not null and bosh_km is not null), sum(km) filter (where bosh_km is not null), sum(jami), sum(narx_qqs_siz),
        sum(narx_qqs_siz * (1 + qqs_foiz / 100.0)) filter (where narx_qqs_siz is not null), sum(narx_qqs_siz - jami) filter (where narx_qqs_siz is not null), sum(jami) filter (where narx_qqs_siz is not null),
        sum(tonna_km), sum(jami) filter (where tonna_km is not null), sum(fakt_l) filter (where fakt_l is not null and norma_l is not null), sum(norma_l) filter (where fakt_l is not null and norma_l is not null),
        count(*) filter (where not coalesce(toliq, false)), count(*) filter (where narx_qqs_siz is null), sum(yuk_t)
      from s group by dan_nom, gacha_nom
    )
    select jsonb_build_object('ok', true, 'bolim', 'kpi', 'dan', v_dan, 'gacha', v_gacha, 'kunlar', v_kunlar,
      'qqs_izoh', 'Xarajat — ichki tannarx QQS siz; daromad QQS siz va QQS bilan alohida. Noma''lum — null (kiritilmagan).',
      'qatorlar', coalesce(jsonb_agg(jsonb_build_object('guruh', guruh, 'kalit', kalit, 'nom', nom, 'reys', reys, 'km', km, 'bosh_km', bosh_km, 'km_bosh_bilan', km_bosh_bilan,
        'xarajat', xarajat, 'daromad_qqs_siz', daromad_qqs_siz, 'daromad_qqs_bilan', round(daromad_qqs_bilan, 2), 'foyda', foyda, 'xarajat_daromadli', xarajat_daromadli,
        'tonna_km', tonna_km, 'xarajat_tonna_km', xarajat_tonna_km, 'fakt_l', fakt_l, 'norma_l', norma_l, 'yuk_t', yuk_t, 'toliq_emas', toliq_emas, 'narxsiz', narxsiz)), '[]'::jsonb))
    into v_res from agg;
    -- Mashina bandligi: reys bo'lgan kunlar / davr kunlari (faol mashinalar uchun).
    v_res := v_res || jsonb_build_object(
      'bandlik', coalesce((select jsonb_agg(jsonb_build_object('mashina_id', m.id, 'nom', m.nomi, 'band_kun', coalesce(k.kun, 0), 'foiz', round(coalesce(k.kun, 0)::numeric / v_kunlar * 100, 1)) order by m.nomi)
          from public.t2_tr_mashina m left join (select mashina_id, count(distinct sana) as kun from public.t2_tr_reys where kompaniya_id = p_kompaniya_id and sana between v_dan and v_gacha and holat in ('yolda', 'yetkazildi', 'yopildi') group by mashina_id) k on k.mashina_id = m.id
          where m.kompaniya_id = p_kompaniya_id and m.holat = 'faol'), '[]'::jsonb),
      'holatlar', coalesce((select jsonb_object_agg(holat, soni) from (select holat, count(*) as soni from public.t2_tr_reys where kompaniya_id = p_kompaniya_id and sana between v_dan and v_gacha group by holat) z), '{}'::jsonb),
      'hujjat_signal', jsonb_build_object(
        'otgan', (select count(*) from public.t2_tr_hujjat where kompaniya_id = p_kompaniya_id and holat = 'faol' and muddat < current_date),
        'yaqin', (select count(*) from public.t2_tr_hujjat where kompaniya_id = p_kompaniya_id and holat = 'faol' and muddat between current_date and current_date + 30)));
    return v_res;
  end if;
  return jsonb_build_object('ok', false, 'code', 'BOLIM_INVALID');
end $$;

do $grant$ declare f text; begin
  foreach f in array array[
    'public._t2_tr_son(jsonb,text)', 'public._t2_tr_matn(jsonb,text,integer)', 'public._t2_tr_sana(jsonb,text)', 'public._t2_tr_vaqt(jsonb,text)',
    'public._t2_tr_takror(bigint,uuid,text)', 'public._t2_tr_saqla_op(bigint,uuid,text,jsonb)', 'public._t2_tr_yoqilgi_narx(bigint,text,date)', 'public._t2_tr_tannarx_v1(bigint)',
    'public.t2_tr_mashina_saqla_v1(bigint,bigint,uuid,jsonb)', 'public.t2_tr_haydovchi_saqla_v1(bigint,bigint,uuid,jsonb)', 'public.t2_tr_hujjat_saqla_v1(bigint,bigint,uuid,jsonb)',
    'public.t2_tr_yoqilgi_narx_saqla_v1(bigint,bigint,uuid,jsonb)', 'public.t2_tr_tarif_saqla_v1(bigint,bigint,uuid,jsonb)', 'public.t2_tr_reys_saqla_v1(bigint,bigint,uuid,jsonb)',
    'public.t2_tr_reys_yurish_v1(bigint,bigint,uuid,jsonb)', 'public.t2_tr_reys_yop_v1(bigint,bigint,uuid,jsonb)', 'public.t2_tr_reys_bekor_v1(bigint,bigint,uuid,jsonb)',
    'public.t2_tr_xarajat_otkaz_v1(bigint,bigint,uuid,jsonb)', 'public.t2_transport_ol_v1(bigint,bigint,text,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $grant$;

commit;
