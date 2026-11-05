-- K2 metadata only. Original/chunk bytes remain immutable in private R2. L0 applies.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create table if not exists public.t2_normativ_hujjat (
  id uuid primary key default gen_random_uuid(),
  source_sha text not null check(source_sha ~ '^[0-9a-f]{64}$'),
  job_sha text not null unique check(job_sha ~ '^[0-9a-f]{64}$'),
  derivative_sha text check(derivative_sha ~ '^[0-9a-f]{64}$'),
  reader_versiya text not null check(length(reader_versiya) between 1 and 200),
  norma_kod text check(length(btrim(norma_kod)) between 1 and 120),
  tahrir text check(length(btrim(tahrir)) between 1 and 120),
  nom text not null check(length(btrim(nom)) between 1 and 500),
  bayt bigint not null check(bayt>0),
  original_r2_key text generated always as ('normativ/original/'||source_sha) stored,
  manifest_r2_key text generated always as ('normativ/manifests/'||job_sha||'.json') stored,
  holat text not null default 'REVIEW_REQUIRED' check(holat in ('REVIEW_REQUIRED','INDEXED','PUBLISHED')),
  review_flags text[] not null default '{}',
  versiya integer not null default 1 check(versiya>0),
  yaratgan_id bigint not null references public.t2_foydalanuvchi(id),
  tekshirgan_id bigint references public.t2_foydalanuvchi(id),
  operation_id uuid not null,
  input_sha text not null,
  amallar jsonb not null default '{}',
  yaratildi timestamptz not null default clock_timestamp(),
  tekshirildi timestamptz,
  unique(yaratgan_id,operation_id),
  qidiruv tsvector generated always as(to_tsvector('pg_catalog.simple'::regconfig,coalesce(norma_kod,'')||' '||coalesce(tahrir,'')||' '||nom)) stored,
  check(holat<>'PUBLISHED' or (norma_kod is not null and tahrir is not null and tekshirgan_id is not null and tekshirildi is not null))
);
create table if not exists public.t2_normativ_bolak (
  hujjat_id uuid not null references public.t2_normativ_hujjat(id),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  unit_sha text not null check(unit_sha ~ '^[0-9a-f]{64}$'),
  r2_key text generated always as ('normativ/chunks/'||sha256||'.json') stored,
  unit text not null check(unit ~ '^(page|block|footnote)-[0-9]+$'),
  tartib integer not null check(tartib>=0),
  sahifa_pdf integer check(sahifa_pdf>0),
  sahifa_bosma text check(length(sahifa_bosma)<=80),
  bob_punkt text check(length(bob_punkt)<=200),
  jadval_kod text check(length(jadval_kod)<=120),
  qidiruv_yorliq text not null default '' check(length(qidiruv_yorliq)<=500),
  bayt bigint not null check(bayt>0),
  qidiruv tsvector generated always as(to_tsvector('pg_catalog.simple'::regconfig,coalesce(jadval_kod,'')||' '||coalesce(bob_punkt,'')||' '||qidiruv_yorliq)) stored,
  primary key(hujjat_id,sha256), unique(hujjat_id,unit), unique(hujjat_id,tartib)
);
create index if not exists t2_normativ_hujjat_fts on public.t2_normativ_hujjat using gin(qidiruv);
create index if not exists t2_normativ_bolak_fts on public.t2_normativ_bolak using gin(qidiruv);
create index if not exists t2_normativ_nom_trgm on public.t2_normativ_hujjat using gin(nom extensions.gin_trgm_ops);
create index if not exists t2_normativ_yorliq_trgm on public.t2_normativ_bolak using gin(qidiruv_yorliq extensions.gin_trgm_ops);
alter table public.t2_normativ_hujjat enable row level security;
alter table public.t2_normativ_bolak enable row level security;
revoke all on public.t2_normativ_hujjat,public.t2_normativ_bolak from public,anon,authenticated,service_role;
grant select,insert,update on public.t2_normativ_hujjat to service_role;
grant select,insert on public.t2_normativ_bolak to service_role;
-- Existing app uses a trusted service-role BFF, not Supabase auth.uid(). Actor gates are inside RPCs.
create or replace function public.t2_normativ_ruxsat_v1(p_actor_id bigint,p_kompaniya_id bigint,p_yozish boolean)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.t2_foydalanuvchi u where u.id=p_actor_id and u.holat='faol')
 and (public.t2_platforma_superadmin(p_actor_id) or (not p_yozish and exists(
   select 1 from public.t2_azolik a join public.t2_kompaniya k on k.id=a.kompaniya_id
   where a.foydalanuvchi_id=p_actor_id and a.kompaniya_id=p_kompaniya_id and a.holat='faol' and k.faol)));
