-- AI TIZIM V2 / E1-E3: BILIM BAZASI (tasdiqlangan bilim yozuvlari), kuzatiladigan manba sahifalar, boshqaruvchi agent holati.
-- Qonunlar: (1) yangi bilim FAQAT taklif (tur 'bilim') -> inson tasdig'i (global: superadmin, kompaniya: shu kompaniya admin/boss/director);
-- (2) manba dalili (url + sha256) taklifda saqlanadi; (3) kuzatiladigan sahifa domeni oldindan tasdiqlangan manbalar ro'yxatida bo'lishi shart;
-- (4) tenant ma'lumoti global bilimga oqib chiqmaydi (mavjud GLOBAL_TAKLIF_FAQAT_MANBA qoidasi saqlanadi).
set local statement_timeout = '60s';

create table if not exists public.t2_agent_bilim (
  id bigint generated always as identity primary key,
  doira text not null check (doira in ('global','company')),
  kompaniya_id bigint references public.t2_kompaniya(id) on delete cascade,
  kod text not null check (kod ~ '^[a-z0-9_]{3,60}$'),
  sarlavha text not null check (length(sarlavha) between 3 and 200),
  matn text not null check (length(matn) between 20 and 1500),
  kalit text[] not null check (cardinality(kalit) between 1 and 12),
  manba_url text check (manba_url is null or length(manba_url) <= 1000),
  manba_sha256 text check (manba_sha256 is null or length(manba_sha256) <= 80),
  versiya integer not null default 1,
  holat text not null default 'faol' check (holat in ('faol','arxiv')),
  taklif_id bigint,
  tasdiqladi bigint,
  yaratildi timestamptz not null default now(),
  check ((doira = 'company') = (kompaniya_id is not null))
);
create unique index if not exists t2_agent_bilim_faol_uq on public.t2_agent_bilim (doira, coalesce(kompaniya_id, 0), kod) where holat = 'faol';

create table if not exists public.t2_agent_kuzatuv_url (
  id bigint generated always as identity primary key,
  url text not null unique check (url ~ '^https://' and length(url) <= 1000),
  domen text not null,
  nom text not null check (length(nom) between 2 and 120),
  maqsad text check (maqsad is null or length(maqsad) <= 300),
  faol boolean not null default true,
  oxirgi_sha256 text,
  oxirgi_vaqt timestamptz,
  oxirgi_holat text check (oxirgi_holat is null or oxirgi_holat in ('ozgarmadi','yangi','ozgardi','xato')),
  oxirgi_izoh text check (oxirgi_izoh is null or length(oxirgi_izoh) <= 300),
  tasdiqladi bigint,
  yaratildi timestamptz not null default now()
);

alter table public.t2_agent_bilim enable row level security;
alter table public.t2_agent_kuzatuv_url enable row level security;
revoke all on public.t2_agent_bilim, public.t2_agent_kuzatuv_url from public, anon, authenticated;

alter table public.t2_agent_taklif drop constraint if exists t2_agent_taklif_tur_check;
alter table public.t2_agent_taklif add constraint t2_agent_taklif_tur_check check (tur in ('qoida','manba','rivojlanish','bilim'));

