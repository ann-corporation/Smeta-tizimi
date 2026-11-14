-- Qabul: 20261219030100 — svod bo'limida fakt F-2 bilan bir xil. Migratsiyadan KEYIN. SINTETIK; BEGIN … ROLLBACK. Muvaffaqiyat: NOTICE 'FAKT_SVOD_ACCEPTANCE_PASS'.
--   Svod bo'limi (rz): rs ЧЕЛ 10 × 100 = 1000 (kat ЧЕЛ) + mat 10 × 50 = 500. Fakt 10 + 10 → fakt paketida ЧЕЛ 1000 OZIGA (oddiy kategoriya, ustama bilan),
--   svod (yaxlit) qismi faqat 500 (mat).
begin;
do $test$
declare c bigint; o bigint; rz bigint; r1 bigint; m1 bigint; ak bigint; p jsonb;
begin
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_FSV_', gen_random_uuid()::text) returning id into c;
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_FSV_', c) returning id into o;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, nom, tartib) values (o, c, 'rz', '_TEST_FSV_ СВОД БЎЛИМ', 1) returning id into rz;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja) values (o, c, rz, 'rs', 'R1', 'ИШЧИ СИНОВ', 'ЧЕЛ.-Ч', 10, 100, 1000, 'ЧЕЛ', 2, 1) returning id into r1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja) values (o, c, rz, 'mat', 'M1', 'ПЛИТА СИНОВ', 'М', 10, 50, 500, 'МАТ', 3, 1) returning id into m1;
  perform public.t2_rollup(o);
  insert into public.t2_svod_yaxlit(kompaniya_id, obyekt_id, qator_id, svod_summa, qqs_stavka, sabab, turi) values (c, o, rz, 1680, 12, '_TEST_', 'svod');
  insert into public.t2_akt(obyekt_id, tur, oy, holat, lifecycle_status) values (o, 'fakt', date_trunc('month', current_date)::date, 'qoralama', 'draft') returning id into ak;
  insert into public.t2_akt_qator(akt_id, qator_id, obyekt_id, hajm, narx) values (ak, r1, o, 10, 100), (ak, m1, o, 10, 50);
  select x.paket into p from public._t2_summa_paket_v1(array[o], 'fakt') x;
  if (p->'kesim'->>'chel')::numeric is distinct from 1000 then raise exception 'FS1: svod ichidagi ЧЕЛ fakti oddiy kategoriya emas: %', p->'kesim'; end if;
  if (p->>'ustamasiz')::numeric is distinct from 1500 then raise exception 'FS2: ustamasiz 1500 emas: %', p->>'ustamasiz'; end if;
  if (p->'kesim'->>'svod')::numeric is distinct from 500 then raise exception 'FS3: svod (yaxlit) qismi 500 emas: %', p->'kesim'; end if;
  raise notice 'FAKT_SVOD_ACCEPTANCE_PASS';
end
$test$;
rollback;