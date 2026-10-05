-- TOMON ALOQASI (zakazchik ↔ pudratchi va kelajakdagi barcha tomonlar) — poydevor v1.
-- Egasi 2026-10-05: "zakazchik tarafini qurishni boshlashing kerak ... pudratchilari bilan ideal ulanishi kerak,
-- kelajakda ko'plab qo'shimcha bog'lanishlar uchun ham ochiq bo'lishi kerak".
--
-- Qoidalar (ROLE_TRUST_MODEL B, TOMONLAR_IMZO_VA_KORINISH):
--   1. Ikki kompaniya orasidagi aloqa HANDSHAKE bilan faollashadi: taklif → (qabul | rad) → faol → to'xtatilgan → yopilgan.
--      Bir tomonlama "ulab qo'yish" yo'q.
--   2. Ko'rinish DENY-BY-DEFAULT: tomon faqat ikkinchi tomon aniq GRANT qilgan resursni (obyekt/loyiha/shartnoma
--      doirasida) ko'ra oladi. Server (RPC) majburlaydi; frontendga ishonilmaydi.
--   3. TAQDIM (submission): pudratchi hujjatni zakazchikka ANIQ yuboradi (snapshot + butunlik belgisi); zakazchik
--      qabul / rad / tuzatish so'raydi + izoh. Hodisalar jurnali o'zgarmas (append-only). Zakazchik pudratchi
--      originalini TAHRIRLAY OLMAYDI.
--   4. Kengayuvchan: aloqa turi va rollar erkin matn; ko'rinadigan resurslar `t2_tomon_resurs` katalogida —
--      yangi resurs = bitta qator (schema o'zgarmaydi).
-- Hamma RPC faqat service_role (shlyuz `functions/api/tomon.ts`); actor sessiyadan; a'zolik `t2_actor_kompaniya_azo_tekshir`.

-- ───────────────────────── 1. Resurs katalogi ─────────────────────────
create table if not exists public.t2_tomon_resurs (
  kalit text primary key check (kalit ~ '^[a-z][a-z0-9_]{1,40}$'),
  nom text not null,
  nom_ru text,
  guruh text not null default 'hujjat' check (guruh in ('hujjat','moliya','nazorat','jadval')),
  amallar text[] not null default array['korish']::text[],
  taqdim_mumkin boolean not null default false,
  faol boolean not null default true,
  tartib integer not null default 100,
  izoh text
);
alter table public.t2_tomon_resurs enable row level security;
revoke all on table public.t2_tomon_resurs from anon, authenticated;

insert into public.t2_tomon_resurs (kalit, nom, nom_ru, guruh, amallar, taqdim_mumkin, faol, tartib, izoh) values
  ('obyekt_holat',     'Obyekt holati va sertifikatlangan jami', 'Состояние объекта и сертифицированные итоги', 'moliya', array['korish'], false, true, 10, 'Obyekt nomi, tasdiqlangan F2 jami, F2 soni, oxirgi F2 oyi'),
  ('shartnoma_xulosa', 'Shartnoma xulosasi',                    'Сводка по договору',                          'moliya', array['korish'], false, true, 20, 'Shartnoma raqami, summasi (QQS bilan), foiz bajarilishi'),
  ('f2',               'Forma-2 (tasdiqlangan aktlar)',         'Форма № 2 (утвержденные акты)',               'hujjat', array['korish','tafsilot'], true, true, 30, 'Pudratchining ichki tasdiqlagan F2 aktlari; tafsilot — qatorlar'),
  ('hujjat',           'Arxivlangan hujjat (F3, nakopitelniy va h.k.)', 'Архивный документ (Ф-3, накопительная и др.)', 'hujjat', array['korish'], true, true, 40, 'R2 ga saqlangan hujjat nusxasi; faqat TAQDIM orqali'),
  ('aosr',             'АОСР (yashirin ishlar akti)',           'АОСР (акт скрытых работ)',                    'nazorat', array['korish','izoh','qaror'], true, false, 50, 'Keyingi bosqich'),
  ('remark',           'Remark / NCR',                          'Замечание / NCR',                             'nazorat', array['korish','izoh','qaror'], false, false, 60, 'Keyingi bosqich'),
  ('grafik',           'Ish grafigi',                           'График работ',                                'jadval', array['korish'], false, false, 70, 'Keyingi bosqich'),
  ('tolov_holati',     'To''lov holati',                        'Состояние оплат',                             'moliya', array['korish'], false, false, 80, 'Keyingi bosqich'),
  ('foto',             'Foto-hisobot',                          'Фотоотчет',                                   'nazorat', array['korish'], false, false, 90, 'Keyingi bosqich'),
  ('fakt',             'Bajarilgan ish (fakt)',                 'Выполненные работы (факт)',                   'jadval', array['korish'], false, false, 100, 'Keyingi bosqich')
on conflict (kalit) do nothing;

-- ───────────────────────── 2. Aloqa (handshake) ─────────────────────────
create table if not exists public.t2_tomon_aloqa (
  id bigint generated always as identity primary key,
  taklif_kompaniya_id bigint not null references public.t2_kompaniya(id),
  qabul_kompaniya_id bigint references public.t2_kompaniya(id),
  taklif_rol text not null check (length(btrim(taklif_rol)) between 2 and 40),
  qabul_rol text not null check (length(btrim(qabul_rol)) between 2 and 40),
  turi text not null default 'shartnoma' check (length(btrim(turi)) between 2 and 40),
  nom text check (nom is null or length(nom) <= 200),
  qabul_nom text check (qabul_nom is null or length(qabul_nom) <= 200),
  qabul_inn text check (qabul_inn is null or qabul_inn ~ '^[0-9]{9}$'),
  kod_xesh text,
  kod_muddati timestamptz,
  holat text not null default 'taklif' check (holat in ('taklif','faol','toxtatilgan','yopilgan','rad','bekor')),
  taklif_actor_id bigint not null,
  taklif_vaqti timestamptz not null default now(),
  javob_actor_id bigint,
  javob_vaqti timestamptz,
  javob_izoh text,
  yopish_actor_id bigint,
  yopilgan_vaqti timestamptz,
  yopish_sababi text,
  izoh text check (izoh is null or length(izoh) <= 1000),
  operation_id uuid,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  check (qabul_kompaniya_id is distinct from taklif_kompaniya_id),
  check (qabul_kompaniya_id is not null or kod_xesh is not null or holat in ('yopilgan','rad','bekor'))
);
create unique index if not exists t2_tomon_aloqa_operation_uq on public.t2_tomon_aloqa (taklif_kompaniya_id, operation_id) where operation_id is not null;
create unique index if not exists t2_tomon_aloqa_kod_uq on public.t2_tomon_aloqa (kod_xesh) where kod_xesh is not null and holat = 'taklif';
create unique index if not exists t2_tomon_aloqa_juft_uq on public.t2_tomon_aloqa
  (least(taklif_kompaniya_id, qabul_kompaniya_id), greatest(taklif_kompaniya_id, qabul_kompaniya_id), lower(turi), lower(taklif_rol), lower(qabul_rol))
  where qabul_kompaniya_id is not null and holat in ('taklif','faol','toxtatilgan');
create index if not exists t2_tomon_aloqa_taklif_idx on public.t2_tomon_aloqa (taklif_kompaniya_id, holat);
create index if not exists t2_tomon_aloqa_qabul_idx on public.t2_tomon_aloqa (qabul_kompaniya_id, holat);
alter table public.t2_tomon_aloqa enable row level security;
revoke all on table public.t2_tomon_aloqa from anon, authenticated;

-- ───────────────────────── 3. Grant (ko'rinish ruxsati) ─────────────────────────
create table if not exists public.t2_tomon_grant (
  id bigint generated always as identity primary key,
  aloqa_id bigint not null references public.t2_tomon_aloqa(id),
  beruvchi_kompaniya_id bigint not null references public.t2_kompaniya(id),
  oluvchi_kompaniya_id bigint not null references public.t2_kompaniya(id),
  resurs text not null references public.t2_tomon_resurs(kalit),
  amallar text[] not null check (cardinality(amallar) between 1 and 10),
  loyiha_id bigint,
  obyekt_id bigint,
  shartnoma_id bigint,
  holat text not null default 'faol' check (holat in ('faol','bekor')),
  berdi_actor_id bigint not null,
  yaratildi timestamptz not null default now(),
  bekor_actor_id bigint,
  bekor_vaqti timestamptz,
  check (beruvchi_kompaniya_id <> oluvchi_kompaniya_id),
  check (loyiha_id is not null or obyekt_id is not null or shartnoma_id is not null)
);
create unique index if not exists t2_tomon_grant_faol_uq on public.t2_tomon_grant
  (aloqa_id, beruvchi_kompaniya_id, resurs, coalesce(loyiha_id, 0), coalesce(obyekt_id, 0), coalesce(shartnoma_id, 0)) where holat = 'faol';
create index if not exists t2_tomon_grant_oluvchi_idx on public.t2_tomon_grant (oluvchi_kompaniya_id, beruvchi_kompaniya_id, resurs) where holat = 'faol';
alter table public.t2_tomon_grant enable row level security;
revoke all on table public.t2_tomon_grant from anon, authenticated;

-- ───────────────────────── 4. Taqdim (submission) ─────────────────────────
create table if not exists public.t2_tomon_taqdim (
  id bigint generated always as identity primary key,
  aloqa_id bigint not null references public.t2_tomon_aloqa(id),
  taqdim_etuvchi_kompaniya_id bigint not null references public.t2_kompaniya(id),
  qabul_qiluvchi_kompaniya_id bigint not null references public.t2_kompaniya(id),
  resurs text not null references public.t2_tomon_resurs(kalit),
  manba_jadval text not null check (manba_jadval in ('t2_akt','t2_document_registry')),
  manba_id bigint not null,
  obyekt_id bigint,
  shartnoma_id bigint,
  nom text not null check (length(btrim(nom)) between 1 and 300),
  oy date,
  summa numeric(20,2),
  snapshot jsonb not null default '{}'::jsonb,
  snapshot_xesh text,
  oldingi_taqdim_id bigint references public.t2_tomon_taqdim(id),
  holat text not null default 'yuborilgan' check (holat in ('yuborilgan','ko_rilmoqda','qabul','rad','tuzatish','qaytarilgan')),
  taqdim_actor_id bigint not null,
  taqdim_vaqti timestamptz not null default now(),
  taqdim_izoh text check (taqdim_izoh is null or length(taqdim_izoh) <= 1000),
  qaror_actor_id bigint,
  qaror_vaqti timestamptz,
  qaror_izoh text check (qaror_izoh is null or length(qaror_izoh) <= 2000),
  operation_id uuid,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  check (taqdim_etuvchi_kompaniya_id <> qabul_qiluvchi_kompaniya_id)
);
create unique index if not exists t2_tomon_taqdim_operation_uq on public.t2_tomon_taqdim (taqdim_etuvchi_kompaniya_id, operation_id) where operation_id is not null;
-- Bir hujjat bir aloqada bir vaqtda faqat bitta "ochiq" taqdimda bo'lishi mumkin (qayta yuborish — tuzatishdan keyin).
create unique index if not exists t2_tomon_taqdim_ochiq_uq on public.t2_tomon_taqdim (aloqa_id, manba_jadval, manba_id) where holat in ('yuborilgan','ko_rilmoqda','qabul');
create index if not exists t2_tomon_taqdim_qabul_idx on public.t2_tomon_taqdim (qabul_qiluvchi_kompaniya_id, holat, taqdim_vaqti desc);
create index if not exists t2_tomon_taqdim_yuboruvchi_idx on public.t2_tomon_taqdim (taqdim_etuvchi_kompaniya_id, holat, taqdim_vaqti desc);
alter table public.t2_tomon_taqdim enable row level security;
revoke all on table public.t2_tomon_taqdim from anon, authenticated;

-- ───────────────────────── 5. Hodisalar jurnali (o'zgarmas) ─────────────────────────
create table if not exists public.t2_tomon_hodisa (
  id bigint generated always as identity primary key,
  aloqa_id bigint references public.t2_tomon_aloqa(id),
  taqdim_id bigint references public.t2_tomon_taqdim(id),
  kompaniya_id bigint references public.t2_kompaniya(id),
  actor_id bigint,
  tur text not null check (tur in ('taklif','qabul','rad','bekor','toxtatish','davom','yopish','grant','grant_bekor','taqdim','korilmoqda','qaror','izoh','qaytarish','kod_xato','qidiruv')),
  matn text check (matn is null or length(matn) <= 4000),
  meta jsonb not null default '{}'::jsonb,
  vaqt timestamptz not null default now()
);
create index if not exists t2_tomon_hodisa_aloqa_idx on public.t2_tomon_hodisa (aloqa_id, vaqt desc);
create index if not exists t2_tomon_hodisa_taqdim_idx on public.t2_tomon_hodisa (taqdim_id, vaqt);
create index if not exists t2_tomon_hodisa_actor_idx on public.t2_tomon_hodisa (actor_id, tur, vaqt desc);
alter table public.t2_tomon_hodisa enable row level security;
revoke all on table public.t2_tomon_hodisa from anon, authenticated;

create or replace function public._t2_tomon_hodisa_ozgarmas() returns trigger language plpgsql as $$
begin
  raise exception 'Tomon hodisalari jurnali o''zgartirilmaydi' using errcode = '42501';
end $$;
drop trigger if exists t2_tomon_hodisa_ozgarmas on public.t2_tomon_hodisa;
create trigger t2_tomon_hodisa_ozgarmas before update or delete on public.t2_tomon_hodisa for each row execute function public._t2_tomon_hodisa_ozgarmas();

-- ───────────────────────── 6. Yordamchilar ─────────────────────────
-- Rol → amal. Rollar erkin matn (t2_azolik.rol): yangi rol = shu yerga bitta qator.
create or replace function public._t2_tomon_rol_ok(p_rol text, p_amal text) returns boolean
language sql immutable as $$
  select case p_amal
    when 'boshqarish' then p_rol in ('superadmin','admin','boss','rahbar','director')
    when 'taqdim'     then p_rol in ('superadmin','admin','boss','rahbar','director','pto')
    when 'qaror'      then p_rol in ('superadmin','admin','boss','rahbar','director','buyurtmachi')
    when 'izoh'       then p_rol not in ('kuzatuvchi')
    when 'korish'     then true
    else false end
$$;

create or replace function public._t2_tomon_azo(p_actor_id bigint, p_kompaniya_id bigint, p_amal text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if not public._t2_tomon_rol_ok(v_rol, p_amal) then
    raise exception 'TOMON_ROL_YETARLI_EMAS: % roli "%" amalini bajara olmaydi', v_rol, p_amal using errcode = '42501';
  end if;
  return v_rol;
end $$;

create or replace function public._t2_tomon_hodisa_yoz(p_aloqa_id bigint, p_taqdim_id bigint, p_kompaniya_id bigint, p_actor_id bigint, p_tur text, p_matn text, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.t2_tomon_hodisa (aloqa_id, taqdim_id, kompaniya_id, actor_id, tur, matn, meta)
  values (p_aloqa_id, p_taqdim_id, p_kompaniya_id, p_actor_id, p_tur, nullif(btrim(coalesce(p_matn, '')), ''), coalesce(p_meta, '{}'::jsonb));
$$;

-- Qarshi tomon: aloqada p_kompaniya_id ning qarshisidagi kompaniya (yo'q bo'lsa NULL).
create or replace function public._t2_tomon_qarshi(p_aloqa public.t2_tomon_aloqa, p_kompaniya_id bigint) returns bigint
language sql immutable as $$
  select case when p_aloqa.taklif_kompaniya_id = p_kompaniya_id then p_aloqa.qabul_kompaniya_id
              when p_aloqa.qabul_kompaniya_id = p_kompaniya_id then p_aloqa.taklif_kompaniya_id end
$$;

-- ASOSIY QOIDA: p_oluvchi kompaniya p_beruvchi kompaniyaning p_obyekt_id dagi p_resurs ustida p_amal ni bajara oladimi?
-- Faqat FAOL aloqa + FAOL grant + obyekt beruvchiniki va (aniq obyekt | uning loyihasi | faol shartnoma bog'i) doirasida.
create or replace function public.t2_tomon_ruxsat_bor(p_oluvchi bigint, p_beruvchi bigint, p_resurs text, p_amal text, p_obyekt_id bigint)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select true
      from public.t2_tomon_grant g
      join public.t2_tomon_aloqa a on a.id = g.aloqa_id and a.holat = 'faol'
      join public.t2_tomon_resurs r on r.kalit = g.resurs and r.faol
      join public.t2_obyekt o on o.id = p_obyekt_id and o.kompaniya_id = g.beruvchi_kompaniya_id and o.holat = 'faol'
     where g.holat = 'faol'
       and g.oluvchi_kompaniya_id = p_oluvchi and g.beruvchi_kompaniya_id = p_beruvchi
       and g.resurs = p_resurs and p_amal = any (g.amallar) and p_amal = any (r.amallar)
       and ((a.taklif_kompaniya_id = p_oluvchi and a.qabul_kompaniya_id = p_beruvchi) or (a.qabul_kompaniya_id = p_oluvchi and a.taklif_kompaniya_id = p_beruvchi))
       and (g.obyekt_id = o.id
            or (g.loyiha_id is not null and o.loyiha_id = g.loyiha_id)
            or (g.shartnoma_id is not null and exists (select 1 from public.t2_shartnoma_bog b where b.obyekt_id = o.id and b.shartnoma_id = g.shartnoma_id and b.holat = 'faol')))
     limit 1
  ), false)
$$;

-- ───────────────────────── 7. Aloqa RPC lari ─────────────────────────
create or replace function public.t2_tomon_kompaniya_qidir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_inn text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_inn text := btrim(coalesce(p_inn, '')); v_son integer; v_k record;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  if v_inn !~ '^[0-9]{9}$' then return jsonb_build_object('ok', false, 'code', 'INN_NOTOGRI', 'error', 'INN 9 raqamdan iborat bo''lishi kerak'); end if;
  -- Ro'yxat chiqarib olishga qarshi: bir soatda 30 tadan ko'p qidiruv yo'q.
  select count(*) into v_son from public.t2_tomon_hodisa where actor_id = p_actor_id and tur = 'qidiruv' and vaqt > now() - interval '1 hour';
  if v_son >= 30 then return jsonb_build_object('ok', false, 'code', 'KOP_SOROV', 'error', 'Juda ko''p qidiruv — keyinroq urinib ko''ring'); end if;
  perform public._t2_tomon_hodisa_yoz(null, null, p_kompaniya_id, p_actor_id, 'qidiruv', null, '{}'::jsonb);
  select k.id, k.nom, k.inn into v_k from public.t2_kompaniya k where k.inn = v_inn and k.faol and k.id <> p_kompaniya_id order by k.id limit 1;
  if not found then return jsonb_build_object('ok', true, 'topildi', false); end if;
  return jsonb_build_object('ok', true, 'topildi', true, 'kompaniya', jsonb_build_object('id', v_k.id, 'nom', v_k.nom, 'inn', v_k.inn));
end $$;

create or replace function public.t2_tomon_taklif_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_qabul_kompaniya_id bigint, p_qabul_inn text, p_qabul_nom text,
  p_taklif_rol text, p_qabul_rol text, p_turi text, p_nom text, p_izoh text, p_kod_xesh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_qabul bigint := p_qabul_kompaniya_id; v_inn text := nullif(btrim(coalesce(p_qabul_inn, '')), '');
  v_id bigint; v_old public.t2_tomon_aloqa;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  if p_operation_id is not null then
    select * into v_old from public.t2_tomon_aloqa where taklif_kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
    if found then return jsonb_build_object('ok', true, 'id', v_old.id, 'holat', v_old.holat, 'qayta', true, 'kod_kerak', v_old.qabul_kompaniya_id is null); end if;
  end if;
  if length(btrim(coalesce(p_taklif_rol, ''))) < 2 or length(btrim(coalesce(p_qabul_rol, ''))) < 2 then
    return jsonb_build_object('ok', false, 'code', 'ROL_KERAK', 'error', 'Ikkala tomonning roli kerak (masalan: pudratchi / zakazchik)');
  end if;
  if v_inn is not null and v_inn !~ '^[0-9]{9}$' then return jsonb_build_object('ok', false, 'code', 'INN_NOTOGRI', 'error', 'INN 9 raqamdan iborat bo''lishi kerak'); end if;
  if v_qabul is null and v_inn is not null then
    select k.id into v_qabul from public.t2_kompaniya k where k.inn = v_inn and k.faol and k.id <> p_kompaniya_id order by k.id limit 1;
  elsif v_qabul is not null and not exists (select 1 from public.t2_kompaniya k where k.id = v_qabul and k.inn is not null and k.inn = v_inn) then
    -- Kompaniya ID ni taxmin qilib taklif yuborib bo'lmaydi: ID faqat INN qidiruvi natijasi sifatida, INN bilan birga qabul qilinadi.
    return jsonb_build_object('ok', false, 'code', 'INN_MOS_EMAS', 'error', 'Kompaniya INN si mos emas — avval INN bo''yicha qidiring');
  end if;
  if v_qabul is not null then
    if v_qabul = p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'OZI', 'error', 'Kompaniya o''zi bilan aloqa o''rnata olmaydi'); end if;
    if not exists (select 1 from public.t2_kompaniya k where k.id = v_qabul and k.faol) then
      return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_YOQ', 'error', 'Kompaniya topilmadi');
    end if;
    if exists (select 1 from public.t2_tomon_aloqa a
                where least(a.taklif_kompaniya_id, a.qabul_kompaniya_id) = least(p_kompaniya_id, v_qabul)
                  and greatest(a.taklif_kompaniya_id, a.qabul_kompaniya_id) = greatest(p_kompaniya_id, v_qabul)
                  and lower(a.turi) = lower(btrim(coalesce(p_turi, 'shartnoma'))) and lower(a.taklif_rol) = lower(btrim(p_taklif_rol)) and lower(a.qabul_rol) = lower(btrim(p_qabul_rol))
                  and a.holat in ('taklif','faol','toxtatilgan')) then
      return jsonb_build_object('ok', false, 'code', 'ALLAQACHON', 'error', 'Bu tomon bilan shu turdagi aloqa allaqachon mavjud');
    end if;
  elsif p_kod_xesh is null or length(p_kod_xesh) < 32 then
    return jsonb_build_object('ok', false, 'code', 'KOD_KERAK', 'error', 'Tizimda topilmagan tomon uchun taklif kodi kerak');
  end if;
  insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, nom, qabul_nom, qabul_inn, kod_xesh, kod_muddati, holat, taklif_actor_id, izoh, operation_id)
  values (p_kompaniya_id, v_qabul, btrim(p_taklif_rol), btrim(p_qabul_rol), lower(btrim(coalesce(nullif(p_turi, ''), 'shartnoma'))), nullif(btrim(coalesce(p_nom, '')), ''),
          nullif(btrim(coalesce(p_qabul_nom, '')), ''), v_inn,
          case when v_qabul is null then p_kod_xesh end, case when v_qabul is null then now() + interval '7 days' end,
          'taklif', p_actor_id, nullif(btrim(coalesce(p_izoh, '')), ''), p_operation_id)
  returning id into v_id;
  perform public._t2_tomon_hodisa_yoz(v_id, null, p_kompaniya_id, p_actor_id, 'taklif', p_izoh, jsonb_build_object('qabul_kompaniya_id', v_qabul, 'taklif_rol', p_taklif_rol, 'qabul_rol', p_qabul_rol));
  return jsonb_build_object('ok', true, 'id', v_id, 'holat', 'taklif', 'kod_kerak', v_qabul is null);
end $$;

create or replace function public.t2_tomon_javob_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_qaror text, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.t2_tomon_aloqa;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  if p_qaror not in ('qabul','rad') then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI', 'error', 'qaror: qabul yoki rad'); end if;
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id for update;
  if not found or a.qabul_kompaniya_id is distinct from p_kompaniya_id then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taklif topilmadi');
  end if;
  if a.holat <> 'taklif' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Taklif allaqachon javob olgan'); end if;
  update public.t2_tomon_aloqa
     set holat = case when p_qaror = 'qabul' then 'faol' else 'rad' end, javob_actor_id = p_actor_id, javob_vaqti = now(),
         javob_izoh = nullif(btrim(coalesce(p_izoh, '')), ''), kod_xesh = null, kod_muddati = null, versiya = versiya + 1, yangilandi = now()
   where id = p_aloqa_id;
  perform public._t2_tomon_hodisa_yoz(p_aloqa_id, null, p_kompaniya_id, p_actor_id, p_qaror, p_izoh);
  return jsonb_build_object('ok', true, 'id', p_aloqa_id, 'holat', case when p_qaror = 'qabul' then 'faol' else 'rad' end);
end $$;

create or replace function public.t2_tomon_kod_qabul_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kod_xesh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.t2_tomon_aloqa; v_xato integer;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  select count(*) into v_xato from public.t2_tomon_hodisa where actor_id = p_actor_id and tur = 'kod_xato' and vaqt > now() - interval '1 hour';
  if v_xato >= 10 then return jsonb_build_object('ok', false, 'code', 'KOP_XATO', 'error', 'Juda ko''p noto''g''ri urinish — bir soatdan keyin qayta urining'); end if;
  select * into a from public.t2_tomon_aloqa
   where kod_xesh = p_kod_xesh and holat = 'taklif' and qabul_kompaniya_id is null and kod_muddati > now() for update;
  if not found or a.taklif_kompaniya_id = p_kompaniya_id then
    perform public._t2_tomon_hodisa_yoz(null, null, p_kompaniya_id, p_actor_id, 'kod_xato', null);
    return jsonb_build_object('ok', false, 'code', 'KOD_NOTOGRI', 'error', 'Kod noto''g''ri yoki muddati o''tgan');
  end if;
  update public.t2_tomon_aloqa
     set qabul_kompaniya_id = p_kompaniya_id, holat = 'faol', javob_actor_id = p_actor_id, javob_vaqti = now(), kod_xesh = null, kod_muddati = null, versiya = versiya + 1, yangilandi = now()
   where id = a.id;
  perform public._t2_tomon_hodisa_yoz(a.id, null, p_kompaniya_id, p_actor_id, 'qabul', 'Taklif kodi orqali qabul qilindi');
  return jsonb_build_object('ok', true, 'id', a.id, 'holat', 'faol');
end $$;

create or replace function public.t2_tomon_holat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_amal text, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.t2_tomon_aloqa; v_yangi text; v_tur text;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id for update;
  if not found or (a.taklif_kompaniya_id <> p_kompaniya_id and a.qabul_kompaniya_id is distinct from p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Aloqa topilmadi');
  end if;
  case p_amal
    when 'toxtatish' then
      if a.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Faqat faol aloqani to''xtatish mumkin'); end if;
      v_yangi := 'toxtatilgan'; v_tur := 'toxtatish';
    when 'davom' then
      if a.holat <> 'toxtatilgan' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Faqat to''xtatilgan aloqani davom ettirish mumkin'); end if;
      v_yangi := 'faol'; v_tur := 'davom';
    when 'yopish' then
      if a.holat not in ('faol','toxtatilgan') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Aloqa yopilishi mumkin emas'); end if;
      if length(btrim(coalesce(p_sabab, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'SABAB_KERAK', 'error', 'Yopish sababi kerak'); end if;
      v_yangi := 'yopilgan'; v_tur := 'yopish';
    when 'bekor' then
      if a.holat <> 'taklif' or a.taklif_kompaniya_id <> p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Faqat o''zingiz yuborgan javobsiz taklifni bekor qilish mumkin'); end if;
      v_yangi := 'bekor'; v_tur := 'bekor';
    else return jsonb_build_object('ok', false, 'code', 'AMAL_NOTOGRI', 'error', 'amal: toxtatish | davom | yopish | bekor');
  end case;
  update public.t2_tomon_aloqa
     set holat = v_yangi, versiya = versiya + 1, yangilandi = now(), kod_xesh = case when v_yangi in ('yopilgan','bekor') then null else kod_xesh end,
         yopish_actor_id = case when v_yangi in ('yopilgan','bekor') then p_actor_id else yopish_actor_id end,
         yopilgan_vaqti = case when v_yangi in ('yopilgan','bekor') then now() else yopilgan_vaqti end,
         yopish_sababi = case when v_yangi in ('yopilgan','bekor') then nullif(btrim(coalesce(p_sabab, '')), '') else yopish_sababi end
   where id = a.id;
  if v_yangi in ('yopilgan','bekor') then
    update public.t2_tomon_grant set holat = 'bekor', bekor_actor_id = p_actor_id, bekor_vaqti = now() where aloqa_id = a.id and holat = 'faol';
  end if;
  perform public._t2_tomon_hodisa_yoz(a.id, null, p_kompaniya_id, p_actor_id, v_tur, p_sabab);
  return jsonb_build_object('ok', true, 'id', a.id, 'holat', v_yangi);
end $$;

-- ───────────────────────── 8. Grant RPC lari ─────────────────────────
create or replace function public.t2_tomon_grant_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_grantlar jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.t2_tomon_aloqa; v_qarshi bigint; e jsonb; r public.t2_tomon_resurs; v_amallar text[]; v_loyiha bigint; v_obyekt bigint; v_shart bigint;
  v_son integer := 0; v_id bigint;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  if jsonb_typeof(p_grantlar) <> 'array' or jsonb_array_length(p_grantlar) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'code', 'GRANT_KERAK', 'error', 'grantlar: 1–200 ta element');
  end if;
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id;
  if not found or (a.taklif_kompaniya_id <> p_kompaniya_id and a.qabul_kompaniya_id is distinct from p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Aloqa topilmadi');
  end if;
  if a.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Ruxsat faqat faol aloqada beriladi'); end if;
  v_qarshi := public._t2_tomon_qarshi(a, p_kompaniya_id);
  for e in select * from jsonb_array_elements(p_grantlar) loop
    select * into r from public.t2_tomon_resurs where kalit = e->>'resurs' and faol;
    if not found then return jsonb_build_object('ok', false, 'code', 'RESURS_YOQ', 'error', 'Resurs ochiq emas: ' || coalesce(e->>'resurs', '?')); end if;
    select array_agg(distinct x) into v_amallar from jsonb_array_elements_text(coalesce(e->'amallar', '[]'::jsonb)) x;
    if v_amallar is null or not (v_amallar <@ r.amallar) then
      return jsonb_build_object('ok', false, 'code', 'AMAL_NOTOGRI', 'error', 'Amallar resursga mos emas: ' || r.kalit);
    end if;
    v_loyiha := nullif(e->>'loyiha_id', '')::bigint; v_obyekt := nullif(e->>'obyekt_id', '')::bigint; v_shart := nullif(e->>'shartnoma_id', '')::bigint;
    if (v_loyiha is not null)::int + (v_obyekt is not null)::int + (v_shart is not null)::int <> 1 then
      return jsonb_build_object('ok', false, 'code', 'DOIRA_KERAK', 'error', 'Aynan bitta doira kerak: loyiha_id YOKI obyekt_id YOKI shartnoma_id');
    end if;
    -- Doira FAQAT beruvchining (p_kompaniya_id) o'z ob'ektlari bo'lishi shart.
    if v_obyekt is not null and not exists (select 1 from public.t2_obyekt where id = v_obyekt and kompaniya_id = p_kompaniya_id and holat = 'faol') then
      return jsonb_build_object('ok', false, 'code', 'DOIRA_BEGONA', 'error', 'Obyekt sizning kompaniyangizniki emas');
    end if;
    if v_loyiha is not null and not exists (select 1 from public.t2_loyiha where id = v_loyiha and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'DOIRA_BEGONA', 'error', 'Loyiha sizning kompaniyangizniki emas');
    end if;
    if v_shart is not null and not exists (select 1 from public.t2_shartnoma where id = v_shart and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'DOIRA_BEGONA', 'error', 'Shartnoma sizning kompaniyangizniki emas');
    end if;
    select g.id into v_id from public.t2_tomon_grant g
     where g.aloqa_id = a.id and g.beruvchi_kompaniya_id = p_kompaniya_id and g.resurs = r.kalit and g.holat = 'faol'
       and coalesce(g.loyiha_id, 0) = coalesce(v_loyiha, 0) and coalesce(g.obyekt_id, 0) = coalesce(v_obyekt, 0) and coalesce(g.shartnoma_id, 0) = coalesce(v_shart, 0);
    if found then
      update public.t2_tomon_grant set amallar = v_amallar where id = v_id;
    else
      insert into public.t2_tomon_grant (aloqa_id, beruvchi_kompaniya_id, oluvchi_kompaniya_id, resurs, amallar, loyiha_id, obyekt_id, shartnoma_id, berdi_actor_id)
      values (a.id, p_kompaniya_id, v_qarshi, r.kalit, v_amallar, v_loyiha, v_obyekt, v_shart, p_actor_id) returning id into v_id;
    end if;
    perform public._t2_tomon_hodisa_yoz(a.id, null, p_kompaniya_id, p_actor_id, 'grant', null,
      jsonb_build_object('grant_id', v_id, 'resurs', r.kalit, 'amallar', v_amallar, 'loyiha_id', v_loyiha, 'obyekt_id', v_obyekt, 'shartnoma_id', v_shart));
    v_son := v_son + 1;
  end loop;
  return jsonb_build_object('ok', true, 'saqlandi', v_son);
end $$;

create or replace function public.t2_tomon_grant_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_grant_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g public.t2_tomon_grant;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  select * into g from public.t2_tomon_grant where id = p_grant_id for update;
  if not found or g.beruvchi_kompaniya_id <> p_kompaniya_id or g.holat <> 'faol' then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Ruxsat topilmadi');
  end if;
  update public.t2_tomon_grant set holat = 'bekor', bekor_actor_id = p_actor_id, bekor_vaqti = now() where id = g.id;
  perform public._t2_tomon_hodisa_yoz(g.aloqa_id, null, p_kompaniya_id, p_actor_id, 'grant_bekor', null, jsonb_build_object('grant_id', g.id, 'resurs', g.resurs));
  return jsonb_build_object('ok', true);
end $$;

-- ───────────────────────── 9. Taqdim RPC lari ─────────────────────────
create or replace function public._t2_tomon_f2_xesh(p_akt_id bigint) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select md5(coalesce(string_agg(aq.qator_id::text || ':' || coalesce(coalesce(aq.certified_quantity, aq.hajm)::text, '') || ':' || coalesce(coalesce(aq.certified_unit_price, aq.narx)::text, '') || ':' || coalesce(coalesce(aq.certified_amount, aq.summa)::text, ''), ',' order by aq.qator_id, aq.id), ''))
    from public.t2_akt_qator aq where aq.akt_id = p_akt_id
$$;

create or replace function public.t2_tomon_taqdim_yarat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_resurs text, p_manba_id bigint, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.t2_tomon_aloqa; r public.t2_tomon_resurs; v_qarshi bigint; v_id bigint; v_old public.t2_tomon_taqdim; v_oldingi bigint;
  t public.t2_akt; d public.t2_document_registry; v_nom text; v_oy date; v_summa numeric; v_obyekt bigint; v_shart bigint; v_snap jsonb; v_xesh text; v_jadval text;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'taqdim');
  if p_operation_id is not null then
    select * into v_old from public.t2_tomon_taqdim where taqdim_etuvchi_kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
    if found then return jsonb_build_object('ok', true, 'id', v_old.id, 'holat', v_old.holat, 'qayta', true); end if;
  end if;
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id;
  if not found or (a.taklif_kompaniya_id <> p_kompaniya_id and a.qabul_kompaniya_id is distinct from p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Aloqa topilmadi');
  end if;
  if a.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Hujjat faqat faol aloqaga yuboriladi'); end if;
  v_qarshi := public._t2_tomon_qarshi(a, p_kompaniya_id);
  select * into r from public.t2_tomon_resurs where kalit = p_resurs and faol and taqdim_mumkin;
  if not found then return jsonb_build_object('ok', false, 'code', 'RESURS_YOQ', 'error', 'Bu turdagi hujjat yuborilmaydi: ' || coalesce(p_resurs, '?')); end if;

  if p_resurs = 'f2' then
    select * into t from public.t2_akt where id = p_manba_id and kompaniya_id = p_kompaniya_id and tur = 'f2';
    if not found then return jsonb_build_object('ok', false, 'code', 'HUJJAT_YOQ', 'error', 'F2 akt topilmadi'); end if;
    if t.lifecycle_status is distinct from 'approved' then return jsonb_build_object('ok', false, 'code', 'TASDIQLANMAGAN', 'error', 'Faqat ichki tasdiqlangan F2 yuboriladi'); end if;
    v_jadval := 't2_akt'; v_obyekt := t.obyekt_id; v_shart := t.shartnoma_id; v_oy := t.oy; v_summa := t.hujjat_jami;
    v_nom := 'Ф-2 № ' || coalesce(nullif(t.raqam, ''), t.id::text);
    v_xesh := public._t2_tomon_f2_xesh(t.id);
    v_snap := jsonb_build_object('tur', 'f2', 'akt_id', t.id, 'raqam', t.raqam, 'oy', t.oy, 'sana', t.sana, 'hujjat_jami', t.hujjat_jami, 'versiya', t.versiya,
                                 'qator_soni', (select count(*) from public.t2_akt_qator where akt_id = t.id));
  else
    select * into d from public.t2_document_registry where id = p_manba_id and kompaniya_id = p_kompaniya_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'HUJJAT_YOQ', 'error', 'Hujjat topilmadi'); end if;
    if d.canonical_storage_status is distinct from 'stored' or d.status is distinct from 'active' or d.finalized_at is null then
      return jsonb_build_object('ok', false, 'code', 'HUJJAT_TAYYOR_EMAS', 'error', 'Hujjat hali to''liq saqlanmagan');
    end if;
    v_jadval := 't2_document_registry'; v_obyekt := d.obyekt_id; v_shart := null; v_oy := null; v_summa := null;
    v_nom := coalesce(nullif(d.original_filename, ''), d.document_type || ' #' || d.id);
    v_xesh := d.sha256;
    v_snap := jsonb_build_object('tur', 'hujjat', 'document_id', d.id, 'document_type', d.document_type, 'fayl', d.original_filename, 'mime', d.mime_type, 'olcham', d.size_bytes, 'sha256', d.sha256, 'revision_seq', d.revision_seq);
  end if;
  if v_obyekt is null or not exists (select 1 from public.t2_obyekt where id = v_obyekt and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_KERAK', 'error', 'Hujjat obyektga bog''langan bo''lishi kerak');
  end if;
  -- Tuzatish so'ralgan taqdimning davomi bo'lsa — zanjir.
  select id into v_oldingi from public.t2_tomon_taqdim
   where aloqa_id = a.id and manba_jadval = v_jadval and manba_id = p_manba_id and holat = 'tuzatish' order by id desc limit 1;
  begin
    insert into public.t2_tomon_taqdim (aloqa_id, taqdim_etuvchi_kompaniya_id, qabul_qiluvchi_kompaniya_id, resurs, manba_jadval, manba_id, obyekt_id, shartnoma_id, nom, oy, summa,
                                        snapshot, snapshot_xesh, oldingi_taqdim_id, taqdim_actor_id, taqdim_izoh, operation_id)
    values (a.id, p_kompaniya_id, v_qarshi, p_resurs, v_jadval, p_manba_id, v_obyekt, v_shart, v_nom, v_oy, v_summa, v_snap, v_xesh, v_oldingi, p_actor_id, nullif(btrim(coalesce(p_izoh, '')), ''), p_operation_id)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'ALLAQACHON', 'error', 'Bu hujjat allaqachon yuborilgan va hal qilinmagan/qabul qilingan');
  end;
  perform public._t2_tomon_hodisa_yoz(a.id, v_id, p_kompaniya_id, p_actor_id, 'taqdim', p_izoh, jsonb_build_object('resurs', p_resurs, 'manba_id', p_manba_id, 'xesh', v_xesh));
  return jsonb_build_object('ok', true, 'id', v_id, 'holat', 'yuborilgan');
end $$;

create or replace function public.t2_tomon_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint, p_qaror text, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.t2_tomon_taqdim; v_yangi text;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'qaror');
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id for update;
  if not found or q.qabul_qiluvchi_kompaniya_id <> p_kompaniya_id then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taqdim topilmadi');
  end if;
  if not exists (select 1 from public.t2_tomon_aloqa where id = q.aloqa_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ALOQA_FAOL_EMAS', 'error', 'Aloqa faol emas');
  end if;
  v_yangi := case p_qaror when 'korilmoqda' then 'ko_rilmoqda' when 'qabul' then 'qabul' when 'rad' then 'rad' when 'tuzatish' then 'tuzatish' end;
  if v_yangi is null then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI', 'error', 'qaror: korilmoqda | qabul | rad | tuzatish'); end if;
  if q.holat not in ('yuborilgan','ko_rilmoqda') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Bu taqdim bo''yicha qaror allaqachon chiqarilgan'); end if;
  if v_yangi in ('rad','tuzatish') and length(btrim(coalesce(p_izoh, ''))) < 3 then
    return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK', 'error', 'Rad etish yoki tuzatish so''rash uchun izoh yozing');
  end if;
  update public.t2_tomon_taqdim
     set holat = v_yangi, versiya = versiya + 1, yangilandi = now(),
         qaror_actor_id = case when v_yangi = 'ko_rilmoqda' then qaror_actor_id else p_actor_id end,
         qaror_vaqti = case when v_yangi = 'ko_rilmoqda' then qaror_vaqti else now() end,
         qaror_izoh = case when v_yangi = 'ko_rilmoqda' then qaror_izoh else nullif(btrim(coalesce(p_izoh, '')), '') end
   where id = q.id;
  perform public._t2_tomon_hodisa_yoz(q.aloqa_id, q.id, p_kompaniya_id, p_actor_id, case when v_yangi = 'ko_rilmoqda' then 'korilmoqda' else 'qaror' end, p_izoh, jsonb_build_object('qaror', v_yangi));
  return jsonb_build_object('ok', true, 'id', q.id, 'holat', v_yangi);
end $$;

create or replace function public.t2_tomon_taqdim_qaytar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.t2_tomon_taqdim;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'taqdim');
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id for update;
  if not found or q.taqdim_etuvchi_kompaniya_id <> p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taqdim topilmadi'); end if;
  if q.holat <> 'yuborilgan' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Faqat ko''rib chiqilmagan taqdimni qaytarib olish mumkin'); end if;
  update public.t2_tomon_taqdim set holat = 'qaytarilgan', versiya = versiya + 1, yangilandi = now() where id = q.id;
  perform public._t2_tomon_hodisa_yoz(q.aloqa_id, q.id, p_kompaniya_id, p_actor_id, 'qaytarish', p_sabab);
  return jsonb_build_object('ok', true, 'id', q.id, 'holat', 'qaytarilgan');
end $$;

create or replace function public.t2_tomon_izoh_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_taqdim_id bigint, p_matn text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.t2_tomon_aloqa; q public.t2_tomon_taqdim; v_matn text := btrim(coalesce(p_matn, ''));
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'izoh');
  if length(v_matn) < 1 or length(v_matn) > 2000 then return jsonb_build_object('ok', false, 'code', 'MATN_KERAK', 'error', 'Izoh 1–2000 belgi'); end if;
  if p_taqdim_id is not null then
    select * into q from public.t2_tomon_taqdim where id = p_taqdim_id;
    if not found or (q.taqdim_etuvchi_kompaniya_id <> p_kompaniya_id and q.qabul_qiluvchi_kompaniya_id <> p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taqdim topilmadi');
    end if;
    p_aloqa_id := q.aloqa_id;
  end if;
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id;
  if not found or (a.taklif_kompaniya_id <> p_kompaniya_id and a.qabul_kompaniya_id is distinct from p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Aloqa topilmadi');
  end if;
  if a.holat not in ('faol','toxtatilgan') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Aloqa faol emas'); end if;
  perform public._t2_tomon_hodisa_yoz(a.id, p_taqdim_id, p_kompaniya_id, p_actor_id, 'izoh', v_matn);
  return jsonb_build_object('ok', true);
end $$;

-- ───────────────────────── 10. O'qish RPC lari ─────────────────────────
create or replace function public.t2_tomon_aloqalar_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', a.id, 'holat', a.holat, 'turi', a.turi, 'nom', a.nom,
      'men_taklif_qildim', a.taklif_kompaniya_id = p_kompaniya_id,
      'men_rol', case when a.taklif_kompaniya_id = p_kompaniya_id then a.taklif_rol else a.qabul_rol end,
      'qarshi_rol', case when a.taklif_kompaniya_id = p_kompaniya_id then a.qabul_rol else a.taklif_rol end,
      'qarshi_kompaniya_id', public._t2_tomon_qarshi(a, p_kompaniya_id),
      'qarshi_nom', coalesce(c.nom, a.qabul_nom, 'Tizimda hali yo''q'),
      'qarshi_inn', coalesce(c.inn, a.qabul_inn),
      'kod_kutilmoqda', a.qabul_kompaniya_id is null and a.holat = 'taklif',
      'kod_muddati', case when a.taklif_kompaniya_id = p_kompaniya_id then a.kod_muddati end,
      'taklif_vaqti', a.taklif_vaqti, 'javob_vaqti', a.javob_vaqti, 'yopish_sababi', a.yopish_sababi, 'izoh', a.izoh,
      'berilgan_grant_soni', (select count(*) from public.t2_tomon_grant g where g.aloqa_id = a.id and g.holat = 'faol' and g.beruvchi_kompaniya_id = p_kompaniya_id),
      'olingan_grant_soni', (select count(*) from public.t2_tomon_grant g where g.aloqa_id = a.id and g.holat = 'faol' and g.oluvchi_kompaniya_id = p_kompaniya_id),
      'kelgan_ochiq_taqdim', (select count(*) from public.t2_tomon_taqdim q where q.aloqa_id = a.id and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat in ('yuborilgan','ko_rilmoqda')),
      'yuborilgan_ochiq_taqdim', (select count(*) from public.t2_tomon_taqdim q where q.aloqa_id = a.id and q.taqdim_etuvchi_kompaniya_id = p_kompaniya_id and q.holat in ('yuborilgan','ko_rilmoqda','tuzatish'))
    ) x
      from public.t2_tomon_aloqa a
      left join public.t2_kompaniya c on c.id = public._t2_tomon_qarshi(a, p_kompaniya_id)
     where a.taklif_kompaniya_id = p_kompaniya_id or a.qabul_kompaniya_id = p_kompaniya_id
  ) s;
  return v;
end $$;

create or replace function public.t2_tomon_aloqa_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.t2_tomon_aloqa; v_qarshi bigint;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id;
  if not found or (a.taklif_kompaniya_id <> p_kompaniya_id and a.qabul_kompaniya_id is distinct from p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Aloqa topilmadi');
  end if;
  v_qarshi := public._t2_tomon_qarshi(a, p_kompaniya_id);
  return jsonb_build_object('ok', true,
    'aloqa', jsonb_build_object('id', a.id, 'holat', a.holat, 'turi', a.turi, 'nom', a.nom, 'men_rol', case when a.taklif_kompaniya_id = p_kompaniya_id then a.taklif_rol else a.qabul_rol end,
        'qarshi_rol', case when a.taklif_kompaniya_id = p_kompaniya_id then a.qabul_rol else a.taklif_rol end, 'qarshi_kompaniya_id', v_qarshi,
        'qarshi_nom', coalesce((select nom from public.t2_kompaniya where id = v_qarshi), a.qabul_nom), 'taklif_vaqti', a.taklif_vaqti, 'javob_vaqti', a.javob_vaqti, 'izoh', a.izoh),
    -- Faqat O'Z berganlarim (qarshi tomon menga nimani ochganini ko'rishim ham kerak — alohida bo'lim).
    'berilgan', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'resurs', g.resurs, 'amallar', g.amallar, 'loyiha_id', g.loyiha_id, 'obyekt_id', g.obyekt_id, 'shartnoma_id', g.shartnoma_id,
        'doira_nom', coalesce((select o.nom from public.t2_obyekt o where o.id = g.obyekt_id), (select l.nom from public.t2_loyiha l where l.id = g.loyiha_id), (select 'Shartnoma № ' || s.raqam from public.t2_shartnoma s where s.id = g.shartnoma_id)),
        'yaratildi', g.yaratildi) order by g.id) from public.t2_tomon_grant g where g.aloqa_id = a.id and g.holat = 'faol' and g.beruvchi_kompaniya_id = p_kompaniya_id), '[]'::jsonb),
    'olingan', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'resurs', g.resurs, 'amallar', g.amallar,
        'doira_nom', coalesce((select o.nom from public.t2_obyekt o where o.id = g.obyekt_id), (select l.nom from public.t2_loyiha l where l.id = g.loyiha_id), (select 'Shartnoma № ' || s.raqam from public.t2_shartnoma s where s.id = g.shartnoma_id)),
        'yaratildi', g.yaratildi) order by g.id) from public.t2_tomon_grant g where g.aloqa_id = a.id and g.holat = 'faol' and g.oluvchi_kompaniya_id = p_kompaniya_id), '[]'::jsonb),
    'hodisalar', coalesce((select jsonb_agg(h order by h->>'vaqt' desc) from (
        select jsonb_build_object('id', e.id, 'tur', e.tur, 'matn', e.matn, 'vaqt', e.vaqt, 'taqdim_id', e.taqdim_id, 'meni', e.kompaniya_id = p_kompaniya_id,
               'kompaniya_nom', (select nom from public.t2_kompaniya where id = e.kompaniya_id)) h
          from public.t2_tomon_hodisa e where e.aloqa_id = a.id and e.tur not in ('qidiruv','kod_xato') order by e.id desc limit 100) z), '[]'::jsonb));
