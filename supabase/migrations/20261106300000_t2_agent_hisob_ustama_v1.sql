-- AI HISOB-KITOB: provayder haqiqiy sarfi (USD) × (1 + USTAMA%) → mijoz narxi → so'm → TOKEN, kompaniya hamyonidan yechiladi.
-- Misol: provayder $5 sarfladi, ustama 40% → mijozga $7.00 (= $7 × usd_kurs / token_som token). Ustama: platforma standarti + kompaniyaga alohida.
-- Kompaniya faqat TOKEN sarfini ko'radi (provayder narxi va ustama ko'rinmaydi); superadmin — tannarx, mijoz narxi va foydani ko'radi.
set local statement_timeout = '60s';

alter table public.t2_token_sozlama add column if not exists ai_ustama_foiz numeric(6,2) not null default 40 check (ai_ustama_foiz >= 0 and ai_ustama_foiz <= 1000);

create table if not exists public.t2_agent_ustama (
  kompaniya_id bigint primary key references public.t2_kompaniya(id) on delete cascade,
  foiz numeric(6,2) not null check (foiz >= 0 and foiz <= 1000),
  actor_id bigint not null,
  yangilandi timestamptz not null default now()
);
alter table public.t2_agent_ustama enable row level security;
revoke all on public.t2_agent_ustama from public, anon, authenticated;

alter table public.t2_agent_sarf add column if not exists mijoz_usd numeric(12,6);
alter table public.t2_agent_sarf add column if not exists mijoz_token numeric(14,2);
alter table public.t2_agent_sarf add column if not exists ustama_foiz numeric(6,2);

create or replace function public.t2_agent_ustama_belgila_v1(p_actor_id bigint, p_kompaniya_id bigint, p_foiz numeric)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, null);
  if not (g->>'ok')::boolean then return g; end if;
  if p_foiz is not null and (p_foiz < 0 or p_foiz > 1000) then return jsonb_build_object('ok', false, 'code', 'USTAMA_INVALID'); end if;
  if p_kompaniya_id is null then
    if p_foiz is null then return jsonb_build_object('ok', false, 'code', 'USTAMA_INVALID'); end if;
    update t2_token_sozlama set ai_ustama_foiz = p_foiz, yangilandi = now() where id = 1;
  elsif p_foiz is null then
    delete from t2_agent_ustama where kompaniya_id = p_kompaniya_id;
  else
    if not exists (select 1 from t2_kompaniya where id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_YOQ'); end if;
    insert into t2_agent_ustama (kompaniya_id, foiz, actor_id) values (p_kompaniya_id, p_foiz, p_actor_id)
    on conflict (kompaniya_id) do update set foiz = excluded.foiz, actor_id = excluded.actor_id, yangilandi = now();
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Samarali ustama: kompaniya alohida > platforma standarti
create or replace function public._t2_agent_ustama_v1(p_kompaniya_id bigint) returns numeric language sql stable set search_path = public, pg_temp as $$
  select coalesce((select foiz from t2_agent_ustama where kompaniya_id = p_kompaniya_id), (select ai_ustama_foiz from t2_token_sozlama where id = 1), 40)
$$;

-- Chaqiruvdan OLDIN: limit + (kompaniya uchun) hamyonda token borligi
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
    if public.t2_token_balans(p_kompaniya_id) <= 0 then return jsonb_build_object('ok', false, 'code', 'TOKEN_YETMAYDI', 'xabar', 'Tokenlar yetarli emas — hisobni to''ldiring'); end if;
  end if;
  return jsonb_build_object('ok', true, 'platforma_qoldi_usd', pl.oylik_limit_usd - v_pl, 'ogohlantirish', v_pl >= pl.oylik_limit_usd * pl.ogohlantirish_foiz / 100.0);
end $$;

-- Chaqiruvdan KEYIN: haqiqiy sarf + mijoz narxi + token yechish (bitta tranzaksiyada)
create or replace function public.t2_agent_sarf_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_profil text, p_amal text, p_model text,
  p_kirish integer, p_chiqish integer, p_narx_usd numeric default null, p_muvaffaqiyat boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_narx numeric; v_manba text := 'hisob'; k public.t2_agent_model_katalog%rowtype; s public.t2_token_sozlama%rowtype;
  v_ust numeric; v_mijoz numeric; v_token numeric; v_som numeric;
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
  if p_kompaniya_id is not null and v_narx is not null and v_narx > 0 then
    select * into s from t2_token_sozlama where id = 1;
    v_ust := public._t2_agent_ustama_v1(p_kompaniya_id);
    v_mijoz := round(v_narx * (1 + v_ust / 100.0), 6);
    v_som := v_mijoz * s.usd_kurs;
    v_token := greatest(ceil(v_som / s.token_som), 1);
  end if;
  insert into t2_agent_sarf (kompaniya_id, actor_id, profil_kod, amal, model_id, kirish_token, chiqish_token, narx_usd, manba, muvaffaqiyat, mijoz_usd, mijoz_token, ustama_foiz)
  values (p_kompaniya_id, p_actor_id, left(p_profil, 40), p_amal, left(p_model, 120), greatest(coalesce(p_kirish, 0), 0), greatest(coalesce(p_chiqish, 0), 0), v_narx, v_manba, coalesce(p_muvaffaqiyat, true), v_mijoz, v_token, v_ust);
  if v_token is not null then
    insert into t2_token_harakat (kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, birlik_soni, meta, operation_id)
    values (p_kompaniya_id, p_actor_id, -v_token, 'sarf', 'ai_sarf', null,
            jsonb_build_object('profil', p_profil, 'amal', p_amal, 'model', p_model, 'tannarx_usd', v_narx, 'ustama_foiz', v_ust, 'mijoz_usd', v_mijoz, 'usd_kurs', s.usd_kurs, 'token_som', s.token_som),
            gen_random_uuid());
  end if;
  return jsonb_build_object('ok', true, 'narx_usd', v_narx, 'manba', v_manba, 'mijoz_usd', v_mijoz, 'token', v_token);
end $$;

-- KOMPANIYA hisoboti: faqat TOKEN (tannarx va ustama ko'rinmaydi)
create or replace function public.t2_agent_sarf_hisobot_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_agent jsonb; v_kun jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.token desc nulls last), '[]') into v_agent from (
    select coalesce(profil_kod, '-') profil, count(*) chaqiruv, coalesce(sum(mijoz_token), 0) token from t2_agent_sarf
     where kompaniya_id = p_kompaniya_id and vaqt >= date_trunc('month', now()) group by 1) z;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.kun), '[]') into v_kun from (
    select vaqt::date kun, coalesce(sum(mijoz_token), 0) token, count(*) chaqiruv from t2_agent_sarf
     where kompaniya_id = p_kompaniya_id and vaqt >= now() - interval '14 days' group by 1) z;
  return jsonb_build_object('ok', true, 'oy_token', (select coalesce(sum(mijoz_token), 0) from t2_agent_sarf where kompaniya_id = p_kompaniya_id and vaqt >= date_trunc('month', now())),
    'balans', public.t2_token_balans(p_kompaniya_id), 'agentlar', v_agent, 'kunlar', v_kun);
