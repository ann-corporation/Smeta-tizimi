-- Qabul (o'qish, ROLLBACK ichida ishlating): jadval, RLS va RPC lar bor; anon/authenticated to'g'ridan-to'g'ri kira olmaydi.
do $$
begin
  assert to_regclass('public.t2_qator_joy_bog') is not null, 'jadval yo''q';
  assert (select relrowsecurity from pg_class where oid = 'public.t2_qator_joy_bog'::regclass), 'RLS o''chiq';
  assert not has_table_privilege('authenticated', 'public.t2_qator_joy_bog', 'select'), 'authenticated o''qiy oladi';
  assert to_regprocedure('public.t2_qator_joy_ol_v1(bigint,bigint,bigint)') is not null, 'ol rpc yo''q';
  assert to_regprocedure('public.t2_qator_joy_qoy_v1(bigint,bigint,bigint,bigint,bigint,boolean)') is not null, 'qoy rpc yo''q';
  assert not has_function_privilege('authenticated', 'public.t2_qator_joy_qoy_v1(bigint,bigint,bigint,bigint,bigint,boolean)', 'execute'), 'authenticated chaqira oladi';
end $$;
