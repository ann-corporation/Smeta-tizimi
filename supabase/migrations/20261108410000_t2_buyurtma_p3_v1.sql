-- P3 BUYURTMA (E7 §3) — t2_buyurtma + t2_buyurtma_qator + RPC lar. Egasi: tomon-yetkazuvchi.
-- Kontrakt: E2 §5 (RLS+SECURITY DEFINER), E3 §4.2–4.3 (yuklashga_tayyor -> t2_yuk_yarat_v1), E7 §3.1–3.2.
-- ALDINDAN KERAK: F1 (20261108000000, 000100: t2_outbox_yoz, t2_primitiv_tur/_dalil, t2_bosqich_katalog) va ruxsat fayli 20261108010000
-- (procurement.*/supply.*/warehouse.receive capability) — SHULARDAN KEYIN qo'llang.
-- Hand-off (E3 §4.3): yuklashga_tayyor da AVVAL buyurtma yangilanadi, KEYIN logistikaning ichki `_t2_yuk_buyurtmadan_v1(actor, buyurtma_id, op)`
-- (F3b) chaqiriladi; ok=false -> butun o'tish bekor. Funksiya yo'q bo'lsa faqat outbox `buyurtma.yuklashga_tayyor` (E6 F3a mezoni).
--
-- Egalik: buyurtma XARIDOR tenantida (kompaniya_id). Yetkazuvchi (ijrochi_kompaniya_id) — faol aloqa (aloqa_id) orqali ko'radi
-- va faqat o'z bosqichlarini o'tkazadi. Boshqa tenant jadvaliga to'g'ridan UPDATE yo'q: faqat shu RPC lar.
-- Pul: narx NDS siz (QQS alohida, ma'lumot uchun); NULL = noma'lum, 0 emas.
--
-- Hayot sikli (holat): yuborildi -> qabul_qilindi | rad -> bajarilmoqda -> tayyor -> topshirildi
--                      -> qabul_qilindi_yakuniy | qisman | nizo ; bekor.
-- Turga xos bosqich (material): tayyorlanmoqda(bajarilmoqda) -> yuklashga_tayyor, yolda(tayyor) -> yetkazildi(topshirildi)
--                      -> hisob_faktura (qabul_qilindi_yakuniy dan keyin, yetkazuvchi). To'lov holati — buxgalteriya domeni (read-model).
-- Foydalanuvchi tilidagi nomlar: tasdiqlandi=qabul_qilindi, tayyorlanmoqda=bajarilmoqda/tayyorlanmoqda, yetkazildi=topshirildi,
--                      qabul qilindi=qabul_qilindi_yakuniy.

do $$ begin
  if to_regprocedure('public.t2_outbox_yoz(bigint,text,text,bigint,jsonb,bigint,uuid,bigint,bigint,bigint[],bigint[])') is null then
    raise exception 'F1 kerak: public.t2_outbox_yoz topilmadi (E3 §6). Avval F1 migratsiyasini (20261108000000, 000100) qo''llang.';
  end if;
  if to_regprocedure('public.t2_permission_allowed_v2(bigint,bigint,text)') is null or to_regprocedure('public._t2_obyekt_doira_ok(bigint,bigint,bigint)') is null then
    raise exception 'F1/ruxsat kerak: t2_permission_allowed_v2 yoki _t2_obyekt_doira_ok topilmadi. 20261108010000 (capability katalogi) dan KEYIN qo''llang.';
  end if;
end $$;

-- ───────────────────────── 1. Jadvallar ─────────────────────────
create table if not exists public.t2_buyurtma (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),            -- XARIDOR (egasi tenant)
  ijrochi_kompaniya_id bigint not null references public.t2_kompaniya(id),    -- yetkazuvchi / bajaruvchi
  aloqa_id bigint not null references public.t2_tomon_aloqa(id),
  tur text not null check (tur ~ '^[a-z_]{2,40}$'),
  obyekt_id bigint references public.t2_obyekt(id),
  rfq_id bigint references public.t2_birja_rfq(id),
  taklif_id bigint references public.t2_birja_taklif(id),
  holat text not null default 'yuborildi' check (holat in ('yuborildi','qabul_qilindi','rad','bajarilmoqda','tayyor','topshirildi','qabul_qilindi_yakuniy','qisman','nizo','bekor')),
  bosqich text check (bosqich is null or bosqich ~ '^[a-z_]{2,40}$'),
  summa_nds_siz numeric(20,2) check (summa_nds_siz is null or summa_nds_siz >= 0),   -- qatorlar yig'indisi; biror qator narxsiz bo'lsa NULL
  yetkazish_narx numeric(20,2) check (yetkazish_narx is null or yetkazish_narx >= 0),
  qqs_foiz numeric(5,2) check (qqs_foiz is null or qqs_foiz between 0 and 100),
  shart jsonb not null default '{}'::jsonb check (octet_length(shart::text) <= 4096),   -- yetkazish: manzil, lat, lng, oyna_dan, oyna_gacha, qabul_qiluvchi_actor_id, tolovchi, transport_turi
  olish jsonb not null default '{}'::jsonb check (octet_length(olish::text) <= 4096),   -- yetkazuvchi ombori: ombor_nomi, manzil, lat, lng, aloqa_tel, tayyor_dan, tayyor_gacha
  meta jsonb not null default '{}'::jsonb check (octet_length(meta::text) <= 2048),
  faktura_id bigint,                                                                -- t2_faktura (hisob-faktura bosqichi)
  izoh text check (izoh is null or length(izoh) <= 2000),
  versiya integer not null default 1,
  operation_id uuid not null,
  oxirgi_operation_id uuid,                                                         -- oxirgi o'tish (takror chaqiruvni ushlash)
  yaratdi_actor_id bigint not null references public.t2_foydalanuvchi(id),
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  unique (kompaniya_id, operation_id),
  check (kompaniya_id <> ijrochi_kompaniya_id)
);
create index if not exists t2_buyurtma_k_o_idx on public.t2_buyurtma (kompaniya_id, obyekt_id, id desc);
create index if not exists t2_buyurtma_ijrochi_idx on public.t2_buyurtma (ijrochi_kompaniya_id, id desc);
create index if not exists t2_buyurtma_taklif_idx on public.t2_buyurtma (taklif_id) where taklif_id is not null;
alter table public.t2_buyurtma enable row level security;
revoke all on table public.t2_buyurtma from anon, authenticated;

