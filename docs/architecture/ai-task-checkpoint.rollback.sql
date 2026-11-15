-- DRAFT ONLY rollback for docs/architecture/ai-task-checkpoint.sql.
revoke all on function public.t2_jarvis_vazifa_ol_v1(bigint,bigint,bigint,text) from public, anon, authenticated, service_role;
revoke all on function public.t2_jarvis_vazifa_royxat_v1(bigint,bigint,bigint) from public, anon, authenticated, service_role;
revoke all on function public.t2_jarvis_vazifa_saqla_v1(bigint,bigint,bigint,text,integer,jsonb) from public, anon, authenticated, service_role;
revoke all on function public._t2_jarvis_vazifa_tekshir_v1(jsonb,bigint,bigint,bigint,integer) from public, anon, authenticated, service_role;
drop function if exists public.t2_jarvis_vazifa_ol_v1(bigint,bigint,bigint,text);
drop function if exists public.t2_jarvis_vazifa_royxat_v1(bigint,bigint,bigint);
drop function if exists public.t2_jarvis_vazifa_saqla_v1(bigint,bigint,bigint,text,integer,jsonb);
drop function if exists public._t2_jarvis_vazifa_tekshir_v1(jsonb,bigint,bigint,bigint,integer);
drop index if exists public.t2_jarvis_vazifa_scope_yangilandi_idx;
drop table if exists public.t2_jarvis_vazifa;
