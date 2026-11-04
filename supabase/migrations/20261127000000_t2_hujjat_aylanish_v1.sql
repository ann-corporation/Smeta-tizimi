-- HUJJAT AYLANISHI v1 (qog'ozbozlik end-to-end): tasdiq zanjiri (har qanday hujjat turi uchun), xat reestri (kiruvchi/chiquvchi, raqamli),
-- talabnoma/ogohlantirish turlari, muddat eslatmalari (t2_outbox -> t2_bildirishnoma), tomonlar kiruvchi qutisi.
-- Dizayn: docs/architecture/HUJJAT_AYLANISH_LOGISTIKA_V1.md. Fayllar FAQAT R2 (t2_document_registry.id orqali), jadvallar ingichka.
-- Faqat additiv. Rollback: *.rollback.sql. Acceptance: *.acceptance.sql (BEGIN..ROLLBACK).

-- ───────────────────────── 1. Tasdiq zanjiri ─────────────────────────
create table if not exists public.t2_hujjat_zanjir (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint references public.t2_obyekt(id),
  hujjat_turi text not null check (hujjat_turi ~ '^[a-z][a-z0-9_]{1,40}$'),
  sarlavha text not null check (length(btrim(sarlavha)) between 3 and 200),
  manba_jadval text check (manba_jadval is null or manba_jadval ~ '^t2_[a-z0-9_]+$'),
  manba_id bigint,
  document_id bigint references public.t2_document_registry(id),
  holat text not null default 'jarayonda' check (holat in ('jarayonda','tasdiqlandi','rad','qaytarildi','bekor')),
  raund integer not null default 1,
  actor_id bigint not null,
  operation_id uuid,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  yopildi timestamptz
);
create unique index if not exists t2_hujjat_zanjir_operation_uq on public.t2_hujjat_zanjir (kompaniya_id, operation_id) where operation_id is not null;
create index if not exists t2_hujjat_zanjir_egasi_idx on public.t2_hujjat_zanjir (kompaniya_id, holat, id desc);
create index if not exists t2_hujjat_zanjir_manba_idx on public.t2_hujjat_zanjir (manba_jadval, manba_id) where manba_id is not null;
alter table public.t2_hujjat_zanjir enable row level security;
revoke all on table public.t2_hujjat_zanjir from anon, authenticated;

create table if not exists public.t2_hujjat_zanjir_qadam (
  id bigint generated always as identity primary key,
  zanjir_id bigint not null references public.t2_hujjat_zanjir(id),
  tartib integer not null check (tartib between 1 and 8),
  rol text not null check (length(btrim(rol)) between 2 and 40),
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  holat text not null default 'kutilmoqda' check (holat in ('kutilmoqda','navbat','tasdiqlandi','rad','qaytarildi')),
  muddat date,
  actor_id bigint,
  qaror_vaqti timestamptz,
  izoh text check (izoh is null or length(izoh) <= 2000),
  unique (zanjir_id, tartib)
);
create index if not exists t2_hujjat_zanjir_qadam_navbat_idx on public.t2_hujjat_zanjir_qadam (kompaniya_id, zanjir_id) where holat = 'navbat';
alter table public.t2_hujjat_zanjir_qadam enable row level security;
revoke all on table public.t2_hujjat_zanjir_qadam from anon, authenticated;

-- O'zgarmas jurnal: kim, qachon, nima qaror, izoh (rework tarixi ham shu yerda).
create table if not exists public.t2_hujjat_zanjir_tarix (
  id bigint generated always as identity primary key,
  zanjir_id bigint not null references public.t2_hujjat_zanjir(id),
  raund integer not null,
  tartib integer,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  actor_id bigint not null,
  harakat text not null check (harakat in ('yuborildi','tasdiqlandi','rad','qaytarildi','qayta_yuborildi','bekor')),
  izoh text check (izoh is null or length(izoh) <= 2000),
  vaqt timestamptz not null default now()
);
create index if not exists t2_hujjat_zanjir_tarix_idx on public.t2_hujjat_zanjir_tarix (zanjir_id, id);
alter table public.t2_hujjat_zanjir_tarix enable row level security;
revoke all on table public.t2_hujjat_zanjir_tarix from anon, authenticated;
create or replace function public._t2_hujjat_tarix_ozgarmas() returns trigger language plpgsql as $$
begin raise exception 'Hujjat zanjiri jurnali o''zgartirilmaydi' using errcode = '42501'; end $$;
drop trigger if exists t2_hujjat_zanjir_tarix_ozgarmas on public.t2_hujjat_zanjir_tarix;
create trigger t2_hujjat_zanjir_tarix_ozgarmas before update or delete on public.t2_hujjat_zanjir_tarix for each row execute function public._t2_hujjat_tarix_ozgarmas();

-- ───────────────────────── 2. Xat reestri ─────────────────────────
create table if not exists public.t2_xat_raqam (
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  yil integer not null,
  yonalish text not null check (yonalish in ('chiquvchi','kiruvchi')),
  oxirgi integer not null default 0,
  primary key (kompaniya_id, yil, yonalish)
);
alter table public.t2_xat_raqam enable row level security;
revoke all on table public.t2_xat_raqam from anon, authenticated;

create table if not exists public.t2_xat (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  qabul_kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint references public.t2_obyekt(id),
  turi text not null default 'xat' check (turi in ('xat','soprovod','talabnoma','ogohlantirish','javob_xati','boshqa')),
  chiquvchi_raqam text not null,
  kiruvchi_raqam text,
  sana date not null default current_date,
  mavzu text not null check (length(btrim(mavzu)) between 3 and 200),
  matn text check (matn is null or length(matn) <= 4000),
  javob_muddati date,
  document_id bigint references public.t2_document_registry(id),
  ota_xat_id bigint references public.t2_xat(id),
  holat text not null default 'yuborilgan' check (holat in ('yuborilgan','olindi','javob_berildi')),
  actor_id bigint not null,
  olindi_actor_id bigint,
  olindi_vaqti timestamptz,
  operation_id uuid,
  yaratildi timestamptz not null default now(),
  check (kompaniya_id <> qabul_kompaniya_id)
);
create unique index if not exists t2_xat_operation_uq on public.t2_xat (kompaniya_id, operation_id) where operation_id is not null;
create unique index if not exists t2_xat_chiq_raqam_uq on public.t2_xat (kompaniya_id, chiquvchi_raqam);
create index if not exists t2_xat_kiruvchi_idx on public.t2_xat (qabul_kompaniya_id, holat, id desc);
create index if not exists t2_xat_chiquvchi_idx on public.t2_xat (kompaniya_id, id desc);
alter table public.t2_xat enable row level security;
revoke all on table public.t2_xat from anon, authenticated;

-- Talabnoma / ogohlantirish: murojaat katalogiga (predpisaniya allaqachon bor; muddat + raund + eslatma shu primitivda).
insert into public.t2_tomon_murojaat_turi (kalit, nom, nom_ru, tartib) values
  ('talabnoma', 'Talabnoma', 'Требование', 65),
  ('ogohlantirish', 'Ogohlantirish', 'Предупреждение', 66)
on conflict (kalit) do nothing;

-- ───────────────────────── 3. Yordamchilar ─────────────────────────
create or replace function public._t2_hujjat_azo(p_actor_id bigint, p_kompaniya_id bigint, p_amal text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if p_amal = 'yozish' and v_rol in ('kuzatuvchi','usta','haydovchi','omborchi','kadr','mexanik') then
    raise exception 'HUJJAT_ROL_YETARLI_EMAS: % roli yozolmaydi', v_rol using errcode = '42501';
  end if;
  if p_amal = 'qaror' and v_rol not in ('superadmin','admin','boss','rahbar','director','pto','buyurtmachi','inspektor') then
    raise exception 'HUJJAT_ROL_YETARLI_EMAS: % roli qaror chiqara olmaydi', v_rol using errcode = '42501';
  end if;
  return v_rol;
end $$;

-- Ikki kompaniya orasida FAOL aloqa bormi.
create or replace function public._t2_hujjat_aloqa_faol(p_a bigint, p_b bigint) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id from public.t2_tomon_aloqa a
   where a.holat = 'faol'
     and ((a.taklif_kompaniya_id = p_a and a.qabul_kompaniya_id = p_b) or (a.taklif_kompaniya_id = p_b and a.qabul_kompaniya_id = p_a))
   order by a.id desc limit 1
$$;

create or replace function public._t2_hujjat_tarix_yoz(p_zanjir_id bigint, p_raund integer, p_tartib integer, p_kompaniya_id bigint, p_actor_id bigint, p_harakat text, p_izoh text)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.t2_hujjat_zanjir_tarix (zanjir_id, raund, tartib, kompaniya_id, actor_id, harakat, izoh)
  values (p_zanjir_id, p_raund, p_tartib, p_kompaniya_id, p_actor_id, p_harakat, nullif(btrim(coalesce(p_izoh, '')), ''));
$$;

-- Keyingi raqam: <prefiks>-<yil>-<NNNN>; hisoblagich qatori qulflanadi (parallel so'rovda takrorlanmaydi).
create or replace function public._t2_xat_keyingi_raqam(p_kompaniya_id bigint, p_yonalish text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_yil integer := extract(year from current_date)::integer; v_n integer;
begin
  insert into public.t2_xat_raqam (kompaniya_id, yil, yonalish, oxirgi) values (p_kompaniya_id, v_yil, p_yonalish, 1)
  on conflict (kompaniya_id, yil, yonalish) do update set oxirgi = public.t2_xat_raqam.oxirgi + 1
  returning oxirgi into v_n;
  return (case when p_yonalish = 'chiquvchi' then 'CHIQ' else 'KIR' end) || '-' || v_yil || '-' || lpad(v_n::text, 4, '0');
end $$;

-- ───────────────────────── 4. Tasdiq zanjiri RPC ─────────────────────────
create or replace function public.t2_hujjat_zanjir_yarat_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_hujjat_turi text, p_sarlavha text, p_obyekt_id bigint, p_document_id bigint,
  p_manba_jadval text, p_manba_id bigint, p_qadamlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old public.t2_hujjat_zanjir; v_id bigint; e jsonb; i integer := 0; v_k bigint; v_rol text; v_muddat date; v_n integer;
begin
  perform public._t2_hujjat_azo(p_actor_id, p_kompaniya_id, 'yozish');
  if p_operation_id is not null then
    select * into v_old from public.t2_hujjat_zanjir where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
    if found then return jsonb_build_object('ok', true, 'id', v_old.id, 'holat', v_old.holat, 'qayta', true); end if;
  end if;
  if coalesce(p_hujjat_turi, '') !~ '^[a-z][a-z0-9_]{1,40}$' then return jsonb_build_object('ok', false, 'code', 'TUR', 'error', 'Hujjat turi noto‘g‘ri'); end if;
  if length(btrim(coalesce(p_sarlavha, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'SARLAVHA_KERAK', 'error', 'Sarlavha kamida 3 belgi'); end if;
  if p_qadamlar is null or jsonb_typeof(p_qadamlar) <> 'array' then return jsonb_build_object('ok', false, 'code', 'QADAM', 'error', 'Qadamlar ro‘yxati kerak'); end if;
  v_n := jsonb_array_length(p_qadamlar);
  if v_n < 1 or v_n > 8 then return jsonb_build_object('ok', false, 'code', 'QADAM', 'error', 'Zanjirda 1–8 qadam bo‘lishi kerak'); end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA', 'error', 'Obyekt sizning kompaniyangizniki emas');
  end if;
  if p_document_id is not null and not exists (select 1 from public.t2_document_registry d where d.id = p_document_id and d.kompaniya_id = p_kompaniya_id and d.canonical_storage_status = 'stored') then
    return jsonb_build_object('ok', false, 'code', 'HUJJAT_BEGONA', 'error', 'Hujjat sizniki emas yoki saqlanmagan');
  end if;
  -- Har qadam tashqi kompaniya bo'lsa — faol aloqa shart.
  for e in select * from jsonb_array_elements(p_qadamlar) loop
    v_k := nullif(e->>'kompaniya_id', '')::bigint;
    if v_k is null or not exists (select 1 from public.t2_kompaniya k where k.id = v_k) then
      return jsonb_build_object('ok', false, 'code', 'QADAM_KOMPANIYA', 'error', 'Qadam kompaniyasi topilmadi');
    end if;
    if v_k <> p_kompaniya_id and public._t2_hujjat_aloqa_faol(p_kompaniya_id, v_k) is null then
      return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ', 'error', 'Bu kompaniya bilan faol aloqa yo‘q');
    end if;
    if length(btrim(coalesce(e->>'rol', ''))) < 2 then return jsonb_build_object('ok', false, 'code', 'QADAM_ROL', 'error', 'Qadam roli kerak'); end if;
  end loop;
  insert into public.t2_hujjat_zanjir (kompaniya_id, obyekt_id, hujjat_turi, sarlavha, manba_jadval, manba_id, document_id, actor_id, operation_id)
  values (p_kompaniya_id, p_obyekt_id, p_hujjat_turi, btrim(p_sarlavha), p_manba_jadval, p_manba_id, p_document_id, p_actor_id, p_operation_id)
  returning id into v_id;
  for e in select * from jsonb_array_elements(p_qadamlar) loop
    i := i + 1;
    v_k := (e->>'kompaniya_id')::bigint; v_rol := btrim(e->>'rol'); v_muddat := nullif(e->>'muddat', '')::date;
    insert into public.t2_hujjat_zanjir_qadam (zanjir_id, tartib, rol, kompaniya_id, holat, muddat)
    values (v_id, i, v_rol, v_k, case when i = 1 then 'navbat' else 'kutilmoqda' end, v_muddat);
  end loop;
  perform public._t2_hujjat_tarix_yoz(v_id, 1, null, p_kompaniya_id, p_actor_id, 'yuborildi', null);
  select kompaniya_id into v_k from public.t2_hujjat_zanjir_qadam where zanjir_id = v_id and tartib = 1;
  perform public.t2_outbox_yoz(p_kompaniya_id, 'hujjat.tasdiq_kutmoqda', 't2_hujjat_zanjir', v_id,
    jsonb_build_object('zanjir_id', v_id, 'turi', p_hujjat_turi), p_actor_id, gen_random_uuid(), p_obyekt_id, null, array[v_k]::bigint[], '{}'::bigint[]);
  perform public.t2_audit_yoz(p_kompaniya_id, 'hujjat_zanjir_yaratildi', 'hujjat_zanjir', p_obyekt_id, format('zanjir_id=%s; turi=%s', v_id, p_hujjat_turi), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', v_id, 'holat', 'jarayonda');
end $$;

create or replace function public.t2_hujjat_zanjir_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_zanjir_id bigint, p_qaror text, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare z public.t2_hujjat_zanjir; q public.t2_hujjat_zanjir_qadam; v_next public.t2_hujjat_zanjir_qadam; v_izoh text := nullif(btrim(coalesce(p_izoh, '')), '');
begin
  perform public._t2_hujjat_azo(p_actor_id, p_kompaniya_id, 'qaror');
  select * into z from public.t2_hujjat_zanjir where id = p_zanjir_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Zanjir topilmadi'); end if;
  select * into q from public.t2_hujjat_zanjir_qadam where zanjir_id = z.id and holat = 'navbat';
  if z.holat <> 'jarayonda' or not found or q.kompaniya_id <> p_kompaniya_id then
    return jsonb_build_object('ok', false, 'code', 'NAVBAT_EMAS', 'error', 'Hozir sizning qaroringiz kutilmayapti');
  end if;
  if p_qaror not in ('tasdiqlash','rad','qaytarish') then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI', 'error', 'qaror: tasdiqlash | rad | qaytarish'); end if;
  if p_qaror in ('rad','qaytarish') and (v_izoh is null or length(v_izoh) < 3) then
    return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK', 'error', 'Rad etish yoki qaytarish sababini yozing'); end if;
  if p_qaror = 'tasdiqlash' then
    update public.t2_hujjat_zanjir_qadam set holat = 'tasdiqlandi', actor_id = p_actor_id, qaror_vaqti = now(), izoh = v_izoh where id = q.id;
    perform public._t2_hujjat_tarix_yoz(z.id, z.raund, q.tartib, p_kompaniya_id, p_actor_id, 'tasdiqlandi', v_izoh);
    select * into v_next from public.t2_hujjat_zanjir_qadam where zanjir_id = z.id and tartib = q.tartib + 1;
    if found then
      update public.t2_hujjat_zanjir_qadam set holat = 'navbat' where id = v_next.id;
      update public.t2_hujjat_zanjir set versiya = versiya + 1, yangilandi = now() where id = z.id;
      perform public.t2_outbox_yoz(z.kompaniya_id, 'hujjat.tasdiq_kutmoqda', 't2_hujjat_zanjir', z.id, jsonb_build_object('zanjir_id', z.id, 'turi', z.hujjat_turi),
        p_actor_id, gen_random_uuid(), z.obyekt_id, null, array[v_next.kompaniya_id]::bigint[], '{}'::bigint[]);
      return jsonb_build_object('ok', true, 'id', z.id, 'holat', 'jarayonda', 'keyingi_tartib', v_next.tartib);
    end if;
    update public.t2_hujjat_zanjir set holat = 'tasdiqlandi', yopildi = now(), versiya = versiya + 1, yangilandi = now() where id = z.id;
    perform public.t2_outbox_yoz(p_kompaniya_id, 'hujjat.tasdiqlandi', 't2_hujjat_zanjir', z.id, jsonb_build_object('zanjir_id', z.id, 'turi', z.hujjat_turi),
      p_actor_id, gen_random_uuid(), z.obyekt_id, null, array[z.kompaniya_id]::bigint[], '{}'::bigint[]);
    perform public.t2_audit_yoz(z.kompaniya_id, 'hujjat_zanjir_tasdiqlandi', 'hujjat_zanjir', z.obyekt_id, format('zanjir_id=%s', z.id), 'actor:' || p_actor_id, null);
    return jsonb_build_object('ok', true, 'id', z.id, 'holat', 'tasdiqlandi');
  end if;
  update public.t2_hujjat_zanjir_qadam set holat = case when p_qaror = 'rad' then 'rad' else 'qaytarildi' end, actor_id = p_actor_id, qaror_vaqti = now(), izoh = v_izoh where id = q.id;
  update public.t2_hujjat_zanjir set holat = case when p_qaror = 'rad' then 'rad' else 'qaytarildi' end,
         yopildi = case when p_qaror = 'rad' then now() else null end, versiya = versiya + 1, yangilandi = now() where id = z.id;
  perform public._t2_hujjat_tarix_yoz(z.id, z.raund, q.tartib, p_kompaniya_id, p_actor_id, case when p_qaror = 'rad' then 'rad' else 'qaytarildi' end, v_izoh);
  perform public.t2_outbox_yoz(p_kompaniya_id, case when p_qaror = 'rad' then 'hujjat.rad_etildi' else 'hujjat.qaytarildi' end, 't2_hujjat_zanjir', z.id,
    jsonb_build_object('zanjir_id', z.id, 'turi', z.hujjat_turi), p_actor_id, gen_random_uuid(), z.obyekt_id, null, array[z.kompaniya_id]::bigint[], '{}'::bigint[]);
  perform public.t2_audit_yoz(z.kompaniya_id, 'hujjat_zanjir_' || p_qaror, 'hujjat_zanjir', z.obyekt_id, format('zanjir_id=%s', z.id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', z.id, 'holat', case when p_qaror = 'rad' then 'rad' else 'qaytarildi' end);
end $$;

-- Qaytarilgan hujjatni egasi tuzatib qayta yuboradi: raund+1, qadamlar boshidan.
create or replace function public.t2_hujjat_zanjir_qayta_v1(p_actor_id bigint, p_kompaniya_id bigint, p_zanjir_id bigint, p_izoh text, p_document_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare z public.t2_hujjat_zanjir; v_k bigint;
begin
  perform public._t2_hujjat_azo(p_actor_id, p_kompaniya_id, 'yozish');
  select * into z from public.t2_hujjat_zanjir where id = p_zanjir_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Zanjir topilmadi'); end if;
  if z.holat <> 'qaytarildi' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Faqat qaytarilgan hujjat qayta yuboriladi'); end if;
  if p_document_id is not null and not exists (select 1 from public.t2_document_registry d where d.id = p_document_id and d.kompaniya_id = p_kompaniya_id and d.canonical_storage_status = 'stored') then
    return jsonb_build_object('ok', false, 'code', 'HUJJAT_BEGONA', 'error', 'Hujjat sizniki emas yoki saqlanmagan');
  end if;
  update public.t2_hujjat_zanjir_qadam set holat = case when tartib = 1 then 'navbat' else 'kutilmoqda' end, actor_id = null, qaror_vaqti = null, izoh = null where zanjir_id = z.id;
  update public.t2_hujjat_zanjir set holat = 'jarayonda', raund = raund + 1, document_id = coalesce(p_document_id, document_id), versiya = versiya + 1, yangilandi = now() where id = z.id;
  perform public._t2_hujjat_tarix_yoz(z.id, z.raund + 1, null, p_kompaniya_id, p_actor_id, 'qayta_yuborildi', p_izoh);
  select kompaniya_id into v_k from public.t2_hujjat_zanjir_qadam where zanjir_id = z.id and tartib = 1;
  perform public.t2_outbox_yoz(p_kompaniya_id, 'hujjat.tasdiq_kutmoqda', 't2_hujjat_zanjir', z.id, jsonb_build_object('zanjir_id', z.id, 'turi', z.hujjat_turi),
    p_actor_id, gen_random_uuid(), z.obyekt_id, null, array[v_k]::bigint[], '{}'::bigint[]);
  return jsonb_build_object('ok', true, 'id', z.id, 'holat', 'jarayonda', 'raund', z.raund + 1);
end $$;

create or replace function public.t2_hujjat_zanjir_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_zanjir_id bigint, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare z public.t2_hujjat_zanjir;
begin
  perform public._t2_hujjat_azo(p_actor_id, p_kompaniya_id, 'yozish');
  select * into z from public.t2_hujjat_zanjir where id = p_zanjir_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Zanjir topilmadi'); end if;
  if z.holat not in ('jarayonda','qaytarildi') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Bu zanjirni bekor qilib bo‘lmaydi'); end if;
  update public.t2_hujjat_zanjir set holat = 'bekor', yopildi = now(), versiya = versiya + 1, yangilandi = now() where id = z.id;
  perform public._t2_hujjat_tarix_yoz(z.id, z.raund, null, p_kompaniya_id, p_actor_id, 'bekor', p_sabab);
  return jsonb_build_object('ok', true, 'id', z.id, 'holat', 'bekor');
end $$;

create or replace function public.t2_hujjat_zanjir_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_zanjir_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare z public.t2_hujjat_zanjir;
begin
  perform public._t2_hujjat_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into z from public.t2_hujjat_zanjir where id = p_zanjir_id
     and (kompaniya_id = p_kompaniya_id or exists (select 1 from public.t2_hujjat_zanjir_qadam s where s.zanjir_id = t2_hujjat_zanjir.id and s.kompaniya_id = p_kompaniya_id));
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Zanjir topilmadi'); end if;
  return jsonb_build_object('ok', true,
    'zanjir', jsonb_build_object('id', z.id, 'hujjat_turi', z.hujjat_turi, 'sarlavha', z.sarlavha, 'holat', z.holat, 'raund', z.raund, 'document_id', z.document_id,
      'obyekt_id', z.obyekt_id, 'manba_jadval', z.manba_jadval, 'manba_id', z.manba_id, 'meniki', z.kompaniya_id = p_kompaniya_id,
      'egasi_nom', (select nom from public.t2_kompaniya where id = z.kompaniya_id), 'yaratildi', z.yaratildi, 'yopildi', z.yopildi),
    'qadamlar', coalesce((select jsonb_agg(jsonb_build_object('tartib', s.tartib, 'rol', s.rol, 'holat', s.holat, 'muddat', s.muddat, 'izoh', s.izoh, 'qaror_vaqti', s.qaror_vaqti,
        'men', s.kompaniya_id = p_kompaniya_id, 'kompaniya_nom', (select nom from public.t2_kompaniya where id = s.kompaniya_id)) order by s.tartib)
        from public.t2_hujjat_zanjir_qadam s where s.zanjir_id = z.id), '[]'::jsonb),
    'tarix', coalesce((select jsonb_agg(jsonb_build_object('raund', h.raund, 'tartib', h.tartib, 'harakat', h.harakat, 'izoh', h.izoh, 'vaqt', h.vaqt, 'men', h.kompaniya_id = p_kompaniya_id,
        'kompaniya_nom', (select nom from public.t2_kompaniya where id = h.kompaniya_id)) order by h.id) from public.t2_hujjat_zanjir_tarix h where h.zanjir_id = z.id), '[]'::jsonb));
end $$;

create or replace function public.t2_hujjat_zanjir_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text, p_holat text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb; v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 300);
begin
  perform public._t2_hujjat_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object('id', z.id, 'hujjat_turi', z.hujjat_turi, 'sarlavha', z.sarlavha, 'holat', z.holat, 'raund', z.raund, 'yaratildi', z.yaratildi,
      'meniki', z.kompaniya_id = p_kompaniya_id, 'egasi_nom', (select nom from public.t2_kompaniya where id = z.kompaniya_id),
      'navbat_menda', exists (select 1 from public.t2_hujjat_zanjir_qadam s where s.zanjir_id = z.id and s.holat = 'navbat' and s.kompaniya_id = p_kompaniya_id),
      'navbat_rol', (select s.rol from public.t2_hujjat_zanjir_qadam s where s.zanjir_id = z.id and s.holat = 'navbat')) x
      from public.t2_hujjat_zanjir z
     where ((coalesce(p_yonalish, '') = 'mendan' and z.kompaniya_id = p_kompaniya_id)
         or (coalesce(p_yonalish, '') = 'menga' and z.kompaniya_id <> p_kompaniya_id and exists (select 1 from public.t2_hujjat_zanjir_qadam s where s.zanjir_id = z.id and s.kompaniya_id = p_kompaniya_id))
         or (coalesce(p_yonalish, '') not in ('menga','mendan') and (z.kompaniya_id = p_kompaniya_id or exists (select 1 from public.t2_hujjat_zanjir_qadam s where s.zanjir_id = z.id and s.kompaniya_id = p_kompaniya_id))))
       and (p_holat is null or p_holat = '' or z.holat = p_holat)
     order by z.id desc limit v_lim) s;
  return v;
end $$;

-- ───────────────────────── 5. Xat RPC ─────────────────────────
create or replace function public.t2_xat_yubor_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_qabul_kompaniya_id bigint, p_turi text, p_mavzu text, p_matn text,
  p_javob_muddati date, p_obyekt_id bigint, p_document_id bigint, p_ota_xat_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old public.t2_xat; v_par public.t2_xat; v_id bigint; v_raqam text; v_turi text := coalesce(nullif(p_turi, ''), 'xat'); v_aloqa bigint;
begin
  perform public._t2_hujjat_azo(p_actor_id, p_kompaniya_id, 'yozish');
  if p_operation_id is not null then
    select * into v_old from public.t2_xat where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
    if found then return jsonb_build_object('ok', true, 'id', v_old.id, 'raqam', v_old.chiquvchi_raqam, 'qayta', true); end if;
  end if;
  if v_turi not in ('xat','soprovod','talabnoma','ogohlantirish','javob_xati','boshqa') then return jsonb_build_object('ok', false, 'code', 'TUR', 'error', 'Xat turi noto‘g‘ri'); end if;
  if length(btrim(coalesce(p_mavzu, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'MAVZU_KERAK', 'error', 'Mavzu kamida 3 belgi'); end if;
  if p_qabul_kompaniya_id is null or p_qabul_kompaniya_id = p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'QABUL', 'error', 'Qabul qiluvchi boshqa kompaniya bo‘lishi kerak'); end if;
  v_aloqa := public._t2_hujjat_aloqa_faol(p_kompaniya_id, p_qabul_kompaniya_id);
  if v_aloqa is null then return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ', 'error', 'Bu kompaniya bilan faol aloqa yo‘q'); end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA', 'error', 'Obyekt sizning kompaniyangizniki emas');
  end if;
  if p_document_id is not null and not exists (select 1 from public.t2_document_registry d where d.id = p_document_id and d.kompaniya_id = p_kompaniya_id and d.canonical_storage_status = 'stored') then
    return jsonb_build_object('ok', false, 'code', 'HUJJAT_BEGONA', 'error', 'Hujjat sizniki emas yoki saqlanmagan');
  end if;
  if p_ota_xat_id is not null then
    select * into v_par from public.t2_xat where id = p_ota_xat_id and qabul_kompaniya_id = p_kompaniya_id and kompaniya_id = p_qabul_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'OTA_XAT', 'error', 'Javob beriladigan xat topilmadi'); end if;
  end if;
  v_raqam := public._t2_xat_keyingi_raqam(p_kompaniya_id, 'chiquvchi');
  insert into public.t2_xat (kompaniya_id, qabul_kompaniya_id, obyekt_id, turi, chiquvchi_raqam, mavzu, matn, javob_muddati, document_id, ota_xat_id, actor_id, operation_id)
  values (p_kompaniya_id, p_qabul_kompaniya_id, p_obyekt_id, v_turi, v_raqam, btrim(p_mavzu), nullif(btrim(coalesce(p_matn, '')), ''), p_javob_muddati, p_document_id, p_ota_xat_id, p_actor_id, p_operation_id)
  returning id into v_id;
  if p_ota_xat_id is not null then update public.t2_xat set holat = 'javob_berildi' where id = p_ota_xat_id; end if;
  perform public.t2_outbox_yoz(p_kompaniya_id, 'hujjat.xat_keldi', 't2_xat', v_id, jsonb_build_object('xat_id', v_id, 'turi', v_turi, 'raqam', v_raqam),
    p_actor_id, gen_random_uuid(), p_obyekt_id, v_aloqa, array[p_qabul_kompaniya_id]::bigint[], '{}'::bigint[]);
  perform public.t2_audit_yoz(p_kompaniya_id, 'xat_yuborildi', 'xat', p_obyekt_id, format('xat_id=%s; raqam=%s; turi=%s', v_id, v_raqam, v_turi), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', v_id, 'raqam', v_raqam);
end $$;

create or replace function public.t2_xat_qabul_v1(p_actor_id bigint, p_kompaniya_id bigint, p_xat_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare x public.t2_xat; v_raqam text;
begin
  perform public._t2_hujjat_azo(p_actor_id, p_kompaniya_id, 'yozish');
  select * into x from public.t2_xat where id = p_xat_id and qabul_kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Xat topilmadi'); end if;
  if x.kiruvchi_raqam is not null then return jsonb_build_object('ok', true, 'id', x.id, 'kiruvchi_raqam', x.kiruvchi_raqam, 'qayta', true); end if;
  v_raqam := public._t2_xat_keyingi_raqam(p_kompaniya_id, 'kiruvchi');
  update public.t2_xat set kiruvchi_raqam = v_raqam, holat = case when holat = 'yuborilgan' then 'olindi' else holat end, olindi_actor_id = p_actor_id, olindi_vaqti = now() where id = x.id;
  return jsonb_build_object('ok', true, 'id', x.id, 'kiruvchi_raqam', v_raqam);
end $$;

create or replace function public.t2_xat_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text, p_holat text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb; v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 300);
begin
  perform public._t2_hujjat_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object('id', m.id, 'turi', m.turi, 'mavzu', m.mavzu, 'holat', m.holat, 'sana', m.sana, 'javob_muddati', m.javob_muddati,
      'chiquvchi_raqam', m.chiquvchi_raqam, 'kiruvchi_raqam', m.kiruvchi_raqam, 'kiruvchi', m.qabul_kompaniya_id = p_kompaniya_id,
      'qarshi_nom', (select k.nom from public.t2_kompaniya k where k.id = case when m.qabul_kompaniya_id = p_kompaniya_id then m.kompaniya_id else m.qabul_kompaniya_id end),
      'qarshi_kompaniya_id', case when m.qabul_kompaniya_id = p_kompaniya_id then m.kompaniya_id else m.qabul_kompaniya_id end,
      'hujjat_bor', m.document_id is not null, 'ota_xat_id', m.ota_xat_id,
      'kechikkan', m.javob_muddati is not null and m.javob_muddati < current_date and m.holat <> 'javob_berildi') x
      from public.t2_xat m
     where ((p_yonalish = 'kiruvchi' and m.qabul_kompaniya_id = p_kompaniya_id) or (p_yonalish = 'chiquvchi' and m.kompaniya_id = p_kompaniya_id)
         or (coalesce(p_yonalish, '') not in ('kiruvchi','chiquvchi') and (m.qabul_kompaniya_id = p_kompaniya_id or m.kompaniya_id = p_kompaniya_id)))
       and (p_holat is null or p_holat = '' or m.holat = p_holat)
     order by m.id desc limit v_lim) s;
  return v;
end $$;

create or replace function public.t2_xat_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_xat_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m public.t2_xat;
begin
  perform public._t2_hujjat_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into m from public.t2_xat where id = p_xat_id and (kompaniya_id = p_kompaniya_id or qabul_kompaniya_id = p_kompaniya_id);
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Xat topilmadi'); end if;
  return jsonb_build_object('ok', true, 'xat', jsonb_build_object('id', m.id, 'turi', m.turi, 'mavzu', m.mavzu, 'matn', m.matn, 'holat', m.holat, 'sana', m.sana,
    'javob_muddati', m.javob_muddati, 'chiquvchi_raqam', m.chiquvchi_raqam, 'kiruvchi_raqam', m.kiruvchi_raqam, 'document_id', m.document_id, 'ota_xat_id', m.ota_xat_id,
    'kiruvchi', m.qabul_kompaniya_id = p_kompaniya_id, 'yuboruvchi_nom', (select nom from public.t2_kompaniya where id = m.kompaniya_id),
    'qabul_nom', (select nom from public.t2_kompaniya where id = m.qabul_kompaniya_id), 'qarshi_kompaniya_id', case when m.qabul_kompaniya_id = p_kompaniya_id then m.kompaniya_id else m.qabul_kompaniya_id end));
end $$;

-- ───────────────────────── 6. Kiruvchi quti ─────────────────────────
create or replace function public.t2_hujjat_kiruvchi_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare vz jsonb; vx jsonb; vm jsonb;
begin
  perform public._t2_hujjat_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into vz from (
    select jsonb_build_object('id', z.id, 'hujjat_turi', z.hujjat_turi, 'sarlavha', z.sarlavha, 'raund', z.raund, 'yaratildi', z.yaratildi, 'muddat', s.muddat, 'rol', s.rol,
      'egasi_nom', (select nom from public.t2_kompaniya where id = z.kompaniya_id), 'kechikkan', s.muddat is not null and s.muddat < current_date) x
      from public.t2_hujjat_zanjir z join public.t2_hujjat_zanjir_qadam s on s.zanjir_id = z.id and s.holat = 'navbat' and s.kompaniya_id = p_kompaniya_id
     where z.holat = 'jarayonda' order by z.id desc limit 50) a;
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into vx from (
    select jsonb_build_object('id', m.id, 'turi', m.turi, 'mavzu', m.mavzu, 'holat', m.holat, 'sana', m.sana, 'javob_muddati', m.javob_muddati, 'raqam', coalesce(m.kiruvchi_raqam, m.chiquvchi_raqam),
      'qarshi_nom', (select nom from public.t2_kompaniya where id = m.kompaniya_id), 'kechikkan', m.javob_muddati is not null and m.javob_muddati < current_date) x
      from public.t2_xat m where m.qabul_kompaniya_id = p_kompaniya_id and m.holat in ('yuborilgan','olindi') order by m.id desc limit 50) b;
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into vm from (
    select jsonb_build_object('id', r.id, 'turi', r.turi, 'sarlavha', r.sarlavha, 'muhimlik', r.muhimlik, 'muddat', r.muddat,
      'beruvchi_nom', (select nom from public.t2_kompaniya where id = r.beruvchi_kompaniya_id), 'kechikkan', r.muddat is not null and r.muddat < current_date) x
      from public.t2_tomon_murojaat r where r.ijrochi_kompaniya_id = p_kompaniya_id and r.holat = 'ochiq' order by r.id desc limit 50) c;
  return jsonb_build_object('ok', true, 'zanjirlar', vz, 'xatlar', vx, 'murojaatlar', vm,
    'sanoq', jsonb_build_object('zanjir', jsonb_array_length(vz), 'xat', jsonb_array_length(vx), 'murojaat', jsonb_array_length(vm)));
end $$;

-- ───────────────────────── 7. Hujjat faylini olish (zanjir qatnashchisi / xat qabul qiluvchisi) ─────────────────────────
-- hujjat-ol shlyuzi canonical va tomon yo'llari rad etsagina shu yo'lni sinaydi. Faqat shu aniq hujjat.
create or replace function public.t2_hujjat_aylanish_hujjat_ol_v1(p_actor_id bigint, p_document_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_egasi bigint; d public.t2_document_registry;
begin
  if p_actor_id is null or p_actor_id <= 0 or p_document_id is null or p_document_id <= 0 then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_FORBIDDEN'); end if;
  select z.kompaniya_id into v_egasi from public.t2_hujjat_zanjir z
   where z.document_id = p_document_id and z.holat <> 'bekor'
     and exists (select 1 from public.t2_hujjat_zanjir_qadam s join public.t2_azolik a on a.kompaniya_id = s.kompaniya_id and a.foydalanuvchi_id = p_actor_id and a.holat = 'faol' where s.zanjir_id = z.id)
   order by z.id desc limit 1;
  if v_egasi is null then
    select x.kompaniya_id into v_egasi from public.t2_xat x
     where x.document_id = p_document_id
       and exists (select 1 from public.t2_azolik a where a.foydalanuvchi_id = p_actor_id and a.holat = 'faol' and a.kompaniya_id = x.qabul_kompaniya_id)
     order by x.id desc limit 1;
  end if;
  if v_egasi is null then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_FORBIDDEN'); end if;
  select * into d from public.t2_document_registry where id = p_document_id and kompaniya_id = v_egasi;
  if not found then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_NOT_FOUND'); end if;
  if d.canonical_storage_status is distinct from 'stored' or d.r2_key is null then return jsonb_build_object('ok', false, 'code', 'CANONICAL_BINARY_MISSING'); end if;
  return jsonb_build_object('ok', true, 'document_id', d.id, 'r2_key', d.r2_key, 'blob_key', coalesce(d.blob_key, d.r2_key), 'mime_type', d.mime_type,
    'original_filename', d.original_filename, 'size_bytes', d.size_bytes, 'sha256', d.sha256);
end $$;

-- ───────────────────────── 8. Muddat eslatmalari (cron -> t2_outbox -> t2_bildirishnoma) ─────────────────────────
-- Kuniga bir marta chaqiriladi (service_role). Idempotent: operation_id = md5(kalit || sana). p_kun_oldin kun qolganda «yaqin», o'tgach «o'tdi».
create or replace function public.t2_hujjat_eslatma_v1(p_kun_oldin integer default 2)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_oldin integer := least(greatest(coalesce(p_kun_oldin, 2), 0), 14); v_n integer := 0; v_mavzu text;
begin
  -- Xat: javob muddati (qabul qiluvchi javob berishi kerak).
  for r in select x.id, x.kompaniya_id, x.qabul_kompaniya_id, x.obyekt_id, x.javob_muddati from public.t2_xat x
            where x.javob_muddati is not null and x.holat <> 'javob_berildi' and x.javob_muddati <= current_date + v_oldin and x.javob_muddati >= current_date - 30 loop
    v_mavzu := case when r.javob_muddati < current_date then 'hujjat.muddat_otdi' else 'hujjat.muddat_yaqin' end;
    perform public.t2_outbox_yoz(r.kompaniya_id, v_mavzu, 't2_xat', r.id, jsonb_build_object('xat_id', r.id, 'muddat', r.javob_muddati), null,
      md5('xat:' || r.id || ':' || v_mavzu || ':' || current_date)::uuid, r.obyekt_id, null,
      case when r.javob_muddati < current_date then array[r.qabul_kompaniya_id, r.kompaniya_id] else array[r.qabul_kompaniya_id] end, '{}'::bigint[]);
    v_n := v_n + 1;
  end loop;
  -- Murojaat (predpisaniya / talabnoma / remark …): ijrochi muddatini bajarishi kerak.
  for r in select m.id, m.beruvchi_kompaniya_id, m.ijrochi_kompaniya_id, m.obyekt_id, m.muddat from public.t2_tomon_murojaat m
            where m.muddat is not null and m.holat = 'ochiq' and m.muddat <= current_date + v_oldin and m.muddat >= current_date - 30 loop
    v_mavzu := case when r.muddat < current_date then 'hujjat.muddat_otdi' else 'hujjat.muddat_yaqin' end;
    perform public.t2_outbox_yoz(r.beruvchi_kompaniya_id, v_mavzu, 't2_tomon_murojaat', r.id, jsonb_build_object('murojaat_id', r.id, 'muddat', r.muddat), null,
      md5('mur:' || r.id || ':' || v_mavzu || ':' || current_date)::uuid, r.obyekt_id, null,
      case when r.muddat < current_date then array[r.ijrochi_kompaniya_id, r.beruvchi_kompaniya_id] else array[r.ijrochi_kompaniya_id] end, '{}'::bigint[]);
    v_n := v_n + 1;
  end loop;
  -- Tasdiq zanjiri: navbatdagi qadam muddati.
  for r in select z.id, z.kompaniya_id, z.obyekt_id, s.kompaniya_id as qk, s.muddat from public.t2_hujjat_zanjir z
             join public.t2_hujjat_zanjir_qadam s on s.zanjir_id = z.id and s.holat = 'navbat'
            where z.holat = 'jarayonda' and s.muddat is not null and s.muddat <= current_date + v_oldin and s.muddat >= current_date - 30 loop
    v_mavzu := case when r.muddat < current_date then 'hujjat.muddat_otdi' else 'hujjat.muddat_yaqin' end;
    perform public.t2_outbox_yoz(r.kompaniya_id, v_mavzu, 't2_hujjat_zanjir', r.id, jsonb_build_object('zanjir_id', r.id, 'muddat', r.muddat), null,
      md5('zan:' || r.id || ':' || v_mavzu || ':' || current_date)::uuid, r.obyekt_id, null,
      case when r.muddat < current_date then array[r.qk, r.kompaniya_id] else array[r.qk] end, '{}'::bigint[]);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'hodisa', v_n);
end $$;

-- ───────────────────────── 9. Ruxsatlar: faqat service_role ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    '_t2_hujjat_tarix_ozgarmas()', '_t2_hujjat_azo(bigint,bigint,text)', '_t2_hujjat_aloqa_faol(bigint,bigint)',
    '_t2_hujjat_tarix_yoz(bigint,integer,integer,bigint,bigint,text,text)', '_t2_xat_keyingi_raqam(bigint,text)',
    't2_hujjat_zanjir_yarat_v1(bigint,bigint,text,text,bigint,bigint,text,bigint,jsonb,uuid)',
    't2_hujjat_zanjir_qaror_v1(bigint,bigint,bigint,text,text)', 't2_hujjat_zanjir_qayta_v1(bigint,bigint,bigint,text,bigint)',
    't2_hujjat_zanjir_bekor_v1(bigint,bigint,bigint,text)', 't2_hujjat_zanjir_tafsilot_v1(bigint,bigint,bigint)',
    't2_hujjat_zanjir_royxat_v1(bigint,bigint,text,text,integer)',
    't2_xat_yubor_v1(bigint,bigint,bigint,text,text,text,date,bigint,bigint,bigint,uuid)', 't2_xat_qabul_v1(bigint,bigint,bigint)',
    't2_xat_royxat_v1(bigint,bigint,text,text,integer)', 't2_xat_tafsilot_v1(bigint,bigint,bigint)',
    't2_hujjat_kiruvchi_v1(bigint,bigint)', 't2_hujjat_aylanish_hujjat_ol_v1(bigint,bigint)', 't2_hujjat_eslatma_v1(integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