end $$;

create or replace function public.t2_tomon_taqdimlar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text, p_holat text, p_aloqa_id bigint, p_limit integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 300);
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', q.id, 'aloqa_id', q.aloqa_id, 'resurs', q.resurs, 'nom', q.nom, 'oy', q.oy, 'summa', q.summa, 'holat', q.holat,
      'kelgan', q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id,
      'qarshi_nom', (select k.nom from public.t2_kompaniya k where k.id = case when q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id then q.taqdim_etuvchi_kompaniya_id else q.qabul_qiluvchi_kompaniya_id end),
      'obyekt_nom', (select o.nom from public.t2_obyekt o where o.id = q.obyekt_id),
      'taqdim_vaqti', q.taqdim_vaqti, 'qaror_vaqti', q.qaror_vaqti, 'qaror_izoh', q.qaror_izoh, 'oldingi_taqdim_id', q.oldingi_taqdim_id) x
      from public.t2_tomon_taqdim q
     where ((p_yonalish = 'kelgan' and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id)
         or (p_yonalish = 'yuborilgan' and q.taqdim_etuvchi_kompaniya_id = p_kompaniya_id)
         or (coalesce(p_yonalish, '') not in ('kelgan','yuborilgan') and (q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id or q.taqdim_etuvchi_kompaniya_id = p_kompaniya_id)))
       and (p_holat is null or p_holat = '' or q.holat = p_holat)
       and (p_aloqa_id is null or q.aloqa_id = p_aloqa_id)
     order by q.id desc limit v_lim
  ) s;
  return v;
