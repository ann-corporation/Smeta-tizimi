-- Agent MODEL REGISTRI: har ishchi agent qaysi modelda ishlashi ko'rinadi va tanlanadi.
-- Katalogni FAQAT superadmin boshqaradi (kompaniya ixtiyoriy model nomini kirita olmaydi); tanlov: platforma (kompaniya NULL) yoki kompaniya (admin/boss/director).
-- Hal qilish: kompaniya tanlovi -> platforma tanlovi -> server standarti (tier). t2_agent_muhit_v1 hal qilingan modelni qaytaradi.
set local statement_timeout = '60s';

create table if not exists public.t2_agent_model_katalog (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._:-]*$' and length(id) <= 120),
  nom text not null check (length(nom) between 2 and 100),
  provayder text not null default 'openrouter' check (provayder = 'openrouter'),
  tavsif text check (tavsif is null or length(tavsif) <= 400),
  narx_izoh text check (narx_izoh is null or length(narx_izoh) <= 200),
  vision boolean not null default false,
  faol boolean not null default true,
  tasdiqladi bigint,
  yaratildi timestamptz not null default now()
);

create table if not exists public.t2_agent_model_tanlov (
  id bigint generated always as identity primary key,
  kompaniya_id bigint references public.t2_kompaniya(id) on delete cascade,
  profil_kod text not null references public.t2_agent_profile(kod),
  model_id text not null references public.t2_agent_model_katalog(id),
  actor_id bigint not null,
  yangilandi timestamptz not null default now()
);
create unique index if not exists t2_agent_model_tanlov_uq on public.t2_agent_model_tanlov (coalesce(kompaniya_id, 0), profil_kod);

alter table public.t2_agent_model_katalog enable row level security;
alter table public.t2_agent_model_tanlov enable row level security;
revoke all on public.t2_agent_model_katalog, public.t2_agent_model_tanlov from public, anon, authenticated;

insert into public.t2_agent_model_katalog (id, nom, tavsif, narx_izoh) values
  ('openrouter/auto', 'OpenRouter avto-tanlov', 'OpenRouter so''rovga qarab modelni o''zi tanlaydi (standart zaxira).', 'Narx tanlangan modelga qarab o''zgaradi')
on conflict do nothing;

create or replace function public.t2_agent_model_katalog_yoz_v1(p_actor_id bigint, p_id text, p_nom text, p_tavsif text, p_narx_izoh text, p_vision boolean, p_faol boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, null);
  if not (g->>'ok')::boolean then return g; end if;
  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._:-]*$' or length(p_id) > 120 or coalesce(length(btrim(p_nom)), 0) not between 2 and 100 then return jsonb_build_object('ok', false, 'code', 'MODEL_INVALID'); end if;
  insert into t2_agent_model_katalog (id, nom, tavsif, narx_izoh, vision, faol, tasdiqladi)
  values (p_id, btrim(p_nom), left(p_tavsif, 400), left(p_narx_izoh, 200), coalesce(p_vision, false), coalesce(p_faol, true), p_actor_id)
  on conflict (id) do update set nom = excluded.nom, tavsif = excluded.tavsif, narx_izoh = excluded.narx_izoh, vision = excluded.vision, faol = excluded.faol, tasdiqladi = excluded.tasdiqladi;
  return jsonb_build_object('ok', true);
end $$;

-- Ishchi agentlar ro'yxati + har birining HAL QILINGAN modeli (manbasi bilan) + katalog.
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
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'tavsif', tavsif, 'narx_izoh', narx_izoh, 'vision', vision) order by nom), '[]') into v_kat from t2_agent_model_katalog where faol;
  return jsonb_build_object('ok', true, 'rol', g->>'rol', 'tanlash_mumkin', public._t2_agent_qaror_rol_ok(g->>'rol'), 'agentlar', v_agent, 'katalog', v_kat);
end $$;

create or replace function public.t2_agent_model_tanla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_profil text, p_model_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if not public._t2_agent_qaror_rol_ok(g->>'rol') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  if not exists (select 1 from t2_agent_profile where kod = p_profil and holat = 'active') then return jsonb_build_object('ok', false, 'code', 'PROFIL_YOQ'); end if;
  if p_kompaniya_id is not null and exists (select 1 from t2_agent_profile where kod = p_profil and default_scope = 'global') then return jsonb_build_object('ok', false, 'code', 'TIZIM_AGENTI'); end if;
  if p_model_id is null then
    delete from t2_agent_model_tanlov where profil_kod = p_profil and kompaniya_id is not distinct from p_kompaniya_id;
    return jsonb_build_object('ok', true, 'tozalandi', true);
  end if;
  if not exists (select 1 from t2_agent_model_katalog where id = p_model_id and faol) then return jsonb_build_object('ok', false, 'code', 'MODEL_KATALOGDA_YOQ'); end if;
  insert into t2_agent_model_tanlov (kompaniya_id, profil_kod, model_id, actor_id) values (p_kompaniya_id, p_profil, p_model_id, p_actor_id)
  on conflict (coalesce(kompaniya_id, 0), profil_kod) do update set model_id = excluded.model_id, actor_id = excluded.actor_id, yangilandi = now();
  return jsonb_build_object('ok', true);
end $$;

-- muhit: hal qilingan modelni ham qaytaradi (profil berilganda)
create or replace function public.t2_agent_muhit_v1(p_actor_id bigint, p_kompaniya_id bigint, p_profil text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_q jsonb; v_x jsonb; v_m jsonb; v_model text;
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
    select t.model_id into v_model from t2_agent_model_tanlov t join t2_agent_model_katalog k on k.id = t.model_id and k.faol
     where t.profil_kod = p_profil and (t.kompaniya_id = p_kompaniya_id or t.kompaniya_id is null)
     order by (t.kompaniya_id is null) limit 1;
  end if;
  return jsonb_build_object('ok', true, 'scope', g->>'scope', 'rol', g->>'rol', 'qoidalar', v_q, 'xotira', v_x, 'manbalar', v_m, 'model', v_model);
end $$;

revoke all on function public.t2_agent_model_katalog_yoz_v1(bigint, text, text, text, text, boolean, boolean), public.t2_agent_modellar_v1(bigint, bigint),
  public.t2_agent_model_tanla_v1(bigint, bigint, text, text), public.t2_agent_muhit_v1(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.t2_agent_model_katalog_yoz_v1(bigint, text, text, text, text, boolean, boolean), public.t2_agent_modellar_v1(bigint, bigint),
  public.t2_agent_model_tanla_v1(bigint, bigint, text, text), public.t2_agent_muhit_v1(bigint, bigint, text) to service_role;
