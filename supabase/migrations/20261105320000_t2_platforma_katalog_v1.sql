-- T2-NARX-PLATFORMA-001 — katalog PLATFORMA darajasida (egasi, 2026-10-02):
--  "katalog hamma foydalanuvchi alohida tashlanmasligi kerak, tizimda ideal yuklangan bo'lishi kerak; narx taklif
--   qilinganda yoki ishlatilganda izoh: «katalog 2026 2-kvartal Toshkent shahar narxlaridan TTZ zavodidan QQS siz
--   narxi olindi/taklif etiladi»; mash-chas va chel-chas ham shunday".
-- Qonunlar:
--  • kompaniya_id NULL = platforma manbasi: hamma kompaniya o'qiydi, faqat platforma superadmini yozadi.
--  • Qator darajasida dalil: hudud, ishlab chiqaruvchi (zavod), QQS holati/izohi, davr (yil/kvartal), narx varianti, guruh.
--  • Sarlavha qatorlari (zavod / mahsulot guruhi) taklifga tushmaydi (sarlavha = true), o'chirilmaydi.
--  • Smeta narxi avtomatik o'zgarmaydi — taklif + operator tasdig'i (avvalgidek).
begin;

alter table public.t2_narx_manba alter column kompaniya_id drop not null;
alter table public.t2_narx_manba_qator alter column kompaniya_id drop not null;
alter table public.t2_narx_manba_qator
  add column if not exists hudud text,
  add column if not exists ishlab_chiqaruvchi text,
  add column if not exists nds_holati text,
  add column if not exists nds_izoh text,
  add column if not exists yil smallint,
  add column if not exists kvartal smallint,
  add column if not exists narx_varianti text,
  add column if not exists guruh text,
  add column if not exists sarlavha boolean not null default false;
do $$ begin
  alter table public.t2_narx_manba_qator add constraint t2_narx_manba_qator_nds_chk check (nds_holati is null or nds_holati in ('nds_siz', 'nds_bilan', 'nomalum'));
exception when duplicate_object then null; end $$;
create index if not exists t2_narx_manba_qator_platforma_idx on public.t2_narx_manba_qator(manba_id) where kompaniya_id is null;

-- ═══ Yordamchilar ═══
create or replace function public._t2_json_xavfsiz(p text) returns jsonb language plpgsql immutable as $$
begin
  if p is null or p !~ '^\s*\{' then return null; end if;
  return p::jsonb;
exception when others then return null;
end $$;

/* Katalog zavod sarlavhasi: "1. ООО "Нукус ТББЗ". (НДС 12%) Руководитель: … Адрес: г. Нукус, …"
   → {nom: 'ООО "Нукус ТББЗ"', nds: 'НДС 12%', hudud: 'г. Нукус'}; zavod sarlavhasi bo'lmasa — null. */
create or replace function public._t2_katalog_zavod(p text) returns jsonb language plpgsql immutable as $$
declare t text := regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'); v_nom text; v_nds text; v_adr text; v_hudud text;
begin
  if t !~ '^\s*\d+\.\s' or t !~* '(ООО|OOO|ОАО|АО|АЖ|ЧП|ИП|СП|ХК|ДП|УП|ГУП|МЧЖ|QK|XK|AJ|ЧФ|ФХ|Корхона|Компания|завод|комбинат)' then return null; end if;
  v_nom := btrim(substring(t from '^\s*\d+\.\s*(.+?)\.\s*(?:\(|Руководитель|Адрес|Тел)'));
  if v_nom is null or v_nom = '' then v_nom := btrim(substring(t from '^\s*\d+\.\s*([^.(]+)')); end if;
  v_nds := substring(t from '\(((?:без )?НДС[^)]*)\)');
  v_adr := substring(t from 'Адрес:\s*(.+?)(?:\s*Тел\.|$)');
  v_hudud := coalesce(
    'г. ' || btrim(substring(v_adr from 'г\.\s*([А-ЯЁA-Z][^,.]*)')),
    btrim(substring(v_adr from '([^,.]*район)')),
    btrim(substring(v_adr from '([^,.]*обл[^,.]*)')),
    btrim(substring(v_adr from '([^,.]*(?:Каракалпак|Ташкент)[^,.]*)')));
  return jsonb_build_object('nom', v_nom, 'nds', v_nds, 'hudud', v_hudud);
end $$;

