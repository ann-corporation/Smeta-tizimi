-- AI TELEMETRIYASI: har model chaqiruvi uchun ixcham o'lchov qatori (latency, xato kodi, yuza, niyat, vosita nomlari, token) + foydalanuvchi bahosi (yoqdi/yoqmadi)
-- + superadmin uchun "AI salomatligi" hisoboti (7/30 kun, yuza bo'yicha). Foydalanuvchi MATNI saqlanmaydi (savol/javob yo'q) - faqat sonlar va kodlar.
-- DB 500 MB limitda: qator ~100 bayt, 30 kundan keyin R2 ga arxivlanadi va bazadan o'chiriladi (t2_arxiv_siyosat, qator-arxiv).
-- Qo'llash: egasi ruxsatidan keyin (ROLLBACK sinovi bilan). Faqat service_role chaqiradi (Pages Functions); anon/authenticated yo'q.
set local statement_timeout = '60s';

create table if not exists public.t2_ai_telemetriya (
  id bigint generated always as identity primary key,
  vaqt timestamptz not null default now(),
  yuza text not null check (yuza ~ '^[a-z_]{2,30}$'),                 -- jarvis | smeta_ai | workers_ai | ai_ishchi | ombor_ovoz | ombor | boshqa ...
  model text check (model is null or length(model) <= 120),
  kechikish_ms integer check (kechikish_ms is null or kechikish_ms between 0 and 3600000),
  ok boolean not null default true,
  xato_kod text check (xato_kod is null or xato_kod ~ '^[A-Za-z0-9_.:-]{1,40}$'),
  niyat text check (niyat is null or niyat ~ '^[A-Za-z0-9_.:-]{1,40}$'),  -- amal nomi / aniqlangan niyat kodi
  vositalar text[] not null default '{}' check (cardinality(vositalar) <= 12),
  vosita_xato smallint not null default 0 check (vosita_xato >= 0),
  javob_manba text check (javob_manba is null or javob_manba in ('tool', 'model', 'local')),
  kirish_token integer not null default 0 check (kirish_token >= 0),
  chiqish_token integer not null default 0 check (chiqish_token >= 0),
  actor_id bigint,
  kompaniya_id bigint
);
create index if not exists t2_ai_telemetriya_vaqt_ix on public.t2_ai_telemetriya (vaqt desc);
create index if not exists t2_ai_telemetriya_yuza_ix on public.t2_ai_telemetriya (yuza, vaqt desc);
alter table public.t2_ai_telemetriya enable row level security;
revoke all on public.t2_ai_telemetriya from public, anon, authenticated;
grant select, insert, delete on public.t2_ai_telemetriya to service_role;

-- 30 kunlik saqlash (qator-arxiv): TS reyestri functions/_shared/arxiv-siyosat.ts bilan mos bo'lishi shart.
insert into public.t2_arxiv_siyosat (jadval, rejim, saqlash_kun, kalit, kalit_tur, vaqt, shart_ustun, shart_emas, format, tiklash, izoh) values
  ('t2_ai_telemetriya', 'qator-arxiv', 30, 'id', 'bigint', 'vaqt', null, null, 'ndjson.gz', 't2_arxiv_tikla_v1', 'AI chaqiruv telemetriyasi (latency/xato/yuza); matn yo''q')
on conflict (jadval) do nothing;

-- Foydalanuvchi bahosi mavjud t2_agent_fikr ga yoziladi: matn o'rniga qat'iy belgi ('yoqdi'|'yoqmadi'), AI javobi va foydalanuvchi matni SAQLANMAYDI.
alter table public.t2_agent_fikr add column if not exists baho smallint check (baho is null or baho in (-1, 1));
alter table public.t2_agent_fikr add column if not exists yuza text check (yuza is null or yuza ~ '^[a-z_]{2,30}$');
alter table public.t2_agent_fikr add column if not exists sabab text check (sabab is null or sabab in ('tushunarsiz', 'notogri', 'sekin', 'boshqa'));
create index if not exists t2_agent_fikr_baho_ix on public.t2_agent_fikr (yaratildi desc) where baho is not null;

