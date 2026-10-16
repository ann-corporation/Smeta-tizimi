-- Rollback: yangi funksiyalar va tajriba jadvali olib tashlanadi; foydalanuvchi/tizim darajasidagi xotira yozuvlari
-- o'chiriladi (kompaniya darajasi saqlanadi), indeks avvalgi shakliga qaytadi.
drop function if exists public.t2_norma_tajriba_v1(bigint, bigint, text[]);
drop function if exists public.t2_smeta_tajriba_yoz_v1(bigint, bigint, jsonb);
drop function if exists public.t2_smeta_xotira_yoz_v1(bigint, bigint, text, text, text);
drop function if exists public.t2_smeta_xotira_v1(bigint, bigint);
drop index if exists public.t2_qator_norma_kalit;
drop function if exists public.t2_norma_kalit(text);
drop table if exists public.t2_smeta_tanlov_tajriba;
delete from public.t2_agent_xotira where foydalanuvchi_id is not null;
drop index if exists public.t2_agent_xotira_uq;
alter table public.t2_agent_xotira drop column if exists foydalanuvchi_id;
create unique index t2_agent_xotira_uq on public.t2_agent_xotira (coalesce(kompaniya_id, 0::bigint), coalesce(profil_kod, ''::text), kalit);

-- Avvalgi agent funksiyalari (foydalanuvchi_id ustunisiz).
create or replace function public.t2_agent_muhit_v1(p_actor_id bigint, p_kompaniya_id bigint, p_profil text DEFAULT NULL::text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
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
       and (p_kompaniya_id is null or coalesce((select s.model_erkin from t2_agent_kompaniya_sozlama s where s.kompaniya_id = p_kompaniya_id), true));
    if v_model is not null then v_manba := 'foydalanuvchi';
    else
      select t.model_id, case when t.kompaniya_id is null then 'platforma' else 'kompaniya' end into v_model, v_manba
        from t2_agent_model_tanlov t join t2_agent_model_katalog k on k.id = t.model_id and k.faol
       where t.profil_kod = p_profil and (t.kompaniya_id = p_kompaniya_id or t.kompaniya_id is null)
       order by (t.kompaniya_id is null) limit 1;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'scope', g->>'scope', 'rol', g->>'rol', 'qoidalar', v_q, 'xotira', v_x, 'manbalar', v_m, 'model', v_model, 'model_manba', v_manba);
end $function$;

create or replace function public.t2_agent_xotira_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_profil text, p_kalit text, p_mazmun text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare g jsonb; v_n int;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if g->>'rol' = 'kuzatuvchi' then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  if p_kalit is null or p_kalit !~ '^[a-z0-9_.-]{2,80}$' or coalesce(length(p_mazmun), 0) not between 1 and 4000 then return jsonb_build_object('ok', false, 'code', 'XOTIRA_INVALID'); end if;
  if p_profil is not null and not exists (select 1 from t2_agent_profile where kod = p_profil) then return jsonb_build_object('ok', false, 'code', 'PROFIL_YOQ'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_agent_xotira:' || coalesce(p_kompaniya_id, 0), 0));
  select count(*) into v_n from t2_agent_xotira where kompaniya_id is not distinct from p_kompaniya_id;
  if v_n >= 200 and not exists (select 1 from t2_agent_xotira where kompaniya_id is not distinct from p_kompaniya_id and coalesce(profil_kod, '') = coalesce(p_profil, '') and kalit = p_kalit) then
    return jsonb_build_object('ok', false, 'code', 'XOTIRA_TO_LA', 'xabar', 'Xotira to''lgan (200 yozuv) — eskisini yangilang');
  end if;
  insert into t2_agent_xotira (kompaniya_id, profil_kod, kalit, mazmun, manba) values (p_kompaniya_id, p_profil, p_kalit, p_mazmun, 'actor:' || p_actor_id)
  on conflict (coalesce(kompaniya_id, 0), coalesce(profil_kod, ''), kalit) do update set mazmun = excluded.mazmun, manba = excluded.manba, versiya = t2_agent_xotira.versiya + 1, yangilandi = now();
  return jsonb_build_object('ok', true);
end $function$;
