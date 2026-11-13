-- ROLLBACK 20261214100000: texnadzor tekshiruvi. Eslatma: t2_tekshiruv va t2_aosr_foto ma'lumoti o'chadi (avval eksport qiling).
drop function if exists public.t2_nazorat_f2_tekshiruv_v1(bigint, bigint, bigint, bigint);
drop function if exists public.t2_aosr_foto_biriktir_v1(bigint, bigint, bigint, bigint[]);
drop function if exists public.t2_nazorat_aosr_korik_v1(bigint, bigint, bigint);
drop function if exists public.t2_nazorat_uy_v1(bigint, bigint);
drop function if exists public.t2_nazorat_tekshiruv_tafsilot_v1(bigint, bigint, bigint);
drop function if exists public.t2_nazorat_tekshiruvlar_v1(bigint, bigint, date, date, bigint, integer);
drop function if exists public.t2_nazorat_tekshiruv_yoz_v1(bigint, bigint, uuid, bigint, bigint, bigint, date, text, text, jsonb, text, boolean, integer);

-- javob: eski (foto majburiyatsiz)
create or replace function public.t2_tomon_murojaat_javob_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint, p_matn text, p_document_ids bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.t2_tomon_murojaat; v_son integer;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'murojaat');
  select * into m from public.t2_tomon_murojaat where id = p_id for update;
  if not found or m.ijrochi_kompaniya_id <> p_kompaniya_id or public._t2_tomon_murojaat_olish(p_id, p_kompaniya_id, true) is null then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Murojaat topilmadi');
  end if;
  if m.holat <> 'ochiq' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Murojaat bajarishga ochiq emas'); end if;
  if length(btrim(coalesce(p_matn, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'JAVOB_KERAK', 'error', 'Nima qilinganini yozing'); end if;
  v_son := public._t2_tomon_dalil_biriktir(m, p_kompaniya_id, p_actor_id, p_document_ids);
  update public.t2_tomon_murojaat set holat = 'bajarildi', javob_actor_id = p_actor_id, javob_vaqti = now(), javob_matn = btrim(p_matn), versiya = versiya + 1, yangilandi = now() where id = m.id;
  insert into public.t2_tomon_hodisa (aloqa_id, murojaat_id, kompaniya_id, actor_id, tur, matn, meta) values (m.aloqa_id, m.id, p_kompaniya_id, p_actor_id, 'murojaat_javob', btrim(p_matn), jsonb_build_object('dalil_soni', v_son, 'raund', m.raund));
  return jsonb_build_object('ok', true, 'id', m.id, 'holat', 'bajarildi', 'dalil_soni', v_son);
end $$;

-- hujjat_ol: АОСР tarmog'isiz
create or replace function public.t2_tomon_hujjat_ol_v1(p_actor_id bigint, p_document_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_egasi bigint; d public.t2_document_registry;
begin
  if p_actor_id is null or p_actor_id <= 0 or p_document_id is null or p_document_id <= 0 then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_FORBIDDEN'); end if;
  select t.taqdim_etuvchi_kompaniya_id into v_egasi
    from public.t2_tomon_taqdim t join public.t2_tomon_aloqa a on a.id = t.aloqa_id and a.holat = 'faol'
   where t.manba_jadval = 't2_document_registry' and t.manba_id = p_document_id and t.holat in ('yuborilgan','ko_rilmoqda','qabul')
     and exists (select 1 from public.t2_azolik z where z.foydalanuvchi_id = p_actor_id and z.kompaniya_id = t.qabul_qiluvchi_kompaniya_id and z.holat = 'faol')
   order by t.id desc limit 1;
  if v_egasi is null then
    select h.kompaniya_id into v_egasi
      from public.t2_tomon_murojaat_hujjat h
      join public.t2_tomon_murojaat m on m.id = h.murojaat_id and m.holat <> 'bekor'
      join public.t2_tomon_aloqa a on a.id = m.aloqa_id and a.holat = 'faol'
     where h.document_id = p_document_id
       and exists (select 1 from public.t2_azolik z where z.foydalanuvchi_id = p_actor_id and z.holat = 'faol' and z.kompaniya_id in (m.beruvchi_kompaniya_id, m.ijrochi_kompaniya_id))
     order by h.id desc limit 1;
  end if;
  if v_egasi is null then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_FORBIDDEN'); end if;
  select * into d from public.t2_document_registry where id = p_document_id and kompaniya_id = v_egasi;
  if not found then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_NOT_FOUND'); end if;
  if d.canonical_storage_status is distinct from 'stored' or d.r2_key is null then return jsonb_build_object('ok', false, 'code', 'CANONICAL_BINARY_MISSING'); end if;
  return jsonb_build_object('ok', true, 'document_id', d.id, 'r2_key', d.r2_key, 'blob_key', coalesce(d.blob_key, d.r2_key), 'mime_type', d.mime_type, 'original_filename', d.original_filename, 'size_bytes', d.size_bytes, 'sha256', d.sha256);
end $$;

drop index if exists public.t2_tomon_murojaat_tekshiruv_idx;
alter table public.t2_tomon_murojaat drop column if exists band_kod, drop column if exists tekshiruv_id;
drop table if exists public.t2_aosr_foto;
drop table if exists public.t2_tekshiruv;
update public.t2_tomon_resurs set faol = false where kalit = 'fakt';

-- rol qoidasi: hotfix (20261214990000) holati saqlanadi - 'murojaat' amali QAYTA TUSHIRILMAYDI
create or replace function public._t2_tomon_rol_ok(p_rol text, p_amal text) returns boolean
language sql immutable as $$
  select case p_amal
    when 'boshqarish' then p_rol in ('superadmin','admin','boss','rahbar','director')
    when 'taqdim'     then p_rol in ('superadmin','admin','boss','rahbar','director','pto')
    when 'qaror'      then p_rol in ('superadmin','admin','boss','rahbar','director','buyurtmachi','inspektor')
    when 'murojaat'   then p_rol in ('superadmin','admin','boss','rahbar','director','pto','prorab','buyurtmachi','inspektor','loyihachi')
    when 'izoh'       then p_rol not in ('kuzatuvchi')
    when 'korish'     then true
    else false end
$$;

-- grant_saqla: avto-fakt siz (asl holat). Avto berilgan 'fakt' grantlar qoladi; kerak bo'lsa bekor qiling.
create or replace function public.t2_tomon_grant_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_grantlar jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.t2_tomon_aloqa; v_qarshi bigint; e jsonb; r public.t2_tomon_resurs; v_amallar text[]; v_loyiha bigint; v_obyekt bigint; v_shart bigint;
  v_son integer := 0; v_id bigint;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  if jsonb_typeof(p_grantlar) <> 'array' or jsonb_array_length(p_grantlar) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'code', 'GRANT_KERAK', 'error', 'grantlar: 1–200 ta element');
  end if;
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id;
  if not found or (a.taklif_kompaniya_id <> p_kompaniya_id and a.qabul_kompaniya_id is distinct from p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Aloqa topilmadi');
  end if;
  if a.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Ruxsat faqat faol aloqada beriladi'); end if;
  v_qarshi := public._t2_tomon_qarshi(a, p_kompaniya_id);
  for e in select * from jsonb_array_elements(p_grantlar) loop
    select * into r from public.t2_tomon_resurs where kalit = e->>'resurs' and faol;
    if not found then return jsonb_build_object('ok', false, 'code', 'RESURS_YOQ', 'error', 'Resurs ochiq emas: ' || coalesce(e->>'resurs', '?')); end if;
    select array_agg(distinct x) into v_amallar from jsonb_array_elements_text(coalesce(e->'amallar', '[]'::jsonb)) x;
    if v_amallar is null or not (v_amallar <@ r.amallar) then
      return jsonb_build_object('ok', false, 'code', 'AMAL_NOTOGRI', 'error', 'Amallar resursga mos emas: ' || r.kalit);
    end if;
    v_loyiha := nullif(e->>'loyiha_id', '')::bigint; v_obyekt := nullif(e->>'obyekt_id', '')::bigint; v_shart := nullif(e->>'shartnoma_id', '')::bigint;
    if (v_loyiha is not null)::int + (v_obyekt is not null)::int + (v_shart is not null)::int <> 1 then
      return jsonb_build_object('ok', false, 'code', 'DOIRA_KERAK', 'error', 'Aynan bitta doira kerak: loyiha_id YOKI obyekt_id YOKI shartnoma_id');
    end if;
    if v_obyekt is not null and not exists (select 1 from public.t2_obyekt where id = v_obyekt and kompaniya_id = p_kompaniya_id and holat = 'faol') then
      return jsonb_build_object('ok', false, 'code', 'DOIRA_BEGONA', 'error', 'Obyekt sizning kompaniyangizniki emas');
    end if;
    if v_loyiha is not null and not exists (select 1 from public.t2_loyiha where id = v_loyiha and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'DOIRA_BEGONA', 'error', 'Loyiha sizning kompaniyangizniki emas');
    end if;
    if v_shart is not null and not exists (select 1 from public.t2_shartnoma where id = v_shart and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'DOIRA_BEGONA', 'error', 'Shartnoma sizning kompaniyangizniki emas');
    end if;
    select g.id into v_id from public.t2_tomon_grant g
     where g.aloqa_id = a.id and g.beruvchi_kompaniya_id = p_kompaniya_id and g.resurs = r.kalit and g.holat = 'faol'
       and coalesce(g.loyiha_id, 0) = coalesce(v_loyiha, 0) and coalesce(g.obyekt_id, 0) = coalesce(v_obyekt, 0) and coalesce(g.shartnoma_id, 0) = coalesce(v_shart, 0);
    if found then
      update public.t2_tomon_grant set amallar = v_amallar where id = v_id;
    else
      insert into public.t2_tomon_grant (aloqa_id, beruvchi_kompaniya_id, oluvchi_kompaniya_id, resurs, amallar, loyiha_id, obyekt_id, shartnoma_id, berdi_actor_id)
      values (a.id, p_kompaniya_id, v_qarshi, r.kalit, v_amallar, v_loyiha, v_obyekt, v_shart, p_actor_id) returning id into v_id;
    end if;
    perform public._t2_tomon_hodisa_yoz(a.id, null, p_kompaniya_id, p_actor_id, 'grant', null,
      jsonb_build_object('grant_id', v_id, 'resurs', r.kalit, 'amallar', v_amallar, 'loyiha_id', v_loyiha, 'obyekt_id', v_obyekt, 'shartnoma_id', v_shart));
    v_son := v_son + 1;
  end loop;
  return jsonb_build_object('ok', true, 'saqlandi', v_son);
end $$;

