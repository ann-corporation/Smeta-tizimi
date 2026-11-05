-- 20261203001200_t2_desktop_boshqaruv_v1 — Windows desktop: «Tizim nazorati» admin control.
-- File only: L0 tests and applies. Depends on 20261202000000_t2_desktop_auth_v1 (already on prod).
--
-- AUTH-SENSITIVE (security review): this migration changes the bodies of the desktop credential RPCs
-- t2_desktop_qurilma_yarat_v1 / t2_desktop_qurilma_tekshir_v1 (signatures unchanged, now thin wrappers over _v2)
-- so the policy below is enforced SERVER-SIDE for every enroll/verify, including callers still on the old code.
--
-- Policy resolution (t2_desktop_siyosat_v1):
--   * global row (kompaniya_id NULL, manba 'platforma') — superadmin only; yoqilgan=false is the master kill switch;
--   * per-company 'platforma' row — superadmin override (replaces the global value for that company; cannot undo the kill switch);
--   * per-company 'kompaniya' row — company boss/admin self-restriction (can only make things stricter).
--   User level (enroll/verify; device belongs to a user, not a company): enabled = global AND (no company OR any
--   enabled company); cap/lease = the strictest of the user's enabled companies; min version = the highest.
--   Lease level (one company): that company's effective values.
-- Credential hashes never leave the DB; admin read model has no token_hash.