-- Taklif yaratish: 'bilim' turi qo'shildi (qolgan tekshiruvlar o'zgarishsiz).
create or replace function public.t2_agent_taklif_yarat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_tur text, p_doira text, p_profil text,
  p_sarlavha text, p_mazmun jsonb, p_dalil jsonb default '[]', p_run_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_id bigint; v_dom text;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_tur not in ('qoida','manba','rivojlanish','bilim') or p_doira not in ('global','company') or p_mazmun is null or jsonb_typeof(p_mazmun) <> 'object' or length(p_mazmun::text) > 8000
     or coalesce(length(p_sarlavha), 0) not between 3 and 200 or jsonb_typeof(coalesce(p_dalil, '[]'::jsonb)) <> 'array' or length(coalesce(p_dalil, '[]'::jsonb)::text) > 6000 then
    return jsonb_build_object('ok', false, 'code', 'TAKLIF_INVALID');
  end if;
  if p_profil is not null and not exists (select 1 from t2_agent_profile where kod = p_profil) then return jsonb_build_object('ok', false, 'code', 'PROFIL_YOQ'); end if;
  if p_kompaniya_id is not null and p_doira = 'global' and p_tur <> 'manba' then return jsonb_build_object('ok', false, 'code', 'GLOBAL_TAKLIF_FAQAT_MANBA'); end if;
  if p_kompaniya_id is null and p_doira = 'company' then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  if p_tur = 'qoida' and (coalesce(p_mazmun->>'kod', '') !~ '^[a-z0-9_]{3,60}$' or coalesce(length(p_mazmun->>'matn'), 0) not between 5 and 1000) then return jsonb_build_object('ok', false, 'code', 'QOIDA_INVALID'); end if;
  if p_tur = 'manba' then
    v_dom := lower(coalesce(p_mazmun->>'domen', ''));
    if v_dom !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' or coalesce(length(p_mazmun->>'nom'), 0) not between 2 and 100 then return jsonb_build_object('ok', false, 'code', 'MANBA_INVALID'); end if;
  end if;
  if p_tur = 'bilim' then
    if coalesce(p_mazmun->>'kod', '') !~ '^[a-z0-9_]{3,60}$' or coalesce(length(p_mazmun->>'sarlavha'), 0) not between 3 and 200
       or coalesce(length(p_mazmun->>'matn'), 0) not between 20 and 1500 or jsonb_typeof(p_mazmun->'kalit') is distinct from 'array'
       or jsonb_array_length(p_mazmun->'kalit') not between 1 and 12
       or exists (select 1 from jsonb_array_elements(p_mazmun->'kalit') e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 2 and 40) then
      return jsonb_build_object('ok', false, 'code', 'BILIM_INVALID');
    end if;
  end if;
  insert into t2_agent_taklif (tur, doira, kompaniya_id, profil_kod, sarlavha, mazmun, dalil, yaratdi_actor, yaratdi_run_id)
  values (p_tur, p_doira, p_kompaniya_id, p_profil, btrim(p_sarlavha), p_mazmun, coalesce(p_dalil, '[]'::jsonb), p_actor_id, p_run_id) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Qaror (20261106270000 dagi 5-argumentli versiya asosida): 'bilim' tasdiqlansa faol yozuvga aylanadi (eskisi arxivga, versiya +1).
create or replace function public.t2_agent_taklif_qaror_v1(p_actor_id bigint, p_taklif_id bigint, p_qaror text, p_izoh text default null, p_avto_birlashtirish boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.t2_agent_taklif%rowtype; v_rol text; v_yangi int; v_dom text; v_buyruq bigint; v_xavf text; v_x text; v_holat text;
begin
  if p_qaror not in ('tasdiqlash','rad') then return jsonb_build_object('ok', false, 'code', 'QAROR_INVALID'); end if;
  select * into t from t2_agent_taklif where id = p_taklif_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if t.holat <> 'kutilmoqda' then return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_KORIB_CHIQILGAN'); end if;
  if t.doira = 'global' then
    if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'GLOBAL_SCOPE_DENIED'); end if;
  else
    v_rol := public.t2_actor_kompaniya_azo_tekshir(t.kompaniya_id, p_actor_id);
    if not public._t2_agent_qaror_rol_ok(v_rol) then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  end if;
  if p_qaror = 'rad' then
    update t2_agent_taklif set holat = 'rad', qaror_actor = p_actor_id, qaror_vaqt = now(), qaror_izoh = left(p_izoh, 1000) where id = t.id;
    return jsonb_build_object('ok', true, 'holat', 'rad');
  end if;
  v_holat := 'qollandi';
  if t.tur = 'qoida' then
    update t2_agent_qoida set holat = 'arxiv'
     where holat = 'faol' and doira = t.doira and kompaniya_id is not distinct from t.kompaniya_id and profil_kod is not distinct from t.profil_kod and kod = t.mazmun->>'kod';
    select coalesce(max(versiya), 0) + 1 into v_yangi from t2_agent_qoida
     where doira = t.doira and kompaniya_id is not distinct from t.kompaniya_id and profil_kod is not distinct from t.profil_kod and kod = t.mazmun->>'kod';
    insert into t2_agent_qoida (doira, kompaniya_id, profil_kod, kod, matn, versiya, taklif_id, tasdiqladi)
    values (t.doira, t.kompaniya_id, t.profil_kod, t.mazmun->>'kod', t.mazmun->>'matn', v_yangi, t.id, p_actor_id);
  elsif t.tur = 'manba' then
    v_dom := lower(t.mazmun->>'domen');
    insert into t2_agent_manba (domen, nom, tasdiqladi, taklif_id) values (v_dom, t.mazmun->>'nom', p_actor_id, t.id)
    on conflict (domen) do update set faol = true, nom = excluded.nom, tasdiqladi = excluded.tasdiqladi, taklif_id = excluded.taklif_id;
  elsif t.tur = 'bilim' then
    update t2_agent_bilim set holat = 'arxiv'
     where holat = 'faol' and doira = t.doira and kompaniya_id is not distinct from t.kompaniya_id and kod = t.mazmun->>'kod';
    select coalesce(max(versiya), 0) + 1 into v_yangi from t2_agent_bilim
     where doira = t.doira and kompaniya_id is not distinct from t.kompaniya_id and kod = t.mazmun->>'kod';
    insert into t2_agent_bilim (doira, kompaniya_id, kod, sarlavha, matn, kalit, manba_url, manba_sha256, versiya, taklif_id, tasdiqladi)
    values (t.doira, t.kompaniya_id, t.mazmun->>'kod', t.mazmun->>'sarlavha', t.mazmun->>'matn',
            array(select jsonb_array_elements_text(t.mazmun->'kalit')), left(t.dalil->0->>'url', 1000), left(t.dalil->0->>'sha256', 80), v_yangi, t.id, p_actor_id);
  elsif t.tur = 'rivojlanish' then
    if t.doira = 'global' then
      v_xavf := coalesce(nullif(t.mazmun->>'xavf', ''), 'orta');
      if v_xavf not in ('past','orta','yuqori') then v_xavf := 'orta'; end if;
      insert into t2_agent_buyruq (taklif_id, sarlavha, spec, xavf, avto_birlashtirish, tasdiqladi, jurnal)
      values (t.id, t.sarlavha, t.mazmun, v_xavf, coalesce(p_avto_birlashtirish, false) and v_xavf = 'past', p_actor_id,
              jsonb_build_array(jsonb_build_object('vaqt', now(), 'hodisa', 'tasdiqlandi', 'actor', p_actor_id))) returning id into v_buyruq;
      update t2_agent_signal set buyruq_id = v_buyruq where id in (select (jsonb_array_elements_text(coalesce(t.mazmun->'signal_idlar', '[]'::jsonb)))::bigint);
    else
      v_x := public._t2_agent_tozala_v1(coalesce(t.mazmun->>'tavsif', t.sarlavha), t.kompaniya_id);
      if v_x is not null then
        insert into t2_agent_signal (manba, profil_kod, tur, xulosa, kompaniya_xesh) values ('taklif', t.profil_kod, 'tavsiya', v_x, public._t2_agent_xesh_v1(t.kompaniya_id));
      end if;
    end if;
  end if;
  update t2_agent_taklif set holat = v_holat, qaror_actor = p_actor_id, qaror_vaqt = now(), qaror_izoh = left(p_izoh, 1000) where id = t.id;
  return jsonb_build_object('ok', true, 'holat', v_holat, 'buyruq_id', v_buyruq);
