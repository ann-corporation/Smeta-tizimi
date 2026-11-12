-- Acceptance: usta qisman «Bajardim» (sintetik seed, oxirida ROLLBACK).
begin;
set local statement_timeout = '300s';

do $$
declare
  v_k bigint := 990100001; v_o bigint := 990100002; v_usta bigint := 990100004; v_prorab bigint := 990100005; v_n bigint := 990100006; v_q1 bigint := 990100007; v_q2 bigint := 990100008;
  v_op1 uuid := gen_random_uuid(); v_op2 uuid := gen_random_uuid(); v_op3 uuid := gen_random_uuid(); v_r jsonb; v_h text; v_ver int; v_b1 numeric; v_b2 numeric; v_iz text;
begin
  insert into public.t2_foydalanuvchi (id, login) overriding system value values (v_usta, 'acc_nu_990100004'), (v_prorab, 'acc_np_990100005');
  insert into public.t2_kompaniya (id, nom, kod) overriding system value values (v_k, 'ACC Naryad', 'ACCN990100001');
  insert into public.t2_azolik (id, foydalanuvchi_id, kompaniya_id, rol) overriding system value values (990100009, v_usta, v_k, 'usta'), (990100010, v_prorab, v_k, 'prorab');
  insert into public.t2_obyekt (id, nom, kompaniya_id) overriding system value values (v_o, 'ACC Obyekt', v_k);
  insert into public.t2_naryad (id, kompaniya_id, obyekt_id, raqam, usta_nom, usta_foydalanuvchi_id) overriding system value values (v_n, v_k, v_o, 'ACC-1', 'Usta', v_usta);
  insert into public.t2_naryad_qator (id, kompaniya_id, naryad_id, tartib, nom, hajm) overriding system value values (v_q1, v_k, v_n, 1, 'A', 10), (v_q2, v_k, v_n, 2, 'B', 20);

  -- 1) bitta qator qisman: ikkinchisi tegilmaydi, naryad 'berildi' qoladi, xato yo'q, izoh saqlanadi
  v_r := public.t2_naryad_usta_bajarildi_v1(v_k, v_usta, v_op1, v_n, 1, jsonb_build_array(jsonb_build_object('id', v_q1, 'bajarilgan_hajm', 4)), false, 'ertalab quyildi');
  if (v_r->>'ok')::boolean is not true or (v_r->>'toliq')::boolean then raise exception 'ACC1: qisman noto''g''ri: %', v_r; end if;
  select holat, versiya, usta_izoh into v_h, v_ver, v_iz from public.t2_naryad where id = v_n;
  select bajarilgan_hajm into v_b1 from public.t2_naryad_qator where id = v_q1;
  select bajarilgan_hajm into v_b2 from public.t2_naryad_qator where id = v_q2;
  if v_h <> 'berildi' or v_ver <> 2 or v_b1 <> 4 or v_b2 is not null or v_iz <> 'ertalab quyildi' then raise exception 'ACC1: holat/versiya/hajm/izoh: % % % % %', v_h, v_ver, v_b1, v_b2, v_iz; end if;

  -- 2) takror (bir xil operation_id) — ikkinchi o'zgarish yo'q
  v_r := public.t2_naryad_usta_bajarildi_v1(v_k, v_usta, v_op1, v_n, 1, jsonb_build_array(jsonb_build_object('id', v_q1, 'bajarilgan_hajm', 4)), false, null);
  if (v_r->>'takror')::boolean is not true then raise exception 'ACC2: takror belgilanmadi: %', v_r; end if;
  if (select versiya from public.t2_naryad where id = v_n) <> 2 then raise exception 'ACC2: takror versiyani oshirdi'; end if;

  -- 3) eski versiya rad etiladi
  v_r := public.t2_naryad_usta_bajarildi_v1(v_k, v_usta, gen_random_uuid(), v_n, 1, jsonb_build_array(jsonb_build_object('id', v_q2, 'bajarilgan_hajm', 5)), false, null);
  if v_r->>'code' <> 'STALE_VERSION' then raise exception 'ACC3: STALE_VERSION kutilgan: %', v_r; end if;

  -- 4) ikkinchi qator + tugadi: hammasi to'lgan -> 'bajarildi'; birinchi qator saqlanadi
  v_r := public.t2_naryad_usta_bajarildi_v1(v_k, v_usta, v_op2, v_n, 2, jsonb_build_array(jsonb_build_object('id', v_q2, 'bajarilgan_hajm', 20)), false, null);
  if (v_r->>'toliq')::boolean is not true or v_r->>'holat' <> 'bajarildi' then raise exception 'ACC4: bajarildi kutilgan: %', v_r; end if;
  select bajarilgan_hajm into v_b1 from public.t2_naryad_qator where id = v_q1;
  if v_b1 <> 4 then raise exception 'ACC4: birinchi qator hajmi o''zgardi: %', v_b1; end if;
  if (select usta_izoh from public.t2_naryad where id = v_n) <> 'ertalab quyildi' then raise exception 'ACC4: izoh yo''qoldi (null izoh eskisini o''chirmasligi kerak)'; end if;

  -- 5) begona (usta emas) — USTA_EMAS; prorab (smeta.write) ruxsat etiladi
  v_r := public.t2_naryad_usta_bajarildi_v1(v_k, v_prorab, v_op3, v_n, 3, jsonb_build_array(jsonb_build_object('id', v_q1, 'bajarilgan_hajm', 5)), false, null);
  if (v_r->>'ok')::boolean is not true then raise exception 'ACC5: prorab (smeta.write) o''tishi kerak: %', v_r; end if;
end $$;

rollback;
