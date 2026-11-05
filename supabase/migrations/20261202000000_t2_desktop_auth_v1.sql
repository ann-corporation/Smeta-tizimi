-- ADR-DESKTOP-AUTH. File only: no production apply authorized.
-- Credential hashes/actor identity only; no caller roles, permissions or raw bearer.
create table if not exists public.t2_desktop_qurilma (
  device_id uuid primary key,
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  yaratildi timestamptz not null default clock_timestamp(),
  oxirgi_kirish timestamptz,
  tugaydi bigint not null,
  sessiya_exp bigint not null,
  bekor timestamptz,
  versiya integer not null default 1 check (versiya > 0),
  operation_id uuid not null,
  bekor_operation_id uuid,
  unique (foydalanuvchi_id, operation_id),
  check (tugaydi <= sessiya_exp)
);
alter table public.t2_desktop_qurilma add column if not exists lease_oyna timestamptz;
alter table public.t2_desktop_qurilma add column if not exists lease_soni integer not null default 0;
do $$ begin
  if exists(select 1 from pg_constraint where conrelid='public.t2_desktop_qurilma'::regclass
    and conname='t2_desktop_qurilma_foydalanuvchi_id_fkey' and confdeltype <> 'c') then
    alter table public.t2_desktop_qurilma drop constraint t2_desktop_qurilma_foydalanuvchi_id_fkey;
    alter table public.t2_desktop_qurilma add constraint t2_desktop_qurilma_foydalanuvchi_id_fkey
      foreign key(foydalanuvchi_id) references public.t2_foydalanuvchi(id) on delete cascade;
  end if;
end $$;
alter table public.t2_desktop_qurilma enable row level security;
revoke all on public.t2_desktop_qurilma from public, anon, authenticated, service_role;
grant select, insert, update on public.t2_desktop_qurilma to service_role;

create or replace function public.t2_desktop_qurilma_yarat_v1(
  p_actor_id bigint, p_device_id uuid, p_token_hash text, p_sessiya_exp bigint, p_operation_id uuid
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_device uuid;
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
  if (select count(*) from public.t2_desktop_qurilma where foydalanuvchi_id=p_actor_id and bekor is null and tugaydi>v_now) >= 10 then
    return jsonb_build_object('ok',false,'code','DEVICE_LIMIT');
  end if;
  insert into public.t2_desktop_qurilma(device_id,foydalanuvchi_id,token_hash,tugaydi,sessiya_exp,operation_id)
    values(p_device_id,p_actor_id,p_token_hash,p_sessiya_exp,p_sessiya_exp,p_operation_id)
    on conflict (foydalanuvchi_id,operation_id) do nothing returning device_id into v_device;
  if v_device is null then return jsonb_build_object('ok',false,'code','OPERATION_ALREADY_USED'); end if;
  return jsonb_build_object('ok',true,'device_id',v_device,'tugaydi',p_sessiya_exp);
end $$;

create or replace function public.t2_desktop_qurilma_tekshir_v1(p_token_hash text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.t2_desktop_qurilma%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok',false); end if;
  -- Atomic validation/touch: never cache a bearer lookup, including revocation.
  update public.t2_desktop_qurilma d set oxirgi_kirish=clock_timestamp()
    where d.token_hash=p_token_hash and d.bekor is null
      and d.tugaydi > extract(epoch from clock_timestamp())*1000
      and exists (select 1 from public.t2_foydalanuvchi f where f.id=d.foydalanuvchi_id and f.holat='faol'
        and (f.sessiya_bekor_dan is null or d.sessiya_exp - 7776000000 + 2000 >= extract(epoch from f.sessiya_bekor_dan)*1000))
    returning d.* into v;
  if not found then return jsonb_build_object('ok',false); end if;
  return jsonb_build_object('ok',true,'device_id',v.device_id,'foydalanuvchi_id',v.foydalanuvchi_id,
    'tugaydi',v.tugaydi,'sessiya_exp',v.sessiya_exp,'versiya',v.versiya);
end $$;

create or replace function public.t2_desktop_qurilma_bekor_v1(p_actor_id bigint,p_device_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_device uuid;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false); end if;
  update public.t2_desktop_qurilma set
    versiya=case when bekor is null then versiya+1 else versiya end,
    bekor_operation_id=coalesce(bekor_operation_id,p_operation_id),bekor=coalesce(bekor,clock_timestamp())
    where device_id=p_device_id and foydalanuvchi_id=p_actor_id returning device_id into v_device;
  return jsonb_build_object('ok',v_device is not null);
end $$;

create or replace function public.t2_desktop_lease_chegara_v1(p_actor_id bigint,p_device_id uuid)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_device uuid;
begin
  update public.t2_desktop_qurilma set
    lease_soni=case when lease_oyna is null or lease_oyna < clock_timestamp()-interval '1 minute' then 1 else lease_soni+1 end,
    lease_oyna=case when lease_oyna is null or lease_oyna < clock_timestamp()-interval '1 minute' then clock_timestamp() else lease_oyna end
    where device_id=p_device_id and foydalanuvchi_id=p_actor_id and bekor is null
      and tugaydi>extract(epoch from clock_timestamp())*1000
      and (lease_oyna is null or lease_oyna<clock_timestamp()-interval '1 minute' or lease_soni<30)
    returning device_id into v_device;
  if v_device is not null then return jsonb_build_object('ok',true); end if;
  if not exists(select 1 from public.t2_desktop_qurilma where device_id=p_device_id and foydalanuvchi_id=p_actor_id
    and bekor is null and tugaydi>extract(epoch from clock_timestamp())*1000) then
    return jsonb_build_object('ok',false,'code','DEVICE_AUTH_REQUIRED');
  end if;
  return jsonb_build_object('ok',false,'code','LEASE_RATE_LIMIT');
end $$;
revoke all on function public.t2_desktop_lease_chegara_v1(bigint,uuid) from public,anon,authenticated;
grant execute on function public.t2_desktop_lease_chegara_v1(bigint,uuid) to service_role;

revoke all on function public.t2_desktop_qurilma_yarat_v1(bigint,uuid,text,bigint,uuid) from public,anon,authenticated;
revoke all on function public.t2_desktop_qurilma_tekshir_v1(text) from public,anon,authenticated;
revoke all on function public.t2_desktop_qurilma_bekor_v1(bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.t2_desktop_qurilma_yarat_v1(bigint,uuid,text,bigint,uuid) to service_role;
grant execute on function public.t2_desktop_qurilma_tekshir_v1(text) to service_role;
grant execute on function public.t2_desktop_qurilma_bekor_v1(bigint,uuid,uuid) to service_role;
