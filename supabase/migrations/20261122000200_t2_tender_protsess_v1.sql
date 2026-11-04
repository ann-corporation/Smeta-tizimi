-- TENDER / XARID PROTSESSI v1 (egasi 2026-11-03: «tendr ... mukammal jarayon»).
--
-- Mavjud poydevorga QO'SHILADI (yangi parallel RFQ jadvali YO'Q):
--   20261108400000  t2_birja_rfq / _qator / _oluvchi / t2_birja_taklif / _qator   (P2 baseline + kengaytma)
--   20261108410000  t2_buyurtma (+qator) — g'olibdan keyingi buyurtma, yetkazish bosqichlari, qabul
--   20261108420000  t2_tender_elon/taklif_ber/taklif_qaytar/golib/yop/tenderlar/tafsilot (v1)
-- Bu migratsiya: tasdiqlash zanjiri, muhrlangan (sealed) takliflar, savol-javob, baholash (ball), qayta raund (BAFO),
-- qator darajasida g'olib + asos, shartnomaga bog'lash, yetkazuvchi reytingi, audit jurnali va tahlil.
--
-- Holatlar: qoralama -> tasdiqlashda -> elon -> (takliflar_yopildi) -> baholash -> golib_tanlandi -> shartnoma -> bajarilmoqda -> yopildi
--           bekor (yopildi/bekordan oldin istalgan faol holatdan). baholash -> elon = qayta raund (BAFO).
--   takliflar_yopildi: muddat o'tgach `elon` o'zi shunday ko'rinadi (virtual) yoki tasdiqlovchi muddatdan oldin yopadi (sabab bilan).
-- MUHRLASH: xaridor takliflarni faqat OCHISH (elon/takliflar_yopildi -> baholash, procurement.approve) dan keyin ko'radi; ungacha — faqat soni.
--           Qayta raundda (baholash -> elon) takliflar yana muhrlanadi. Byudjet yetkazuvchilardan yashirin (byudjet_korsatish=true bo'lmasa).
-- RUXSAT: procurement.write (qoralama, savol-javob, baholash, shartnoma), procurement.approve (tasdiq/e'lon, ochish, g'olib, bekor),
--         supply.offer (taklif, savol). O'qish: procurement.read yoki supply.offer/fulfil. Yangi capability QO'SHILMAYDI.
-- PUL: narxlar NDS siz (mavjud kelishuv); QQS foizi alohida (tender: sukut 12). Noma'lum = NULL (0 emas).
-- FAYLLAR: tender hujjatlari va taklif fayllari (PDF/Excel/rasm) R2 da (mavjud hujjat-yukla -> t2_document_registry); bu yerda faqat
--   havola (t2_primitiv_dalil: primitiv 'tender' / 'tender_taklif', hujjat_id). Fayl matni/ikkilik ma'lumot Supabase'ga YOZILMAYDI.
-- XAVFSIZLIK: v1 RPC lar BUZILMAYDI; protsess_v2 tenderlarda muhr va tasdiq triggerlar bilan himoyalangan (qarang pastda).
-- ALDINDAN KERAK: 20261108400000, 20261108410000, 20261108420000 (va F1: t2_outbox_yoz, t2_baho; ruxsat: t2_permission_allowed_v2).

do $$ begin
  if to_regclass('public.t2_birja_rfq') is null or to_regclass('public.t2_buyurtma') is null or to_regclass('public.t2_baho') is null
     or to_regprocedure('public.t2_tender_taklif_ber_v1(bigint,bigint,uuid,bigint,jsonb,text,jsonb)') is null
     or to_regprocedure('public._t2_buyurtma_yarat_ichki(bigint,bigint,uuid,text,bigint,bigint,bigint,bigint,bigint,jsonb,jsonb,numeric,numeric,text)') is null
     or to_regprocedure('public.t2_require_permission_v2(bigint,bigint,text)') is null
     or to_regprocedure('public.t2_actor_kompaniya_azo_tekshir(bigint,bigint)') is null then
    raise exception 'TENDER-V1: P2/P3 (20261108400000..420000), F1 va ruxsat migratsiyalari avval qo''llanishi kerak.';
  end if;
end $$;

-- ───────────────────────── 1. Jadval kengaytmalari (additiv) ─────────────────────────
alter table public.t2_birja_rfq drop constraint if exists t2_birja_rfq_holat_check;
alter table public.t2_birja_rfq add constraint t2_birja_rfq_holat_check
  check (holat in ('ochiq', 'yopiq', 'bekor', 'qoralama', 'elon', 'yopildi', 'golib_tanlandi',
                   'tasdiqlashda', 'takliflar_yopildi', 'baholash', 'shartnoma', 'bajarilmoqda'));

alter table public.t2_birja_rfq add column if not exists protsess_v2 boolean not null default false;
alter table public.t2_birja_rfq add column if not exists raqam text check (raqam is null or length(raqam) <= 40);
alter table public.t2_birja_rfq add column if not exists byudjet_qqs_bilan numeric(20,2) check (byudjet_qqs_bilan is null or byudjet_qqs_bilan >= 0);
alter table public.t2_birja_rfq add column if not exists byudjet_korsatish boolean not null default false;
alter table public.t2_birja_rfq add column if not exists qqs_foiz numeric(5,2) not null default 12 check (qqs_foiz between 0 and 100);
alter table public.t2_birja_rfq add column if not exists valyuta text not null default 'UZS' check (valyuta in ('UZS', 'USD', 'EUR', 'RUB'));
alter table public.t2_birja_rfq add column if not exists baholash_usuli text not null default 'narx' check (baholash_usuli in ('narx', 'ball'));
alter table public.t2_birja_rfq add column if not exists meyor jsonb not null default '{}'::jsonb check (jsonb_typeof(meyor) = 'object' and octet_length(meyor::text) <= 1024);
alter table public.t2_birja_rfq add column if not exists savol_muddat timestamptz;
alter table public.t2_birja_rfq add column if not exists tolov_sharti text check (tolov_sharti is null or length(tolov_sharti) <= 500);
alter table public.t2_birja_rfq add column if not exists raund integer not null default 1 check (raund between 1 and 3);
alter table public.t2_birja_rfq add column if not exists yuborgan_actor_id bigint references public.t2_foydalanuvchi(id);
alter table public.t2_birja_rfq add column if not exists tasdiq_actor_id bigint references public.t2_foydalanuvchi(id);
alter table public.t2_birja_rfq add column if not exists tasdiq_vaqt timestamptz;
alter table public.t2_birja_rfq add column if not exists ochilgan_vaqt timestamptz;
alter table public.t2_birja_rfq add column if not exists ochgan_actor_id bigint references public.t2_foydalanuvchi(id);
alter table public.t2_birja_rfq add column if not exists golib_asos text check (golib_asos is null or length(golib_asos) <= 4000);
alter table public.t2_birja_rfq add column if not exists golib_vaqt timestamptz;
alter table public.t2_birja_rfq add column if not exists shartnoma_id bigint references public.t2_shartnoma(id);
alter table public.t2_birja_rfq add column if not exists oxirgi_operation_id uuid;
create unique index if not exists t2_birja_rfq_raqam_uq on public.t2_birja_rfq (kompaniya_id, raqam) where raqam is not null;
create index if not exists t2_birja_rfq_holat_idx on public.t2_birja_rfq (kompaniya_id, holat, id desc);

alter table public.t2_birja_rfq_qator add column if not exists lot_no integer not null default 1 check (lot_no between 1 and 50);
alter table public.t2_birja_rfq_qator add column if not exists lot_nom text check (lot_nom is null or length(lot_nom) <= 200);
alter table public.t2_birja_rfq_qator add column if not exists talab_sana date;
alter table public.t2_birja_rfq_qator add column if not exists yetkazish_joyi text check (yetkazish_joyi is null or length(yetkazish_joyi) <= 300);
alter table public.t2_birja_rfq_qator add column if not exists spets text check (spets is null or length(spets) <= 2000);

alter table public.t2_birja_taklif add column if not exists tolov_sharti text check (tolov_sharti is null or length(tolov_sharti) <= 500);
alter table public.t2_birja_taklif add column if not exists amal_kun integer check (amal_kun is null or amal_kun between 1 and 365);
alter table public.t2_birja_taklif add column if not exists kafolat_oy integer check (kafolat_oy is null or kafolat_oy between 0 and 240);
alter table public.t2_birja_taklif add column if not exists raund integer not null default 1 check (raund between 1 and 3);

-- Audit jurnali (faqat qo'shiladi; o'zgartirish/o'chirish trigger bilan taqiqlangan).
create table if not exists public.t2_tender_jurnal (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),          -- tender egasi
  rfq_id bigint not null references public.t2_birja_rfq(id),
  hodisa text not null check (hodisa ~ '^[a-z_]{2,40}$'),
  actor_id bigint references public.t2_foydalanuvchi(id),
  aktor_kompaniya_id bigint references public.t2_kompaniya(id),
  payload jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 1024),   -- kichik qatorlar: katta log/JSON Supabase'da saqlanmaydi (egasi 2026-11-03)
  yaratildi timestamptz not null default now()
);
create index if not exists t2_tender_jurnal_rfq_idx on public.t2_tender_jurnal (rfq_id, id);

create table if not exists public.t2_tender_savol (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),          -- tender egasi
  rfq_id bigint not null references public.t2_birja_rfq(id),
  savol_kompaniya_id bigint not null references public.t2_kompaniya(id),
  savol_actor_id bigint not null references public.t2_foydalanuvchi(id),
  savol text not null check (length(btrim(savol)) between 5 and 2000),
  javob text check (javob is null or length(btrim(javob)) between 2 and 4000),
  javob_actor_id bigint references public.t2_foydalanuvchi(id),
  javob_vaqt timestamptz,
  ommaviy boolean not null default true,                                      -- javob barcha ishtirokchilarga ko'rinadi
  operation_id uuid not null,
  javob_operation_id uuid,
  yaratildi timestamptz not null default now(),
  unique (savol_kompaniya_id, operation_id)
);
create index if not exists t2_tender_savol_rfq_idx on public.t2_tender_savol (rfq_id, id);

create table if not exists public.t2_tender_baho (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  rfq_id bigint not null references public.t2_birja_rfq(id),
  taklif_id bigint not null references public.t2_birja_taklif(id),
  raund integer not null default 1,
  jami_ball numeric(6,2) not null check (jami_ball between 0 and 100),
  ballar jsonb not null default '{}'::jsonb check (jsonb_typeof(ballar) = 'object'),   -- {narx, muddat, tolov, kafolat, reyting}: 0..100; bo'lmagan mezon ishlatilmagan
  izoh text check (izoh is null or length(izoh) <= 1000),
  actor_id bigint not null references public.t2_foydalanuvchi(id),
  yaratildi timestamptz not null default now(),
  unique (rfq_id, taklif_id, raund)
);

alter table public.t2_tender_jurnal enable row level security;
alter table public.t2_tender_savol enable row level security;
alter table public.t2_tender_baho enable row level security;
revoke all on table public.t2_tender_jurnal, public.t2_tender_savol, public.t2_tender_baho from anon, authenticated;

create or replace function public._t2_tender_jurnal_qoriqchi() returns trigger
language plpgsql as $$ begin raise exception 'TENDER_JURNAL_FAQAT_QOSHILADI' using errcode = '42501'; end $$;
drop trigger if exists t2_tender_jurnal_ozgarmas on public.t2_tender_jurnal;
create trigger t2_tender_jurnal_ozgarmas before update or delete on public.t2_tender_jurnal
  for each row execute function public._t2_tender_jurnal_qoriqchi();

