-- Orqaga qaytarish: Hujjat maydoni taqdim (2-faza). Taqdim surati jadvallari o'chadi (tomon hodisalari jurnali o'zgarmas - unga tegilmaydi).
-- Tozalash funksiyalari 20270111000100 dagi asl ko'rinishiga qaytariladi (pin sharti olib tashlanadi).
create or replace function public.t2_hm_tozala_ol_v1(p_actor bigint default null, p_fayl_id bigint default null, p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.t2_hm_fayl%rowtype; v_f jsonb; v_v jsonb;
begin
  if p_fayl_id is not null then
    select * into f from public.t2_hm_fayl where id = p_fayl_id and savatda is not null;
    if not found then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
    if p_actor is not null and public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
    if p_actor is null then return jsonb_build_object('ok', false, 'code', 'ACTOR_KERAK'); end if;
    select jsonb_build_array(jsonb_build_object('id', f.id, 'kalitlar', coalesce((select jsonb_agg(v.r2_kalit) from public.t2_hm_versiya v where v.fayl_id = f.id), '[]'::jsonb))) into v_f;
    return jsonb_build_object('ok', true, 'fayllar', v_f, 'versiyalar', '[]'::jsonb);
  end if;
  if p_actor is not null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kalitlar', (select coalesce(jsonb_agg(v.r2_kalit), '[]'::jsonb) from public.t2_hm_versiya v where v.fayl_id = x.id))), '[]'::jsonb) into v_f
    from (select id from public.t2_hm_fayl where savatda < now() - interval '30 days' order by savatda limit least(greatest(coalesce(p_limit, 100), 1), 500)) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'kalit', v.r2_kalit)), '[]'::jsonb) into v_v
    from public.t2_hm_versiya v where v.holat = 'kutish' and v.yaratildi < now() - interval '1 day';
  return jsonb_build_object('ok', true, 'fayllar', v_f, 'versiyalar', v_v);
end $$;

create or replace function public.t2_hm_tozala_tasdiq_v1(p_fayl_idlar bigint[] default '{}', p_versiya_idlar bigint[] default '{}', p_eski_idlar bigint[] default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_f integer; v_v integer; v_e integer;
begin
  -- eski versiyalar: joriy versiya HECH QACHON o'chirilmaydi
  delete from public.t2_hm_versiya v where v.id = any (coalesce(p_eski_idlar, '{}')) and v.holat = 'tayyor'
     and not exists (select 1 from public.t2_hm_fayl f where f.joriy_versiya_id = v.id);
  get diagnostics v_e = row_count;
  delete from public.t2_hm_ulashish where nishon_turi = 'fayl' and nishon_id = any (coalesce(p_fayl_idlar, '{}'));
  delete from public.t2_hm_fayl where id = any (coalesce(p_fayl_idlar, '{}')) and savatda is not null;
  get diagnostics v_f = row_count;
  delete from public.t2_hm_versiya where id = any (coalesce(p_versiya_idlar, '{}')) and holat = 'kutish';
  get diagnostics v_v = row_count;
  delete from public.t2_hm_fayl f where f.joriy_versiya_id is null and f.yaratildi < now() - interval '1 day' and not exists (select 1 from public.t2_hm_versiya x where x.fayl_id = f.id);
  return jsonb_build_object('ok', true, 'fayllar', v_f, 'versiyalar', v_v, 'eski', v_e);
end $$;

create or replace function public.t2_hm_bosh_ol_v1(p_actor bigint, p_kompaniya bigint, p_amal text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_e bigint := case when p_kompaniya is null then p_actor end;
begin
  if public._t2_hm_daraja_v1(p_actor, p_kompaniya, v_e, null, null) < 4 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if p_amal = 'savat' then
    return jsonb_build_object('ok', true, 'fayllar', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kalitlar', (select coalesce(jsonb_agg(v.r2_kalit), '[]'::jsonb) from public.t2_hm_versiya v where v.fayl_id = f.id)))
        from public.t2_hm_fayl f where f.savatda is not null and f.kompaniya_id is not distinct from p_kompaniya and f.egasi_foydalanuvchi_id is not distinct from v_e), '[]'::jsonb),
      'eski', '[]'::jsonb);
  elsif p_amal = 'eski_versiyalar' then
    return jsonb_build_object('ok', true, 'fayllar', '[]'::jsonb, 'eski', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'kalit', v.r2_kalit))
        from public.t2_hm_versiya v join public.t2_hm_fayl f on f.id = v.fayl_id
       where f.kompaniya_id is not distinct from p_kompaniya and f.egasi_foydalanuvchi_id is not distinct from v_e and f.savatda is null
         and v.holat = 'tayyor' and v.id is distinct from f.joriy_versiya_id), '[]'::jsonb));
  end if;
  return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM');
end $$;

drop function if exists public.t2_hm_taqdim_qaytar_v1(bigint, bigint, text);
drop function if exists public.t2_hm_taqdim_yuklab_v1(bigint, bigint, bigint);
drop function if exists public.t2_hm_taqdim_tafsilot_v1(bigint, bigint);
drop function if exists public.t2_hm_taqdim_royxat_v1(bigint, bigint, text);
drop function if exists public.t2_hm_taqdim_yarat_v1(bigint, text, bigint, bigint, text, uuid);
drop function if exists public.t2_hm_taqdim_nishon_v1(bigint, bigint);
drop function if exists public._t2_hm_taqdim_yig_v1(text, bigint);
drop function if exists public._t2_hm_taqdim_rol_v1(bigint, bigint, text);
drop function if exists public._t2_hm_pinli_versiya_v1(bigint);
drop function if exists public._t2_hm_pinli_fayl_v1(bigint);
drop table if exists public.t2_hm_taqdim_el;
drop table if exists public.t2_hm_taqdim;
