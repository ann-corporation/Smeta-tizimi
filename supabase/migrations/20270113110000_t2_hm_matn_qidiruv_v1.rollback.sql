-- Orqaga qaytarish: Hujjat maydoni matnli qidiruv. Indeks jadvali o'chadi (R2 dagi '.txt' obyektlari kunlik tozalashda/qo'lda o'chiriladi - ular bazaga bog'liq emas).
drop function if exists public.t2_hm_qidir_v1(bigint, bigint, text, text);
drop function if exists public.t2_hm_matn_yoz_v1(bigint, bigint, text, integer, text);
create or replace function public.t2_hm_qidir_v1(p_actor bigint, p_kompaniya bigint default null, p_q text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', ''), '%', ''), '_', '');
begin
  if length(v_q) < 2 then return jsonb_build_object('ok', true, 'royxat', '[]'::jsonb); end if;
  if p_kompaniya is not null and public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  return jsonb_build_object('ok', true, 'royxat', coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'nom', f.nom, 'mime', f.mime, 'yangilandi', f.yangilandi, 'papka_id', f.papka_id) order by f.yangilandi desc)
      from (select * from public.t2_hm_fayl x
             where x.savatda is null and lower(x.nom) like '%' || v_q || '%'
               and ((p_kompaniya is not null and x.kompaniya_id = p_kompaniya) or (p_kompaniya is null and x.egasi_foydalanuvchi_id = p_actor))
             order by x.yangilandi desc limit 50) f), '[]'::jsonb));
end $$;

revoke all on function public.t2_hm_qidir_v1(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.t2_hm_qidir_v1(bigint, bigint, text) to service_role;
drop table if exists public.t2_hm_matn;