-- 1. Device metadata (nullable: old clients send nothing) + revocation provenance + last lease trace.
alter table public.t2_desktop_qurilma add column if not exists qurilma_nomi text;
alter table public.t2_desktop_qurilma add column if not exists os text;
alter table public.t2_desktop_qurilma add column if not exists ilova_versiya text;
alter table public.t2_desktop_qurilma add column if not exists bekor_sabab text;
alter table public.t2_desktop_qurilma add column if not exists bekor_qildi bigint;
alter table public.t2_desktop_qurilma add column if not exists oxirgi_lease timestamptz;
alter table public.t2_desktop_qurilma add column if not exists oxirgi_lease_kompaniya_id bigint;
alter table public.t2_desktop_qurilma add column if not exists oxirgi_lease_obyekt_soni integer;
alter table public.t2_desktop_qurilma add column if not exists oxirgi_lease_tugaydi bigint;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.t2_desktop_qurilma'::regclass and conname='t2_desktop_qurilma_meta_chk') then
    alter table public.t2_desktop_qurilma add constraint t2_desktop_qurilma_meta_chk check (
      (qurilma_nomi is null or length(qurilma_nomi) between 1 and 120) and (os is null or length(os) between 1 and 60)
      and (ilova_versiya is null or ilova_versiya ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$')
      and (bekor_sabab is null or length(bekor_sabab) <= 500) and (oxirgi_lease_obyekt_soni is null or oxirgi_lease_obyekt_soni between 0 and 100));
  end if;
end $$;

-- 2. Policy.
create table if not exists public.t2_desktop_siyosat (
  id bigint generated always as identity primary key,
  kompaniya_id bigint references public.t2_kompaniya(id) on delete cascade,
  manba text not null check (manba in ('platforma','kompaniya')),
  yoqilgan boolean,
  max_qurilma integer check (max_qurilma between 1 and 100),
  -- Lease cap stays within the signed-lease contract maximum (LEASE_MAX_MS = 72 h): shorten only.
  lease_soat integer check (lease_soat between 1 and 72),
  oflayn boolean,
  min_versiya text check (min_versiya ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$'),
  joriy_versiya text check (joriy_versiya ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$'),
  yuklab_olish_url text check (length(yuklab_olish_url) <= 500 and yuklab_olish_url ~ '^https://[^[:space:]<>"''`]{4,}$'),
  yangilanish_izoh text check (length(yangilanish_izoh) <= 500),
  versiya integer not null default 1 check (versiya > 0),
  yangilandi timestamptz not null default clock_timestamp(),
  yangiladi bigint,
  check (kompaniya_id is not null or manba = 'platforma'),
  check (kompaniya_id is null or (joriy_versiya is null and yuklab_olish_url is null and yangilanish_izoh is null))
);
create unique index if not exists t2_desktop_siyosat_kalit on public.t2_desktop_siyosat ((coalesce(kompaniya_id,0)), manba);
insert into public.t2_desktop_siyosat(kompaniya_id,manba,yoqilgan,max_qurilma,lease_soat,oflayn)
  select null,'platforma',true,10,72,true
  where not exists(select 1 from public.t2_desktop_siyosat where kompaniya_id is null and manba='platforma');
alter table public.t2_desktop_siyosat enable row level security;
revoke all on public.t2_desktop_siyosat from public, anon, authenticated, service_role;
grant select, insert, update on public.t2_desktop_siyosat to service_role;

-- 3. Audit (global actions have no company, so the per-company t2_audit_yoz is not usable for all rows).
create table if not exists public.t2_desktop_audit (
  id bigint generated always as identity primary key,
  vaqt timestamptz not null default clock_timestamp(),
  actor_id bigint not null,
  kompaniya_id bigint,
  amal text not null check (amal in ('bekor','foydalanuvchi_bekor','muddat','siyosat')),
  device_id uuid,
  nishon_foydalanuvchi_id bigint,
  sabab text not null check (length(btrim(sabab)) between 3 and 500),
  meta jsonb not null default '{}'::jsonb,
  operation_id uuid not null,
  unique (actor_id, operation_id)
);
create index if not exists t2_desktop_audit_kompaniya on public.t2_desktop_audit (kompaniya_id, vaqt desc);
alter table public.t2_desktop_audit enable row level security;
revoke all on public.t2_desktop_audit from public, anon, authenticated, service_role;
grant select, insert on public.t2_desktop_audit to service_role;

-- 4. Helpers.
create or replace function public.t2_desktop_versiya_kalit(p text)
returns integer[] language sql immutable set search_path = public, pg_temp as $$
  select case when p ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$' then string_to_array(p,'.')::integer[] end;
$$;

create or replace function public.t2_desktop_siyosat_v1(p_foydalanuvchi_id bigint, p_kompaniya_id bigint default null)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  g public.t2_desktop_siyosat%rowtype;
  v_n integer; v_on boolean; v_max integer; v_lease integer; v_off boolean; v_min text;
begin
  select * into g from public.t2_desktop_siyosat where kompaniya_id is null and manba='platforma';
  with c as (
    select k.id from public.t2_kompaniya k where p_kompaniya_id is not null and k.id=p_kompaniya_id
    union
    select a.kompaniya_id from public.t2_azolik a join public.t2_kompaniya k on k.id=a.kompaniya_id and k.faol
      where p_kompaniya_id is null and a.foydalanuvchi_id=p_foydalanuvchi_id and a.holat='faol'
  ), e as (
    select c.id,
      coalesce(p.yoqilgan,true) and coalesce(s.yoqilgan,true) as yoq,
      least(coalesce(p.max_qurilma,g.max_qurilma,10), coalesce(s.max_qurilma,100)) as mx,
      least(coalesce(p.lease_soat,g.lease_soat,72), coalesce(s.lease_soat,72)) as ls,
      coalesce(p.oflayn,g.oflayn,true) and coalesce(s.oflayn,true) as ofl,
      (select v from unnest(array[coalesce(p.min_versiya,g.min_versiya), s.min_versiya]) v
        where v is not null order by public.t2_desktop_versiya_kalit(v) desc limit 1) as mv
    from c
    left join public.t2_desktop_siyosat p on p.kompaniya_id=c.id and p.manba='platforma'
    left join public.t2_desktop_siyosat s on s.kompaniya_id=c.id and s.manba='kompaniya'
  )
  select count(*)::integer, bool_or(yoq), min(mx) filter (where yoq), min(ls) filter (where yoq),
    bool_or(ofl) filter (where yoq),
    (array_agg(mv order by public.t2_desktop_versiya_kalit(mv) desc nulls last) filter (where yoq and mv is not null))[1]
    into v_n, v_on, v_max, v_lease, v_off, v_min
  from e;
  v_on := coalesce(g.yoqilgan,true) and (v_n = 0 or coalesce(v_on,false));
  return jsonb_build_object(
    'yoqilgan', v_on,
    'max_qurilma', coalesce(v_max, g.max_qurilma, 10),
    'lease_soat', coalesce(v_lease, g.lease_soat, 72),
    'oflayn', coalesce(v_off, coalesce(g.oflayn,true)),
    'min_versiya', case when v_n = 0 then g.min_versiya else coalesce(v_min, g.min_versiya) end,
    'kompaniyalar', v_n);
end $$;

create or replace function public.t2_desktop_versiya_eski(p_versiya text, p_min text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p_min is not null and (public.t2_desktop_versiya_kalit(p_versiya) is null
    or public.t2_desktop_versiya_kalit(p_versiya) < public.t2_desktop_versiya_kalit(p_min));
$$;

-- 5. Credential RPCs (policy enforced). _v1 signatures kept as wrappers for callers on the old code.
create or replace function public.t2_desktop_qurilma_yarat_v2(
  p_actor_id bigint, p_device_id uuid, p_token_hash text, p_sessiya_exp bigint, p_operation_id uuid,
  p_qurilma_nomi text, p_os text, p_ilova_versiya text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_device uuid; v_pol jsonb;
  v_nom text := nullif(left(btrim(regexp_replace(coalesce(p_qurilma_nomi,''),'[[:cntrl:]]','','g')),120),'');
  v_os text := nullif(left(btrim(regexp_replace(coalesce(p_os,''),'[[:cntrl:]]','','g')),60),'');
  v_ver text := case when p_ilova_versiya ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$' then p_ilova_versiya end;
begin
  if p_actor_id is null or p_device_id is null or p_operation_id is null or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$' or p_sessiya_exp is null
    or p_sessiya_exp <= v_now or p_sessiya_exp > v_now + 7776000000 then
    return jsonb_build_object('ok',false,'code','DEVICE_INVALID');
  end if;
  -- Match roleAuthority's original-cookie iat and 2s revocation tolerance.
  if not exists (select 1 from public.t2_foydalanuvchi f where f.id=p_actor_id and f.holat='faol'
    and (f.sessiya_bekor_dan is null or p_sessiya_exp - 7776000000 + 2000 >= extract(epoch from f.sessiya_bekor_dan)*1000)) then
    return jsonb_build_object('ok',false,'code','ACTOR_INVALID');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('desktop-device:'||p_actor_id::text,0));
  if exists(select 1 from public.t2_desktop_qurilma where foydalanuvchi_id=p_actor_id and operation_id=p_operation_id) then
    return jsonb_build_object('ok',false,'code','OPERATION_ALREADY_USED');
  end if;
  v_pol := public.t2_desktop_siyosat_v1(p_actor_id);
  if (v_pol->>'yoqilgan')::boolean is not true then
    return jsonb_build_object('ok',false,'code','DESKTOP_DISABLED');
  end if;
  if public.t2_desktop_versiya_eski(v_ver, v_pol->>'min_versiya') then
    return jsonb_build_object('ok',false,'code','DESKTOP_UPDATE_REQUIRED','min_versiya',v_pol->>'min_versiya');
  end if;
  if (select count(*) from public.t2_desktop_qurilma where foydalanuvchi_id=p_actor_id and bekor is null and tugaydi>v_now)
    >= (v_pol->>'max_qurilma')::integer then
    return jsonb_build_object('ok',false,'code','DEVICE_LIMIT','max_qurilma',(v_pol->>'max_qurilma')::integer);
  end if;
  insert into public.t2_desktop_qurilma(device_id,foydalanuvchi_id,token_hash,tugaydi,sessiya_exp,operation_id,qurilma_nomi,os,ilova_versiya)
    values(p_device_id,p_actor_id,p_token_hash,p_sessiya_exp,p_sessiya_exp,p_operation_id,v_nom,v_os,v_ver)
    on conflict (foydalanuvchi_id,operation_id) do nothing returning device_id into v_device;
  if v_device is null then return jsonb_build_object('ok',false,'code','OPERATION_ALREADY_USED'); end if;
  return jsonb_build_object('ok',true,'device_id',v_device,'tugaydi',p_sessiya_exp);
end $$;

create or replace function public.t2_desktop_qurilma_yarat_v1(
  p_actor_id bigint, p_device_id uuid, p_token_hash text, p_sessiya_exp bigint, p_operation_id uuid
) returns jsonb language sql security invoker set search_path = public, pg_temp as $$
  select public.t2_desktop_qurilma_yarat_v2(p_actor_id,p_device_id,p_token_hash,p_sessiya_exp,p_operation_id,null,null,null);
$$;

create or replace function public.t2_desktop_qurilma_tekshir_v2(p_token_hash text, p_ilova_versiya text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v public.t2_desktop_qurilma%rowtype; v_pol jsonb; v_ver text; v_code text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok',false); end if;
  select d.* into v from public.t2_desktop_qurilma d
    where d.token_hash=p_token_hash and d.bekor is null
      and d.tugaydi > extract(epoch from clock_timestamp())*1000
      and exists (select 1 from public.t2_foydalanuvchi f where f.id=d.foydalanuvchi_id and f.holat='faol'
        and (f.sessiya_bekor_dan is null or d.sessiya_exp - 7776000000 + 2000 >= extract(epoch from f.sessiya_bekor_dan)*1000));
  if not found then return jsonb_build_object('ok',false); end if;
  v_ver := case when p_ilova_versiya ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$' then p_ilova_versiya else v.ilova_versiya end;
  v_pol := public.t2_desktop_siyosat_v1(v.foydalanuvchi_id);
  if (v_pol->>'yoqilgan')::boolean is not true then v_code := 'DESKTOP_DISABLED';
  elsif public.t2_desktop_versiya_eski(v_ver, v_pol->>'min_versiya') then v_code := 'DESKTOP_UPDATE_REQUIRED';
  end if;
  if v_code is not null then
    -- The client drops its credential on 401; retire it server-side too so it never occupies a device slot.
    update public.t2_desktop_qurilma set versiya=versiya+1, bekor=clock_timestamp(), bekor_sabab=v_code,
      bekor_operation_id=coalesce(bekor_operation_id,gen_random_uuid())
      where device_id=v.device_id and bekor is null;
    return jsonb_build_object('ok',false,'code',v_code,'min_versiya',v_pol->>'min_versiya');
  end if;
  -- Atomic validation/touch: never cache a bearer lookup, including revocation.
  update public.t2_desktop_qurilma d set oxirgi_kirish=clock_timestamp(), ilova_versiya=v_ver
    where d.device_id=v.device_id and d.token_hash=p_token_hash and d.bekor is null
      and d.tugaydi > extract(epoch from clock_timestamp())*1000
    returning d.* into v;
  if not found then return jsonb_build_object('ok',false); end if;
  return jsonb_build_object('ok',true,'device_id',v.device_id,'foydalanuvchi_id',v.foydalanuvchi_id,
    'tugaydi',v.tugaydi,'sessiya_exp',v.sessiya_exp,'versiya',v.versiya);
end $$;

create or replace function public.t2_desktop_qurilma_tekshir_v1(p_token_hash text)
returns jsonb language sql security invoker set search_path = public, pg_temp as $$
  select public.t2_desktop_qurilma_tekshir_v2(p_token_hash, null);
$$;

-- Lease: company-level policy (disabled / offline off / shorter lease) + the v1 rate limit + last-lease trace.
create or replace function public.t2_desktop_lease_chegara_v2(p_actor_id bigint, p_device_id uuid, p_kompaniya_id bigint, p_obyekt_soni integer)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_pol jsonb; v_tug bigint; v_device uuid;
begin
  if p_kompaniya_id is null or p_obyekt_soni is null or p_obyekt_soni not between 1 and 100 then
    return jsonb_build_object('ok',false,'code','SCOPE_INVALID');
  end if;
  if not exists(select 1 from public.t2_desktop_qurilma where device_id=p_device_id and foydalanuvchi_id=p_actor_id
    and bekor is null and tugaydi>v_now) then
    return jsonb_build_object('ok',false,'code','DEVICE_AUTH_REQUIRED');
  end if;
  v_pol := public.t2_desktop_siyosat_v1(p_actor_id, p_kompaniya_id);
  if (v_pol->>'yoqilgan')::boolean is not true then return jsonb_build_object('ok',false,'code','DESKTOP_DISABLED'); end if;
  if (v_pol->>'oflayn')::boolean is not true then return jsonb_build_object('ok',false,'code','DESKTOP_OFFLINE_DISABLED'); end if;
  update public.t2_desktop_qurilma set
    lease_soni=case when lease_oyna is null or lease_oyna < clock_timestamp()-interval '1 minute' then 1 else lease_soni+1 end,
    lease_oyna=case when lease_oyna is null or lease_oyna < clock_timestamp()-interval '1 minute' then clock_timestamp() else lease_oyna end,
    oxirgi_lease=clock_timestamp(), oxirgi_lease_kompaniya_id=p_kompaniya_id, oxirgi_lease_obyekt_soni=p_obyekt_soni,
    oxirgi_lease_tugaydi=least(v_now + (v_pol->>'lease_soat')::bigint*3600000, tugaydi, sessiya_exp)
    where device_id=p_device_id and foydalanuvchi_id=p_actor_id and bekor is null and tugaydi>v_now
      and (lease_oyna is null or lease_oyna<clock_timestamp()-interval '1 minute' or lease_soni<30)
    returning device_id, oxirgi_lease_tugaydi into v_device, v_tug;
  if v_device is null then return jsonb_build_object('ok',false,'code','LEASE_RATE_LIMIT'); end if;
  return jsonb_build_object('ok',true,'lease_ms',(v_pol->>'lease_soat')::bigint*3600000,'tugaydi',v_tug);
end $$;

-- 6. Admin authorization: platform superadmin (all) or active company boss/admin (own company only).
create or replace function public.t2_desktop_admin_rol(p_actor_id bigint, p_kompaniya_id bigint)
returns text language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if p_actor_id is null or not exists(select 1 from public.t2_foydalanuvchi where id=p_actor_id and holat='faol') then return null; end if;
  if public.t2_platforma_superadmin(p_actor_id) then return 'superadmin'; end if;
  if p_kompaniya_id is not null and exists(select 1 from public.t2_azolik a join public.t2_kompaniya k on k.id=a.kompaniya_id and k.faol
    where a.foydalanuvchi_id=p_actor_id and a.kompaniya_id=p_kompaniya_id and a.holat='faol' and a.rol in ('boss','admin')) then
    return 'kompaniya';
  end if;
  return null;
end $$;

create or replace function public.t2_desktop_boshqaruv_v1(p_actor_id bigint, p_kompaniya_id bigint default null)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_rol text := public.t2_desktop_admin_rol(p_actor_id, p_kompaniya_id);
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_kun timestamptz := date_trunc('day', clock_timestamp() at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent';
  v_q jsonb; v_audit jsonb; v_siyosat jsonb; v_umumiy jsonb;
begin
  if v_rol is null or (p_kompaniya_id is null and v_rol <> 'superadmin') then
    return jsonb_build_object('ok',false,'code','AUTHORIZATION_DENIED');
  end if;
  with d as (
    select d.*, f.ism, f.login from public.t2_desktop_qurilma d join public.t2_foydalanuvchi f on f.id=d.foydalanuvchi_id
    where p_kompaniya_id is null or exists(select 1 from public.t2_azolik a where a.foydalanuvchi_id=d.foydalanuvchi_id
      and a.kompaniya_id=p_kompaniya_id and a.holat='faol')
      -- A company boss never sees (or acts on) a platform superadmin's devices.
      and (v_rol='superadmin' or not public.t2_platforma_superadmin(d.foydalanuvchi_id))
    order by d.yaratildi desc limit 2000
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'device_id',d.device_id,'foydalanuvchi_id',d.foydalanuvchi_id,'ism',d.ism,'login',d.login,
      'qurilma_nomi',d.qurilma_nomi,'os',d.os,'ilova_versiya',d.ilova_versiya,
      'yaratildi',d.yaratildi,'oxirgi_kirish',d.oxirgi_kirish,'tugaydi',d.tugaydi,'sessiya_exp',d.sessiya_exp,
      'bekor',d.bekor,'bekor_sabab',d.bekor_sabab,
      'holat',case when d.bekor is not null then 'bekor' when d.tugaydi<=v_now then 'muddati_otgan' else 'faol' end,
      -- Lease trace only for the company being viewed (a boss never learns another company's activity).
      'oxirgi_lease',case when p_kompaniya_id is null or d.oxirgi_lease_kompaniya_id=p_kompaniya_id then d.oxirgi_lease end,
      'oxirgi_lease_kompaniya_id',case when p_kompaniya_id is null or d.oxirgi_lease_kompaniya_id=p_kompaniya_id then d.oxirgi_lease_kompaniya_id end,
      'oxirgi_lease_obyekt_soni',case when p_kompaniya_id is null or d.oxirgi_lease_kompaniya_id=p_kompaniya_id then d.oxirgi_lease_obyekt_soni end,
      'lease_faol',d.bekor is null and coalesce(d.oxirgi_lease_tugaydi,0)>v_now and (p_kompaniya_id is null or d.oxirgi_lease_kompaniya_id=p_kompaniya_id),
      'kompaniyalar',(select coalesce(jsonb_agg(jsonb_build_object('id',k.id,'nom',k.nom) order by k.nom),'[]'::jsonb)
        from public.t2_azolik a join public.t2_kompaniya k on k.id=a.kompaniya_id
        where a.foydalanuvchi_id=d.foydalanuvchi_id and a.holat='faol' and (p_kompaniya_id is null or a.kompaniya_id=p_kompaniya_id))
    ) order by d.yaratildi desc),'[]'::jsonb) into v_q
  from d;
  select jsonb_build_object(
      'faol', count(*) filter (where e->>'holat'='faol'),
      'oxirgi_24s', count(*) filter (where (e->>'oxirgi_kirish')::timestamptz > clock_timestamp()-interval '24 hours'),
      'bugun_bekor', count(*) filter (where (e->>'bekor')::timestamptz >= v_kun),
      'lease_faol', count(*) filter (where (e->>'lease_faol')::boolean),
      'kompaniyalar', (select count(distinct (k->>'id')) from jsonb_array_elements(v_q) x, jsonb_array_elements(x->'kompaniyalar') k
        where x->>'holat'='faol'))
    into v_umumiy from jsonb_array_elements(v_q) e;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'kompaniya_id',s.kompaniya_id,'kompaniya_nom',k.nom,'manba',s.manba,
      'yoqilgan',s.yoqilgan,'max_qurilma',s.max_qurilma,'lease_soat',s.lease_soat,'oflayn',s.oflayn,'min_versiya',s.min_versiya,
      'joriy_versiya',s.joriy_versiya,'yuklab_olish_url',s.yuklab_olish_url,'yangilanish_izoh',s.yangilanish_izoh,
      'versiya',s.versiya,'yangilandi',s.yangilandi) order by s.kompaniya_id nulls first, s.manba),'[]'::jsonb)
    into v_siyosat
  from public.t2_desktop_siyosat s left join public.t2_kompaniya k on k.id=s.kompaniya_id
  where s.kompaniya_id is null or (p_kompaniya_id is null and v_rol='superadmin') or s.kompaniya_id=p_kompaniya_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'vaqt',x.vaqt,'actor_id',x.actor_id,'actor_ism',f.ism,'kompaniya_id',x.kompaniya_id,
      'amal',x.amal,'device_id',x.device_id,'nishon_foydalanuvchi_id',x.nishon_foydalanuvchi_id,'sabab',x.sabab,'meta',x.meta) order by x.vaqt desc),'[]'::jsonb)
    into v_audit
  from (select * from public.t2_desktop_audit a where p_kompaniya_id is null or a.kompaniya_id=p_kompaniya_id order by a.vaqt desc limit 200) x
  left join public.t2_foydalanuvchi f on f.id=x.actor_id;
  return jsonb_build_object('ok',true,'rol',v_rol,'kompaniya_id',p_kompaniya_id,'umumiy',v_umumiy,'qurilmalar',v_q,
    'siyosat',v_siyosat,
    'samarali',case when p_kompaniya_id is not null then public.t2_desktop_siyosat_v1(null, p_kompaniya_id) end,
    'audit',v_audit);