-- Fikr ro'yxatidan baho qatorlari chiqarib tashlanadi (ro'yxat faqat matnli fikrlar uchun).
create or replace function public.t2_agent_fikr_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.id desc), '[]') into v from (
    select id, tur, matn, sahifa, ai_javob, holat, global_ulashish, yaratildi from t2_agent_fikr
     where kompaniya_id = p_kompaniya_id and baho is null order by id desc limit 100) z;
  return jsonb_build_object('ok', true, 'natija', v);
end $$;

-- Telemetriya yozuvi (server ichki; scope guard kerak emas - chaqiruvchi allaqachon tekshirilgan). Hech qachon xato ko'tarmaydi.
create or replace function public.t2_ai_telemetriya_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yuza text, p_model text, p_kechikish_ms integer,
  p_ok boolean, p_xato_kod text, p_niyat text, p_vositalar text[], p_vosita_xato integer, p_kirish integer, p_chiqish integer, p_manba text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into t2_ai_telemetriya (yuza, model, kechikish_ms, ok, xato_kod, niyat, vositalar, vosita_xato, javob_manba, kirish_token, chiqish_token, actor_id, kompaniya_id)
  values (case when p_yuza ~ '^[a-z_]{2,30}$' then p_yuza else 'boshqa' end, left(p_model, 120),
          case when p_kechikish_ms is null then null else least(greatest(p_kechikish_ms, 0), 3600000) end,
          coalesce(p_ok, true), case when p_xato_kod ~ '^[A-Za-z0-9_.:-]{1,40}$' then p_xato_kod end,
          case when p_niyat ~ '^[A-Za-z0-9_.:-]{1,40}$' then p_niyat end,
          coalesce((select array_agg(x) from (select x from unnest(coalesce(p_vositalar, '{}')) x where x ~ '^[A-Za-z0-9_.:-]{1,40}$' limit 12) s), '{}'),
          least(greatest(coalesce(p_vosita_xato, 0), 0), 32000),
          case when p_manba in ('tool', 'model', 'local') then p_manba end,
          greatest(coalesce(p_kirish, 0), 0), greatest(coalesce(p_chiqish, 0), 0), p_actor_id, p_kompaniya_id);
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'code', 'TELEMETRIYA_XATO');
end $$;

-- Baho (yoqdi / yoqmadi): foydalanuvchi o'z kompaniyasida; kuniga 200 tagacha (suiiste'mol cheklovi). Matn saqlanmaydi.
create or replace function public.t2_ai_baho_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_baho integer, p_yuza text, p_sabab text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_n int; v_id bigint;
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_baho is null or p_baho not in (-1, 1) then return jsonb_build_object('ok', false, 'code', 'BAHO_INVALID'); end if;
  if p_yuza is null or p_yuza !~ '^[a-z_]{2,30}$' then return jsonb_build_object('ok', false, 'code', 'YUZA_INVALID'); end if;
  if p_sabab is not null and p_sabab not in ('tushunarsiz', 'notogri', 'sekin', 'boshqa') then return jsonb_build_object('ok', false, 'code', 'SABAB_INVALID'); end if;
  select count(*) into v_n from t2_agent_fikr where actor_id = p_actor_id and baho is not null and yaratildi > now() - interval '1 day';
  if v_n >= 200 then return jsonb_build_object('ok', false, 'code', 'LIMIT'); end if;
  insert into t2_agent_fikr (kompaniya_id, actor_id, tur, matn, sahifa, ai_javob, global_ulashish, holat, baho, yuza, sabab)
  values (p_kompaniya_id, p_actor_id, 'fikr', case when p_baho = 1 then 'yoqdi' else 'yoqmadi' end, p_yuza, null, false, 'yopilgan', p_baho::smallint, p_yuza, p_sabab)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Bir oyna (kun) uchun yig'ma: yuza bo'yicha soni, xato %, p50/p95 latency, token; eng ko'p xato kodlari; baho; vosita statistikasi.
