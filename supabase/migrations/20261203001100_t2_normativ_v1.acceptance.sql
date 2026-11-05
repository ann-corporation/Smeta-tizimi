-- Synthetic only. L0 executes; all actors/documents disappear at ROLLBACK.
begin;
do $$
declare a bigint; x bigint; y bigint; z bigint; k bigint; k2 bigint; v_doc_id uuid; r jsonb;
 op uuid:=gen_random_uuid(); iop uuid:=gen_random_uuid(); pop uuid:=gen_random_uuid();
 doc jsonb:=jsonb_build_object('source_sha',repeat('a',64),'job_sha',repeat('b',64),'reader_versiya','SYNTHETIC/1',
   'norma_kod','SYNTHETIC-1','tahrir','TEST','nom','SYNTHETIC ALPHA','bayt',12,'review_flags',jsonb_build_array('SEMANTIC_REVIEW_REQUIRED'));
 chunks jsonb:=jsonb_build_array(jsonb_build_object('sha256',repeat('c',64),'unit_sha',repeat('d',64),
   'unit','page-1','tartib',0,'sahifa_pdf',1,'sahifa_bosma',null,'jadval_kod',null,'qidiruv_yorliq','SYNTHETIC BETA','bayt',12));
begin
 insert into t2_kompaniya(nom,kod) values('SYNTHETIC NORM A','norm-'||gen_random_uuid()) returning id into k;
 insert into t2_kompaniya(nom,kod) values('SYNTHETIC NORM B','norm-'||gen_random_uuid()) returning id into k2;
 insert into t2_foydalanuvchi(login,ism,holat) values('norm-'||gen_random_uuid(),'SYNTHETIC ADMIN','faol') returning id into a;
 insert into t2_foydalanuvchi(login,ism,holat) values('norm-'||gen_random_uuid(),'SYNTHETIC A','faol') returning id into x;
 insert into t2_foydalanuvchi(login,ism,holat) values('norm-'||gen_random_uuid(),'SYNTHETIC B','faol') returning id into y;
 insert into t2_foydalanuvchi(login,ism,holat) values('norm-'||gen_random_uuid(),'SYNTHETIC OUTSIDER','faol') returning id into z;
 insert into t2_azolik(foydalanuvchi_id,kompaniya_id,rol,holat) values(a,k,'superadmin','faol'),(x,k,'pto','faol'),(y,k2,'pto','faol');
 if t2_normativ_hujjat_qosh_v1(x,op,doc,chunks)->>'code' is distinct from 'FORBIDDEN' then raise exception 'MEMBER_WRITE'; end if;
 r:=t2_normativ_hujjat_qosh_v1(a,op,doc,chunks);
 if r->>'ok' is distinct from 'true' then raise exception 'CREATE %',r; end if; v_doc_id:=(r->>'id')::uuid;
 if t2_normativ_hujjat_qosh_v1(a,op,doc,chunks)->>'id' is distinct from v_doc_id::text then raise exception 'RETRY'; end if;
 if t2_normativ_hujjat_qosh_v1(a,op,doc||'{"nom":"DIFFERENT"}',chunks)->>'code' is distinct from 'IMMUTABLE_CONFLICT' then raise exception 'IMMUTABLE'; end if;
 if t2_normativ_hujjat_qosh_v1(a,gen_random_uuid(),doc||'{"matn":"SYNTHETIC FORBIDDEN BODY"}',chunks)->>'code' is distinct from 'METADATA_ONLY' then raise exception 'BODY_COLUMN'; end if;
 if jsonb_array_length(t2_normativ_oqi_v1(x,k,v_doc_id)->'hujjatlar') is distinct from 0 then raise exception 'UNPUBLISHED_LEAK'; end if;
 if t2_normativ_oqi_v1(x,k2,v_doc_id)->>'code' is distinct from 'FORBIDDEN' or t2_normativ_oqi_v1(z,k,v_doc_id)->>'code' is distinct from 'FORBIDDEN' then raise exception 'MEMBERSHIP'; end if;
 if t2_normativ_holat_v1(a,v_doc_id,'PUBLISHED',1,pop,repeat('b',64))->>'code' is distinct from 'STATE_INVALID' then raise exception 'SKIP_INDEX'; end if;
 if t2_normativ_holat_v1(a,v_doc_id,'INDEXED',1,iop,repeat('f',64))->>'code' is distinct from 'REVIEW_REQUIRED' then raise exception 'REVIEW_HASH'; end if;
 if t2_normativ_holat_v1(a,v_doc_id,'INDEXED',1,iop,repeat('b',64))->>'versiya' is distinct from '2' then raise exception 'INDEX'; end if;
 if t2_normativ_holat_v1(a,v_doc_id,'PUBLISHED',1,pop,repeat('b',64))->>'code' is distinct from 'STALE_VERSION' then raise exception 'CAS'; end if;
 if t2_normativ_holat_v1(a,v_doc_id,'PUBLISHED',2,pop,repeat('b',64))->>'versiya' is distinct from '3' then raise exception 'PUBLISH'; end if;
 if t2_normativ_holat_v1(a,v_doc_id,'INDEXED',1,iop,repeat('b',64))->>'versiya' is distinct from '2' then raise exception 'OLD_OP_RETRY'; end if;
 if t2_normativ_holat_v1(a,v_doc_id,'PUBLISHED',1,iop,repeat('b',64))->>'code' is distinct from 'OPERATION_CONFLICT' then raise exception 'OP_MUTATION'; end if;
 if (select versiya from t2_normativ_hujjat where t2_normativ_hujjat.id=v_doc_id) is distinct from 3 then raise exception 'RETRY_WROTE'; end if;
 if jsonb_array_length(t2_normativ_oqi_v1(y,k2,v_doc_id)->'bolaklar') is distinct from 1 then raise exception 'GLOBAL_MEMBER_READ'; end if;
 if (select sahifa_bosma from t2_normativ_bolak where hujjat_id=v_doc_id) is not null then raise exception 'NULL_NOT_ZERO'; end if;
 if not exists(select 1 from t2_normativ_hujjat where t2_normativ_hujjat.id=v_doc_id and qidiruv@@plainto_tsquery('simple','SYNTHETIC')) then raise exception 'FTS'; end if;
 update t2_azolik set holat='bekor' where foydalanuvchi_id=y;
 if t2_normativ_oqi_v1(y,k2,v_doc_id)->>'code' is distinct from 'FORBIDDEN' then raise exception 'REVOKED_MEMBER'; end if;
 update t2_azolik set holat='bekor' where foydalanuvchi_id=a;
 if t2_normativ_holat_v1(a,v_doc_id,'INDEXED',1,iop,repeat('b',64))->>'code' is distinct from 'FORBIDDEN' then raise exception 'REVOKED_ADMIN_RETRY'; end if;
 update t2_azolik set holat='faol' where foydalanuvchi_id=a;
 doc:=doc||jsonb_build_object('job_sha',repeat('e',64),'review_flags',jsonb_build_array('OCR_LOW_CONFIDENCE'));
 r:=t2_normativ_hujjat_qosh_v1(a,gen_random_uuid(),doc,chunks);
 if t2_normativ_holat_v1(a,(r->>'id')::uuid,'INDEXED',1,gen_random_uuid(),repeat('e',64))->>'code' is distinct from 'REVIEW_REQUIRED' then raise exception 'OCR_CONFIDENCE_BYPASS'; end if;
 doc:=doc||jsonb_build_object('job_sha',repeat('f',64),'review_flags',jsonb_build_array('CONVERTER_REQUIRED'));
 r:=t2_normativ_hujjat_qosh_v1(a,gen_random_uuid(),doc,'[]'::jsonb);
 if r->>'ok' is distinct from 'true' or t2_normativ_holat_v1(a,(r->>'id')::uuid,'INDEXED',1,gen_random_uuid(),repeat('f',64))->>'code' is distinct from 'REVIEW_REQUIRED' then raise exception 'EMPTY_DOC_REVIEW'; end if;
 if has_table_privilege('authenticated','public.t2_normativ_hujjat','SELECT') or has_table_privilege('anon','public.t2_normativ_bolak','INSERT') then raise exception 'PUBLIC_GRANT'; end if;
 if not (select relrowsecurity from pg_class where oid='public.t2_normativ_hujjat'::regclass) or not (select relrowsecurity from pg_class where oid='public.t2_normativ_bolak'::regclass) then raise exception 'RLS_OFF'; end if;
 raise notice 'T2_NORMATIV_V1_ACCEPTANCE_PASS';
end $$;
rollback;
