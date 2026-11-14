do $$
begin
  if not public._t2_tomon_rol_ok('pto','murojaat') then raise exception 'pto murojaat yarata olmaydi'; end if;
  if not public._t2_tomon_rol_ok('inspektor','murojaat') then raise exception 'inspektor murojaat yarata olmaydi'; end if;
  if not public._t2_tomon_rol_ok('buyurtmachi','murojaat') then raise exception 'buyurtmachi murojaat yarata olmaydi'; end if;
  if public._t2_tomon_rol_ok('kuzatuvchi','murojaat') then raise exception 'kuzatuvchi murojaat yaratmasligi kerak'; end if;
  if public._t2_tomon_rol_ok('pto','qaror') then raise exception 'pto qaror bera olmasligi kerak'; end if;
  if not public._t2_tomon_rol_ok('inspektor','qaror') then raise exception 'inspektor qaror bera olishi kerak'; end if;
  if public._t2_tomon_rol_ok('pto','nomalum') then raise exception 'nomalum amal yopiq bolishi kerak'; end if;
  raise notice 'ACCEPT_OK tomon_rol_murojaat';
end $$;