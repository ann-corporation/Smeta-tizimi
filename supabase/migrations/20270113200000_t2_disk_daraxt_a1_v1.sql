-- Disk A1: kompaniya diski = BITTA daraxt. Tizim hujjatlari (t2_document_registry, 'stored') t2_hm modeliga ko'rinish sifatida ulanadi:
--   Loyiha -> Shartnoma -> Obyekt -> Hujjat turi -> Oy (obyekt darajasidagi: F-2, nakopitelniy, slichitelniy, AOSR, smeta ...)
--   Loyiha -> Shartnoma -> Hujjat turi -> Oy        (shartnoma darajasidagi: F-3, sverka, oylik paket, shartnoma svodkasi)
--   loyihasiz/obyektsiz -> "Biriktirilmagan" (A4: AI taklifi).
-- Qarorlar (REJA.md, egasi tasdiqlagan):
--  * t2_document_registry QOLADI (bayt daftari: smeta manba FK lari, /api/hujjat-ol). R2 ga TEGILMAYDI: t2_hm_versiya.r2_kalit = o'sha obyektga
--    havola (tashqi_kalit = true), tozalash funksiyalari bunday kalitni HECH QACHON R2 dan o'chirmaydi.
--  * Hajm bir marta: faqat t2_hm_versiya.bayt (registry hajmi _t2_hm_kvota_v1 ga QO'SHILMAYDI).
--  * Tizim papkalari (tizim = true, tizim_kalit) avtomatik yaratiladi; o'chirish/ko'chirish/nomlash serverda rad etiladi (TIZIM_PAPKA); ichiga
--    foydalanuvchi o'z fayli va papkasini qo'sha oladi.
--  * Bir hujjat = bitta t2_hm_fayl (hujjat_kalit): qayta yasalsa YANGI VERSIYA (bir xil sha256 bo'lsa qo'shilmaydi). Foydalanuvchi faylni
--    ko'chirsa/nomlasa - yangi versiyalar o'sha joyda qoladi.
--  * Manba (tur + id) fayl metama'lumotida (B bosqichi: "Tizimda ochish").
-- Hamma funksiya faqat service_role.

alter table public.t2_fayl_papka add column if not exists tizim boolean not null default false;
alter table public.t2_fayl_papka add column if not exists tizim_kalit text;
create unique index if not exists t2_fayl_papka_tizim_kalit_uq on public.t2_fayl_papka(kompaniya_id, tizim_kalit) where tizim_kalit is not null;

alter table public.t2_hm_fayl add column if not exists manba_turi text;
alter table public.t2_hm_fayl add column if not exists manba_id bigint;
alter table public.t2_hm_fayl add column if not exists hujjat_kalit text;
alter table public.t2_hm_fayl add constraint t2_hm_fayl_manba_chk
  check ((manba_turi is null or manba_turi ~ '^[a-z0-9_]{2,40}$') and (hujjat_kalit is null or length(hujjat_kalit) between 3 and 240)) not valid;
create unique index if not exists t2_hm_fayl_hujjat_kalit_uq on public.t2_hm_fayl(kompaniya_id, hujjat_kalit) where hujjat_kalit is not null;

alter table public.t2_hm_versiya add column if not exists tashqi_kalit boolean not null default false;
alter table public.t2_hm_versiya add column if not exists registry_id bigint references public.t2_document_registry(id);
create unique index if not exists t2_hm_versiya_registry_uq on public.t2_hm_versiya(registry_id) where registry_id is not null;

-- ---------------------------------------------------------------- yordamchilar
create or replace function public._t2_disk_tur_nom_v1(p_tur text)
returns text language sql immutable as $$
  select case lower(coalesce(p_tur, ''))
    when 'f2_hujjat' then 'F-2 hujjatlari' when 'f2_akt' then 'F-2 aktlari (import manbasi)' when 'f3' then 'F-3' when 'forma3' then 'F-3'
    when 'nakopitelniy' then 'Nakopitelniy' when 'slichitelniy' then 'Slichitelniy' when 'ostatka' then 'Ostatka' when 'm29' then 'M-29' when 'aosr' then 'AOSR'
    when 'smeta' then 'Smetalar' when 'smeta_lrv' then 'LRV' when 'smeta_res' then 'RES' when 'nashr' then 'Nashr qilingan hujjatlar'
    when 'warehouse_receipt' then 'Ombor kirimlari' when 'sverka' then 'Sverka' when 'shartnoma_oylik_paket' then 'Oylik paket' when 'shartnoma' then 'Shartnomalar'
    when 'hujjat' then 'Boshqa hujjatlar' else left(coalesce(nullif(btrim(p_tur), ''), 'Boshqa hujjatlar'), 80) end $$;

-- Tizim papkasi: kalit bo'yicha topadi yoki yaratadi (idempotent). Nom band bo'lsa (foydalanuvchi papkasi) kalit xeshi qo'shiladi.
create or replace function public._t2_disk_papka_v1(p_kompaniya bigint, p_ota bigint, p_nom text, p_kalit text, p_actor bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v bigint; v_nom text := left(coalesce(nullif(btrim(p_nom), ''), 'Papka'), 120);
begin
  select id into v from public.t2_fayl_papka where kompaniya_id = p_kompaniya and tizim_kalit = p_kalit;
  if found then return v; end if;
  begin
    insert into public.t2_fayl_papka(kompaniya_id, ota_id, nom, yaratdi, tizim, tizim_kalit) values (p_kompaniya, p_ota, v_nom, nullif(p_actor, 0), true, p_kalit) returning id into v;
    return v;
  exception when unique_violation then
    select id into v from public.t2_fayl_papka where kompaniya_id = p_kompaniya and tizim_kalit = p_kalit;
    if found then return v; end if;
    insert into public.t2_fayl_papka(kompaniya_id, ota_id, nom, yaratdi, tizim, tizim_kalit)
    values (p_kompaniya, p_ota, left(v_nom, 110) || ' [' || substr(md5(p_kalit), 1, 6) || ']', nullif(p_actor, 0), true, p_kalit) returning id into v;
    return v;
  end;
end $$;

-- Hujjat joyi (barg papka): daraja 'shartnoma' (shartnomasiz bo'lsa obyekt darajasiga qaytadi) | 'obyekt'.
create or replace function public._t2_disk_yol_v1(p_kompaniya bigint, p_loyiha bigint, p_shartnoma bigint, p_obyekt bigint, p_daraja text, p_tur text, p_oy text, p_actor bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_l bigint := p_loyiha; v_o bigint := p_obyekt; v_s bigint := p_shartnoma; v_f bigint; v_kalit text; v_nom text; v_ol bigint;
begin
  if v_o is not null then
    select o.loyiha_id into v_ol from public.t2_obyekt o where o.id = v_o and o.kompaniya_id = p_kompaniya;
    if not found then v_o := null; else v_l := coalesce(v_l, v_ol); end if;
  end if;
  if v_l is not null and not exists (select 1 from public.t2_loyiha l where l.id = v_l and l.kompaniya_id = p_kompaniya) then v_l := null; end if;
  if v_l is null then return public._t2_disk_papka_v1(p_kompaniya, null, 'Biriktirilmagan', 'biriktirilmagan', p_actor); end if;
  select l.nom into v_nom from public.t2_loyiha l where l.id = v_l;
  v_kalit := 'loyiha:' || v_l; v_f := public._t2_disk_papka_v1(p_kompaniya, null, v_nom, v_kalit, p_actor);
  if v_s is not null then
    select 'Shartnoma ' || chr(8470) || coalesce(nullif(btrim(s.raqam), ''), nullif(btrim(s.nom), ''), s.id::text) into v_nom from public.t2_shartnoma s where s.id = v_s and s.kompaniya_id = p_kompaniya;
    if found then v_kalit := v_kalit || '/shartnoma:' || v_s; v_f := public._t2_disk_papka_v1(p_kompaniya, v_f, v_nom, v_kalit, p_actor); else v_s := null; end if;
  end if;
  if (p_daraja is distinct from 'shartnoma' or v_s is null) and v_o is not null then
    select o.nom into v_nom from public.t2_obyekt o where o.id = v_o;
    v_kalit := v_kalit || '/obyekt:' || v_o; v_f := public._t2_disk_papka_v1(p_kompaniya, v_f, v_nom, v_kalit, p_actor);
  end if;
  v_kalit := v_kalit || '/tur:' || lower(coalesce(nullif(btrim(p_tur), ''), 'hujjat'));
  v_f := public._t2_disk_papka_v1(p_kompaniya, v_f, public._t2_disk_tur_nom_v1(p_tur), v_kalit, p_actor);
  if p_oy is not null and p_oy ~ '^\d{4}-\d{2}$' then
    v_kalit := v_kalit || '/oy:' || p_oy; v_f := public._t2_disk_papka_v1(p_kompaniya, v_f, p_oy, v_kalit, p_actor);
  end if;
  return v_f;
end $$;

-- Obyektning faol shartnomasi (bir nechta bo'lsa - eng kichik id).
create or replace function public._t2_disk_shartnoma_v1(p_kompaniya bigint, p_obyekt bigint)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select b.shartnoma_id from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id and s.kompaniya_id = p_kompaniya
   where b.obyekt_id = p_obyekt and b.holat = 'faol' order by b.shartnoma_id limit 1 $$;

-- Hisobot oyi: registry.revision (YYYY-MM...) yoki importlangan F-2 fayl nomi (YYYY-MM__RAQAM__...).
create or replace function public._t2_disk_oy_v1(d public.t2_document_registry)
returns text language sql immutable as $$
  select case when d.revision ~ '^\d{4}-\d{2}' then left(d.revision, 7) when d.original_filename ~ '^\d{4}-\d{2}__' then left(d.original_filename, 7) end $$;

-- Hujjat kaliti (bir hujjat = bitta kalit). f2_akt: obyekt + akt raqami; smeta*: obyekt + slot/nom; nashr: sanasiz nom; f3: shartnoma + oy;
-- qolganlari: tur + obyekt + oy. (Yangi hujjatlar kalitni chaqiruvchidan oladi: F-2 = akt_id, F-3 = forma3_id.)
create or replace function public._t2_disk_kalit_v1(d public.t2_document_registry, p_shartnoma bigint)
returns text language sql immutable as $$
  select left(case
    when d.document_type = 'f2_akt' and d.original_filename ~ '^\d{4}-\d{2}__[^_]' then 'f2_akt:' || coalesce(d.obyekt_id, 0) || ':' || split_part(d.original_filename, '__', 2)
    when d.document_type in ('smeta', 'smeta_lrv', 'smeta_res') then d.document_type || ':' || coalesce(d.obyekt_id, 0) || ':' || coalesce(d.source_slot_key, d.original_filename, d.id::text)
    when d.document_type = 'nashr' then 'nashr:' || coalesce(d.obyekt_id, 0) || ':' || regexp_replace(regexp_replace(coalesce(d.original_filename, d.id::text), '\.[A-Za-z0-9]+$', ''), '[_ -]?\d{4}-\d{2}-\d{2}', '', 'g')
    when d.document_type = 'f3' then 'f3:sh' || coalesce(p_shartnoma, 0) || ':' || coalesce(public._t2_disk_oy_v1(d), '-')
    else d.document_type || ':' || coalesce(d.obyekt_id, 0) || ':' || coalesce(public._t2_disk_oy_v1(d), '-') end, 240) $$;

-- Ko'rinadigan nom (Latin; '№' = chr(8470), '—' = chr(8212)); noma'lum tur - asl fayl nomi.
create or replace function public._t2_disk_nom_v1(d public.t2_document_registry, p_obyekt_nom text, p_shartnoma_raqam text)
returns text language sql immutable as $$
  select left(coalesce(case
      when d.document_type = 'f2_akt' and d.original_filename ~ '^\d{4}-\d{2}__[^_]' then 'F-2 ' || chr(8470) || ltrim(split_part(d.original_filename, '__', 2), '0') || ' ' || chr(8212) || ' ' || coalesce(p_obyekt_nom, '?') || ' ' || chr(8212) || ' ' || left(d.original_filename, 7)
      when d.document_type = 'f2_hujjat' then 'F-2 ' || chr(8212) || ' ' || coalesce(p_obyekt_nom, '?') || coalesce(' ' || chr(8212) || ' ' || public._t2_disk_oy_v1(d), '')
      when d.document_type = 'f3' then 'F-3' || coalesce(' ' || chr(8212) || ' shartnoma ' || chr(8470) || p_shartnoma_raqam, '') || coalesce(' ' || chr(8212) || ' ' || public._t2_disk_oy_v1(d), '')
      when d.document_type in ('nakopitelniy', 'slichitelniy', 'ostatka', 'm29', 'aosr') then public._t2_disk_tur_nom_v1(d.document_type) || ' ' || chr(8212) || ' ' || coalesce(p_obyekt_nom, '?') || coalesce(' ' || chr(8212) || ' ' || public._t2_disk_oy_v1(d), '')
    end, d.original_filename, 'hujjat-' || d.id), 200) $$;

-- YAGONA yozuvchi (a'zolik tekshiruvisiz ichki shakl: backfill va server avtoarxiv). Qayta chaqirish xavfsiz (idempotent).
create or replace function public._t2_disk_tizim_yoz_ich_v1(p_actor bigint, p_kompaniya bigint, p_registry_id bigint, p_manba_turi text, p_manba_id bigint,
  p_hujjat_kalit text, p_shartnoma_id bigint, p_nom text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.t2_document_registry%rowtype; f public.t2_hm_fayl%rowtype; v public.t2_hm_versiya%rowtype; v_sh bigint; v_kalit text; v_tur text; v_daraja text; v_leaf bigint;
  v_onom text; v_shraqam text; v_nom text; v_sha text; v_bayt bigint; v_raqam integer; v_yangi boolean := false; v_mime text;
begin
  select * into d from public.t2_document_registry where id = p_registry_id and kompaniya_id = p_kompaniya and canonical_storage_status = 'stored';
  if not found then return jsonb_build_object('ok', false, 'code', 'HUJJAT_TOPILMADI'); end if;
  select * into v from public.t2_hm_versiya where registry_id = d.id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'fayl_id', v.fayl_id, 'versiya_id', v.id, 'raqam', v.raqam); end if;

  v_sh := p_shartnoma_id;
  if v_sh is not null and not exists (select 1 from public.t2_shartnoma s where s.id = v_sh and s.kompaniya_id = p_kompaniya) then v_sh := null; end if;
  if v_sh is null and d.obyekt_id is not null then v_sh := public._t2_disk_shartnoma_v1(p_kompaniya, d.obyekt_id); end if;
  select o.nom into v_onom from public.t2_obyekt o where o.id = d.obyekt_id and o.kompaniya_id = p_kompaniya;
  select s.raqam into v_shraqam from public.t2_shartnoma s where s.id = v_sh;
  v_kalit := coalesce(nullif(btrim(coalesce(p_hujjat_kalit, '')), ''), public._t2_disk_kalit_v1(d, v_sh));
  v_tur := coalesce(nullif(lower(btrim(coalesce(p_manba_turi, ''))), ''),
                    case d.document_type when 'f2_hujjat' then 'f2' when 'f3' then 'forma3' when 'smeta_lrv' then 'smeta' when 'smeta_res' then 'smeta'
                      else left(regexp_replace(lower(d.document_type), '[^a-z0-9_]+', '_', 'g'), 40) end);
  v_daraja := case when v_tur in ('forma3', 'f3', 'sverka', 'oylik_paket', 'shartnoma_oylik_paket', 'shartnoma_svod') or d.document_type in ('f3', 'sverka', 'shartnoma_oylik_paket') then 'shartnoma' else 'obyekt' end;

  select * into f from public.t2_hm_fayl where kompaniya_id = p_kompaniya and hujjat_kalit = v_kalit for update;
  v_sha := case when d.sha256 ~ '^[0-9a-f]{64}$' then d.sha256 else encode(sha256(convert_to(coalesce(d.blob_key, d.r2_key, d.id::text), 'UTF8')), 'hex') end;
  v_bayt := greatest(coalesce(nullif(d.size_bytes, 0), nullif(d.expected_size_bytes, 0), 1), 1);
  v_mime := coalesce(nullif(btrim(d.mime_type), ''), 'application/octet-stream');
  if found then
    -- bir xil mazmun allaqachon shu hujjatning versiyasi: yangi versiya qo'shilmaydi
    if exists (select 1 from public.t2_hm_versiya x where x.fayl_id = f.id and x.sha256 = v_sha) then
      return jsonb_build_object('ok', true, 'takror', true, 'fayl_id', f.id, 'dedup', true);
    end if;
  else
    v_leaf := public._t2_disk_yol_v1(p_kompaniya, d.loyiha_id, v_sh, d.obyekt_id, v_daraja, d.document_type, public._t2_disk_oy_v1(d), p_actor);
    v_nom := left(coalesce(nullif(btrim(coalesce(p_nom, '')), ''), public._t2_disk_nom_v1(d, v_onom, v_shraqam)), 200);
    if exists (select 1 from public.t2_hm_fayl x where x.kompaniya_id = p_kompaniya and x.papka_id is not distinct from v_leaf and lower(x.nom) = lower(v_nom) and x.savatda is null) then
      v_nom := left(v_nom, 180) || ' (#' || d.id || ')';
    end if;
    insert into public.t2_hm_fayl(kompaniya_id, papka_id, nom, mime, yaratdi_id, yaratildi, yangilandi, manba_turi, manba_id, hujjat_kalit)
    values (p_kompaniya, v_leaf, v_nom, v_mime, coalesce(nullif(p_actor, 0), d.actor_id, 0), coalesce(d.finalized_at, d.created_at, now()), coalesce(d.finalized_at, d.created_at, now()), v_tur, p_manba_id, v_kalit)
    returning * into f;
    v_yangi := true;
  end if;
  select coalesce(max(raqam), 0) + 1 into v_raqam from public.t2_hm_versiya where fayl_id = f.id;
  insert into public.t2_hm_versiya(fayl_id, raqam, r2_kalit, bayt, sha256, mime, holat, yukladi_id, yaratildi, tashqi_kalit, registry_id)
  values (f.id, v_raqam, coalesce(d.blob_key, d.r2_key, 'registry/' || d.id), v_bayt, v_sha, v_mime, 'tayyor', coalesce(d.actor_id, nullif(p_actor, 0), 0), coalesce(d.finalized_at, d.created_at, now()), true, d.id)
  returning * into v;
  update public.t2_hm_fayl set joriy_versiya_id = v.id, mime = v_mime, yangilandi = now(),
         manba_turi = coalesce(manba_turi, v_tur), manba_id = coalesce(p_manba_id, manba_id)
   where id = f.id;
  if p_actor > 0 then
    perform public._t2_hm_log_v1(p_kompaniya, null, f.id, p_actor, case when v_yangi then 'tizim_hujjat' else 'yangi_versiya' end, left(f.nom, 200) || ' v' || v_raqam);
  end if;
  return jsonb_build_object('ok', true, 'fayl_id', f.id, 'versiya_id', v.id, 'raqam', v_raqam, 'papka_id', f.papka_id, 'yangi', v_yangi);
end $$;

-- Tashqi shakl (server avtoarxiv): a'zolik tekshiriladi.
create or replace function public.t2_disk_tizim_yoz_v1(p_actor bigint, p_kompaniya bigint, p_registry_id bigint, p_manba_turi text, p_manba_id bigint,
  p_hujjat_kalit text, p_shartnoma_id bigint, p_nom text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya, p_actor);
  if p_manba_turi is not null and lower(btrim(p_manba_turi)) !~ '^[a-z0-9_]{2,40}$' then return jsonb_build_object('ok', false, 'code', 'MANBA_NOTOGRI'); end if;
  if p_hujjat_kalit is not null and length(btrim(p_hujjat_kalit)) not between 3 and 240 then return jsonb_build_object('ok', false, 'code', 'KALIT_NOTOGRI'); end if;
  return public._t2_disk_tizim_yoz_ich_v1(p_actor, p_kompaniya, p_registry_id, p_manba_turi, p_manba_id, p_hujjat_kalit, p_shartnoma_id, p_nom);
end $$;

-- ---------------------------------------------------------------- almashtiriladigan funksiyalar (asl nusxalar + minimal o'zgarish)
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
  if p.tizim and p_amal in ('nomla', 'kochir', 'ochir') then return jsonb_build_object('ok', false, 'code', 'TIZIM_PAPKA'); end if;

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
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'tizim', p.tizim) order by lower(p.nom)), '[]'::jsonb) into v_pap
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
    select jsonb_build_array(jsonb_build_object('id', f.id, 'kalitlar', coalesce((select jsonb_agg(v.r2_kalit) from public.t2_hm_versiya v where v.fayl_id = f.id and not v.tashqi_kalit), '[]'::jsonb))) into v_f;
    return jsonb_build_object('ok', true, 'fayllar', v_f, 'versiyalar', '[]'::jsonb);
  end if;
  if p_actor is not null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kalitlar', (select coalesce(jsonb_agg(v.r2_kalit), '[]'::jsonb) from public.t2_hm_versiya v where v.fayl_id = x.id and not v.tashqi_kalit))), '[]'::jsonb) into v_f
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
    return jsonb_build_object('ok', true, 'fayllar', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kalitlar', (select coalesce(jsonb_agg(v.r2_kalit), '[]'::jsonb) from public.t2_hm_versiya v where v.fayl_id = f.id and not v.tashqi_kalit)))
        from public.t2_hm_fayl f where f.savatda is not null and f.kompaniya_id is not distinct from p_kompaniya and f.egasi_foydalanuvchi_id is not distinct from v_e
         and not public._t2_hm_pinli_fayl_v1(f.id)), '[]'::jsonb),
      'eski', '[]'::jsonb);
  elsif p_amal = 'eski_versiyalar' then
    return jsonb_build_object('ok', true, 'fayllar', '[]'::jsonb, 'eski', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'kalit', v.r2_kalit))
        from public.t2_hm_versiya v join public.t2_hm_fayl f on f.id = v.fayl_id
       where f.kompaniya_id is not distinct from p_kompaniya and f.egasi_foydalanuvchi_id is not distinct from v_e and f.savatda is null
         and v.holat = 'tayyor' and v.id is distinct from f.joriy_versiya_id and not public._t2_hm_pinli_versiya_v1(v.id) and not v.tashqi_kalit), '[]'::jsonb));
  end if;
  return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM');
