-- ACCEPTANCE: 20261123000000 (transport v1) - BEGIN..ROLLBACK, FAQAT sintetik fixture.
-- Tekshiradi: tannarx formulasi (aniq raqamlar, TS lib bilan bir xil), NULL != 0 (yetishmaydi), holat mashinasi, haydovchi faqat o'z reysi,
-- idempotentlik, versiya, tenant izolyatsiyasi, ulushlar yig'indisi = tannarx, xarajatga o'tkazish (takror o'tmaydi), KPI, grant yopiqligi.
begin;
do $acc$
declare
  k bigint; k2 bigint; adm bigint; hay bigint; bosh bigint; o1 bigint; o2 bigint; o_boshqa bigint;
  m_id bigint; h_id bigint; r_id bigint; ver int; res jsonb; op uuid; tn jsonb; n int; s numeric; kpi jsonb;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_TR_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_TR2_', gen_random_uuid()::text, true) returning id into k2;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_adm', 'tr_adm_' || gen_random_uuid(), 'tr_adm_' || gen_random_uuid() || '@t.invalid') returning id into adm;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_hay', 'tr_hay_' || gen_random_uuid(), 'tr_hay_' || gen_random_uuid() || '@t.invalid') returning id into hay;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_bosh', 'tr_bosh_' || gen_random_uuid(), 'tr_bosh_' || gen_random_uuid() || '@t.invalid') returning id into bosh;
  insert into public.t2_azolik (kompaniya_id, foydalanuvchi_id, rol, holat) values (k, adm, 'admin', 'faol'), (k, hay, 'haydovchi', 'faol'), (k, bosh, 'rahbar', 'faol');
  insert into public.t2_obyekt (nom, kompaniya_id, lat, lng) values ('_O1', k, 41.30, 69.24) returning id into o1;
  insert into public.t2_obyekt (nom, kompaniya_id, lat, lng) values ('_O2', k, 41.35, 69.30) returning id into o2;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_OB', k2) returning id into o_boshqa;
  -- Ruxsat rol orqali: admin - hammasi, haydovchi - logistics.trip, rahbar - logistics.read (t2_role_permissions_v2).

  -- Tarixdagi yoqilg'i narxi (eski 12000, yangi 14000) - reys sanasiga mosi tanlanadi.
  op := gen_random_uuid(); perform public.t2_tr_yoqilgi_narx_saqla_v1(k, adm, op, '{"yoqilgi_turi":"dizel","sana":"2026-01-01","narx":12000}');
  perform public.t2_tr_yoqilgi_narx_saqla_v1(k, adm, gen_random_uuid(), '{"yoqilgi_turi":"dizel","sana":"2026-03-01","narx":14000}');
  res := public.t2_tr_yoqilgi_narx_saqla_v1(k, adm, op, '{"yoqilgi_turi":"dizel","sana":"2026-01-01","narx":99}');
  if not coalesce((res ->> 'takror')::boolean, false) then raise exception 'FAIL idempotent narx'; end if;

  res := public.t2_tr_mashina_saqla_v1(k, adm, gen_random_uuid(), '{"nomi":"_Truck","davlat_raqami":"01A000AA","norma_100km":30,"amort_km":1000,"kutish_soat_narx":50000,"odometr_km":1000,"yuk_t":20}');
  m_id := (res ->> 'id')::bigint;
  res := public.t2_tr_haydovchi_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('ism','_Haydovchi','tolov_turi','km','tolov_stavka',500,'foydalanuvchi_id',hay));
  h_id := (res ->> 'id')::bigint;
  -- Boshqa kompaniya mashinasi/obyekti bilan reys - rad
  res := public.t2_tr_reys_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('sana','2026-04-10','mashina_id',m_id,'haydovchi_id',h_id,
    'bekatlar', jsonb_build_array(jsonb_build_object('nom','A','turi','yuklash'), jsonb_build_object('nom','B','obyekt_id',o_boshqa))));
  if (res ->> 'code') is distinct from 'OBYEKT_SCOPE_MISMATCH' then raise exception 'FAIL tenant obyekt: %', res; end if;

  op := gen_random_uuid();
  res := public.t2_tr_reys_saqla_v1(k, adm, op, jsonb_build_object('sana','2026-04-10','mashina_id',m_id,'haydovchi_id',h_id,'reja_km',90,'narx_qqs_siz',800000,
    'bekatlar', jsonb_build_array(jsonb_build_object('nom','Ombor','turi','yuklash'), jsonb_build_object('nom','O1','turi','tushirish','obyekt_id',o1), jsonb_build_object('nom','O2','turi','tushirish','obyekt_id',o2)),
    'yuklar', jsonb_build_array(jsonb_build_object('nom','Sement','ogirlik_t',3,'obyekt_id',o1,'tushirish_tartib',2), jsonb_build_object('nom','Armatura','ogirlik_t',1,'obyekt_id',o2,'tushirish_tartib',3))));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL reys: %', res; end if;
  r_id := (res ->> 'id')::bigint; ver := (res ->> 'versiya')::int;
  if (public.t2_tr_reys_saqla_v1(k, adm, op, '{}') ->> 'id')::bigint is distinct from r_id then raise exception 'FAIL idempotent reys'; end if;
  select count(*) into n from public.t2_tr_reys where kompaniya_id = k; if n <> 1 then raise exception 'FAIL takror reys yaratdi'; end if;

  -- Boshqa haydovchi (a'zo, logistics.read) boshlay olmaydi; haydovchi o'z reysini boshlaydi
  begin perform public.t2_tr_reys_yurish_v1(k, bosh, gen_random_uuid(), jsonb_build_object('id',r_id,'versiya',ver,'harakat','boshla')); raise exception 'FAIL begona boshladi';
  exception when sqlstate '42501' then null; end;
  res := public.t2_tr_reys_yurish_v1(k, hay, gen_random_uuid(), jsonb_build_object('id',r_id,'versiya',ver,'harakat','boshla','km',1000));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL boshla: %', res; end if; ver := (res ->> 'versiya')::int;
  res := public.t2_tr_reys_yurish_v1(k, hay, gen_random_uuid(), jsonb_build_object('id',r_id,'versiya',ver - 1,'harakat','boshla'));
  if (res ->> 'code') is distinct from 'VERSION_CONFLICT' then raise exception 'FAIL versiya: %', res; end if;
  -- Bekatlar yopilmay yetkazib bo'lmaydi
  res := public.t2_tr_reys_yurish_v1(k, hay, gen_random_uuid(), jsonb_build_object('id',r_id,'versiya',ver,'harakat','yetkaz','km',1100));
  if (res ->> 'code') is distinct from 'BEKATLAR_YOPILMAGAN' then raise exception 'FAIL bekatlar: %', res; end if;
  for n in 1..3 loop
    res := public.t2_tr_reys_yurish_v1(k, hay, gen_random_uuid(), jsonb_build_object('id',r_id,'versiya',ver,'harakat','bekat','bekat_tartib',n,'bekat_holat','bajarildi','qabul_qiluvchi','_Qabul','tasdiq_turi','imzo'));
    if not (res ->> 'ok')::boolean then raise exception 'FAIL bekat %: %', n, res; end if; ver := (res ->> 'versiya')::int;
  end loop;
  -- Haydovchi tannarx kiritishdan oldin: yoqilgi narxi bor, kutish kiritilmagan = 0 => to'liq; yol_haqi NULL (ixtiyoriy)
  res := public.t2_tr_reys_yurish_v1(k, hay, gen_random_uuid(), jsonb_build_object('id',r_id,'versiya',ver,'harakat','yetkaz','km',1100,'kutish_daqiqa',30,'yol_haqi',20000,'bosh_km',40));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yetkaz: %', res; end if; ver := (res ->> 'versiya')::int;
  if (select odometr_km from public.t2_tr_mashina where id = m_id) <> 1100 then raise exception 'FAIL odometr yangilanmadi'; end if;
  -- Haydovchi yopa olmaydi
  begin perform public.t2_tr_reys_yop_v1(k, hay, gen_random_uuid(), jsonb_build_object('id',r_id,'versiya',ver)); raise exception 'FAIL haydovchi yopdi';
  exception when sqlstate '42501' then null; end;
  res := public.t2_tr_reys_yop_v1(k, adm, gen_random_uuid(), jsonb_build_object('id',r_id,'versiya',ver));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yop: %', res; end if;
  tn := res -> 'tannarx';
  -- Aniq raqamlar: yoqilg'i 30L*14000=420000; haydovchi 500*100*1.12=56000; amort 1000*100=100000; kutish 0.5*50000=25000; yol 20000
  if (tn -> 'yoqilgi' ->> 'summa')::numeric <> 420000 or (tn ->> 'haydovchi')::numeric <> 56000 or (tn ->> 'amortizatsiya')::numeric <> 100000
     or (tn ->> 'kutish')::numeric <> 25000 or (tn ->> 'jami')::numeric <> 621000 or not (tn ->> 'toliq')::boolean then raise exception 'FAIL tannarx: %', tn; end if;
  select sum(summa_qqs_siz) into s from public.t2_tr_taqsim where reys_id = r_id;
  if s <> 621000 then raise exception 'FAIL taqsim yigindisi %', s; end if;
  if (select summa_qqs_siz from public.t2_tr_taqsim where reys_id = r_id and obyekt_id = o1) <> 465750 then raise exception 'FAIL ogirlik ulushi'; end if;

  -- Xarajatga o'tkazish: faqat financial.write; takror o'tkazish ikkinchi xarajat yaratmaydi
  begin perform public.t2_tr_xarajat_otkaz_v1(k, hay, gen_random_uuid(), jsonb_build_object('id', r_id)); raise exception 'FAIL ruxsatsiz otkaz';
  exception when sqlstate '42501' then null; end;
  res := public.t2_tr_xarajat_otkaz_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', r_id));
  if (res ->> 'otkazildi')::int <> 2 then raise exception 'FAIL otkaz: %', res; end if;
  perform public.t2_tr_xarajat_otkaz_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', r_id));
  select count(*), sum(summa) into n, s from public.t2_xarajat where kompaniya_id = k and hujjat_ref like 'transport:%';
  if n <> 2 or s <> 621000 then raise exception 'FAIL xarajat takror: % %', n, s; end if;

  -- NULL != 0: haydovchisiz, narxsiz yoqilgi turidagi reys - yetishmaydi ro'yxatida, jami null emas (qisman), toliq=false
  res := public.t2_tr_mashina_saqla_v1(k, adm, gen_random_uuid(), '{"nomi":"_Rent","turi":"samosval","egalik":"ijara","yoqilgi_turi":"benzin","norma_100km":25}');
  res := public.t2_tr_reys_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('sana','2026-04-11','mashina_id',(res ->> 'id')::bigint,'reja_km',50,
    'bekatlar', jsonb_build_array(jsonb_build_object('nom','A'), jsonb_build_object('nom','B'))));
  tn := public._t2_tr_tannarx_v1((res ->> 'id')::bigint);
  if (tn ->> 'toliq')::boolean or not (tn -> 'yetishmaydi') @> '["yoqilgi","haydovchi","amortizatsiya"]'::jsonb or (tn -> 'yoqilgi' ->> 'summa') is not null then raise exception 'FAIL null qoidasi: %', tn; end if;

  -- Reja holatida bekor, sabab majburiy
  res := public.t2_tr_reys_bekor_v1(k, adm, gen_random_uuid(), jsonb_build_object('id',(select max(id) from public.t2_tr_reys),'versiya',1));
  if (res ->> 'code') is distinct from 'SABAB_REQUIRED' then raise exception 'FAIL sabab'; end if;

  -- Tenant: boshqa kompaniya mashinasini ko'ra olmaydi / a'zo emas
  begin perform public.t2_transport_ol_v1(k2, adm, 'park'); raise exception 'FAIL begona kompaniya o''qidi'; exception when sqlstate '42501' then null; end;
  if jsonb_array_length(public.t2_transport_ol_v1(k, bosh, 'park') -> 'mashinalar') <> 2 then raise exception 'FAIL park o''qish'; end if;
  -- Haydovchi 'bugun' faqat o'z reysi
  if jsonb_array_length(public.t2_transport_ol_v1(k, hay, 'bugun', '{"sana":"2026-04-10"}') -> 'reyslar') <> 1 then raise exception 'FAIL bugun'; end if;
  if jsonb_array_length(public.t2_transport_ol_v1(k, hay, 'bugun', '{"sana":"2026-04-11"}') -> 'reyslar') <> 0 then raise exception 'FAIL bugun begona'; end if;
  -- KPI
  kpi := public.t2_transport_ol_v1(k, adm, 'kpi', '{"dan":"2026-04-01","gacha":"2026-04-30"}');
  if (select (q ->> 'foyda')::numeric from jsonb_array_elements(kpi -> 'qatorlar') q where q ->> 'guruh' = 'jami') <> 179000 then raise exception 'FAIL foyda %', kpi; end if;
  if (select (q ->> 'daromad_qqs_bilan')::numeric from jsonb_array_elements(kpi -> 'qatorlar') q where q ->> 'guruh' = 'jami') <> 896000 then raise exception 'FAIL daromad QQS bilan'; end if;

  -- Grantlar yopiq
  if has_function_privilege('anon', 'public.t2_transport_ol_v1(bigint,bigint,text,jsonb)', 'execute') or has_function_privilege('authenticated', 'public.t2_tr_reys_yop_v1(bigint,bigint,uuid,jsonb)', 'execute')
     or has_table_privilege('anon', 'public.t2_tr_reys', 'select') or has_table_privilege('authenticated', 'public.t2_tr_reys', 'select') then raise exception 'FAIL grant ochiq'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.t2_tr_reys'::regclass) then raise exception 'FAIL RLS'; end if;
end $acc$;
rollback;
