-- AI TIZIM V2: (1) foydalanuvchi uslubi (o'rganilgan shakl belgilari + o'z ko'rsatmasi, hammasi foydalanuvchi nazoratida),
-- (2) foydalanuvchining HAR FUNKSIYA (profil) uchun o'z model tanlovi. Hal qilish: foydalanuvchi -> kompaniya -> platforma -> server standarti.
-- Model faqat superadmin tasdiqlagan katalogdan (FK) — xarajat nazorati saqlanadi. Savol matni hech qayerda saqlanmaydi.
set local statement_timeout = '60s';

create table if not exists public.t2_agent_uslub (
  actor_id bigint primary key,
  xususiyat jsonb not null default '{}'::jsonb check (jsonb_typeof(xususiyat) = 'object'),
  korsatma text check (korsatma is null or length(korsatma) <= 600),
  yoqilgan boolean not null default true,
  yangilandi timestamptz not null default now()
);

create table if not exists public.t2_agent_foydalanuvchi_model (
  actor_id bigint not null,
  profil_kod text not null references public.t2_agent_profile(kod),
  model_id text not null references public.t2_agent_model_katalog(id),
  yangilandi timestamptz not null default now(),
  primary key (actor_id, profil_kod)
);

alter table public.t2_agent_uslub enable row level security;
alter table public.t2_agent_foydalanuvchi_model enable row level security;
revoke all on public.t2_agent_uslub, public.t2_agent_foydalanuvchi_model from public, anon, authenticated;

create or replace function public._t2_agent_actor_bor(p_actor_id bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_actor_id is not null and p_actor_id > 0 and exists (select 1 from t2_foydalanuvchi where id = p_actor_id)
$$;

create or replace function public.t2_agent_uslub_v1(p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare z public.t2_agent_uslub%rowtype;
begin
  if not public._t2_agent_actor_bor(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  select * into z from t2_agent_uslub where actor_id = p_actor_id;
  return jsonb_build_object('ok', true, 'xususiyat', coalesce(z.xususiyat, '{}'::jsonb), 'korsatma', z.korsatma, 'yoqilgan', coalesce(z.yoqilgan, true));
end $$;

-- Server har javobdan keyin chaqiradi: faqat ruxsat etilgan raqamli kalitlar, chegaralangan qiymatlar; o'chirib qo'yilgan bo'lsa saqlanmaydi.
create or replace function public.t2_agent_uslub_yangila_v1(p_actor_id bigint, p_xususiyat jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ok jsonb := '{}'::jsonb; k text; v numeric; z public.t2_agent_uslub%rowtype;
begin
  if not public._t2_agent_actor_bor(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  if p_xususiyat is null or jsonb_typeof(p_xususiyat) <> 'object' then return jsonb_build_object('ok', false, 'code', 'USLUB_INVALID'); end if;
  select * into z from t2_agent_uslub where actor_id = p_actor_id;
  if found and not z.yoqilgan then return jsonb_build_object('ok', true, 'saqlandi', false); end if;
  foreach k in array array['n', 'ru', 'uzunlik', 'batafsil', 'qisqa', 'jadval', 'rasmiy'] loop
    if p_xususiyat ? k and jsonb_typeof(p_xususiyat -> k) = 'number' then
      v := (p_xususiyat ->> k)::numeric;
      v := case when k = 'n' then least(greatest(v, 0), 100000) when k = 'uzunlik' then least(greatest(v, 0), 2000) else least(greatest(v, 0), 1) end;
      v_ok := v_ok || jsonb_build_object(k, v);
    end if;
  end loop;
  insert into t2_agent_uslub (actor_id, xususiyat) values (p_actor_id, v_ok)
  on conflict (actor_id) do update set xususiyat = excluded.xususiyat, yangilandi = now();
  return jsonb_build_object('ok', true, 'saqlandi', true);
end $$;

-- Foydalanuvchi o'zi: ko'rsatma (<=600) va o'rganishni yoqish/o'chirish. O'chirilsa o'rganilgan belgilar ham tozalanadi.
create or replace function public.t2_agent_uslub_saqla_v1(p_actor_id bigint, p_korsatma text, p_yoqilgan boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_k text := nullif(btrim(coalesce(p_korsatma, '')), ''); v_y boolean := coalesce(p_yoqilgan, true);
begin
  if not public._t2_agent_actor_bor(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  if v_k is not null and length(v_k) > 600 then return jsonb_build_object('ok', false, 'code', 'KORSATMA_UZUN'); end if;
  insert into t2_agent_uslub (actor_id, korsatma, yoqilgan) values (p_actor_id, v_k, v_y)
  on conflict (actor_id) do update set korsatma = excluded.korsatma, yoqilgan = excluded.yoqilgan,
    xususiyat = case when excluded.yoqilgan then t2_agent_uslub.xususiyat else '{}'::jsonb end, yangilandi = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.t2_agent_uslub_tozala_v1(p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public._t2_agent_actor_bor(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  update t2_agent_uslub set xususiyat = '{}'::jsonb, yangilandi = now() where actor_id = p_actor_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.t2_agent_model_shaxsiy_v1(p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public._t2_agent_actor_bor(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('profil', profil_kod, 'model_id', model_id) order by profil_kod), '[]'::jsonb) into v
    from t2_agent_foydalanuvchi_model where actor_id = p_actor_id;
  return jsonb_build_object('ok', true, 'tanlovlar', v);
end $$;

-- p_model_id null => shaxsiy tanlov olib tashlanadi. Tizim (global) agentlari uchun shaxsiy tanlov yo'q.
create or replace function public.t2_agent_model_shaxsiy_tanla_v1(p_actor_id bigint, p_profil text, p_model_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public._t2_agent_actor_bor(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  if not exists (select 1 from t2_agent_profile where kod = p_profil and holat = 'active') then return jsonb_build_object('ok', false, 'code', 'PROFIL_YOQ'); end if;
  if exists (select 1 from t2_agent_profile where kod = p_profil and default_scope = 'global') then return jsonb_build_object('ok', false, 'code', 'TIZIM_AGENTI'); end if;
  if p_model_id is null then
    delete from t2_agent_foydalanuvchi_model where actor_id = p_actor_id and profil_kod = p_profil;
    return jsonb_build_object('ok', true, 'tozalandi', true);
  end if;
  if not exists (select 1 from t2_agent_model_katalog where id = p_model_id and faol) then return jsonb_build_object('ok', false, 'code', 'MODEL_KATALOGDA_YOQ'); end if;
  insert into t2_agent_foydalanuvchi_model (actor_id, profil_kod, model_id) values (p_actor_id, p_profil, p_model_id)
  on conflict (actor_id, profil_kod) do update set model_id = excluded.model_id, yangilandi = now();
  return jsonb_build_object('ok', true);
end $$;

-- muhit: hal qilingan model ENDI shaxsiy tanlovni ham hisobga oladi (foydalanuvchi -> kompaniya -> platforma). Boshqa hamma narsa o'zgarishsiz.
create or replace function public.t2_agent_muhit_v1(p_actor_id bigint, p_kompaniya_id bigint, p_profil text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_q jsonb; v_x jsonb; v_m jsonb; v_model text; v_manba text;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_profil is not null and not exists (select 1 from t2_agent_profile where kod = p_profil) then return jsonb_build_object('ok', false, 'code', 'PROFIL_YOQ'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('doira', doira, 'kod', kod, 'matn', matn, 'versiya', versiya) order by case doira when 'yadro' then 0 when 'global' then 1 else 2 end, kod), '[]')
    into v_q from t2_agent_qoida
   where holat = 'faol' and (profil_kod is null or profil_kod = p_profil)
     and (doira in ('yadro','global') or (doira = 'company' and kompaniya_id = p_kompaniya_id));
  select coalesce(jsonb_agg(jsonb_build_object('kalit', kalit, 'mazmun', mazmun, 'yangilandi', yangilandi) order by yangilandi desc), '[]')
    into v_x from (select * from t2_agent_xotira
      where (profil_kod is null or profil_kod = p_profil) and kompaniya_id is not distinct from p_kompaniya_id
      order by yangilandi desc limit 50) z;
  select coalesce(jsonb_agg(jsonb_build_object('domen', domen, 'nom', nom) order by domen), '[]') into v_m from t2_agent_manba where faol;
  if p_profil is not null then
    select f.model_id into v_model from t2_agent_foydalanuvchi_model f
      join t2_agent_model_katalog k on k.id = f.model_id and k.faol
     where f.actor_id = p_actor_id and f.profil_kod = p_profil;
    if v_model is not null then v_manba := 'foydalanuvchi';
    else
      select t.model_id, case when t.kompaniya_id is null then 'platforma' else 'kompaniya' end into v_model, v_manba
        from t2_agent_model_tanlov t join t2_agent_model_katalog k on k.id = t.model_id and k.faol
       where t.profil_kod = p_profil and (t.kompaniya_id = p_kompaniya_id or t.kompaniya_id is null)
       order by (t.kompaniya_id is null) limit 1;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'scope', g->>'scope', 'rol', g->>'rol', 'qoidalar', v_q, 'xotira', v_x, 'manbalar', v_m, 'model', v_model, 'model_manba', v_manba);
end $$;

revoke all on function public._t2_agent_actor_bor(bigint), public.t2_agent_uslub_v1(bigint), public.t2_agent_uslub_yangila_v1(bigint, jsonb),
  public.t2_agent_uslub_saqla_v1(bigint, text, boolean), public.t2_agent_uslub_tozala_v1(bigint), public.t2_agent_model_shaxsiy_v1(bigint),
  public.t2_agent_model_shaxsiy_tanla_v1(bigint, text, text), public.t2_agent_muhit_v1(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public._t2_agent_actor_bor(bigint), public.t2_agent_uslub_v1(bigint), public.t2_agent_uslub_yangila_v1(bigint, jsonb),
  public.t2_agent_uslub_saqla_v1(bigint, text, boolean), public.t2_agent_uslub_tozala_v1(bigint), public.t2_agent_model_shaxsiy_v1(bigint),
  public.t2_agent_model_shaxsiy_tanla_v1(bigint, text, text), public.t2_agent_muhit_v1(bigint, bigint, text) to service_role;
