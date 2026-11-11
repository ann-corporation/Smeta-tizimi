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

rollback;
