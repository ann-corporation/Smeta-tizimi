-- Acceptance: 20261221900000_t2_imzo_birlashgan_parol_v1. BEGIN ... ROLLBACK - hech narsa saqlanmaydi.
-- Sintetik ma'lumotlar (IMZO-BP-*); real ism/parol/INN YO'Q.
begin;
set local statement_timeout = '120s';

do $t$
declare
  v_a bigint; v_m bigint; v_x bigint; v_p bigint;
  r jsonb;
begin
  -- asosiy (parolli) + unga birlashtirilgan hisob (boshqa parol)
  insert into public.t2_foydalanuvchi (login, ism, holat, parol_hash)
    values ('imzo-bp-asosiy', 'IMZO-BP Asosiy', 'faol', extensions.crypt('bp-asosiy-parol', extensions.gen_salt('bf'))) returning id into v_a;
  insert into public.t2_foydalanuvchi (login, ism, holat, parol_hash, birlashgan_id)
    values ('imzo-bp-eski', 'IMZO-BP Eski', 'birlashtirildi', extensions.crypt('bp-eski-parol', extensions.gen_salt('bf')), v_a) returning id into v_m;
  -- aloqasiz begona hisob (o'z parolli)
  insert into public.t2_foydalanuvchi (login, ism, holat, parol_hash)
    values ('imzo-bp-begona', 'IMZO-BP Begona', 'faol', extensions.crypt('bp-begona-parol', extensions.gen_salt('bf'))) returning id into v_x;
  -- parolsiz hisob
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('imzo-bp-parolsiz', 'IMZO-BP Parolsiz', 'faol') returning id into v_p;

  -- 1) noto'g'ri parol
  r := public.t2_imzo_kalit_yarat_v1(v_a, 'q1', repeat('A', 85) || 'C1', 'xato-parol', false);
  if r->>'code' is distinct from 'PAROL_XATO' then raise exception 'IMZO-BP [xato parol] %', r; end if;
  -- 2) bo'sh parol
  r := public.t2_imzo_kalit_yarat_v1(v_a, 'q1', repeat('A', 85) || 'C1', '', false);
  if r->>'code' is distinct from 'PAROL_XATO' then raise exception 'IMZO-BP [bosh parol] %', r; end if;
  -- 3) begona hisob paroli (asosiyga aloqasiz) rad
  r := public.t2_imzo_kalit_yarat_v1(v_a, 'q1', repeat('A', 85) || 'C1', 'bp-begona-parol', false);
  if r->>'code' is distinct from 'PAROL_XATO' then raise exception 'IMZO-BP [begona parol] %', r; end if;
  -- 4) asosiyning o'z paroli OK
  r := public.t2_imzo_kalit_yarat_v1(v_a, 'q1', repeat('A', 85) || 'C1', 'bp-asosiy-parol', false);
  if (r->>'ok')::boolean is not true then raise exception 'IMZO-BP [oz parol] %', r; end if;
  -- 5) birlashtirilgan hisob paroli OK
  r := public.t2_imzo_kalit_yarat_v1(v_a, 'q2', repeat('A', 85) || 'C2', 'bp-eski-parol', false);
  if (r->>'ok')::boolean is not true then raise exception 'IMZO-BP [birlashgan parol] %', r; end if;
  -- 6) birlashtirilgan hisob holati 'birlashtirildi' bo'lmasa (masalan bekor) - paroli endi qabul qilinmaydi
  update public.t2_foydalanuvchi set holat = 'bekor' where id = v_m;
  r := public.t2_imzo_kalit_yarat_v1(v_a, 'q3', repeat('A', 85) || 'C3', 'bp-eski-parol', false);
  if r->>'code' is distinct from 'PAROL_XATO' then raise exception 'IMZO-BP [holati boshqa] %', r; end if;
  update public.t2_foydalanuvchi set holat = 'birlashtirildi' where id = v_m;
  -- 7) birlashgan hisob paroli BOSHQA asosiy hisob uchun ishlamaydi
  r := public.t2_imzo_kalit_yarat_v1(v_x, 'q1', repeat('A', 85) || 'C4', 'bp-eski-parol', false);
  if r->>'code' is distinct from 'PAROL_XATO' then raise exception 'IMZO-BP [boshqa asosiy] %', r; end if;
  -- 8) parolsiz hisob: p_yangi_kirish shart (o'zgarmagan)
  r := public.t2_imzo_kalit_yarat_v1(v_p, 'q1', repeat('A', 85) || 'C5', null, false);
  if r->>'code' is distinct from 'QAYTA_KIRISH_KERAK' then raise exception 'IMZO-BP [parolsiz eski sessiya] %', r; end if;
  r := public.t2_imzo_kalit_yarat_v1(v_p, 'q1', repeat('A', 85) || 'C5', null, true);
  if (r->>'ok')::boolean is not true then raise exception 'IMZO-BP [parolsiz yangi kirish] %', r; end if;
  -- 9) bekor/yo'q aktor
  r := public.t2_imzo_kalit_yarat_v1(v_m, 'q1', repeat('A', 85) || 'C6', 'bp-eski-parol', true);
  if r->>'code' is distinct from 'ACTOR_NOT_FOUND' then raise exception 'IMZO-BP [birlashgan aktor] %', r; end if;
  -- 10) qurilma/kalit shakli tekshiruvi o'zgarmagan
  r := public.t2_imzo_kalit_yarat_v1(v_a, '', repeat('A', 85) || 'C7', 'bp-asosiy-parol', false);
  if r->>'code' is distinct from 'QURILMA_NOTOGRI' then raise exception 'IMZO-BP [qurilma] %', r; end if;
  r := public.t2_imzo_kalit_yarat_v1(v_a, 'q9', 'qisqa', 'bp-asosiy-parol', false);
  if r->>'code' is distinct from 'KALIT_NOTOGRI' then raise exception 'IMZO-BP [kalit shakli] %', r; end if;

  raise notice 'IMZO-BP acceptance: PASS';
end $t$;

rollback;
