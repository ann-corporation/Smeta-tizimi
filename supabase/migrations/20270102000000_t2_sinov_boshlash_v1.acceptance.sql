-- Qabul sinovi (ROLLBACK ichida ishga tushiring: migratsiya + shu fayl bitta tranzaksiyada, oxirida rollback). Hech narsa saqlanmaydi.
do $$
declare u1 bigint; u2 bigint; u3 bigint; r jsonb; r2 jsonb; kid bigint; bal numeric; n1 int; n2 int; ip text := 'sinov-test-ip-' || gen_random_uuid()::text;
  op1 uuid := gen_random_uuid(); op2 uuid := gen_random_uuid(); op3 uuid := gen_random_uuid(); u_extra bigint; kid2 bigint;
begin
  insert into public.t2_foydalanuvchi(login, email, ism, holat) values ('sinov-a-' || gen_random_uuid() || '@test.invalid', 'a@test.invalid', 'Sinov A', 'faol') returning id into u1;
  insert into public.t2_foydalanuvchi(login, email, ism, holat) values ('sinov-b-' || gen_random_uuid() || '@test.invalid', 'b@test.invalid', 'Sinov B', 'faol') returning id into u2;

  -- 1) boshlash: ish joyi + 1000 token, bir marta
  r := public.t2_sinov_boshlash_v1(u1, op1);
  if (r->>'ok')::boolean is not true then raise exception 'boshlash ok emas: %', r; end if;
  kid := (r->>'kompaniya_id')::bigint;
  if public.t2_token_balans(kid) <> 1000 then raise exception 'balans 1000 emas: %', public.t2_token_balans(kid); end if;
  if (select count(*) from public.t2_token_harakat where kompaniya_id = kid and amal = 'sinov_boshlangich' and tur = 'bonus' and miqdor = 1000) <> 1 then raise exception 'ledger yozuvi yoq/ko''p'; end if;
  if not exists (select 1 from public.t2_azolik where foydalanuvchi_id = u1 and kompaniya_id = kid and rol = 'boss' and holat = 'faol') then raise exception 'boss azolik yoq'; end if;

  -- 2) idempotent: o'sha operation_id ham, yangi operation_id ham — qayta bonus YO'Q
  r2 := public.t2_sinov_boshlash_v1(u1, op1);
  if (r2->>'takror')::boolean is not true or (r2->>'kompaniya_id')::bigint <> kid then raise exception 'takror (op) buzildi: %', r2; end if;
  r2 := public.t2_sinov_boshlash_v1(u1, op2);
  if (r2->>'takror')::boolean is not true or (r2->>'kompaniya_id')::bigint <> kid then raise exception 'takror (yangi op) buzildi: %', r2; end if;
  if public.t2_token_balans(kid) <> 1000 then raise exception 'qayta bonus berildi'; end if;
  if (select count(*) from public.t2_kompaniya k join public.t2_azolik a on a.kompaniya_id = k.id where a.foydalanuvchi_id = u1) <> 1 then raise exception 'ikkinchi kompaniya ochildi'; end if;
  -- boshqa foydalanuvchi bilan operation_id to'qnashuvi
  r2 := public.t2_sinov_boshlash_v1(u2, op1);
  if r2->>'code' <> 'OPERATION_CONFLICT' then raise exception 'OPERATION_CONFLICT kutilgan: %', r2; end if;

  -- 3) holat
  r2 := public.t2_sinov_holat_v1(u1);
  if (r2->>'boshlangan')::boolean is not true or (r2->>'balans')::numeric <> 1000 or (r2->>'boshlash_mumkin')::boolean then raise exception 'holat noto''g''ri: %', r2; end if;
  r2 := public.t2_sinov_holat_v1(u2);
  if (r2->>'boshlangan')::boolean or (r2->>'boshlash_mumkin')::boolean is not true then raise exception 'holat (yangi) noto''g''ri: %', r2; end if;

  -- 4) demo: faqat o'z sinov kompaniyasiga; bir marta; boshqasi ko'ra olmaydi
  r := public.t2_sinov_demo_v1(u2, gen_random_uuid());
  if r->>'code' <> 'SINOV_YOQ' then raise exception 'sinovsiz demo ruxsat etildi: %', r; end if;
  r := public.t2_sinov_demo_v1(u1, op3);
  if (r->>'ok')::boolean is not true then raise exception 'demo ok emas: %', r; end if;
  if (select kompaniya_id from public.t2_obyekt where id = (r->>'demo_obyekt_id')::bigint) <> kid then raise exception 'demo boshqa kompaniyada'; end if;
  if (select count(*) from public.t2_qator where obyekt_id = (r->>'demo_obyekt_id')::bigint and kompaniya_id <> kid) <> 0 then raise exception 'demo qatorlari boshqa kompaniyada'; end if;
  n1 := (select count(*) from public.t2_qator where obyekt_id = (r->>'demo_obyekt_id')::bigint);
  if n1 < 5 or n1 > 40 then raise exception 'demo hajmi kutilmagan: %', n1; end if;
  r2 := public.t2_sinov_demo_v1(u1, gen_random_uuid());
  if (r2->>'takror')::boolean is not true or r2->>'demo_obyekt_id' <> r->>'demo_obyekt_id' then raise exception 'demo takror buzildi: %', r2; end if;
  -- u2 ning kompaniyalarida (yo'q) u1 ma'lumoti ko'rinmaydi
  if exists (select 1 from public.t2_azolik a join public.t2_obyekt o on o.kompaniya_id = a.kompaniya_id where a.foydalanuvchi_id = u2 and o.id = (r->>'demo_obyekt_id')::bigint) then raise exception 'izolyatsiya buzildi'; end if;

  -- 5) a'zoligi bor hisobga sinov berilmaydi (taklif orqali kelgan)
  insert into public.t2_foydalanuvchi(login, email, ism, holat) values ('sinov-c-' || gen_random_uuid() || '@test.invalid', 'c@test.invalid', 'Sinov C', 'faol') returning id into u3;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) values (u3, kid, 'pto', 'faol');
  r := public.t2_sinov_boshlash_v1(u3, gen_random_uuid());
  if r->>'code' <> 'SINOV_KERAKMAS' then raise exception 'a''zo hisobga sinov berildi: %', r; end if;

  -- 6) haqiqiy kompaniyaga aylanish: yangi kompaniya yo'q, bonus qayta yo'q, tokenlar saqlanadi
  r := public.t2_kompaniya_ozi_och_v1(u1, 'Test Qurilish MChJ', null, null, gen_random_uuid());
  if (r->>'ok')::boolean is not true or (r->>'sinovdan')::boolean is not true or (r->>'kompaniya_id')::bigint <> kid then raise exception 'aylantirish buzildi: %', r; end if;
  if public.t2_token_balans(kid) <> 1000 then raise exception 'aylantirishda balans o''zgardi'; end if;
  if (select nom from public.t2_kompaniya where id = kid) <> 'Test Qurilish MChJ' then raise exception 'nom yangilanmadi'; end if;
  r := public.t2_kompaniya_ozi_och_v1(u1, 'Yana', null, null, gen_random_uuid());
  if r->>'code' <> 'OZI_OCHILGAN' then raise exception 'ikkinchi ozi_och ruxsat etildi: %', r; end if;
  -- sinovsiz yo'l (a'zosiz foydalanuvchi) eski qoidada: yangi kompaniya + sinov bonusi
  insert into public.t2_foydalanuvchi(login, email, ism, holat) values ('sinov-d-' || gen_random_uuid() || '@test.invalid', 'd@test.invalid', 'Sinov D', 'faol') returning id into u_extra;
  r := public.t2_kompaniya_ozi_och_v1(u_extra, 'Boshqa MChJ', null, null, gen_random_uuid());
  if (r->>'ok')::boolean is not true or coalesce((r->>'sinovdan')::boolean, false) then raise exception 'sinovsiz yol buzildi: %', r; end if;
  kid2 := (r->>'kompaniya_id')::bigint;
  if kid2 = kid then raise exception 'kompaniyalar aralashdi'; end if;

  raise notice 'ACCEPT_OK sinov_boshlash';
end $$;
