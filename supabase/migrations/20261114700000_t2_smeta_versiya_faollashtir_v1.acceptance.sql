-- Acceptance: 20261114700000 — smeta versiyasini faollashtirish. SINTETIK obyekt (real mijoz ma'lumoti yo'q).
-- BEGIN … ROLLBACK: hech narsa saqlanmaydi.
--   S0 migratsiyadan keyin barcha mavjud qatorlar 'faol'; F2 bog'liqsiz obyektlar jamisi o'zgarmagan (qator_soni = count).
--   S1 F2li obyektda faollashtirish → obyekt jami / ustama kategoriyasi = faqat yangi smeta.
--   S2 eski qator maydonlari va tasdiqlangan F2 summasi o'zgarmaydi; akt_qator eski qatorda qoladi.
--   S3 Nakopitelniy: smeta = yangi; bajarilgan (F2) bir marta; qoldiq = yangi − bajarilgan.
--   S4 almashtirilgan qatorga yangi akt_qator rad etiladi.
--   S5 moslik: kamaygan / ochirilgan / yangi; versiya 'tayyor'; takror chaqiriq — idempotent.
begin;
do $acc$
declare
  v_k bigint; v_a bigint; v_o bigint; v_rz bigint; v_b1 bigint; v_r1 bigint; v_b2 bigint; v_r2 bigint; v_akt bigint;
  r jsonb; r2 jsonb; n jsonb; v_jami numeric; v_cnt int; v_op uuid := gen_random_uuid(); v_ok boolean;
