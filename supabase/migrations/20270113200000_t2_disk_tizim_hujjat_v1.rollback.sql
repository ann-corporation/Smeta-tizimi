-- Orqaga qaytarish: Disk tizim hujjatlari ierarxiyasi. Explorer va kvota asl ko'rinishiga qaytadi; qo'shilgan ustunlar (kalit/manba/nom/shartnoma) o'chadi\n-- (ma'lumot faqat metama'lumot edi: fayllar, versiya qatorlari va R2 obyektlari o'zgarmaydi).
create or replace function public.t2_fayl_explorer_v1(p_actor_id bigint, p_kompaniya_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  return jsonb_build_object(
    'ok', true, 'rol', v_rol, 'kompaniya_id', p_kompaniya_id,
    'kompaniya', (select k.nom from public.t2_kompaniya k where k.id = p_kompaniya_id),
    'papkalar', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'ota_id', p.ota_id, 'nom', p.nom) order by lower(p.nom))
        from public.t2_fayl_papka p where p.kompaniya_id = p_kompaniya_id), '[]'::jsonb),
    'fayllar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'nom', coalesce(j.nom, d.original_filename, 'hujjat-' || d.id), 'asl_nom', coalesce(d.original_filename, 'hujjat-' || d.id),
        'tur', coalesce(d.document_type, 'hujjat'), 'versiya', coalesce(d.revision_seq, 1), 'mime', coalesce(d.mime_type, 'application/octet-stream'),
        'hajm', coalesce(d.size_bytes, 0), 'sha256', d.sha256, 'sana', coalesce(d.finalized_at, d.created_at),
        'davr', case when d.revision ~ '^\d{4}-\d{2}' then left(d.revision, 7) end, 'kim', d.created_by,
        'loyiha_id', coalesce(d.loyiha_id, o.loyiha_id), 'loyiha', l.nom, 'obyekt_id', d.obyekt_id, 'obyekt', o.nom,
        'slot', d.source_slot_key, 'papka_id', j.papka_id, 'savatda', j.savatda
      ) order by coalesce(d.finalized_at, d.created_at) desc, d.id desc)
      from public.t2_document_registry d
      left join public.t2_obyekt o on o.id = d.obyekt_id and o.kompaniya_id = d.kompaniya_id
      left join public.t2_loyiha l on l.id = coalesce(d.loyiha_id, o.loyiha_id) and l.kompaniya_id = d.kompaniya_id
      left join public.t2_fayl_joy j on j.document_id = d.id and j.kompaniya_id = d.kompaniya_id
      where d.kompaniya_id = p_kompaniya_id and d.canonical_storage_status = 'stored'
    ), '[]'::jsonb));
end $function$;
create or replace function public._t2_hm_kvota_v1(p_kompaniya bigint, p_egasi bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_used bigint; v_lim bigint := public._t2_hm_limit_v1(p_kompaniya); v_chegara bigint; v_ort boolean := false; v_max bigint;
begin
  select coalesce(sum(v.bayt), 0) into v_used from public.t2_hm_versiya v join public.t2_hm_fayl f on f.id = v.fayl_id
   where (p_kompaniya is not null and f.kompaniya_id = p_kompaniya) or (p_kompaniya is null and f.egasi_foydalanuvchi_id = p_egasi);
  v_chegara := v_lim;
  if p_kompaniya is not null then
    select coalesce(s.ortiqcha, false) into v_ort from public.t2_hm_sozlama s where s.kompaniya_id = p_kompaniya;
    if coalesce(v_ort, false) and public.t2_token_balans(p_kompaniya) > 0 then
      select disk_ortiqcha_max_bayt into v_max from public.t2_token_sozlama where id = 1;
      v_chegara := v_lim + coalesce(v_max, 0);
    end if;
  end if;
  return jsonb_build_object('ishlatilgan', v_used, 'limit', v_lim, 'chegara', v_chegara, 'ortiqcha', coalesce(v_ort, false),
    'foiz', case when v_lim > 0 then round(v_used * 100.0 / v_lim, 1) end);
end $$;

drop function if exists public.t2_disk_tizim_meta_v1(bigint, bigint, bigint, text, bigint, text, bigint, text);
drop function if exists public._t2_disk_shartnoma_v1(bigint, bigint);
drop index if exists public.t2_document_registry_hujjat_kalit_ix;
alter table public.t2_document_registry drop constraint if exists t2_document_registry_disk_meta_chk;
alter table public.t2_document_registry drop column if exists korinish_nom, drop column if exists shartnoma_id, drop column if exists hujjat_kalit, drop column if exists manba_id, drop column if exists manba_turi;