create table if not exists public.t2_buyurtma_qator (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),            -- xaridor (egasi)
  buyurtma_id bigint not null references public.t2_buyurtma(id),
  qator_no integer not null check (qator_no > 0),
  nom text not null check (length(btrim(nom)) between 1 and 300),
  birlik text not null check (length(btrim(birlik)) between 1 and 40),
  miqdor numeric(20,4) not null check (miqdor > 0),
  narx numeric(20,2) check (narx is null or narx >= 0),                       -- birlik narxi NDS siz; NULL = noma'lum
  muddat_kun integer check (muddat_kun is null or muddat_kun between 0 and 3650),
  resurs_kodi text check (resurs_kodi is null or length(resurs_kodi) <= 80),
  zayavka_id bigint references public.t2_erp_taminot(id),
  rfq_qator_id bigint references public.t2_birja_rfq_qator(id),
  taklif_qator_id bigint references public.t2_birja_taklif_qator(id),
  qabul_miqdor numeric(20,4) check (qabul_miqdor is null or qabul_miqdor >= 0),
  qabul_holat text check (qabul_holat is null or qabul_holat in ('butun','shikast','kam')),
  izoh text check (izoh is null or length(izoh) <= 1000),
  unique (buyurtma_id, qator_no)
);
create index if not exists t2_buyurtma_qator_k_idx on public.t2_buyurtma_qator (kompaniya_id, buyurtma_id);
alter table public.t2_buyurtma_qator enable row level security;
revoke all on table public.t2_buyurtma_qator from anon, authenticated;

-- Bosqich katalogi (F1): material bosqichlari F1 da bor (tayyorlanmoqda, yuklashga_tayyor, yolda, yetkazildi); bu yerdan faqat hisob_faktura qo'shiladi.
insert into public.t2_bosqich_katalog (primitiv, tur, kalit, nom, nom_ru, kim, tartib, faol)
values ('buyurtma', 'material', 'hisob_faktura', 'Hisob-faktura', 'Счёт-фактура', 'ijrochi', 50, true)
on conflict do nothing;

-- ───────────────────────── 2. Yordamchilar ─────────────────────────
-- Ruxsat (E2 §3.1; 20261108010000 dan KEYIN qo'llanadi): amal -> capability (t2_permission_allowed_v2: a'zolik + rol + qo'shimcha ruxsat).
--   xarid_yoz -> procurement.write | xarid_tasdiq -> procurement.approve | taklif -> supply.offer | bajarish -> supply.fulfil
--   qabul -> warehouse.receive YOKI procurement.write | korish -> procurement.read YOKI supply.offer YOKI supply.fulfil
create or replace function public._t2_yet_azo(p_actor_id bigint, p_kompaniya_id bigint, p_amal text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_ok boolean;
begin
  v_ok := case p_amal
    when 'xarid_yoz'    then public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'procurement.write')
    when 'xarid_tasdiq' then public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'procurement.approve')
    when 'taklif'       then public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'supply.offer')
    when 'bajarish'     then public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'supply.fulfil')
    when 'qabul'        then public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'warehouse.receive')
                          or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'procurement.write')
    when 'korish'       then public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'procurement.read')
                          or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'supply.offer')
                          or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'supply.fulfil')
    else false end;
  if not coalesce(v_ok, false) then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
end $$;

-- Ikki kompaniya orasidagi faol aloqa (kontakt yoki shartnoma) id si; yo'q bo'lsa NULL.
-- 'obyekt:%' turidagi aloqa (havola orqali ulashish, mehmon) buyurtma/tender uchun aloqa EMAS.
create or replace function public._t2_yet_aloqa_faol(p_a bigint, p_b bigint) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id from public.t2_tomon_aloqa a
   where a.holat = 'faol' and a.turi not like 'obyekt:%'
     and ((a.taklif_kompaniya_id = p_a and a.qabul_kompaniya_id = p_b) or (a.taklif_kompaniya_id = p_b and a.qabul_kompaniya_id = p_a))
   order by a.id limit 1
$$;

