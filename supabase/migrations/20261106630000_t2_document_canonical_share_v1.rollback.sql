-- Rollback 20261106630000. Agar baham ko'rilgan yozuvlar bo'lsa (blob_key to'ldirilgan) — to'xtaydi: aks holda ular
-- o'qilmay qoladi (ularning r2_key kalitida obyekt yo'q). Avval ularni alohida obyektga ko'chirish kerak.
do $$ begin
  if exists (select 1 from public.t2_document_registry where blob_key is not null and blob_key <> r2_key) then
    raise exception 'ROLLBACK_BLOCKED: blob_key ishlatilgan yozuvlar bor — avval ularning baytlarini o''z r2_key ga nusxalang';
  end if;
end $$;

drop function if exists public.t2_document_canonical_share_v1(bigint, bigint, bigint, uuid, text, bigint);

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
    'r2_bucket',d.r2_bucket,'r2_key',d.r2_key,'mime_type',d.mime_type,
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
  return jsonb_build_object('ok', true, 'document_id', d.id, 'r2_key', d.r2_key, 'mime_type', d.mime_type, 'original_filename', d.original_filename, 'size_bytes', d.size_bytes, 'sha256', d.sha256);
end $function$;

drop index if exists public.t2_document_registry_sha_ix;
drop index if exists public.t2_document_registry_blob_key_ix;
alter table public.t2_document_registry drop column if exists blob_key;