end $$;

-- ---------------------------------------------------------------- BACKFILL (idempotent; R2 ga tegilmaydi, registry qatorlari qoladi)
do $bf$
declare r record; j record; v_f bigint;
begin
  for r in select id, kompaniya_id, actor_id from public.t2_document_registry where canonical_storage_status = 'stored' order by id loop
    perform public._t2_disk_tizim_yoz_ich_v1(0, r.kompaniya_id, r.id, null, null, null, null, null);
  end loop;
  -- Eski fayl menejeridagi foydalanuvchi o'zgarishlari (nom, o'z papkasi, savat) yo'qolmasin.
  for j in select jj.*, d as dd from public.t2_fayl_joy jj join public.t2_document_registry d on d.id = jj.document_id and d.canonical_storage_status = 'stored' loop
    select f.id into v_f from public.t2_hm_fayl f where f.kompaniya_id = j.kompaniya_id
       and f.hujjat_kalit = public._t2_disk_kalit_v1(j.dd, public._t2_disk_shartnoma_v1(j.kompaniya_id, (j.dd).obyekt_id));
    continue when v_f is null;
    begin if j.nom is not null then update public.t2_hm_fayl set nom = left(j.nom, 200) where id = v_f; end if;
    exception when unique_violation then null; end;
    begin if j.papka_id is not null and exists (select 1 from public.t2_fayl_papka p where p.id = j.papka_id and p.kompaniya_id = j.kompaniya_id) then update public.t2_hm_fayl set papka_id = j.papka_id where id = v_f; end if;
    exception when unique_violation then null; end;
    if j.savatda is not null then update public.t2_hm_fayl set savatda = j.savatda where id = v_f; end if;
  end loop;
end $bf$;

do $g$ declare s text; begin
  foreach s in array array['_t2_disk_tur_nom_v1(text)', '_t2_disk_papka_v1(bigint, bigint, text, text, bigint)',
    '_t2_disk_yol_v1(bigint, bigint, bigint, bigint, text, text, text, bigint)', '_t2_disk_shartnoma_v1(bigint, bigint)', '_t2_disk_oy_v1(t2_document_registry)',
    '_t2_disk_kalit_v1(t2_document_registry, bigint)', '_t2_disk_nom_v1(t2_document_registry, text, text)',
    '_t2_disk_tizim_yoz_ich_v1(bigint, bigint, bigint, text, bigint, text, bigint, text)', 't2_disk_tizim_yoz_v1(bigint, bigint, bigint, text, bigint, text, bigint, text)',
    't2_hm_papka_amal_v1(bigint, bigint, text, bigint, text, bigint)', 't2_hm_royxat_v1(bigint, bigint, bigint, boolean)',
    't2_hm_tozala_ol_v1(bigint, bigint, integer)', 't2_hm_bosh_ol_v1(bigint, bigint, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', s);
    execute format('grant execute on function public.%s to service_role', s);
  end loop;
end $g$;
