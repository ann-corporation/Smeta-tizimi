-- Qabul (BEGIN..ROLLBACK, sintetik): migratsiya qo'llangandan KEYIN. Hech narsa saqlanmaydi.
begin;
do $test$
declare c bigint; o1 bigint; o2 bigint; o3 bigint; s bigint; a1 bigint; a2 bigint; a3 bigint; ok boolean;
begin
  insert into public.t2_kompaniya(nom,kod) values('_TEST_RT_',gen_random_uuid()::text) returning id into c;
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_RT1_',c) returning id into o1;
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_RT2_',c) returning id into o2;
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_RT3_',c) returning id into o3;
  insert into public.t2_shartnoma(kompaniya_id,raqam) values(c,'_TEST_RT_') returning id into s;
  insert into public.t2_shartnoma_bog(obyekt_id,shartnoma_id,holat) values(o1,s,'faol'),(o2,s,'faol');
  insert into public.t2_akt(kompaniya_id,obyekt_id,tur,oy,holat,raqam,shartnoma_id) values(c,o1,'f2','2026-10-01','qoralama','49',s) returning id into a1;
  -- 1) boshqa obyekt, BIR shartnoma, boshqa oy, katta-kichik/bo'shliq farqi: BLOK
  ok := false;
  begin insert into public.t2_akt(kompaniya_id,obyekt_id,tur,oy,holat,raqam,shartnoma_id) values(c,o2,'f2','2026-11-01','qoralama',' 49 ',s);
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'RT1: shartnoma doirasida takror raqam o''tib ketdi'; end if;
  -- 2) o'sha obyektda boshqa oy, shartnomasiz: BLOK
  ok := false;
  begin insert into public.t2_akt(kompaniya_id,obyekt_id,tur,oy,holat,raqam) values(c,o1,'f2','2026-12-01','qoralama','49');
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'RT2: obyekt doirasida takror o''tib ketdi'; end if;
  -- 3) boshqa raqam, boshqa shartnomasiz obyekt va bo'sh raqam: RUXSAT
  insert into public.t2_akt(kompaniya_id,obyekt_id,tur,oy,holat,raqam) values(c,o1,'f2','2026-12-01','qoralama','50') returning id into a2;
  insert into public.t2_akt(kompaniya_id,obyekt_id,tur,oy,holat,raqam) values(c,o3,'f2','2026-10-01','qoralama','49') returning id into a3;
  insert into public.t2_akt(kompaniya_id,obyekt_id,tur,oy,holat) values(c,o1,'f2','2027-01-01','qoralama');
  insert into public.t2_akt(kompaniya_id,obyekt_id,tur,oy,holat) values(c,o1,'f2','2027-02-01','qoralama');
  -- 4) tuzatish akti (manba='tuzatish') va bekor akt istisno
  insert into public.t2_akt(kompaniya_id,obyekt_id,tur,oy,holat,raqam,manba,shartnoma_id) values(c,o1,'f2','2026-08-01','qoralama','49','tuzatish',s);
  insert into public.t2_akt(kompaniya_id,obyekt_id,tur,oy,holat,raqam,shartnoma_id) values(c,o2,'f2','2026-10-01','bekor','49',s);
  -- 5) bekor aktni qaytarish takror bo'lsa: BLOK
  ok := false;
  begin update public.t2_akt set holat='qoralama' where kompaniya_id=c and obyekt_id=o2 and holat='bekor';
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'RT5: bekordan qaytarishda takror o''tib ketdi'; end if;
  -- 6) mavjud takror (trigger o'chiq holda yaratilgan) holat o'tishi bloklanmaydi
  alter table public.t2_akt disable trigger t2_akt_raqam_takror;
  insert into public.t2_akt(kompaniya_id,obyekt_id,tur,oy,holat,raqam,shartnoma_id) values(c,o2,'f2','2026-09-01','qoralama','77',s);
  insert into public.t2_akt(kompaniya_id,obyekt_id,tur,oy,holat,raqam,shartnoma_id) values(c,o1,'f2','2026-09-01','qoralama','77',s);
  alter table public.t2_akt enable trigger t2_akt_raqam_takror;
  update public.t2_akt set izoh='x' where kompaniya_id=c and raqam='77';
  update public.t2_akt set raqam=' 77' where kompaniya_id=c and raqam='77' and obyekt_id=o2;
end
$test$;
rollback;