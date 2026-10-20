-- LOCAL / DISPOSABLE DATABASE ONLY. Synthetic fixtures, BEGIN ... ROLLBACK.
-- Requires migration plus the canonical schema, permission helpers and F2 guards.
-- Never execute this fixture against production (not even as a rollback test).
begin;
do $test$
declare
  n bigint := 4000000000000000 + floor(random()*100000000)::bigint*100000;
  c bigint; actor bigint; other_actor bigint; reader bigint;
  r jsonb; x jsonb; before_f2 jsonb; denied boolean; perm text; k integer:=0;
begin
  c:=n; actor:=n+2; other_actor:=n+3; reader:=n+4;
  insert into public.t2_kompaniya(id,nom,kod) overriding system value values
    (c,'SYNTHETIC FINANCIALS A','OF-A-'||n),(c+1,'SYNTHETIC FINANCIALS B','OF-B-'||n);
  insert into public.t2_foydalanuvchi(id,login,ism) overriding system value values
    (actor,'of-boss-'||n,'SYNTHETIC BOSS'),(other_actor,'of-other-'||n,'SYNTHETIC OTHER'),
    (reader,'of-reader-'||n,'SYNTHETIC READER');
  insert into public.t2_azolik(id,foydalanuvchi_id,kompaniya_id,rol) overriding system value values
    (n+5,actor,c,'boss'),(n+6,other_actor,c+1,'boss'),(n+7,reader,c,'prorab');
  insert into public.t2_obyekt(id,nom,kompaniya_id) overriding system value
    select n+100+i,'SYNTHETIC OBJECT '||i,case when i=10 then c+1 else c end from generate_series(0,10) i;

  insert into public.t2_qator(id,obyekt_id,kompaniya_id,ota_id,tur,nom,hajm,narx,summa,norma,qoshimcha)
  overriding system value values
    (n+1000,n+101,c,null,'bl','SYNTHETIC PARENT',10,999,9999,null,true),
    (n+1001,n+101,c,n+1000,'rs','SYNTHETIC RESOURCE',20,5,100,2,true),
    (n+1002,n+101,c,null,'mat','SYNTHETIC MATERIAL',3,10,30,null,true),
    (n+1003,n+101,c,null,'bl','SYNTHETIC CHILDLESS BL',2,25,50,null,true),
    (n+1004,n+101,c,n+1000,'rs','ЗАТРАТЫ   ТРУДА  МАШИНИСТОВ',10,null,null,1,true),
    (n+1005,n+101,c,null,'ob','SYNTHETIC ZERO REMAINING',0,null,0,null,true),
    (n+1006,n+101,c,null,'mat','SYNTHETIC UNKNOWN QUANTITY',null,7,null,null,true),
    (n+2000,n+102,c,null,'mat','SYNTHETIC UNKNOWN FAKT PRICE',10,3,30,null,true),
    (n+3000,n+103,c,null,'mat','SYNTHETIC COMPLETED NULL PRICE',1,null,null,null,true),
    (n+4000,n+104,c,null,'mat','SYNTHETIC EXPLICIT ZERO',2,0,0,null,true),
    (n+5000,n+105,c,null,'mat','SYNTHETIC ALL UNKNOWN',null,null,null,null,true),
    (n+6000,n+106,c,null,'mat','SYNTHETIC NO FAKT',2,5,10,null,true),
    (n+7000,n+107,c,null,'bl','SYNTHETIC NORM PARENT',10,999,9990,null,true),
    (n+7001,n+107,c,n+7000,'rs','SYNTHETIC NORM RESOURCE',20,5,100,2,true),
    (n+8000,n+108,c,null,'mat','SYNTHETIC UNKNOWN F2',1,null,null,null,true),
    (n+9000,n+109,c,null,'mat','SYNTHETIC ROUND 1',1.001,1.005,1.01,null,true),
    (n+9001,n+109,c,null,'ob','SYNTHETIC ROUND 2',1.001,1.005,1.01,null,true);

  insert into public.t2_akt(id,obyekt_id,kompaniya_id,tur,raqam,oy,holat)
  overriding system value values
    (n+10000,n+101,c,'fakt','OF-FACT',date '2026-09-01','qoralama'),
    (n+10001,n+101,c,'fakt','OF-CANCELLED-FACT',date '2026-09-01','bekor'),
    (n+10002,n+101,c,'f2','OF-APPROVED',date '2026-09-01','qoralama'),
    (n+10003,n+101,c,'f2','OF-SIGNED-ADJUSTMENT',date '2026-10-01','qoralama'),
    (n+10004,n+101,c,'f2','OF-DRAFT',date '2026-10-01','qoralama'),
    (n+10005,n+101,c,'f2','OF-CANCELLED',date '2026-10-01','bekor'),
    (n+20000,n+102,c,'fakt','OF-UNKNOWN-FACT',date '2026-09-01','qoralama'),
    (n+30000,n+103,c,'fakt','OF-COMPLETED',date '2026-09-01','qoralama'),
    (n+70000,n+107,c,'fakt','OF-PARENT',date '2026-09-01','qoralama'),
    (n+70001,n+107,c,'fakt','OF-DIRECT',date '2026-09-01','qoralama'),
    (n+80000,n+108,c,'f2','OF-UNKNOWN-F2',date '2026-09-01','qoralama');

  insert into public.t2_akt_qator(id,akt_id,qator_id,obyekt_id,kompaniya_id,hajm,narx)
  overriding system value values
    (n+200000,n+10000,n+1000,n+101,c,4,999),
    (n+200001,n+10000,n+1002,n+101,c,1,8),
    (n+200002,n+10000,n+1003,n+101,c,1,20),
    (n+200003,n+10001,n+1002,n+101,c,999,999),
    (n+200004,n+10004,n+1001,n+101,c,1000,1000),
    (n+200005,n+10005,n+1001,n+101,c,2000,2000),
    (n+200006,n+20000,n+2000,n+102,c,2,null),
    (n+200007,n+30000,n+3000,n+103,c,1,null),
    (n+200008,n+70000,n+7000,n+107,c,4,999),
    (n+200009,n+70001,n+7001,n+107,c,1,7),
    (n+200010,n+80000,n+8000,n+108,c,1,null);
  insert into public.t2_akt_qator(id,akt_id,qator_id,obyekt_id,kompaniya_id,hajm,narx,
    certified_quantity,certified_unit_price,certified_amount)
  overriding system value values
    (n+210000,n+10002,n+1000,n+101,c,1,999,1,999,999),
    (n+210001,n+10002,n+1001,n+101,c,2,4,2,4,7.77),
    (n+210002,n+10002,n+1002,n+101,c,1,10,null,null,null),
    (n+210003,n+10002,n+1003,n+101,c,1,25,1,25,25),
    (n+210004,n+10002,n+1004,n+101,c,1,null,1,null,null),
    (n+210005,n+10002,n+1006,n+101,c,1,null,1,null,null),
    (n+210006,n+10003,n+1001,n+101,c,-1,4,-1,4,-3.33);
  update public.t2_akt set holat='tasdiqlangan'
    where id in (n+10002,n+10003,n+80000);

  r:=public.t2_object_financials_v1(c,actor,array[n+101,n+100,n+101]);
  if r->>'ok'<>'true' or r->>'basis'<>'direct' or (r->>'kompaniya_id')::bigint<>c
    or jsonb_array_length(r->'objects')<>2
    or (r->'objects'->0->>'obyekt_id')::bigint<>n+100 then raise exception 'BATCH_SORT_OR_DEDUP %',r; end if;
  x:=r->'objects'->0;
  if x->'smeta' is distinct from '{"known":null,"unknown":0,"present":false}'::jsonb
    or x->'fakt' is distinct from '{"known":null,"unknown":0,"present":false}'::jsonb
    or x->'f2' is distinct from '{"known":0,"unknown":0,"present":false}'::jsonb
    or x->'ostatka' is distinct from '{"known":null,"unknown":0,"present":false}'::jsonb
    then raise exception 'EMPTY_NOT_ZERO %',x; end if;
  x:=r->'objects'->1;
  if x->'smeta' is distinct from '{"known":180,"unknown":1,"present":true}'::jsonb
    or x->'fakt' is distinct from '{"known":68,"unknown":0,"present":true}'::jsonb
    or x->'f2' is distinct from '{"known":39.44,"unknown":1,"present":true}'::jsonb
    or x->'ostatka' is distinct from '{"known":105,"unknown":1,"present":true}'::jsonb
    or (x->>'leaf_count')::integer<>6 or (x->>'driver_labor_count')::integer<>1
    or (x->>'fakt_act_count')::integer<>1 or (x->>'f2_approved_act_count')::integer<>2
    or (x->>'f2_legacy_count')::integer<>1 then raise exception 'MAIN_NUMBERS %',x; end if;

  -- Source amounts stay frozen even if the current estimate price changes.
  before_f2:=x->'f2';
  update public.t2_qator set narx=500,summa=10000 where id=n+1001;
  r:=public.t2_object_financials_v1(c,actor,array[n+101]);
  if r->'objects'->0->'f2' is distinct from before_f2 then raise exception 'F2_REPRICED'; end if;
  update public.t2_qator set narx=5,summa=100 where id=n+1001;
  denied:=false;
  begin update public.t2_akt_qator set certified_amount=123 where id=n+210001;
  exception when others then denied:=true; end;
  if not denied then raise exception 'F2_FREEZE_GUARD_MISSING'; end if;
  if (select certified_amount from public.t2_akt_qator where id=n+210001) is distinct from 7.77::numeric
    then raise exception 'F2_FROZEN_SOURCE_CHANGED'; end if;

  r:=public.t2_object_financials_v1(c,actor,array[n+102]);
  x:=r->'objects'->0;
  if x->'fakt' is distinct from '{"known":null,"unknown":1,"present":true}'::jsonb
    or x->'ostatka' is distinct from '{"known":24,"unknown":0,"present":true}'::jsonb
    then raise exception 'UNKNOWN_FACT_AMOUNT %',x; end if;

  r:=public.t2_object_financials_v1(c,actor,array[n+103]);
  x:=r->'objects'->0;
  if x->'ostatka' is distinct from '{"known":0,"unknown":0,"present":true}'::jsonb
    then raise exception 'ZERO_REMAINING_NULL_PRICE %',x; end if;

  r:=public.t2_object_financials_v1(c,actor,array[n+104]);
  x:=r->'objects'->0;
  if x->'smeta' is distinct from '{"known":0,"unknown":0,"present":true}'::jsonb
    or x->'fakt' is distinct from '{"known":null,"unknown":0,"present":false}'::jsonb
    or x->'f2' is distinct from '{"known":0,"unknown":0,"present":false}'::jsonb
    or x->'ostatka' is distinct from '{"known":0,"unknown":0,"present":true}'::jsonb
    then raise exception 'NULL_VS_EXPLICIT_ZERO %',x; end if;

  r:=public.t2_object_financials_v1(c,actor,array[n+105]);
  x:=r->'objects'->0;
  if x->'smeta' is distinct from '{"known":null,"unknown":1,"present":true}'::jsonb
    or x->'ostatka' is distinct from '{"known":null,"unknown":1,"present":true}'::jsonb
    then raise exception 'UNKNOWN_QUANTITY %',x; end if;
  r:=public.t2_object_financials_v1(c,actor,array[n+106]);
  x:=r->'objects'->0;
  if x->'fakt' is distinct from '{"known":null,"unknown":0,"present":false}'::jsonb
    or x->'ostatka' is distinct from '{"known":10,"unknown":0,"present":true}'::jsonb
    then raise exception 'NO_FACT_BASELINE %',x; end if;

  r:=public.t2_object_financials_v1(c,actor,array[n+107]);
  x:=r->'objects'->0;
  if (x->'fakt'->>'known')::numeric is distinct from 7::numeric
    or (x->'ostatka'->>'known')::numeric is distinct from 95::numeric
    then raise exception 'DIRECT_RS_OVERRIDES_PARENT %',x; end if;
  insert into public.t2_akt_qator(id,akt_id,qator_id,obyekt_id,kompaniya_id,hajm,narx)
    overriding system value values(n+200011,n+70001,n+7001,n+107,c,-1,7);
  r:=public.t2_object_financials_v1(c,actor,array[n+107]);
  x:=r->'objects'->0;
  if (x->'fakt'->>'known')::numeric is distinct from 40::numeric
    or (x->'ostatka'->>'known')::numeric is distinct from 60::numeric
    then raise exception 'ZERO_DIRECT_RS_CANONICAL_PARENT_FALLBACK %',x; end if;

  r:=public.t2_object_financials_v1(c,actor,array[n+108]);
  if r->'objects'->0->'f2' is distinct from '{"known":null,"unknown":1,"present":true}'::jsonb
    then raise exception 'UNKNOWN_APPROVED_NOT_ZERO %',r; end if;
  r:=public.t2_object_financials_v1(c,actor,array[n+109]);
  if (r->'objects'->0->'ostatka'->>'known')::numeric is distinct from 2.02::numeric
    then raise exception 'PER_LEAF_CENT_ROUNDING %',r; end if;

  -- Authorization is mandatory even for an empty requested set.
  foreach perm in array array['object.read','smeta.read','fakt.read','f2.read'] loop
    k:=k+1;
    insert into public.t2_azolik_ruxsat_qoshimcha(id,azolik_id,ruxsat,berilgan,berdi_actor_id)
      overriding system value values(n+300+k,n+7,perm,false,actor);
    denied:=false;
    begin perform public.t2_object_financials_v1(c,reader,'{}'::bigint[]);
    exception when sqlstate '42501' then denied:=true; end;
    if not denied then raise exception 'PERMISSION_NOT_REQUIRED %',perm; end if;
    delete from public.t2_azolik_ruxsat_qoshimcha where id=n+300+k;
  end loop;
  denied:=false;
  begin perform public.t2_object_financials_v1(c,other_actor,array[n+101]);
  exception when sqlstate '42501' then denied:=true; end;
  if not denied then raise exception 'MEMBERSHIP_NOT_REQUIRED'; end if;
  denied:=false;
  begin perform public.t2_object_financials_v1(c,actor,array[n+101,n+110]);
  exception when sqlstate '42501' then denied:=true; end;
  if not denied then raise exception 'CROSS_COMPANY_PARTIAL_RESULT'; end if;
  denied:=false;
  begin perform public.t2_object_financials_v1(c,actor,array[n+999]);
  exception when sqlstate '42501' then denied:=true; end;
  if not denied then raise exception 'MISSING_OBJECT_ACCEPTED'; end if;
  denied:=false;
  begin perform public.t2_object_financials_v1(c,actor,null);
  exception when sqlstate '22023' then denied:=true; end;
  if not denied then raise exception 'NULL_ARRAY_ACCEPTED'; end if;
  denied:=false;
  begin perform public.t2_object_financials_v1(c,actor,array[n+101,null]);
  exception when sqlstate '22023' then denied:=true; end;
  if not denied then raise exception 'NULL_ID_ACCEPTED'; end if;
  denied:=false;
  begin perform public.t2_object_financials_v1(c,actor,array[-1::bigint]);
  exception when sqlstate '22023' then denied:=true; end;
  if not denied then raise exception 'NEGATIVE_ID_ACCEPTED'; end if;
  denied:=false;
  begin perform public.t2_object_financials_v1(c,actor,(select array_agg(n+100+i) from generate_series(1,201) i));
  exception when sqlstate '22023' then denied:=true; end;
  if not denied then raise exception 'OVER_200_UNIQUE_ACCEPTED'; end if;
  r:=public.t2_object_financials_v1(c,actor,array_fill(n+100,array[201]));
  if jsonb_array_length(r->'objects')<>1 then raise exception 'DUPLICATES_CONSUME_LIMIT'; end if;
  r:=public.t2_object_financials_v1(c,actor,'{}'::bigint[]);
  if r->'objects'<>'[]'::jsonb then raise exception 'EMPTY_BATCH'; end if;

  if has_function_privilege('anon','public.t2_object_financials_v1(bigint,bigint,bigint[])','execute')
    or has_function_privilege('authenticated','public.t2_object_financials_v1(bigint,bigint,bigint[])','execute')
    or not has_function_privilege('service_role','public.t2_object_financials_v1(bigint,bigint,bigint[])','execute')
    then raise exception 'SERVICE_ONLY_GRANTS'; end if;
  if not exists(select 1 from pg_proc
    where oid='public.t2_object_financials_v1(bigint,bigint,bigint[])'::regprocedure
      and provolatile='s' and prosecdef and proconfig @> array['search_path=public, pg_temp'])
    then raise exception 'STABLE_DEFINER_SEARCH_PATH'; end if;
end
$test$;
select 'OBJECT_FINANCIALS_ACCEPTANCE_PASS' as acceptance;
rollback;

