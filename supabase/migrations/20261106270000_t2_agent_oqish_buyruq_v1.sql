-- AI o'rganish tsikli: foydalanuvchi fikri/skrinshoti + quyi agent signallari -> TOZALANGAN signal -> rivojlantiruvchi agent taklifi
-- -> admin tasdig'i -> ISH BUYRUG'I (ijrochi PR ochadi). Tenant xavfsizligi: global agent faqat tozalangan xulosa va hisobni ko'radi.
set local statement_timeout = '60s';

create table if not exists public.t2_agent_fikr (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  actor_id bigint not null,
  tur text not null check (tur in ('muammo','fikr','etiroz','savol')),
  matn text not null check (length(matn) between 3 and 4000),
  sahifa text check (sahifa is null or length(sahifa) <= 200),
  skrin_hujjat_ids bigint[] not null default '{}' check (cardinality(skrin_hujjat_ids) <= 3),
  ai_javob text,
  umumiy_xulosa text check (umumiy_xulosa is null or length(umumiy_xulosa) <= 500),
  global_ulashish boolean not null default false,
  holat text not null default 'yangi' check (holat in ('yangi','korilgan','yopilgan')),
  yaratildi timestamptz not null default now()
);
create index if not exists t2_agent_fikr_komp_ix on public.t2_agent_fikr (kompaniya_id, yaratildi desc);

create table if not exists public.t2_agent_signal (
  id bigint generated always as identity primary key,
  manba text not null check (manba in ('fikr','agent','tizim','taklif')),
  profil_kod text references public.t2_agent_profile(kod),
  sahifa text check (sahifa is null or length(sahifa) <= 200),
  tur text not null check (tur ~ '^[a-z_]{3,30}$'),
  xulosa text not null check (length(xulosa) between 5 and 500),
  kompaniya_xesh text not null,
  buyruq_id bigint,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_agent_signal_ix on public.t2_agent_signal (yaratildi desc) where buyruq_id is null;

create table if not exists public.t2_agent_buyruq (
  id bigint generated always as identity primary key,
  taklif_id bigint not null unique references public.t2_agent_taklif(id),
  sarlavha text not null,
  spec jsonb not null,
  xavf text not null default 'orta' check (xavf in ('past','orta','yuqori')),
  avto_birlashtirish boolean not null default false,
  holat text not null default 'navbat' check (holat in ('navbat','bajarilmoqda','pr_ochildi','birlashtirildi','muvaffaqiyatsiz','bekor')),
  ijrochi text,
  pr_url text,
  github_issue integer,
  tasdiqladi bigint not null,
  jurnal jsonb not null default '[]'::jsonb,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  check (not (avto_birlashtirish and xavf <> 'past'))
);

alter table public.t2_agent_fikr enable row level security;
alter table public.t2_agent_signal enable row level security;
alter table public.t2_agent_buyruq enable row level security;
revoke all on public.t2_agent_fikr, public.t2_agent_signal, public.t2_agent_buyruq from public, anon, authenticated;

-- Tozalash: tenant ma'lumoti global qatlamga o'tmasin. Shubhali bo'lsa NULL (ulashilmaydi) — fail-closed.
create or replace function public._t2_agent_tozala_v1(p_matn text, p_kompaniya_id bigint) returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare v text := btrim(coalesce(p_matn, '')); v_nom text;
begin
  if length(v) < 5 or length(v) > 500 then return null; end if;
  if v ~* '[a-z0-9._%+-]+@[a-z0-9.-]+' or v ~* '(https?://|www\.)' or v ~ '[0-9]{4,}' or v ~ '\+?[0-9][0-9 ()-]{7,}[0-9]' then return null; end if;
  select nom into v_nom from t2_kompaniya where id = p_kompaniya_id;
  if v_nom is not null and length(v_nom) >= 3 and position(lower(v_nom) in lower(v)) > 0 then return null; end if;
  if exists (select 1 from t2_obyekt o where o.kompaniya_id = p_kompaniya_id and length(o.nom) >= 4 and position(lower(o.nom) in lower(v)) > 0) then return null; end if;
  return v;
end $$;

create or replace function public._t2_agent_xesh_v1(p_kompaniya_id bigint) returns text language sql immutable set search_path = public, pg_temp as $$
  select md5('t2-agent-signal:' || p_kompaniya_id::text)
$$;

create or replace function public.t2_agent_fikr_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_tur text, p_matn text, p_sahifa text,
  p_skrin_ids bigint[], p_ai_javob text, p_umumiy_xulosa text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_id bigint; v_x text; v_n int;
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_tur not in ('muammo','fikr','etiroz','savol') or coalesce(length(btrim(p_matn)), 0) not between 3 and 4000 then return jsonb_build_object('ok', false, 'code', 'FIKR_INVALID'); end if;
  p_skrin_ids := coalesce(p_skrin_ids, '{}');
  if cardinality(p_skrin_ids) > 3 then return jsonb_build_object('ok', false, 'code', 'SKRIN_KOP'); end if;
  if cardinality(p_skrin_ids) > 0 then
    select count(*) into v_n from t2_document_registry where id = any(p_skrin_ids) and kompaniya_id = p_kompaniya_id;
    if v_n <> cardinality(p_skrin_ids) then return jsonb_build_object('ok', false, 'code', 'SKRIN_BEGONA'); end if;
  end if;
  -- kuniga 50 tadan ortiq fikr — suiiste'mol
  select count(*) into v_n from t2_agent_fikr where kompaniya_id = p_kompaniya_id and yaratildi > now() - interval '1 day';
  if v_n >= 50 then return jsonb_build_object('ok', false, 'code', 'LIMIT'); end if;
  v_x := public._t2_agent_tozala_v1(p_umumiy_xulosa, p_kompaniya_id);
  insert into t2_agent_fikr (kompaniya_id, actor_id, tur, matn, sahifa, skrin_hujjat_ids, ai_javob, umumiy_xulosa, global_ulashish)
  values (p_kompaniya_id, p_actor_id, p_tur, btrim(p_matn), left(p_sahifa, 200), p_skrin_ids, left(p_ai_javob, 8000), v_x, v_x is not null) returning id into v_id;
  if v_x is not null then
    insert into t2_agent_signal (manba, sahifa, tur, xulosa, kompaniya_xesh) values ('fikr', left(p_sahifa, 200), p_tur, v_x, public._t2_agent_xesh_v1(p_kompaniya_id));
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'ulashildi', v_x is not null);
end $$;

