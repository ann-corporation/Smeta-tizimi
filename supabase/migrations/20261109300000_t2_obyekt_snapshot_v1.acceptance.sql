-- Qabul (BEGIN..ROLLBACK, faqat sintetik fixture): migratsiya qo'llangandan KEYIN. Hech narsa saqlanmaydi.
-- Isbotlanadi: ol → o'zgartirish/o'chirish/qo'shish (tasdiqlangan akt qatorlari ham) → farq → qaytar → har tiklanadigan
-- jadval xeshi snapshotdagiga TENG; restore_oldi snapshot bor va undan qaytarish ham ishlaydi; shu kompaniyaning boshqa
-- obyekti va boshqa kompaniya obyekti o'zgarmagan (snapshotdan keyingi o'zgarishlari ham saqlangan); butun prod bo'yicha
-- o1 dan tashqari t2_qator/t2_akt/t2_akt_qator qatorlari bir xil; shartnoma boshqa obyektga ham bog'langanda shartnoma
-- jadvallari o'tkazib yuboriladi; huquqlar (anon/authenticated yo'q); tozala muddati.
begin;
create temp table _qabul (tartib serial, nom text, natija text) on commit drop;

do $test$
declare
  c bigint; c2 bigint; o1 bigint; o2 bigint; o3 bigint; s1 bigint; sh_other bigint;
  q_rz bigint; q1 bigint; q2 bigint; q3 bigint; q_o2 bigint; q_new bigint; a1 bigint; a2 bigint; aq1 bigint; qi bigint;
  sid bigint; sid2 bigint; s_o2 bigint; s_o2b bigint; s_o3 bigint; s_o3b bigint; s_chk bigint; res jsonb; res2 jsonb;
  v_n bigint; v_ok boolean; v_g1 text; v_g2 text; r record; v_bloklandi boolean := false;
