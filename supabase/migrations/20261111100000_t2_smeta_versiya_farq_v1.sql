-- 20261111100000 — SMETA VERSIYASI → FARQ → DA'VO (PTO-CORE-001, 1-bosqich; egasi 2026-10-26).
--
-- MUAMMO: ekspertizagacha smeta tizimda alohida versiya emas — faqat nomida «(ekspertizagacha)» bo'lgan bo'limlar
-- (frontend ESKI_SMETA regex). «Qurilgan, lekin ekspertiza kesgan» hajm va pul hech qayerda ko'rinmaydi.
--
-- AUDIT XULOSASI (mavjudini kengaytirish imkoni):
--   * t2_smeta_revision — JORIY t2_qator ning chiziqli ledgeri (seq 0 = asl, seq N = tasdiqlangan o'zgarishdan keyin).
--     Kamida 6 ta o'qiydigan funksiya (`order by seq desc limit 1` → F2 qatoridagi revision_id, nakopitelniy
--     `joriy_revision_id`, forma3, workbench) eng oxirgi qatorni «amaldagi smeta» deb oladi. Bu yerga faol EMAS tashqi
--     versiya qo'shilsa F2 revision bog'lanishi buziladi. Snapshot — bitta jsonb (1,4 MB gacha): pozitsiya bo'yicha
--     holat/qaror saqlash uchun yaramaydi. ⇒ KANONIK bo'lib qoladi (joriy smeta ledgeri), o'zgartirilmaydi; yangi versiya
--     unga `bazaviy_revision_id` bilan (solishtirish paytidagi amaldagi revision) havola qiladi.
--   * t2_smeta_ozgarish(+_qator) — tasdiqlanganda t2_qator.hajm/narx ni O'ZGARTIRADI (asl smeta CONST qoidasiga zid
--     yo'l) va AddRepl yo'lida «abadiy qoralama». Da'vo (kelishilmagan, faqat egasi qarori) uchun ishlatilmaydi —
--     2-bosqichda kelishilgan da'vo shu reestrga «kelishildi» holatida o'tkaziladi (qoplama sifatida).
--   * t2_addrepl_command — faqat idempotentlik jurnali; smeta-reimport-diff / SmetaYuklaNative — faqat brauzerdagi
--     preview (bazaga hech narsa yozmaydi).
--   ⇒ Yangi uchta jadval — «tashqi manba versiyasi» (faqat solishtirish uchun, hech qachon amalda emas), uning LRV
--     pozitsiyalari va joriy t2_qator bilan moslik + egasi qarori. t2_qator, t2_smeta_revision, t2_smeta_ozgarish
--     O'ZGARMAYDI.
--
-- QOIDALAR: asl smeta CONST (t2_qator ga yozilmaydi); NULL ≠ 0 (hajm noma'lum — NULL); pul bu yerda saqlanmaydi
-- (narx joriy smeta katalogidan frontend'da hisoblanadi: ustamasiz + ustamali, NDS faqat oxirida); faktni avtomatik
-- yozish yo'q — `t2_smeta_versiya_dava` faqat o'qish modeli.
-- Yozish: security definer RPC (a'zolik + smeta.write, operation_id idempotent, optimistik versiya); o'qish: shlyuz
-- (/api/sb, kompaniya siyosati). Jadvallarga anon/authenticated kirishi yo'q.
begin;

-- ───────────────────────────── 1. Versiya sarlavhasi ─────────────────────────────
create table if not exists public.t2_smeta_versiya (
  id                  bigint generated always as identity primary key,
  kompaniya_id        bigint not null,
  obyekt_id           bigint not null references public.t2_obyekt(id),
  nom                 text not null check (btrim(nom) <> ''),
  tur                 text not null check (tur in ('dastlabki','ekspertizaga_topshirilgan','ekspertiza','korrektirovka','boshqa')),
  manba_sana          date,
  manba_fayllar       jsonb not null default '[]'::jsonb check (jsonb_typeof(manba_fayllar) = 'array'),
  manba_hujjat_id     bigint,                 -- t2_document_registry (R2), ixtiyoriy
  bazaviy_revision_id bigint references public.t2_smeta_revision(id),
  holat               text not null default 'yuklanmoqda' check (holat in ('yuklanmoqda','tayyor','bekor')),
  pozitsiya_soni      integer not null default 0,
  izoh                text,
  actor_id            bigint not null,
  operation_id        uuid not null unique,
  yaratildi           timestamptz not null default now(),
  yangilandi          timestamptz not null default now(),
  bekor_actor_id      bigint,
  bekor_vaqt          timestamptz,
  bekor_sabab         text
);
create index if not exists t2_smeta_versiya_obyekt_ix on public.t2_smeta_versiya (obyekt_id, holat);
comment on table public.t2_smeta_versiya is
  'PTO-CORE-001: obyekt smetasining TASHQI manba versiyasi (ekspertizagacha / ekspertizaga topshirilgan / ekspertiza / korrektirovka). FAQAT solishtirish uchun — hech qachon amaldagi smeta emas; t2_qator va t2_smeta_revision ga tegmaydi.';

-- ───────────────────────────── 2. Versiya pozitsiyalari (LRV) ─────────────────────────────
create table if not exists public.t2_smeta_versiya_pozitsiya (
  id            bigint generated always as identity primary key,
  versiya_id    bigint not null references public.t2_smeta_versiya(id),
  kompaniya_id  bigint not null,
  tartib        integer not null check (tartib >= 0),
  ls_kod        text,                 -- lokal smeta kodi («03-03»)
  ls_nom        text,
  razdel        text,
  blok          text,
  raqam         text,                 -- LRV dagi № p/p
  kod           text,                 -- shifr
  nom           text not null,
  birlik        text,
  hajm          numeric,              -- NULL = faylda yo'q (0 EMAS)
  resurslar     jsonb not null default '[]'::jsonb check (jsonb_typeof(resurslar) = 'array'),  -- [{kod,nom,birlik,norma,hajm}]
  manba         jsonb,                -- {fayl, varaq, qator}
  unique (versiya_id, tartib)
);
comment on table public.t2_smeta_versiya_pozitsiya is
  'PTO-CORE-001: tashqi smeta versiyasining LRV pozitsiyalari (shifr, nom, birlik, hajm, resurslar). Narx saqlanmaydi — joriy smeta katalogidan.';

-- ───────────────────────────── 3. Moslik + inson tasdig'i + egasi qarori ─────────────────────────────
create table if not exists public.t2_smeta_versiya_moslik (
  id              bigint generated always as identity primary key,
  versiya_id      bigint not null references public.t2_smeta_versiya(id),
  kompaniya_id    bigint not null,
  pozitsiya_id    bigint references public.t2_smeta_versiya_pozitsiya(id),
  qator_id        bigint,             -- joriy t2_qator (bl / mustaqil mat/ob); FK YO'Q — smeta qayta yuklansa ham tarix qoladi
  holat           text not null check (holat in ('ozgarmagan','kamaygan','oshgan','almashtirilgan','ochirilgan','yangi','noaniq')),
  ishonch         smallint check (ishonch between 0 and 100),
  usul            text,
  birlik_farq     boolean not null default false,
  eski_hajm       numeric,
  joriy_hajm      numeric,            -- moslash paytidagi t2_qator.hajm (snapshot)
  joriy_kod       text,
  joriy_nom       text,
  joriy_birlik    text,
  tasdiq          text not null default 'avto' check (tasdiq in ('avto','kutilmoqda','tasdiqlandi','rad')),
  tasdiq_actor_id bigint,
  tasdiq_vaqt     timestamptz,
  qaror           text not null default 'kutilmoqda' check (qaror in ('kutilmoqda','qurilgan','qurilmagan','qisman')),
  qurilgan_hajm   numeric check (qurilgan_hajm is null or qurilgan_hajm >= 0),
  qaror_izoh      text,
  qaror_actor_id  bigint,
  qaror_vaqt      timestamptz,
  versiya         integer not null default 1,
  yaratildi       timestamptz not null default now(),
  constraint t2_smeta_versiya_moslik_tomon check (pozitsiya_id is not null or qator_id is not null),
  constraint t2_smeta_versiya_moslik_qisman check (qaror <> 'qisman' or qurilgan_hajm is not null),
  constraint t2_smeta_versiya_moslik_yangi check ((holat = 'yangi') = (pozitsiya_id is null)),
  constraint t2_smeta_versiya_moslik_ochirilgan check ((holat = 'ochirilgan') = (qator_id is null))
);
create unique index if not exists t2_smeta_versiya_moslik_poz_uq on public.t2_smeta_versiya_moslik (versiya_id, pozitsiya_id) where pozitsiya_id is not null;
create unique index if not exists t2_smeta_versiya_moslik_qator_uq on public.t2_smeta_versiya_moslik (versiya_id, qator_id) where qator_id is not null;
create index if not exists t2_smeta_versiya_moslik_versiya_ix on public.t2_smeta_versiya_moslik (versiya_id, holat);
comment on table public.t2_smeta_versiya_moslik is
  'PTO-CORE-001: versiya pozitsiyasi ↔ joriy t2_qator moslik (holat, ishonch %, inson tasdig''i) va egasi qarori (qurilgan / qurilmagan / qisman hajm). Da''vo hajmi: t2_smeta_versiya_dava_hajm().';

alter table public.t2_smeta_versiya          enable row level security;
alter table public.t2_smeta_versiya_pozitsiya enable row level security;
alter table public.t2_smeta_versiya_moslik    enable row level security;
revoke all on public.t2_smeta_versiya, public.t2_smeta_versiya_pozitsiya, public.t2_smeta_versiya_moslik from public, anon, authenticated;

-- ───────────────────────────── 4. Da'vo hajmi (yagona qoida; frontend lib/smeta-versiya/dava.ts bilan bir xil) ─────────────────────────────
-- Egasi qarori (2026-10-26): ekspertiza kesgan, lekin qurilgan hajm — fakt, HIMOYA qilinadi (avtomatik minus emas).
--   qurilgan → qurilgan hajm = eski (versiya) hajmi; qisman → kiritilgan hajm; qurilmagan / kutilmoqda → da'vo yo'q (NULL).
--   o'chirilgan / almashtirilgan → da'vo = qurilgan hajm (joriy smetada bu ish yo'q);
--   boshqa holat → max(qurilgan − joriy hajm, 0); joriy hajm noma'lum yoki birlik farq qilsa — NULL (to'qilmaydi).
create or replace function public.t2_smeta_versiya_dava_hajm(
  p_holat text, p_qaror text, p_eski_hajm numeric, p_qurilgan_hajm numeric, p_joriy_hajm numeric, p_birlik_farq boolean)
returns numeric language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_qaror not in ('qurilgan','qisman') then null
    when (case when p_qaror = 'qurilgan' then p_eski_hajm else p_qurilgan_hajm end) is null then null
    when p_holat in ('ochirilgan','almashtirilgan') then (case when p_qaror = 'qurilgan' then p_eski_hajm else p_qurilgan_hajm end)
    when p_holat = 'yangi' then null
    when p_joriy_hajm is null or coalesce(p_birlik_farq, false) then null
    else greatest((case when p_qaror = 'qurilgan' then p_eski_hajm else p_qurilgan_hajm end) - p_joriy_hajm, 0)
  end
$$;

-- ───────────────────────────── 5. Yozuvchi RPC lar ─────────────────────────────
create or replace function public.t2_smeta_versiya_yarat_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_nom text, p_tur text,
  p_manba_sana date, p_manba_fayllar jsonb, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_prev jsonb; v_id bigint; v_rev bigint; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH');
  end if;
  if coalesce(btrim(p_nom), '') = '' then return jsonb_build_object('ok', false, 'code', 'NOM_MAJBURIY'); end if;
  if p_tur is null or p_tur not in ('dastlabki','ekspertizaga_topshirilgan','ekspertiza','korrektirovka','boshqa') then
    return jsonb_build_object('ok', false, 'code', 'TUR_INVALID');
  end if;
  if p_manba_fayllar is not null and (jsonb_typeof(p_manba_fayllar) <> 'array' or jsonb_array_length(p_manba_fayllar) > 200) then
    return jsonb_build_object('ok', false, 'code', 'MANBA_FAYLLAR_INVALID');
  end if;
  select id into v_rev from public.t2_smeta_revision where obyekt_id = p_obyekt_id order by seq desc limit 1;
  insert into public.t2_smeta_versiya (kompaniya_id, obyekt_id, nom, tur, manba_sana, manba_fayllar, bazaviy_revision_id, izoh, actor_id, operation_id)
  values (p_kompaniya_id, p_obyekt_id, left(btrim(p_nom), 300), p_tur, p_manba_sana, coalesce(p_manba_fayllar, '[]'::jsonb), v_rev,
          nullif(left(btrim(coalesce(p_izoh, '')), 2000), ''), p_actor_id, p_operation_id)
  returning id into v_id;
  v_res := jsonb_build_object('ok', true, 'versiya_id', v_id, 'bazaviy_revision_id', v_rev);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'smeta_versiya_yarat', v_res);
  return v_res;
end $function$;

-- Pozitsiyalar bo'lak-bo'lak (≤1000) yoziladi; faqat «yuklanmoqda» holatida; takror tartib — o'tkazib yuboriladi.
create or replace function public.t2_smeta_versiya_pozitsiya_yoz_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_versiya_id bigint, p_pozitsiyalar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_prev jsonb; v_v public.t2_smeta_versiya; v_n int; v_yangi int; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  select * into v_v from public.t2_smeta_versiya where id = p_versiya_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'VERSIYA_TOPILMADI'); end if;
  if v_v.holat <> 'yuklanmoqda' then return jsonb_build_object('ok', false, 'code', 'VERSIYA_YOPIQ'); end if;
  if p_pozitsiyalar is null or jsonb_typeof(p_pozitsiyalar) <> 'array' or jsonb_array_length(p_pozitsiyalar) = 0 or jsonb_array_length(p_pozitsiyalar) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'POZITSIYALAR_INVALID');
  end if;
  if exists (select 1 from jsonb_array_elements(p_pozitsiyalar) e
              where nullif(e->>'tartib', '') is null or (e->>'tartib')::int < 0 or coalesce(btrim(e->>'nom'), '') = ''
                 or (e ? 'resurslar' and (jsonb_typeof(e->'resurslar') <> 'array' or jsonb_array_length(e->'resurslar') > 300))) then
    return jsonb_build_object('ok', false, 'code', 'POZITSIYALAR_INVALID');
  end if;
  v_n := jsonb_array_length(p_pozitsiyalar);
  with ins as (
    insert into public.t2_smeta_versiya_pozitsiya (versiya_id, kompaniya_id, tartib, ls_kod, ls_nom, razdel, blok, raqam, kod, nom, birlik, hajm, resurslar, manba)
    select p_versiya_id, p_kompaniya_id, (e->>'tartib')::int,
           left(e->>'ls_kod', 60), left(e->>'ls_nom', 500), left(e->>'razdel', 500), left(e->>'blok', 500), left(e->>'raqam', 30),
           left(e->>'kod', 160), left(btrim(e->>'nom'), 2000), left(e->>'birlik', 80),
           case when jsonb_typeof(e->'hajm') = 'number' then (e->>'hajm')::numeric else null end,
           coalesce(e->'resurslar', '[]'::jsonb), case when jsonb_typeof(e->'manba') = 'object' then e->'manba' else null end
      from jsonb_array_elements(p_pozitsiyalar) e
    on conflict (versiya_id, tartib) do nothing
    returning 1)
  select count(*) into v_yangi from ins;
  update public.t2_smeta_versiya set pozitsiya_soni = (select count(*) from public.t2_smeta_versiya_pozitsiya where versiya_id = p_versiya_id), yangilandi = now()
   where id = p_versiya_id;
  v_res := jsonb_build_object('ok', true, 'yozildi', v_yangi, 'otkazildi', v_n - v_yangi);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'smeta_versiya_pozitsiya_yoz', v_res);
  return v_res;
