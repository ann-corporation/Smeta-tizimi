-- 20261216600000 - LOYIHA <-> SMETA <-> FAKT solishtirma (1-bosqich).
-- Egasi (PTO): "loyiha, fakt, smeta bir-biriga mos tushmaydi". Brauzer chizma jadvallarini o'qiydi (pdf.js), bu yerda faqat
-- TASDIQLANGAN / taklif qilingan loyiha miqdorlari (ingichka), smeta qatoriga bog'lanish va har farq uchun qaror saqlanadi.
-- Xom ekstraksiya JSON - R2 da (manba_r2 kaliti), bu yerda emas. Asl smeta (t2_qator) HECH QACHON o'zgarmaydi:
-- zamena / qo'shimcha ish / pereraschet mavjud oqimlar orqali, bu yerda faqat qaror + manba yoziladi.
-- Pul bu yerda hisoblanmaydi: faqat miqdorlar (birlik koeffitsiyenti bilan); summa - frontend lib/hisob-yadro.
-- DB hajmi: ~0.3 KB/miqdor qatori; 10 000 qator ~ 3 MB. Faqat additiv. Rollback/acceptance - yonidagi fayllar.

create table if not exists public.t2_loyiha_miqdor (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  varaq text not null check (length(btrim(varaq)) between 1 and 40),          -- varaq belgisi: 'KR-5' (t2_chizma_toplam bilan erkin bog'lanadi)
  toplam_id bigint,                                                            -- t2_chizma_toplam.id (boshqa tenant - FK yo'q)
  revizya integer not null default 0 check (revizya >= 0),
  nom text not null check (length(btrim(nom)) between 1 and 300),
  belgi text check (belgi is null or length(belgi) <= 60),                     -- marka / pozitsiya
  birlik text not null check (length(btrim(birlik)) between 1 and 20),         -- xom birlik ('100 m3', 't')
  miqdor numeric check (miqdor is null or (miqdor >= 0 and miqdor < 'Infinity'::numeric)),  -- NULL = noma'lum, 0 emas
  tur text not null default 'boshqa' check (tur in ('beton', 'armatura', 'pardoz', 'eshik_oyna', 'uskuna', 'boshqa')),
  manba_r2 text check (manba_r2 is null or length(manba_r2) <= 300),
  manba_sahifa integer check (manba_sahifa is null or manba_sahifa >= 1),
  manba_ref text check (manba_ref is null or length(manba_ref) <= 200),        -- jadval/qator ko'rsatkichi
  ishonch numeric check (ishonch is null or (ishonch >= 0 and ishonch <= 1)),
  holat text not null default 'taklif' check (holat in ('taklif', 'tasdiqlangan', 'rad')),
  eskirgan boolean not null default false,                                     -- yangi revizya almashtirgan
  revizya_farq text check (revizya_farq is null or revizya_farq in ('yangi', 'ozgargan', 'ayni', 'olingan')),
  oldingi_miqdor numeric,
  kalit text not null,                                                         -- revizyalar orasida solishtirish: tur|belgi|nom
  yaratdi_actor_id bigint not null,
  operation_id uuid,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create index if not exists t2_loyiha_miqdor_obyekt_idx on public.t2_loyiha_miqdor (kompaniya_id, obyekt_id, varaq) where not eskirgan;
create index if not exists t2_loyiha_miqdor_op_idx on public.t2_loyiha_miqdor (kompaniya_id, operation_id) where operation_id is not null;
alter table public.t2_loyiha_miqdor enable row level security;
revoke all on table public.t2_loyiha_miqdor from anon, authenticated;

create table if not exists public.t2_loyiha_moslik (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  miqdor_id bigint not null references public.t2_loyiha_miqdor(id),
  qator_id bigint not null references public.t2_qator(id),
  ball numeric check (ball is null or (ball >= 0 and ball <= 1)),
  sabab text check (sabab is null or length(sabab) <= 300),                    -- nega mos (oddiy matn)
  actor_id bigint not null,
  yaratildi timestamptz not null default now(),
  unique (miqdor_id, qator_id)
);
create index if not exists t2_loyiha_moslik_qator_idx on public.t2_loyiha_moslik (kompaniya_id, qator_id);
alter table public.t2_loyiha_moslik enable row level security;
revoke all on table public.t2_loyiha_moslik from anon, authenticated;

create table if not exists public.t2_loyiha_qaror (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  miqdor_id bigint not null references public.t2_loyiha_miqdor(id),
  tur text not null check (tur in ('boglandi', 'zamena', 'qoshimcha', 'pereraschet', 'etibor_yoq')),
  qator_id bigint,                                                             -- bog'liq smeta qatori (faqat havola)
  ref_jadval text check (ref_jadval is null or length(ref_jadval) <= 60),      -- yaratilgan zamena/qo'shimcha/o'zgarish yozuvi
  ref_id bigint,
  sabab text check (sabab is null or length(sabab) <= 500),
  manba_varaq text not null,                                                   -- inspeksiya javobi uchun: varaq, revizya, pozitsiya
  manba_revizya integer not null,
  manba_belgi text,
  eskirgan boolean not null default false,
  actor_id bigint not null,
  yaratildi timestamptz not null default now(),
  unique (miqdor_id)
);
alter table public.t2_loyiha_qaror enable row level security;
revoke all on table public.t2_loyiha_qaror from anon, authenticated;

-- Birlik normallashtirish: baza birlik + koeffitsiyent ('100 m3' -> m3 x100; 't' -> kg x1000).
create or replace function public._t2_lm_bk(p text) returns text language sql immutable as $$
  select replace(replace(regexp_replace(lower(btrim(coalesce(p, ''))), '^[0-9]+([.,][0-9]+)?\s*', ''), '.', ''), ' ', '')
$$;
create or replace function public._t2_lm_baza(p text) returns text language sql immutable as $$
  select case public._t2_lm_bk(p)
    when 'м3' then 'm3' when 'м³' then 'm3' when 'm3' then 'm3' when 'куб' then 'm3' when 'кубм' then 'm3'
    when 'м2' then 'm2' when 'м²' then 'm2' when 'm2' then 'm2'
    when 'м' then 'm' when 'm' then 'm' when 'пм' then 'm' when 'погм' then 'm' when 'pm' then 'm'
    when 'т' then 'kg' when 't' then 'kg' when 'тн' then 'kg' when 'tn' then 'kg' when 'тонна' then 'kg' when 'tonna' then 'kg' when 'кг' then 'kg' when 'kg' then 'kg'
    when 'шт' then 'dona' when 'dona' then 'dona' when 'sht' then 'dona' when 'комп' then 'dona' when 'komp' then 'dona'
    else null end
$$;
create or replace function public._t2_lm_koef(p text) returns numeric language plpgsql immutable as $$
declare s text := lower(btrim(coalesce(p, ''))); m text[]; k numeric := 1;
begin
  m := regexp_match(s, '^([0-9]+([.,][0-9]+)?)\s*');
  if m is not null then k := replace(m[1], ',', '.')::numeric; end if;
  if k <= 0 then k := 1; end if;
  if public._t2_lm_bk(p) in ('т', 't', 'тн', 'tn', 'тонна', 'tonna') then k := k * 1000; end if;   -- tonna -> kg
  return k;
end $$;
-- Normallashgan miqdor (baza birlikda); noma'lum birlik yoki NULL miqdor -> NULL (0 emas).
create or replace function public._t2_lm_norm(p_miqdor numeric, p_birlik text) returns numeric language sql immutable as $$
  select case when p_miqdor is null or public._t2_lm_baza(p_birlik) is null then null else p_miqdor * public._t2_lm_koef(p_birlik) end
$$;

-- Yangi varaq/revizya miqdorlarini yozadi (taklif); oldingi revizyani eskirgan qiladi va farqini hisoblaydi.
create or replace function public._t2_lm_yoz_ich(p_kompaniya_id bigint, p_obyekt_id bigint, p_varaq text, p_revizya integer, p_toplam_id bigint,
  p_items jsonb, p_actor_id bigint, p_op uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare it jsonb; v_kalit text; v_old public.t2_loyiha_miqdor; v_new_id bigint; v_miq numeric; v_birlik text; v_same boolean;
  v_yangi int := 0; v_ozgargan int := 0; v_ayni int := 0; v_olingan int := 0; v_eski_rev int;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'ITEMS', 'error', 'Miqdorlar ro''yxati 1..2000 ta bo''lishi kerak');
  end if;
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT', 'error', 'Obyekt sizning kompaniyangizniki emas');
  end if;
  if p_op is not null and exists (select 1 from public.t2_loyiha_miqdor where kompaniya_id = p_kompaniya_id and operation_id = p_op) then
    return jsonb_build_object('ok', true, 'qayta', true);
  end if;
  select max(revizya) into v_eski_rev from public.t2_loyiha_miqdor
   where kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id and upper(varaq) = upper(p_varaq) and not eskirgan;
  if v_eski_rev is not null and v_eski_rev >= p_revizya then
    return jsonb_build_object('ok', false, 'code', 'REVIZYA', 'error', 'Bu varaqning ' || v_eski_rev || '-revizyasi allaqachon yuklangan; yangisi katta raqamli bo''lsin');
  end if;
  -- validatsiya (hech narsa yozishdan oldin)
  for it in select * from jsonb_array_elements(p_items) loop
    if length(btrim(coalesce(it->>'nom', ''))) < 1 or length(btrim(coalesce(it->>'birlik', ''))) < 1 then
      return jsonb_build_object('ok', false, 'code', 'ITEM', 'error', 'Har qatorda nom va birlik kerak');
    end if;
    if nullif(it->>'miqdor', '') is not null and (it->>'miqdor')::numeric < 0 then
      return jsonb_build_object('ok', false, 'code', 'MIQDOR', 'error', 'Miqdor manfiy bo''lmaydi');
    end if;
  end loop;
  for it in select * from jsonb_array_elements(p_items) loop
    v_kalit := lower(coalesce(nullif(it->>'tur', ''), 'boshqa')) || '|' || lower(btrim(coalesce(it->>'belgi', ''))) || '|' || lower(btrim(it->>'nom'));
    v_miq := nullif(it->>'miqdor', '')::numeric;
    v_birlik := btrim(it->>'birlik');
    select * into v_old from public.t2_loyiha_miqdor
     where kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id and upper(varaq) = upper(p_varaq) and not eskirgan and kalit = v_kalit and revizya < p_revizya
     order by revizya desc limit 1;
    v_same := v_old.id is not null and v_old.miqdor is not distinct from v_miq and lower(v_old.birlik) = lower(v_birlik);
    insert into public.t2_loyiha_miqdor (kompaniya_id, obyekt_id, varaq, toplam_id, revizya, nom, belgi, birlik, miqdor, tur, manba_r2, manba_sahifa, manba_ref, ishonch,
      holat, revizya_farq, oldingi_miqdor, kalit, yaratdi_actor_id, operation_id)
    values (p_kompaniya_id, p_obyekt_id, btrim(p_varaq), p_toplam_id, p_revizya, btrim(it->>'nom'), nullif(btrim(coalesce(it->>'belgi', '')), ''), v_birlik, v_miq,
      coalesce(nullif(it->>'tur', ''), 'boshqa'), nullif(it->>'manba_r2', ''), nullif(it->>'manba_sahifa', '')::integer, left(it->>'manba_ref', 200),
      nullif(it->>'ishonch', '')::numeric, 'taklif',
      case when v_old.id is null then 'yangi' when v_same then 'ayni' else 'ozgargan' end,
      case when v_old.id is not null and not v_same then v_old.miqdor end,
      v_kalit, p_actor_id, p_op)
    returning id into v_new_id;
    if v_old.id is null then v_yangi := v_yangi + 1;
    elsif v_same then
      v_ayni := v_ayni + 1;
      -- o'zgarmagan: tasdiq, bog'lanish va qaror yangi qatorga o'tadi (qayta tasdiqlash shart emas)
      if v_old.holat = 'tasdiqlangan' then
        update public.t2_loyiha_miqdor set holat = 'tasdiqlangan' where id = v_new_id;
        update public.t2_loyiha_moslik set miqdor_id = v_new_id where miqdor_id = v_old.id;
        update public.t2_loyiha_qaror set miqdor_id = v_new_id, manba_revizya = p_revizya where miqdor_id = v_old.id;
      end if;
    else
      v_ozgargan := v_ozgargan + 1;
      update public.t2_loyiha_qaror set eskirgan = true where miqdor_id = v_old.id;  -- qaror eskirdi: qayta ko'rib chiqiladi
    end if;
    if v_old.id is not null then update public.t2_loyiha_miqdor set eskirgan = true, yangilandi = now() where id = v_old.id; end if;
  end loop;
  -- yangi revizyada yo'q bo'lib qolganlar: olingan
  update public.t2_loyiha_miqdor set eskirgan = true, revizya_farq = 'olingan', yangilandi = now()
   where kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id and upper(varaq) = upper(p_varaq) and not eskirgan and revizya < p_revizya;
  get diagnostics v_olingan = row_count;
  update public.t2_loyiha_qaror q set eskirgan = true
    from public.t2_loyiha_miqdor m
   where q.miqdor_id = m.id and m.revizya_farq = 'olingan' and m.kompaniya_id = p_kompaniya_id and m.obyekt_id = p_obyekt_id;
  return jsonb_build_object('ok', true, 'yangi', v_yangi, 'ozgargan', v_ozgargan, 'ayni', v_ayni, 'olingan', v_olingan);
end $$;

create or replace function public._t2_lm_tasdiq_ich(p_kompaniya_id bigint, p_ids bigint[], p_holat text, p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if p_holat not in ('tasdiqlangan', 'rad', 'taklif') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Holat noto''g''ri'); end if;
  update public.t2_loyiha_miqdor set holat = p_holat, yangilandi = now()
   where kompaniya_id = p_kompaniya_id and id = any (p_ids) and not eskirgan;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'yangilandi', n);
end $$;

create or replace function public._t2_lm_boglash_ich(p_kompaniya_id bigint, p_miqdor_id bigint, p_qator_id bigint, p_ball numeric, p_sabab text, p_amal text, p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.t2_loyiha_miqdor;
begin
  select * into m from public.t2_loyiha_miqdor where id = p_miqdor_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Miqdor topilmadi'); end if;
  if p_amal = 'ochir' then
    delete from public.t2_loyiha_moslik where kompaniya_id = p_kompaniya_id and miqdor_id = p_miqdor_id and qator_id = p_qator_id;
    return jsonb_build_object('ok', true);
  end if;
  if not exists (select 1 from public.t2_qator q where q.id = p_qator_id and q.kompaniya_id = p_kompaniya_id and q.obyekt_id = m.obyekt_id and q.versiya_holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'QATOR', 'error', 'Smeta qatori shu obyektning joriy smetasiga tegishli emas');
  end if;
  insert into public.t2_loyiha_moslik (kompaniya_id, miqdor_id, qator_id, ball, sabab, actor_id)
  values (p_kompaniya_id, p_miqdor_id, p_qator_id, p_ball, left(p_sabab, 300), p_actor_id)
  on conflict (miqdor_id, qator_id) do update set ball = excluded.ball, sabab = excluded.sabab, actor_id = excluded.actor_id;
  return jsonb_build_object('ok', true);
end $$;

-- Qaror: manba (varaq/revizya/pozitsiya) bilan yoziladi; t2_qator ga TEGILMAYDI (zamena/qo'shimcha/o'zgarish - mavjud oqimlar, ref_* faqat havola).
create or replace function public._t2_lm_qaror_ich(p_kompaniya_id bigint, p_miqdor_id bigint, p_tur text, p_qator_id bigint, p_ref_jadval text, p_ref_id bigint,
  p_sabab text, p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.t2_loyiha_miqdor;
begin
  select * into m from public.t2_loyiha_miqdor where id = p_miqdor_id and kompaniya_id = p_kompaniya_id and not eskirgan;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Miqdor topilmadi yoki eskirgan'); end if;
  if p_tur not in ('boglandi', 'zamena', 'qoshimcha', 'pereraschet', 'etibor_yoq') then
    return jsonb_build_object('ok', false, 'code', 'TUR', 'error', 'Qaror turi noto''g''ri');
  end if;
  if p_tur = 'etibor_yoq' and length(btrim(coalesce(p_sabab, ''))) < 3 then
    return jsonb_build_object('ok', false, 'code', 'SABAB', 'error', 'E''tiborsiz qoldirish uchun sabab yozing');
  end if;
  if p_qator_id is not null and not exists (select 1 from public.t2_qator q where q.id = p_qator_id and q.kompaniya_id = p_kompaniya_id and q.obyekt_id = m.obyekt_id) then
    return jsonb_build_object('ok', false, 'code', 'QATOR', 'error', 'Smeta qatori shu obyektga tegishli emas');
  end if;
  insert into public.t2_loyiha_qaror (kompaniya_id, obyekt_id, miqdor_id, tur, qator_id, ref_jadval, ref_id, sabab, manba_varaq, manba_revizya, manba_belgi, actor_id)
  values (p_kompaniya_id, m.obyekt_id, m.id, p_tur, p_qator_id, left(p_ref_jadval, 60), p_ref_id, left(p_sabab, 500), m.varaq, m.revizya, m.belgi, p_actor_id)
  on conflict (miqdor_id) do update set tur = excluded.tur, qator_id = excluded.qator_id, ref_jadval = excluded.ref_jadval, ref_id = excluded.ref_id,
    sabab = excluded.sabab, manba_revizya = excluded.manba_revizya, eskirgan = false, actor_id = excluded.actor_id, yaratildi = now();
  return jsonb_build_object('ok', true);
end $$;

-- Solishtirma: FAQAT tasdiqlangan miqdorlar hisobga olinadi (taklif - alohida sanoq). Birlik koeffitsiyenti ikki tomonda qo'llanadi.
-- Smeta: joriy (faol) versiya; fakt: bekor qilinmagan 'fakt' aktlar.
create or replace function public._t2_lm_farq_ich(p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r jsonb; v_taklif int; v_tasdiq int;
begin
  select count(*) filter (where holat = 'taklif'), count(*) filter (where holat = 'tasdiqlangan') into v_taklif, v_tasdiq
    from public.t2_loyiha_miqdor where kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id and not eskirgan;
  select coalesce(jsonb_agg(s.x order by s.x->>'varaq', (s.x->>'miqdor_id')::bigint), '[]'::jsonb) into r from (
    select jsonb_build_object(
      'miqdor_id', m.id, 'varaq', m.varaq, 'nom', m.nom, 'belgi', m.belgi, 'tur', m.tur, 'birlik', m.birlik, 'miqdor', m.miqdor,
      'baza', public._t2_lm_baza(m.birlik), 'miqdor_norm', public._t2_lm_norm(m.miqdor, m.birlik),
      'revizya', m.revizya, 'revizya_farq', m.revizya_farq,
      'qaror', (select jsonb_build_object('tur', q.tur, 'eskirgan', q.eskirgan, 'sabab', q.sabab) from public.t2_loyiha_qaror q where q.miqdor_id = m.id),
      'boglar', coalesce((select jsonb_agg(jsonb_build_object(
          'qator_id', q.id, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik, 'hajm', q.hajm, 'narx', q.narx,
          'hajm_norm', public._t2_lm_norm(q.hajm, q.birlik),
          'fakt', f.fakt, 'fakt_norm', public._t2_lm_norm(f.fakt, q.birlik)))
        from public.t2_loyiha_moslik mo
        join public.t2_qator q on q.id = mo.qator_id
        left join lateral (select sum(aq.hajm) as fakt from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
                            where aq.qator_id = q.id and a.tur = 'fakt' and a.holat <> 'bekor') f on true
        where mo.miqdor_id = m.id and q.versiya_holat = 'faol'), '[]'::jsonb)) as x
    from public.t2_loyiha_miqdor m
    where m.kompaniya_id = p_kompaniya_id and m.obyekt_id = p_obyekt_id and m.holat = 'tasdiqlangan' and not m.eskirgan
  ) s;
  return jsonb_build_object('ok', true, 'taklif_soni', v_taklif, 'tasdiqlangan_soni', v_tasdiq, 'miqdorlar', r);
end $$;

-- Takliflar va rad etilganlar - yengil ro'yxat (tasdiqlashga) + eskirgan/olingan belgilari.
create or replace function public._t2_lm_royxat_ich(p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true, 'miqdorlar', coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'varaq', m.varaq, 'revizya', m.revizya, 'nom', m.nom, 'belgi', m.belgi, 'birlik', m.birlik, 'miqdor', m.miqdor, 'tur', m.tur,
    'manba_r2', m.manba_r2, 'manba_sahifa', m.manba_sahifa, 'manba_ref', m.manba_ref, 'ishonch', m.ishonch, 'holat', m.holat,
    'eskirgan', m.eskirgan, 'revizya_farq', m.revizya_farq, 'oldingi_miqdor', m.oldingi_miqdor,
    'boglar', (select coalesce(jsonb_agg(mo.qator_id), '[]'::jsonb) from public.t2_loyiha_moslik mo where mo.miqdor_id = m.id),
    'qaror', (select q.tur from public.t2_loyiha_qaror q where q.miqdor_id = m.id and not q.eskirgan)
  ) order by m.varaq, m.id), '[]'::jsonb))
  from public.t2_loyiha_miqdor m
  where m.kompaniya_id = p_kompaniya_id and m.obyekt_id = p_obyekt_id and (not m.eskirgan or m.revizya_farq = 'olingan')
$$;

-- Matcher uchun yengil smeta qatorlari (joriy versiya): bo'lim (rz) nomlari ota_id orqali.
create or replace function public._t2_lm_smeta_ich(p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true, 'qatorlar', coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'ota_id', q.ota_id, 'tur', q.tur, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik, 'hajm', q.hajm, 'narx', q.narx, 'kat', q.kat, 'tartib', q.tartib, 'versiya', q.versiya
  ) order by q.tartib, q.id), '[]'::jsonb))
  from public.t2_qator q
  where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol' and q.tur in ('rz', 'bl', 'rs')