end $$;

-- AI MARKAZI: tannarx, mijoz narxi va FOYDA
create or replace function public.t2_agent_markaz_v1(p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; pl public.t2_agent_byudjet%rowtype; v_bor boolean; v_kun jsonb; v_prof jsonb; v_model jsonb; v_komp jsonb; v_son jsonb; v_mijoz numeric; v_oy numeric;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, null);
  if not (g->>'ok')::boolean then return g; end if;
  select * into pl from t2_agent_byudjet where kompaniya_id is null;
  v_bor := found;
  select coalesce(sum(mijoz_usd), 0) into v_mijoz from t2_agent_sarf where vaqt >= date_trunc('month', now()) and kompaniya_id is not null;
  v_oy := public._t2_agent_oy_sarfi_v1(null);
  select coalesce(jsonb_agg(to_jsonb(z) order by z.kun), '[]') into v_kun from (
    select vaqt::date kun, coalesce(sum(narx_usd), 0) narx_usd, coalesce(sum(mijoz_usd), 0) mijoz_usd, count(*) chaqiruv from t2_agent_sarf where vaqt >= now() - interval '14 days' group by 1) z;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.narx_usd desc nulls last), '[]') into v_prof from (
    select coalesce(profil_kod, '-') profil, amal, count(*) chaqiruv, coalesce(sum(narx_usd), 0) narx_usd, coalesce(sum(kirish_token + chiqish_token), 0) token
      from t2_agent_sarf where vaqt >= date_trunc('month', now()) group by 1, 2 order by 4 desc limit 20) z;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.narx_usd desc nulls last), '[]') into v_model from (
    select coalesce(model_id, '-') model, count(*) chaqiruv, coalesce(sum(narx_usd), 0) narx_usd, count(*) filter (where narx_usd is null) narxsiz
      from t2_agent_sarf where vaqt >= date_trunc('month', now()) group by 1 order by 3 desc limit 20) z;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.narx_usd desc nulls last), '[]') into v_komp from (
    select s.kompaniya_id, k.nom, coalesce(sum(s.narx_usd), 0) narx_usd, coalesce(sum(s.mijoz_usd), 0) mijoz_usd, coalesce(sum(s.mijoz_token), 0) token, count(*) chaqiruv,
           b.oylik_limit_usd limit_usd, public._t2_agent_ustama_v1(s.kompaniya_id) ustama_foiz
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
  return jsonb_build_object('ok', true, 'oy_sarfi_usd', v_oy, 'limit_usd', case when v_bor then pl.oylik_limit_usd end,
    'ogohlantirish_foiz', case when v_bor then pl.ogohlantirish_foiz end, 'limit_faol', v_bor and pl.faol,
    'ustama_foiz', (select ai_ustama_foiz from t2_token_sozlama where id = 1),
    'mijoz_oy_usd', v_mijoz,
    'foyda_oy_usd', v_mijoz - (select coalesce(sum(narx_usd), 0) from t2_agent_sarf where vaqt >= date_trunc('month', now()) and kompaniya_id is not null),
    'kunlar', v_kun, 'agentlar', v_prof, 'modellar', v_model, 'kompaniyalar', v_komp, 'sonlar', v_son);
end $$;

revoke all on function public.t2_agent_ustama_belgila_v1(bigint, bigint, numeric), public._t2_agent_ustama_v1(bigint),
  public.t2_agent_sarf_tekshir_v1(bigint, bigint), public.t2_agent_sarf_yoz_v1(bigint, bigint, text, text, text, integer, integer, numeric, boolean),
  public.t2_agent_sarf_hisobot_v1(bigint, bigint), public.t2_agent_markaz_v1(bigint) from public, anon, authenticated;
grant execute on function public.t2_agent_ustama_belgila_v1(bigint, bigint, numeric), public._t2_agent_ustama_v1(bigint),
  public.t2_agent_sarf_tekshir_v1(bigint, bigint), public.t2_agent_sarf_yoz_v1(bigint, bigint, text, text, text, integer, integer, numeric, boolean),
  public.t2_agent_sarf_hisobot_v1(bigint, bigint), public.t2_agent_markaz_v1(bigint) to service_role;
