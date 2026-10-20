-- t2_fayl_amal_v1: p_ota_id -> p_ota_papka_id. /api/sb-yoz shlyuzi p_ota_id ni t2_qator egasi sifatida tekshiradi
-- (tenant-yozish.ts ID_JADVAL) — papka ota ID si u yerda topilmay rad etilardi. Yangi nom shlyuzda t2_fayl_papka ga bog'langan.
-- Parametr nomi o'zgargani uchun drop + create (create or replace nomni o'zgartira olmaydi). Mantiq aynan o'sha.
drop function if exists public.t2_fayl_amal_v1(bigint, bigint, text, bigint, bigint, text, bigint);

create or replace function public.t2_fayl_amal_v1(p_actor_id bigint, p_kompaniya_id bigint, p_amal text,
  p_document_id bigint default null, p_papka_id bigint default null, p_nom text default null, p_ota_papka_id bigint default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_rol text; v_nom text := nullif(btrim(coalesce(p_nom, '')), ''); v_id bigint; v_x bigint;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol in ('kuzatuvchi', 'buyurtmachi', 'pudratchi') then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;

  -- Hujjat va papkalar shu kompaniyaniki bo'lishi shart.
  if p_document_id is not null and not exists (select 1 from public.t2_document_registry where id = p_document_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'HUJJAT_TOPILMADI'); end if;
  if p_papka_id is not null and not exists (select 1 from public.t2_fayl_papka where id = p_papka_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'PAPKA_TOPILMADI'); end if;
  if p_ota_papka_id is not null and not exists (select 1 from public.t2_fayl_papka where id = p_ota_papka_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'PAPKA_TOPILMADI'); end if;

  if p_amal in ('nomla', 'kochir', 'savat', 'tikla') then
    if p_document_id is null then return jsonb_build_object('ok', false, 'code', 'HUJJAT_KERAK'); end if;
    insert into public.t2_fayl_joy(document_id, kompaniya_id) values (p_document_id, p_kompaniya_id) on conflict (document_id) do nothing;
    if p_amal = 'nomla' then
      if v_nom is not null and length(v_nom) > 200 then return jsonb_build_object('ok', false, 'code', 'NOM_UZUN'); end if;
      update public.t2_fayl_joy set nom = v_nom, yangiladi = p_actor_id, yangilandi = now() where document_id = p_document_id;
    elsif p_amal = 'kochir' then
      update public.t2_fayl_joy set papka_id = p_papka_id, yangiladi = p_actor_id, yangilandi = now() where document_id = p_document_id;
    elsif p_amal = 'savat' then
      update public.t2_fayl_joy set savatda = now(), yangiladi = p_actor_id, yangilandi = now() where document_id = p_document_id;
    else
      update public.t2_fayl_joy set savatda = null, yangiladi = p_actor_id, yangilandi = now() where document_id = p_document_id;
    end if;
    perform public.t2_audit_yoz(p_kompaniya_id, 'fayl_' || p_amal, 'fayl_menejer', null,
      format('document_id=%s; papka_id=%s; nom=%s; actor_id=%s', p_document_id, p_papka_id, v_nom, p_actor_id), 'actor:' || p_actor_id, null);
    return jsonb_build_object('ok', true);
  end if;

  if p_amal = 'papka_yarat' then
    if v_nom is null or length(v_nom) > 120 then return jsonb_build_object('ok', false, 'code', 'NOM_NOTOGRI'); end if;
    begin
      insert into public.t2_fayl_papka(kompaniya_id, ota_id, nom, yaratdi) values (p_kompaniya_id, p_ota_papka_id, v_nom, p_actor_id) returning id into v_id;
    exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'NOM_BAND'); end;
    return jsonb_build_object('ok', true, 'papka_id', v_id);
  end if;

  if p_amal in ('papka_nomla', 'papka_kochir', 'papka_ochir') then
    if p_papka_id is null then return jsonb_build_object('ok', false, 'code', 'PAPKA_KERAK'); end if;
    if p_amal = 'papka_nomla' then
      if v_nom is null or length(v_nom) > 120 then return jsonb_build_object('ok', false, 'code', 'NOM_NOTOGRI'); end if;
      begin
        update public.t2_fayl_papka set nom = v_nom, yangilandi = now() where id = p_papka_id;
      exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'NOM_BAND'); end;
    elsif p_amal = 'papka_kochir' then
      -- Papkani o'zining ichiga (yoki avlodiga) ko'chirib bo'lmaydi.
      v_x := p_ota_papka_id;
      while v_x is not null loop
        if v_x = p_papka_id then return jsonb_build_object('ok', false, 'code', 'AYLANMA'); end if;
        select ota_id into v_x from public.t2_fayl_papka where id = v_x;
      end loop;
      begin
        update public.t2_fayl_papka set ota_id = p_ota_papka_id, yangilandi = now() where id = p_papka_id;
      exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'NOM_BAND'); end;
    else
      if exists (select 1 from public.t2_fayl_papka where ota_id = p_papka_id)
         or exists (select 1 from public.t2_fayl_joy where papka_id = p_papka_id and savatda is null) then
        return jsonb_build_object('ok', false, 'code', 'PAPKA_BOSH_EMAS');
      end if;
      update public.t2_fayl_joy set papka_id = null where papka_id = p_papka_id; -- savatdagilar asl joyiga qaytadi
      delete from public.t2_fayl_papka where id = p_papka_id;
    end if;
    perform public.t2_audit_yoz(p_kompaniya_id, 'fayl_' || p_amal, 'fayl_menejer', null,
      format('papka_id=%s; ota_id=%s; nom=%s; actor_id=%s', p_papka_id, p_ota_papka_id, v_nom, p_actor_id), 'actor:' || p_actor_id, null);
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM');
end $function$;

revoke all on function public.t2_fayl_amal_v1(bigint, bigint, text, bigint, bigint, text, bigint) from public, anon, authenticated;
grant execute on function public.t2_fayl_amal_v1(bigint, bigint, text, bigint, bigint, text, bigint) to service_role;
