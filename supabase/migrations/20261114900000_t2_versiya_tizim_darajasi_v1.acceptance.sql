-- Acceptance: 20261114900000 — smeta versiyasi tizim darajasida. SINTETIK obyekt (real mijoz ma'lumoti yo'q).
-- BEGIN … ROLLBACK: hech narsa saqlanmaydi.
--   Q0 qo'riqchi: audit bo'sh; versiyani bilmaydigan yangi o'quvchi audit'da chiqadi; ruxsat yozuvi bilan yo'qoladi.
--   Q1 versiyasiz obyektlar o'zgarmagan: AI konteksti jami = barcha rz yig'indisi (hamma qator faol).
--   Q2 sintetik obyekt: eski smeta 1500 (ЦЕМЕНТ 1000 + ГВОЗДИ 500 + narxsiz ГИПС) + tasdiqlangan F2 400 eski ЦЕМЕНТ da;
--      faollashtirish → yangi smeta 1100 (ЦЕМЕНТ 800 + ПЕСОК 300).
--   Q3 har A o'quvchi faqat faol jamini beradi (1100, 2600 emas); qidiruv/narxlash eski qatorni ko'rmaydi va unga tegmaydi.
--   Q4 har B o'quvchi F2 tarixini (400, eski qatorda) saqlaydi.
begin;
do $acc$
declare
  v_k bigint; v_a bigint; v_o bigint; v_rz bigint; v_b1 bigint; v_r1 bigint; v_b2 bigint; v_r2 bigint; v_gips bigint; v_akt bigint;
  v_nom text := 'SINOV versiya tizim ' || substr(md5(random()::text), 1, 8);
  r jsonb; x numeric; v_cnt int; v_ok boolean; v_o2 bigint;