-- v1 yo'li (t2_buyurtma_yarat_v1 -> t2_tender_golib_v1) orqali aylanib o'tishni to'sish (faqat protsess_v2 tenderlarda).
create or replace function public._t2_tender_golib_qoriqchi() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.golib_taklif_qator_id is not null and new.golib_taklif_qator_id is distinct from old.golib_taklif_qator_id
     and exists (select 1 from public.t2_birja_rfq r where r.id = new.rfq_id and r.protsess_v2)
     and coalesce(current_setting('tender.v2_golib', true), '') <> '1' then
    raise exception 'TENDER_GOLIB_V2_KERAK' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists t2_birja_rfq_qator_golib_v2 on public.t2_birja_rfq_qator;
create trigger t2_birja_rfq_qator_golib_v2 before update on public.t2_birja_rfq_qator
  for each row execute function public._t2_tender_golib_qoriqchi();

create or replace function public._t2_tender_holat_qoriqchi() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.protsess_v2 and new.holat is distinct from old.holat and not public._t2_tender_otish_ruxsat(old.holat, new.holat) then
    raise exception 'TENDER_HOLAT_TAQIQ' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists t2_birja_rfq_holat_mashina on public.t2_birja_rfq;

-- ───────────────────────── 2. Yordamchilar ─────────────────────────
create or replace function public._t2_tender_azo(p_actor_id bigint, p_kompaniya_id bigint, p_amal text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if p_amal = 'yoz' then perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.write');
  elsif p_amal = 'tasdiq' then perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.approve');
  elsif p_amal = 'taklif' then perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'supply.offer');
  elsif p_amal = 'korish' then
    if not (public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'procurement.read')
            or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'supply.offer')
            or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'supply.fulfil')) then
      raise exception 'PERMISSION_DENIED' using errcode = '42501';
    end if;
  else raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
end $$;

create or replace function public._t2_tender_jurnal_yoz(p_kompaniya_id bigint, p_rfq_id bigint, p_hodisa text, p_actor_id bigint, p_aktor_kompaniya_id bigint, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.t2_tender_jurnal (kompaniya_id, rfq_id, hodisa, actor_id, aktor_kompaniya_id, payload)
  values (p_kompaniya_id, p_rfq_id, p_hodisa, p_actor_id, p_aktor_kompaniya_id, coalesce(p_payload, '{}'::jsonb));
end $$;

-- Holat o'tishlari (statik mashina; frontend lib/tender/holat.ts bilan bir xil).
create or replace function public._t2_tender_otish_ruxsat(p_dan text, p_ga text) returns boolean
language sql immutable as $$
  select (p_dan, p_ga) in (
    ('qoralama','tasdiqlashda'), ('tasdiqlashda','qoralama'), ('tasdiqlashda','elon'),
    ('elon','takliflar_yopildi'), ('elon','baholash'), ('takliflar_yopildi','baholash'),
    ('baholash','elon'), ('baholash','golib_tanlandi'), ('baholash','yopildi'),
    ('golib_tanlandi','shartnoma'), ('golib_tanlandi','bajarilmoqda'), ('shartnoma','bajarilmoqda'),
    ('bajarilmoqda','yopildi'), ('golib_tanlandi','yopildi'),
    ('qoralama','bekor'), ('tasdiqlashda','bekor'), ('elon','bekor'), ('takliflar_yopildi','bekor'), ('baholash','bekor'),
    ('golib_tanlandi','bekor'), ('shartnoma','bekor'), ('bajarilmoqda','bekor')
  )
$$;

create trigger t2_birja_rfq_holat_mashina before update of holat on public.t2_birja_rfq
  for each row execute function public._t2_tender_holat_qoriqchi();

-- Ko'rinish: egasi — har doim; boshqa tomon — mavjud qoida (_t2_tender_korinadi) VA (e'lon qilingan YOKI o'z taklifi bor).
create or replace function public._t2_tender_korinadi_v2(p_rfq_id bigint, p_kompaniya_id bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.t2_birja_rfq r
     where r.id = p_rfq_id
       and (r.kompaniya_id = p_kompaniya_id
            or (public._t2_tender_korinadi(r.id, p_kompaniya_id)
                and r.holat not in ('qoralama', 'tasdiqlashda')
                and (r.holat = 'elon'
                     or exists (select 1 from public.t2_birja_taklif t where t.rfq_id = r.id and t.kompaniya_id = p_kompaniya_id and t.holat <> 'qaytarib_olindi')))))
$$;

-- Qiymat tekshiruvlari (xavfsiz: noto'g'ri matn xato emas, NULL)
create or replace function public._t2_tender_son(p text) returns numeric
language sql immutable as $$ select case when p ~ '^[0-9]+(\.[0-9]+)?$' then p::numeric end $$;

create or replace function public._t2_tender_meyor_xato(p_usuli text, p_meyor jsonb) returns text
language plpgsql immutable as $$
declare k text; v jsonb; s numeric := 0;
begin
  if p_meyor is null or jsonb_typeof(p_meyor) <> 'object' then return 'MEYOR_NOTOGRI'; end if;
  for k, v in select * from jsonb_each(p_meyor) loop
    if k not in ('narx', 'muddat', 'tolov', 'kafolat', 'reyting') or jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not between 0 and 100 then return 'MEYOR_NOTOGRI'; end if;
    s := s + (v #>> '{}')::numeric;
  end loop;
  if p_usuli = 'ball' and (s <> 100 or not (p_meyor ? 'narx')) then return 'MEYOR_YIGINDI'; end if;
  return null;
end $$;

-- ───────────────────────── 3. YOZUVCHI RPC lar ─────────────────────────
-- 3.1 Qoralama yaratish / tahrirlash (lotlar + pozitsiyalar). Faqat 'qoralama' holatida tahrirlanadi.
create or replace function public.t2_tender_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_rfq_id bigint, p_kutilgan_versiya integer,
  p_tur text, p_doira text, p_qabul_kompaniya_idlar bigint[], p_obyekt_id bigint, p_muddat timestamptz,
  p_maydonlar jsonb, p_qatorlar jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rfq public.t2_birja_rfq; v_m jsonb := coalesce(p_maydonlar, '{}'::jsonb); v_xato text; v_q jsonb; v_no integer := 0; v_n integer; v_id bigint;
  v_rec bigint[]; v_k bigint; v_z bigint; v_sarlavha text; v_byudjet numeric; v_qqs numeric := 12; v_valyuta text; v_usuli text; v_meyor jsonb;
  v_savol_m timestamptz; v_tolov text; v_shart jsonb; v_raqam text; v_birlik text; v_hajm numeric; v_sana text;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'yoz');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  if p_rfq_id is null then
    select * into v_rfq from public.t2_birja_rfq where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
    if found then return jsonb_build_object('ok', true, 'takror', true, 'id', v_rfq.id, 'versiya', v_rfq.versiya, 'raqam', v_rfq.raqam); end if;
  else
    select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id and kompaniya_id = p_kompaniya_id and protsess_v2 for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
    if v_rfq.oxirgi_operation_id = p_operation_id then return jsonb_build_object('ok', true, 'takror', true, 'id', v_rfq.id, 'versiya', v_rfq.versiya, 'raqam', v_rfq.raqam); end if;
    if v_rfq.holat <> 'qoralama' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_rfq.holat); end if;
    if v_rfq.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_rfq.versiya); end if;
  end if;
  if jsonb_typeof(v_m) <> 'object' then return jsonb_build_object('ok', false, 'code', 'MAYDON_NOTOGRI'); end if;
  if not public._t2_yet_tur_ok('tender', p_tur) then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  if p_doira not in ('ochiq', 'taklif') then return jsonb_build_object('ok', false, 'code', 'DOIRA_NOTOGRI'); end if;
  v_sarlavha := btrim(coalesce(v_m->>'sarlavha', ''));
  if length(v_sarlavha) not between 3 and 300 then return jsonb_build_object('ok', false, 'code', 'SARLAVHA_NOTOGRI'); end if;
  if length(coalesce(v_m->>'izoh', '')) > 2000 or length(coalesce(v_m->>'tolov_sharti', '')) > 500 then return jsonb_build_object('ok', false, 'code', 'MATN_UZUN'); end if;
  if coalesce(v_m->>'byudjet_qqs_bilan', '') <> '' then
    v_byudjet := public._t2_tender_son(v_m->>'byudjet_qqs_bilan');
    if v_byudjet is null then return jsonb_build_object('ok', false, 'code', 'BYUDJET_NOTOGRI'); end if;
  end if;
  if coalesce(v_m->>'qqs_foiz', '') <> '' then
    v_qqs := public._t2_tender_son(v_m->>'qqs_foiz');
    if v_qqs is null or v_qqs > 100 then return jsonb_build_object('ok', false, 'code', 'QQS_NOTOGRI'); end if;
  end if;
  v_valyuta := coalesce(nullif(v_m->>'valyuta', ''), 'UZS');
  if v_valyuta not in ('UZS', 'USD', 'EUR', 'RUB') then return jsonb_build_object('ok', false, 'code', 'VALYUTA_NOTOGRI'); end if;
  v_usuli := coalesce(nullif(v_m->>'baholash_usuli', ''), 'narx');
  if v_usuli not in ('narx', 'ball') then return jsonb_build_object('ok', false, 'code', 'USUL_NOTOGRI'); end if;
  v_meyor := coalesce(v_m->'meyor', '{}'::jsonb);
  v_xato := public._t2_tender_meyor_xato(v_usuli, v_meyor);
  if v_xato is not null then return jsonb_build_object('ok', false, 'code', v_xato); end if;
  if coalesce(v_m->>'savol_muddat', '') <> '' then
    begin v_savol_m := (v_m->>'savol_muddat')::timestamptz; exception when others then return jsonb_build_object('ok', false, 'code', 'SAVOL_MUDDAT_NOTOGRI'); end;
    if p_muddat is not null and v_savol_m > p_muddat then return jsonb_build_object('ok', false, 'code', 'SAVOL_MUDDAT_NOTOGRI'); end if;
  end if;
  if p_muddat is not null and p_muddat <= now() then return jsonb_build_object('ok', false, 'code', 'MUDDAT_OTGAN'); end if;
  v_xato := public._t2_yet_qator_xato(p_qatorlar);
  if v_xato is not null then return jsonb_build_object('ok', false, 'code', v_xato); end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA'); end if;
  if not (p_obyekt_id is null or public._t2_obyekt_doira_ok(p_actor_id, p_kompaniya_id, p_obyekt_id)) then return jsonb_build_object('ok', false, 'code', 'DOIRA_YOQ'); end if;
  -- chaqiriladigan yetkazuvchilar: qoralamada faqat shart.qabul da saqlanadi (e'longacha oluvchi qatori YO'Q -> qoralama ko'rinmaydi)
  if p_doira = 'taklif' then
    select coalesce(array_agg(distinct x), '{}') into v_rec from unnest(coalesce(p_qabul_kompaniya_idlar, '{}')) x where x is not null;
    if cardinality(v_rec) not between 1 and 50 then return jsonb_build_object('ok', false, 'code', 'OLUVCHILAR_NOTOGRI'); end if;
    foreach v_k in array v_rec loop
      if v_k = p_kompaniya_id or public._t2_yet_aloqa_faol(p_kompaniya_id, v_k) is null then return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ', 'kompaniya_id', v_k); end if;
    end loop;
  else v_rec := '{}'; end if;
  for v_q in select * from jsonb_array_elements(p_qatorlar) loop
    if coalesce(v_q->>'lot_no', '') <> '' and (v_q->>'lot_no' !~ '^[0-9]{1,2}$' or (v_q->>'lot_no')::integer not between 1 and 50) then return jsonb_build_object('ok', false, 'code', 'LOT_NOTOGRI'); end if;
    v_sana := coalesce(v_q->>'talab_sana', '');
    if v_sana <> '' then
      if v_sana !~ '^\d{4}-\d{2}-\d{2}$' then return jsonb_build_object('ok', false, 'code', 'SANA_NOTOGRI'); end if;
      begin perform v_sana::date; exception when others then return jsonb_build_object('ok', false, 'code', 'SANA_NOTOGRI'); end;
    end if;
    if length(coalesce(v_q->>'lot_nom', '')) > 200 or length(coalesce(v_q->>'yetkazish_joyi', '')) > 300 or length(coalesce(v_q->>'spets', '')) > 2000 then return jsonb_build_object('ok', false, 'code', 'MATN_UZUN'); end if;
    if coalesce(v_q->>'zayavka_id', '') <> '' then
      if v_q->>'zayavka_id' !~ '^[0-9]+$' then return jsonb_build_object('ok', false, 'code', 'ZAYAVKA_BEGONA'); end if;
      v_z := (v_q->>'zayavka_id')::bigint;
      if not exists (select 1 from public.t2_erp_taminot z where z.id = v_z and z.kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'ZAYAVKA_BEGONA'); end if;
    end if;
  end loop;
  v_n := jsonb_array_length(p_qatorlar);
  if v_n = 1 then v_birlik := btrim(p_qatorlar->0->>'birlik'); v_hajm := (p_qatorlar->0->>'miqdor')::numeric; end if;
  v_tolov := nullif(btrim(coalesce(v_m->>'tolov_sharti', '')), '');
  v_shart := jsonb_build_object('sarlavha', v_sarlavha) || case when cardinality(v_rec) > 0 then jsonb_build_object('qabul', to_jsonb(v_rec)) else '{}'::jsonb end;

  if p_rfq_id is null then
    perform pg_advisory_xact_lock(hashtext('t2_tender_raqam:' || p_kompaniya_id));
    select 'T-' || to_char(now(), 'YYYY') || '-' || lpad((count(*) + 1)::text, 4, '0') into v_raqam
      from public.t2_birja_rfq where kompaniya_id = p_kompaniya_id and raqam like 'T-' || to_char(now(), 'YYYY') || '-%';
    insert into public.t2_birja_rfq (kompaniya_id, nom, birlik, hajm, izoh, holat, operation_id, oxirgi_operation_id, kim, tur, doira, obyekt_id, muddat, shart, yaratdi_actor_id,
                                     protsess_v2, raqam, byudjet_qqs_bilan, byudjet_korsatish, qqs_foiz, valyuta, baholash_usuli, meyor, savol_muddat, tolov_sharti)
    values (p_kompaniya_id, v_sarlavha, v_birlik, v_hajm, nullif(btrim(coalesce(v_m->>'izoh', '')), ''), 'qoralama', p_operation_id, p_operation_id, p_actor_id::text, p_tur, p_doira,
            p_obyekt_id, p_muddat, v_shart, p_actor_id, true, v_raqam, v_byudjet, coalesce((v_m->>'byudjet_korsatish')::boolean, false), v_qqs, v_valyuta, v_usuli, v_meyor, v_savol_m, v_tolov)
    returning id into v_id;
    perform public._t2_tender_jurnal_yoz(p_kompaniya_id, v_id, 'yaratildi', p_actor_id, p_kompaniya_id, jsonb_build_object('raqam', v_raqam, 'qator_soni', v_n));
  else
    v_id := v_rfq.id; v_raqam := v_rfq.raqam;
    update public.t2_birja_rfq set nom = v_sarlavha, birlik = v_birlik, hajm = v_hajm, izoh = nullif(btrim(coalesce(v_m->>'izoh', '')), ''), tur = p_tur, doira = p_doira,
           obyekt_id = p_obyekt_id, muddat = p_muddat, shart = v_shart, byudjet_qqs_bilan = v_byudjet, byudjet_korsatish = coalesce((v_m->>'byudjet_korsatish')::boolean, false),
           qqs_foiz = v_qqs, valyuta = v_valyuta, baholash_usuli = v_usuli, meyor = v_meyor, savol_muddat = v_savol_m, tolov_sharti = v_tolov,
           oxirgi_operation_id = p_operation_id, versiya = versiya + 1, yangilandi = now()
     where id = v_id;
    delete from public.t2_birja_rfq_qator where rfq_id = v_id;     -- qoralamada taklif yo'q (e'longacha)
    perform public._t2_tender_jurnal_yoz(p_kompaniya_id, v_id, 'tahrirlandi', p_actor_id, p_kompaniya_id, jsonb_build_object('qator_soni', v_n));
  end if;
  for v_q in select * from jsonb_array_elements(p_qatorlar) loop
    v_no := v_no + 1;
    insert into public.t2_birja_rfq_qator (kompaniya_id, rfq_id, qator_no, nom, birlik, miqdor, resurs_kodi, zayavka_id, smeta_qator_id, izoh, lot_no, lot_nom, talab_sana, yetkazish_joyi, spets)
    values (p_kompaniya_id, v_id, v_no, btrim(v_q->>'nom'), btrim(v_q->>'birlik'), (v_q->>'miqdor')::numeric, nullif(v_q->>'resurs_kodi', ''),
            nullif(v_q->>'zayavka_id', '')::bigint, nullif(v_q->>'smeta_qator_id', '')::bigint, nullif(left(v_q->>'izoh', 1000), ''),
            coalesce(nullif(v_q->>'lot_no', '')::integer, 1), nullif(btrim(coalesce(v_q->>'lot_nom', '')), ''), nullif(v_q->>'talab_sana', '')::date,
            nullif(btrim(coalesce(v_q->>'yetkazish_joyi', '')), ''), nullif(btrim(coalesce(v_q->>'spets', '')), ''));
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id, 'versiya', coalesce(v_rfq.versiya + 1, 1), 'raqam', v_raqam, 'qator_soni', v_n);
end $$;

