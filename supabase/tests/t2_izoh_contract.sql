-- T2_IZOH (P4 qator izohi) - adversarial acceptance, rollback bilan. Natija: oxirgi exception "TEST_IZOH ..." ichida.
-- Faqat disposable branch / lokal: execute_sql da hech narsa saqlanmaydi.
do $$
declare
  p bigint; z bigint; x bigint;                 -- pudratchi (akt egasi), zakazchik, begona
  up bigint; uz bigint; uzk bigint; ux bigint;  -- pudratchi boss, zakazchik boss, zakazchik kuzatuvchi, begona boss
  o1 bigint; qa1 bigint; akt bigint; akt2 bigint; q1 bigint; q2 bigint; al bigint; tq bigint;
  r jsonb; i1 bigint; i2 bigint; op uuid := gen_random_uuid(); ver int;
  rep text[] := array[]::text[];
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_PUD', 'TST-P', '900000011', true) returning id into p;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_ZAK', 'TST-Z', '900000012', true) returning id into z;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_BEGONA', 'TST-X', '900000013', true) returning id into x;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tsi_up', 'P boss', 'faol') returning id into up;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tsi_uz', 'Z boss', 'faol') returning id into uz;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tsi_uzk', 'Z kuzatuvchi', 'faol') returning id into uzk;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tsi_ux', 'X boss', 'faol') returning id into ux;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, p, 'boss', 'faol'), (uz, z, 'boss', 'faol'), (uzk, z, 'kuzatuvchi', 'faol'), (ux, x, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('P-obyekt', p) returning id into o1;
  insert into t2_qator (obyekt_id, tur, kompaniya_id) values (o1, 'rs', p) returning id into qa1;
  insert into t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o1, p, 'f2', '1', date '2026-09-01', 1000, 'qoralama', 'draft') returning id into akt;
  insert into t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o1, p, 'f2', '2', date '2026-10-01', 500, 'qoralama', 'draft') returning id into akt2;
  insert into t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (akt, qa1, o1, p, 10, 100) returning id into q1;
  insert into t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (akt2, qa1, o1, p, 5, 100) returning id into q2;
  -- aloqa (faol) + akt (birinchisi) zakazchikka taqdim; ikkinchisi taqdim QILINMAGAN
  r := t2_tomon_taklif_v1(up, p, z, '900000012', null, 'pudratchi', 'zakazchik', 'shartnoma', null, null, null, gen_random_uuid());
  al := (r->>'id')::bigint;
  perform t2_tomon_javob_v1(uz, z, al, 'qabul', null);
  perform t2_tomon_grant_saqla_v1(up, p, al, jsonb_build_array(jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1), jsonb_build_object('resurs', 'f2', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1)));
  -- taqdim: akt qatorlari qulfi sababli sinov aktlari qoralama; taqdim qatori bevosita (RPC lar faqat t2_tomon_taqdim ga qaraydi)
  insert into t2_tomon_taqdim (aloqa_id, taqdim_etuvchi_kompaniya_id, qabul_qiluvchi_kompaniya_id, resurs, manba_jadval, manba_id, obyekt_id, nom, taqdim_actor_id)
  values (al, p, z, 'f2', 't2_akt', akt, o1, 'F-2 sinov', up) returning id into tq;

  -- 1. zakazchik taqdim qilingan qatorga izoh yozadi
  r := t2_izoh_yoz_v1(uz, z, op, al, 't2_akt_qator', q1, 'Narx yuqori, asoslang', null);
  i1 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean then 'OK   zakazchik taqdim qilingan qatorga izoh yozdi' else 'FAIL izoh: ' || r::text end);
  -- 2. kuzatuvchi yoza olmaydi
  begin perform t2_izoh_yoz_v1(uzk, z, gen_random_uuid(), al, 't2_akt_qator', q1, 'x', null); rep := rep || 'FAIL kuzatuvchi yozdi'::text;
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   kuzatuvchi izoh yoza olmaydi' else 'FAIL kuzatuvchi: ' || sqlerrm end); end;
  -- 3. begona kompaniya actori
  begin perform t2_izoh_yoz_v1(ux, z, gen_random_uuid(), al, 't2_akt_qator', q1, 'x', null); rep := rep || 'FAIL begona actor yozdi'::text;
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   begona actor boshqa kompaniya nomidan yoza olmaydi' else 'FAIL begona actor: ' || sqlerrm end); end;
  -- 4. begona tenant (aloqasiz) aktga
  r := t2_izoh_yoz_v1(ux, x, gen_random_uuid(), al, 't2_akt_qator', q1, 'x', null);
  rep := rep || (case when r->>'code' = 'RUXSAT_YOQ' then 'OK   aloqasiz begona tenant - RUXSAT_YOQ' else 'FAIL begona tenant: ' || r::text end);
  -- 5. takror operation_id
  r := t2_izoh_yoz_v1(uz, z, op, al, 't2_akt_qator', q1, 'Narx yuqori, asoslang', null);
  rep := rep || (case when (r->>'takror')::boolean and (r->>'id')::bigint = i1 and (select count(*) from t2_izoh where kompaniya_id = z and operation_id = op) = 1 then 'OK   takror operation_id - bitta qator' else 'FAIL takror: ' || r::text end);
  -- 6. eski versiya
  r := t2_izoh_hal_v1(up, p, gen_random_uuid(), i1, 99, true);
  rep := rep || (case when r->>'code' = 'VERSIYA_ESKI' then 'OK   eski kutilgan_versiya - VERSIYA_ESKI' else 'FAIL versiya: ' || r::text end);
  -- 7. taqdim QILINMAGAN akt qatoriga zakazchik yozolmaydi
  r := t2_izoh_yoz_v1(uz, z, gen_random_uuid(), al, 't2_akt_qator', q2, 'x', null);
  rep := rep || (case when r->>'code' = 'RUXSAT_YOQ' then 'OK   taqdim qilinmagan akt qatoriga - RUXSAT_YOQ' else 'FAIL taqdimsiz: ' || r::text end);
  -- 8. zakazchik ichki (aloqasiz) izoh yoza olmaydi
  r := t2_izoh_yoz_v1(uz, z, gen_random_uuid(), null, 't2_akt_qator', q1, 'x', null);
  rep := rep || (case when r->>'code' = 'RUXSAT_YOQ' then 'OK   begona tomon ichki izoh yoza olmaydi' else 'FAIL ichki: ' || r::text end);
  -- 9. allow-list tashqarisi / hali yoqilmagan manba
  r := t2_izoh_yoz_v1(up, p, gen_random_uuid(), al, 't2_aosr', 1, 'x', null);
  rep := rep || (case when r->>'code' = 'MANBA_QOLLANMAYDI' then 'OK   yoqilmagan manba - MANBA_QOLLANMAYDI' else 'FAIL manba: ' || r::text end);
  begin insert into t2_izoh (kompaniya_id, manba_jadval, manba_id, egasi_kompaniya_id, matn, operation_id, yaratdi_actor_id) values (p, 't2_users', 1, p, 'x', gen_random_uuid(), up);
    rep := rep || 'FAIL allow-list chetlandi'::text; exception when check_violation then rep := rep || 'OK   allow-list CHECK: begona jadval yo''q'::text; end;
  -- 10. pudratchi (PTO) javob yozadi + ota izoh + ichki izoh
  r := t2_izoh_yoz_v1(up, p, gen_random_uuid(), al, 't2_akt_qator', q1, 'Asos: smeta 12-qator', i1);
  i2 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean then 'OK   pudratchi aloqa izohiga javob yozdi' else 'FAIL javob: ' || r::text end);
  r := t2_izoh_yoz_v1(up, p, gen_random_uuid(), null, 't2_akt_qator', q1, 'ICHKI: marja 12%', null);
  rep := rep || (case when (r->>'ok')::boolean then 'OK   egasi ichki izoh yozdi' else 'FAIL ichki egasi: ' || r::text end);
  -- 11. ko'rinish: zakazchik ichki izohni KO'RMAYDI; pudratchi hammasini ko'radi
  r := t2_izohlar_v1(uz, z, akt, al);
  rep := rep || (case when jsonb_array_length(r->'izohlar') = 2 and not exists (select 1 from jsonb_array_elements(r->'izohlar') e where e->>'matn' like 'ICHKI%') then 'OK   zakazchik ichki izohni ko''rmaydi (2 ta aloqa izohi)' else 'FAIL zakazchik ko''rinishi: ' || r::text end);
  r := t2_izohlar_v1(up, p, akt, null);
  rep := rep || (case when jsonb_array_length(r->'izohlar') = 3 then 'OK   pudratchi hammasini ko''radi (3 ta)' else 'FAIL pudratchi ko''rinishi: ' || r::text end);
  -- 12. zakazchik taqdimsiz aktning izohlarini o'qiy olmaydi; begona umuman
  r := t2_izohlar_v1(uz, z, akt2, al);
  rep := rep || (case when r->>'code' = 'RUXSAT_YOQ' then 'OK   taqdimsiz akt izohlari - RUXSAT_YOQ' else 'FAIL taqdimsiz o''qish: ' || r::text end);
  r := t2_izohlar_v1(ux, x, akt, al);
  rep := rep || (case when r->>'code' = 'RUXSAT_YOQ' then 'OK   begona tenant o''qiy olmaydi' else 'FAIL begona o''qish: ' || r::text end);
  -- 13. hal qilindi: pudratchi belgilaydi, versiya oshadi
  select versiya into ver from t2_izoh where id = i1;
  r := t2_izoh_hal_v1(up, p, gen_random_uuid(), i1, ver, true);
  rep := rep || (case when (r->>'ok')::boolean and (select holat from t2_izoh where id = i1) = 'hal_qilingan' then 'OK   hal qilindi belgisi, versiya oshdi' else 'FAIL hal: ' || r::text end);
  r := t2_izoh_hal_v1(ux, x, gen_random_uuid(), i1, ver + 1, false);
  rep := rep || (case when r->>'code' = 'RUXSAT_YOQ' then 'OK   begona hal belgisini o''zgartira olmaydi' else 'FAIL begona hal: ' || r::text end);
  -- 14. hodisa jurnaliga tushdi (taqdim bilan)
  rep := rep || (case when exists (select 1 from t2_tomon_hodisa where aloqa_id = al and taqdim_id = tq and tur = 'izoh') then 'OK   izoh t2_tomon_hodisa da (taqdim bilan)' else 'FAIL hodisa' end);
  -- 15. aloqa yopilgach zakazchik o'qiy/yoza olmaydi
  perform t2_tomon_holat_v1(up, p, al, 'yopish', 'test');
  r := t2_izohlar_v1(uz, z, akt, al);
  rep := rep || (case when r->>'code' = 'RUXSAT_YOQ' then 'OK   aloqa yopilgach - RUXSAT_YOQ' else 'FAIL yopilgach: ' || r::text end);
  -- 16. anon/authenticated RPC ni chaqira olmaydi
  rep := rep || (case when not has_function_privilege('anon', 'public.t2_izoh_yoz_v1(bigint,bigint,uuid,bigint,text,bigint,text,bigint)', 'execute')
                       and not has_function_privilege('authenticated', 'public.t2_izohlar_v1(bigint,bigint,bigint,bigint,integer,bigint)', 'execute')
                       and not has_table_privilege('authenticated', 'public.t2_izoh', 'select') then 'OK   anon/authenticated yo''q' else 'FAIL grant sizdi' end);

  raise exception 'TEST_IZOH %', array_to_string(rep, E'\n');
end $$;
