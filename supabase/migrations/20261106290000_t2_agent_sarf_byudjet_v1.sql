-- AI XARAJAT NAZORATI: har model chaqiruvi hisobga olinadi, oylik LIMIT (platforma + kompaniya), limit yo'q = AI ISHLAMAYDI (default-deny).
-- + AI MARKAZI uchun yig'ma ko'rinish (faqat superadmin) va kompaniya o'z xarajati hisoboti.
set local statement_timeout = '60s';

alter table public.t2_agent_model_katalog add column if not exists narx_kirish_usd numeric(12,6) check (narx_kirish_usd is null or narx_kirish_usd >= 0);
alter table public.t2_agent_model_katalog add column if not exists narx_chiqish_usd numeric(12,6) check (narx_chiqish_usd is null or narx_chiqish_usd >= 0);

create table if not exists public.t2_agent_sarf (
  id bigint generated always as identity primary key,
  vaqt timestamptz not null default now(),
  kompaniya_id bigint references public.t2_kompaniya(id) on delete set null,
  actor_id bigint not null,
  profil_kod text,
  amal text not null check (amal ~ '^[a-z_]{2,30}$'),
  model_id text,
  kirish_token integer not null default 0 check (kirish_token >= 0),
  chiqish_token integer not null default 0 check (chiqish_token >= 0),
  narx_usd numeric(12,6),
  manba text not null default 'hisob' check (manba in ('provayder','katalog','hisob')),
  muvaffaqiyat boolean not null default true
);
create index if not exists t2_agent_sarf_vaqt_ix on public.t2_agent_sarf (vaqt desc);
create index if not exists t2_agent_sarf_komp_ix on public.t2_agent_sarf (kompaniya_id, vaqt desc);

create table if not exists public.t2_agent_byudjet (
  id bigint generated always as identity primary key,
  kompaniya_id bigint references public.t2_kompaniya(id) on delete cascade, -- NULL = platforma umumiy limiti
  oylik_limit_usd numeric(10,2) not null check (oylik_limit_usd >= 0),
  ogohlantirish_foiz integer not null default 80 check (ogohlantirish_foiz between 1 and 100),
  faol boolean not null default true,
  actor_id bigint not null,
  yangilandi timestamptz not null default now()
);
create unique index if not exists t2_agent_byudjet_uq on public.t2_agent_byudjet (coalesce(kompaniya_id, 0));

alter table public.t2_agent_sarf enable row level security;
alter table public.t2_agent_byudjet enable row level security;
revoke all on public.t2_agent_sarf, public.t2_agent_byudjet from public, anon, authenticated;

-- Katalog yozuviga narx maydonlari (yangi imzo; eskisi o'chiriladi)
drop function if exists public.t2_agent_model_katalog_yoz_v1(bigint, text, text, text, text, boolean, boolean);
create or replace function public.t2_agent_model_katalog_yoz_v1(p_actor_id bigint, p_id text, p_nom text, p_tavsif text, p_narx_izoh text, p_vision boolean, p_faol boolean,
  p_narx_kirish numeric default null, p_narx_chiqish numeric default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, null);
  if not (g->>'ok')::boolean then return g; end if;
  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._:-]*$' or length(p_id) > 120 or coalesce(length(btrim(p_nom)), 0) not between 2 and 100
     or coalesce(p_narx_kirish, 0) < 0 or coalesce(p_narx_chiqish, 0) < 0 or coalesce(p_narx_kirish, 0) > 1000 or coalesce(p_narx_chiqish, 0) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'MODEL_INVALID');
  end if;
  insert into t2_agent_model_katalog (id, nom, tavsif, narx_izoh, vision, faol, tasdiqladi, narx_kirish_usd, narx_chiqish_usd)
  values (p_id, btrim(p_nom), left(p_tavsif, 400), left(p_narx_izoh, 200), coalesce(p_vision, false), coalesce(p_faol, true), p_actor_id, p_narx_kirish, p_narx_chiqish)
  on conflict (id) do update set nom = excluded.nom, tavsif = excluded.tavsif, narx_izoh = excluded.narx_izoh, vision = excluded.vision, faol = excluded.faol,
    tasdiqladi = excluded.tasdiqladi, narx_kirish_usd = excluded.narx_kirish_usd, narx_chiqish_usd = excluded.narx_chiqish_usd;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.t2_agent_byudjet_belgila_v1(p_actor_id bigint, p_kompaniya_id bigint, p_limit_usd numeric, p_ogoh_foiz integer default 80, p_faol boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, null);
  if not (g->>'ok')::boolean then return g; end if;
  if p_limit_usd is null or p_limit_usd < 0 or p_limit_usd > 100000 or coalesce(p_ogoh_foiz, 80) not between 1 and 100 then return jsonb_build_object('ok', false, 'code', 'BYUDJET_INVALID'); end if;
  if p_kompaniya_id is not null and not exists (select 1 from t2_kompaniya where id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_YOQ'); end if;
  insert into t2_agent_byudjet (kompaniya_id, oylik_limit_usd, ogohlantirish_foiz, faol, actor_id) values (p_kompaniya_id, p_limit_usd, coalesce(p_ogoh_foiz, 80), coalesce(p_faol, true), p_actor_id)
  on conflict (coalesce(kompaniya_id, 0)) do update set oylik_limit_usd = excluded.oylik_limit_usd, ogohlantirish_foiz = excluded.ogohlantirish_foiz, faol = excluded.faol, actor_id = excluded.actor_id, yangilandi = now();
  return jsonb_build_object('ok', true);
end $$;

-- Oy boshidan sarf (platforma yoki kompaniya)
create or replace function public._t2_agent_oy_sarfi_v1(p_kompaniya_id bigint) returns numeric language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(narx_usd), 0) from t2_agent_sarf
   where vaqt >= date_trunc('month', now()) and (p_kompaniya_id is null or kompaniya_id = p_kompaniya_id)
