-- Acceptance: usta qisman «Bajardim» (20261216700000). #377 (20261214810000) acceptance namunasi: haqiqiy obyekt + platforma superadmini aktor,
-- naryad mavjud RPC (yarat) bilan yaratiladi. Har qadam xatosi qadam nomi bilan qayta ko'tariladi. BEGIN ... ROLLBACK, hech narsa saqlanmaydi.
begin;
set local statement_timeout = '300s';
do $acc$
declare
  v_a bigint; v_k bigint; v_o bigint; v_q1 bigint; v_q2 bigint; v_id bigint; v_ver int; l1 bigint; l2 bigint; r jsonb; v_op1 uuid := gen_random_uuid(); v_op2 uuid := gen_random_uuid();
  v_h text; v_u1 bigint := 990100021; v_u2 bigint := 990100022; v_b1 numeric; v_b2 numeric; v_iz text; v_s text := 'boshlanish';
begin
  select id into v_a from public.t2_foydalanuvchi where holat = 'faol' and public.t2_platforma_superadmin(id) limit 1;
  select o.kompaniya_id, o.id into v_k, v_o from public.t2_obyekt o
   where (select count(*) from public.t2_qator q where q.obyekt_id = o.id and q.tur = 'bl' and q.versiya_holat = 'faol') >= 2 limit 1;
  if v_k is null or v_a is null then raise notice 'obyekt/qator/superadmin yo''q — o''tkazib yuborildi'; return; end if;
  select min(id), max(id) into v_q1, v_q2 from (select id from public.t2_qator where obyekt_id = v_o and tur = 'bl' and versiya_holat = 'faol' order by id limit 2) s;

  v_s := '0 yaratish (t2_naryad_yoz_v1 yarat)';
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'yarat', null, null, jsonb_build_object('obyekt_id', v_o, 'usta_nom', 'Sinov usta', 'usta_foydalanuvchi_id', v_a,
    'qatorlar', jsonb_build_array(jsonb_build_object('qator_id', v_q1, 'hajm', 10, 'fakt_boshida', 0), jsonb_build_object('qator_id', v_q2, 'hajm', 20, 'fakt_boshida', 0))));
  if r->>'ok' <> 'true' then raise exception 'yaratilmadi: %', r; end if;
  v_id := (r->>'id')::bigint; v_ver := (r->>'versiya')::int;
  select id into l1 from public.t2_naryad_qator where naryad_id = v_id and tartib = 1;
  select id into l2 from public.t2_naryad_qator where naryad_id = v_id and tartib = 2;

  v_s := '1 qisman: bitta qator + izoh';
  r := public.t2_naryad_usta_bajarildi_v1(v_k, v_a, v_op1, v_id, v_ver, jsonb_build_array(jsonb_build_object('id', l1, 'bajarilgan_hajm', 4)), false, 'ertalab quyildi');
  if r->>'ok' <> 'true' or (r->>'toliq')::boolean then raise exception 'natija: %', r; end if;
  select holat, versiya, usta_izoh into v_h, v_ver, v_iz from public.t2_naryad where id = v_id;
  select bajarilgan_hajm into v_b1 from public.t2_naryad_qator where id = l1;
  select bajarilgan_hajm into v_b2 from public.t2_naryad_qator where id = l2;
  if v_h <> 'berildi' or v_b1 <> 4 or v_b2 is not null or v_iz <> 'ertalab quyildi' then raise exception 'holat/hajm/izoh: % % % %', v_h, v_b1, v_b2, v_iz; end if;

  v_s := '2 takror (bir xil operation_id)';
  r := public.t2_naryad_usta_bajarildi_v1(v_k, v_a, v_op1, v_id, v_ver - 1, jsonb_build_array(jsonb_build_object('id', l1, 'bajarilgan_hajm', 4)), false, null);
  if (r->>'takror')::boolean is not true then raise exception 'takror belgilanmadi: %', r; end if;
  if (select versiya from public.t2_naryad where id = v_id) <> v_ver then raise exception 'takror versiyani oshirdi'; end if;

  v_s := '3 eski versiya rad';
  r := public.t2_naryad_usta_bajarildi_v1(v_k, v_a, gen_random_uuid(), v_id, v_ver - 1, jsonb_build_array(jsonb_build_object('id', l2, 'bajarilgan_hajm', 5)), false, null);
  if r->>'code' <> 'STALE_VERSION' then raise exception 'STALE_VERSION kutilgan: %', r; end if;

  v_s := '4 ikkinchi qator: hammasi to''ldi -> bajarildi; birinchi qator va izoh saqlanadi';
  r := public.t2_naryad_usta_bajarildi_v1(v_k, v_a, v_op2, v_id, v_ver, jsonb_build_array(jsonb_build_object('id', l2, 'bajarilgan_hajm', 20)), false, null);
  if (r->>'toliq')::boolean is not true or r->>'holat' <> 'bajarildi' then raise exception 'bajarildi kutilgan: %', r; end if;
  select bajarilgan_hajm into v_b1 from public.t2_naryad_qator where id = l1;
  if v_b1 <> 4 then raise exception 'birinchi qator hajmi o''zgardi: %', v_b1; end if;
  if (select usta_izoh from public.t2_naryad where id = v_id) <> 'ertalab quyildi' then raise exception 'null izoh eskisini o''chirdi'; end if;

  v_s := '5 tugadi=true: bo''sh qator 0 bo''ladi';
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'yarat', null, null, jsonb_build_object('obyekt_id', v_o, 'usta_nom', 'Sinov usta 2', 'usta_foydalanuvchi_id', v_a,
    'qatorlar', jsonb_build_array(jsonb_build_object('qator_id', v_q1, 'hajm', 10, 'fakt_boshida', 0), jsonb_build_object('qator_id', v_q2, 'hajm', 20, 'fakt_boshida', 0))));
  if r->>'ok' <> 'true' then raise exception '2-naryad yaratilmadi: %', r; end if;
  v_id := (r->>'id')::bigint; v_ver := (r->>'versiya')::int;
  select id into l1 from public.t2_naryad_qator where naryad_id = v_id and tartib = 1;
  select id into l2 from public.t2_naryad_qator where naryad_id = v_id and tartib = 2;
  r := public.t2_naryad_usta_bajarildi_v1(v_k, v_a, gen_random_uuid(), v_id, v_ver, jsonb_build_array(jsonb_build_object('id', l1, 'bajarilgan_hajm', 3)), true, null);
  if (r->>'toliq')::boolean is not true or r->>'holat' <> 'bajarildi' then raise exception 'tugadi: %', r; end if;
  select bajarilgan_hajm into v_b2 from public.t2_naryad_qator where id = l2;
  if v_b2 <> 0 then raise exception 'bo''sh qator 0 bo''lishi kerak: %', v_b2; end if;

  v_s := '6 qabul qilingan naryad qayta yuborilmaydi';
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'qabul', v_id, (select versiya from public.t2_naryad where id = v_id), jsonb_build_object('qatorlar', jsonb_build_array(
    jsonb_build_object('id', l1, 'qabul_hajm', 3, 'fakt_hozir', 0), jsonb_build_object('id', l2, 'qabul_hajm', 0, 'fakt_hozir', 0))));
  if r->>'ok' <> 'true' then raise exception 'qabul: %', r; end if;
  r := public.t2_naryad_usta_bajarildi_v1(v_k, v_a, gen_random_uuid(), v_id, (select versiya from public.t2_naryad where id = v_id), jsonb_build_array(jsonb_build_object('id', l1, 'bajarilgan_hajm', 9)), false, null);
  if r->>'code' <> 'HOLAT_NOTOGRI' then raise exception 'HOLAT_NOTOGRI kutilgan: %', r; end if;
  v_s := '7 haqiqiy usta roli (azolik.rol = usta): o''z naryadi o''tadi, begona naryad USTA_EMAS';
  insert into public.t2_foydalanuvchi (id, login) overriding system value values (v_u1, 'acc_usta1_990100021'), (v_u2, 'acc_usta2_990100022');
  insert into public.t2_azolik (id, foydalanuvchi_id, kompaniya_id, rol) overriding system value values (990100031, v_u1, v_k, 'usta'), (990100032, v_u2, v_k, 'usta');
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'yarat', null, null, jsonb_build_object('obyekt_id', v_o, 'usta_nom', 'Usta 1', 'usta_foydalanuvchi_id', v_u1,
    'qatorlar', jsonb_build_array(jsonb_build_object('qator_id', v_q1, 'hajm', 6, 'fakt_boshida', 0))));
  if r->>'ok' <> 'true' then raise exception '3-naryad yaratilmadi: %', r; end if;
  v_id := (r->>'id')::bigint; v_ver := (r->>'versiya')::int;
  select id into l1 from public.t2_naryad_qator where naryad_id = v_id and tartib = 1;
  r := public.t2_naryad_usta_bajarildi_v1(v_k, v_u2, gen_random_uuid(), v_id, v_ver, jsonb_build_array(jsonb_build_object('id', l1, 'bajarilgan_hajm', 6)), true, null);
  if r->>'code' <> 'USTA_EMAS' then raise exception 'begona usta uchun USTA_EMAS kutilgan: %', r; end if;
  r := public.t2_naryad_usta_bajarildi_v1(v_k, v_u1, gen_random_uuid(), v_id, v_ver, jsonb_build_array(jsonb_build_object('id', l1, 'bajarilgan_hajm', 6)), true, 'tugadi');
  if (r->>'ok')::boolean is not true or r->>'holat' <> 'bajarildi' then raise exception 'o''z usta: %', r; end if;
exception when others then
  raise exception 'ACCEPTANCE qadam [%] yiqildi: % (sqlstate %)', v_s, sqlerrm, sqlstate;
end $acc$;

rollback;