end $$;

-- Faol bilim: global + (kompaniya berilsa) shu kompaniyaniki. Har agent savolida o'qiladi.
create or replace function public.t2_agent_bilim_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.doira, z.id), '[]'::jsonb) into v from (
    select id, doira, kod, sarlavha, matn, kalit, manba_url, versiya from t2_agent_bilim
     where holat = 'faol' and (doira = 'global' or (p_kompaniya_id is not null and kompaniya_id = p_kompaniya_id))
     order by doira, id limit 300) z;
  return jsonb_build_object('ok', true, 'natija', v);
end $$;

-- Umumiy (global) bilim: har qanday kirgan foydalanuvchi o'qiydi (kompaniyasi yo'q «Tizim yordamchisi» uchun). Faqat superadmin tasdiqlagan global yozuvlar — maxfiy ma'lumot yo'q.
create or replace function public.t2_agent_bilim_umumiy_v1(p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public._t2_agent_actor_bor(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.id), '[]'::jsonb) into v from (
    select id, doira, kod, sarlavha, matn, kalit, manba_url, versiya from t2_agent_bilim where holat = 'faol' and doira = 'global' order by id limit 300) z;
  return jsonb_build_object('ok', true, 'natija', v);
end $$;

-- Kuzatiladigan sahifalar (faqat superadmin). Domen tasdiqlangan manbalar ro'yxatida bo'lishi SHART.
create or replace function public.t2_agent_kuzatuv_royxat_v1(p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'GLOBAL_SCOPE_DENIED'); end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.id), '[]'::jsonb) into v from (
    select id, url, domen, nom, maqsad, faol, oxirgi_sha256, oxirgi_vaqt, oxirgi_holat, oxirgi_izoh from t2_agent_kuzatuv_url order by id limit 100) z;
  return jsonb_build_object('ok', true, 'natija', v);
end $$;