end $$;

create or replace function public.t2_tomon_taqdim_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.t2_tomon_taqdim; v_qatorlar jsonb := '[]'::jsonb; v_jami integer := 0; v_xesh_hozir text; v_hodisalar jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id;
  -- Faqat taqdimning ikki tomoni; uchinchi kompaniya hech narsa ko'rmaydi (mavjudligini ham).
  if not found or (q.taqdim_etuvchi_kompaniya_id <> p_kompaniya_id and q.qabul_qiluvchi_kompaniya_id <> p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taqdim topilmadi');
  end if;
  if q.resurs = 'f2' and q.manba_jadval = 't2_akt' then
    select count(*) into v_jami from public.t2_akt_qator where akt_id = q.manba_id;
    select coalesce(jsonb_agg(z order by (z->>'tartib')::bigint), '[]'::jsonb) into v_qatorlar from (
      select jsonb_build_object('qator_id', aq.qator_id, 'tartib', row_number() over (order by qq.tartib, qq.id), 'kod', qq.kod, 'nom', qq.nom, 'birlik', qq.birlik, 'tur', qq.tur, 'kat', qq.kat,
             'hajm', coalesce(aq.certified_quantity, aq.hajm), 'narx', coalesce(aq.certified_unit_price, aq.narx), 'summa', coalesce(aq.certified_amount, aq.summa), 'narx_manba', aq.narx_manba) z
        from public.t2_akt_qator aq join public.t2_qator qq on qq.id = aq.qator_id
       where aq.akt_id = q.manba_id order by qq.tartib, qq.id limit 5000) s;
    v_xesh_hozir := public._t2_tomon_f2_xesh(q.manba_id);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'tur', e.tur, 'matn', e.matn, 'vaqt', e.vaqt, 'meni', e.kompaniya_id = p_kompaniya_id,
           'kompaniya_nom', (select nom from public.t2_kompaniya where id = e.kompaniya_id)) order by e.id), '[]'::jsonb)
    into v_hodisalar from public.t2_tomon_hodisa e where e.taqdim_id = q.id;
  return jsonb_build_object('ok', true,
    'taqdim', jsonb_build_object('id', q.id, 'aloqa_id', q.aloqa_id, 'resurs', q.resurs, 'nom', q.nom, 'oy', q.oy, 'summa', q.summa, 'holat', q.holat, 'snapshot', q.snapshot,
        'kelgan', q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id, 'obyekt_nom', (select o.nom from public.t2_obyekt o where o.id = q.obyekt_id),
        'etuvchi_nom', (select nom from public.t2_kompaniya where id = q.taqdim_etuvchi_kompaniya_id), 'qabul_qiluvchi_nom', (select nom from public.t2_kompaniya where id = q.qabul_qiluvchi_kompaniya_id),
        'taqdim_vaqti', q.taqdim_vaqti, 'taqdim_izoh', q.taqdim_izoh, 'qaror_vaqti', q.qaror_vaqti, 'qaror_izoh', q.qaror_izoh, 'oldingi_taqdim_id', q.oldingi_taqdim_id,
        'document_id', case when q.manba_jadval = 't2_document_registry' then q.manba_id end),
    'qatorlar', v_qatorlar, 'qator_jami', v_jami, 'qisqartirilgan', v_jami > 5000,
    'butunlik_ok', case when q.resurs = 'f2' then v_xesh_hozir is not distinct from q.snapshot_xesh else null end,
    'hodisalar', v_hodisalar);