end $function$;

-- Avtomatik moslik (frontend dvigateli natijasi) bo'lak-bo'lak; p_yakunla — har pozitsiyada moslik borligini tekshirib «tayyor».
-- Element: {tartib|null, qator_id|null, holat, ishonch, usul, birlik_farq, eski_hajm, joriy_hajm, joriy_kod, joriy_nom, joriy_birlik}.
create or replace function public.t2_smeta_versiya_moslik_yoz_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_versiya_id bigint, p_mosliklar jsonb, p_yakunla boolean, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_prev jsonb; v_v public.t2_smeta_versiya; v_yangi int := 0; v_n int := 0; v_qolgan int; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  select * into v_v from public.t2_smeta_versiya where id = p_versiya_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'VERSIYA_TOPILMADI'); end if;
  if v_v.holat <> 'yuklanmoqda' then return jsonb_build_object('ok', false, 'code', 'VERSIYA_YOPIQ'); end if;
  if p_mosliklar is not null and (jsonb_typeof(p_mosliklar) <> 'array' or jsonb_array_length(p_mosliklar) > 2000) then
    return jsonb_build_object('ok', false, 'code', 'MOSLIKLAR_INVALID');
  end if;

  drop table if exists _sv_moslik;
  create temp table _sv_moslik on commit drop as
    select nullif(e->>'tartib', '')::int as tartib, nullif(e->>'qator_id', '')::bigint as qator_id, e->>'holat' as holat,
           case when jsonb_typeof(e->'ishonch') = 'number' then least(100, greatest(0, round((e->>'ishonch')::numeric)))::smallint end as ishonch,
           left(e->>'usul', 200) as usul, coalesce((e->>'birlik_farq')::boolean, false) as birlik_farq,
           case when jsonb_typeof(e->'eski_hajm') = 'number' then (e->>'eski_hajm')::numeric end as eski_hajm,
           case when jsonb_typeof(e->'joriy_hajm') = 'number' then (e->>'joriy_hajm')::numeric end as joriy_hajm,
           left(e->>'joriy_kod', 160) as joriy_kod, left(e->>'joriy_nom', 2000) as joriy_nom, left(e->>'joriy_birlik', 80) as joriy_birlik
      from jsonb_array_elements(coalesce(p_mosliklar, '[]'::jsonb)) e;
  select count(*) into v_n from _sv_moslik;
  if v_n > 0 then
    if exists (select 1 from _sv_moslik where holat is null or holat not in ('ozgarmagan','kamaygan','oshgan','almashtirilgan','ochirilgan','yangi','noaniq')
                 or (tartib is null and qator_id is null) or ((holat = 'yangi') <> (tartib is null)) or ((holat = 'ochirilgan') <> (qator_id is null))) then
      return jsonb_build_object('ok', false, 'code', 'MOSLIKLAR_INVALID');
    end if;
    if exists (select 1 from _sv_moslik m where m.tartib is not null
                 and not exists (select 1 from public.t2_smeta_versiya_pozitsiya p where p.versiya_id = p_versiya_id and p.tartib = m.tartib)) then
      return jsonb_build_object('ok', false, 'code', 'POZITSIYA_TOPILMADI');
    end if;
    -- Joriy qator shu obyektniki bo'lishi shart (tenant + obyekt chegarasi).
    if exists (select 1 from _sv_moslik m where m.qator_id is not null
                 and not exists (select 1 from public.t2_qator q where q.id = m.qator_id and q.obyekt_id = v_v.obyekt_id and q.kompaniya_id = p_kompaniya_id)) then
      return jsonb_build_object('ok', false, 'code', 'QATOR_SCOPE_MISMATCH');
    end if;
  end if;

  -- Yakunlash: tekshiruv YOZISHDAN OLDIN (chala bo'lsa bu bo'lak ham yozilmaydi — hammasi yoki hech narsa).
  if coalesce(p_yakunla, false) then
    select count(*) into v_qolgan from public.t2_smeta_versiya_pozitsiya p
     where p.versiya_id = p_versiya_id
       and not exists (select 1 from public.t2_smeta_versiya_moslik m where m.pozitsiya_id = p.id)
       and not exists (select 1 from _sv_moslik k where k.tartib = p.tartib);
    if v_qolgan > 0 then
      return jsonb_build_object('ok', false, 'code', 'MOSLIK_TOLIQ_EMAS', 'qolgan', v_qolgan);
    end if;
    if not exists (select 1 from public.t2_smeta_versiya_pozitsiya where versiya_id = p_versiya_id) then
      return jsonb_build_object('ok', false, 'code', 'POZITSIYA_YOQ');
    end if;
  end if;

  if v_n > 0 then
    with ins as (
      insert into public.t2_smeta_versiya_moslik (versiya_id, kompaniya_id, pozitsiya_id, qator_id, holat, ishonch, usul, birlik_farq,
                                                  eski_hajm, joriy_hajm, joriy_kod, joriy_nom, joriy_birlik, tasdiq)
      select p_versiya_id, p_kompaniya_id, p.id, m.qator_id, m.holat, m.ishonch, m.usul, m.birlik_farq,
             coalesce(m.eski_hajm, p.hajm), m.joriy_hajm, m.joriy_kod, m.joriy_nom, m.joriy_birlik,
             case when m.holat = 'noaniq' or coalesce(m.ishonch, 100) < 90 then 'kutilmoqda' else 'avto' end
        from _sv_moslik m
        left join public.t2_smeta_versiya_pozitsiya p on p.versiya_id = p_versiya_id and p.tartib = m.tartib
      on conflict do nothing
      returning 1)
    select count(*) into v_yangi from ins;
  end if;

  if coalesce(p_yakunla, false) then
    update public.t2_smeta_versiya set holat = 'tayyor', yangilandi = now() where id = p_versiya_id;
  end if;

  v_res := jsonb_build_object('ok', true, 'yozildi', v_yangi, 'otkazildi', v_n - v_yangi, 'tayyor', coalesce(p_yakunla, false));
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'smeta_versiya_moslik_yoz', v_res);
  return v_res;