end $$;

create or replace function public.t2_desktop_boshqaruv_buyruq_v1(
  p_actor_id bigint, p_amal text, p_kompaniya_id bigint, p_device_id uuid, p_foydalanuvchi_id bigint,
  p_tugaydi bigint, p_sabab text, p_operation_id uuid
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_rol text := public.t2_desktop_admin_rol(p_actor_id, p_kompaniya_id);
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_sabab text := btrim(coalesce(p_sabab,''));
  v_target bigint; d public.t2_desktop_qurilma%rowtype; v_n integer; v_meta jsonb := '{}'::jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  if p_amal is null or p_amal not in ('bekor','foydalanuvchi_bekor','muddat') then return jsonb_build_object('ok',false,'code','ACTION_INVALID'); end if;
  if length(v_sabab) < 3 or length(v_sabab) > 500 then return jsonb_build_object('ok',false,'code','SABAB_REQUIRED'); end if;
  if v_rol is null or (v_rol <> 'superadmin' and p_kompaniya_id is null) then return jsonb_build_object('ok',false,'code','AUTHORIZATION_DENIED'); end if;
  if p_amal = 'muddat' and v_rol <> 'superadmin' then return jsonb_build_object('ok',false,'code','SUPERADMIN_REQUIRED'); end if;
  perform pg_advisory_xact_lock(hashtextextended('desktop-admin:'||p_actor_id::text||':'||p_operation_id::text,0));
  if exists(select 1 from public.t2_desktop_audit where actor_id=p_actor_id and operation_id=p_operation_id) then
    return jsonb_build_object('ok',true,'takror',true);
  end if;
  if p_amal = 'foydalanuvchi_bekor' then
    v_target := p_foydalanuvchi_id;
  else
    select * into d from public.t2_desktop_qurilma where device_id=p_device_id;
    if not found then return jsonb_build_object('ok',false,'code','DEVICE_NOT_FOUND'); end if;
    v_target := d.foydalanuvchi_id;
  end if;
  if v_target is null or not exists(select 1 from public.t2_foydalanuvchi where id=v_target) then
    return jsonb_build_object('ok',false,'code','TARGET_NOT_FOUND');
  end if;
  if v_rol <> 'superadmin' then
    -- Tenant isolation: a company boss/admin acts only on active members of the company they administer,
    -- and never on a platform superadmin.
    if not exists(select 1 from public.t2_azolik where foydalanuvchi_id=v_target and kompaniya_id=p_kompaniya_id and holat='faol') then
      return jsonb_build_object('ok',false,'code','TENANT_FORBIDDEN');
    end if;
    if public.t2_platforma_superadmin(v_target) then return jsonb_build_object('ok',false,'code','AUTHORIZATION_DENIED'); end if;
  end if;
  if p_amal = 'bekor' then
    update public.t2_desktop_qurilma set versiya=case when bekor is null then versiya+1 else versiya end,
      bekor_operation_id=coalesce(bekor_operation_id,p_operation_id), bekor=coalesce(bekor,clock_timestamp()),
      bekor_sabab=coalesce(bekor_sabab,left(v_sabab,500)), bekor_qildi=coalesce(bekor_qildi,p_actor_id)
      where device_id=d.device_id;
    v_n := 1;
  elsif p_amal = 'foydalanuvchi_bekor' then
    update public.t2_desktop_qurilma set versiya=versiya+1, bekor_operation_id=p_operation_id, bekor=clock_timestamp(),
      bekor_sabab=left(v_sabab,500), bekor_qildi=p_actor_id
      where foydalanuvchi_id=v_target and bekor is null;
    get diagnostics v_n = row_count;
  else
    if d.bekor is not null then return jsonb_build_object('ok',false,'code','DEVICE_REVOKED'); end if;
    -- Never beyond the enrolling web session's expiry (table check tugaydi <= sessiya_exp).
    if p_tugaydi is null or p_tugaydi < v_now + 60000 or p_tugaydi > d.sessiya_exp then
      return jsonb_build_object('ok',false,'code','EXPIRY_INVALID','max',d.sessiya_exp);
    end if;
    update public.t2_desktop_qurilma set tugaydi=p_tugaydi, versiya=versiya+1 where device_id=d.device_id;
    v_meta := jsonb_build_object('oldingi_tugaydi',d.tugaydi,'yangi_tugaydi',p_tugaydi);
    v_n := 1;
  end if;
  insert into public.t2_desktop_audit(actor_id,kompaniya_id,amal,device_id,nishon_foydalanuvchi_id,sabab,meta,operation_id)
    values(p_actor_id,p_kompaniya_id,p_amal,case when p_amal='foydalanuvchi_bekor' then null else d.device_id end,v_target,v_sabab,
      v_meta || jsonb_build_object('soni',v_n,'rol',v_rol),p_operation_id);
  return jsonb_build_object('ok',true,'soni',v_n);
end $$;

create or replace function public.t2_desktop_siyosat_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_manba text, p_qiymat jsonb, p_sabab text, p_expected_versiya integer, p_operation_id uuid
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_rol text := public.t2_desktop_admin_rol(p_actor_id, p_kompaniya_id);
  v_sabab text := btrim(coalesce(p_sabab,''));
  v_ruxsat text[] := case when p_kompaniya_id is null
    then array['yoqilgan','max_qurilma','lease_soat','oflayn','min_versiya','joriy_versiya','yuklab_olish_url','yangilanish_izoh']
    else array['yoqilgan','max_qurilma','lease_soat','oflayn','min_versiya'] end;
  v_old public.t2_desktop_siyosat%rowtype; v_new public.t2_desktop_siyosat%rowtype; k text;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  if p_manba is null or p_manba not in ('platforma','kompaniya') or (p_manba='kompaniya' and p_kompaniya_id is null) then
    return jsonb_build_object('ok',false,'code','POLICY_SCOPE_INVALID');
  end if;
  if length(v_sabab) < 3 or length(v_sabab) > 500 then return jsonb_build_object('ok',false,'code','SABAB_REQUIRED'); end if;
  -- Global and per-company platform overrides: superadmin only. Company self-restriction: boss/admin of that company.
  if v_rol is null or (p_manba='platforma' and v_rol <> 'superadmin') then
    return jsonb_build_object('ok',false,'code','AUTHORIZATION_DENIED');
  end if;
  if p_kompaniya_id is not null and not exists(select 1 from public.t2_kompaniya where id=p_kompaniya_id) then
    return jsonb_build_object('ok',false,'code','COMPANY_NOT_FOUND');
  end if;
  if p_qiymat is null or jsonb_typeof(p_qiymat) <> 'object' then return jsonb_build_object('ok',false,'code','POLICY_FIELD_INVALID'); end if;
  for k in select jsonb_object_keys(p_qiymat) loop
    if not (k = any(v_ruxsat)) then return jsonb_build_object('ok',false,'code','POLICY_FIELD_INVALID','maydon',k); end if;
  end loop;
  if (p_qiymat ? 'yoqilgan' and jsonb_typeof(p_qiymat->'yoqilgan') not in ('boolean','null'))
    or (p_qiymat ? 'oflayn' and jsonb_typeof(p_qiymat->'oflayn') not in ('boolean','null'))
    or (p_qiymat ? 'max_qurilma' and jsonb_typeof(p_qiymat->'max_qurilma') not in ('number','null'))
    or (p_qiymat ? 'lease_soat' and jsonb_typeof(p_qiymat->'lease_soat') not in ('number','null')) then
    return jsonb_build_object('ok',false,'code','POLICY_VALUE_INVALID');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('desktop-siyosat:'||coalesce(p_kompaniya_id,0)::text||':'||p_manba,0));
  if exists(select 1 from public.t2_desktop_audit where actor_id=p_actor_id and operation_id=p_operation_id) then
    return jsonb_build_object('ok',true,'takror',true);
  end if;
  select * into v_old from public.t2_desktop_siyosat where coalesce(kompaniya_id,0)=coalesce(p_kompaniya_id,0) and manba=p_manba;
  if found and p_expected_versiya is not null and p_expected_versiya <> v_old.versiya then
    return jsonb_build_object('ok',false,'code','STALE_VERSION','versiya',v_old.versiya);
  end if;
  begin
    if v_old.id is null then
      insert into public.t2_desktop_siyosat(kompaniya_id,manba,yoqilgan,max_qurilma,lease_soat,oflayn,min_versiya,joriy_versiya,yuklab_olish_url,yangilanish_izoh,yangiladi)
      values(p_kompaniya_id,p_manba,(p_qiymat->>'yoqilgan')::boolean,(p_qiymat->>'max_qurilma')::integer,(p_qiymat->>'lease_soat')::integer,
        (p_qiymat->>'oflayn')::boolean,nullif(p_qiymat->>'min_versiya',''),nullif(p_qiymat->>'joriy_versiya',''),
        nullif(p_qiymat->>'yuklab_olish_url',''),nullif(btrim(p_qiymat->>'yangilanish_izoh'),''),p_actor_id)
      returning * into v_new;
    else
      update public.t2_desktop_siyosat set yoqilgan=(p_qiymat->>'yoqilgan')::boolean, max_qurilma=(p_qiymat->>'max_qurilma')::integer,
        lease_soat=(p_qiymat->>'lease_soat')::integer, oflayn=(p_qiymat->>'oflayn')::boolean, min_versiya=nullif(p_qiymat->>'min_versiya',''),
        joriy_versiya=nullif(p_qiymat->>'joriy_versiya',''), yuklab_olish_url=nullif(p_qiymat->>'yuklab_olish_url',''),
        yangilanish_izoh=nullif(btrim(p_qiymat->>'yangilanish_izoh'),''),
        versiya=versiya+1, yangilandi=clock_timestamp(), yangiladi=p_actor_id
      where id=v_old.id returning * into v_new;
    end if;
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('ok',false,'code','POLICY_VALUE_INVALID');
  end;
  insert into public.t2_desktop_audit(actor_id,kompaniya_id,amal,sabab,meta,operation_id)
    values(p_actor_id,p_kompaniya_id,'siyosat',v_sabab,jsonb_build_object('manba',p_manba,'rol',v_rol,
      'oldingi',case when v_old.id is null then null else to_jsonb(v_old) - array['id','yangilandi','yangiladi'] end,
      'yangi',to_jsonb(v_new) - array['id','yangilandi','yangiladi']),p_operation_id);
  return jsonb_build_object('ok',true,'versiya',v_new.versiya);
