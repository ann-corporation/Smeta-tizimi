create or replace function public.t2_normativ_qidir_v1(
 p_actor_id bigint, p_kompaniya_id bigint, p_q text, p_tahrir text,
 p_hujjat_id uuid, p_sha text, p_limit integer
) returns jsonb language plpgsql stable security invoker
set search_path=public,extensions,pg_temp as $$
declare
 q text := btrim(p_q);
 terms tsquery;
 best record;
 matches jsonb;
begin
 if p_kompaniya_id is null or p_kompaniya_id <= 0 or
    not public.t2_normativ_ruxsat_v1(p_actor_id,p_kompaniya_id,false) then
   return jsonb_build_object('ok',false,'code','FORBIDDEN');
 end if;
 if p_limit is null or p_limit not between 1 and 4 or
    (p_tahrir is not null and length(btrim(p_tahrir)) not between 1 and 120) or
    (p_hujjat_id is null and (q is null or length(q) not between 2 and 120 or p_sha is not null)) or
    (p_hujjat_id is not null and (q is not null or p_tahrir is not null or p_sha is null or p_sha !~ '^[0-9a-f]{64}$')) then
   return jsonb_build_object('ok',false,'code','INPUT_INVALID');
 end if;
 -- A missing reference code must not be replaced by a similar-looking code.
 if q !~ '^(\s*[[:alpha:]]{1,6}\s*)?[0-9]+([.:-][0-9]+)+[[:alpha:]]?$' then
   terms := plainto_tsquery('pg_catalog.simple',q);
 end if;
 with documents as (
   select id, case when lower(norma_kod)=lower(q) then 1
     when qidiruv @@ terms then 2 else 3 end as rank
   from public.t2_normativ_hujjat
   where holat='PUBLISHED' and p_hujjat_id is null and
     (lower(norma_kod)=lower(q) or qidiruv @@ terms or (terms is not null and nom operator(extensions.%) q))
 ), chunks as (
   select hujjat_id, sha256, case when lower(jadval_kod)=lower(q) then 0
     when qidiruv @@ terms then 2 else 3 end as rank
   from public.t2_normativ_bolak
   where p_hujjat_id is null and
     (lower(jadval_kod)=lower(q) or qidiruv @@ terms or (terms is not null and qidiruv_yorliq operator(extensions.%) q))
 ), candidates as (
   select d.id, b.sha256, d.rank from documents d
     cross join lateral (select sha256 from public.t2_normativ_bolak
       where hujjat_id=d.id order by tartib limit p_limit) b
   union all select hujjat_id, sha256, rank from chunks
   union all select p_hujjat_id, p_sha, 0 where p_hujjat_id is not null
 )
 select d.id, d.norma_kod, c.rank into best
 from candidates c join public.t2_normativ_hujjat d on d.id=c.id
 join public.t2_normativ_bolak b on b.hujjat_id=c.id and b.sha256=c.sha256
 where d.holat='PUBLISHED' and (p_tahrir is null or lower(d.tahrir)=lower(btrim(p_tahrir)))
 order by c.rank, d.norma_kod, d.id, b.tartib limit 1;
 if not found then return jsonb_build_object('ok',true,'natijalar','[]'::jsonb); end if;
 if p_hujjat_id is null and p_tahrir is null and (
   select count(distinct lower(tahrir)) from public.t2_normativ_hujjat
   where holat='PUBLISHED' and lower(norma_kod)=lower(best.norma_kod)
 ) > 1 then
   return jsonb_build_object('ok',true,'code','EDITION_REQUIRED','natijalar','[]'::jsonb);
 end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.tartib), '[]'::jsonb) into matches
 from (
   select d.id as hujjat_id,d.norma_kod,d.tahrir,d.nom,d.source_sha,d.job_sha,
     b.sha256,b.r2_key,b.bayt,b.unit,b.tartib,b.sahifa_pdf,b.sahifa_bosma,b.bob_punkt,b.jadval_kod
   from public.t2_normativ_hujjat d join public.t2_normativ_bolak b on b.hujjat_id=d.id
   where d.id=best.id and d.holat='PUBLISHED' and (
     (p_hujjat_id is not null and b.sha256=p_sha) or
     (p_hujjat_id is null and case best.rank
       when 0 then lower(b.jadval_kod)=lower(q)
       when 1 then true
       when 2 then b.qidiruv @@ terms or d.qidiruv @@ terms
       else b.qidiruv_yorliq operator(extensions.%) q or d.nom operator(extensions.%) q end)
   ) order by b.tartib limit p_limit
 ) r;
 return jsonb_build_object('ok',true,'natijalar',matches);
end $$;
revoke all on function public.t2_normativ_qidir_v1(bigint,bigint,text,text,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.t2_normativ_qidir_v1(bigint,bigint,text,text,uuid,text,integer) to service_role;