begin
  -- Fixture
  insert into public.t2_kompaniya (nom, kod) values ('_TEST_SNAP_', gen_random_uuid()::text) returning id into c;
  insert into public.t2_kompaniya (nom, kod) values ('_TEST_SNAP2_', gen_random_uuid()::text) returning id into c2;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_SNAP_O1_', c) returning id into o1;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_SNAP_O2_', c) returning id into o2;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_SNAP_O3_', c2) returning id into o3;
  insert into public.t2_shartnoma (kompaniya_id, raqam) values (c, '_TEST_SNAP_SH_') returning id into s1;
  insert into public.t2_shartnoma_bog (obyekt_id, shartnoma_id) values (o1, s1);
  insert into public.t2_qoshimcha_ish (shartnoma_id, kompaniya_id, nom, smeta) values (s1, c, '_TEST_QI_', 100) returning id into qi;

  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, daraja, tartib, nom) values (o1, c, 'rz', 0, 1, '_RZ_') returning id into q_rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, daraja, tartib, nom, ota_id, hajm, narx) values (o1, c, 'rs', 1, 2, '_Q1_', q_rz, 10, 1000) returning id into q1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, daraja, tartib, nom, ota_id, hajm, narx) values (o1, c, 'rs', 1, 3, '_Q2_', q_rz, 20, 2000) returning id into q2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, daraja, tartib, nom, ota_id, hajm, narx) values (o1, c, 'rs', 1, 4, '_Q3_', q_rz, 30, 3000) returning id into q3;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, daraja, tartib, nom, hajm) values (o2, c, 'rs', 0, 1, '_O2_Q_', 5) returning id into q_o2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, daraja, tartib, nom, hajm) values (o3, c2, 'rs', 0, 1, '_O3_Q_', 7);

  -- Tasdiqlangan F2 akt (fixture: lifecycle yo'lisiz to'g'ridan-to'g'ri, trigerlarsiz)
  set local session_replication_role = replica;
  insert into public.t2_akt (kompaniya_id, obyekt_id, tur, oy, holat, lifecycle_status, raqam, shartnoma_id)
  values (c, o1, 'f2', '2026-09-01', 'tasdiqlangan', 'approved', '_T1_', s1) returning id into a1;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (a1, q1, o1, c, 4, 1000) returning id into aq1;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (a1, q2, o1, c, 6, 2000);
  insert into public.t2_akt_holat_tarix (kompaniya_id, akt_id, from_status, to_status) values (c, a1, 'draft', 'approved');
  set local session_replication_role = origin;

  -- 1) snapshot
  sid := snapshot.ol(o1, 'qolda', 'qabul', 'acceptance');
  select count(*) into v_n from snapshot.obyekt_snapshot_bolak b where b.snapshot_id = sid and b.jadval = 't2_qator';
  if (select (s.jadvallar -> 't2_qator' ->> 'soni')::int from snapshot.obyekt_snapshot s where s.id = sid) <> 4 then raise exception 'S1: t2_qator soni 4 emas'; end if;
  if (select (s.jadvallar -> 't2_akt_qator' ->> 'soni')::int from snapshot.obyekt_snapshot s where s.id = sid) <> 2 then raise exception 'S1: akt_qator soni 2 emas'; end if;
  if (select (s.jadvallar -> 't2_qoshimcha_ish' ->> 'soni')::int from snapshot.obyekt_snapshot s where s.id = sid) <> 1 then raise exception 'S1: qoshimcha_ish soni 1 emas'; end if;
  insert into pg_temp._qabul (nom, natija) values ('S1 snapshot olindi', sid::text);

  -- Boshqa obyektlar: snapshotdan KEYIN ham o'zgaradi (bu o'zgarish qaytarishdan keyin ham saqlanib qolishi shart)
  update public.t2_qator set nom = '_O2_Q_KEYIN_' where id = q_o2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, daraja, tartib, nom, hajm) values (o2, c, 'rs', 0, 2, '_O2_YANGI_', 1);

  -- 2) o1 ni buzish: o'zgartirish / o'chirish / qo'shish / tasdiqlangan aktga tegish / yangi akt / shartnoma ma'lumoti
  update public.t2_obyekt set nom = '_TEST_SNAP_O1_BUZILDI_' where id = o1;
  update public.t2_qator set nom = '_Q1_BUZILDI_', hajm = 99 where id = q1;
  delete from public.t2_qator where id = q3;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, daraja, tartib, nom, ota_id, hajm) values (o1, c, 'rs', 1, 5, '_Q_YANGI_', q_rz, 1) returning id into q_new;
  update public.t2_qoshimcha_ish set fakt = 55 where id = qi;
  begin   -- oddiy yo'l bilan tasdiqlangan akt qatorini o'zgartirish qulf/freeze trigeri bilan bloklanadimi (ma'lumot uchun)
    update public.t2_akt_qator set hajm = 400 where id = aq1;
  exception when others then v_bloklandi := true;
  end;
  insert into pg_temp._qabul (nom, natija) values ('S2 tasdiqlangan akt qatori oddiy UPDATE da bloklandi', v_bloklandi::text);
  set local session_replication_role = replica;   -- «MCP/admin» tasdiqlangan aktni buzdi deb faraz
  update public.t2_akt_qator set hajm = 400 where id = aq1;
  delete from public.t2_akt_holat_tarix where akt_id = a1;
  update public.t2_akt set holat = 'bekor', lifecycle_status = 'cancelled' where id = a1;
  set local session_replication_role = origin;
  insert into public.t2_akt (kompaniya_id, obyekt_id, tur, oy, holat, raqam) values (c, o1, 'f2', '2026-10-01', 'qoralama', '_T2_') returning id into a2;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (a2, q_new, o1, c, 1, 10);

  -- boshqa obyektlar va butun prod izi (o1 dan tashqari) — qaytarishdan OLDIN
  s_o2 := snapshot.ol(o2, 'qolda', 'qabul: o2 izi', 'acceptance');
  s_o3 := snapshot.ol(o3, 'qolda', 'qabul: o3 izi', 'acceptance');
  select md5(string_agg(x, '|' order by x)) into v_g1 from (
    select 'q' || count(*) || ':' || coalesce(sum(hashtext(q::text)::numeric), 0) x from public.t2_qator q where q.obyekt_id <> o1
    union all select 'a' || count(*) || ':' || coalesce(sum(hashtext(a::text)::numeric), 0) from public.t2_akt a where a.obyekt_id <> o1
    union all select 'aq' || count(*) || ':' || coalesce(sum(hashtext(aq::text)::numeric), 0) from public.t2_akt_qator aq where aq.obyekt_id <> o1
    union all select 'qi' || count(*) || ':' || coalesce(sum(hashtext(i::text)::numeric), 0) from public.t2_qoshimcha_ish i where i.shartnoma_id <> s1) z;

  -- 3) farq
  select count(*) into v_n from snapshot.farq(sid, o1, true) f where f.qoshilgan + f.ochirilgan + f.ozgargan > 0;
  if v_n < 5 then raise exception 'S3: farq kamida 5 jadvalda farq ko''rsatishi kerak, %', v_n; end if;
  select f.qoshilgan || '/' || f.ochirilgan || '/' || f.ozgargan into v_g2 from snapshot.farq(sid, o1) f where f.jadval = 't2_qator';
  if v_g2 <> '1/1/1' then raise exception 'S3: t2_qator farqi 1/1/1 emas: %', v_g2; end if;
  insert into pg_temp._qabul (nom, natija) values ('S3 farq t2_qator qoshilgan/ochirilgan/ozgargan', v_g2);
  v_ok := false;
  begin perform snapshot.farq(sid, o2); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'S3: boshqa obyekt bilan farq ruxsat etildi'; end if;

  -- 4) noto'g'ri tasdiq
  v_ok := false;
  begin perform snapshot.qaytar(sid, 'ha'); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'S4: tasdiqsiz qaytarish o''tib ketdi'; end if;

  -- 5) qaytarish
  res := snapshot.qaytar(sid, 'QAYTAR ' || sid, 'acceptance');
  insert into pg_temp._qabul (nom, natija) values ('S5 qaytar natijasi', res::text);
  if current_setting('session_replication_role') <> 'origin' then raise exception 'S5: session_replication_role tiklanmadi'; end if;

  -- 5a) aynan oldingi holat: har tiklanadigan jadval xeshi teng
  s_chk := snapshot.ol(o1, 'qolda', 'qabul: tekshiruv', 'acceptance');
  for r in select j.jadval from snapshot.jadval_royxat j where j.rejim <> 'jurnal' loop
    if (select s.jadvallar -> r.jadval ->> 'xesh' from snapshot.obyekt_snapshot s where s.id = sid)
       is distinct from (select s.jadvallar -> r.jadval ->> 'xesh' from snapshot.obyekt_snapshot s where s.id = s_chk) then
      raise exception 'S5a: % xeshi snapshotdagidan farq qiladi', r.jadval;
    end if;
  end loop;
  if (select nom from public.t2_obyekt where id = o1) <> '_TEST_SNAP_O1_' then raise exception 'S5a: obyekt nomi qaytmadi'; end if;
  if not exists (select 1 from public.t2_qator where id = q3 and nom = '_Q3_') then raise exception 'S5a: o''chirilgan qator ASL id bilan qaytmadi'; end if;
  if exists (select 1 from public.t2_qator where id = q_new) then raise exception 'S5a: yangi qator o''chmadi'; end if;
  if (select hajm from public.t2_akt_qator where id = aq1) <> 4 then raise exception 'S5a: tasdiqlangan akt qatori qaytmadi'; end if;
  if (select summa from public.t2_akt_qator where id = aq1) is null then raise exception 'S5a: generated summa hisoblanmadi'; end if;
  if (select holat from public.t2_akt where id = a1) <> 'tasdiqlangan' then raise exception 'S5a: akt holati qaytmadi'; end if;
  if not exists (select 1 from public.t2_akt_holat_tarix where akt_id = a1) then raise exception 'S5a: akt holat tarixi qaytmadi'; end if;
  if exists (select 1 from public.t2_akt where id = a2) then raise exception 'S5a: yangi akt o''chmadi'; end if;
  if (select fakt from public.t2_qoshimcha_ish where id = qi) <> 0 then raise exception 'S5a: shartnoma (eksklyuziv) ma''lumoti qaytmadi'; end if;
  insert into pg_temp._qabul (nom, natija) values ('S5a o1 holati snapshotga teng (barcha tiklanadigan jadval xeshlari)', 'ok');

  -- 5b) boshqa obyektlar o'zgarmagan (snapshotdan keyingi o'zgarishlari ham joyida)
  s_o2b := snapshot.ol(o2, 'qolda', 'qabul: o2 izi 2', 'acceptance');
  s_o3b := snapshot.ol(o3, 'qolda', 'qabul: o3 izi 2', 'acceptance');
  if (select umumiy_xesh from snapshot.obyekt_snapshot where id = s_o2) <> (select umumiy_xesh from snapshot.obyekt_snapshot where id = s_o2b) then raise exception 'S5b: o2 o''zgardi'; end if;
  if (select umumiy_xesh from snapshot.obyekt_snapshot where id = s_o3) <> (select umumiy_xesh from snapshot.obyekt_snapshot where id = s_o3b) then raise exception 'S5b: o3 (boshqa kompaniya) o''zgardi'; end if;
  if (select nom from public.t2_qator where id = q_o2) <> '_O2_Q_KEYIN_' then raise exception 'S5b: o2 dagi keyingi o''zgarish yo''qoldi'; end if;
  select md5(string_agg(x, '|' order by x)) into v_g2 from (
    select 'q' || count(*) || ':' || coalesce(sum(hashtext(q::text)::numeric), 0) x from public.t2_qator q where q.obyekt_id <> o1
    union all select 'a' || count(*) || ':' || coalesce(sum(hashtext(a::text)::numeric), 0) from public.t2_akt a where a.obyekt_id <> o1
    union all select 'aq' || count(*) || ':' || coalesce(sum(hashtext(aq::text)::numeric), 0) from public.t2_akt_qator aq where aq.obyekt_id <> o1
    union all select 'qi' || count(*) || ':' || coalesce(sum(hashtext(i::text)::numeric), 0) from public.t2_qoshimcha_ish i where i.shartnoma_id <> s1) z;
  if v_g1 <> v_g2 then raise exception 'S5b: o1 dan tashqari prod qatorlari o''zgardi'; end if;
  insert into pg_temp._qabul (nom, natija) values ('S5b boshqa obyekt/kompaniya va butun prod (o1 dan tashqari) o''zgarmagan', 'ok');

  -- 6) restore_oldi mavjud va qaytarishning o'zi qaytariladi
  if not exists (select 1 from snapshot.obyekt_snapshot where id = (res ->> 'oldi_snapshot_id')::bigint and sabab = 'restore_oldi' and obyekt_id = o1) then
    raise exception 'S6: restore_oldi snapshot yo''q';
  end if;
  if not exists (select 1 from snapshot.qaytarish_jurnal where snapshot_id = sid) then raise exception 'S6: qaytarish jurnali yo''q'; end if;
  sid2 := (res ->> 'oldi_snapshot_id')::bigint;
  res2 := snapshot.qaytar(sid2, 'QAYTAR ' || sid2, 'acceptance');
  s_chk := snapshot.ol(o1, 'qolda', 'qabul: tekshiruv 2', 'acceptance');
  for r in select j.jadval from snapshot.jadval_royxat j where j.rejim <> 'jurnal' loop
    if (select s.jadvallar -> r.jadval ->> 'xesh' from snapshot.obyekt_snapshot s where s.id = sid2)
       is distinct from (select s.jadvallar -> r.jadval ->> 'xesh' from snapshot.obyekt_snapshot s where s.id = s_chk) then
      raise exception 'S6: undo-of-restore: % xeshi farq qiladi', r.jadval;
    end if;
  end loop;
  if not exists (select 1 from public.t2_qator where id = q_new) or exists (select 1 from public.t2_qator where id = q3) then raise exception 'S6: buzilgan holat qaytmadi'; end if;
  insert into pg_temp._qabul (nom, natija) values ('S6 restore_oldi dan qaytarish (undo) aynan buzilgan holatni berdi', 'ok');

  -- 7) shartnoma boshqa obyektga ham bog'langan: shartnoma jadvallari o'tkazib yuboriladi, qolgani qaytadi
  insert into public.t2_shartnoma_bog (obyekt_id, shartnoma_id) values (o2, s1);
  update public.t2_qoshimcha_ish set fakt = 77 where id = qi;
  res := snapshot.qaytar(sid, 'QAYTAR ' || sid, 'acceptance');
  if (res ->> 'shartnoma_eksklyuziv')::boolean then raise exception 'S7: eksklyuziv deb topildi'; end if;
  if not (res -> 'otkazildi') ? 't2_qoshimcha_ish' then raise exception 'S7: t2_qoshimcha_ish o''tkazilmadi'; end if;
  if (select fakt from public.t2_qoshimcha_ish where id = qi) <> 77 then raise exception 'S7: umumiy shartnoma ma''lumotiga tegildi'; end if;
  if exists (select 1 from public.t2_qator where id = q_new) then raise exception 'S7: o1 qatorlari qaytmadi'; end if;
  insert into pg_temp._qabul (nom, natija) values ('S7 umumiy shartnoma jadvallari o''tkazildi', (res -> 'otkazildi')::text);

  -- 8) huquqlar
  if has_schema_privilege('anon', 'snapshot', 'usage') or has_schema_privilege('authenticated', 'snapshot', 'usage') then raise exception 'S8: schema ochiq'; end if;
  if has_function_privilege('authenticated', 'snapshot.qaytar(bigint,text,text)', 'execute')
     or has_function_privilege('anon', 'snapshot.ol(bigint,text,text,text)', 'execute') then raise exception 'S8: funksiya ochiq'; end if;
  if not has_function_privilege('service_role', 'snapshot.qaytar(bigint,text,text)', 'execute') then raise exception 'S8: service_role ruxsati yo''q'; end if;
  insert into pg_temp._qabul (nom, natija) values ('S8 huquqlar: faqat service_role/postgres', 'ok');

  -- 9) tozala: eski snapshot o'chadi, eng oxirgisi qoladi
  update snapshot.obyekt_snapshot set olingan_vaqt = now() - interval '31 days' where obyekt_id = o3;
  res := snapshot.tozala();
  if (select count(*) from snapshot.obyekt_snapshot where obyekt_id = o3) <> 1 then raise exception 'S9: o3 uchun aynan 1 (eng oxirgi) snapshot qolishi kerak'; end if;
  insert into pg_temp._qabul (nom, natija) values ('S9 tozala', res::text);
end $test$;

select * from pg_temp._qabul order by tartib;
rollback;
