-- Rollback: T2-AGENT-ISHCHI-NARX-AUDIT-001 (funksiya va profil buyrug'i; run/audit yozuvlari saqlanadi).
begin;
drop function if exists public.t2_agent_ishchi_narx_audit_v1(bigint, bigint, integer, uuid, numeric);
update public.t2_agent_profile set allowed_commands = allowed_commands - 'price.evidence.audit', versiya = versiya + 1, updated_at = now()
 where kod = 'pto_smeta' and allowed_commands ? 'price.evidence.audit';
commit;