create or replace function public._t2_yet_hodisa(p_kompaniya_id bigint, p_mavzu text, p_jadval text, p_id bigint, p_payload jsonb,
                                                 p_actor bigint, p_op uuid, p_obyekt bigint, p_aloqa bigint, p_qabul bigint[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_outbox_yoz(p_kompaniya_id, p_mavzu, p_jadval, p_id, p_payload, p_actor, p_op, p_obyekt, p_aloqa, coalesce(p_qabul, '{}'), '{}');
end $$;

-- Tur tekshiruvi: F1 katalogi — AYNAN shu primitiv uchun (topshiriq turi 'ish' buyurtmaga o'tmasin).
create or replace function public._t2_yet_tur_ok(p_primitiv text, p_tur text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.t2_primitiv_tur t where t.primitiv = p_primitiv and t.kalit = p_tur and t.faol)
$$;

-- Bosqich -> holat xaritasi (statik; katalog faqat nom/tartib uchun).
create or replace function public._t2_buyurtma_bosqich_holat(p_bosqich text) returns text
language sql immutable as $$
  select case p_bosqich
    when 'tayyorlanmoqda' then 'bajarilmoqda'
    when 'yuklashga_tayyor' then 'tayyor'
    when 'yolda' then 'tayyor'
    when 'yetkazildi' then 'topshirildi'
    when 'hisob_faktura' then 'qabul_qilindi_yakuniy'
  end
$$;

-- Holat o'tishi: kim (xaridor|ijrochi) qaysi holatdan qaysisiga.
create or replace function public._t2_buyurtma_otish_ruxsat(p_dan text, p_ga text, p_tomon text) returns boolean
language sql immutable as $$
  select (p_dan, p_ga, p_tomon) in (
    ('yuborildi','qabul_qilindi','ijrochi'), ('yuborildi','rad','ijrochi'), ('yuborildi','bekor','xaridor'),
    ('qabul_qilindi','bajarilmoqda','ijrochi'), ('qabul_qilindi','bekor','xaridor'),
    ('bajarilmoqda','tayyor','ijrochi'), ('bajarilmoqda','bekor','xaridor'),
    ('tayyor','tayyor','ijrochi'), ('tayyor','topshirildi','ijrochi'),
    ('topshirildi','qabul_qilindi_yakuniy','xaridor'), ('topshirildi','qisman','xaridor'), ('topshirildi','nizo','xaridor'),
    ('qisman','qabul_qilindi_yakuniy','xaridor'), ('nizo','qabul_qilindi_yakuniy','xaridor'),
    ('qabul_qilindi_yakuniy','qabul_qilindi_yakuniy','ijrochi')   -- faqat bosqich: hisob_faktura
  )
$$;

-- Dalil hujjatlari (foto, TTN, sertifikat) — F1 `t2_primitiv_dalil`. Hujjat AYNAN biriktiruvchi tenantniki bo'lishi shart
-- (aks holda begona hujjat id sini biriktirib qarshi tomonga ochib yuborish mumkin) -> 'DALIL_BEGONA'.
create or replace function public._t2_yet_dalil_tekshir(p_kompaniya_id bigint, p_hujjatlar bigint[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(p_hujjatlar, '{}') = '{}' or (
    select count(*) from public.t2_document_registry d where d.id = any (p_hujjatlar) and d.kompaniya_id = p_kompaniya_id
  ) = (select count(distinct x) from unnest(p_hujjatlar) x)
$$;

create or replace function public._t2_yet_dalil_yoz(p_kompaniya_id bigint, p_actor_id bigint, p_primitiv text, p_id bigint, p_hujjatlar bigint[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare h bigint; n integer := 0;
begin
  if p_primitiv not in ('buyurtma', 'tender', 'tender_taklif') then return jsonb_build_object('ok', false, 'code', 'DALIL_PRIMITIV'); end if;
  if p_hujjatlar is null or cardinality(p_hujjatlar) = 0 then return jsonb_build_object('ok', true, 'soni', 0); end if;
  if not public._t2_yet_dalil_tekshir(p_kompaniya_id, p_hujjatlar) then return jsonb_build_object('ok', false, 'code', 'DALIL_BEGONA'); end if;
  foreach h in array p_hujjatlar loop
    insert into public.t2_primitiv_dalil (kompaniya_id, primitiv, primitiv_id, hujjat_id, biriktirdi_actor_id)
    values (p_kompaniya_id, p_primitiv, p_id, h, p_actor_id) on conflict do nothing;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'soni', n);
end $$;
-- Buyurtma yaratish yadrosi (kanonik t2_buyurtma_yarat_v1 va t2_tender_golib_v1 ishlatadi). Ruxsat chaqiruvchida tekshirilgan.
-- p_qatorlar: [{nom, birlik, miqdor, narx|null, muddat_kun|null, resurs_kodi|null, zayavka_id|null, rfq_qator_id|null, taklif_qator_id|null, izoh|null}]
create or replace function public._t2_buyurtma_yarat_ichki(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_tur text, p_ijrochi bigint, p_aloqa_id bigint,
  p_rfq_id bigint, p_taklif_id bigint, p_obyekt_id bigint, p_qatorlar jsonb, p_shart jsonb, p_yetkazish_narx numeric, p_qqs numeric, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b public.t2_buyurtma; v_q jsonb; v_no integer := 0; v_summa numeric := 0; v_narxsiz boolean := false; v_narx numeric;
begin
  for v_q in select * from jsonb_array_elements(p_qatorlar) loop
    v_no := v_no + 1;
    v_narx := nullif(v_q->>'narx', '')::numeric;
    if v_narx is null then v_narxsiz := true; else v_summa := v_summa + v_narx * (v_q->>'miqdor')::numeric; end if;
  end loop;
  insert into public.t2_buyurtma (kompaniya_id, ijrochi_kompaniya_id, aloqa_id, tur, obyekt_id, rfq_id, taklif_id, holat, summa_nds_siz,
                                  yetkazish_narx, qqs_foiz, shart, izoh, operation_id, yaratdi_actor_id)
  values (p_kompaniya_id, p_ijrochi, p_aloqa_id, p_tur, p_obyekt_id, p_rfq_id, p_taklif_id, 'yuborildi',
          case when v_narxsiz or v_no = 0 then null else round(v_summa, 2) end,
          p_yetkazish_narx, p_qqs, coalesce(p_shart, '{}'::jsonb), nullif(btrim(coalesce(p_izoh, '')), ''), p_operation_id, p_actor_id)
  returning * into v_b;
  v_no := 0;
  for v_q in select * from jsonb_array_elements(p_qatorlar) loop
    v_no := v_no + 1;
    insert into public.t2_buyurtma_qator (kompaniya_id, buyurtma_id, qator_no, nom, birlik, miqdor, narx, muddat_kun, resurs_kodi, zayavka_id, rfq_qator_id, taklif_qator_id, izoh)
    values (p_kompaniya_id, v_b.id, v_no, btrim(v_q->>'nom'), btrim(v_q->>'birlik'), (v_q->>'miqdor')::numeric, nullif(v_q->>'narx', '')::numeric,
            nullif(v_q->>'muddat_kun', '')::integer, nullif(v_q->>'resurs_kodi', ''), nullif(v_q->>'zayavka_id', '')::bigint,
            nullif(v_q->>'rfq_qator_id', '')::bigint, nullif(v_q->>'taklif_qator_id', '')::bigint, nullif(v_q->>'izoh', ''));
  end loop;
  perform public._t2_yet_hodisa(p_kompaniya_id, 'buyurtma.yuborildi', 't2_buyurtma', v_b.id,
            jsonb_build_object('tur', p_tur, 'ijrochi_kompaniya_id', p_ijrochi, 'qator_soni', v_no), p_actor_id, p_operation_id, p_obyekt_id, p_aloqa_id, array[p_ijrochi]);
  return jsonb_build_object('ok', true, 'id', v_b.id, 'versiya', v_b.versiya, 'holat', v_b.holat);
end $$;
revoke all on function public._t2_buyurtma_yarat_ichki(bigint,bigint,uuid,text,bigint,bigint,bigint,bigint,bigint,jsonb,jsonb,numeric,numeric,text) from public, anon, authenticated;

-- Qatorlar jsonb ni tekshirish (umumiy): massiv, 1..200 qator, nom/birlik/miqdor>0. Xato kodi yoki NULL.
create or replace function public._t2_yet_qator_xato(p_qatorlar jsonb) returns text
language plpgsql immutable as $$
declare v_q jsonb;
begin
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) not between 1 and 200 then return 'QATORLAR_NOTOGRI'; end if;
  for v_q in select * from jsonb_array_elements(p_qatorlar) loop
    if jsonb_typeof(v_q) <> 'object' then return 'QATORLAR_NOTOGRI'; end if;
    if length(btrim(coalesce(v_q->>'nom', ''))) not between 1 and 300 then return 'QATOR_NOM'; end if;
    if length(btrim(coalesce(v_q->>'birlik', ''))) not between 1 and 40 then return 'QATOR_BIRLIK'; end if;
    if coalesce(v_q->>'miqdor', '') !~ '^[0-9]+(\.[0-9]+)?$' or (v_q->>'miqdor')::numeric <= 0 then return 'QATOR_MIQDOR'; end if;
    if coalesce(v_q->>'narx', '') <> '' and (v_q->>'narx' !~ '^[0-9]+(\.[0-9]+)?$') then return 'QATOR_NARX'; end if;
  end loop;
  return null;
end $$;

-- ───────────────────────── 3. RPC lar ─────────────────────────
-- Yaratish (to'g'ridan yoki taklifdan). XARIDOR tenantida yoziladi.
create or replace function public.t2_buyurtma_yarat_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_tur text, p_ijrochi_kompaniya_id bigint, p_aloqa_id bigint,
  p_taklif_id bigint, p_obyekt_id bigint, p_qatorlar jsonb, p_shart jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old public.t2_buyurtma; v_aloqa bigint; v_rfq public.t2_birja_rfq; v_xato text; v_g jsonb;
        v_qat jsonb; v_ij bigint := p_ijrochi_kompaniya_id; v_tur text := p_tur; v_obyekt bigint := p_obyekt_id;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'xarid_yoz');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_old from public.t2_buyurtma where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'id', v_old.id, 'versiya', v_old.versiya); end if;
  if p_taklif_id is not null then
    -- Taklifdan: g'olib belgilash va buyurtma yaratish BITTA yo'l (t2_tender_golib_v1: qator band-lash, RFQ/taklif holati). Hamma qator, PTO ruxsati.
    select r.* into v_rfq from public.t2_birja_taklif t join public.t2_birja_rfq r on r.id = t.rfq_id where t.id = p_taklif_id and r.kompaniya_id = p_kompaniya_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
    v_g := public.t2_tender_golib_v1(p_actor_id, p_kompaniya_id, p_operation_id, v_rfq.id, v_rfq.versiya, p_taklif_id, null, p_shart);
    if not (v_g->>'ok')::boolean then return v_g; end if;
    return jsonb_build_object('ok', true, 'id', (v_g->>'buyurtma_id')::bigint, 'versiya', 1, 'holat', 'yuborildi', 'takror', coalesce((v_g->>'takror')::boolean, false));
  end if;
  v_qat := p_qatorlar;  if v_ij is null or v_ij = p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'IJROCHI_NOTOGRI'); end if;
  if not exists (select 1 from public.t2_kompaniya k where k.id = v_ij and k.faol) then return jsonb_build_object('ok', false, 'code', 'IJROCHI_NOTOGRI'); end if;
  if not public._t2_yet_tur_ok('buyurtma', v_tur) then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  v_xato := public._t2_yet_qator_xato(v_qat);
  if v_xato is not null then return jsonb_build_object('ok', false, 'code', v_xato); end if;
  if v_obyekt is not null and not exists (select 1 from public.t2_obyekt o where o.id = v_obyekt and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA');
  end if;
  if not (v_obyekt is null or public._t2_obyekt_doira_ok(p_actor_id, p_kompaniya_id, v_obyekt)) then return jsonb_build_object('ok', false, 'code', 'DOIRA_YOQ'); end if;
  -- Kompaniyalararo yozuv: faol aloqa majburiy (E7 §3.1). p_aloqa_id berilgan bo'lsa aynan shu aloqa faol va shu ikki tomon orasida bo'lishi kerak.
  if p_aloqa_id is not null then
    select a.id into v_aloqa from public.t2_tomon_aloqa a where a.id = p_aloqa_id and a.holat = 'faol' and a.turi not like 'obyekt:%'
       and ((a.taklif_kompaniya_id = p_kompaniya_id and a.qabul_kompaniya_id = v_ij) or (a.taklif_kompaniya_id = v_ij and a.qabul_kompaniya_id = p_kompaniya_id));
  else
    v_aloqa := public._t2_yet_aloqa_faol(p_kompaniya_id, v_ij);
  end if;
  if v_aloqa is null then return jsonb_build_object('ok', false, 'code', 'ALOQA_KERAK'); end if;
  return public._t2_buyurtma_yarat_ichki(p_actor_id, p_kompaniya_id, p_operation_id, v_tur, v_ij, v_aloqa, null, null, v_obyekt, v_qat,
                                         p_shart, null, null, null);
end $$;

-- Yetkazuvchi o'z omborini (olish nuqtasi) yozadi — yuklashga_tayyor dan OLDIN. lat/lng noma'lum bo'lsa NULL (soxta koordinata yo'q).
create or replace function public.t2_buyurtma_olish_yoz_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_buyurtma_id bigint, p_kutilgan_versiya integer, p_olish jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b public.t2_buyurtma; v_o jsonb := coalesce(p_olish, '{}'::jsonb); v_lat numeric; v_lng numeric; v_n integer;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'bajarish');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_b from public.t2_buyurtma where id = p_buyurtma_id and ijrochi_kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_b.oxirgi_operation_id = p_operation_id then return jsonb_build_object('ok', true, 'takror', true, 'versiya', v_b.versiya); end if;
  if v_b.holat in ('topshirildi','qabul_qilindi_yakuniy','qisman','nizo','bekor','rad') then return jsonb_build_object('ok', false, 'code', 'HOLAT'); end if;
  if jsonb_typeof(v_o) <> 'object' then return jsonb_build_object('ok', false, 'code', 'OLISH_NOTOGRI'); end if;
  if nullif(v_o->>'lat', '') is not null or nullif(v_o->>'lng', '') is not null then
    if coalesce(v_o->>'lat', '') !~ '^-?[0-9]+(\.[0-9]+)?$' or coalesce(v_o->>'lng', '') !~ '^-?[0-9]+(\.[0-9]+)?$' then return jsonb_build_object('ok', false, 'code', 'KOORDINATA'); end if;
    v_lat := (v_o->>'lat')::numeric; v_lng := (v_o->>'lng')::numeric;
    if v_lat not between -90 and 90 or v_lng not between -180 and 180 then return jsonb_build_object('ok', false, 'code', 'KOORDINATA'); end if;
  end if;
  v_o := jsonb_strip_nulls(jsonb_build_object('ombor_nomi', left(v_o->>'ombor_nomi', 200), 'manzil', left(v_o->>'manzil', 300), 'lat', v_lat, 'lng', v_lng,
           'aloqa_tel', left(v_o->>'aloqa_tel', 40), 'tayyor_dan', v_o->>'tayyor_dan', 'tayyor_gacha', v_o->>'tayyor_gacha'));
  if v_o = '{}'::jsonb then return jsonb_build_object('ok', false, 'code', 'OLISH_NOTOGRI'); end if;
  update public.t2_buyurtma set olish = v_o, versiya = versiya + 1, yangilandi = now(), oxirgi_operation_id = p_operation_id
   where id = v_b.id and versiya = p_kutilgan_versiya;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI'); end if;
  return jsonb_build_object('ok', true, 'id', v_b.id, 'versiya', p_kutilgan_versiya + 1);
end $$;

-- Yagona o'tish yadrosi. p_tomon: aniqlangan tomon ('xaridor'|'ijrochi'); ruxsat chaqiruvchida tekshirilgan.
create or replace function public._t2_buyurtma_otish_ichki(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_buyurtma_id bigint, p_kutilgan_versiya integer,
  p_holat text, p_bosqich text, p_izoh text, p_hujjatlar bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_b public.t2_buyurtma; v_tomon text; v_ga text := p_holat; v_bosqich text := p_bosqich; v_n integer;
  v_yuk jsonb := null; v_yuk_kerak boolean := false; v_dalil jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_b from public.t2_buyurtma where id = p_buyurtma_id and (kompaniya_id = p_kompaniya_id or ijrochi_kompaniya_id = p_kompaniya_id) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;   -- mavjudligini oshkor qilmaydi
  v_tomon := case when v_b.kompaniya_id = p_kompaniya_id then 'xaridor' else 'ijrochi' end;
  if v_b.oxirgi_operation_id = p_operation_id then return jsonb_build_object('ok', true, 'takror', true, 'id', v_b.id, 'versiya', v_b.versiya, 'holat', v_b.holat); end if;
  if v_b.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_b.versiya); end if;
  if public._t2_yet_aloqa_faol(v_b.kompaniya_id, v_b.ijrochi_kompaniya_id) is null then return jsonb_build_object('ok', false, 'code', 'ALOQA_YOPIQ'); end if;
  -- rol
  if v_tomon = 'ijrochi' then perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'bajarish');
  elsif v_ga in ('qabul_qilindi_yakuniy','qisman','nizo') then perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'qabul');
  else perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'xarid_yoz'); end if;
  -- bosqich (material bosqichlari faqat tur=material)
  if v_bosqich is not null then
    if public._t2_buyurtma_bosqich_holat(v_bosqich) is null then return jsonb_build_object('ok', false, 'code', 'BOSQICH_NOTOGRI'); end if;
    if v_bosqich in ('yuklashga_tayyor','yolda','yetkazildi') and v_b.tur <> 'material' then return jsonb_build_object('ok', false, 'code', 'BOSQICH_TURGA_MOS_EMAS'); end if;
    if public._t2_buyurtma_bosqich_holat(v_bosqich) <> v_ga then return jsonb_build_object('ok', false, 'code', 'BOSQICH_HOLATGA_MOS_EMAS'); end if;
  else
    v_bosqich := case when v_ga = 'bajarilmoqda' then 'tayyorlanmoqda'
                      when v_ga = 'tayyor' and v_b.tur = 'material' then 'yuklashga_tayyor'
                      when v_ga = 'topshirildi' and v_b.tur = 'material' then 'yetkazildi' end;
  end if;
  if not public._t2_buyurtma_otish_ruxsat(v_b.holat, v_ga, v_tomon) then return jsonb_build_object('ok', false, 'code', 'OTISH_TAQIQ', 'dan', v_b.holat, 'ga', v_ga, 'tomon', v_tomon); end if;
  -- 'tayyor'->'tayyor' va 'qabul_qilindi_yakuniy'->o'zi faqat bosqich almashtirish: bosqich majburiy va yangi bo'lishi shart
  if v_b.holat = v_ga and (v_bosqich is null or v_bosqich is not distinct from v_b.bosqich) then return jsonb_build_object('ok', false, 'code', 'OTISH_TAQIQ', 'dan', v_b.holat, 'ga', v_ga, 'tomon', v_tomon); end if;
  if v_b.holat = 'qabul_qilindi_yakuniy' and v_bosqich is distinct from 'hisob_faktura' then return jsonb_build_object('ok', false, 'code', 'OTISH_TAQIQ'); end if;
  -- Dalil: hujjatlar AYNAN shu tenantniki bo'lishi shart (hech narsa yozilmasdan oldin tekshiriladi)
  if not public._t2_yet_dalil_tekshir(p_kompaniya_id, p_hujjatlar) then return jsonb_build_object('ok', false, 'code', 'DALIL_BEGONA'); end if;
  -- yuklashga_tayyor: olish nuqtasi shart (hand-off ma'lumoti)
  v_yuk_kerak := (v_bosqich = 'yuklashga_tayyor' and v_b.tur = 'material' and v_b.bosqich is distinct from 'yuklashga_tayyor');
  if v_yuk_kerak and v_b.olish = '{}'::jsonb then return jsonb_build_object('ok', false, 'code', 'OLISH_KERAK'); end if;
  -- AVVAL buyurtma yangilanadi, KEYIN logistika (E3 §4.3: logistika buyurtma/qatorlarni o'zi o'qiydi)
  update public.t2_buyurtma set holat = v_ga, bosqich = coalesce(v_bosqich, bosqich), versiya = versiya + 1, yangilandi = now(),
         oxirgi_operation_id = p_operation_id, izoh = coalesce(nullif(btrim(coalesce(p_izoh, '')), ''), izoh)
   where id = v_b.id and versiya = p_kutilgan_versiya;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI'); end if;
  v_dalil := public._t2_yet_dalil_yoz(p_kompaniya_id, p_actor_id, 'buyurtma', v_b.id, p_hujjatlar);
  if not (v_dalil->>'ok')::boolean then raise exception 'DALIL_YOZILMADI: %', v_dalil::text using errcode = 'P0001'; end if;
  if v_yuk_kerak and to_regprocedure('public._t2_yuk_buyurtmadan_v1(bigint,bigint,uuid)') is not null then   -- logistika ichki funksiyasi (F3b); yo'q bo'lsa faqat outbox
    execute 'select public._t2_yuk_buyurtmadan_v1($1, $2, $3)' into v_yuk using p_actor_id, v_b.id, p_operation_id;
    if coalesce(v_yuk->>'ok', 'false') <> 'true' then raise exception 'YUK_YARATILMADI: %', coalesce(v_yuk::text, 'null') using errcode = 'P0001'; end if;   -- butun o'tish bekor
  end if;
  perform public._t2_yet_hodisa(p_kompaniya_id, 'buyurtma.holat', 't2_buyurtma', v_b.id,
            jsonb_build_object('dan', v_b.holat, 'ga', v_ga, 'bosqich', v_bosqich, 'tomon', v_tomon, 'dalil_soni', (v_dalil->>'soni')::integer),
            p_actor_id, p_operation_id, v_b.obyekt_id, v_b.aloqa_id,
            array[case when v_tomon = 'xaridor' then v_b.ijrochi_kompaniya_id else v_b.kompaniya_id end]);
  if v_yuk_kerak then
    perform public._t2_yet_hodisa(p_kompaniya_id, 'buyurtma.yuklashga_tayyor', 't2_buyurtma', v_b.id,
              jsonb_build_object('xaridor_kompaniya_id', v_b.kompaniya_id, 'yetkazuvchi_kompaniya_id', v_b.ijrochi_kompaniya_id, 'yuk_id', v_yuk->'yuk_id'),
              p_actor_id, p_operation_id, v_b.obyekt_id, v_b.aloqa_id, array[v_b.kompaniya_id, v_b.ijrochi_kompaniya_id]);
  end if;
  if v_ga in ('qabul_qilindi_yakuniy','qisman') and v_b.holat <> v_ga then
    perform public._t2_yet_hodisa(p_kompaniya_id, 'buyurtma.qabul_qilindi', 't2_buyurtma', v_b.id,
              jsonb_build_object('holat', v_ga, 'dalil_soni', (v_dalil->>'soni')::integer), p_actor_id, p_operation_id, v_b.obyekt_id, v_b.aloqa_id, array[v_b.ijrochi_kompaniya_id]);
  end if;
  return jsonb_build_object('ok', true, 'id', v_b.id, 'versiya', p_kutilgan_versiya + 1, 'holat', v_ga, 'bosqich', coalesce(v_bosqich, v_b.bosqich),
                            'yuk', case when v_yuk_kerak then coalesce(v_yuk, jsonb_build_object('holat', 'logistika_kutilmoqda')) end);
end $$;
revoke all on function public._t2_buyurtma_otish_ichki(bigint,bigint,uuid,bigint,integer,text,text,text,bigint[]) from public, anon, authenticated;

create or replace function public.t2_buyurtma_otish_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_buyurtma_id bigint, p_kutilgan_versiya integer,
  p_holat text, p_bosqich text, p_izoh text, p_dalil_hujjat_idlar bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_holat not in ('qabul_qilindi','rad','bajarilmoqda','tayyor','topshirildi','qabul_qilindi_yakuniy','qisman','nizo','bekor') then
    return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI');
  end if;
  return public._t2_buyurtma_otish_ichki(p_actor_id, p_kompaniya_id, p_operation_id, p_buyurtma_id, p_kutilgan_versiya, p_holat, p_bosqich, p_izoh, p_dalil_hujjat_idlar);
end $$;

-- Qabul (xaridor tomoni): qatorlar bo'yicha qabul miqdori/holati + sertifikat/TTN hujjatlari -> holat avtomatik.
-- Ombor kirimi (tomon-ichki, E3 §4.6) shu RPC ni chaqiradi. Sertifikat yo'q bo'lsa to'sib qo'ymaydi — ogohlantirish qaytaradi (nazorat qaror qiladi).
create or replace function public.t2_buyurtma_qabul_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_buyurtma_id bigint, p_kutilgan_versiya integer,
  p_qatorlar jsonb, p_hujjat_idlar bigint[], p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b public.t2_buyurtma; v_q jsonb; v_id bigint; v_m numeric; v_h text; v_butun boolean := true; v_shikast boolean := false; v_ga text; v_r jsonb; v_ogoh text[] := '{}';
        v_miq numeric; v_say integer := 0;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'qabul');
  select * into v_b from public.t2_buyurtma where id = p_buyurtma_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_b.oxirgi_operation_id = p_operation_id then return jsonb_build_object('ok', true, 'takror', true, 'versiya', v_b.versiya, 'holat', v_b.holat); end if;
  if v_b.holat <> 'topshirildi' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_b.holat); end if;
  if v_b.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_b.versiya); end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 then return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI'); end if;
  for v_q in select * from jsonb_array_elements(p_qatorlar) loop
    if coalesce(v_q->>'buyurtma_qator_id', '') !~ '^[0-9]+$' or coalesce(v_q->>'qabul_miqdor', '') !~ '^[0-9]+(\.[0-9]+)?$' then return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI'); end if;
    v_id := (v_q->>'buyurtma_qator_id')::bigint; v_m := (v_q->>'qabul_miqdor')::numeric; v_h := coalesce(v_q->>'holat', 'butun');
    if v_h not in ('butun','shikast','kam') then return jsonb_build_object('ok', false, 'code', 'QATOR_HOLAT'); end if;
    select miqdor into v_miq from public.t2_buyurtma_qator where id = v_id and buyurtma_id = v_b.id;
    if not found then return jsonb_build_object('ok', false, 'code', 'QATOR_BEGONA'); end if;
    if v_m < v_miq and v_h = 'butun' then v_h := 'kam'; end if;   -- kam qabul qilingan qator "butun" bo'la olmaydi
    update public.t2_buyurtma_qator set qabul_miqdor = v_m, qabul_holat = v_h, izoh = coalesce(nullif(left(v_q->>'izoh', 1000), ''), izoh) where id = v_id;
    v_say := v_say + 1;
    if v_h = 'shikast' then v_shikast := true; end if;
    if v_h <> 'butun' then v_butun := false; end if;
  end loop;
  if exists (select 1 from public.t2_buyurtma_qator where buyurtma_id = v_b.id and qabul_holat is null) then v_butun := false; end if;   -- ko'rsatilmagan qator = qabul qilinmagan
  v_ga := case when v_shikast then 'nizo' when v_butun then 'qabul_qilindi_yakuniy' else 'qisman' end;
  if p_hujjat_idlar is null or cardinality(p_hujjat_idlar) = 0 then v_ogoh := array['SERTIFIKAT_YOQ']; end if;
  v_r := public._t2_buyurtma_otish_ichki(p_actor_id, p_kompaniya_id, p_operation_id, p_buyurtma_id, p_kutilgan_versiya, v_ga, null, p_izoh, p_hujjat_idlar);
  if not (v_r->>'ok')::boolean then raise exception 'QABUL_O_TISH_RAD: %', v_r::text using errcode = 'P0001'; end if;   -- qator yozuvlari qaytariladi
  return v_r || jsonb_build_object('ogohlantirish', to_jsonb(v_ogoh));
