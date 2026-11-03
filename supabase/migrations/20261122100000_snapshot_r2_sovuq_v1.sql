-- 20261122100000 — SAQLASH DIETASI (R2): snapshot.bolak_mazmun sovuq mazmuni R2 ga (egasi qoidasi: katta/o'zgarmas ma'lumot R2 da,
-- bazada faqat kalit + sha256 + metadata). Supabase Free = 500 MB, baza 421 MB; snapshot.bolak_mazmun = 89 MB (jsonb TOAST).
--
-- XAVFSIZLIK TARTIBI (ma'lumot yo'qolmaydi):
--   1) ops/scripts/snapshot-r2-sovut.mjs bloklarni R2 ga gzip qilib yozadi, R2 dan QAYTA O'QIB sha256 ni solishtiradi;
--   2) snapshot.sovuq_yoz   — ko'rsatkichni yozadi (bazada mazmun hali joyida; DB o'zi qatorlar::text sha256 ni tekshiradi);
--   3) snapshot.sovuq_tasdiq — skript R2 dan qayta o'qib tasdiqlagach;
--   4) snapshot.sovuq_sovut — mazmunni NULL qiladi, FAQAT r2_tasdiqlangan bor va qatorlar::text sha256 = r2_sha256 bo'lsa.
--   CHECK: qatorlar NULL bo'lsa, tasdiqlangan R2 ko'rsatkichi majburiy — ko'rsatkichsiz NULL mumkin emas.
--   Qaytarish: snapshot.sovuq_tikla (R2 dan olingan matn sha256 va blok xeshi bilan tekshiriladi, keyin joyiga yoziladi).
--   snapshot._yukla (farq/qaytar) sovuq blok bo'lsa ANIQ xato beradi (jimgina bo'sh qator o'qimaydi) — MCP avval tiklaydi.
-- O'zgartiriladigan mavjud funksiyalar (rollback faylida asl matni bor): snapshot.ol (bayt hisobi NULL ga chidamli),
-- snapshot._yukla (sovuq tekshiruv), snapshot.tozala (o'chirilgan ko'rsatkichlar snapshot.r2_yetim ga yoziladi).
-- Qo'shimcha: public.t2_db_hajm_v1 — superadmin uchun baza hajmi va eng katta jadvallar (80% / 90% ogohlantirish).
-- SIZ QO'LLAMAYSIZ: bu fayl faqat tayyorlangan. Siqilgan joy VACUUM FULL snapshot.bolak_mazmun dan keyin bo'shaydi (README skriptda).
begin;

-- ───────── 1. Ko'rsatkich ustunlari (mazmun NULL bo'lishi mumkin) ─────────
alter table snapshot.bolak_mazmun
  add column if not exists r2_key          text,
  add column if not exists r2_sha256       text,
  add column if not exists r2_bayt         bigint,
  add column if not exists bayt            bigint,
  add column if not exists r2_tasdiqlangan timestamptz,
  add column if not exists sovutildi       timestamptz;
alter table snapshot.bolak_mazmun alter column qatorlar drop not null;

alter table snapshot.bolak_mazmun drop constraint if exists bolak_mazmun_r2_shakl;
alter table snapshot.bolak_mazmun add constraint bolak_mazmun_r2_shakl
  check (r2_sha256 is null or r2_sha256 ~ '^[0-9a-f]{64}$');
alter table snapshot.bolak_mazmun drop constraint if exists bolak_mazmun_mazmun_yoki_r2;
alter table snapshot.bolak_mazmun add constraint bolak_mazmun_mazmun_yoki_r2
  check (qatorlar is not null or (r2_key is not null and r2_sha256 is not null and r2_tasdiqlangan is not null));

comment on column snapshot.bolak_mazmun.r2_key is 'R2 (smeta-tizimi-canonical) kaliti: snapshot-cold/v1/<sha[0:2]>/<sha256>.json.gz (gzip(qatorlar::text)).';
comment on column snapshot.bolak_mazmun.r2_sha256 is 'sha256 (hex) gzip OLDIDAN matn baytlari: convert_to(qatorlar::text, ''UTF8'').';
comment on column snapshot.bolak_mazmun.bayt is 'Sovutishdan oldingi pg_column_size(qatorlar) — snapshot.ol hajm hisobi uchun.';
comment on column snapshot.bolak_mazmun.qatorlar is 'NULL = mazmun R2 da (r2_key/r2_sha256, tasdiqlangan). Tiklash: snapshot.sovuq_tikla.';