end $$;

-- Zakazchik monitoringi: faqat GRANT berilgan obyektlar; har ko'rsatkich o'z resursi ruxsatiga bog'liq.
create or replace function public.t2_zakazchik_obyektlar_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by x->>'qarshi_nom', x->>'obyekt_nom'), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'aloqa_id', a.id, 'qarshi_kompaniya_id', c.id, 'qarshi_nom', c.nom, 'qarshi_rol', case when a.taklif_kompaniya_id = p_kompaniya_id then a.qabul_rol else a.taklif_rol end,
      'obyekt_id', o.id, 'obyekt_nom', o.nom,
      'shartnoma', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'shartnoma_xulosa', 'korish', o.id) then (
          select jsonb_build_object('raqam', s.raqam, 'nom', s.nom, 'summa_bez_nds', s.summa_bez_nds, 'jami_nds_bilan', s.jami_nds_bilan)
            from public.t2_shartnoma s join public.t2_shartnoma_bog b on b.shartnoma_id = s.id and b.holat = 'faol'
           where b.obyekt_id = o.id and s.holat = 'faol' order by s.asosiy desc nulls last, s.id limit 1) end,
      'f2', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'f2', 'korish', o.id) then (
          select jsonb_build_object('soni', count(*), 'jami', coalesce(sum(t.hujjat_jami), 0), 'oxirgi_oy', max(t.oy),
                 'royxat', coalesce(jsonb_agg(jsonb_build_object('akt_id', t.id, 'raqam', t.raqam, 'oy', t.oy, 'jami', t.hujjat_jami) order by t.oy desc nulls last, t.id desc), '[]'::jsonb))
            from public.t2_akt t where t.obyekt_id = o.id and t.kompaniya_id = c.id and t.tur = 'f2' and t.lifecycle_status = 'approved') end,
      'kutayotgan_taqdim', (select count(*) from public.t2_tomon_taqdim q where q.obyekt_id = o.id and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat in ('yuborilgan','ko_rilmoqda'))
    ) x
      from public.t2_tomon_aloqa a
      join public.t2_kompaniya c on c.id = public._t2_tomon_qarshi(a, p_kompaniya_id)
      join public.t2_obyekt o on o.kompaniya_id = c.id and o.holat = 'faol'
     where a.holat = 'faol' and (a.taklif_kompaniya_id = p_kompaniya_id or a.qabul_kompaniya_id = p_kompaniya_id)
       and public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'obyekt_holat', 'korish', o.id)
  ) s;
  return v;
