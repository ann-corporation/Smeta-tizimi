-- ИСХОДНИК, интегратор применяет отдельной additive migration. Не меняет FILE-TRUTH RPC.
create or replace function public.t2_boss_documents_v1(
 p_kompaniya_id bigint,p_actor_id bigint,p_loyiha_id bigint default null,
 p_obyekt_id bigint default null,p_without_project boolean default false,
 p_before_id bigint default null,p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_docs jsonb;v_total bigint;v_next bigint;v_role text;
begin
 v_role:=public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id,p_actor_id);
 if p_limit is null or p_limit<1 or p_limit>100 or (p_before_id is not null and p_before_id<=0)
  or (p_without_project and p_loyiha_id is not null) then raise exception 'INVALID_INPUT'; end if;
 if p_loyiha_id is not null and not exists(select 1 from public.t2_loyiha where id=p_loyiha_id and kompaniya_id=p_kompaniya_id)
  then raise exception 'PROJECT_SCOPE_MISMATCH'; end if;
 if p_obyekt_id is not null and not exists(select 1 from public.t2_obyekt where id=p_obyekt_id and kompaniya_id=p_kompaniya_id
  and (p_loyiha_id is null or loyiha_id=p_loyiha_id) and (not p_without_project or loyiha_id is null))
  then raise exception 'OBJECT_SCOPE_MISMATCH'; end if;
 -- DOCUMENTS_QUERY_BEGIN
 with scoped as materialized (
  select d.id,d.original_filename,d.document_type,d.revision_seq,d.mime_type,d.size_bytes,d.sha256,d.updated_at,d.created_at,d.status,d.canonical_storage_status from public.t2_document_registry d where d.kompaniya_id=p_kompaniya_id
   and d.status<>'superseded' and (p_loyiha_id is null or d.loyiha_id=p_loyiha_id)
   and (p_obyekt_id is null or d.obyekt_id=p_obyekt_id) and (not p_without_project or d.loyiha_id is null)
 ), page as materialized (
  select * from scoped where p_before_id is null or id<p_before_id order by id desc limit p_limit
 ) select coalesce((select jsonb_agg(jsonb_build_object(
  'id',d.id::text,'filename',coalesce(d.original_filename,'hujjat-'||d.id),
  'type',d.document_type,'revision',d.revision_seq,'mime',d.mime_type,'size',d.size_bytes,
  'sha256',d.sha256,'updatedAt',coalesce(d.updated_at,d.created_at),
  'canonicalStatus',case when d.status='failed' then 'ERROR'
   when d.canonical_storage_status='stored' then 'READY'
   when d.canonical_storage_status='failed' then 'ERROR' else 'REGISTERING' end
 ) order by d.id desc) from page d),'[]'::jsonb),
 (select count(*) from scoped),
 case when exists(select 1 from scoped where id<(select min(id) from page)) then (select min(id) from page) else null end
 into v_docs,v_total,v_next;
 -- DOCUMENTS_QUERY_END
 return jsonb_build_object('ok',true,'generated_at',statement_timestamp(),'kompaniya_id',p_kompaniya_id,
  'loyiha_id',p_loyiha_id,'obyekt_id',p_obyekt_id,'without_project',p_without_project,
  'documents',v_docs,'jami',v_total,'next_before_id',v_next);
end $$;
revoke all on function public.t2_boss_documents_v1(bigint,bigint,bigint,bigint,boolean,bigint,integer) from public,anon,authenticated;
grant execute on function public.t2_boss_documents_v1(bigint,bigint,bigint,bigint,boolean,bigint,integer) to service_role;
