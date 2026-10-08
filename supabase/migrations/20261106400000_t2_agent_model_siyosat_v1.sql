-- AI TIZIM V2 / D: KOMPANIYA MODEL SIYOSATI. Kompaniya admini/boss/direktori a'zolar AI modelini o'zi tanlay olishini cheklashi mumkin (xarajat nazorati).
-- Cheklangan bo'lsa shaxsiy tanlov muhitda e'tiborga olinmaydi (kompaniya -> platforma -> standart). Standart: erkin.
set local statement_timeout = '60s';

alter table public.t2_agent_kompaniya_sozlama add column if not exists model_erkin boolean not null default true;

create or replace function public.t2_agent_model_siyosat_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  return jsonb_build_object('ok', true, 'model_erkin', coalesce((select model_erkin from t2_agent_kompaniya_sozlama where kompaniya_id = p_kompaniya_id), true),
    'tahrir_mumkin', public._t2_agent_qaror_rol_ok(g->>'rol'));
end $$;

create or replace function public.t2_agent_model_siyosat_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_model_erkin boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if not public._t2_agent_qaror_rol_ok(g->>'rol') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  insert into t2_agent_kompaniya_sozlama (kompaniya_id, model_erkin, actor_id) values (p_kompaniya_id, coalesce(p_model_erkin, true), p_actor_id)
  on conflict (kompaniya_id) do update set model_erkin = excluded.model_erkin, actor_id = excluded.actor_id, yangilandi = now();
  perform public.t2_audit_yoz(p_kompaniya_id, 'ai_model_siyosati_ozgardi', 'kompaniya', null, format('model_erkin=%s', coalesce(p_model_erkin, true)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

-- muhit: shaxsiy model tanlovi kompaniya siyosatiga bo'ysunadi (boshqa hamma narsa o'zgarishsiz)
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
     where f.actor_id = p_actor_id and f.profil_kod = p_profil
       and (p_kompaniya_id is null or coalesce((select s.model_erkin from t2_agent_kompaniya_sozlama s where s.kompaniya_id = p_kompaniya_id), true));   -- kompaniya admini model tanlashni cheklagan bo'lsa shaxsiy tanlov e'tiborga olinmaydi
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

revoke all on function public.t2_agent_model_siyosat_v1(bigint, bigint), public.t2_agent_model_siyosat_saqla_v1(bigint, bigint, boolean), public.t2_agent_muhit_v1(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.t2_agent_model_siyosat_v1(bigint, bigint), public.t2_agent_model_siyosat_saqla_v1(bigint, bigint, boolean), public.t2_agent_muhit_v1(bigint, bigint, text) to service_role;