-- Rollback 20261212500000: oldingi (20261105100000 / 20261106200000 / 20261108103000) ta'riflari tiklanadi.
-- DIQQAT: АОСР taqdimlari yozilgan bo'lsa manba_jadval cheklovini qaytarib bo'lmaydi - rollback to'xtaydi (ma'lumot o'chirilmaydi).
-- Tasdiqlangan holatga o'tkazilgan aktlar (tasdiq_taqdim_id bilan) holatini saqlaydi.
do $$
begin
  if exists (select 1 from public.t2_tomon_taqdim where manba_jadval = 't2_aosr') then
    raise exception 'ROLLBACK_TOXTATILDI: t2_tomon_taqdim da manba_jadval = t2_aosr yozuvlari bor (avval ularni arxivlang)';
  end if;
end $$;

drop trigger if exists t2_aosr_tasdiq_qorovul on public.t2_aosr;
drop function if exists public._t2_aosr_tasdiq_qorovul();

create or replace function public._t2_tomon_rol_ok(p_rol text, p_amal text) returns boolean
language sql immutable as $$
  select case p_amal
    when 'boshqarish' then p_rol in ('superadmin','admin','boss','rahbar','director')
    when 'taqdim'     then p_rol in ('superadmin','admin','boss','rahbar','director','pto')
    when 'qaror'      then p_rol in ('superadmin','admin','boss','rahbar','director','buyurtmachi')
    when 'izoh'       then p_rol not in ('kuzatuvchi')
    when 'korish'     then true
    else false end
$$;



create or replace function public.t2_aosr_yoz_v2(
  p_kompaniya_id bigint, p_obyekt_id bigint, p_malumot jsonb,
  p_id bigint default null, p_kutilgan_versiya integer default null,
  p_operation_id uuid default null, p_kim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_komp bigint; v_bordagi integer; v_id bigint; m jsonb := coalesce(p_malumot, '{}'::jsonb);
  v_komissiya jsonb;
begin
  select kompaniya_id into v_komp from t2_obyekt where id = p_obyekt_id;
  if v_komp is null or v_komp <> p_kompaniya_id then
    return jsonb_build_object('ok', false, 'error', 'Obyekt bu kompaniyaga tegishli emas');
  end if;
  if m ? 'tur' and (m->>'tur') not in ('aosr', 'oraliq_qabul', 'sinov') then
    return jsonb_build_object('ok', false, 'error', 'tur noto''g''ri');
  end if;
  if m ? 'blank_varianti' and (m->>'blank_varianti') not in ('subpudratchili', 'subpudratchisiz') then
    return jsonb_build_object('ok', false, 'error', 'blank_varianti noto''g''ri');
  end if;
  if m ? 'holat' and (m->>'holat') not in ('yangi', 'tasdiqlangan', 'qogoz') then
    return jsonb_build_object('ok', false, 'error', 'holat noto''g''ri (bekor — alohida amal)');
  end if;
  v_komissiya := case when m ? 'komissiya' then m->'komissiya' else null end;
  if v_komissiya is not null and jsonb_typeof(v_komissiya) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'komissiya ro''yxat bo''lishi shart');
  end if;

  if p_id is not null then
    select versiya into v_bordagi from t2_aosr where id = p_id and obyekt_id = p_obyekt_id for update;
    if v_bordagi is null then
      return jsonb_build_object('ok', false, 'error', 'Akt topilmadi');
    end if;
    if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_bordagi then
      return jsonb_build_object('ok', false, 'sabab', 'versiya',
        'bordagi_versiya', v_bordagi, 'siz_yuborgan', p_kutilgan_versiya);
    end if;
    update t2_aosr set
      tur               = case when m ? 'tur' then m->>'tur' else tur end,
      raqam             = case when m ? 'raqam' then nullif(m->>'raqam', '') else raqam end,
      sana              = case when m ? 'sana' then (m->>'sana')::date else sana end,
      ish_nomi          = case when m ? 'ish_nomi' then m->>'ish_nomi' else ish_nomi end,
      ish_tavsifi       = case when m ? 'ish_tavsifi' then m->>'ish_tavsifi' else ish_tavsifi end,
      boshlanish_sana   = case when m ? 'boshlanish_sana' then (m->>'boshlanish_sana')::date else boshlanish_sana end,
      tugash_sana       = case when m ? 'tugash_sana' then (m->>'tugash_sana')::date else tugash_sana end,
      bajarilgan        = case when m ? 'bajarilgan' then m->>'bajarilgan' else bajarilgan end,
      blank_varianti    = case when m ? 'blank_varianti' then m->>'blank_varianti' else blank_varianti end,
      loyiha_tashkiloti = case when m ? 'loyiha_tashkiloti' then m->>'loyiha_tashkiloti' else loyiha_tashkiloti end,
      loyiha_hujjati    = case when m ? 'loyiha_hujjati' then m->>'loyiha_hujjati' else loyiha_hujjati end,
      materiallar       = case when m ? 'materiallar' then m->>'materiallar' else materiallar end,
      chetlanishlar     = case when m ? 'chetlanishlar' then m->>'chetlanishlar' else chetlanishlar end,
      keyingi_ishlar    = case when m ? 'keyingi_ishlar' then m->>'keyingi_ishlar' else keyingi_ishlar end,
      komissiya         = coalesce(v_komissiya, komissiya),
      izoh              = case when m ? 'izoh' then m->>'izoh' else izoh end,
      holat             = case when m ? 'holat' then m->>'holat' else holat end,
      versiya = versiya + 1, yangilandi = now()
    where id = p_id;
    return jsonb_build_object('ok', true, 'id', p_id, 'versiya', v_bordagi + 1, 'takror', false);
  end if;

  if p_operation_id is null then
    return jsonb_build_object('ok', false, 'error', 'operation_id majburiy');
  end if;
  select id into v_id from t2_aosr where operation_id = p_operation_id;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'takror', true);
  end if;

  insert into t2_aosr (kompaniya_id, obyekt_id, tur, raqam, sana, ish_nomi, ish_tavsifi,
    boshlanish_sana, tugash_sana, bajarilgan, blank_varianti, loyiha_tashkiloti, loyiha_hujjati,
    materiallar, chetlanishlar, keyingi_ishlar, komissiya, izoh, holat, operation_id, manba, kim)
  values (v_komp, p_obyekt_id, coalesce(m->>'tur', 'aosr'), nullif(m->>'raqam', ''), (m->>'sana')::date,
    m->>'ish_nomi', m->>'ish_tavsifi', (m->>'boshlanish_sana')::date, (m->>'tugash_sana')::date,
    m->>'bajarilgan', coalesce(m->>'blank_varianti', 'subpudratchisiz'), m->>'loyiha_tashkiloti',
    m->>'loyiha_hujjati', m->>'materiallar', m->>'chetlanishlar', m->>'keyingi_ishlar',
    coalesce(v_komissiya, '[]'::jsonb), m->>'izoh', coalesce(m->>'holat', 'yangi'),
    p_operation_id, 'frontend', p_kim)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'versiya', 1, 'takror', false);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Bu obyektda shu raqamli akt allaqachon bor');
  when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'error', 'Sana noto''g''ri');
