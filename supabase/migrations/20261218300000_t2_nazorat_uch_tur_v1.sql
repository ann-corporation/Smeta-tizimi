-- 20261218300000 - TEXNIK NAZORAT = FUNKSIYA (kompaniya turi emas): uch manba.
-- Egasi: texnadzor zakazchikdan ham, pudratchidan ham bo'lishi mumkin. Avval model faqat «pudratchi <-> alohida texnadzor kompaniyasi» (mustaqil) edi.
--  (A) buyurtmachining o'z xodimi: buyurtmachi kompaniyasi a'zosi (quality.decide). Hujjat buyurtmachiga kelganda texnik qaror (t2_nazorat_qaror_v1) -> buyurtmachi qabuli.
--  (B) buyurtmachi yollagan autsorsing texnadzor: aloqa buyurtmachi <-> texnadzor; buyurtmachi obyekt bo'yicha VAKOLAT beradi (t2_tomon_vakolat): doira =
--      pudratchi buyurtmachiga bergan grantlar KESISHMASI (jonli, chuqurlik 1: vakil qayta vakolat bera olmaydi), bekor qilinsa darhol yopiladi. Pudratchi
--      texnadzor bilan alohida aloqa tuzmaydi: hujjat buyurtmachiga ketadi, vakilga ham ko'rinadi. Qaror «kim nomidan» = buyurtmachi.
--  (C) pudratchining ichki nazorati: kompaniya sozlamasi (sukut O'CHIQ, bloklamaydi); yoqilgan bo'lsa ichki tasdiqsiz tashqariga yuborilmaydi; tashqi tomonga faqat
--      «ichki nazoratdan o'tgan: ha/yo'q, kim, qachon».
--  (D) mustaqil (eskicha, pudratchi <-> texnadzor kompaniyasi) — ishlashda davom etadi.
-- Mavjud mexanizmlar KENGAYADI (parallel yo'l yo'q): t2_tomon_ruxsat_bor (vakil shoxi), t2_tomon_qaror_v1, t2_tomon_taqdimlar_v1/tafsilot_v1 (vakilga ko'rinish),
-- t2_tomon_taqdim_yarat_v1 (ichki darvoza), outbox mavzu->ruxsat jadvali. Eski ma'lumot buzilmaydi: yangi ustunlar NULL, sozlama sukut: ichki o'chiq, texnik bosqich 'avto'
-- (faqat texnik nazorat TAYINLANGAN bo'lsa buyurtmachi qabuli oldidan texnik qaror shart). Talab: 20261217500000, 20261217700000.

-- ===== jadvallar =====
create table if not exists public.t2_nazorat_sozlama (
  kompaniya_id bigint primary key references public.t2_kompaniya(id),
  ichki_majburiy boolean not null default false,
  texnik_bosqich text not null default 'avto' check (texnik_bosqich in ('avto', 'ha', 'yoq')),
  yangilandi timestamptz not null default now(),
  actor_id bigint
);

create table if not exists public.t2_tomon_vakolat (
  id bigint generated always as identity primary key,
  beruvchi_kompaniya_id bigint not null references public.t2_kompaniya(id),   -- buyurtmachi
  vakil_kompaniya_id bigint not null references public.t2_kompaniya(id),      -- autsorsing texnadzor
  aloqa_id bigint not null references public.t2_tomon_aloqa(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  resurslar text[] not null check (cardinality(resurslar) between 1 and 12),
  amallar text[] not null check (cardinality(amallar) between 1 and 3 and amallar <@ array['korish', 'texnik_qaror', 'qaror']),
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  berdi_actor_id bigint not null,
  yaratildi timestamptz not null default now(),
  bekor_actor_id bigint,
  bekor_vaqti timestamptz,
  constraint t2_tomon_vakolat_farq check (beruvchi_kompaniya_id <> vakil_kompaniya_id)
);
create unique index if not exists ux_t2_tomon_vakolat_faol on public.t2_tomon_vakolat (aloqa_id, obyekt_id) where holat = 'faol';
create index if not exists ix_t2_tomon_vakolat_vakil on public.t2_tomon_vakolat (vakil_kompaniya_id, holat);

create table if not exists public.t2_nazorat_tayinlash (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),            -- buyurtmachi (A)
  obyekt_id bigint not null references public.t2_obyekt(id),
  foydalanuvchi_id bigint not null,
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  berdi_actor_id bigint not null,
  yaratildi timestamptz not null default now(),
  bekor_vaqti timestamptz
);
create unique index if not exists ux_t2_nazorat_tayinlash_faol on public.t2_nazorat_tayinlash (kompaniya_id, obyekt_id, foydalanuvchi_id) where holat = 'faol';

create table if not exists public.t2_nazorat_qaror (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),            -- qaror chiqargan kompaniya
  nomidan_kompaniya_id bigint not null references public.t2_kompaniya(id),    -- kim nomidan
  nazorat_turi text not null check (nazorat_turi in ('buyurtmachi_xodimi', 'vakil', 'ichki', 'mustaqil')),
  resurs text not null,
  manba_id bigint not null,
  taqdim_id bigint,
  qaror text not null check (qaror in ('qabul', 'tuzatish', 'rad')),
  izoh text,
  actor_id bigint not null,
  vaqt timestamptz not null default now()
);
create index if not exists ix_t2_nazorat_qaror_taqdim on public.t2_nazorat_qaror (taqdim_id) where taqdim_id is not null;
create index if not exists ix_t2_nazorat_qaror_ichki on public.t2_nazorat_qaror (kompaniya_id, resurs, manba_id) where nazorat_turi = 'ichki';

create table if not exists public.t2_nazorat_ichki_sorov (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  resurs text not null,
  manba_id bigint not null,
  izoh text,
  holat text not null default 'ochiq' check (holat in ('ochiq', 'yopilgan')),
  actor_id bigint not null,
  vaqt timestamptz not null default now()
);
create unique index if not exists ux_t2_nazorat_ichki_sorov_ochiq on public.t2_nazorat_ichki_sorov (kompaniya_id, resurs, manba_id) where holat = 'ochiq';

alter table public.t2_nazorat_sozlama enable row level security;
alter table public.t2_tomon_vakolat enable row level security;
alter table public.t2_nazorat_tayinlash enable row level security;
alter table public.t2_nazorat_qaror enable row level security;
alter table public.t2_nazorat_ichki_sorov enable row level security;
revoke all on table public.t2_nazorat_sozlama, public.t2_tomon_vakolat, public.t2_nazorat_tayinlash, public.t2_nazorat_qaror, public.t2_nazorat_ichki_sorov from public, anon, authenticated;
grant select on table public.t2_nazorat_sozlama, public.t2_tomon_vakolat, public.t2_nazorat_tayinlash, public.t2_nazorat_qaror, public.t2_nazorat_ichki_sorov to service_role;

-- taqdim: kim qaror chiqardi / kim nomidan / nazorat turi / ichki nazorat (tashqi tomonga: o'tdi ha/yo'q, kim, qachon)
alter table public.t2_tomon_taqdim add column if not exists qaror_kompaniya_id bigint;
alter table public.t2_tomon_taqdim add column if not exists nomidan_kompaniya_id bigint;
alter table public.t2_tomon_taqdim add column if not exists nazorat_turi text;
alter table public.t2_tomon_taqdim add column if not exists ichki_otdi boolean;
alter table public.t2_tomon_taqdim add column if not exists ichki_actor_id bigint;
alter table public.t2_tomon_taqdim add column if not exists ichki_vaqt timestamptz;
do $c$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.t2_tomon_taqdim'::regclass and conname = 't2_tomon_taqdim_nazorat_turi_ck') then
    alter table public.t2_tomon_taqdim add constraint t2_tomon_taqdim_nazorat_turi_ck check (nazorat_turi is null or nazorat_turi in ('buyurtmachi_xodimi', 'vakil', 'ichki', 'mustaqil'));
  end if;
end $c$;

-- ===== ruxsat: vakil shoxi (mavjud t2_tomon_ruxsat_bor kengaytiriladi; asl tanasi _t2_tomon_ruxsat_togri) =====
create or replace function public._t2_tomon_ruxsat_togri(p_oluvchi bigint, p_beruvchi bigint, p_resurs text, p_amal text, p_obyekt_id bigint)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select coalesce((
    select true
      from public.t2_tomon_grant g
      join public.t2_tomon_aloqa a on a.id = g.aloqa_id and a.holat = 'faol'
      join public.t2_tomon_resurs r on r.kalit = g.resurs and r.faol
      join public.t2_obyekt o on o.id = p_obyekt_id and o.kompaniya_id = g.beruvchi_kompaniya_id and o.holat = 'faol'
     where g.holat = 'faol'
       and g.oluvchi_kompaniya_id = p_oluvchi and g.beruvchi_kompaniya_id = p_beruvchi
       and g.resurs = p_resurs and p_amal = any (g.amallar) and p_amal = any (r.amallar)
       and ((a.taklif_kompaniya_id = p_oluvchi and a.qabul_kompaniya_id = p_beruvchi) or (a.qabul_kompaniya_id = p_oluvchi and a.taklif_kompaniya_id = p_beruvchi))
       and (g.obyekt_id = o.id
            or (g.loyiha_id is not null and o.loyiha_id = g.loyiha_id)
            or (g.shartnoma_id is not null and exists (select 1 from public.t2_shartnoma_bog b where b.obyekt_id = o.id and b.shartnoma_id = g.shartnoma_id and b.holat = 'faol')))
     limit 1
  ), false)
$f$;

create or replace function public.t2_tomon_ruxsat_bor(p_oluvchi bigint, p_beruvchi bigint, p_resurs text, p_amal text, p_obyekt_id bigint)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select public._t2_tomon_ruxsat_togri(p_oluvchi, p_beruvchi, p_resurs, p_amal, p_obyekt_id)
      or exists (   -- (B) vakil: buyurtmachi vakolati VA pudratchi buyurtmachiga bergan grant kesishmasi, jonli; chuqurlik 1 (ichkarida faqat togri)
           select 1 from public.t2_tomon_vakolat v
             join public.t2_tomon_aloqa a on a.id = v.aloqa_id and a.holat = 'faol'
            where v.holat = 'faol' and v.vakil_kompaniya_id = p_oluvchi and v.obyekt_id = p_obyekt_id and p_resurs = any (v.resurslar)
              and case when p_amal in ('korish', 'tafsilot', 'izoh') then v.amallar && array['korish', 'texnik_qaror', 'qaror']
                       when p_amal = 'qaror' then v.amallar && array['texnik_qaror', 'qaror'] else false end
              and public._t2_tomon_ruxsat_togri(v.beruvchi_kompaniya_id, p_beruvchi, p_resurs, case when p_amal = 'qaror' then 'korish' else p_amal end, p_obyekt_id))
$f$;

create or replace function public._t2_nazorat_vakil_korish(p_vakil bigint, p_qabul_komp bigint, p_obyekt bigint, p_resurs text)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select exists (select 1 from public.t2_tomon_vakolat v join public.t2_tomon_aloqa a on a.id = v.aloqa_id and a.holat = 'faol'
                  where v.holat = 'faol' and v.vakil_kompaniya_id = p_vakil and v.beruvchi_kompaniya_id = p_qabul_komp and v.obyekt_id = p_obyekt and p_resurs = any (v.resurslar))
$f$;

create or replace function public._t2_nazorat_texnik_kerak(p_komp bigint, p_obyekt bigint)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select case coalesce((select s.texnik_bosqich from public.t2_nazorat_sozlama s where s.kompaniya_id = p_komp), 'avto')
           when 'yoq' then false when 'ha' then true
           else exists (select 1 from public.t2_nazorat_tayinlash t where t.kompaniya_id = p_komp and t.obyekt_id = p_obyekt and t.holat = 'faol')
                or exists (select 1 from public.t2_tomon_vakolat v join public.t2_tomon_aloqa a on a.id = v.aloqa_id and a.holat = 'faol'
                            where v.beruvchi_kompaniya_id = p_komp and v.obyekt_id = p_obyekt and v.holat = 'faol' and 'texnik_qaror' = any (v.amallar) and not ('qaror' = any (v.amallar))) end
$f$;

-- ===== sozlama =====
create or replace function public.t2_nazorat_sozlama_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_ichki_majburiy boolean, p_texnik_bosqich text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_texnik_bosqich is not null and p_texnik_bosqich not in ('avto', 'ha', 'yoq') then return jsonb_build_object('ok', false, 'code', 'TEXNIK_BOSQICH_NOTOGRI'); end if;
  insert into public.t2_nazorat_sozlama (kompaniya_id, ichki_majburiy, texnik_bosqich, actor_id)
  values (p_kompaniya_id, coalesce(p_ichki_majburiy, false), coalesce(p_texnik_bosqich, 'avto'), p_actor_id)
  on conflict (kompaniya_id) do update set ichki_majburiy = coalesce(p_ichki_majburiy, t2_nazorat_sozlama.ichki_majburiy),
    texnik_bosqich = coalesce(p_texnik_bosqich, t2_nazorat_sozlama.texnik_bosqich), yangilandi = now(), actor_id = p_actor_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'nazorat_sozlama', 'nazorat', null, format('ichki=%s texnik=%s', p_ichki_majburiy, p_texnik_bosqich), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $fn$;

create or replace function public.t2_nazorat_sozlama_ol_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $fn$
declare s public.t2_nazorat_sozlama;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into s from public.t2_nazorat_sozlama where kompaniya_id = p_kompaniya_id;
  return jsonb_build_object('ok', true, 'ichki_majburiy', coalesce(s.ichki_majburiy, false), 'texnik_bosqich', coalesce(s.texnik_bosqich, 'avto'));
end $fn$;

-- ===== tayinlash (A) va vakolat (B) =====
create or replace function public.t2_nazorat_tayinlash_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_foydalanuvchi_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare v_ega bigint; v_id bigint;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select kompaniya_id into v_ega from public.t2_obyekt where id = p_obyekt_id;
  if v_ega is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ'); end if;
  if v_ega <> p_kompaniya_id and not public._t2_tomon_ruxsat_togri(p_kompaniya_id, v_ega, 'obyekt_holat', 'korish', p_obyekt_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_OCHILMAGAN', 'error', 'Obyekt sizga ochilmagan');
  end if;
  if not exists (select 1 from public.t2_azolik a where a.kompaniya_id = p_kompaniya_id and a.foydalanuvchi_id = p_foydalanuvchi_id and a.holat = 'faol')
     or not public.t2_permission_allowed_v2(p_kompaniya_id, p_foydalanuvchi_id, 'quality.decide') then
    return jsonb_build_object('ok', false, 'code', 'NAZORATCHI_EMAS', 'error', 'Faqat kompaniya a''zosi va sifat qarori (quality.decide) ruxsati bor xodim tayinlanadi');
  end if;
  insert into public.t2_nazorat_tayinlash (kompaniya_id, obyekt_id, foydalanuvchi_id, berdi_actor_id) values (p_kompaniya_id, p_obyekt_id, p_foydalanuvchi_id, p_actor_id)
  on conflict (kompaniya_id, obyekt_id, foydalanuvchi_id) where holat = 'faol' do nothing returning id into v_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'nazorat_tayinlash', 'nazorat', p_obyekt_id, format('xodim=%s', p_foydalanuvchi_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', v_id, 'takror', v_id is null);
end $fn$;

create or replace function public.t2_nazorat_tayinlash_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  update public.t2_nazorat_tayinlash set holat = 'bekor', bekor_vaqti = now() where id = p_id and kompaniya_id = p_kompaniya_id and holat = 'faol';
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  return jsonb_build_object('ok', true);
end $fn$;

create or replace function public.t2_tomon_vakolat_ber_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_obyekt_id bigint, p_resurslar text[], p_amallar text[], p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare a public.t2_tomon_aloqa; v_vakil bigint; v_rol text; v_ega bigint; v_r text; v_id bigint;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id;
  if not found or (a.taklif_kompaniya_id <> p_kompaniya_id and a.qabul_kompaniya_id is distinct from p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Aloqa topilmadi'); end if;
  if a.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Aloqa faol emas'); end if;
  v_vakil := public._t2_tomon_qarshi(a, p_kompaniya_id);
  v_rol := case when a.taklif_kompaniya_id = v_vakil then a.taklif_rol else a.qabul_rol end;
  if v_vakil is null or v_rol not in ('texnadzor', 'inspeksiya') then return jsonb_build_object('ok', false, 'code', 'ROL_NOTOGRI', 'error', 'Vakolat faqat texnadzor/inspeksiya rolidagi tomonga beriladi'); end if;
  if p_resurslar is null or cardinality(p_resurslar) = 0 or p_amallar is null or cardinality(p_amallar) = 0 or not (p_amallar <@ array['korish', 'texnik_qaror', 'qaror']) then
    return jsonb_build_object('ok', false, 'code', 'DOIRA_NOTOGRI');
  end if;
  select kompaniya_id into v_ega from public.t2_obyekt where id = p_obyekt_id;
  if v_ega is null or v_ega = p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOTOGRI'); end if;
  -- doira KESISHMASI: buyurtmachi har resursni shu obyekt bo'yicha pudratchidan olgan bo'lishi shart
  foreach v_r in array p_resurslar loop
    if not exists (select 1 from public.t2_tomon_resurs r where r.kalit = v_r and r.faol) then return jsonb_build_object('ok', false, 'code', 'RESURS_YOQ', 'resurs', v_r); end if;
    if not public._t2_tomon_ruxsat_togri(p_kompaniya_id, v_ega, v_r, 'korish', p_obyekt_id) then
      return jsonb_build_object('ok', false, 'code', 'DOIRA_KENG', 'resurs', v_r, 'error', 'Vakolat buyurtmachiga berilgan grant doirasidan keng bo''lolmaydi');
    end if;
  end loop;
  insert into public.t2_tomon_vakolat (beruvchi_kompaniya_id, vakil_kompaniya_id, aloqa_id, obyekt_id, resurslar, amallar, berdi_actor_id)
  values (p_kompaniya_id, v_vakil, p_aloqa_id, p_obyekt_id, p_resurslar, p_amallar, p_actor_id)
  on conflict (aloqa_id, obyekt_id) where holat = 'faol' do update set resurslar = excluded.resurslar, amallar = excluded.amallar, berdi_actor_id = p_actor_id
  returning id into v_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'vakolat_ber', 'nazorat', p_obyekt_id, format('vakil=%s resurs=%s amal=%s', v_vakil, p_resurslar, p_amallar), 'actor:' || p_actor_id, null);
  perform public.t2_outbox_yoz(p_kompaniya_id, 'nazorat.vakolat', 't2_tomon_vakolat', v_id, jsonb_build_object('obyekt_id', p_obyekt_id, 'vakolat_id', v_id), p_actor_id, null, p_obyekt_id, p_aloqa_id, array[v_vakil, v_ega], '{}'::bigint[]);
  return jsonb_build_object('ok', true, 'id', v_id, 'vakil_kompaniya_id', v_vakil);
end $fn$;

create or replace function public.t2_tomon_vakolat_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare v public.t2_tomon_vakolat; v_ega bigint;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  update public.t2_tomon_vakolat set holat = 'bekor', bekor_actor_id = p_actor_id, bekor_vaqti = now()
   where id = p_id and beruvchi_kompaniya_id = p_kompaniya_id and holat = 'faol' returning * into v;
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  select kompaniya_id into v_ega from public.t2_obyekt where id = v.obyekt_id;
  perform public.t2_outbox_yoz(p_kompaniya_id, 'nazorat.vakolat', 't2_tomon_vakolat', v.id, jsonb_build_object('obyekt_id', v.obyekt_id, 'vakolat_id', v.id, 'bekor', true), p_actor_id, null, v.obyekt_id, v.aloqa_id, array[v.vakil_kompaniya_id, v_ega], '{}'::bigint[]);
  return jsonb_build_object('ok', true);
end $fn$;

-- kabinetlar: buyurtmachi (berganlari + xodimlari), vakil (olganlari = «kim nomidan»), pudratchi/egasi (kim tekshiryapti) + bog'lanish turi (karta ma'lumoti)
create or replace function public.t2_nazorat_tayinlar_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $fn$
declare v jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select jsonb_build_object('ok', true,
    'bergan', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'vakil_kompaniya_id', x.vakil_kompaniya_id, 'vakil_nom', k.nom, 'obyekt_id', x.obyekt_id, 'obyekt_nom', o.nom,
                          'resurslar', x.resurslar, 'amallar', x.amallar, 'aloqa_id', x.aloqa_id, 'boglanish_turi', 'vakil') order by x.id desc)
                         from public.t2_tomon_vakolat x join public.t2_kompaniya k on k.id = x.vakil_kompaniya_id join public.t2_obyekt o on o.id = x.obyekt_id
                        where x.beruvchi_kompaniya_id = p_kompaniya_id and x.holat = 'faol'), '[]'::jsonb),
    'olgan', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nomidan_kompaniya_id', x.beruvchi_kompaniya_id, 'nomidan_nom', k.nom, 'obyekt_id', x.obyekt_id, 'obyekt_nom', o.nom,
                          'resurslar', x.resurslar, 'amallar', x.amallar, 'boglanish_turi', 'vakil') order by x.id desc)
                         from public.t2_tomon_vakolat x join public.t2_kompaniya k on k.id = x.beruvchi_kompaniya_id join public.t2_obyekt o on o.id = x.obyekt_id
                        where x.vakil_kompaniya_id = p_kompaniya_id and x.holat = 'faol'), '[]'::jsonb),
    'xodimlar', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'obyekt_id', t.obyekt_id, 'obyekt_nom', o.nom, 'foydalanuvchi_id', t.foydalanuvchi_id, 'ism', f.ism, 'boglanish_turi', 'xodim') order by t.id desc)
                         from public.t2_nazorat_tayinlash t join public.t2_obyekt o on o.id = t.obyekt_id join public.t2_foydalanuvchi f on f.id = t.foydalanuvchi_id
                        where t.kompaniya_id = p_kompaniya_id and t.holat = 'faol'), '[]'::jsonb),
    'kim_tekshiradi', coalesce((select jsonb_agg(jsonb_build_object('obyekt_id', x.obyekt_id, 'obyekt_nom', o.nom, 'nomidan_nom', kb.nom, 'vakil_nom', kv.nom, 'amallar', x.amallar, 'boglanish_turi', 'vakil') order by x.id desc)
                         from public.t2_tomon_vakolat x join public.t2_obyekt o on o.id = x.obyekt_id and o.kompaniya_id = p_kompaniya_id
                         join public.t2_kompaniya kb on kb.id = x.beruvchi_kompaniya_id join public.t2_kompaniya kv on kv.id = x.vakil_kompaniya_id where x.holat = 'faol'), '[]'::jsonb))
    into v;
  return v;
