begin;
insert into public.t2_foydalanuvchi(login,ism,holat)
values ('k3-reader','K3 synthetic reader','faol'),('k3-inactive','K3 synthetic inactive','bekor');
insert into public.t2_kompaniya(nom,kod) values ('K3 synthetic','K3-SYN');
insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol,holat)
select u.id,k.id,'pto','faol' from public.t2_foydalanuvchi u
cross join public.t2_kompaniya k where u.login in ('k3-reader','k3-inactive') and k.kod='K3-SYN';
insert into public.t2_normativ_hujjat(id,source_sha,job_sha,reader_versiya,norma_kod,tahrir,nom,bayt,holat,
 yaratgan_id,tekshirgan_id,tekshirildi,operation_id,input_sha)
select ('99999999-0000-0000-0000-00000000000'||n)::uuid,repeat('a',64),repeat(n::text,64),'test',
 case when n>=3 then 'KTH 09-11-0'||n else 'KTH 06-01-01' end,n::text,'K3 Synthetic limestone',1,
 case when n=3 then 'INDEXED' else 'PUBLISHED' end,
 u.id,u.id,now(),gen_random_uuid(),'test'
from generate_series(1,4) n cross join public.t2_foydalanuvchi u where u.login='k3-reader';
insert into public.t2_normativ_bolak(hujjat_id,sha256,unit_sha,unit,tartib,jadval_kod,qidiruv_yorliq,bayt)
select id,repeat('c',64),repeat('d',64),'page-1',0,'KTH 06-01-02','K3 Synthetic aggregate',1
from public.t2_normativ_hujjat where id::text like '99999999-0000-0000-0000-00000000000%' and tahrir<>'4';
insert into public.t2_normativ_bolak(hujjat_id,sha256,unit_sha,unit,tartib,jadval_kod,bayt)
select id,repeat('e',64),repeat('f',64),'page-2',1,'KTH 09-12-01',1
from public.t2_normativ_hujjat where id in ('99999999-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000004');
set local role service_role;
do $$
declare
 a bigint := (select id from public.t2_foydalanuvchi where login='k3-reader');
 inactive bigint := (select id from public.t2_foydalanuvchi where login='k3-inactive');
 k bigint := (select id from public.t2_kompaniya where kod='K3-SYN');
 r jsonb;
begin
 r:=public.t2_normativ_qidir_v1(a,k,'KTH 06-01-02',null,null,null,3);
 if r->>'code' is distinct from 'EDITION_REQUIRED' then raise exception 'K3 edition collision: %',r; end if;
 r:=public.t2_normativ_qidir_v1(a,k,'KTH 09-12-01',null,null,null,3);
 if r->>'code' is distinct from 'REFERENCE_AMBIGUOUS' then raise exception 'K3 table code collision: %',r; end if;
 r:=public.t2_normativ_qidir_v1(a,k,'KTH 06-01-01','2',null,null,3);
 if r#>>'{natijalar,0,tahrir}' is distinct from '2' then raise exception 'K3 exact document: %',r; end if;
 r:=public.t2_normativ_qidir_v1(a,k,'KTH 06-01-02','1',null,null,3);
 if r#>>'{natijalar,0,jadval_kod}' is distinct from 'KTH 06-01-02' then raise exception 'K3 exact table: %',r; end if;
 if jsonb_array_length(public.t2_normativ_qidir_v1(a,k,'KTH 06-01-03','1',null,null,3)->'natijalar')<>0
 or jsonb_array_length(public.t2_normativ_qidir_v1(a,k,'KTH 09-11-03','3',null,null,3)->'natijalar')<>0
 or jsonb_array_length(public.t2_normativ_qidir_v1(a,k,null,null,'99999999-0000-0000-0000-000000000003',repeat('c',64),1)->'natijalar')<>0 then
   raise exception 'K3 unknown or unpublished reference leaked';
 end if;
 if jsonb_array_length(public.t2_normativ_qidir_v1(a,k,'aggregate','1',null,null,3)->'natijalar')<>1
 or jsonb_array_length(public.t2_normativ_qidir_v1(a,k,'K3 Synthetic limestne','1',null,null,3)->'natijalar')<>2
 or jsonb_array_length(public.t2_normativ_qidir_v1(a,k,null,null,'99999999-0000-0000-0000-000000000001',repeat('c',64),1)->'natijalar')<>1 then
   raise exception 'K3 lexical, trigram or citation lookup failed';
 end if;
 if public.t2_normativ_qidir_v1(a,k+100,'aggregate',null,null,null,1)->>'code' is distinct from 'FORBIDDEN'
 or public.t2_normativ_qidir_v1(inactive,k,'aggregate',null,null,null,1)->>'code' is distinct from 'FORBIDDEN' then
   raise exception 'K3 tenant/actor gate failed';
 end if;
 raise notice 'T2_NORMATIV_QIDIR_V1_ACCEPTANCE_PASS';
end $$;
rollback;
