-- Reversible rollback for T2-PTO-EXACT-F2-WORKBENCH-001.
drop function if exists public.t2_workbench_exact_v1(bigint,bigint,date,integer);