$$;

-- AI chaqiruvidan OLDIN: limit tekshiruvi. Platforma limiti belgilanmagan/nofaol bo'lsa — RAD (default-deny). Kompaniya limiti bo'lsa u ham.
create or replace function public.t2_agent_sarf_tekshir_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; pl public.t2_agent_byudjet%rowtype; ko public.t2_agent_byudjet%rowtype; v_pl numeric; v_ko numeric;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select * into pl from t2_agent_byudjet where kompaniya_id is null;
  if not found or not pl.faol then return jsonb_build_object('ok', false, 'code', 'BYUDJET_YOQ', 'xabar', 'AI uchun oylik limit belgilanmagan'); end if;
  v_pl := public._t2_agent_oy_sarfi_v1(null);
  if v_pl >= pl.oylik_limit_usd then return jsonb_build_object('ok', false, 'code', 'BYUDJET_TUGADI', 'doira', 'platforma', 'xabar', 'AI ning platforma oylik limiti tugadi'); end if;
  if p_kompaniya_id is not null then
    select * into ko from t2_agent_byudjet where kompaniya_id = p_kompaniya_id and faol;
    if found then
      v_ko := public._t2_agent_oy_sarfi_v1(p_kompaniya_id);
      if v_ko >= ko.oylik_limit_usd then return jsonb_build_object('ok', false, 'code', 'BYUDJET_TUGADI', 'doira', 'kompaniya', 'xabar', 'Kompaniyaning AI oylik limiti tugadi'); end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'platforma_qoldi_usd', pl.oylik_limit_usd - v_pl, 'ogohlantirish', v_pl >= pl.oylik_limit_usd * pl.ogohlantirish_foiz / 100.0);
end $$;

-- Chaqiruvdan KEYIN: haqiqiy sarf. Narx manbai: provayder (OpenRouter usage.cost) > katalog narxi (token * narx/1M) > noma'lum (hisob).
create or replace function public.t2_agent_sarf_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_profil text, p_amal text, p_model text,
  p_kirish integer, p_chiqish integer, p_narx_usd numeric default null, p_muvaffaqiyat boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_narx numeric; v_manba text := 'hisob'; k public.t2_agent_model_katalog%rowtype;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_amal is null or p_amal !~ '^[a-z_]{2,30}$' then return jsonb_build_object('ok', false, 'code', 'AMAL_INVALID'); end if;
  if p_narx_usd is not null and p_narx_usd >= 0 and p_narx_usd < 1000 then v_narx := p_narx_usd; v_manba := 'provayder';
  elsif p_model is not null then
    select * into k from t2_agent_model_katalog where id = p_model;
    if found and k.narx_kirish_usd is not null and k.narx_chiqish_usd is not null then
      v_narx := (greatest(coalesce(p_kirish, 0), 0) * k.narx_kirish_usd + greatest(coalesce(p_chiqish, 0), 0) * k.narx_chiqish_usd) / 1000000.0; v_manba := 'katalog';
    end if;
  end if;
  insert into t2_agent_sarf (kompaniya_id, actor_id, profil_kod, amal, model_id, kirish_token, chiqish_token, narx_usd, manba, muvaffaqiyat)
  values (p_kompaniya_id, p_actor_id, left(p_profil, 40), p_amal, left(p_model, 120), greatest(coalesce(p_kirish, 0), 0), greatest(coalesce(p_chiqish, 0), 0), v_narx, v_manba, coalesce(p_muvaffaqiyat, true));
  return jsonb_build_object('ok', true, 'narx_usd', v_narx, 'manba', v_manba);