create or replace function public.t2_agent_kuzatuv_saqla_v1(p_actor_id bigint, p_url text, p_nom text, p_maqsad text, p_faol boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_dom text; v_id bigint;
begin
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'GLOBAL_SCOPE_DENIED'); end if;
  if p_url is null or p_url !~ '^https://[a-z0-9.-]+(/[^\s]*)?$' or length(p_url) > 1000 or coalesce(length(btrim(p_nom)), 0) not between 2 and 120 then return jsonb_build_object('ok', false, 'code', 'KUZATUV_INVALID'); end if;
  v_dom := lower(substring(p_url from '^https://([^/:]+)'));
  if not exists (select 1 from t2_agent_manba where faol and (v_dom = domen or v_dom like '%.' || domen)) then
    return jsonb_build_object('ok', false, 'code', 'MANBA_TASDIQLANMAGAN', 'xabar', 'Avval bu domenni «Qoidalar va manbalar» da tasdiqlang');
  end if;
  insert into t2_agent_kuzatuv_url (url, domen, nom, maqsad, faol, tasdiqladi) values (p_url, v_dom, btrim(p_nom), left(p_maqsad, 300), coalesce(p_faol, true), p_actor_id)
  on conflict (url) do update set nom = excluded.nom, maqsad = excluded.maqsad, faol = excluded.faol, tasdiqladi = excluded.tasdiqladi
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Server tekshiruvdan keyin natijani yozadi (sha o'zgarsa keyingi safar qayta tahlil qilinadi).
create or replace function public.t2_agent_kuzatuv_belgila_v1(p_actor_id bigint, p_id bigint, p_sha256 text, p_holat text, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'GLOBAL_SCOPE_DENIED'); end if;
  if p_holat not in ('ozgarmadi','yangi','ozgardi','xato') then return jsonb_build_object('ok', false, 'code', 'HOLAT_INVALID'); end if;
  update t2_agent_kuzatuv_url set oxirgi_sha256 = case when p_holat = 'xato' then oxirgi_sha256 else left(p_sha256, 80) end,
    oxirgi_vaqt = now(), oxirgi_holat = p_holat, oxirgi_izoh = left(p_izoh, 300) where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Boshqaruvchi agent holati: bilim, kuzatuv va kutayotgan bilim takliflari (faqat superadmin).
create or replace function public.t2_agent_bilim_holat_v1(p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_veb jsonb;
begin
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'GLOBAL_SCOPE_DENIED'); end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.yaratildi desc), '[]'::jsonb) into v_veb from (
    select url, domen, status, sha256, yaratildi from t2_agent_veb_olish order by id desc limit 10) z;
  return jsonb_build_object('ok', true,
    'bilim_global', (select count(*) from t2_agent_bilim where holat = 'faol' and doira = 'global'),
    'bilim_kompaniya', (select count(*) from t2_agent_bilim where holat = 'faol' and doira = 'company'),
    'bilim_kutilmoqda', (select count(*) from t2_agent_taklif where tur = 'bilim' and holat = 'kutilmoqda'),
    'kuzatuv_jami', (select count(*) from t2_agent_kuzatuv_url where faol),
    'kuzatuv_ozgargan', (select count(*) from t2_agent_kuzatuv_url where faol and oxirgi_holat in ('yangi','ozgardi')),
    'oxirgi_veb', v_veb);
end $$;

revoke all on function public.t2_agent_taklif_yarat_v1(bigint, bigint, text, text, text, text, jsonb, jsonb, bigint), public.t2_agent_taklif_qaror_v1(bigint, bigint, text, text, boolean),
  public.t2_agent_bilim_v1(bigint, bigint), public.t2_agent_bilim_umumiy_v1(bigint), public.t2_agent_kuzatuv_royxat_v1(bigint), public.t2_agent_kuzatuv_saqla_v1(bigint, text, text, text, boolean),
  public.t2_agent_kuzatuv_belgila_v1(bigint, bigint, text, text, text), public.t2_agent_bilim_holat_v1(bigint) from public, anon, authenticated;
grant execute on function public.t2_agent_taklif_yarat_v1(bigint, bigint, text, text, text, text, jsonb, jsonb, bigint), public.t2_agent_taklif_qaror_v1(bigint, bigint, text, text, boolean),
  public.t2_agent_bilim_v1(bigint, bigint), public.t2_agent_bilim_umumiy_v1(bigint), public.t2_agent_kuzatuv_royxat_v1(bigint), public.t2_agent_kuzatuv_saqla_v1(bigint, text, text, text, boolean),
  public.t2_agent_kuzatuv_belgila_v1(bigint, bigint, text, text, text), public.t2_agent_bilim_holat_v1(bigint) to service_role;
