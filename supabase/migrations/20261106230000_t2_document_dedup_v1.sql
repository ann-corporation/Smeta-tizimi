-- Egasi 2026-10-06: "har F2 import urinishida kompyuterdan yuklab R2 to'lib ketayapdi". Sabab: har urinish yangi
-- operation_id bilan KELADI va bir xil fayl uchun yangi registr qatori + yangi R2 obyekti yaratiladi.
-- Endi: shu kompaniya + loyiha + obyekt + hujjat turi + revision da AYNAN BIR XIL mazmun (sha256) allaqachon
-- saqlangan va faol bo'lsa — yangi nusxa YARATILMAYDI, mavjud hujjat qaytariladi (retry/dedup belgisi bilan).
-- Boshqa hamma xatti-harakat (operation_id idempotentligi, tenant tekshiruvi, kalit shakli) o'zgarmagan.
create or replace function public.t2_document_canonical_reserve_v1(p_kompaniya_id bigint, p_actor_id bigint, p_loyiha_id bigint, p_obyekt_id bigint, p_document_type text, p_original_filename text, p_mime_type text, p_expected_size bigint, p_client_sha256 text, p_operation_id uuid, p_revision text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d public.t2_document_registry; v_seq integer; v_key text;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  perform pg_advisory_xact_lock(hashtextextended('doccanon:'||p_operation_id::text,0));
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id,p_actor_id);

  if p_obyekt_id is not null and not exists(
      select 1 from public.t2_obyekt o where o.id=p_obyekt_id and o.kompaniya_id=p_kompaniya_id
        and (p_loyiha_id is null or o.loyiha_id=p_loyiha_id)) then
    return jsonb_build_object('ok',false,'code','STORAGE_TENANT_MISMATCH'); end if;
  if p_loyiha_id is not null and not exists(
      select 1 from public.t2_loyiha l where l.id=p_loyiha_id and l.kompaniya_id=p_kompaniya_id) then
    return jsonb_build_object('ok',false,'code','PROJECT_COMPANY_MISMATCH'); end if;

  select * into d from public.t2_document_registry where kompaniya_id=p_kompaniya_id and operation_id=p_operation_id for update;
  if found then
    if d.loyiha_id is distinct from p_loyiha_id or d.obyekt_id is distinct from p_obyekt_id then
      return jsonb_build_object('ok',false,'code','STORAGE_TENANT_MISMATCH'); end if;
    return jsonb_build_object('ok',true,'document_id',d.id,'revision_seq',d.revision_seq,
      'r2_bucket',d.r2_bucket,'r2_key',d.r2_key,'canonical_storage_status',d.canonical_storage_status,
      'versiya',d.versiya,'retry',true);
  end if;

  -- DEDUPE: aynan bir xil mazmun allaqachon saqlangan — yangi R2 obyekti yaratilmaydi.
  if nullif(btrim(p_client_sha256),'') is not null then
    select * into d from public.t2_document_registry
     where kompaniya_id=p_kompaniya_id and loyiha_id is not distinct from p_loyiha_id and obyekt_id is not distinct from p_obyekt_id
       and document_type=btrim(p_document_type) and revision is not distinct from p_revision
       and sha256=btrim(p_client_sha256) and canonical_storage_status='stored' and status='active'
     order by id desc limit 1;
    if found then
      return jsonb_build_object('ok',true,'document_id',d.id,'revision_seq',d.revision_seq,
        'r2_bucket',d.r2_bucket,'r2_key',d.r2_key,'canonical_storage_status','stored',
        'versiya',d.versiya,'sha256',d.sha256,'retry',true,'dedup',true);
    end if;
  end if;

  select coalesce(max(revision_seq),0)+1 into v_seq from public.t2_document_registry
   where kompaniya_id=p_kompaniya_id and loyiha_id is not distinct from p_loyiha_id
     and obyekt_id is not distinct from p_obyekt_id and document_type=btrim(p_document_type);

  insert into public.t2_document_registry(
      kompaniya_id,loyiha_id,obyekt_id,provider,document_type,revision,revision_seq,
      original_filename,mime_type,expected_size_bytes,sha256,r2_bucket,
      canonical_storage_status,status,versiya,created_by,actor_id,operation_id,
      reserved_at,drive_sync_status)
    values (p_kompaniya_id,p_loyiha_id,p_obyekt_id,'cloudflare_r2',btrim(p_document_type),
      p_revision,v_seq,p_original_filename,p_mime_type,p_expected_size,nullif(btrim(p_client_sha256),''),
      'canonical','reserved','pending',1,'t2-web',p_actor_id,p_operation_id,now(),'not_configured')
    returning * into d;

  -- deterministic key from the allocated document_id
  v_key := format('docs/%s/%s/%s/d%s/r%s', p_kompaniya_id,
                  coalesce(p_loyiha_id::text,'_'), coalesce(p_obyekt_id::text,'_'), d.id, v_seq);
  update public.t2_document_registry set r2_key=v_key, updated_at=now() where id=d.id returning * into d;

  perform public.t2_audit_yoz(p_kompaniya_id,'document_canonical_reserved','file_truth',d.obyekt_id,
    format('document_id=%s; r2_key=%s; actor_id=%s',d.id,v_key,p_actor_id),'actor:'||p_actor_id,null);
  return jsonb_build_object('ok',true,'document_id',d.id,'revision_seq',d.revision_seq,
    'r2_bucket',d.r2_bucket,'r2_key',v_key,'canonical_storage_status','reserved','versiya',d.versiya);
end $function$;
