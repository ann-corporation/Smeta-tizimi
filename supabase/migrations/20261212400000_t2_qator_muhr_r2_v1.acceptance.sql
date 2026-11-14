-- Acceptance: 20261212400000 — t2_qator_muhr yuklamasi R2 ga (SAQLASH DIETASI). SINTETIK obyekt va qatorlar (real mijoz ma'lumoti yo'q).
-- BEGIN ... ROLLBACK: hech narsa saqlanmaydi. R2 o'rniga matn o'zgaruvchida saqlanadi (R2 ga yoz/o'qi — TS testlarida, fake R2).
-- Ssenariylar:
--   S1 sovutish tartibi: tasdiqsiz sovut rad etiladi; yoz -> tasdiq -> sovut; yuklama NULL, xom_xesh to'ladi; takror sovut = 0 (idempotent).
--   S2 view: o'zgarmagan sovuq qator ko'rinmaydi; faqat probel farqi (normallashtirilgan teng) farq EMAS.
--   S3 sovuq qator keyin o'zgardi -> 'ozgargan' (sovuq=true, avval bo'sh); isitish nomzodi topiladi.
--   S4 isitish: buzilgan matn rad etiladi; to'g'ri matn qatorni qaytaradi, view avval/endi ni to'liq beradi.
--   S5 const: issiq qatorni UPDATE/DELETE rad; tasdiqsiz/begona qatorni sovutish rad; noto'g'ri qiymat bilan isitish rad.
--   S6 sovuq qator o'chirilsa -> 'ochirilgan'; import yopadi; sovuq qatorni bir marta yopish mumkin.
--   S7 yaxlitlik: barcha issiq qatorda muhr = hisob(qiymat); sovuq qatorda yuklama yo'q; anon/authenticated kirishi yo'q.
begin;
do $acc$
declare
  v_k bigint; v_o bigint; v_a bigint; v_b bigint; v_c bigint; v_d bigint;
  v_idlar bigint[]; v_matn text; v_sha text; v_key text; v_e bigint; v_bayt bigint; v_n int; v_ok boolean; f record; r jsonb; v_mid bigint; v_adim text := 'S0 boshlash';