$$;
create or replace function public.t2_normativ_hujjat_qosh_v1(p_actor_id bigint,p_operation_id uuid,p_doc jsonb,p_bolaklar jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare d public.t2_normativ_hujjat; h text; b jsonb;
begin
 if not public.t2_normativ_ruxsat_v1(p_actor_id,null,true) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 if p_operation_id is null or jsonb_typeof(p_doc) is distinct from 'object' or jsonb_typeof(p_bolaklar) is distinct from 'array'
   or jsonb_array_length(p_bolaklar) not between 0 and 10000 then return jsonb_build_object('ok',false,'code','INPUT_INVALID'); end if;
 if p_doc - array['source_sha','job_sha','derivative_sha','reader_versiya','norma_kod','tahrir','nom','bayt','review_flags'] <> '{}'::jsonb then
   return jsonb_build_object('ok',false,'code','METADATA_ONLY'); end if;
 h:=encode(sha256(convert_to(p_doc::text||p_bolaklar::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('normativ:'||coalesce(p_doc->>'job_sha',''),0));
 select * into d from public.t2_normativ_hujjat where job_sha=p_doc->>'job_sha' or (yaratgan_id=p_actor_id and operation_id=p_operation_id) for update;
 if found then
   if d.yaratgan_id=p_actor_id and d.operation_id=p_operation_id and d.input_sha=h then return jsonb_build_object('ok',true,'id',d.id,'versiya',1); end if;
   return jsonb_build_object('ok',false,'code','IMMUTABLE_CONFLICT');
 end if;
 insert into public.t2_normativ_hujjat(source_sha,job_sha,derivative_sha,reader_versiya,norma_kod,tahrir,nom,bayt,review_flags,yaratgan_id,operation_id,input_sha)
 values(p_doc->>'source_sha',p_doc->>'job_sha',p_doc->>'derivative_sha',p_doc->>'reader_versiya',p_doc->>'norma_kod',p_doc->>'tahrir',p_doc->>'nom',
   (p_doc->>'bayt')::bigint,array(select jsonb_array_elements_text(coalesce(p_doc->'review_flags','[]'::jsonb))),p_actor_id,p_operation_id,h) returning * into d;
 for b in select value from jsonb_array_elements(p_bolaklar) loop
   if jsonb_typeof(b) is distinct from 'object' or b-array['sha256','unit_sha','unit','tartib','sahifa_pdf','sahifa_bosma','bob_punkt','jadval_kod','qidiruv_yorliq','bayt']<>'{}'::jsonb then
     raise exception 'METADATA_ONLY' using errcode='22023'; end if;
   insert into public.t2_normativ_bolak(hujjat_id,sha256,unit_sha,unit,tartib,sahifa_pdf,sahifa_bosma,bob_punkt,jadval_kod,qidiruv_yorliq,bayt)
   values(d.id,b->>'sha256',b->>'unit_sha',b->>'unit',(b->>'tartib')::integer,(b->>'sahifa_pdf')::integer,b->>'sahifa_bosma',b->>'bob_punkt',b->>'jadval_kod',coalesce(b->>'qidiruv_yorliq',''),(b->>'bayt')::bigint);
 end loop;
 return jsonb_build_object('ok',true,'id',d.id,'versiya',1);
exception when check_violation or not_null_violation or unique_violation or invalid_parameter_value or invalid_text_representation or numeric_value_out_of_range then
 return jsonb_build_object('ok',false,'code','INPUT_INVALID');
end $$;
create or replace function public.t2_normativ_holat_v1(p_actor_id bigint,p_id uuid,p_holat text,p_kutilgan_versiya integer,p_operation_id uuid,p_review_sha text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare d public.t2_normativ_hujjat; h text; op text:=p_operation_id::text;
begin
 if not public.t2_normativ_ruxsat_v1(p_actor_id,null,true) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_REQUIRED'); end if;
 if p_holat is null or p_holat not in ('REVIEW_REQUIRED','INDEXED','PUBLISHED') then return jsonb_build_object('ok',false,'code','STATE_INVALID'); end if;
 select * into d from public.t2_normativ_hujjat where id=p_id for update;
 if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
 h:=encode(sha256(convert_to(jsonb_build_array(p_actor_id,p_holat,p_kutilgan_versiya,p_review_sha)::text,'UTF8')),'hex');
 if d.amallar ? op then
   if d.amallar->op->>'hash'=h then return jsonb_build_object('ok',true,'versiya',(d.amallar->op->>'versiya')::integer); end if;
   return jsonb_build_object('ok',false,'code','OPERATION_CONFLICT');
 end if;
 if p_kutilgan_versiya is distinct from d.versiya then return jsonb_build_object('ok',false,'code','STALE_VERSION'); end if;
 if p_holat<>'REVIEW_REQUIRED' and (p_review_sha is distinct from d.job_sha or d.norma_kod is null or d.tahrir is null or
    not exists(select 1 from public.t2_normativ_bolak where hujjat_id=d.id) or
    not d.review_flags <@ array['SEMANTIC_REVIEW_REQUIRED','METADATA_UNCONFIRMED','IMAGE_REGION_REVIEW','FOOTNOTE_LINK_REVIEW','NESTED_TABLE_REVIEW','TRACKED_REVISIONS_REVIEW']) then
    return jsonb_build_object('ok',false,'code','REVIEW_REQUIRED'); end if;
 if not ((d.holat='REVIEW_REQUIRED' and p_holat='INDEXED') or (d.holat='INDEXED' and p_holat='PUBLISHED') or p_holat='REVIEW_REQUIRED') then
    return jsonb_build_object('ok',false,'code','STATE_INVALID'); end if;
 update public.t2_normativ_hujjat set holat=p_holat,versiya=versiya+1,tekshirgan_id=p_actor_id,tekshirildi=clock_timestamp(),
   review_flags=case when p_holat='INDEXED' then '{}'::text[] else review_flags end,
   amallar=amallar||jsonb_build_object(op,jsonb_build_object('hash',h,'versiya',versiya+1,'actor',p_actor_id,'state',p_holat)) where id=p_id returning * into d;
 return jsonb_build_object('ok',true,'versiya',d.versiya);
end $$;
create or replace function public.t2_normativ_oqi_v1(p_actor_id bigint,p_kompaniya_id bigint,p_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare admin boolean:=public.t2_platforma_superadmin(p_actor_id); result jsonb;
begin
 if not public.t2_normativ_ruxsat_v1(p_actor_id,p_kompaniya_id,false) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 select coalesce(jsonb_agg(to_jsonb(d)-'qidiruv'-'amallar'-'input_sha'-'operation_id'), '[]'::jsonb) into result from (
   select * from public.t2_normativ_hujjat where (p_id is null or id=p_id) and (admin or holat='PUBLISHED') order by norma_kod,id limit 100) d;
 return jsonb_build_object('ok',true,'hujjatlar',result,'bolaklar',case when p_id is null then '[]'::jsonb else (
   select coalesce(jsonb_agg(to_jsonb(b)-'qidiruv' order by b.tartib),'[]'::jsonb) from public.t2_normativ_bolak b
   join public.t2_normativ_hujjat d on d.id=b.hujjat_id where d.id=p_id and (admin or d.holat='PUBLISHED')) end);
end $$;
revoke all on function public.t2_normativ_ruxsat_v1(bigint,bigint,boolean),public.t2_normativ_hujjat_qosh_v1(bigint,uuid,jsonb,jsonb),
 public.t2_normativ_holat_v1(bigint,uuid,text,integer,uuid,text),public.t2_normativ_oqi_v1(bigint,bigint,uuid) from public,anon,authenticated;
grant execute on function public.t2_normativ_ruxsat_v1(bigint,bigint,boolean),public.t2_normativ_hujjat_qosh_v1(bigint,uuid,jsonb,jsonb),
 public.t2_normativ_holat_v1(bigint,uuid,text,integer,uuid,text),public.t2_normativ_oqi_v1(bigint,bigint,uuid) to service_role;