-- 3.2 Holat o'tishi: tasdiqga yuborish / qaytarish / E'LON (tasdiq) / muddatdan oldin yopish / OCHISH / shartnoma / bajarilmoqda / yopish / bekor.
create or replace function public.t2_tender_otish_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_rfq_id bigint, p_kutilgan_versiya integer, p_ga text,
  p_izoh text default null, p_shartnoma_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rfq public.t2_birja_rfq; v_dan text; v_amal text; v_rec bigint[]; v_k bigint; v_n integer; v_izoh text := nullif(btrim(coalesce(p_izoh, '')), '');
  v_payload jsonb := '{}'::jsonb; v_mavzu text := 'tender.golib'; v_qabul bigint[] := '{}'; v_say integer;
begin
  if p_ga is null or p_ga not in ('qoralama', 'tasdiqlashda', 'elon', 'takliflar_yopildi', 'baholash', 'shartnoma', 'bajarilmoqda', 'yopildi', 'bekor') then
    return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI'); end if;
  v_amal := case when p_ga in ('tasdiqlashda', 'shartnoma', 'bajarilmoqda') then 'yoz' else 'tasdiq' end;
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, v_amal);
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id and kompaniya_id = p_kompaniya_id and protsess_v2 for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_rfq.oxirgi_operation_id = p_operation_id then return jsonb_build_object('ok', true, 'takror', true, 'id', v_rfq.id, 'versiya', v_rfq.versiya, 'holat', v_rfq.holat); end if;
  v_dan := v_rfq.holat;
  if v_dan = 'elon' and v_rfq.muddat is not null and v_rfq.muddat <= now() and p_ga <> 'takliflar_yopildi' then v_dan := 'takliflar_yopildi'; end if;
  if v_dan = 'elon' and v_rfq.muddat is not null and v_rfq.muddat <= now() and p_ga = 'takliflar_yopildi' then
    return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', 'takliflar_yopildi'); end if;
  if not public._t2_tender_otish_ruxsat(v_dan, p_ga) then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_dan); end if;
  if v_rfq.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_rfq.versiya); end if;
  if p_ga in ('qoralama', 'takliflar_yopildi', 'bekor') or (p_ga = 'yopildi' and v_dan = 'baholash') then
    if v_izoh is null or length(v_izoh) < 3 then return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK'); end if;
  end if;

  if p_ga = 'tasdiqlashda' then
    if not exists (select 1 from public.t2_birja_rfq_qator where rfq_id = v_rfq.id) then return jsonb_build_object('ok', false, 'code', 'QATORLAR_YOQ'); end if;
    if v_rfq.muddat is null then return jsonb_build_object('ok', false, 'code', 'MUDDAT_KERAK'); end if;
    update public.t2_birja_rfq set yuborgan_actor_id = p_actor_id where id = v_rfq.id;
  elsif p_ga = 'elon' and v_dan = 'tasdiqlashda' then
    if v_rfq.muddat is null then return jsonb_build_object('ok', false, 'code', 'MUDDAT_KERAK'); end if;
    if v_rfq.muddat <= now() then return jsonb_build_object('ok', false, 'code', 'MUDDAT_OTGAN'); end if;
    select count(*) into v_say from public.t2_birja_rfq_qator where rfq_id = v_rfq.id;
    if v_say = 0 then return jsonb_build_object('ok', false, 'code', 'QATORLAR_YOQ'); end if;
    if public._t2_tender_meyor_xato(v_rfq.baholash_usuli, v_rfq.meyor) is not null then return jsonb_build_object('ok', false, 'code', 'MEYOR_YIGINDI'); end if;
    if v_rfq.doira = 'taklif' then
      select coalesce(array_agg(x::bigint), '{}') into v_rec from jsonb_array_elements_text(coalesce(v_rfq.shart->'qabul', '[]'::jsonb)) x;
      if cardinality(v_rec) not between 1 and 50 then return jsonb_build_object('ok', false, 'code', 'OLUVCHILAR_NOTOGRI'); end if;
      foreach v_k in array v_rec loop
        if public._t2_yet_aloqa_faol(p_kompaniya_id, v_k) is null then return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ', 'kompaniya_id', v_k); end if;
      end loop;
      foreach v_k in array v_rec loop
        insert into public.t2_birja_rfq_oluvchi (kompaniya_id, rfq_id, oluvchi_kompaniya_id, aloqa_id)
        values (p_kompaniya_id, v_rfq.id, v_k, public._t2_yet_aloqa_faol(p_kompaniya_id, v_k)) on conflict (rfq_id, oluvchi_kompaniya_id) do nothing;
      end loop;
      v_qabul := v_rec;
    end if;
    update public.t2_birja_rfq set tasdiq_actor_id = p_actor_id, tasdiq_vaqt = now() where id = v_rfq.id;
    v_mavzu := 'tender.elon';
    v_payload := jsonb_build_object('raqam', v_rfq.raqam, 'oz_tasdiq', v_rfq.yuborgan_actor_id is not distinct from p_actor_id);
  elsif p_ga = 'takliflar_yopildi' then
    update public.t2_birja_rfq set muddat = now() where id = v_rfq.id;
  elsif p_ga = 'baholash' and v_dan = 'elon' or p_ga = 'baholash' and v_dan = 'takliflar_yopildi' then
    if v_rfq.muddat is not null and v_rfq.muddat > now() then return jsonb_build_object('ok', false, 'code', 'MUDDAT_OTMAGAN'); end if;
    select count(distinct t.kompaniya_id) into v_n from public.t2_birja_taklif t where t.rfq_id = v_rfq.id and t.holat in ('berildi', 'faol');
    update public.t2_birja_rfq set ochilgan_vaqt = now(), ochgan_actor_id = p_actor_id where id = v_rfq.id;
    v_payload := jsonb_build_object('takliflar_soni', v_n, 'raund', v_rfq.raund);
  elsif p_ga = 'shartnoma' then
    if p_shartnoma_id is null or not exists (select 1 from public.t2_shartnoma s where s.id = p_shartnoma_id and s.kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_BEGONA'); end if;
    update public.t2_birja_rfq set shartnoma_id = p_shartnoma_id where id = v_rfq.id;
    v_payload := jsonb_build_object('shartnoma_id', p_shartnoma_id);
  elsif p_ga in ('yopildi', 'bekor') then
    update public.t2_birja_taklif set holat = 'yutqazdi', versiya = versiya + 1, yangilandi = now() where rfq_id = v_rfq.id and holat in ('berildi', 'faol');
  end if;

  update public.t2_birja_rfq set holat = p_ga, versiya = versiya + 1, yangilandi = now(), oxirgi_operation_id = p_operation_id,
         yopilgan_vaqt = case when p_ga in ('yopildi', 'bekor') then now() else yopilgan_vaqt end
   where id = v_rfq.id;
  perform public._t2_tender_jurnal_yoz(p_kompaniya_id, v_rfq.id, 'holat', p_actor_id, p_kompaniya_id,
            v_payload || jsonb_build_object('dan', v_dan, 'ga', p_ga, 'izoh', left(v_izoh, 500)));
  if p_ga in ('yopildi', 'bekor') then
    select coalesce(array_agg(distinct t.kompaniya_id), '{}') into v_qabul from public.t2_birja_taklif t where t.rfq_id = v_rfq.id;
  end if;
  if p_ga in ('elon', 'yopildi', 'bekor', 'baholash') then
    perform public._t2_yet_hodisa(p_kompaniya_id, v_mavzu, 't2_birja_rfq', v_rfq.id, v_payload || jsonb_build_object('holat', p_ga),
              p_actor_id, p_operation_id, v_rfq.obyekt_id, null, v_qabul);
  end if;
  return jsonb_build_object('ok', true, 'id', v_rfq.id, 'versiya', v_rfq.versiya + 1, 'holat', p_ga);
end $$;

-- 3.3 Qayta raund (BAFO): baholash -> elon, yangi muddat; takliflar yana muhrlanadi, yetkazuvchi o'z taklifini qayta beradi.
create or replace function public.t2_tender_raund_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_rfq_id bigint, p_kutilgan_versiya integer, p_muddat timestamptz, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rfq public.t2_birja_rfq; v_izoh text := nullif(btrim(coalesce(p_izoh, '')), ''); v_qabul bigint[];
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'tasdiq');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id and kompaniya_id = p_kompaniya_id and protsess_v2 for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_rfq.oxirgi_operation_id = p_operation_id then return jsonb_build_object('ok', true, 'takror', true, 'id', v_rfq.id, 'versiya', v_rfq.versiya, 'raund', v_rfq.raund); end if;
  if v_rfq.holat <> 'baholash' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_rfq.holat); end if;
  if v_rfq.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_rfq.versiya); end if;
  if v_rfq.raund >= 3 then return jsonb_build_object('ok', false, 'code', 'RAUND_CHEGARA'); end if;
  if p_muddat is null or p_muddat <= now() then return jsonb_build_object('ok', false, 'code', 'MUDDAT_OTGAN'); end if;
  if v_izoh is null or length(v_izoh) < 3 then return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK'); end if;
  update public.t2_birja_rfq set holat = 'elon', raund = raund + 1, muddat = p_muddat, ochilgan_vaqt = null, ochgan_actor_id = null,
         versiya = versiya + 1, yangilandi = now(), oxirgi_operation_id = p_operation_id where id = v_rfq.id;
  select coalesce(array_agg(distinct t.kompaniya_id), '{}') into v_qabul from public.t2_birja_taklif t where t.rfq_id = v_rfq.id and t.holat in ('berildi', 'faol');
  perform public._t2_tender_jurnal_yoz(p_kompaniya_id, v_rfq.id, 'raund', p_actor_id, p_kompaniya_id,
            jsonb_build_object('raund', v_rfq.raund + 1, 'muddat', p_muddat, 'izoh', left(v_izoh, 500)));
  perform public._t2_yet_hodisa(p_kompaniya_id, 'tender.elon', 't2_birja_rfq', v_rfq.id, jsonb_build_object('raund', v_rfq.raund + 1, 'holat', 'elon'),
            p_actor_id, p_operation_id, v_rfq.obyekt_id, null, v_qabul);
  return jsonb_build_object('ok', true, 'id', v_rfq.id, 'versiya', v_rfq.versiya + 1, 'raund', v_rfq.raund + 1);