end $function$;

-- Inson tasdig'i va egasi qarori (bir chaqiruvda ko'p qator, hammasi yoki hech biri; optimistik versiya).
-- Element: {moslik_id, kutilgan_versiya, tasdiq?: 'tasdiqlandi'|'rad', qaror?: 'kutilmoqda'|'qurilgan'|'qurilmagan'|'qisman',
--           qurilgan_hajm?, izoh?}. «rad» — moslik ajratiladi: eski pozitsiya «o'chirilgan», joriy qator «yangi» bo'ladi.
create or replace function public.t2_smeta_versiya_qaror_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_versiya_id bigint, p_qarorlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_prev jsonb; v_v public.t2_smeta_versiya; v_ziddiyat jsonb; v_n int; r record; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  select * into v_v from public.t2_smeta_versiya where id = p_versiya_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'VERSIYA_TOPILMADI'); end if;
  if v_v.holat <> 'tayyor' then return jsonb_build_object('ok', false, 'code', 'VERSIYA_TAYYOR_EMAS'); end if;
  if p_qarorlar is null or jsonb_typeof(p_qarorlar) <> 'array' or jsonb_array_length(p_qarorlar) = 0 or jsonb_array_length(p_qarorlar) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'QARORLAR_INVALID');
  end if;

  drop table if exists _sv_qaror;
  create temp table _sv_qaror on commit drop as
    select nullif(e->>'moslik_id', '')::bigint as moslik_id, nullif(e->>'kutilgan_versiya', '')::int as kutilgan,
           nullif(e->>'tasdiq', '') as tasdiq, nullif(e->>'qaror', '') as qaror,
           case when jsonb_typeof(e->'qurilgan_hajm') = 'number' then (e->>'qurilgan_hajm')::numeric end as qurilgan_hajm,
           e ? 'izoh' as izoh_bor, nullif(left(btrim(coalesce(e->>'izoh', '')), 2000), '') as izoh
      from jsonb_array_elements(p_qarorlar) e;
  select count(*) into v_n from _sv_qaror;
  if exists (select 1 from _sv_qaror where moslik_id is null or kutilgan is null
               or (tasdiq is not null and tasdiq not in ('tasdiqlandi','rad'))
               or (qaror is not null and qaror not in ('kutilmoqda','qurilgan','qurilmagan','qisman'))
               or (qaror = 'qisman' and qurilgan_hajm is null) or coalesce(qurilgan_hajm, 0) < 0
               or (tasdiq is null and qaror is null and not izoh_bor))
     or (select count(distinct moslik_id) from _sv_qaror) <> v_n then
    return jsonb_build_object('ok', false, 'code', 'QARORLAR_INVALID');
  end if;
  if exists (select 1 from _sv_qaror k left join public.t2_smeta_versiya_moslik m on m.id = k.moslik_id and m.versiya_id = p_versiya_id where m.id is null) then
    return jsonb_build_object('ok', false, 'code', 'MOSLIK_TOPILMADI');
  end if;
  -- Qaror faqat eski pozitsiyasi bor qatorga; «rad» faqat ikki tomoni bor (juft) moslikka.
  if exists (select 1 from _sv_qaror k join public.t2_smeta_versiya_moslik m on m.id = k.moslik_id
              where (k.qaror is not null and m.pozitsiya_id is null)
                 or (k.tasdiq = 'rad' and (m.pozitsiya_id is null or m.qator_id is null))) then
    return jsonb_build_object('ok', false, 'code', 'QAROR_MOS_EMAS');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('moslik_id', m.id, 'versiya', m.versiya)), '[]'::jsonb) into v_ziddiyat
    from _sv_qaror k join public.t2_smeta_versiya_moslik m on m.id = k.moslik_id where m.versiya <> k.kutilgan;
  if jsonb_array_length(v_ziddiyat) > 0 then
    return jsonb_build_object('ok', false, 'code', 'VERSIYA_ZIDDIYAT', 'ziddiyatlar', v_ziddiyat);
  end if;

  -- Rad etilgan juftlar: eski tomoni «o'chirilgan» bo'ladi (pastdagi update), joriy tomoni yangi «yangi» qator (keyin).
  drop table if exists _sv_rad;
  create temp table _sv_rad on commit drop as
    select m.* from _sv_qaror k join public.t2_smeta_versiya_moslik m on m.id = k.moslik_id where k.tasdiq = 'rad';
  update public.t2_smeta_versiya_moslik m
     set qator_id = case when k.tasdiq = 'rad' then null else m.qator_id end,
         holat = case when k.tasdiq = 'rad' then 'ochirilgan' else m.holat end,
         birlik_farq = case when k.tasdiq = 'rad' then false else m.birlik_farq end,
         joriy_hajm = case when k.tasdiq = 'rad' then null else m.joriy_hajm end,
         joriy_kod = case when k.tasdiq = 'rad' then null else m.joriy_kod end,
         joriy_nom = case when k.tasdiq = 'rad' then null else m.joriy_nom end,
         joriy_birlik = case when k.tasdiq = 'rad' then null else m.joriy_birlik end,
         usul = case when k.tasdiq = 'rad' then 'inson: moslik rad etildi' else m.usul end,
         tasdiq = coalesce(k.tasdiq, m.tasdiq),
         tasdiq_actor_id = case when k.tasdiq is not null then p_actor_id else m.tasdiq_actor_id end,
         tasdiq_vaqt = case when k.tasdiq is not null then now() else m.tasdiq_vaqt end,
         qaror = coalesce(k.qaror, m.qaror),
         qurilgan_hajm = case when k.qaror is null then m.qurilgan_hajm when k.qaror = 'qisman' then k.qurilgan_hajm else null end,
         qaror_izoh = case when k.izoh_bor then k.izoh else m.qaror_izoh end,
         qaror_actor_id = case when k.qaror is not null or k.izoh_bor then p_actor_id else m.qaror_actor_id end,
         qaror_vaqt = case when k.qaror is not null or k.izoh_bor then now() else m.qaror_vaqt end,
         versiya = m.versiya + 1
    from _sv_qaror k
   where m.id = k.moslik_id;
  for r in select * from _sv_rad loop
    insert into public.t2_smeta_versiya_moslik (versiya_id, kompaniya_id, pozitsiya_id, qator_id, holat, ishonch, usul, joriy_hajm, joriy_kod, joriy_nom, joriy_birlik,
                                                tasdiq, tasdiq_actor_id, tasdiq_vaqt)
    values (r.versiya_id, r.kompaniya_id, null, r.qator_id, 'yangi', null, 'inson: moslik rad etildi (#' || r.id || ')', r.joriy_hajm, r.joriy_kod, r.joriy_nom, r.joriy_birlik,
            'tasdiqlandi', p_actor_id, now());
  end loop;

  update public.t2_smeta_versiya set yangilandi = now() where id = p_versiya_id;
  v_res := jsonb_build_object('ok', true, 'yangilandi', v_n);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'smeta_versiya_qaror', v_res);
  return v_res;
