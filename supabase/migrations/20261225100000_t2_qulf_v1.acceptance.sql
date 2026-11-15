-- Acceptance: 20261225000000 t2_qulf_v1 (ISHGA TUSHIRILMAGAN). Tashqi tranzaksiya ichida (begin ... rollback). SINTETIK foydalanuvchi.
do $acc$
declare v_u bigint; r jsonb; f text; i integer; s text := floor(random()*1e9)::text;
begin
  foreach f in array array['t2_qulf_urinish_v1(bigint,boolean)','t2_qulf_chaqiriq_ishlat_v1(text,bigint,timestamptz)','t2_qulf_talab_v1(bigint,bigint)'] loop
    if to_regprocedure('public.' || f) is null then raise exception 'ACCEPT_FAIL: % yo''q', f; end if;
    if has_function_privilege('anon','public.'||f,'execute') or has_function_privilege('authenticated','public.'||f,'execute') then raise exception 'ACCEPT_FAIL: % ochiq', f; end if;
    if not has_function_privilege('service_role','public.'||f,'execute') then raise exception 'ACCEPT_FAIL: % service_role ga yopiq', f; end if;
  end loop;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('qulf-'||s||'@sinov.invalid','Sinov Qulf','faol') returning id into v_u;
  insert into public.t2_qulf_foydalanuvchi (foydalanuvchi_id, pin_hash) values (v_u, repeat('x', 60));
  -- Q1 5 ketma-ket xato -> BLOKLANGAN
  for i in 1..4 loop r := public.t2_qulf_urinish_v1(v_u, false); if r->>'code' <> 'PIN_NOTOGRI' then raise exception 'ACCEPT_FAIL: %', r; end if; end loop;
  r := public.t2_qulf_urinish_v1(v_u, false);
  if r->>'code' <> 'BLOKLANGAN' then raise exception 'ACCEPT_FAIL: 5-xato blok bermadi %', r; end if;
  -- Q2 muvaffaqiyat hisoblagichni nolga tushiradi
  r := public.t2_qulf_urinish_v1(v_u, true);
  if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: %', r; end if;
  -- Q3 jami 10 xato -> QAYTA_KIRISH_KERAK
  for i in 1..9 loop r := public.t2_qulf_urinish_v1(v_u, false); end loop;
  r := public.t2_qulf_urinish_v1(v_u, false);
  if r->>'code' <> 'QAYTA_KIRISH_KERAK' then raise exception 'ACCEPT_FAIL: 10-xato %', r; end if;
  -- Q4 challenge bir martalik
  r := public.t2_qulf_chaqiriq_ishlat_v1('0123456789abcdef-' || s, v_u, now() + interval '2 minutes');
  if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: chaqiriq %', r; end if;
  r := public.t2_qulf_chaqiriq_ishlat_v1('0123456789abcdef-' || s, v_u, now() + interval '2 minutes');
  if r->>'ok' <> 'false' then raise exception 'ACCEPT_FAIL: chaqiriq qayta ishlatildi %', r; end if;
  -- Q5 talab: PIN bor, kompaniyasiz (a'zolik yo'q) -> standart 'pin' -> talab=true
  r := public.t2_qulf_talab_v1(v_u, null);
  if (r->>'pin')::boolean is not true then raise exception 'ACCEPT_FAIL: talab %', r; end if;
end $acc$;