end $$;

-- Ro'yxat (ikki tomon uchun), keyset sahifalash. 'meniki' = men xaridorman; 'menga' = men yetkazuvchiman (faqat faol aloqada).
create or replace function public.t2_buyurtmalar_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text, p_tur text, p_holat text, p_limit integer, p_keyin_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lim integer := least(greatest(coalesce(p_limit, 50), 1), 100); v_res jsonb;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'korish');
  if p_yonalish not in ('meniki','menga') then return jsonb_build_object('ok', false, 'code', 'YONALISH_NOTOGRI'); end if;
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into v_res from (
    select jsonb_build_object('id', b.id, 'tur', b.tur, 'holat', b.holat, 'bosqich', b.bosqich, 'obyekt_id', case when p_yonalish = 'meniki' then b.obyekt_id end,
             'summa_nds_siz', b.summa_nds_siz, 'yetkazish_narx', b.yetkazish_narx, 'qqs_foiz', b.qqs_foiz, 'versiya', b.versiya, 'yaratildi', b.yaratildi,
             'xaridor_kompaniya_id', b.kompaniya_id, 'ijrochi_kompaniya_id', b.ijrochi_kompaniya_id,
             'qator_soni', (select count(*) from public.t2_buyurtma_qator q where q.buyurtma_id = b.id)) as x
      from public.t2_buyurtma b
     where (case when p_yonalish = 'meniki' then b.kompaniya_id = p_kompaniya_id
                 else b.ijrochi_kompaniya_id = p_kompaniya_id and public._t2_yet_aloqa_faol(b.kompaniya_id, b.ijrochi_kompaniya_id) is not null end)
       and (p_tur is null or b.tur = p_tur) and (p_holat is null or b.holat = p_holat) and (p_keyin_id is null or b.id < p_keyin_id)
     order by b.id desc limit v_lim) s;
  return jsonb_build_object('ok', true, 'qatorlar', v_res, 'keyingi_id', case when jsonb_array_length(v_res) = v_lim then (v_res->(v_lim - 1)->>'id')::bigint end);
