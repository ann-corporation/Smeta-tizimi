-- Acceptance: 20261112700000 — qator muhri (SMETA CONST). SINTETIK obyekt va qatorlar (real mijoz ma'lumoti yo'q).
-- BEGIN … ROLLBACK: hech narsa saqlanmaydi.
-- Ssenariylar (egasi 2026-10-27: «bir vergul qo'shilsa ham o'zgargan pozitsiya aniq bo'lishi kerak»):
--   S1 kanonik shakl: vergul / registr / NULL≠0 — farq; ortiqcha probel, NBSP, 2.4210 = 2.421 — farq EMAS.
--   S2 muhr olish: ekspertizagacha shoxi belgilanadi; takror chaqiriq hech narsa qo'shmaydi (idempotent).
--   S3 asl qatorga vergul qo'shildi → «ozgargan», maydonlar {nom}, avval/endi; faqat probel o'zgarsa — farq yo'q.
--   S4 narx NULL → qiymat → «narx qo'yildi» (faqat_narx_qoyildi); hajm 0 → NULL — farq (NULL ≠ 0).
--   S5 yangi qator → «muhrsiz»; o'chirilgan qator → «ochirilgan»; import muhri o'chganini yopadi.
--   S6 const: muhrni UPDATE/DELETE rad etiladi; faqat bir marta yopish mumkin.
--   S7 butun jadval: saqlangan qiymatlardan qayta hisoblangan muhr = saqlangan muhr; anon/authenticated kirishi yo'q.
begin;
do $acc$
declare
  v_k bigint; v_o bigint; v_rz bigint; v_bl bigint; v_rs bigint; v_bl2 bigint; v_yangi bigint; r jsonb; f record; v_n int; v_ok boolean;
begin
  select k.id into v_k from public.t2_kompaniya k order by k.id desc limit 1;
  if v_k is null then raise notice 'kompaniya yo''q — tekshiruv o''tkazib yuborildi'; return; end if;

  -- S1: kanonik shakl.
  if (public.t2_qator_muhr_hisob('bl','E1','ИШ А, Б','М3',null,1,10,null,null))[1] = (public.t2_qator_muhr_hisob('bl','E1','ИШ А Б','М3',null,1,10,null,null))[1]
    then raise exception 'S1: vergul farq deb topilmadi'; end if;
  if (public.t2_qator_muhr_hisob('bl','E1','иш а','М3',null,1,10,null,null))[1] = (public.t2_qator_muhr_hisob('bl','E1','ИШ А','М3',null,1,10,null,null))[1]
    then raise exception 'S1: registr farq deb topilmadi'; end if;
  if (public.t2_qator_muhr_hisob('bl','E1','ИШ А','М3',null,1,0,null,null))[1] = (public.t2_qator_muhr_hisob('bl','E1','ИШ А','М3',null,1,null,null,null))[1]
    then raise exception 'S1: NULL = 0 bo''lib qoldi'; end if;
  if (public.t2_qator_muhr_hisob('bl',' E1 ','ИШ  А' || chr(160),'М3',null,1,2.4210,null,null))[1] <> (public.t2_qator_muhr_hisob('bl','E1','ИШ А','М3',null,1,2.421,null,null))[1]
    then raise exception 'S1: probel / NBSP / 2.4210 farq deb topildi'; end if;
  if (public.t2_qator_muhr_hisob('bl','E1','A','М3',null,1,1,null,null))[1] = (public.t2_qator_muhr_hisob('bl','E1','A','М3',null,2,1,null,null))[1]
    then raise exception 'S1: ota farq deb topilmadi'; end if;

  -- Sintetik obyekt: rz «(ekspertizagacha)» → bl → rs; ikkinchi bl oddiy bo'limda.
  insert into public.t2_obyekt (nom, kompaniya_id) values ('SINOV muhr', v_k) returning id into v_o;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom) values (v_o, v_k, 'rz', 'РАЗДЕЛ: СИНОВ (ekspertizagacha)') returning id into v_rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx) values (v_o, v_k, v_rz, 'bl', 'E1-1-1', 'ИШ А', 'М3', 0, null) returning id into v_bl;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, norma, kat) values (v_o, v_k, v_bl, 'rs', 'C1', 'ЦЕМЕНТ', 'Т', 2, null, 0.5, 'МАТ') returning id into v_rs;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm) values (v_o, v_k, 'bl', 'E2-2-2', 'ИШ  Б', 'М2', 7) returning id into v_bl2;

  -- S2: muhr olish + idempotentlik + ekspertizagacha.
  r := public.t2_qator_muhr_ol_v1(v_o, 'qolda', null);
  if r->>'ok' <> 'true' or (r->>'muhrlandi')::int <> 4 then raise exception 'S2: muhr olinmadi: %', r; end if;
  r := public.t2_qator_muhr_ol_v1(v_o, 'qolda', null);
  if (r->>'muhrlandi')::int <> 0 then raise exception 'S2: takror chaqiriq qo''shdi: %', r; end if;
  if public.t2_qator_muhr_ol_v1(v_o, 'boshqa', null)->>'code' <> 'MANBA_INVALID' then raise exception 'S2: noto''g''ri manba o''tdi'; end if;
  select count(*) into v_n from public.t2_qator_muhr where obyekt_id = v_o and ekspertizagacha;
  if v_n <> 3 then raise exception 'S2: ekspertizagacha shoxi 3 emas: %', v_n; end if;
  if (select nom from public.t2_qator_muhr where qator_id = v_bl2) <> 'ИШ Б' then raise exception 'S2: nom normallashtirilmagan'; end if;
  if exists (select 1 from public.t2_qator_muhr_farq where obyekt_id = v_o) then raise exception 'S2: yangi muhrdan keyin farq bor'; end if;

  -- S3: vergul → o'zgargan; faqat probel → farq yo'q.
  update public.t2_qator set nom = 'ИШ А,' where id = v_bl;
  update public.t2_qator set nom = ' ИШ   Б ' where id = v_bl2;
  select * into f from public.t2_qator_muhr_farq where qator_id = v_bl;
  if f.holat is distinct from 'ozgargan' or f.maydonlar <> array['nom'] or f.avval->>'nom' <> 'ИШ А' or f.endi->>'nom' <> 'ИШ А,' then
    raise exception 'S3: vergul: %', row_to_json(f); end if;
  if f.ekspertizagacha is not true then raise exception 'S3: ekspertizagacha belgisi yo''q'; end if;
  if exists (select 1 from public.t2_qator_muhr_farq where qator_id = v_bl2) then raise exception 'S3: faqat probel o''zgarishi farq deb chiqdi'; end if;

  -- S4: narx NULL → qiymat (narx qo'yildi); hajm 0 → NULL (farq).
  update public.t2_qator set narx = 1500 where id = v_rs;
  select * into f from public.t2_qator_muhr_farq where qator_id = v_rs;
  if f.holat is distinct from 'ozgargan' or f.faqat_narx_qoyildi is not true or f.avval->'narx' <> 'null'::jsonb or (f.endi->>'narx')::numeric <> 1500 then
    raise exception 'S4: narx qo''yildi: %', row_to_json(f); end if;
  update public.t2_qator set hajm = null where id = v_bl;
  select * into f from public.t2_qator_muhr_farq where qator_id = v_bl;
  if not (f.maydonlar @> array['hajm']) or (f.avval->>'hajm')::numeric <> 0 or f.endi->'hajm' <> 'null'::jsonb then
    raise exception 'S4: hajm 0 → NULL farq emas: %', row_to_json(f); end if;

  -- S5: yangi qator → muhrsiz; o'chirilgan → ochirilgan; import uni yopadi.
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, hajm) values (v_o, v_k, v_bl, 'rs', 'ЯНГИ', 'Т', 1) returning id into v_yangi;
  if (select holat from public.t2_qator_muhr_farq where qator_id = v_yangi) is distinct from 'muhrsiz' then raise exception 'S5: muhrsiz chiqmadi'; end if;
  delete from public.t2_qator where id = v_rs;
  select * into f from public.t2_qator_muhr_farq where qator_id = v_rs;
  if f.holat is distinct from 'ochirilgan' or f.nom <> 'ЦЕМЕНТ' then raise exception 'S5: ochirilgan: %', row_to_json(f); end if;
  r := public.t2_qator_muhr_ol_v1(v_o, 'import', null);
  if (r->>'yopildi')::int <> 1 or (r->>'muhrlandi')::int <> 1 then raise exception 'S5: import muhri: %', r; end if;
  if exists (select 1 from public.t2_qator_muhr_farq where qator_id in (v_rs, v_yangi)) then raise exception 'S5: yopilgan/yangi muhr farqda qoldi'; end if;

  -- S6: const qo'riqchisi.
  v_ok := false;
  begin update public.t2_qator_muhr set nom = 'BUZILGAN' where qator_id = v_bl; exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'S6: muhr UPDATE o''tdi'; end if;
  v_ok := false;
  begin delete from public.t2_qator_muhr where qator_id = v_bl; exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'S6: muhr DELETE o''tdi'; end if;
  update public.t2_qator_muhr set yopildi = now(), yopilish_sabab = 'sinov' where qator_id = v_bl2;
  v_ok := false;
  begin update public.t2_qator_muhr set yopilish_sabab = 'qayta' where qator_id = v_bl2; exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'S6: yopilgan muhr qayta o''zgardi'; end if;

  -- S7: butun jadval yaxlitligi va ruxsatlar.
  select count(*) into v_n from public.t2_qator_muhr
   where muhr <> (public.t2_qator_muhr_hisob(tur, kod, nom, birlik, kat, ota_id, hajm, narx, norma))[1];
  if v_n > 0 then raise exception 'S7: % ta muhr saqlangan qiymatlarga mos emas', v_n; end if;
  if has_table_privilege('anon', 'public.t2_qator_muhr', 'select') or has_table_privilege('authenticated', 'public.t2_qator_muhr_farq', 'select')
     or has_function_privilege('anon', 'public.t2_qator_muhr_ol_v1(bigint, text, bigint)', 'execute') then
    raise exception 'S7: anon/authenticated kirishi bor'; end if;

  raise notice 'ACCEPTANCE OK: 20261112700000 qator muhri';
end $acc$;
rollback;
