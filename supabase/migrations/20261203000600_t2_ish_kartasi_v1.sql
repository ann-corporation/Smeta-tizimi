-- T2_ISH_KARTASI v1 (egasi 2026-11-05): «Ish kartasi» + «Narx tekshiruvi».
-- Usta narxni ShNQ bo'yicha emas, amaliy birlikda aytadi («rigel — 250 000 so'm/m»). Ish kartasi — kompaniyada bir marta
-- ta'riflanadigan real ish birligi (rigel 300×500, m) va unga bog'langan smeta qatorlari (asosiy norma + armatura materiali +
-- armatura tayyorlash + ISHORALI istisno qatorlari + zakladnoy), har biri «1 amaliy birlikka smeta birligi» koeffitsienti bilan.
-- Hisob (1 birlikka mehnat / mashina / material, ustama, QQS) — frontend `lib/ish-kartasi` + `lib/hisob-yadro` (yagona pul yadrosi).
-- Bu migratsiya FAQAT saqlash va o'qish: kartalar, bog'lar, bosqich ulushlari (kompaniya × karta turi), smeta qatorlari o'qish/qidiruv.
-- Keyingi bosqichlar uchun ustunlar tayyor: naryad narxi, usta, AI manbasi (manba = 'qolda' | 'ai_loyiha'), ishonch, manba hujjat sahifasi.
-- Qoidalar: NULL ≠ 0 (koef noma'lum — NULL); narx QQS SIZ; smeta qatorlari o'qilganda faqat versiya_holat = 'faol' (AGENTS.md §2c).
-- Migratsiyani FAQAT L0 qo'llaydi. Rollback: .rollback.sql. Qabul: .acceptance.sql (BEGIN..ROLLBACK, sintetik).
begin;

-- 0. Idempotentlik jurnali
create table if not exists public.t2_ish_kartasi_operation (
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  operation_id uuid not null,
  amal text not null,
  natija jsonb not null,
  yaratildi timestamptz not null default now(),
  primary key (kompaniya_id, operation_id)
);

-- 1. Ish kartasi
create table if not exists public.t2_ish_kartasi (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  nom text not null check (length(btrim(nom)) between 1 and 300),
  tur text not null default 'boshqa' check (tur in ('rigel', 'balka', 'kolonna', 'plita', 'devor', 'armatura', 'boshqa')),
  -- Amaliy birlik (usta narxi shu birlikda).
  birlik text not null check (birlik in ('м', 'м²', 'м³', 'шт', 'комплект', 'т', 'кг')),
  -- Tipli parametrlar: {b_mm, h_mm, qalinlik_mm, uzunlik_m, kg_m3} — sonlar; noma'lum kalit yozilmaydi.
  parametrlar jsonb not null default '{}'::jsonb check (jsonb_typeof(parametrlar) = 'object'),
  -- Kartaning o'z bosqich ulushi (NULL — kompaniyaning shu tur uchun ulushi, u ham yo'q bo'lsa tizim sukuti).
  bosqich_ulush jsonb check (bosqich_ulush is null or jsonb_typeof(bosqich_ulush) = 'object'),
  -- Usta narxi qamrovi (sukut): {bosqichlar:{opalubka,armatura,beton: bool}, material:{opalubka,armatura,beton: 'biz'|'usta'}, mexanizm:'biz'|'usta'}.
  qamrov jsonb not null default '{}'::jsonb check (jsonb_typeof(qamrov) = 'object'),
  -- Keyingi bosqich: naryad (usta bilan kelishilgan narx, QQS siz, 1 amaliy birlikka) va usta.
  naryad_narx numeric(16, 2) check (naryad_narx is null or naryad_narx >= 0),
  naryad_sana date,
  usta_nom text check (usta_nom is null or length(usta_nom) <= 200),
  usta_kontragent_id bigint references public.t2_kontragent(id) on delete set null,
  -- Kim to'ldirgan: qo'lda yoki AI (loyiha hujjatidan) — AI natijasi operator tasdig'isiz 'ai_loyiha' bo'lib qoladi.
  manba text not null default 'qolda' check (manba in ('qolda', 'ai_loyiha')),
  ishonch numeric(4, 3) check (ishonch is null or (ishonch >= 0 and ishonch <= 1)),
  manba_hujjat_id bigint references public.t2_document_registry(id) on delete set null,
  manba_sahifa integer check (manba_sahifa is null or manba_sahifa >= 1),
  izoh text check (izoh is null or length(izoh) <= 2000),
  holat text not null default 'faol' check (holat in ('faol', 'arxiv')),
  versiya integer not null default 1,
  yaratuvchi_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create index if not exists t2_ish_kartasi_kompaniya_idx on public.t2_ish_kartasi (kompaniya_id, holat, tur);
create unique index if not exists t2_ish_kartasi_nom_uq on public.t2_ish_kartasi (kompaniya_id, lower(btrim(nom))) where holat = 'faol';

-- 2. Karta ↔ smeta qatori (komponent) — ishora va koeffitsient bilan
create table if not exists public.t2_ish_kartasi_bog (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  karta_id bigint not null references public.t2_ish_kartasi(id) on delete cascade,
  -- Smeta qatori o'chirilsa bog' qoladi (qator_id NULL) — ekranda «qator topilmadi» deb ko'rinadi, jim tushib qolmaydi.
  qator_id bigint references public.t2_qator(id) on delete set null,
  obyekt_id bigint not null references public.t2_obyekt(id) on delete cascade,
  rol text not null default 'asosiy' check (rol in ('asosiy', 'armatura_mat', 'armatura_tayyorlash', 'istisno', 'zakladnoy', 'boshqa')),
  -- 1 amaliy birlikka shu qatorning smeta birligi (masalan 0,0015 «100М3» / m). ISHORALI: istisno qatori (hajm < 0) uchun manfiy.
  -- NULL — noma'lum (0 emas): qator hisobga kirmaydi va ekranda ogohlantiriladi.
  koef numeric(24, 12),
  koef_usul text not null default 'qolda' check (koef_usul in ('qolda', 'parametr', 'nisbat')),
  -- Mehnat qaysi bosqichga tegishli: NULL — asosiy norma (bosqich ulushlari bo'yicha bo'linadi).
  bosqich text check (bosqich is null or bosqich in ('opalubka', 'armatura', 'beton')),
  -- Material guruhi majburan (NULL — resurs nomidan aniqlanadi: бетон → beton, арматура/каркас/сетка → armatura, qolgani → opalubka).
  material_guruh text check (material_guruh is null or material_guruh in ('opalubka', 'armatura', 'beton')),
  -- Bog' paytidagi ko'rinish (qator o'chsa ham nima bog'langani ko'rinsin).
  kod text check (kod is null or length(kod) <= 100),
  nom text check (nom is null or length(nom) <= 500),
  birlik text check (birlik is null or length(birlik) <= 40),
  manba text not null default 'qolda' check (manba in ('qolda', 'avto', 'ai_loyiha')),
  ishonch numeric(4, 3) check (ishonch is null or (ishonch >= 0 and ishonch <= 1)),
  tartib integer not null default 0,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_ish_kartasi_bog_karta_idx on public.t2_ish_kartasi_bog (karta_id, tartib);
create index if not exists t2_ish_kartasi_bog_qator_idx on public.t2_ish_kartasi_bog (qator_id) where qator_id is not null;
create unique index if not exists t2_ish_kartasi_bog_uq on public.t2_ish_kartasi_bog (karta_id, qator_id) where qator_id is not null;

-- 3. Bosqich ulushlari (kompaniya × karta turi). ShNQ norma mehnatini operatsiyalarga bo'lmaydi — ulush egasi/PTO tomonidan beriladi
--    (keyin tizim/AI taklif qiladi: manba = 'tizim' | 'ai_loyiha'). Yig'indi 100.
create table if not exists public.t2_ish_kartasi_bosqich_ulush (
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  tur text not null check (tur in ('rigel', 'balka', 'kolonna', 'plita', 'devor', 'armatura', 'boshqa')),
  ulush jsonb not null check (jsonb_typeof(ulush) = 'object'),
  manba text not null default 'qolda' check (manba in ('qolda', 'tizim', 'ai_loyiha')),
  versiya integer not null default 1,
  yangilagan_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  yangilandi timestamptz not null default now(),
  primary key (kompaniya_id, tur)
);

do $rls$ declare t text; begin
  foreach t in array array['t2_ish_kartasi_operation', 't2_ish_kartasi', 't2_ish_kartasi_bog', 't2_ish_kartasi_bosqich_ulush'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $rls$;

-- ───────────────────────── Yordamchilar ─────────────────────────
-- Ulush: {opalubka, armatura, beton} — har biri 0..100 son, yig'indi 100 (±0,01). Yaroqsiz — NULL.
create or replace function public._t2_ish_kartasi_ulush(p jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare o numeric; a numeric; b numeric;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return null; end if;
  if coalesce(jsonb_typeof(p -> 'opalubka'), '') <> 'number' or coalesce(jsonb_typeof(p -> 'armatura'), '') <> 'number'
     or coalesce(jsonb_typeof(p -> 'beton'), '') <> 'number' then return null; end if;
  o := (p ->> 'opalubka')::numeric; a := (p ->> 'armatura')::numeric; b := (p ->> 'beton')::numeric;
  if least(o, a, b) < 0 or greatest(o, a, b) > 100 or abs(o + a + b - 100) > 0.01 then return null; end if;
  return jsonb_build_object('opalubka', o, 'armatura', a, 'beton', b);
end $$;

-- Parametrlar: faqat ma'lum kalitlar, faqat musbat son. Yaroqsiz — NULL.
create or replace function public._t2_ish_kartasi_param(p jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare k text; v jsonb; r jsonb := '{}'::jsonb;
begin
  if p is null then return '{}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' then return null; end if;
  for k, v in select * from jsonb_each(p) loop
    if k not in ('b_mm', 'h_mm', 'qalinlik_mm', 'uzunlik_m', 'kg_m3') then return null; end if;
    if jsonb_typeof(v) = 'null' then continue; end if;
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <= 0 or (v #>> '{}')::numeric > 1000000 then return null; end if;
    r := r || jsonb_build_object(k, (v #>> '{}')::numeric);
  end loop;
  return r;
end $$;

-- Qamrov: {bosqichlar:{opalubka,armatura,beton: bool}, material:{…: 'biz'|'usta'}, mexanizm:'biz'|'usta'}. Yaroqsiz — NULL.
create or replace function public._t2_ish_kartasi_qamrov(p jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare g text; b jsonb := '{}'::jsonb; m jsonb := '{}'::jsonb; x jsonb;
begin
  if p is null then return '{}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' then return null; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('bosqichlar', 'material', 'mexanizm')) then return null; end if;
  foreach g in array array['opalubka', 'armatura', 'beton'] loop
    x := p -> 'bosqichlar' -> g;
    if x is not null then
      if jsonb_typeof(x) <> 'boolean' then return null; end if;
      b := b || jsonb_build_object(g, x);
    end if;
    x := p -> 'material' -> g;
    if x is not null then
      if jsonb_typeof(x) <> 'string' or (x #>> '{}') not in ('biz', 'usta') then return null; end if;
      m := m || jsonb_build_object(g, x);
    end if;
  end loop;
  if p ? 'mexanizm' and (p ->> 'mexanizm') not in ('biz', 'usta') then return null; end if;
  return jsonb_strip_nulls(jsonb_build_object('bosqichlar', b, 'material', m, 'mexanizm', p -> 'mexanizm'));
end $$;

create or replace function public._t2_ish_kartasi_takror(p_kompaniya_id bigint, p_operation_id uuid, p_amal text) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select o.natija || jsonb_build_object('takror', true) from public.t2_ish_kartasi_operation o
   where o.kompaniya_id = p_kompaniya_id and o.operation_id = p_operation_id and o.amal = p_amal;
$$;

create or replace function public._t2_ish_kartasi_saqla_op(p_kompaniya_id bigint, p_operation_id uuid, p_amal text, p_natija jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
begin
  insert into public.t2_ish_kartasi_operation (kompaniya_id, operation_id, amal, natija) values (p_kompaniya_id, p_operation_id, p_amal, p_natija)
  on conflict (kompaniya_id, operation_id) do nothing;
  return p_natija;
end $$;

-- Smeta qatori (+ resurslari) JSON ko'rinishi. Faqat faol versiya (smeta asosi). versiya: faol
create or replace function public._t2_ish_kartasi_qator_json(p_id bigint) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', q.id, 'obyekt_id', q.obyekt_id, 'obyekt_nom', o.nom, 'ota_id', q.ota_id, 'tartib', q.tartib, 'tur', q.tur, 'kat', q.kat,
    'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik, 'hajm', q.hajm, 'summa', q.summa,
    'qoshimcha', coalesce(q.qoshimcha, false), 'zamena', coalesce(q.zamena, false),
    'bolalar', (select coalesce(jsonb_agg(jsonb_build_object('tur', c.tur, 'kat', c.kat, 'kod', c.kod, 'nom', c.nom, 'birlik', c.birlik,
                  'norma', c.norma, 'hajm', c.hajm, 'narx', c.narx, 'summa', c.summa) order by c.tartib, c.id), '[]'::jsonb)
                 from public.t2_qator c where c.ota_id = q.id and c.versiya_holat = 'faol' and c.tur in ('rs', 'mat', 'ob')))
  from public.t2_qator q join public.t2_obyekt o on o.id = q.obyekt_id
  where q.id = p_id and q.versiya_holat = 'faol';
$$;

-- ───────────────────────── O'qish ─────────────────────────
-- p_bolim: 'kartalar' (kartalar + bog'lar + ulushlar), 'qatorlar' ({ids:[…≤200], qoshni:bool} — bog'langan qatorlar;
-- qoshni=true va bitta id bo'lsa — shu bo'limdagi keyingi qo'shni qatorlar ham, avto-yig'ish uchun), 'qidir' ({q} — kompaniya
-- obyektlari bo'ylab faol ish (bl) qatorlari). Smeta qatorlari faqat versiya_holat = 'faol'.
create or replace function public.t2_ish_kartasi_ol_v1(p_kompaniya_id bigint, p_actor_id bigint, p_bolim text, p_filtr jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_ids bigint[]; v_t text[]; v_res jsonb; v_m record;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.read');
  p_filtr := coalesce(p_filtr, '{}'::jsonb);
  if p_bolim = 'kartalar' then
    return jsonb_build_object('ok', true, 'bolim', 'kartalar',
      'kartalar', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', k.id, 'nom', k.nom, 'tur', k.tur, 'birlik', k.birlik, 'parametrlar', k.parametrlar, 'bosqich_ulush', k.bosqich_ulush,
          'qamrov', k.qamrov, 'naryad_narx', k.naryad_narx, 'naryad_sana', k.naryad_sana, 'usta_nom', k.usta_nom,
          'usta_kontragent_id', k.usta_kontragent_id, 'manba', k.manba, 'ishonch', k.ishonch, 'manba_hujjat_id', k.manba_hujjat_id,
          'manba_sahifa', k.manba_sahifa, 'izoh', k.izoh, 'holat', k.holat, 'versiya', k.versiya, 'yangilandi', k.yangilandi,
          'bog', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'qator_id', b.qator_id, 'obyekt_id', b.obyekt_id, 'rol', b.rol,
                     'koef', b.koef, 'koef_usul', b.koef_usul, 'bosqich', b.bosqich, 'material_guruh', b.material_guruh, 'kod', b.kod,
                     'nom', b.nom, 'birlik', b.birlik, 'manba', b.manba, 'ishonch', b.ishonch, 'tartib', b.tartib) order by b.tartib, b.id), '[]'::jsonb)
                   from public.t2_ish_kartasi_bog b where b.karta_id = k.id)
        ) order by k.tur, k.nom), '[]'::jsonb)
        from public.t2_ish_kartasi k
       where k.kompaniya_id = p_kompaniya_id and k.holat = coalesce(nullif(p_filtr ->> 'holat', ''), 'faol')),
      'ulushlar', (select coalesce(jsonb_agg(jsonb_build_object('tur', u.tur, 'ulush', u.ulush, 'manba', u.manba, 'versiya', u.versiya) order by u.tur), '[]'::jsonb)
                     from public.t2_ish_kartasi_bosqich_ulush u where u.kompaniya_id = p_kompaniya_id));
  elsif p_bolim = 'qatorlar' then
    if coalesce(jsonb_typeof(p_filtr -> 'ids'), '') <> 'array' or jsonb_array_length(p_filtr -> 'ids') > 200 then
      return jsonb_build_object('ok', false, 'code', 'IDS_KERAK');
    end if;
    select array_agg(distinct (x #>> '{}')::bigint) into v_ids from jsonb_array_elements(p_filtr -> 'ids') x where jsonb_typeof(x) = 'number';
    v_res := (select coalesce(jsonb_agg(public._t2_ish_kartasi_qator_json(q.id) order by q.obyekt_id, q.tartib), '[]'::jsonb)
                from public.t2_qator q
               where q.id = any(coalesce(v_ids, '{}')) and q.kompaniya_id = p_kompaniya_id and q.versiya_holat = 'faol');
    if coalesce((p_filtr ->> 'qoshni')::boolean, false) and cardinality(coalesce(v_ids, '{}')) = 1 then
      select q.id, q.obyekt_id, q.ota_id, q.tartib into v_m from public.t2_qator q
       where q.id = v_ids[1] and q.kompaniya_id = p_kompaniya_id and q.versiya_holat = 'faol';
      if found then
        return jsonb_build_object('ok', true, 'bolim', 'qatorlar', 'qatorlar', v_res,
          'qoshnilar', (select coalesce(jsonb_agg(public._t2_ish_kartasi_qator_json(s.id) order by s.tartib, s.id), '[]'::jsonb)
                          from (select q.id, q.tartib from public.t2_qator q
                                 where q.obyekt_id = v_m.obyekt_id and q.ota_id is not distinct from v_m.ota_id and q.versiya_holat = 'faol'
                                   and q.id <> v_m.id and q.tur in ('bl', 'mat', 'ob') and q.tartib > v_m.tartib
                                 order by q.tartib, q.id limit 30) s));
      end if;
    end if;
    return jsonb_build_object('ok', true, 'bolim', 'qatorlar', 'qatorlar', v_res, 'qoshnilar', '[]'::jsonb);
  elsif p_bolim = 'qidir' then
    v_t := public.t2_qidiruv_sozlar(left(coalesce(p_filtr ->> 'q', ''), 100));
    if cardinality(v_t) = 0 then return jsonb_build_object('ok', true, 'bolim', 'qidir', 'qatorlar', '[]'::jsonb); end if;
    return jsonb_build_object('ok', true, 'bolim', 'qidir', 'qatorlar',
      (select coalesce(jsonb_agg(public._t2_ish_kartasi_qator_json(s.id) order by s.obyekt_id desc, s.tartib), '[]'::jsonb)
         from (select q.id, q.obyekt_id, q.tartib from public.t2_qator q
                where q.kompaniya_id = p_kompaniya_id and q.versiya_holat = 'faol' and q.tur = 'bl' and q.nom is not null
                  and not exists (select 1 from unnest(v_t) s where position(s in upper(replace(coalesce(q.kod, '') || ' ' || q.nom, 'Ё', 'Е'))) = 0)
                order by q.obyekt_id desc, q.tartib limit 40) s));
  end if;
  return jsonb_build_object('ok', false, 'code', 'BOLIM_NOMALUM');
end $$;

-- ───────────────────────── Yozish ─────────────────────────
-- Karta + uning BUTUN bog' to'plami (almashtiriladi). CAS: p_kutilgan_versiya (yangi karta — NULL). Har bog' qatori shu kompaniyaning
-- FAOL smeta qatori bo'lishi shart (versiya: faol); obyekt_id qatordan olinadi (so'rovdan emas).
create or replace function public.t2_ish_kartasi_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid,
  p_karta_id bigint, p_kutilgan_versiya integer, p_karta jsonb, p_bog jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; k public.t2_ish_kartasi; v_nom text; v_tur text; v_birlik text; v_param jsonb; v_ulush jsonb; v_qamrov jsonb;
  v_b jsonb; v_q record; v_i integer := 0; v_koef numeric; v_naryad numeric; v_ishonch numeric; v_kontr bigint; v_hujjat bigint; v_sahifa integer;
  v_r jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_REQUIRED'); end if;
  v_t := public._t2_ish_kartasi_takror(p_kompaniya_id, p_operation_id, 'saqla'); if v_t is not null then return v_t; end if;
  if p_karta is null or jsonb_typeof(p_karta) <> 'object' then return jsonb_build_object('ok', false, 'code', 'KARTA_KERAK'); end if;
  if p_bog is null or jsonb_typeof(p_bog) <> 'array' or jsonb_array_length(p_bog) > 60 then return jsonb_build_object('ok', false, 'code', 'BOG_NOTOGRI'); end if;

  v_nom := nullif(btrim(p_karta ->> 'nom'), '');
  v_tur := coalesce(nullif(p_karta ->> 'tur', ''), 'boshqa');
  v_birlik := p_karta ->> 'birlik';
  if v_nom is null or length(v_nom) > 300 then return jsonb_build_object('ok', false, 'code', 'NOM_KERAK'); end if;
  if v_tur not in ('rigel', 'balka', 'kolonna', 'plita', 'devor', 'armatura', 'boshqa') then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  if v_birlik is null or v_birlik not in ('м', 'м²', 'м³', 'шт', 'комплект', 'т', 'кг') then return jsonb_build_object('ok', false, 'code', 'BIRLIK_NOTOGRI'); end if;
  v_param := public._t2_ish_kartasi_param(p_karta -> 'parametrlar');
  if v_param is null then return jsonb_build_object('ok', false, 'code', 'PARAMETR_NOTOGRI'); end if;
  if p_karta -> 'bosqich_ulush' is not null and jsonb_typeof(p_karta -> 'bosqich_ulush') <> 'null' then
    v_ulush := public._t2_ish_kartasi_ulush(p_karta -> 'bosqich_ulush');
    if v_ulush is null then return jsonb_build_object('ok', false, 'code', 'ULUSH_NOTOGRI'); end if;
  end if;
  v_qamrov := public._t2_ish_kartasi_qamrov(p_karta -> 'qamrov');
  if v_qamrov is null then return jsonb_build_object('ok', false, 'code', 'QAMROV_NOTOGRI'); end if;
  if jsonb_typeof(p_karta -> 'naryad_narx') = 'number' then
    v_naryad := (p_karta ->> 'naryad_narx')::numeric;
    if v_naryad < 0 then return jsonb_build_object('ok', false, 'code', 'NARYAD_NOTOGRI'); end if;
  elsif p_karta -> 'naryad_narx' is not null and jsonb_typeof(p_karta -> 'naryad_narx') <> 'null' then
    return jsonb_build_object('ok', false, 'code', 'NARYAD_NOTOGRI');
  end if;
  if jsonb_typeof(p_karta -> 'ishonch') = 'number' then v_ishonch := (p_karta ->> 'ishonch')::numeric;
    if v_ishonch < 0 or v_ishonch > 1 then return jsonb_build_object('ok', false, 'code', 'ISHONCH_NOTOGRI'); end if;
  end if;
  if coalesce(p_karta ->> 'manba', 'qolda') not in ('qolda', 'ai_loyiha') then return jsonb_build_object('ok', false, 'code', 'MANBA_NOTOGRI'); end if;
  if jsonb_typeof(p_karta -> 'usta_kontragent_id') = 'number' then
    select id into v_kontr from public.t2_kontragent where id = (p_karta ->> 'usta_kontragent_id')::bigint and kompaniya_id = p_kompaniya_id;
    if v_kontr is null then return jsonb_build_object('ok', false, 'code', 'KONTRAGENT_SCOPE'); end if;
  end if;
  if jsonb_typeof(p_karta -> 'manba_hujjat_id') = 'number' then
    select id into v_hujjat from public.t2_document_registry where id = (p_karta ->> 'manba_hujjat_id')::bigint and kompaniya_id = p_kompaniya_id;
    if v_hujjat is null then return jsonb_build_object('ok', false, 'code', 'HUJJAT_SCOPE'); end if;
  end if;
  if jsonb_typeof(p_karta -> 'manba_sahifa') = 'number' then v_sahifa := (p_karta ->> 'manba_sahifa')::integer;
    if v_sahifa < 1 then return jsonb_build_object('ok', false, 'code', 'SAHIFA_NOTOGRI'); end if;
  end if;

  if exists (select 1 from public.t2_ish_kartasi x where x.kompaniya_id = p_kompaniya_id and x.holat = 'faol'
              and lower(btrim(x.nom)) = lower(v_nom) and x.id is distinct from p_karta_id) then
    return jsonb_build_object('ok', false, 'code', 'NOM_BAND');
  end if;

  if p_karta_id is null then
    insert into public.t2_ish_kartasi (kompaniya_id, nom, tur, birlik, parametrlar, bosqich_ulush, qamrov, naryad_narx, naryad_sana, usta_nom,
      usta_kontragent_id, manba, ishonch, manba_hujjat_id, manba_sahifa, izoh, yaratuvchi_id)
    values (p_kompaniya_id, v_nom, v_tur, v_birlik, v_param, v_ulush, v_qamrov, v_naryad, nullif(p_karta ->> 'naryad_sana', '')::date,
      left(nullif(btrim(p_karta ->> 'usta_nom'), ''), 200), v_kontr, coalesce(p_karta ->> 'manba', 'qolda'), v_ishonch, v_hujjat, v_sahifa,
      left(nullif(btrim(p_karta ->> 'izoh'), ''), 2000), p_actor_id)
    returning * into k;
  else
    select * into k from public.t2_ish_kartasi where id = p_karta_id and kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
    if p_kutilgan_versiya is distinct from k.versiya then
      return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'sizning_versiya', p_kutilgan_versiya, 'bazadagi_versiya', k.versiya);
    end if;
    if k.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'ARXIVDA'); end if;
    update public.t2_ish_kartasi set nom = v_nom, tur = v_tur, birlik = v_birlik, parametrlar = v_param, bosqich_ulush = v_ulush, qamrov = v_qamrov,
      naryad_narx = v_naryad, naryad_sana = nullif(p_karta ->> 'naryad_sana', '')::date, usta_nom = left(nullif(btrim(p_karta ->> 'usta_nom'), ''), 200),
      usta_kontragent_id = v_kontr, manba = coalesce(p_karta ->> 'manba', 'qolda'), ishonch = v_ishonch, manba_hujjat_id = v_hujjat,
      manba_sahifa = v_sahifa, izoh = left(nullif(btrim(p_karta ->> 'izoh'), ''), 2000), versiya = versiya + 1, yangilandi = now()
     where id = k.id returning * into k;
    delete from public.t2_ish_kartasi_bog where karta_id = k.id;
  end if;

  for v_b in select * from jsonb_array_elements(p_bog) loop
    v_i := v_i + 1;
    if jsonb_typeof(v_b) <> 'object' or coalesce(jsonb_typeof(v_b -> 'qator_id'), '') <> 'number' then raise exception 'ISH_KARTASI_BOG_QATOR_KERAK' using errcode = '22023'; end if;
    -- versiya: faol — faqat joriy smeta qatoriga bog'lanadi.
    select q.id, q.obyekt_id, q.kod, q.nom, q.birlik into v_q from public.t2_qator q
     where q.id = (v_b ->> 'qator_id')::bigint and q.kompaniya_id = p_kompaniya_id and q.versiya_holat = 'faol';
    if not found then raise exception 'ISH_KARTASI_QATOR_SCOPE: %', v_b ->> 'qator_id' using errcode = '42501'; end if;
    if v_b -> 'koef' is null or jsonb_typeof(v_b -> 'koef') = 'null' then v_koef := null;
    elsif jsonb_typeof(v_b -> 'koef') = 'number' then v_koef := (v_b ->> 'koef')::numeric;
    else raise exception 'ISH_KARTASI_KOEF_NOTOGRI' using errcode = '22023'; end if;
    insert into public.t2_ish_kartasi_bog (kompaniya_id, karta_id, qator_id, obyekt_id, rol, koef, koef_usul, bosqich, material_guruh, kod, nom, birlik, manba, ishonch, tartib)
    values (p_kompaniya_id, k.id, v_q.id, v_q.obyekt_id, coalesce(nullif(v_b ->> 'rol', ''), 'asosiy'), v_koef, coalesce(nullif(v_b ->> 'koef_usul', ''), 'qolda'),
      nullif(v_b ->> 'bosqich', ''), nullif(v_b ->> 'material_guruh', ''), left(v_q.kod, 100), left(v_q.nom, 500), left(v_q.birlik, 40),
      coalesce(nullif(v_b ->> 'manba', ''), 'qolda'),
      case when jsonb_typeof(v_b -> 'ishonch') = 'number' then least(greatest((v_b ->> 'ishonch')::numeric, 0), 1) end, v_i);
  end loop;

  v_r := jsonb_build_object('ok', true, 'id', k.id, 'versiya', k.versiya, 'bog_soni', v_i);
  return public._t2_ish_kartasi_saqla_op(p_kompaniya_id, p_operation_id, 'saqla', v_r);
end $$;

-- Kartani arxivlash (o'chirilmaydi). CAS.
create or replace function public.t2_ish_kartasi_arxiv_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_karta_id bigint, p_kutilgan_versiya integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; k public.t2_ish_kartasi; v_r jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_REQUIRED'); end if;
  v_t := public._t2_ish_kartasi_takror(p_kompaniya_id, p_operation_id, 'arxiv'); if v_t is not null then return v_t; end if;
  select * into k from public.t2_ish_kartasi where id = p_karta_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_kutilgan_versiya is distinct from k.versiya then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'sizning_versiya', p_kutilgan_versiya, 'bazadagi_versiya', k.versiya);
  end if;
  update public.t2_ish_kartasi set holat = 'arxiv', versiya = versiya + 1, yangilandi = now() where id = k.id returning * into k;
  v_r := jsonb_build_object('ok', true, 'id', k.id, 'versiya', k.versiya, 'holat', k.holat);
  return public._t2_ish_kartasi_saqla_op(p_kompaniya_id, p_operation_id, 'arxiv', v_r);
end $$;

-- Bosqich ulushi (kompaniya × tur). CAS: yangi — p_kutilgan_versiya NULL.
create or replace function public.t2_ish_kartasi_ulush_saqla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_tur text, p_ulush jsonb, p_kutilgan_versiya integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; v_u jsonb; u public.t2_ish_kartasi_bosqich_ulush; v_r jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_REQUIRED'); end if;
  v_t := public._t2_ish_kartasi_takror(p_kompaniya_id, p_operation_id, 'ulush'); if v_t is not null then return v_t; end if;
  if p_tur is null or p_tur not in ('rigel', 'balka', 'kolonna', 'plita', 'devor', 'armatura', 'boshqa') then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  v_u := public._t2_ish_kartasi_ulush(p_ulush);
  if v_u is null then return jsonb_build_object('ok', false, 'code', 'ULUSH_NOTOGRI'); end if;
  select * into u from public.t2_ish_kartasi_bosqich_ulush where kompaniya_id = p_kompaniya_id and tur = p_tur for update;
  if found then
    if p_kutilgan_versiya is distinct from u.versiya then
      return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'sizning_versiya', p_kutilgan_versiya, 'bazadagi_versiya', u.versiya);
    end if;
    update public.t2_ish_kartasi_bosqich_ulush set ulush = v_u, manba = 'qolda', versiya = versiya + 1, yangilagan_id = p_actor_id, yangilandi = now()
     where kompaniya_id = p_kompaniya_id and tur = p_tur returning * into u;
  else
    if p_kutilgan_versiya is not null then return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'sizning_versiya', p_kutilgan_versiya, 'bazadagi_versiya', null); end if;
    insert into public.t2_ish_kartasi_bosqich_ulush (kompaniya_id, tur, ulush, yangilagan_id) values (p_kompaniya_id, p_tur, v_u, p_actor_id) returning * into u;
  end if;
  v_r := jsonb_build_object('ok', true, 'tur', u.tur, 'ulush', u.ulush, 'versiya', u.versiya);
  return public._t2_ish_kartasi_saqla_op(p_kompaniya_id, p_operation_id, 'ulush', v_r);
end $$;

do $grant$ declare f text; begin
  foreach f in array array[
    'public._t2_ish_kartasi_ulush(jsonb)', 'public._t2_ish_kartasi_param(jsonb)', 'public._t2_ish_kartasi_qamrov(jsonb)',
    'public._t2_ish_kartasi_takror(bigint,uuid,text)', 'public._t2_ish_kartasi_saqla_op(bigint,uuid,text,jsonb)', 'public._t2_ish_kartasi_qator_json(bigint)',
    'public.t2_ish_kartasi_ol_v1(bigint,bigint,text,jsonb)',
    'public.t2_ish_kartasi_saqla_v1(bigint,bigint,uuid,bigint,integer,jsonb,jsonb)',
    'public.t2_ish_kartasi_arxiv_v1(bigint,bigint,uuid,bigint,integer)',
    'public.t2_ish_kartasi_ulush_saqla_v1(bigint,bigint,uuid,text,jsonb,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $grant$;

commit;
