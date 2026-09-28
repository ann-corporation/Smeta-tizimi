-- Ledger 20260928103802 acceptance. All behavioral mutations are rolled back.
begin;
do $accept$
declare d text;
begin
  d := pg_get_functiondef('public.t2_akt_lifecycle_transition_v1(bigint,bigint,text,bigint,integer,uuid,text)'::regprocedure);
  if position('''akt_lifecycle_transition'', ''f2'', v_akt.obyekt_id,' in d)=0
    or position('''akt_lifecycle_retry'', ''f2'', v_akt.obyekt_id,' in d)=0
    or position('akt_id=%s; from=' in d)=0
    or position('t2_actor_kompaniya_azo_tekshir' in d)=0
    or position('STALE_VERSION' in d)=0 then raise exception 'LIFECYCLE_LINEAGE_ACCEPTANCE_FAIL'; end if;
  d := pg_get_functiondef('public.t2_akt_correction_create_v1(bigint,bigint,bigint,uuid,integer,bigint,text,text)'::regprocedure);
  if position('''akt_correction_created'', ''f2'', v_source.obyekt_id,' in d)=0
    or position('original_akt_id=%s;' in d)=0 then raise exception 'CORRECTION_LINEAGE_ACCEPTANCE_FAIL'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='t2_akt_reestr' and column_name='lifecycle_status') then raise exception 'LIFECYCLE_READ_MODEL_MISSING'; end if;
  if has_function_privilege('anon','public.t2_akt_lifecycle_transition_v1(bigint,bigint,text,bigint,integer,uuid,text)','EXECUTE') then raise exception 'ANONYMOUS_LIFECYCLE_ACCESS'; end if;
  raise notice 'F2_LIFECYCLE_LINEAGE_ACCEPTANCE_PASS';
end $accept$;
rollback;

-- Behavioral acceptance runs against a suitable existing draft, entirely in
-- a transaction that MUST end with ROLLBACK. Never persist financial approval.
begin;
do $behavior$
declare
  a public.t2_akt; actor bigint; v integer; r jsonb; op uuid; stage text;
  exact numeric; after_exact numeric; before_lrv numeric; after_lrv numeric;
  before_n jsonb; after_n jsonb; before_f3 numeric; after_f3 numeric;
  history_before bigint; correction_before bigint; blocked boolean := false;
begin
  select * into a from public.t2_akt x
  where x.tur='f2' and x.lifecycle_status='draft'
    and exists(select 1 from public.t2_akt_qator q where q.akt_id=x.id and q.certified_amount is not null)
    and exists(select 1 from public.t2_azolik m where m.kompaniya_id=x.kompaniya_id and m.holat='faol' and m.rol<>'rahbar')
  order by x.id desc limit 1;
  if not found then raise exception 'BEHAVIORAL_FIXTURE_REQUIRED'; end if;
  select min(foydalanuvchi_id) into actor from public.t2_azolik where kompaniya_id=a.kompaniya_id and holat='faol' and rol<>'rahbar';
  select sum(certified_amount) into exact from public.t2_akt_qator where akt_id=a.id;
  select count(*) into history_before from public.t2_akt_holat_tarix where akt_id=a.id;
  select count(*) into correction_before from public.t2_akt_correction_link where original_akt_id=a.id;
  select coalesce(sum(f2_summa),0) into before_lrv from public.t2_qator_holat where obyekt_id=a.obyekt_id;
  select coalesce(sum(certified_amount),0) into before_f3 from public.t2_f2_tafsilot where obyekt_id=a.obyekt_id and akt_holat='tasdiqlangan';
  before_n := public.t2_nakopitelniy_v2(a.obyekt_id,actor,a.oy,5000,false,0);
  v:=a.versiya;
  foreach stage in array array['submitted','checked','approved'] loop
    op:=gen_random_uuid();
    r:=public.t2_akt_lifecycle_transition_v1(a.kompaniya_id,a.id,stage,actor,v,op,null);
    if r->>'ok'<>'true' or r->>'status'<>stage then raise exception 'STAGE_FAIL: %',r; end if;
    v:=(r->>'version')::integer;
    r:=public.t2_akt_lifecycle_transition_v1(a.kompaniya_id,a.id,stage,actor,v-1,op,null);
    if r->>'ok'<>'true' or r->>'retry'<>'true' or (r->>'version')::integer<>v then raise exception 'IDEMPOTENCY_FAIL'; end if;
  end loop;
  select sum(certified_amount) into after_exact from public.t2_akt_qator where akt_id=a.id;
  if exact is distinct from after_exact then raise exception 'CERTIFIED_HISTORY_MUTATED'; end if;
  select coalesce(sum(f2_summa),0) into after_lrv from public.t2_qator_holat where obyekt_id=a.obyekt_id;
  select coalesce(sum(certified_amount),0) into after_f3 from public.t2_f2_tafsilot where obyekt_id=a.obyekt_id and akt_holat='tasdiqlangan';
  after_n := public.t2_nakopitelniy_v2(a.obyekt_id,actor,a.oy,5000,false,0);
  if abs(after_lrv-before_lrv-exact)>0.005 or abs(after_f3-before_f3-exact)>0.005
    or abs((after_n#>>'{jami,jami_tasdiqlangan_summa}')::numeric-(before_n#>>'{jami,jami_tasdiqlangan_summa}')::numeric-exact)>0.005 then raise exception 'PTO_AMOUNT_CHAIN_MISMATCH'; end if;
  r:=public.t2_akt_lifecycle_transition_v1(a.kompaniya_id,a.id,'approved',actor,v-1,gen_random_uuid(),null);
  if r->>'code'<>'STALE_VERSION' then raise exception 'STALE_VERSION_NOT_BLOCKED'; end if;
  begin
    r:=public.t2_akt_lifecycle_transition_v1(a.kompaniya_id+1000000,a.id,'approved',actor,v,gen_random_uuid(),null);
    blocked := r->>'ok'='false';
  exception when others then blocked:=true;
  end;
  if not blocked then raise exception 'TENANT_BOUNDARY_FAILED'; end if;
  op:=gen_random_uuid();
  r:=public.t2_akt_correction_create_v1(a.kompaniya_id,actor,a.id,op,v,null,'Rollback acceptance only',null);
  if r->>'ok'<>'true' then raise exception 'CORRECTION_FAILED'; end if;
  r:=public.t2_akt_correction_create_v1(a.kompaniya_id,actor,a.id,op,v,null,'Rollback acceptance only',null);
  if r->>'ok'<>'true' or r->>'retry'<>'true' then raise exception 'CORRECTION_REPLAY_FAILED'; end if;
  if (select count(*) from public.t2_akt_correction_link where original_akt_id=a.id)<>correction_before+1 then raise exception 'CORRECTION_DUPLICATED'; end if;
  if (select count(*) from public.t2_akt_holat_tarix where akt_id=a.id)<>history_before+3 then raise exception 'HISTORY_DUPLICATED'; end if;
  perform set_config('t2.test.pto_result',jsonb_build_object('status','PASS','f2_exact',exact,'lrv_delta',after_lrv-before_lrv,'f3_source_delta',after_f3-before_f3,'nakopitelniy_delta',(after_n#>>'{jami,jami_tasdiqlangan_summa}')::numeric-(before_n#>>'{jami,jami_tasdiqlangan_summa}')::numeric,'idempotency','PASS','correction','PASS','tenant_boundary','PASS')::text,true);
end $behavior$;
select current_setting('t2.test.pto_result') as rollback_acceptance;
rollback;