end $$;

-- 3.4 Yetkazuvchi taklifi (v2): v1 ni o'raydi + to'lov sharti, amal qilish muddati, kafolat; faqat e'londa, muddatgacha.
create or replace function public.t2_tender_taklif_v2(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_rfq_id bigint, p_qatorlar jsonb, p_izoh text, p_shart jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rfq public.t2_birja_rfq; v_s jsonb := coalesce(p_shart, '{}'::jsonb); v_amal integer; v_kaf integer; v_tolov text; v_qqs numeric; v_r jsonb; v_tid bigint;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'taklif');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id;
  if not found or not v_rfq.protsess_v2 or not public._t2_tender_korinadi_v2(p_rfq_id, p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if jsonb_typeof(v_s) <> 'object' then return jsonb_build_object('ok', false, 'code', 'SHART_NOTOGRI'); end if;
  if coalesce(v_s->>'amal_kun', '') <> '' then
    if v_s->>'amal_kun' !~ '^[0-9]{1,3}$' or (v_s->>'amal_kun')::integer not between 1 and 365 then return jsonb_build_object('ok', false, 'code', 'AMAL_KUN'); end if;
    v_amal := (v_s->>'amal_kun')::integer;
  end if;
  if coalesce(v_s->>'kafolat_oy', '') <> '' then
    if v_s->>'kafolat_oy' !~ '^[0-9]{1,3}$' or (v_s->>'kafolat_oy')::integer > 240 then return jsonb_build_object('ok', false, 'code', 'KAFOLAT'); end if;
    v_kaf := (v_s->>'kafolat_oy')::integer;
  end if;
  if length(coalesce(v_s->>'tolov_sharti', '')) > 500 then return jsonb_build_object('ok', false, 'code', 'MATN_UZUN'); end if;
  v_tolov := nullif(btrim(coalesce(v_s->>'tolov_sharti', '')), '');
  v_qqs := coalesce(public._t2_tender_son(v_s->>'qqs_foiz'), v_rfq.qqs_foiz);
  v_r := public.t2_tender_taklif_ber_v1(p_actor_id, p_kompaniya_id, p_operation_id, p_rfq_id, p_qatorlar, p_izoh,
           jsonb_strip_nulls(jsonb_build_object('yetkazish_narx', v_s->'yetkazish_narx', 'qqs_foiz', v_qqs)));
  if (v_r->>'ok')::boolean and coalesce((v_r->>'takror')::boolean, false) = false then
    v_tid := (v_r->>'id')::bigint;
    update public.t2_birja_taklif set tolov_sharti = v_tolov, amal_kun = v_amal, kafolat_oy = v_kaf, raund = v_rfq.raund where id = v_tid;
    perform public._t2_tender_jurnal_yoz(v_rfq.kompaniya_id, v_rfq.id, 'taklif', p_actor_id, p_kompaniya_id, jsonb_build_object('taklif_id', v_tid, 'raund', v_rfq.raund));
  end if;
  return v_r;
end $$;

-- 3.5 Taklifni qaytarib olish (v2): faqat muddatgacha, e'londa.
create or replace function public.t2_tender_taklif_qaytar_v2(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_taklif_id bigint, p_kutilgan_versiya integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t public.t2_birja_taklif; v_rfq public.t2_birja_rfq; v_r jsonb;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'taklif');
  select * into v_t from public.t2_birja_taklif where id = p_taklif_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  select * into v_rfq from public.t2_birja_rfq where id = v_t.rfq_id;
  if v_t.holat not in ('qaytarib_olindi') then
    if v_rfq.holat <> 'elon' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_rfq.holat); end if;
    if v_rfq.muddat is not null and v_rfq.muddat <= now() then return jsonb_build_object('ok', false, 'code', 'MUDDAT_OTGAN'); end if;
  end if;
  v_r := public.t2_tender_taklif_qaytar_v1(p_actor_id, p_kompaniya_id, p_operation_id, p_taklif_id, p_kutilgan_versiya);
  if (v_r->>'ok')::boolean and coalesce((v_r->>'takror')::boolean, false) = false then
    perform public._t2_tender_jurnal_yoz(v_rfq.kompaniya_id, v_rfq.id, 'taklif_qaytar', p_actor_id, p_kompaniya_id, jsonb_build_object('taklif_id', p_taklif_id));
  end if;
  return v_r;
end $$;