end $function$;

create or replace function public.t2_smeta_versiya_bekor_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_versiya_id bigint, p_sabab text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_prev jsonb; v_n int; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  update public.t2_smeta_versiya set holat = 'bekor', bekor_actor_id = p_actor_id, bekor_vaqt = now(),
         bekor_sabab = nullif(left(btrim(coalesce(p_sabab, '')), 1000), ''), yangilandi = now()
   where id = p_versiya_id and kompaniya_id = p_kompaniya_id and holat <> 'bekor';
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'TOPILMADI_YOKI_BEKOR'); end if;
  v_res := jsonb_build_object('ok', true, 'versiya_id', p_versiya_id);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'smeta_versiya_bekor', v_res);
  return v_res;
end $function$;

-- ───────────────────────────── 6. Fakt bilan bog'liqlik — FAQAT O'QISH modeli (E) ─────────────────────────────
-- «Bajarilgan, smetadan tashqari / da'vo» chelagi: egasi «qurilgan»/«qisman» degan pozitsiyalar. Fakt jurnali shu
-- ro'yxatni «smetadan tashqari bajarilgan» sifatida KO'RSATADI; faktga avtomatik yozilmaydi.
create or replace view public.t2_smeta_versiya_dava with (security_invoker = true) as
select v.kompaniya_id, v.obyekt_id, v.id as versiya_id, v.nom as versiya_nom, v.tur as versiya_tur, v.manba_sana,
       m.id as moslik_id, m.pozitsiya_id, m.qator_id, m.holat, m.ishonch, m.tasdiq, m.birlik_farq,
       p.ls_kod, p.ls_nom, p.razdel, p.blok, p.kod, p.nom, p.birlik,
       m.eski_hajm, m.joriy_hajm,
       case when m.qaror = 'qurilgan' then m.eski_hajm else m.qurilgan_hajm end as qurilgan_hajm,
       public.t2_smeta_versiya_dava_hajm(m.holat, m.qaror, m.eski_hajm, m.qurilgan_hajm, m.joriy_hajm, m.birlik_farq) as dava_hajm,
       m.qaror, m.qaror_izoh, m.qaror_actor_id, m.qaror_vaqt
  from public.t2_smeta_versiya_moslik m
  join public.t2_smeta_versiya v on v.id = m.versiya_id
  join public.t2_smeta_versiya_pozitsiya p on p.id = m.pozitsiya_id
 where v.holat = 'tayyor' and m.qaror in ('qurilgan','qisman');