end $$;

-- Kompaniya o'z AI xarajatini ko'radi (faqat o'zinikini)
create or replace function public.t2_agent_sarf_hisobot_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_agent jsonb; v_kun jsonb; ko public.t2_agent_byudjet%rowtype; v_bor boolean;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  select * into ko from t2_agent_byudjet where kompaniya_id = p_kompaniya_id;
  v_bor := found;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.narx_usd desc nulls last), '[]') into v_agent from (
    select coalesce(profil_kod, '-') profil, count(*) chaqiruv, coalesce(sum(narx_usd), 0) narx_usd from t2_agent_sarf
     where kompaniya_id = p_kompaniya_id and vaqt >= date_trunc('month', now()) group by 1) z;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.kun), '[]') into v_kun from (
    select vaqt::date kun, coalesce(sum(narx_usd), 0) narx_usd, count(*) chaqiruv from t2_agent_sarf
     where kompaniya_id = p_kompaniya_id and vaqt >= now() - interval '14 days' group by 1) z;
  return jsonb_build_object('ok', true, 'oy_sarfi_usd', public._t2_agent_oy_sarfi_v1(p_kompaniya_id), 'limit_usd', case when v_bor then ko.oylik_limit_usd end, 'agentlar', v_agent, 'kunlar', v_kun);
end $$;

-- AI MARKAZI: butun platforma yig'ma ko'rinishi (faqat superadmin)
create or replace function public.t2_agent_markaz_v1(p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; pl public.t2_agent_byudjet%rowtype; v_bor boolean; v_kun jsonb; v_prof jsonb; v_model jsonb; v_komp jsonb; v_son jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, null);
  if not (g->>'ok')::boolean then return g; end if;
  select * into pl from t2_agent_byudjet where kompaniya_id is null;
  v_bor := found;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.kun), '[]') into v_kun from (
    select vaqt::date kun, coalesce(sum(narx_usd), 0) narx_usd, count(*) chaqiruv from t2_agent_sarf where vaqt >= now() - interval '14 days' group by 1) z;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.narx_usd desc nulls last), '[]') into v_prof from (
    select coalesce(profil_kod, '-') profil, amal, count(*) chaqiruv, coalesce(sum(narx_usd), 0) narx_usd, coalesce(sum(kirish_token + chiqish_token), 0) token
      from t2_agent_sarf where vaqt >= date_trunc('month', now()) group by 1, 2 order by 4 desc limit 20) z;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.narx_usd desc nulls last), '[]') into v_model from (
    select coalesce(model_id, '-') model, count(*) chaqiruv, coalesce(sum(narx_usd), 0) narx_usd, count(*) filter (where narx_usd is null) narxsiz
      from t2_agent_sarf where vaqt >= date_trunc('month', now()) group by 1 order by 3 desc limit 20) z;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.narx_usd desc nulls last), '[]') into v_komp from (
    select s.kompaniya_id, k.nom, coalesce(sum(s.narx_usd), 0) narx_usd, count(*) chaqiruv, b.oylik_limit_usd limit_usd
      from t2_agent_sarf s left join t2_kompaniya k on k.id = s.kompaniya_id left join t2_agent_byudjet b on b.kompaniya_id = s.kompaniya_id
     where s.vaqt >= date_trunc('month', now()) group by s.kompaniya_id, k.nom, b.oylik_limit_usd order by 3 desc limit 10) z;
  select jsonb_build_object(
    'taklif_kutilmoqda', (select count(*) from t2_agent_taklif where holat = 'kutilmoqda'),
    'buyruq_navbat', (select count(*) from t2_agent_buyruq where holat = 'navbat'),
    'buyruq_ishda', (select count(*) from t2_agent_buyruq where holat in ('bajarilmoqda','pr_ochildi')),
    'buyruq_bitgan', (select count(*) from t2_agent_buyruq where holat = 'birlashtirildi'),
    'signal_yangi', (select count(*) from t2_agent_signal where buyruq_id is null),
    'fikr_30kun', (select count(*) from t2_agent_fikr where yaratildi > now() - interval '30 days'),
    'qoida_faol', (select count(*) from t2_agent_qoida where holat = 'faol'),
    'manba_faol', (select count(*) from t2_agent_manba where faol),
    'agent_soni', (select count(*) from t2_agent_profile where holat = 'active'),
    'model_soni', (select count(*) from t2_agent_model_katalog where faol)) into v_son;
  return jsonb_build_object('ok', true, 'oy_sarfi_usd', public._t2_agent_oy_sarfi_v1(null), 'limit_usd', case when v_bor then pl.oylik_limit_usd end,
    'ogohlantirish_foiz', case when v_bor then pl.ogohlantirish_foiz end, 'limit_faol', v_bor and pl.faol,
    'kunlar', v_kun, 'agentlar', v_prof, 'modellar', v_model, 'kompaniyalar', v_komp, 'sonlar', v_son);
