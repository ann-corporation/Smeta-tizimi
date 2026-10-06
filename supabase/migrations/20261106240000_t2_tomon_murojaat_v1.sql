-- TOMON MUROJAATI (remark / predpisaniya / ekspertiza izohi / mualliflik remarki / savol / sinov so'rovi …) — umumiy primitiv.
-- UNIVERSAL_PRODUCT_SKELETON §26: remark → obyekt/joy → mas'ul tomon → muddat → bajarildi (dalil bilan) → qayta ko'rik → YOPILDI;
-- asl remark o'chmaydi, qayta ochilsa raund oshadi. Bitta mexanizm hamma tomon uchun: zakazchik (remark), texnadzor/davlat nazorati
-- (predpisaniya), ekspertiza (izoh), loyihachi (mualliflik nazorati / savol), laboratoriya (sinov so'rovi → protokol), logistika.
-- Faqat FAOL aloqaning ikki tomoni; dalil — R2 hujjat reyestridan (nusxalanmaydi). Hodisalar o'zgarmas jurnalga yoziladi.

create table if not exists public.t2_tomon_murojaat_turi (
  kalit text primary key check (kalit ~ '^[a-z][a-z0-9_]{1,40}$'),
  nom text not null, nom_ru text, faol boolean not null default true, tartib integer not null default 100
);
alter table public.t2_tomon_murojaat_turi enable row level security;
revoke all on table public.t2_tomon_murojaat_turi from anon, authenticated;
insert into public.t2_tomon_murojaat_turi (kalit, nom, nom_ru, tartib) values
  ('remark', 'Remark (izoh/kamchilik)', 'Замечание', 10),
  ('predpisaniya', 'Predpisaniya (nazorat ko‘rsatmasi)', 'Предписание', 20),
  ('ekspertiza_izoh', 'Ekspertiza izohi', 'Замечание экспертизы', 30),
  ('mualliflik_remark', 'Mualliflik nazorati remarki', 'Замечание авторского надзора', 40),
  ('savol', 'Savol / aniqlashtirish (RFI)', 'Запрос на разъяснение (RFI)', 50),
  ('sinov_sorovi', 'Sinov so‘rovi (laboratoriya)', 'Запрос на испытание', 60),
  ('yetkazish_talabi', 'Yetkazib berish talabi', 'Требование по поставке', 70),
  ('boshqa', 'Boshqa', 'Другое', 100)
on conflict (kalit) do nothing;

create table if not exists public.t2_tomon_murojaat (
  id bigint generated always as identity primary key,
  aloqa_id bigint not null references public.t2_tomon_aloqa(id),
  turi text not null references public.t2_tomon_murojaat_turi(kalit),
  beruvchi_kompaniya_id bigint not null references public.t2_kompaniya(id),
  ijrochi_kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint references public.t2_obyekt(id),
  joy text check (joy is null or length(joy) <= 300),
  sarlavha text not null check (length(btrim(sarlavha)) between 3 and 200),
  matn text check (matn is null or length(matn) <= 4000),
  muhimlik text not null default 'oddiy' check (muhimlik in ('past','oddiy','yuqori','kritik')),
  muddat date,
  holat text not null default 'ochiq' check (holat in ('ochiq','bajarildi','yopildi','bekor')),
  raund integer not null default 1,
  beruvchi_actor_id bigint not null,
  javob_actor_id bigint, javob_vaqti timestamptz, javob_matn text check (javob_matn is null or length(javob_matn) <= 4000),
  yopildi_actor_id bigint, yopildi_vaqti timestamptz, yopish_izoh text check (yopish_izoh is null or length(yopish_izoh) <= 2000),
  operation_id uuid,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  check (beruvchi_kompaniya_id <> ijrochi_kompaniya_id)
);
create unique index if not exists t2_tomon_murojaat_operation_uq on public.t2_tomon_murojaat (beruvchi_kompaniya_id, operation_id) where operation_id is not null;
create index if not exists t2_tomon_murojaat_ijrochi_idx on public.t2_tomon_murojaat (ijrochi_kompaniya_id, holat, id desc);
create index if not exists t2_tomon_murojaat_beruvchi_idx on public.t2_tomon_murojaat (beruvchi_kompaniya_id, holat, id desc);
alter table public.t2_tomon_murojaat enable row level security;
revoke all on table public.t2_tomon_murojaat from anon, authenticated;

create table if not exists public.t2_tomon_murojaat_hujjat (
  id bigint generated always as identity primary key,
  murojaat_id bigint not null references public.t2_tomon_murojaat(id),
  document_id bigint not null references public.t2_document_registry(id),
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  raund integer not null,
  actor_id bigint not null,
  vaqt timestamptz not null default now(),
  unique (murojaat_id, document_id)
);
alter table public.t2_tomon_murojaat_hujjat enable row level security;
revoke all on table public.t2_tomon_murojaat_hujjat from anon, authenticated;

-- Jurnal: murojaat bog'lanishi va yangi hodisa turlari.
alter table public.t2_tomon_hodisa add column if not exists murojaat_id bigint references public.t2_tomon_murojaat(id);
create index if not exists t2_tomon_hodisa_murojaat_idx on public.t2_tomon_hodisa (murojaat_id, id);
alter table public.t2_tomon_hodisa drop constraint if exists t2_tomon_hodisa_tur_check;
alter table public.t2_tomon_hodisa add constraint t2_tomon_hodisa_tur_check check (tur in (
  'taklif','qabul','rad','bekor','toxtatish','davom','yopish','grant','grant_bekor','taqdim','korilmoqda','qaror','izoh','qaytarish','kod_xato','qidiruv',
  'murojaat','murojaat_javob','murojaat_dalil','murojaat_yopildi','murojaat_qayta','murojaat_bekor'));

-- Rol → amal: murojaat yozish/javob berish.
create or replace function public._t2_tomon_rol_ok(p_rol text, p_amal text) returns boolean
language sql immutable as $$
  select case p_amal
    when 'boshqarish' then p_rol in ('superadmin','admin','boss','rahbar','director')
    when 'taqdim'     then p_rol in ('superadmin','admin','boss','rahbar','director','pto')
    when 'qaror'      then p_rol in ('superadmin','admin','boss','rahbar','director','buyurtmachi')
    when 'murojaat'   then p_rol in ('superadmin','admin','boss','rahbar','director','pto','prorab','buyurtmachi')
    when 'izoh'       then p_rol not in ('kuzatuvchi')
    when 'korish'     then true
    else false end
$$;

-- Murojaat ikkala tomonidan ko'rinadigan (faol aloqa) yagona tekshiruv: (murojaat, men) → qarama-qarshi tomon.
create or replace function public._t2_tomon_murojaat_olish(p_id bigint, p_kompaniya_id bigint, p_faol_aloqa boolean)
returns public.t2_tomon_murojaat language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m public.t2_tomon_murojaat;
begin
  select * into m from public.t2_tomon_murojaat where id = p_id and (beruvchi_kompaniya_id = p_kompaniya_id or ijrochi_kompaniya_id = p_kompaniya_id);
  if not found then return null; end if;
  if p_faol_aloqa and not exists (select 1 from public.t2_tomon_aloqa a where a.id = m.aloqa_id and a.holat = 'faol') then return null; end if;
  return m;
end $$;

create or replace function public.t2_tomon_murojaat_yarat_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_turi text, p_sarlavha text, p_matn text,
  p_muhimlik text, p_muddat date, p_obyekt_id bigint, p_joy text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.t2_tomon_aloqa; v_ij bigint; v_old public.t2_tomon_murojaat; v_id bigint; v_ob public.t2_obyekt; v_muh text := coalesce(nullif(p_muhimlik, ''), 'oddiy');
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'murojaat');
  if p_operation_id is not null then
    select * into v_old from public.t2_tomon_murojaat where beruvchi_kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
    if found then return jsonb_build_object('ok', true, 'id', v_old.id, 'holat', v_old.holat, 'qayta', true); end if;
  end if;
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id;
  if not found or (a.taklif_kompaniya_id <> p_kompaniya_id and a.qabul_kompaniya_id is distinct from p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Aloqa topilmadi');
  end if;
  if a.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Murojaat faqat faol aloqada yoziladi'); end if;
  if not exists (select 1 from public.t2_tomon_murojaat_turi where kalit = p_turi and faol) then
    return jsonb_build_object('ok', false, 'code', 'TUR_YOQ', 'error', 'Murojaat turi noto‘g‘ri');
  end if;
  if length(btrim(coalesce(p_sarlavha, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'SARLAVHA_KERAK', 'error', 'Sarlavha kamida 3 belgi'); end if;
  if v_muh not in ('past','oddiy','yuqori','kritik') then return jsonb_build_object('ok', false, 'code', 'MUHIMLIK', 'error', 'Muhimlik noto‘g‘ri'); end if;
  v_ij := public._t2_tomon_qarshi(a, p_kompaniya_id);
  if p_obyekt_id is not null then
    select * into v_ob from public.t2_obyekt where id = p_obyekt_id and holat = 'faol';
    -- Obyekt ikki tomondan birining ob'ekti bo'lishi shart; qarshi tomon ob'ektiga murojaat — faqat o'sha tomon menga KO'RISH ruxsatini bergan bo'lsa.
    if not found or v_ob.kompaniya_id not in (p_kompaniya_id, v_ij) then
      return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA', 'error', 'Obyekt shu aloqa tomonlariga tegishli emas');
    end if;
    if v_ob.kompaniya_id = v_ij and not public.t2_tomon_ruxsat_bor(p_kompaniya_id, v_ij, 'obyekt_holat', 'korish', p_obyekt_id) then
      return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOPIQ', 'error', 'Bu obyekt sizga ochilmagan');
    end if;
  end if;
  insert into public.t2_tomon_murojaat (aloqa_id, turi, beruvchi_kompaniya_id, ijrochi_kompaniya_id, obyekt_id, joy, sarlavha, matn, muhimlik, muddat, beruvchi_actor_id, operation_id)
  values (a.id, p_turi, p_kompaniya_id, v_ij, p_obyekt_id, nullif(btrim(coalesce(p_joy, '')), ''), btrim(p_sarlavha), nullif(btrim(coalesce(p_matn, '')), ''), v_muh, p_muddat, p_actor_id, p_operation_id)
  returning id into v_id;
  insert into public.t2_tomon_hodisa (aloqa_id, murojaat_id, kompaniya_id, actor_id, tur, matn, meta)
  values (a.id, v_id, p_kompaniya_id, p_actor_id, 'murojaat', btrim(p_sarlavha), jsonb_build_object('turi', p_turi, 'muhimlik', v_muh, 'muddat', p_muddat));
  return jsonb_build_object('ok', true, 'id', v_id, 'holat', 'ochiq');
end $$;

create or replace function public._t2_tomon_dalil_biriktir(p_m public.t2_tomon_murojaat, p_kompaniya_id bigint, p_actor_id bigint, p_document_ids bigint[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_son integer := 0;
begin
  foreach v_id in array coalesce(p_document_ids, array[]::bigint[]) loop
    -- Hujjat FAQAT biriktiruvchining o'z kompaniyasiniki, to'liq saqlangan bo'lishi shart.
    if not exists (select 1 from public.t2_document_registry d where d.id = v_id and d.kompaniya_id = p_kompaniya_id and d.canonical_storage_status = 'stored') then
      raise exception 'DALIL_BEGONA: hujjat % sizning kompaniyangizniki emas yoki saqlanmagan', v_id using errcode = '42501';
    end if;
    insert into public.t2_tomon_murojaat_hujjat (murojaat_id, document_id, kompaniya_id, raund, actor_id) values (p_m.id, v_id, p_kompaniya_id, p_m.raund, p_actor_id) on conflict do nothing;
    if found then
      v_son := v_son + 1;
      insert into public.t2_tomon_hodisa (aloqa_id, murojaat_id, kompaniya_id, actor_id, tur, meta) values (p_m.aloqa_id, p_m.id, p_kompaniya_id, p_actor_id, 'murojaat_dalil', jsonb_build_object('document_id', v_id));
    end if;
  end loop;
  return v_son;
end $$;

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

create or replace function public.t2_tomon_murojaat_hujjat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint, p_document_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.t2_tomon_murojaat;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'murojaat');
  select * into m from public.t2_tomon_murojaat where id = p_id for update;
  if not found or public._t2_tomon_murojaat_olish(p_id, p_kompaniya_id, true) is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Murojaat topilmadi'); end if;
  if m.holat not in ('ochiq','bajarildi') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Murojaatga dalil biriktirib bo‘lmaydi'); end if;
  return jsonb_build_object('ok', true, 'biriktirildi', public._t2_tomon_dalil_biriktir(m, p_kompaniya_id, p_actor_id, array[p_document_id]));
end $$;

create or replace function public.t2_tomon_murojaat_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint, p_qaror text, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.t2_tomon_murojaat;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'murojaat');
  select * into m from public.t2_tomon_murojaat where id = p_id for update;
  if not found or m.beruvchi_kompaniya_id <> p_kompaniya_id or public._t2_tomon_murojaat_olish(p_id, p_kompaniya_id, true) is null then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Murojaat topilmadi');
  end if;
  if m.holat <> 'bajarildi' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Faqat bajarildi deb belgilangan murojaat yopiladi yoki qayta ochiladi'); end if;
  if p_qaror = 'yopish' then
    update public.t2_tomon_murojaat set holat = 'yopildi', yopildi_actor_id = p_actor_id, yopildi_vaqti = now(), yopish_izoh = nullif(btrim(coalesce(p_izoh, '')), ''), versiya = versiya + 1, yangilandi = now() where id = m.id;
    insert into public.t2_tomon_hodisa (aloqa_id, murojaat_id, kompaniya_id, actor_id, tur, matn) values (m.aloqa_id, m.id, p_kompaniya_id, p_actor_id, 'murojaat_yopildi', nullif(btrim(coalesce(p_izoh, '')), ''));
    return jsonb_build_object('ok', true, 'id', m.id, 'holat', 'yopildi');
  elsif p_qaror = 'qayta_ochish' then
    if length(btrim(coalesce(p_izoh, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK', 'error', 'Qayta ochish sababini yozing'); end if;
    update public.t2_tomon_murojaat set holat = 'ochiq', raund = raund + 1, versiya = versiya + 1, yangilandi = now() where id = m.id;
    insert into public.t2_tomon_hodisa (aloqa_id, murojaat_id, kompaniya_id, actor_id, tur, matn, meta) values (m.aloqa_id, m.id, p_kompaniya_id, p_actor_id, 'murojaat_qayta', btrim(p_izoh), jsonb_build_object('raund', m.raund + 1));
    return jsonb_build_object('ok', true, 'id', m.id, 'holat', 'ochiq', 'raund', m.raund + 1);
  end if;
  return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI', 'error', 'qaror: yopish | qayta_ochish');
end $$;

create or replace function public.t2_tomon_murojaat_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.t2_tomon_murojaat;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'murojaat');
  select * into m from public.t2_tomon_murojaat where id = p_id for update;
  if not found or m.beruvchi_kompaniya_id <> p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Murojaat topilmadi'); end if;
  if m.holat <> 'ochiq' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Faqat ochiq murojaatni bekor qilish mumkin'); end if;
  update public.t2_tomon_murojaat set holat = 'bekor', yopildi_actor_id = p_actor_id, yopildi_vaqti = now(), yopish_izoh = nullif(btrim(coalesce(p_sabab, '')), ''), versiya = versiya + 1, yangilandi = now() where id = m.id;
  insert into public.t2_tomon_hodisa (aloqa_id, murojaat_id, kompaniya_id, actor_id, tur, matn) values (m.aloqa_id, m.id, p_kompaniya_id, p_actor_id, 'murojaat_bekor', nullif(btrim(coalesce(p_sabab, '')), ''));
  return jsonb_build_object('ok', true, 'id', m.id, 'holat', 'bekor');
end $$;

create or replace function public.t2_tomon_murojaat_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text, p_holat text, p_aloqa_id bigint, p_limit integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 300);
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object('id', m.id, 'aloqa_id', m.aloqa_id, 'turi', m.turi, 'sarlavha', m.sarlavha, 'muhimlik', m.muhimlik, 'muddat', m.muddat, 'holat', m.holat, 'raund', m.raund,
      'menga', m.ijrochi_kompaniya_id = p_kompaniya_id,
      'qarshi_nom', (select k.nom from public.t2_kompaniya k where k.id = case when m.ijrochi_kompaniya_id = p_kompaniya_id then m.beruvchi_kompaniya_id else m.ijrochi_kompaniya_id end),
      'obyekt_nom', (select o.nom from public.t2_obyekt o where o.id = m.obyekt_id), 'yaratildi', m.yaratildi, 'yangilandi', m.yangilandi,
      'kechikkan', m.muddat is not null and m.muddat < current_date and m.holat in ('ochiq')) x
      from public.t2_tomon_murojaat m
     where ((p_yonalish = 'menga' and m.ijrochi_kompaniya_id = p_kompaniya_id) or (p_yonalish = 'mendan' and m.beruvchi_kompaniya_id = p_kompaniya_id)
         or (coalesce(p_yonalish, '') not in ('menga','mendan') and (m.ijrochi_kompaniya_id = p_kompaniya_id or m.beruvchi_kompaniya_id = p_kompaniya_id)))
       and (p_holat is null or p_holat = '' or m.holat = p_holat) and (p_aloqa_id is null or m.aloqa_id = p_aloqa_id)
     order by m.id desc limit v_lim
  ) s;
  return v;
end $$;

create or replace function public.t2_tomon_murojaat_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.t2_tomon_murojaat;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  m := public._t2_tomon_murojaat_olish(p_id, p_kompaniya_id, false);
  if m.id is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Murojaat topilmadi'); end if;
  return jsonb_build_object('ok', true,
    'murojaat', jsonb_build_object('id', m.id, 'aloqa_id', m.aloqa_id, 'turi', m.turi, 'sarlavha', m.sarlavha, 'matn', m.matn, 'joy', m.joy, 'muhimlik', m.muhimlik, 'muddat', m.muddat,
        'holat', m.holat, 'raund', m.raund, 'menga', m.ijrochi_kompaniya_id = p_kompaniya_id, 'men_beruvchiman', m.beruvchi_kompaniya_id = p_kompaniya_id,
        'beruvchi_nom', (select nom from public.t2_kompaniya where id = m.beruvchi_kompaniya_id), 'ijrochi_nom', (select nom from public.t2_kompaniya where id = m.ijrochi_kompaniya_id),
        'obyekt_nom', (select o.nom from public.t2_obyekt o where o.id = m.obyekt_id), 'yaratildi', m.yaratildi, 'javob_matn', m.javob_matn, 'javob_vaqti', m.javob_vaqti, 'yopish_izoh', m.yopish_izoh),
    'hujjatlar', coalesce((select jsonb_agg(jsonb_build_object('document_id', h.document_id, 'raund', h.raund, 'vaqt', h.vaqt, 'men_biriktirdim', h.kompaniya_id = p_kompaniya_id,
        'kompaniya_nom', (select nom from public.t2_kompaniya where id = h.kompaniya_id), 'fayl', d.original_filename, 'mime', d.mime_type, 'olcham', d.size_bytes) order by h.id)
        from public.t2_tomon_murojaat_hujjat h join public.t2_document_registry d on d.id = h.document_id where h.murojaat_id = m.id), '[]'::jsonb),
    'hodisalar', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tur', e.tur, 'matn', e.matn, 'vaqt', e.vaqt, 'meni', e.kompaniya_id = p_kompaniya_id,
        'kompaniya_nom', (select nom from public.t2_kompaniya where id = e.kompaniya_id)) order by e.id) from public.t2_tomon_hodisa e where e.murojaat_id = m.id), '[]'::jsonb));