-- ═══ Mavjud ma'lumotni boyitish ═══
-- 1) Yangi import yo'li: qator izohidagi JSON (hudud, davr, narx varianti, guruh) — ustunlarga.
update public.t2_narx_manba_qator q set
  hudud = coalesce(q.hudud, nullif(j->>'hudud', '')),
  yil = coalesce(q.yil, case when (j->'davr'->>'yil') ~ '^\d{4}$' then (j->'davr'->>'yil')::smallint end),
  kvartal = coalesce(q.kvartal, case when (j->'davr'->>'kvartal') ~ '^[1-4]$' then (j->'davr'->>'kvartal')::smallint end),
  narx_varianti = coalesce(q.narx_varianti, nullif(coalesce(j->>'narxVarianti', j->>'variant'), '')),
  nds_holati = coalesce(q.nds_holati, case coalesce(j->>'narxVarianti', j->>'variant') when 'nds_bilan' then 'nds_bilan' when 'nds_siz' then 'nds_siz' end),
  ishlab_chiqaruvchi = coalesce(q.ishlab_chiqaruvchi, public._t2_katalog_zavod(j->>'guruh')->>'nom'),
  nds_izoh = coalesce(q.nds_izoh, public._t2_katalog_zavod(j->>'guruh')->>'nds'),
  guruh = coalesce(q.guruh, case when public._t2_katalog_zavod(j->>'guruh') is null then nullif(j->>'guruh', '') end)
from (select id, public._t2_json_xavfsiz(izoh) j from public.t2_narx_manba_qator) s
where s.id = q.id and s.j is not null;

-- 2) Eski katalog importi (izoh JSON siz): zavod va mahsulot guruhi sarlavhalari tartib bo'yicha ketma-ket qatorlarga.
do $$
declare m record; r record; v_z jsonb; v_zavod text; v_nds text; v_hudud text; v_guruh text;
begin
  for m in select distinct mq.manba_id from public.t2_narx_manba_qator mq join public.t2_narx_manba nm on nm.id = mq.manba_id
            where nm.tur = 'katalog' and mq.izoh is null loop
    v_zavod := null; v_nds := null; v_hudud := null; v_guruh := null;
    for r in select id, nom, narx, birlik from public.t2_narx_manba_qator where manba_id = m.manba_id order by tartib, id loop
      v_z := public._t2_katalog_zavod(r.nom);
      if v_z is not null and r.narx is null then
        v_zavod := v_z->>'nom'; v_nds := v_z->>'nds'; v_hudud := v_z->>'hudud'; v_guruh := null;
        update public.t2_narx_manba_qator set sarlavha = true, ishlab_chiqaruvchi = v_zavod, nds_izoh = v_nds, hudud = v_hudud where id = r.id;
      elsif r.narx is null then
        v_guruh := btrim(regexp_replace(r.nom, '\s+', ' ', 'g'));
        update public.t2_narx_manba_qator set sarlavha = true, guruh = v_guruh, ishlab_chiqaruvchi = v_zavod, hudud = v_hudud where id = r.id;
      else
        update public.t2_narx_manba_qator set ishlab_chiqaruvchi = coalesce(ishlab_chiqaruvchi, v_zavod), nds_izoh = coalesce(nds_izoh, v_nds),
          hudud = coalesce(hudud, v_hudud), guruh = coalesce(guruh, v_guruh) where id = r.id;
      end if;
    end loop;
  end loop;
end $$;

-- 3) Manba davri nomidan ("Каталог 1 кв. 2025 года").
update public.t2_narx_manba set
  kvartal = coalesce(kvartal, (substring(nom from '([1-4])\s*[-.]?\s*кв') )::smallint),
  yil = coalesce(yil, (substring(nom from '(20\d{2})'))::smallint)
where (kvartal is null or yil is null) and nom ~ '20\d{2}';