end $$;

-- Tafsilot (ikki tomon): buyurtma + qatorlar. Yetkazuvchi xaridorning obyektini FAQAT yetkazish manzili sifatida (shart) ko'radi.
create or replace function public.t2_buyurtma_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_buyurtma_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b public.t2_buyurtma; v_xaridor boolean;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into v_b from public.t2_buyurtma where id = p_buyurtma_id and (kompaniya_id = p_kompaniya_id or ijrochi_kompaniya_id = p_kompaniya_id);
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  v_xaridor := v_b.kompaniya_id = p_kompaniya_id;
  if not v_xaridor and public._t2_yet_aloqa_faol(v_b.kompaniya_id, v_b.ijrochi_kompaniya_id) is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  return jsonb_build_object('ok', true, 'tomon', case when v_xaridor then 'xaridor' else 'ijrochi' end,
    'buyurtma', jsonb_build_object('id', v_b.id, 'tur', v_b.tur, 'holat', v_b.holat, 'bosqich', v_b.bosqich, 'obyekt_id', case when v_xaridor then v_b.obyekt_id end,
      'summa_nds_siz', v_b.summa_nds_siz, 'yetkazish_narx', v_b.yetkazish_narx, 'qqs_foiz', v_b.qqs_foiz, 'shart', v_b.shart, 'olish', v_b.olish,
      'izoh', v_b.izoh, 'versiya', v_b.versiya, 'faktura_id', v_b.faktura_id, 'yaratildi', v_b.yaratildi, 'xaridor_kompaniya_id', v_b.kompaniya_id, 'ijrochi_kompaniya_id', v_b.ijrochi_kompaniya_id),
    'qatorlar', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'qator_no', q.qator_no, 'nom', q.nom, 'birlik', q.birlik, 'miqdor', q.miqdor, 'narx', q.narx,
        'muddat_kun', q.muddat_kun, 'resurs_kodi', q.resurs_kodi, 'qabul_miqdor', q.qabul_miqdor, 'qabul_holat', q.qabul_holat) order by q.qator_no)
        from public.t2_buyurtma_qator q where q.buyurtma_id = v_b.id), '[]'::jsonb));