begin
  select k.id into v_k from public.t2_kompaniya k order by k.id desc limit 1;
  if v_k is null then raise notice 'kompaniya yo''q — tekshiruv o''tkazib yuborildi'; return; end if;

  v_adim := 'S0a seed t2_obyekt';
  insert into public.t2_obyekt (nom, kompaniya_id) values ('SINOV muhr-r2', v_k) returning id into v_o;
  v_adim := 'S0b seed t2_qator rz';
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom) values (v_o, v_k, 'rz', 'RAZDEL SINOV') returning id into v_a;
  v_adim := 'S0c seed t2_qator bl';
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx) values (v_o, v_k, v_a, 'bl', 'S1-1', 'ISH A', 'M3', 5, 100) returning id into v_b;
  v_adim := 'S0d seed t2_qator rs (kat kirill)';
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, norma, kat) values (v_o, v_k, v_b, 'rs', 'C1', 'TSEMENT', 'T', 2, null, 0.5, U&'\041C\0410\0422') returning id into v_c;   -- kat = MAT kirillcha (t2_qator_kat_check; kirill faqat U& escape bilan)
  v_adim := 'S0e seed t2_qator bl (2)';
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm) values (v_o, v_k, 'bl', 'S2-2', 'ISH B', 'M2', 7) returning id into v_d;
  v_adim := 'S0f t2_qator_muhr_ol_v1(qolda)';
  r := public.t2_qator_muhr_ol_v1(v_o, 'qolda', null);
  if r->>'ok' <> 'true' or (r->>'muhrlandi')::int <> 4 then raise exception 'S0: muhr olinmadi: %', r; end if;

  -- S1: sovutish tartibi.
  v_adim := 'S1a nomzod/oqi';
  if not exists (select 1 from public.t2_qator_muhr_sovuq_nomzod_v1(0, 1000) n where n.obyekt_id = v_o and n.qator_soni = 4) then raise exception 'S1: nomzod topilmadi'; end if;
  select o.idlar, o.matn into v_idlar, v_matn from public.t2_qator_muhr_sovuq_oqi_v1(v_o, 0, 3000) o;
  if cardinality(v_idlar) <> 4 then raise exception 'S1: oqi % qator', cardinality(v_idlar); end if;
  v_sha := encode(sha256(convert_to(v_matn, 'UTF8')), 'hex');
  v_key := 'muhr-cold/v1/' || substr(v_sha, 1, 2) || '/' || v_sha || '.json.gz';
  v_adim := 'S1b yoz (notogri sha rad, togri sha idempotent)';
  v_ok := false;
  begin perform public.t2_qator_muhr_sovuq_yoz_v1(v_o, v_idlar, repeat('0', 64), 'muhr-cold/v1/00/' || repeat('0', 64) || '.json.gz', 100); exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'S1: noto''g''ri sha256 bilan yoz o''tdi'; end if;
  v_e := public.t2_qator_muhr_sovuq_yoz_v1(v_o, v_idlar, v_sha, v_key, 500);
  if public.t2_qator_muhr_sovuq_yoz_v1(v_o, v_idlar, v_sha, v_key, 500) <> v_e then raise exception 'S1: yoz idempotent emas'; end if;
  v_adim := 'S1c sovut (tasdiqsiz rad, tasdiq, sovut, idempotent)';
  v_ok := false;
  begin perform public.t2_qator_muhr_sovuq_sovut_v1(v_e, v_sha); exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'S1: tasdiqsiz sovut o''tdi'; end if;
  perform public.t2_qator_muhr_sovuq_tasdiq_v1(v_e, v_sha);
  v_bayt := public.t2_qator_muhr_sovuq_sovut_v1(v_e, v_sha);
  if v_bayt <= 0 then raise exception 'S1: bo''shagan bayt % ', v_bayt; end if;
  if public.t2_qator_muhr_sovuq_sovut_v1(v_e, v_sha) <> 0 then raise exception 'S1: takror sovut 0 emas'; end if;
  select count(*) into v_n from public.t2_qator_muhr where qator_id in (v_a, v_b, v_c, v_d) and sovuq_id = v_e and xom_xesh is not null
     and tur is null and kod is null and nom is null and birlik is null and kat is null and ota_id is null and hajm is null and narx is null and norma is null;
  if v_n <> 4 then raise exception 'S1: sovuq qatorlar % / 4', v_n; end if;

  v_adim := 'S2 view/isit nomzod: probel farqi';
  -- S2: o'zgarmagan sovuq qator ko'rinmaydi; faqat probel farqi — farq emas.
  update public.t2_qator set nom = 'ISH B ' where id = v_d;   -- xom farq, normallashtirilgan teng
  if exists (select 1 from public.t2_qator_muhr_farq where obyekt_id = v_o) then raise exception 'S2: o''zgarmagan sovuq qator view da: %', (select row_to_json(x) from public.t2_qator_muhr_farq x where obyekt_id = v_o limit 1); end if;
  if exists (select 1 from public.t2_qator_muhr_isit_nomzod_v1(v_o, 50)) then raise exception 'S2: probel farqi isitish nomzodi bo''ldi'; end if;

  v_adim := 'S3 sovuq qator ozgardi';
  -- S3: sovuq qator keyin haqiqatan o'zgardi.
  update public.t2_qator set nom = 'ISH A, TUZATILDI' where id = v_b;
  select * into f from public.t2_qator_muhr_farq where qator_id = v_b;
  if f.holat is distinct from 'ozgargan' or f.sovuq is not true or cardinality(f.maydonlar) <> 0 then raise exception 'S3: sovuq o''zgargan: %', row_to_json(f); end if;
  if not exists (select 1 from public.t2_qator_muhr_isit_nomzod_v1(v_o, 50) n where n.sovuq_id = v_e and n.idlar = array[(select id from public.t2_qator_muhr where qator_id = v_b)]) then
    raise exception 'S3: isitish nomzodi topilmadi'; end if;

  v_adim := 'S4 isitish';
  -- S4: isitish. Buzilgan matn rad; to'g'ri matn — avval/endi to'liq.
  select id into v_mid from public.t2_qator_muhr where qator_id = v_b;
  v_ok := false;
  begin perform public.t2_qator_muhr_isit_v1(v_e, replace(v_matn, 'ISH A', 'ISH Z'), v_sha, array[v_mid]); exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'S4: buzilgan matn bilan isitish o''tdi'; end if;
  if public.t2_qator_muhr_isit_v1(v_e, v_matn, v_sha, array[v_mid]) <> 1 then raise exception 'S4: isitilgan qator soni <> 1'; end if;
  select * into f from public.t2_qator_muhr_farq where qator_id = v_b;
  if f.holat is distinct from 'ozgargan' or f.maydonlar <> array['nom'] or f.avval->>'nom' <> 'ISH A' or f.endi->>'nom' <> 'ISH A, TUZATILDI' or f.sovuq is not false then
    raise exception 'S4: isitilgandan keyin view: %', row_to_json(f); end if;
  if public.t2_qator_muhr_isit_v1(v_e, v_matn, v_sha, array[v_mid]) <> 0 then raise exception 'S4: takror isitish 0 emas'; end if;

  v_adim := 'S5 const';
  v_ok := false;
  begin update public.t2_qator_muhr set nom = 'BUZILGAN' where qator_id = v_b; exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'S5: issiq muhr UPDATE o''tdi'; end if;
  v_ok := false;
  begin delete from public.t2_qator_muhr where qator_id = v_b; exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'S5: muhr DELETE o''tdi'; end if;
  v_ok := false;   -- sovuq qatorni noto'g'ri qiymat bilan isitish (xesh mos emas)
  begin update public.t2_qator_muhr set nom = 'BOSHQA', sovuq_id = null, xom_xesh = null where qator_id = v_c; exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'S5: noto''g''ri qiymat bilan isitish o''tdi'; end if;
  v_ok := false;   -- issiq qatorni qo'lda sovutish (R2 ko'rsatkichi uni qamramaydi: v_b isitilgan, idlar da bor — lekin yuklama NULL emas)
  begin update public.t2_qator_muhr set sovuq_id = v_e where qator_id = v_b; exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'S5: yuklamasiz qo''lda sovutish o''tdi'; end if;
  v_ok := false;   -- ko'rsatkichni o'chirish / o'zgartirish
  begin delete from public.t2_qator_muhr_sovuq where id = v_e; exception when check_violation or foreign_key_violation then v_ok := true; end;
  if not v_ok then raise exception 'S5: ko''rsatkich DELETE o''tdi'; end if;

  v_adim := 'S6 ochirish/import/yopish';
  -- S6: sovuq qator o'chirilsa -> 'ochirilgan'; import yopadi; bir marta yopish.
  delete from public.t2_qator where id = v_c;
  select * into f from public.t2_qator_muhr_farq where qator_id = v_c;
  if f.holat is distinct from 'ochirilgan' or f.sovuq is not true then raise exception 'S6: ochirilgan: %', row_to_json(f); end if;
  r := public.t2_qator_muhr_ol_v1(v_o, 'import', null);
  if (r->>'yopildi')::int <> 1 then raise exception 'S6: import muhri: %', r; end if;
  if exists (select 1 from public.t2_qator_muhr_farq where qator_id = v_c) then raise exception 'S6: yopilgan sovuq muhr farqda qoldi'; end if;
  update public.t2_qator_muhr set yopildi = now(), yopilish_sabab = 'sinov' where qator_id = v_a;   -- sovuq qatorni yopish
  v_ok := false;
  begin update public.t2_qator_muhr set yopilish_sabab = 'qayta' where qator_id = v_a; exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'S6: yopilgan sovuq muhr qayta o''zgardi'; end if;

  v_adim := 'S7 yaxlitlik/ruxsat';
  -- S7: yaxlitlik va ruxsatlar.
  select count(*) into v_n from public.t2_qator_muhr
   where sovuq_id is null and muhr <> (public.t2_qator_muhr_hisob(tur, kod, nom, birlik, kat, ota_id, hajm, narx, norma))[1];
  if v_n > 0 then raise exception 'S7: % ta issiq muhr saqlangan qiymatlarga mos emas', v_n; end if;
  select count(*) into v_n from public.t2_qator_muhr where sovuq_id is not null and (tur is not null or kod is not null or nom is not null or hajm is not null or narx is not null or norma is not null);
  if v_n > 0 then raise exception 'S7: % ta sovuq qatorda yuklama qolgan', v_n; end if;
  if has_table_privilege('anon', 'public.t2_qator_muhr_sovuq', 'select') or has_table_privilege('authenticated', 'public.t2_qator_muhr_sovuq', 'select')
     or has_function_privilege('anon', 'public.t2_qator_muhr_isit_v1(bigint, text, text, bigint[])', 'execute')
     or has_function_privilege('authenticated', 'public.t2_qator_muhr_sovuq_sovut_v1(bigint, text)', 'execute') then
    raise exception 'S7: anon/authenticated kirishi bor'; end if;
  if (public.t2_qator_muhr_sovuq_statistika_v1()->>'sovuq_qator')::int < 1 then raise exception 'S7: statistika'; end if;

  raise notice 'ACCEPTANCE OK: 20261212400000 muhr R2';
exception when others then
  -- qaysi qadamda yiqilgani ko'rinsin
  raise exception 'ACCEPT[%] %  (SQLSTATE %)', v_adim, sqlerrm, sqlstate;
end $acc$;
rollback;