end $$;

-- Veb-manbani o'chirish/yoqish (superadmin)
create or replace function public.t2_agent_manba_holat_v1(p_actor_id bigint, p_domen text, p_faol boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, null);
  if not (g->>'ok')::boolean then return g; end if;
  update t2_agent_manba set faol = coalesce(p_faol, false) where domen = lower(coalesce(p_domen, ''));
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.t2_agent_model_katalog_yoz_v1(bigint, text, text, text, text, boolean, boolean, numeric, numeric),
  public.t2_agent_byudjet_belgila_v1(bigint, bigint, numeric, integer, boolean), public._t2_agent_oy_sarfi_v1(bigint),
  public.t2_agent_sarf_tekshir_v1(bigint, bigint), public.t2_agent_sarf_yoz_v1(bigint, bigint, text, text, text, integer, integer, numeric, boolean),
  public.t2_agent_sarf_hisobot_v1(bigint, bigint), public.t2_agent_markaz_v1(bigint), public.t2_agent_manba_holat_v1(bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.t2_agent_model_katalog_yoz_v1(bigint, text, text, text, text, boolean, boolean, numeric, numeric),
  public.t2_agent_byudjet_belgila_v1(bigint, bigint, numeric, integer, boolean), public._t2_agent_oy_sarfi_v1(bigint),
  public.t2_agent_sarf_tekshir_v1(bigint, bigint), public.t2_agent_sarf_yoz_v1(bigint, bigint, text, text, text, integer, integer, numeric, boolean),
  public.t2_agent_sarf_hisobot_v1(bigint, bigint), public.t2_agent_markaz_v1(bigint), public.t2_agent_manba_holat_v1(bigint, text, boolean) to service_role;

-- Modellar ro'yxati: katalogda NARXLAR ham ko'rinadi (kompaniya/superadmin qarorni narxga qarab qabul qiladi)
create or replace function public.t2_agent_modellar_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_agent jsonb; v_kat jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.kod), '[]') into v_agent from (
    select p.kod, p.nom, p.rol, p.izoh, p.permission_mode, p.default_scope, p.holat,
           coalesce(k.model_id, pl.model_id) as model_id,
           case when k.model_id is not null then 'kompaniya' when pl.model_id is not null then 'platforma' else 'standart' end as model_manba
      from t2_agent_profile p
      left join t2_agent_model_tanlov k on k.profil_kod = p.kod and p_kompaniya_id is not null and k.kompaniya_id = p_kompaniya_id
      left join t2_agent_model_tanlov pl on pl.profil_kod = p.kod and pl.kompaniya_id is null
     where p.holat = 'active' and (p_kompaniya_id is null or p.default_scope <> 'global')) z;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'tavsif', tavsif, 'narx_izoh', narx_izoh, 'vision', vision,
           'narx_kirish_usd', narx_kirish_usd, 'narx_chiqish_usd', narx_chiqish_usd) order by nom), '[]') into v_kat from t2_agent_model_katalog where faol;
  return jsonb_build_object('ok', true, 'rol', g->>'rol', 'tanlash_mumkin', public._t2_agent_qaror_rol_ok(g->>'rol'), 'agentlar', v_agent, 'katalog', v_kat);
end $$;
revoke all on function public.t2_agent_modellar_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_agent_modellar_v1(bigint, bigint) to service_role;
