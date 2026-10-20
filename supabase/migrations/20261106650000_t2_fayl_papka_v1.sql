-- Fayl menejeri — Drive / «Мой компьютер» kabi (egasi 2026-10-20: «papkalar ierarxiyasi, ko'chirish, o'chirish, nomini
-- o'zgartirish»). Kanonik hujjat (t2_document_registry: obyekt, tur, reviziya, R2) O'ZGARMAYDI — aks holda smeta/F2 manbalari
-- buziladi (SOURCE_DOCUMENT_SCOPE_MISMATCH). Ustiga «joylashuv» qatlami:
--   t2_fayl_papka — kompaniyaning o'z papkalari (ierarxiya);
--   t2_fayl_joy   — hujjatning ko'rinadigan nomi, qaysi o'z papkasida turgani, savatdami.
-- Savat — faqat fayl menejeridan yashiradi; hujjat, uning baytlari va unga tayangan ma'lumotlar o'zgarmaydi.
-- Tizim papkalari (Loyiha → Obyekt → Tur → Oy) avvalgidek qoladi; o'z papkasiga ko'chirilgan fayl o'sha yerda ko'rinadi.

create table if not exists public.t2_fayl_papka (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  ota_id bigint references public.t2_fayl_papka(id),
  nom text not null check (length(btrim(nom)) between 1 and 120),
  yaratdi bigint,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create unique index if not exists t2_fayl_papka_nom_uq on public.t2_fayl_papka(kompaniya_id, coalesce(ota_id, 0), lower(btrim(nom)));
create index if not exists t2_fayl_papka_ota_ix on public.t2_fayl_papka(kompaniya_id, ota_id);

create table if not exists public.t2_fayl_joy (
  document_id bigint primary key references public.t2_document_registry(id),
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  nom text check (nom is null or length(btrim(nom)) between 1 and 200),
  papka_id bigint references public.t2_fayl_papka(id),
  savatda timestamptz,
  yangiladi bigint,
  yangilandi timestamptz not null default now()
);
create index if not exists t2_fayl_joy_papka_ix on public.t2_fayl_joy(papka_id) where papka_id is not null;

alter table public.t2_fayl_papka enable row level security;
alter table public.t2_fayl_joy enable row level security;
revoke all on public.t2_fayl_papka, public.t2_fayl_joy from public, anon, authenticated;

-- Bitta amal RPC'si. Faqat kompaniya a'zosi; kuzatuvchi/buyurtmachi/pudratchi — faqat o'qiydi.
create or replace function public.t2_fayl_amal_v1(p_actor_id bigint, p_kompaniya_id bigint, p_amal text,
  p_document_id bigint default null, p_papka_id bigint default null, p_nom text default null, p_ota_id bigint default null)
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
  if p_ota_id is not null and not exists (select 1 from public.t2_fayl_papka where id = p_ota_id and kompaniya_id = p_kompaniya_id) then
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
      insert into public.t2_fayl_papka(kompaniya_id, ota_id, nom, yaratdi) values (p_kompaniya_id, p_ota_id, v_nom, p_actor_id) returning id into v_id;
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
      v_x := p_ota_id;
      while v_x is not null loop
        if v_x = p_papka_id then return jsonb_build_object('ok', false, 'code', 'AYLANMA'); end if;
        select ota_id into v_x from public.t2_fayl_papka where id = v_x;
      end loop;
      begin
        update public.t2_fayl_papka set ota_id = p_ota_id, yangilandi = now() where id = p_papka_id;
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
      format('papka_id=%s; ota_id=%s; nom=%s; actor_id=%s', p_papka_id, p_ota_id, v_nom, p_actor_id), 'actor:' || p_actor_id, null);
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM');
end $function$;

revoke all on function public.t2_fayl_amal_v1(bigint, bigint, text, bigint, bigint, text, bigint) from public, anon, authenticated;
grant execute on function public.t2_fayl_amal_v1(bigint, bigint, text, bigint, bigint, text, bigint) to service_role;

-- Fayl menejeri o'qishi: qo'shimcha maydonlar (nom — ko'rinadigan nom, asl_nom, papka_id, savatda) va 'papkalar'.
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
    'papkalar', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'ota_id', p.ota_id, 'nom', p.nom) order by lower(p.nom))
        from public.t2_fayl_papka p where p.kompaniya_id = p_kompaniya_id), '[]'::jsonb),
    'fayllar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'nom', coalesce(j.nom, d.original_filename, 'hujjat-' || d.id),
        'asl_nom', coalesce(d.original_filename, 'hujjat-' || d.id),
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
        'slot', d.source_slot_key,
        'papka_id', j.papka_id,
        'savatda', j.savatda
      ) order by coalesce(d.finalized_at, d.created_at) desc, d.id desc)
      from public.t2_document_registry d
      left join public.t2_obyekt o on o.id = d.obyekt_id and o.kompaniya_id = d.kompaniya_id
      left join public.t2_loyiha l on l.id = coalesce(d.loyiha_id, o.loyiha_id) and l.kompaniya_id = d.kompaniya_id
      left join public.t2_fayl_joy j on j.document_id = d.id and j.kompaniya_id = d.kompaniya_id
      where d.kompaniya_id = p_kompaniya_id
        and d.canonical_storage_status = 'stored'
    ), '[]'::jsonb)
  );
end $function$;
