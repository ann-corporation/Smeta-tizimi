-- Acceptance: usta «Bugun» (tuzilma + ruxsat + idempotentlik rad yo'llari). Hech narsa saqlanmaydi.
begin;
set local statement_timeout = '300s';

do $$
declare v_n int; v_r jsonb;
begin
  select count(*) into v_n from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('t2_usta_fakt_qoralama_v1', 't2_usta_fakt_qaror_v1', 't2_usta_zayavka_v1') and prosecdef;
  if v_n <> 3 then raise exception 'ACCEPT: 3 ta security definer RPC kerak, bor: %', v_n; end if;

  if not exists (select 1 from pg_class where oid = 'public.t2_usta_fakt_qoralama'::regclass and relrowsecurity) then
    raise exception 'ACCEPT: t2_usta_fakt_qoralama RLS yoqilmagan';
  end if;
  if has_table_privilege('anon', 'public.t2_usta_fakt_qoralama', 'select') or has_table_privilege('authenticated', 'public.t2_usta_fakt_qoralama', 'select') then
    raise exception 'ACCEPT: brauzer rollari jadvalga kira olmasligi kerak';
  end if;
  if has_function_privilege('authenticated', 'public.t2_usta_fakt_qaror_v1(bigint,bigint,bigint[],text,text,uuid)', 'execute') then
    raise exception 'ACCEPT: qaror RPC faqat service_role uchun';
  end if;

  -- operation_id majburiy
  v_r := public.t2_usta_fakt_qoralama_v1(1, 1, 1, current_date, '[]'::jsonb, null, null, null);
  if v_r->>'code' is distinct from 'OPERATION_ID_REQUIRED' then raise exception 'ACCEPT: operation_id talabi ishlamadi: %', v_r; end if;
  v_r := public.t2_usta_zayavka_v1(1, 1, 1, 'x', 1, null, null, null, null);
  if v_r->>'code' is distinct from 'OPERATION_ID_REQUIRED' then raise exception 'ACCEPT: zayavka operation_id talabi: %', v_r; end if;

  -- begona/yo'q actor rad etiladi (a'zo emas)
  begin
    perform public.t2_usta_fakt_qoralama_v1(-1, -1, 1, current_date, '[{"qator_id":1,"hajm":1}]'::jsonb, null, null, gen_random_uuid());
    raise exception 'ACCEPT: yo''q actor o''tib ketdi';
  exception when sqlstate '22023' or sqlstate '42501' then null;
  end;
end $$;

-- E2E (sintetik seed, oxirida ROLLBACK): usta qoralama -> takror (idempotent) -> prorab tasdiq -> haqiqiy fakt qatori + zayavka.
do $$
declare
  v_k bigint := 990000001; v_o bigint := 990000002; v_q bigint := 990000003; v_usta bigint := 990000004; v_prorab bigint := 990000005;
  v_op uuid := gen_random_uuid(); v_op2 uuid := gen_random_uuid(); v_r jsonb; v_id bigint; v_fakt numeric; v_akt bigint; v_st text; v_nt text;
begin
  insert into public.t2_foydalanuvchi (id, login) overriding system value values (v_usta, 'acc_usta_990000004'), (v_prorab, 'acc_prorab_990000005');
  insert into public.t2_kompaniya (id, nom, kod) overriding system value values (v_k, 'ACC Kompaniya', 'ACC990000001');
  insert into public.t2_azolik (id, foydalanuvchi_id, kompaniya_id, rol) overriding system value values (990000006, v_usta, v_k, 'usta'), (990000007, v_prorab, v_k, 'prorab');
  insert into public.t2_obyekt (id, nom, kompaniya_id) overriding system value values (v_o, 'ACC Obyekt', v_k);
  insert into public.t2_qator (id, obyekt_id, tur, kompaniya_id) overriding system value values (v_q, v_o, 'bl', v_k);

  -- usta qoralama yozadi (fakt hali yozilmagan)
  v_r := public.t2_usta_fakt_qoralama_v1(v_usta, v_k, v_o, current_date, jsonb_build_array(jsonb_build_object('qator_id', v_q, 'hajm', 2.5)), 'acc', null, v_op);
  if (v_r->>'ok')::boolean is not true then raise exception 'E2E: qoralama yozilmadi: %', v_r; end if;
  select id into v_id from public.t2_usta_fakt_qoralama where operation_id = v_op;
  if v_id is null then raise exception 'E2E: qoralama qatori yo''q'; end if;
  select coalesce(sum(a.hajm), 0) into v_fakt from public.t2_akt_qator a where a.qator_id = v_q;
  if v_fakt <> 0 then raise exception 'E2E: qoralama haqiqiy faktga tegmasligi kerak, bor: %', v_fakt; end if;

  -- takror (bir xil operation_id): ikkinchi qator yaratilmaydi
  v_r := public.t2_usta_fakt_qoralama_v1(v_usta, v_k, v_o, current_date, jsonb_build_array(jsonb_build_object('qator_id', v_q, 'hajm', 2.5)), 'acc', null, v_op);
  if (select count(*) from public.t2_usta_fakt_qoralama where operation_id = v_op) <> 1 then raise exception 'E2E: takror ikkinchi qator yaratdi'; end if;

  -- usta o'zi tasdiqlay olmaydi
  begin
    perform public.t2_usta_fakt_qaror_v1(v_usta, v_k, array[v_id], 'tasdiqlangan', null, gen_random_uuid());
    raise exception 'E2E: usta tasdiqlab yubordi';
  exception when sqlstate '42501' then null;
  end;

  -- prorab tasdiqlaydi -> haqiqiy fakt
  v_r := public.t2_usta_fakt_qaror_v1(v_prorab, v_k, array[v_id], 'tasdiqlangan', null, v_op2);
  if (v_r->>'ok')::boolean is not true then raise exception 'E2E: tasdiq xato: %', v_r; end if;
  select holat, akt_id into v_st, v_akt from public.t2_usta_fakt_qoralama where id = v_id;
  if v_st <> 'tasdiqlangan' or v_akt is null then raise exception 'E2E: qoralama holati/akt_id noto''g''ri: % %', v_st, v_akt; end if;
  select coalesce(sum(a.hajm), 0) into v_fakt from public.t2_akt_qator a where a.qator_id = v_q and a.akt_id = v_akt;
  if v_fakt <> 2.5 then raise exception 'E2E: haqiqiy fakt qatori 2.5 bo''lishi kerak, bor: %', v_fakt; end if;

  -- zayavka: submitted va «Ustadan»
  v_r := public.t2_usta_zayavka_v1(v_usta, v_k, v_o, 'Sement', 3, 'tonna', null, 'acc', gen_random_uuid());
  select status, note into v_st, v_nt from public.t2_erp_taminot where id = (v_r->>'id')::bigint;
  if v_st <> 'submitted' or v_nt not like 'Ustadan%' then raise exception 'E2E: zayavka holati/izohi noto''g''ri: % %', v_st, v_nt; end if;
end $$;
rollback;
