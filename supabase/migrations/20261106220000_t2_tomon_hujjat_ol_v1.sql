-- Tomon taqdimi orqali yuborilgan R2 hujjatni QABUL QILUVCHI yuklab olishi uchun ruxsat (faqat shu aniq hujjat).
-- Egalik qoidasi o'zgarmaydi: hujjat egasi o'z hujjatini t2_document_canonical_get_v1 orqali oladi. Bu funksiya faqat
-- (faol aloqa + ochiq/qabul qilingan taqdim + qabul qiluvchi kompaniyaning faol a'zosi) bo'lganda javob beradi.
-- Qaytish shakli t2_document_canonical_get_v1 bilan bir xil (ok, r2_key, mime_type, original_filename, size_bytes, sha256).
create or replace function public.t2_tomon_hujjat_ol_v1(p_actor_id bigint, p_document_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q public.t2_tomon_taqdim; d public.t2_document_registry;
begin
  if p_actor_id is null or p_actor_id <= 0 or p_document_id is null or p_document_id <= 0 then
    return jsonb_build_object('ok', false, 'code', 'DOCUMENT_FORBIDDEN');
  end if;
  select t.* into q
    from public.t2_tomon_taqdim t
    join public.t2_tomon_aloqa a on a.id = t.aloqa_id and a.holat = 'faol'
   where t.manba_jadval = 't2_document_registry' and t.manba_id = p_document_id
     and t.holat in ('yuborilgan','ko_rilmoqda','qabul')
     and exists (select 1 from public.t2_azolik z where z.foydalanuvchi_id = p_actor_id and z.kompaniya_id = t.qabul_qiluvchi_kompaniya_id and z.holat = 'faol')
   order by t.id desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_FORBIDDEN'); end if;
  select * into d from public.t2_document_registry where id = p_document_id and kompaniya_id = q.taqdim_etuvchi_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_NOT_FOUND'); end if;
  if d.canonical_storage_status is distinct from 'stored' or d.r2_key is null then return jsonb_build_object('ok', false, 'code', 'CANONICAL_BINARY_MISSING'); end if;
  return jsonb_build_object('ok', true, 'document_id', d.id, 'r2_key', d.r2_key, 'mime_type', d.mime_type, 'original_filename', d.original_filename, 'size_bytes', d.size_bytes, 'sha256', d.sha256);
end $$;
revoke all on function public.t2_tomon_hujjat_ol_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_tomon_hujjat_ol_v1(bigint, bigint) to service_role;