end $fn$;

-- ===== texnik qaror (A: buyurtmachi xodimi; B: vakil 'texnik_qaror') =====
create or replace function public.t2_nazorat_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint, p_qaror text, p_izoh text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare q public.t2_tomon_taqdim; v_tur text; v_nomidan bigint; v_id bigint; v_nom text;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if p_qaror is null or p_qaror not in ('qabul', 'tuzatish', 'rad') then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI'); end if;
  if p_qaror <> 'qabul' and length(btrim(coalesce(p_izoh, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK'); end if;
  if q.holat not in ('yuborilgan', 'ko_rilmoqda') then return jsonb_build_object('ok', false, 'code', 'HOLAT'); end if;
  if q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id then
    if not public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'quality.decide') then
      raise exception 'NAZORAT_RUXSAT_YOQ: texnik qaror uchun quality.decide kerak' using errcode = '42501';
    end if;
    v_tur := 'buyurtmachi_xodimi'; v_nomidan := p_kompaniya_id;
  elsif exists (select 1 from public.t2_tomon_vakolat v join public.t2_tomon_aloqa a on a.id = v.aloqa_id and a.holat = 'faol'
                 where v.holat = 'faol' and v.vakil_kompaniya_id = p_kompaniya_id and v.beruvchi_kompaniya_id = q.qabul_qiluvchi_kompaniya_id and v.obyekt_id = q.obyekt_id
                   and q.resurs = any (v.resurslar) and v.amallar && array['texnik_qaror', 'qaror'])
        and public._t2_tomon_ruxsat_togri(q.qabul_qiluvchi_kompaniya_id, q.taqdim_etuvchi_kompaniya_id, q.resurs, 'korish', q.obyekt_id) then
    v_tur := 'vakil'; v_nomidan := q.qabul_qiluvchi_kompaniya_id;
  else
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI');
  end if;
  insert into public.t2_nazorat_qaror (kompaniya_id, nomidan_kompaniya_id, nazorat_turi, resurs, manba_id, taqdim_id, qaror, izoh, actor_id)
  values (p_kompaniya_id, v_nomidan, v_tur, q.resurs, q.manba_id, q.id, p_qaror, nullif(btrim(coalesce(p_izoh, '')), ''), p_actor_id) returning id into v_id;
  select nom into v_nom from public.t2_kompaniya where id = v_nomidan;
  perform public._t2_tomon_hodisa_yoz(q.aloqa_id, q.id, v_nomidan, p_actor_id, 'izoh', 'Texnik nazorat, ' || coalesce(v_nom, '?') || ': ' || p_qaror || coalesce(' - ' || nullif(btrim(coalesce(p_izoh, '')), ''), ''),
    jsonb_build_object('nazorat', 'texnik', 'qaror', p_qaror, 'nazorat_turi', v_tur));
  return jsonb_build_object('ok', true, 'id', v_id, 'nazorat_turi', v_tur, 'nomidan_kompaniya_id', v_nomidan);
end $fn$;

-- ===== ichki nazorat (C) =====
create or replace function public.t2_nazorat_ichki_sorov_v1(p_actor_id bigint, p_kompaniya_id bigint, p_resurs text, p_manba_id bigint, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare v_id bigint; v_users bigint[];
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'taqdim');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  insert into public.t2_nazorat_ichki_sorov (kompaniya_id, resurs, manba_id, izoh, actor_id) values (p_kompaniya_id, p_resurs, p_manba_id, left(p_izoh, 500), p_actor_id)
  on conflict (kompaniya_id, resurs, manba_id) where holat = 'ochiq' do nothing returning id into v_id;
  select coalesce(array_agg(a.foydalanuvchi_id), '{}') into v_users from public.t2_azolik a
   where a.kompaniya_id = p_kompaniya_id and a.holat = 'faol' and 'quality.decide' = any (public.t2_azolik_permissions_v2(a.id)) and a.foydalanuvchi_id <> p_actor_id;
  if v_id is not null and cardinality(v_users) > 0 then
    perform public.t2_outbox_yoz(p_kompaniya_id, 'nazorat.ichki_sorov', 't2_nazorat_ichki_sorov', v_id, jsonb_build_object('resurs', p_resurs, 'manba_id', p_manba_id), p_actor_id, null, null, null, '{}'::bigint[], v_users);
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'takror', v_id is null);
end $fn$;

create or replace function public.t2_nazorat_ichki_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_resurs text, p_manba_id bigint, p_qaror text, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare v_id bigint; v_sorovchi bigint;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  if not public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'quality.decide') then
    raise exception 'NAZORAT_RUXSAT_YOQ: ichki nazorat uchun quality.decide kerak' using errcode = '42501';
  end if;
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_qaror is null or p_qaror not in ('qabul', 'tuzatish', 'rad') then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI'); end if;
  if p_qaror <> 'qabul' and length(btrim(coalesce(p_izoh, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK'); end if;
  if p_resurs = 'f2' and not exists (select 1 from public.t2_akt where id = p_manba_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'HUJJAT_YOQ'); end if;
  if p_resurs = 'aosr' and not exists (select 1 from public.t2_aosr where id = p_manba_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'HUJJAT_YOQ'); end if;
  insert into public.t2_nazorat_qaror (kompaniya_id, nomidan_kompaniya_id, nazorat_turi, resurs, manba_id, qaror, izoh, actor_id)
  values (p_kompaniya_id, p_kompaniya_id, 'ichki', p_resurs, p_manba_id, p_qaror, nullif(btrim(coalesce(p_izoh, '')), ''), p_actor_id) returning id into v_id;
  update public.t2_nazorat_ichki_sorov set holat = 'yopilgan' where kompaniya_id = p_kompaniya_id and resurs = p_resurs and manba_id = p_manba_id and holat = 'ochiq' returning actor_id into v_sorovchi;
  if v_sorovchi is not null and v_sorovchi <> p_actor_id then
    perform public.t2_outbox_yoz(p_kompaniya_id, 'nazorat.ichki_qaror', 't2_nazorat_qaror', v_id, jsonb_build_object('resurs', p_resurs, 'manba_id', p_manba_id, 'qaror', p_qaror), p_actor_id, null, null, null, '{}'::bigint[], array[v_sorovchi]);
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

create or replace function public.t2_nazorat_ichki_navbat_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $fn$
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'resurs', s.resurs, 'manba_id', s.manba_id, 'izoh', s.izoh, 'vaqt', s.vaqt) order by s.id desc)
                     from public.t2_nazorat_ichki_sorov s where s.kompaniya_id = p_kompaniya_id and s.holat = 'ochiq'), '[]'::jsonb);
