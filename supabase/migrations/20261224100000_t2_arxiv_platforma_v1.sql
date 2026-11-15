-- 20261224100000 - SAQLASH SIYOSATI VA SOVUQ ARXIV PLATFORMASI (R2): tarix/log/versiya/snapshot/qoralama jadvallari sovuq qismi R2 ga.
-- QO'LLANMAYDI (egasi tasdiqlaydi). Faqat yangi jadval/funksiyalar; mavjud biznes jadvallariga tegmaydi.
-- Xavfsizlik tartibi (arxivlovchi: frontend/functions/api/arxiv-tick.ts, tungi 21:30 UTC):
--   batch (o'qish) -> gzip -> R2 yoz -> HEAD + qayta o'qish + sha256 + qator soni -> manifest (t2_arxiv_bolak) -> kichik partiyada o'chirish.
--   O'chirish funksiyasi manifest qator soni (== o'chiriladigan idlar soni) mos bo'lmasa RAD etadi; lock_timeout 3 s, statement_timeout 30 s, <= 2000 qator.
-- Tiklash: t2_arxiv_tikla_v1 (R2 dan olingan qatorlarni qaytaradi, mavjudini o'tkazib yuboradi) yoki snapshot.sovuq_tikla (snapshot).
-- Faqat service_role. Real ma'lumot/summa bu faylda yo'q.

-- ───────── 1. Siyosat reyestri (TS: functions/_shared/arxiv-siyosat.ts ning nusxasi; moslik testi bor) ─────────
create table if not exists public.t2_arxiv_siyosat (
  jadval       text primary key check (jadval ~ '^[a-z0-9_.]{3,80}$'),
  rejim        text not null check (rejim in ('qator-arxiv', 'snapshot-sovuq', 'saqlanadi')),
  saqlash_kun  integer check (saqlash_kun is null or saqlash_kun >= 1),
  kalit        text check (kalit is null or kalit ~ '^[a-z_]+$'),
  kalit_tur    text check (kalit_tur in ('bigint', 'uuid')),
  vaqt         text check (vaqt is null or vaqt ~ '^[a-z_]+$'),
  shart_ustun  text check (shart_ustun is null or shart_ustun ~ '^[a-z_]+$'),
  shart_emas   text check (shart_emas is null or shart_emas ~ '^[a-z_]+$'),
  format       text not null,
  tiklash      text not null,
  izoh         text not null,
  check (rejim <> 'qator-arxiv' or (kalit is not null and kalit_tur is not null and vaqt is not null and saqlash_kun is not null))
);

insert into public.t2_arxiv_siyosat (jadval, rejim, saqlash_kun, kalit, kalit_tur, vaqt, shart_ustun, shart_emas, format, tiklash, izoh) values
  ('t2_onboarding_command_log', 'qator-arxiv', 30, 'operation_id', 'uuid',   'created_at',      null,   null,             'ndjson.gz', 't2_arxiv_tikla_v1', 'buyruq payloadlari; faqat audit tarixi'),
  ('t2_addrepl_command',        'qator-arxiv', 30, 'operation_id', 'uuid',   'created_at',      null,   null,             'ndjson.gz', 't2_arxiv_tikla_v1', 'qo''shimcha/zamena buyruq jurnali'),
  ('t2_ozgarish',               'qator-arxiv', 30, 'id',           'bigint', 'vaqt',            null,   null,             'ndjson.gz', 't2_arxiv_tikla_v1', 'qator o''zgarish tarixi'),
  ('t2_audit_log',              'qator-arxiv', 30, 'id',           'bigint', 'yaratilgan_vaqt', null,   null,             'ndjson.gz', 't2_arxiv_tikla_v1', 'audit jurnali'),
  ('t2_f2_import_draft_qator',  'qator-arxiv', 14, 'id',           'bigint', 'yaratildi',       'holat', 'hal_qilinmagan', 'ndjson.gz', 't2_arxiv_tikla_v1', 'F2 import qoralama qatorlari; hal qilinmaganlari qoladi'),
  ('snapshot.bolak_mazmun',     'snapshot-sovuq', 30, null, null, null, null, null, 'json.gz', 'snapshot.sovuq_tikla', 'snapshot blok mazmuni; 30 kundan eskisi R2 ga'),
  ('snapshot.obyekt_snapshot',        'saqlanadi', null, null, null, null, null, null, '-', '-', 'kichik boshqaruv jadvali'),
  ('snapshot.obyekt_snapshot_bolak',  'saqlanadi', null, null, null, null, null, null, '-', '-', 'kichik havolalar jadvali'),
  ('snapshot.qaytarish_jurnal',       'saqlanadi', null, null, null, null, null, null, '-', '-', 'kichik; qaytarish tarixi'),
  ('snapshot.r2_yetim',               'saqlanadi', null, null, null, null, null, null, '-', '-', 'R2 yetim kalitlar'),
  ('snapshot.jadval_royxat',          'saqlanadi', null, null, null, null, null, null, '-', '-', 'sozlama jadvali'),
  ('t2_smeta_revision',               'saqlanadi', null, null, null, null, null, null, '-', '-', 'FK bilan bog''liq; jsonb ni R2 ga ko''chirish alohida ADR'),
  ('t2_qator_muhr',                   'saqlanadi', null, null, null, null, null, null, '-', '-', 'biznes ma''lumoti'),
  ('t2_smeta_versiya_pozitsiya',      'saqlanadi', null, null, null, null, null, null, '-', '-', 'faol versiya ma''lumoti'),
  ('t2_smeta_versiya_moslik',         'saqlanadi', null, null, null, null, null, null, '-', '-', 'faol versiya ma''lumoti'),
  ('t2_smeta_ozgarish',               'saqlanadi', null, null, null, null, null, null, '-', '-', 'smeta o''zgarish arizalari (FK)'),
  ('t2_signal',                       'saqlanadi', null, null, null, null, null, null, '-', '-', 'faol signallar'),
  ('t2_arxiv_bolak',                  'saqlanadi', null, null, null, null, null, null, '-', '-', 'arxiv manifesti'),
  ('t2_arxiv_siyosat',                'saqlanadi', null, null, null, null, null, null, '-', '-', 'siyosat reyestri'),
  ('t2_arxiv_ish_jurnal',             'saqlanadi', null, null, null, null, null, null, '-', '-', 'arxivlovchi ish jurnali')
on conflict (jadval) do nothing;

-- ───────── 2. Manifest va ish jurnali ─────────
create table if not exists public.t2_arxiv_bolak (
  id            bigint generated always as identity primary key,
  jadval        text not null references public.t2_arxiv_siyosat(jadval),
  kalit_oraligi text not null check (length(kalit_oraligi) <= 120),
  r2_key        text not null check (r2_key ~ '^arxiv/[a-z0-9_]+/[0-9]{4}/[0-9]{2}/[A-Za-z0-9._-]+\.ndjson\.gz$'),
  qator_soni    integer not null check (qator_soni > 0 and qator_soni <= 2000),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bayt          bigint,
  yaratildi     timestamptz not null default now(),
  ochirildi     timestamptz,
  tiklandi      timestamptz,
  unique (jadval, r2_key)
);
create index if not exists t2_arxiv_bolak_jadval_idx on public.t2_arxiv_bolak (jadval, id desc);

create table if not exists public.t2_arxiv_ish_jurnal (
  id        bigint generated always as identity primary key,
  vaqt      timestamptz not null default now(),
  jadval    text not null,
  rejim     text not null,
  qator     bigint not null default 0,
  r2_bayt   bigint not null default 0,
  xato      text check (xato is null or length(xato) <= 200)
);
create index if not exists t2_arxiv_ish_jurnal_vaqt_idx on public.t2_arxiv_ish_jurnal (vaqt desc);

alter table public.t2_arxiv_siyosat enable row level security;
alter table public.t2_arxiv_bolak enable row level security;
alter table public.t2_arxiv_ish_jurnal enable row level security;
revoke all on public.t2_arxiv_siyosat, public.t2_arxiv_bolak, public.t2_arxiv_ish_jurnal from public, anon, authenticated;
grant select, insert, update on public.t2_arxiv_siyosat, public.t2_arxiv_bolak, public.t2_arxiv_ish_jurnal to service_role;

-- ───────── 3. Partiya olish (faqat o'qish) ─────────
create or replace function public.t2_arxiv_batch_v1(p_jadval text, p_limit integer default 1000, p_after text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
set statement_timeout to '30s' set lock_timeout to '3s' as $$
declare s public.t2_arxiv_siyosat; v_sql text; v_res jsonb; v_lim integer := least(greatest(coalesce(p_limit, 1000), 1), 2000);
begin
  select * into s from public.t2_arxiv_siyosat where jadval = p_jadval and rejim = 'qator-arxiv';
  if not found then raise exception 't2_arxiv_batch_v1: % arxiv jadvali emas', p_jadval using errcode = '22023'; end if;
  v_sql := format(
    'select coalesce(jsonb_agg(jsonb_build_object(''k'', x.k::text, ''t'', x.t, ''r'', x.r) order by x.k), ''[]''::jsonb) '
    'from (select q.%1$I as k, q.%2$I as t, to_jsonb(q) as r from public.%3$I q '
    'where q.%2$I < now() - make_interval(days => %4$s)%5$s%6$s order by q.%1$I limit %7$s) x',
    s.kalit, s.vaqt, s.jadval, s.saqlash_kun,
    case when s.shart_ustun is not null then format(' and q.%I is distinct from %L', s.shart_ustun, s.shart_emas) else '' end,
    case when p_after is not null then format(' and q.%I > %L::%s', s.kalit, p_after, s.kalit_tur) else '' end,
    v_lim);
  execute v_sql into v_res;
  return v_res;
end $$;

-- ───────── 4. Manifest yozish ─────────
create or replace function public.t2_arxiv_yoz_v1(p_jadval text, p_oraliq text, p_r2_key text, p_soni integer, p_sha256 text, p_bayt bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare m public.t2_arxiv_bolak;
begin
  if not exists (select 1 from public.t2_arxiv_siyosat where jadval = p_jadval and rejim = 'qator-arxiv') then
    return jsonb_build_object('ok', false, 'code', 'JADVAL_NOMALUM');
  end if;
  if p_r2_key is null or p_r2_key not like 'arxiv/' || p_jadval || '/%' then return jsonb_build_object('ok', false, 'code', 'KALIT_NOTOGRI'); end if;
  select * into m from public.t2_arxiv_bolak where jadval = p_jadval and r2_key = p_r2_key;
  if found then
    if m.sha256 <> p_sha256 or m.qator_soni <> p_soni then return jsonb_build_object('ok', false, 'code', 'MANIFEST_ZIDDIYAT'); end if;
    return jsonb_build_object('ok', true, 'id', m.id, 'takror', true);
  end if;
  insert into public.t2_arxiv_bolak (jadval, kalit_oraligi, r2_key, qator_soni, sha256, bayt)
  values (p_jadval, left(p_oraliq, 120), p_r2_key, p_soni, p_sha256, p_bayt) returning * into m;
  return jsonb_build_object('ok', true, 'id', m.id, 'takror', false);
end $$;

-- ───────── 5. Tasdiqlangan partiyani o'chirish (manifest soniga mos bo'lsa) ─────────
create or replace function public.t2_arxiv_ochir_v1(p_jadval text, p_r2_key text, p_idlar text[])
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
set statement_timeout to '30s' set lock_timeout to '3s' as $$
declare s public.t2_arxiv_siyosat; m public.t2_arxiv_bolak; v_n bigint;
begin
  select * into s from public.t2_arxiv_siyosat where jadval = p_jadval and rejim = 'qator-arxiv';
  if not found then return jsonb_build_object('ok', false, 'code', 'JADVAL_NOMALUM'); end if;
  select * into m from public.t2_arxiv_bolak where jadval = p_jadval and r2_key = p_r2_key;
  if not found then return jsonb_build_object('ok', false, 'code', 'MANIFEST_YOQ'); end if;
  if p_idlar is null or cardinality(p_idlar) = 0 or cardinality(p_idlar) > 2000 or cardinality(p_idlar) <> m.qator_soni then
    return jsonb_build_object('ok', false, 'code', 'SON_MOS_EMAS');
  end if;
  -- Muddat va shart QAYTA tekshiriladi: o'zgargan/yangilangan qator o'chirilmaydi.
  execute format('delete from public.%1$I q where q.%2$I = any($1::%3$s[]) and q.%4$I < now() - make_interval(days => %5$s)%6$s',
    s.jadval, s.kalit, s.kalit_tur, s.vaqt, s.saqlash_kun,
    case when s.shart_ustun is not null then format(' and q.%I is distinct from %L', s.shart_ustun, s.shart_emas) else '' end)
    using p_idlar;
  get diagnostics v_n = row_count;
  update public.t2_arxiv_bolak set ochirildi = now() where id = m.id;
  return jsonb_build_object('ok', true, 'ochirildi', v_n);
end $$;

-- ───────── 6. Tiklash: R2 dan olingan qatorlarni qaytarish ─────────
create or replace function public.t2_arxiv_tikla_v1(p_jadval text, p_r2_key text, p_qatorlar jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
set statement_timeout to '30s' set lock_timeout to '3s' as $$
declare s public.t2_arxiv_siyosat; v_n bigint;
begin
  select * into s from public.t2_arxiv_siyosat where jadval = p_jadval and rejim = 'qator-arxiv';
  if not found then return jsonb_build_object('ok', false, 'code', 'JADVAL_NOMALUM'); end if;
  if not exists (select 1 from public.t2_arxiv_bolak where jadval = p_jadval and r2_key = p_r2_key) then return jsonb_build_object('ok', false, 'code', 'MANIFEST_YOQ'); end if;
  if jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) > 2000 then return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI'); end if;
  execute format('insert into public.%1$I overriding system value select * from jsonb_populate_recordset(null::public.%1$I, $1) on conflict do nothing', s.jadval) using p_qatorlar;
  get diagnostics v_n = row_count;
  update public.t2_arxiv_bolak set tiklandi = now() where jadval = p_jadval and r2_key = p_r2_key;
  return jsonb_build_object('ok', true, 'kiritildi', v_n);
end $$;

-- ───────── 7. Snapshot sovuq qatlamiga service_role o'ramlari (snapshot sxemasi PostgREST ga ochiq emas) ─────────
create or replace function public.t2_arxiv_snap_nomzod_v1(p_kun integer default 30, p_limit integer default 10)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from snapshot.sovuq_nomzod(p_kun, least(greatest(coalesce(p_limit, 10), 1), 50), false) n
$$;
create or replace function public.t2_arxiv_snap_oqi_v1(p_xesh text)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select jsonb_build_object('matn', o.matn, 'bayt', o.bayt, 'jadval', o.jadval) from snapshot.sovuq_oqi(p_xesh) o), '{}'::jsonb)
$$;
create or replace function public.t2_arxiv_snap_sovut_v1(p_xesh text, p_r2_key text, p_sha256 text, p_r2_bayt bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
set statement_timeout to '30s' set lock_timeout to '3s' as $$
declare v_bosh bigint;
begin
  perform snapshot.sovuq_yoz(p_xesh, p_r2_key, p_sha256, p_r2_bayt);
  perform snapshot.sovuq_tasdiq(p_xesh, p_sha256);
  v_bosh := snapshot.sovuq_sovut(p_xesh, p_sha256);
  return jsonb_build_object('ok', true, 'bosh_bayt', v_bosh);
end $$;

-- ───────── 8. Monitoring: ish jurnali, holat, ogohlantirish ─────────
create or replace function public.t2_arxiv_jurnal_yoz_v1(p_jadval text, p_rejim text, p_qator bigint, p_r2_bayt bigint, p_xato text)
returns void language sql security definer set search_path to 'public', 'pg_temp' as $$
  insert into public.t2_arxiv_ish_jurnal (jadval, rejim, qator, r2_bayt, xato) values (left(p_jadval, 80), left(p_rejim, 30), coalesce(p_qator, 0), coalesce(p_r2_bayt, 0), left(p_xato, 200));
  delete from public.t2_arxiv_ish_jurnal where vaqt < now() - interval '90 days';
$$;

create or replace function public.t2_arxiv_holat_v1()
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'songgi_ish', (select max(vaqt) from public.t2_arxiv_ish_jurnal),
    'sutka_qator', coalesce((select sum(qator) from public.t2_arxiv_ish_jurnal where vaqt > now() - interval '24 hours'), 0),
    'sutka_r2_bayt', coalesce((select sum(r2_bayt) from public.t2_arxiv_ish_jurnal where vaqt > now() - interval '24 hours'), 0),
    'hafta_xato', (select count(*) from public.t2_arxiv_ish_jurnal where xato is not null and vaqt > now() - interval '7 days'),
    'songgi_xato', (select xato from public.t2_arxiv_ish_jurnal where xato is not null order by id desc limit 1),
    'bolaklar', (select count(*) from public.t2_arxiv_bolak))
$$;

-- Superadminlarga kuniga bir marta bildirishnoma (t2_outbox -> t2_bildirishnoma, operation_id sabab+kunga bog'liq = dublikatsiz).
create or replace function public.t2_arxiv_ogohlantir_v1(p_sabab text, p_tafsilot jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_idlar bigint[]; v_komp bigint; v_jid bigint;
begin
  if p_sabab not in ('hajm', 'xato') then return jsonb_build_object('ok', false, 'code', 'SABAB_NOTOGRI'); end if;
  select array_agg(distinct a.foydalanuvchi_id), min(a.kompaniya_id) into v_idlar, v_komp
    from public.t2_azolik a where a.rol = 'superadmin' and a.holat = 'faol';
  if v_idlar is null then return jsonb_build_object('ok', true, 'yuborildi', false); end if;
  if v_komp is null then select min(id) into v_komp from public.t2_kompaniya; end if;
  select max(id) into v_jid from public.t2_arxiv_ish_jurnal;
  insert into public.t2_outbox (kompaniya_id, mavzu, entity_jadval, entity_id, foydalanuvchi_idlar, payload, operation_id)
  values (v_komp, 'tizim.arxiv_ogoh', 't2_arxiv_ish_jurnal', coalesce(v_jid, 0), v_idlar,
          jsonb_build_object('sabab', p_sabab) || coalesce(p_tafsilot, '{}'::jsonb), md5(p_sabab || current_date::text)::uuid)
  on conflict do nothing;
  return jsonb_build_object('ok', true, 'yuborildi', true);
end $$;

do $g$
declare f text;
begin
  foreach f in array array[
    'public.t2_arxiv_batch_v1(text, integer, text)', 'public.t2_arxiv_yoz_v1(text, text, text, integer, text, bigint)',
    'public.t2_arxiv_ochir_v1(text, text, text[])', 'public.t2_arxiv_tikla_v1(text, text, jsonb)',
    'public.t2_arxiv_snap_nomzod_v1(integer, integer)', 'public.t2_arxiv_snap_oqi_v1(text)',
    'public.t2_arxiv_snap_sovut_v1(text, text, text, bigint)', 'public.t2_arxiv_jurnal_yoz_v1(text, text, bigint, bigint, text)',
    'public.t2_arxiv_holat_v1()', 'public.t2_arxiv_ogohlantir_v1(text, jsonb)'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
    execute 'grant execute on function ' || f || ' to service_role';
  end loop;
end $g$;

