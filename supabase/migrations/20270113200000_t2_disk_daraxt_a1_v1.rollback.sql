-- Orqaga qaytarish: Disk A1. Tizim hujjatlari daraxti (backfill qilingan t2_hm_fayl/versiya, tizim papkalari) o'chadi; t2_document_registry va R2 obyektlari
-- O'ZGARMAGAN (A1 ularga tegmagan). Foydalanuvchi tizim papkasiga qo'shgan o'z fayllari ildizga tushadi (papka_id null).
delete from public.t2_hm_ulashish where nishon_turi = 'fayl' and nishon_id in (select id from public.t2_hm_fayl where hujjat_kalit is not null);
delete from public.t2_hm_faoliyat where fayl_id in (select id from public.t2_hm_fayl where hujjat_kalit is not null);
delete from public.t2_hm_fayl where hujjat_kalit is not null;
delete from public.t2_fayl_papka where tizim = true and tizim_kalit is not null and not exists (select 1 from public.t2_hm_fayl f where f.papka_id = t2_fayl_papka.id);
update public.t2_fayl_papka set tizim = false where tizim = true;

create or replace function public.t2_hm_papka_amal_v1(p_actor bigint, p_kompaniya bigint, p_amal text, p_papka_id bigint default null, p_nom text default null, p_ota_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_nom text := public._t2_hm_nom_v1(p_nom); v_k bigint; v_e bigint; v_id bigint; v_x bigint; p public.t2_fayl_papka%rowtype; o public.t2_fayl_papka%rowtype;
begin
  if p_amal = 'yarat' then
    if p_ota_id is not null then
      select * into o from public.t2_fayl_papka where id = p_ota_id;
      if not found then return jsonb_build_object('ok', false, 'code', 'PAPKA_TOPILMADI'); end if;
      v_k := o.kompaniya_id; v_e := o.egasi_foydalanuvchi_id;
    else v_k := p_kompaniya; v_e := case when p_kompaniya is null then p_actor end; end if;
    if public._t2_hm_daraja_v1(p_actor, v_k, v_e, p_ota_id, null) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
    if v_nom is null or length(v_nom) > 120 then return jsonb_build_object('ok', false, 'code', 'NOM_NOTOGRI'); end if;
    begin
      insert into public.t2_fayl_papka(kompaniya_id, egasi_foydalanuvchi_id, ota_id, nom, yaratdi) values (v_k, v_e, p_ota_id, v_nom, p_actor) returning id into v_id;
    exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'NOM_BAND'); end;
    perform public._t2_hm_log_v1(v_k, v_e, null, p_actor, 'papka_yaratildi', v_nom);
    return jsonb_build_object('ok', true, 'papka_id', v_id);
  end if;

  select * into p from public.t2_fayl_papka where id = p_papka_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'PAPKA_TOPILMADI'); end if;
  if public._t2_hm_daraja_v1(p_actor, p.kompaniya_id, p.egasi_foydalanuvchi_id, p.id, null) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;

  if p_amal = 'nomla' then
    if v_nom is null or length(v_nom) > 120 then return jsonb_build_object('ok', false, 'code', 'NOM_NOTOGRI'); end if;
    begin update public.t2_fayl_papka set nom = v_nom, yangilandi = now() where id = p.id;
    exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'NOM_BAND'); end;
  elsif p_amal = 'kochir' then
    if p_ota_id is not null then
      select * into o from public.t2_fayl_papka where id = p_ota_id;
      if not found or o.kompaniya_id is distinct from p.kompaniya_id or o.egasi_foydalanuvchi_id is distinct from p.egasi_foydalanuvchi_id then
        return jsonb_build_object('ok', false, 'code', 'PAPKA_TOPILMADI'); end if;
      if public._t2_hm_daraja_v1(p_actor, o.kompaniya_id, o.egasi_foydalanuvchi_id, o.id, null) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
    end if;
    v_x := p_ota_id;
    while v_x is not null loop
      if v_x = p.id then return jsonb_build_object('ok', false, 'code', 'AYLANMA'); end if;
      select ota_id into v_x from public.t2_fayl_papka where id = v_x;
    end loop;
    begin update public.t2_fayl_papka set ota_id = p_ota_id, yangilandi = now() where id = p.id;
    exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'NOM_BAND'); end;
  elsif p_amal = 'ochir' then
    if exists (select 1 from public.t2_fayl_papka where ota_id = p.id) or exists (select 1 from public.t2_hm_fayl where papka_id = p.id) then
      return jsonb_build_object('ok', false, 'code', 'PAPKA_BOSH_EMAS'); end if;
    delete from public.t2_hm_ulashish where nishon_turi = 'papka' and nishon_id = p.id;
    delete from public.t2_fayl_papka where id = p.id;
  else return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM'); end if;
  perform public._t2_hm_log_v1(p.kompaniya_id, p.egasi_foydalanuvchi_id, null, p_actor, 'papka_' || p_amal, p.nom);
  return jsonb_build_object('ok', true);
