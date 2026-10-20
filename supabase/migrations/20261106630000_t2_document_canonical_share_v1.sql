-- R2 dublikatlarining oldini olish (egasi 2026-10-20: «dublikatlar R2 da yig'ilib axlatxona bo'lyapti»).
-- 2026-10-21 holati: 272 ta saqlangan hujjat, noyob mazmun 85 ta, 76 MB dan 48 MB — bir xil baytlar qayta saqlangan
-- (bir fayl bir necha obyektga yoki LRV+RES sifatida yuklangan). Hujjat yozuvlari alohida qoladi (har biri o'z obyekti,
-- turi, reviziyasi bilan), faqat BAYTLAR bitta R2 obyektida bo'ladi.
--
-- FILE-TRUTH-001 o'zgarmaydi: r2_key — har yozuvning noyob MANTIQIY kaliti (t2_document_registry_r2_key_uq saqlanadi).
-- Yangi blob_key — JISMONIY obyekt kaliti, faqat mazmun boshqa yozuv bilan baham ko'rilganda to'ldiriladi
-- (NULL = obyekt r2_key ning o'zida). O'quvchilar (hujjat-ol, hujjat-r2) coalesce(blob_key, r2_key) dan o'qiydi.
-- Tizimda R2 obyektini o'chiradigan kod yo'q — umumiy obyekt boshqa yozuvni buzmaydi.

alter table public.t2_document_registry add column if not exists blob_key text;
comment on column public.t2_document_registry.blob_key is
  'Jismoniy R2 obyekti (mazmun boshqa yozuv bilan baham ko''rilganda). NULL — obyekt r2_key da. O''qish: coalesce(blob_key, r2_key).';
create index if not exists t2_document_registry_blob_key_ix on public.t2_document_registry(blob_key) where blob_key is not null;
create index if not exists t2_document_registry_sha_ix on public.t2_document_registry(kompaniya_id, sha256) where canonical_storage_status = 'stored';

-- t2_document_canonical_share_v1: 'reserved' yozuvni shu kompaniyadagi aynan shu mazmunli (sha256 + hajm, server
-- tekshirgan) 'stored' yozuvning jismoniy obyektiga bog'laydi va yakunlaydi (t2_document_canonical_finalize_v1 orqali —
-- superseded, Drive navbati, audit aynan o'sha). Mos manba bo'lmasa — ok:false, chaqiruvchi odatdagidek yuklaydi.
-- Faqat server hash'lagan fayllar uchun chaqiriladi (functions/api/hujjat-yukla.ts).
create or replace function public.t2_document_canonical_share_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_document_id bigint, p_operation_id uuid, p_sha256 text, p_size_bytes bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare d public.t2_document_registry; m public.t2_document_registry; v_sha text := lower(btrim(coalesce(p_sha256, ''))); v_blob text;
begin
  if v_sha !~ '^[0-9a-f]{64}$' or coalesce(p_size_bytes, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'DOCUMENT_CONTRACT_INVALID');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('doccanon:' || p_operation_id::text, 0));
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select * into d from public.t2_document_registry
   where id = p_document_id and kompaniya_id = p_kompaniya_id and operation_id = p_operation_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_NOT_FOUND'); end if;
  if d.canonical_storage_status <> 'reserved' then return jsonb_build_object('ok', false, 'code', 'NOT_RESERVED'); end if;
  if d.sha256 is not null and d.sha256 <> v_sha then return jsonb_build_object('ok', false, 'code', 'CANONICAL_HASH_MISMATCH'); end if;

  select * into m from public.t2_document_registry
   where kompaniya_id = p_kompaniya_id and id <> d.id and canonical_storage_status = 'stored'
     and sha256 = v_sha and size_bytes = p_size_bytes and sha256_verified and r2_key is not null
   order by id limit 1;
  if not found then return jsonb_build_object('ok', false, 'code', 'NO_SHARED_SOURCE'); end if;
  v_blob := coalesce(m.blob_key, m.r2_key);

  update public.t2_document_registry set blob_key = v_blob, updated_at = now() where id = d.id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'document_canonical_shared', 'file_truth', d.obyekt_id,
    format('document_id=%s; shared_from=%s; blob_key=%s; sha256=%s; actor_id=%s', d.id, m.id, v_blob, v_sha, p_actor_id),
    'actor:' || p_actor_id, null);
  return public.t2_document_canonical_finalize_v1(p_kompaniya_id, p_actor_id, d.id, p_operation_id, d.r2_key, v_sha,
    p_size_bytes, true, 'server') || jsonb_build_object('shared_from', m.id, 'blob_key', v_blob);
