-- Read-only acceptance for T2-SMETA-IMPORT-DUPLICATE-GUARD-001.
-- Run only after the migration. No business rows are inserted or deleted.

begin;

do $$
declare v_def text; v_name text;
begin
  if to_regclass('public.t2_qator_object_source_document_idx') is null then
    raise exception 'SMETA_DUPLICATE_GUARD_FAIL: source index missing';
  end if;
  if to_regprocedure('public.t2_smeta_import_source_guard_v1(bigint,bigint,bigint,bigint[])') is null then
    raise exception 'SMETA_DUPLICATE_GUARD_FAIL: preflight RPC missing';
  end if;
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='t2_smeta_import_source_guard_v1'
  limit 1;
  if v_def not ilike '%SOURCE_DOCUMENT_ALREADY_IMPORTED%'
     or v_def not ilike '%SMETA_ALREADY_EXISTS%'
     or v_def not ilike '%t2_qator%' then
    raise exception 'SMETA_DUPLICATE_GUARD_FAIL: preflight semantics missing';
  end if;
  foreach v_name in array array['t2_smeta_import_boshla_v1','t2_smeta_import_yakunla_v1',
    't2_smeta_import_bulk_v1','t2_smeta_paket_import_boshla_v1','t2_smeta_paket_import_yakunla_v1'] loop
    if not exists(
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_name
    ) then raise exception 'SMETA_DUPLICATE_GUARD_FAIL: wrapper missing %',v_name; end if;
  end loop;
  if not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='t2_smeta_import_object_lock_v1'
  ) then raise exception 'SMETA_DUPLICATE_GUARD_FAIL: advisory lock helper missing'; end if;
  raise notice 'SMETA_DUPLICATE_GUARD_PASS';
end $$;

-- Dry-run duplicate candidates: no delete/merge. The smallest id is only a
-- proposed keep candidate; repeated identical rows may be legitimate, so an
-- operator/reviewer must decide before any data repair.
with normalized as (
  select q.id, q.kompaniya_id, q.obyekt_id, q.source_document_id,
         q.smeta_paket_manba_id, q.tur, nullif(lower(btrim(q.kod)), '') as kod,
         lower(regexp_replace(btrim(coalesce(q.nom,'')), '\\s+', ' ', 'g')) as nom_key,
         lower(btrim(coalesce(q.birlik,''))) as birlik_key,
         q.hajm, q.narx, q.summa
  from public.t2_qator q
  where q.source_document_id is not null
), candidates as (
  select *, count(*) over(partition by obyekt_id, source_document_id, tur, kod,
    nom_key, birlik_key, hajm, narx, summa) as duplicate_count,
    min(id) over(partition by obyekt_id, source_document_id, tur, kod,
      nom_key, birlik_key, hajm, narx, summa) as keep_candidate_id
  from normalized
)
select kompaniya_id, obyekt_id, source_document_id, tur, kod, nom_key,
       birlik_key, hajm, narx, summa, duplicate_count, keep_candidate_id, id
from candidates
where duplicate_count > 1
order by obyekt_id, source_document_id, keep_candidate_id, id;

rollback;
