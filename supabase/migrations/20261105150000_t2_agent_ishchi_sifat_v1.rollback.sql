-- Rollback: T2-AGENT-ISHCHI-SIFAT-001 (faqat funksiya; run va audit yozuvlari saqlanadi).
begin;
drop function if exists public.t2_agent_ishchi_sifat_v1(bigint, bigint, integer, uuid);
commit;
