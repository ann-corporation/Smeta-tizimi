-- T2-OBYEKT-SNAPSHOT v1 (egasi 2026-10-26: «faqat obyekt ma'lumotlarini kunlik autosave qil, bir joyda saqlansin,
-- xohlasam kechagi holatiga qaytara olay»). MCP server uchun ham poydevor: har MCP yozuvidan oldin snapshot.ol(..,'mcp_oldi').
--
-- SAQLASH JOYI (bitta joy): schema `snapshot` (public emas, PostgREST'ga ochilmagan; anon/authenticated'ga USAGE yo'q).
--   snapshot.jadval_royxat       — qaysi jadval qaysi doirada (WHERE) obyektga tegishli va qanday rejimda.
--   snapshot.obyekt_snapshot     — sarlavha: obyekt, vaqt, sabab, meta {jadval:{soni,xesh,bayt}}, umumiy xesh, hajm.
--   snapshot.obyekt_snapshot_bolak — snapshot → (jadval, bo'lak№) → mazmun xeshi (ko'rsatkich).
--   snapshot.bolak_mazmun        — MAZMUN BO'YICHA ADRESLANGAN bo'laklar: jadval qatorlarining jsonb massivi
--                                  (5000 qatordan, PK tartibida, lz4). O'zgarmagan jadval/bo'lak keyingi snapshotlarda
--                                  QAYTA SAQLANMAYDI (xesh bir xil → bitta nusxa). Shu sabab kunlik snapshot arzon.
-- REJIMLAR: 'tiklash' — snapshotga kiradi va qaytariladi; 'shartnoma' — shartnoma darajasidagi jadval, faqat shartnoma
--   SHU obyektgagina bog'langan bo'lsa qaytariladi (aks holda boshqa obyektga tegib ketadi → o'tkazib yuboriladi);
--   'jurnal' — faqat yoziladi (tarix), qaytarilmaydi (append-only o'zgarish jurnali saqlanib qolishi kerak).
-- QAYTARISH: snapshot.qaytar(id, 'QAYTAR <id>') — avval joriy holatdan 'restore_oldi' snapshot, keyin bitta tranzaksiyada
--   `SET LOCAL session_replication_role = replica` (Supabase'da postgres uchun ishlaydi — tekshirilgan; set_config()/
--   funksiya SET bandi ishlamaydi, faqat SET LOCAL buyrug'i) ostida faqat FARQLI qatorlar o'chiriladi/qayta yoziladi
--   (ASL id'lar, generated ustunlarsiz, OVERRIDING SYSTEM VALUE). Trigerlar (akt qulfi, lifecycle guard, freeze, versiya,
--   audit) va FK RI trigerlari shu oraliqda o'chadi; shuning uchun keyin FK yaxlitligi QO'LDA tekshiriladi va har jadval
--   xeshi snapshotdagiga teng ekani isbotlanadi — aks holda xato → butun tranzaksiya qaytadi.
-- Sequence'lar o'zgartirilmaydi: qaytarilgan id'lar har doim joriy sequence qiymatidan kichik (ular avval berilgan).
-- CHEKLOV: snapshotdan keyin jadvalga NOT NULL ustun qo'shilgan bo'lsa, eski qatorlarni qaytarish xato beradi (xavfsiz:
--   hech narsa o'zgarmaydi). Jadval ro'yxatiga keyin qo'shilgan jadvallar eski snapshotdan qaytarilmaydi (meta'da yo'q).
begin;

create schema if not exists snapshot;
revoke all on schema snapshot from public;
revoke all on schema snapshot from anon, authenticated;
grant usage on schema snapshot to service_role;

-- 1. Jadvallar ro'yxati -----------------------------------------------------------------------------------------------
create table snapshot.jadval_royxat (
  jadval text primary key,
  tartib int not null unique,
  rejim text not null check (rejim in ('tiklash', 'shartnoma', 'jurnal')),
  doira text not null,   -- WHERE predikati, alias t; $1 = obyekt_id (bigint), $2 = obyektga bog'langan shartnoma_id[]
  sabab text not null
);

insert into snapshot.jadval_royxat (tartib, jadval, rejim, doira, sabab) values
 ( 10, 't2_obyekt',                   'tiklash', 't.id = $1', 'obyekt kartochkasi (nom, holat, sozlamalar)'),
 ( 20, 't2_sozlama',                  'tiklash', 't.obyekt_id = $1', 'obyekt sozlamalari'),
 ( 30, 't2_kozgu',                    'tiklash', 't.obyekt_id = $1', 'ko''zgu (Sheets) bog''lanishi'),
 ( 40, 't2_manba',                    'tiklash', 't.obyekt_id = $1', 'smeta manbalari; t2_qator.manba_id FK'),
 ( 50, 't2_xom',                      'tiklash', 't.manba_id in (select m.id from public.t2_manba m where m.obyekt_id = $1)', 'xom import qatorlari; manba_id FK (CASCADE)'),
 ( 60, 't2_tuzilma',                  'tiklash', 't.obyekt_id = $1', 'smeta tuzilmasi; t2_qator.tuzilma_id FK'),
 ( 70, 't2_smeta_paket',              'tiklash', 't.obyekt_id = $1', 'smeta paketi'),
 ( 80, 't2_smeta_paket_manba',        'tiklash', 't.paket_id in (select p.id from public.t2_smeta_paket p where p.obyekt_id = $1)', 'paket manbalari; t2_qator.smeta_paket_manba_id FK'),
 ( 90, 't2_smeta_paket_res_manba',    'tiklash', 't.paket_manba_id in (select pm.id from public.t2_smeta_paket_manba pm join public.t2_smeta_paket p on p.id = pm.paket_id where p.obyekt_id = $1)', 'paket RES manbalari'),
 (100, 't2_smeta_ozgarish',           'tiklash', 't.obyekt_id = $1', 'smeta o''zgarishlari (ADD/REPL); t2_qator.change_id FK'),
 (110, 't2_smeta_ozgarish_qator',     'tiklash', 't.ozgarish_id in (select z.id from public.t2_smeta_ozgarish z where z.obyekt_id = $1)', 'o''zgarish qatorlari'),
 (120, 't2_smeta_revision',           'tiklash', 't.obyekt_id = $1', 'smeta reviziyalari'),
 (130, 't2_qator',                    'tiklash', 't.obyekt_id = $1', 'SMETA QATORLARI (asosiy)'),
 (140, 't2_narx',                     'tiklash', 't.obyekt_id = $1', 'obyekt narxlari'),
 (150, 't2_narx_dalil',               'tiklash', 't.obyekt_id = $1', 'narx dalillari; qator_id FK (CASCADE)'),
 (160, 't2_viborka',                  'tiklash', 't.obyekt_id = $1', 'viborka'),
 (170, 't2_viborka_qabul',            'tiklash', 't.viborka_id in (select v.id from public.t2_viborka v where v.obyekt_id = $1)', 'viborka qabuli'),
 (180, 't2_price_basis',              'tiklash', 't.obyekt_id = $1', 'narx bazasi'),
 (190, 't2_price_basis_line',         'tiklash', 't.basis_id in (select b.id from public.t2_price_basis b where b.obyekt_id = $1)', 'narx bazasi qatorlari; qator_id FK, akt_qator.reference_basis_line_id FK'),
 (200, 't2_shartnoma_bog',            'tiklash', 't.obyekt_id = $1', 'obyekt↔shartnoma bog''i'),
 (210, 't2_shartnoma_qoshimcha_bog',  'tiklash', 't.obyekt_id = $1', 'qo''shimcha shartnoma bog''i'),
 (220, 't2_forma3',                   'tiklash', 't.obyekt_id = $1', 'Forma-3'),
 (230, 't2_akt',                      'tiklash', 't.obyekt_id = $1', 'F2/fakt aktlari (tasdiqlanganlari ham)'),
 (240, 't2_akt_qator',                'tiklash', 't.obyekt_id = $1', 'akt qatorlari (summa, variance_summa — generated); akt_qator.obyekt_id = akt.obyekt_id (prodda 0 ta nomuvofiq, tekshirilgan)'),
 (250, 't2_akt_holat_tarix',          'tiklash', 't.akt_id in (select a.id from public.t2_akt a where a.obyekt_id = $1)', 'akt holat tarixi (akt holati bilan mos bo''lishi kerak)'),
 (260, 't2_akt_correction_link',      'tiklash', 't.original_akt_id in (select a.id from public.t2_akt a where a.obyekt_id = $1) or t.replacement_akt_id in (select a.id from public.t2_akt a where a.obyekt_id = $1)', 'tuzatish akti bog''i'),
 (270, 't2_forma3_akt',               'tiklash', 't.forma3_id in (select f.id from public.t2_forma3 f where f.obyekt_id = $1)', 'Forma-3 ↔ akt'),
 (280, 't2_qator_bajarilmadi',        'tiklash', 't.obyekt_id = $1', 'bajarilmagan ishlar'),
 (290, 't2_qator_ochirilgan',         'tiklash', 't.obyekt_id = $1', 'o''chirilgan qatorlar arxivi (qaytarish uchun)'),
 (300, 't2_nakrutka_podval',          'tiklash', 't.obyekt_id = $1', 'nakrutka podvali'),
 (310, 't2_nakrutka_podval_tarix',    'tiklash', 't.podval_id in (select p.id from public.t2_nakrutka_podval p where p.obyekt_id = $1)', 'podval tarixi'),
 (320, 't2_f2_import_job',            'tiklash', 't.obyekt_id = $1', 'F2 import ishlari'),
 (330, 't2_f2_import_draft_qator',    'tiklash', 't.job_id in (select j.id from public.t2_f2_import_job j where j.obyekt_id = $1)', 'F2 import qoralama qatorlari'),
 (340, 't2_f2_import_job_cancel_event','tiklash', 't.job_id in (select j.id from public.t2_f2_import_job j where j.obyekt_id = $1)', 'import bekor hodisalari; job_id FK'),
 (350, 't2_f2_import_job_recovery',   'tiklash', 't.job_id in (select j.id from public.t2_f2_import_job j where j.obyekt_id = $1)', 'import tiklash hodisalari; job_id FK'),
 (360, 't2_obyekt_hujjat',            'tiklash', 't.obyekt_id = $1', 'obyekt hujjatlari ro''yxati'),
 (370, 't2_aosr',                     'tiklash', 't.obyekt_id = $1', 'AOSR'),
 (380, 't2_aosr_bog',                 'tiklash', 't.aosr_id in (select a.id from public.t2_aosr a where a.obyekt_id = $1)', 'AOSR↔qator; qator_id FK (CASCADE)'),
 (390, 't2_lab_protokol',             'tiklash', 't.obyekt_id = $1', 'laboratoriya protokollari'),
 (400, 't2_lab_protokol_bog',         'tiklash', 't.protokol_id in (select p.id from public.t2_lab_protokol p where p.obyekt_id = $1)', 'protokol↔qator; qator_id FK (CASCADE)'),
 (410, 't2_grafik_qator',             'tiklash', 't.obyekt_id = $1', 'ish grafigi'),
 (420, 't2_smeta_studio_qoralama',    'tiklash', 't.obyekt_id = $1', 'Smeta Studio qoralamasi'),
 (500, 't2_qoshimcha_ish',            'shartnoma', 't.shartnoma_id = any($2)', 'qo''shimcha ishlar (shartnoma darajasida)'),
 (510, 't2_shartnoma_ds',             'shartnoma', 't.shartnoma_id = any($2)', 'qo''shimcha kelishuvlar (DS)'),
 (520, 't2_nakrutka',                 'shartnoma', 't.shartnoma_id = any($2)', 'shartnoma nakrutkasi'),
 (530, 't2_nakrutka_koef',            'shartnoma', 't.shartnoma_id = any($2)', 'shartnoma nakrutka koeffitsientlari'),
 (900, 't2_ozgarish',                 'jurnal', 't.obyekt_id = $1', 'maydon o''zgarishlari jurnali — append-only tarix, qaytarilmaydi'),
 (910, 't2_contract_scope_event',     'jurnal', 't.obyekt_id = $1', 'shartnoma doirasi hodisalari — append-only, qaytarilmaydi');

-- Ro'yxatdagi har jadval mavjud va PK'ga ega ekanini tekshirish
do $chk$
declare r record;
begin
  for r in select jadval from snapshot.jadval_royxat loop
    if to_regclass('public.' || quote_ident(r.jadval)) is null then
      raise exception 'snapshot: jadval public.% topilmadi', r.jadval;
    end if;
    if not exists (select 1 from pg_constraint k where k.conrelid = to_regclass('public.' || quote_ident(r.jadval)) and k.contype = 'p') then
      raise exception 'snapshot: jadval public.% da PRIMARY KEY yo''q', r.jadval;
    end if;
  end loop;
end $chk$;

-- t2_ozgarish (~104k qator) da oddiy obyekt_id indeksi yo'q edi (faqat qisman) — snapshot doirasi seq scan qilmasin
create index if not exists t2_ozgarish_obyekt_id_idx on public.t2_ozgarish (obyekt_id);

-- 2. Saqlash ----------------------------------------------------------------------------------------------------------
create table snapshot.obyekt_snapshot (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null,
  obyekt_id bigint not null,           -- FK yo'q ataylab: obyekt o'chsa ham snapshot qoladi (qayta tiklash mumkin)
  olingan_vaqt timestamptz not null default now(),
  sabab text not null check (sabab in ('kunlik', 'mcp_oldi', 'restore_oldi', 'qolda')),
  izoh text,
  muallif text,
  jadvallar jsonb not null default '{}'::jsonb,   -- {jadval: {soni, xesh, bayt}}
  umumiy_xesh text not null default '',
  hajm_bayt bigint not null default 0,            -- snapshot ko'rsatgan bo'laklarning saqlangan (siqilgan) hajmi
  yangi_bayt bigint not null default 0,           -- shu snapshot bilan haqiqatan qo'shilgan yangi bo'laklar hajmi
  davomiylik_ms integer
);
create index obyekt_snapshot_obyekt_idx on snapshot.obyekt_snapshot (obyekt_id, olingan_vaqt desc);
create index obyekt_snapshot_vaqt_idx on snapshot.obyekt_snapshot (sabab, olingan_vaqt);

create table snapshot.bolak_mazmun (
  xesh text primary key,               -- sha256(jadval || ':' || qatorlar::text)
  jadval text not null,
  qator_soni integer not null,
  qatorlar jsonb not null,             -- to_jsonb(qator) massivi, PK tartibida
  yaratildi timestamptz not null default now()
);
alter table snapshot.bolak_mazmun alter column qatorlar set compression lz4;

create table snapshot.obyekt_snapshot_bolak (
  snapshot_id bigint not null references snapshot.obyekt_snapshot (id) on delete cascade,
  jadval text not null,
  bolak integer not null,
  qator_soni integer not null,
  xesh text not null references snapshot.bolak_mazmun (xesh),
  primary key (snapshot_id, jadval, bolak)
);
create index obyekt_snapshot_bolak_xesh_idx on snapshot.obyekt_snapshot_bolak (xesh);

create table snapshot.qaytarish_jurnal (
  id bigint generated always as identity primary key,
  snapshot_id bigint not null,
  oldi_snapshot_id bigint not null,
  kompaniya_id bigint not null,
  obyekt_id bigint not null,
  vaqt timestamptz not null default now(),
  muallif text,
  natija jsonb not null
);

alter table snapshot.jadval_royxat enable row level security;
alter table snapshot.obyekt_snapshot enable row level security;
alter table snapshot.bolak_mazmun enable row level security;
alter table snapshot.obyekt_snapshot_bolak enable row level security;
alter table snapshot.qaytarish_jurnal enable row level security;
revoke all on all tables in schema snapshot from public, anon, authenticated;
grant select on all tables in schema snapshot to service_role;

-- 3. Ichki yordamchilar -----------------------------------------------------------------------------------------------
-- Obyektga bog'langan shartnomalar (ikkala bog' jadvalidan)
create or replace function snapshot._shartnomalar(p_obyekt_id bigint)
returns bigint[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x.sid order by x.sid), '{}'::bigint[]) from (
    select b.shartnoma_id sid from public.t2_shartnoma_bog b where b.obyekt_id = p_obyekt_id and b.shartnoma_id is not null
    union
    select q.shartnoma_id from public.t2_shartnoma_qoshimcha_bog q where q.obyekt_id = p_obyekt_id and q.shartnoma_id is not null
  ) x
$$;

-- PK ustunlari (tartibda)
create or replace function snapshot._pk(p_jadval text)
returns text[] language sql stable security definer set search_path = '' as $$
  select array_agg(a.attname::text order by array_position(k.conkey, a.attnum))
  from pg_catalog.pg_constraint k
  join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
  where k.conrelid = ('public.' || quote_ident(p_jadval))::regclass and k.contype = 'p'
$$;

-- jsonb qatordan PK kaliti ifodasi: concat_ws('|', r->>'a', r->>'b')
create or replace function snapshot._pk_json(p_jadval text, p_r text)
returns text language sql stable security definer set search_path = '' as $$
  select 'concat_ws(''|'', ' || string_agg(format('%s->>%L', p_r, c), ', ' order by o) || ')'
  from unnest(snapshot._pk(p_jadval)) with ordinality u(c, o)
$$;

-- Jadvalning obyekt doirasidagi qatorlari: 5000 talik bo'laklar, PK tartibida, har bo'lak xeshi bilan
create or replace function snapshot._jadval_bolaklar(p_jadval text, p_obyekt_id bigint, p_sh bigint[])
returns table (o_bolak integer, o_soni integer, o_xesh text, o_qatorlar jsonb)
language plpgsql stable security definer
set search_path = '' set timezone = 'UTC' set extra_float_digits = 1 set intervalstyle = 'postgres' set work_mem = '64MB'
as $$
declare v_doira text; v_ord text;
begin
  select r.doira into v_doira from snapshot.jadval_royxat r where r.jadval = p_jadval;
  if v_doira is null then raise exception 'snapshot: jadval % ro''yxatda yo''q', p_jadval; end if;
  select string_agg(format('t.%I', c), ', ' order by o) into v_ord from unnest(snapshot._pk(p_jadval)) with ordinality u(c, o);
  return query execute format(
    $q$with z as (select to_jsonb(t) r, row_number() over (order by %s) - 1 rn from public.%I t where %s),
       b as (select (rn / 5000)::int bolak, count(*)::int n, jsonb_agg(r order by rn) arr from z group by 1)
       select bolak, n, encode(sha256(convert_to(%L || ':' || arr::text, 'UTF8')), 'hex'), arr from b order by bolak$q$,
    v_ord, p_jadval, v_doira, p_jadval)
  using p_obyekt_id, p_sh;
end $$;

-- Jadval xeshi bo'lak xeshlaridan (bo'sh jadval: sha256('jadval:'))
create or replace function snapshot._jadval_xesh(p_jadval text, p_bolak_xeshlar text[])
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_jadval || ':' || array_to_string(coalesce(p_bolak_xeshlar, '{}'), ','), 'UTF8')), 'hex')
$$;

