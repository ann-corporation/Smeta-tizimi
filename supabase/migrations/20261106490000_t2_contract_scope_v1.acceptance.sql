-- Только синтетические строки. Выполнять с migration без COMMIT; финальный RAISE откатывает ВСЁ.
do $$
declare c bigint; a bigint; o bigint:=2000000000000000+floor(random()*100000000)::bigint;
 s bigint; q bigint; v integer; op uuid:=gen_random_uuid(); b jsonb; r jsonb; snapshot jsonb; blocked boolean;
begin
 select kompaniya_id,foydalanuvchi_id into c,a from public.t2_azolik where holat='faol'
 and public.t2_permission_allowed_v2(kompaniya_id,foydalanuvchi_id,'smeta.write')
 and public.t2_permission_allowed_v2(kompaniya_id,foydalanuvchi_id,'smeta.read') order by id limit 1;
 if a is null then raise exception 'ACTOR_REQUIRED'; end if;
 insert into public.t2_obyekt(id,nom,kompaniya_id) overriding system value values(o,'СИНТЕТИЧЕСКИЙ ДОГОВОРНЫЙ ОБЪЁМ',c);
 insert into public.t2_shartnoma(kompaniya_id,raqam,nom) values(c,'TEST-'||o,'СИНТЕТИЧЕСКИЙ ДОГОВОР') returning id into s;
 insert into public.t2_shartnoma_bog(obyekt_id,shartnoma_id) values(o,s);
 insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,tartib,hajm,birlik,narx,summa)
 values(o,c,'bl','СИНТЕТИЧЕСКАЯ СКУЛЬПТУРА',1,1,'шт',0,0) returning id,versiya into q,v;
 select to_jsonb(x) into snapshot from public.t2_qator x where id=q;
 b:=jsonb_build_object('kind','artwork','contract_id',s,'reference','Приложение №1, п.2','valuation','milestone','vat',null,'markup','included');
 r:=public.t2_contract_scope_set_v1(a,o,q,v,0,b,op);
 if r->>'revision'<>'1' then raise exception 'CREATE_FAILED %',r; end if;
 r:=public.t2_contract_scope_set_v1(a,o,q,v,0,b,op);
 if r->>'takror'<>'true' then raise exception 'REPLAY_FAILED'; end if;
 blocked:=false;
 begin perform public.t2_contract_scope_set_v1(a,o,q,v,0,b||'{"kind":"service"}',op);
 exception when others then if sqlerrm like '%OPERATION_CONFLICT%' then blocked:=true; else raise; end if; end;
 if not blocked then raise exception 'REPLAY_PAYLOAD_UNCHECKED'; end if;
 blocked:=false;
 begin perform public.t2_contract_scope_set_v1(0,o,q,v,0,b,op); exception when others then blocked:=true; end;
 if not blocked then raise exception 'UNAUTHORIZED_REPLAY'; end if;
 blocked:=false;
 begin perform public.t2_contract_scope_set_v1(a,o,q,v,0,b,gen_random_uuid());
 exception when others then if sqlerrm like '%STALE_BASIS_VERSION%' then blocked:=true; else raise; end if; end;
 if not blocked then raise exception 'BASIS_LOST_UPDATE'; end if;
 blocked:=false;
 begin perform public.t2_contract_scope_set_v1(a,o,q,v+1,1,b,gen_random_uuid());
 exception when others then if sqlerrm like '%STALE_VERSION%' then blocked:=true; else raise; end if; end;
 if not blocked then raise exception 'SOURCE_VERSION_UNCHECKED'; end if;
 blocked:=false;
 begin perform public.t2_contract_scope_set_v1(a,o,q,v,1,b||'{"contract_id":-1}',gen_random_uuid());
 exception when others then if sqlerrm like '%CONTRACT_SCOPE_INVALID%' then blocked:=true; else raise; end if; end;
 if not blocked then raise exception 'CONTRACT_SCOPE_UNCHECKED'; end if;
 r:=public.t2_contract_scope_read_v1(a,o);
 if r->'bases'->0->>'vat' is not null or r->'bases'->0->>'kind'<>'artwork' or jsonb_array_length(r->'contracts')<>1 then raise exception 'READ_FAILED %',r; end if;
 if snapshot is distinct from (select to_jsonb(x) from public.t2_qator x where id=q) then raise exception 'SOURCE_CHANGED'; end if;
 if has_function_privilege('anon','public.t2_contract_scope_set_v1(bigint,bigint,bigint,integer,integer,jsonb,uuid)','execute') then raise exception 'PUBLIC_PRIVILEGE'; end if;
 -- История основания не должна блокировать существующий механизм архивирования добавленных строк.
 delete from public.t2_qator where id=q;
 if not exists(select 1 from public.t2_contract_scope_event where qator_id=q and row_snapshot=snapshot) then raise exception 'HISTORY_LOST'; end if;
 r:=public.t2_contract_scope_read_v1(a,o);
 if jsonb_array_length(r->'bases')<>0 then raise exception 'ARCHIVED_ROW_VISIBLE'; end if;
 raise exception 'CONTRACT_SCOPE_ACCEPTANCE_PASS';
end $$;
