-- ACCEPTANCE: 20261122100000 (snapshot R2 sovuq) — BEGIN..ROLLBACK, FAQAT sintetik fixture (haqiqiy snapshotga tegmaydi).
-- Tekshiradi: (1) NULL mazmun — ko'rsatkichsiz CHECK rad etadi; (2) sovuq_sovut tasdiqsiz/mos bo'lmagan sha256 bilan RAD;
-- (3) sovuq_yoz noto'g'ri sha256 / kalit shaklini RAD; (4) to'liq yo'l: yoz → tasdiq → sovut → mazmun NULL; (5) sovuq_tikla noto'g'ri matn
-- (sha256 yoki xesh) RAD, to'g'ri matn bilan mazmun aynan tiklanadi; (6) _yukla sovuq blok bo'lsa ANIQ xato beradi;
-- (7) nomzod: yangi snapshot ishora qilsa tanlanmaydi, eski bo'lsa tanlanadi, so'nggi snapshot bloki standartda issiq;
-- (8) tozala sovuq blok o'chirilsa snapshot.r2_yetim ga yozadi; (9) t2_db_hajm_v1 superadmin bo'lmaganga RAD.
begin;

do $acc$
declare
  v_arr jsonb := jsonb_build_array(jsonb_build_object('id', 1, 'nom', 'ACC_A'), jsonb_build_object('id', 2, 'nom', 'ACC_B'));
  v_jadval text := 't2_acc_sovuq';
  v_xesh text; v_sha text; v_key text; v_matn text; v_s_eski bigint; v_s_yangi bigint; v_obyekt bigint := -990001; v_kompaniya bigint := -990001;
  v_n bigint; v_ok boolean; v_bayt bigint;