-- 4) Rasmiy manbalar (katalog, чел.-час, маш.-час kalkulyatsiyasi) — PLATFORMAGA (hali dalil bog'lanmagan: 0).
update public.t2_narx_manba_qator q set kompaniya_id = null
  from public.t2_narx_manba m where m.id = q.manba_id and m.tur in ('katalog', 'chel_chas', 'kalkulyatsiya_mash');
update public.t2_narx_manba set kompaniya_id = null where tur in ('katalog', 'chel_chas', 'kalkulyatsiya_mash');

-- ═══ Ko'rinishlar: o'z + platforma manbalari; qator dalili ustun ═══
create or replace view public.t2_narx_taklif as
 select q.kompaniya_id, q.obyekt_id, q.id as qator_id, q.tur, q.kat, q.kod, q.nom, q.birlik, q.narx as smeta_narx,
    mq.id as manba_qator_id, mq.manba_id, m.tur as manba_tur, m.nom as manba_nom, m.raqam as manba_raqam, m.sana as manba_sana,
    coalesce(mq.yil, m.yil) as yil, coalesce(mq.kvartal, m.kvartal) as kvartal, coalesce(mq.hudud, m.region) as region, m.yetkazuvchi,
    coalesce(mq.nds_holati, m.nds_holati) as nds_holati, mq.kod as manba_kod, mq.nom as manba_nom_qator, mq.birlik as manba_birlik,
    mq.narx as manba_narx,
    case when mq.kod_key is not null and mq.kod_key <> '' and mq.kod_key = t2_resurs_nom_kalit(q.kod) then 'kod' else 'nom_birlik' end as moslik,
    mq.ishlab_chiqaruvchi, mq.nds_izoh, mq.narx_varianti, mq.guruh as manba_guruh, (m.kompaniya_id is null) as platforma
   from t2_qator q
     join t2_narx_manba_qator mq on (mq.kompaniya_id = q.kompaniya_id or mq.kompaniya_id is null) and not mq.sarlavha and mq.narx is not null
       and (mq.kod_key is not null and mq.kod_key <> '' and mq.kod_key = t2_resurs_nom_kalit(q.kod) or mq.nom_key = q.nom_key and not mq.birlik_key is distinct from q.birlik_key)
     join t2_narx_manba m on m.id = mq.manba_id and m.holat = 'faol'
  where q.tur = any (array['rs', 'mat', 'ob']);

create or replace view public.t2_narx_dalil_holat as
 select d.id, d.kompaniya_id, d.obyekt_id, d.qator_id, q.tur, q.kat, q.kod, q.nom, q.birlik, q.hajm, q.narx as hozirgi_narx,
    d.smeta_narx, d.manba_narx, d.izoh, d.kim, d.vaqt, m.id as manba_id, m.tur as manba_tur, m.nom as manba_nom,
    m.raqam as manba_raqam, m.sana as manba_sana, coalesce(mq.yil, m.yil) as yil, coalesce(mq.kvartal, m.kvartal) as kvartal,
    coalesce(mq.hudud, m.region) as region, m.yetkazuvchi, m.yetkazuvchi_inn, coalesce(mq.nds_holati, m.nds_holati) as nds_holati,
    m.fayl_document_id, mq.kod as manba_kod, mq.nom as manba_nom_qator, mq.birlik as manba_birlik,
    mq.ishlab_chiqaruvchi, mq.nds_izoh, mq.narx_varianti, mq.guruh as manba_guruh, (m.kompaniya_id is null) as platforma
   from t2_narx_dalil d
     join t2_qator q on q.id = d.qator_id
     join t2_narx_manba m on m.id = d.manba_id
     join t2_narx_manba_qator mq on mq.id = d.manba_qator_id
  where d.holat = 'faol';

/* Platforma manbalari va qatorlari — har kompaniya a'zosi o'qiydi (global ma'lumot, kompaniya sirlari yo'q). */
create or replace view public.t2_platforma_narx_manba as
 select id, tur, nom, raqam, sana, yetkazuvchi, region, yil, kvartal, nds_holati, izoh, holat, versiya, yaratildi, yangilandi,
   (select count(*) from t2_narx_manba_qator q where q.manba_id = m.id and not q.sarlavha) as qator_soni
 from t2_narx_manba m where m.kompaniya_id is null and m.holat = 'faol';
create or replace view public.t2_platforma_narx_manba_qator as
 select q.id, q.manba_id, q.kod, q.nom, q.birlik, q.narx, q.hudud, q.ishlab_chiqaruvchi, q.nds_holati, q.nds_izoh, q.yil, q.kvartal,
   q.narx_varianti, q.guruh
 from t2_narx_manba_qator q join t2_narx_manba m on m.id = q.manba_id and m.holat = 'faol'
 where q.kompaniya_id is null and not q.sarlavha;
revoke all on public.t2_platforma_narx_manba, public.t2_platforma_narx_manba_qator from anon, authenticated;

-- ═══ Yozish: umumiy ichki yozuvchi (kompaniya yoki platforma) ═══
create or replace function public._t2_narx_manba_yoz(p_kompaniya_id bigint, p_malumot jsonb, p_qatorlar jsonb, p_rejim text, p_id bigint,
  p_kutilgan_versiya integer, p_operation_id uuid, p_kim text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m jsonb := coalesce(p_malumot, '{}'::jsonb); v_id bigint; v_bordagi integer; v_soni int := 0; v_tartib int;
begin
  if p_rejim not in ('almashtir', 'qosh') then return jsonb_build_object('ok', false, 'error', 'rejim noto''g''ri'); end if;
  if p_qatorlar is not null and (jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) > 20000) then
    return jsonb_build_object('ok', false, 'error', 'Qatorlar ro''yxati noto''g''ri yoki juda katta (bir bo''lakda ≤ 20 000)');
  end if;
  if m ? 'tur' and (m->>'tur') not in ('katalog', 'faktura', 'kp', 'kalkulyatsiya_mash', 'chel_chas', 'boshqa') then
    return jsonb_build_object('ok', false, 'error', 'Manba turi noto''g''ri');
  end if;
  if p_id is not null then
    select versiya into v_bordagi from t2_narx_manba where id = p_id and kompaniya_id is not distinct from p_kompaniya_id and holat = 'faol' for update;
    if v_bordagi is null then return jsonb_build_object('ok', false, 'error', 'Manba topilmadi'); end if;
    if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_bordagi then return jsonb_build_object('ok', false, 'sabab', 'versiya', 'bordagi_versiya', v_bordagi); end if;
    if p_qatorlar is not null and p_rejim = 'almashtir' and exists (
         select 1 from t2_narx_dalil d join t2_narx_manba_qator q on q.id = d.manba_qator_id where q.manba_id = p_id and d.holat = 'faol') then
      return jsonb_build_object('ok', false, 'error', 'Bu manba pozitsiyalari smeta dalili sifatida bog''langan — almashtirib bo''lmaydi (yangi manba yarating yoki "qo''shish" rejimi)');
    end if;
    update t2_narx_manba set
      tur = case when m ? 'tur' then m->>'tur' else tur end,
      nom = case when m ? 'nom' and coalesce(trim(m->>'nom'), '') <> '' then trim(m->>'nom') else nom end,
      raqam = case when m ? 'raqam' then m->>'raqam' else raqam end,
      sana = case when m ? 'sana' then (m->>'sana')::date else sana end,
      yetkazuvchi = case when m ? 'yetkazuvchi' then m->>'yetkazuvchi' else yetkazuvchi end,
      yetkazuvchi_inn = case when m ? 'yetkazuvchi_inn' then m->>'yetkazuvchi_inn' else yetkazuvchi_inn end,
      region = case when m ? 'region' then m->>'region' else region end,
      yil = case when m ? 'yil' then (m->>'yil')::smallint else yil end,
      kvartal = case when m ? 'kvartal' then (m->>'kvartal')::smallint else kvartal end,
      nds_holati = case when m ? 'nds_holati' then m->>'nds_holati' else nds_holati end,
      fayl_document_id = case when m ? 'fayl_document_id' then m->>'fayl_document_id' else fayl_document_id end,
      izoh = case when m ? 'izoh' then m->>'izoh' else izoh end,
      versiya = versiya + 1, kim = p_kim, yangilandi = now()
    where id = p_id;
    v_id := p_id;
  else
    if p_operation_id is null then return jsonb_build_object('ok', false, 'error', 'operation_id majburiy'); end if;
    select id into v_id from t2_narx_manba where operation_id = p_operation_id;
    if v_id is not null then return jsonb_build_object('ok', true, 'id', v_id, 'takror', true); end if;
    if coalesce(trim(m->>'nom'), '') = '' or coalesce(m->>'tur', '') = '' then return jsonb_build_object('ok', false, 'error', 'Manba nomi va turi majburiy'); end if;
    insert into t2_narx_manba (kompaniya_id, tur, nom, raqam, sana, yetkazuvchi, yetkazuvchi_inn, region, yil, kvartal, nds_holati, fayl_document_id, izoh, operation_id, kim)
    values (p_kompaniya_id, m->>'tur', trim(m->>'nom'), m->>'raqam', (m->>'sana')::date, m->>'yetkazuvchi', m->>'yetkazuvchi_inn',
      m->>'region', (m->>'yil')::smallint, (m->>'kvartal')::smallint, coalesce(m->>'nds_holati', 'nomalum'), m->>'fayl_document_id', m->>'izoh', p_operation_id, p_kim)
    returning id into v_id;
  end if;
  if p_qatorlar is not null then
    if p_rejim = 'almashtir' then delete from t2_narx_manba_qator where manba_id = v_id; end if;
    select coalesce(max(tartib), 0) into v_tartib from t2_narx_manba_qator where manba_id = v_id;
    insert into t2_narx_manba_qator (manba_id, kompaniya_id, tartib, kod, nom, birlik, narx, kod_key, nom_key, birlik_key, izoh,
      hudud, ishlab_chiqaruvchi, nds_holati, nds_izoh, yil, kvartal, narx_varianti, guruh, sarlavha)
    select v_id, p_kompaniya_id, v_tartib + x.n, nullif(trim(x.e->>'kod'), ''), trim(x.e->>'nom'), nullif(trim(x.e->>'birlik'), ''),
           case when (x.e->>'narx') ~ '^-?[0-9]+(\.[0-9]+)?$' then (x.e->>'narx')::numeric else null end,
           nullif(public.t2_resurs_nom_kalit(x.e->>'kod'), ''), public.t2_resurs_nom_kalit(x.e->>'nom'), public.t2_resurs_birlik_kalit(x.e->>'birlik'), x.e->>'izoh',
           nullif(trim(x.e->>'hudud'), ''), nullif(trim(x.e->>'ishlab_chiqaruvchi'), ''),
           case when x.e->>'nds_holati' in ('nds_siz', 'nds_bilan', 'nomalum') then x.e->>'nds_holati' end, nullif(trim(x.e->>'nds_izoh'), ''),
           case when (x.e->>'yil') ~ '^\d{4}$' then (x.e->>'yil')::smallint end, case when (x.e->>'kvartal') ~ '^[1-4]$' then (x.e->>'kvartal')::smallint end,
           nullif(trim(x.e->>'narx_varianti'), ''), nullif(trim(x.e->>'guruh'), ''), coalesce((x.e->>'sarlavha')::boolean, false)
    from jsonb_array_elements(p_qatorlar) with ordinality as x(e, n)
    where coalesce(trim(x.e->>'nom'), '') <> '';
    get diagnostics v_soni = row_count;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'qator_qoshildi', v_soni);