$$;

-- Ochiq (actor tekshiruvli) RPC lar ---------------------------------------------------------------------------------------------
create or replace function public.t2_loyiha_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_varaq text, p_revizya integer, p_toplam_id bigint,
  p_items jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  return public._t2_lm_yoz_ich(p_kompaniya_id, p_obyekt_id, p_varaq, p_revizya, p_toplam_id, p_items, p_actor_id, p_operation_id);
end $$;
create or replace function public.t2_loyiha_tasdiq_v1(p_actor_id bigint, p_kompaniya_id bigint, p_ids bigint[], p_holat text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  return public._t2_lm_tasdiq_ich(p_kompaniya_id, p_ids, p_holat, p_actor_id);
end $$;
create or replace function public.t2_loyiha_boglash_v1(p_actor_id bigint, p_kompaniya_id bigint, p_miqdor_id bigint, p_qator_id bigint, p_ball numeric, p_sabab text, p_amal text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  return public._t2_lm_boglash_ich(p_kompaniya_id, p_miqdor_id, p_qator_id, p_ball, p_sabab, p_amal, p_actor_id);
end $$;
create or replace function public.t2_loyiha_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_miqdor_id bigint, p_tur text, p_qator_id bigint, p_ref_jadval text,
  p_ref_id bigint, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  return public._t2_lm_qaror_ich(p_kompaniya_id, p_miqdor_id, p_tur, p_qator_id, p_ref_jadval, p_ref_id, p_sabab, p_actor_id);
end $$;
create or replace function public.t2_loyiha_farq_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.read');
  return public._t2_lm_farq_ich(p_kompaniya_id, p_obyekt_id);
end $$;
create or replace function public.t2_loyiha_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.read');
  return public._t2_lm_royxat_ich(p_kompaniya_id, p_obyekt_id);
end $$;
create or replace function public.t2_loyiha_smeta_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.read');
  return public._t2_lm_smeta_ich(p_kompaniya_id, p_obyekt_id);
end $$;

do $g$
declare f text;
begin
  foreach f in array array[
    '_t2_lm_yoz_ich(bigint,bigint,text,integer,bigint,jsonb,bigint,uuid)', '_t2_lm_tasdiq_ich(bigint,bigint[],text,bigint)',
    '_t2_lm_boglash_ich(bigint,bigint,bigint,numeric,text,text,bigint)', '_t2_lm_qaror_ich(bigint,bigint,text,bigint,text,bigint,text,bigint)',
    '_t2_lm_farq_ich(bigint,bigint)', '_t2_lm_royxat_ich(bigint,bigint)', '_t2_lm_smeta_ich(bigint,bigint)',
    't2_loyiha_yoz_v1(bigint,bigint,bigint,text,integer,bigint,jsonb,uuid)', 't2_loyiha_tasdiq_v1(bigint,bigint,bigint[],text)',
    't2_loyiha_boglash_v1(bigint,bigint,bigint,bigint,numeric,text,text)', 't2_loyiha_qaror_v1(bigint,bigint,bigint,text,bigint,text,bigint,text)',
    't2_loyiha_farq_v1(bigint,bigint,bigint)', 't2_loyiha_royxat_v1(bigint,bigint,bigint)', 't2_loyiha_smeta_v1(bigint,bigint,bigint)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $g$;

comment on function public._t2_lm_farq_ich(bigint,bigint) is 'versiya: versiya - faqat versiya_holat = faol smeta qatorlari; fakt - t2_akt_qator (tarix, bekor qilinmagan fakt aktlari).';
comment on function public._t2_lm_smeta_ich(bigint,bigint) is 'versiya: versiya - faqat versiya_holat = faol qatorlar (smeta asosi).';
comment on function public._t2_lm_boglash_ich(bigint,bigint,bigint,numeric,text,text,bigint) is 'versiya: versiya - bog''lanish faqat joriy (faol) smeta qatoriga.';
comment on function public._t2_lm_qaror_ich(bigint,bigint,text,bigint,text,bigint,text,bigint) is 'versiya: texnik - qator faqat obyektga tegishliligi tekshiriladi (id bo''yicha), qiymati o''qilmaydi; t2_qator o''zgarmaydi.';
comment on function public.t2_loyiha_farq_v1(bigint,bigint,bigint) is 'versiya: versiya - faqat faol smeta qatorlari; fakt tarixdan.';
comment on function public.t2_loyiha_smeta_v1(bigint,bigint,bigint) is 'versiya: versiya - faqat versiya_holat = faol qatorlar.';
comment on function public.t2_loyiha_boglash_v1(bigint,bigint,bigint,bigint,numeric,text,text) is 'versiya: versiya - faqat faol smeta qatoriga bog''lanadi.';
comment on function public.t2_loyiha_qaror_v1(bigint,bigint,bigint,text,bigint,text,bigint,text) is 'versiya: texnik - qator faqat obyektga tegishliligi tekshiriladi, qiymati o''qilmaydi.';
