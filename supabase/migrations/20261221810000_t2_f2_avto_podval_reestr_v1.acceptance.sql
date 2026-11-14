-- ACCEPTANCE: 20261221810000 (F-2 avto podval + avto reestr). BEGIN..ROLLBACK; muvaffaqiyat: NOTICE 'F2_AVTO_PODVAL_REESTR_PASS'.
-- Tekshiruv: (1) triggerlar bor; (2) smeta podvali bor obyektda yangi F-2 qoralamaga podval 'smeta' yoziladi, foizlar smeta podvalidan;
-- (3) podvalsiz obyektda qoralama yaratiladi (qulf yo'q), podval yo'q; (4) tasdiqlanganda reestr yozuvi (avto:), summa = paket;
-- (5) bekor qilinganda avto yozuv 'bekor'; (6) backfill idempotent.
begin;
do $acc$
declare k bigint; u bigint; o bigint; o2 bigint; rz bigint; m1 bigint; m2 bigint; sh bigint; a1 bigint; a2 bigint; r jsonb; v int; n int; pv jsonb; ul numeric;
begin
  if (select count(*) from pg_trigger where tgrelid = 'public.t2_akt'::regclass and tgname in ('t2_akt_podval_avto', 't2_akt_reestr_avto')) <> 2 then
    raise exception 'FAIL: triggerlar yo''q'; end if;
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_AVTO_', gen_random_uuid()::text) returning id into k;
  insert into public.t2_foydalanuvchi(login, ism) values ('_TEST_AVTO_' || gen_random_uuid(), '_TEST_') returning id into u;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (u, k, 'admin');
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_AVTO_1', k) returning id into o;
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_AVTO_2', k) returning id into o2;
  insert into public.t2_shartnoma(kompaniya_id, raqam) values (k, '_TEST_AVTO_SH') returning id into sh;
  insert into public.t2_shartnoma_bog(shartnoma_id, obyekt_id) values (sh, o), (sh, o2);
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, nom, tartib) values (o, k, 'rz', '_TEST_ RZ', 1) returning id into rz;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja)
    values (o, k, rz, 'mat', 'M1', 'TEST', 'M', 10, 100, 1000, U&'\041C\0410\0422', 2, 1) returning id into m1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, nom, tartib) values (o2, k, 'rz', '_TEST_ RZ2', 1) returning id into rz;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja)
    values (o2, k, rz, 'mat', 'M2', 'TEST2', 'M', 10, 100, 1000, U&'\041C\0410\0422', 2, 1) returning id into m2;
  -- smeta podvali faqat 1-obyektda: ЗТР_СОЦСТРАХ = 33
  insert into public.t2_nakrutka_podval(kompaniya_id, obyekt_id, qatorlar)
    values (k, o, jsonb_build_array(jsonb_build_object('manba', 'smeta', 'tur', 'foiz', 'koefKod', U&'\0417\0422\0420_\0421\041E\0426\0421\0422\0420\0410\0425', 'foiz', 33)));

  r := public.t2_akt_yarat_v2(o, date '2027-01-01', jsonb_build_array(jsonb_build_object('qator_id', m1, 'certified_quantity', 1, 'certified_unit_price', 100, 'certified_amount', 100)), u, 'T-1', gen_random_uuid(), 'acc');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL yarat: %', r; end if;
  a1 := (r->>'akt_id')::bigint;
  if (r->'podval'->>'bor')::boolean is not true then raise exception 'FAIL: podval javobda yo''q %', r->'podval'; end if;
  if (select (nk->>U&'\0417\0422\0420_\0421\041E\0426\0421\0422\0420\0410\0425')::numeric from public.t2_akt_podval where akt_id = a1 and blok = '' and manba = 'smeta') is distinct from 33 then
    raise exception 'FAIL: nk smeta podvalidan emas'; end if;

  r := public.t2_akt_yarat_v2(o2, date '2027-01-01', jsonb_build_array(jsonb_build_object('qator_id', m2, 'certified_quantity', 1, 'certified_unit_price', 100, 'certified_amount', 100)), u, 'T-2', gen_random_uuid(), 'acc');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL yarat2: %', r; end if;
  a2 := (r->>'akt_id')::bigint;
  if (r->'podval'->>'bor')::boolean is not false or r->'podval'->>'ogohlantirish' is distinct from 'SMETA_PODVALI_YOQ' then
    raise exception 'FAIL: ogohlantirish yo''q %', r->'podval'; end if;

  -- tasdiqlash -> reestr
  for v in 1..3 loop
    r := public.t2_akt_lifecycle_transition_v1(k, a1, (array['submitted', 'checked', 'approved'])[v], u,
           (select versiya from public.t2_akt where id = a1), gen_random_uuid(), 'acc');
    if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL transition %: %', v, r; end if;
  end loop;
  select (p.paket->>'ustamali')::numeric into ul from public._t2_summa_paket_v1(array[o], 'aktlar', array[a1]) p;
  if not exists (select 1 from public.t2_f2_reestr_jami z where z.akt_id = a1 and z.holat = 'faol' and z.kim = 'avto:' || a1 and z.qqssiz = ul and z.shartnoma_id = sh) then
    raise exception 'FAIL: reestr yozuvi yo''q yoki summa mos emas'; end if;
  -- bekor -> avto yozuv 'bekor'
  r := public.t2_akt_lifecycle_transition_v1(k, a1, 'cancelled', u, (select versiya from public.t2_akt where id = a1), gen_random_uuid(), 'acc');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL cancel: %', r; end if;
  if not exists (select 1 from public.t2_f2_reestr_jami z where z.kim = 'avto:' || a1 and z.holat = 'bekor') then raise exception 'FAIL: bekor belgilanmadi'; end if;
  -- backfill idempotent
  perform public.t2_akt_podval_backfill_qoralama_v1(k);
  if (public.t2_akt_podval_backfill_qoralama_v1(k)->>'yozildi')::int <> 0 then raise exception 'FAIL: backfill idempotent emas'; end if;
  raise notice 'F2_AVTO_PODVAL_REESTR_PASS';
end $acc$;
rollback;