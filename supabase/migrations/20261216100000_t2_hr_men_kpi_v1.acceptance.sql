-- ACCEPTANCE: 20261216100000_t2_hr_men_kpi_v1 - migratsiya qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture (haqiqiy ism/summa/INN yo'q).
-- Fixture oyi 2026-03: kalendar 20 va 21-mart bayram -> norma 5 kunlik = 21 kun.
-- A (brigadir, kunlik stavka 100 000, tabel 2..11 = 10 kun): naryad 2..5-mart (4 kun) uchun 400 000 t2_xarajat ga to'langan (mart) + aprelda yana bir naryad.
--   Kutilgan: baza = 100 000 * (10 - 4) = 600 000 (naryad kunlari takror to'lanmaydi); naryad qismi 400 000; jami daromad 1 000 000; NDFL 12% = 72 000, INPS 0,1% = 600, sof 527 400.
-- B (oylik, tabelsiz): baza NULL, KPI davomat NULL (0 emas), ball NULL.  P (prorab, oylik 2 100 000, tabel 10 kun, F2 sxema 2%, F2 10 000 000):
--   KPI 200 000 ko'rinadi, lekin pulga ta'sir O'CHIQ (hisoblangan 1 000 000); sozlama yoqilsa 1 200 000.  D (donabay): baza 0 (noma'lum emas).
-- Tekshiradi: o'z qatori, boshqaning qatori rad (boshqa kompaniya), ulanmagan foydalanuvchi, takror to'lov yo'qligi + t2_xarajat bilan mos, KPI NULL, D3, qoidalar.
begin;
set local statement_timeout = '300s';

do $acc$
declare
  k bigint; k2 bigint; o1 bigint; u_kadr bigint; u_buh bigint; u_a bigint; u_b bigint; u_c bigint; u_p bigint; u_d bigint; u_x bigint;
  ka bigint; kb bigint; kp bigint; kd bigint; sx bigint; qa bigint; a1 bigint; nid bigint;
  r jsonb; l jsonb; rw jsonb; q jsonb; v_ok boolean; kunlar jsonb; rep text[] := array[]::text[]; xs0 int; xs1 int; v_bor boolean;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_HRM_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_HRM2_', gen_random_uuid()::text, true) returning id into k2;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_HRM_O1_', k) returning id into o1;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('thm_kadr_' || k, 'kadr', 'faol') returning id into u_kadr;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('thm_buh_' || k, 'bugalter', 'faol') returning id into u_buh;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('thm_a_' || k, 'xodim a', 'faol') returning id into u_a;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('thm_b_' || k, 'xodim b', 'faol') returning id into u_b;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('thm_c_' || k, 'xodim c', 'faol') returning id into u_c;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('thm_p_' || k, 'xodim p', 'faol') returning id into u_p;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('thm_d_' || k, 'xodim d', 'faol') returning id into u_d;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('thm_x_' || k, 'tashqi', 'faol') returning id into u_x;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values
    (u_kadr, k, 'kadr', 'faol'), (u_buh, k, 'bugalter', 'faol'), (u_a, k, 'brigadir', 'faol'), (u_b, k, 'usta', 'faol'),
    (u_c, k, 'usta', 'faol'), (u_p, k, 'prorab', 'faol'), (u_d, k, 'usta', 'faol'), (u_x, k2, 'usta', 'faol');

  -- stavkalar + sxema
  r := public.t2_hr_sxema_saqla_v1(u_buh, k, jsonb_build_object('nom', 'TEST PRORAB 2%', 'f2_foiz', 2, 'f2_baza', 'ustamasiz', 'f2_rejim', 'obyekt'),
        jsonb_build_object('ndfl_foiz', 12, 'inps_foiz', 0.1, 'kun_soat', 8), gen_random_uuid());
  sx := (r->>'sxema_id')::bigint;

  -- xodimlar (kadr). A kunlik, B oylik (tabelsiz), P prorab (sxema + obyekt), D donabay.
  r := public.t2_hr_xodim_saqla_v1(u_kadr, k, null, jsonb_build_object('ism', 'TEST A', 'rol', 'brigadir', 'baza_turi', 'kunlik', 'baza_summa', 100000, 'foydalanuvchi_id', u_a), null, null, null, gen_random_uuid());
  ka := (r->>'kadr_id')::bigint;
  r := public.t2_hr_xodim_saqla_v1(u_kadr, k, null, jsonb_build_object('ism', 'TEST B', 'rol', 'usta', 'baza_turi', 'oylik', 'baza_summa', 2100000, 'foydalanuvchi_id', u_b), null, null, null, gen_random_uuid());
  kb := (r->>'kadr_id')::bigint;
  r := public.t2_hr_xodim_saqla_v1(u_kadr, k, null, jsonb_build_object('ism', 'TEST P', 'rol', 'prorab', 'baza_turi', 'oylik', 'baza_summa', 2100000, 'sxema_id', sx, 'foydalanuvchi_id', u_p),
        null, jsonb_build_array(jsonb_build_object('obyekt_id', o1, 'ulush_foiz', 100)), null, gen_random_uuid());
  kp := (r->>'kadr_id')::bigint;
  r := public.t2_hr_xodim_saqla_v1(u_kadr, k, null, jsonb_build_object('ism', 'TEST D', 'rol', 'brigadir', 'baza_turi', 'donabay', 'foydalanuvchi_id', u_d), null, null, null, gen_random_uuid());
  kd := (r->>'kadr_id')::bigint;
  -- ulanmagan a'zo (u_c): xodim kartasi YO'Q
  rep := rep || (case when ka is not null and kb is not null and kp is not null and kd is not null and (r->>'ok')::boolean
                      then 'OK   xodimlar yaratildi (donabay va pto/prorab turlari qabul qilindi)' else 'FAIL xodimlar: ' || r::text end);
  begin
    perform public.t2_hr_xodim_saqla_v1(u_kadr, k, null, jsonb_build_object('ism', 'TEST PTO', 'rol', 'pto', 'baza_turi', 'oylik', 'baza_summa', 1), null, null, null, gen_random_uuid()); v_ok := true;
  exception when others then v_ok := false; end;
  rep := rep || (case when v_ok then 'OK   rol pto qabul qilindi' else 'FAIL rol pto' end);

  perform public.t2_hr_kalendar_saqla_v1(u_kadr, k, jsonb_build_array(jsonb_build_object('sana', '2026-03-20', 'tur', 'bayram', 'nom', 'TEST'),
        jsonb_build_object('sana', '2026-03-21', 'tur', 'bayram', 'nom', 'TEST')), null, gen_random_uuid());
  select jsonb_object_agg(d::text, 'K') into kunlar from generate_series(2, 11) d;
  perform public.t2_hr_tabel_saqla_v1(u_kadr, k, '2026-03', jsonb_build_array(
    jsonb_build_object('kadr_id', ka, 'kunlar', kunlar, 'holat', 'tasdiqlangan'), jsonb_build_object('kadr_id', kp, 'kunlar', kunlar, 'holat', 'tasdiqlangan')), gen_random_uuid());

  -- F2 (P obyekti): tasdiqlangan, mart, 10 000 000
  set local session_replication_role = replica;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kat, nom, birlik, hajm, narx) values (o1, k, 'bl', U&'\0427\0415\041B', 'mehnat', 'sht', 1, 1) returning id into qa;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat, lifecycle_status, lifecycle_approved_at) values (o1, k, 'f2', 'HRM-1', date '2026-03-01', 'tasdiqlangan', 'approved', timestamptz '2026-03-10 12:00+05') returning id into a1;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (a1, qa, o1, k, 1, 10000000);
  set local session_replication_role = origin;

  -- Naryad (A): mart 2..5 davri, 400 000 to'langan (t2_xarajat, mehnat); aprelda yana bir naryad (mart hisobiga kirmaydi)
  v_bor := public._t2_hr_naryad_bor_v1();
  if v_bor then
    set local session_replication_role = replica;
    insert into public.t2_naryad (kompaniya_id, obyekt_id, raqam, usta_nom, holat, davr_dan, davr_gacha, usta_foydalanuvchi_id, qabul_sana)
      values (k, o1, 'HRM-N1-' || k, 'TEST USTA', 'hisoblandi', date '2026-03-02', date '2026-03-05', u_a, timestamptz '2026-03-09 12:00+05') returning id into nid;
    insert into public.t2_xarajat (kompaniya_id, sana, summa, holat, kat, hujjat_ref, obyekt_id)
      values (k, date '2026-03-10', 400000, 'faol', U&'\0427\0415\041B', 'naryad ' || chr(8470) || 'HRM-N1-' || k, o1);
    insert into public.t2_naryad (kompaniya_id, obyekt_id, raqam, usta_nom, holat, davr_dan, davr_gacha, usta_foydalanuvchi_id, qabul_sana)
      values (k, o1, 'HRM-N2-' || k, 'TEST USTA', 'hisoblandi', date '2026-04-06', date '2026-04-08', u_a, timestamptz '2026-04-09 12:00+05');
    insert into public.t2_xarajat (kompaniya_id, sana, summa, holat, kat, hujjat_ref, obyekt_id)
      values (k, date '2026-04-12', 999000, 'faol', U&'\0427\0415\041B', 'naryad ' || chr(8470) || 'HRM-N2-' || k, o1);
    set local session_replication_role = origin;
  end if;
  select count(*) into xs0 from public.t2_xarajat where kompaniya_id = k;

  -- 1. Xodim A o'z qatorini ko'radi: naryad takror to'lanmaydi, t2_xarajat bilan mos
  l := public.t2_hr_men_v1(k, u_a, '2026-03');
  rw := l->'qator';
  rep := rep || (case when (l->>'bog_langan')::boolean and (rw->>'kadr_id')::bigint = ka and l->>'holat' = 'taxminiy' then 'OK   xodim o''z qatorini ko''radi (kadr = o''zi)' else 'FAIL men A: ' || l::text end);
  if v_bor then
    rep := rep || (case when (rw->>'naryad_summa')::numeric = 400000 and (rw->>'naryad_soni')::int = 1 and (rw->>'naryad_kun')::int = 4
                        and (rw->>'baza')::numeric = 600000 and (rw->>'hisoblangan')::numeric = 600000 and (rw->>'jami_daromad')::numeric = 1000000
                        then 'OK   staff naryad takror hisoblanmadi: baza 600000 (10 - 4 kun), naryad 400000, jami 1000000' else 'FAIL naryad: ' || rw::text end);
    rep := rep || (case when (rw->>'naryad_summa')::numeric = (select sum(x.summa) from public.t2_xarajat x where x.kompaniya_id = k and x.sana >= date '2026-03-01' and x.sana < date '2026-04-01')
                        then 'OK   naryad qismi t2_xarajat bilan mos (aprel yozuvi kirmadi)' else 'FAIL xarajat moslik' end);
  end if;
  rep := rep || (case when (rw->>'ndfl')::numeric = (case when v_bor then 72000 else (rw->>'ndfl')::numeric end)
                           and (rw->>'sof')::numeric = (case when v_bor then 527400 else (rw->>'sof')::numeric end) and (rw->>'qolga')::numeric = (rw->>'sof')::numeric
                      then 'OK   ushlanmalar va qo''lga' else 'FAIL ushlanma: ' || rw::text end);
  rep := rep || (case when not (rw ? 'aktlar') and not (rw ? 'f2_summa') then 'OK   xodimga F2 aktlari/summasi berilmaydi' else 'FAIL moliyaviy tafsilot sizdi' end);
  q := rw->'kpi';
  rep := rep || (case when (q->>'ball')::numeric = 47.6 and (q->>'qamrov')::numeric = 30
                           and exists (select 1 from jsonb_array_elements(q->'korsatkichlar') e where e->>'kod' = 'naryad_qabul' and e->'ball' = 'null'::jsonb
                                   and ((v_bor and e->>'qiymat' = '1') or (not v_bor and e->'qiymat' = 'null'::jsonb)))
                      then 'OK   brigadir KPI: davomat 47,6; naryad ko''rsatkichi maqsadsiz - ball NULL' else 'FAIL KPI A: ' || q::text end);

  -- 2. B: o'z qatori, tabelsiz -> NULL (0 emas); A ning ma'lumoti ko'rinmaydi
  l := public.t2_hr_men_v1(k, u_b, '2026-03');
  rw := l->'qator';
  rep := rep || (case when (rw->>'kadr_id')::bigint = kb and kb <> ka and rw->'baza' = 'null'::jsonb and rw->'hisoblangan' = 'null'::jsonb
                           and (not v_bor or (rw->>'naryad_summa')::numeric = 0)
                      then 'OK   B faqat o''z qatorini ko''radi; tabelsiz baza NULL' else 'FAIL men B: ' || l::text end);
  rep := rep || (case when (rw->'kpi'->>'ball') is null and (rw->'kpi'->>'qamrov')::numeric = 0
                           and exists (select 1 from jsonb_array_elements(rw->'kpi'->'korsatkichlar') e where e->>'kod' = 'davomat' and e->'qiymat' = 'null'::jsonb)
                      then 'OK   ma''lumot yo''q: KPI qiymati va bali NULL (0 emas)' else 'FAIL KPI NULL: ' || (rw->'kpi')::text end);

  -- 3. Ulanmagan a'zo
  l := public.t2_hr_men_v1(k, u_c, '2026-03');
  rep := rep || (case when not (l->>'bog_langan')::boolean and not (l ? 'qator') then 'OK   ulanmagan a''zo: qator yo''q, bog_langan=false' else 'FAIL ulanmagan: ' || l::text end);

  -- 4. Boshqa kompaniya a'zosi rad etiladi
  begin
    perform public.t2_hr_men_v1(k, u_x, '2026-03'); v_ok := true;
  exception when others then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   boshqa kompaniya a''zosiga qator berilmaydi (rad)' else 'FAIL tashqi foydalanuvchi ko''rdi' end);

  -- 5. D3: P - KPI ko'rinadi, lekin pulga ta'sir O'CHIQ
  l := public.t2_hr_kpi_v1(k, u_buh, '2026-03');
  select e into rw from jsonb_array_elements(l->'qatorlar') e where (e->>'kadr_id')::bigint = kp;
  rep := rep || (case when (rw->>'kpi_f2')::numeric = 200000 and (rw->>'kpi_f2_qollandi')::numeric = 0 and (rw->>'baza')::numeric = 1000000
                           and (rw->>'hisoblangan')::numeric = 1000000 and not (rw->>'kpi_pulga_tasir')::boolean
                      then 'OK   D3: KPI 200000 ko''rinadi, pulga ta''sir yo''q (hisoblangan 1000000)' else 'FAIL D3 o''chiq: ' || rw::text end);
  rep := rep || (case when exists (select 1 from jsonb_array_elements(rw->'kpi'->'korsatkichlar') e where e->>'kod' = 'f2_hajm' and (e->>'qiymat')::numeric = 10000000 and e->>'manba' = 't2_akt')
                      then 'OK   prorab KPI: F2 hajmi manbasi bilan' else 'FAIL f2_hajm: ' || (rw->'kpi')::text end);
  begin
    perform public.t2_hr_kpi_qoida_saqla_v1(u_kadr, k, null, true, gen_random_uuid()); v_ok := true;
  exception when sqlstate '42501' then v_ok := false; end;
  rep := rep || (case when not v_ok then 'OK   kadr KPI sozlamasini o''zgartira olmaydi (payroll.write yo''q)' else 'FAIL kadr sozlama' end);
  r := public.t2_hr_kpi_qoida_saqla_v1(u_buh, k, null, true, gen_random_uuid());
  l := public.t2_hr_kpi_v1(k, u_buh, '2026-03');
  select e into rw from jsonb_array_elements(l->'qatorlar') e where (e->>'kadr_id')::bigint = kp;
  rep := rep || (case when (r->>'ok')::boolean and (rw->>'kpi_f2_qollandi')::numeric = 200000 and (rw->>'hisoblangan')::numeric = 1200000
                      then 'OK   D3 yoqildi: hisoblangan 1200000' else 'FAIL D3 yoqiq: ' || rw::text end);
  r := public.t2_hr_kpi_qoida_saqla_v1(u_buh, k, null, false, gen_random_uuid());

  -- 6. Donabay: baza 0 (noma'lum emas), tabelsiz ogohlantirish yo'q
  select e into rw from jsonb_array_elements(public.t2_hr_kpi_v1(k, u_buh, '2026-03')->'qatorlar') e where (e->>'kadr_id')::bigint = kd;
  rep := rep || (case when (rw->>'baza')::numeric = 0 and (rw->>'hisoblangan')::numeric = 0 and not (rw->'ogohlantirish' ? 'baza_nomalum') and not (rw->'ogohlantirish' ? 'tabel_yoq')
                      then 'OK   donabay xodim: baza 0 (tabel bilan to''lanmaydi)' else 'FAIL donabay: ' || rw::text end);

  -- 7. Qoidalar: sukut 11 qator, kompaniya o'zgartirsa almashadi; azolar ro'yxati faqat hr.write
  l := public.t2_hr_qoida_v1(k, u_kadr);
  rep := rep || (case when jsonb_array_length(l->'qoidalar') = 11 and l->'azolar' is not null and l->'azolar' <> 'null'::jsonb and jsonb_array_length(l->'azolar') = 8 - 1
                      then 'OK   qoidalar (sukut 11) va tizim foydalanuvchilari (faqat shu kompaniya)' else 'FAIL qoida: ' || l::text end);
  r := public.t2_hr_kpi_qoida_saqla_v1(u_buh, k, jsonb_build_array(jsonb_build_object('rol', 'usta', 'korsatkich', 'davomat', 'ogirlik', 50, 'maqsad', 90)), null, gen_random_uuid());
  l := public.t2_hr_qoida_v1(k, u_buh);
  rep := rep || (case when (r->>'ok')::boolean and exists (select 1 from jsonb_array_elements(l->'qoidalar') e where e->>'rol' = 'usta' and e->>'manba' = 'kompaniya' and (e->>'maqsad')::numeric = 90)
                           and l->'azolar' = 'null'::jsonb
                      then 'OK   kompaniya qoidasi sukutni almashtirdi; bugalterga azolar ro''yxati berilmaydi' else 'FAIL qoida saqlash: ' || l::text end);

  -- 8. Yangi xarajat qatori yaratilmadi (takror xarajat yo'q)
  select count(*) into xs1 from public.t2_xarajat where kompaniya_id = k;
  rep := rep || (case when xs0 = xs1 then 'OK   HR hisobi t2_xarajat ga yangi qator yozmadi' else 'FAIL xarajat soni o''zgardi' end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'HR MEN KPI ACCEPTANCE FAIL: %', array_to_string(rep, E'\n');
  end if;
  raise notice E'HR MEN KPI ACCEPTANCE OK:\n%', array_to_string(rep, E'\n');
end $acc$;

rollback;