-- O'chirilgan bloklarning R2 obyektlari (tozala) — yetim ro'yxati; R2 dan o'chirish qo'lda/alohida.
create table if not exists snapshot.r2_yetim (
  r2_key     text primary key,
  r2_sha256  text not null,
  r2_bayt    bigint,
  vaqt       timestamptz not null default now()
);
alter table snapshot.r2_yetim enable row level security;
revoke all on snapshot.r2_yetim from public, anon, authenticated;
grant select on snapshot.r2_yetim to service_role;

-- ───────── 2. Sovutish funksiyalari (faqat service_role) ─────────
-- Nomzodlar: barcha ularga ishora qiluvchi snapshotlar p_kun kundan eski; (standart) obyektning ENG SO'NGGI snapshoti bloklari
-- issiq qoladi. Eng katta bloklar birinchi.
create or replace function snapshot.sovuq_nomzod(p_kun integer default 3, p_limit integer default 200, p_songgi_ham boolean default false)
returns table (xesh text, jadval text, qator_soni integer, bayt bigint)
language plpgsql stable security definer set search_path to '' as $$
begin
  if p_kun is null or p_kun < 1 then raise exception 'snapshot.sovuq_nomzod: p_kun >= 1 bo''lishi kerak' using errcode = '22023'; end if;
  return query
    select m.xesh, m.jadval, m.qator_soni, pg_column_size(m.qatorlar)::bigint
      from snapshot.bolak_mazmun m
     where m.qatorlar is not null
       and not exists (
         select 1 from snapshot.obyekt_snapshot_bolak b
           join snapshot.obyekt_snapshot s on s.id = b.snapshot_id
          where b.xesh = m.xesh
            and (s.olingan_vaqt >= now() - make_interval(days => p_kun)
                 or (not coalesce(p_songgi_ham, false)
                     and s.id = (select max(x.id) from snapshot.obyekt_snapshot x where x.obyekt_id = s.obyekt_id))))
     order by pg_column_size(m.qatorlar) desc, m.xesh
     limit greatest(1, least(coalesce(p_limit, 200), 5000));
end $$;