create or replace function public.t2_agent_fikr_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.id desc), '[]') into v from (
    select id, tur, matn, sahifa, ai_javob, holat, global_ulashish, yaratildi from t2_agent_fikr where kompaniya_id = p_kompaniya_id order by id desc limit 100) z;
  return jsonb_build_object('ok', true, 'natija', v);
end $$;

-- Quyi agent signali (masalan: mos material topilmadi, F2 qatori izohsiz, doimiy xato) — tozalangan holda
create or replace function public.t2_agent_signal_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_profil text, p_sahifa text, p_tur text, p_xulosa text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_x text;
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_tur is null or p_tur !~ '^[a-z_]{3,30}$' then return jsonb_build_object('ok', false, 'code', 'SIGNAL_INVALID'); end if;
  if p_profil is not null and not exists (select 1 from t2_agent_profile where kod = p_profil) then return jsonb_build_object('ok', false, 'code', 'PROFIL_YOQ'); end if;
  v_x := public._t2_agent_tozala_v1(p_xulosa, p_kompaniya_id);
  if v_x is null then return jsonb_build_object('ok', true, 'ulashildi', false); end if;
  insert into t2_agent_signal (manba, profil_kod, sahifa, tur, xulosa, kompaniya_xesh) values ('agent', p_profil, left(p_sahifa, 200), p_tur, v_x, public._t2_agent_xesh_v1(p_kompaniya_id));
  return jsonb_build_object('ok', true, 'ulashildi', true);
end $$;

-- Rivojlantiruvchi (GLOBAL) agent uchun: faqat tozalangan xulosa + hisob. Kompaniya identifikatori YO'Q.
create or replace function public.t2_agent_rivojlanish_yigish_v1(p_actor_id bigint, p_kun integer default 30)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, null);
  if not (g->>'ok')::boolean then return g; end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.soni desc), '[]') into v from (
    select coalesce(sahifa, '-') sahifa, tur, count(*) soni, count(distinct kompaniya_xesh) kompaniya_soni,
           (array_agg(xulosa order by id desc))[1:3] namunalar, array_agg(id) signal_idlar
      from t2_agent_signal where buyruq_id is null and yaratildi > now() - make_interval(days => greatest(1, least(coalesce(p_kun, 30), 180)))
     group by 1, 2 order by count(*) desc limit 30) z;
  return jsonb_build_object('ok', true, 'natija', v);
end $$;