exception
  when invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('ok', false, 'error', 'Sana noto''g''ri');
  when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('ok', false, 'error', 'Son noto''g''ri (yil/kvartal/narx)');
end $$;
revoke all on function public._t2_narx_manba_yoz(bigint, jsonb, jsonb, text, bigint, integer, uuid, text) from public, anon, authenticated;

-- Kompaniya manbasi (faktura, КП, o'z hujjatlari) — avvalgi imzo saqlanadi.
create or replace function public.t2_narx_manba_yoz_v1(p_kompaniya_id bigint, p_malumot jsonb, p_qatorlar jsonb default null, p_rejim text default 'almashtir',
  p_id bigint default null, p_kutilgan_versiya integer default null, p_operation_id uuid default null, p_kim text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'error', 'kompaniya_id majburiy'); end if;
  return public._t2_narx_manba_yoz(p_kompaniya_id, p_malumot, p_qatorlar, p_rejim, p_id, p_kutilgan_versiya, p_operation_id, p_kim);
end $$;

-- Platforma manbasi (katalog, чел.-час, маш.-час) — faqat platforma superadmini.
create or replace function public.t2_platforma_narx_manba_yoz_v1(p_actor_id bigint, p_malumot jsonb, p_qatorlar jsonb default null, p_rejim text default 'almashtir',
  p_id bigint default null, p_kutilgan_versiya integer default null, p_operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; r jsonb;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  r := public._t2_narx_manba_yoz(null, p_malumot, p_qatorlar, p_rejim, p_id, p_kutilgan_versiya, p_operation_id, 'actor:' || p_actor_id);
  if (r->>'ok')::boolean and p_id is null and not coalesce((r->>'takror')::boolean, false) then
    perform public.t2_audit_yoz(v_ak, 'platforma_katalog', 'narx', null, format('manba=%s nom=%s', r->>'id', left(coalesce(p_malumot->>'nom', ''), 150)), 'actor:' || p_actor_id, null);
  end if;
  return r;
end $$;

create or replace function public.t2_platforma_narx_manba_bekor_v1(p_actor_id bigint, p_id bigint, p_kutilgan_versiya integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; v_bordagi integer;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  select versiya into v_bordagi from t2_narx_manba where id = p_id and kompaniya_id is null and holat = 'faol' for update;
  if v_bordagi is null then return jsonb_build_object('ok', false, 'error', 'Manba topilmadi'); end if;
  if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_bordagi then return jsonb_build_object('ok', false, 'sabab', 'versiya', 'bordagi_versiya', v_bordagi); end if;
  if exists (select 1 from t2_narx_dalil where manba_id = p_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'error', 'Manba smeta narxlarining dalili sifatida ishlatilmoqda — o''chirib bo''lmaydi');
  end if;
  update t2_narx_manba set holat = 'bekor', versiya = versiya + 1, kim = 'actor:' || p_actor_id, yangilandi = now() where id = p_id;
  perform public.t2_audit_yoz(v_ak, 'platforma_katalog_bekor', 'narx', null, format('manba=%s', p_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- Dalil bog'lash: platforma qatori ham dalil bo'la oladi; sarlavha qatori — yo'q.
create or replace function public.t2_narx_dalil_bogla_v1(p_kompaniya_id bigint, p_obyekt_id bigint, p_boglar jsonb, p_kim text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_soni int := 0; v_yomon int;
begin
  if not exists (select 1 from t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'error', 'Obyekt bu kompaniyaga tegishli emas');
  end if;
  if p_boglar is null or jsonb_typeof(p_boglar) <> 'array' or jsonb_array_length(p_boglar) = 0 or jsonb_array_length(p_boglar) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'Bog''lanishlar 1..5000 bo''lishi shart');
  end if;
  select count(*) into v_yomon
  from jsonb_array_elements(p_boglar) e
  left join t2_qator q on q.id = (e->>'qator_id')::bigint and q.obyekt_id = p_obyekt_id
  left join t2_narx_manba_qator mq on mq.id = (e->>'manba_qator_id')::bigint and (mq.kompaniya_id = p_kompaniya_id or mq.kompaniya_id is null) and not mq.sarlavha
  left join t2_narx_manba m on m.id = mq.manba_id and m.holat = 'faol'
  where q.id is null or mq.id is null or m.id is null;
  if v_yomon > 0 then
    return jsonb_build_object('ok', false, 'error', v_yomon || ' ta bog''lanish noto''g''ri (qator obyektda yoki manba pozitsiyasi topilmadi)');
  end if;
  update t2_narx_dalil d set holat = 'bekor'
   where d.holat = 'faol' and d.qator_id in (select (e->>'qator_id')::bigint from jsonb_array_elements(p_boglar) e);
  insert into t2_narx_dalil (kompaniya_id, obyekt_id, qator_id, manba_qator_id, manba_id, smeta_narx, manba_narx, izoh, kim)
  select p_kompaniya_id, p_obyekt_id, q.id, mq.id, mq.manba_id, q.narx, mq.narx, s.e->>'izoh', p_kim
  from (select distinct on ((x->>'qator_id')::bigint) x as e from jsonb_array_elements(p_boglar) x order by (x->>'qator_id')::bigint) s
  join t2_qator q on q.id = (s.e->>'qator_id')::bigint
  join t2_narx_manba_qator mq on mq.id = (s.e->>'manba_qator_id')::bigint;
  get diagnostics v_soni = row_count;
  return jsonb_build_object('ok', true, 'boglandi', v_soni);
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'error', 'qator_id / manba_qator_id son bo''lishi shart');
end $$;

revoke all on function public.t2_platforma_narx_manba_yoz_v1(bigint, jsonb, jsonb, text, bigint, integer, uuid) from public, anon, authenticated;
revoke all on function public.t2_platforma_narx_manba_bekor_v1(bigint, bigint, integer) from public, anon, authenticated;
grant execute on function public.t2_platforma_narx_manba_yoz_v1(bigint, jsonb, jsonb, text, bigint, integer, uuid) to service_role;
grant execute on function public.t2_platforma_narx_manba_bekor_v1(bigint, bigint, integer) to service_role;

commit;