end $$;

-- Any signed-in user: effective availability + installer info for the download/help card.
create or replace function public.t2_desktop_yangilanish_v1(p_actor_id bigint)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare g public.t2_desktop_siyosat%rowtype; v_pol jsonb;
begin
  if p_actor_id is null or not exists(select 1 from public.t2_foydalanuvchi where id=p_actor_id and holat='faol') then
    return jsonb_build_object('ok',false,'code','AUTH_REQUIRED');
  end if;
  select * into g from public.t2_desktop_siyosat where kompaniya_id is null and manba='platforma';
  v_pol := public.t2_desktop_siyosat_v1(p_actor_id);
  return jsonb_build_object('ok',true,'yoqilgan',v_pol->'yoqilgan','min_versiya',v_pol->'min_versiya',
    'joriy_versiya',g.joriy_versiya,'yuklab_olish_url',g.yuklab_olish_url,'yangilanish_izoh',g.yangilanish_izoh,
    'faol_qurilmalar',(select count(*) from public.t2_desktop_qurilma where foydalanuvchi_id=p_actor_id and bekor is null
      and tugaydi>extract(epoch from clock_timestamp())*1000),
    'max_qurilma',v_pol->'max_qurilma');
end $$;

-- 7. Grants: service_role only (BFF passes the session actor; never callable by anon/authenticated).
do $$ declare f text; begin
  foreach f in array array[
    'public.t2_desktop_versiya_kalit(text)','public.t2_desktop_versiya_eski(text,text)',
    'public.t2_desktop_siyosat_v1(bigint,bigint)',
    'public.t2_desktop_qurilma_yarat_v2(bigint,uuid,text,bigint,uuid,text,text,text)',
    'public.t2_desktop_qurilma_yarat_v1(bigint,uuid,text,bigint,uuid)',
    'public.t2_desktop_qurilma_tekshir_v2(text,text)','public.t2_desktop_qurilma_tekshir_v1(text)',
    'public.t2_desktop_lease_chegara_v2(bigint,uuid,bigint,integer)',
    'public.t2_desktop_admin_rol(bigint,bigint)','public.t2_desktop_boshqaruv_v1(bigint,bigint)',
    'public.t2_desktop_boshqaruv_buyruq_v1(bigint,text,bigint,uuid,bigint,bigint,text,uuid)',
    'public.t2_desktop_siyosat_saqla_v1(bigint,bigint,text,jsonb,text,integer,uuid)',
    'public.t2_desktop_yangilanish_v1(bigint)']
  loop
    execute 'revoke all on function '||f||' from public, anon, authenticated';
    execute 'grant execute on function '||f||' to service_role';
  end loop;
end $$;