begin
  if exists (select 1 from public.t2_qator where versiya_holat <> 'faol') then
    raise notice 'S0: almashtirilgan qatorlar allaqachon bor (migratsiya oldin qo''llangan) — S0 o''tkazib yuborildi';
  end if;
  if exists (
    select 1 from (select o.id from public.t2_obyekt o order by o.id desc limit 25) s
    join public.t2_obyekt_jami j on j.id = s.id
    where j.qator_soni <> (select count(*) from public.t2_qator q where q.obyekt_id = s.id and q.versiya_holat = 'faol')
  ) then raise exception 'S0: obyekt jami qator soni faol qatorlar soniga teng emas'; end if;

  select f.id into v_a from public.t2_foydalanuvchi f where f.holat = 'faol' and public.t2_platforma_superadmin(f.id) order by f.id limit 1;
  select k.id into v_k from public.t2_kompaniya k where k.faol order by k.id desc limit 1;
  if v_a is null or v_k is null then raise notice 'superadmin aktor yoki faol kompaniya yo''q — funksional tekshiruv o''tkazib yuborildi'; return; end if;

  -- Eski smeta: rz → bl E1 (10) → rs ЦЕМЕНТ 1000; bl E2 (5) → rs ГВОЗДИ 500. Jami 1500.
  insert into public.t2_obyekt (nom, kompaniya_id) values ('SINOV versiya faollashtir', v_k) returning id into v_o;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, tartib) values (v_o, v_k, 'rz', 'РАЗДЕЛ ЭСКИ', 1) returning id into v_rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, tartib, daraja) values (v_o, v_k, v_rz, 'bl', 'E1-1', 'ИШ БИР', 'М3', 10, 2, 1) returning id into v_b1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, norma, kat, tartib, daraja) values (v_o, v_k, v_b1, 'rs', 'C1', 'ЦЕМЕНТ СИНОВ', 'Т', 10, 100, 1000, 1, 'МАТ', 3, 2) returning id into v_r1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, tartib, daraja) values (v_o, v_k, v_rz, 'bl', 'E2-2', 'ИШ ИККИ', 'М2', 5, 4, 1) returning id into v_b2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, norma, kat, tartib, daraja) values (v_o, v_k, v_b2, 'rs', 'C2', 'ГВОЗДИ СИНОВ', 'КГ', 5, 100, 500, 1, 'МАТ', 5, 2) returning id into v_r2;
  perform public.t2_rollup(v_o);
  select jami into v_jami from public.t2_obyekt_jami where id = v_o;
  if v_jami is distinct from 1500 then raise exception 'seed: eski jami % (1500 kutilgan)', v_jami; end if;

  -- Tasdiqlangan F2: ЦЕМЕНТ 4 × 100 = 400.
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, oy, holat) values (v_o, v_k, 'f2', date_trunc('month', now())::date, 'qoralama') returning id into v_akt;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, hajm, narx) values (v_akt, v_r1, v_o, 4, 100);
  update public.t2_akt set holat = 'tasdiqlangan' where id = v_akt;

  -- S1: faollashtirish — yangi smeta: rz → bl E1 (8) → rs ЦЕМЕНТ 800; bl E3 → rs ПЕСОК 300. Jami 1100.
  r := public.t2_smeta_versiya_faollashtir_v1(v_k, v_a, v_o, jsonb_build_array(
    jsonb_build_object('local_id','rz','tur','rz','nom','ЭКСПЕРТИЗА'),
    jsonb_build_object('local_id','b1','parent_local_id','rz','tur','bl','kod','E1-1','nom','ИШ БИР','birlik','М3','hajm','8'),
    jsonb_build_object('local_id','r1','parent_local_id','b1','tur','rs','kod','C1','nom','ЦЕМЕНТ СИНОВ','birlik','Т','hajm','8','narx','100','summa','800','norma','1'),
    jsonb_build_object('local_id','b3','parent_local_id','rz','tur','bl','kod','E3-3','nom','ИШ УЧ','birlik','М3','hajm','3'),
    jsonb_build_object('local_id','r3','parent_local_id','b3','tur','rs','kod','C3','nom','ПЕСОК СИНОВ','birlik','М3','hajm','3','narx','100','summa','300','norma','1')
  ), jsonb_build_object('nom','SINOV ekspertiza'), v_op);
  if coalesce(r->>'ok','') <> 'true' then raise exception 'S1: faollashtirilmadi: %', r; end if;
  select jami into v_jami from public.t2_obyekt_jami where id = v_o;
  if v_jami is distinct from 1100 then raise exception 'S1: obyekt jami % (1100 kutilgan)', v_jami; end if;
  select mat into v_jami from public.t2_obyekt_nakrutka where obyekt_id = v_o;
  if v_jami is distinct from 1100 then raise exception 'S1: ustama MAT bazasi % (1100 kutilgan)', v_jami; end if;
  if (select count(*) from public.t2_qator where obyekt_id = v_o and versiya_holat = 'almashtirilgan') <> 5 then raise exception 'S1: eski 5 qator almashtirilgan emas'; end if;
  if (select count(*) from public.t2_daraxt where obyekt_id = v_o) <> 5 then raise exception 'S1: smeta daraxti faqat yangi 5 qatorni ko''rsatmayapti'; end if;

  -- S2: eski qator va F2 o'zgarmagan.
  select (hajm = 10 and summa = 1000 and narx = 100 and nom = 'ЦЕМЕНТ СИНОВ') into v_ok from public.t2_qator where id = v_r1;
  if not v_ok then raise exception 'S2: eski qator maydonlari o''zgardi'; end if;
  if (select sum(summa) from public.t2_akt_qator where akt_id = v_akt and qator_id = v_r1) is distinct from 400 then raise exception 'S2: F2 summasi o''zgardi'; end if;

  -- S3: Nakopitelniy.
  n := public.t2_nakopitelniy_v2(v_o, v_a, null, 500, true, 0);
  if (n->'jami'->>'smeta_summa')::numeric is distinct from 1100 then raise exception 'S3: smeta_summa % (1100)', n->'jami'->>'smeta_summa'; end if;
  if (n->'jami'->>'jami_tasdiqlangan_summa')::numeric is distinct from 400 then raise exception 'S3: bajarilgan % (400, bir marta)', n->'jami'->>'jami_tasdiqlangan_summa'; end if;
  if (n->'jami'->>'qoldiq_summa')::numeric is distinct from 700 then raise exception 'S3: qoldiq % (700)', n->'jami'->>'qoldiq_summa'; end if;
  select count(*) into v_cnt from jsonb_array_elements(n->'qatorlar') x
   where (x->>'qator_id')::bigint = v_r1 and x->>'versiya_holat' = 'almashtirilgan' and (x->>'qoldiq_summa')::numeric = 0 and (x->>'jami_summa')::numeric = 400;
  if v_cnt <> 1 then raise exception 'S3: eski F2li qator Nakopitelniy ro''yxatida (qoldiq 0, bajarilgan 400) yo''q'; end if;

  -- S4: almashtirilgan qatorga yangi akt_qator yo'q.
  begin
    insert into public.t2_akt (obyekt_id, kompaniya_id, tur, oy) values (v_o, v_k, 'fakt', date_trunc('month', now())::date) returning id into v_akt;
    insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, hajm) values (v_akt, v_r2, v_o, 1);
    raise exception 'S4: almashtirilgan qatorga akt_qator yozildi';
  exception when others then
    if sqlerrm not like 'QATOR_ALMASHTIRILGAN%' then raise; end if;
  end;

  -- S5: moslik va idempotentlik.
  if (r->'moslik'->>'kamaygan')::int is distinct from 1 or (r->'moslik'->>'ochirilgan')::int is distinct from 1 or (r->'moslik'->>'yangi')::int is distinct from 1 then
    raise exception 'S5: moslik %', r->'moslik';
  end if;
  if (select holat from public.t2_smeta_versiya where id = (r->>'almashtirilgan_versiya_id')::bigint) <> 'tayyor' then raise exception 'S5: versiya tayyor emas'; end if;
  r2 := public.t2_smeta_versiya_faollashtir_v1(v_k, v_a, v_o, '[]'::jsonb, '{}'::jsonb, v_op);
  if coalesce(r2->>'takror','') <> 'true' then raise exception 'S5: takror chaqiriq idempotent emas: %', r2; end if;
  if (select count(*) from public.t2_qator where obyekt_id = v_o) <> 10 then raise exception 'S5: qatorlar soni 10 emas'; end if;

  raise notice 't2_smeta_versiya_faollashtir_v1 acceptance: OK';
end $acc$;
rollback;