end $fn$;

-- BEFORE INSERT: tashqariga ketayotgan taqdimga ichki nazorat natijasi (o'tdi ha/yo'q, kim, qachon) yoziladi
create or replace function public._t2_nazorat_taqdim_ichki_trg() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
begin
  select (e.qaror = 'qabul'), e.actor_id, e.vaqt into new.ichki_otdi, new.ichki_actor_id, new.ichki_vaqt
    from public.t2_nazorat_qaror e
   where e.nazorat_turi = 'ichki' and e.kompaniya_id = new.taqdim_etuvchi_kompaniya_id and e.resurs = new.resurs and e.manba_id = new.manba_id
   order by e.id desc limit 1;
  return new;
end $fn$;
drop trigger if exists t2_nazorat_taqdim_ichki_trg on public.t2_tomon_taqdim;
create trigger t2_nazorat_taqdim_ichki_trg before insert on public.t2_tomon_taqdim for each row execute function public._t2_nazorat_taqdim_ichki_trg();

-- AFTER INSERT: taqdim buyurtmachiga ketganda vakilga ham xabar (vakolat doirasida)
create or replace function public._t2_nazorat_taqdim_vakil_outbox() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare v_vakillar bigint[];
begin
  begin
    select coalesce(array_agg(distinct v.vakil_kompaniya_id), '{}') into v_vakillar from public.t2_tomon_vakolat v join public.t2_tomon_aloqa a on a.id = v.aloqa_id and a.holat = 'faol'
     where v.holat = 'faol' and v.beruvchi_kompaniya_id = new.qabul_qiluvchi_kompaniya_id and v.obyekt_id = new.obyekt_id and new.resurs = any (v.resurslar);
    if cardinality(v_vakillar) > 0 then
      perform public.t2_outbox_yoz(new.taqdim_etuvchi_kompaniya_id, 'tomon.taqdim', 't2_tomon_taqdim', new.id, jsonb_build_object('taqdim_id', new.id, 'aloqa_id', new.aloqa_id, 'vakil', true),
        new.taqdim_actor_id, null, new.obyekt_id, new.aloqa_id, v_vakillar, '{}'::bigint[]);
    end if;
  exception when others then raise warning 'T2_OUTBOX: vakil xabari yozilmadi: %', sqlerrm; end;
  return new;
