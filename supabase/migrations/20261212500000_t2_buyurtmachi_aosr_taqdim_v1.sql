-- 20261212500000 - BUYURTMACHI + TEXNIK NAZORAT tomoni: АОСР ni qarshi tomonga taqdim qilish va qaror (ekotizim, kun 2).
-- Egasi: ekotizim har kuni bitta tomon; pudratchi (PTO+sklad) tayyor, bugun buyurtmachi + texnadzor. Yangi sahifa/jadval yo'q -
-- mavjud t2_tomon_taqdim oqimi kengaytiriladi (docs/architecture/cloud-rejalar/IJRO_HUJJATLARI_LAB_TOMONLAR.md §1.2 xavfi yopiladi).
--   1. t2_tomon_resurs.aosr -> faol (taqdim_mumkin). remark/foto/fakt/grafik yoqilmaydi: remark = murojaat (alohida mexanizm),
--      F2 qatorlariga izoh = t2_izoh (qator darajasi), foto/fakt/grafik uchun hali iste'molchi yo'q.
--   2. t2_tomon_taqdim.manba_jadval ga 't2_aosr' qo'shiladi; t2_tomon_taqdim_yarat_v1 АОСР ni (qoralama, 'yangi') snapshot + xesh bilan oladi.
--   3. «tasdiqlangan» AOSR holatini FAQAT qarshi tomonning qabul qarori (t2_tomon_qaror_v1) qo'yadi:
--        - t2_aosr_yoz_v2 muallifga 'tasdiqlangan' qo'yishni taqiqlaydi ('qogoz' = qog'ozda imzolangan - saqlanadi);
--        - trigger t2_aosr_tasdiq_qorovul har qanday boshqa yo'lni (eski t2_aosr_yoz, SQL) ham to'sadi;
--        - qaror vaqtida xesh tekshiriladi (yuborilgandan keyin matn o'zgargan bo'lsa BUTUNLIK) va t2_aosr.tasdiq_taqdim_id yoziladi.
--   4. Qaror huquqi: texnadzor a'zosi (rol 'inspektor') ham qaror chiqara oladi (_t2_tomon_rol_ok 'qaror').
--   5. Qaror kutilayotgan akt tahrirlanmaydi (TAQDIMDA) - butunlik xeshi buzilmasin; tuzatish so'ralgach muallif tahrirlab qayta yuboradi.
-- Mavjud ma'lumot o'zgarmaydi (eski 'tasdiqlangan' aktlar shundayligicha qoladi). Rollback: *.rollback.sql. Acceptance: *.acceptance.sql.
-- versiya: tarix (t2_qator o'qilmaydi)

-- 1. Resurs katalogi
update public.t2_tomon_resurs
   set faol = true, taqdim_mumkin = true,
       izoh = 'Ijro hujjati: pudratchi yuboradi; buyurtmachi/texnadzor qabul qiladi (tasdiqlangan) yoki tuzatishga qaytaradi'
 where kalit = 'aosr';

-- 2. Taqdim manbasi: АОСР
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.t2_tomon_taqdim'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%manba_jadval%' loop
    execute format('alter table public.t2_tomon_taqdim drop constraint %I', c.conname);
  end loop;
  alter table public.t2_tomon_taqdim add constraint t2_tomon_taqdim_manba_jadval_check
    check (manba_jadval in ('t2_akt', 't2_document_registry', 't2_aosr'));
end $$;

alter table public.t2_aosr
  add column if not exists tasdiq_taqdim_id bigint references public.t2_tomon_taqdim(id),
  add column if not exists tasdiq_vaqti timestamptz;

-- 3. АОСР butunlik xeshi (yuborilgan matn o'zgarmaganini tekshirish)
create or replace function public._t2_tomon_aosr_xesh(p_aosr_id bigint) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select md5(jsonb_build_object('tur', a.tur, 'raqam', a.raqam, 'sana', a.sana, 'ish_nomi', a.ish_nomi, 'ish_tavsifi', a.ish_tavsifi,
    'boshlanish_sana', a.boshlanish_sana, 'tugash_sana', a.tugash_sana, 'blank_varianti', a.blank_varianti,
    'loyiha_tashkiloti', a.loyiha_tashkiloti, 'loyiha_hujjati', a.loyiha_hujjati, 'materiallar', a.materiallar,
    'chetlanishlar', a.chetlanishlar, 'keyingi_ishlar', a.keyingi_ishlar, 'komissiya', a.komissiya, 'izoh', a.izoh)::text)
    from public.t2_aosr a where a.id = p_aosr_id
$$;

-- 4. Qorovul: 'tasdiqlangan' holatini faqat t2_tomon_qaror_v1 (tranzaksiya ichidagi t2.aosr_tasdiq = '1') o'rnatadi.
create or replace function public._t2_aosr_tasdiq_qorovul() returns trigger
language plpgsql as $$
begin
  if new.holat = 'tasdiqlangan' and (tg_op = 'INSERT' or old.holat is distinct from 'tasdiqlangan')
     and coalesce(current_setting('t2.aosr_tasdiq', true), '') <> '1' then
    raise exception 'AOSR_TASDIQ_BOSHQA_TOMON: tasdiqlangan holatni faqat qarshi tomon qarori o''rnatadi (qog''ozda imzolangan bo''lsa - qogoz)'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists t2_aosr_tasdiq_qorovul on public.t2_aosr;
create trigger t2_aosr_tasdiq_qorovul before insert or update of holat on public.t2_aosr
  for each row execute function public._t2_aosr_tasdiq_qorovul();

-- 5. Qaror huquqi: texnadzor (inspektor) ham
create or replace function public._t2_tomon_rol_ok(p_rol text, p_amal text) returns boolean
language sql immutable as $$
  select case p_amal
    when 'boshqarish' then p_rol in ('superadmin','admin','boss','rahbar','director')
    when 'taqdim'     then p_rol in ('superadmin','admin','boss','rahbar','director','pto')
    when 'qaror'      then p_rol in ('superadmin','admin','boss','rahbar','director','buyurtmachi','inspektor')
    when 'izoh'       then p_rol not in ('kuzatuvchi')
    when 'korish'     then true
    else false end
$$;



-- 6. АОСР yozish: muallif 'tasdiqlangan' qo'ya olmaydi; qaror kutilayotgan akt tahrirlanmaydi

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
  v_komp bigint; v_bordagi integer; v_holat text; v_id bigint; m jsonb := coalesce(p_malumot, '{}'::jsonb);
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
  -- «tasdiqlangan» yozuvchining o'zi bilan QO'YILMAYDI: faqat qarshi tomon qarori (t2_tomon_qaror_v1) o'rnatadi.
  -- Qog'ozda imzolangan bo'lsa — holat = 'qogoz'. (Mavjud tasdiqlangan aktni o'zgarishsiz saqlash mumkin — pastda.)
  if p_id is null and m ? 'holat' and (m->>'holat') = 'tasdiqlangan' then
    return jsonb_build_object('ok', false, 'code', 'TASDIQ_BOSHQA_TOMON',
      'error', 'Tasdiqlangan holatni faqat qarshi tomon qarori o''rnatadi (qog''ozda imzolangan bo''lsa — "qogoz")');
  end if;
  v_komissiya := case when m ? 'komissiya' then m->'komissiya' else null end;
  if v_komissiya is not null and jsonb_typeof(v_komissiya) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'komissiya ro''yxat bo''lishi shart');
  end if;

  if p_id is not null then
    select versiya, holat into v_bordagi, v_holat from t2_aosr where id = p_id and obyekt_id = p_obyekt_id for update;
    if v_bordagi is null then
      return jsonb_build_object('ok', false, 'error', 'Akt topilmadi');
    end if;
    if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_bordagi then
      return jsonb_build_object('ok', false, 'sabab', 'versiya',
        'bordagi_versiya', v_bordagi, 'siz_yuborgan', p_kutilgan_versiya);
    end if;
    if m ? 'holat' and (m->>'holat') = 'tasdiqlangan' and v_holat is distinct from 'tasdiqlangan' then
      return jsonb_build_object('ok', false, 'code', 'TASDIQ_BOSHQA_TOMON',
        'error', 'Tasdiqlangan holatni faqat qarshi tomon qarori o''rnatadi (qog''ozda imzolangan bo''lsa — "qogoz")');
    end if;
    -- Qarshi tomonga yuborilgan va qaror kutilayotgan akt tahrirlanmaydi (butunlik xeshi buzilmasin): avval qaytarib oling.
    if exists (select 1 from t2_tomon_taqdim q where q.manba_jadval = 't2_aosr' and q.manba_id = p_id and q.holat in ('yuborilgan','ko_rilmoqda')) then
      return jsonb_build_object('ok', false, 'code', 'TAQDIMDA',
        'error', 'Akt qarshi tomonga yuborilgan, qaror kutilmoqda — tahrirlashdan oldin yuborishni qaytarib oling');
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



-- 7. Taqdim yaratish (F2 | hujjat | АОСР)

create or replace function public.t2_tomon_taqdim_yarat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_resurs text, p_manba_id bigint, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.t2_tomon_aloqa; r public.t2_tomon_resurs; v_qarshi bigint; v_id bigint; v_old public.t2_tomon_taqdim; v_oldingi bigint;
  t public.t2_akt; d public.t2_document_registry; ao public.t2_aosr; v_nom text; v_oy date; v_summa numeric; v_obyekt bigint; v_shart bigint; v_snap jsonb; v_xesh text; v_jadval text;
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
  elsif p_resurs = 'aosr' then
    select * into ao from public.t2_aosr where id = p_manba_id and kompaniya_id = p_kompaniya_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'HUJJAT_YOQ', 'error', 'АОСР topilmadi'); end if;
    if ao.holat is distinct from 'yangi' then
      return jsonb_build_object('ok', false, 'code', 'HOLAT_YARAMAYDI', 'error', 'Faqat qoralama (yangi) akt yuboriladi: tasdiqlangan, qog''ozda imzolangan yoki bekor qilingan akt yuborilmaydi');
    end if;
    if length(btrim(coalesce(ao.ish_nomi, ''))) = 0 then
      return jsonb_build_object('ok', false, 'code', 'ISH_NOMI_KERAK', 'error', 'Yuborishdan oldin aktda ish nomini kiriting');
    end if;
    v_jadval := 't2_aosr'; v_obyekt := ao.obyekt_id; v_shart := null; v_summa := null;
    v_oy := date_trunc('month', coalesce(ao.tugash_sana, ao.sana, ao.boshlanish_sana))::date;
    v_nom := case ao.tur when 'oraliq_qabul' then 'Акт промежуточной приёмки' when 'sinov' then 'Акт испытания' else 'АОСР' end
             || ' № ' || coalesce(nullif(ao.raqam, ''), ao.id::text) || ' — ' || left(btrim(ao.ish_nomi), 150);
    v_xesh := public._t2_tomon_aosr_xesh(ao.id);
    v_snap := jsonb_build_object('tur', 'aosr', 'aosr_id', ao.id, 'aosr_tur', ao.tur, 'raqam', ao.raqam, 'sana', ao.sana,
      'ish_nomi', ao.ish_nomi, 'ish_tavsifi', ao.ish_tavsifi, 'boshlanish_sana', ao.boshlanish_sana, 'tugash_sana', ao.tugash_sana,
      'blank_varianti', ao.blank_varianti, 'loyiha_tashkiloti', ao.loyiha_tashkiloti, 'loyiha_hujjati', ao.loyiha_hujjati,
      'materiallar', ao.materiallar, 'chetlanishlar', ao.chetlanishlar, 'keyingi_ishlar', ao.keyingi_ishlar,
      'komissiya', ao.komissiya, 'izoh', ao.izoh, 'versiya', ao.versiya,
      'ish_soni', (select count(*) from public.t2_aosr_bog b where b.aosr_id = ao.id),
      'protokollar', (select coalesce(jsonb_agg(jsonb_build_object('raqam', p.raqam, 'sana', p.sana, 'sinov_turi', p.sinov_turi, 'natija', p.natija) order by p.id), '[]'::jsonb)
                        from public.t2_lab_protokol_bog pb join public.t2_lab_protokol p on p.id = pb.protokol_id and p.holat <> 'bekor'
                       where pb.aosr_id = ao.id));
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



-- 8. Qaror (АОСР qabul -> tasdiqlangan)

create or replace function public.t2_tomon_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint, p_qaror text, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.t2_tomon_taqdim; v_yangi text; v_n integer;
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
  -- АОСР «tasdiqlangan» bo'ladi FAQAT qarshi tomonning qabul qarori bilan va yuborilgan matn o'zgarmagan bo'lsa.
  if q.resurs = 'aosr' and v_yangi = 'qabul' then
    if public._t2_tomon_aosr_xesh(q.manba_id) is distinct from q.snapshot_xesh then
      return jsonb_build_object('ok', false, 'code', 'BUTUNLIK', 'error', 'Yuborilgandan keyin akt o''zgargan — yuboruvchidan qayta yuborishni so''rang (tuzatish)');
    end if;
    perform set_config('t2.aosr_tasdiq', '1', true);
    update public.t2_aosr set holat = 'tasdiqlangan', tasdiq_taqdim_id = q.id, tasdiq_vaqti = now(), versiya = versiya + 1, yangilandi = now()
     where id = q.manba_id and holat = 'yangi';
    get diagnostics v_n = row_count;
    perform set_config('t2.aosr_tasdiq', '', true);
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'code', 'AKT_HOLAT', 'error', 'Akt endi qoralama emas (o''zgargan yoki bekor qilingan) — taqdimni rad eting yoki qayta yuborishni so''rang');
    end if;
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



-- 9. Taqdim tafsiloti: АОСР butunlik tekshiruvi

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
    'butunlik_ok', case when q.resurs = 'f2' then v_xesh_hozir is not distinct from q.snapshot_xesh when q.resurs = 'aosr' then public._t2_tomon_aosr_xesh(q.manba_id) is not distinct from q.snapshot_xesh else null end,
    'hodisalar', v_hodisalar);
end $$;


comment on function public.t2_tomon_taqdim_tafsilot_v1(bigint, bigint, bigint) is 'Taqdim tafsiloti (F2 qatorlari snapshoti). versiya: tarix - yuborilgan F2 aktning o''z qatorlari (t2_akt_qator), smeta versiyasidan mustaqil.';

revoke all on function public._t2_tomon_aosr_xesh(bigint) from public, anon, authenticated;
grant execute on function public._t2_tomon_aosr_xesh(bigint) to service_role;