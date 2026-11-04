-- ACCEPTANCE: 20261125000000 + 20261125000100 (HR+KPI) - migratsiya qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture (haqiqiy ism/summa/INN/PINFL yo'q).
-- Fixture oyi 2026-03: 31 kun, yakshanba 5, shanba 4; kalendar: 20 va 21-mart bayram -> norma 5 kunlik = 21, 6 kunlik = 24.
-- Xodim A: oylik 2 100 000 (kuniga 100 000), tabel 10 kun -> baza 1 000 000; F2 sxema 2% ustamasiz, obyekt rejimi.
--   Tasdiqlangan F2: 10 000 000 + 5 000 000 (mart) -> KPI 300 000; aprel aktlari, qoralama, biriktirilmagan obyekt hisobga kirmaydi.
--   Bonus 100 000, jarima 5% (= 50 000) -> hisoblangan 1 350 000; NDFL 12% = 162 000; INPS 0,1% = 1 350; sof 1 186 650.
-- Tekshiradi: ruxsatlar (prorab: PII/maosh yopiq, tasdiqlay olmaydi), norma, KPI taqsimoti, NULL != 0, jarima oqimi, tasdiq/qaytarish/qulf, idempotentlik, buxgalteriya ilgagi.
begin;

do $acc$
declare
  k bigint; o1 bigint; o2 bigint; o3 bigint; u_kadr bigint; u_pr bigint; u_buh bigint;
  qa bigint; qb bigint; a1 bigint; a2 bigint; a3 bigint; a4 bigint; a5 bigint; a6 bigint;
  ka bigint; kb bigint; sx bigint; tz1 bigint; tz2 bigint;
  r jsonb; l jsonb; rw jsonb; op uuid; v_ok boolean; v_state text; rep text[] := array[]::text[];
  kunlar jsonb;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_HR_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_HR_O1_', k) returning id into o1;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_HR_O2_', k) returning id into o2;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_HR_O3_', k) returning id into o3;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('thr_kadr_' || k, 'kadr', 'faol') returning id into u_kadr;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('thr_pr_' || k, 'prorab', 'faol') returning id into u_pr;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('thr_buh_' || k, 'bugalter', 'faol') returning id into u_buh;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (u_kadr, k, 'kadr', 'faol'), (u_pr, k, 'prorab', 'faol'), (u_buh, k, 'bugalter', 'faol');

  -- 1. Xodim kartasi (kadr: hr.write + hr.pii.write)
  op := gen_random_uuid();
  r := public.t2_hr_xodim_saqla_v1(u_kadr, k, null,
    jsonb_build_object('ism', 'TEST XODIM A', 'lavozim', 'prorab', 'rol', 'prorab', 'grafik', 5, 'baza_turi', 'oylik', 'baza_summa', 2100000),
    jsonb_build_object('pinfl', '12345678901234', 'telefon', '+998900000000'),
    jsonb_build_array(jsonb_build_object('obyekt_id', o1, 'ulush_foiz', 100)), null, op);
  ka := (r->>'kadr_id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and ka is not null then 'OK   xodim yaratildi (karta + PII + obyekt)' else 'FAIL xodim: ' || r::text end);
  r := public.t2_hr_xodim_saqla_v1(u_kadr, k, null, jsonb_build_object('ism', 'TEST XODIM A'), null, null, null, op);
  rep := rep || (case when (r->>'kadr_id')::bigint = ka and (select count(*) from public.t2_kadr_mustaqil where kompaniya_id = k) = 1
                      then 'OK   operation_id idempotent (dublikat xodim yo''q)' else 'FAIL idempotent: ' || r::text end);

  -- 1b. Prorab xodim yarata/tahrirlay olmaydi; PII va maosh ko'rmaydi
  begin
    perform public.t2_hr_xodim_saqla_v1(u_pr, k, ka, jsonb_build_object('baza_summa', 1), null, null, null, gen_random_uuid()); v_ok := true;
  exception when sqlstate '42501' then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   prorab xodimni tahrirlay olmaydi (hr.write yo''q)' else 'FAIL prorab yozdi' end);
  begin
    perform public.t2_hr_xodim_saqla_v1(u_kadr, k, ka, '{}'::jsonb, '{}'::jsonb, null, null, gen_random_uuid()); v_ok := true;
  exception when others then v_ok := false; end;
  rep := rep || (case when v_ok then 'OK   kadr PII ni tahrirlay oladi' else 'FAIL kadr PII' end);
  l := public.t2_hr_xodimlar_v1(k, u_pr);
  select e into rw from jsonb_array_elements(l->'xodimlar') e where (e->>'kadr_id')::bigint = ka;
  rep := rep || (case when (l->>'pii_yopiq')::boolean and (l->>'maosh_yopiq')::boolean and rw->'pii' = 'null'::jsonb and rw->'baza_summa' = 'null'::jsonb
                      then 'OK   prorab: PII va maosh yopiq' else 'FAIL prorab ko''rdi: ' || rw::text end);
  l := public.t2_hr_xodimlar_v1(k, u_kadr);
  select e into rw from jsonb_array_elements(l->'xodimlar') e where (e->>'kadr_id')::bigint = ka;
  rep := rep || (case when not (l->>'pii_yopiq')::boolean and rw->'pii'->>'pinfl' = '12345678901234' and (rw->>'baza_summa')::numeric = 2100000
                           and jsonb_array_length(rw->'obyektlar') = 1 then 'OK   kadr: PII, maosh va obyektlar ko''rinadi' else 'FAIL kadr ko''rinish: ' || rw::text end);

  -- 2. Sxema va stavkalar (payroll.write: bugalter; kadr emas)
  begin
    perform public.t2_hr_sxema_saqla_v1(u_kadr, k, jsonb_build_object('nom', 'X', 'f2_foiz', 1), null, gen_random_uuid()); v_ok := true;
  exception when sqlstate '42501' then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   kadr sxema yoza olmaydi (payroll.write yo''q)' else 'FAIL kadr sxema' end);
  r := public.t2_hr_sxema_saqla_v1(u_buh, k, jsonb_build_object('nom', 'TEST PRORAB 2%', 'f2_foiz', 2, 'f2_baza', 'ustamasiz', 'f2_rejim', 'obyekt'),
        jsonb_build_object('ndfl_foiz', 12, 'inps_foiz', 0.1, 'kun_soat', 8), gen_random_uuid());
  sx := (r->>'sxema_id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and sx is not null then 'OK   sxema + stavkalar saqlandi' else 'FAIL sxema: ' || r::text end);
  perform public.t2_hr_xodim_saqla_v1(u_kadr, k, ka, jsonb_build_object('sxema_id', sx), null, null, null, gen_random_uuid());

  -- 3. Kalendar va norma
  r := public.t2_hr_kalendar_saqla_v1(u_kadr, k, jsonb_build_array(jsonb_build_object('sana', '2026-03-20', 'tur', 'bayram', 'nom', 'TEST'),
        jsonb_build_object('sana', '2026-03-21', 'tur', 'bayram', 'nom', 'TEST')), null, gen_random_uuid());
  l := public.t2_hr_oy_v1(k, u_pr, '2026-03');
  rep := rep || (case when (l->'norma'->'5'->>'kun')::int = 21 and (l->'norma'->'6'->>'kun')::int = 24 and (l->'norma'->'5'->>'soat')::numeric = 168
                      then 'OK   norma: 5 kunlik 21 kun / 168 soat, 6 kunlik 24 kun' else 'FAIL norma: ' || (l->'norma')::text end);

  -- 4. Tabel (prorab: hr.tabel.write); tasdiqlash faqat hr.write
  select jsonb_object_agg(d::text, 'K') into kunlar from generate_series(2, 11) d;
  r := public.t2_hr_tabel_saqla_v1(u_pr, k, '2026-03', jsonb_build_array(jsonb_build_object('kadr_id', ka, 'kunlar', kunlar)), gen_random_uuid());
  rep := rep || (case when (r->>'saqlandi')::int = 1 then 'OK   tabel saqlandi (prorab)' else 'FAIL tabel: ' || r::text end);
  begin
    perform public.t2_hr_tabel_saqla_v1(u_pr, k, '2026-03', jsonb_build_array(jsonb_build_object('kadr_id', ka, 'kunlar', kunlar, 'holat', 'tasdiqlangan')), gen_random_uuid()); v_ok := true;
  exception when sqlstate '42501' then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   prorab tabelni tasdiqlay olmaydi' else 'FAIL tabel tasdiq' end);
  begin
    perform public.t2_hr_tabel_saqla_v1(u_pr, k, '2026-03', jsonb_build_array(jsonb_build_object('kadr_id', ka, 'kunlar', jsonb_build_object('32', 'K'))), gen_random_uuid()); v_ok := true;
  exception when others then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   noto''g''ri kun (32) rad etildi' else 'FAIL kun 32' end);

  -- 5. F2 aktlar (sintetik). Triggerlar chetlanadi: faqat fixture.
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kat, nom, birlik, hajm, narx) values (o1, k, 'bl', 'ЧЕЛ', 'mehnat', 'ЧЕЛ.-Ч', 1, 1) returning id into qa;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kat, nom, birlik, hajm, narx) values (o2, k, 'bl', 'ЧЕЛ', 'mehnat', 'ЧЕЛ.-Ч', 1, 1) returning id into qb;
  set local session_replication_role = replica;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat, lifecycle_status, lifecycle_approved_at) values (o1, k, 'f2', 'HR-1', date '2026-03-01', 'tasdiqlangan', 'approved', timestamptz '2026-03-10 12:00+05') returning id into a1;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat, lifecycle_status, lifecycle_approved_at) values (o1, k, 'f2', 'HR-2', date '2026-03-01', 'tasdiqlangan', 'approved', timestamptz '2026-03-25 12:00+05') returning id into a2;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat, lifecycle_status, lifecycle_approved_at) values (o1, k, 'f2', 'HR-3', date '2026-04-01', 'tasdiqlangan', 'approved', timestamptz '2026-04-05 12:00+05') returning id into a3;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat, lifecycle_status) values (o1, k, 'f2', 'HR-4', date '2026-03-01', 'qoralama', 'draft') returning id into a4;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat, lifecycle_status, lifecycle_approved_at) values (o2, k, 'f2', 'HR-5', date '2026-03-01', 'tasdiqlangan', 'approved', timestamptz '2026-03-12 12:00+05') returning id into a5;
  -- summa - GENERATED (narx NULL bo'lsa NULL, aks holda coalesce(certified_amount, hajm*narx)): faqat hajm va narx yoziladi.
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values
    (a1, qa, o1, k, 1, 10000000), (a2, qa, o1, k, 1, 5000000), (a3, qa, o1, k, 1, 99), (a4, qa, o1, k, 1, 77), (a5, qb, o2, k, 1, 55);
  set local session_replication_role = origin;

  -- 6. Jarima/bonus oqimi
  r := public.t2_hr_tuzatma_saqla_v1(u_pr, k, jsonb_build_object('kadr_id', ka, 'oy', '2026-03', 'tur', 'jarima', 'sabab', 'nuqson', 'izoh', 'test nuqson', 'foiz', 5, 'obyekt_id', o1), null, gen_random_uuid());
  tz1 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'qoralama' then 'OK   jarima qoralama (prorab yaratdi)' else 'FAIL jarima: ' || r::text end);
  r := public.t2_hr_tuzatma_saqla_v1(u_pr, k, jsonb_build_object('kadr_id', ka, 'oy', '2026-03', 'tur', 'jarima', 'izoh', 'x', 'summa', 10, 'foiz', 5), null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'SUMMA_YOKI_FOIZ' then 'OK   summa va foiz birga rad etildi' else 'FAIL XOR: ' || r::text end);
  r := public.t2_hr_tuzatma_saqla_v1(u_pr, k, jsonb_build_object('kadr_id', ka, 'oy', '2026-03', 'tur', 'jarima', 'summa', 10), null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'SABAB_IZOH_KERAK' then 'OK   jarimada sabab izohi majburiy' else 'FAIL sabab: ' || r::text end);
  r := public.t2_hr_tuzatma_saqla_v1(u_kadr, k, jsonb_build_object('kadr_id', ka, 'oy', '2026-03', 'tur', 'bonus', 'sabab', 'ragbat', 'summa', 100000), null, gen_random_uuid());
  tz2 := (r->>'id')::bigint;
  begin
    perform public.t2_hr_tuzatma_qaror_v1(u_pr, k, tz1, 'tasdiqlangan', null, null, gen_random_uuid()); v_ok := true;
  exception when sqlstate '42501' then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   prorab jarimani tasdiqlay olmaydi (payroll.write yo''q)' else 'FAIL prorab tasdiq' end);
  l := public.t2_hr_kpi_v1(k, u_buh, '2026-03');
  select e into rw from jsonb_array_elements(l->'qatorlar') e where (e->>'kadr_id')::bigint = ka;
  rep := rep || (case when (rw->>'bonus')::numeric = 0 and (rw->>'jarima')::numeric = 0 and rw->'ogohlantirish' ? 'tuzatma_kutilmoqda'
                      then 'OK   tasdiqlanmagan jarima/bonus hisobga kirmaydi (ogohlantirish bor)' else 'FAIL kutilayotgan: ' || rw::text end);
  r := public.t2_hr_tuzatma_qaror_v1(u_buh, k, tz1, 'tasdiqlangan', 'ok', null, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean then 'OK   jarima tasdiqlandi (bugalter)' else 'FAIL qaror: ' || r::text end);
  r := public.t2_hr_tuzatma_qaror_v1(u_buh, k, tz2, 'tasdiqlangan', null, null, gen_random_uuid());

  -- 7. KPI + ish haqi hisobi
  begin
    perform public.t2_hr_kpi_v1(k, u_pr, '2026-03'); v_ok := true;
  exception when sqlstate '42501' then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   prorab KPI/ish haqini ko''ra olmaydi (payroll.read yo''q)' else 'FAIL prorab KPI' end);
  l := public.t2_hr_kpi_v1(k, u_buh, '2026-03');
  select e into rw from jsonb_array_elements(l->'qatorlar') e where (e->>'kadr_id')::bigint = ka;
  rep := rep || (case when (rw->>'norma_kun')::int = 21 and (rw->>'kun_ishlagan')::int = 10 and (rw->>'baza')::numeric = 1000000
                      then 'OK   baza = 2 100 000 / 21 * 10 = 1 000 000' else 'FAIL baza: ' || rw::text end);
  rep := rep || (case when (rw->>'kpi_f2')::numeric = 300000 and (rw->>'f2_soni')::int = 2 and (rw->>'f2_summa')::numeric = 15000000
                      then 'OK   F2 KPI = (10 mln + 5 mln) * 2% = 300 000; aprel/qoralama/boshqa obyekt hisobga kirmadi' else 'FAIL KPI: ' || rw::text end);
  rep := rep || (case when (rw->>'bonus')::numeric = 100000 and (rw->>'jarima')::numeric = 50000 and (rw->>'hisoblangan')::numeric = 1350000
                      then 'OK   hisoblangan = 1 000 000 + 300 000 + 100 000 - 50 000 (jarima 5% bazadan)' else 'FAIL hisoblangan: ' || rw::text end);
  rep := rep || (case when (rw->>'ndfl')::numeric = 162000 and (rw->>'inps')::numeric = 1350 and (rw->>'sof')::numeric = 1186650 and (rw->>'toliq')::boolean
                      then 'OK   NDFL 12% = 162 000, INPS 0,1% = 1 350, sof 1 186 650, to''liq' else 'FAIL ushlanma: ' || rw::text end);

  -- 8. NULL != 0: baza noma'lum xodim (baza_summa NULL, tabel yo'q), sxema bor, aktsiz obyekt -> KPI 0 (ma'lum nol), hisoblangan NULL
  r := public.t2_hr_xodim_saqla_v1(u_kadr, k, null, jsonb_build_object('ism', 'TEST XODIM B', 'rol', 'brigadir', 'sxema_id', sx), null,
        jsonb_build_array(jsonb_build_object('obyekt_id', o3)), null, gen_random_uuid());
  kb := (r->>'kadr_id')::bigint;
  l := public.t2_hr_kpi_v1(k, u_buh, '2026-03');
  select e into rw from jsonb_array_elements(l->'qatorlar') e where (e->>'kadr_id')::bigint = kb;
  rep := rep || (case when rw->'baza' = 'null'::jsonb and rw->'hisoblangan' = 'null'::jsonb and rw->'kun_ishlagan' = 'null'::jsonb
                           and (rw->>'kpi_f2')::numeric = 0 and not (rw->>'toliq')::boolean and rw->'ogohlantirish' ? 'tabel_yoq'
                      then 'OK   NULL != 0: baza/hisoblangan NULL, aktsiz KPI = 0 (ma''lum nol)' else 'FAIL NULL: ' || rw::text end);

  -- 9. Hisoblash -> tasdiqlash (faqat to'liq) -> qulf -> qaytarish
  r := public.t2_hr_oylik_hisobla_v1(u_buh, k, '2026-03', 'hisobla', null, gen_random_uuid());
  rep := rep || (case when (r->>'qator_soni')::int = 2 then 'OK   qoralama hisoblandi (2 xodim)' else 'FAIL hisobla: ' || r::text end);
  r := public.t2_hr_oylik_hisobla_v1(u_buh, k, '2026-03', 'tasdiqla', null, gen_random_uuid());
  rep := rep || (case when (r->>'qator_soni')::int = 1 and jsonb_array_length(r->'rad_etilgan') = 1 and (r->'rad_etilgan'->0->>'kadr_id')::bigint = kb
                      then 'OK   tasdiq: to''liq A tasdiqlandi, to''liq emas B rad etildi' else 'FAIL tasdiq: ' || r::text end);
  r := public.t2_hr_tuzatma_saqla_v1(u_kadr, k, jsonb_build_object('kadr_id', ka, 'oy', '2026-03', 'tur', 'bonus', 'summa', 1), null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'ISH_HAQI_TASDIQLANGAN' then 'OK   tasdiqlangan oyga jarima/bonus qo''shib bo''lmaydi' else 'FAIL qulf: ' || r::text end);
  r := public.t2_hr_tabel_saqla_v1(u_kadr, k, '2026-03', jsonb_build_array(jsonb_build_object('kadr_id', ka, 'kunlar', '{}'::jsonb)), gen_random_uuid());
  rep := rep || (case when (r->>'saqlandi')::int = 0 and r->'yopiq_kadrlar' @> to_jsonb(ka) then 'OK   tasdiqlangan oyda tabel o''zgarmaydi' else 'FAIL tabel qulf: ' || r::text end);
  l := public.t2_hr_oylik_buxgalteriya_v1(k, u_buh, '2026-03');
  rep := rep || (case when jsonb_array_length(l->'qatorlar') = 1 and (l->'qatorlar'->0->>'sof')::numeric = 1186650 and l->'qatorlar'->0->>'provodka_holat' = 'yoq'
                      then 'OK   buxgalteriya ilgagi: tasdiqlangan qator, provodka_holat=yoq' else 'FAIL ilgak: ' || l::text end);
  r := public.t2_hr_oylik_hisobla_v1(u_buh, k, '2026-03', 'qaytar', null, gen_random_uuid());
  rep := rep || (case when (r->>'qator_soni')::int = 1 then 'OK   tasdiq qaytarildi (qoralama)' else 'FAIL qaytar: ' || r::text end);

  -- 10. Noma'lum F2 summasi: akt qatori summasiz -> KPI mavjud qismdan, to'liq emas, ogohlantirish
  set local session_replication_role = replica;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat, lifecycle_status, lifecycle_approved_at) values (o1, k, 'f2', 'HR-6', date '2026-03-01', 'tasdiqlangan', 'approved', timestamptz '2026-03-28 12:00+05') returning id into a6;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (a6, qa, o1, k, 1, null);
  set local session_replication_role = origin;
  l := public.t2_hr_kpi_v1(k, u_buh, '2026-03');
  select e into rw from jsonb_array_elements(l->'qatorlar') e where (e->>'kadr_id')::bigint = ka;
  rep := rep || (case when (rw->>'kpi_f2')::numeric = 300000 and (rw->>'f2_nomalum_soni')::int = 1 and not (rw->>'toliq')::boolean and rw->'ogohlantirish' ? 'f2_summa_nomalum'
                      then 'OK   summasiz F2 akt: 0 deb olinmadi, to''liq emas, ogohlantirish' else 'FAIL nomalum F2: ' || rw::text end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    v_state := 'FAIL'; raise exception 'HR KPI RPC ACCEPTANCE FAIL: %', array_to_string(rep, E'\n');
  end if;
  raise notice E'HR KPI RPC ACCEPTANCE OK:\n%', array_to_string(rep, E'\n');
end $acc$;

rollback;