begin
  -- Q0: qo'riqchi
  select count(*) into v_cnt from public.t2_versiya_xabardorlik_audit_v1();
  if v_cnt <> 0 then
    raise exception 'Q0: audit bo''sh emas: %', (select string_agg(nom, ', ') from public.t2_versiya_xabardorlik_audit_v1());
  end if;
  execute 'create function public._t2_versiya_audit_sinov() returns bigint language sql as ''select count(*) from public.t2_qator''';
  if not exists (select 1 from public.t2_versiya_xabardorlik_audit_v1() where nom = '_t2_versiya_audit_sinov') then
    raise exception 'Q0: versiyani bilmaydigan yangi o''quvchi audit''da chiqmadi';
  end if;
  insert into public.t2_versiya_xabardorlik_ruxsat(nom, toifa, sabab) values ('_t2_versiya_audit_sinov', 'texnik', 'sinov');
  if exists (select 1 from public.t2_versiya_xabardorlik_audit_v1() where nom = '_t2_versiya_audit_sinov') then
    raise exception 'Q0: ruxsat yozuvi hisobga olinmadi';
  end if;
  delete from public.t2_versiya_xabardorlik_ruxsat where nom = '_t2_versiya_audit_sinov';
  execute 'drop function public._t2_versiya_audit_sinov()';
  if (select count(*) from public.t2_versiya_xabardorlik_ruxsat where toifa in ('tarix','texnik','eskirgan','versiya')) < 70 then
    raise exception 'Q0: ruxsat ro''yxati to''liq emas';
  end if;

  -- Q1: versiyasiz obyektlar (oxirgi 5 ta, almashtirilgan qatorsiz) — jami o'zgarmagan.
  for v_o2 in select o.id from public.t2_obyekt o
               where exists (select 1 from public.t2_qator q where q.obyekt_id = o.id and q.tur = 'rz')
                 and not exists (select 1 from public.t2_qator q where q.obyekt_id = o.id and q.versiya_holat <> 'faol')
               order by o.id desc limit 5 loop
    x := (public.t2_ai_kontekst(v_o2)->'smeta'->>'jami')::numeric;
    if x is distinct from (select coalesce(sum(summa), 0) from public.t2_qator where obyekt_id = v_o2 and tur = 'rz') then
      raise exception 'Q1: versiyasiz obyekt % AI jami o''zgardi: %', v_o2, x;
    end if;
    if (public.t2_rollup(v_o2)->>'jami')::numeric is distinct from (select sum(summa) from public.t2_qator where obyekt_id = v_o2 and tur = 'rz') then
      raise exception 'Q1: versiyasiz obyekt % rollup jami o''zgardi', v_o2;
    end if;
  end loop;

  select f.id into v_a from public.t2_foydalanuvchi f where f.holat = 'faol' and public.t2_platforma_superadmin(f.id) order by f.id limit 1;
  select k.id into v_k from public.t2_kompaniya k where k.faol order by k.id desc limit 1;
  if v_a is null or v_k is null then raise notice 'superadmin aktor yoki faol kompaniya yo''q — funksional tekshiruv o''tkazib yuborildi'; return; end if;

  -- Q2: eski smeta
  insert into public.t2_obyekt (nom, kompaniya_id) values (v_nom, v_k) returning id into v_o;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, tartib) values (v_o, v_k, 'rz', 'РАЗДЕЛ ЭСКИ', 1) returning id into v_rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, tartib, daraja) values (v_o, v_k, v_rz, 'bl', 'E1-1', 'ИШ БИР СИНОВ', 'М3', 10, 2, 1) returning id into v_b1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, norma, kat, tartib, daraja) values (v_o, v_k, v_b1, 'rs', 'C1', 'ЦЕМЕНТ СИНОВ', 'Т', 10, 100, 1000, 1, 'МАТ', 3, 2) returning id into v_r1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, tartib, daraja) values (v_o, v_k, v_rz, 'bl', 'E2-2', 'ИШ ИККИ СИНОВ', 'М2', 5, 4, 1) returning id into v_b2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, norma, kat, tartib, daraja) values (v_o, v_k, v_b2, 'rs', 'C2', 'ГВОЗДИ СИНОВ', 'КГ', 5, 100, 500, 1, 'МАТ', 5, 2) returning id into v_r2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, norma, kat, tartib, daraja) values (v_o, v_k, v_b2, 'rs', 'C9', 'ГИПС СИНОВ ЭСКИ', 'КГ', 2, 0.4, 'МАТ', 6, 2) returning id into v_gips;
  perform public.t2_rollup(v_o);
  if (select jami from public.t2_obyekt_jami where id = v_o) is distinct from 1500 then raise exception 'Q2: eski jami 1500 emas'; end if;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, oy, holat) values (v_o, v_k, 'f2', date_trunc('month', now())::date, 'qoralama') returning id into v_akt;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, hajm, narx) values (v_akt, v_r1, v_o, 4, 100);
  update public.t2_akt set holat = 'tasdiqlangan' where id = v_akt;

  r := public.t2_smeta_versiya_faollashtir_v1(v_k, v_a, v_o, jsonb_build_array(
    jsonb_build_object('local_id','rz','tur','rz','nom','ЭКСПЕРТИЗА'),
    jsonb_build_object('local_id','b1','parent_local_id','rz','tur','bl','kod','E1-1','nom','ИШ БИР СИНОВ','birlik','М3','hajm','8'),
    jsonb_build_object('local_id','r1','parent_local_id','b1','tur','rs','kod','C1','nom','ЦЕМЕНТ СИНОВ','birlik','Т','hajm','8','narx','100','summa','800','norma','1'),
    jsonb_build_object('local_id','b3','parent_local_id','rz','tur','bl','kod','E3-3','nom','ИШ УЧ СИНОВ','birlik','М3','hajm','3'),
    jsonb_build_object('local_id','r3','parent_local_id','b3','tur','rs','kod','C3','nom','ПЕСОК СИНОВ','birlik','М3','hajm','3','narx','100','summa','300','norma','1')
  ), jsonb_build_object('nom','SINOV ekspertiza'), gen_random_uuid());
  if coalesce(r->>'ok','') <> 'true' then raise exception 'Q2: faollashtirilmadi: %', r; end if;
  if (select count(*) from public.t2_qator where obyekt_id = v_o and versiya_holat = 'almashtirilgan') <> 6 then raise exception 'Q2: eski 6 qator almashtirilgan emas'; end if;

  -- Q3: A o'quvchilar — faqat faol (1100)
  x := (public.t2_ai_kontekst(v_o)->'smeta'->>'jami')::numeric;
  if x is distinct from 1100 then raise exception 'Q3 t2_ai_kontekst: smeta % (1100)', x; end if;
  if (public.t2_ai_kontekst(v_o)->'smeta')::text like '%ГИПС%' then raise exception 'Q3 t2_ai_kontekst: eski qator kontekstda'; end if;
  select (e->>'smeta')::numeric into x from jsonb_array_elements(public.t2_ai_umumiy(v_k)->'obyektlar') e where (e->>'id')::bigint = v_o;
  if x is distinct from 1100 then raise exception 'Q3 t2_ai_umumiy: smeta % (1100)', x; end if;
  select (e->'meta'->>'smeta')::numeric, (e->'meta'->>'narxsiz')::int into x, v_cnt
    from jsonb_array_elements(public.t2_mindmap_grafi(v_k)->'tugunlar') e where e->>'id' = 'obyekt:' || v_o;
  if x is distinct from 1100 or v_cnt <> 0 then raise exception 'Q3 t2_mindmap_grafi: obyekt tugunida smeta % / narxsiz % (1100 / 0)', x, v_cnt; end if;
  r := public.t2_agent_fakt_v1(v_a, v_k, array['smeta_pul','f2_fakt_pul'], v_o);
  if r::text not like '%"smeta_jami_som": 1100%' then raise exception 'Q3 t2_agent_fakt_v1: %', r->'obyekt_korsatkichlari'; end if;
  if r::text not like '%"f2_som": 400%' then raise exception 'Q4 t2_agent_fakt_v1: F2 tarixi yo''qoldi: %', r->'obyekt_korsatkichlari'; end if;
  r := public.t2_object_financials_v1(v_k, v_a, array[v_o]);
  if (r->'objects'->0->'smeta'->>'known')::numeric is distinct from 1100 then raise exception 'Q3 t2_object_financials_v1: smeta %', r->'objects'->0->'smeta'; end if;
  if (r->'objects'->0->'f2'->>'known')::numeric is distinct from 400 then raise exception 'Q4 t2_object_financials_v1: F2 %', r->'objects'->0->'f2'; end if;
  if (r->'objects'->0->'ostatka'->>'known')::numeric is distinct from 1100 then raise exception 'Q3 t2_object_financials_v1: ostatka % (1100; eski qator qoldig''i 0)', r->'objects'->0->'ostatka'; end if;
  r := public.t2_workbench_v1(v_o, v_a);
  select sum((l->>'baselineQuantity')::numeric * (l->>'baselineReferencePrice')::numeric), count(*) into x, v_cnt from jsonb_array_elements(r->'valuation'->'lines') l;
  if x is distinct from 1100 or v_cnt <> 3 then raise exception 'Q3 t2_workbench_v1: baseline % / % qator (1100 / 3)', x, v_cnt; end if;
  if not exists (select 1 from jsonb_array_elements(r->'valuation'->'periods') p, jsonb_array_elements(p->'lines') l where l->>'lineId' = v_r1::text and (l->>'quantity')::numeric = 4) then
    raise exception 'Q4 t2_workbench_v1: eski qatordagi F2 davri yo''q';
  end if;
  if (public.t2_rollup(v_o)->>'jami')::numeric is distinct from 1100 then raise exception 'Q3 t2_rollup: jami 1100 emas'; end if;
  if (public.t2_rollup(v_o)->>'narxsiz_qator')::int <> 0 then raise exception 'Q3 t2_rollup: eski narxsiz qator sanaldi'; end if;
  if exists (select 1 from public.t2_topilmaganlar where obyekt_id = v_o) then raise exception 'Q3 t2_topilmaganlar: eski narxsiz qator ko''rindi'; end if;
  if exists (select 1 from public.v_sklad_nomlar where nomi = 'ГИПС СИНОВ ЭСКИ') then raise exception 'Q3 v_sklad_nomlar: eski nom ko''rindi'; end if;
  if exists (select 1 from public.t2_narx_taklif where obyekt_id = v_o and qator_id in (v_r1, v_r2, v_gips)) then raise exception 'Q3 t2_narx_taklif: eski qator'; end if;
  if exists (select 1 from public.t2_narx_dalil_holat h join public.t2_qator q on q.id = h.qator_id where q.obyekt_id = v_o and q.versiya_holat <> 'faol') then raise exception 'Q3 t2_narx_dalil_holat: eski qator'; end if;
  if public.t2_resurs_qidir_v1(v_o, v_a, 'ГИПС СИНОВ ЭСКИ', null)::text like '%ГИПС СИНОВ ЭСКИ%' then raise exception 'Q3 t2_resurs_qidir_v1: eski qator topildi'; end if;
  if public.t2_ish_turi_qidir_v1(v_o, v_a, 'ИШ ИККИ СИНОВ')::text like '%ИШ ИККИ СИНОВ%' then raise exception 'Q3 t2_ish_turi_qidir_v1: eski ish topildi'; end if;
  if public.t2_agent_qidiruv_v1(v_a, v_k, array[]::text[], array['ГИПС СИНОВ ЭСКИ'], v_o)::text like '%ГИПС СИНОВ ЭСКИ%' then raise exception 'Q3 t2_agent_qidiruv_v1: eski qator topildi'; end if;
  perform public.t2_signal_refresh_object(v_k, v_o);
  if exists (select 1 from public.t2_signal s where s.kompaniya_id = v_k and s.manba = 't2_qator' and s.manba_id = v_gips::text and s.state = 'open') then
    raise exception 'Q3 t2_signal_refresh_object: eski qator uchun ochiq signal';
  end if;
  -- narxlash eski qatorga tegmaydi (const)
  perform public.t2_smeta_narxla_res_v3(v_k, v_a, v_o, gen_random_uuid(), jsonb_build_array(jsonb_build_object('nom','ГИПС СИНОВ ЭСКИ','birlik','КГ','narx',7)), true);
  if (select narx from public.t2_qator where id = v_gips) is not null then raise exception 'Q3 t2_smeta_narxla_res_v3: eski qator narxlandi'; end if;
  perform public.t2_narxla(v_o);
  select (q1.narx = 100 and q1.summa = 1000 and q1.hajm = 10 and q2.narx = 100 and q2.summa = 500 and q3.narx is null) into v_ok
    from public.t2_qator q1, public.t2_qator q2, public.t2_qator q3 where q1.id = v_r1 and q2.id = v_r2 and q3.id = v_gips;
  if not coalesce(v_ok, false) then raise exception 'Q3 t2_narxla: eski qator maydonlari o''zgardi'; end if;

  -- Q4: B o'quvchilar — F2 tarixi to'liq
  if (select sum(gorunish_summa) from public.t2_f2_tafsilot where obyekt_id = v_o and qator_id = v_r1) is distinct from 400 then raise exception 'Q4 t2_f2_tafsilot: 400 emas'; end if;
  if (select sum(jami_summa) from public.t2_f2_kat_oy where obyekt_id = v_o and tur = 'f2') is distinct from 400 then raise exception 'Q4 t2_f2_kat_oy: 400 emas'; end if;
  if (select f2_summa from public.t2_qator_holat where qator_id = v_r1) is distinct from 400 then raise exception 'Q4 t2_qator_holat: eski qator F2 400 emas'; end if;
  if (select versiya_holat from public.t2_qator_holat where qator_id = v_r1) <> 'almashtirilgan' then raise exception 'Q4 t2_qator_holat: versiya_holat ustuni'; end if;
  if (select count(*) from public.t2_qator_muhr_farq where obyekt_id = v_o and qator_id in (v_r1, v_r2) and holat = 'ozgargan') > 0 then raise exception 'Q4 t2_qator_muhr_farq: eski qator o''zgargan ko''rindi'; end if;

  raise notice 't2_versiya_tizim_darajasi_v1 acceptance: OK (obyekt %)', v_o;
end $acc$;
rollback;
