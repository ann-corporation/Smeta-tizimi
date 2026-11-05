-- Rollback 20261203001200_t2_desktop_boshqaruv_v1. Restores the 20261202000000_t2_desktop_auth_v1 credential RPC
-- bodies (hardcoded cap 10, no policy) and removes the admin layer. Refuses to destroy admin audit history.
do $$ begin
  if to_regclass('public.t2_desktop_audit') is not null and exists(select 1 from public.t2_desktop_audit) then
    raise exception 'DESKTOP_BOSHQARUV_ROLLBACK_NONEMPTY: audit history exists; use a reviewed forward migration';
  end if;
end $$;

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
revoke all on function public.t2_desktop_qurilma_yarat_v1(bigint,uuid,text,bigint,uuid) from public,anon,authenticated;
revoke all on function public.t2_desktop_qurilma_tekshir_v1(text) from public,anon,authenticated;
grant execute on function public.t2_desktop_qurilma_yarat_v1(bigint,uuid,text,bigint,uuid) to service_role;
grant execute on function public.t2_desktop_qurilma_tekshir_v1(text) to service_role;

drop function if exists public.t2_desktop_yangilanish_v1(bigint);
drop function if exists public.t2_desktop_siyosat_saqla_v1(bigint,bigint,text,jsonb,text,integer,uuid);
drop function if exists public.t2_desktop_boshqaruv_buyruq_v1(bigint,text,bigint,uuid,bigint,bigint,text,uuid);
drop function if exists public.t2_desktop_boshqaruv_v1(bigint,bigint);
drop function if exists public.t2_desktop_admin_rol(bigint,bigint);
drop function if exists public.t2_desktop_lease_chegara_v2(bigint,uuid,bigint,integer);
drop function if exists public.t2_desktop_qurilma_tekshir_v2(text,text);
drop function if exists public.t2_desktop_qurilma_yarat_v2(bigint,uuid,text,bigint,uuid,text,text,text);
drop function if exists public.t2_desktop_siyosat_v1(bigint,bigint);
drop function if exists public.t2_desktop_versiya_eski(text,text);
drop function if exists public.t2_desktop_versiya_kalit(text);
drop table if exists public.t2_desktop_audit;
drop table if exists public.t2_desktop_siyosat;
alter table public.t2_desktop_qurilma drop constraint if exists t2_desktop_qurilma_meta_chk;
alter table public.t2_desktop_qurilma
  drop column if exists qurilma_nomi, drop column if exists os, drop column if exists ilova_versiya,
  drop column if exists bekor_sabab, drop column if exists bekor_qildi, drop column if exists oxirgi_lease,
  drop column if exists oxirgi_lease_kompaniya_id, drop column if exists oxirgi_lease_obyekt_soni,
  drop column if exists oxirgi_lease_tugaydi;