end $$;

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
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom) order by lower(p.nom)), '[]'::jsonb) into v_pap
      from public.t2_fayl_papka p
     where p.kompaniya_id is not distinct from v_k and p.egasi_foydalanuvchi_id is not distinct from v_e and p.ota_id is not distinct from p_papka;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'nom', f.nom, 'mime', f.mime, 'bayt', vv.bayt, 'versiya', vv.raqam, 'yangilandi', f.yangilandi, 'savatda', f.savatda,
      'qulf_kim', case when f.qulf_tugaydi > now() then f.qulf_kim end,
      'qulf_ism', case when f.qulf_tugaydi > now() then u.ism end,
      'izohlar', (select count(*) from public.t2_hm_izoh z where z.fayl_id = f.id))
      order by lower(f.nom)), '[]'::jsonb) into v_fay
    from public.t2_hm_fayl f
    left join public.t2_hm_versiya vv on vv.id = f.joriy_versiya_id
    left join public.t2_foydalanuvchi u on u.id = f.qulf_kim
   where f.kompaniya_id is not distinct from v_k and f.egasi_foydalanuvchi_id is not distinct from v_e
     and (p_savat = (f.savatda is not null))
     and (p_savat or f.papka_id is not distinct from p_papka);

  return jsonb_build_object('ok', true, 'daraja', v_d, 'kompaniya_id', v_k, 'shaxsiy', v_k is null,
    'yol', v_yol, 'papkalar', v_pap, 'fayllar', v_fay, 'kvota', public._t2_hm_kvota_v1(v_k, v_e));
end $$;

create or replace function public.t2_hm_tozala_ol_v1(p_actor bigint default null, p_fayl_id bigint default null, p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.t2_hm_fayl%rowtype; v_f jsonb; v_v jsonb;
begin
  if p_fayl_id is not null then
    select * into f from public.t2_hm_fayl where id = p_fayl_id and savatda is not null;
    if not found then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
    if p_actor is not null and public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
    if p_actor is null then return jsonb_build_object('ok', false, 'code', 'ACTOR_KERAK'); end if;
    if public._t2_hm_pinli_fayl_v1(f.id) then return jsonb_build_object('ok', false, 'code', 'TAQDIMDA'); end if;
    select jsonb_build_array(jsonb_build_object('id', f.id, 'kalitlar', coalesce((select jsonb_agg(v.r2_kalit) from public.t2_hm_versiya v where v.fayl_id = f.id), '[]'::jsonb))) into v_f;
    return jsonb_build_object('ok', true, 'fayllar', v_f, 'versiyalar', '[]'::jsonb);
  end if;
  if p_actor is not null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kalitlar', (select coalesce(jsonb_agg(v.r2_kalit), '[]'::jsonb) from public.t2_hm_versiya v where v.fayl_id = x.id))), '[]'::jsonb) into v_f
    from (select id from public.t2_hm_fayl where savatda < now() - interval '30 days' and not public._t2_hm_pinli_fayl_v1(id) order by savatda limit least(greatest(coalesce(p_limit, 100), 1), 500)) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'kalit', v.r2_kalit)), '[]'::jsonb) into v_v
    from public.t2_hm_versiya v where v.holat = 'kutish' and v.yaratildi < now() - interval '1 day';
  return jsonb_build_object('ok', true, 'fayllar', v_f, 'versiyalar', v_v);
end $$;

create or replace function public.t2_hm_bosh_ol_v1(p_actor bigint, p_kompaniya bigint, p_amal text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_e bigint := case when p_kompaniya is null then p_actor end;
begin
  if public._t2_hm_daraja_v1(p_actor, p_kompaniya, v_e, null, null) < 4 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if p_amal = 'savat' then
    return jsonb_build_object('ok', true, 'fayllar', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kalitlar', (select coalesce(jsonb_agg(v.r2_kalit), '[]'::jsonb) from public.t2_hm_versiya v where v.fayl_id = f.id)))
        from public.t2_hm_fayl f where f.savatda is not null and f.kompaniya_id is not distinct from p_kompaniya and f.egasi_foydalanuvchi_id is not distinct from v_e
         and not public._t2_hm_pinli_fayl_v1(f.id)), '[]'::jsonb),
      'eski', '[]'::jsonb);
  elsif p_amal = 'eski_versiyalar' then
    return jsonb_build_object('ok', true, 'fayllar', '[]'::jsonb, 'eski', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'kalit', v.r2_kalit))
        from public.t2_hm_versiya v join public.t2_hm_fayl f on f.id = v.fayl_id
       where f.kompaniya_id is not distinct from p_kompaniya and f.egasi_foydalanuvchi_id is not distinct from v_e and f.savatda is null
         and v.holat = 'tayyor' and v.id is distinct from f.joriy_versiya_id and not public._t2_hm_pinli_versiya_v1(v.id)), '[]'::jsonb));
  end if;
  return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM');
end $$;

drop function if exists public.t2_disk_tizim_yoz_v1(bigint, bigint, bigint, text, bigint, text, bigint, text);
drop function if exists public._t2_disk_tizim_yoz_ich_v1(bigint, bigint, bigint, text, bigint, text, bigint, text);
drop function if exists public._t2_disk_nom_v1(public.t2_document_registry, text, text);
drop function if exists public._t2_disk_kalit_v1(public.t2_document_registry, bigint);
drop function if exists public._t2_disk_oy_v1(public.t2_document_registry);
drop function if exists public._t2_disk_shartnoma_v1(bigint, bigint);
drop function if exists public._t2_disk_yol_v1(bigint, bigint, bigint, bigint, text, text, text, bigint);
drop function if exists public._t2_disk_papka_v1(bigint, bigint, text, text, bigint);
drop function if exists public._t2_disk_tur_nom_v1(text);
drop index if exists public.t2_hm_versiya_registry_uq;
alter table public.t2_hm_versiya drop column if exists registry_id, drop column if exists tashqi_kalit;
drop index if exists public.t2_hm_fayl_hujjat_kalit_uq;
alter table public.t2_hm_fayl drop constraint if exists t2_hm_fayl_manba_chk;
alter table public.t2_hm_fayl drop column if exists hujjat_kalit, drop column if exists manba_id, drop column if exists manba_turi;
drop index if exists public.t2_fayl_papka_tizim_kalit_uq;
alter table public.t2_fayl_papka drop column if exists tizim_kalit, drop column if exists tizim;