end $fn$;
drop trigger if exists t2_nazorat_taqdim_vakil_outbox_trg on public.t2_tomon_taqdim;
create trigger t2_nazorat_taqdim_vakil_outbox_trg after insert on public.t2_tomon_taqdim for each row execute function public._t2_nazorat_taqdim_vakil_outbox();

-- tashqi tomon uchun: kim nomidan, texnik qarorlar, ichki nazorat (o'tdi ha/yo'q, kim, qachon). Taqdim tomonlari va vakil ko'radi.
create or replace function public.t2_nazorat_holat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $fn$
declare q public.t2_tomon_taqdim;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id;
  if not found or (q.taqdim_etuvchi_kompaniya_id <> p_kompaniya_id and q.qabul_qiluvchi_kompaniya_id <> p_kompaniya_id
                   and not public._t2_nazorat_vakil_korish(p_kompaniya_id, q.qabul_qiluvchi_kompaniya_id, q.obyekt_id, q.resurs)) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI');
  end if;
  return jsonb_build_object('ok', true, 'taqdim_id', q.id, 'holat', q.holat,
    'ichki', case when q.ichki_otdi is null then null else jsonb_build_object('otdi', q.ichki_otdi, 'kim', (select f.ism from public.t2_foydalanuvchi f where f.id = q.ichki_actor_id), 'vaqt', q.ichki_vaqt) end,
    'texnik', coalesce((select jsonb_agg(jsonb_build_object('qaror', e.qaror, 'izoh', e.izoh, 'nazorat_turi', e.nazorat_turi, 'nomidan_kompaniya_id', e.nomidan_kompaniya_id,
                          'nomidan_nom', (select nom from public.t2_kompaniya where id = e.nomidan_kompaniya_id), 'kim', (select f.ism from public.t2_foydalanuvchi f where f.id = e.actor_id), 'vaqt', e.vaqt) order by e.id)
                         from public.t2_nazorat_qaror e where e.taqdim_id = q.id), '[]'::jsonb),
    'yakuniy', case when q.qaror_vaqti is null then null else jsonb_build_object('nazorat_turi', q.nazorat_turi, 'nomidan_kompaniya_id', q.nomidan_kompaniya_id,
                          'nomidan_nom', (select nom from public.t2_kompaniya where id = q.nomidan_kompaniya_id), 'qaror_kompaniya_id', q.qaror_kompaniya_id,
                          'qaror_kompaniya_nom', (select nom from public.t2_kompaniya where id = q.qaror_kompaniya_id), 'vaqt', q.qaror_vaqti, 'izoh', q.qaror_izoh) end);
