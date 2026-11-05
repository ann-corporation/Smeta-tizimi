-- Qabul: 20261203000300 — t2_qator_ota_jami_rollup_v1. Migratsiya qo'llangandan KEYIN (yoki shu BEGIN ichida undan keyin)
-- ishga tushiriladi. Sintetik obyekt; oxirida ROLLBACK — hech narsa saqlanmaydi. Muvaffaqiyat: NOTICE 'OTA_JAMI_ACCEPTANCE_PASS'.
begin;
do $test$
declare c bigint; a bigint; o bigint; rz bigint; bl bigint; rs bigint; rz2 bigint; bl2 bigint; rs2 bigint; bl3 bigint;
  yangi bigint; v jsonb; s numeric;
begin
  select kompaniya_id, foydalanuvchi_id into c, a from public.t2_azolik
   where holat = 'faol' and public.t2_permission_allowed_v2(kompaniya_id, foydalanuvchi_id, 'smeta.write') order by id limit 1;
  if a is null then raise exception 'ACCEPTANCE_ACTOR_REQUIRED'; end if;

  -- 0) Tuzilma va markerlar.
  if to_regprocedure('public.t2_qator_ota_jami_yangila_v1(bigint[])') is null then raise exception '0: funksiya yo''q'; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('t2_ish_abc_saqla_v1', 't2_ish_abc_ochir_ichki', 't2_fakt_smetadan_tashqari_v1')
         and pg_get_functiondef(p.oid) like '%ota_jami_rollup_v1%') <> 3 then raise exception '0: RPC patch to''liq emas'; end if;
  if (select length(d) - length(replace(d, 'ota_jami_rollup_v1', '')) from (select pg_get_functiondef('public.t2_ish_abc_saqla_v1'::regproc) d) x)
     <> 2 * length('ota_jami_rollup_v1') then raise exception '0: t2_ish_abc_saqla_v1 da ikkala tarmoq patch qilinmagan'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.t2_qator_ota_jami_tuzatish_v1'::regclass) then raise exception '0: RLS yo''q'; end if;
  if has_function_privilege('anon', 'public.t2_qator_ota_jami_yangila_v1(bigint[])', 'execute')
     or has_function_privilege('authenticated', 'public.t2_qator_ota_jami_yangila_v1(bigint[])', 'execute') then
    raise exception '0: yordamchi funksiya ochiq';
  end if;

  -- 1) Asl smeta: RZ → BL → RS (2 × 10 = 20).
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_OTA_JAMI_', c) returning id into o;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, nom, daraja, tartib) values (o, c, 'rz', '_TEST_RZ', 0, 1) returning id into rz;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, hajm, daraja, tartib)
    values (o, c, rz, 'bl', '_TEST_BL', 'М3', 2, 1, 2) returning id into bl;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, norma, hajm, narx, summa, kat, daraja, tartib)
    values (o, c, bl, 'rs', '_TEST_RS', 'ЧЕЛ-Ч', 1, 2, 10, 20, 'ЧЕЛ', 2, 3) returning id into rs;
  perform public.t2_rollup(o);
  if (select summa from public.t2_qator where id = rz) is distinct from 20 then raise exception '1: rz 20 emas'; end if;

  -- 2) Qo'shimcha ish (rs 1×2×4 = 8 + mat 3×5 = 15 → bl 23): ota rz = 20 + 23 = 43, asl qatorlar o'zgarmaydi.
  v := public.t2_ish_abc_saqla_v1(a, c, o, 'additional', rz, null,
    '{"nom":"_TEST_QOSH","birlik":"М3","hajm":2}'::jsonb,
    '[{"nom":"_TEST_QOSH_RS","birlik":"ЧЕЛ-Ч","norma":1,"narx":4,"kat":"ЧЕЛ"},{"nom":"_TEST_QOSH_MAT","birlik":"М3","hajm":3,"narx":5,"kat":"МАТ"}]'::jsonb,
    null, null, '_TEST qoshimcha', gen_random_uuid(), (select versiya from public.t2_qator where id = rz));
  if not coalesce((v->>'ok')::boolean, false) then raise exception '2: qoshimcha yaratilmadi %', v; end if;
  yangi := (v->>'qator_id')::bigint;
  if (select summa from public.t2_qator where id = yangi) is distinct from 23 then raise exception '2: yangi bl 23 emas: %', (select summa from public.t2_qator where id = yangi); end if;
  if (select summa from public.t2_qator where id = rz) is distinct from 43 then raise exception '2: rz 43 emas: %', (select summa from public.t2_qator where id = rz); end if;
  if (select summa from public.t2_qator where id = bl) is distinct from 20 or (select summa from public.t2_qator where id = rs) is distinct from 20 then
    raise exception '2: asl qator o''zgardi';
  end if;
  if (select jami from public.t2_obyekt_jami where id = o) is distinct from 43 then raise exception '2: obyekt jami 43 emas'; end if;

  -- 3) t2_rollup aralash (rs + mat) qo'shimcha ishni saqlaydi: bl 23, rz 43.
  perform public.t2_rollup(o);
  if (select summa from public.t2_qator where id = yangi) is distinct from 23 then raise exception '3: t2_rollup mat ni tashladi'; end if;
  if (select summa from public.t2_qator where id = rz) is distinct from 43 then raise exception '3: t2_rollup dan keyin rz 43 emas'; end if;

  -- 4) Ichki rz ota rz ga kirmaydi (obyekt jami double-count yo'q); zanjir ildizgacha yuradi.
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, nom, daraja, tartib) values (o, c, rz, 'rz', '_TEST_RZ2', 1, 10) returning id into rz2;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, hajm, daraja, tartib) values (o, c, rz2, 'bl', '_TEST_BL2', 'М3', 1, 2, 11) returning id into bl2;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, hajm, narx, summa, kat, daraja, tartib)
    values (o, c, bl2, 'rs', '_TEST_RS2', 'М3', 1, 100, 100, 'МАТ', 3, 12) returning id into rs2;
  update public.t2_qator set summa = 1 where id = rz;           -- eskirgan ota
  v := public.t2_qator_ota_jami_yangila_v1(array[rs2]);
  if (select summa from public.t2_qator where id = bl2) is distinct from 100 or (select summa from public.t2_qator where id = rz2) is distinct from 100 then
    raise exception '4: ichki bl/rz 100 emas';
  end if;
  if (select summa from public.t2_qator where id = rz) is distinct from 43 then raise exception '4: ildiz rz 43 emas (ichki rz kirmasligi kerak)'; end if;
  if (select jami from public.t2_obyekt_jami where id = o) is distinct from 143 then raise exception '4: obyekt jami 143 emas'; end if;

  -- 5) NULL ≠ 0: narxsiz bola — bl NULL, rz faqat ma'lum qismlar.
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, hajm, daraja, tartib) values (o, c, rz, 'bl', '_TEST_BL3', 'М3', 1, 1, 20) returning id into bl3;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, hajm, kat, daraja, tartib) values (o, c, bl3, 'rs', '_TEST_RS3', 'М3', 1, 'МАТ', 2, 21);
  update public.t2_qator set summa = 0 where id = bl3;
  v := public.t2_qator_ota_jami_yangila_v1(array[bl3]);
  if (select summa from public.t2_qator where id = bl3) is not null then raise exception '5: narxsiz bl NULL emas'; end if;
  if (select summa from public.t2_qator where id = rz) is distinct from 43 then raise exception '5: rz 43 emas'; end if;

  -- 6) Qo'shilgan ishni o'chirish: rz asl 20 ga qaytadi.
  v := public.t2_ish_abc_ochir_ichki(c, o, yangi, a, '_TEST ochir', gen_random_uuid());
  if not coalesce((v->>'ok')::boolean, false) then raise exception '6: o''chirilmadi %', v; end if;
  if (select summa from public.t2_qator where id = rz) is distinct from 20 then raise exception '6: o''chirishdan keyin rz 20 emas: %', (select summa from public.t2_qator where id = rz); end if;

  -- 7) Bo'sh kirish va versiya qo'riqchisi.
  if (public.t2_qator_ota_jami_yangila_v1(null)->>'ok')::boolean is not true then raise exception '7: null kirish'; end if;
  if exists (select 1 from public.t2_versiya_xabardorlik_audit_v1()) then raise exception '7: versiya audit bo''sh emas'; end if;

  raise notice 'OTA_JAMI_ACCEPTANCE_PASS';
end $test$;
rollback;
