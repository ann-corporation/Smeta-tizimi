-- PRE-USE rollback for T2-SMETA-IMPORT-DUPLICATE-GUARD-001.
-- Existing rows are never deleted. Rollback only removes the guard/wrappers.

begin;

drop function if exists public.t2_smeta_paket_import_yakunla_v1(bigint,bigint,bigint);
drop function if exists public.t2_smeta_paket_import_boshla_v1(bigint,bigint,bigint,uuid,text,text,jsonb);
drop function if exists public.t2_smeta_import_bulk_v1(bigint,bigint,bigint,uuid,bigint,jsonb);
drop function if exists public.t2_smeta_import_yakunla_v1(bigint,bigint,bigint);
drop function if exists public.t2_smeta_import_boshla_v1(bigint,bigint,bigint,uuid,bigint);

do $$
begin
  if to_regprocedure('public.t2_smeta_import_boshla_unlocked_v1(bigint,bigint,bigint,uuid,bigint)') is not null then
    alter function public.t2_smeta_import_boshla_unlocked_v1(bigint,bigint,bigint,uuid,bigint)
      rename to t2_smeta_import_boshla_v1;
  end if;
  if to_regprocedure('public.t2_smeta_import_yakunla_unlocked_v1(bigint,bigint,bigint)') is not null then
    alter function public.t2_smeta_import_yakunla_unlocked_v1(bigint,bigint,bigint)
      rename to t2_smeta_import_yakunla_v1;
  end if;
  if to_regprocedure('public.t2_smeta_import_bulk_unlocked_v1(bigint,bigint,bigint,uuid,bigint,jsonb)') is not null then
    alter function public.t2_smeta_import_bulk_unlocked_v1(bigint,bigint,bigint,uuid,bigint,jsonb)
      rename to t2_smeta_import_bulk_v1;
  end if;
  if to_regprocedure('public.t2_smeta_paket_import_boshla_unlocked_v1(bigint,bigint,bigint,uuid,text,text,jsonb)') is not null then
    alter function public.t2_smeta_paket_import_boshla_unlocked_v1(bigint,bigint,bigint,uuid,text,text,jsonb)
      rename to t2_smeta_paket_import_boshla_v1;
  end if;
  if to_regprocedure('public.t2_smeta_paket_import_yakunla_unlocked_v1(bigint,bigint,bigint)') is not null then
    alter function public.t2_smeta_paket_import_yakunla_unlocked_v1(bigint,bigint,bigint)
      rename to t2_smeta_paket_import_yakunla_v1;
  end if;
end $$;

drop function if exists public.t2_smeta_import_object_lock_v1(bigint);
drop function if exists public.t2_smeta_import_source_guard_v1(bigint,bigint,bigint,bigint[]);
drop index if exists public.t2_qator_object_source_document_idx;

commit;