-- 3.6 Savol-javob. Savol: yetkazuvchi (e'londa, savol muddatigacha). Javob: xaridor; ommaviy bo'lsa hamma ishtirokchi ko'radi (savol egasi nomsiz).
create or replace function public.t2_tender_savol_ber_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_rfq_id bigint, p_savol text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rfq public.t2_birja_rfq; v_old public.t2_tender_savol; v_id bigint; v_matn text := btrim(coalesce(p_savol, ''));
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'taklif');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_old from public.t2_tender_savol where savol_kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'id', v_old.id); end if;
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id;
  if not found or not v_rfq.protsess_v2 or v_rfq.kompaniya_id = p_kompaniya_id or not public._t2_tender_korinadi_v2(p_rfq_id, p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_rfq.holat <> 'elon' or coalesce(v_rfq.savol_muddat, v_rfq.muddat) <= now() then return jsonb_build_object('ok', false, 'code', 'SAVOL_YOPIQ'); end if;
  if length(v_matn) not between 5 and 2000 then return jsonb_build_object('ok', false, 'code', 'SAVOL_NOTOGRI'); end if;
  insert into public.t2_tender_savol (kompaniya_id, rfq_id, savol_kompaniya_id, savol_actor_id, savol, operation_id)
  values (v_rfq.kompaniya_id, v_rfq.id, p_kompaniya_id, p_actor_id, v_matn, p_operation_id) returning id into v_id;
  perform public._t2_tender_jurnal_yoz(v_rfq.kompaniya_id, v_rfq.id, 'savol', p_actor_id, p_kompaniya_id, jsonb_build_object('savol_id', v_id));
  perform public._t2_yet_hodisa(p_kompaniya_id, 'tender.savol', 't2_tender_savol', v_id, jsonb_build_object('rfq_id', v_rfq.id),
            p_actor_id, p_operation_id, null, null, array[v_rfq.kompaniya_id]);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.t2_tender_javob_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_savol_id bigint, p_javob text, p_ommaviy boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.t2_tender_savol; v_rfq public.t2_birja_rfq; v_matn text := btrim(coalesce(p_javob, ''));
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'yoz');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_s from public.t2_tender_savol where id = p_savol_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_s.javob_operation_id = p_operation_id then return jsonb_build_object('ok', true, 'takror', true, 'id', v_s.id); end if;
  if v_s.javob is not null then return jsonb_build_object('ok', false, 'code', 'JAVOB_BOR'); end if;
  select * into v_rfq from public.t2_birja_rfq where id = v_s.rfq_id;
  if v_rfq.holat <> 'elon' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_rfq.holat); end if;
  if length(v_matn) not between 2 and 4000 then return jsonb_build_object('ok', false, 'code', 'JAVOB_NOTOGRI'); end if;
  update public.t2_tender_savol set javob = v_matn, javob_actor_id = p_actor_id, javob_vaqt = now(), ommaviy = coalesce(p_ommaviy, true), javob_operation_id = p_operation_id where id = v_s.id;
  perform public._t2_tender_jurnal_yoz(p_kompaniya_id, v_rfq.id, 'javob', p_actor_id, p_kompaniya_id, jsonb_build_object('savol_id', v_s.id, 'ommaviy', coalesce(p_ommaviy, true)));
  perform public._t2_yet_hodisa(p_kompaniya_id, 'tender.savol', 't2_tender_savol', v_s.id, jsonb_build_object('rfq_id', v_rfq.id, 'javob', true),
            p_actor_id, p_operation_id, null, null, array[v_s.savol_kompaniya_id]);
  return jsonb_build_object('ok', true, 'id', v_s.id);
end $$;

-- 3.7 Baholash (ball) natijasini saqlash. Jami ball serverda qayta tekshiriladi (mezon vazni bo'yicha).
create or replace function public.t2_tender_baholash_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_rfq_id bigint, p_kutilgan_versiya integer, p_ballar jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rfq public.t2_birja_rfq; v_e jsonb; v_b jsonb; k text; v jsonb; v_vazn numeric; v_s numeric; v_jami numeric; v_tid bigint; v_say integer := 0; v_ids bigint[] := '{}';
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'yoz');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id and kompaniya_id = p_kompaniya_id and protsess_v2 for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_rfq.oxirgi_operation_id = p_operation_id then return jsonb_build_object('ok', true, 'takror', true, 'versiya', v_rfq.versiya); end if;
  if v_rfq.holat <> 'baholash' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_rfq.holat); end if;
  if v_rfq.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_rfq.versiya); end if;
  if p_ballar is null or jsonb_typeof(p_ballar) <> 'array' or jsonb_array_length(p_ballar) not between 1 and 100 then return jsonb_build_object('ok', false, 'code', 'BALLAR_NOTOGRI'); end if;
  for v_e in select * from jsonb_array_elements(p_ballar) loop
    if jsonb_typeof(v_e) <> 'object' or coalesce(v_e->>'taklif_id', '') !~ '^[0-9]+$' then return jsonb_build_object('ok', false, 'code', 'BALLAR_NOTOGRI'); end if;
    v_tid := (v_e->>'taklif_id')::bigint;
    if v_tid = any (v_ids) or not exists (select 1 from public.t2_birja_taklif t where t.id = v_tid and t.rfq_id = v_rfq.id and t.holat in ('berildi', 'faol')) then
      return jsonb_build_object('ok', false, 'code', 'TAKLIF_BEGONA'); end if;
    v_ids := v_ids || v_tid;
    v_b := coalesce(v_e->'ballar', '{}'::jsonb);
    if jsonb_typeof(v_b) <> 'object' or v_b = '{}'::jsonb then return jsonb_build_object('ok', false, 'code', 'BALLAR_NOTOGRI'); end if;
    v_s := 0; v_vazn := 0;
    for k, v in select * from jsonb_each(v_b) loop
      if not (v_rfq.meyor ? k) or jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not between 0 and 100 then return jsonb_build_object('ok', false, 'code', 'BALLAR_NOTOGRI'); end if;
      v_vazn := v_vazn + (v_rfq.meyor->>k)::numeric;
      v_s := v_s + (v_rfq.meyor->>k)::numeric * (v #>> '{}')::numeric;
    end loop;
    if v_vazn <= 0 then return jsonb_build_object('ok', false, 'code', 'BALLAR_NOTOGRI'); end if;
    v_jami := round(v_s / v_vazn, 2);       -- ishlatilgan mezonlar vazni bo'yicha normallashgan (bo'sh mezon 0 hisoblanmaydi)
    insert into public.t2_tender_baho (kompaniya_id, rfq_id, taklif_id, raund, jami_ball, ballar, izoh, actor_id)
    values (p_kompaniya_id, v_rfq.id, v_tid, v_rfq.raund, v_jami, v_b, nullif(left(btrim(coalesce(v_e->>'izoh', '')), 1000), ''), p_actor_id)
    on conflict (rfq_id, taklif_id, raund) do update set jami_ball = excluded.jami_ball, ballar = excluded.ballar, izoh = excluded.izoh, actor_id = excluded.actor_id, yaratildi = now();
    v_say := v_say + 1;
  end loop;
  update public.t2_birja_rfq set versiya = versiya + 1, yangilandi = now(), oxirgi_operation_id = p_operation_id where id = v_rfq.id;
  perform public._t2_tender_jurnal_yoz(p_kompaniya_id, v_rfq.id, 'baholandi', p_actor_id, p_kompaniya_id, jsonb_build_object('raund', v_rfq.raund, 'soni', v_say));
  return jsonb_build_object('ok', true, 'id', v_rfq.id, 'versiya', v_rfq.versiya + 1, 'soni', v_say);
end $$;

-- 3.8 G'olib (v2): qator darajasida (bo'linma g'olib), asos MAJBURIY, faqat 'baholash' holatida, har taklifga alohida buyurtma.
-- p_tanlov: [{taklif_id, qator_idlar: [rfq_qator_id,...] | null (= shu taklifning hali band bo'lmagan hamma qatori)}]
create or replace function public.t2_tender_golib_v2(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_rfq_id bigint, p_kutilgan_versiya integer,
  p_tanlov jsonb, p_asos text, p_yakun boolean default true, p_shart jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rfq public.t2_birja_rfq; v_e jsonb; v_t public.t2_birja_taklif; v_aloqa bigint; v_lines jsonb; v_tqs bigint[]; v_rqs bigint[]; v_res jsonb; v_asos text := btrim(coalesce(p_asos, ''));
  v_ids bigint[] := '{}'; v_buyurtmalar bigint[] := '{}'; v_band bigint[] := '{}'; v_qat integer; v_golib integer; v_idl bigint[]; v_toliq boolean; v_tids bigint[] := '{}';
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'tasdiq');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id and kompaniya_id = p_kompaniya_id and protsess_v2 for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_rfq.oxirgi_operation_id = p_operation_id then return jsonb_build_object('ok', true, 'takror', true, 'id', v_rfq.id, 'versiya', v_rfq.versiya, 'holat', v_rfq.holat); end if;
  if v_rfq.holat <> 'baholash' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_rfq.holat); end if;
  if v_rfq.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_rfq.versiya); end if;
  if length(v_asos) < 10 then return jsonb_build_object('ok', false, 'code', 'ASOS_KERAK'); end if;
  if p_tanlov is null or jsonb_typeof(p_tanlov) <> 'array' or jsonb_array_length(p_tanlov) not between 1 and 20 then return jsonb_build_object('ok', false, 'code', 'TANLOV_NOTOGRI'); end if;
  perform set_config('tender.v2_golib', '1', true);
  for v_e in select * from jsonb_array_elements(p_tanlov) loop
    if jsonb_typeof(v_e) <> 'object' or coalesce(v_e->>'taklif_id', '') !~ '^[0-9]+$' then return jsonb_build_object('ok', false, 'code', 'TANLOV_NOTOGRI'); end if;
    select * into v_t from public.t2_birja_taklif where id = (v_e->>'taklif_id')::bigint and rfq_id = v_rfq.id and holat in ('berildi', 'faol', 'golib') for update;
    if not found or v_t.id = any (v_ids) or v_t.kompaniya_id = p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'TAKLIF_YOQ'); end if;
    v_ids := v_ids || v_t.id;
    if jsonb_typeof(v_e->'qator_idlar') = 'array' then
      select coalesce(array_agg(x::bigint), '{}') into v_idl from jsonb_array_elements_text(v_e->'qator_idlar') x where x ~ '^[0-9]+$';
      if cardinality(v_idl) = 0 then return jsonb_build_object('ok', false, 'code', 'QATORLAR_YOQ'); end if;
    else v_idl := null; end if;
    select array_agg(tq.id order by q.qator_no), array_agg(q.id order by q.qator_no) into v_tqs, v_rqs
      from public.t2_birja_taklif_qator tq join public.t2_birja_rfq_qator q on q.id = tq.rfq_qator_id
     where tq.taklif_id = v_t.id and q.golib_taklif_qator_id is null and (v_idl is null or q.id = any (v_idl));
    if v_rqs is null then return jsonb_build_object('ok', false, 'code', 'QATORLAR_YOQ'); end if;
    if v_idl is not null and cardinality(v_rqs) <> (select count(distinct x) from unnest(v_idl) x) then return jsonb_build_object('ok', false, 'code', 'QATOR_BAND'); end if;
    if v_rqs && v_band then return jsonb_build_object('ok', false, 'code', 'QATOR_TAKROR'); end if;
    v_band := v_band || v_rqs;
    v_aloqa := public._t2_yet_aloqa_faol(p_kompaniya_id, v_t.kompaniya_id);
    if v_aloqa is null then return jsonb_build_object('ok', false, 'code', 'ALOQA_KERAK', 'kompaniya_id', v_t.kompaniya_id); end if;
    select coalesce(jsonb_agg(jsonb_build_object('nom', q.nom, 'birlik', q.birlik, 'miqdor', coalesce(tq.mavjud_miqdor, q.miqdor), 'narx', tq.narx, 'muddat_kun', tq.muddat_kun,
             'resurs_kodi', q.resurs_kodi, 'zayavka_id', q.zayavka_id, 'rfq_qator_id', q.id, 'taklif_qator_id', tq.id) order by q.qator_no), '[]'::jsonb) into v_lines
      from public.t2_birja_taklif_qator tq join public.t2_birja_rfq_qator q on q.id = tq.rfq_qator_id where tq.id = any (v_tqs);
    v_res := public._t2_buyurtma_yarat_ichki(p_actor_id, p_kompaniya_id, md5(p_operation_id::text || ':' || v_t.id)::uuid, v_rfq.tur, v_t.kompaniya_id, v_aloqa, v_rfq.id, v_t.id,
               v_rfq.obyekt_id, v_lines, coalesce(p_shart, '{}'::jsonb), v_t.yetkazish_narx, v_t.qqs_foiz, left(v_asos, 500));
    if not coalesce((v_res->>'ok')::boolean, false) then return v_res; end if;
    v_buyurtmalar := v_buyurtmalar || (v_res->>'id')::bigint;
    update public.t2_birja_rfq_qator q set golib_taklif_qator_id = tq.id from public.t2_birja_taklif_qator tq where tq.id = any (v_tqs) and q.id = tq.rfq_qator_id;
    update public.t2_birja_taklif set holat = 'golib', versiya = versiya + 1, yangilandi = now() where id = v_t.id;
    v_tids := v_tids || v_t.kompaniya_id;
  end loop;
  select count(*), count(golib_taklif_qator_id) into v_qat, v_golib from public.t2_birja_rfq_qator where rfq_id = v_rfq.id;
  v_toliq := v_qat = v_golib;
  if v_toliq or coalesce(p_yakun, true) then
    update public.t2_birja_taklif set holat = 'yutqazdi', versiya = versiya + 1, yangilandi = now() where rfq_id = v_rfq.id and holat in ('berildi', 'faol');
    update public.t2_birja_rfq set holat = 'golib_tanlandi', golib_asos = v_asos, golib_vaqt = now(), yopilgan_vaqt = now(), versiya = versiya + 1, yangilandi = now(), oxirgi_operation_id = p_operation_id where id = v_rfq.id;
  else
    update public.t2_birja_rfq set golib_asos = coalesce(golib_asos || E'\n', '') || v_asos, versiya = versiya + 1, yangilandi = now(), oxirgi_operation_id = p_operation_id where id = v_rfq.id;
  end if;
  perform public._t2_tender_jurnal_yoz(p_kompaniya_id, v_rfq.id, 'golib', p_actor_id, p_kompaniya_id,
            jsonb_build_object('buyurtmalar', to_jsonb(v_buyurtmalar), 'taklif_idlar', to_jsonb(v_ids), 'toliq', v_toliq, 'asos', left(v_asos, 500)));
  perform public._t2_yet_hodisa(p_kompaniya_id, 'tender.golib', 't2_birja_rfq', v_rfq.id, jsonb_build_object('buyurtmalar', to_jsonb(v_buyurtmalar), 'toliq', v_toliq),
            p_actor_id, p_operation_id, v_rfq.obyekt_id, null, coalesce((select array_agg(distinct t.kompaniya_id) from public.t2_birja_taklif t where t.rfq_id = v_rfq.id), '{}'));
  return jsonb_build_object('ok', true, 'id', v_rfq.id, 'versiya', v_rfq.versiya + 1, 'buyurtma_idlar', to_jsonb(v_buyurtmalar),
                            'holat', case when v_toliq or coalesce(p_yakun, true) then 'golib_tanlandi' else 'baholash' end);
