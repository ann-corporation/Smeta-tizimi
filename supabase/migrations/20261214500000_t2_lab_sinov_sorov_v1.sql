-- 20261214500000 - LABORATORIYA TOMONI: sinov so'rovi (pudratchi) -> laboratoriya protokoli -> АОСР / ish qatoriga avtomat ilova (ekotizim V3).
-- Yangi hujjat/inbox jadvali YO'Q: so'rov = mavjud t2_tomon_murojaat (turi 'sinov_sorovi'; laboratoriya «Bugun» ro'yxatida ijrochi sifatida ko'radi),
-- predpisaniya = shu primitivning 'predpisaniya' turi, dalil fayli = t2_tomon_murojaat_hujjat (R2 reyestri). Faqat 1:1 «tafsilot» jadvali (t2_lab_sinov_sorov)
-- va sinov turlari katalogi (t2_lab_sinov_turi) qo'shiladi. Kompaniyalararo ko'rinish: FAQAT faol aloqa (qarshi tomon roli «laboratoriya») orqali.
--   1. t2_lab_sinov_turi: katalog (IJRO §2: IJ-03 zichlash, IJ-04 beton kub, IJ-05 payvand, IJ-06 gidravlik, IJ-07 elektr + boshqa) va tur bo'yicha tuzilgan maydonlar.
--   2. t2_lab_sorov_yarat_v1: pudratchi АОСР/ish qatori kontekstidan so'rov yuboradi (qayta sinov = asl_sorov_id).
--   3. t2_lab_sorov_natija_v1: laboratoriya protokolni to'ldiradi (mos/mos emas, maydonlar, fayl). Server pudratchi kompaniyasida:
--        - t2_lab_protokol (ko'zgu yozuv) + t2_lab_protokol_bog (АОСР va ish qatori) yaratadi/yangilaydi -> АОСР va reestr o'zgarishsiz ishlaydi;
--        - «mos emas» -> pudratchiga PREDPISANIYA (murojaat) ochadi; qayta sinov «mos» bo'lsa predpisaniya avtomat yopiladi;
--        - summa bo'lsa va pudratchining shu laboratoriya bilan qo'shimcha (asosiy=false) shartnomasi aniq bitta bo'lsa -> t2_qarz_asos (bajarilgan_ish, QQS bilan).
--   4. АОСР qorovuli: majburiy sinovi «mos emas» (qayta sinovda mos chiqmagan) АОСР qarshi tomonga YUBORILMAYDI (trigger t2_tomon_taqdim).
-- DB hajmi: ~1 KB/so'rov (<= 8 KB maydon jsonb) -> 500 so'rov/oy ~ 0.5 MB/oy. Fayllar R2 da.
-- versiya: tarix (t2_qator o'qilmaydi; faqat id bo'yicha tegishlilik tekshiruvi)

-- 1. Katalog
create table if not exists public.t2_lab_sinov_turi (
  kalit text primary key check (kalit ~ '^[a-z][a-z0-9_]{1,40}$'),
  nom text not null, nom_ru text,
  mirror_turi text not null check (mirror_turi in ('beton','grunt','armatura','payvand','material','boshqa')),
  standart text, norma_izoh text,
  maydonlar jsonb not null default '[]'::jsonb check (jsonb_typeof(maydonlar) = 'array'),
  faol boolean not null default true, tartib integer not null default 100
);
alter table public.t2_lab_sinov_turi enable row level security;
revoke all on table public.t2_lab_sinov_turi from anon, authenticated;

insert into public.t2_lab_sinov_turi (kalit, nom, nom_ru, mirror_turi, standart, norma_izoh, maydonlar, tartib) values
 ('beton_kub', 'Beton mustahkamligi (kub namuna)', 'Прочность бетона (кубы)', 'beton', 'ГОСТ 10180, ГОСТ 18105, ГОСТ 22690',
  'Norma/band raqamlarini PTO/yurist tasdiqlashi kerak (IJRO §7).',
  '[{"kalit":"marka_sinf","nom":"Beton markasi / sinfi","tur":"matn","majburiy":true},
    {"kalit":"quyma_sana","nom":"Quyma sanasi","tur":"sana"},
    {"kalit":"namuna_soni","nom":"Namuna soni","tur":"son","birlik":"dona"},
    {"kalit":"yosh_kun","nom":"Yosh","tur":"son","birlik":"kun","majburiy":true},
    {"kalit":"olchangan_mpa","nom":"O‘lchangan mustahkamlik","tur":"son","birlik":"MPa","majburiy":true},
    {"kalit":"talab_mpa","nom":"Loyiha talabi","tur":"son","birlik":"MPa","majburiy":true},
    {"kalit":"asbob","nom":"Asbob va kalibrovka","tur":"matn"}]'::jsonb, 10),
 ('grunt_zichlik', 'Grunt zichlanishi', 'Уплотнение грунта/основания', 'grunt', 'ГОСТ 22733, ШНК 3.02.01',
  'Norma/band raqamlarini PTO/yurist tasdiqlashi kerak (IJRO §7).',
  '[{"kalit":"qatlam","nom":"Qatlam / joy","tur":"matn","majburiy":true},
    {"kalit":"qalinlik_sm","nom":"Qatlam qalinligi","tur":"son","birlik":"sm"},
    {"kalit":"usul","nom":"Usul","tur":"matn"},
    {"kalit":"namuna_no","nom":"Namuna №","tur":"matn"},
    {"kalit":"olchangan_k","nom":"O‘lchangan zichlash koeffitsienti","tur":"son","majburiy":true},
    {"kalit":"talab_k","nom":"Loyiha talabi (koeffitsient)","tur":"son","majburiy":true},
    {"kalit":"asbob","nom":"Asbob","tur":"matn"}]'::jsonb, 20),
 ('payvand', 'Payvand choklari', 'Сварные соединения', 'payvand', 'ГОСТ 5264, ГОСТ 14771, ГОСТ 7512/14782; ШНК 3.03.01',
  'Norma/band raqamlarini PTO/yurist tasdiqlashi kerak (IJRO §7).',
  '[{"kalit":"choklar","nom":"Choklar ro‘yxati / raqamlari","tur":"matn","majburiy":true},
    {"kalit":"payvandchi_attestat","nom":"Payvandchi attestat №","tur":"matn"},
    {"kalit":"usul","nom":"Nazorat usuli (vizual / UZK / rentgen)","tur":"matn","majburiy":true},
    {"kalit":"baho","nom":"Baho","tur":"matn","majburiy":true},
    {"kalit":"nuqson","nom":"Nuqson","tur":"matn"},
    {"kalit":"asbob","nom":"Asbob","tur":"matn"}]'::jsonb, 30),
 ('gidravlik', 'Gidravlik sinov (opressovka)', 'Гидравлическое испытание', 'boshqa', 'ШНК 3.05.01, ШНК 3.05.04',
  'Norma/band raqamlarini PTO/yurist tasdiqlashi kerak (IJRO §7).',
  '[{"kalit":"tizim","nom":"Tizim / uchastka","tur":"matn","majburiy":true},
    {"kalit":"sinov_bosimi_mpa","nom":"Sinov bosimi","tur":"son","birlik":"MPa","majburiy":true},
    {"kalit":"ushlab_turish_min","nom":"Ushlab turish vaqti","tur":"son","birlik":"min","majburiy":true},
    {"kalit":"bosim_pasayishi_mpa","nom":"Bosim pasayishi","tur":"son","birlik":"MPa","majburiy":true},
    {"kalit":"ruxsat_pasayish_mpa","nom":"Ruxsat etilgan pasayish","tur":"son","birlik":"MPa"},
    {"kalit":"asbob","nom":"Asbob","tur":"matn"}]'::jsonb, 40),
 ('elektr', 'Elektr o‘lchovlari (izolyatsiya, zazemleniye)', 'Испытание электроустановок', 'boshqa', 'ПУЭ, ШНК 3.05.06',
  'Norma/band raqamlarini PTO/yurist tasdiqlashi kerak (IJRO §7).',
  '[{"kalit":"liniya","nom":"Tizim / liniya","tur":"matn","majburiy":true},
    {"kalit":"megger_kuchlanish_v","nom":"Megger kuchlanishi","tur":"son","birlik":"V"},
    {"kalit":"izolyatsiya_mom","nom":"Izolyatsiya qarshiligi","tur":"son","birlik":"MOm","majburiy":true},
    {"kalit":"talab_izolyatsiya_mom","nom":"Talab etilgan izolyatsiya","tur":"son","birlik":"MOm"},
    {"kalit":"kontur_om","nom":"Zazemleniye kontur qarshiligi","tur":"son","birlik":"Om"},
    {"kalit":"asbob","nom":"Asbob va kalibrovka","tur":"matn"}]'::jsonb, 50),
 ('boshqa', 'Boshqa sinov', 'Прочее испытание', 'boshqa', null, null,
  '[{"kalit":"tavsif","nom":"Sinov tavsifi","tur":"matn","majburiy":true}]'::jsonb, 100)
on conflict (kalit) do nothing;

-- 2. So'rov tafsiloti (1:1 murojaat)
create table if not exists public.t2_lab_sinov_sorov (
  murojaat_id bigint primary key references public.t2_tomon_murojaat(id),
  kompaniya_id bigint not null references public.t2_kompaniya(id),            -- pudratchi (so'rovchi)
  lab_kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  sinov_turi text not null references public.t2_lab_sinov_turi(kalit),
  aosr_id bigint references public.t2_aosr(id),
  qator_id bigint references public.t2_qator(id),
  konstruksiya text check (konstruksiya is null or length(konstruksiya) <= 300),
  namuna_soni integer check (namuna_soni is null or namuna_soni between 1 and 1000),
  majburiy boolean not null default true,
  asl_sorov_id bigint references public.t2_lab_sinov_sorov(murojaat_id),
  natija text not null default 'kutilmoqda' check (natija in ('kutilmoqda','mos','mos_emas')),
  protokol_raqam text check (protokol_raqam is null or length(protokol_raqam) <= 100),
  protokol_sana date,
  maydon jsonb not null default '{}'::jsonb check (jsonb_typeof(maydon) = 'object' and length(maydon::text) <= 8192),
  xulosa text check (xulosa is null or length(xulosa) <= 2000),
  summa numeric, invoys_raqam text, invoys_sana date,
  fayl_document_id bigint,
  mirror_protokol_id bigint references public.t2_lab_protokol(id),
  predpisaniya_id bigint references public.t2_tomon_murojaat(id),
  qarz_asos_id bigint references public.t2_qarz_asos(id),
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(), yangilandi timestamptz not null default now()
);
create index if not exists t2_lab_sinov_sorov_komp_idx on public.t2_lab_sinov_sorov (kompaniya_id, obyekt_id);
create index if not exists t2_lab_sinov_sorov_lab_idx on public.t2_lab_sinov_sorov (lab_kompaniya_id);
create index if not exists t2_lab_sinov_sorov_aosr_idx on public.t2_lab_sinov_sorov (aosr_id) where aosr_id is not null;
create index if not exists t2_lab_sinov_sorov_asl_idx on public.t2_lab_sinov_sorov (asl_sorov_id) where asl_sorov_id is not null;
alter table public.t2_lab_sinov_sorov enable row level security;
revoke all on table public.t2_lab_sinov_sorov from anon, authenticated;

-- 3. Rol qoidasi (alohida: _t2_tomon_rol_ok ga tegilmaydi - boshqa tomon migratsiyalari bilan to'qnashmaslik uchun)
create or replace function public._t2_lab_rol_ok(p_rol text, p_amal text) returns boolean
language sql immutable as $$
  select case p_amal
    when 'sorov'  then p_rol in ('superadmin','admin','boss','rahbar','director','pto','prorab')
    when 'natija' then p_rol in ('superadmin','admin','boss','rahbar','director','inspektor')
    when 'korish' then true
    else false end
$$;

create or replace function public._t2_lab_azo(p_actor_id bigint, p_kompaniya_id bigint, p_amal text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if not public._t2_lab_rol_ok(v_rol, p_amal) then
    raise exception 'TOMON_ROL_YETARLI_EMAS: % roli "%" amalini bajara olmaydi', v_rol, p_amal using errcode = '42501';
  end if;
  return v_rol;
end $$;

-- Katalog maydonlariga qarab tekshiruv: bo'sh qaytsa - to'g'ri.
create or replace function public._t2_lab_maydon_tekshir(p_turi text, p_m jsonb) returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare d jsonb; f jsonb; v jsonb; k text;
begin
  select maydonlar into d from public.t2_lab_sinov_turi where kalit = p_turi;
  if d is null then return 'Sinov turi noto‘g‘ri'; end if;
  if p_m is null or jsonb_typeof(p_m) <> 'object' then return 'Maydonlar obyekt bo‘lishi kerak'; end if;
  for k in select jsonb_object_keys(p_m) loop
    if not exists (select 1 from jsonb_array_elements(d) e where e->>'kalit' = k) then return 'Noma‘lum maydon: ' || left(k, 40); end if;
  end loop;
  for f in select * from jsonb_array_elements(d) loop
    v := p_m -> (f->>'kalit');
    if coalesce((f->>'majburiy')::boolean, false) and (v is null or jsonb_typeof(v) = 'null' or btrim(v #>> '{}') = '') then
      return 'To‘ldirilmagan: ' || (f->>'nom');
    end if;
    if v is not null and jsonb_typeof(v) <> 'null' and btrim(v #>> '{}') <> '' then
      if f->>'tur' = 'son' and (v #>> '{}') !~ '^-?[0-9]+([.,][0-9]+)?$' then return 'Son kerak: ' || (f->>'nom'); end if;
      if f->>'tur' = 'sana' and (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then return 'Sana kerak: ' || (f->>'nom'); end if;
    end if;
  end loop;
  return null;
end $$;

-- АОСР bo'yicha sinov holati: bloklovchi (mos emas, qayta sinovda mos chiqmagan) va kutilayotgan majburiy so'rovlar.
create or replace function public._t2_lab_aosr_holat(p_aosr_id bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'nomos', coalesce((select jsonb_agg(jsonb_build_object('murojaat_id', s.murojaat_id, 'nom', t.nom, 'protokol_raqam', s.protokol_raqam) order by s.murojaat_id)
        from public.t2_lab_sinov_sorov s join public.t2_tomon_murojaat m on m.id = s.murojaat_id and m.holat <> 'bekor'
        join public.t2_lab_sinov_turi t on t.kalit = s.sinov_turi
       where s.aosr_id = p_aosr_id and s.majburiy and s.natija = 'mos_emas'
         and not exists (select 1 from public.t2_lab_sinov_sorov r join public.t2_tomon_murojaat rm on rm.id = r.murojaat_id and rm.holat <> 'bekor'
                          where r.asl_sorov_id = s.murojaat_id and r.natija = 'mos')), '[]'::jsonb),
    'kutilmoqda', coalesce((select jsonb_agg(jsonb_build_object('murojaat_id', s.murojaat_id, 'nom', t.nom) order by s.murojaat_id)
        from public.t2_lab_sinov_sorov s join public.t2_tomon_murojaat m on m.id = s.murojaat_id and m.holat = 'ochiq'
        join public.t2_lab_sinov_turi t on t.kalit = s.sinov_turi
       where s.aosr_id = p_aosr_id and s.majburiy and s.natija = 'kutilmoqda'), '[]'::jsonb))
$$;

-- 4. Qorovul: majburiy sinovi mos emas АОСР qarshi tomonga yuborilmaydi
create or replace function public._t2_lab_aosr_qorovul() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if new.manba_jadval = 't2_aosr' then
    v := public._t2_lab_aosr_holat(new.manba_id);
    if jsonb_array_length(v -> 'nomos') > 0 then
      raise exception 'LAB_MOS_EMAS: majburiy sinov natijasi mos emas (%) - qayta sinovdan mos chiqmaguncha АОСР tasdiqqa yuborilmaydi',
        (v -> 'nomos' -> 0 ->> 'nom') using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t2_lab_aosr_qorovul on public.t2_tomon_taqdim;
create trigger t2_lab_aosr_qorovul before insert on public.t2_tomon_taqdim
  for each row execute function public._t2_lab_aosr_qorovul();

-- 5. Katalog o'qish
create or replace function public.t2_lab_sinov_turlari_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_lab_azo(p_actor_id, p_kompaniya_id, 'korish');
  return coalesce((select jsonb_agg(jsonb_build_object('kalit', t.kalit, 'nom', t.nom, 'nom_ru', t.nom_ru, 'standart', t.standart,
    'norma_izoh', t.norma_izoh, 'maydonlar', t.maydonlar) order by t.tartib, t.kalit) from public.t2_lab_sinov_turi t where t.faol), '[]'::jsonb);
end $$;

-- 6. So'rov yuborish (pudratchi)
create or replace function public.t2_lab_sorov_yarat_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_sinov_turi text, p_obyekt_id bigint, p_aosr_id bigint, p_qator_id bigint,
  p_konstruksiya text, p_joy text, p_namuna_soni integer, p_muddat date, p_izoh text, p_majburiy boolean, p_asl_sorov_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.t2_tomon_aloqa; v_lab bigint; v_labrol text; v_old public.t2_tomon_murojaat; v_id bigint; tt public.t2_lab_sinov_turi;
  v_asl public.t2_lab_sinov_sorov; v_aosr bigint := p_aosr_id; v_qator bigint := p_qator_id; v_turi text := p_sinov_turi; v_obyekt bigint := p_obyekt_id;
  v_sarlavha text; v_matn text; v_kons text := nullif(btrim(coalesce(p_konstruksiya, '')), '');
begin
  perform public._t2_lab_azo(p_actor_id, p_kompaniya_id, 'sorov');
  if p_operation_id is not null then
    select * into v_old from public.t2_tomon_murojaat where beruvchi_kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
    if found then return jsonb_build_object('ok', true, 'id', v_old.id, 'holat', v_old.holat, 'qayta', true); end if;
  end if;
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id;
  if not found or (a.taklif_kompaniya_id <> p_kompaniya_id and a.qabul_kompaniya_id is distinct from p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Aloqa topilmadi');
  end if;
  if a.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'So‘rov faqat faol aloqada yuboriladi'); end if;
  v_lab := public._t2_tomon_qarshi(a, p_kompaniya_id);
  v_labrol := case when a.taklif_kompaniya_id = v_lab then a.taklif_rol else a.qabul_rol end;
  if lower(btrim(coalesce(v_labrol, ''))) <> 'laboratoriya' then
    return jsonb_build_object('ok', false, 'code', 'LAB_EMAS', 'error', 'Bu aloqa laboratoriya bilan emas (qarshi tomon roli «laboratoriya» bo‘lishi kerak)');
  end if;
  if p_asl_sorov_id is not null then
    select s.* into v_asl from public.t2_lab_sinov_sorov s where s.murojaat_id = p_asl_sorov_id and s.kompaniya_id = p_kompaniya_id and s.natija = 'mos_emas';
    if not found then return jsonb_build_object('ok', false, 'code', 'ASL_YOQ', 'error', 'Qayta sinov faqat «mos emas» so‘rov uchun'); end if;
    v_turi := v_asl.sinov_turi; v_obyekt := v_asl.obyekt_id; v_aosr := coalesce(v_aosr, v_asl.aosr_id); v_qator := coalesce(v_qator, v_asl.qator_id); v_kons := coalesce(v_kons, v_asl.konstruksiya);
  end if;
  select * into tt from public.t2_lab_sinov_turi where kalit = v_turi and faol;
  if not found then return jsonb_build_object('ok', false, 'code', 'TUR_YOQ', 'error', 'Sinov turi noto‘g‘ri'); end if;
  if v_obyekt is null or not exists (select 1 from public.t2_obyekt where id = v_obyekt and kompaniya_id = p_kompaniya_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_KERAK', 'error', 'Obyekt tanlang (o‘z obyektingiz)');
  end if;
  if v_aosr is not null and not exists (select 1 from public.t2_aosr where id = v_aosr and kompaniya_id = p_kompaniya_id and obyekt_id = v_obyekt and holat <> 'bekor') then
    return jsonb_build_object('ok', false, 'code', 'AOSR_BEGONA', 'error', 'АОСР shu obyektga tegishli emas');
  end if;
  if v_qator is not null and not exists (select 1 from public.t2_qator where id = v_qator and obyekt_id = v_obyekt) then
    return jsonb_build_object('ok', false, 'code', 'QATOR_BEGONA', 'error', 'Ish qatori shu obyektga tegishli emas');
  end if;
  v_sarlavha := left(tt.nom || coalesce(' — ' || v_kons, ''), 200);
  v_matn := left(concat_ws(E'\n', 'Sinov: ' || tt.nom, case when tt.standart is not null then 'Norma: ' || tt.standart end,
    case when p_namuna_soni is not null then 'Namuna soni: ' || p_namuna_soni end, nullif(btrim(coalesce(p_izoh, '')), '')), 4000);
  insert into public.t2_tomon_murojaat (aloqa_id, turi, beruvchi_kompaniya_id, ijrochi_kompaniya_id, obyekt_id, joy, sarlavha, matn, muhimlik, muddat, beruvchi_actor_id, operation_id)
  values (a.id, 'sinov_sorovi', p_kompaniya_id, v_lab, v_obyekt, nullif(btrim(coalesce(p_joy, '')), ''), v_sarlavha, v_matn, case when p_asl_sorov_id is not null then 'yuqori' else 'oddiy' end, p_muddat, p_actor_id, p_operation_id)
  returning id into v_id;
  insert into public.t2_lab_sinov_sorov (murojaat_id, kompaniya_id, lab_kompaniya_id, obyekt_id, sinov_turi, aosr_id, qator_id, konstruksiya, namuna_soni, majburiy, asl_sorov_id)
  values (v_id, p_kompaniya_id, v_lab, v_obyekt, v_turi, v_aosr, v_qator, v_kons, p_namuna_soni, coalesce(p_majburiy, true), p_asl_sorov_id);
  insert into public.t2_tomon_hodisa (aloqa_id, murojaat_id, kompaniya_id, actor_id, tur, matn, meta)
  values (a.id, v_id, p_kompaniya_id, p_actor_id, 'murojaat', v_sarlavha, jsonb_build_object('turi', 'sinov_sorovi', 'sinov', v_turi, 'aosr_id', v_aosr));
  return jsonb_build_object('ok', true, 'id', v_id, 'holat', 'ochiq');
end $$;

-- 7. Ro'yxat (laboratoriya: kelgan; pudratchi: yuborilgan) - bitta so'rov
create or replace function public.t2_lab_sorov_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text, p_holat text, p_obyekt_id bigint, p_aosr_id bigint, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 300); v jsonb;
begin
  perform public._t2_lab_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object('id', m.id, 'sinov_turi', s.sinov_turi, 'sinov_nom', t.nom, 'sarlavha', m.sarlavha, 'holat', m.holat, 'natija', s.natija,
      'muhimlik', m.muhimlik, 'muddat', m.muddat, 'kechikkan', m.muddat is not null and m.muddat < current_date and m.holat = 'ochiq',
      'majburiy', s.majburiy, 'qayta_sinov', s.asl_sorov_id is not null, 'obyekt_id', s.obyekt_id, 'obyekt_nom', (select o.nom from public.t2_obyekt o where o.id = s.obyekt_id),
      'aosr_id', s.aosr_id, 'aosr_raqam', (select a.raqam from public.t2_aosr a where a.id = s.aosr_id), 'qator_id', s.qator_id, 'joy', m.joy, 'konstruksiya', s.konstruksiya,
      'qarshi_nom', (select k.nom from public.t2_kompaniya k where k.id = case when s.lab_kompaniya_id = p_kompaniya_id then s.kompaniya_id else s.lab_kompaniya_id end),
      'protokol_raqam', s.protokol_raqam, 'summa', case when s.kompaniya_id = p_kompaniya_id or s.lab_kompaniya_id = p_kompaniya_id then s.summa end,
      'versiya', s.versiya, 'yaratildi', m.yaratildi) x
      from public.t2_lab_sinov_sorov s join public.t2_tomon_murojaat m on m.id = s.murojaat_id join public.t2_lab_sinov_turi t on t.kalit = s.sinov_turi
     where ((p_yonalish = 'kelgan' and s.lab_kompaniya_id = p_kompaniya_id) or (p_yonalish <> 'kelgan' and s.kompaniya_id = p_kompaniya_id))
       and (coalesce(p_holat, '') = '' or m.holat = p_holat) and (p_obyekt_id is null or s.obyekt_id = p_obyekt_id) and (p_aosr_id is null or s.aosr_id = p_aosr_id)
     order by m.id desc limit v_lim) q;
  return v;
end $$;

-- 8. Tafsilot
create or replace function public.t2_lab_sorov_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_murojaat_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.t2_lab_sinov_sorov; m public.t2_tomon_murojaat; t public.t2_lab_sinov_turi;
begin
  perform public._t2_lab_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into s from public.t2_lab_sinov_sorov where murojaat_id = p_murojaat_id and (kompaniya_id = p_kompaniya_id or lab_kompaniya_id = p_kompaniya_id);
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'So‘rov topilmadi'); end if;
  select * into m from public.t2_tomon_murojaat where id = s.murojaat_id;
  select * into t from public.t2_lab_sinov_turi where kalit = s.sinov_turi;
  return jsonb_build_object('ok', true,
    'sorov', jsonb_build_object('id', m.id, 'sinov_turi', s.sinov_turi, 'sinov_nom', t.nom, 'standart', t.standart, 'maydonlar', t.maydonlar, 'holat', m.holat,
      'natija', s.natija, 'matn', m.matn, 'joy', m.joy, 'muddat', m.muddat, 'konstruksiya', s.konstruksiya, 'namuna_soni', s.namuna_soni, 'majburiy', s.majburiy,
      'asl_sorov_id', s.asl_sorov_id, 'obyekt_nom', (select o.nom from public.t2_obyekt o where o.id = s.obyekt_id),
      'aosr_id', s.aosr_id, 'aosr_raqam', (select a.raqam from public.t2_aosr a where a.id = s.aosr_id), 'qator_id', s.qator_id,
      'protokol_raqam', s.protokol_raqam, 'protokol_sana', s.protokol_sana, 'natija_maydon', s.maydon, 'xulosa', s.xulosa,
      'summa', s.summa, 'invoys_raqam', s.invoys_raqam, 'invoys_sana', s.invoys_sana, 'fayl_document_id', s.fayl_document_id,
      'predpisaniya_id', s.predpisaniya_id, 'qarz_yozildi', s.qarz_asos_id is not null, 'versiya', s.versiya,
      'men_laboratoriyaman', s.lab_kompaniya_id = p_kompaniya_id,
      'beruvchi_nom', (select nom from public.t2_kompaniya where id = s.kompaniya_id), 'lab_nom', (select nom from public.t2_kompaniya where id = s.lab_kompaniya_id)),
    'hujjatlar', coalesce((select jsonb_agg(jsonb_build_object('document_id', h.document_id, 'fayl', d.original_filename, 'mime', d.mime_type, 'olcham', d.size_bytes) order by h.id)
        from public.t2_tomon_murojaat_hujjat h join public.t2_document_registry d on d.id = h.document_id where h.murojaat_id = m.id), '[]'::jsonb));
end $$;

-- 9. Laboratoriya protokolni to'ldiradi
create or replace function public.t2_lab_sorov_natija_v1(p_actor_id bigint, p_kompaniya_id bigint, p_murojaat_id bigint, p_kutilgan_versiya integer, p_malumot jsonb, p_document_ids bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.t2_lab_sinov_sorov; m public.t2_tomon_murojaat; tt public.t2_lab_sinov_turi; mm jsonb := coalesce(p_malumot, '{}'::jsonb);
  v_natija text := mm->>'natija'; v_raqam text := nullif(btrim(coalesce(mm->>'protokol_raqam', '')), ''); v_sana date; v_inv date; v_summa numeric; v_xul text := nullif(btrim(coalesce(mm->>'xulosa', '')), '');
  v_maydon jsonb := coalesce(mm->'maydon', '{}'::jsonb); v_err text; v_muddat date; v_fayl bigint; v_son integer; v_lab public.t2_kompaniya; v_kontr bigint; v_prot bigint; v_pred bigint; v_qarz bigint;
  v_sh bigint; v_sh_son integer; v_qarz_holat text := 'summa_yoq'; v_javob text; v_asl public.t2_lab_sinov_sorov;
begin
  perform public._t2_lab_azo(p_actor_id, p_kompaniya_id, 'natija');
  select * into s from public.t2_lab_sinov_sorov where murojaat_id = p_murojaat_id and lab_kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'So‘rov topilmadi'); end if;
  select * into m from public.t2_tomon_murojaat where id = s.murojaat_id for update;
  if not exists (select 1 from public.t2_tomon_aloqa where id = m.aloqa_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'ALOQA_FAOL_EMAS', 'error', 'Aloqa faol emas'); end if;
  if m.holat not in ('ochiq','bajarildi') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'So‘rov yopilgan yoki bekor qilingan'); end if;
  if p_kutilgan_versiya is distinct from s.versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA', 'sabab', 'versiya', 'bordagi_versiya', s.versiya, 'error', 'So‘rov boshqa joyda o‘zgargan - qayta yuklang'); end if;
  if v_natija not in ('mos','mos_emas') then return jsonb_build_object('ok', false, 'code', 'NATIJA', 'error', 'Natija: mos yoki mos emas'); end if;
  if v_raqam is null then return jsonb_build_object('ok', false, 'code', 'RAQAM_KERAK', 'error', 'Protokol raqamini kiriting'); end if;
  if v_natija = 'mos_emas' and (v_xul is null or length(v_xul) < 3) then return jsonb_build_object('ok', false, 'code', 'XULOSA_KERAK', 'error', '«Mos emas» uchun xulosa yozing'); end if;
  begin
    v_sana := nullif(mm->>'protokol_sana', '')::date; v_inv := nullif(mm->>'invoys_sana', '')::date; v_muddat := nullif(mm->>'bartaraf_muddati', '')::date;
    v_summa := nullif(replace(coalesce(mm->>'summa', ''), ',', '.'), '')::numeric;
  exception when others then return jsonb_build_object('ok', false, 'code', 'FORMAT', 'error', 'Sana yoki summa formati noto‘g‘ri'); end;
  v_err := public._t2_lab_maydon_tekshir(s.sinov_turi, v_maydon);
  if v_err is not null then return jsonb_build_object('ok', false, 'code', 'MAYDON', 'error', v_err); end if;
  if length(v_maydon::text) > 8192 then return jsonb_build_object('ok', false, 'code', 'MAYDON', 'error', 'Maydonlar juda katta'); end if;
  v_son := public._t2_tomon_dalil_biriktir(m, p_kompaniya_id, p_actor_id, p_document_ids);
  v_fayl := coalesce(p_document_ids[1], s.fayl_document_id);
  if v_fayl is null then return jsonb_build_object('ok', false, 'code', 'FAYL_KERAK', 'error', 'Protokol faylini (PDF/skan) biriktiring'); end if;
  select * into tt from public.t2_lab_sinov_turi where kalit = s.sinov_turi;
  select * into v_lab from public.t2_kompaniya where id = p_kompaniya_id;

  -- Pudratchi kompaniyasidagi laboratoriya kontragenti (aloqadagi kompaniya bo'yicha; yo'q bo'lsa yaratiladi)
  select id into v_kontr from public.t2_kontragent where kompaniya_id = s.kompaniya_id and mavqe = 'laboratoriya' and holat = 'faol'
     and (tomon_kompaniya_id = p_kompaniya_id or (v_lab.inn is not null and inn = v_lab.inn)) order by (tomon_kompaniya_id = p_kompaniya_id) desc nulls last, id limit 1;
  if v_kontr is null then
    insert into public.t2_kontragent (kompaniya_id, nom, inn, mavqe, tomon_kompaniya_id) values (s.kompaniya_id, v_lab.nom, v_lab.inn, 'laboratoriya', p_kompaniya_id) returning id into v_kontr;
  end if;

  -- Ko'zgu protokol (pudratchi tenanti): АОСР va reestr shundan o'qiydi
  begin
    if s.mirror_protokol_id is null then
      insert into public.t2_lab_protokol (kompaniya_id, obyekt_id, laboratoriya_id, raqam, sana, sinov_turi, konstruksiya, marka, natija, invoys_raqam, invoys_sana, summa, fayl_document_id, izoh, kim)
      values (s.kompaniya_id, s.obyekt_id, v_kontr, v_raqam, v_sana, tt.mirror_turi, s.konstruksiya, left(coalesce(v_maydon->>'marka_sinf', ''), 100), v_natija,
              nullif(mm->>'invoys_raqam', ''), v_inv, v_summa, v_fayl::text, left('Sinov so‘rovi #' || s.murojaat_id || ': ' || tt.nom || coalesce('. ' || v_xul, ''), 1000), 'laboratoriya:' || p_actor_id)
      returning id into v_prot;
    else
      v_prot := s.mirror_protokol_id;
      update public.t2_lab_protokol set laboratoriya_id = v_kontr, raqam = v_raqam, sana = v_sana, natija = v_natija, marka = left(coalesce(v_maydon->>'marka_sinf', ''), 100),
        invoys_raqam = nullif(mm->>'invoys_raqam', ''), invoys_sana = v_inv, summa = v_summa, fayl_document_id = v_fayl::text,
        izoh = left('Sinov so‘rovi #' || s.murojaat_id || ': ' || tt.nom || coalesce('. ' || v_xul, ''), 1000), versiya = versiya + 1, yangilandi = now()
       where id = v_prot;
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'RAQAM_BAND', 'error', 'Bu raqamli protokol shu obyektda allaqachon bor');
  end;
  delete from public.t2_lab_protokol_bog where protokol_id = v_prot;
  if s.aosr_id is not null then insert into public.t2_lab_protokol_bog (kompaniya_id, protokol_id, aosr_id) values (s.kompaniya_id, v_prot, s.aosr_id); end if;
  if s.qator_id is not null then insert into public.t2_lab_protokol_bog (kompaniya_id, protokol_id, qator_id) values (s.kompaniya_id, v_prot, s.qator_id); end if;

  -- Predpisaniya (mos emas) / avtomat yopish (mos)
  v_pred := s.predpisaniya_id;
  if v_natija = 'mos_emas' then
    if v_pred is null then
      insert into public.t2_tomon_murojaat (aloqa_id, turi, beruvchi_kompaniya_id, ijrochi_kompaniya_id, obyekt_id, joy, sarlavha, matn, muhimlik, muddat, beruvchi_actor_id)
      values (m.aloqa_id, 'predpisaniya', p_kompaniya_id, s.kompaniya_id, s.obyekt_id, m.joy, left('Sinov natijasi mos emas: ' || tt.nom || ' № ' || v_raqam, 200),
              left(v_xul || E'\nSinov so‘rovi #' || s.murojaat_id || '. Qayta sinov so‘rang.', 4000), 'yuqori', v_muddat, p_actor_id)
      returning id into v_pred;
      insert into public.t2_tomon_hodisa (aloqa_id, murojaat_id, kompaniya_id, actor_id, tur, matn, meta)
      values (m.aloqa_id, v_pred, p_kompaniya_id, p_actor_id, 'murojaat', 'Sinov mos emas: ' || tt.nom, jsonb_build_object('turi', 'predpisaniya', 'sorov_id', s.murojaat_id));
    else
      update public.t2_tomon_murojaat set muddat = coalesce(v_muddat, muddat), matn = left(v_xul || E'\nSinov so‘rovi #' || s.murojaat_id || '. Qayta sinov so‘rang.', 4000), yangilandi = now()
       where id = v_pred and holat = 'ochiq';
    end if;
  elsif v_pred is not null then
    update public.t2_tomon_murojaat set holat = 'bekor', yopildi_actor_id = p_actor_id, yopildi_vaqti = now(), yopish_izoh = 'Natija tuzatildi: mos', versiya = versiya + 1, yangilandi = now()
     where id = v_pred and holat in ('ochiq','bajarildi');
    insert into public.t2_tomon_hodisa (aloqa_id, murojaat_id, kompaniya_id, actor_id, tur, matn) values (m.aloqa_id, v_pred, p_kompaniya_id, p_actor_id, 'murojaat_bekor', 'Natija tuzatildi: mos');
  end if;
  if v_natija = 'mos' and s.asl_sorov_id is not null then
    select * into v_asl from public.t2_lab_sinov_sorov where murojaat_id = s.asl_sorov_id;
    if found and v_asl.predpisaniya_id is not null then
      update public.t2_tomon_murojaat set holat = 'yopildi', yopildi_actor_id = p_actor_id, yopildi_vaqti = now(), yopish_izoh = 'Qayta sinov mos (so‘rov #' || s.murojaat_id || ')', versiya = versiya + 1, yangilandi = now()
       where id = v_asl.predpisaniya_id and holat in ('ochiq','bajarildi');
      if found then
        insert into public.t2_tomon_hodisa (aloqa_id, murojaat_id, kompaniya_id, actor_id, tur, matn) values (m.aloqa_id, v_asl.predpisaniya_id, p_kompaniya_id, p_actor_id, 'murojaat_yopildi', 'Qayta sinov mos');
      end if;
    end if;
  end if;

  -- Laboratoriya hisobi -> pudratchi qarzdorligi (faqat shartnoma aniq bitta bo'lsa)
  if v_summa is not null then
    select count(*), min(sh.id) into v_sh_son, v_sh from public.t2_shartnoma sh
     where sh.kompaniya_id = s.kompaniya_id and sh.asosiy = false and sh.holat = 'faol'
       and exists (select 1 from public.t2_shartnoma_tomon st where st.shartnoma_id = sh.id and (st.tomon_kompaniya_id = p_kompaniya_id or st.kontragent_id = v_kontr));
    if v_sh_son = 1 then
      if s.qarz_asos_id is null then
        insert into public.t2_qarz_asos (kompaniya_id, shartnoma_id, tur, hujjat_raqam, sana, nomi, summa, izoh, kim)
        values (s.kompaniya_id, v_sh, 'bajarilgan_ish', coalesce(nullif(mm->>'invoys_raqam', ''), v_raqam), coalesce(v_inv, v_sana), left('Laboratoriya sinovi: ' || tt.nom || ' № ' || v_raqam, 300), v_summa,
                'Sinov so‘rovi #' || s.murojaat_id || ' (summa QQS bilan)', 'laboratoriya:' || p_actor_id) returning id into v_qarz;
      else
        v_qarz := s.qarz_asos_id;
        update public.t2_qarz_asos set summa = v_summa, hujjat_raqam = coalesce(nullif(mm->>'invoys_raqam', ''), v_raqam), sana = coalesce(v_inv, v_sana), versiya = versiya + 1, yangilandi = now() where id = v_qarz;
      end if;
      v_qarz_holat := 'yozildi';
    else
      v_qarz := s.qarz_asos_id;
      v_qarz_holat := case when v_sh_son = 0 then 'shartnoma_yoq' else 'shartnoma_noaniq' end;
    end if;
  else v_qarz := s.qarz_asos_id; end if;

  update public.t2_lab_sinov_sorov set natija = v_natija, protokol_raqam = v_raqam, protokol_sana = v_sana, maydon = v_maydon, xulosa = v_xul, summa = v_summa,
    invoys_raqam = nullif(mm->>'invoys_raqam', ''), invoys_sana = v_inv, fayl_document_id = v_fayl, mirror_protokol_id = v_prot, predpisaniya_id = v_pred, qarz_asos_id = v_qarz,
    versiya = versiya + 1, yangilandi = now()
   where murojaat_id = s.murojaat_id;
  v_javob := 'Protokol № ' || v_raqam || ': ' || case when v_natija = 'mos' then 'mos' else 'MOS EMAS' end || coalesce('. ' || v_xul, '');
  update public.t2_tomon_murojaat set holat = 'bajarildi', javob_actor_id = p_actor_id, javob_vaqti = now(), javob_matn = left(v_javob, 4000), versiya = versiya + 1, yangilandi = now() where id = m.id;
  insert into public.t2_tomon_hodisa (aloqa_id, murojaat_id, kompaniya_id, actor_id, tur, matn, meta)
  values (m.aloqa_id, m.id, p_kompaniya_id, p_actor_id, 'murojaat_javob', left(v_javob, 4000), jsonb_build_object('natija', v_natija, 'dalil_soni', v_son));
  return jsonb_build_object('ok', true, 'id', m.id, 'natija', v_natija, 'predpisaniya_id', v_pred, 'qarz', v_qarz_holat, 'versiya', s.versiya + 1);
end $$;

-- 10. Pudratchi uchun: АОСР sinov holati (bitta chaqiruv - obyektdagi hamma АОСР)
create or replace function public.t2_lab_sorov_aosr_holat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_lab_azo(p_actor_id, p_kompaniya_id, 'korish');
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Obyekt topilmadi');
  end if;
  return jsonb_build_object('ok', true, 'aktlar', coalesce((
    select jsonb_agg(jsonb_build_object('aosr_id', q.aosr_id, 'holat', q.h, 'bloklangan', jsonb_array_length(q.h->'nomos') > 0))
      from (select s.aosr_id, public._t2_lab_aosr_holat(s.aosr_id) h from public.t2_lab_sinov_sorov s
             where s.kompaniya_id = p_kompaniya_id and s.obyekt_id = p_obyekt_id and s.aosr_id is not null group by s.aosr_id) q), '[]'::jsonb));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    '_t2_lab_rol_ok(text,text)', '_t2_lab_azo(bigint,bigint,text)', '_t2_lab_maydon_tekshir(text,jsonb)', '_t2_lab_aosr_holat(bigint)', '_t2_lab_aosr_qorovul()',
    't2_lab_sinov_turlari_v1(bigint,bigint)',
    't2_lab_sorov_yarat_v1(bigint,bigint,bigint,text,bigint,bigint,bigint,text,text,integer,date,text,boolean,bigint,uuid)',
    't2_lab_sorov_royxat_v1(bigint,bigint,text,text,bigint,bigint,integer)', 't2_lab_sorov_tafsilot_v1(bigint,bigint,bigint)',
    't2_lab_sorov_natija_v1(bigint,bigint,bigint,integer,jsonb,bigint[])', 't2_lab_sorov_aosr_holat_v1(bigint,bigint,bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