end $$;

create or replace function public.t2_tomon_murojaat_turlari_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  return coalesce((select jsonb_agg(jsonb_build_object('kalit', t.kalit, 'nom', t.nom, 'nom_ru', t.nom_ru) order by t.tartib, t.kalit) from public.t2_tomon_murojaat_turi t where t.faol), '[]'::jsonb);
end $$;

-- Taqdim qabul qiluvchisi VA murojaat ikki tomoni: dalil fayllarini yuklab olish (faqat shu aniq hujjat, faol aloqa).
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
  return jsonb_build_object('ok', true, 'document_id', d.id, 'r2_key', d.r2_key, 'mime_type', d.mime_type, 'original_filename', d.original_filename, 'size_bytes', d.size_bytes, 'sha256', d.sha256);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    '_t2_tomon_murojaat_olish(bigint,bigint,boolean)', '_t2_tomon_dalil_biriktir(public.t2_tomon_murojaat,bigint,bigint,bigint[])',
    't2_tomon_murojaat_yarat_v1(bigint,bigint,bigint,text,text,text,text,date,bigint,text,uuid)', 't2_tomon_murojaat_javob_v1(bigint,bigint,bigint,text,bigint[])',
    't2_tomon_murojaat_hujjat_v1(bigint,bigint,bigint,bigint)', 't2_tomon_murojaat_qaror_v1(bigint,bigint,bigint,text,text)', 't2_tomon_murojaat_bekor_v1(bigint,bigint,bigint,text)',
    't2_tomon_murojaat_royxat_v1(bigint,bigint,text,text,bigint,integer)', 't2_tomon_murojaat_tafsilot_v1(bigint,bigint,bigint)', 't2_tomon_murojaat_turlari_v1(bigint,bigint)',
    't2_tomon_hujjat_ol_v1(bigint,bigint)', '_t2_tomon_rol_ok(text,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
