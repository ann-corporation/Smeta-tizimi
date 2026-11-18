-- Hujjat maydoni (Hujjatlarim / Kompaniya diski) - MVP, 1-reliz.
-- Egasi 2026-11-18. Qarorlar:
--  1. Shaxsiy fayl/papka: egasi_foydalanuvchi_id (kompaniyaga bog'liq emas); kompaniya fayli: kompaniya_id.
--     Ikkalasidan aynan bittasi (check). "Soxta kompaniya" yo'q.
--  2. Versiyalar (har yuklash = yangi versiya, qaytarish), izoh+@eslatma, qulf (check-out), faoliyat, qidiruv, savat 30 kun.
--  3. Kvota: kompaniya 1 GB, shaxsiy 200 MB; versiyalar va savat kiradi. Baytlar FAQAT R2 da, bu yerda faqat metama'lumot.
--  4. Ulashish: foydalanuvchi / rol / kompaniya (faol aloqa, faqat ko'rish) / havola (faqat ko'rish, muddatli,
--     sukut bo'yicha O'CHIQ - kompaniya admini yoqadi).
--  5. Tomonlararo yozuvchi umumiy papka YO'Q: kompaniya subyekti faqat ko'rish; qolgani taqdim (t2_tomon_taqdim) bilan.
-- Mavjud qatlamlar: t2_fayl_papka (papka daraxti) kengaytirildi; t2_outbox (bildirishnoma); t2_actor/azolik.
-- t2_document_registry TEGILMAGAN (tizim hujjatlari - faqat o'qish RPC si t2_hm_tizim_hujjat_v1).
-- Kirish: faqat service_role RPC lari (Cloudflare Functions, sessiya aktori). RLS yoqilgan, siyosatsiz.

-- ---------------------------------------------------------------- papka: shaxsiy egalik
alter table public.t2_fayl_papka alter column kompaniya_id drop not null;
alter table public.t2_fayl_papka add column if not exists egasi_foydalanuvchi_id bigint references public.t2_foydalanuvchi(id);
alter table public.t2_fayl_papka add constraint t2_fayl_papka_egasi_chk
  check ((kompaniya_id is not null) <> (egasi_foydalanuvchi_id is not null)) not valid;
create unique index if not exists t2_fayl_papka_shaxsiy_nom_uq
  on public.t2_fayl_papka(egasi_foydalanuvchi_id, coalesce(ota_id, 0), lower(btrim(nom))) where egasi_foydalanuvchi_id is not null;

-- ---------------------------------------------------------------- jadvallar
create table if not exists public.t2_hm_fayl (
  id bigint generated always as identity primary key,
  kompaniya_id bigint references public.t2_kompaniya(id),
  egasi_foydalanuvchi_id bigint references public.t2_foydalanuvchi(id),
  papka_id bigint references public.t2_fayl_papka(id) on delete set null,
  nom text not null check (length(btrim(nom)) between 1 and 200),
  mime text not null default 'application/octet-stream',
  joriy_versiya_id bigint,
  yaratdi_id bigint not null,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  savatda timestamptz,
  qulf_kim bigint,
  qulf_vaqt timestamptz,
  qulf_tugaydi timestamptz,
  constraint t2_hm_fayl_egasi_chk check ((kompaniya_id is not null) <> (egasi_foydalanuvchi_id is not null))
);
create unique index if not exists t2_hm_fayl_nom_uq on public.t2_hm_fayl(coalesce(kompaniya_id, 0), coalesce(egasi_foydalanuvchi_id, 0), coalesce(papka_id, 0), lower(nom)) where savatda is null;
create index if not exists t2_hm_fayl_komp_ix on public.t2_hm_fayl(kompaniya_id) where kompaniya_id is not null;
create index if not exists t2_hm_fayl_egasi_ix on public.t2_hm_fayl(egasi_foydalanuvchi_id) where egasi_foydalanuvchi_id is not null;

create table if not exists public.t2_hm_versiya (
  id bigint generated always as identity primary key,
  fayl_id bigint not null references public.t2_hm_fayl(id) on delete cascade,
  raqam integer not null,
  r2_kalit text not null,
  bayt bigint not null check (bayt > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime text not null,
  holat text not null default 'kutish' check (holat in ('kutish', 'tayyor')),
  yukladi_id bigint not null,
  operation_id uuid,
  yaratildi timestamptz not null default now(),
  unique (fayl_id, raqam),
  unique (operation_id)
);

create table if not exists public.t2_hm_ulashish (
  id bigint generated always as identity primary key,
  nishon_turi text not null check (nishon_turi in ('fayl', 'papka')),
  nishon_id bigint not null,
  subyekt_turi text not null check (subyekt_turi in ('foydalanuvchi', 'rol', 'kompaniya', 'havola')),
  subyekt_id bigint,
  rol text,
  daraja text not null check (daraja in ('korish', 'izoh', 'tahrir')),
  havola_xesh text,
  tugaydi timestamptz,
  bergan_id bigint not null,
  yaratildi timestamptz not null default now(),
  bekor timestamptz,
  check (subyekt_turi = 'havola' or subyekt_id is not null),
  check (subyekt_turi <> 'havola' or (havola_xesh is not null and tugaydi is not null and daraja = 'korish' and nishon_turi = 'fayl'))
);
create index if not exists t2_hm_ulashish_nishon_ix on public.t2_hm_ulashish(nishon_turi, nishon_id) where bekor is null;
create unique index if not exists t2_hm_ulashish_havola_uq on public.t2_hm_ulashish(havola_xesh) where havola_xesh is not null;

create table if not exists public.t2_hm_izoh (
  id bigint generated always as identity primary key,
  fayl_id bigint not null references public.t2_hm_fayl(id) on delete cascade,
  muallif_id bigint not null,
  matn text not null check (length(btrim(matn)) between 1 and 2000),
  eslatilgan bigint[] not null default '{}',
  yaratildi timestamptz not null default now()
);
create index if not exists t2_hm_izoh_fayl_ix on public.t2_hm_izoh(fayl_id, id);

create table if not exists public.t2_hm_faoliyat (
  id bigint generated always as identity primary key,
  kompaniya_id bigint,
  egasi_foydalanuvchi_id bigint,
  fayl_id bigint,
  actor_id bigint,
  amal text not null,
  tafsilot text check (tafsilot is null or length(tafsilot) <= 240),
  vaqt timestamptz not null default now()
);
create index if not exists t2_hm_faoliyat_fayl_ix on public.t2_hm_faoliyat(fayl_id, id desc) where fayl_id is not null;
create index if not exists t2_hm_faoliyat_komp_ix on public.t2_hm_faoliyat(kompaniya_id, id desc) where kompaniya_id is not null;
create index if not exists t2_hm_faoliyat_egasi_ix on public.t2_hm_faoliyat(egasi_foydalanuvchi_id, id desc) where egasi_foydalanuvchi_id is not null;

create table if not exists public.t2_hm_sozlama (
  kompaniya_id bigint primary key references public.t2_kompaniya(id),
  havola_ruxsat boolean not null default false,
  ortiqcha boolean not null default false, -- pay-as-you-go: limitdan oshgan xotira tokenda hisoblanadi (aks holda yuklash bloklanadi)
  yangilandi timestamptz not null default now()
);

-- Telegram: fayl keldi, papka tanlanishi kutilmoqda (qisqa muddatli).
create table if not exists public.t2_hm_tg_kutish (
  id bigint generated always as identity primary key,
  foydalanuvchi_id bigint not null,
  tg_file_id text not null,
  nom text not null,
  mime text,
  bayt bigint,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_hm_tg_kutish_ix on public.t2_hm_tg_kutish(foydalanuvchi_id);

-- ---------------------------------------------------------------- tarif / token (mavjud t2_tarif, t2_token_* kengaytirildi; parallel billing YO'Q)
-- Barcha limit va narxlar sozlanadigan: t2_token_sozlama (bepul limitlar), t2_tarif (disk rejalar), t2_token_narx (ortiqcha xotira/trafik).
-- DIQQAT: narx qiymatlari NAMUNA (placeholder) - egasi Tokenlar va obuna sahifasida/jadvalda belgilaydi.
alter table public.t2_token_sozlama add column if not exists disk_bepul_kompaniya_bayt bigint not null default 1073741824;   -- 1 GB
alter table public.t2_token_sozlama add column if not exists disk_bepul_shaxsiy_bayt bigint not null default 209715200;       -- 200 MB
alter table public.t2_token_sozlama add column if not exists trafik_bepul_oylik_bayt bigint not null default 21474836480;     -- 20 GB / oy (yuklab olish)
alter table public.t2_token_sozlama add column if not exists disk_ortiqcha_max_bayt bigint not null default 53687091200;      -- pay-as-you-go: limitdan 50 GB gacha oshish

alter table public.t2_tarif add column if not exists tur text not null default 'reja';
alter table public.t2_tarif add column if not exists disk_bayt bigint;
alter table public.t2_tarif add constraint t2_tarif_tur_chk check (tur in ('reja', 'disk')) not valid;
insert into public.t2_tarif(kod, nom, oylik_token, narx_som, faol, tartib, tur, disk_bayt) values
  ('disk_10',  'Disk 10 GB',  0, 49000,  true, 10, 'disk', 10::bigint * 1073741824),
  ('disk_50',  'Disk 50 GB',  0, 199000, true, 11, 'disk', 50::bigint * 1073741824),
  ('disk_200', 'Disk 200 GB', 0, 599000, true, 12, 'disk', 200::bigint * 1073741824)
on conflict (kod) do nothing;

insert into public.t2_token_narx(amal, nom, tur, narx, birlik, minimum, faol, asos_som, birlik_som, min_som, izoh) values
  ('hujjat_xotira', 'Disk: ortiqcha xotira (1 GB / kun)', 'yacheyka', 0, 1024, 0, true, 0, 100, 0,
   'NAMUNA NARX - egasi belgilaydi. Reja limitidan oshgan hajm uchun kunlik hisob (birlik = 1 GB, MB hisobida beriladi).'),
  ('hujjat_trafik', 'Disk: ortiqcha yuklab olish trafigi (1 GB)', 'yacheyka', 0, 1024, 0, true, 0, 300, 0,
   'NAMUNA NARX - egasi belgilaydi. Oylik bepul trafikdan oshgan yuklab olish (birlik = 1 GB, MB hisobida beriladi).')
on conflict (amal) do nothing;

create table if not exists public.t2_hm_reja (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  tarif_kod text not null references public.t2_tarif(kod),
  boshlandi date not null default current_date,
  tugaydi date not null,
  holat text not null default 'faol' check (holat in ('faol', 'tugagan')),
  kim text,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_hm_reja_komp_ix on public.t2_hm_reja(kompaniya_id) where holat = 'faol';

-- Oylik trafik (kalit: 'k<kompaniya>:YYYY-MM' / 'u<foydalanuvchi>:YYYY-MM'). haq_olingan_mb - ortiqcha trafik uchun allaqachon to'langan MB.
create table if not exists public.t2_hm_trafik (
  kalit text primary key,
  chiqish bigint not null default 0,
  kirish bigint not null default 0,
  haq_olingan_mb bigint not null default 0
);

-- Kunlik hisob jurnali (idempotentlik: bir davr+tur = bitta yozuv) va ogohlantirish belgilari.
create table if not exists public.t2_hm_hisob (
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  sana date not null,
  tur text not null check (tur in ('xotira', 'trafik', 'ogoh80', 'ogoh95')),
  bayt bigint not null default 0,
  token numeric not null default 0,
  holat text not null check (holat in ('olindi', 'yetmadi', 'bepul', 'ogoh')),
  primary key (kompaniya_id, sana, tur)
);
do $rls$ declare t text; begin
  foreach t in array array['t2_hm_reja','t2_hm_trafik','t2_hm_hisob','t2_hm_fayl','t2_hm_versiya','t2_hm_ulashish','t2_hm_izoh','t2_hm_faoliyat','t2_hm_sozlama','t2_hm_tg_kutish'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $rls$;

-- ---------------------------------------------------------------- ichki yordamchilar
-- Daraja: 0 yo'q, 1 ko'rish, 2 izoh, 3 tahrir, 4 egasi/boshqaruv.
create or replace function public._t2_hm_daraja_v1(p_actor bigint, p_kompaniya bigint, p_egasi bigint, p_papka bigint, p_fayl bigint)
returns integer language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v integer := 0; v_rol text; v_g integer;
begin
  if p_actor is null or p_actor <= 0 then return 0; end if;
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor and holat = 'faol') then return 0; end if;
  if p_egasi is not null and p_egasi = p_actor then return 4; end if;
  if p_kompaniya is not null then
    select a.rol into v_rol from public.t2_azolik a
     where a.kompaniya_id = p_kompaniya and a.foydalanuvchi_id = p_actor and a.holat = 'faol';
    if found then
      v := case when v_rol in ('kuzatuvchi', 'buyurtmachi', 'pudratchi') then 1
                when v_rol in ('boss', 'admin', 'rahbar', 'director', 'superadmin') then 4 else 3 end;
    end if;
  end if;
  if v >= 4 then return v; end if;
  with recursive z(id, ota_id) as (
    select p.id, p.ota_id from public.t2_fayl_papka p where p.id = p_papka
    union all
    select p.id, p.ota_id from public.t2_fayl_papka p join z on p.id = z.ota_id
  )
  select coalesce(max(case u.daraja when 'korish' then 1 when 'izoh' then 2 when 'tahrir' then 3 end), 0) into v_g
    from public.t2_hm_ulashish u
   where u.bekor is null and (u.tugaydi is null or u.tugaydi > now()) and u.subyekt_turi <> 'havola'
     and ((u.nishon_turi = 'papka' and u.nishon_id in (select id from z))
          or (u.nishon_turi = 'fayl' and p_fayl is not null and u.nishon_id = p_fayl))
     and ((u.subyekt_turi = 'foydalanuvchi' and u.subyekt_id = p_actor)
          or (u.subyekt_turi = 'kompaniya' and exists (select 1 from public.t2_azolik a
                where a.kompaniya_id = u.subyekt_id and a.foydalanuvchi_id = p_actor and a.holat = 'faol'))
          or (u.subyekt_turi = 'rol' and exists (select 1 from public.t2_azolik a
                where a.kompaniya_id = u.subyekt_id and a.foydalanuvchi_id = p_actor and a.holat = 'faol' and a.rol = u.rol)));
  return greatest(v, v_g);
end $$;

create or replace function public._t2_hm_fayl_daraja_v1(p_actor bigint, p_fayl_id bigint)
returns integer language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f public.t2_hm_fayl%rowtype;
begin
  select * into f from public.t2_hm_fayl where id = p_fayl_id;
  if not found then return 0; end if;
  return public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id);
end $$;

-- Limit: faol disk rejasi (t2_hm_reja) yoki bepul limit (t2_token_sozlama) - bitta joyda sozlanadi.
create or replace function public._t2_hm_limit_v1(p_kompaniya bigint)
returns bigint language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_b bigint;
begin
  if p_kompaniya is null then
    return coalesce((select disk_bepul_shaxsiy_bayt from public.t2_token_sozlama where id = 1), 209715200);
  end if;
  v_b := (select max(t.disk_bayt) from public.t2_hm_reja r join public.t2_tarif t on t.kod = r.tarif_kod
           where r.kompaniya_id = p_kompaniya and r.holat = 'faol' and r.tugaydi >= current_date);
  return greatest(coalesce(v_b, 0), coalesce((select disk_bepul_kompaniya_bayt from public.t2_token_sozlama where id = 1), 1073741824));
end $$;

-- Kvota: ishlatilgan = barcha versiyalar (kutish ham) + savatdagilar. chegara = yuklash ruxsat etiladigan yuqori chiziq
-- (pay-as-you-go yoqilgan va token balansi bor kompaniyada limit + sozlangan maksimum; aks holda limitning o'zi).
create or replace function public._t2_hm_kvota_v1(p_kompaniya bigint, p_egasi bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_used bigint; v_lim bigint := public._t2_hm_limit_v1(p_kompaniya); v_chegara bigint; v_ort boolean := false; v_max bigint;
begin
  select coalesce(sum(v.bayt), 0) into v_used from public.t2_hm_versiya v join public.t2_hm_fayl f on f.id = v.fayl_id
   where (p_kompaniya is not null and f.kompaniya_id = p_kompaniya) or (p_kompaniya is null and f.egasi_foydalanuvchi_id = p_egasi);
  v_chegara := v_lim;
  if p_kompaniya is not null then
    select coalesce(s.ortiqcha, false) into v_ort from public.t2_hm_sozlama s where s.kompaniya_id = p_kompaniya;
    if coalesce(v_ort, false) and public.t2_token_balans(p_kompaniya) > 0 then
      select disk_ortiqcha_max_bayt into v_max from public.t2_token_sozlama where id = 1;
      v_chegara := v_lim + coalesce(v_max, 0);
    end if;
  end if;
  return jsonb_build_object('ishlatilgan', v_used, 'limit', v_lim, 'chegara', v_chegara, 'ortiqcha', coalesce(v_ort, false),
    'foiz', case when v_lim > 0 then round(v_used * 100.0 / v_lim, 1) end);
end $$;
create or replace function public._t2_hm_log_v1(p_kompaniya bigint, p_egasi bigint, p_fayl bigint, p_actor bigint, p_amal text, p_tafsilot text default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.t2_hm_faoliyat(kompaniya_id, egasi_foydalanuvchi_id, fayl_id, actor_id, amal, tafsilot)
  values (p_kompaniya, p_egasi, p_fayl, p_actor, p_amal, left(p_tafsilot, 240)) $$;

create or replace function public._t2_hm_bildir_v1(p_kompaniya bigint, p_mavzu text, p_fayl bigint, p_users bigint[], p_actor bigint, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_k bigint;
begin
  if p_users is null or cardinality(p_users) = 0 then return; end if;
  v_k := coalesce(p_kompaniya,
    (select min(a.kompaniya_id) from public.t2_azolik a where a.foydalanuvchi_id = any (p_users) and a.holat = 'faol'),
    (select min(a.kompaniya_id) from public.t2_azolik a where a.foydalanuvchi_id = p_actor and a.holat = 'faol'));
  if v_k is null then return; end if;
  insert into public.t2_outbox(kompaniya_id, mavzu, entity_jadval, entity_id, foydalanuvchi_idlar, payload, actor_id, operation_id)
  values (v_k, p_mavzu, 't2_hm_fayl', p_fayl, p_users, coalesce(p_payload, '{}'::jsonb), p_actor, gen_random_uuid());
end $$;

create or replace function public._t2_hm_nom_v1(p_nom text)
returns text language sql immutable as $$
  select nullif(left(btrim(regexp_replace(coalesce(p_nom, ''), '[\\/\x00-\x1f]+', '_', 'g')), 200), '') $$;

-- Shaxsiy "Kiruvchi" papkasi (Telegram va tezkor yuklash).
create or replace function public._t2_hm_kiruvchi_v1(p_actor bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  select id into v_id from public.t2_fayl_papka where egasi_foydalanuvchi_id = p_actor and ota_id is null and lower(btrim(nom)) = 'kiruvchi';
  if v_id is not null then return v_id; end if;
  begin
    insert into public.t2_fayl_papka(kompaniya_id, egasi_foydalanuvchi_id, ota_id, nom, yaratdi) values (null, p_actor, null, 'Kiruvchi', p_actor) returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.t2_fayl_papka where egasi_foydalanuvchi_id = p_actor and ota_id is null and lower(btrim(nom)) = 'kiruvchi';
  end;
  return v_id;
end $$;

-- ---------------------------------------------------------------- RO'YXAT
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
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom) order by lower(p.nom)), '[]'::jsonb) into v_pap
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

-- Menga ulashilganlar (foydalanuvchi / rol / kompaniya orqali).
create or replace function public.t2_hm_ulashilgan_v1(p_actor bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  return jsonb_build_object('ok', true, 'royxat', coalesce((
    select jsonb_agg(x order by x->>'nom') from (
      select distinct on (u.nishon_turi, u.nishon_id) jsonb_build_object(
        'turi', u.nishon_turi, 'id', u.nishon_id, 'daraja', u.daraja, 'tugaydi', u.tugaydi,
        'nom', coalesce(f.nom, p.nom), 'mime', f.mime, 'bergan', b.ism) x
      from public.t2_hm_ulashish u
      left join public.t2_hm_fayl f on u.nishon_turi = 'fayl' and f.id = u.nishon_id and f.savatda is null
      left join public.t2_fayl_papka p on u.nishon_turi = 'papka' and p.id = u.nishon_id
      left join public.t2_foydalanuvchi b on b.id = u.bergan_id
      where u.bekor is null and (u.tugaydi is null or u.tugaydi > now()) and u.subyekt_turi <> 'havola'
        and coalesce(f.id, p.id) is not null
        and coalesce(f.egasi_foydalanuvchi_id, p.egasi_foydalanuvchi_id, 0) <> p_actor
        and ((u.subyekt_turi = 'foydalanuvchi' and u.subyekt_id = p_actor)
          or (u.subyekt_turi = 'kompaniya' and exists (select 1 from public.t2_azolik a where a.kompaniya_id = u.subyekt_id and a.foydalanuvchi_id = p_actor and a.holat = 'faol'))
          or (u.subyekt_turi = 'rol' and exists (select 1 from public.t2_azolik a where a.kompaniya_id = u.subyekt_id and a.foydalanuvchi_id = p_actor and a.holat = 'faol' and a.rol = u.rol)))
      order by u.nishon_turi, u.nishon_id, u.id desc) s), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- PAPKA amallari
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

-- ---------------------------------------------------------------- YUKLASH (reserve -> R2 -> tasdiq)
create or replace function public.t2_hm_yuklash_reserve_v1(p_actor bigint, p_kompaniya bigint, p_papka bigint, p_nom text, p_mime text,
  p_bayt bigint, p_sha256 text, p_operation_id uuid, p_fayl_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_nom text := public._t2_hm_nom_v1(p_nom); v_k bigint; v_e bigint; p public.t2_fayl_papka%rowtype; f public.t2_hm_fayl%rowtype;
  v_kv jsonb; v_raqam integer; v_vid bigint; v_kalit text; v_old public.t2_hm_versiya%rowtype; v_mime text := coalesce(nullif(btrim(p_mime), ''), 'application/octet-stream');
begin
  if p_bayt is null or p_bayt <= 0 then return jsonb_build_object('ok', false, 'code', 'EMPTY_FILE'); end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'code', 'SHA_NOTOGRI'); end if;
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;

  select * into v_old from public.t2_hm_versiya where operation_id = p_operation_id;
  if found then
    return jsonb_build_object('ok', true, 'takror', true, 'fayl_id', v_old.fayl_id, 'versiya_id', v_old.id, 'raqam', v_old.raqam, 'r2_kalit', v_old.r2_kalit, 'holat', v_old.holat);
  end if;

  if p_fayl_id is not null then
    select * into f from public.t2_hm_fayl where id = p_fayl_id for update;
    if not found or f.savatda is not null then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
    v_k := f.kompaniya_id; v_e := f.egasi_foydalanuvchi_id;
    if public._t2_hm_daraja_v1(p_actor, v_k, v_e, f.papka_id, f.id) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  else
    if p_papka is not null then
      select * into p from public.t2_fayl_papka where id = p_papka;
      if not found then return jsonb_build_object('ok', false, 'code', 'PAPKA_TOPILMADI'); end if;
      v_k := p.kompaniya_id; v_e := p.egasi_foydalanuvchi_id;
    else v_k := p_kompaniya; v_e := case when p_kompaniya is null then p_actor end; end if;
    if public._t2_hm_daraja_v1(p_actor, v_k, v_e, p_papka, null) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
    if v_nom is null then return jsonb_build_object('ok', false, 'code', 'NOM_NOTOGRI'); end if;
    select * into f from public.t2_hm_fayl
     where kompaniya_id is not distinct from v_k and egasi_foydalanuvchi_id is not distinct from v_e
       and papka_id is not distinct from p_papka and lower(nom) = lower(v_nom) and savatda is null for update;
  end if;

  if found and f.id is not null then
    if f.qulf_kim is not null and f.qulf_tugaydi > now() and f.qulf_kim <> p_actor then
      return jsonb_build_object('ok', false, 'code', 'QULFLANGAN', 'qulf_kim', f.qulf_kim); end if;
    select * into v_old from public.t2_hm_versiya where id = f.joriy_versiya_id;
    if found and v_old.sha256 = p_sha256 then
      return jsonb_build_object('ok', true, 'ozgarmadi', true, 'fayl_id', f.id, 'raqam', v_old.raqam);
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('hm_kvota:' || coalesce(v_k::text, 'u' || v_e::text), 0));
  v_kv := public._t2_hm_kvota_v1(v_k, v_e);
  if (v_kv->>'ishlatilgan')::bigint + p_bayt > (v_kv->>'chegara')::bigint then
    return jsonb_build_object('ok', false, 'code', 'KVOTA_TUGADI', 'ishlatilgan', (v_kv->>'ishlatilgan')::bigint, 'limit', (v_kv->>'limit')::bigint, 'shaxsiy', v_k is null, 'ortiqcha', (v_kv->>'ortiqcha')::boolean);
  end if;

  if f.id is null then
    begin
      insert into public.t2_hm_fayl(kompaniya_id, egasi_foydalanuvchi_id, papka_id, nom, mime, yaratdi_id)
      values (v_k, v_e, p_papka, v_nom, v_mime, p_actor) returning * into f;
    exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'NOM_BAND'); end;
  end if;
  select coalesce(max(raqam), 0) + 1 into v_raqam from public.t2_hm_versiya where fayl_id = f.id;
  v_kalit := 'docs/' || case when v_k is not null then v_k::text else 'u' || v_e::text end || '/0/0/f' || f.id || '/r' || v_raqam;
  insert into public.t2_hm_versiya(fayl_id, raqam, r2_kalit, bayt, sha256, mime, yukladi_id, operation_id)
  values (f.id, v_raqam, v_kalit, p_bayt, p_sha256, v_mime, p_actor, p_operation_id) returning id into v_vid;
  return jsonb_build_object('ok', true, 'fayl_id', f.id, 'versiya_id', v_vid, 'raqam', v_raqam, 'r2_kalit', v_kalit, 'yangi', v_raqam = 1);
end $$;

create or replace function public.t2_hm_yuklash_tasdiq_v1(p_actor bigint, p_versiya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.t2_hm_versiya%rowtype; f public.t2_hm_fayl%rowtype;
begin
  select * into v from public.t2_hm_versiya where id = p_versiya_id for update;
  if not found or v.yukladi_id <> p_actor then return jsonb_build_object('ok', false, 'code', 'VERSIYA_TOPILMADI'); end if;
  if v.holat = 'tayyor' then return jsonb_build_object('ok', true, 'takror', true, 'fayl_id', v.fayl_id, 'raqam', v.raqam); end if;
  update public.t2_hm_versiya set holat = 'tayyor' where id = v.id;
  perform public._t2_hm_trafik_v1((select kompaniya_id from public.t2_hm_fayl where id = v.fayl_id), (select egasi_foydalanuvchi_id from public.t2_hm_fayl where id = v.fayl_id), v.bayt, 0);
  update public.t2_hm_fayl set joriy_versiya_id = v.id, mime = v.mime, yangilandi = now(),
         qulf_kim = case when qulf_kim = p_actor then null else qulf_kim end,
         qulf_vaqt = case when qulf_kim = p_actor then null else qulf_vaqt end,
         qulf_tugaydi = case when qulf_kim = p_actor then null else qulf_tugaydi end
   where id = v.fayl_id returning * into f;
  perform public._t2_hm_log_v1(f.kompaniya_id, f.egasi_foydalanuvchi_id, f.id, p_actor, case when v.raqam = 1 then 'yuklandi' else 'yangi_versiya' end, f.nom || ' v' || v.raqam);
  return jsonb_build_object('ok', true, 'fayl_id', f.id, 'raqam', v.raqam);
end $$;

create or replace function public.t2_hm_yuklash_bekor_v1(p_actor bigint, p_versiya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.t2_hm_versiya%rowtype;
begin
  select * into v from public.t2_hm_versiya where id = p_versiya_id and holat = 'kutish' and yukladi_id = p_actor;
  if not found then return jsonb_build_object('ok', true); end if;
  delete from public.t2_hm_versiya where id = v.id;
  delete from public.t2_hm_fayl f where f.id = v.fayl_id and not exists (select 1 from public.t2_hm_versiya x where x.fayl_id = f.id);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- YUKLAB OLISH
create or replace function public.t2_hm_yuklab_v1(p_actor bigint, p_fayl_id bigint, p_raqam integer default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.t2_hm_fayl%rowtype; v public.t2_hm_versiya%rowtype;
begin
  select * into f from public.t2_hm_fayl where id = p_fayl_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
  if public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  select * into v from public.t2_hm_versiya where fayl_id = f.id and holat = 'tayyor' and raqam = coalesce(p_raqam, (select raqam from public.t2_hm_versiya where id = f.joriy_versiya_id));
  if not found then return jsonb_build_object('ok', false, 'code', 'VERSIYA_TOPILMADI'); end if;
  -- Hech qachon ushlab turilmaydi: yuklab olish kvotadan oshganda ham ishlaydi; faqat trafik hisobi yuritiladi.
  perform public._t2_hm_trafik_v1(f.kompaniya_id, f.egasi_foydalanuvchi_id, 0, v.bayt);
  return jsonb_build_object('ok', true, 'kalit', v.r2_kalit, 'nom', f.nom, 'mime', v.mime, 'bayt', v.bayt, 'sha256', v.sha256, 'raqam', v.raqam);
end $$;

-- Tashqi havola (faqat ko'rish). Sessiya yo'q: kirish faqat xesh + muddat + kompaniya sozlamasi bilan.
create or replace function public.t2_hm_havola_ol_v1(p_xesh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.t2_hm_ulashish%rowtype; f public.t2_hm_fayl%rowtype; v public.t2_hm_versiya%rowtype;
begin
  select * into u from public.t2_hm_ulashish where havola_xesh = p_xesh and bekor is null and tugaydi > now();
  if not found then return jsonb_build_object('ok', false, 'code', 'HAVOLA_YOQ'); end if;
  select * into f from public.t2_hm_fayl where id = u.nishon_id and savatda is null;
  if not found or f.kompaniya_id is null or not coalesce((select s.havola_ruxsat from public.t2_hm_sozlama s where s.kompaniya_id = f.kompaniya_id), false) then
    return jsonb_build_object('ok', false, 'code', 'HAVOLA_YOQ'); end if;
  select * into v from public.t2_hm_versiya where id = f.joriy_versiya_id and holat = 'tayyor';
  if not found then return jsonb_build_object('ok', false, 'code', 'HAVOLA_YOQ'); end if;
  perform public._t2_hm_trafik_v1(f.kompaniya_id, f.egasi_foydalanuvchi_id, 0, v.bayt);
  return jsonb_build_object('ok', true, 'kalit', v.r2_kalit, 'nom', f.nom, 'mime', v.mime, 'bayt', v.bayt, 'sha256', v.sha256);
end $$;

-- ---------------------------------------------------------------- FAYL amallari
create or replace function public.t2_hm_fayl_amal_v1(p_actor bigint, p_fayl_id bigint, p_amal text, p_papka_id bigint default null, p_nom text default null, p_raqam integer default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.t2_hm_fayl%rowtype; v_d integer; v_nom text := public._t2_hm_nom_v1(p_nom); o public.t2_fayl_papka%rowtype; v public.t2_hm_versiya%rowtype; v_qulf boolean;
begin
  select * into f from public.t2_hm_fayl where id = p_fayl_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
  v_d := public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id);
  if v_d < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  v_qulf := f.qulf_kim is not null and f.qulf_tugaydi > now() and f.qulf_kim <> p_actor;

  if p_amal = 'qulf_och' then
    if f.qulf_kim is null then return jsonb_build_object('ok', true); end if;
    if f.qulf_kim <> p_actor and v_d < 4 then return jsonb_build_object('ok', false, 'code', 'QULFLANGAN', 'qulf_kim', f.qulf_kim); end if;
    update public.t2_hm_fayl set qulf_kim = null, qulf_vaqt = null, qulf_tugaydi = null, yangilandi = now() where id = f.id;
    perform public._t2_hm_log_v1(f.kompaniya_id, f.egasi_foydalanuvchi_id, f.id, p_actor, 'qulf_ochildi', f.nom);
    return jsonb_build_object('ok', true);
  end if;
  if v_qulf then return jsonb_build_object('ok', false, 'code', 'QULFLANGAN', 'qulf_kim', f.qulf_kim); end if;

  if p_amal = 'qulf' then
    if f.savatda is not null then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
    update public.t2_hm_fayl set qulf_kim = p_actor, qulf_vaqt = now(), qulf_tugaydi = now() + interval '7 days', yangilandi = now() where id = f.id;
    perform public._t2_hm_log_v1(f.kompaniya_id, f.egasi_foydalanuvchi_id, f.id, p_actor, 'qulflandi', f.nom);
  elsif p_amal = 'nomla' then
    if v_nom is null then return jsonb_build_object('ok', false, 'code', 'NOM_NOTOGRI'); end if;
    begin update public.t2_hm_fayl set nom = v_nom, yangilandi = now() where id = f.id;
    exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'NOM_BAND'); end;
    perform public._t2_hm_log_v1(f.kompaniya_id, f.egasi_foydalanuvchi_id, f.id, p_actor, 'nomlandi', f.nom || ' -> ' || v_nom);
  elsif p_amal = 'kochir' then
    if p_papka_id is not null then
      select * into o from public.t2_fayl_papka where id = p_papka_id;
      if not found or o.kompaniya_id is distinct from f.kompaniya_id or o.egasi_foydalanuvchi_id is distinct from f.egasi_foydalanuvchi_id then
        return jsonb_build_object('ok', false, 'code', 'PAPKA_TOPILMADI'); end if;
      if public._t2_hm_daraja_v1(p_actor, o.kompaniya_id, o.egasi_foydalanuvchi_id, o.id, null) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
    end if;
    begin update public.t2_hm_fayl set papka_id = p_papka_id, yangilandi = now() where id = f.id;
    exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'NOM_BAND'); end;
    perform public._t2_hm_log_v1(f.kompaniya_id, f.egasi_foydalanuvchi_id, f.id, p_actor, 'kochirildi', f.nom);
  elsif p_amal = 'savat' then
    update public.t2_hm_fayl set savatda = now(), yangilandi = now() where id = f.id;
    perform public._t2_hm_log_v1(f.kompaniya_id, f.egasi_foydalanuvchi_id, f.id, p_actor, 'savatga', f.nom);
  elsif p_amal = 'tikla' then
    begin update public.t2_hm_fayl set savatda = null, yangilandi = now() where id = f.id;
    exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'NOM_BAND'); end;
    perform public._t2_hm_log_v1(f.kompaniya_id, f.egasi_foydalanuvchi_id, f.id, p_actor, 'tiklandi', f.nom);
  elsif p_amal = 'versiya_qaytar' then
    select * into v from public.t2_hm_versiya where fayl_id = f.id and raqam = p_raqam and holat = 'tayyor';
    if not found then return jsonb_build_object('ok', false, 'code', 'VERSIYA_TOPILMADI'); end if;
    update public.t2_hm_fayl set joriy_versiya_id = v.id, mime = v.mime, yangilandi = now() where id = f.id;
    perform public._t2_hm_log_v1(f.kompaniya_id, f.egasi_foydalanuvchi_id, f.id, p_actor, 'versiya_qaytarildi', f.nom || ' v' || v.raqam);
  else return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.t2_hm_versiyalar_v1(p_actor bigint, p_fayl_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f public.t2_hm_fayl%rowtype;
begin
  select * into f from public.t2_hm_fayl where id = p_fayl_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
  if public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  return jsonb_build_object('ok', true, 'joriy_id', f.joriy_versiya_id, 'versiyalar', coalesce((
    select jsonb_agg(jsonb_build_object('raqam', v.raqam, 'bayt', v.bayt, 'mime', v.mime, 'yaratildi', v.yaratildi, 'kim', u.ism, 'joriy', v.id = f.joriy_versiya_id) order by v.raqam desc)
      from public.t2_hm_versiya v left join public.t2_foydalanuvchi u on u.id = v.yukladi_id where v.fayl_id = f.id and v.holat = 'tayyor'), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- IZOH + @eslatma
create or replace function public.t2_hm_izoh_v1(p_actor bigint, p_fayl_id bigint, p_matn text default null, p_eslatilgan bigint[] default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.t2_hm_fayl%rowtype; v_d integer; v_es bigint[]; v_matn text := nullif(btrim(coalesce(p_matn, '')), '');
begin
  select * into f from public.t2_hm_fayl where id = p_fayl_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
  v_d := public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id);
  if v_d < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if v_matn is not null then
    if v_d < 2 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
    if length(v_matn) > 2000 then return jsonb_build_object('ok', false, 'code', 'MATN_UZUN'); end if;
    -- faqat faylga kira oladigan odamlar eslatiladi
    select coalesce(array_agg(distinct u), '{}') into v_es from unnest(coalesce(p_eslatilgan, '{}')) u
     where u <> p_actor and public._t2_hm_daraja_v1(u, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id) >= 1;
    insert into public.t2_hm_izoh(fayl_id, muallif_id, matn, eslatilgan) values (f.id, p_actor, v_matn, v_es);
    perform public._t2_hm_log_v1(f.kompaniya_id, f.egasi_foydalanuvchi_id, f.id, p_actor, 'izoh', left(v_matn, 120));
    perform public._t2_hm_bildir_v1(f.kompaniya_id, 'fayl.eslatma', f.id, v_es, p_actor, jsonb_build_object('fayl_id', f.id, 'nom', left(f.nom, 120), 'matn', left(v_matn, 200)));
  end if;
  return jsonb_build_object('ok', true, 'izohlar', coalesce((
    select jsonb_agg(jsonb_build_object('id', z.id, 'muallif_id', z.muallif_id, 'ism', u.ism, 'matn', z.matn, 'eslatilgan', z.eslatilgan, 'yaratildi', z.yaratildi) order by z.id)
      from public.t2_hm_izoh z left join public.t2_foydalanuvchi u on u.id = z.muallif_id where z.fayl_id = f.id), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- ULASHISH
create or replace function public.t2_hm_ulash_v1(p_actor bigint, p_amal text, p_nishon_turi text default null, p_nishon_id bigint default null,
  p_subyekt_turi text default null, p_subyekt_id bigint default null, p_rol text default null, p_daraja text default 'korish',
  p_havola_xesh text default null, p_muddat_soat integer default null, p_ulash_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_k bigint; v_e bigint; v_papka bigint; v_fayl bigint; v_nom text; v_d integer; v_id bigint; u public.t2_hm_ulashish%rowtype;
  v_daraja text := p_daraja; v_tugaydi timestamptz;
begin
  if p_amal = 'bekor' then
    select * into u from public.t2_hm_ulashish where id = p_ulash_id and bekor is null;
    if not found then return jsonb_build_object('ok', true); end if;
    p_nishon_turi := u.nishon_turi; p_nishon_id := u.nishon_id;
  end if;
  if p_nishon_turi = 'fayl' then
    select f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id, f.nom into v_k, v_e, v_papka, v_fayl, v_nom from public.t2_hm_fayl f where f.id = p_nishon_id;
  elsif p_nishon_turi = 'papka' then
    select p.kompaniya_id, p.egasi_foydalanuvchi_id, p.id, p.nom into v_k, v_e, v_papka, v_nom from public.t2_fayl_papka p where p.id = p_nishon_id;
  else return jsonb_build_object('ok', false, 'code', 'NISHON_NOTOGRI'); end if;
  if v_nom is null then return jsonb_build_object('ok', false, 'code', 'NISHON_TOPILMADI'); end if;
  v_d := public._t2_hm_daraja_v1(p_actor, v_k, v_e, v_papka, v_fayl);
  if v_d < 4 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;

  if p_amal = 'bekor' then
    update public.t2_hm_ulashish set bekor = now() where id = u.id;
    perform public._t2_hm_log_v1(v_k, v_e, v_fayl, p_actor, 'ulashish_bekor', v_nom);
    return jsonb_build_object('ok', true);
  end if;
  if p_amal <> 'bering' then return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM'); end if;
  if v_daraja not in ('korish', 'izoh', 'tahrir') then return jsonb_build_object('ok', false, 'code', 'DARAJA_NOTOGRI'); end if;

  if p_subyekt_turi = 'foydalanuvchi' then
    if p_subyekt_id is null or p_subyekt_id = p_actor or not exists (select 1 from public.t2_foydalanuvchi where id = p_subyekt_id and holat = 'faol') then
      return jsonb_build_object('ok', false, 'code', 'SUBYEKT_NOTOGRI'); end if;
  elsif p_subyekt_turi = 'rol' then
    if v_k is null or p_subyekt_id is distinct from v_k or nullif(btrim(coalesce(p_rol, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'SUBYEKT_NOTOGRI'); end if;
  elsif p_subyekt_turi = 'kompaniya' then
    v_daraja := 'korish'; -- tomonlararo: faqat ko'rish; yozuvchi umumiy papka yo'q (taqdim modeli)
    if p_subyekt_id is null or p_subyekt_id is not distinct from v_k then return jsonb_build_object('ok', false, 'code', 'SUBYEKT_NOTOGRI'); end if;
    if v_k is not null then
      if not exists (select 1 from public.t2_tomon_aloqa a where a.holat = 'faol'
           and ((a.taklif_kompaniya_id = v_k and a.qabul_kompaniya_id = p_subyekt_id) or (a.taklif_kompaniya_id = p_subyekt_id and a.qabul_kompaniya_id = v_k))) then
        return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ'); end if;
    elsif not exists (select 1 from public.t2_azolik a where a.kompaniya_id = p_subyekt_id and a.foydalanuvchi_id = p_actor and a.holat = 'faol') then
      return jsonb_build_object('ok', false, 'code', 'SUBYEKT_NOTOGRI'); end if;
  elsif p_subyekt_turi = 'havola' then
    v_daraja := 'korish';
    if p_nishon_turi <> 'fayl' or v_k is null or p_havola_xesh is null or p_havola_xesh !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'code', 'SUBYEKT_NOTOGRI'); end if;
    if not coalesce((select s.havola_ruxsat from public.t2_hm_sozlama s where s.kompaniya_id = v_k), false) then return jsonb_build_object('ok', false, 'code', 'HAVOLA_YOQILMAGAN'); end if;
    v_tugaydi := now() + make_interval(hours => least(greatest(coalesce(p_muddat_soat, 168), 1), 720));
  else return jsonb_build_object('ok', false, 'code', 'SUBYEKT_NOTOGRI'); end if;

  insert into public.t2_hm_ulashish(nishon_turi, nishon_id, subyekt_turi, subyekt_id, rol, daraja, havola_xesh, tugaydi, bergan_id)
  values (p_nishon_turi, p_nishon_id, p_subyekt_turi, case when p_subyekt_turi = 'havola' then null else p_subyekt_id end, case when p_subyekt_turi = 'rol' then btrim(p_rol) end,
          v_daraja, case when p_subyekt_turi = 'havola' then p_havola_xesh end, v_tugaydi, p_actor) returning id into v_id;
  perform public._t2_hm_log_v1(v_k, v_e, v_fayl, p_actor, 'ulashildi', v_nom || ' (' || p_subyekt_turi || ', ' || v_daraja || ')');
  if p_subyekt_turi = 'foydalanuvchi' then
    perform public._t2_hm_bildir_v1(v_k, 'fayl.ulashildi', coalesce(v_fayl, 0), array[p_subyekt_id], p_actor, jsonb_build_object('nishon_turi', p_nishon_turi, 'nishon_id', p_nishon_id, 'nom', left(v_nom, 120), 'daraja', v_daraja));
  end if;
  return jsonb_build_object('ok', true, 'ulash_id', v_id, 'tugaydi', v_tugaydi);
end $$;

create or replace function public.t2_hm_ulashish_royxat_v1(p_actor bigint, p_nishon_turi text, p_nishon_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint; v_e bigint; v_papka bigint; v_fayl bigint;
begin
  if p_nishon_turi = 'fayl' then
    select f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id into v_k, v_e, v_papka, v_fayl from public.t2_hm_fayl f where f.id = p_nishon_id;
  else select p.kompaniya_id, p.egasi_foydalanuvchi_id, p.id into v_k, v_e, v_papka from public.t2_fayl_papka p where p.id = p_nishon_id; end if;
  if v_k is null and v_e is null then return jsonb_build_object('ok', false, 'code', 'NISHON_TOPILMADI'); end if;
  if public._t2_hm_daraja_v1(p_actor, v_k, v_e, v_papka, v_fayl) < 4 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  return jsonb_build_object('ok', true, 'havola_ruxsat', coalesce((select s.havola_ruxsat from public.t2_hm_sozlama s where s.kompaniya_id = v_k), false),
    'royxat', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'subyekt_turi', u.subyekt_turi, 'subyekt_id', u.subyekt_id, 'rol', u.rol, 'daraja', u.daraja, 'tugaydi', u.tugaydi,
        'nom', case u.subyekt_turi when 'foydalanuvchi' then (select x.ism from public.t2_foydalanuvchi x where x.id = u.subyekt_id)
                                   when 'kompaniya' then (select k.nom from public.t2_kompaniya k where k.id = u.subyekt_id) end) order by u.id desc)
      from public.t2_hm_ulashish u where u.nishon_turi = p_nishon_turi and u.nishon_id = p_nishon_id and u.bekor is null and (u.tugaydi is null or u.tugaydi > now())), '[]'::jsonb));
end $$;

create or replace function public.t2_hm_sozlama_v1(p_actor bigint, p_kompaniya bigint, p_havola_ruxsat boolean default null, p_ortiqcha boolean default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if p_ortiqcha is not null then
    if public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 4 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
    insert into public.t2_hm_sozlama(kompaniya_id, ortiqcha) values (p_kompaniya, p_ortiqcha)
    on conflict (kompaniya_id) do update set ortiqcha = excluded.ortiqcha, yangilandi = now();
    perform public._t2_hm_log_v1(p_kompaniya, null, null, p_actor, 'sozlama', 'ortiqcha=' || p_ortiqcha);
  end if;
  if p_havola_ruxsat is not null then
    if public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 4 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
    insert into public.t2_hm_sozlama(kompaniya_id, havola_ruxsat) values (p_kompaniya, p_havola_ruxsat)
    on conflict (kompaniya_id) do update set havola_ruxsat = excluded.havola_ruxsat, yangilandi = now();
    if not p_havola_ruxsat then
      update public.t2_hm_ulashish u set bekor = now() where u.subyekt_turi = 'havola' and u.bekor is null
        and u.nishon_id in (select f.id from public.t2_hm_fayl f where f.kompaniya_id = p_kompaniya);
    end if;
    perform public._t2_hm_log_v1(p_kompaniya, null, null, p_actor, 'sozlama', 'havola_ruxsat=' || p_havola_ruxsat);
  end if;
  return jsonb_build_object('ok', true, 'havola_ruxsat', coalesce((select s.havola_ruxsat from public.t2_hm_sozlama s where s.kompaniya_id = p_kompaniya), false),
    'ortiqcha', coalesce((select s.ortiqcha from public.t2_hm_sozlama s where s.kompaniya_id = p_kompaniya), false));
end $$;

-- Ulashish/eslatma uchun odamlar: kompaniya a'zolari yoki aniq login/username.
create or replace function public.t2_hm_odamlar_v1(p_actor bigint, p_kompaniya bigint default null, p_q text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := lower(btrim(coalesce(p_q, '')));
begin
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  if p_kompaniya is not null and public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  return jsonb_build_object('ok', true, 'royxat', coalesce((
    select jsonb_agg(jsonb_build_object('id', u.id, 'ism', coalesce(u.ism, u.login), 'rol', a.rol) order by coalesce(u.ism, u.login))
      from public.t2_foydalanuvchi u
      left join public.t2_azolik a on a.foydalanuvchi_id = u.id and a.kompaniya_id = p_kompaniya and a.holat = 'faol'
     where u.holat = 'faol' and u.id <> p_actor
       and ((p_kompaniya is not null and a.id is not null and (v_q = '' or lower(coalesce(u.ism, '') || ' ' || u.login) like '%' || replace(replace(v_q, '%', ''), '_', '') || '%'))
         or (v_q <> '' and (lower(u.login) = v_q or lower(coalesce(u.username, '')) = v_q)))
     limit 30), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- QIDIRUV, FAOLIYAT, TIZIM HUJJATLARI
create or replace function public.t2_hm_qidir_v1(p_actor bigint, p_kompaniya bigint default null, p_q text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', ''), '%', ''), '_', '');
begin
  if length(v_q) < 2 then return jsonb_build_object('ok', true, 'royxat', '[]'::jsonb); end if;
  if p_kompaniya is not null and public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  return jsonb_build_object('ok', true, 'royxat', coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'nom', f.nom, 'mime', f.mime, 'yangilandi', f.yangilandi, 'papka_id', f.papka_id) order by f.yangilandi desc)
      from (select * from public.t2_hm_fayl x
             where x.savatda is null and lower(x.nom) like '%' || v_q || '%'
               and ((p_kompaniya is not null and x.kompaniya_id = p_kompaniya) or (p_kompaniya is null and x.egasi_foydalanuvchi_id = p_actor))
             order by x.yangilandi desc limit 50) f), '[]'::jsonb));
end $$;

create or replace function public.t2_hm_faoliyat_v1(p_actor bigint, p_kompaniya bigint default null, p_fayl_id bigint default null, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f public.t2_hm_fayl%rowtype;
begin
  if p_fayl_id is not null then
    select * into f from public.t2_hm_fayl where id = p_fayl_id;
    if not found or public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  elsif p_kompaniya is not null and public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ');
  elsif not exists (select 1 from public.t2_foydalanuvchi where id = p_actor and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  return jsonb_build_object('ok', true, 'royxat', coalesce((
    select jsonb_agg(jsonb_build_object('id', z.id, 'amal', z.amal, 'tafsilot', z.tafsilot, 'vaqt', z.vaqt, 'fayl_id', z.fayl_id, 'ism', u.ism) order by z.id desc)
      from (select * from public.t2_hm_faoliyat h
             where (p_fayl_id is not null and h.fayl_id = p_fayl_id)
                or (p_fayl_id is null and p_kompaniya is not null and h.kompaniya_id = p_kompaniya)
                or (p_fayl_id is null and p_kompaniya is null and h.egasi_foydalanuvchi_id = p_actor)
             order by h.id desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) z
      left join public.t2_foydalanuvchi u on u.id = z.actor_id), '[]'::jsonb));
end $$;

-- "Tizim hujjatlari": t2_document_registry dan FAQAT O'QISH (F-2, AOSR, smeta eksporti...). Yuklab olish - mavjud /api/hujjat-ol.
create or replace function public.t2_hm_tizim_hujjat_v1(p_actor bigint, p_kompaniya bigint, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  return jsonb_build_object('ok', true, 'royxat', coalesce((
    select jsonb_agg(jsonb_build_object('document_id', s.id, 'nom', s.original_filename, 'tur', s.document_type, 'versiya', s.revision_seq,
        'mime', s.mime_type, 'bayt', s.size_bytes, 'sana', s.sana, 'obyekt_id', s.obyekt_id, 'oxirgi', s.rn = 1) order by s.sana desc)
      from (select d.id, d.original_filename, d.document_type, d.revision_seq, d.mime_type, d.size_bytes, d.obyekt_id,
                   coalesce(d.finalized_at, d.created_at) sana,
                   row_number() over (partition by d.obyekt_id, d.document_type, d.source_slot_key order by d.revision_seq desc nulls last, d.id desc) rn
              from public.t2_document_registry d
             where d.kompaniya_id = p_kompaniya and d.canonical_storage_status = 'stored'
             order by coalesce(d.finalized_at, d.created_at) desc limit least(greatest(coalesce(p_limit, 200), 1), 500)) s), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- TOZALASH (savat 30 kun, eskirgan kutish)
-- 1-qadam: nomzodlarni qaytaradi (R2 kalitlari). API R2 dan o'chiradi, keyin tasdiq chaqiradi. p_actor bilan - bitta faylni
-- abadiy o'chirish (faqat savatdagi, egasi darajasi); p_actor null - cron (service_role).
create or replace function public.t2_hm_tozala_ol_v1(p_actor bigint default null, p_fayl_id bigint default null, p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.t2_hm_fayl%rowtype; v_f jsonb; v_v jsonb;
begin
  if p_fayl_id is not null then
    select * into f from public.t2_hm_fayl where id = p_fayl_id and savatda is not null;
    if not found then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
    if p_actor is not null and public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
    if p_actor is null then return jsonb_build_object('ok', false, 'code', 'ACTOR_KERAK'); end if;
    select jsonb_build_array(jsonb_build_object('id', f.id, 'kalitlar', coalesce((select jsonb_agg(v.r2_kalit) from public.t2_hm_versiya v where v.fayl_id = f.id), '[]'::jsonb))) into v_f;
    return jsonb_build_object('ok', true, 'fayllar', v_f, 'versiyalar', '[]'::jsonb);
  end if;
  if p_actor is not null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kalitlar', (select coalesce(jsonb_agg(v.r2_kalit), '[]'::jsonb) from public.t2_hm_versiya v where v.fayl_id = x.id))), '[]'::jsonb) into v_f
    from (select id from public.t2_hm_fayl where savatda < now() - interval '30 days' order by savatda limit least(greatest(coalesce(p_limit, 100), 1), 500)) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'kalit', v.r2_kalit)), '[]'::jsonb) into v_v
    from public.t2_hm_versiya v where v.holat = 'kutish' and v.yaratildi < now() - interval '1 day';
  return jsonb_build_object('ok', true, 'fayllar', v_f, 'versiyalar', v_v);
end $$;

create or replace function public.t2_hm_tozala_tasdiq_v1(p_fayl_idlar bigint[] default '{}', p_versiya_idlar bigint[] default '{}', p_eski_idlar bigint[] default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_f integer; v_v integer; v_e integer;
begin
  -- eski versiyalar: joriy versiya HECH QACHON o'chirilmaydi
  delete from public.t2_hm_versiya v where v.id = any (coalesce(p_eski_idlar, '{}')) and v.holat = 'tayyor'
     and not exists (select 1 from public.t2_hm_fayl f where f.joriy_versiya_id = v.id);
  get diagnostics v_e = row_count;
  delete from public.t2_hm_ulashish where nishon_turi = 'fayl' and nishon_id = any (coalesce(p_fayl_idlar, '{}'));
  delete from public.t2_hm_fayl where id = any (coalesce(p_fayl_idlar, '{}')) and savatda is not null;
  get diagnostics v_f = row_count;
  delete from public.t2_hm_versiya where id = any (coalesce(p_versiya_idlar, '{}')) and holat = 'kutish';
  get diagnostics v_v = row_count;
  delete from public.t2_hm_fayl f where f.joriy_versiya_id is null and f.yaratildi < now() - interval '1 day' and not exists (select 1 from public.t2_hm_versiya x where x.fayl_id = f.id);
  return jsonb_build_object('ok', true, 'fayllar', v_f, 'versiyalar', v_v, 'eski', v_e);
end $$;

-- ---------------------------------------------------------------- TRAFIK, ADMIN, REJA, KUNLIK HISOB
create or replace function public._t2_hm_trafik_v1(p_kompaniya bigint, p_egasi bigint, p_kirish bigint, p_chiqish bigint)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.t2_hm_trafik(kalit, kirish, chiqish)
  values (case when p_kompaniya is not null then 'k' || p_kompaniya else 'u' || p_egasi end || ':' || to_char(now(), 'YYYY-MM'), greatest(p_kirish, 0), greatest(p_chiqish, 0))
  on conflict (kalit) do update set kirish = t2_hm_trafik.kirish + excluded.kirish, chiqish = t2_hm_trafik.chiqish + excluded.chiqish $$;

-- Admin ko'rinishi (egasi/boshqaruv darajasi): ishlatilgan/limit, versiya va savat hajmi, eng katta papkalar, trafik, hisob jurnali.
create or replace function public.t2_hm_admin_v1(p_actor bigint, p_kompaniya bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_e bigint := case when p_kompaniya is null then p_actor end; v_key text;
begin
  if public._t2_hm_daraja_v1(p_actor, p_kompaniya, v_e, null, null) < 4 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  v_key := case when p_kompaniya is not null then 'k' || p_kompaniya else 'u' || p_actor end || ':' || to_char(now(), 'YYYY-MM');
  return jsonb_build_object('ok', true, 'kvota', public._t2_hm_kvota_v1(p_kompaniya, v_e),
    'savat_bayt', coalesce((select sum(v.bayt) from public.t2_hm_versiya v join public.t2_hm_fayl f on f.id = v.fayl_id
        where f.savatda is not null and ((p_kompaniya is not null and f.kompaniya_id = p_kompaniya) or (p_kompaniya is null and f.egasi_foydalanuvchi_id = p_actor))), 0),
    'eski_versiya_bayt', coalesce((select sum(v.bayt) from public.t2_hm_versiya v join public.t2_hm_fayl f on f.id = v.fayl_id
        where f.savatda is null and v.holat = 'tayyor' and v.id is distinct from f.joriy_versiya_id
          and ((p_kompaniya is not null and f.kompaniya_id = p_kompaniya) or (p_kompaniya is null and f.egasi_foydalanuvchi_id = p_actor))), 0),
    'top_papkalar', coalesce((select jsonb_agg(jsonb_build_object('papka_id', x.papka_id, 'nom', coalesce(p.nom, '(ildiz)'), 'bayt', x.b) order by x.b desc) from (
        select f.papka_id, sum(v.bayt) b from public.t2_hm_versiya v join public.t2_hm_fayl f on f.id = v.fayl_id
         where (p_kompaniya is not null and f.kompaniya_id = p_kompaniya) or (p_kompaniya is null and f.egasi_foydalanuvchi_id = p_actor)
         group by f.papka_id order by sum(v.bayt) desc limit 10) x left join public.t2_fayl_papka p on p.id = x.papka_id), '[]'::jsonb),
    'trafik', jsonb_build_object('chiqish', coalesce((select chiqish from public.t2_hm_trafik where kalit = v_key), 0), 'kirish', coalesce((select kirish from public.t2_hm_trafik where kalit = v_key), 0),
        'bepul', (select trafik_bepul_oylik_bayt from public.t2_token_sozlama where id = 1)),
    'reja', (select jsonb_build_object('kod', r.tarif_kod, 'nom', t.nom, 'tugaydi', r.tugaydi) from public.t2_hm_reja r join public.t2_tarif t on t.kod = r.tarif_kod
              where r.kompaniya_id = p_kompaniya and r.holat = 'faol' and r.tugaydi >= current_date order by t.disk_bayt desc limit 1),
    'hisob', coalesce((select jsonb_agg(to_jsonb(h) - 'kompaniya_id' order by h.sana desc) from (select * from public.t2_hm_hisob where kompaniya_id = p_kompaniya and tur in ('xotira', 'trafik') order by sana desc limit 30) h), '[]'::jsonb));
end $$;

-- Joy bo'shatish: nomzod fayl/versiyalar R2 kalitlari bilan (API R2 dan o'chiradi, so'ng t2_hm_tozala_tasdiq_v1).
create or replace function public.t2_hm_bosh_ol_v1(p_actor bigint, p_kompaniya bigint, p_amal text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_e bigint := case when p_kompaniya is null then p_actor end;
begin
  if public._t2_hm_daraja_v1(p_actor, p_kompaniya, v_e, null, null) < 4 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if p_amal = 'savat' then
    return jsonb_build_object('ok', true, 'fayllar', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kalitlar', (select coalesce(jsonb_agg(v.r2_kalit), '[]'::jsonb) from public.t2_hm_versiya v where v.fayl_id = f.id)))
        from public.t2_hm_fayl f where f.savatda is not null and f.kompaniya_id is not distinct from p_kompaniya and f.egasi_foydalanuvchi_id is not distinct from v_e), '[]'::jsonb),
      'eski', '[]'::jsonb);
  elsif p_amal = 'eski_versiyalar' then
    return jsonb_build_object('ok', true, 'fayllar', '[]'::jsonb, 'eski', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'kalit', v.r2_kalit))
        from public.t2_hm_versiya v join public.t2_hm_fayl f on f.id = v.fayl_id
       where f.kompaniya_id is not distinct from p_kompaniya and f.egasi_foydalanuvchi_id is not distinct from v_e and f.savatda is null
         and v.holat = 'tayyor' and v.id is distinct from f.joriy_versiya_id), '[]'::jsonb));
  end if;
  return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM');
end $$;

-- Disk rejasini token bilan sotib olish (kompaniya boshqaruvchisi). Narx = t2_tarif.narx_som / t2_token_sozlama.token_som (tokenga yaxlitlanadi).
create or replace function public.t2_hm_reja_ol_v1(p_actor bigint, p_kompaniya bigint, p_tarif_kod text, p_oylar integer, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.t2_tarif%rowtype; v_tok numeric; v_bal numeric; v_tug date;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 4 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if exists (select 1 from public.t2_token_harakat where operation_id = p_operation_id) then return jsonb_build_object('ok', true, 'takror', true); end if;
  select * into t from public.t2_tarif where kod = p_tarif_kod and faol and tur = 'disk';
  if not found then return jsonb_build_object('ok', false, 'code', 'TARIF_YOQ'); end if;
  if p_oylar is null or p_oylar < 1 or p_oylar > 12 then return jsonb_build_object('ok', false, 'code', 'OYLAR_1_12'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_token:' || p_kompaniya, 0));
  v_tok := ceil(t.narx_som * p_oylar / (select token_som from public.t2_token_sozlama where id = 1));
  v_bal := public.t2_token_balans(p_kompaniya);
  if v_tok > 0 and v_bal < v_tok then return jsonb_build_object('ok', false, 'code', 'TOKEN_YETMAYDI', 'kerak', v_tok, 'balans', v_bal); end if;
  if v_tok > 0 then
    insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, birlik_soni, meta, operation_id)
    values (p_kompaniya, p_actor, -v_tok, 'sarf', 'disk_reja', p_oylar, jsonb_build_object('tarif', p_tarif_kod), p_operation_id);
  end if;
  update public.t2_hm_reja set holat = 'tugagan' where kompaniya_id = p_kompaniya and holat = 'faol';
  v_tug := (current_date + make_interval(months => p_oylar))::date;
  insert into public.t2_hm_reja(kompaniya_id, tarif_kod, tugaydi, kim) values (p_kompaniya, p_tarif_kod, v_tug, 'actor:' || p_actor);
  perform public._t2_hm_log_v1(p_kompaniya, null, null, p_actor, 'reja', p_tarif_kod || ' x' || p_oylar);
  return jsonb_build_object('ok', true, 'token', v_tok, 'tugaydi', v_tug, 'balans', v_bal - v_tok);
end $$;

-- Kunlik hisob (cron, service_role). Idempotent: (kompaniya, sana, tur) bitta yozuv + deterministik operation_id.
--  * ortiqcha xotira (limitdan oshgan MB) -> t2_token_hisobla_v2('hujjat_xotira') bo'yicha token; balans yetmasa 'yetmadi' (fayllar saqlanadi, o'chirilmaydi)
--  * ortiqcha trafik (oylik bepul chegaradan oshgan, hali to'lanmagan MB) -> 'hujjat_trafik'
--  * 80% / 95% ogohlantirish (oyiga bir marta, t2_outbox orqali kompaniya boshqaruvchilariga)
create or replace function public.t2_hm_hisobla_v1(p_sana date default current_date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare k record; v_used bigint; v_lim bigint; v_over bigint; v_h jsonb; v_tok numeric; v_op uuid; v_bal numeric; v_kalit text; v_tr public.t2_hm_trafik%rowtype;
  v_bepul bigint; v_ort_mb bigint; v_delta bigint; v_n integer := 0; v_ogoh integer := 0; v_foiz numeric; v_oy date := date_trunc('month', p_sana)::date; v_ins integer;
begin
  select trafik_bepul_oylik_bayt into v_bepul from public.t2_token_sozlama where id = 1;
  for k in select distinct f.kompaniya_id from public.t2_hm_fayl f where f.kompaniya_id is not null loop
    v_used := (public._t2_hm_kvota_v1(k.kompaniya_id, null)->>'ishlatilgan')::bigint;
    v_lim := public._t2_hm_limit_v1(k.kompaniya_id);
    v_over := greatest(v_used - v_lim, 0);
    v_foiz := case when v_lim > 0 then v_used * 100.0 / v_lim else 0 end;
    -- ogohlantirishlar
    foreach v_tok in array array[95, 80] loop
      if v_foiz >= v_tok then
        insert into public.t2_hm_hisob(kompaniya_id, sana, tur, bayt, holat) values (k.kompaniya_id, v_oy, 'ogoh' || v_tok::integer, v_used, 'ogoh') on conflict do nothing;
        get diagnostics v_ins = row_count;
        if v_ins > 0 then
          insert into public.t2_outbox(kompaniya_id, mavzu, entity_jadval, entity_id, qabul_kompaniya_idlar, payload, operation_id)
          values (k.kompaniya_id, 'fayl.kvota', 't2_kompaniya', k.kompaniya_id, array[k.kompaniya_id], jsonb_build_object('foiz', round(v_foiz, 1), 'chegara', v_tok::integer), md5('hm_ogoh:' || k.kompaniya_id || ':' || v_oy || ':' || v_tok)::uuid) on conflict do nothing;
          v_ogoh := v_ogoh + 1;
        end if;
        exit; -- faqat eng yuqori daraja
      end if;
    end loop;
    -- xotira
    if v_over > 0 then
      v_h := public.t2_token_hisobla_v2('hujjat_xotira', ceil(v_over / 1048576.0));
      v_tok := coalesce((v_h->>'token')::numeric, 0);
      v_op := md5('hm_xotira:' || k.kompaniya_id || ':' || p_sana)::uuid;
      perform pg_advisory_xact_lock(hashtextextended('t2_token:' || k.kompaniya_id, 0));
      v_bal := public.t2_token_balans(k.kompaniya_id);
      if v_tok <= 0 then
        insert into public.t2_hm_hisob(kompaniya_id, sana, tur, bayt, token, holat) values (k.kompaniya_id, p_sana, 'xotira', v_over, 0, 'bepul') on conflict do nothing;
      elsif v_bal < v_tok then
        insert into public.t2_hm_hisob(kompaniya_id, sana, tur, bayt, token, holat) values (k.kompaniya_id, p_sana, 'xotira', v_over, v_tok, 'yetmadi') on conflict do nothing;
      else
        insert into public.t2_hm_hisob(kompaniya_id, sana, tur, bayt, token, holat) values (k.kompaniya_id, p_sana, 'xotira', v_over, v_tok, 'olindi') on conflict do nothing;
        get diagnostics v_ins = row_count;
        if v_ins > 0 then
          insert into public.t2_token_harakat(kompaniya_id, miqdor, tur, amal, birlik_soni, meta, operation_id)
          values (k.kompaniya_id, -v_tok, 'sarf', 'hujjat_xotira', ceil(v_over / 1048576.0), jsonb_build_object('sana', p_sana, 'bayt', v_over, 'hisob', v_h), v_op) on conflict do nothing;
          v_n := v_n + 1;
        end if;
      end if;
    end if;
    -- trafik (oylik bepul chegaradan oshgan, hali to'lanmagan qism)
    v_kalit := 'k' || k.kompaniya_id || ':' || to_char(p_sana, 'YYYY-MM');
    select * into v_tr from public.t2_hm_trafik where kalit = v_kalit;
    if found and v_tr.chiqish > v_bepul then
      v_ort_mb := ceil((v_tr.chiqish - v_bepul) / 1048576.0);
      v_delta := v_ort_mb - v_tr.haq_olingan_mb;
      if v_delta > 0 and not exists (select 1 from public.t2_hm_hisob where kompaniya_id = k.kompaniya_id and sana = p_sana and tur = 'trafik') then
        v_h := public.t2_token_hisobla_v2('hujjat_trafik', v_delta);
        v_tok := coalesce((v_h->>'token')::numeric, 0);
        perform pg_advisory_xact_lock(hashtextextended('t2_token:' || k.kompaniya_id, 0));
        v_bal := public.t2_token_balans(k.kompaniya_id);
        if v_tok <= 0 then
          insert into public.t2_hm_hisob(kompaniya_id, sana, tur, bayt, token, holat) values (k.kompaniya_id, p_sana, 'trafik', v_delta * 1048576, 0, 'bepul') on conflict do nothing;
          update public.t2_hm_trafik set haq_olingan_mb = v_ort_mb where kalit = v_kalit;
        elsif v_bal < v_tok then
          insert into public.t2_hm_hisob(kompaniya_id, sana, tur, bayt, token, holat) values (k.kompaniya_id, p_sana, 'trafik', v_delta * 1048576, v_tok, 'yetmadi') on conflict do nothing;
        else
          insert into public.t2_hm_hisob(kompaniya_id, sana, tur, bayt, token, holat) values (k.kompaniya_id, p_sana, 'trafik', v_delta * 1048576, v_tok, 'olindi') on conflict do nothing;
          insert into public.t2_token_harakat(kompaniya_id, miqdor, tur, amal, birlik_soni, meta, operation_id)
          values (k.kompaniya_id, -v_tok, 'sarf', 'hujjat_trafik', v_delta, jsonb_build_object('sana', p_sana, 'davr', to_char(p_sana, 'YYYY-MM'), 'hisob', v_h), md5('hm_trafik:' || k.kompaniya_id || ':' || p_sana)::uuid) on conflict do nothing;
          update public.t2_hm_trafik set haq_olingan_mb = v_ort_mb where kalit = v_kalit;
          v_n := v_n + 1;
        end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'sana', p_sana, 'hisoblandi', v_n, 'ogohlantirish', v_ogoh);
end $$;

-- Tokenlar va obuna sahifasi uchun: disk rejalari alohida kalitda (oddiy 'tariflar' ro'yxatida disk kartalari aralashmasin) + kompaniya disk holati.
create or replace function public.t2_token_holat_v1(p_kompaniya_id bigint, p_actor_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  return jsonb_build_object(
    'balans', public.t2_token_balans(p_kompaniya_id),
    'obuna', (select jsonb_build_object('tarif', o.tarif_kod, 'nom', t.nom, 'oylik_token', t.oylik_token, 'boshlandi', o.boshlandi, 'tugaydi', o.tugaydi)
                from public.t2_obuna o join public.t2_tarif t on t.kod = o.tarif_kod
               where o.kompaniya_id = p_kompaniya_id and o.holat = 'faol' order by o.id desc limit 1),
    'tariflar', (select coalesce(jsonb_agg(jsonb_build_object('kod', kod, 'nom', nom, 'oylik_token', oylik_token, 'narx_som', narx_som) order by tartib), '[]'::jsonb) from public.t2_tarif where faol and tur = 'reja'),
    'disk_tariflar', (select coalesce(jsonb_agg(jsonb_build_object('kod', kod, 'nom', nom, 'disk_bayt', disk_bayt, 'narx_som', narx_som) order by tartib), '[]'::jsonb) from public.t2_tarif where faol and tur = 'disk'),
    'disk', (select jsonb_build_object('kvota', public._t2_hm_kvota_v1(p_kompaniya_id, null),
               'reja', (select jsonb_build_object('kod', r.tarif_kod, 'tugaydi', r.tugaydi) from public.t2_hm_reja r where r.kompaniya_id = p_kompaniya_id and r.holat = 'faol' and r.tugaydi >= current_date order by r.id desc limit 1))),
    'narxlar', (select coalesce(jsonb_agg(jsonb_build_object('amal', amal, 'nom', nom, 'tur', tur, 'narx', narx, 'birlik', birlik, 'minimum', minimum,
        'asos_som', asos_som, 'birlik_som', birlik_som, 'min_som', min_som, 'max_som', max_som, 'foyda_foiz', foyda_foiz, 'izoh', izoh, 'faol', faol) order by amal), '[]'::jsonb) from public.t2_token_narx),
    'sozlama', (select jsonb_build_object('token_som', token_som, 'foyda_foiz', foyda_foiz, 'royxat_bonus_token', royxat_bonus_token, 'usd_kurs', usd_kurs, 'tolov_rekvizit', tolov_rekvizit) from public.t2_token_sozlama where id = 1),
    'paketlar', (select coalesce(jsonb_agg(jsonb_build_object('kod', kod, 'nom', nom, 'token', token, 'narx_som', narx_som) order by tartib), '[]'::jsonb) from public.t2_token_paket where faol),
    'sorovlar', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'vaqt', yaratildi, 'paket', paket_kod, 'token', token, 'summa_som', summa_som, 'usul', usul, 'holat', holat, 'sabab', sabab) order by id desc), '[]'::jsonb)
                   from (select * from public.t2_tolov_sorov where kompaniya_id = p_kompaniya_id order by id desc limit 20) s),
    'harakatlar', (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('id', h.id, 'miqdor', h.miqdor, 'tur', h.tur, 'amal', h.amal, 'birlik_soni', h.birlik_soni, 'izoh', h.izoh, 'yaratildi', h.yaratildi,
            'meta', h.meta, 'kim', f.login, 'qaytarilgan', exists (select 1 from public.t2_token_harakat q where q.tur = 'qaytarish' and q.bogliq_operation_id = h.operation_id)) x
          from public.t2_token_harakat h left join public.t2_foydalanuvchi f on f.id = h.foydalanuvchi_id
         where h.kompaniya_id = p_kompaniya_id order by h.id desc limit 200) q),
    'superadmin', public.t2_platforma_superadmin(p_actor_id),
    'demo_obyekt_id', (select obyekt_id from public.t2_demo_manba where id = 1));
end $function$;

-- ---------------------------------------------------------------- TELEGRAM kutish
create or replace function public.t2_hm_tg_kutish_yoz_v1(p_actor bigint, p_tg_file_id text, p_nom text, p_mime text, p_bayt bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_kir bigint;
begin
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  delete from public.t2_hm_tg_kutish where yaratildi < now() - interval '1 day';
  v_kir := public._t2_hm_kiruvchi_v1(p_actor);
  insert into public.t2_hm_tg_kutish(foydalanuvchi_id, tg_file_id, nom, mime, bayt) values (p_actor, p_tg_file_id, left(coalesce(p_nom, 'fayl'), 200), left(p_mime, 120), p_bayt) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'papkalar', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'nom', t.nom) order by t.tartib) from (
      select p.id, p.nom, 0 tartib from public.t2_fayl_papka p where p.id = v_kir
      union all
      select * from (select p.id, p.nom, 1 + row_number() over (order by max(f.yangilandi) desc) from public.t2_fayl_papka p
        join public.t2_hm_fayl f on f.papka_id = p.id where p.egasi_foydalanuvchi_id = p_actor and p.id <> v_kir and f.savatda is null
        group by p.id, p.nom order by max(f.yangilandi) desc limit 2) r) t), '[]'::jsonb));
end $$;

create or replace function public.t2_hm_tg_kutish_ol_v1(p_actor bigint, p_id bigint, p_ochir boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare k public.t2_hm_tg_kutish%rowtype;
begin
  select * into k from public.t2_hm_tg_kutish where id = p_id and foydalanuvchi_id = p_actor;
  if not found then return jsonb_build_object('ok', false, 'code', 'KUTISH_YOQ'); end if;
  if p_ochir then delete from public.t2_hm_tg_kutish where id = k.id; end if;
  return jsonb_build_object('ok', true, 'tg_file_id', k.tg_file_id, 'nom', k.nom, 'mime', k.mime, 'bayt', k.bayt);
end $$;

-- Saqlash siyosati reyestri (TS: functions/_shared/arxiv-siyosat.ts bilan mos bo'lishi shart)
insert into public.t2_arxiv_siyosat (jadval, rejim, saqlash_kun, kalit, kalit_tur, vaqt, shart_ustun, shart_emas, format, tiklash, izoh) values
  ('t2_hm_versiya', 'saqlanadi', null, null, null, null, null, null, '-', '-', 'Hujjat maydoni fayl versiyalari: faqat metama''lumot (baytlar R2 da); foydalanuvchi versiyani o''chirguncha yoki fayl savatda 30 kun turgach tozalanadi - sovuq arxivga o''tkazilmaydi')
on conflict (jadval) do nothing;

-- ---------------------------------------------------------------- huquqlar
do $g$ declare s text; begin
  foreach s in array array[
    '_t2_hm_daraja_v1(bigint, bigint, bigint, bigint, bigint)', '_t2_hm_fayl_daraja_v1(bigint, bigint)', '_t2_hm_limit_v1(bigint)', '_t2_hm_kvota_v1(bigint, bigint)',
    '_t2_hm_log_v1(bigint, bigint, bigint, bigint, text, text)', '_t2_hm_bildir_v1(bigint, text, bigint, bigint[], bigint, jsonb)', '_t2_hm_nom_v1(text)', '_t2_hm_kiruvchi_v1(bigint)',
    't2_hm_royxat_v1(bigint, bigint, bigint, boolean)', 't2_hm_ulashilgan_v1(bigint)', 't2_hm_papka_amal_v1(bigint, bigint, text, bigint, text, bigint)',
    't2_hm_yuklash_reserve_v1(bigint, bigint, bigint, text, text, bigint, text, uuid, bigint)', 't2_hm_yuklash_tasdiq_v1(bigint, bigint)', 't2_hm_yuklash_bekor_v1(bigint, bigint)',
    't2_hm_yuklab_v1(bigint, bigint, integer)', 't2_hm_havola_ol_v1(text)', 't2_hm_fayl_amal_v1(bigint, bigint, text, bigint, text, integer)', 't2_hm_versiyalar_v1(bigint, bigint)',
    't2_hm_izoh_v1(bigint, bigint, text, bigint[])',
    't2_hm_ulash_v1(bigint, text, text, bigint, text, bigint, text, text, text, integer, bigint)', 't2_hm_ulashish_royxat_v1(bigint, text, bigint)', 't2_hm_sozlama_v1(bigint, bigint, boolean, boolean)',
    't2_hm_odamlar_v1(bigint, bigint, text)', 't2_hm_qidir_v1(bigint, bigint, text)', 't2_hm_faoliyat_v1(bigint, bigint, bigint, integer)', 't2_hm_tizim_hujjat_v1(bigint, bigint, integer)',
    't2_hm_tozala_ol_v1(bigint, bigint, integer)', 't2_hm_tozala_tasdiq_v1(bigint[], bigint[], bigint[])', '_t2_hm_trafik_v1(bigint, bigint, bigint, bigint)', 't2_hm_admin_v1(bigint, bigint)', 't2_hm_bosh_ol_v1(bigint, bigint, text)', 't2_hm_reja_ol_v1(bigint, bigint, text, integer, uuid)', 't2_hm_hisobla_v1(date)', 't2_token_holat_v1(bigint, bigint)', 't2_hm_tg_kutish_yoz_v1(bigint, text, text, text, bigint)', 't2_hm_tg_kutish_ol_v1(bigint, bigint, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', s);
    execute format('grant execute on function public.%s to service_role', s);
  end loop;
end $g$;
