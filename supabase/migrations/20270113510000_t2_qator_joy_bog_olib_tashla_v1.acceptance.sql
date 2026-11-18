-- Qabul (ROLLBACK ichida): jadval va RPC lar olib tashlangan.
do $$
begin
  assert to_regclass('public.t2_qator_joy_bog') is null, 'jadval qoldi';
  assert to_regprocedure('public.t2_qator_joy_ol_v1(bigint,bigint,bigint)') is null, 'ol rpc qoldi';
  assert to_regprocedure('public.t2_qator_joy_qoy_v1(bigint,bigint,bigint,bigint,bigint,boolean)') is null, 'qoy rpc qoldi';
end $$;