end $$;

-- ───────────────────────── 4. Ruxsatlar: faqat service_role ─────────────────────────
revoke all on function public._t2_yet_azo(bigint,bigint,text), public._t2_yet_aloqa_faol(bigint,bigint),
  public._t2_yet_hodisa(bigint,text,text,bigint,jsonb,bigint,uuid,bigint,bigint,bigint[]), public._t2_yet_tur_ok(text,text),
  public._t2_yet_dalil_yoz(bigint,bigint,text,bigint,bigint[]), public._t2_yet_dalil_tekshir(bigint,bigint[]), public._t2_yet_qator_xato(jsonb)
  from public, anon, authenticated;
revoke all on function public.t2_buyurtma_yarat_v1(bigint,bigint,uuid,text,bigint,bigint,bigint,bigint,jsonb,jsonb),
  public.t2_buyurtma_olish_yoz_v1(bigint,bigint,uuid,bigint,integer,jsonb),
  public.t2_buyurtma_otish_v1(bigint,bigint,uuid,bigint,integer,text,text,text,bigint[]),
  public.t2_buyurtma_qabul_v1(bigint,bigint,uuid,bigint,integer,jsonb,bigint[],text),
  public.t2_buyurtmalar_v1(bigint,bigint,text,text,text,integer,bigint),
  public.t2_buyurtma_tafsilot_v1(bigint,bigint,bigint) from public, anon, authenticated;
grant execute on function public.t2_buyurtma_yarat_v1(bigint,bigint,uuid,text,bigint,bigint,bigint,bigint,jsonb,jsonb),
  public.t2_buyurtma_olish_yoz_v1(bigint,bigint,uuid,bigint,integer,jsonb),
  public.t2_buyurtma_otish_v1(bigint,bigint,uuid,bigint,integer,text,text,text,bigint[]),
  public.t2_buyurtma_qabul_v1(bigint,bigint,uuid,bigint,integer,jsonb,bigint[],text),
  public.t2_buyurtmalar_v1(bigint,bigint,text,text,text,integer,bigint),
  public.t2_buyurtma_tafsilot_v1(bigint,bigint,bigint) to service_role;
