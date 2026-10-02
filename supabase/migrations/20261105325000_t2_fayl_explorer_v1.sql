-- Fayl menejeri (egasi 2026-10-02: "saytdagi R2 ni xuddi fayl exploreri darajasida"; tizimlashgan papkalar;
-- kompaniya yoki PTO bitta tugma bilan ZIP; NTB hech qachon Discover Invest hujjatini ko'rmasin).
-- Faqat o'qiydi (stable) — /api/sb GET orqali; a'zolik ichida tekshiriladi, p_actor_id sessiyadan.
-- Papka tuzilmasi uchun har fayl: loyiha / obyekt (nomlari bilan) / hujjat turi / sana / versiya.
begin;

create or replace function public.t2_fayl_explorer_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
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
        'kim', d.created_by,
        'loyiha_id', d.loyiha_id,
        'loyiha', l.nom,
        'obyekt_id', d.obyekt_id,
        'obyekt', o.nom,
        'slot', d.source_slot_key
      ) order by coalesce(d.finalized_at, d.created_at) desc, d.id desc)
      from public.t2_document_registry d
      left join public.t2_loyiha l on l.id = d.loyiha_id and l.kompaniya_id = d.kompaniya_id
      left join public.t2_obyekt o on o.id = d.obyekt_id and o.kompaniya_id = d.kompaniya_id
      where d.kompaniya_id = p_kompaniya_id
        and d.canonical_storage_status = 'stored'
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.t2_fayl_explorer_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_fayl_explorer_v1(bigint, bigint) to service_role;

commit;