-- Mazmun matni (skript o'qiydi): qatorlar::text — sha256 va R2 obyekti aynan shu baytlardan.
create or replace function snapshot.sovuq_oqi(p_xesh text)
returns table (jadval text, qator_soni integer, matn text, bayt bigint)
language sql stable security definer set search_path to '' as $$
  select m.jadval, m.qator_soni, m.qatorlar::text, pg_column_size(m.qatorlar)::bigint
    from snapshot.bolak_mazmun m where m.xesh = p_xesh and m.qatorlar is not null
$$;

-- 2a. Ko'rsatkichni yozadi (mazmun joyida). Bazadagi matn sha256 si p_sha256 ga teng bo'lishi shart.
create or replace function snapshot.sovuq_yoz(p_xesh text, p_r2_key text, p_sha256 text, p_r2_bayt bigint)
returns void language plpgsql security definer set search_path to '' as $$
declare m snapshot.bolak_mazmun;
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'snapshot.sovuq_yoz: sha256 noto''g''ri' using errcode = '22023'; end if;
  if p_r2_key is null or p_r2_key !~ '^snapshot-cold/v1/[0-9a-f]{2}/[0-9a-f]{64}\.json\.gz$' or p_r2_key not like '%/' || p_sha256 || '.json.gz' then
    raise exception 'snapshot.sovuq_yoz: r2_key shakli noto''g''ri yoki sha256 ga mos emas' using errcode = '22023';
  end if;
  select * into m from snapshot.bolak_mazmun x where x.xesh = p_xesh for update;
  if not found then raise exception 'snapshot.sovuq_yoz: blok % topilmadi', p_xesh using errcode = 'P0002'; end if;
  if m.qatorlar is null then
    if m.r2_sha256 is distinct from p_sha256 then raise exception 'snapshot.sovuq_yoz: blok % allaqachon boshqa sha256 bilan sovutilgan', p_xesh using errcode = '23514'; end if;
    return;
  end if;
  if encode(sha256(convert_to(m.qatorlar::text, 'UTF8')), 'hex') <> p_sha256 then
    raise exception 'snapshot.sovuq_yoz: blok % mazmuni sha256 ga mos emas (R2 ga boshqa bayt yozilgan)', p_xesh using errcode = '23514';
  end if;
  if m.r2_sha256 is distinct from p_sha256 then
    update snapshot.bolak_mazmun x set r2_key = p_r2_key, r2_sha256 = p_sha256, r2_bayt = p_r2_bayt, r2_tasdiqlangan = null,
           bayt = coalesce(x.bayt, pg_column_size(x.qatorlar))
     where x.xesh = p_xesh;
  end if;
end $$;

-- 2b. Skript R2 dan qayta o'qib sha256 ni solishtirgach tasdiqlaydi.
create or replace function snapshot.sovuq_tasdiq(p_xesh text, p_sha256 text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  update snapshot.bolak_mazmun x set r2_tasdiqlangan = coalesce(x.r2_tasdiqlangan, now())
   where x.xesh = p_xesh and x.r2_sha256 = p_sha256 and x.r2_key is not null;
  if not found then raise exception 'snapshot.sovuq_tasdiq: blok % uchun ko''rsatkich yo''q yoki sha256 mos emas', p_xesh using errcode = 'P0002'; end if;
end $$;

-- 2c. Mazmunni NULL qiladi — faqat tasdiqlangan va bazadagi matn sha256 = R2 sha256 bo'lsa. Qaytaradi: bo'shagan bayt.
create or replace function snapshot.sovuq_sovut(p_xesh text, p_sha256 text)
returns bigint language plpgsql security definer set search_path to '' as $$
declare m snapshot.bolak_mazmun; v_bayt bigint;
begin
  select * into m from snapshot.bolak_mazmun x where x.xesh = p_xesh for update;
  if not found then raise exception 'snapshot.sovuq_sovut: blok % topilmadi', p_xesh using errcode = 'P0002'; end if;
  if m.qatorlar is null then return 0; end if;
  if m.r2_tasdiqlangan is null or m.r2_key is null or m.r2_sha256 is distinct from p_sha256 then
    raise exception 'snapshot.sovuq_sovut: blok % R2 da tasdiqlanmagan — NULL qilinmaydi', p_xesh using errcode = '23514';
  end if;
  if encode(sha256(convert_to(m.qatorlar::text, 'UTF8')), 'hex') <> m.r2_sha256 then
    raise exception 'snapshot.sovuq_sovut: blok % joriy mazmuni R2 nusxasiga teng emas', p_xesh using errcode = '23514';
  end if;
  v_bayt := pg_column_size(m.qatorlar);
  update snapshot.bolak_mazmun x set qatorlar = null, sovutildi = now() where x.xesh = p_xesh;
  return v_bayt;
end $$;

-- 2d. Qaytarish: R2 dan olingan matn bazaga yoziladi — sha256 VA blok xeshi (jadval ':' qatorlar::text) tekshiriladi.
create or replace function snapshot.sovuq_tikla(p_xesh text, p_matn text, p_sha256 text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare m snapshot.bolak_mazmun; v jsonb;
begin
  select * into m from snapshot.bolak_mazmun x where x.xesh = p_xesh for update;
  if not found then raise exception 'snapshot.sovuq_tikla: blok % topilmadi', p_xesh using errcode = 'P0002'; end if;
  if m.qatorlar is not null then return false; end if;
  if m.r2_sha256 is distinct from p_sha256 then raise exception 'snapshot.sovuq_tikla: sha256 ko''rsatkichga mos emas (%)', p_xesh using errcode = '23514'; end if;
  if encode(sha256(convert_to(p_matn, 'UTF8')), 'hex') <> p_sha256 then raise exception 'snapshot.sovuq_tikla: R2 matni sha256 ga mos emas (%)', p_xesh using errcode = '23514'; end if;
  v := p_matn::jsonb;
  if encode(sha256(convert_to(m.jadval || ':' || v::text, 'UTF8')), 'hex') <> p_xesh then
    raise exception 'snapshot.sovuq_tikla: R2 matni blok xeshiga mos emas (%)', p_xesh using errcode = '23514';
  end if;
  update snapshot.bolak_mazmun x set qatorlar = v, sovutildi = null where x.xesh = p_xesh;
  return true;
end $$;

-- Snapshotning sovuq (NULL mazmunli) bloklari — MCP farq/qaytar oldidan tiklaydi.
create or replace function snapshot.sovuq_bolaklar(p_snapshot_id bigint)
returns table (xesh text, jadval text, r2_key text, r2_sha256 text, r2_bayt bigint)
language sql stable security definer set search_path to '' as $$
  select distinct m.xesh, m.jadval, m.r2_key, m.r2_sha256, m.r2_bayt
    from snapshot.obyekt_snapshot_bolak b join snapshot.bolak_mazmun m on m.xesh = b.xesh
   where b.snapshot_id = p_snapshot_id and m.qatorlar is null
$$;

-- Hisobot: issiq (bazada) va sovuq (R2) bloklar.
create or replace function snapshot.sovuq_statistika()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'issiq_blok', count(*) filter (where qatorlar is not null),
    'issiq_bayt', coalesce(sum(pg_column_size(qatorlar)), 0),
    'sovuq_blok', count(*) filter (where qatorlar is null),
    'sovuq_bayt', coalesce(sum(bayt) filter (where qatorlar is null), 0),
    'r2_bayt', coalesce(sum(r2_bayt) filter (where r2_key is not null), 0))
  from snapshot.bolak_mazmun
$$;

-- Yagona tekshiruv: sovuq blok bo'lsa jimgina bo'sh o'qimaydi.
create or replace function snapshot._sovuq_tekshir(p_snapshot_id bigint)
returns void language plpgsql stable security definer set search_path to '' as $$
declare v_n bigint;
begin
  select count(distinct b.xesh) into v_n from snapshot.obyekt_snapshot_bolak b join snapshot.bolak_mazmun m on m.xesh = b.xesh
   where b.snapshot_id = p_snapshot_id and m.qatorlar is null;
  if v_n > 0 then
    raise exception 'snapshot #%: % ta blok R2 da (sovuq) — avval snapshot.sovuq_tikla bilan tiklang (MCP buni avtomatik qiladi)', p_snapshot_id, v_n using errcode = '55000';
  end if;
end $$;

revoke all on function snapshot.sovuq_nomzod(integer, integer, boolean), snapshot.sovuq_oqi(text), snapshot.sovuq_yoz(text, text, text, bigint),
  snapshot.sovuq_tasdiq(text, text), snapshot.sovuq_sovut(text, text), snapshot.sovuq_tikla(text, text, text), snapshot.sovuq_bolaklar(bigint),
  snapshot.sovuq_statistika(), snapshot._sovuq_tekshir(bigint) from public, anon, authenticated;
grant execute on function snapshot.sovuq_nomzod(integer, integer, boolean), snapshot.sovuq_oqi(text), snapshot.sovuq_yoz(text, text, text, bigint),
  snapshot.sovuq_tasdiq(text, text), snapshot.sovuq_sovut(text, text), snapshot.sovuq_tikla(text, text, text), snapshot.sovuq_bolaklar(bigint),
  snapshot.sovuq_statistika() to service_role;

-- ───────── 3. Mavjud funksiyalar (asl matn rollback faylida) ─────────
-- _yukla: boshida sovuq tekshiruv (qolgani aynan asl nusxa).
create or replace function snapshot._yukla(p_snapshot_id bigint, p_obyekt_id bigint, p_sh bigint[], p_jadvallar text[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
 set "TimeZone" to 'UTC'
 set extra_float_digits to '1'
 set "IntervalStyle" to 'postgres'
 set work_mem to '64MB'
as $function$
declare r record;
begin
  perform snapshot._sovuq_tekshir(p_snapshot_id);
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
end $function$;

-- ol: bayt hisobi sovuq (NULL) blokka chidamli — faqat shu bitta qator o'zgargan (coalesce(..., m.bayt, 0)).
create or replace function snapshot.ol(p_obyekt_id bigint, p_sabab text default 'qolda'::text, p_izoh text default null::text, p_muallif text default null::text)
 returns bigint
 language plpgsql
 security definer
 set search_path to ''
 set "TimeZone" to 'UTC'
 set extra_float_digits to '1'
 set "IntervalStyle" to 'postgres'
 set work_mem to '64MB'
as $function$
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

  perform pg_advisory_xact_lock_shared(hashtext('snapshot.tozala'));
  perform pg_advisory_xact_lock(hashtext('snapshot.obyekt'), p_obyekt_id::integer);

  v_sh := snapshot._shartnomalar(p_obyekt_id);
  insert into snapshot.obyekt_snapshot (kompaniya_id, obyekt_id, sabab, izoh, muallif)
  values (v_komp, p_obyekt_id, p_sabab, p_izoh, p_muallif) returning id into v_id;

  for r in select j.jadval from snapshot.jadval_royxat j order by j.tartib loop
    v_bx := '{}'; v_soni := 0; v_jbayt := 0;
    for b in select * from snapshot._jadval_bolaklar(r.jadval, p_obyekt_id, v_sh) loop
      insert into snapshot.bolak_mazmun (xesh, jadval, qator_soni, qatorlar)
      values (b.o_xesh, r.jadval, b.o_soni, b.o_qatorlar) on conflict (xesh) do nothing;
      get diagnostics v_ins = row_count;
      select coalesce(pg_column_size(m.qatorlar), m.bayt, 0) into v_bayt from snapshot.bolak_mazmun m where m.xesh = b.o_xesh;
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
end $function$;

-- tozala: o'chirilgan bloklarning R2 ko'rsatkichlari snapshot.r2_yetim ga yoziladi (R2 obyekti yetim qoladi, yo'qolmaydi).
create or replace function snapshot.tozala()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_s bigint; v_b bigint;
begin
  perform pg_advisory_xact_lock(hashtext('snapshot.tozala'));
  delete from snapshot.obyekt_snapshot s
   where ((s.sabab = 'kunlik' and s.olingan_vaqt < now() - interval '90 days')
       or (s.sabab <> 'kunlik' and s.olingan_vaqt < now() - interval '30 days'))
     and s.id <> (select max(x.id) from snapshot.obyekt_snapshot x where x.obyekt_id = s.obyekt_id);
  get diagnostics v_s = row_count;
  with d as (
    delete from snapshot.bolak_mazmun m where not exists (select 1 from snapshot.obyekt_snapshot_bolak b where b.xesh = m.xesh)
    returning m.r2_key, m.r2_sha256, m.r2_bayt
  ), y as (
    insert into snapshot.r2_yetim (r2_key, r2_sha256, r2_bayt)
    select d.r2_key, d.r2_sha256, d.r2_bayt from d where d.r2_key is not null
    on conflict (r2_key) do nothing
    returning 1
  )
  select count(*) into v_b from d;
  return jsonb_build_object('snapshot_ochirildi', v_s, 'bolak_ochirildi', v_b);
end $function$;

-- ───────── 4. Monitoring: baza hajmi (superadmin) ─────────
create or replace function public.t2_db_hajm_v1(p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare r jsonb;
begin
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'SUPERADMIN_REQUIRED'); end if;
  select jsonb_build_object('ok', true,
    'db_bytes', pg_database_size(current_database()),
    'top', coalesce((select jsonb_agg(jsonb_build_object('sxema', x.nspname, 'jadval', x.relname, 'bytes', x.tot, 'qator', x.q) order by x.tot desc)
                       from (select n.nspname, c.relname, pg_total_relation_size(c.oid) tot, greatest(c.reltuples, 0)::bigint q
                               from pg_class c join pg_namespace n on n.oid = c.relnamespace
                              where c.relkind = 'r' and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
                              order by pg_total_relation_size(c.oid) desc limit 10) x), '[]'::jsonb),
    'snapshot_sovuq', snapshot.sovuq_statistika())
    into r;
  return r;
end $function$;
revoke all on function public.t2_db_hajm_v1(bigint) from public, anon, authenticated;
grant execute on function public.t2_db_hajm_v1(bigint) to service_role;

commit;
