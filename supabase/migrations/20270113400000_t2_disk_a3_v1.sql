-- Disk A3: Kompaniya diski daraxtidagi tizim fayllari uchun "Tizimda ochish" va eski /admin/documents?document_id= havolasi.
--  * t2_hm_royxat_v1: fayl qatoriga tizim_hujjat / manba_turi / manba_id / hujjat_kalit / obyekt_id / shartnoma_id qo'shiladi (obyekt - registry qatoridan;
--    forma3 shartnomasi - t2_forma3 dan). Boshqa hech narsa o'zgarmaydi (A1 funksiyasining aynan nusxasi + yangi maydonlar).
--  * t2_hm_registry_joy_v1: eski hujjat id si (t2_document_registry.id) -> Diskdagi fayl va uning papkasi (ruxsat tekshiriladi).
-- Hamma funksiya faqat service_role.
create or replace function public.t2_hm_royxat_v1(p_actor bigint, p_kompaniya bigint default null, p_papka bigint default null, p_savat boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint := p_kompaniya; v_e bigint; v_d integer; v_p public.t2_fayl_papka%rowtype; v_yol jsonb; v_pap jsonb; v_fay jsonb;
begin
  if p_papka is not null then
    select * into v_p from public.t2_fayl_papka where id = p_papka;
    if not found then return jsonb_build_object('ok', false, 'code', 'PAPKA_TOPILMADI'); end if;
    v_k := v_p.kompaniya_id; v_e := v_p.egasi_foydalanuvchi_id;
  elsif v_k is null then v_e := p_actor;
  end if;
  v_d := public._t2_hm_daraja_v1(p_actor, v_k, v_e, p_papka, null);
  if v_d < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;

  if p_papka is not null then
    with recursive z(id, ota_id, nom, d) as (
      select p.id, p.ota_id, p.nom, 0 from public.t2_fayl_papka p where p.id = p_papka
      union all select p.id, p.ota_id, p.nom, z.d + 1 from public.t2_fayl_papka p join z on p.id = z.ota_id)
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nom', nom) order by d desc), '[]'::jsonb) into v_yol from z;
  else v_yol := '[]'::jsonb; end if;

  if p_savat then v_pap := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'tizim', p.tizim) order by lower(p.nom)), '[]'::jsonb) into v_pap
      from public.t2_fayl_papka p
     where p.kompaniya_id is not distinct from v_k and p.egasi_foydalanuvchi_id is not distinct from v_e and p.ota_id is not distinct from p_papka;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'nom', f.nom, 'mime', f.mime, 'bayt', vv.bayt, 'versiya', vv.raqam, 'yangilandi', f.yangilandi, 'savatda', f.savatda,
      'tizim_hujjat', f.hujjat_kalit is not null, 'manba_turi', f.manba_turi, 'manba_id', f.manba_id, 'hujjat_kalit', f.hujjat_kalit,
      'obyekt_id', rg.obyekt_id, 'shartnoma_id', case when f.manba_turi in ('shartnoma_oylik_paket', 'sverka_shartnoma') then f.manba_id else f3.shartnoma_id end,
      'qulf_kim', case when f.qulf_tugaydi > now() then f.qulf_kim end,
      'qulf_ism', case when f.qulf_tugaydi > now() then u.ism end,
      'izohlar', (select count(*) from public.t2_hm_izoh z where z.fayl_id = f.id))
      order by lower(f.nom)), '[]'::jsonb) into v_fay
    from public.t2_hm_fayl f
    left join public.t2_hm_versiya vv on vv.id = f.joriy_versiya_id
    left join public.t2_foydalanuvchi u on u.id = f.qulf_kim
    left join lateral (select d.obyekt_id from public.t2_hm_versiya x join public.t2_document_registry d on d.id = x.registry_id where x.fayl_id = f.id and x.registry_id is not null order by x.raqam desc limit 1) rg on true
    left join public.t2_forma3 f3 on f.manba_turi = 'forma3' and f.manba_id is not null and f3.id = f.manba_id and f3.kompaniya_id = f.kompaniya_id
   where f.kompaniya_id is not distinct from v_k and f.egasi_foydalanuvchi_id is not distinct from v_e
     and (p_savat = (f.savatda is not null))
     and (p_savat or f.papka_id is not distinct from p_papka);

  return jsonb_build_object('ok', true, 'daraja', v_d, 'kompaniya_id', v_k, 'shaxsiy', v_k is null,
    'yol', v_yol, 'papkalar', v_pap, 'fayllar', v_fay, 'kvota', public._t2_hm_kvota_v1(v_k, v_e));
end $$;

create or replace function public.t2_hm_registry_joy_v1(p_actor bigint, p_registry_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f public.t2_hm_fayl%rowtype;
begin
  select ff.* into f from public.t2_hm_versiya v join public.t2_hm_fayl ff on ff.id = v.fayl_id where v.registry_id = p_registry_id limit 1;
  if not found then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
  if public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  return jsonb_build_object('ok', true, 'fayl_id', f.id, 'papka_id', f.papka_id, 'kompaniya_id', f.kompaniya_id, 'savatda', f.savatda is not null, 'nom', f.nom);
end $$;

do $g$ declare s text; begin
  foreach s in array array['t2_hm_royxat_v1(bigint, bigint, bigint, boolean)', 't2_hm_registry_joy_v1(bigint, bigint)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', s);
    execute format('grant execute on function public.%s to service_role', s);
  end loop;
end $g$;