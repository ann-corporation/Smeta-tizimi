-- Rollback: 20270104000000 - AI telemetriyasi. Diqqat: t2_ai_telemetriya qatorlari va baho qatorlari (t2_agent_fikr.baho is not null) O'CHIRILADI (faqat o'lchov ma'lumoti).
delete from public.t2_agent_fikr where baho is not null;
drop function if exists public.t2_ai_telemetriya_yoz_v1(bigint, bigint, text, text, integer, boolean, text, text, text[], integer, integer, integer, text);
drop function if exists public.t2_ai_baho_yoz_v1(bigint, bigint, integer, text, text);
drop function if exists public.t2_ai_salomatlik_v1(bigint);
drop function if exists public._t2_ai_oyna_v1(integer);
drop function if exists public.t2_ai_ishchi_holat_v1();
delete from public.t2_arxiv_siyosat where jadval = 't2_ai_telemetriya';
delete from public.t2_arxiv_bolak where jadval = 't2_ai_telemetriya';
drop table if exists public.t2_ai_telemetriya;
drop index if exists public.t2_agent_fikr_baho_ix;
alter table public.t2_agent_fikr drop column if exists baho, drop column if exists yuza, drop column if exists sabab;
-- t2_agent_fikr_royxat_v1 ning baho filtri qoladi (zararsiz: baho ustuni yo'q bo'lsa funksiya xato beradi) - avvalgi matnga qaytarish:
create or replace function public.t2_agent_fikr_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.id desc), '[]') into v from (
    select id, tur, matn, sahifa, ai_javob, holat, global_ulashish, yaratildi from t2_agent_fikr where kompaniya_id = p_kompaniya_id order by id desc limit 100) z;
  return jsonb_build_object('ok', true, 'natija', v);
end $$;