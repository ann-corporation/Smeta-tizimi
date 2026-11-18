-- Kontrakt: 20270111000000_t2_f2_portfel_tez_v1 (F2 portfeli: bitta tez so'rov, summa FAQAT yadrodan).
-- Asosiy tekshiruv: shartnoma portfeli jami == shartnomadagi har aktning O'Z summa paketi yig'indisi (tasdiqlangan va qoralama alohida);
-- bekor qilingan akt hech bir jamiga kirmaydi; qatorlar soni to'g'ri. Faqat O'QISH + sun'iy tenant ma'lumoti, oxirida ROLLBACK. Real summalar yo'q.
begin;

do $$
declare f text;
begin
  foreach f in array array['public.t2_f2_portfel_v1(bigint,bigint,bigint,bigint,date,date,text,integer,integer)', 'public.t2_f2_portfel_summa_v1(bigint,bigint,bigint[])'] loop
    if to_regprocedure(f) is null then raise exception 'missing %', f; end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then raise exception 'anon/authenticated must not execute %', f; end if;
    if not has_function_privilege('service_role', f, 'execute') then raise exception 'service_role must execute %', f; end if;
    if (select provolatile from pg_proc where oid = to_regprocedure(f)) <> 's' then raise exception '% must be stable (GET /api/sb)', f; end if;
  end loop;
end $$;

do $$
declare
  v_k bigint; v_a bigint; v_o1 bigint; v_o2 bigint; v_sh bigint; v_q1 bigint; v_q2 bigint;
  v_t1 bigint; v_t2 bigint; v_d1 bigint; v_b1 bigint; v_op uuid := gen_random_uuid();
  r jsonb; s jsonb; x jsonb; ids bigint[]; sm_t numeric := 0; sm_q numeric := 0; u_t numeric := 0; k numeric;
  o record; ot jsonb; oq jsonb; ak jsonb;
begin
  select a.kompaniya_id, a.foydalanuvchi_id into v_k, v_a from public.t2_azolik a where a.rol = 'boss' and a.holat = 'faol' order by a.id limit 1;
  if v_k is null then raise notice 'skip functional: no boss membership'; return; end if;

  insert into public.t2_obyekt(nom, kompaniya_id) values ('TEST-PORTFEL-O1', v_k) returning id into v_o1;
  insert into public.t2_obyekt(nom, kompaniya_id) values ('TEST-PORTFEL-O2', v_k) returning id into v_o2;
  insert into public.t2_shartnoma(kompaniya_id, raqam, nom, jami_nds_bilan, holat, kim) values (v_k, 'TEST-PF-' || v_op, 'test', 1000, 'faol', 'test') returning id into v_sh;
  insert into public.t2_shartnoma_bog(obyekt_id, shartnoma_id, holat) values (v_o1, v_sh, 'faol'), (v_o2, v_sh, 'faol');

  -- Har obyektda: blok + 3 qator (sun'iy sonlar)
  foreach k in array array[v_o1::numeric, v_o2::numeric] loop
    insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom) values (k::bigint, v_k, 'bl', 'blok') returning id into v_q1;
    insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kat, nom, birlik, hajm, narx, summa) values
      (k::bigint, v_k, v_q1, 'rs', 'ЧЕЛ', 'ish', 'ЧЕЛ.-Ч', 10, 10, 100),
      (k::bigint, v_k, v_q1, 'mat', 'МАТ', 'beton', 'м3', 3, 100, 300),
      (k::bigint, v_k, v_q1, 'ob', 'ОБ', 'nasos', 'шт', 1, 400, 400);
  end loop;

  -- O1: 2 tasdiqlangan (turli oy) + 1 qoralama + 1 bekor; O2: 1 tasdiqlangan
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, oy, holat, hujjat_jami, shartnoma_id, raqam) values (v_o1, v_k, 'f2', '2026-01-01', 'tasdiqlangan', 1, v_sh, 'P1') returning id into v_t1;
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, oy, holat, hujjat_jami, shartnoma_id, raqam) values (v_o1, v_k, 'f2', '2026-02-01', 'tasdiqlangan', 1, v_sh, 'P2') returning id into v_t2;
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, oy, holat, hujjat_jami, shartnoma_id, raqam) values (v_o1, v_k, 'f2', '2026-03-01', 'qoralama', 1, v_sh, 'P3') returning id into v_d1;
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, oy, holat, hujjat_jami, shartnoma_id, raqam) values (v_o1, v_k, 'f2', '2026-04-01', 'bekor', 1, v_sh, 'P4') returning id into v_b1;
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, oy, holat, hujjat_jami, shartnoma_id, raqam) values (v_o2, v_k, 'f2', '2026-01-01', 'tasdiqlangan', 1, v_sh, 'P5') returning id into v_q2;

  -- Aktlarga qator hajmlari: har akt turli ulush (sun'iy)
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx)
  select a.id, q.id, a.obyekt_id, v_k, q.hajm * a.ulush, q.narx
    from (values (v_t1, v_o1, 0.5), (v_t2, v_o1, 0.3), (v_d1, v_o1, 0.2), (v_b1, v_o1, 0.1), (v_q2, v_o2, 1.0)) a(id, obyekt_id, ulush)
    join public.t2_qator q on q.obyekt_id = a.obyekt_id and q.tur in ('rs', 'mat', 'ob');

  -- 1. Portfel (bitta so'rov)
  r := public.t2_f2_portfel_v1(v_k, v_a, v_sh, null, null, null, null, 200, 0);
  if r->>'ok' <> 'true' then raise exception 'portfel not ok: %', r; end if;
  if (r->'soni'->>'tasdiqlangan')::int <> 3 or (r->'soni'->>'qoralama')::int <> 1 or (r->'soni'->>'bekor')::int <> 1 or (r->'soni'->>'jami')::int <> 5 then
    raise exception 'soni noto''g''ri: %', r->'soni';
  end if;
  if jsonb_array_length(r->'aktlar') <> 5 or (r->'sahifa'->>'jami')::int <> 5 then raise exception 'aktlar soni: %', r->'sahifa'; end if;

  -- 2. Har akt O'Z paketi; bekor hisoblanmaydi
  ids := array[v_t1, v_t2, v_d1, v_b1, v_q2];
  s := public.t2_f2_portfel_summa_v1(v_k, v_a, ids);
  if jsonb_array_length(s->'aktlar') <> 4 then raise exception 'bekor akt hisoblanmasligi kerak: %', jsonb_array_length(s->'aktlar'); end if;
  for x in select value from jsonb_array_elements(s->'aktlar') loop
    if x->>'holat' = 'tasdiqlangan' then
      sm_t := sm_t + (x->'paket'->>'qqs_bilan')::numeric; u_t := u_t + (x->'paket'->>'ustamasiz')::numeric;
    else sm_q := sm_q + (x->'paket'->>'qqs_bilan')::numeric; end if;
  end loop;

  -- 3. ASOSIY: portfel jami == Σ akt paketlari (tasdiqlangan va qoralama alohida); hammasi = ikkalasi; bekor kirmaydi
  if abs((r->'jami'->'tasdiqlangan'->>'qqs_bilan')::numeric - sm_t) > 0.03 then
    raise exception 'tasdiqlangan jami % != Σakt %', r->'jami'->'tasdiqlangan'->>'qqs_bilan', sm_t;
  end if;
  if abs((r->'jami'->'tasdiqlangan'->>'ustamasiz')::numeric - u_t) > 0.03 then
    raise exception 'tasdiqlangan ustamasiz % != Σakt %', r->'jami'->'tasdiqlangan'->>'ustamasiz', u_t;
  end if;
  if abs((r->'jami'->'qoralama'->>'qqs_bilan')::numeric - sm_q) > 0.03 then
    raise exception 'qoralama jami % != Σakt %', r->'jami'->'qoralama'->>'qqs_bilan', sm_q;
  end if;
  if abs((r->'jami'->'hammasi'->>'qqs_bilan')::numeric - (sm_t + sm_q)) > 0.05 then
    raise exception 'hammasi % != tasdiq+qoralama %', r->'jami'->'hammasi'->>'qqs_bilan', sm_t + sm_q;
  end if;

  -- 4. Obyekt kesimi: yadroning o'z 'f2' paketi bilan bir xil
  for o in select value as v from jsonb_array_elements(r->'obyektlar') loop
    select p.paket into ot from public._t2_summa_paket_v1(array[(o.v->>'id')::bigint], 'f2') p;
    if abs((o.v->'f2'->>'qqs_bilan')::numeric - (ot->>'qqs_bilan')::numeric) > 0.01 then raise exception 'obyekt % f2 != yadro', o.v->>'id'; end if;
  end loop;

  -- 5. Filtr + sahifalash: holat=bekor faqat 1 qator; limit 2 -> yana_bor
  x := public.t2_f2_portfel_v1(v_k, v_a, v_sh, null, null, null, 'bekor', 200, 0);
  if jsonb_array_length(x->'aktlar') <> 1 then raise exception 'bekor filtr'; end if;
  x := public.t2_f2_portfel_v1(v_k, v_a, v_sh, null, '2026-01-01', '2026-01-31', null, 200, 0);
  if jsonb_array_length(x->'aktlar') <> 2 then raise exception 'oy filtr: %', jsonb_array_length(x->'aktlar'); end if;
  x := public.t2_f2_portfel_v1(v_k, v_a, v_sh, null, null, null, null, 2, 0);
  if jsonb_array_length(x->'aktlar') <> 2 or (x->'sahifa'->>'yana_bor') <> 'true' then raise exception 'sahifalash'; end if;
  x := public.t2_f2_portfel_v1(v_k, v_a, v_sh, v_o2, null, null, null, 200, 0);
  if jsonb_array_length(x->'aktlar') <> 1 then raise exception 'obyekt filtr'; end if;

  -- 6. Begona kompaniya shartnomasi ko'rinmaydi
  x := public.t2_f2_portfel_v1(v_k, v_a, -1, null, null, null, null, 200, 0);
  if x->>'code' <> 'SHARTNOMA_NOT_FOUND' then raise exception 'scope: %', x; end if;
end $$;

rollback;
