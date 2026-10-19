-- Классификация договорного объёма. Не меняет стоимость/нормы исходных строк и историю актов.
begin;
create table public.t2_contract_scope_event (
  id bigint generated always as identity primary key,
  -- ID + снимок: история сохраняется после штатного архивирования/удаления добавленной строки.
  qator_id bigint not null,
  row_snapshot jsonb not null,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  revision integer not null check (revision > 0),
  basis jsonb not null,
  actor_id bigint not null,
  operation_id uuid not null unique,
  request jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(qator_id, revision)
);
create index t2_contract_scope_object_idx on public.t2_contract_scope_event(obyekt_id,qator_id,revision desc);
alter table public.t2_contract_scope_event enable row level security;
revoke all on public.t2_contract_scope_event from public,anon,authenticated;

create function public.t2_contract_scope_read_v1(p_actor_id bigint,p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c bigint; r jsonb;
begin
 select kompaniya_id into c from public.t2_obyekt where id=p_obyekt_id;
 if c is null then raise exception 'OBJECT_NOT_FOUND'; end if;
 perform public.t2_actor_kompaniya_azo_tekshir(c,p_actor_id);
 perform public.t2_require_permission_v2(c,p_actor_id,'smeta.read');
 select coalesce(jsonb_agg(x.basis || jsonb_build_object('revision',x.revision)),'[]') into r from (
  select distinct on(e.qator_id) e.* from public.t2_contract_scope_event e
  join public.t2_qator q on q.id=e.qator_id and q.obyekt_id=e.obyekt_id and q.kompaniya_id=e.kompaniya_id
  where e.obyekt_id=p_obyekt_id and e.kompaniya_id=c order by e.qator_id,e.revision desc
 ) x;
 return jsonb_build_object('ok',true,'bases',r,'contracts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'nom',s.nom,'raqam',s.raqam))
 from public.t2_shartnoma s where s.kompaniya_id=c and exists(select 1 from public.t2_shartnoma_bog b
 where b.shartnoma_id=s.id and b.obyekt_id=p_obyekt_id and b.holat='faol')),'[]'));
end $$;

create function public.t2_contract_scope_set_v1(p_actor_id bigint,p_obyekt_id bigint,p_qator_id bigint,
 p_qator_version integer,p_basis_version integer,p_basis jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c bigint; q public.t2_qator%rowtype; prev public.t2_contract_scope_event%rowtype;
 req jsonb; rev integer; contract bigint;
begin
 select kompaniya_id into c from public.t2_obyekt where id=p_obyekt_id;
 if c is null then raise exception 'OBJECT_NOT_FOUND'; end if;
 perform public.t2_actor_kompaniya_azo_tekshir(c,p_actor_id);
 perform public.t2_require_permission_v2(c,p_actor_id,'smeta.write');
 if p_operation_id is null then raise exception 'OPERATION_ID_REQUIRED'; end if;
 req:=jsonb_build_array(p_actor_id,p_obyekt_id,p_qator_id,p_qator_version,p_basis_version,p_basis);
 perform pg_advisory_xact_lock(hashtextextended('contract_scope:'||p_operation_id,0));
 select * into prev from public.t2_contract_scope_event where operation_id=p_operation_id;
 if found then
  if prev.request is distinct from req then raise exception 'OPERATION_CONFLICT'; end if;
  return jsonb_build_object('ok',true,'revision',prev.revision,'takror',true);
 end if;
 select * into q from public.t2_qator where id=p_qator_id and obyekt_id=p_obyekt_id and kompaniya_id=c for update;
 if not found then raise exception 'QATOR_NOT_FOUND'; end if;
 if p_qator_version is null or q.versiya is distinct from p_qator_version then raise exception 'STALE_VERSION'; end if;
 select coalesce(max(revision),0) into rev from public.t2_contract_scope_event where qator_id=q.id;
 if p_basis_version is null or rev is distinct from p_basis_version then raise exception 'STALE_BASIS_VERSION'; end if;
 if p_basis is null or jsonb_typeof(p_basis)<>'object' or
    coalesce(p_basis->>'kind','') not in ('construction','equipment','supervision','artwork','design','service','other') or
    coalesce(p_basis->>'valuation','') not in ('unit','milestone','amount') or
    nullif(btrim(p_basis->>'reference'),'') is null or length(p_basis->>'reference')>1000 or
    (p_basis->>'vat' is not null and p_basis->>'vat' not in ('included','excluded','exempt')) or
    (p_basis->>'markup' is not null and p_basis->>'markup' not in ('included','excluded')) then
   raise exception 'BASIS_INVALID';
 end if;
 contract:=(p_basis->>'contract_id')::bigint;
 if contract is null or not exists(select 1 from public.t2_shartnoma s
   join public.t2_shartnoma_bog b on b.shartnoma_id=s.id and b.obyekt_id=p_obyekt_id and b.holat='faol'
   where s.id=contract and s.kompaniya_id=c) then raise exception 'CONTRACT_SCOPE_INVALID'; end if;
 insert into public.t2_contract_scope_event(qator_id,row_snapshot,kompaniya_id,obyekt_id,revision,basis,actor_id,operation_id,request)
 values(q.id,to_jsonb(q),c,p_obyekt_id,rev+1,jsonb_build_object('qator_id',q.id,'kind',p_basis->>'kind',
 'contract_id',contract,'reference',btrim(p_basis->>'reference'),'valuation',p_basis->>'valuation',
 'vat',p_basis->>'vat','markup',p_basis->>'markup'),p_actor_id,p_operation_id,req);
 perform public.t2_audit_yoz(c,'contract_scope_set','smeta',p_obyekt_id,'qator:'||q.id||'; revision:'||(rev+1),'actor:'||p_actor_id,null);
 return jsonb_build_object('ok',true,'revision',rev+1,'takror',false);
end $$;
revoke all on function public.t2_contract_scope_read_v1(bigint,bigint) from public,anon,authenticated;
revoke all on function public.t2_contract_scope_set_v1(bigint,bigint,bigint,integer,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.t2_contract_scope_read_v1(bigint,bigint) to service_role;
grant execute on function public.t2_contract_scope_set_v1(bigint,bigint,bigint,integer,integer,jsonb,uuid) to service_role;
commit;