end $$;

-- 3.9 Yetkazuvchi reytingi: yetkazilgan buyurtmadan keyin xaridor 1..5 ball beradi (t2_baho, manba = t2_buyurtma).
create or replace function public.t2_tender_baho_ber_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_buyurtma_id bigint, p_ball integer, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b public.t2_buyurtma; v_old public.t2_baho;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'yoz');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_old from public.t2_baho where baholovchi_kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'id', v_old.id); end if;
  if p_ball is null or p_ball not between 1 and 5 then return jsonb_build_object('ok', false, 'code', 'BALL_NOTOGRI'); end if;
  select * into v_b from public.t2_buyurtma where id = p_buyurtma_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_b.holat not in ('qabul_qilindi_yakuniy', 'qisman', 'nizo') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_b.holat); end if;
  if exists (select 1 from public.t2_baho b where b.baholovchi_kompaniya_id = p_kompaniya_id and b.manba_jadval = 't2_buyurtma' and b.manba_id = v_b.id) then
    return jsonb_build_object('ok', false, 'code', 'BAHO_BOR'); end if;
  insert into public.t2_baho (baholovchi_kompaniya_id, baholovchi_actor_id, baholangan_kompaniya_id, manba_jadval, manba_id, ball, izoh, operation_id)
  values (p_kompaniya_id, p_actor_id, v_b.ijrochi_kompaniya_id, 't2_buyurtma', v_b.id, p_ball, nullif(left(btrim(coalesce(p_izoh, '')), 1000), ''), p_operation_id);
  if v_b.rfq_id is not null then
    perform public._t2_tender_jurnal_yoz(p_kompaniya_id, v_b.rfq_id, 'reyting', p_actor_id, p_kompaniya_id, jsonb_build_object('buyurtma_id', v_b.id, 'ball', p_ball));
  end if;
  return jsonb_build_object('ok', true, 'buyurtma_id', v_b.id);
end $$;

-- 3.10 Fayl havolasi (fayl R2 da; faqat metadata). Tender fayllari — xaridor (qoralamada); taklif fayllari — yetkazuvchi (muddatgacha). Har biri <= 20 ta.
create or replace function public.t2_tender_fayl_bogla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_rfq_id bigint, p_hujjat_idlar bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rfq public.t2_birja_rfq; v_n integer; v_r jsonb;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'yoz');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id and kompaniya_id = p_kompaniya_id and protsess_v2 for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_rfq.holat <> 'qoralama' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_rfq.holat); end if;
  if p_hujjat_idlar is null or cardinality(p_hujjat_idlar) not between 1 and 10 then return jsonb_build_object('ok', false, 'code', 'HUJJAT_NOTOGRI'); end if;
  select count(*) into v_n from public.t2_primitiv_dalil where primitiv = 'tender' and primitiv_id = v_rfq.id and holat = 'faol';
  if v_n + cardinality(p_hujjat_idlar) > 20 then return jsonb_build_object('ok', false, 'code', 'FAYL_CHEGARA'); end if;
  v_r := public._t2_yet_dalil_yoz(p_kompaniya_id, p_actor_id, 'tender', v_rfq.id, p_hujjat_idlar);
  if (v_r->>'ok')::boolean then
    perform public._t2_tender_jurnal_yoz(p_kompaniya_id, v_rfq.id, 'fayl', p_actor_id, p_kompaniya_id, jsonb_build_object('soni', v_r->'soni'));
  end if;
  return v_r;
end $$;

create or replace function public.t2_tender_taklif_fayl_bogla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_taklif_id bigint, p_hujjat_idlar bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t public.t2_birja_taklif; v_rfq public.t2_birja_rfq; v_n integer;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'taklif');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_t from public.t2_birja_taklif where id = p_taklif_id and kompaniya_id = p_kompaniya_id and holat in ('berildi', 'faol') for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  select * into v_rfq from public.t2_birja_rfq where id = v_t.rfq_id;
  if v_rfq.holat <> 'elon' or (v_rfq.muddat is not null and v_rfq.muddat <= now()) then return jsonb_build_object('ok', false, 'code', 'MUDDAT_OTGAN'); end if;
  if p_hujjat_idlar is null or cardinality(p_hujjat_idlar) not between 1 and 10 then return jsonb_build_object('ok', false, 'code', 'HUJJAT_NOTOGRI'); end if;
  select count(*) into v_n from public.t2_primitiv_dalil where primitiv = 'tender_taklif' and primitiv_id = v_t.id and holat = 'faol';
  if v_n + cardinality(p_hujjat_idlar) > 20 then return jsonb_build_object('ok', false, 'code', 'FAYL_CHEGARA'); end if;
  return public._t2_yet_dalil_yoz(p_kompaniya_id, p_actor_id, 'tender_taklif', v_t.id, p_hujjat_idlar);
end $$;

-- ───────────────────────── 4. O'QUVCHI RPC lar (stable; /api/sb GET orqali) ─────────────────────────
-- 4.1 Ro'yxat: 'meniki' (xaridor) | 'menga' (taklif qilingan) | 'ochiq' (ochiq e'lonlar, minimal maydon).
create or replace function public.t2_tender_royxat_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text default 'meniki', p_tur text default null, p_holat text default null, p_limit integer default 50, p_keyin_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lim integer := least(greatest(coalesce(p_limit, 50), 1), 100); v_res jsonb;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'korish');
  if p_yonalish not in ('meniki', 'menga', 'ochiq') then return jsonb_build_object('ok', false, 'code', 'YONALISH_NOTOGRI'); end if;
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into v_res from (
    select jsonb_build_object('id', r.id, 'raqam', r.raqam, 'nom', r.nom, 'tur', r.tur, 'holat', r.holat,
             'effektiv_holat', case when r.holat = 'elon' and r.muddat is not null and r.muddat <= now() then 'takliflar_yopildi' else r.holat end,
             'doira', r.doira, 'muddat', r.muddat, 'raund', r.raund, 'versiya', r.versiya, 'yaratildi', r.yaratilgan_vaqt, 'valyuta', r.valyuta, 'qqs_foiz', r.qqs_foiz,
             'egasi', r.kompaniya_id = p_kompaniya_id,
             'egasi_kompaniya_id', r.kompaniya_id,
             'egasi_nom', case when r.kompaniya_id <> p_kompaniya_id then (select k.nom from public.t2_kompaniya k where k.id = r.kompaniya_id) end,
             'byudjet_qqs_bilan', case when r.kompaniya_id = p_kompaniya_id or r.byudjet_korsatish then r.byudjet_qqs_bilan end,
             'qator_soni', (select count(*) from public.t2_birja_rfq_qator q where q.rfq_id = r.id),
             'lot_soni', (select count(distinct q.lot_no) from public.t2_birja_rfq_qator q where q.rfq_id = r.id),
             'takliflar_soni', case when r.kompaniya_id = p_kompaniya_id then (select count(distinct t.kompaniya_id) from public.t2_birja_taklif t where t.rfq_id = r.id and t.holat in ('berildi', 'faol', 'golib')) end,
             'mening_taklifim', (select jsonb_build_object('id', t.id, 'holat', t.holat, 'versiya', t.versiya, 'raund', t.raund) from public.t2_birja_taklif t
                                  where t.rfq_id = r.id and t.kompaniya_id = p_kompaniya_id and t.holat in ('berildi', 'faol', 'golib', 'yutqazdi') order by t.id desc limit 1)) as x
      from public.t2_birja_rfq r
     where r.protsess_v2
       and (case p_yonalish
              when 'meniki' then r.kompaniya_id = p_kompaniya_id
              when 'menga' then r.kompaniya_id <> p_kompaniya_id and r.doira = 'taklif' and public._t2_tender_korinadi_v2(r.id, p_kompaniya_id)
              else r.kompaniya_id <> p_kompaniya_id and r.doira = 'ochiq' and r.holat = 'elon' and (r.muddat is null or r.muddat > now()) end)
       and (p_tur is null or r.tur = p_tur) and (p_holat is null or r.holat = p_holat) and (p_keyin_id is null or r.id < p_keyin_id)
     order by r.id desc limit v_lim) s;
  return jsonb_build_object('ok', true, 'qatorlar', v_res, 'keyingi_id', case when jsonb_array_length(v_res) = v_lim then (v_res->(v_lim - 1)->>'id')::bigint end);
end $$;

