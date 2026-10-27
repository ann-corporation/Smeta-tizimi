-- Kontrakt: 20261112400000_t2_sverka_import_v1 (1C akt-sverka importi: to'lov, F3 sotuv, Продажа ↔ F2, to'lov taqsimoti).
-- Faqat izolyatsiyalangan tenantda; hamma yozuv tranzaksiya ichida, oxirida ROLLBACK. Sun'iy ma'lumot (real raqamlar emas).
begin;

do $$
declare f text;
begin
  foreach f in array array[
    'public.t2_sverka_import_v1(bigint,bigint,jsonb,uuid)', 'public.t2_tolov_taqsimot_saqla_v1(bigint,bigint,bigint,jsonb,uuid)',
    'public.t2_forma3_f2_bog_v1(bigint,bigint,bigint,bigint[],bigint[],uuid)', 'public.t2_f2_reestr_yoz_v1(bigint,bigint,jsonb,uuid)', 'public.t2_sverka_moslash_v1(bigint,bigint)'] loop
    if to_regprocedure(f) is null then raise exception 'missing %', f; end if;
    if has_function_privilege('anon', f, 'execute') then raise exception 'anon must not execute %', f; end if;
    if has_function_privilege('authenticated', f, 'execute') then raise exception 'authenticated must not execute %', f; end if;
    if not has_function_privilege('service_role', f, 'execute') then raise exception 'service_role must execute %', f; end if;
  end loop;
  foreach f in array array['public._t2_tolov_taqsimot_yoz(bigint,bigint,jsonb,text)', 'public._t2_forma3_f2_bog(bigint,bigint,bigint[],bigint[])', 'public._t2_akt_shartnoma_f2mi(bigint,bigint,bigint)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then raise exception 'internal % exposed', f; end if;
  end loop;
  if (select provolatile from pg_proc where oid = 'public.t2_sverka_moslash_v1(bigint,bigint)'::regprocedure) <> 's' then
    raise exception 't2_sverka_moslash_v1 must be stable (POST /api/sb)';
  end if;
  if not exists (select 1 from pg_class c where c.oid = to_regclass('public.t2_tolov_taqsimot') and c.relrowsecurity) then raise exception 't2_tolov_taqsimot missing or RLS disabled'; end if;
  if not exists (select 1 from pg_class c where c.oid = to_regclass('public.t2_f2_reestr_jami') and c.relrowsecurity) then raise exception 't2_f2_reestr_jami missing or RLS disabled'; end if;
  if has_table_privilege('anon', 'public.t2_f2_reestr_jami', 'select') or has_table_privilege('authenticated', 'public.t2_f2_reestr_jami', 'select') then
    raise exception 't2_f2_reestr_jami must not be readable by anon/authenticated';
  end if;
  if has_table_privilege('anon', 'public.t2_tolov_taqsimot', 'select') or has_table_privilege('authenticated', 'public.t2_tolov_taqsimot', 'select') then
    raise exception 't2_tolov_taqsimot must not be readable by anon/authenticated';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 't2_tolov' and column_name in ('hujjat_raqam', 'manba')) <> 2 then
    raise exception 't2_tolov hujjat_raqam/manba missing';
  end if;
end $$;

