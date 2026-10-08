-- Rollback: 20261106340000_t2_agent_uslub_model_v1 (muhit eski ta'rifiga qaytariladi, keyin yangi obyektlar o'chiriladi)
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
drop function if exists public.t2_agent_model_shaxsiy_tanla_v1(bigint, text, text);
drop function if exists public.t2_agent_model_shaxsiy_v1(bigint);
drop function if exists public.t2_agent_uslub_tozala_v1(bigint);
drop function if exists public.t2_agent_uslub_saqla_v1(bigint, text, boolean);
drop function if exists public.t2_agent_uslub_yangila_v1(bigint, jsonb);
drop function if exists public.t2_agent_uslub_v1(bigint);
drop function if exists public._t2_agent_actor_bor(bigint);
drop table if exists public.t2_agent_foydalanuvchi_model;
drop table if exists public.t2_agent_uslub;