-- 4. snapshot.ol ------------------------------------------------------------------------------------------------------
create or replace function snapshot.ol(p_obyekt_id bigint, p_sabab text default 'qolda', p_izoh text default null, p_muallif text default null)
returns bigint
language plpgsql volatile security definer
set search_path = '' set timezone = 'UTC' set extra_float_digits = 1 set intervalstyle = 'postgres' set work_mem = '64MB'
as $$
declare
  v_komp bigint; v_id bigint; v_sh bigint[]; r record; b record;
  v_meta jsonb := '{}'::jsonb; v_bx text[]; v_soni bigint; v_bayt bigint; v_jbayt bigint;
  v_yangi bigint := 0; v_jami bigint := 0; v_umumiy text := ''; v_x text; v_ins integer;
  v_t0 timestamptz := clock_timestamp();
begin
  if p_sabab is null or p_sabab not in ('kunlik', 'mcp_oldi', 'restore_oldi', 'qolda') then
    raise exception 'snapshot.ol: sabab noto''g''ri: % (kunlik|mcp_oldi|restore_oldi|qolda)', p_sabab using errcode = '22023';
  end if;
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if not found then raise exception 'snapshot.ol: obyekt % topilmadi', p_obyekt_id using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock_shared(hashtext('snapshot.tozala'));        -- tozala() bilan to'qnashmaslik
  perform pg_advisory_xact_lock(hashtext('snapshot.obyekt'), p_obyekt_id::integer);  -- bir obyektga ketma-ket

  v_sh := snapshot._shartnomalar(p_obyekt_id);
  insert into snapshot.obyekt_snapshot (kompaniya_id, obyekt_id, sabab, izoh, muallif)
  values (v_komp, p_obyekt_id, p_sabab, p_izoh, p_muallif) returning id into v_id;

  for r in select j.jadval from snapshot.jadval_royxat j order by j.tartib loop
    v_bx := '{}'; v_soni := 0; v_jbayt := 0;
    for b in select * from snapshot._jadval_bolaklar(r.jadval, p_obyekt_id, v_sh) loop
      insert into snapshot.bolak_mazmun (xesh, jadval, qator_soni, qatorlar)
      values (b.o_xesh, r.jadval, b.o_soni, b.o_qatorlar) on conflict (xesh) do nothing;
      get diagnostics v_ins = row_count;
      select pg_column_size(m.qatorlar) into v_bayt from snapshot.bolak_mazmun m where m.xesh = b.o_xesh;
      if v_ins > 0 then v_yangi := v_yangi + v_bayt; end if;
      insert into snapshot.obyekt_snapshot_bolak (snapshot_id, jadval, bolak, qator_soni, xesh)
      values (v_id, r.jadval, b.o_bolak, b.o_soni, b.o_xesh);
      v_bx := v_bx || b.o_xesh; v_soni := v_soni + b.o_soni; v_jbayt := v_jbayt + v_bayt;
    end loop;
    v_x := snapshot._jadval_xesh(r.jadval, v_bx);
    v_meta := v_meta || jsonb_build_object(r.jadval, jsonb_build_object('soni', v_soni, 'xesh', v_x, 'bayt', v_jbayt));
    v_umumiy := v_umumiy || r.jadval || '=' || v_x || ';';
    v_jami := v_jami + v_jbayt;
  end loop;

  update snapshot.obyekt_snapshot s
     set jadvallar = v_meta,
         umumiy_xesh = encode(sha256(convert_to(v_umumiy, 'UTF8')), 'hex'),
         hajm_bayt = v_jami, yangi_bayt = v_yangi,
         davomiylik_ms = (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer
   where s.id = v_id;
  return v_id;
end $$;

-- 5. snapshot.royxat --------------------------------------------------------------------------------------------------
create or replace function snapshot.royxat(p_obyekt_id bigint)
returns table (id bigint, olingan_vaqt timestamptz, sabab text, izoh text, muallif text, qator_soni bigint,
               jadval_sonlari jsonb, umumiy_xesh text, hajm_bayt bigint, yangi_bayt bigint, davomiylik_ms integer)
language sql stable security definer set search_path = '' as $$
  select s.id, s.olingan_vaqt, s.sabab, s.izoh, s.muallif,
         (select coalesce(sum((v ->> 'soni')::bigint), 0) from jsonb_each(s.jadvallar) e(k, v)),
         (select coalesce(jsonb_object_agg(k, (v ->> 'soni')::bigint) filter (where (v ->> 'soni')::bigint > 0), '{}'::jsonb) from jsonb_each(s.jadvallar) e(k, v)),
         s.umumiy_xesh, s.hajm_bayt, s.yangi_bayt, s.davomiylik_ms
  from snapshot.obyekt_snapshot s
  where s.obyekt_id = p_obyekt_id
  order by s.olingan_vaqt desc, s.id desc
$$;

-- 6. Snapshot va joriy holatni vaqtinchalik jadvallarga yuklash (farq/qaytar uchun) -----------------------------------
--   pg_temp._snap_s(jadval, pk, h, r) — snapshotdagi qatorlar; pg_temp._snap_j(jadval, pk, h) — joriy qatorlar.
create or replace function snapshot._yukla(p_snapshot_id bigint, p_obyekt_id bigint, p_sh bigint[], p_jadvallar text[])
returns void
language plpgsql volatile security definer
set search_path = '' set timezone = 'UTC' set extra_float_digits = 1 set intervalstyle = 'postgres' set work_mem = '64MB'
as $$
declare r record;
begin
  drop table if exists pg_temp._snap_s;
  drop table if exists pg_temp._snap_j;
  create temp table _snap_s (jadval text not null, pk text not null, h text not null, r jsonb not null) on commit drop;
  create temp table _snap_j (jadval text not null, pk text not null, h text not null) on commit drop;
  for r in select j.jadval, j.doira from snapshot.jadval_royxat j where j.jadval = any (p_jadvallar) order by j.tartib loop
    execute format(
      $q$insert into pg_temp._snap_s (jadval, pk, h, r)
         select %L, %s, md5(e::text), e
         from snapshot.obyekt_snapshot_bolak b
         join snapshot.bolak_mazmun m on m.xesh = b.xesh
         cross join lateral jsonb_array_elements(m.qatorlar) e
         where b.snapshot_id = $1 and b.jadval = %L$q$,
      r.jadval, snapshot._pk_json(r.jadval, 'e'), r.jadval)
    using p_snapshot_id;
    execute format(
      $q$insert into pg_temp._snap_j (jadval, pk, h)
         select %L, %s, md5(z.r::text) from (select to_jsonb(t) r from public.%I t where %s) z$q$,
      r.jadval, snapshot._pk_json(r.jadval, 'z.r'), r.jadval, r.doira)
    using p_obyekt_id, p_sh;
  end loop;
  create index on pg_temp._snap_s (jadval, h);
  create index on pg_temp._snap_s (jadval, pk);
  create index on pg_temp._snap_j (jadval, h);
  create index on pg_temp._snap_j (jadval, pk);
  analyze pg_temp._snap_s;
  analyze pg_temp._snap_j;
end $$;

-- 7. snapshot.farq ----------------------------------------------------------------------------------------------------
--   qoshilgan  = snapshotdan KEYIN paydo bo'lgan qatorlar (qaytarishda o'chadi)
--   ochirilgan = snapshotdan keyin o'chirilgan qatorlar (qaytarishda tiklanadi)
--   ozgargan   = PK bir xil, mazmun farqli
create or replace function snapshot.farq(p_snapshot_id bigint, p_obyekt_id bigint default null, p_batafsil boolean default false)
returns table (jadval text, rejim text, snapshot_soni bigint, joriy_soni bigint, qoshilgan bigint, ochirilgan bigint, ozgargan bigint, batafsil jsonb)
language plpgsql volatile security definer
set search_path = '' set timezone = 'UTC' set extra_float_digits = 1 set intervalstyle = 'postgres' set work_mem = '64MB'
as $$
#variable_conflict use_column
declare v_s snapshot.obyekt_snapshot; v_jadvallar text[];
begin
  select * into v_s from snapshot.obyekt_snapshot s where s.id = p_snapshot_id;
  if not found then raise exception 'snapshot.farq: snapshot % topilmadi', p_snapshot_id using errcode = 'P0002'; end if;
  if p_obyekt_id is not null and p_obyekt_id <> v_s.obyekt_id then
    raise exception 'snapshot.farq: snapshot % obyekt % ga tegishli, % emas', p_snapshot_id, v_s.obyekt_id, p_obyekt_id using errcode = '22023';
  end if;
  select array_agg(j.jadval order by j.tartib) into v_jadvallar from snapshot.jadval_royxat j where v_s.jadvallar ? j.jadval;
  perform snapshot._yukla(p_snapshot_id, v_s.obyekt_id,
    (select coalesce(array_agg(distinct x), '{}') from unnest(snapshot._shartnomalar(v_s.obyekt_id) || snapshot._snap_shartnomalar(p_snapshot_id)) x),
    v_jadvallar);
  return query
  with jr as (select j.jadval, j.rejim, j.tartib from snapshot.jadval_royxat j where j.jadval = any (v_jadvallar)),
  k as (
    select coalesce(s.jadval, c.jadval) jadval, s.pk spk, c.pk cpk, s.h sh, c.h ch
    from pg_temp._snap_s s full join pg_temp._snap_j c on c.jadval = s.jadval and c.pk = s.pk
  )
  select jr.jadval, jr.rejim,
    (select count(*) from pg_temp._snap_s s where s.jadval = jr.jadval),
    (select count(*) from pg_temp._snap_j c where c.jadval = jr.jadval),
    count(*) filter (where k.spk is null and k.cpk is not null),
    count(*) filter (where k.cpk is null and k.spk is not null),
    count(*) filter (where k.spk is not null and k.cpk is not null and k.sh <> k.ch),
    case when p_batafsil then jsonb_build_object(
      'qoshilgan_pk', (array_agg(k.cpk order by k.cpk) filter (where k.spk is null))[1:50],
      'ochirilgan_pk', (array_agg(k.spk order by k.spk) filter (where k.cpk is null))[1:50],
      'ozgargan_pk', (array_agg(k.spk order by k.spk) filter (where k.spk is not null and k.cpk is not null and k.sh <> k.ch))[1:50])
    end
  from jr left join k on k.jadval = jr.jadval
  group by jr.jadval, jr.rejim, jr.tartib
  order by jr.tartib;
