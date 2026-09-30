-- T2-SMETA-IMPORT-DUPLICATE-GUARD-001
--
-- Suniy Ko'l / eski importlarda bir xil LRV yoki ichki RES ikki marta ish
-- qatori bo'lib kirib qolmasligi uchun server-side preflight va poyga himoyasi.
-- Bu migration hech qanday mavjud qatorni o'chirmaydi yoki birlashtirmaydi.
-- Eski ma'lumotlar uchun dry-run/keep-candidate acceptance alohida faylda.

begin;

create index if not exists t2_qator_object_source_document_idx
  on public.t2_qator(obyekt_id, source_document_id, id)
  where source_document_id is not null;

create or replace function public.t2_smeta_import_source_guard_v1(
  p_kompaniya_id bigint,
  p_actor_id bigint,
  p_obyekt_id bigint,
  p_source_document_ids bigint[] default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_rol text;
  v_existing bigint;
  v_source_ids bigint[];
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol is null then
    return jsonb_build_object('ok',false,'code','COMPANY_ACCESS_DENIED');
  end if;
  if not exists(
    select 1 from public.t2_obyekt o
    where o.id=p_obyekt_id and o.kompaniya_id=p_kompaniya_id
  ) then
    return jsonb_build_object('ok',false,'code','OBJECT_ACCESS_DENIED');
  end if;

  select coalesce(array_agg(x order by x), '{}'::bigint[]) into v_source_ids
  from (select distinct x from unnest(coalesce(p_source_document_ids,'{}'::bigint[])) x) s;
  if coalesce(array_length(v_source_ids,1),0) <> coalesce(array_length(p_source_document_ids,1),0) then
    return jsonb_build_object('ok',false,'code','SOURCE_DOCUMENT_DUPLICATE');
  end if;

  -- Hujjat scope'ini oldindan tekshirish: boshqa kompaniya/obyekt hujjati
  -- borligini oshkor qilmaymiz va import RPC'ning scope guardini takrorlaymiz.
  if exists(
    select 1
    from unnest(v_source_ids) x(id)
    left join public.t2_document_registry d on d.id=x.id
    where d.id is null
       or d.kompaniya_id<>p_kompaniya_id
       or (d.obyekt_id is not null and d.obyekt_id<>p_obyekt_id)
  ) then
    return jsonb_build_object('ok',false,'code','SOURCE_DOCUMENT_SCOPE_MISMATCH');
  end if;

  if coalesce(array_length(v_source_ids,1),0)>0 then
    select coalesce(array_agg(distinct q.source_document_id order by q.source_document_id),'{}'::bigint[]),
           count(*)
      into v_source_ids, v_existing
    from public.t2_qator q
    where q.obyekt_id=p_obyekt_id
      and q.source_document_id = any(v_source_ids);
    if v_existing>0 then
      return jsonb_build_object(
        'ok',false,
        'code','SOURCE_DOCUMENT_ALREADY_IMPORTED',
        'source_document_ids',to_jsonb(v_source_ids),
        'existing_qator_soni',v_existing
      );
    end if;
  end if;

  select count(*) into v_existing
  from public.t2_qator q where q.obyekt_id=p_obyekt_id;
  if v_existing>0 then
    return jsonb_build_object('ok',false,'code','SMETA_ALREADY_EXISTS',
      'existing_qator_soni',v_existing);
  end if;
  return jsonb_build_object('ok',true,'code','IMPORT_ALLOWED','existing_qator_soni',0);
end $$;

-- Bitta obyektga parallel import start/finalize chaqiriqlarini serializatsiya
-- qiladi. Bu lock DB tranzaksiyasi tugaguncha yashaydi.
create or replace function public.t2_smeta_import_object_lock_v1(p_obyekt_id bigint)
returns void language plpgsql volatile security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('t2-smeta-import:'||p_obyekt_id::text,0));
end $$;

-- Wrapperlar eski, allaqachon acceptance qilingan algoritmni saqlaydi; faqat
-- object-level lock qo'shadi. Shu bilan 30k qatorli og'ir import qayta yozilmaydi.
do $$
begin
  if to_regprocedure('public.t2_smeta_import_boshla_v1(bigint,bigint,bigint,uuid,bigint)') is not null
     and to_regprocedure('public.t2_smeta_import_boshla_unlocked_v1(bigint,bigint,bigint,uuid,bigint)') is null then
    alter function public.t2_smeta_import_boshla_v1(bigint,bigint,bigint,uuid,bigint)
      rename to t2_smeta_import_boshla_unlocked_v1;
  end if;
  if to_regprocedure('public.t2_smeta_import_yakunla_v1(bigint,bigint,bigint)') is not null
     and to_regprocedure('public.t2_smeta_import_yakunla_unlocked_v1(bigint,bigint,bigint)') is null then
    alter function public.t2_smeta_import_yakunla_v1(bigint,bigint,bigint)
      rename to t2_smeta_import_yakunla_unlocked_v1;
  end if;
  if to_regprocedure('public.t2_smeta_import_bulk_v1(bigint,bigint,bigint,uuid,bigint,jsonb)') is not null
     and to_regprocedure('public.t2_smeta_import_bulk_unlocked_v1(bigint,bigint,bigint,uuid,bigint,jsonb)') is null then
    alter function public.t2_smeta_import_bulk_v1(bigint,bigint,bigint,uuid,bigint,jsonb)
      rename to t2_smeta_import_bulk_unlocked_v1;
  end if;
  if to_regprocedure('public.t2_smeta_paket_import_boshla_v1(bigint,bigint,bigint,uuid,text,text,jsonb)') is not null
     and to_regprocedure('public.t2_smeta_paket_import_boshla_unlocked_v1(bigint,bigint,bigint,uuid,text,text,jsonb)') is null then
    alter function public.t2_smeta_paket_import_boshla_v1(bigint,bigint,bigint,uuid,text,text,jsonb)
      rename to t2_smeta_paket_import_boshla_unlocked_v1;
  end if;
  if to_regprocedure('public.t2_smeta_paket_import_yakunla_v1(bigint,bigint,bigint)') is not null
     and to_regprocedure('public.t2_smeta_paket_import_yakunla_unlocked_v1(bigint,bigint,bigint)') is null then
    alter function public.t2_smeta_paket_import_yakunla_v1(bigint,bigint,bigint)
      rename to t2_smeta_paket_import_yakunla_unlocked_v1;
  end if;