end $$;

-- ───────────────────────── 11. Ruxsatlar ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    '_t2_tomon_rol_ok(text,text)', '_t2_tomon_azo(bigint,bigint,text)', '_t2_tomon_hodisa_yoz(bigint,bigint,bigint,bigint,text,text,jsonb)',
    '_t2_tomon_qarshi(public.t2_tomon_aloqa,bigint)', 't2_tomon_ruxsat_bor(bigint,bigint,text,text,bigint)', '_t2_tomon_f2_xesh(bigint)',
    't2_tomon_kompaniya_qidir_v1(bigint,bigint,text)',
    't2_tomon_taklif_v1(bigint,bigint,bigint,text,text,text,text,text,text,text,text,uuid)', 't2_tomon_javob_v1(bigint,bigint,bigint,text,text)',
    't2_tomon_kod_qabul_v1(bigint,bigint,text)', 't2_tomon_holat_v1(bigint,bigint,bigint,text,text)',
    't2_tomon_grant_saqla_v1(bigint,bigint,bigint,jsonb)', 't2_tomon_grant_bekor_v1(bigint,bigint,bigint)',
    't2_tomon_taqdim_yarat_v1(bigint,bigint,bigint,text,bigint,text,uuid)', 't2_tomon_qaror_v1(bigint,bigint,bigint,text,text)',
    't2_tomon_taqdim_qaytar_v1(bigint,bigint,bigint,text)', 't2_tomon_izoh_v1(bigint,bigint,bigint,bigint,text)',
    't2_tomon_aloqalar_v1(bigint,bigint)', 't2_tomon_aloqa_tafsilot_v1(bigint,bigint,bigint)', 't2_tomon_taqdimlar_v1(bigint,bigint,text,text,bigint,integer)',
    't2_tomon_taqdim_tafsilot_v1(bigint,bigint,bigint)', 't2_zakazchik_obyektlar_v1(bigint,bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
