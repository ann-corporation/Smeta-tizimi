-- KOMPANIYA AI SOZLAMALARI (kompaniya admini/boss/direktori o'zi boshqaradi): AI yoqish/o'chirish, oylik TOKEN limiti, a'zolar uchun AI kuzatuviga ruxsat.
-- Sarf tekshiruvi (t2_agent_sarf_tekshir_v1) shularni majburan qo'llaydi: o'chirilgan kompaniyada AI ishlamaydi, token limiti tugasa to'xtaydi.
set local statement_timeout = '60s';

create table if not exists public.t2_agent_kompaniya_sozlama (
  kompaniya_id bigint primary key references public.t2_kompaniya(id) on delete cascade,
  ai_yoqilgan boolean not null default true,
  oylik_token_limit numeric(14,2) check (oylik_token_limit is null or oylik_token_limit >= 0),
  kuzatuv_ruxsat boolean not null default true,
  actor_id bigint not null,
  yangilandi timestamptz not null default now()
);
alter table public.t2_agent_kompaniya_sozlama enable row level security;
revoke all on public.t2_agent_kompaniya_sozlama from public, anon, authenticated;

-- O'qish: kompaniyaning istalgan faol a'zosi (ko'rinish uchun); yozish: admin/boss/director
create or replace function public.t2_agent_kompaniya_sozlama_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; z public.t2_agent_kompaniya_sozlama%rowtype; v_oy numeric;
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select * into z from t2_agent_kompaniya_sozlama where kompaniya_id = p_kompaniya_id;
  select coalesce(sum(mijoz_token), 0) into v_oy from t2_agent_sarf where kompaniya_id = p_kompaniya_id and vaqt >= date_trunc('month', now());
  return jsonb_build_object('ok', true, 'ai_yoqilgan', coalesce(z.ai_yoqilgan, true), 'oylik_token_limit', z.oylik_token_limit, 'kuzatuv_ruxsat', coalesce(z.kuzatuv_ruxsat, true),
    'oy_token', v_oy, 'balans', public.t2_token_balans(p_kompaniya_id), 'tahrir_mumkin', public._t2_agent_qaror_rol_ok(g->>'rol'));
end $$;

create or replace function public.t2_agent_kompaniya_sozlama_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_ai_yoqilgan boolean, p_token_limit numeric, p_kuzatuv_ruxsat boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if not public._t2_agent_qaror_rol_ok(g->>'rol') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  if p_token_limit is not null and (p_token_limit < 0 or p_token_limit > 100000000) then return jsonb_build_object('ok', false, 'code', 'LIMIT_INVALID'); end if;
  insert into t2_agent_kompaniya_sozlama (kompaniya_id, ai_yoqilgan, oylik_token_limit, kuzatuv_ruxsat, actor_id)
  values (p_kompaniya_id, coalesce(p_ai_yoqilgan, true), p_token_limit, coalesce(p_kuzatuv_ruxsat, true), p_actor_id)
  on conflict (kompaniya_id) do update set ai_yoqilgan = excluded.ai_yoqilgan, oylik_token_limit = excluded.oylik_token_limit,
    kuzatuv_ruxsat = excluded.kuzatuv_ruxsat, actor_id = excluded.actor_id, yangilandi = now();
  perform public.t2_audit_yoz(p_kompaniya_id, 'ai_sozlama_ozgardi', 'kompaniya', null,
    format('ai=%s token_limit=%s kuzatuv=%s', coalesce(p_ai_yoqilgan, true), coalesce(p_token_limit::text, '-'), coalesce(p_kuzatuv_ruxsat, true)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

-- sarf_tekshir: kompaniya sozlamasi (o'chirilgan / oylik token limiti) ham majburiy
create or replace function public.t2_agent_sarf_tekshir_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; pl public.t2_agent_byudjet%rowtype; ko public.t2_agent_byudjet%rowtype; z public.t2_agent_kompaniya_sozlama%rowtype; v_pl numeric; v_ko numeric; v_tok numeric;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select * into pl from t2_agent_byudjet where kompaniya_id is null;
  if not found or not pl.faol then return jsonb_build_object('ok', false, 'code', 'BYUDJET_YOQ', 'xabar', 'AI uchun oylik limit belgilanmagan'); end if;
  v_pl := public._t2_agent_oy_sarfi_v1(null);
  if v_pl >= pl.oylik_limit_usd then return jsonb_build_object('ok', false, 'code', 'BYUDJET_TUGADI', 'doira', 'platforma', 'xabar', 'AI ning platforma oylik limiti tugadi'); end if;
  if p_kompaniya_id is not null then
    select * into z from t2_agent_kompaniya_sozlama where kompaniya_id = p_kompaniya_id;
    if found and not z.ai_yoqilgan then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_AI_OCHIQ', 'xabar', 'Kompaniya admini AI ni o''chirgan'); end if;
    if found and z.oylik_token_limit is not null then
      select coalesce(sum(mijoz_token), 0) into v_tok from t2_agent_sarf where kompaniya_id = p_kompaniya_id and vaqt >= date_trunc('month', now());
      if v_tok >= z.oylik_token_limit then return jsonb_build_object('ok', false, 'code', 'TOKEN_LIMIT_TUGADI', 'xabar', 'Kompaniyaning AI oylik token limiti tugadi'); end if;
    end if;
    select * into ko from t2_agent_byudjet where kompaniya_id = p_kompaniya_id and faol;
    if found then
      v_ko := public._t2_agent_oy_sarfi_v1(p_kompaniya_id);
      if v_ko >= ko.oylik_limit_usd then return jsonb_build_object('ok', false, 'code', 'BYUDJET_TUGADI', 'doira', 'kompaniya', 'xabar', 'Kompaniyaning AI oylik limiti tugadi'); end if;
    end if;
    if public.t2_token_balans(p_kompaniya_id) <= 0 then return jsonb_build_object('ok', false, 'code', 'TOKEN_YETMAYDI', 'xabar', 'Tokenlar yetarli emas — hisobni to''ldiring'); end if;
  end if;
  return jsonb_build_object('ok', true, 'platforma_qoldi_usd', pl.oylik_limit_usd - v_pl, 'ogohlantirish', v_pl >= pl.oylik_limit_usd * pl.ogohlantirish_foiz / 100.0);
end $$;

revoke all on function public.t2_agent_kompaniya_sozlama_v1(bigint, bigint), public.t2_agent_kompaniya_sozlama_saqla_v1(bigint, bigint, boolean, numeric, boolean),
  public.t2_agent_sarf_tekshir_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_agent_kompaniya_sozlama_v1(bigint, bigint), public.t2_agent_kompaniya_sozlama_saqla_v1(bigint, bigint, boolean, numeric, boolean),
  public.t2_agent_sarf_tekshir_v1(bigint, bigint) to service_role;
