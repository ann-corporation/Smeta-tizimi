-- Acceptance: 20261224100000 t2_username_v1. SINTETIK yozuvlar (o'zi yaratadi). Tashqi tranzaksiya ichida (begin ... rollback) ishga tushiriladi.
-- U1 huquqlar: anon/authenticated yo'q, service_role bor. U2 format qoidalari + band so'zlar. U3 noyoblik (katta-kichik harfga befarq).
-- U4 sutkasiga 5 o'zgartirish limiti. U5 qidiruv: username/telefon/email aniq, telefon/email qaytmaydi, privacy 'hech'/'kompaniyadosh'.
-- U6 taklif: kutiladi, a'zo qilinmaydi; qabul qilgach a'zo; huquqsiz rad; topilmasa telefon taklifi belgisi.
do $acc$
declare
  v_a bigint; v_b bigint; v_c bigint; v_k bigint; r jsonb; f text; i integer; s text := floor(random()*1e9)::text; tel text := '+99890' || lpad((floor(random()*9000000)+1000000)::bigint::text, 7, '0');
begin
  foreach f in array array['t2_username_belgila_v1(bigint,text,uuid)','t2_username_tekshir_v1(bigint,text,text[])','t2_foydalanuvchi_qidir_v1(bigint,text)','t2_kompaniya_taklif_yubor_v1(bigint,bigint,text,text,uuid)','t2_kompaniya_taklif_javob_v1(bigint,bigint,boolean,uuid)','t2_username_ommaviy_v1(bigint,bigint[])'] loop
    if to_regprocedure('public.' || f) is null then raise exception 'ACCEPT_FAIL: % yo''q', f; end if;
    if has_function_privilege('anon','public.'||f,'execute') or has_function_privilege('authenticated','public.'||f,'execute') then raise exception 'ACCEPT_FAIL: % ochiq', f; end if;
    if not has_function_privilege('service_role','public.'||f,'execute') then raise exception 'ACCEPT_FAIL: % service_role ga yopiq', f; end if;
  end loop;
  insert into public.t2_foydalanuvchi (login, ism, holat, email, telefon_e164) values ('un-a-'||s||'@sinov.invalid','Sinov Bir','faol','un-a-'||s||'@sinov.invalid', tel) returning id into v_a;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('un-b-'||s||'@sinov.invalid','Sinov Ikki','faol') returning id into v_b;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('un-c-'||s||'@sinov.invalid','Sinov Uch','faol') returning id into v_c;
  -- U2 format
  foreach f in array array['ab','a__bcde','1abcde','abcde_','admin','qurai_x','Ab-cde','a'||repeat('b',32)] loop
    r := public.t2_username_belgila_v1(v_a, f, gen_random_uuid());
    if coalesce((r->>'ok')::boolean,true) is not false then raise exception 'ACCEPT_FAIL: yomon username qabul qilindi: %', f; end if;
  end loop;
  r := public.t2_username_belgila_v1(v_a, '@Sinov_'||s, gen_random_uuid());
  if r->>'ok' <> 'true' or r->>'username' <> lower('sinov_'||s) then raise exception 'ACCEPT_FAIL: yaroqli username qabul qilinmadi %', r; end if;
  -- U3 noyoblik
  r := public.t2_username_belgila_v1(v_b, upper('sinov_'||s), gen_random_uuid());
  if r->>'code' <> 'USERNAME_BAND' then raise exception 'ACCEPT_FAIL: band username berildi %', r; end if;
  r := public.t2_username_tekshir_v1(v_b, 'sinov_'||s, array['sinov_'||s||'_1']);
  if (r->>'band')::boolean is not true or not (r->'variantlar') ? ('sinov_'||s||'_1') then raise exception 'ACCEPT_FAIL: tekshir %', r; end if;
  -- U4 limit (birinchi belgilash hisobga kirmaydi; keyingi 5 ta o'zgartirish ruxsat, 6-si rad)
  for i in 1..5 loop
    r := public.t2_username_belgila_v1(v_a, 'sinov_'||s||'_'||i, gen_random_uuid());
    if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: o''zgartirish % rad: %', i, r; end if;
  end loop;
  r := public.t2_username_belgila_v1(v_a, 'sinov_'||s||'_x', gen_random_uuid());
  if r->>'code' <> 'USERNAME_LIMIT' then raise exception 'ACCEPT_FAIL: limit ishlamadi %', r; end if;
  -- U5 qidiruv
  r := public.t2_foydalanuvchi_qidir_v1(v_b, '@SINOV_'||s||'_5');
  if (r->>'topildi')::boolean is not true or r->>'tur' <> 'username' or (r->'profil'->>'id')::bigint <> v_a then raise exception 'ACCEPT_FAIL: username qidiruv %', r; end if;
  r := public.t2_foydalanuvchi_qidir_v1(v_b, tel);
  if (r->>'topildi')::boolean is not true or r->>'tur' <> 'telefon' or r::text like '%'||right(tel,7)||'%' then raise exception 'ACCEPT_FAIL: telefon qidiruv/echo %', r; end if;
  r := public.t2_foydalanuvchi_qidir_v1(v_b, 'un-a-'||s||'@sinov.invalid');
  if (r->>'topildi')::boolean is not true or r->>'tur' <> 'email' or r::text like '%sinov.invalid%' then raise exception 'ACCEPT_FAIL: email qidiruv/echo %', r; end if;
  update public.t2_foydalanuvchi set telefon_qidiruv = 'hech' where id = v_a;
  r := public.t2_foydalanuvchi_qidir_v1(v_b, tel);
  if (r->>'topildi')::boolean is not false then raise exception 'ACCEPT_FAIL: hech sozlamasi buzildi'; end if;
  r := public.t2_foydalanuvchi_qidir_v1(v_b, '@sinov_'||s||'_5');
  if (r->>'topildi')::boolean is not true then raise exception 'ACCEPT_FAIL: username hech sozlamasidan ta''sirlanmasligi kerak'; end if;
  update public.t2_foydalanuvchi set telefon_qidiruv = 'kompaniyadosh' where id = v_a;
  r := public.t2_foydalanuvchi_qidir_v1(v_b, tel);
  if (r->>'topildi')::boolean is not false then raise exception 'ACCEPT_FAIL: kompaniyadosh: begona topdi'; end if;
  -- U6 taklif
  insert into public.t2_kompaniya (nom, kod, faol) values ('Sinov Kompaniya '||s, 'UN'||s, true) returning id into v_k;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (v_b, v_k, 'boss', 'faol');
  update public.t2_foydalanuvchi set telefon_qidiruv = 'hammasi' where id = v_a;
  r := public.t2_kompaniya_taklif_yubor_v1(v_c, v_k, '@sinov_'||s||'_5', 'prorab', gen_random_uuid());
  if r->>'code' <> 'RUXSAT_YOQ' then raise exception 'ACCEPT_FAIL: huquqsiz taklif %', r; end if;
  r := public.t2_kompaniya_taklif_yubor_v1(v_b, v_k, '@sinov_'||s||'_5', 'prorab', gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: taklif %', r; end if;
  if exists (select 1 from public.t2_azolik where foydalanuvchi_id = v_a and kompaniya_id = v_k) then raise exception 'ACCEPT_FAIL: taklif jimgina a''zo qildi'; end if;
  r := public.t2_kompaniya_taklif_royxat_v1(v_a);
  if jsonb_array_length(r->'royxat') <> 1 then raise exception 'ACCEPT_FAIL: kutilayotgan taklif royxatda yo''q %', r; end if;
  r := public.t2_kompaniya_taklif_javob_v1(v_c, (r->'royxat'->0->>'id')::bigint, true, gen_random_uuid());
  if r->>'code' <> 'TAKLIF_TOPILMADI' then raise exception 'ACCEPT_FAIL: begona taklifni qabul qildi'; end if;
  r := public.t2_kompaniya_taklif_javob_v1(v_a, (public.t2_kompaniya_taklif_royxat_v1(v_a)->'royxat'->0->>'id')::bigint, true, gen_random_uuid());
  if r->>'ok' <> 'true' or not exists (select 1 from public.t2_azolik where foydalanuvchi_id = v_a and kompaniya_id = v_k and holat = 'faol' and rol = 'prorab') then raise exception 'ACCEPT_FAIL: qabul %', r; end if;
  r := public.t2_kompaniya_taklif_yubor_v1(v_b, v_k, '+99891'||lpad((floor(random()*9000000)+1000000)::bigint::text,7,'0'), 'prorab', gen_random_uuid());
  if r->>'code' <> 'TOPILMADI' or (r->>'telefon_taklif')::boolean is not true then raise exception 'ACCEPT_FAIL: hisobsiz telefon %', r; end if;
  raise notice 'ACCEPT_OK t2_username_v1';
end $acc$;