end $$;

create or replace function public.t2_smeta_import_boshla_v1(
  p_kompaniya_id bigint,p_actor_id bigint,p_obyekt_id bigint,
  p_operation_id uuid,p_source_document_id bigint default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.t2_smeta_import_object_lock_v1(p_obyekt_id);
  return public.t2_smeta_import_boshla_unlocked_v1(
    p_kompaniya_id,p_actor_id,p_obyekt_id,p_operation_id,p_source_document_id);
end $$;

create or replace function public.t2_smeta_import_yakunla_v1(
  p_kompaniya_id bigint,p_actor_id bigint,p_sessiya_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_obyekt_id bigint;
begin
  select s.obyekt_id into v_obyekt_id
  from public.t2_smeta_import_sessiya s
  where s.id=p_sessiya_id and s.kompaniya_id=p_kompaniya_id;
  if v_obyekt_id is not null then perform public.t2_smeta_import_object_lock_v1(v_obyekt_id); end if;
  return public.t2_smeta_import_yakunla_unlocked_v1(p_kompaniya_id,p_actor_id,p_sessiya_id);
end $$;

create or replace function public.t2_smeta_import_bulk_v1(
  p_kompaniya_id bigint,p_actor_id bigint,p_obyekt_id bigint,
  p_operation_id uuid,p_source_document_id bigint,p_qatorlar jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.t2_smeta_import_object_lock_v1(p_obyekt_id);
  return public.t2_smeta_import_bulk_unlocked_v1(
    p_kompaniya_id,p_actor_id,p_obyekt_id,p_operation_id,p_source_document_id,p_qatorlar);
end $$;

create or replace function public.t2_smeta_paket_import_boshla_v1(
  p_kompaniya_id bigint,p_actor_id bigint,p_obyekt_id bigint,p_operation_id uuid,
  p_paket_kalit text,p_paket_nom text,p_manbalar jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.t2_smeta_import_object_lock_v1(p_obyekt_id);
  return public.t2_smeta_paket_import_boshla_unlocked_v1(
    p_kompaniya_id,p_actor_id,p_obyekt_id,p_operation_id,p_paket_kalit,p_paket_nom,p_manbalar);
end $$;

create or replace function public.t2_smeta_paket_import_yakunla_v1(
  p_kompaniya_id bigint,p_actor_id bigint,p_sessiya_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_obyekt_id bigint;
begin
  select s.obyekt_id into v_obyekt_id
  from public.t2_smeta_paket_import_sessiya s
  where s.id=p_sessiya_id and s.kompaniya_id=p_kompaniya_id;
  if v_obyekt_id is not null then perform public.t2_smeta_import_object_lock_v1(v_obyekt_id); end if;
  return public.t2_smeta_paket_import_yakunla_unlocked_v1(p_kompaniya_id,p_actor_id,p_sessiya_id);
end $$;

revoke all on function public.t2_smeta_import_source_guard_v1(bigint,bigint,bigint,bigint[]) from public,anon,authenticated;
revoke all on function public.t2_smeta_import_object_lock_v1(bigint) from public,anon,authenticated;
revoke all on function public.t2_smeta_import_boshla_unlocked_v1(bigint,bigint,bigint,uuid,bigint),
  public.t2_smeta_import_yakunla_unlocked_v1(bigint,bigint,bigint),
  public.t2_smeta_import_bulk_unlocked_v1(bigint,bigint,bigint,uuid,bigint,jsonb),
  public.t2_smeta_paket_import_boshla_unlocked_v1(bigint,bigint,bigint,uuid,text,text,jsonb),
  public.t2_smeta_paket_import_yakunla_unlocked_v1(bigint,bigint,bigint)
from public,anon,authenticated;
grant execute on function public.t2_smeta_import_source_guard_v1(bigint,bigint,bigint,bigint[]),
  public.t2_smeta_import_boshla_v1(bigint,bigint,bigint,uuid,bigint),
  public.t2_smeta_import_yakunla_v1(bigint,bigint,bigint),
  public.t2_smeta_import_bulk_v1(bigint,bigint,bigint,uuid,bigint,jsonb),
  public.t2_smeta_paket_import_boshla_v1(bigint,bigint,bigint,uuid,text,text,jsonb),
  public.t2_smeta_paket_import_yakunla_v1(bigint,bigint,bigint)
to service_role;

commit;
