-- 20261212400000 — SAQLASH DIETASI: t2_qator_muhr yuklama-mazmuni R2 ga (egasi qoidasi: o'zgarmas ma'lumotnoma R2 da, bazada kalit + xesh).
-- Dizayn: docs/architecture/ADR_MUHR_R2.md. Naqsh: 20261128000000_snapshot_r2_sovuq_v1 (R2 ga yoz -> QAYTA O'QI -> sha256 -> faqat shundan keyin NULL).
--
-- NIMA O'ZGARADI:
--   * Muhr qatorining ISSIQ qismi bazada QOLADI: id/kompaniya/obyekt/qator/bosqich/revision/manba/bayroqlar/muhr (SHA-256)/vaqtlar.
--   * SOVUQ qism (tur, kod, nom, birlik, kat, ota_id, hajm, narx, norma = muhr xeshi qamrab olgan 9 maydon) obyekt bo'yicha
--     gzip JSON ga (butun satr nusxasi, kelajakdagi 2-bosqich uchun) R2 ga ko'chadi, bazada NULL bo'ladi.
--   * Sovuq qatorda arzon "xom barmoq izi" (xom_xesh, uuid) qoladi: view o'zgarishni sovuq qatorda ham tez topadi (sha256 hisobsiz).
--   * Ko'rsatkich jadvali t2_qator_muhr_sovuq (kalit, sha256, tasdiq, id ro'yxati). NULL faqat tasdiqlangan ko'rsatkich bo'lsa mumkin.
--   * Const trigger: o'zgarmasligi SAQLANADI. Yangi ruxsat etilgan ikki o'tish: sovutish (tasdiqlangan R2 ko'rsatkichi bilan) va
--     isitish (qaytarilgan qiymat xeshi muhr xeshiga TENG bo'lgandagina) — ya'ni qiymat hech qachon o'zgarib qola olmaydi.
--   * View t2_qator_muhr_farq qayta yoziladi (issiq qator — avvalgidek; sovuq qator — xom barmoq izi + xesh bilan).
-- NOL YO'QOTISH: muhr, t2_qator, import o'ramlari (ol_v1) o'zgarmaydi. Sovutish bu faylda YO'Q — kunlik cron (mcp/smeta-mcp-remote).
-- TARTIB: shu migratsiya (prod) -> MCP Worker deploy -> frontend deploy -> VACUUM FULL (ADR §6). Runner begin/commit qo'shadi.

-- ───────── 1. Ko'rsatkich jadvali ─────────
create table if not exists public.t2_qator_muhr_sovuq (
  id               bigint generated always as identity primary key,
  kompaniya_id     bigint not null,
  obyekt_id        bigint not null,
  idlar            bigint[] not null,            -- t2_qator_muhr.id ro'yxati (R2 blokidagi qatorlar)
  qator_soni       integer not null check (qator_soni > 0 and qator_soni = cardinality(idlar)),
  r2_key           text not null check (r2_key ~ '^muhr-cold/v1/[0-9a-f]{2}/[0-9a-f]{64}\.json\.gz$'),
  r2_sha256        text not null check (r2_sha256 ~ '^[0-9a-f]{64}$' and r2_key like '%/' || r2_sha256 || '.json.gz'),
  r2_bayt          bigint not null check (r2_bayt > 0),
  r2_tasdiqlangan  timestamptz,                  -- skript R2 dan QAYTA o'qib sha256 ni solishtirgach
  sovutildi        timestamptz,
  bayt_bosh        bigint,                       -- bazada bo'shagan yuklama baytlari (hisobot)
  yaratildi        timestamptz not null default now(),
  unique (obyekt_id, r2_sha256)
);
comment on table public.t2_qator_muhr_sovuq is
  'SAQLASH DIETASI: t2_qator_muhr sovuq yuklamasining R2 ko''rsatkichi (kalit + sha256 + tasdiq). O''chirilmaydi; NULL qatorlar faqat tasdiqlangan ko''rsatkichga bog''lanadi.';
alter table public.t2_qator_muhr_sovuq enable row level security;
revoke all on public.t2_qator_muhr_sovuq from public, anon, authenticated;
grant select on public.t2_qator_muhr_sovuq to service_role;

create or replace function public.t2_qator_muhr_sovuq_const_trg()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'T2_QATOR_MUHR_SOVUQ_CONST: ko''rsatkich o''chirilmaydi (id=%)', old.id using errcode = 'check_violation'; end if;
  if (to_jsonb(new) - 'r2_tasdiqlangan' - 'sovutildi' - 'bayt_bosh') is distinct from (to_jsonb(old) - 'r2_tasdiqlangan' - 'sovutildi' - 'bayt_bosh') then
    raise exception 'T2_QATOR_MUHR_SOVUQ_CONST: ko''rsatkich o''zgarmaydi (id=%)', old.id using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists t2_qator_muhr_sovuq_const on public.t2_qator_muhr_sovuq;
create trigger t2_qator_muhr_sovuq_const before update or delete on public.t2_qator_muhr_sovuq
  for each row execute function public.t2_qator_muhr_sovuq_const_trg();

-- ───────── 2. Muhr jadvaliga ustunlar (NULL — qo'shish qayta yozmaydi) ─────────
alter table public.t2_qator_muhr
  add column if not exists sovuq_id bigint references public.t2_qator_muhr_sovuq (id) on delete restrict,
  add column if not exists xom_xesh uuid;
alter table public.t2_qator_muhr drop constraint if exists t2_qator_muhr_sovuq_shakl;
alter table public.t2_qator_muhr add constraint t2_qator_muhr_sovuq_shakl check (
  sovuq_id is null
  or (xom_xesh is not null and tur is null and kod is null and nom is null and birlik is null and kat is null
      and ota_id is null and hajm is null and narx is null and norma is null));

-- ───────── 3. Yordamchi funksiyalar ─────────
-- Xom barmoq izi: normallashtirishsiz (regex yo'q => ~1-3 mks), faqat son shakli (trim_scale). Xom qiymat saqlangan qiymatga teng
-- bo'lsa — qator o'zgarmagan (issiq qatorlardagi xom solishtirish bilan bir xil ma'no). Farq bo'lsa — haqiqiy farq muhr xeshi bilan hal qilinadi.
create or replace function public.t2_qator_muhr_xom_v1(
  p_tur text, p_kod text, p_nom text, p_birlik text, p_kat text, p_ota_id bigint, p_hajm numeric, p_narx numeric, p_norma numeric)
returns uuid language sql immutable parallel safe set search_path = pg_catalog, pg_temp as $$
  select md5(concat_ws(chr(31), 'x1',
    coalesce('=' || p_tur, chr(8709)), coalesce('=' || p_kod, chr(8709)), coalesce('=' || p_nom, chr(8709)),
    coalesce('=' || p_birlik, chr(8709)), coalesce('=' || p_kat, chr(8709)), coalesce('=' || p_ota_id::text, chr(8709)),
    coalesce('=' || trim_scale(p_hajm)::text, chr(8709)), coalesce('=' || trim_scale(p_narx)::text, chr(8709)),
    coalesce('=' || trim_scale(p_norma)::text, chr(8709))))::uuid
$$;

-- R2 bloki matni: BARCHA o'zgarmas ustunlar (yopildi/yopilish_sabab — holat, bazada qoladi). Deterministik: jsonb kalit tartibi,
-- UTC vaqt, son — matn (aniqlik yo'qolmaydi). Faqat HOZIR ISSIQ qatorlar (sovuq_id is null).
create or replace function public.t2_qator_muhr_sovuq_matn_v1(p_idlar bigint[])
returns text language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'kompaniya_id', m.kompaniya_id, 'obyekt_id', m.obyekt_id, 'qator_id', m.qator_id, 'bosqich', m.bosqich,
      'revision_id', m.revision_id, 'manba', m.manba, 'aslda_yoq', m.aslda_yoq, 'ekspertizagacha', m.ekspertizagacha,
      'tekshirilmagan', to_jsonb(m.tekshirilmagan),
      'tur', m.tur, 'kod', m.kod, 'nom', m.nom, 'birlik', m.birlik, 'kat', m.kat, 'ota_id', m.ota_id,
      'hajm', m.hajm::text, 'narx', m.narx::text, 'norma', m.norma::text, 'muhr', m.muhr,
      'asos_vaqt', to_char(m.asos_vaqt at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'actor_id', m.actor_id,
      'yaratildi', to_char(m.yaratildi at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by m.id), '[]'::jsonb)::text
    from public.t2_qator_muhr m where m.id = any (p_idlar) and m.sovuq_id is null
$$;

-- ───────── 4. Const trigger (o'zgarmaslik saqlanadi; ikki yangi o'tish) ─────────
create or replace function public.t2_qator_muhr_const_trg()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_tayyor text[] := array['yopildi', 'yopilish_sabab', 'tur', 'kod', 'nom', 'birlik', 'kat', 'ota_id', 'hajm', 'narx', 'norma', 'sovuq_id', 'xom_xesh'];
  v_k text;
begin
  if tg_op = 'DELETE' then
    raise exception 'T2_QATOR_MUHR_CONST: muhr o''chirilmaydi (qator_id=%)', old.qator_id using errcode = 'check_violation';
  end if;
  -- (1) o'zgarmas ustunlar (id, qator, bosqich, manba, muhr, vaqtlar...) hech qachon o'zgarmaydi
  if (to_jsonb(new) - v_tayyor) is distinct from (to_jsonb(old) - v_tayyor) then
    raise exception 'T2_QATOR_MUHR_CONST: muhr o''zgarmaydi (qator_id=%)', old.qator_id using errcode = 'check_violation';
  end if;
  -- (2) yopish: faqat ochiq muhrni bir marta
  if (new.yopildi, new.yopilish_sabab) is distinct from (old.yopildi, old.yopilish_sabab) and old.yopildi is not null then
    raise exception 'T2_QATOR_MUHR_CONST: muhr o''zgarmaydi (qator_id=%)', old.qator_id using errcode = 'check_violation';
  end if;
  -- (3) yuklama holati: o'zgarmasa — hech narsa tekshirilmaydi
  if (new.tur, new.kod, new.nom, new.birlik, new.kat, new.ota_id, new.hajm, new.narx, new.norma, new.sovuq_id, new.xom_xesh)
     is not distinct from (old.tur, old.kod, old.nom, old.birlik, old.kat, old.ota_id, old.hajm, old.narx, old.norma, old.sovuq_id, old.xom_xesh) then
    return new;
  end if;
  if old.sovuq_id is null and new.sovuq_id is not null then
    -- SOVUTISH: eski qiymat xeshi muhrga teng; yangi qatorda yuklama yo'q; tasdiqlangan R2 ko'rsatkichi shu qatorni qamraydi
    if (public.t2_qator_muhr_hisob(old.tur, old.kod, old.nom, old.birlik, old.kat, old.ota_id, old.hajm, old.narx, old.norma))[1] is distinct from old.muhr
       or new.xom_xesh is distinct from public.t2_qator_muhr_xom_v1(old.tur, old.kod, old.nom, old.birlik, old.kat, old.ota_id, old.hajm, old.narx, old.norma)
       or not exists (select 1 from public.t2_qator_muhr_sovuq e
                       where e.id = new.sovuq_id and e.r2_tasdiqlangan is not null and e.obyekt_id = old.obyekt_id and old.id = any (e.idlar)) then
      raise exception 'T2_QATOR_MUHR_CONST: sovutish rad etildi — R2 ko''rsatkichi tasdiqlanmagan yoki qiymat muhrga mos emas (qator_id=%)', old.qator_id using errcode = 'check_violation';
    end if;
  elsif old.sovuq_id is not null and new.sovuq_id is null then
    -- ISITISH: qaytarilgan qiymat xeshi muhr xeshiga TENG bo'lishi shart — qiymat o'zgarib qola olmaydi
    if new.xom_xesh is not null
       or (public.t2_qator_muhr_hisob(new.tur, new.kod, new.nom, new.birlik, new.kat, new.ota_id, new.hajm, new.narx, new.norma))[1] is distinct from new.muhr then
      raise exception 'T2_QATOR_MUHR_CONST: isitish rad etildi — qaytarilgan qiymat muhr xeshiga mos emas (qator_id=%)', old.qator_id using errcode = 'check_violation';
    end if;
  else
    raise exception 'T2_QATOR_MUHR_CONST: muhr o''zgarmaydi (qator_id=%)', old.qator_id using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ───────── 5. Sovutish RPC lari (faqat service_role; snapshot.sovuq_* naqshi) ─────────
-- Nomzod qatorlar: issiq, p_kun kundan eski, va (yopiq YOKI qator bazada va xom qiymati muhrdan farq qilmaydi).
-- O'zgargan / o'chirilgan ochiq muhrlar ISSIQ qoladi (view ularning avval/endi sini bazadan beradi).
create or replace function public.t2_qator_muhr_sovuq_nomzod_v1(p_kun integer default 2, p_limit integer default 50)
returns table (obyekt_id bigint, qator_soni bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_kun is null or p_kun < 0 then raise exception 't2_qator_muhr_sovuq_nomzod_v1: p_kun >= 0 bo''lishi kerak' using errcode = '22023'; end if;
  return query
    select m.obyekt_id, count(*)::bigint
      from public.t2_qator_muhr m left join public.t2_qator q on q.id = m.qator_id
     where m.sovuq_id is null and m.yaratildi <= now() - make_interval(days => p_kun)
       and (m.yopildi is not null
            or (q.id is not null and public.t2_qator_muhr_xom_v1(q.tur, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.hajm, q.narx, q.norma)
                                    = public.t2_qator_muhr_xom_v1(m.tur, m.kod, m.nom, m.birlik, m.kat, m.ota_id, m.hajm, m.narx, m.norma)))
     group by m.obyekt_id order by count(*) desc, m.obyekt_id
     limit greatest(1, least(coalesce(p_limit, 50), 1000));
end $$;

-- Bir obyektning bitta bloki: id ro'yxati + R2 matni (sha256 va R2 obyekti aynan shu baytlardan).
create or replace function public.t2_qator_muhr_sovuq_oqi_v1(p_obyekt_id bigint, p_kun integer default 2, p_limit integer default 3000)
returns table (idlar bigint[], qator_soni integer, bayt bigint, matn text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_idlar bigint[];
begin
  select array_agg(z.id order by z.id) into v_idlar from (
    select m.id from public.t2_qator_muhr m left join public.t2_qator q on q.id = m.qator_id
     where m.obyekt_id = p_obyekt_id and m.sovuq_id is null and m.yaratildi <= now() - make_interval(days => greatest(coalesce(p_kun, 2), 0))
       and (m.yopildi is not null
            or (q.id is not null and public.t2_qator_muhr_xom_v1(q.tur, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.hajm, q.narx, q.norma)
                                    = public.t2_qator_muhr_xom_v1(m.tur, m.kod, m.nom, m.birlik, m.kat, m.ota_id, m.hajm, m.narx, m.norma)))
     order by m.id limit greatest(1, least(coalesce(p_limit, 3000), 5000))) z;
  if v_idlar is null then return; end if;
  return query select v_idlar, cardinality(v_idlar), octet_length(t.s)::bigint, t.s from (select public.t2_qator_muhr_sovuq_matn_v1(v_idlar) as s) t;
end $$;

-- 5a. Ko'rsatkichni yozadi (yuklama joyida). DB matnni o'zi qayta quradi va sha256 ni tekshiradi. Idempotent (obyekt, sha256).
create or replace function public.t2_qator_muhr_sovuq_yoz_v1(p_obyekt_id bigint, p_idlar bigint[], p_sha256 text, p_r2_key text, p_r2_bayt bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_komp bigint; v_n integer;
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'sovuq_yoz: sha256 noto''g''ri' using errcode = '22023'; end if;
  if p_r2_key is null or p_r2_key !~ '^muhr-cold/v1/[0-9a-f]{2}/[0-9a-f]{64}\.json\.gz$' or p_r2_key not like '%/' || p_sha256 || '.json.gz' then
    raise exception 'sovuq_yoz: r2_key shakli noto''g''ri yoki sha256 ga mos emas' using errcode = '22023';
  end if;
  select id into v_id from public.t2_qator_muhr_sovuq where obyekt_id = p_obyekt_id and r2_sha256 = p_sha256;
  if v_id is not null then return v_id; end if;
  select count(*), min(m.kompaniya_id) into v_n, v_komp from public.t2_qator_muhr m
   where m.id = any (p_idlar) and m.obyekt_id = p_obyekt_id and m.sovuq_id is null;
  if p_idlar is null or v_n <> cardinality(p_idlar) or v_n = 0 or (select count(distinct kompaniya_id) from public.t2_qator_muhr where id = any (p_idlar)) <> 1 then
    raise exception 'sovuq_yoz: qatorlar issiq emas yoki obyektga tegishli emas' using errcode = '23514';
  end if;
  if encode(sha256(convert_to(public.t2_qator_muhr_sovuq_matn_v1(p_idlar), 'UTF8')), 'hex') <> p_sha256 then
    raise exception 'sovuq_yoz: bazadagi mazmun sha256 ga mos emas (R2 ga boshqa bayt yozilgan)' using errcode = '23514';
  end if;
  insert into public.t2_qator_muhr_sovuq (kompaniya_id, obyekt_id, idlar, qator_soni, r2_key, r2_sha256, r2_bayt)
    values (v_komp, p_obyekt_id, (select array_agg(x order by x) from unnest(p_idlar) x), v_n, p_r2_key, p_sha256, p_r2_bayt)
    returning id into v_id;
  return v_id;
end $$;

-- 5b. Skript R2 dan qayta o'qib sha256 ni solishtirgach tasdiqlaydi.
create or replace function public.t2_qator_muhr_sovuq_tasdiq_v1(p_id bigint, p_sha256 text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.t2_qator_muhr_sovuq e set r2_tasdiqlangan = coalesce(e.r2_tasdiqlangan, now()) where e.id = p_id and e.r2_sha256 = p_sha256;
  if not found then raise exception 'sovuq_tasdiq: ko''rsatkich yo''q yoki sha256 mos emas (id=%)', p_id using errcode = 'P0002'; end if;
end $$;

-- 5c. Yuklamani NULL qiladi — faqat tasdiqlangan va bazadagi matn sha256 = R2 sha256 bo'lsa. Qaytaradi: bo'shagan bayt (0 — allaqachon).
create or replace function public.t2_qator_muhr_sovuq_sovut_v1(p_id bigint, p_sha256 text)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.t2_qator_muhr_sovuq; v_bayt bigint; v_n integer;
begin
  select * into e from public.t2_qator_muhr_sovuq x where x.id = p_id for update;
  if not found then raise exception 'sovuq_sovut: ko''rsatkich topilmadi (id=%)', p_id using errcode = 'P0002'; end if;
  if e.r2_tasdiqlangan is null or e.r2_sha256 is distinct from p_sha256 then
    raise exception 'sovuq_sovut: R2 da tasdiqlanmagan — NULL qilinmaydi (id=%)', p_id using errcode = '23514';
  end if;
  if not exists (select 1 from public.t2_qator_muhr m where m.id = any (e.idlar) and m.sovuq_id is null) then return 0; end if;
  if encode(sha256(convert_to(public.t2_qator_muhr_sovuq_matn_v1(e.idlar), 'UTF8')), 'hex') <> e.r2_sha256 then
    raise exception 'sovuq_sovut: joriy mazmun R2 nusxasiga teng emas (id=%)', p_id using errcode = '23514';
  end if;
  select coalesce(sum(coalesce(pg_column_size(m.tur), 0) + coalesce(pg_column_size(m.kod), 0) + coalesce(pg_column_size(m.nom), 0)
                      + coalesce(pg_column_size(m.birlik), 0) + coalesce(pg_column_size(m.kat), 0) + coalesce(pg_column_size(m.ota_id), 0)
                      + coalesce(pg_column_size(m.hajm), 0) + coalesce(pg_column_size(m.narx), 0) + coalesce(pg_column_size(m.norma), 0)), 0)
    into v_bayt from public.t2_qator_muhr m where m.id = any (e.idlar);
  update public.t2_qator_muhr m
     set xom_xesh = public.t2_qator_muhr_xom_v1(m.tur, m.kod, m.nom, m.birlik, m.kat, m.ota_id, m.hajm, m.narx, m.norma),
         sovuq_id = e.id, tur = null, kod = null, nom = null, birlik = null, kat = null, ota_id = null, hajm = null, narx = null, norma = null
   where m.id = any (e.idlar) and m.sovuq_id is null;
  get diagnostics v_n = row_count;
  update public.t2_qator_muhr_sovuq x set sovutildi = now(), bayt_bosh = coalesce(x.bayt_bosh, 0) + v_bayt where x.id = e.id;
  return v_bayt;
end $$;

-- 5d. ISITISH (tikla): R2 dan olingan matn bazaga qaytariladi — sha256 ko'rsatkichga teng, har qator xeshi muhrga teng (trigger yana tekshiradi).
-- p_idlar bo'sh bo'lsa — blokdagi barcha sovuq qatorlar. Qaytaradi: isitilgan qatorlar soni.
create or replace function public.t2_qator_muhr_isit_v1(p_sovuq_id bigint, p_matn text, p_sha256 text, p_idlar bigint[] default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.t2_qator_muhr_sovuq; j jsonb; r jsonb; v_n integer := 0; v_h text[];
begin
  select * into e from public.t2_qator_muhr_sovuq x where x.id = p_sovuq_id for update;
  if not found then raise exception 'isit: ko''rsatkich topilmadi (id=%)', p_sovuq_id using errcode = 'P0002'; end if;
  if e.r2_sha256 is distinct from p_sha256 or encode(sha256(convert_to(p_matn, 'UTF8')), 'hex') <> p_sha256 then
    raise exception 'isit: R2 matni sha256 ga mos emas (id=%)', p_sovuq_id using errcode = '23514';
  end if;
  j := p_matn::jsonb;
  for r in select x from jsonb_array_elements(j) x loop
    continue when p_idlar is not null and not ((r->>'id')::bigint = any (p_idlar));
    continue when not exists (select 1 from public.t2_qator_muhr m where m.id = (r->>'id')::bigint and m.sovuq_id = e.id);
    v_h := public.t2_qator_muhr_hisob(r->>'tur', r->>'kod', r->>'nom', r->>'birlik', r->>'kat', (r->>'ota_id')::bigint,
                                      (r->>'hajm')::numeric, (r->>'narx')::numeric, (r->>'norma')::numeric);
    if v_h[1] is distinct from r->>'muhr' then
      raise exception 'isit: qator % qiymati muhr xeshiga mos emas', r->>'id' using errcode = '23514';
    end if;
    update public.t2_qator_muhr m
       set tur = r->>'tur', kod = r->>'kod', nom = r->>'nom', birlik = r->>'birlik', kat = r->>'kat', ota_id = (r->>'ota_id')::bigint,
           hajm = (r->>'hajm')::numeric, narx = (r->>'narx')::numeric, norma = (r->>'norma')::numeric, sovuq_id = null, xom_xesh = null
     where m.id = (r->>'id')::bigint and m.sovuq_id = e.id and m.muhr = r->>'muhr';
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Isitish nomzodlari: sovuq, ochiq muhr, qator bazada YO'Q yoki haqiqatan o'zgargan (xom barmoq izi + sha256 muhr). Obyekt bo'yicha yoki hammasi.
create or replace function public.t2_qator_muhr_isit_nomzod_v1(p_obyekt_id bigint default null, p_limit integer default 50)
returns table (sovuq_id bigint, r2_key text, r2_sha256 text, idlar bigint[])
language sql stable security definer set search_path = public, pg_temp as $$
  select e.id, e.r2_key, e.r2_sha256, array_agg(m.id order by m.id)
    from public.t2_qator_muhr m
    join public.t2_qator_muhr_sovuq e on e.id = m.sovuq_id
    left join public.t2_qator q on q.id = m.qator_id
   where m.sovuq_id is not null and m.yopildi is null and (p_obyekt_id is null or m.obyekt_id = p_obyekt_id)
     and case when q.id is null then true
              when public.t2_qator_muhr_xom_v1(q.tur, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.hajm, q.narx, q.norma) = m.xom_xesh then false
              else (public.t2_qator_muhr_hisob(q.tur, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.hajm, q.narx, q.norma))[1] <> m.muhr end
   group by e.id, e.r2_key, e.r2_sha256
   order by e.id
   limit greatest(1, least(coalesce(p_limit, 50), 500))
$$;

-- Hisobot: issiq / sovuq qatorlar.
create or replace function public.t2_qator_muhr_sovuq_statistika_v1()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'issiq_qator', count(*) filter (where sovuq_id is null), 'sovuq_qator', count(*) filter (where sovuq_id is not null),
    'blok', (select count(*) from public.t2_qator_muhr_sovuq), 'tasdiqlangan_blok', (select count(*) from public.t2_qator_muhr_sovuq where r2_tasdiqlangan is not null),
    'r2_bayt', (select coalesce(sum(r2_bayt), 0) from public.t2_qator_muhr_sovuq))
  from public.t2_qator_muhr
$$;

-- ───────── 6. View: sovuq qatorni ham to'g'ri ko'rsatadi ─────────
-- Issiq qator (sovuq_id null): AVVALGI mantiq aynan. Sovuq qator: xom barmoq izi farq qilsa — muhr xeshi (hisob) solishtiriladi; haqiqiy
-- farq bo'lsa holat 'ozgargan' (avval/endi hali bo'sh: R2 dan isitilgach to'ladi — cron yoki /api/muhr-isit), qator yo'q bo'lsa 'ochirilgan'.
-- Yangi ustun `sovuq` (oxirgi `muhr` dan keyin). Boshqa o'quvchi (funksiya) bu view'ga bog'liq emas (pg_depend tekshirildi).
drop view if exists public.t2_qator_muhr_farq;
create view public.t2_qator_muhr_farq with (security_invoker = true) as
with b as (
  select m.kompaniya_id, m.obyekt_id, m.qator_id,
         coalesce(q.tur, m.tur) as tur, coalesce(q.kod, m.kod) as kod, coalesce(q.nom, m.nom) as nom, coalesce(q.ota_id, m.ota_id) as ota_id,
         case when q.id is null then 'ochirilgan' when cardinality(f.maydonlar) > 0 or coalesce(c.sovuq_ozgargan, false) then 'ozgargan' else 'qoshilgan' end as holat,
         f.maydonlar, f.avval, f.endi,
         (q.id is not null and f.maydonlar = array['narx'] and m.narx is null) as faqat_narx_qoyildi,
         m.aslda_yoq, m.ekspertizagacha, m.tekshirilmagan, m.manba as muhr_manba, m.asos_vaqt, m.bosqich, m.revision_id, m.muhr,
         (m.sovuq_id is not null) as sovuq
    from public.t2_qator_muhr m
    left join public.t2_qator q on q.id = m.qator_id
    left join lateral (
      select hh.h, (m.sovuq_id is not null and hh.h[1] is distinct from m.muhr) as sovuq_ozgargan
        from (select public.t2_qator_muhr_hisob(q.tur, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.hajm, q.narx, q.norma) as h) hh
       where q.id is not null
         and case when m.sovuq_id is null
                  then (q.tur is distinct from m.tur or q.kod is distinct from m.kod or q.nom is distinct from m.nom
                        or q.birlik is distinct from m.birlik or q.kat is distinct from m.kat or q.ota_id is distinct from m.ota_id
                        or q.hajm is distinct from m.hajm or q.narx is distinct from m.narx or q.norma is distinct from m.norma)
                  else public.t2_qator_muhr_xom_v1(q.tur, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.hajm, q.narx, q.norma) is distinct from m.xom_xesh end
    ) c on true
    cross join lateral (
      select coalesce(array_agg(x.maydon order by x.n), '{}'::text[]) as maydonlar,
             coalesce(jsonb_object_agg(x.maydon, x.avval), '{}'::jsonb) as avval,
             coalesce(jsonb_object_agg(x.maydon, x.endi), '{}'::jsonb) as endi
        from (values
          (1, 'tur',    to_jsonb(m.tur),    to_jsonb(c.h[2])),
          (2, 'kod',    to_jsonb(m.kod),    to_jsonb(c.h[3])),
          (3, 'nom',    to_jsonb(m.nom),    to_jsonb(c.h[4])),
          (4, 'birlik', to_jsonb(m.birlik), to_jsonb(c.h[5])),
          (5, 'kat',    to_jsonb(m.kat),    to_jsonb(c.h[6])),
          (6, 'ota_id', to_jsonb(m.ota_id), to_jsonb(q.ota_id)),
          (7, 'hajm',   to_jsonb(m.hajm),   to_jsonb(trim_scale(q.hajm))),
          (8, 'narx',   to_jsonb(m.narx),   to_jsonb(trim_scale(q.narx))),
          (9, 'norma',  to_jsonb(m.norma),  to_jsonb(trim_scale(q.norma)))
        ) x(n, maydon, avval, endi)
       where c.h is not null and m.sovuq_id is null and x.avval is distinct from x.endi
    ) f
   where m.yopildi is null
     and not exists (select 1 from public.t2_qator_muhr m2 where m2.qator_id = m.qator_id and m2.bosqich > m.bosqich and m2.yopildi is null)
     and (q.id is null or cardinality(f.maydonlar) > 0 or m.aslda_yoq or coalesce(c.sovuq_ozgargan, false))
  union all
  select q.kompaniya_id, q.obyekt_id, q.id, q.tur, q.kod, q.nom, q.ota_id, 'muhrsiz', '{}'::text[], '{}'::jsonb, '{}'::jsonb,
         false, null::boolean, null::boolean, '{}'::text[], null::text, null::timestamptz, null::integer, null::bigint, null::text, false
    from public.t2_qator q
   where not exists (select 1 from public.t2_qator_muhr m where m.qator_id = q.id and m.yopildi is null)
)
select b.*, j.jurnal_soni, j.oxirgi_tahrir, j.oxirgi_kim, j.oxirgi_manba
  from b
  left join lateral (
    select count(*)::int as jurnal_soni, max(z.vaqt) as oxirgi_tahrir,
           (array_agg(z.kim order by z.vaqt desc))[1] as oxirgi_kim, (array_agg(z.manba order by z.vaqt desc))[1] as oxirgi_manba
      from public.t2_ozgarish z
     where z.qator_id = b.qator_id and z.jadval = 't2_qator' and (b.asos_vaqt is null or z.vaqt >= b.asos_vaqt)
  ) j on true;
comment on view public.t2_qator_muhr_farq is
  'SMETA CONST: muhrdan farq qilgan qatorlar (ozgargan / ochirilgan / qoshilgan / muhrsiz), avval/endi faqat o''zgargan maydonlar, t2_ozgarish jurnali bilan. sovuq = true va maydonlar bo''sh — asl qiymat R2 da (isitishdan keyin to''ladi). versiya: tarix (muhr tarixi, faol/almashtirilgan farqsiz).';
revoke all on public.t2_qator_muhr_farq from public, anon, authenticated;
grant select on public.t2_qator_muhr_farq to service_role;

-- ───────── 7. Ruxsatlar ─────────
revoke all on function public.t2_qator_muhr_xom_v1(text, text, text, text, text, bigint, numeric, numeric, numeric),
  public.t2_qator_muhr_sovuq_matn_v1(bigint[]), public.t2_qator_muhr_sovuq_const_trg(),
  public.t2_qator_muhr_sovuq_nomzod_v1(integer, integer), public.t2_qator_muhr_sovuq_oqi_v1(bigint, integer, integer),
  public.t2_qator_muhr_sovuq_yoz_v1(bigint, bigint[], text, text, bigint), public.t2_qator_muhr_sovuq_tasdiq_v1(bigint, text),
  public.t2_qator_muhr_sovuq_sovut_v1(bigint, text), public.t2_qator_muhr_isit_v1(bigint, text, text, bigint[]),
  public.t2_qator_muhr_isit_nomzod_v1(bigint, integer), public.t2_qator_muhr_sovuq_statistika_v1() from public, anon, authenticated;
grant execute on function public.t2_qator_muhr_xom_v1(text, text, text, text, text, bigint, numeric, numeric, numeric),
  public.t2_qator_muhr_sovuq_matn_v1(bigint[]),
  public.t2_qator_muhr_sovuq_nomzod_v1(integer, integer), public.t2_qator_muhr_sovuq_oqi_v1(bigint, integer, integer),
  public.t2_qator_muhr_sovuq_yoz_v1(bigint, bigint[], text, text, bigint), public.t2_qator_muhr_sovuq_tasdiq_v1(bigint, text),
  public.t2_qator_muhr_sovuq_sovut_v1(bigint, text), public.t2_qator_muhr_isit_v1(bigint, text, text, bigint[]),
  public.t2_qator_muhr_isit_nomzod_v1(bigint, integer), public.t2_qator_muhr_sovuq_statistika_v1() to service_role;

-- ───────── 8. Izohlar (AGENTS.md §2c: muhr — B toifa, versiyasiz/tarix o'quvchi) ─────────
comment on function public.t2_qator_muhr_sovuq_nomzod_v1(integer, integer) is 'SAQLASH DIETASI: sovutish nomzod obyektlari. versiya: tarix (muhr tarixi, faol/almashtirilgan farqsiz).';
comment on function public.t2_qator_muhr_sovuq_oqi_v1(bigint, integer, integer) is 'SAQLASH DIETASI: bitta obyekt bloki (R2 matni). versiya: tarix (muhr tarixi, faol/almashtirilgan farqsiz).';
comment on function public.t2_qator_muhr_isit_nomzod_v1(bigint, integer) is 'SAQLASH DIETASI: isitish nomzodlari (sovuq, o''zgargan/o''chirilgan). versiya: tarix (muhr tarixi, faol/almashtirilgan farqsiz).';
comment on function public.t2_qator_muhr_sovuq_statistika_v1() is 'SAQLASH DIETASI: issiq/sovuq muhr hisobot. versiya: tarix (faqat t2_qator_muhr hisobi).';
comment on function public.t2_qator_muhr_isit_v1(bigint, text, text, bigint[]) is 'SAQLASH DIETASI: R2 dan muhr yuklamasini qaytarish (xesh tekshiruvi bilan).';