end $fn$;

-- ===== t2_tomon_qaror_v1: vakil + nazorat turi + texnik bosqich (mavjud mexanizm kengaytiriladi) =====
create or replace function public.t2_tomon_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint, p_qaror text, p_izoh text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare q public.t2_tomon_taqdim; a public.t2_tomon_aloqa; v_yangi text; v_n integer; v_tur text; v_nomidan bigint; v_rol text; v_vak boolean := false; v_nom text; v_matn text;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'qaror');
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taqdim topilmadi'); end if;
  select * into a from public.t2_tomon_aloqa where id = q.aloqa_id;
  if q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id then
    v_nomidan := p_kompaniya_id;
    v_rol := case when a.taklif_kompaniya_id = p_kompaniya_id then a.taklif_rol else a.qabul_rol end;
    if v_rol in ('texnadzor', 'inspeksiya') then v_tur := 'mustaqil';          -- (D) eskicha: pudratchi <-> alohida texnadzor
    elsif exists (select 1 from public.t2_nazorat_tayinlash t where t.kompaniya_id = p_kompaniya_id and t.obyekt_id = q.obyekt_id and t.foydalanuvchi_id = p_actor_id and t.holat = 'faol') then v_tur := 'buyurtmachi_xodimi';   -- (A) tayinlangan texnik nazoratchi
    end if;
  elsif exists (select 1 from public.t2_tomon_vakolat v join public.t2_tomon_aloqa va on va.id = v.aloqa_id and va.holat = 'faol'
                 where v.holat = 'faol' and v.vakil_kompaniya_id = p_kompaniya_id and v.beruvchi_kompaniya_id = q.qabul_qiluvchi_kompaniya_id and v.obyekt_id = q.obyekt_id and q.resurs = any (v.resurslar)) then
    -- (B) vakil: faqat 'qaror' amali berilgan bo'lsa yakuniy; 'texnik_qaror' bo'lsa t2_nazorat_qaror_v1
    if not exists (select 1 from public.t2_tomon_vakolat v where v.holat = 'faol' and v.vakil_kompaniya_id = p_kompaniya_id and v.beruvchi_kompaniya_id = q.qabul_qiluvchi_kompaniya_id
                      and v.obyekt_id = q.obyekt_id and q.resurs = any (v.resurslar) and 'qaror' = any (v.amallar)) then
      return jsonb_build_object('ok', false, 'code', 'FAQAT_TEXNIK', 'error', 'Vakolat faqat texnik qaror uchun (t2_nazorat_qaror_v1)');
    end if;
    if not public._t2_tomon_ruxsat_togri(q.qabul_qiluvchi_kompaniya_id, q.taqdim_etuvchi_kompaniya_id, q.resurs, 'korish', q.obyekt_id) then
      return jsonb_build_object('ok', false, 'code', 'VAKOLAT_DOIRADAN_TASHQARI', 'error', 'Buyurtmachining grant doirasidan tashqari');
    end if;
    v_vak := true; v_tur := 'vakil'; v_nomidan := q.qabul_qiluvchi_kompaniya_id;
  else
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
  -- texnik bosqich: buyurtmachining yakuniy qabuli oldidan texnik qaror (faqat texnik nazorat tayinlangan bo'lsa yoki sozlama 'ha')
  if v_yangi = 'qabul' and not v_vak and v_tur is distinct from 'mustaqil' and public._t2_nazorat_texnik_kerak(q.qabul_qiluvchi_kompaniya_id, q.obyekt_id) then
    if coalesce((select e.qaror from public.t2_nazorat_qaror e where e.taqdim_id = q.id and e.nazorat_turi in ('buyurtmachi_xodimi', 'vakil') order by e.id desc limit 1), '') <> 'qabul' then
      return jsonb_build_object('ok', false, 'code', 'TEXNIK_QAROR_KERAK', 'error', 'Avval texnik nazorat qarori (qabul) kerak');
    end if;
  end if;
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
         qaror_izoh = case when v_yangi = 'ko_rilmoqda' then qaror_izoh else nullif(btrim(coalesce(p_izoh, '')), '') end,
         qaror_kompaniya_id = case when v_yangi = 'ko_rilmoqda' then qaror_kompaniya_id else p_kompaniya_id end,
         nomidan_kompaniya_id = case when v_yangi = 'ko_rilmoqda' then nomidan_kompaniya_id else v_nomidan end,
         nazorat_turi = case when v_yangi = 'ko_rilmoqda' then nazorat_turi else v_tur end
   where id = q.id;
  select nom into v_nom from public.t2_kompaniya where id = v_nomidan;
  v_matn := case when v_tur in ('buyurtmachi_xodimi', 'vakil') then 'Texnik nazorat, ' || coalesce(v_nom, '?') || coalesce(': ' || nullif(btrim(coalesce(p_izoh, '')), ''), '') else p_izoh end;
  -- hodisa «kim nomidan» kompaniyasi ostida yoziladi (outbox qarshi tomonga = pudratchi ketadi)
  perform public._t2_tomon_hodisa_yoz(q.aloqa_id, q.id, v_nomidan, p_actor_id, case when v_yangi = 'ko_rilmoqda' then 'korilmoqda' else 'qaror' end, v_matn,
    jsonb_build_object('qaror', v_yangi, 'nazorat_turi', v_tur, 'qaror_kompaniya_id', p_kompaniya_id));
  return jsonb_build_object('ok', true, 'id', q.id, 'holat', v_yangi, 'nazorat_turi', v_tur, 'nomidan_kompaniya_id', v_nomidan);
end $fn$;

-- ===== mavjud funksiyalarga patch (matn bo'yicha; nusxa ko'chirilmaydi) =====
do $p$
declare d text; n text;
begin
  -- taqdimlar: vakil «kelgan» ro'yxatda vakolat doirasidagi taqdimlarni ko'radi
  d := pg_get_functiondef('public.t2_tomon_taqdimlar_v1(bigint,bigint,text,text,bigint,integer)'::regprocedure);
  if position('_t2_nazorat_vakil_korish' in d) = 0 then
    n := replace(d, '(p_yonalish = ''kelgan'' and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id)',
      '(p_yonalish = ''kelgan'' and (q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id or public._t2_nazorat_vakil_korish(p_kompaniya_id, q.qabul_qiluvchi_kompaniya_id, q.obyekt_id, q.resurs)))');
    if n = d then raise exception 'taqdimlar patch anchor topilmadi'; end if;
    execute n;
  end if;
  -- tafsilot: vakil ko'ra oladi
  d := pg_get_functiondef('public.t2_tomon_taqdim_tafsilot_v1(bigint,bigint,bigint)'::regprocedure);
  if position('_t2_nazorat_vakil_korish' in d) = 0 then
    n := replace(d, 'if not found or (q.taqdim_etuvchi_kompaniya_id <> p_kompaniya_id and q.qabul_qiluvchi_kompaniya_id <> p_kompaniya_id) then',
      'if not found or (q.taqdim_etuvchi_kompaniya_id <> p_kompaniya_id and q.qabul_qiluvchi_kompaniya_id <> p_kompaniya_id and not public._t2_nazorat_vakil_korish(p_kompaniya_id, q.qabul_qiluvchi_kompaniya_id, q.obyekt_id, q.resurs)) then');
    if n = d then raise exception 'tafsilot patch anchor topilmadi'; end if;
    execute n;
  end if;
  -- taqdim_yarat: ichki nazorat darvozasi (sozlama yoqilgan bo'lsa ichki qabulsiz tashqariga yuborilmaydi; sukut: o'chiq)
  d := pg_get_functiondef('public.t2_tomon_taqdim_yarat_v1(bigint,bigint,bigint,text,bigint,text,uuid)'::regprocedure);
  if position('ICHKI_NAZORAT_KERAK' in d) = 0 then
    n := regexp_replace(d, 'select \* into a from public\.t2_tomon_aloqa where id = p_aloqa_id;',
      $r$if coalesce((select s.ichki_majburiy from public.t2_nazorat_sozlama s where s.kompaniya_id = p_kompaniya_id), false)
     and coalesce((select e.qaror from public.t2_nazorat_qaror e where e.nazorat_turi = 'ichki' and e.kompaniya_id = p_kompaniya_id and e.resurs = p_resurs and e.manba_id = p_manba_id order by e.id desc limit 1), '') <> 'qabul' then
    return jsonb_build_object('ok', false, 'code', 'ICHKI_NAZORAT_KERAK', 'error', 'Ichki nazoratdan o''tmagan hujjat tashqariga yuborilmaydi (kompaniya sozlamasi)');
  end if;
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id;$r$);
    if n = d then raise exception 'taqdim_yarat patch anchor topilmadi'; end if;
    execute n;
  end if;
end $p$;

-- ===== bildirishnoma: nazorat mavzulari =====
insert into public.t2_outbox_mavzu_ruxsat (mavzu_naqsh, ruxsatlar, izoh) values
  ('nazorat.%', array['quality.decide', 'quality.read', 'f2.prepare', 'document.write', 'f2.read'], 'nazorat: vakolat, texnik/ichki qaror, ichki so''rov')
on conflict (mavzu_naqsh) do nothing;

revoke all on function public._t2_tomon_ruxsat_togri(bigint, bigint, text, text, bigint), public._t2_nazorat_vakil_korish(bigint, bigint, bigint, text), public._t2_nazorat_texnik_kerak(bigint, bigint),
  public.t2_nazorat_sozlama_saqla_v1(bigint, bigint, boolean, text, uuid), public.t2_nazorat_sozlama_ol_v1(bigint, bigint),
  public.t2_nazorat_tayinlash_v1(bigint, bigint, bigint, bigint, uuid), public.t2_nazorat_tayinlash_bekor_v1(bigint, bigint, bigint),
  public.t2_tomon_vakolat_ber_v1(bigint, bigint, bigint, bigint, text[], text[], uuid), public.t2_tomon_vakolat_bekor_v1(bigint, bigint, bigint),
  public.t2_nazorat_tayinlar_v1(bigint, bigint), public.t2_nazorat_qaror_v1(bigint, bigint, bigint, text, text),
  public.t2_nazorat_ichki_sorov_v1(bigint, bigint, text, bigint, text, uuid), public.t2_nazorat_ichki_qaror_v1(bigint, bigint, text, bigint, text, text, uuid),
  public.t2_nazorat_ichki_navbat_v1(bigint, bigint), public.t2_nazorat_holat_v1(bigint, bigint, bigint),
  public._t2_nazorat_taqdim_ichki_trg(), public._t2_nazorat_taqdim_vakil_outbox() from public, anon, authenticated;
grant execute on function public._t2_tomon_ruxsat_togri(bigint, bigint, text, text, bigint), public._t2_nazorat_vakil_korish(bigint, bigint, bigint, text), public._t2_nazorat_texnik_kerak(bigint, bigint),
  public.t2_nazorat_sozlama_saqla_v1(bigint, bigint, boolean, text, uuid), public.t2_nazorat_sozlama_ol_v1(bigint, bigint),
  public.t2_nazorat_tayinlash_v1(bigint, bigint, bigint, bigint, uuid), public.t2_nazorat_tayinlash_bekor_v1(bigint, bigint, bigint),
  public.t2_tomon_vakolat_ber_v1(bigint, bigint, bigint, bigint, text[], text[], uuid), public.t2_tomon_vakolat_bekor_v1(bigint, bigint, bigint),
  public.t2_nazorat_tayinlar_v1(bigint, bigint), public.t2_nazorat_qaror_v1(bigint, bigint, bigint, text, text),
  public.t2_nazorat_ichki_sorov_v1(bigint, bigint, text, bigint, text, uuid), public.t2_nazorat_ichki_qaror_v1(bigint, bigint, text, bigint, text, text, uuid),
  public.t2_nazorat_ichki_navbat_v1(bigint, bigint), public.t2_nazorat_holat_v1(bigint, bigint, bigint) to service_role;