end $function$;

revoke all on function public.t2_document_canonical_share_v1(bigint, bigint, bigint, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.t2_document_canonical_share_v1(bigint, bigint, bigint, uuid, text, bigint) to service_role;

-- O'quvchi RPC'lar: jismoniy kalit 'blob_key' maydonida (r2_key maydoni ma'nosi o'zgarmaydi).
CREATE OR REPLACE FUNCTION public.t2_document_canonical_get_v1(p_actor_id bigint, p_document_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d public.t2_document_registry;
begin
  select * into d from public.t2_document_registry where id=p_document_id;
  if not found then return jsonb_build_object('ok',false,'code','DOCUMENT_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(d.kompaniya_id,p_actor_id);
  if d.canonical_storage_status <> 'stored' or d.r2_key is null then
    return jsonb_build_object('ok',false,'code','CANONICAL_BINARY_MISSING',
      'canonical_storage_status',d.canonical_storage_status); end if;
  return jsonb_build_object('ok',true,'document_id',d.id,'kompaniya_id',d.kompaniya_id,
    'r2_bucket',d.r2_bucket,'r2_key',d.r2_key,'blob_key',coalesce(d.blob_key,d.r2_key),'mime_type',d.mime_type,
    'original_filename',d.original_filename,'size_bytes',d.size_bytes,'sha256',d.sha256,
    'sha256_verified',d.sha256_verified,'status',d.status,'versiya',d.versiya);
end $function$;

CREATE OR REPLACE FUNCTION public.t2_tomon_hujjat_ol_v1(p_actor_id bigint, p_document_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_egasi bigint; d public.t2_document_registry;
begin
  if p_actor_id is null or p_actor_id <= 0 or p_document_id is null or p_document_id <= 0 then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_FORBIDDEN'); end if;
  select t.taqdim_etuvchi_kompaniya_id into v_egasi
    from public.t2_tomon_taqdim t join public.t2_tomon_aloqa a on a.id = t.aloqa_id and a.holat = 'faol'
   where t.manba_jadval = 't2_document_registry' and t.manba_id = p_document_id and t.holat in ('yuborilgan','ko_rilmoqda','qabul')
     and exists (select 1 from public.t2_azolik z where z.foydalanuvchi_id = p_actor_id and z.kompaniya_id = t.qabul_qiluvchi_kompaniya_id and z.holat = 'faol')
   order by t.id desc limit 1;
  if v_egasi is null then
    select h.kompaniya_id into v_egasi
      from public.t2_tomon_murojaat_hujjat h
      join public.t2_tomon_murojaat m on m.id = h.murojaat_id and m.holat <> 'bekor'
      join public.t2_tomon_aloqa a on a.id = m.aloqa_id and a.holat = 'faol'
     where h.document_id = p_document_id
       and exists (select 1 from public.t2_azolik z where z.foydalanuvchi_id = p_actor_id and z.holat = 'faol' and z.kompaniya_id in (m.beruvchi_kompaniya_id, m.ijrochi_kompaniya_id))
     order by h.id desc limit 1;
  end if;
  if v_egasi is null then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_FORBIDDEN'); end if;
  select * into d from public.t2_document_registry where id = p_document_id and kompaniya_id = v_egasi;
  if not found then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_NOT_FOUND'); end if;
  if d.canonical_storage_status is distinct from 'stored' or d.r2_key is null then return jsonb_build_object('ok', false, 'code', 'CANONICAL_BINARY_MISSING'); end if;
  return jsonb_build_object('ok', true, 'document_id', d.id, 'r2_key', d.r2_key, 'blob_key', coalesce(d.blob_key, d.r2_key), 'mime_type', d.mime_type, 'original_filename', d.original_filename, 'size_bytes', d.size_bytes, 'sha256', d.sha256);
end $function$;