-- Taklif qarori: rivojlanish — GLOBAL tasdiqlansa ISH BUYRUG'I yaratiladi; kompaniya doirasidagi rivojlanish tozalangan signalga aylanadi.
drop function if exists public.t2_agent_taklif_qaror_v1(bigint, bigint, text, text);
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
  elsif t.tur = 'rivojlanish' then
    if t.doira = 'global' then
      v_xavf := coalesce(nullif(t.mazmun->>'xavf', ''), 'orta');
      if v_xavf not in ('past','orta','yuqori') then v_xavf := 'orta'; end if;
      insert into t2_agent_buyruq (taklif_id, sarlavha, spec, xavf, avto_birlashtirish, tasdiqladi, jurnal)
      values (t.id, t.sarlavha, t.mazmun, v_xavf, coalesce(p_avto_birlashtirish, false) and v_xavf = 'past', p_actor_id,
              jsonb_build_array(jsonb_build_object('vaqt', now(), 'hodisa', 'tasdiqlandi', 'actor', p_actor_id))) returning id into v_buyruq;
      update t2_agent_signal set buyruq_id = v_buyruq where id in (select (jsonb_array_elements_text(coalesce(t.mazmun->'signal_idlar', '[]'::jsonb)))::bigint);
      v_holat := 'qollandi';
    else
      -- kompaniya darajasidagi g'oya umumiy kodni o'zgartirmaydi: tozalangan signal sifatida platforma agentiga uzatiladi
      v_x := public._t2_agent_tozala_v1(coalesce(t.mazmun->>'tavsif', t.sarlavha), t.kompaniya_id);
      if v_x is not null then
        insert into t2_agent_signal (manba, profil_kod, tur, xulosa, kompaniya_xesh) values ('taklif', t.profil_kod, 'tavsiya', v_x, public._t2_agent_xesh_v1(t.kompaniya_id));
      end if;
    end if;
  end if;
  update t2_agent_taklif set holat = v_holat, qaror_actor = p_actor_id, qaror_vaqt = now(), qaror_izoh = left(p_izoh, 1000) where id = t.id;
  return jsonb_build_object('ok', true, 'holat', v_holat, 'buyruq_id', v_buyruq);
end $$;

create or replace function public.t2_agent_buyruq_royxat_v1(p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, null);
  if not (g->>'ok')::boolean then return g; end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.id desc), '[]') into v from (
    select id, taklif_id, sarlavha, spec, xavf, avto_birlashtirish, holat, ijrochi, pr_url, github_issue, jurnal, yaratildi, yangilandi from t2_agent_buyruq order by id desc limit 100) z;
  return jsonb_build_object('ok', true, 'natija', v);
end $$;

-- Ijrochi holatini yangilaydi (superadmin yoki keyinroq imzolangan ijrochi chaqiruvi).
create or replace function public.t2_agent_buyruq_holat_v1(p_actor_id bigint, p_id bigint, p_holat text, p_pr_url text default null, p_issue integer default null, p_izoh text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; b public.t2_agent_buyruq%rowtype;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, null);
  if not (g->>'ok')::boolean then return g; end if;
  if p_holat not in ('navbat','bajarilmoqda','pr_ochildi','birlashtirildi','muvaffaqiyatsiz','bekor') then return jsonb_build_object('ok', false, 'code', 'HOLAT_INVALID'); end if;
  if p_pr_url is not null and p_pr_url !~ '^https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/pull/[0-9]+$' then return jsonb_build_object('ok', false, 'code', 'PR_URL_INVALID'); end if;
  select * into b from t2_agent_buyruq where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if b.holat in ('birlashtirildi','bekor') then return jsonb_build_object('ok', false, 'code', 'YAKUNLANGAN'); end if;
  update t2_agent_buyruq set holat = p_holat, pr_url = coalesce(p_pr_url, pr_url), github_issue = coalesce(p_issue, github_issue), yangilandi = now(),
    jurnal = jurnal || jsonb_build_array(jsonb_build_object('vaqt', now(), 'hodisa', p_holat, 'actor', p_actor_id, 'izoh', left(p_izoh, 500))) where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public._t2_agent_tozala_v1(text, bigint), public._t2_agent_xesh_v1(bigint),
  public.t2_agent_fikr_yoz_v1(bigint, bigint, text, text, text, bigint[], text, text), public.t2_agent_fikr_royxat_v1(bigint, bigint),
  public.t2_agent_signal_yoz_v1(bigint, bigint, text, text, text, text), public.t2_agent_rivojlanish_yigish_v1(bigint, integer),
  public.t2_agent_taklif_qaror_v1(bigint, bigint, text, text, boolean), public.t2_agent_buyruq_royxat_v1(bigint),
  public.t2_agent_buyruq_holat_v1(bigint, bigint, text, text, integer, text) from public, anon, authenticated;
grant execute on function public._t2_agent_tozala_v1(text, bigint), public._t2_agent_xesh_v1(bigint),
  public.t2_agent_fikr_yoz_v1(bigint, bigint, text, text, text, bigint[], text, text), public.t2_agent_fikr_royxat_v1(bigint, bigint),
  public.t2_agent_signal_yoz_v1(bigint, bigint, text, text, text, text), public.t2_agent_rivojlanish_yigish_v1(bigint, integer),
  public.t2_agent_taklif_qaror_v1(bigint, bigint, text, text, boolean), public.t2_agent_buyruq_royxat_v1(bigint),
  public.t2_agent_buyruq_holat_v1(bigint, bigint, text, text, integer, text) to service_role;
