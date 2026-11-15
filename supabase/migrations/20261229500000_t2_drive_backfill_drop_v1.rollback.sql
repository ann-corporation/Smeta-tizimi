-- Rollback 20261229500000: funksiyani oxirgi ta'rifi (20260902120000) bilan qayta yaratish (drive_* ustunlari mavjud bo'lishi shart - 20261230000000 dan oldin).
create or replace function public.t2_document_canonical_backfill_v1(
  p_document_id bigint, p_r2_key text, p_sha256 text, p_size bigint, p_mime text, p_drive_revision text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.t2_document_registry;
begin
  select * into d from public.t2_document_registry where id=p_document_id for update;
  if not found then return jsonb_build_object('ok',false,'code','DOCUMENT_NOT_FOUND'); end if;
  if d.r2_key is not null then return jsonb_build_object('ok',true,'document_id',d.id,'already',true); end if;
  update public.t2_document_registry
     set r2_key=btrim(p_r2_key), sha256=btrim(p_sha256), size_bytes=p_size,
         mime_type=coalesce(p_mime,mime_type), canonical_storage_status='stored',
         drive_revision=p_drive_revision, drive_sync_status='synced', drive_last_sync_at=now(), updated_at=now()
   where id=p_document_id;
  return jsonb_build_object('ok',true,'document_id',d.id,'backfilled',true);
end $$;
revoke all on function public.t2_document_canonical_backfill_v1(bigint,text,text,bigint,text,text) from public, anon, authenticated;
