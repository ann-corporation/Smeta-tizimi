-- ROLLBACK 20270120220000_t2_transport_belgila_v1 (belgilangan usullar ma'lumot sifatida qoladi)
drop function if exists public.t2_qator_transport_belgila_v1(bigint, bigint, bigint[], text);
