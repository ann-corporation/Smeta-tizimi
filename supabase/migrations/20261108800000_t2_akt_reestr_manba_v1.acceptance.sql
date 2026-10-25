-- Qabul (BEGIN..ROLLBACK, sintetik): migratsiya qo'llangandan KEYIN ishga tushiriladi. Hech narsa saqlanmaydi.
begin;
do $test$
declare c bigint; o bigint; a1 bigint; a2 bigint; a3 bigint; a4 bigint; s bigint; r record;
begin
  insert into public.t2_kompaniya(nom,kod) values('_TEST_RM_',gen_random_uuid()::text) returning id into c;
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_RM_',c) returning id into o;
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o,'f2','2026-10-01','qoralama') returning id into a1;
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o,'f2','2026-11-01','qoralama') returning id into a2;
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o,'f2','2026-12-01','qoralama') returning id into a3;
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o,'f2','2027-01-01','qoralama') returning id into a4;
  -- a1: import (job+hujjat satr ko'rinishida), a2: f2_v3 belgisi, a3: raw_snapshot bo'sh (tizim), a4: qatorsiz
  insert into public.t2_akt_qator(akt_id,obyekt_id,hajm,narx,raw_snapshot) values(a1,o,1,1,'{"import_job_id":"77","hujjat_id":5,"manba":"x"}'::jsonb);
  insert into public.t2_akt_qator(akt_id,obyekt_id,hajm,narx,raw_snapshot) values(a1,o,2,1,'{"import_job_id":"99"}'::jsonb);
  insert into public.t2_akt_qator(akt_id,obyekt_id,hajm,narx,raw_snapshot) values(a2,o,1,1,'{"manba":"f2_v3"}'::jsonb);
  insert into public.t2_akt_qator(akt_id,obyekt_id,hajm,narx,raw_snapshot) values(a3,o,1,1,'{}'::jsonb);
  select * into r from public.t2_akt_reestr where id=a1;
  if r.manba_bor is not true or r.import_job_id <> 77 or r.hujjat_id <> 5 or r.manba <> 'x' then raise exception 'RM1: a1 noto''g''ri %', to_jsonb(r); end if;
  if r.qator_soni <> 2 then raise exception 'RM1b: qator_soni buzildi (LATERAL qatorni ko''paytirdi)'; end if;
  select * into r from public.t2_akt_reestr where id=a2;
  if r.manba <> 'f2_v3' or r.import_job_id is not null or r.hujjat_id is not null or r.manba_bor is not true then raise exception 'RM2: a2 %', to_jsonb(r); end if;
  select * into r from public.t2_akt_reestr where id=a3;
  if r.manba is not null or r.import_job_id is not null or r.manba_bor is not true then raise exception 'RM3: a3 %', to_jsonb(r); end if;
  select * into r from public.t2_akt_reestr where id=a4;
  if r.manba_bor is not false then raise exception 'RM4: qatorsiz akt manba_bor=false bo''lishi kerak'; end if;
  if (select count(*) from public.t2_akt_reestr where obyekt_id=o) <> 4 then raise exception 'RM5: aktlar soni 4 emas'; end if;
  -- shartnoma bog' ko'rinishi
  insert into public.t2_shartnoma(kompaniya_id,raqam) values(c,'_TEST_RM_') returning id into s;
  insert into public.t2_shartnoma_bog(obyekt_id,shartnoma_id,holat) values(o,s,'faol');
  if (select count(*) from public.t2_shartnoma_bog_kompaniya where kompaniya_id=c and obyekt_id=o and shartnoma_id=s and holat='faol') <> 1 then raise exception 'RM6: bog'' ko''rinishi'; end if;
  -- ruxsat: anon/authenticated o'qiy olmasligi kerak
  if has_table_privilege('anon','public.t2_shartnoma_bog_kompaniya','select') or has_table_privilege('authenticated','public.t2_shartnoma_bog_kompaniya','select')
     or has_table_privilege('anon','public.t2_akt_reestr','select') or has_table_privilege('authenticated','public.t2_akt_reestr','select') then raise exception 'RM7: anon/authenticated ruxsati bor'; end if;
end
$test$;
rollback;