end $$;

-- Snapshotdagi bog' jadvallaridan shartnoma id'lari
create or replace function snapshot._snap_shartnomalar(p_snapshot_id bigint)
returns bigint[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct (e ->> 'shartnoma_id')::bigint) filter (where e ->> 'shartnoma_id' is not null), '{}'::bigint[])
  from snapshot.obyekt_snapshot_bolak b
  join snapshot.bolak_mazmun m on m.xesh = b.xesh
  cross join lateral jsonb_array_elements(m.qatorlar) e
  where b.snapshot_id = p_snapshot_id and b.jadval in ('t2_shartnoma_bog', 't2_shartnoma_qoshimcha_bog')
$$;

-- 8. snapshot.qaytar --------------------------------------------------------------------------------------------------
create or replace function snapshot.qaytar(p_snapshot_id bigint, p_tasdiq text, p_muallif text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = '' set timezone = 'UTC' set extra_float_digits = 1 set intervalstyle = 'postgres' set work_mem = '64MB'
as $$
declare
  v_s snapshot.obyekt_snapshot; v_oldi bigint; v_sh bigint[]; v_eksk boolean;
  v_jadvallar text[]; v_otkaz text[]; v_komp bigint;
  r record; f record; v_del bigint; v_ins bigint; v_n bigint; v_cols text; v_srr text;
  v_natija jsonb := '{}'::jsonb; v_xato text[] := '{}'; v_x text; v_bx text[];
  v_t0 timestamptz := clock_timestamp(); v_deleted text[]; v_fk_sql text;
begin
  select * into v_s from snapshot.obyekt_snapshot s where s.id = p_snapshot_id;
  if not found then raise exception 'snapshot.qaytar: snapshot % topilmadi', p_snapshot_id using errcode = 'P0002'; end if;
  if p_tasdiq is distinct from format('QAYTAR %s', p_snapshot_id) then
    raise exception 'snapshot.qaytar: tasdiq matni noto''g''ri — «QAYTAR %» kutiladi', p_snapshot_id using errcode = '22023';
  end if;
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = v_s.obyekt_id;
  if not found then
    raise exception 'snapshot.qaytar: obyekt % hozir mavjud emas (o''chirilgan obyektni qaytarish v1 da yo''q)', v_s.obyekt_id using errcode = 'P0002';
  end if;
  if v_komp <> v_s.kompaniya_id then
    raise exception 'snapshot.qaytar: obyekt % kompaniyasi o''zgargan (% → %)', v_s.obyekt_id, v_s.kompaniya_id, v_komp using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('snapshot.obyekt'), v_s.obyekt_id::integer);

  -- (a) qaytarishning o'zi ham qaytariladigan bo'lsin
  v_oldi := snapshot.ol(v_s.obyekt_id, 'restore_oldi', format('snapshot #%s ga qaytarish oldidan', p_snapshot_id), p_muallif);

  -- (b) shartnoma darajasidagi jadvallar faqat shartnoma SHU obyektgagina tegishli bo'lsa
  select coalesce(array_agg(distinct x), '{}') into v_sh
  from unnest(snapshot._shartnomalar(v_s.obyekt_id) || snapshot._snap_shartnomalar(p_snapshot_id)) x;
  v_eksk := not exists (select 1 from public.t2_shartnoma_bog b where b.shartnoma_id = any (v_sh) and b.obyekt_id <> v_s.obyekt_id)
        and not exists (select 1 from public.t2_shartnoma_qoshimcha_bog b where b.shartnoma_id = any (v_sh) and b.obyekt_id <> v_s.obyekt_id);
  select array_agg(j.jadval order by j.tartib) into v_jadvallar from snapshot.jadval_royxat j
   where v_s.jadvallar ? j.jadval and (j.rejim = 'tiklash' or (j.rejim = 'shartnoma' and v_eksk));
  select coalesce(array_agg(j.jadval order by j.tartib), '{}') into v_otkaz from snapshot.jadval_royxat j
   where j.rejim = 'jurnal' or not (v_s.jadvallar ? j.jadval) or (j.rejim = 'shartnoma' and not v_eksk);

  perform snapshot._yukla(p_snapshot_id, v_s.obyekt_id, v_sh, v_jadvallar);

  -- (c) trigerlarsiz (qulf/lifecycle/freeze/versiya/audit/FK RI) yozish — faqat shu tranzaksiya oxirigacha
  v_srr := current_setting('session_replication_role');
  set local session_replication_role = replica;

  -- o'chirish: bolalardan ota tomon (teskari tartib) — faqat snapshotda AYNAN yo'q qatorlar
  for r in select j.jadval, j.doira from snapshot.jadval_royxat j where j.jadval = any (v_jadvallar) order by j.tartib desc loop
    execute format(
      $q$delete from public.%I t where (%s) and md5(to_jsonb(t)::text) in (
           select c.h from pg_temp._snap_j c where c.jadval = %L
           except select s.h from pg_temp._snap_s s where s.jadval = %L)$q$,
      r.jadval, r.doira, r.jadval, r.jadval)
    using v_s.obyekt_id, v_sh;
    get diagnostics v_del = row_count;
    v_natija := v_natija || jsonb_build_object(r.jadval, jsonb_build_object('ochirildi', v_del));
  end loop;

  -- yozish: otadan bola tomon — snapshotdagi, hozir aynan yo'q qatorlar, ASL id bilan, generated ustunlarsiz
  for r in select j.jadval from snapshot.jadval_royxat j where j.jadval = any (v_jadvallar) order by j.tartib loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
    from pg_catalog.pg_attribute a
    where a.attrelid = ('public.' || quote_ident(r.jadval))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
    execute format(
      $q$insert into public.%1$I (%2$s) overriding system value
         select %3$s from pg_temp._snap_s s cross join lateral jsonb_populate_record(null::public.%1$I, s.r) p
         where s.jadval = %4$L and s.h not in (select c.h from pg_temp._snap_j c where c.jadval = %4$L)$q$,
      r.jadval, v_cols, (select string_agg('p.' || x, ', ') from unnest(string_to_array(v_cols, ', ')) x), r.jadval);
    get diagnostics v_ins = row_count;
    v_natija := jsonb_set(v_natija, array[r.jadval, 'yozildi'], to_jsonb(v_ins));
  end loop;

  execute format('set local session_replication_role = %s', v_srr);

  -- (d) FK yaxlitligi: tiklangan jadvallardagi (doira ichidagi) har FK ota qatorga ega
  for f in
    select k.conrelid::regclass::text bola, k.confrelid::regclass::text ota, j.jadval, j.doira,
           (select string_agg(format('t.%I is not null', a.attname), ' and ') from pg_catalog.pg_attribute a where a.attrelid = k.conrelid and a.attnum = any (k.conkey)) nn,
           (select string_agg(format('p.%I = t.%I', pa.attname, ca.attname), ' and ')
              from unnest(k.conkey, k.confkey) u(ck, fk)
              join pg_catalog.pg_attribute ca on ca.attrelid = k.conrelid and ca.attnum = u.ck
              join pg_catalog.pg_attribute pa on pa.attrelid = k.confrelid and pa.attnum = u.fk) jn,
           k.conname
    from pg_catalog.pg_constraint k
    join snapshot.jadval_royxat j on ('public.' || quote_ident(j.jadval))::regclass = k.conrelid
    where k.contype = 'f' and j.jadval = any (v_jadvallar)
  loop
    execute format('select count(*) from public.%I t where (%s) and %s and not exists (select 1 from %s p where %s)',
                   f.jadval, f.doira, f.nn, f.ota, f.jn)
    into v_n using v_s.obyekt_id, v_sh;
    if v_n > 0 then v_xato := v_xato || format('%s: %s ta yetim qator (%s)', f.conname, v_n, f.bola); end if;
  end loop;

  -- (e) Teskari FK: butunlay o'chirilgan qatorlarga boshqa (shu jumladan boshqa obyekt/jadval) qatorlar ishora qilmasin
  for f in
    select j.jadval, k.conname, k.conrelid::regclass::text bola, ca.attname bcol, format_type(ca.atttypid, ca.atttypmod) btype
    from pg_catalog.pg_constraint k
    join snapshot.jadval_royxat j on ('public.' || quote_ident(j.jadval))::regclass = k.confrelid
    join pg_catalog.pg_attribute ca on ca.attrelid = k.conrelid and ca.attnum = k.conkey[1]
    join pg_catalog.pg_attribute pa on pa.attrelid = k.confrelid and pa.attnum = k.confkey[1]
    where k.contype = 'f' and j.jadval = any (v_jadvallar) and array_length(k.conkey, 1) = 1
      and array_length(snapshot._pk(j.jadval), 1) = 1 and pa.attname = (snapshot._pk(j.jadval))[1]
  loop
    select array_agg(c.pk) into v_deleted from pg_temp._snap_j c
     where c.jadval = f.jadval and not exists (select 1 from pg_temp._snap_s s where s.jadval = f.jadval and s.pk = c.pk);
    if v_deleted is not null then
      execute format('select count(*) from %s c where c.%I = any ($1::%s[])', f.bola, f.bcol, f.btype) into v_n using v_deleted;
      if v_n > 0 then v_xato := v_xato || format('%s: %s ta qator o''chirilgan %s qatoriga ishora qiladi (%s)', f.conname, v_n, f.jadval, f.bola); end if;
    end if;
  end loop;

  if array_length(v_xato, 1) > 0 then
    raise exception 'snapshot.qaytar: FK yaxlitligi buziladi, hech narsa o''zgarmadi: %', array_to_string(v_xato, '; ') using errcode = '23503';
  end if;

  -- (f) Isbot: har tiklangan jadval xeshi snapshotdagiga teng
  for r in select j.jadval from snapshot.jadval_royxat j where j.jadval = any (v_jadvallar) order by j.tartib loop
    select array_agg(b.o_xesh order by b.o_bolak) into v_bx from snapshot._jadval_bolaklar(r.jadval, v_s.obyekt_id, v_sh) b;
    v_x := snapshot._jadval_xesh(r.jadval, v_bx);
    if v_x <> (v_s.jadvallar -> r.jadval ->> 'xesh') then
      v_xato := v_xato || r.jadval;
    end if;
  end loop;
  if array_length(v_xato, 1) > 0 then
    raise exception 'snapshot.qaytar: qaytarilgan holat xeshi snapshotga teng emas: %', array_to_string(v_xato, ', ') using errcode = 'XX000';
  end if;

  v_natija := jsonb_build_object(
    'snapshot_id', p_snapshot_id, 'obyekt_id', v_s.obyekt_id, 'oldi_snapshot_id', v_oldi,
    'jadvallar', v_natija, 'otkazildi', to_jsonb(v_otkaz), 'shartnoma_eksklyuziv', v_eksk,
    'davomiylik_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer);
  insert into snapshot.qaytarish_jurnal (snapshot_id, oldi_snapshot_id, kompaniya_id, obyekt_id, muallif, natija)
  values (p_snapshot_id, v_oldi, v_s.kompaniya_id, v_s.obyekt_id, p_muallif, v_natija);
  return v_natija;
end $$;

-- 9. snapshot.tozala --------------------------------------------------------------------------------------------------
--   kunlik — 90 kun, boshqalar — 30 kun; har obyektning ENG OXIRGI snapshoti hech qachon o'chirilmaydi.
create or replace function snapshot.tozala()
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_s bigint; v_b bigint;
begin
  perform pg_advisory_xact_lock(hashtext('snapshot.tozala'));
  delete from snapshot.obyekt_snapshot s
   where ((s.sabab = 'kunlik' and s.olingan_vaqt < now() - interval '90 days')
       or (s.sabab <> 'kunlik' and s.olingan_vaqt < now() - interval '30 days'))
     and s.id <> (select max(x.id) from snapshot.obyekt_snapshot x where x.obyekt_id = s.obyekt_id);
  get diagnostics v_s = row_count;
  delete from snapshot.bolak_mazmun m where not exists (select 1 from snapshot.obyekt_snapshot_bolak b where b.xesh = m.xesh);
  get diagnostics v_b = row_count;
  return jsonb_build_object('snapshot_ochirildi', v_s, 'bolak_ochirildi', v_b);
end $$;

-- 10. snapshot.kunlik — barcha faol obyektlar; oxirgi 'kunlik' bilan bir xil bo'lsa yangi snapshot qoldirilmaydi -------
create or replace function snapshot.kunlik()
returns jsonb
language plpgsql volatile security definer set search_path = '' set work_mem = '64MB' as $$
declare o record; v_id bigint; v_yangi text; v_old text; v_olindi int := 0; v_ozgarmagan int := 0; v_xato int := 0;
begin
  for o in select ob.id from public.t2_obyekt ob where ob.holat = 'faol' order by ob.id loop
    begin
      v_id := snapshot.ol(o.id, 'kunlik', null, 'cron');
      select s.umumiy_xesh into v_yangi from snapshot.obyekt_snapshot s where s.id = v_id;
      select s.umumiy_xesh into v_old from snapshot.obyekt_snapshot s
       where s.obyekt_id = o.id and s.sabab = 'kunlik' and s.id < v_id order by s.id desc limit 1;
      if v_old is not null and v_old = v_yangi then
        delete from snapshot.obyekt_snapshot s where s.id = v_id;   -- bo'laklar baribir oldingisi bilan umumiy
        v_ozgarmagan := v_ozgarmagan + 1;
      else
        v_olindi := v_olindi + 1;
      end if;
    exception when others then
      v_xato := v_xato + 1;
      raise warning 'snapshot.kunlik: obyekt % — %', o.id, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('olindi', v_olindi, 'ozgarmagan', v_ozgarmagan, 'xato', v_xato, 'tozala', snapshot.tozala());
end $$;

-- 11. Huquqlar: faqat service_role/postgres -------------------------------------------------------------------------
revoke all on all functions in schema snapshot from public, anon, authenticated;
grant execute on function snapshot.ol(bigint, text, text, text) to service_role;
grant execute on function snapshot.royxat(bigint) to service_role;
grant execute on function snapshot.farq(bigint, bigint, boolean) to service_role;
grant execute on function snapshot.qaytar(bigint, text, text) to service_role;
grant execute on function snapshot.tozala() to service_role;
grant execute on function snapshot.kunlik() to service_role;
alter default privileges in schema snapshot revoke execute on functions from public;

-- 12. Kunlik autosave: 02:00 Toshkent = 21:00 UTC (pg_cron Supabase'da mavjud, lekin hali yoqilmagan edi) -------------
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
    if exists (select 1 from cron.job where jobname = 't2-obyekt-snapshot-kunlik') then
      perform cron.unschedule('t2-obyekt-snapshot-kunlik');
    end if;
    perform cron.schedule('t2-obyekt-snapshot-kunlik', '0 21 * * *', 'select snapshot.kunlik()');
  else
    raise warning 'pg_cron mavjud emas — kunlik autosave uchun tashqi scheduler snapshot.kunlik() ni chaqirishi kerak';
  end if;
end $cron$;

commit;
