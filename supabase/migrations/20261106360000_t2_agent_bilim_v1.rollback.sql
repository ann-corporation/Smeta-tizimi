-- Rollback: 20261106360000_t2_agent_bilim_v1 (taklif yarat/qaror eski ta'riflariga qaytariladi; bilim obyektlari o'chiriladi)
delete from public.t2_agent_taklif where tur = 'bilim';
alter table public.t2_agent_taklif drop constraint if exists t2_agent_taklif_tur_check;
alter table public.t2_agent_taklif add constraint t2_agent_taklif_tur_check check (tur in ('qoida','manba','rivojlanish'));
create or replace function public.t2_agent_taklif_yarat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_tur text, p_doira text, p_profil text,
  p_sarlavha text, p_mazmun jsonb, p_dalil jsonb default '[]', p_run_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_id bigint; v_dom text;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_tur not in ('qoida','manba','rivojlanish') or p_doira not in ('global','company') or p_mazmun is null or jsonb_typeof(p_mazmun) <> 'object' or length(p_mazmun::text) > 8000
     or coalesce(length(p_sarlavha), 0) not between 3 and 200 or jsonb_typeof(coalesce(p_dalil, '[]'::jsonb)) <> 'array' or length(coalesce(p_dalil, '[]'::jsonb)::text) > 6000 then
    return jsonb_build_object('ok', false, 'code', 'TAKLIF_INVALID');
  end if;
  if p_profil is not null and not exists (select 1 from t2_agent_profile where kod = p_profil) then return jsonb_build_object('ok', false, 'code', 'PROFIL_YOQ'); end if;
  -- Kompaniya kontekstidan GLOBAL qoida/rivojlanish taklif qilib bo'lmaydi (tenant ma'lumoti global qoidaga oqib chiqmasin); faqat manba domeni.
  if p_kompaniya_id is not null and p_doira = 'global' and p_tur <> 'manba' then return jsonb_build_object('ok', false, 'code', 'GLOBAL_TAKLIF_FAQAT_MANBA'); end if;
  if p_kompaniya_id is null and p_doira = 'company' then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  if p_tur = 'qoida' and (coalesce(p_mazmun->>'kod', '') !~ '^[a-z0-9_]{3,60}$' or coalesce(length(p_mazmun->>'matn'), 0) not between 5 and 1000) then return jsonb_build_object('ok', false, 'code', 'QOIDA_INVALID'); end if;
  if p_tur = 'manba' then
    v_dom := lower(coalesce(p_mazmun->>'domen', ''));
    if v_dom !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' or coalesce(length(p_mazmun->>'nom'), 0) not between 2 and 100 then return jsonb_build_object('ok', false, 'code', 'MANBA_INVALID'); end if;
  end if;
  insert into t2_agent_taklif (tur, doira, kompaniya_id, profil_kod, sarlavha, mazmun, dalil, yaratdi_actor, yaratdi_run_id)
  values (p_tur, p_doira, p_kompaniya_id, p_profil, btrim(p_sarlavha), p_mazmun, coalesce(p_dalil, '[]'::jsonb), p_actor_id, p_run_id) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
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
drop function if exists public.t2_agent_bilim_holat_v1(bigint);
drop function if exists public.t2_agent_kuzatuv_belgila_v1(bigint, bigint, text, text, text);
drop function if exists public.t2_agent_kuzatuv_saqla_v1(bigint, text, text, text, boolean);
drop function if exists public.t2_agent_kuzatuv_royxat_v1(bigint);
drop function if exists public.t2_agent_bilim_umumiy_v1(bigint);
drop function if exists public.t2_agent_bilim_v1(bigint, bigint);
drop table if exists public.t2_agent_kuzatuv_url;
drop table if exists public.t2_agent_bilim;