do $$
declare v_k bigint; v_a bigint; v_o1 bigint; v_o2 bigint; v_o3 bigint; v_s1 bigint; v_s2 bigint; v_akt1 bigint; v_akt2 bigint;
  v_op uuid := gen_random_uuid(); v_r jsonb; v_r2 jsonb; v_t1 bigint; v_t2 bigint; v_f3 bigint; v_m jsonb; v_x jsonb;
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
begin
  select k.id, z.foydalanuvchi_id into v_k, v_a from public.t2_kompaniya k join public.t2_azolik z on z.kompaniya_id = k.id
   where z.rol in ('admin', 'superadmin') limit 1;
  if v_k is null then raise notice 'skip functional: no admin membership'; return; end if;
  insert into public.t2_obyekt(nom, kompaniya_id) values ('TEST-SVERKA-O1', v_k) returning id into v_o1;
  insert into public.t2_obyekt(nom, kompaniya_id) values ('TEST-SVERKA-O2', v_k) returning id into v_o2;
  insert into public.t2_obyekt(nom, kompaniya_id) values ('TEST-SVERKA-O3', v_k) returning id into v_o3;
  insert into public.t2_shartnoma(kompaniya_id, raqam, nom, jami_nds_bilan, holat, kim) values (v_k, 'TEST-SV1-' || v_op, 'test', 1000, 'faol', 'test') returning id into v_s1;
  insert into public.t2_shartnoma(kompaniya_id, raqam, nom, jami_nds_bilan, holat, kim) values (v_k, 'TEST-SV2-' || v_op, 'test', 1000, 'faol', 'test') returning id into v_s2;
  insert into public.t2_shartnoma_bog(obyekt_id, shartnoma_id, holat) values (v_o1, v_s1, 'faol'), (v_o2, v_s2, 'faol'), (v_o3, v_s2, 'faol');
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, oy, holat, hujjat_jami, shartnoma_id, raqam) values (v_o1, v_k, 'f2', '2026-01-01', 'tasdiqlangan', 100, v_s1, 'T1') returning id into v_akt1;
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, oy, holat, hujjat_jami, shartnoma_id, raqam) values (v_o1, v_k, 'f2', '2026-02-01', 'tasdiqlangan', 50, v_s1, 'T2') returning id into v_akt2;

  -- 1. Partiya: to'lov (bitta obyekt), bir xil bank № boshqa shartnomada boshqa summa bilan, qaytarim, sotuv + F2 to'plami, noto'g'ri shartnoma
  v_r := public.t2_sverka_import_v1(v_a, v_k, jsonb_build_array(
    jsonb_build_object('tur', 'tolov', 'shartnoma_id', v_s1, 'sana', '2026-01-05', 'summa', 300.004999, 'raqam', '777', 'operation_id', u1, 'obyekt_id', v_o1),
    jsonb_build_object('tur', 'tolov', 'shartnoma_id', v_s2, 'sana', '2026-01-05', 'summa', 500, 'raqam', '777', 'operation_id', u2,
                       'taqsimot', jsonb_build_array(jsonb_build_object('obyekt_id', v_o2, 'summa', 200, 'manba', 'fifo'), jsonb_build_object('obyekt_id', null, 'summa', 300, 'manba', 'fifo'))),
    jsonb_build_object('tur', 'sotuv', 'shartnoma_id', v_s1, 'sana', '2026-02-10', 'summa', 168, 'raqam', '1', 'operation_id', u3, 'f2_akt_ids', jsonb_build_array(v_akt1, v_akt2)),
    jsonb_build_object('tur', 'qaytarim', 'shartnoma_id', v_s2, 'sana', '2026-01-06', 'summa', 10, 'raqam', '778', 'operation_id', u4),
    jsonb_build_object('tur', 'tolov', 'shartnoma_id', -1, 'sana', '2026-01-05', 'summa', 1, 'operation_id', gen_random_uuid())), v_op);
  if not (v_r->>'ok')::boolean or (v_r->>'yangi')::int <> 4 or (v_r->>'xato')::int <> 1 then raise exception 'import batch wrong: %', v_r; end if;
  v_t1 := (v_r->'natija'->0->>'id')::bigint; v_t2 := (v_r->'natija'->1->>'id')::bigint; v_f3 := (v_r->'natija'->2->>'id')::bigint;
  if (select summa from public.t2_tolov where id = v_t1) <> 300.00 then raise exception 'summa must round to 2 decimals'; end if;
  if (select obyekt_id || ':' || hujjat_raqam || ':' || manba from public.t2_tolov where id = v_t1) <> v_o1 || ':777:sverka_1c' then raise exception 'tolov row wrong'; end if;
  if (select count(*) from public.t2_tolov_taqsimot where tolov_id = v_t2) <> 2 then raise exception 'taqsimot not written: %', v_r->'natija'->1; end if;
  if (select tur || ':' || summa from public.t2_tolov where operation_id = u4) <> 'qaytarim:10.00' then raise exception 'qaytarim must keep positive summa'; end if;
  if (select manba || ':' || holat || ':' || sotuv_summa || ':' || nds_foiz from public.t2_forma3 where id = v_f3) <> 'sotuv:tayyor:168.00:12.00' then raise exception 'f3 row wrong'; end if;
  if (select count(*) from public.t2_forma3_akt where forma3_id = v_f3) <> 2 then raise exception 'f3 ↔ f2 links missing: %', v_r->'natija'->2; end if;
  if v_r->'natija'->4->>'code' not like '%SHARTNOMA_NOT_FOUND%' then raise exception 'bad shartnoma must be row error: %', v_r->'natija'->4; end if;

  -- 2. Idempotentlik: shu operation_id — o'sha javob; yangi operation_id bilan takror qatorlar — «takror», ikkinchi yozuv yo'q
  if public.t2_sverka_import_v1(v_a, v_k, '[]'::jsonb, v_op) <> v_r then raise exception 'batch idempotency broken'; end if;
  v_r2 := public.t2_sverka_import_v1(v_a, v_k, jsonb_build_array(
    jsonb_build_object('tur', 'tolov', 'shartnoma_id', v_s1, 'sana', '2026-01-05', 'summa', 300, 'raqam', '777', 'operation_id', gen_random_uuid()),
    jsonb_build_object('tur', 'sotuv', 'shartnoma_id', v_s1, 'sana', '2026-02-10', 'summa', 168, 'raqam', '1', 'operation_id', gen_random_uuid())), gen_random_uuid());
  if (v_r2->>'takror')::int <> 2 or (v_r2->>'yangi')::int <> 0 then raise exception 'natural-key dedup broken: %', v_r2; end if;
  if (select count(*) from public.t2_tolov where shartnoma_id = v_s1) <> 1 then raise exception 'duplicate tolov written'; end if;

  -- 3. Taqsimot: jami mos emas — rad; boshqa shartnoma obyekti — rad; to'g'ri — almashtiriladi
  v_x := public.t2_tolov_taqsimot_saqla_v1(v_a, v_k, v_t2, jsonb_build_array(jsonb_build_object('obyekt_id', v_o2, 'summa', 499)), gen_random_uuid());
  if v_x->>'code' <> 'TAQSIMOT_JAMI' then raise exception 'sum mismatch must be rejected: %', v_x; end if;
  v_x := public.t2_tolov_taqsimot_saqla_v1(v_a, v_k, v_t2, jsonb_build_array(jsonb_build_object('obyekt_id', v_o1, 'summa', 500)), gen_random_uuid());
  if v_x->>'code' <> 'TAQSIMOT_OBYEKT' then raise exception 'foreign object must be rejected: %', v_x; end if;
  v_x := public.t2_tolov_taqsimot_saqla_v1(v_a, v_k, v_t2, jsonb_build_array(jsonb_build_object('obyekt_id', v_o2, 'summa', 250.5), jsonb_build_object('obyekt_id', v_o3, 'summa', 249.5)), gen_random_uuid());
  if not (v_x->>'ok')::boolean or (select string_agg(manba || '=' || summa, ',' order by summa) from public.t2_tolov_taqsimot where tolov_id = v_t2) <> 'qolda=249.50,qolda=250.50' then
    raise exception 'taqsimot replace failed: %', v_x;
  end if;

  -- 4. Продажа ↔ F2: boshqa sotuv F3 da band akt — rad; to'plamni qisqartirish — ishlaydi
  v_r2 := public.t2_sverka_import_v1(v_a, v_k, jsonb_build_array(
    jsonb_build_object('tur', 'sotuv', 'shartnoma_id', v_s1, 'sana', '2026-03-10', 'summa', 50, 'raqam', '2', 'operation_id', gen_random_uuid())), gen_random_uuid());
  v_x := public.t2_forma3_f2_bog_v1(v_a, v_k, (v_r2->'natija'->0->>'id')::bigint, array[v_akt2], null, gen_random_uuid());
  if v_x->>'code' <> 'F2_BOSHQA_SOTUVDA' then raise exception 'akt in another sale must be rejected: %', v_x; end if;
  v_x := public.t2_forma3_f2_bog_v1(v_a, v_k, v_f3, array[v_akt1], null, gen_random_uuid());
  if not (v_x->>'ok')::boolean then raise exception 'relink failed: %', v_x; end if;
  v_x := public.t2_forma3_f2_bog_v1(v_a, v_k, (v_r2->'natija'->0->>'id')::bigint, array[v_akt2], null, gen_random_uuid());
  if not (v_x->>'ok')::boolean then raise exception 'link freed akt failed: %', v_x; end if;

  -- 4b. Rasmiy F2 reestri: akti bor (akt1), akti yo'q («99»), boshqa shartnoma akti — xato; qayta yuklash yangilaydi; NULL saqlanadi
  v_x := public.t2_f2_reestr_yoz_v1(v_a, v_k, jsonb_build_array(
    jsonb_build_object('shartnoma_id', v_s1, 'raqam', '1', 'akt_id', v_akt1, 'qqssiz', 120, 'qqs', 14.4, 'qqs_bilan', 134.4),
    jsonb_build_object('shartnoma_id', v_s1, 'raqam', '99', 'qqssiz', 10, 'qqs', null, 'qqs_bilan', null),
    jsonb_build_object('shartnoma_id', v_s2, 'raqam', '5', 'akt_id', v_akt1, 'qqssiz', 1)), gen_random_uuid());
  if (v_x->>'yangi')::int <> 2 or (v_x->>'xato')::int <> 1 then raise exception 'reestr write wrong: %', v_x; end if;
  if (select qqs_bilan from public.t2_f2_reestr_jami where shartnoma_id = v_s1 and raqam = '99') is not null then raise exception 'NULL must stay NULL'; end if;
  v_x := public.t2_f2_reestr_yoz_v1(v_a, v_k, jsonb_build_array(jsonb_build_object('shartnoma_id', v_s1, 'raqam', '99', 'qqssiz', 11, 'qqs_bilan', 12.32)), gen_random_uuid());
  if (v_x->>'yangilandi')::int <> 1 or (select qqssiz from public.t2_f2_reestr_jami where shartnoma_id = v_s1 and raqam = '99') <> 11 then raise exception 'reestr upsert wrong: %', v_x; end if;
  -- akti yo'q reestr qatorini Продажа ga bog'lash; akti bor reestr qatori reestr orqali bog'lanmaydi
  v_x := public.t2_forma3_f2_bog_v1(v_a, v_k, v_f3, array[v_akt1],
           array[(select id from public.t2_f2_reestr_jami where shartnoma_id = v_s1 and raqam = '99')], gen_random_uuid());
  if not (v_x->>'ok')::boolean or (select forma3_id from public.t2_f2_reestr_jami where shartnoma_id = v_s1 and raqam = '99') <> v_f3 then raise exception 'reestr link failed: %', v_x; end if;
  v_x := public.t2_forma3_f2_bog_v1(v_a, v_k, v_f3, array[v_akt1],
           array[(select id from public.t2_f2_reestr_jami where shartnoma_id = v_s1 and raqam = '1')], gen_random_uuid());
  if v_x->>'code' <> 'REESTR_INVALID' then raise exception 'reestr row with akt must link via akt: %', v_x; end if;

  -- 5. O'qish: F2 ustama bilan, F3 akt_ids, to'lov taqsimoti
  v_m := public.t2_sverka_moslash_v1(v_k, v_a);
  select x into v_x from jsonb_array_elements(v_m->'shartnomalar') x where (x->>'id')::bigint = v_s1;
  if jsonb_array_length(v_x->'f2') <> 2 or v_x->'f2'->0->'ustama'->>'pryamye' is null or jsonb_array_length(v_x->'f3') <> 2 then raise exception 'moslash s1 wrong: %', v_x; end if;
  if (select (f->'akt_ids'->>0)::bigint from jsonb_array_elements(v_x->'f3') f where (f->>'id')::bigint = v_f3) <> v_akt1 then raise exception 'moslash akt_ids wrong: %', v_x; end if;
  if jsonb_array_length(v_x->'f2_reestr') <> 2 then raise exception 'moslash f2_reestr wrong: %', v_x; end if;
  select x into v_x from jsonb_array_elements(v_m->'shartnomalar') x where (x->>'id')::bigint = v_s2;
  if jsonb_array_length(v_x->'tolovlar'->0->'taqsimot') <> 2 then raise exception 'moslash taqsimot wrong: %', v_x; end if;
end $$;

rollback;