begin
  v_xesh := encode(sha256(convert_to(v_jadval || ':' || v_arr::text, 'UTF8')), 'hex');
  v_matn := v_arr::text;
  v_sha := encode(sha256(convert_to(v_matn, 'UTF8')), 'hex');
  v_key := 'snapshot-cold/v1/' || substr(v_sha, 1, 2) || '/' || v_sha || '.json.gz';

  insert into snapshot.bolak_mazmun (xesh, jadval, qator_soni, qatorlar) values (v_xesh, v_jadval, 2, v_arr);
  insert into snapshot.obyekt_snapshot (kompaniya_id, obyekt_id, sabab, olingan_vaqt) values (v_kompaniya, v_obyekt, 'qolda', now() - interval '20 days') returning id into v_s_eski;
  insert into snapshot.obyekt_snapshot_bolak (snapshot_id, jadval, bolak, qator_soni, xesh) values (v_s_eski, v_jadval, 0, 2, v_xesh);
  -- eski snapshotdan keyin yangi snapshot (so'nggi bo'lmasligi uchun) — ikkalasi ham 20 kun oldin, bitta obyektda
  insert into snapshot.obyekt_snapshot (kompaniya_id, obyekt_id, sabab, olingan_vaqt) values (v_kompaniya, v_obyekt, 'qolda', now() - interval '19 days') returning id into v_s_yangi;

  -- (1) ko'rsatkichsiz NULL — CHECK rad etadi
  begin
    update snapshot.bolak_mazmun set qatorlar = null where xesh = v_xesh;
    raise exception 'ACC-1 FAIL: ko''rsatkichsiz NULL ruxsat berildi';
  exception when check_violation then null; end;

  -- (2) tasdiqsiz sovut — RAD
  perform snapshot.sovuq_yoz(v_xesh, v_key, v_sha, 123);
  begin
    perform snapshot.sovuq_sovut(v_xesh, v_sha);
    raise exception 'ACC-2 FAIL: tasdiqsiz sovut o''tdi';
  exception when sqlstate '23514' then null; end;

  -- (3) noto'g'ri sha256 / kalit shakli — RAD
  begin
    perform snapshot.sovuq_yoz(v_xesh, 'snapshot-cold/v1/00/' || repeat('0', 64) || '.json.gz', repeat('0', 64), 1);
    raise exception 'ACC-3a FAIL: boshqa sha256 qabul qilindi';
  exception when sqlstate '23514' then null; end;
  begin
    perform snapshot.sovuq_yoz(v_xesh, 'x/' || v_sha, v_sha, 1);
    raise exception 'ACC-3b FAIL: noto''g''ri kalit shakli qabul qilindi';
  exception when sqlstate '22023' then null; end;

  -- (4) to'liq yo'l
  perform snapshot.sovuq_tasdiq(v_xesh, v_sha);
  begin
    perform snapshot.sovuq_sovut(v_xesh, repeat('f', 64));
    raise exception 'ACC-4a FAIL: boshqa sha256 bilan sovut o''tdi';
  exception when sqlstate '23514' then null; end;
  v_bayt := snapshot.sovuq_sovut(v_xesh, v_sha);
  if v_bayt <= 0 then raise exception 'ACC-4b FAIL: bo''shagan bayt %', v_bayt; end if;
  select count(*) into v_n from snapshot.bolak_mazmun where xesh = v_xesh and qatorlar is null and r2_key = v_key and sovutildi is not null;
  if v_n <> 1 then raise exception 'ACC-4c FAIL: blok sovutilmadi'; end if;
  if snapshot.sovuq_sovut(v_xesh, v_sha) <> 0 then raise exception 'ACC-4d FAIL: ikkinchi sovut idempotent emas'; end if;

  -- (6) _yukla sovuq blokda aniq xato
  begin
    perform snapshot._yukla(v_s_eski, v_obyekt, '{}'::bigint[], array[]::text[]);
    raise exception 'ACC-6 FAIL: _yukla sovuq blokda xato bermadi';
  exception when sqlstate '55000' then null; end;
  select count(*) into v_n from snapshot.sovuq_bolaklar(v_s_eski) where xesh = v_xesh and r2_key = v_key;
  if v_n <> 1 then raise exception 'ACC-6b FAIL: sovuq_bolaklar blokni ko''rsatmadi'; end if;

  -- (5) tiklash: noto'g'ri matn RAD, to'g'ri matn aynan tiklaydi
  begin
    perform snapshot.sovuq_tikla(v_xesh, '[{"id":9}]', v_sha);
    raise exception 'ACC-5a FAIL: boshqa matn qabul qilindi';
  exception when sqlstate '23514' then null; end;
  v_ok := snapshot.sovuq_tikla(v_xesh, v_matn, v_sha);
  if not v_ok then raise exception 'ACC-5b FAIL: tiklash false'; end if;
  select count(*) into v_n from snapshot.bolak_mazmun where xesh = v_xesh and qatorlar = v_arr;
  if v_n <> 1 then raise exception 'ACC-5c FAIL: tiklangan mazmun asl nusxaga teng emas'; end if;
  if snapshot.sovuq_tikla(v_xesh, v_matn, v_sha) then raise exception 'ACC-5d FAIL: ikkinchi tiklash true'; end if;

  -- (7) nomzod: har ikki snapshot 19-20 kun oldin; yangisi (v_s_yangi) bu obyektning so'nggisi, lekin blok faqat eski snapshotga ishora qiladi
  select count(*) into v_n from snapshot.sovuq_nomzod(14, 5000, false) where xesh = v_xesh;
  if v_n <> 1 then raise exception 'ACC-7a FAIL: eski blok nomzod emas'; end if;
  select count(*) into v_n from snapshot.sovuq_nomzod(30, 5000, false) where xesh = v_xesh;
  if v_n <> 0 then raise exception 'ACC-7b FAIL: 30 kunlik chegarada nomzod bo''lmasligi kerak'; end if;
  -- so'nggi snapshotga ishora qilsa — standartda issiq
  insert into snapshot.obyekt_snapshot_bolak (snapshot_id, jadval, bolak, qator_soni, xesh) values (v_s_yangi, v_jadval, 0, 2, v_xesh);
  select count(*) into v_n from snapshot.sovuq_nomzod(14, 5000, false) where xesh = v_xesh;
  if v_n <> 0 then raise exception 'ACC-7c FAIL: so''nggi snapshot bloki issiq qolishi kerak'; end if;
  select count(*) into v_n from snapshot.sovuq_nomzod(14, 5000, true) where xesh = v_xesh;
  if v_n <> 1 then raise exception 'ACC-7d FAIL: p_songgi_ham=true da nomzod bo''lishi kerak'; end if;

  -- (8) tozala: blok sovuq va hech qaysi snapshotga ishora qilmasa — r2_yetim ga yoziladi
  perform snapshot.sovuq_yoz(v_xesh, v_key, v_sha, 123);
  perform snapshot.sovuq_tasdiq(v_xesh, v_sha);
  perform snapshot.sovuq_sovut(v_xesh, v_sha);
  delete from snapshot.obyekt_snapshot_bolak where xesh = v_xesh;
  perform snapshot.tozala();
  select count(*) into v_n from snapshot.r2_yetim where r2_key = v_key;
  if v_n <> 1 then raise exception 'ACC-8 FAIL: tozala r2_yetim ga yozmadi'; end if;

  -- (9) superadmin bo'lmagan aktor
  if (public.t2_db_hajm_v1(-1) ->> 'ok')::boolean is distinct from false then raise exception 'ACC-9 FAIL: superadminsiz aktor hajmni oldi'; end if;

  raise notice 'ACCEPTANCE snapshot_r2_sovuq: PASS';
end $acc$;

rollback;