-- 4.2 Tafsilot: muhrlash qoidasi shu yerda. Xaridor takliflarni faqat OCHILGANDAN keyin ko'radi; yetkazuvchi — faqat o'z taklifini.
create or replace function public.t2_tender_tafsilot_v2(p_actor_id bigint, p_kompaniya_id bigint, p_rfq_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rfq public.t2_birja_rfq; v_egasi boolean; v_ochilgan boolean; v_eh text;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id and protsess_v2;
  if not found or not public._t2_tender_korinadi_v2(p_rfq_id, p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  v_egasi := v_rfq.kompaniya_id = p_kompaniya_id;
  v_ochilgan := v_rfq.ochilgan_vaqt is not null and v_rfq.holat in ('baholash', 'golib_tanlandi', 'shartnoma', 'bajarilmoqda', 'yopildi', 'bekor');
  v_eh := case when v_rfq.holat = 'elon' and v_rfq.muddat is not null and v_rfq.muddat <= now() then 'takliflar_yopildi' else v_rfq.holat end;
  return jsonb_build_object('ok', true, 'egasi', v_egasi, 'ochilgan', v_ochilgan,
    'ruxsat', jsonb_build_object('yoz', public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'procurement.write'),
                                 'tasdiq', public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'procurement.approve'),
                                 'taklif', public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'supply.offer')),
    'rfq', jsonb_build_object('id', v_rfq.id, 'raqam', v_rfq.raqam, 'nom', v_rfq.nom, 'tur', v_rfq.tur, 'holat', v_rfq.holat, 'effektiv_holat', v_eh, 'doira', v_rfq.doira,
             'muddat', v_rfq.muddat, 'savol_muddat', v_rfq.savol_muddat, 'izoh', v_rfq.izoh, 'tolov_sharti', v_rfq.tolov_sharti, 'valyuta', v_rfq.valyuta, 'qqs_foiz', v_rfq.qqs_foiz,
             'baholash_usuli', v_rfq.baholash_usuli, 'meyor', v_rfq.meyor, 'raund', v_rfq.raund, 'versiya', v_rfq.versiya, 'ochilgan_vaqt', case when v_ochilgan then v_rfq.ochilgan_vaqt end,
             'byudjet_qqs_bilan', case when v_egasi or v_rfq.byudjet_korsatish then v_rfq.byudjet_qqs_bilan end, 'byudjet_korsatish', v_rfq.byudjet_korsatish,
             'obyekt_id', case when v_egasi then v_rfq.obyekt_id end, 'shartnoma_id', case when v_egasi then v_rfq.shartnoma_id end,
             'qabul_kompaniya_idlar', case when v_egasi then coalesce(v_rfq.shart->'qabul', '[]'::jsonb) end,
             'golib_asos', case when v_egasi then v_rfq.golib_asos end, 'tasdiq_vaqt', v_rfq.tasdiq_vaqt, 'yaratildi', v_rfq.yaratilgan_vaqt,
             'yuborgan_actor_id', case when v_egasi then v_rfq.yuborgan_actor_id end, 'tasdiq_actor_id', case when v_egasi then v_rfq.tasdiq_actor_id end),
    'qatorlar', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'qator_no', q.qator_no, 'lot_no', q.lot_no, 'lot_nom', q.lot_nom, 'nom', q.nom, 'birlik', q.birlik, 'miqdor', q.miqdor,
             'talab_sana', q.talab_sana, 'yetkazish_joyi', q.yetkazish_joyi, 'spets', q.spets, 'resurs_kodi', q.resurs_kodi,
             'zayavka_id', case when v_egasi then q.zayavka_id end,
             'golib_taklif_qator_id', case when v_egasi then q.golib_taklif_qator_id end,
             'mening_yutganim', case when not v_egasi then exists (select 1 from public.t2_birja_taklif_qator tq join public.t2_birja_taklif t on t.id = tq.taklif_id
                                                                    where tq.id = q.golib_taklif_qator_id and t.kompaniya_id = p_kompaniya_id) end) order by q.qator_no)
             from public.t2_birja_rfq_qator q where q.rfq_id = v_rfq.id), '[]'::jsonb),
    'takliflar_soni', case when v_egasi then (select count(distinct t.kompaniya_id) from public.t2_birja_taklif t where t.rfq_id = v_rfq.id and t.holat in ('berildi', 'faol', 'golib', 'yutqazdi')) end,
    'takliflar', case when v_egasi and not v_ochilgan then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'yetkazuvchi_kompaniya_id', t.kompaniya_id,
             'yetkazuvchi_nom', case when v_egasi then (select k.nom from public.t2_kompaniya k where k.id = t.kompaniya_id) end,
             'holat', t.holat, 'versiya', t.versiya, 'raund', t.raund, 'narx', t.narx, 'yetkazish_narx', t.yetkazish_narx, 'qqs_foiz', t.qqs_foiz, 'tolov_sharti', t.tolov_sharti,
             'amal_kun', t.amal_kun, 'kafolat_oy', t.kafolat_oy, 'izoh', t.izoh, 'yaratildi', t.yaratilgan_vaqt,
             'reyting', case when v_egasi then (select jsonb_build_object('ball', round(avg(b.ball), 2), 'soni', count(*)) from public.t2_baho b where b.baholangan_kompaniya_id = t.kompaniya_id) end,
             'qatorlar', coalesce((select jsonb_agg(jsonb_build_object('rfq_qator_id', tq.rfq_qator_id, 'taklif_qator_id', tq.id, 'narx', tq.narx, 'muddat_kun', tq.muddat_kun,
                          'mavjud_miqdor', tq.mavjud_miqdor, 'izoh', tq.izoh) order by tq.rfq_qator_id) from public.t2_birja_taklif_qator tq where tq.taklif_id = t.id), '[]'::jsonb)) order by t.id)
             from public.t2_birja_taklif t
            where t.rfq_id = v_rfq.id and t.holat in ('berildi', 'faol', 'golib', 'yutqazdi') and (v_egasi or t.kompaniya_id = p_kompaniya_id)), '[]'::jsonb) end,
    'savollar', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'savol', s.savol, 'javob', s.javob, 'javob_vaqt', s.javob_vaqt, 'ommaviy', s.ommaviy, 'yaratildi', s.yaratildi,
             'meniki', s.savol_kompaniya_id = p_kompaniya_id,
             'savol_nom', case when v_egasi then (select k.nom from public.t2_kompaniya k where k.id = s.savol_kompaniya_id) end) order by s.id)
             from public.t2_tender_savol s
            where s.rfq_id = v_rfq.id and (v_egasi or s.savol_kompaniya_id = p_kompaniya_id or (s.ommaviy and s.javob is not null))), '[]'::jsonb),
    'fayllar', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'hujjat_id', d.hujjat_id, 'primitiv', d.primitiv, 'primitiv_id', d.primitiv_id, 'turi', r.document_type, 'yaratildi', d.yaratildi) order by d.id)
             from public.t2_primitiv_dalil d join public.t2_document_registry r on r.id = d.hujjat_id
            where d.holat = 'faol' and ((d.primitiv = 'tender' and d.primitiv_id = v_rfq.id)
                   or (d.primitiv = 'tender_taklif' and d.primitiv_id in (select t.id from public.t2_birja_taklif t where t.rfq_id = v_rfq.id and (t.kompaniya_id = p_kompaniya_id or (v_egasi and v_ochilgan)))))), '[]'::jsonb),
    'baholar', case when v_egasi and v_ochilgan then coalesce((select jsonb_agg(jsonb_build_object('taklif_id', b.taklif_id, 'raund', b.raund, 'jami_ball', b.jami_ball, 'ballar', b.ballar, 'izoh', b.izoh) order by b.id)
             from public.t2_tender_baho b where b.rfq_id = v_rfq.id), '[]'::jsonb) else '[]'::jsonb end,
    'jurnal', case when v_egasi then coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'hodisa', j.hodisa, 'actor_id', j.actor_id, 'payload', j.payload, 'yaratildi', j.yaratildi) order by j.id)
             from public.t2_tender_jurnal j where j.rfq_id = v_rfq.id and (v_ochilgan or j.hodisa not in ('taklif', 'taklif_qaytar'))), '[]'::jsonb) else '[]'::jsonb end,
    'buyurtmalar', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'holat', o.holat, 'bosqich', o.bosqich, 'summa_nds_siz', o.summa_nds_siz, 'yetkazish_narx', o.yetkazish_narx, 'qqs_foiz', o.qqs_foiz,
             'ijrochi_kompaniya_id', o.ijrochi_kompaniya_id,
             'ijrochi_nom', (select k.nom from public.t2_kompaniya k where k.id = o.ijrochi_kompaniya_id),
             'yaratildi', o.yaratildi,
             'qatorlar', (select jsonb_agg(jsonb_build_object('nom', oq.nom, 'birlik', oq.birlik, 'miqdor', oq.miqdor, 'narx', oq.narx, 'qabul_miqdor', oq.qabul_miqdor, 'qabul_holat', oq.qabul_holat) order by oq.qator_no)
                           from public.t2_buyurtma_qator oq where oq.buyurtma_id = o.id),
             'baho', (select b.ball from public.t2_baho b where b.baholovchi_kompaniya_id = o.kompaniya_id and b.manba_jadval = 't2_buyurtma' and b.manba_id = o.id)) order by o.id)
             from public.t2_buyurtma o where o.rfq_id = v_rfq.id and (o.kompaniya_id = p_kompaniya_id or o.ijrochi_kompaniya_id = p_kompaniya_id)), '[]'::jsonb));
end $$;

-- 4.3 Taklif qilish mumkin bo'lgan yetkazuvchilar (faol aloqa) + reyting.
create or replace function public.t2_tender_yetkazuvchilar_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'korish');
  return jsonb_build_object('ok', true, 'qatorlar', coalesce((
    select jsonb_agg(jsonb_build_object('kompaniya_id', k.id, 'nom', k.nom,
             'reyting_ball', (select round(avg(b.ball), 2) from public.t2_baho b where b.baholangan_kompaniya_id = k.id),
             'baho_soni', (select count(*) from public.t2_baho b where b.baholangan_kompaniya_id = k.id),
             'buyurtma_soni', (select count(*) from public.t2_buyurtma o where o.kompaniya_id = p_kompaniya_id and o.ijrochi_kompaniya_id = k.id)) order by k.nom)
      from public.t2_kompaniya k
     where k.id <> p_kompaniya_id and coalesce(k.faol, true) and public._t2_yet_aloqa_faol(p_kompaniya_id, k.id) is not null), '[]'::jsonb));
end $$;