create or replace function public._t2_ai_oyna_v1(p_kun integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_yuza jsonb; v_xato jsonb; v_baho jsonb; v_vosita jsonb; v_jami jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(z) order by z.soni desc), '[]') into v_yuza from (
    select yuza, count(*) soni, count(*) filter (where not ok) xato,
           round(100.0 * count(*) filter (where not ok) / greatest(count(*), 1), 1) xato_foiz,
           round((percentile_cont(0.5) within group (order by kechikish_ms))::numeric) p50_ms,
           round((percentile_cont(0.95) within group (order by kechikish_ms))::numeric) p95_ms,
           coalesce(sum(kirish_token), 0) kirish_token, coalesce(sum(chiqish_token), 0) chiqish_token,
           count(distinct actor_id) foydalanuvchi
      from t2_ai_telemetriya where vaqt > now() - make_interval(days => p_kun) group by yuza) z;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.soni desc), '[]') into v_xato from (
    select yuza, xato_kod, count(*) soni from t2_ai_telemetriya
     where vaqt > now() - make_interval(days => p_kun) and not ok group by yuza, xato_kod order by 3 desc limit 10) z;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.yuza), '[]') into v_baho from (
    select coalesce(yuza, '-') yuza, count(*) filter (where baho = 1) yoqdi, count(*) filter (where baho = -1) yoqmadi
      from t2_agent_fikr where baho is not null and yaratildi > now() - make_interval(days => p_kun) group by 1) z;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.soni desc), '[]') into v_vosita from (
    select v vosita, count(*) soni from t2_ai_telemetriya t, unnest(t.vositalar) v
     where t.vaqt > now() - make_interval(days => p_kun) group by v order by 2 desc limit 15) z;
  select jsonb_build_object('soni', count(*), 'xato', count(*) filter (where not ok),
         'p50_ms', round((percentile_cont(0.5) within group (order by kechikish_ms))::numeric),
         'p95_ms', round((percentile_cont(0.95) within group (order by kechikish_ms))::numeric),
         'vosita_xato', coalesce(sum(vosita_xato), 0)) into v_jami
    from t2_ai_telemetriya where vaqt > now() - make_interval(days => p_kun);
  return jsonb_build_object('kun', p_kun, 'jami', v_jami, 'yuzalar', v_yuza, 'top_xatolar', v_xato, 'baho', v_baho, 'vositalar', v_vosita);
end $$;

-- "AI salomatligi" (faqat superadmin): 7 va 30 kun + AI ishchilar holati (yoqilgan soni, oxirgi 24 soat / 7 kunda ishlaganlar).
create or replace function public.t2_ai_salomatlik_v1(p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_ishchi jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, null);
  if not (g->>'ok')::boolean then return g; end if;
  select jsonb_build_object(
    'yoqilgan', (select count(*) from t2_ai_sozlama where yoqilgan),
    'ish_24s', (select count(*) from t2_ai_ish where yaratildi > now() - interval '24 hours'),
    'ish_7k', (select count(*) from t2_ai_ish where yaratildi > now() - interval '7 days'),
    'xato_7k', (select count(*) from t2_ai_ish where yaratildi > now() - interval '7 days' and holat in ('xato', 'limit'))) into v_ishchi;
  return jsonb_build_object('ok', true, 'hozir', now(), 'd7', public._t2_ai_oyna_v1(7), 'd30', public._t2_ai_oyna_v1(30), 'ishchilar', v_ishchi);
end $$;

-- AI ishchilar holati (monitor/Telegram uchun, aktor kerak emas - faqat service_role): sonlar, hech qanday kompaniya ma'lumoti yo'q.
create or replace function public.t2_ai_ishchi_holat_v1()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true,
    'yoqilgan', (select count(*) from t2_ai_sozlama where yoqilgan),
    'ish_24s', (select count(*) from t2_ai_ish where yaratildi > now() - interval '24 hours'),
    'xato_24s', (select count(*) from t2_ai_ish where yaratildi > now() - interval '24 hours' and holat in ('xato', 'limit')))
$$;

revoke all on function public.t2_ai_telemetriya_yoz_v1(bigint, bigint, text, text, integer, boolean, text, text, text[], integer, integer, integer, text),
  public.t2_ai_baho_yoz_v1(bigint, bigint, integer, text, text), public._t2_ai_oyna_v1(integer), public.t2_ai_salomatlik_v1(bigint),
  public.t2_ai_ishchi_holat_v1(), public.t2_agent_fikr_royxat_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_ai_telemetriya_yoz_v1(bigint, bigint, text, text, integer, boolean, text, text, text[], integer, integer, integer, text),
  public.t2_ai_baho_yoz_v1(bigint, bigint, integer, text, text), public._t2_ai_oyna_v1(integer), public.t2_ai_salomatlik_v1(bigint),
  public.t2_ai_ishchi_holat_v1(), public.t2_agent_fikr_royxat_v1(bigint, bigint) to service_role;
