-- T2-AI-ISHCHILAR-001: FON AI ISHCHILARI (kompaniya va tizim darajasi) — yagona ish dvigateli.
-- ADDITIV: yangi jadval/funksiyalar + t2_agent_kuzatuv_url ga 3 ixtiyoriy ustun + t2_osuvchi_taklif.tur ga 2 yangi qiymat. BEGIN/COMMIT yo'q.
--
-- NIMA: ish navbati (t2_ai_ish) -> SQL «quruq» bajaruvchi (deterministik faktlar, LLMsiz) -> natija inbox (t2_ai_natija) -> ixtiyoriy AI xulosa
--   (Pages Function: aiHisobli — limit/hamyon tekshiruvi MAVJUD t2_agent_sarf_tekshir_v1 orqali; token kompaniya hamyonidan yechiladi).
--   Ishchilar: kunlik_nazoratchi, hujjat_tekshiruvchi, narx_kuzatuvchi (kompaniya); tizim_sogligi, internet_kuzatuvchi (tizim, superadmin).
-- QOIDALAR: hamma ishchi sukut bo'yicha O'CHIQ (t2_ai_sozlama.yoqilgan=false). Agent FAQAT o'qiydi va taklif/signal/inbox yozadi — pul, hujjat,
--   smeta, F2 ga HECH QACHON yozmaydi. Internetdan kelgan matn faqat t2_osuvchi_taklif (egasi navbati) ga TAKLIF bo'lib tushadi; o'zi qoida/narx/kodga aylanmaydi.
--   Limit tugasa: ish `limit` holatiga o'tadi, token yechilmaydi, lekin deterministik fakt ro'yxati (quruq natija) baribir inboxga chiqadi.
--
-- HAJM (baza ≈489/500 MB — byudjet yo'q; hammasi ataylab kichik):
--   t2_ai_ishchi    5 qator (~2 KB)            t2_ai_sozlama   kompaniya x ishchi, ~150 B/qator (o'nlab qator)
--   t2_ai_ish       ~400 B/qator; faktlar AI tugagach tozalanadi; 45 kundan keyin O'CHADI (t2_ai_jadval_v1)
--   t2_ai_natija    ≤ ~5 KB/qator (bandlar <= 12 KB cheklov); ish bilan birga 45 kunda o'chadi (cascade)
--   Real: 10 kompaniya x 3 ishchi x kunlik = ~30 ish/kun -> 45 kunda ~1350 qator ≈ 4-6 MB EN YOMON holat; hozir ~0 (hamma o'chiq).
--   t2_agent_kuzatuv_url: +3 ustun (har biri qisqa matn/son), qatorlar soni <=100.
-- RETENTION: t2_ai_jadval_v1 har ishga tushganda 45 kundan eski ish/natijani o'chiradi (lazy + pg_cron */10).
--
-- CRON: pg_cron `t2-ai-ishchi-jadval` (har 10 daqiqada): navbatga qo'yish (kunlik/haftalik) + SQL qadamlarni bajarish + tiqilganlarni tiklash + tozalash.
--   AI xulosa va internet yuklash (tarmoq kerak) — Pages Function /api/ai-ishchi-bajar (GitHub Actions .github/workflows/ai-ishchilar.yml, sir: KUZATUV_KALIT).
set local statement_timeout = '300s';

-- ---------------------------------------------------------------- jadvallar
create table if not exists public.t2_ai_ishchi (
  kod text primary key check (kod ~ '^[a-z0-9_]{3,40}$'),
  doira text not null check (doira in ('kompaniya', 'tizim')),
  nom text not null check (length(nom) between 3 and 80),
  tavsif text not null check (length(tavsif) between 10 and 600),
  kirish jsonb not null default '{}'::jsonb,
  vositalar text[] not null default '{}',
  chiqish jsonb not null default '{}'::jsonb,
  model_daraja text not null default 'fast' check (model_daraja in ('fast', 'coding', 'reasoning')),
  sukut_jadval text not null default 'qolda' check (sukut_jadval in ('qolda', 'kunlik', 'haftalik')),
  ai_bor boolean not null default true,
  faol boolean not null default true,
  versiya integer not null default 1
);

create table if not exists public.t2_ai_sozlama (
  id bigint generated always as identity primary key,
  kompaniya_id bigint references public.t2_kompaniya(id) on delete cascade,        -- NULL = tizim ishchisi
  ishchi_kod text not null references public.t2_ai_ishchi(kod),
  yoqilgan boolean not null default false,
  jadval text not null default 'qolda' check (jadval in ('qolda', 'kunlik', 'haftalik')),
  soat smallint not null default 1 check (soat between 0 and 23),                    -- UTC soat (Toshkent = UTC+5)
  ai_xulosa boolean not null default true,                                           -- false = faqat quruq (LLMsiz) rejim
  max_token_ish integer not null default 3000 check (max_token_ish between 500 and 20000),
  kirish jsonb not null default '{}'::jsonb check (length(kirish::text) <= 1000),
  actor_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,  -- xizmat aktori = ishchini yoqqan odam
  oxirgi_ish_vaqt timestamptz,
  yangilandi timestamptz not null default now()
);
create unique index if not exists t2_ai_sozlama_uq on public.t2_ai_sozlama (coalesce(kompaniya_id, 0), ishchi_kod);

create table if not exists public.t2_ai_ish (
  id bigint generated always as identity primary key,
  operation_id uuid not null unique,
  kompaniya_id bigint references public.t2_kompaniya(id) on delete cascade,
  ishchi_kod text not null references public.t2_ai_ishchi(kod),
  actor_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  manba text not null default 'qolda' check (manba in ('qolda', 'jadval')),
  kirish jsonb not null default '{}'::jsonb check (length(kirish::text) <= 1000),
  holat text not null default 'navbatda' check (holat in ('navbatda', 'ishlayapti', 'tugadi', 'xato', 'limit')),
  ai_holat text not null default 'yoq' check (ai_holat in ('yoq', 'kutilmoqda', 'ishlayapti', 'tayyor', 'limit', 'xato')),
  bolaklar jsonb not null default '[]'::jsonb check (jsonb_typeof(bolaklar) = 'array' and jsonb_array_length(bolaklar) <= 12),
  qadam integer not null default 0 check (qadam >= 0),
  qadam_soni integer not null default 0 check (qadam_soni >= 0),
  faktlar jsonb not null default '[]'::jsonb check (jsonb_typeof(faktlar) = 'array' and length(faktlar::text) <= 60000),
  urinish smallint not null default 0,
  max_token integer not null default 3000,
  kirish_token integer not null default 0,
  chiqish_token integer not null default 0,
  model text check (model is null or length(model) <= 120),
  narx_usd numeric(12, 6),
  xato_kod text check (xato_kod is null or length(xato_kod) <= 60),
  xato_matn text check (xato_matn is null or length(xato_matn) <= 300),
  yaratildi timestamptz not null default now(),
  boshlandi timestamptz,
  tugadi timestamptz,
  ai_vaqt timestamptz
);
create index if not exists t2_ai_ish_navbat_idx on public.t2_ai_ish (id) where holat in ('navbatda', 'ishlayapti');
create index if not exists t2_ai_ish_ai_idx on public.t2_ai_ish (id) where ai_holat in ('kutilmoqda', 'ishlayapti');
create index if not exists t2_ai_ish_komp_idx on public.t2_ai_ish (kompaniya_id, id desc);

create table if not exists public.t2_ai_natija (
  id bigint generated always as identity primary key,
  ish_id bigint not null unique references public.t2_ai_ish(id) on delete cascade,
  kompaniya_id bigint references public.t2_kompaniya(id) on delete cascade,
  ishchi_kod text not null references public.t2_ai_ishchi(kod),
  sarlavha text not null check (length(sarlavha) between 3 and 200),
  xulosa text not null check (length(xulosa) <= 4000),
  quruq boolean not null default true,                       -- true = faqat deterministik faktlar; false = AI xulosa qo'shilgan
  ustuvorlik smallint not null default 0 check (ustuvorlik between 0 and 2),   -- 0 oddiy, 1 diqqat, 2 shoshilinch
  bandlar jsonb not null default '[]'::jsonb check (jsonb_typeof(bandlar) = 'array' and length(bandlar::text) <= 12000),
  holat text not null default 'yangi' check (holat in ('yangi', 'oqildi', 'bajarildi')),
  holat_actor_id bigint,
  holat_vaqt timestamptz,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_ai_natija_komp_idx on public.t2_ai_natija (kompaniya_id, holat, id desc);

-- Platforma byudjetining fon ishchilar ulushi: chat (Jarvis) uchun zaxira DOIM qoladi (fon_foiz dan ortig'ini fon ishchilar sarflay olmaydi).
create table if not exists public.t2_ai_limit (
  id smallint primary key default 1 check (id = 1),
  fon_foiz integer not null default 40 check (fon_foiz between 0 and 90),
  actor_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  yangilandi timestamptz not null default now()
);
insert into public.t2_ai_limit (id) values (1) on conflict (id) do nothing;

-- Mavjud kuzatuv ro'yxatiga (superadmin boshqaradi): manba turi, tekshirish chastotasi, oldingi qisqa xulosa (keyingi o'zgarishni taqqoslash uchun).
alter table public.t2_agent_kuzatuv_url add column if not exists tur text not null default 'meyor';
alter table public.t2_agent_kuzatuv_url add column if not exists chastota_soat integer not null default 24;
alter table public.t2_agent_kuzatuv_url add column if not exists oxirgi_xulosa text;
do $kz$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_agent_kuzatuv_url_ai_chk' and conrelid = 'public.t2_agent_kuzatuv_url'::regclass) then
    alter table public.t2_agent_kuzatuv_url add constraint t2_agent_kuzatuv_url_ai_chk check (
      tur in ('meyor', 'narx', 'yangilik') and chastota_soat between 1 and 720 and (oxirgi_xulosa is null or length(oxirgi_xulosa) <= 1200));
  end if;
end $kz$;

-- Egasi navbati (t2_osuvchi_taklif) ikki yangi tur oladi: internet (kuzatilgan sahifa o'zgarishi), tizim (tizim sog'ligi takliflari).
do $tur$ begin
  alter table public.t2_osuvchi_taklif drop constraint if exists t2_osuvchi_taklif_tur_check;
  alter table public.t2_osuvchi_taklif add constraint t2_osuvchi_taklif_tur_check check (tur in ('tajriba', 'friksiya', 'internet', 'tizim'));
end $tur$;

do $rls$ declare t text; begin
  foreach t in array array['t2_ai_ishchi', 't2_ai_sozlama', 't2_ai_ish', 't2_ai_natija', 't2_ai_limit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $rls$;

-- ---------------------------------------------------------------- ishchilar ta'rifi (seed)
-- vositalar = ruxsat etilgan O'QISH manbalari (hujjat); funksiyalar FAQAT shularni o'qiydi. Yozish: faqat t2_ai_* + t2_osuvchi_taklif (taklif).
insert into public.t2_ai_ishchi (kod, doira, nom, tavsif, kirish, vositalar, chiqish, model_daraja, sukut_jadval, ai_bor) values
  ('kunlik_nazoratchi', 'kompaniya', 'Kunlik nazoratchi',
   'Ertalabki xulosa: fakt kiritilmagan obyektlar, javob kutayotgan hujjatlar, muddati o''tayotgan ishlar, solishtiruvdagi yangi farqlar. Faqat o''qiydi.',
   '{}'::jsonb, array['t2_obyekt', 't2_akt', 't2_xat', 't2_tomon_murojaat', 't2_hujjat_zanjir', 't2_solishtiruv_istisno'],
   '{"natija":"inbox","bandlar":["fakt_yoq","javob_kutayotgan","muddat","solishtiruv"]}'::jsonb, 'fast', 'kunlik', true),
  ('hujjat_tekshiruvchi', 'kompaniya', 'Hujjat tekshiruvchi',
   'Yuborishdan oldin F2 qoralamasini tekshiradi: narxsiz qatorlar, smeta hajmidan oshgan, asosi yo''q, narx farqi, podval mosligi. Bloklamaydi, faqat kamchiliklar ro''yxati.',
   '{"akt_id":"ixtiyoriy","obyekt_id":"ixtiyoriy"}'::jsonb, array['t2_akt', 't2_akt_qator', 't2_qator', 't2_akt_podval'],
   '{"natija":"inbox","bandlar":["narxsiz","hajm_oshgan","asosiz","narx_farq","podval"]}'::jsonb, 'fast', 'qolda', true),
  ('narx_kuzatuvchi', 'kompaniya', 'Narx va ta''minot kuzatuvchi',
   'Narxsiz yoki eskirgan narxli smeta resurslari uchun mavjud narx manbalaridan taklif (bir necha yetkazuvchi bo''lsa arifmetik o''rtacha). O''zi narx yozmaydi.',
   '{"obyekt_id":"ixtiyoriy"}'::jsonb, array['t2_qator', 't2_narx_taklif', 't2_narx_dalil_holat', 't2_obyekt'],
   '{"natija":"inbox","bandlar":["narxsiz","eskirgan"]}'::jsonb, 'fast', 'haftalik', true),
  ('tizim_sogligi', 'tizim', 'Tizim sog''ligi',
   'Haftalik xulosa: ishqalanish xatolari, signal o''sishi, baza hajmi, solishtiruv, AI xatolari, sekin so''rovlar. Platforma egasi uchun.',
   '{}'::jsonb, array['t2_friksiya', 't2_signal', 't2_baza_hajm_tarix', 't2_solishtiruv_istisno', 't2_agent_sarf', 't2_ai_ish', 'pg_stat_statements'],
   '{"natija":"inbox+taklif","bandlar":["friksiya","signal","hajm","solishtiruv","ai","sekin"]}'::jsonb, 'fast', 'haftalik', true),
  ('internet_kuzatuvchi', 'tizim', 'Internet kuzatuvchi',
   'Superadmin tasdiqlagan manbalar ro''yxatidagi sahifalarni (faqat allowlist domenlar, robots.txt hurmati) yuklab, o''zgarishini qisqa xulosa qiladi va egasi navbatiga TAKLIF qo''yadi.',
   '{}'::jsonb, array['t2_agent_kuzatuv_url', 't2_agent_manba'],
   '{"natija":"inbox+taklif","bandlar":["yangi","ozgardi","xato"]}'::jsonb, 'fast', 'kunlik', true)
on conflict (kod) do nothing;

-- ---------------------------------------------------------------- yordamchilar
create or replace function public._t2_ai_rol_ok_v1(p_rol text, p_yozish boolean) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select case when p_yozish then public._t2_agent_qaror_rol_ok(p_rol) else p_rol in ('admin', 'superadmin', 'boss', 'director', 'rahbar', 'pto') end;
$$;

create or replace function public._t2_ai_band_v1(p_tur text, p_daraja integer, p_matn text, p_royxat jsonb default '[]'::jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('tur', p_tur, 'daraja', p_daraja, 'matn', left(p_matn, 300), 'royxat', coalesce(p_royxat, '[]'::jsonb));
$$;

-- Bitta qadam uchun deterministik faktlar (SQL bilan yig'iladi; LLM faqat xulosa uchun). Faqat o'qiydi; summa YO'Q — sonlar, id va nomlar.
create or replace function public._t2_ai_faktlar_v1(p_ishchi text, p_kompaniya bigint, p_bolak text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v jsonb := '{}'::jsonb; v_a jsonb; v_b jsonb; v_c jsonb; v_id bigint; v_akt record; v_ob record;
  v_now bigint; v_old bigint; v_s7 integer; v_s14 integer;
begin
  if p_ishchi = 'kunlik_nazoratchi' then
    select jsonb_build_object('soni', count(*), 'royxat', coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nom', left(x.nom, 80)) order by x.id) filter (where x.rn <= 10), '[]'::jsonb))
      into v_a
      from (select o.id, o.nom, row_number() over (order by o.id) as rn from public.t2_obyekt o
             where o.kompaniya_id = p_kompaniya and o.holat = 'faol' and o.tur = 'obyekt'
               and exists (select 1 from public.t2_qator q where q.obyekt_id = o.id and q.versiya_holat = 'faol')
               and not exists (select 1 from public.t2_akt a where a.obyekt_id = o.id and a.tur = 'fakt' and a.holat <> 'bekor'
                                and coalesce(a.sana, a.yaratildi::date) >= current_date - 7)) x;
    with u as (
      select 'xat'::text as tur, x.id, left(coalesce(x.mavzu, ''), 80) as sarlavha, x.javob_muddati as muddat
        from public.t2_xat x where x.qabul_kompaniya_id = p_kompaniya and x.holat <> 'javob_berildi' and x.javob_muddati is not null
      union all
      select 'murojaat', m.id, left(coalesce(m.sarlavha, ''), 80), m.muddat
        from public.t2_tomon_murojaat m where m.ijrochi_kompaniya_id = p_kompaniya and m.holat = 'ochiq'
      union all
      select 'zanjir', z.id, left(coalesce(z.sarlavha, ''), 80), s.muddat
        from public.t2_hujjat_zanjir_qadam s join public.t2_hujjat_zanjir z on z.id = s.zanjir_id
       where s.kompaniya_id = p_kompaniya and s.holat = 'navbat' and z.holat = 'jarayonda')
    select jsonb_build_object('xat', count(*) filter (where u.tur = 'xat'), 'murojaat', count(*) filter (where u.tur = 'murojaat'),
             'zanjir', count(*) filter (where u.tur = 'zanjir'),
             'otgan', count(*) filter (where u.muddat < current_date),
             'yaqin', count(*) filter (where u.muddat >= current_date and u.muddat <= current_date + 3),
             'royxat', (select coalesce(jsonb_agg(jsonb_build_object('tur', z2.tur, 'id', z2.id, 'sarlavha', z2.sarlavha, 'muddat', z2.muddat) order by z2.muddat nulls last, z2.id), '[]'::jsonb)
                          from (select * from u order by muddat nulls last, id limit 10) z2))
      into v_b from u;
    select jsonb_build_object('ochiq', count(*) filter (where i.holat = 'ochiq'),
             'yangi', count(*) filter (where i.holat = 'ochiq' and i.birinchi_at >= now() - interval '1 day'))
      into v_c from public.t2_solishtiruv_istisno i where i.kompaniya_id = p_kompaniya;
    return jsonb_build_object('bolak', '*', 'fakt_yoq', v_a, 'hujjat', v_b, 'solishtiruv', v_c);

  elsif p_ishchi = 'hujjat_tekshiruvchi' then
    v_id := nullif(p_bolak, '')::bigint;
    select a.id, a.obyekt_id, a.raqam into v_akt from public.t2_akt a
     where a.id = v_id and a.kompaniya_id = p_kompaniya and a.tur = 'f2' and a.holat = 'qoralama';
    if not found then return jsonb_build_object('bolak', p_bolak, 'xato', 'AKT_YOQ'); end if;
    with s as (
      select aq.id as aq_id, aq.qator_id, left(coalesce(q.nom, ''), 80) as nom, aq.hajm, aq.narx, aq.baseline_narx, aq.narx_manba, aq.provenance_status, q.hajm as smeta_hajm,
             exists (select 1 from public.t2_akt_qator fq join public.t2_akt fa on fa.id = fq.akt_id
                      where fa.obyekt_id = v_akt.obyekt_id and fa.tur = 'fakt' and fa.holat <> 'bekor' and fq.qator_id = aq.qator_id) as fakt_bor
        from public.t2_akt_qator aq left join public.t2_qator q on q.id = aq.qator_id and q.versiya_holat = 'faol'
       where aq.akt_id = v_akt.id),
    k as (
      select 'narxsiz'::text as tur, aq_id, qator_id, nom from s where narx is null and coalesce(provenance_status, '') <> 'price_intentionally_absent'
      union all select 'asosiz', aq_id, qator_id, nom from s where narx_manba is null or narx_manba = 'qol_nomalum'
      union all select 'hajm_oshgan', aq_id, qator_id, nom from s where smeta_hajm is not null and hajm > smeta_hajm * 1.001 + 0.0005
      union all select 'narx_farq', aq_id, qator_id, nom from s where baseline_narx is not null and narx is not null and abs(narx - baseline_narx) > 0.005
      union all select 'faktsiz', aq_id, qator_id, nom from s where coalesce(hajm, 0) > 0 and not fakt_bor)
    select coalesce(jsonb_object_agg(g.tur, jsonb_build_object('soni', g.n, 'namuna', g.namuna)), '{}'::jsonb) into v_a from (
      select kk.tur, count(*) as n,
             (select coalesce(jsonb_agg(jsonb_build_object('qator_id', z.qator_id, 'nom', z.nom)), '[]'::jsonb)
                from (select z0.qator_id, z0.nom from k z0 where z0.tur = kk.tur order by z0.aq_id limit 5) z) as namuna
        from k kk group by kk.tur) g;
    select count(*) into v_s7 from public.t2_akt_qator aq where aq.akt_id = v_akt.id;
    select jsonb_build_object('yoq', not exists (select 1 from public.t2_akt_podval p where p.akt_id = v_akt.id),
             'farq', exists (select 1 from public.t2_akt_podval p where p.akt_id = v_akt.id and p.hujjat_itogo4 is not null and p.itogo4 is not null
                                and abs(p.hujjat_itogo4 - p.itogo4) > 1))
      into v_b;
    return jsonb_build_object('bolak', p_bolak, 'akt_id', v_akt.id, 'obyekt_id', v_akt.obyekt_id, 'raqam', left(coalesce(v_akt.raqam, ''), 40),
                              'qator_soni', v_s7, 'kamchilik', v_a, 'podval', v_b);

  elsif p_ishchi = 'narx_kuzatuvchi' then
    v_id := nullif(p_bolak, '')::bigint;
    select o.id, o.nom into v_ob from public.t2_obyekt o where o.id = v_id and o.kompaniya_id = p_kompaniya and o.holat = 'faol';
    if not found then return jsonb_build_object('bolak', p_bolak, 'xato', 'OBYEKT_YOQ'); end if;
    -- narxsiz (resurs qatorlari); nomzod: mavjud narx manbalari (t2_narx_taklif) — bir nechta yetkazuvchi bo'lsa ARIFMETIK O'RTACHA + manba soni
    with n as (
      select q.id, q.nom, q.birlik from public.t2_qator q
       where q.obyekt_id = v_ob.id and q.versiya_holat = 'faol' and q.tur in ('rs', 'mat', 'ob') and q.narx is null),
    t as (
      select tk.qator_id, count(distinct tk.manba_id) as manba_soni, avg(tk.manba_narx) as ortacha, string_agg(distinct coalesce(tk.nds_holati, 'nomalum'), ',') as nds
        from public.t2_narx_taklif tk where tk.obyekt_id = v_ob.id and tk.manba_narx is not null and tk.qator_id in (select id from n) group by tk.qator_id)
    select jsonb_build_object('soni', (select count(*) from n), 'taklifli', (select count(*) from t),
             'namuna', (select coalesce(jsonb_agg(jsonb_build_object('qator_id', z.id, 'nom', left(z.nom, 80), 'birlik', z.birlik, 'manba_soni', z.manba_soni,
                                      'ortacha', z.ortacha, 'nds', z.nds) order by z.manba_soni desc nulls last, z.id), '[]'::jsonb)
                          from (select n.id, n.nom, n.birlik, t.manba_soni, t.ortacha, t.nds from n left join t on t.qator_id = n.id
                                 order by (t.qator_id is null), t.manba_soni desc nulls last, n.id limit 15) z))
      into v_a;
    select jsonb_build_object('soni', count(*),
             'namuna', coalesce(jsonb_agg(jsonb_build_object('qator_id', z.qator_id, 'nom', left(z.nom, 80), 'hozirgi', z.hozirgi_narx, 'manba', z.manba_narx) order by z.ogish desc) filter (where z.rn <= 10), '[]'::jsonb))
      into v_b
      from (select h.qator_id, h.nom, h.hozirgi_narx, h.manba_narx, abs(h.manba_narx - h.hozirgi_narx) / h.hozirgi_narx as ogish,
                   row_number() over (order by abs(h.manba_narx - h.hozirgi_narx) / h.hozirgi_narx desc) as rn
              from public.t2_narx_dalil_holat h
             where h.obyekt_id = v_ob.id and h.hozirgi_narx is not null and h.hozirgi_narx <> 0 and h.manba_narx is not null
               and abs(h.manba_narx - h.hozirgi_narx) / h.hozirgi_narx > 0.10) z;
    return jsonb_build_object('bolak', p_bolak, 'obyekt_id', v_ob.id, 'obyekt_nom', left(coalesce(v_ob.nom, ''), 80), 'narxsiz', v_a, 'eskirgan', v_b);

  elsif p_ishchi = 'tizim_sogligi' then
    select coalesce(jsonb_agg(jsonb_build_object('sahifa', z.sahifa, 'amal', z.amal, 'kod', z.kod, 'soni', z.n) order by z.n desc), '[]'::jsonb) into v_a
      from (select f.sahifa, f.amal, f.kod, sum(f.soni) as n from public.t2_friksiya f
             where f.kun >= current_date - 7 and f.hodisa = 'xato' group by f.sahifa, f.amal, f.kod order by sum(f.soni) desc limit 5) z;
    select count(*) filter (where created_at >= now() - interval '7 days'), count(*) filter (where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days')
      into v_s7, v_s14 from public.t2_signal where state = 'open' or created_at >= now() - interval '14 days';
    v_b := jsonb_build_object('ochiq', (select count(*) from public.t2_signal where state = 'open'), 'yangi_7k', v_s7, 'avvalgi_7k', v_s14);
    select db_bytes into v_now from public.t2_baza_hajm_tarix order by olingan desc limit 1;
    select db_bytes into v_old from public.t2_baza_hajm_tarix where olingan <= now() - interval '6 days' order by olingan desc limit 1;
    v_c := jsonb_build_object('mb', round(coalesce(v_now, 0) / 1048576.0), 'mb_7k_oldin', case when v_old is null then null else round(v_old / 1048576.0) end, 'chegara_mb', 500);
    v := jsonb_build_object('bolak', '*', 'friksiya_xato', v_a, 'signal', v_b, 'hajm', v_c,
      'solishtiruv', (select jsonb_build_object('ochiq', count(*) filter (where holat = 'ochiq'), 'yangi_7k', count(*) filter (where holat = 'ochiq' and birinchi_at >= now() - interval '7 days'))
                        from public.t2_solishtiruv_istisno),
      'ai', (select jsonb_build_object('chaqiruv_7k', count(*), 'xato_7k', count(*) filter (where not muvaffaqiyat)) from public.t2_agent_sarf where vaqt >= now() - interval '7 days'),
      'ish', (select jsonb_build_object('xato_7k', count(*) filter (where holat = 'xato'), 'limit_7k', count(*) filter (where holat = 'limit')) from public.t2_ai_ish where yaratildi >= now() - interval '7 days'));
    begin
      -- sekin so'rovlar: faqat queryid + chaqiruv soni + o'rtacha ms (so'rov matni olinmaydi)
      execute 'select coalesce(jsonb_agg(jsonb_build_object(''id'', z.queryid::text, ''chaqiruv'', z.calls, ''ms'', round(z.mean_exec_time::numeric)) order by z.mean_exec_time desc), ''[]''::jsonb) '
        || 'from (select queryid, calls, mean_exec_time from extensions.pg_stat_statements where mean_exec_time > 1000 and calls >= 5 order by mean_exec_time * calls desc limit 5) z' into v_a;
    exception when others then v_a := '[]'::jsonb;
    end;
    return v || jsonb_build_object('sekin', coalesce(v_a, '[]'::jsonb));
  end if;
  return jsonb_build_object('bolak', p_bolak, 'xato', 'ISHCHI_NOMALUM');
end $$;
comment on function public._t2_ai_faktlar_v1(text, bigint, text) is 'versiya: versiya - t2_qator faqat faol (versiya_holat = ''faol'') qatorlar; F2/fakt tarixi t2_akt_qator orqali filtrsiz (B toifa). Faqat o''qiydi, summa qaytarmaydi.';

-- Qadamlar (bo'laklar): har bo'lak alohida qadam, navbat orqali davom etadi (Cloudflare/SQL vaqt chegarasi).
create or replace function public._t2_ai_bolaklar_v1(p_ishchi text, p_kompaniya bigint, p_kirish jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb := '[]'::jsonb; v_id text;
begin
  if p_ishchi in ('kunlik_nazoratchi', 'tizim_sogligi') then return jsonb_build_array('*'); end if;
  if p_ishchi = 'hujjat_tekshiruvchi' then
    v_id := nullif(p_kirish ->> 'akt_id', '');
    if v_id is not null then return jsonb_build_array(v_id); end if;
    select coalesce(jsonb_agg(z.id::text), '[]'::jsonb) into v from (
      select a.id from public.t2_akt a where a.kompaniya_id = p_kompaniya and a.tur = 'f2' and a.holat = 'qoralama'
       and (nullif(p_kirish ->> 'obyekt_id', '') is null or a.obyekt_id = (p_kirish ->> 'obyekt_id')::bigint)
       order by a.yangilandi desc, a.id desc limit 8) z;
    return v;
  end if;
  if p_ishchi = 'narx_kuzatuvchi' then
    v_id := nullif(p_kirish ->> 'obyekt_id', '');
    if v_id is not null then return jsonb_build_array(v_id); end if;
    select coalesce(jsonb_agg(z.obyekt_id::text), '[]'::jsonb) into v from (
      select q.obyekt_id, count(*) as n from public.t2_qator q join public.t2_obyekt o on o.id = q.obyekt_id
       where o.kompaniya_id = p_kompaniya and o.holat = 'faol' and q.versiya_holat = 'faol' and q.tur in ('rs', 'mat', 'ob') and q.narx is null
       group by q.obyekt_id order by n desc, q.obyekt_id limit 6) z;
    return v;
  end if;
  if p_ishchi = 'internet_kuzatuvchi' then
    select coalesce(jsonb_agg(z.id::text), '[]'::jsonb) into v from (
      select k.id from public.t2_agent_kuzatuv_url k
       where k.faol and (k.oxirgi_vaqt is null or k.oxirgi_vaqt <= now() - make_interval(hours => k.chastota_soat)) order by k.oxirgi_vaqt nulls first, k.id limit 3) z;
    return v;
  end if;
  return v;
end $$;
comment on function public._t2_ai_bolaklar_v1(text, bigint, jsonb) is 'versiya: versiya - t2_qator faqat faol (versiya_holat = ''faol'') qatorlar; qadam bo''laklarini (akt/obyekt/manba id) tanlaydi, faqat o''qiydi.';

-- Quruq (LLMsiz) natija: deterministik matn + bandlar. Limit tugaganda ham shu chiqadi.
create or replace function public._t2_ai_quruq_v1(p_ishchi text, p_f jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  e jsonb; bands jsonb := '[]'::jsonb; v_max integer := 0; v_n integer; v_txt text; v_sar text; v_x jsonb; k text; v_m integer; v_old integer;
begin
  if p_ishchi = 'kunlik_nazoratchi' then
    e := p_f -> 0;
    v_n := coalesce((e #>> '{fakt_yoq,soni}')::integer, 0);
    if v_n > 0 then bands := bands || public._t2_ai_band_v1('fakt_yoq', 1, format('7 kun ichida fakt kiritilmagan obyektlar: %s ta', v_n), e #> '{fakt_yoq,royxat}'); v_max := greatest(v_max, 1); end if;
    v_n := coalesce((e #>> '{hujjat,otgan}')::integer, 0);
    if v_n > 0 then bands := bands || public._t2_ai_band_v1('muddat_otgan', 2, format('Muddati o''tgan hujjat/murojaat/qadam: %s ta', v_n), e #> '{hujjat,royxat}'); v_max := 2; end if;
    v_n := coalesce((e #>> '{hujjat,yaqin}')::integer, 0);
    if v_n > 0 then bands := bands || public._t2_ai_band_v1('muddat_yaqin', 1, format('Muddati 3 kun ichida tugaydigan: %s ta', v_n)); v_max := greatest(v_max, 1); end if;
    v_n := coalesce((e #>> '{hujjat,xat}')::integer, 0) + coalesce((e #>> '{hujjat,murojaat}')::integer, 0) + coalesce((e #>> '{hujjat,zanjir}')::integer, 0);
    if v_n > 0 then bands := bands || public._t2_ai_band_v1('javob_kutayotgan', 1,
        format('Javob kutayotgan: xat %s, murojaat %s, tasdiq qadami %s', coalesce(e #>> '{hujjat,xat}', '0'), coalesce(e #>> '{hujjat,murojaat}', '0'), coalesce(e #>> '{hujjat,zanjir}', '0'))); v_max := greatest(v_max, 1); end if;
    v_n := coalesce((e #>> '{solishtiruv,yangi}')::integer, 0);
    if v_n > 0 then bands := bands || public._t2_ai_band_v1('solishtiruv', 1, format('Solishtiruvda yangi farqlar (24 soat): %s ta (jami ochiq %s)', v_n, coalesce(e #>> '{solishtiruv,ochiq}', '0'))); v_max := greatest(v_max, 1); end if;
    v_sar := 'Kunlik xulosa: ' || case when jsonb_array_length(bands) = 0 then 'diqqat talab qiladigan narsa yo''q' else jsonb_array_length(bands) || ' ta band' end;
  elsif p_ishchi = 'hujjat_tekshiruvchi' then
    v_m := 0;
    for e in select x from jsonb_array_elements(p_f) x loop
      continue when e ->> 'xato' is not null;
      v_n := 0; v_txt := '';
      for k in select unnest(array['narxsiz', 'hajm_oshgan', 'asosiz', 'narx_farq', 'faktsiz']) loop
        if coalesce((e #>> array['kamchilik', k, 'soni'])::integer, 0) > 0 then
          v_n := v_n + 1;
          v_txt := v_txt || case when v_txt = '' then '' else '; ' end || format('%s: %s', replace(k, '_', ' '), e #>> array['kamchilik', k, 'soni']);
        end if;
      end loop;
      if coalesce((e #>> '{podval,yoq}')::boolean, false) then v_n := v_n + 1; v_txt := v_txt || case when v_txt = '' then '' else '; ' end || 'podval yo''q'; end if;
      if coalesce((e #>> '{podval,farq}')::boolean, false) then v_n := v_n + 1; v_txt := v_txt || case when v_txt = '' then '' else '; ' end || 'podval jami hujjatdan farq qiladi'; end if;
      if v_n > 0 then
        v_m := v_m + 1;
        bands := bands || public._t2_ai_band_v1('f2_kamchilik', case when coalesce((e #>> '{kamchilik,narxsiz,soni}')::integer, 0) > 0 or coalesce((e #>> '{kamchilik,hajm_oshgan,soni}')::integer, 0) > 0 then 2 else 1 end,
          format('F2 %s (akt %s, %s qator): %s', e ->> 'raqam', e ->> 'akt_id', e ->> 'qator_soni', v_txt), e -> 'kamchilik');
        v_max := greatest(v_max, case when coalesce((e #>> '{kamchilik,narxsiz,soni}')::integer, 0) > 0 or coalesce((e #>> '{kamchilik,hajm_oshgan,soni}')::integer, 0) > 0 then 1 else 0 end);
      end if;
    end loop;
    v_sar := case when jsonb_array_length(p_f) = 0 then 'F2 qoralamasi topilmadi' when v_m = 0 then 'F2 tekshiruvi: kamchilik topilmadi' else format('F2 tekshiruvi: %s ta hujjatda kamchilik', v_m) end;
  elsif p_ishchi = 'narx_kuzatuvchi' then
    v_m := 0;
    for e in select x from jsonb_array_elements(p_f) x loop
      continue when e ->> 'xato' is not null;
      v_n := coalesce((e #>> '{narxsiz,soni}')::integer, 0); v_old := coalesce((e #>> '{eskirgan,soni}')::integer, 0);
      if v_n > 0 or v_old > 0 then
        v_m := v_m + 1;
        bands := bands || public._t2_ai_band_v1('narx', case when v_n > 0 then 1 else 0 end,
          format('Obyekt %s: narxsiz %s ta (taklifli %s), manbadan >10%% farq qiladigan %s ta', e ->> 'obyekt_nom', v_n, coalesce(e #>> '{narxsiz,taklifli}', '0'), v_old),
          coalesce(e #> '{narxsiz,namuna}', '[]'::jsonb));
        v_max := greatest(v_max, case when v_n > 0 then 1 else 0 end);
      end if;
    end loop;
    v_sar := case when jsonb_array_length(p_f) = 0 then 'Narxsiz resurs topilmadi' when v_m = 0 then 'Narx kuzatuvi: muammo yo''q' else format('Narx kuzatuvi: %s ta obyektda narx taklifi', v_m) end;
  elsif p_ishchi = 'tizim_sogligi' then
    e := p_f -> 0;
    if jsonb_array_length(coalesce(e -> 'friksiya_xato', '[]'::jsonb)) > 0 then bands := bands || public._t2_ai_band_v1('friksiya', 1, 'Ishqalanish: oxirgi 7 kunda eng ko''p xato bergan amallar', e -> 'friksiya_xato'); v_max := greatest(v_max, 1); end if;
    if coalesce((e #>> '{signal,yangi_7k}')::integer, 0) > coalesce((e #>> '{signal,avvalgi_7k}')::integer, 0) * 1.5 + 5 then
      bands := bands || public._t2_ai_band_v1('signal', 1, format('Signallar o''sdi: 7 kunda %s (oldingi hafta %s), jami ochiq %s', e #>> '{signal,yangi_7k}', e #>> '{signal,avvalgi_7k}', e #>> '{signal,ochiq}')); v_max := greatest(v_max, 1);
    end if;
    v_n := coalesce((e #>> '{hajm,mb}')::integer, 0);
    if v_n >= 450 then bands := bands || public._t2_ai_band_v1('hajm', case when v_n >= 480 then 2 else 1 end, format('Baza hajmi %s MB (chegara %s MB)', v_n, e #>> '{hajm,chegara_mb}')); v_max := greatest(v_max, case when v_n >= 480 then 2 else 1 end); end if;
    if coalesce((e #>> '{solishtiruv,yangi_7k}')::integer, 0) > 0 then bands := bands || public._t2_ai_band_v1('solishtiruv', 0, format('Solishtiruv: 7 kunda yangi farq %s, jami ochiq %s', e #>> '{solishtiruv,yangi_7k}', e #>> '{solishtiruv,ochiq}')); end if;
    if coalesce((e #>> '{ai,xato_7k}')::integer, 0) + coalesce((e #>> '{ish,xato_7k}')::integer, 0) > 0 then
      bands := bands || public._t2_ai_band_v1('ai', 1, format('AI: 7 kunda model xatosi %s, ishchi xatosi %s, limitga tushgan ish %s', e #>> '{ai,xato_7k}', e #>> '{ish,xato_7k}', e #>> '{ish,limit_7k}')); v_max := greatest(v_max, 1);
    end if;
    if jsonb_array_length(coalesce(e -> 'sekin', '[]'::jsonb)) > 0 then bands := bands || public._t2_ai_band_v1('sekin', 1, 'Sekin so''rovlar (o''rtacha > 1 s)', e -> 'sekin'); v_max := greatest(v_max, 1); end if;
    v_sar := 'Tizim sog''ligi: ' || case when jsonb_array_length(bands) = 0 then 'jiddiy muammo yo''q' else jsonb_array_length(bands) || ' ta band' end;
  elsif p_ishchi = 'internet_kuzatuvchi' then
    v_m := 0; v_old := 0;
    for e in select x from jsonb_array_elements(p_f) x loop
      if e ->> 'holat' = 'ozgardi' then
        v_m := v_m + 1;
        bands := bands || public._t2_ai_band_v1('manba_ozgardi', 1, format('Manba o''zgardi: %s', left(coalesce(e ->> 'nom', '?'), 80)),
          jsonb_build_array(jsonb_build_object('id', e -> 'id', 'url', e ->> 'url', 'holat', e ->> 'holat')));
      elsif e ->> 'holat' = 'yangi' then
        bands := bands || public._t2_ai_band_v1('manba_yangi', 0, format('Manba birinchi marta o''qildi (asos saqlandi): %s', left(coalesce(e ->> 'nom', '?'), 80)));
      elsif e ->> 'holat' = 'xato' then
        v_old := v_old + 1;
        bands := bands || public._t2_ai_band_v1('manba_xato', 0, format('Manba yuklanmadi: %s (%s)', left(coalesce(e ->> 'nom', '?'), 80), left(coalesce(e ->> 'xato', ''), 120)));
      end if;
    end loop;
    v_max := case when v_m > 0 then 1 else 0 end;
    v_sar := case when jsonb_array_length(p_f) = 0 then 'Internet kuzatuvi: tekshiriladigan manba yo''q'
                  else format('Internet kuzatuvi: %s manba tekshirildi, %s o''zgardi, %s xato', jsonb_array_length(p_f), v_m, v_old) end;
  end if;
  v_txt := (select string_agg('- ' || (b ->> 'matn'), E'\n') from jsonb_array_elements(bands) b);
  return jsonb_build_object('sarlavha', v_sar, 'xulosa', coalesce(v_txt, 'Diqqat talab qiladigan narsa topilmadi.'), 'ustuvorlik', v_max, 'bandlar', bands);
end $$;

-- Fon ishchilar ulushi: oy boshidan amal = ai_ishchi sarfi (USD) platforma limitining fon_foiz % idan oshmasin. Platforma limiti yo'q bo'lsa — sarf_tekshir (BYUDJET_YOQ) hal qiladi.
create or replace function public.t2_ai_fon_limit_v1() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pl public.t2_agent_byudjet%rowtype; v_foiz integer; v_sarf numeric; v_ulush numeric;
begin
  select l.fon_foiz into v_foiz from public.t2_ai_limit l where l.id = 1;
  v_foiz := coalesce(v_foiz, 40);
  select * into pl from public.t2_agent_byudjet b where b.kompaniya_id is null and b.faol;
  if not found then return jsonb_build_object('ok', true, 'fon_foiz', v_foiz); end if;
  select coalesce(sum(s.narx_usd), 0) into v_sarf from public.t2_agent_sarf s where s.amal = 'ai_ishchi' and s.vaqt >= date_trunc('month', now());
  v_ulush := pl.oylik_limit_usd * v_foiz / 100.0;
  if v_sarf >= v_ulush then return jsonb_build_object('ok', false, 'code', 'FON_BYUDJET_TUGADI', 'xabar', 'Fon ishchilarning oylik ulushi tugadi (chat uchun zaxira saqlanadi)', 'fon_foiz', v_foiz); end if;
  return jsonb_build_object('ok', true, 'fon_foiz', v_foiz, 'fon_sarf_usd', v_sarf, 'fon_ulush_usd', v_ulush);
end $$;

create or replace function public.t2_ai_fon_foiz_saqla_v1(p_actor_id bigint, p_foiz integer, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_agent_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'GLOBAL_SCOPE_DENIED'); end if;
  if p_foiz is null or p_foiz not between 0 and 90 then return jsonb_build_object('ok', false, 'code', 'FOIZ_INVALID', 'xabar', 'Ulush 0..90 % bo''lishi kerak'); end if;
  update public.t2_ai_limit set fon_foiz = p_foiz, actor_id = p_actor_id, yangilandi = now() where id = 1;
  v_res := jsonb_build_object('ok', true, 'fon_foiz', p_foiz);
  insert into public.t2_agent_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ai_fon_foiz_saqla', v_res);
  return v_res;
end $$;

-- ---------------------------------------------------------------- yakunlash (quruq natija yoziladi, limit tekshiriladi)
create or replace function public._t2_ai_yakunla_v1(p_ish_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  i public.t2_ai_ish%rowtype; q jsonb; v_ai text; v_lim jsonb; v_holat text := 'tugadi'; v_kod text;
begin
  select * into i from public.t2_ai_ish where id = p_ish_id for update;
  q := public._t2_ai_quruq_v1(i.ishchi_kod, i.faktlar);
  v_ai := i.ai_holat;
  if i.ishchi_kod = 'internet_kuzatuvchi' and exists (select 1 from jsonb_array_elements(i.faktlar) f where coalesce((f ->> 'limit')::boolean, false)) then v_holat := 'limit'; v_kod := 'BYUDJET_TUGADI'; end if;
  if v_ai = 'kutilmoqda' then
    if jsonb_array_length(q -> 'bandlar') = 0 then v_ai := 'yoq';        -- aytadigan narsa yo'q: token sarflanmaydi
    else
      v_lim := public.t2_agent_sarf_tekshir_v1(i.actor_id, i.kompaniya_id);
      if coalesce((v_lim ->> 'ok')::boolean, false) then v_lim := public.t2_ai_fon_limit_v1(); end if;
      if coalesce((v_lim ->> 'ok')::boolean, false) is not true then v_holat := 'limit'; v_ai := 'limit'; v_kod := left(coalesce(v_lim ->> 'code', 'LIMIT'), 60); end if;
    end if;
  end if;
  insert into public.t2_ai_natija (ish_id, kompaniya_id, ishchi_kod, sarlavha, xulosa, quruq, ustuvorlik, bandlar)
  values (i.id, i.kompaniya_id, i.ishchi_kod, left(q ->> 'sarlavha', 200), left(q ->> 'xulosa', 4000), true, (q ->> 'ustuvorlik')::smallint, q -> 'bandlar')
  on conflict (ish_id) do update set sarlavha = excluded.sarlavha, xulosa = excluded.xulosa, ustuvorlik = excluded.ustuvorlik, bandlar = excluded.bandlar;
  if i.ishchi_kod = 'internet_kuzatuvchi' then
    -- Egasi navbatiga TAKLIF (faqat haqiqiy O'ZGARISH; birinchi yuklash — asos xesh, taklif emas): sahifa o'zgargani + (bor bo'lsa) AI xulosasi/modul/taklif. Kalit: manba id + sha qisqasi (takror yozilmaydi). O'zi hech narsaga aylanmaydi.
    insert into public.t2_osuvchi_taklif (tur, domen, kalit, qiymat, dalil)
    select 'internet', 'internet', left('u' || (f ->> 'id') || ':' || left(coalesce(f ->> 'sha', ''), 12), 160),
           left(coalesce(nullif(btrim(f ->> 'xulosa'), ''), 'Sahifa o''zgardi: ' || coalesce(f ->> 'nom', '?') || ' (AI xulosasi yo''q)'), 600),
           jsonb_build_object('url', left(coalesce(f ->> 'url', ''), 300), 'holat', f ->> 'holat', 'sha', left(coalesce(f ->> 'sha', ''), 16),
                              'modul', left(coalesce(f ->> 'modul', ''), 60), 'taklif', left(coalesce(f ->> 'taklif', ''), 300))
      from jsonb_array_elements(i.faktlar) f where f ->> 'holat' = 'ozgardi' and f ->> 'sha' is not null
    on conflict (tur, domen, kalit, qiymat) do nothing;
  end if;
  update public.t2_ai_ish set holat = v_holat, ai_holat = v_ai, tugadi = now(), xato_kod = coalesce(v_kod, xato_kod),
         faktlar = case when v_ai = 'kutilmoqda' then faktlar else '[]'::jsonb end
   where id = i.id;
  update public.t2_ai_sozlama set oxirgi_ish_vaqt = now() where coalesce(kompaniya_id, 0) = coalesce(i.kompaniya_id, 0) and ishchi_kod = i.ishchi_kod;
  if i.kompaniya_id is not null then
    perform public.t2_audit_yoz(i.kompaniya_id, 'ai_ishchi_tugadi', 'ai', null, format('ishchi=%s ish=%s holat=%s', i.ishchi_kod, i.id, v_holat), 'actor:' || i.actor_id, null);
  end if;
  return jsonb_build_object('ok', true, 'ish_id', i.id, 'holat', v_holat, 'ai_holat', v_ai);
end $$;

-- ---------------------------------------------------------------- ish navbati
create or replace function public.t2_ai_ish_navbat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_ishchi text, p_kirish jsonb, p_operation_id uuid, p_manba text default 'qolda')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w public.t2_ai_ishchi%rowtype; s public.t2_ai_sozlama%rowtype; g jsonb; v_prev public.t2_ai_ish%rowtype; v_act public.t2_ai_ish%rowtype;
  v_k jsonb; v_bol jsonb; v_id bigint; v_oid bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_prev from public.t2_ai_ish where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'id', v_prev.id, 'holat', v_prev.holat, 'takror', true); end if;
  select * into w from public.t2_ai_ishchi where kod = p_ishchi and faol;
  if not found then return jsonb_build_object('ok', false, 'code', 'ISHCHI_YOQ', 'xabar', 'Bunday ishchi yo''q'); end if;
  if p_manba not in ('qolda', 'jadval') then return jsonb_build_object('ok', false, 'code', 'MANBA_INVALID'); end if;
  if (w.doira = 'kompaniya') <> (p_kompaniya_id is not null) then return jsonb_build_object('ok', false, 'code', 'DOIRA_MOS_EMAS', 'xabar', 'Ishchi doirasi mos emas'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g ->> 'ok')::boolean then return g; end if;
  if not public._t2_ai_rol_ok_v1(g ->> 'rol', false) then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED', 'xabar', 'Buning uchun rahbar huquqi kerak'); end if;
  select * into s from public.t2_ai_sozlama where coalesce(kompaniya_id, 0) = coalesce(p_kompaniya_id, 0) and ishchi_kod = p_ishchi;
  if not found or not s.yoqilgan then return jsonb_build_object('ok', false, 'code', 'ISHCHI_OCHIQ', 'xabar', 'Ishchi o''chiq — avval yoqing'); end if;
  v_k := coalesce(s.kirish, '{}'::jsonb) || coalesce(p_kirish, '{}'::jsonb);
  if jsonb_typeof(v_k) <> 'object' or length(v_k::text) > 1000 or exists (select 1 from jsonb_object_keys(v_k) kk where kk not in ('akt_id', 'obyekt_id'))
     or ((v_k ->> 'akt_id') is not null and (v_k ->> 'akt_id') !~ '^[0-9]{1,18}$') or ((v_k ->> 'obyekt_id') is not null and (v_k ->> 'obyekt_id') !~ '^[0-9]{1,18}$') then
    return jsonb_build_object('ok', false, 'code', 'KIRISH_INVALID');
  end if;
  -- tenant: kiritilgan akt/obyekt shu kompaniyaniki bo'lishi shart (begona id rad)
  if (v_k ->> 'akt_id') is not null and not exists (select 1 from public.t2_akt a where a.id = (v_k ->> 'akt_id')::bigint and a.kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'AKT_BEGONA'); end if;
  if (v_k ->> 'obyekt_id') is not null and not exists (select 1 from public.t2_obyekt o where o.id = (v_k ->> 'obyekt_id')::bigint and o.kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA'); end if;
  -- bir vaqtda bitta faol ish (qo'sh bosish yangi navbat ochmaydi)
  select * into v_act from public.t2_ai_ish j where j.kompaniya_id is not distinct from p_kompaniya_id and j.ishchi_kod = p_ishchi and j.holat in ('navbatda', 'ishlayapti') order by j.id desc limit 1;
  if found then return jsonb_build_object('ok', true, 'id', v_act.id, 'holat', v_act.holat, 'takror', true, 'xabar', 'Bu ishchi allaqachon navbatda/ishlayapti'); end if;
  v_bol := public._t2_ai_bolaklar_v1(p_ishchi, p_kompaniya_id, v_k);
  insert into public.t2_ai_ish (operation_id, kompaniya_id, ishchi_kod, actor_id, manba, kirish, bolaklar, qadam_soni, max_token, ai_holat)
  values (p_operation_id, p_kompaniya_id, p_ishchi, p_actor_id, p_manba, v_k, v_bol, jsonb_array_length(v_bol), s.max_token_ish,
          case when w.ai_bor and s.ai_xulosa and p_ishchi <> 'internet_kuzatuvchi' then 'kutilmoqda' else 'yoq' end)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'holat', 'navbatda', 'qadam_soni', jsonb_array_length(v_bol));
end $$;

-- SQL bajaruvchi: ishni egallaydi va (internet bo'lmasa) HAMMA qadamni bajarib quruq natija yozadi. Internet: faqat egallaydi (yuklash Pages Function da).
create or replace function public.t2_ai_ish_yur_v1(p_ish_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  i public.t2_ai_ish%rowtype; s public.t2_ai_sozlama%rowtype; g jsonb; r jsonb; v_bol text; v_kod text;
begin
  select * into i from public.t2_ai_ish where id = p_ish_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ISH_YOQ'); end if;
  if i.holat in ('tugadi', 'xato', 'limit') then return jsonb_build_object('ok', true, 'ish_id', i.id, 'holat', i.holat, 'ai_holat', i.ai_holat, 'takror', true); end if;
  if i.holat = 'navbatda' then update public.t2_ai_ish set holat = 'ishlayapti', boshlandi = coalesce(boshlandi, now()), urinish = urinish + 1 where id = i.id; end if;
  -- ruxsat har qadamda qayta tekshiriladi: aktor hali a'zomi, ishchi hali yoqilganmi
  g := public.t2_agent_scope_guard_v1(i.actor_id, i.kompaniya_id);
  select * into s from public.t2_ai_sozlama where coalesce(kompaniya_id, 0) = coalesce(i.kompaniya_id, 0) and ishchi_kod = i.ishchi_kod;
  if not (g ->> 'ok')::boolean or not public._t2_ai_rol_ok_v1(g ->> 'rol', false) or not found or not s.yoqilgan then
    v_kod := case when not (g ->> 'ok')::boolean or not public._t2_ai_rol_ok_v1(g ->> 'rol', false) then 'RUXSAT_YOQ' else 'ISHCHI_OCHIQ' end;
    update public.t2_ai_ish set holat = 'xato', xato_kod = v_kod, tugadi = now(), faktlar = '[]'::jsonb where id = i.id;
    return jsonb_build_object('ok', false, 'code', v_kod, 'ish_id', i.id, 'holat', 'xato');
  end if;
  if i.ishchi_kod = 'internet_kuzatuvchi' then
    if i.qadam_soni = 0 then return public._t2_ai_yakunla_v1(i.id); end if;
    return jsonb_build_object('ok', true, 'ish_id', i.id, 'holat', 'ishlayapti', 'tashqi', true, 'bolaklar', i.bolaklar, 'qadam', i.qadam);
  end if;
  begin
    while i.qadam < i.qadam_soni loop
      v_bol := i.bolaklar ->> i.qadam;
      r := public._t2_ai_faktlar_v1(i.ishchi_kod, i.kompaniya_id, v_bol);
      i.faktlar := i.faktlar || jsonb_build_array(r);
      i.qadam := i.qadam + 1;
      update public.t2_ai_ish set faktlar = i.faktlar, qadam = i.qadam where id = i.id;
    end loop;
  exception when others then
    update public.t2_ai_ish set holat = 'xato', xato_kod = 'QADAM_XATO', xato_matn = left('sqlstate ' || sqlstate, 300), tugadi = now(), faktlar = '[]'::jsonb where id = i.id;
    return jsonb_build_object('ok', false, 'code', 'QADAM_XATO', 'ish_id', i.id, 'holat', 'xato');
  end;
  return public._t2_ai_yakunla_v1(i.id);
end $$;

-- Internet qadami: Pages Function manbani yuklagach faktni shu yerga yozadi (faqat 'ishlayapti' internet ishi, navbatdagi bo'lak uchun).
create or replace function public.t2_ai_ish_qadam_yoz_v1(p_ish_id bigint, p_fakt jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.t2_ai_ish%rowtype; v_bol text;
begin
  select * into i from public.t2_ai_ish where id = p_ish_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ISH_YOQ'); end if;
  if i.ishchi_kod <> 'internet_kuzatuvchi' or i.holat <> 'ishlayapti' then return jsonb_build_object('ok', false, 'code', 'ISH_HOLAT'); end if;
  if jsonb_typeof(p_fakt) <> 'object' or length(p_fakt::text) > 1500 or coalesce(p_fakt ->> 'holat', '') not in ('yangi', 'ozgardi', 'ozgarmadi', 'xato') then return jsonb_build_object('ok', false, 'code', 'FAKT_INVALID'); end if;
  if i.qadam >= i.qadam_soni then return jsonb_build_object('ok', false, 'code', 'QADAM_YOQ'); end if;
  v_bol := i.bolaklar ->> i.qadam;
  if (p_fakt ->> 'id') is distinct from v_bol then return jsonb_build_object('ok', false, 'code', 'BOLAK_MOS_EMAS'); end if;   -- faqat navbatdagi (allowlist'dagi) manba
  update public.t2_ai_ish set faktlar = faktlar || jsonb_build_array(p_fakt), qadam = qadam + 1,
         kirish_token = kirish_token + least(greatest(coalesce(nullif(p_fakt ->> 'kt', '')::integer, 0), 0), 1000000), chiqish_token = chiqish_token + least(greatest(coalesce(nullif(p_fakt ->> 'ct', '')::integer, 0), 0), 1000000)
   where id = i.id;
  if i.qadam + 1 >= i.qadam_soni then return public._t2_ai_yakunla_v1(i.id); end if;
  return jsonb_build_object('ok', true, 'ish_id', i.id, 'holat', 'ishlayapti', 'qadam', i.qadam + 1);
end $$;

-- AI qadami: egallash (limit tekshiruvi MAVJUD t2_agent_sarf_tekshir_v1 orqali) va yozish.
create or replace function public.t2_ai_ish_ai_ol_v1(p_ish_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.t2_ai_ish%rowtype; w public.t2_ai_ishchi%rowtype; v_lim jsonb; n public.t2_ai_natija%rowtype;
begin
  select * into i from public.t2_ai_ish where id = p_ish_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ISH_YOQ'); end if;
  if i.holat <> 'tugadi' or i.ai_holat <> 'kutilmoqda' then return jsonb_build_object('ok', false, 'code', 'AI_NAVBATDA_EMAS', 'holat', i.holat, 'ai_holat', i.ai_holat); end if;
  v_lim := public.t2_agent_sarf_tekshir_v1(i.actor_id, i.kompaniya_id);
  if coalesce((v_lim ->> 'ok')::boolean, false) then v_lim := public.t2_ai_fon_limit_v1(); end if;
  if coalesce((v_lim ->> 'ok')::boolean, false) is not true then
    update public.t2_ai_ish set holat = 'limit', ai_holat = 'limit', xato_kod = left(coalesce(v_lim ->> 'code', 'LIMIT'), 60), faktlar = '[]'::jsonb where id = i.id;
    return jsonb_build_object('ok', false, 'code', coalesce(v_lim ->> 'code', 'LIMIT'), 'limit', true);
  end if;
  select * into w from public.t2_ai_ishchi where kod = i.ishchi_kod;
  select * into n from public.t2_ai_natija where ish_id = i.id;
  update public.t2_ai_ish set ai_holat = 'ishlayapti', ai_vaqt = now() where id = i.id;
  return jsonb_build_object('ok', true, 'ish_id', i.id, 'ishchi_kod', i.ishchi_kod, 'kompaniya_id', i.kompaniya_id, 'actor_id', i.actor_id, 'max_token', i.max_token,
    'model_daraja', w.model_daraja, 'faktlar', i.faktlar, 'quruq', jsonb_build_object('sarlavha', n.sarlavha, 'xulosa', n.xulosa, 'ustuvorlik', n.ustuvorlik));
end $$;

create or replace function public.t2_ai_ish_ai_yoz_v1(p_ish_id bigint, p_ok boolean, p_xulosa text, p_kirish integer, p_chiqish integer, p_narx numeric, p_model text, p_xato_kod text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.t2_ai_ish%rowtype; v_limit boolean := coalesce(p_xato_kod, '') in ('BYUDJET_YOQ', 'BYUDJET_TUGADI', 'TOKEN_YETMAYDI', 'TOKEN_LIMIT_TUGADI', 'KOMPANIYA_AI_OCHIQ', 'FON_BYUDJET_TUGADI');
begin
  select * into i from public.t2_ai_ish where id = p_ish_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ISH_YOQ'); end if;
  if i.ai_holat <> 'ishlayapti' then return jsonb_build_object('ok', false, 'code', 'AI_HOLAT', 'ai_holat', i.ai_holat); end if;
  if coalesce(p_ok, false) then
    if p_xulosa is null or length(btrim(p_xulosa)) < 3 then return jsonb_build_object('ok', false, 'code', 'XULOSA_BOSH'); end if;
    update public.t2_ai_natija set xulosa = left(btrim(p_xulosa), 4000), quruq = false where ish_id = i.id;
    update public.t2_ai_ish set ai_holat = 'tayyor', faktlar = '[]'::jsonb, kirish_token = greatest(coalesce(p_kirish, 0), 0), chiqish_token = greatest(coalesce(p_chiqish, 0), 0),
           narx_usd = p_narx, model = left(p_model, 120) where id = i.id;
    return jsonb_build_object('ok', true, 'ish_id', i.id, 'ai_holat', 'tayyor');
  end if;
  -- AI muvaffaqiyatsiz: quruq natija joyida qoladi; limit kodlari ishni `limit` holatiga o'tkazadi (token yechilmagan)
  update public.t2_ai_ish set ai_holat = case when v_limit then 'limit' else 'xato' end, holat = case when v_limit then 'limit' else holat end,
         xato_kod = left(coalesce(p_xato_kod, 'AI_XATO'), 60), faktlar = '[]'::jsonb where id = i.id;
  return jsonb_build_object('ok', true, 'ish_id', i.id, 'ai_holat', case when v_limit then 'limit' else 'xato' end);
end $$;
-- Internet bajaruvchisi uchun: navbatdagi manba (faqat shu ishning bo'lagi; sahifa matni emas, faqat ro'yxat ma'lumoti).
create or replace function public.t2_ai_internet_bolak_v1(p_ish_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare i public.t2_ai_ish%rowtype; k record;
begin
  select * into i from public.t2_ai_ish where id = p_ish_id;
  if not found or i.ishchi_kod <> 'internet_kuzatuvchi' or i.holat <> 'ishlayapti' then return jsonb_build_object('ok', false, 'code', 'ISH_HOLAT'); end if;
  if i.qadam >= i.qadam_soni then return jsonb_build_object('ok', true, 'tugagan', true); end if;
  select u.id, u.url, u.nom, u.maqsad, u.oxirgi_sha256, u.oxirgi_xulosa into k from public.t2_agent_kuzatuv_url u where u.id = (i.bolaklar ->> i.qadam)::bigint and u.faol;
  if not found then return jsonb_build_object('ok', true, 'yoq', true, 'id', i.bolaklar ->> i.qadam); end if;
  return jsonb_build_object('ok', true, 'id', k.id, 'url', k.url, 'nom', k.nom, 'maqsad', k.maqsad, 'oxirgi_sha256', k.oxirgi_sha256, 'oxirgi_xulosa', k.oxirgi_xulosa,
    'actor_id', i.actor_id, 'qadam', i.qadam, 'qadam_soni', i.qadam_soni,
    'ai_xulosa', coalesce((select z.ai_xulosa from public.t2_ai_sozlama z where z.kompaniya_id is null and z.ishchi_kod = 'internet_kuzatuvchi'), false));
end $$;

create or replace function public.t2_ai_internet_belgila_v1(p_kuzatuv_id bigint, p_sha text, p_holat text, p_izoh text, p_xulosa text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_holat not in ('ozgarmadi', 'yangi', 'ozgardi', 'xato') then return jsonb_build_object('ok', false, 'code', 'HOLAT_INVALID'); end if;
  update public.t2_agent_kuzatuv_url set oxirgi_sha256 = case when p_holat = 'xato' then oxirgi_sha256 else left(p_sha, 80) end, oxirgi_vaqt = now(), oxirgi_holat = p_holat,
         oxirgi_izoh = left(p_izoh, 300), oxirgi_xulosa = case when p_xulosa is not null and length(btrim(p_xulosa)) >= 3 then left(btrim(p_xulosa), 1200) else oxirgi_xulosa end
   where id = p_kuzatuv_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Tizim sog'ligi takliflari: egasi navbatiga (t2_osuvchi_taklif tur='tizim'); o'zi hech narsaga qo'llanmaydi.
create or replace function public.t2_ai_tizim_taklif_v1(p_ish_id bigint, p_takliflar jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.t2_ai_ish%rowtype; b jsonb; v_n integer := 0; v_hafta text := to_char(now(), 'IYYY-"W"IW');
begin
  select * into i from public.t2_ai_ish where id = p_ish_id;
  if not found or i.ishchi_kod <> 'tizim_sogligi' then return jsonb_build_object('ok', false, 'code', 'ISH_HOLAT'); end if;
  if jsonb_typeof(p_takliflar) <> 'array' then return jsonb_build_object('ok', false, 'code', 'TAKLIF_INVALID'); end if;
  for b in select x from jsonb_array_elements(p_takliflar) x limit 5 loop
    continue when length(coalesce(b ->> 'sarlavha', '')) < 3 or length(coalesce(b ->> 'matn', '')) < 5;
    insert into public.t2_osuvchi_taklif (tur, domen, kalit, qiymat, dalil)
    values ('tizim', 'tizim_sogligi', left(v_hafta || ':' || coalesce(nullif(b ->> 'kod', ''), md5(b ->> 'sarlavha')), 160), left(b ->> 'sarlavha' || ' — ' || (b ->> 'matn'), 600), jsonb_build_object('ish_id', i.id, 'hafta', v_hafta))
    on conflict (tur, domen, kalit, qiymat) do nothing;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'yozildi', v_n);
end $$;

-- ---------------------------------------------------------------- sozlama, natija holati, o'qish
create or replace function public.t2_ai_sozlama_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_ishchi text, p_yoqilgan boolean, p_jadval text, p_soat integer,
  p_ai_xulosa boolean, p_max_token integer, p_kirish jsonb, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.t2_ai_ishchi%rowtype; g jsonb; v_prev jsonb; v_res jsonb; v_k jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_agent_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  select * into w from public.t2_ai_ishchi where kod = p_ishchi and faol;
  if not found then return jsonb_build_object('ok', false, 'code', 'ISHCHI_YOQ'); end if;
  if (w.doira = 'kompaniya') <> (p_kompaniya_id is not null) then return jsonb_build_object('ok', false, 'code', 'DOIRA_MOS_EMAS'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g ->> 'ok')::boolean then return g; end if;
  if not public._t2_ai_rol_ok_v1(g ->> 'rol', true) then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED', 'xabar', 'Buning uchun boss, admin yoki direktor huquqi kerak'); end if;
  if coalesce(p_jadval, 'qolda') not in ('qolda', 'kunlik', 'haftalik') or coalesce(p_soat, 1) not between 0 and 23 or coalesce(p_max_token, 3000) not between 500 and 20000 then
    return jsonb_build_object('ok', false, 'code', 'SOZLAMA_INVALID');
  end if;
  v_k := coalesce(p_kirish, '{}'::jsonb);
  if jsonb_typeof(v_k) <> 'object' or length(v_k::text) > 1000 or exists (select 1 from jsonb_object_keys(v_k) kk where kk not in ('akt_id', 'obyekt_id')) then return jsonb_build_object('ok', false, 'code', 'KIRISH_INVALID'); end if;
  insert into public.t2_ai_sozlama (kompaniya_id, ishchi_kod, yoqilgan, jadval, soat, ai_xulosa, max_token_ish, kirish, actor_id)
  values (p_kompaniya_id, p_ishchi, coalesce(p_yoqilgan, false), coalesce(p_jadval, 'qolda'), coalesce(p_soat, 1), coalesce(p_ai_xulosa, true), coalesce(p_max_token, 3000), v_k, p_actor_id)
  on conflict (coalesce(kompaniya_id, 0), ishchi_kod) do update set yoqilgan = excluded.yoqilgan, jadval = excluded.jadval, soat = excluded.soat, ai_xulosa = excluded.ai_xulosa,
    max_token_ish = excluded.max_token_ish, kirish = excluded.kirish, actor_id = excluded.actor_id, yangilandi = now();
  if p_kompaniya_id is not null then
    perform public.t2_audit_yoz(p_kompaniya_id, 'ai_ishchi_sozlama', 'ai', null, format('ishchi=%s yoqilgan=%s jadval=%s', p_ishchi, coalesce(p_yoqilgan, false), coalesce(p_jadval, 'qolda')), 'actor:' || p_actor_id, null);
  end if;
  v_res := jsonb_build_object('ok', true, 'ishchi', p_ishchi, 'yoqilgan', coalesce(p_yoqilgan, false), 'jadval', coalesce(p_jadval, 'qolda'));
  insert into public.t2_agent_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ai_sozlama_saqla', v_res);
  return v_res;
end $$;

create or replace function public.t2_ai_natija_holat_v1(p_actor_id bigint, p_natija_id bigint, p_holat text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n public.t2_ai_natija%rowtype; g jsonb; v_prev jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_agent_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  if p_holat not in ('oqildi', 'bajarildi') then return jsonb_build_object('ok', false, 'code', 'HOLAT_INVALID'); end if;
  select * into n from public.t2_ai_natija where id = p_natija_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, n.kompaniya_id);
  if not (g ->> 'ok')::boolean then return g; end if;
  if not public._t2_ai_rol_ok_v1(g ->> 'rol', false) then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  update public.t2_ai_natija set holat = p_holat, holat_actor_id = p_actor_id, holat_vaqt = now() where id = n.id and (holat = 'yangi' or p_holat = 'bajarildi');
  v_res := jsonb_build_object('ok', true, 'id', n.id, 'holat', p_holat);
  insert into public.t2_agent_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ai_natija_holat', v_res);
  return v_res;
end $$;

create or replace function public.t2_ai_ol_v1(p_actor_id bigint, p_kompaniya_id bigint, p_bolim text, p_filtr jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g jsonb; v jsonb; v_doira text; v_lim int; v_tl numeric; v_bu numeric; v_id bigint;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g ->> 'ok')::boolean then return g; end if;
  if not public._t2_ai_rol_ok_v1(g ->> 'rol', false) then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  v_doira := case when p_kompaniya_id is null then 'tizim' else 'kompaniya' end;
  p_filtr := coalesce(p_filtr, '{}'::jsonb);
  if p_bolim = 'ishchilar' then
    select coalesce(jsonb_agg(jsonb_build_object('kod', w.kod, 'nom', w.nom, 'tavsif', w.tavsif, 'doira', w.doira, 'ai_bor', w.ai_bor, 'model_daraja', w.model_daraja, 'sukut_jadval', w.sukut_jadval,
        'vositalar', to_jsonb(w.vositalar), 'kirish', w.kirish,
        'yoqilgan', coalesce(s.yoqilgan, false), 'jadval', coalesce(s.jadval, 'qolda'), 'soat', coalesce(s.soat, 1), 'ai_xulosa', coalesce(s.ai_xulosa, true), 'max_token_ish', coalesce(s.max_token_ish, 3000),
        'oxirgi', (select jsonb_build_object('id', j.id, 'holat', j.holat, 'ai_holat', j.ai_holat, 'yaratildi', j.yaratildi, 'tugadi', j.tugadi, 'xato_kod', j.xato_kod,
                          'natija_id', (select n.id from public.t2_ai_natija n where n.ish_id = j.id))
                     from public.t2_ai_ish j where j.kompaniya_id is not distinct from p_kompaniya_id and j.ishchi_kod = w.kod order by j.id desc limit 1),
        'yangi_natija', (select count(*) from public.t2_ai_natija n where n.kompaniya_id is not distinct from p_kompaniya_id and n.ishchi_kod = w.kod and n.holat = 'yangi'))
        order by w.kod), '[]'::jsonb)
      into v from public.t2_ai_ishchi w left join public.t2_ai_sozlama s on s.ishchi_kod = w.kod and coalesce(s.kompaniya_id, 0) = coalesce(p_kompaniya_id, 0)
     where w.faol and w.doira = v_doira;
    return jsonb_build_object('ok', true, 'bolim', 'ishchilar', 'doira', v_doira, 'royxat', v);
  elsif p_bolim = 'inbox' then
    select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'ish_id', n.ish_id, 'ishchi_kod', n.ishchi_kod, 'sarlavha', n.sarlavha, 'xulosa', n.xulosa, 'quruq', n.quruq, 'ustuvorlik', n.ustuvorlik,
        'bandlar', n.bandlar, 'holat', n.holat, 'yaratildi', n.yaratildi, 'ish_holat', j.holat, 'ai_holat', j.ai_holat) order by n.id desc), '[]'::jsonb)
      into v from (select * from public.t2_ai_natija x where x.kompaniya_id is not distinct from p_kompaniya_id and (coalesce(p_filtr ->> 'holat', '') = '' or x.holat = p_filtr ->> 'holat') order by x.id desc limit 30) n
      join public.t2_ai_ish j on j.id = n.ish_id;
    return jsonb_build_object('ok', true, 'bolim', 'inbox', 'royxat', v,
      'yangi', (select count(*) from public.t2_ai_natija x where x.kompaniya_id is not distinct from p_kompaniya_id and x.holat = 'yangi'));
  elsif p_bolim = 'sarf' then
    select coalesce(jsonb_agg(jsonb_build_object('ishchi', z.profil_kod, 'chaqiruv', z.n, 'token', z.tok, 'xato', z.xato) order by z.tok desc), '[]'::jsonb) into v
      from (select s.profil_kod, count(*) as n, coalesce(sum(s.mijoz_token), 0) as tok, count(*) filter (where not s.muvaffaqiyat) as xato
              from public.t2_agent_sarf s where s.kompaniya_id is not distinct from p_kompaniya_id and s.amal = 'ai_ishchi' and s.vaqt >= date_trunc('month', now()) group by s.profil_kod) z;
    select z.oylik_token_limit into v_tl from public.t2_agent_kompaniya_sozlama z where z.kompaniya_id = p_kompaniya_id;
    select b.oylik_limit_usd into v_bu from public.t2_agent_byudjet b where b.kompaniya_id is not distinct from p_kompaniya_id and b.faol;
    return jsonb_build_object('ok', true, 'bolim', 'sarf', 'oy_boshi', date_trunc('month', now()), 'ishchilar', v,
      'oy_token_ishchi', (select coalesce(sum(s.mijoz_token), 0) from public.t2_agent_sarf s where s.kompaniya_id is not distinct from p_kompaniya_id and s.amal = 'ai_ishchi' and s.vaqt >= date_trunc('month', now())),
      'oy_token_jami', (select coalesce(sum(s.mijoz_token), 0) from public.t2_agent_sarf s where s.kompaniya_id is not distinct from p_kompaniya_id and s.vaqt >= date_trunc('month', now())),
      'token_limit', v_tl, 'byudjet_usd', v_bu, 'fon_foiz', (select l.fon_foiz from public.t2_ai_limit l where l.id = 1), 'sarf_usd', public._t2_agent_oy_sarfi_v1(p_kompaniya_id),
      'token_balans', case when p_kompaniya_id is null then null else public.t2_token_balans(p_kompaniya_id) end,
      'ishlar', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'ishchi', j.ishchi_kod, 'holat', j.holat, 'ai_holat', j.ai_holat, 'kirish_token', j.kirish_token, 'chiqish_token', j.chiqish_token, 'model', j.model, 'yaratildi', j.yaratildi) order by j.id desc), '[]'::jsonb)
                   from (select * from public.t2_ai_ish x where x.kompaniya_id is not distinct from p_kompaniya_id order by x.id desc limit 20) j));
  elsif p_bolim = 'manbalar' then
    if p_kompaniya_id is not null then return jsonb_build_object('ok', false, 'code', 'GLOBAL_SCOPE_DENIED'); end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'url', k.url, 'domen', k.domen, 'nom', k.nom, 'maqsad', k.maqsad, 'tur', k.tur, 'chastota_soat', k.chastota_soat, 'faol', k.faol,
        'oxirgi_vaqt', k.oxirgi_vaqt, 'oxirgi_holat', k.oxirgi_holat, 'domen_ruxsat', exists (select 1 from public.t2_agent_manba m where m.domen = k.domen and m.faol)) order by k.id), '[]'::jsonb)
      into v from public.t2_agent_kuzatuv_url k;
    return jsonb_build_object('ok', true, 'bolim', 'manbalar', 'royxat', v,
      'yangiliklar', (select count(*) from public.t2_osuvchi_taklif t where t.tur = 'internet' and t.holat = 'yangi'));
  end if;
  return jsonb_build_object('ok', false, 'code', 'BOLIM_NOMALUM');
end $$;

-- Manba boshqaruvi (faqat superadmin): ro'yxatga qo'shish/yoqish/chastota. Domen allowlist (t2_agent_manba) mavjud tasdiqlash oqimi bilan — bu yerda o'zgarmaydi.
create or replace function public.t2_ai_manba_saqla_v1(p_actor_id bigint, p_id bigint, p_faol boolean, p_tur text, p_chastota_soat integer, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_agent_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'GLOBAL_SCOPE_DENIED'); end if;
  if coalesce(p_tur, 'meyor') not in ('meyor', 'narx', 'yangilik') or coalesce(p_chastota_soat, 24) not between 1 and 720 then return jsonb_build_object('ok', false, 'code', 'MANBA_INVALID'); end if;
  update public.t2_agent_kuzatuv_url set faol = coalesce(p_faol, faol), tur = coalesce(p_tur, tur), chastota_soat = coalesce(p_chastota_soat, chastota_soat) where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  v_res := jsonb_build_object('ok', true, 'id', p_id);
  insert into public.t2_agent_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ai_manba_saqla', v_res);
  return v_res;
end $$;

-- ---------------------------------------------------------------- cron haydovchisi
-- Navbatga qo'yadi (kunlik/haftalik), SQL ishchilarni bajaradi, tiqilganlarni tiklaydi, 45 kundan eskisini o'chiradi. Tarmoq kerak ishlar (AI, internet) Pages Function da.
create or replace function public.t2_ai_jadval_v1() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s record; r jsonb; i record; v_q integer := 0; v_y integer := 0; v_t integer := 0; v_o integer := 0; v_bor boolean;
begin
  for s in select z.*, w.doira from public.t2_ai_sozlama z join public.t2_ai_ishchi w on w.kod = z.ishchi_kod and w.faol
            where z.yoqilgan and z.jadval <> 'qolda'
              and extract(hour from (now() at time zone 'utc')) >= z.soat
              and (z.jadval = 'kunlik' or extract(isodow from (now() at time zone 'utc')) = 1)
              and not exists (select 1 from public.t2_ai_ish j where j.kompaniya_id is not distinct from z.kompaniya_id and j.ishchi_kod = z.ishchi_kod and j.manba = 'jadval'
                               and j.yaratildi >= case when z.jadval = 'kunlik' then date_trunc('day', now()) else now() - interval '6 days' end) loop
    begin
      if s.ishchi_kod = 'internet_kuzatuvchi' then
        select exists (select 1 from public.t2_agent_kuzatuv_url k where k.faol and (k.oxirgi_vaqt is null or k.oxirgi_vaqt <= now() - make_interval(hours => k.chastota_soat))) into v_bor;
        continue when not v_bor;
      end if;
      r := public.t2_ai_ish_navbat_v1(s.actor_id, s.kompaniya_id, s.ishchi_kod, '{}'::jsonb, gen_random_uuid(), 'jadval');
      if coalesce((r ->> 'ok')::boolean, false) and r -> 'takror' is null then v_q := v_q + 1; end if;
    exception when others then null;     -- bitta ishchi xatosi boshqalarini to'xtatmaydi
    end;
  end loop;
  -- SQL ishchilar (internet bundan tashqari: u tarmoq kerak)
  for i in select j.id from public.t2_ai_ish j where j.holat = 'navbatda' and j.ishchi_kod <> 'internet_kuzatuvchi' order by j.id limit 20 loop
    begin perform public.t2_ai_ish_yur_v1(i.id); v_y := v_y + 1; exception when others then null; end;
  end loop;
  -- tiqilib qolgan ishlar: 15 daqiqadan oshgan 'ishlayapti' -> qayta navbat (3 urinishdan keyin xato); AI qadami ham
  update public.t2_ai_ish set holat = case when urinish >= 3 then 'xato' else 'navbatda' end, xato_kod = case when urinish >= 3 then 'URINISH_KOP' else xato_kod end,
         tugadi = case when urinish >= 3 then now() else tugadi end, faktlar = case when urinish >= 3 then '[]'::jsonb else faktlar end
   where holat = 'ishlayapti' and coalesce(boshlandi, yaratildi) < now() - interval '15 minutes';
  get diagnostics v_t = row_count;
  update public.t2_ai_ish set ai_holat = 'kutilmoqda' where ai_holat = 'ishlayapti' and coalesce(ai_vaqt, yaratildi) < now() - interval '15 minutes';
  delete from public.t2_ai_ish where yaratildi < now() - interval '45 days';
  get diagnostics v_o = row_count;
  return jsonb_build_object('ok', true, 'navbatga', v_q, 'bajarildi', v_y, 'tiklandi', v_t, 'ochirildi', v_o);
end $$;

-- Pages Function (cron endpoint) uchun: bajariladigan ishlar ro'yxati (kompaniya ma'lumoti qaytmaydi, faqat id va tur).
create or replace function public.t2_ai_bajaruvchi_navbat_v1(p_limit integer default 5) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true,
    'internet', coalesce((select jsonb_agg(j.id order by j.id) from (select id from public.t2_ai_ish where ishchi_kod = 'internet_kuzatuvchi' and holat in ('navbatda', 'ishlayapti') order by id limit least(greatest(coalesce(p_limit, 5), 1), 10)) j), '[]'::jsonb),
    'ai', coalesce((select jsonb_agg(j.id order by j.id) from (select id from public.t2_ai_ish where holat = 'tugadi' and ai_holat = 'kutilmoqda' order by id limit least(greatest(coalesce(p_limit, 5), 1), 10)) j), '[]'::jsonb));
$$;

-- ---------------------------------------------------------------- huquqlar
do $grant$ declare f text; begin
  foreach f in array array[
    'public._t2_ai_rol_ok_v1(text,boolean)', 'public._t2_ai_band_v1(text,integer,text,jsonb)', 'public._t2_ai_faktlar_v1(text,bigint,text)',
    'public._t2_ai_bolaklar_v1(text,bigint,jsonb)', 'public._t2_ai_quruq_v1(text,jsonb)', 'public._t2_ai_yakunla_v1(bigint)',
    'public.t2_ai_ish_navbat_v1(bigint,bigint,text,jsonb,uuid,text)', 'public.t2_ai_ish_yur_v1(bigint)', 'public.t2_ai_ish_qadam_yoz_v1(bigint,jsonb)',
    'public.t2_ai_ish_ai_ol_v1(bigint)', 'public.t2_ai_ish_ai_yoz_v1(bigint,boolean,text,integer,integer,numeric,text,text)',
    'public.t2_ai_internet_bolak_v1(bigint)', 'public.t2_ai_internet_belgila_v1(bigint,text,text,text,text)', 'public.t2_ai_tizim_taklif_v1(bigint,jsonb)',
    'public.t2_ai_sozlama_saqla_v1(bigint,bigint,text,boolean,text,integer,boolean,integer,jsonb,uuid)', 'public.t2_ai_natija_holat_v1(bigint,bigint,text,uuid)',
    'public.t2_ai_ol_v1(bigint,bigint,text,jsonb)', 'public.t2_ai_manba_saqla_v1(bigint,bigint,boolean,text,integer,uuid)',
    'public.t2_ai_jadval_v1()', 'public.t2_ai_bajaruvchi_navbat_v1(integer)', 'public.t2_ai_fon_limit_v1()', 'public.t2_ai_fon_foiz_saqla_v1(bigint,integer,uuid)'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
    execute 'grant execute on function ' || f || ' to service_role';
  end loop;
end $grant$;

-- ---------------------------------------------------------------- pg_cron (har 10 daqiqada)
do $cron$ begin
  if to_regnamespace('cron') is not null then
    if exists (select 1 from cron.job where jobname = 't2-ai-ishchi-jadval') then perform cron.unschedule('t2-ai-ishchi-jadval'); end if;
    perform cron.schedule('t2-ai-ishchi-jadval', '*/10 * * * *', 'set statement_timeout = ''120s''; select public.t2_ai_jadval_v1()');
  end if;
end $cron$;

-- ---------------------------------------------------------------- strukturaviy tasdiqlar
do $assert$ declare t text; f text; n integer; begin
  foreach t in array array['t2_ai_ishchi', 't2_ai_sozlama', 't2_ai_ish', 't2_ai_natija', 't2_ai_limit'] loop
    if to_regclass('public.' || t) is null then raise exception 'AI assert: jadval yo''q %', t; end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then raise exception 'AI assert: RLS yoqilmagan %', t; end if;
    if has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('authenticated', 'public.' || t, 'select') then raise exception 'AI assert: anon/authenticated ochiq %', t; end if;
    if not has_table_privilege('service_role', 'public.' || t, 'select') then raise exception 'AI assert: service_role huquqi yo''q %', t; end if;
  end loop;
  foreach f in array array['t2_ai_ish_navbat_v1', 't2_ai_ish_yur_v1', 't2_ai_ish_qadam_yoz_v1', 't2_ai_ish_ai_ol_v1', 't2_ai_ish_ai_yoz_v1', 't2_ai_sozlama_saqla_v1',
                           't2_ai_natija_holat_v1', 't2_ai_ol_v1', 't2_ai_jadval_v1', 't2_ai_bajaruvchi_navbat_v1', '_t2_ai_faktlar_v1', '_t2_ai_quruq_v1'] loop
    select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = f;
    if n <> 1 then raise exception 'AI assert: funksiya % soni=%', f, n; end if;
    if has_function_privilege('anon', (select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = f), 'execute') then
      raise exception 'AI assert: anon bajara oladi %', f;
    end if;
  end loop;
  if (select count(*) from public.t2_ai_ishchi) < 5 then raise exception 'AI assert: ishchi ta''riflari to''liq emas'; end if;
  if exists (select 1 from public.t2_ai_sozlama where yoqilgan) then raise exception 'AI assert: hech bir ishchi sukut bo''yicha yoqilmagan bo''lishi kerak'; end if;
end $assert$;