-- 4.4 Tahlil: byudjetga nisbatan tejam (QQS bilan), takliflar soni, aylanish vaqti, yetkazuvchi reytingi. Noma'lum = NULL.
create or replace function public.t2_tender_tahlil_v1(p_actor_id bigint, p_kompaniya_id bigint, p_dan date default null, p_gacha date default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_tenderlar jsonb; v_holat jsonb; v_yet jsonb; v_jami jsonb;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'korish');
  with t as (
    select r.id, r.raqam, r.nom, r.holat, r.tur, r.valyuta, r.byudjet_qqs_bilan, r.yaratilgan_vaqt, r.tasdiq_vaqt, r.golib_vaqt, r.raund,
           (select count(distinct x.kompaniya_id) from public.t2_birja_taklif x where x.rfq_id = r.id and x.holat in ('berildi', 'faol', 'golib', 'yutqazdi')) as ishtirokchi,
           (select case when count(*) = 0 or bool_or(o.summa_nds_siz is null) then null
                        else round(sum(o.summa_nds_siz * (1 + coalesce(o.qqs_foiz, r.qqs_foiz) / 100) + coalesce(o.yetkazish_narx, 0) * (1 + coalesce(o.qqs_foiz, r.qqs_foiz) / 100)), 2) end
              from public.t2_buyurtma o where o.rfq_id = r.id and o.holat <> 'bekor' and o.kompaniya_id = r.kompaniya_id) as golib_qqs_bilan
      from public.t2_birja_rfq r
     where r.kompaniya_id = p_kompaniya_id and r.protsess_v2 and r.holat <> 'qoralama'
       and (p_dan is null or r.yaratilgan_vaqt::date >= p_dan) and (p_gacha is null or r.yaratilgan_vaqt::date <= p_gacha))
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'raqam', t.raqam, 'nom', t.nom, 'holat', t.holat, 'tur', t.tur, 'valyuta', t.valyuta, 'byudjet_qqs_bilan', t.byudjet_qqs_bilan,
           'golib_qqs_bilan', t.golib_qqs_bilan, 'ishtirokchi', t.ishtirokchi, 'raund', t.raund,
           'tejam_qqs_bilan', case when t.byudjet_qqs_bilan is not null and t.golib_qqs_bilan is not null then t.byudjet_qqs_bilan - t.golib_qqs_bilan end,
           'aylanish_kun', case when t.golib_vaqt is not null and t.tasdiq_vaqt is not null then round(extract(epoch from t.golib_vaqt - t.tasdiq_vaqt) / 86400.0, 1) end) order by t.id desc), '[]'::jsonb)
    into v_tenderlar from t;
  select coalesce(jsonb_object_agg(h, n), '{}'::jsonb) into v_holat from (
    select r.holat as h, count(*) as n from public.t2_birja_rfq r where r.kompaniya_id = p_kompaniya_id and r.protsess_v2
       and (p_dan is null or r.yaratilgan_vaqt::date >= p_dan) and (p_gacha is null or r.yaratilgan_vaqt::date <= p_gacha) group by r.holat) q;
  select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', k.id, 'nom', k.nom, 'reyting_ball', k.ball, 'baho_soni', k.soni, 'buyurtma_soni', k.buyurtma) order by k.buyurtma desc, k.ball desc nulls last), '[]'::jsonb) into v_yet from (
    select c.id, c.nom, (select round(avg(b.ball), 2) from public.t2_baho b where b.baholangan_kompaniya_id = c.id) as ball,
           (select count(*) from public.t2_baho b where b.baholangan_kompaniya_id = c.id) as soni, count(o.id) as buyurtma
      from public.t2_buyurtma o join public.t2_kompaniya c on c.id = o.ijrochi_kompaniya_id
     where o.kompaniya_id = p_kompaniya_id and o.rfq_id is not null and o.holat <> 'bekor'
     group by c.id, c.nom order by count(o.id) desc limit 20) k;
  select jsonb_build_object(
      'tender_soni', jsonb_array_length(v_tenderlar),
      'ortacha_ishtirokchi', (select round(avg((x->>'ishtirokchi')::numeric), 1) from jsonb_array_elements(v_tenderlar) x where (x->>'holat') not in ('tasdiqlashda', 'elon') ),
      'jami_tejam_qqs_bilan', (select sum((x->>'tejam_qqs_bilan')::numeric) from jsonb_array_elements(v_tenderlar) x where x->>'tejam_qqs_bilan' is not null),
      'tejam_hisoblangan_soni', (select count(*) from jsonb_array_elements(v_tenderlar) x where x->>'tejam_qqs_bilan' is not null),
      'ortacha_aylanish_kun', (select round(avg((x->>'aylanish_kun')::numeric), 1) from jsonb_array_elements(v_tenderlar) x where x->>'aylanish_kun' is not null))
    into v_jami;
  return jsonb_build_object('ok', true, 'jami', v_jami, 'holat_boyicha', v_holat, 'tenderlar', v_tenderlar, 'yetkazuvchilar', v_yet);
end $$;

-- ───────────────────────── 5. Ruxsatlar ─────────────────────────
-- v1 RPC lar BUZILMAYDI (L0 kelishuvi): grantlar o'zgarmaydi. Muhr/tasdiq aylanib o'tilmasligi uchun:
--   * t2_tender_golib_v1 -> t2_birja_rfq_qator triggeri (protsess_v2 tenderda faqat t2_tender_golib_v2 yo'li);
--   * t2_tender_yop_v1 va boshqa holat sakrashlari -> t2_birja_rfq triggeri (protsess_v2 tenderda faqat ruxsat etilgan o'tishlar);
--   * t2_tender_tafsilot_v1 -> quyida qayta ta'riflanadi: protsess_v2 tenderda xaridorga takliflar OCHILGUNCHA qaytmaydi (boshqa hammasi aynan o'sha).
-- Eslatma: t2_tender_elon_v1 eski (tasdiqsiz) oqim sifatida qoladi — yangi oqim t2_tender_saqla_v1 -> t2_tender_otish_v1 (shlyuzga faqat yangisi ulangan).
create or replace function public.t2_tender_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_rfq_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rfq public.t2_birja_rfq; v_egasi boolean;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id;
  if not found or not public._t2_tender_korinadi(p_rfq_id, p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  v_egasi := v_rfq.kompaniya_id = p_kompaniya_id;
  return jsonb_build_object('ok', true, 'egasi', v_egasi,
    'rfq', jsonb_build_object('id', v_rfq.id, 'nom', v_rfq.nom, 'tur', v_rfq.tur, 'holat', v_rfq.holat, 'doira', v_rfq.doira, 'muddat', v_rfq.muddat,
             'izoh', v_rfq.izoh, 'shart', v_rfq.shart, 'versiya', v_rfq.versiya, 'obyekt_id', case when v_egasi then v_rfq.obyekt_id end),
    'qatorlar', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'qator_no', q.qator_no, 'nom', q.nom, 'birlik', q.birlik, 'miqdor', q.miqdor, 'resurs_kodi', q.resurs_kodi,
             'zayavka_id', case when v_egasi then q.zayavka_id end, 'golib_taklif_qator_id', case when v_egasi then q.golib_taklif_qator_id end) order by q.qator_no)
             from public.t2_birja_rfq_qator q where q.rfq_id = v_rfq.id), '[]'::jsonb),
    'takliflar', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'yetkazuvchi_kompaniya_id', t.kompaniya_id,
             'yetkazuvchi_nom', case when v_egasi then (select k.nom from public.t2_kompaniya k where k.id = t.kompaniya_id) end,
             'holat', t.holat, 'versiya', t.versiya, 'narx', t.narx, 'yetkazish_narx', t.yetkazish_narx, 'qqs_foiz', t.qqs_foiz, 'izoh', t.izoh, 'yaratildi', t.yaratilgan_vaqt,
             'qatorlar', coalesce((select jsonb_agg(jsonb_build_object('rfq_qator_id', tq.rfq_qator_id, 'taklif_qator_id', tq.id, 'narx', tq.narx, 'muddat_kun', tq.muddat_kun,
                          'mavjud_miqdor', tq.mavjud_miqdor, 'izoh', tq.izoh) order by tq.rfq_qator_id) from public.t2_birja_taklif_qator tq where tq.taklif_id = t.id), '[]'::jsonb)) order by t.id)
             from public.t2_birja_taklif t
            where t.rfq_id = v_rfq.id and t.holat in ('berildi', 'faol', 'golib', 'yutqazdi') and (v_egasi or t.kompaniya_id = p_kompaniya_id)
              and (not v_rfq.protsess_v2 or not v_egasi or (v_rfq.ochilgan_vaqt is not null and v_rfq.holat in ('baholash', 'golib_tanlandi', 'shartnoma', 'bajarilmoqda', 'yopildi', 'bekor')))), '[]'::jsonb));
end $$;

revoke all on function
  public._t2_tender_azo(bigint,bigint,text), public._t2_tender_jurnal_yoz(bigint,bigint,text,bigint,bigint,jsonb), public._t2_tender_otish_ruxsat(text,text),
  public._t2_tender_korinadi_v2(bigint,bigint), public._t2_tender_son(text), public._t2_tender_meyor_xato(text,jsonb),
  public._t2_tender_jurnal_qoriqchi(), public._t2_tender_golib_qoriqchi(), public._t2_tender_holat_qoriqchi()
  from public, anon, authenticated;
revoke all on function
  public.t2_tender_saqla_v1(bigint,bigint,uuid,bigint,integer,text,text,bigint[],bigint,timestamptz,jsonb,jsonb),
  public.t2_tender_otish_v1(bigint,bigint,uuid,bigint,integer,text,text,bigint),
  public.t2_tender_raund_v1(bigint,bigint,uuid,bigint,integer,timestamptz,text),
  public.t2_tender_taklif_v2(bigint,bigint,uuid,bigint,jsonb,text,jsonb),
  public.t2_tender_taklif_qaytar_v2(bigint,bigint,uuid,bigint,integer),
  public.t2_tender_savol_ber_v1(bigint,bigint,uuid,bigint,text),
  public.t2_tender_javob_v1(bigint,bigint,uuid,bigint,text,boolean),
  public.t2_tender_baholash_saqla_v1(bigint,bigint,uuid,bigint,integer,jsonb),
  public.t2_tender_golib_v2(bigint,bigint,uuid,bigint,integer,jsonb,text,boolean,jsonb),
  public.t2_tender_baho_ber_v1(bigint,bigint,uuid,bigint,integer,text),
  public.t2_tender_fayl_bogla_v1(bigint,bigint,uuid,bigint,bigint[]),
  public.t2_tender_taklif_fayl_bogla_v1(bigint,bigint,uuid,bigint,bigint[]),
  public.t2_tender_royxat_v1(bigint,bigint,text,text,text,integer,bigint),
  public.t2_tender_tafsilot_v2(bigint,bigint,bigint),
  public.t2_tender_yetkazuvchilar_v1(bigint,bigint),
  public.t2_tender_tahlil_v1(bigint,bigint,date,date)
  from public, anon, authenticated;
grant execute on function
  public.t2_tender_saqla_v1(bigint,bigint,uuid,bigint,integer,text,text,bigint[],bigint,timestamptz,jsonb,jsonb),
  public.t2_tender_otish_v1(bigint,bigint,uuid,bigint,integer,text,text,bigint),
  public.t2_tender_raund_v1(bigint,bigint,uuid,bigint,integer,timestamptz,text),
  public.t2_tender_taklif_v2(bigint,bigint,uuid,bigint,jsonb,text,jsonb),
  public.t2_tender_taklif_qaytar_v2(bigint,bigint,uuid,bigint,integer),
  public.t2_tender_savol_ber_v1(bigint,bigint,uuid,bigint,text),
  public.t2_tender_javob_v1(bigint,bigint,uuid,bigint,text,boolean),
  public.t2_tender_baholash_saqla_v1(bigint,bigint,uuid,bigint,integer,jsonb),
  public.t2_tender_golib_v2(bigint,bigint,uuid,bigint,integer,jsonb,text,boolean,jsonb),
  public.t2_tender_baho_ber_v1(bigint,bigint,uuid,bigint,integer,text),
  public.t2_tender_fayl_bogla_v1(bigint,bigint,uuid,bigint,bigint[]),
  public.t2_tender_taklif_fayl_bogla_v1(bigint,bigint,uuid,bigint,bigint[]),
  public.t2_tender_royxat_v1(bigint,bigint,text,text,text,integer,bigint),
  public.t2_tender_tafsilot_v2(bigint,bigint,bigint),
  public.t2_tender_yetkazuvchilar_v1(bigint,bigint),
  public.t2_tender_tahlil_v1(bigint,bigint,date,date)
  to service_role;
