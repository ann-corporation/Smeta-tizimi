-- Rollback 20261106650000: fayl menejeri joylashuv qatlami olib tashlanadi (kanonik hujjatlar o'zgarmagan edi).
-- DIQQAT: foydalanuvchi papkalari, ko'rinadigan nomlar va savat holati yo'qoladi.
CREATE OR REPLACE FUNCTION public.t2_fayl_explorer_v1(p_actor_id bigint, p_kompaniya_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  return jsonb_build_object(
    'ok', true,
    'rol', v_rol,
    'kompaniya_id', p_kompaniya_id,
    'kompaniya', (select k.nom from public.t2_kompaniya k where k.id = p_kompaniya_id),
    'fayllar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'nom', coalesce(d.original_filename, 'hujjat-' || d.id),
        'tur', coalesce(d.document_type, 'hujjat'),
        'versiya', coalesce(d.revision_seq, 1),
        'mime', coalesce(d.mime_type, 'application/octet-stream'),
        'hajm', coalesce(d.size_bytes, 0),
        'sha256', d.sha256,
        'sana', coalesce(d.finalized_at, d.created_at),
        'davr', case when d.revision ~ '^\d{4}-\d{2}' then left(d.revision, 7) end,
        'kim', d.created_by,
        'loyiha_id', coalesce(d.loyiha_id, o.loyiha_id),
        'loyiha', l.nom,
        'obyekt_id', d.obyekt_id,
        'obyekt', o.nom,
        'slot', d.source_slot_key
      ) order by coalesce(d.finalized_at, d.created_at) desc, d.id desc)
      from public.t2_document_registry d
      left join public.t2_obyekt o on o.id = d.obyekt_id and o.kompaniya_id = d.kompaniya_id
      left join public.t2_loyiha l on l.id = coalesce(d.loyiha_id, o.loyiha_id) and l.kompaniya_id = d.kompaniya_id
      where d.kompaniya_id = p_kompaniya_id
        and d.canonical_storage_status = 'stored'
    ), '[]'::jsonb)
  );
end $function$;

drop function if exists public.t2_fayl_amal_v1(bigint, bigint, text, bigint, bigint, text, bigint);
drop table if exists public.t2_fayl_joy;
drop table if exists public.t2_fayl_papka;