comment on view public.t2_smeta_versiya_dava is
  'PTO-CORE-001 (E): «bajarilgan, smetadan tashqari / da''vo» — egasi qurilgan deb belgilagan va joriy smetada yo''q/kam hajm. Faqat o''qish; dava_hajm NULL = hisoblab bo''lmadi (birlik farq / joriy hajm noma''lum).';
revoke all on public.t2_smeta_versiya_dava from public, anon, authenticated;

revoke all on function public.t2_smeta_versiya_dava_hajm(text, text, numeric, numeric, numeric, boolean) from public, anon, authenticated;
revoke all on function public.t2_smeta_versiya_yarat_v1(bigint, bigint, bigint, text, text, date, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_smeta_versiya_pozitsiya_yoz_v1(bigint, bigint, bigint, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.t2_smeta_versiya_moslik_yoz_v1(bigint, bigint, bigint, jsonb, boolean, uuid) from public, anon, authenticated;
revoke all on function public.t2_smeta_versiya_qaror_v1(bigint, bigint, bigint, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.t2_smeta_versiya_bekor_v1(bigint, bigint, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_smeta_versiya_dava_hajm(text, text, numeric, numeric, numeric, boolean) to service_role;
grant execute on function public.t2_smeta_versiya_yarat_v1(bigint, bigint, bigint, text, text, date, jsonb, text, uuid) to service_role;
grant execute on function public.t2_smeta_versiya_pozitsiya_yoz_v1(bigint, bigint, bigint, jsonb, uuid) to service_role;
grant execute on function public.t2_smeta_versiya_moslik_yoz_v1(bigint, bigint, bigint, jsonb, boolean, uuid) to service_role;
grant execute on function public.t2_smeta_versiya_qaror_v1(bigint, bigint, bigint, jsonb, uuid) to service_role;
grant execute on function public.t2_smeta_versiya_bekor_v1(bigint, bigint, bigint, text, uuid) to service_role;
grant select on public.t2_smeta_versiya, public.t2_smeta_versiya_pozitsiya, public.t2_smeta_versiya_moslik, public.t2_smeta_versiya_dava to service_role;

commit;