end;
$$;



create or replace function public.t2_tomon_taqdim_yarat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_resurs text, p_manba_id bigint, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.t2_tomon_aloqa; r public.t2_tomon_resurs; v_qarshi bigint; v_id bigint; v_old public.t2_tomon_taqdim; v_oldingi bigint;
  t public.t2_akt; d public.t2_document_registry; v_nom text; v_oy date; v_summa numeric; v_obyekt bigint; v_shart bigint; v_snap jsonb; v_xesh text; v_jadval text;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'taqdim');
  if p_operation_id is not null then
    select * into v_old from public.t2_tomon_taqdim where taqdim_etuvchi_kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
    if found then return jsonb_build_object('ok', true, 'id', v_old.id, 'holat', v_old.holat, 'qayta', true); end if;
  end if;
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id;
  if not found or (a.taklif_kompaniya_id <> p_kompaniya_id and a.qabul_kompaniya_id is distinct from p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Aloqa topilmadi');
  end if;
  if a.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Hujjat faqat faol aloqaga yuboriladi'); end if;
  v_qarshi := public._t2_tomon_qarshi(a, p_kompaniya_id);
  select * into r from public.t2_tomon_resurs where kalit = p_resurs and faol and taqdim_mumkin;
  if not found then return jsonb_build_object('ok', false, 'code', 'RESURS_YOQ', 'error', 'Bu turdagi hujjat yuborilmaydi: ' || coalesce(p_resurs, '?')); end if;

  if p_resurs = 'f2' then
    select * into t from public.t2_akt where id = p_manba_id and kompaniya_id = p_kompaniya_id and tur = 'f2';
    if not found then return jsonb_build_object('ok', false, 'code', 'HUJJAT_YOQ', 'error', 'F2 akt topilmadi'); end if;
    if t.lifecycle_status is distinct from 'approved' then return jsonb_build_object('ok', false, 'code', 'TASDIQLANMAGAN', 'error', 'Faqat ichki tasdiqlangan F2 yuboriladi'); end if;
    v_jadval := 't2_akt'; v_obyekt := t.obyekt_id; v_shart := t.shartnoma_id; v_oy := t.oy; v_summa := t.hujjat_jami;
    v_nom := 'Ф-2 № ' || coalesce(nullif(t.raqam, ''), t.id::text);
    v_xesh := public._t2_tomon_f2_xesh(t.id);
    v_snap := jsonb_build_object('tur', 'f2', 'akt_id', t.id, 'raqam', t.raqam, 'oy', t.oy, 'sana', t.sana, 'hujjat_jami', t.hujjat_jami, 'versiya', t.versiya,
                                 'qator_soni', (select count(*) from public.t2_akt_qator where akt_id = t.id));
  else
    select * into d from public.t2_document_registry where id = p_manba_id and kompaniya_id = p_kompaniya_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'HUJJAT_YOQ', 'error', 'Hujjat topilmadi'); end if;
    if d.canonical_storage_status is distinct from 'stored' or d.status is distinct from 'active' or d.finalized_at is null then
      return jsonb_build_object('ok', false, 'code', 'HUJJAT_TAYYOR_EMAS', 'error', 'Hujjat hali to''liq saqlanmagan');
    end if;
    v_jadval := 't2_document_registry'; v_obyekt := d.obyekt_id; v_shart := null; v_oy := null; v_summa := null;
    v_nom := coalesce(nullif(d.original_filename, ''), d.document_type || ' #' || d.id);
    v_xesh := d.sha256;
    v_snap := jsonb_build_object('tur', 'hujjat', 'document_id', d.id, 'document_type', d.document_type, 'fayl', d.original_filename, 'mime', d.mime_type, 'olcham', d.size_bytes, 'sha256', d.sha256, 'revision_seq', d.revision_seq);
  end if;
  if v_obyekt is null or not exists (select 1 from public.t2_obyekt where id = v_obyekt and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_KERAK', 'error', 'Hujjat obyektga bog''langan bo''lishi kerak');
  end if;
  -- Tuzatish so'ralgan taqdimning davomi bo'lsa — zanjir.
  select id into v_oldingi from public.t2_tomon_taqdim
   where aloqa_id = a.id and manba_jadval = v_jadval and manba_id = p_manba_id and holat = 'tuzatish' order by id desc limit 1;
  begin
    insert into public.t2_tomon_taqdim (aloqa_id, taqdim_etuvchi_kompaniya_id, qabul_qiluvchi_kompaniya_id, resurs, manba_jadval, manba_id, obyekt_id, shartnoma_id, nom, oy, summa,
                                        snapshot, snapshot_xesh, oldingi_taqdim_id, taqdim_actor_id, taqdim_izoh, operation_id)
    values (a.id, p_kompaniya_id, v_qarshi, p_resurs, v_jadval, p_manba_id, v_obyekt, v_shart, v_nom, v_oy, v_summa, v_snap, v_xesh, v_oldingi, p_actor_id, nullif(btrim(coalesce(p_izoh, '')), ''), p_operation_id)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'ALLAQACHON', 'error', 'Bu hujjat allaqachon yuborilgan va hal qilinmagan/qabul qilingan');
  end;
  perform public._t2_tomon_hodisa_yoz(a.id, v_id, p_kompaniya_id, p_actor_id, 'taqdim', p_izoh, jsonb_build_object('resurs', p_resurs, 'manba_id', p_manba_id, 'xesh', v_xesh));
  return jsonb_build_object('ok', true, 'id', v_id, 'holat', 'yuborilgan');
