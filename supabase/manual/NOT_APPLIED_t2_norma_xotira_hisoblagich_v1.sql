-- DESIGN ONLY - NOT APPLIED, NOT in supabase/migrations (owner rule: no migration without approval).
-- Shared per-company memory for norm matching (frontend/src/lib/smeta-ai/norm-xotira.ts): "once a line is confirmed in this company,
-- the same/similar text gets that code first". COUNTERS only, never raw text: per (company, canonical norm code, word-stem hash).
-- The existing t2_smeta_tanlov_tajriba keeps raw `tavsif` text (<= 400 chars) and is a platform-wide log; this table is the compact,
-- per-company, text-free alternative. Today the browser keeps the same JSON in localStorage (per company).
--
-- Size: ~14 stem rows per confirmed line; a company with 2 000 distinct codes => ~30 000 rows (small ints only).

create table if not exists public.t2_norma_xotira (
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  norma_kalit  text   not null check (length(norma_kalit) between 2 and 80),   -- canonical key, e.g. 'Е6-1-1-1' (kodKalit)
  belgi        text   not null default '' check (length(belgi) <= 8),           -- FNV-1a/base36 hash of a word stem; '' = the code's own counter
  soni         integer not null check (soni >= 0),
  yangilandi   timestamptz not null default now(),
  primary key (kompaniya_id, norma_kalit, belgi)
);
alter table public.t2_norma_xotira enable row level security;
revoke all on public.t2_norma_xotira from public, anon, authenticated;

-- Read: the whole memory of a company as {"Е6-1-1-1": {"n": 3, "s": {"1a2b3c": 3}}} (the shape of the client Xotira object).
create or replace function public.t2_norma_xotira_ol_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  return jsonb_build_object('ok', true, 'xotira', jsonb_build_object('v', 1, 'k', coalesce((
    select jsonb_object_agg(norma_kalit, jsonb_build_object('n', n, 's', s))
    from (select norma_kalit, max(soni) filter (where belgi = '') as n,
                 coalesce(jsonb_object_agg(belgi, soni) filter (where belgi <> ''), '{}'::jsonb) as s
          from t2_norma_xotira where kompaniya_id = p_kompaniya_id group by norma_kalit) z), '{}'::jsonb)));
end $$;

-- Write: a confirmed line = increment (p_delta = 1) or a rejection (p_delta = -1); p_belgilar = array of stem hashes (<= 14).
create or replace function public.t2_norma_xotira_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_norma_kalit text, p_belgilar text[], p_delta integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; b text;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if g->>'rol' = 'kuzatuvchi' then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  if p_norma_kalit is null or length(p_norma_kalit) not between 2 and 80 or p_delta not in (-1, 1)
     or coalesce(array_length(p_belgilar, 1), 0) > 14 then return jsonb_build_object('ok', false, 'code', 'XOTIRA_INVALID'); end if;
  insert into t2_norma_xotira (kompaniya_id, norma_kalit, belgi, soni) values (p_kompaniya_id, p_norma_kalit, '', greatest(p_delta, 0))
    on conflict (kompaniya_id, norma_kalit, belgi) do update set soni = greatest(t2_norma_xotira.soni + p_delta, 0), yangilandi = now();
  foreach b in array coalesce(p_belgilar, '{}') loop
    if b ~ '^[0-9a-z]{1,8}$' then
      insert into t2_norma_xotira (kompaniya_id, norma_kalit, belgi, soni) values (p_kompaniya_id, p_norma_kalit, b, greatest(p_delta, 0))
        on conflict (kompaniya_id, norma_kalit, belgi) do update set soni = greatest(t2_norma_xotira.soni + p_delta, 0), yangilandi = now();
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end $$;
-- Rollback: drop function public.t2_norma_xotira_yoz_v1(bigint,bigint,text,text[],integer); drop function public.t2_norma_xotira_ol_v1(bigint,bigint); drop table public.t2_norma_xotira;
