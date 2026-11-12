-- 20261214500100 - LABORATORIYA: alohida protokol turlari gidravlik va elektr (egasi qarori 2026-11-12).
-- 20261214500000 dagi ko'zgu protokollar gidravlik/elektr sinovlarini «boshqa» turida yozgan edi; endi t2_lab_protokol.sinov_turi
-- (va t2_lab_sinov_turi.mirror_turi) kengayadi, mavjud ko'zgu yozuvlar tuzatiladi, qo'lda yozish RPC si (t2_lab_protokol_yoz_v1) yangi turlarni qabul qiladi.
-- Faqat additiv: eski qiymatlar o'zgarmaydi. Rollback: *.rollback.sql. Acceptance: *.acceptance.sql.
-- versiya: tarix (t2_qator o'qilmaydi)

do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.t2_lab_protokol'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%sinov_turi%' loop
    execute format('alter table public.t2_lab_protokol drop constraint %I', c.conname);
  end loop;
  alter table public.t2_lab_protokol add constraint t2_lab_protokol_sinov_turi_check
    check (sinov_turi in ('beton', 'grunt', 'armatura', 'payvand', 'gidravlik', 'elektr', 'material', 'boshqa'));
  for c in select conname from pg_constraint where conrelid = 'public.t2_lab_sinov_turi'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%mirror_turi%' loop
    execute format('alter table public.t2_lab_sinov_turi drop constraint %I', c.conname);
  end loop;
  alter table public.t2_lab_sinov_turi add constraint t2_lab_sinov_turi_mirror_turi_check
    check (mirror_turi in ('beton', 'grunt', 'armatura', 'payvand', 'gidravlik', 'elektr', 'material', 'boshqa'));
end $$;

update public.t2_lab_sinov_turi set mirror_turi = kalit where kalit in ('gidravlik', 'elektr') and mirror_turi <> kalit;
-- Mavjud ko'zgu protokollar (gidravlik/elektr so'rovlaridan) yangi turga o'tkaziladi.
update public.t2_lab_protokol p set sinov_turi = s.sinov_turi
  from public.t2_lab_sinov_sorov s
 where s.mirror_protokol_id = p.id and s.sinov_turi in ('gidravlik', 'elektr') and p.sinov_turi <> s.sinov_turi;
create or replace function public.t2_lab_protokol_yoz_v1(
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
  v_lab bigint;
begin
  select kompaniya_id into v_komp from t2_obyekt where id = p_obyekt_id;
  if v_komp is null or v_komp <> p_kompaniya_id then
    return jsonb_build_object('ok', false, 'error', 'Obyekt bu kompaniyaga tegishli emas');
  end if;
  if m ? 'laboratoriya_id' and m->>'laboratoriya_id' is not null then
    select id into v_lab from t2_kontragent
     where id = (m->>'laboratoriya_id')::bigint and kompaniya_id = p_kompaniya_id
       and mavqe = 'laboratoriya' and holat = 'faol';
    if v_lab is null then
      return jsonb_build_object('ok', false, 'error', 'Laboratoriya topilmadi (kontragentlar ro''yxatida "laboratoriya" roli bilan bo''lishi shart)');
    end if;
  end if;
  if m ? 'sinov_turi' and (m->>'sinov_turi') not in ('beton', 'grunt', 'armatura', 'payvand', 'gidravlik', 'elektr', 'material', 'boshqa') then
    return jsonb_build_object('ok', false, 'error', 'sinov_turi noto''g''ri');
  end if;
  if m ? 'natija' and (m->>'natija') not in ('mos', 'mos_emas', 'kutilmoqda') then
    return jsonb_build_object('ok', false, 'error', 'natija noto''g''ri');
  end if;

  if p_id is not null then
    select versiya into v_bordagi from t2_lab_protokol
     where id = p_id and obyekt_id = p_obyekt_id and holat <> 'bekor' for update;
    if v_bordagi is null then
      return jsonb_build_object('ok', false, 'error', 'Protokol topilmadi');
    end if;
    if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_bordagi then
      return jsonb_build_object('ok', false, 'sabab', 'versiya',
        'bordagi_versiya', v_bordagi, 'siz_yuborgan', p_kutilgan_versiya);
    end if;
    if m ? 'raqam' and coalesce(trim(m->>'raqam'), '') = '' then
      return jsonb_build_object('ok', false, 'error', 'Protokol raqami bo''sh bo''lmasin');
    end if;
    update t2_lab_protokol set
      laboratoriya_id  = case when m ? 'laboratoriya_id' then v_lab else laboratoriya_id end,
      raqam            = case when m ? 'raqam' then trim(m->>'raqam') else raqam end,
      sana             = case when m ? 'sana' then (m->>'sana')::date else sana end,
      sinov_turi       = case when m ? 'sinov_turi' then m->>'sinov_turi' else sinov_turi end,
      konstruksiya     = case when m ? 'konstruksiya' then m->>'konstruksiya' else konstruksiya end,
      marka            = case when m ? 'marka' then m->>'marka' else marka end,
      hajm             = case when m ? 'hajm' then (m->>'hajm')::numeric else hajm end,
      birlik           = case when m ? 'birlik' then m->>'birlik' else birlik end,
      natija           = case when m ? 'natija' then m->>'natija' else natija end,
      invoys_raqam     = case when m ? 'invoys_raqam' then m->>'invoys_raqam' else invoys_raqam end,
      invoys_sana      = case when m ? 'invoys_sana' then (m->>'invoys_sana')::date else invoys_sana end,
      summa            = case when m ? 'summa' then (m->>'summa')::numeric else summa end,
      fayl_document_id = case when m ? 'fayl_document_id' then m->>'fayl_document_id' else fayl_document_id end,
      izoh             = case when m ? 'izoh' then m->>'izoh' else izoh end,
      versiya = versiya + 1, yangilandi = now()
    where id = p_id;
    return jsonb_build_object('ok', true, 'id', p_id, 'versiya', v_bordagi + 1, 'takror', false);
  end if;

  if p_operation_id is null then
    return jsonb_build_object('ok', false, 'error', 'operation_id majburiy');
  end if;
  select id into v_id from t2_lab_protokol where operation_id = p_operation_id;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'takror', true);
  end if;
  if coalesce(trim(m->>'raqam'), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Protokol raqami majburiy');
  end if;

  insert into t2_lab_protokol (kompaniya_id, obyekt_id, laboratoriya_id, raqam, sana, sinov_turi,
    konstruksiya, marka, hajm, birlik, natija, invoys_raqam, invoys_sana, summa, fayl_document_id,
    izoh, operation_id, kim)
  values (v_komp, p_obyekt_id, v_lab, trim(m->>'raqam'), (m->>'sana')::date,
    coalesce(m->>'sinov_turi', 'beton'), m->>'konstruksiya', m->>'marka', (m->>'hajm')::numeric,
    m->>'birlik', coalesce(m->>'natija', 'kutilmoqda'), m->>'invoys_raqam', (m->>'invoys_sana')::date,
    (m->>'summa')::numeric, m->>'fayl_document_id', m->>'izoh', p_operation_id, p_kim)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'versiya', 1, 'takror', false);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Bu laboratoriyaning shu raqamli protokoli allaqachon bor');
  when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'error', 'Sana noto''g''ri');
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'Son noto''g''ri (hajm/summa)');
end;
$$;

revoke all on function public.t2_lab_protokol_yoz_v1(bigint, bigint, jsonb, bigint, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.t2_lab_protokol_yoz_v1(bigint, bigint, jsonb, bigint, integer, uuid, text) to service_role;
