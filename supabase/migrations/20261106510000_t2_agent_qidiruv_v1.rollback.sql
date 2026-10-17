-- Rollback 20261106510000_t2_agent_qidiruv_v1: faqat o'qish funksiyasi olib tashlanadi.
drop function if exists public.t2_agent_qidiruv_v1(bigint, bigint, text[], text[], bigint);
