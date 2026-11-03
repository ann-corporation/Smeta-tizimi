-- ACCEPTANCE: 20261118000000 + 20261118000100 (qarzdorlik) - migratsiya qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture (haqiqiy summa/INN/nom yo'q).
-- Tekshiradi: import (kontragent+shartnoma+asos), qarz/qabul/tolangan hisobi, minus qator, NULL != 0, spravka FARQ,
-- t2_tolov bilan birga hisob, takror import (operation_id va tabiiy kalit), saqla (CAS, tahrir, bekor), ruxsat, asosiy shartnoma himoyasi.
begin;

do $acc$
declare
  k bigint; up bigint; ur bigint; ub bigint; o bigint; r jsonb; l jsonb; sh jsonb; sid bigint; ver int; op uuid;
  rep text[] := array[]::text[]; v_state text; asos_id bigint;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_QARZ_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_QARZ_O_', k) returning id into o;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tqz_pto_' || k, 'pto', 'faol') returning id into up;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tqz_rah_' || k, 'rahbar', 'faol') returning id into ur;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tqz_buy_' || k, 'buyurtmachi', 'faol') returning id into ub;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, k, 'pto', 'faol'), (ur, k, 'rahbar', 'faol'), (ub, k, 'buyurtmachi', 'faol');

  -- 1. Import: ikki shartnoma (postavshik: yetkazish 1000 + 500, to'lov 600, minus qaytarish -100; subpudrat: faqat spravka)
  op := gen_random_uuid();
  r := public.t2_qarzdorlik_import_v1(up, k, jsonb_build_array(
    jsonb_build_object('kontragent', 'TEST POSTAVSHIK A', 'raqam', 'T-1', 'turi', 'postavshik', 'summa', 2000, 'sana', '2026-01-10', 'predmet', 'test material',
      'spravka', jsonb_build_object('qarz', 700, 'tolangan', 600),
      'qatorlar', jsonb_build_array(
        jsonb_build_object('tur', 'yetkazib_berish', 'hujjat_raqam', 'N-1', 'sana', '2026-01-12', 'nomi', 'material 1', 'birlik', 'dona', 'hajm', 10, 'narx', 100),
        jsonb_build_object('tur', 'yetkazib_berish', 'hujjat_raqam', 'N-2', 'sana', '2026-01-15', 'nomi', 'material 2', 'summa', 500),
        jsonb_build_object('tur', 'yetkazib_berish', 'hujjat_raqam', 'N-3', 'sana', '2026-01-16', 'nomi', 'qaytarish', 'summa', -100),
        jsonb_build_object('tur', 'tolov', 'hujjat_raqam', 'P-1', 'sana', '2026-01-20', 'summa', 600))),
    jsonb_build_object('kontragent', 'TEST SUBPUDRAT B', 'raqam', 'T-2', 'turi', 'subpudrat', 'summa', 5000,
      'spravka', jsonb_build_object('qarz', 300), 'qatorlar', '[]'::jsonb)), o, op);
  rep := rep || (case when (r->>'ok')::boolean and (r->>'shartnoma_yangi')::int = 2 and (r->>'qator_qoshildi')::int = 4 and (r->>'kontragent_yangi')::int = 2
                      then 'OK   import: 2 shartnoma, 4 qator, 2 kontragent' else 'FAIL import: ' || r::text end);

  -- 1b. Bir xil operation_id - o'sha natija, ikki marta yozilmaydi
  r := public.t2_qarzdorlik_import_v1(up, k, '[{"kontragent":"X","raqam":"X-1"}]'::jsonb, o, op);
  rep := rep || (case when (r->>'shartnoma_yangi')::int = 2 and (select count(*) from public.t2_shartnoma where kompaniya_id = k) = 2
                      then 'OK   operation_id idempotent' else 'FAIL idempotent: ' || r::text end);

  -- 2. Hisob: qabul 1400, tolangan 600, qarz 800, spravka 700 -> farq 100
  l := public.t2_qarzdorlik_royxat_v1(k, up);
  select e into sh from jsonb_array_elements(l->'shartnomalar') e where e->>'raqam' = 'T-1';
  rep := rep || (case when (sh->>'qabul')::numeric = 1400 and (sh->>'tolangan')::numeric = 600 and (sh->>'qarz')::numeric = 800
                           and (sh->>'farq')::numeric = 100 and (sh->>'shartnoma_summa')::numeric = 2000
                      then 'OK   qabul 1400, tolangan 600, qarz 800, farq 100 (minus qator hisobga olindi)' else 'FAIL hisob: ' || sh::text end);
  rep := rep || (case when jsonb_array_length(sh->'qatorlar') = 4 and (sh->'obyektlar'->0->>'id')::bigint = o then 'OK   4 asos qatori, obyekt bog''i' else 'FAIL qatorlar/obyekt' end);

  -- 3. NULL != 0: asossiz shartnomada qarz NULL (0 emas); farq ham NULL
  select e into sh from jsonb_array_elements(l->'shartnomalar') e where e->>'raqam' = 'T-2';
  rep := rep || (case when sh->'qarz' = 'null'::jsonb and sh->'farq' = 'null'::jsonb and (sh->>'spravka_qarz')::numeric = 300 and sh->'qabul' = 'null'::jsonb
                      then 'OK   asossiz: qarz/farq NULL (noma''lum), spravka 300 saqlangan' else 'FAIL NULL: ' || sh::text end);
  sid := (sh->>'shartnoma_id')::bigint;

  -- 4. Takror import (boshqa operation_id) - tabiiy kalit bo'yicha qatorlar qo'shilmaydi
  r := public.t2_qarzdorlik_import_v1(up, k, jsonb_build_array(
    jsonb_build_object('kontragent', 'TEST POSTAVSHIK A', 'raqam', 'T-1', 'turi', 'postavshik',
      'qatorlar', jsonb_build_array(jsonb_build_object('tur', 'tolov', 'hujjat_raqam', 'P-1', 'sana', '2026-01-20', 'summa', 600)))), null, gen_random_uuid());
  rep := rep || (case when (r->>'shartnoma_yangilandi')::int = 1 and (r->>'qator_takror')::int = 1 and (r->>'qator_qoshildi')::int = 0
                           and (r->>'kontragent_yangi')::int = 0 then 'OK   takror: kontragent/qator qayta yaratilmadi' else 'FAIL takror: ' || r::text end);

  -- 5. t2_tolov bilan birga: 100 ta qo'shimcha to'lov -> tolangan 700, qarz 700 (= spravka, farq 0)
  set local session_replication_role = replica;
  insert into public.t2_tolov (kompaniya_id, shartnoma_id, sana, summa, tur, manba)
  select k, (select id from public.t2_shartnoma where kompaniya_id = k and raqam = 'T-1'), '2026-02-01', 100, 'tolov', 'qolda';
  set local session_replication_role = origin;
  l := public.t2_qarzdorlik_royxat_v1(k, up);
  select e into sh from jsonb_array_elements(l->'shartnomalar') e where e->>'raqam' = 'T-1';
  rep := rep || (case when (sh->>'tolangan')::numeric = 700 and (sh->>'qarz')::numeric = 700 and (sh->>'farq')::numeric = 0
                      then 'OK   t2_tolov qo''shildi: tolangan 700, qarz 700, farq 0' else 'FAIL t2_tolov: ' || sh::text end);

  -- 6. Saqla: CAS
  sid := (sh->>'shartnoma_id')::bigint; ver := (sh->>'versiya')::int;
  r := public.t2_qarzdorlik_saqla_v1(up, k, sid, ver - 1, '[]'::jsonb, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'STALE_VERSION' then 'OK   eski versiya rad' else 'FAIL CAS: ' || r::text end);
  -- 6b. Tahrir (hajm*narx avtomatik), yangi qator, bekor, spravka
  asos_id := (sh->'qatorlar'->0->>'id')::bigint;
  r := public.t2_qarzdorlik_saqla_v1(up, k, sid, ver, jsonb_build_array(
      jsonb_build_object('id', asos_id, 'tur', 'yetkazib_berish', 'hujjat_raqam', 'N-1', 'hajm', 20, 'narx', 100),
      jsonb_build_object('tur', 'boshlangich_qoldiq', 'nomi', 'ochilish', 'summa', 50)),
    jsonb_build_array((sh->'qatorlar'->1->>'id')::bigint), jsonb_build_object('qarz', 1000), gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean and (r->>'yangi')::int = 1 and (r->>'tahrir')::int = 1 and (r->>'bekor')::int = 1
                      then 'OK   saqla: 1 yangi, 1 tahrir, 1 bekor' else 'FAIL saqla: ' || r::text end);
  l := public.t2_qarzdorlik_royxat_v1(k, up);
  select e into sh from jsonb_array_elements(l->'shartnomalar') e where e->>'raqam' = 'T-1';
  -- boshlangich 50 + yetkazilgan (2000 + -100) - tolangan 700 = 1250 ; spravka 1000 -> farq 250
  rep := rep || (case when (sh->>'qabul')::numeric = 1900 and (sh->>'boshlangich')::numeric = 50 and (sh->>'qarz')::numeric = 1250 and (sh->>'farq')::numeric = 250
                      then 'OK   tahrirdan keyin: qabul 1900, boshlangich 50, qarz 1250, farq 250' else 'FAIL qayta hisob: ' || sh::text end);

  -- 7. Ruxsat: rahbar o'qiy oladi, yoza olmaydi
  begin
    r := public.t2_qarzdorlik_saqla_v1(ur, k, sid, (sh->>'versiya')::int, '[]'::jsonb, null, null, gen_random_uuid());
    rep := rep || ('FAIL rahbar yozdi: ' || r::text);
  exception when insufficient_privilege then rep := rep || 'OK   rahbar yoza olmaydi'::text;
  end;
  l := public.t2_qarzdorlik_royxat_v1(k, ur);
  rep := rep || (case when (l->>'ok')::boolean then 'OK   rahbar o''qiydi' else 'FAIL rahbar o''qish' end);

  -- 7b. Buyurtmachi (mijoz) kreditor qarzini ko'rmaydi
  begin
    l := public.t2_qarzdorlik_royxat_v1(k, ub);
    rep := rep || ('FAIL buyurtmachi o''qidi: ' || l::text);
  exception when insufficient_privilege then rep := rep || 'OK   buyurtmachi o''qiy olmaydi'::text;
  end;

  -- 8. Boshqa kompaniya a'zosi o'qiy olmaydi
  begin
    l := public.t2_qarzdorlik_royxat_v1(k + 999999, up);
    rep := rep || ('FAIL begona kompaniya: ' || l::text);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || 'OK   begona kompaniya rad (' || v_state || ')';
  end;

  -- 9. Asosiy shartnoma ustiga import yozilmaydi
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi) values (k, 'A-ASOSIY', true, 'Bosh shartnoma');
  begin
    r := public.t2_qarzdorlik_import_v1(up, k, '[{"kontragent":"TEST X","raqam":"A-ASOSIY"}]'::jsonb, null, gen_random_uuid());
    rep := rep || ('FAIL asosiy shartnoma ustiga yozildi: ' || r::text);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || (case when sqlerrm like 'ASOSIY_SHARTNOMA_BAND%' then 'OK   asosiy shartnoma himoyalangan' else 'FAIL asosiy xato: ' || sqlerrm end);
  end;
  -- Asosiy shartnoma royxatga kirmaydi
  l := public.t2_qarzdorlik_royxat_v1(k, up);
  rep := rep || (case when not exists (select 1 from jsonb_array_elements(l->'shartnomalar') e where e->>'raqam' = 'A-ASOSIY') then 'OK   asosiy shartnoma ro''yxatda yo''q' else 'FAIL asosiy ro''yxatda' end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'ACCEPTANCE_QARZDORLIK FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'ACCEPTANCE_QARZDORLIK % OK:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;