end $$;



create or replace function public.t2_tomon_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint, p_qaror text, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.t2_tomon_taqdim; v_yangi text;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'qaror');
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id for update;
  if not found or q.qabul_qiluvchi_kompaniya_id <> p_kompaniya_id then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taqdim topilmadi');
  end if;
  if not exists (select 1 from public.t2_tomon_aloqa where id = q.aloqa_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ALOQA_FAOL_EMAS', 'error', 'Aloqa faol emas');
  end if;
  v_yangi := case p_qaror when 'korilmoqda' then 'ko_rilmoqda' when 'qabul' then 'qabul' when 'rad' then 'rad' when 'tuzatish' then 'tuzatish' end;
  if v_yangi is null then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI', 'error', 'qaror: korilmoqda | qabul | rad | tuzatish'); end if;
  if q.holat not in ('yuborilgan','ko_rilmoqda') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Bu taqdim bo''yicha qaror allaqachon chiqarilgan'); end if;
  if v_yangi in ('rad','tuzatish') and length(btrim(coalesce(p_izoh, ''))) < 3 then
    return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK', 'error', 'Rad etish yoki tuzatish so''rash uchun izoh yozing');
  end if;
  update public.t2_tomon_taqdim
     set holat = v_yangi, versiya = versiya + 1, yangilandi = now(),
         qaror_actor_id = case when v_yangi = 'ko_rilmoqda' then qaror_actor_id else p_actor_id end,
         qaror_vaqti = case when v_yangi = 'ko_rilmoqda' then qaror_vaqti else now() end,
         qaror_izoh = case when v_yangi = 'ko_rilmoqda' then qaror_izoh else nullif(btrim(coalesce(p_izoh, '')), '') end
   where id = q.id;
  perform public._t2_tomon_hodisa_yoz(q.aloqa_id, q.id, p_kompaniya_id, p_actor_id, case when v_yangi = 'ko_rilmoqda' then 'korilmoqda' else 'qaror' end, p_izoh, jsonb_build_object('qaror', v_yangi));
  return jsonb_build_object('ok', true, 'id', q.id, 'holat', v_yangi);
end $$;



create or replace function public.t2_tomon_taqdim_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.t2_tomon_taqdim; v_qatorlar jsonb := '[]'::jsonb; v_jami integer := 0; v_xesh_hozir text; v_hodisalar jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id;
  if not found or (q.taqdim_etuvchi_kompaniya_id <> p_kompaniya_id and q.qabul_qiluvchi_kompaniya_id <> p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taqdim topilmadi');
  end if;
  if q.resurs = 'f2' and q.manba_jadval = 't2_akt' then
    select count(*) into v_jami from public.t2_akt_qator where akt_id = q.manba_id;
    select coalesce(jsonb_agg(z order by (z->>'tartib')::bigint), '[]'::jsonb) into v_qatorlar from (
      select jsonb_build_object('akt_qator_id', aq.id, 'qator_id', aq.qator_id, 'tartib', row_number() over (order by qq.tartib, qq.id), 'kod', qq.kod, 'nom', qq.nom, 'birlik', qq.birlik, 'tur', qq.tur, 'kat', qq.kat,
             'hajm', coalesce(aq.certified_quantity, aq.hajm), 'narx', coalesce(aq.certified_unit_price, aq.narx), 'summa', coalesce(aq.certified_amount, aq.summa), 'narx_manba', aq.narx_manba) z
        from public.t2_akt_qator aq join public.t2_qator qq on qq.id = aq.qator_id
       where aq.akt_id = q.manba_id order by qq.tartib, qq.id limit 5000) s;
    v_xesh_hozir := public._t2_tomon_f2_xesh(q.manba_id);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'tur', e.tur, 'matn', e.matn, 'vaqt', e.vaqt, 'meni', e.kompaniya_id = p_kompaniya_id,
           'kompaniya_nom', (select nom from public.t2_kompaniya where id = e.kompaniya_id)) order by e.id), '[]'::jsonb)
    into v_hodisalar from public.t2_tomon_hodisa e where e.taqdim_id = q.id;
  return jsonb_build_object('ok', true,
    'taqdim', jsonb_build_object('id', q.id, 'aloqa_id', q.aloqa_id, 'resurs', q.resurs, 'nom', q.nom, 'oy', q.oy, 'summa', q.summa, 'holat', q.holat, 'snapshot', q.snapshot,
        'kelgan', q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id, 'obyekt_nom', (select o.nom from public.t2_obyekt o where o.id = q.obyekt_id),
        'etuvchi_nom', (select nom from public.t2_kompaniya where id = q.taqdim_etuvchi_kompaniya_id), 'qabul_qiluvchi_nom', (select nom from public.t2_kompaniya where id = q.qabul_qiluvchi_kompaniya_id),
        'taqdim_vaqti', q.taqdim_vaqti, 'taqdim_izoh', q.taqdim_izoh, 'qaror_vaqti', q.qaror_vaqti, 'qaror_izoh', q.qaror_izoh, 'oldingi_taqdim_id', q.oldingi_taqdim_id,
        'document_id', case when q.manba_jadval = 't2_document_registry' then q.manba_id end,
        'manba_jadval', q.manba_jadval, 'manba_id', q.manba_id),
    'qatorlar', v_qatorlar, 'qator_jami', v_jami, 'qisqartirilgan', v_jami > 5000,
    'butunlik_ok', case when q.resurs = 'f2' then v_xesh_hozir is not distinct from q.snapshot_xesh else null end,
    'hodisalar', v_hodisalar);
end $$;

drop function if exists public._t2_tomon_aosr_xesh(bigint);
alter table public.t2_aosr drop column if exists tasdiq_taqdim_id, drop column if exists tasdiq_vaqti;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.t2_tomon_taqdim'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%manba_jadval%' loop
    execute format('alter table public.t2_tomon_taqdim drop constraint %I', c.conname);
  end loop;
  alter table public.t2_tomon_taqdim add constraint t2_tomon_taqdim_manba_jadval_check
    check (manba_jadval in ('t2_akt', 't2_document_registry'));
end $$;

update public.t2_tomon_resurs set faol = false, izoh = 'Keyingi bosqich' where kalit = 'aosr';
comment on function public.t2_tomon_taqdim_tafsilot_v1(bigint, bigint, bigint) is null;
