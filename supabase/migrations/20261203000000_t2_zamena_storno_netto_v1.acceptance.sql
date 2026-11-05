-- Qabul (BEGIN..ROLLBACK, sintetik): migratsiya qo'llangandan KEYIN ishga tushiriladi. Hech narsa saqlanmaydi.
-- Fixture: asl A (100 m3), zamena R (A ni almashtiradi, 40 m3, almashtirish_hajm 40), qo'shimcha D.
-- F2#1 (tasdiqlangan): R=40, D=10. F2#2 qoralama: storno bloki −R, −D.
begin;
do $test$
declare c bigint; o bigint; rz bigint; a_ bigint; r_ bigint; d_ bigint; f1 bigint; f2 bigint; fk bigint; snapA jsonb; snapF1 jsonb;
begin
  insert into public.t2_kompaniya(nom,kod) values('_TEST_ZSN_',gen_random_uuid()::text) returning id into c;
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_ZSN_',c) returning id into o;
  insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,tartib) values(o,c,'rz','_TEST_ZSN_rz',1) returning id into rz;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_ZSN_A','m3',100,10,1000,2) returning id into a_;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib,qoshimcha,zamena,change_type,replaces_line_id,almashtirish_hajm)
    values(o,c,rz,'bl','_TEST_ZSN_R','m3',40,10,400,3,true,true,'REPLACEMENT',a_,40) returning id into r_;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib,qoshimcha,change_type)
    values(o,c,rz,'bl','_TEST_ZSN_D','m3',10,10,100,4,true,'ADDITIONAL') returning id into d_;
  select to_jsonb(q) into snapA from public.t2_qator q where id=a_;

  -- F2#1: R=40, D=10 -> tasdiqlangan.
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o,'f2','2026-10-01','qoralama') returning id into f1;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(f1,r_,o,40,10),(f1,d_,o,10,10);
  update public.t2_akt set holat='tasdiqlangan' where id=f1;
  select coalesce(jsonb_agg(to_jsonb(aq) order by aq.id),'[]') into snapF1 from public.t2_akt_qator aq where aq.akt_id=f1;
  if public.t2_almashtirilgan_hajm(a_) <> 40 then raise exception '1: R kuchda — A 40 ga yopiq bo''lishi kerak: %', public.t2_almashtirilgan_hajm(a_); end if;

  -- F2#2 qoralama: storno bloki −R, −D (fakt R hali 0).
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o,'f2','2026-11-01','qoralama') returning id into f2;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx,raw_snapshot)
    values(f2,r_,o,-40,10,jsonb_build_object('source','storno','stornoOf',f1)),(f2,d_,o,-10,10,jsonb_build_object('source','storno','stornoOf',f1));
  if public.t2_almashtirilgan_hajm(a_) <> 0 then raise exception '2: R to''liq stornolangan, fakt yo''q — A to''liq ochiq bo''lishi kerak: %', public.t2_almashtirilgan_hajm(a_); end if;
  if (select qoldiq_hajm from public.t2_qator_holat where qator_id=a_) <> 100 then raise exception '3: A qoldig''i 100 emas'; end if;
  -- Yuridik «olingan» (f2_hajm) o'zgarmaydi: faqat tasdiqlangan F2.
  if (select f2_hajm from public.t2_qator_holat where qator_id=r_) <> 40 then raise exception '4: f2_hajm o''zgarib qoldi'; end if;

  -- Teskari holat: R ning fakti bor (30) -> R kuchda, A 30 ga yopiq (almashtirish_hajm 40 * 30/40).
  insert into public.t2_akt(obyekt_id,tur,oy,holat) values(o,'fakt','2026-11-01','qoralama') returning id into fk;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,hajm,narx) values(fk,r_,o,30,10);
  if public.t2_almashtirilgan_hajm(a_) <> 30 then raise exception '5: fakti bor zamena kuchda bo''lishi kerak (30): %', public.t2_almashtirilgan_hajm(a_); end if;
  delete from public.t2_akt_qator where akt_id=fk;

  -- Storno qoralamasi bekor qilinsa — yopish qaytadi.
  update public.t2_akt set holat='bekor' where id=f2;
  if public.t2_almashtirilgan_hajm(a_) <> 40 then raise exception '6: bekor storno hisobga olinmasligi kerak: %', public.t2_almashtirilgan_hajm(a_); end if;
  update public.t2_akt set holat='qoralama' where id=f2;
  -- Oddiy (storno bo'lmagan) qoralama qatorlari progressga kirmaydi.
  update public.t2_akt_qator set raw_snapshot = jsonb_build_object('source','native_f2_preparation') where akt_id=f2 and qator_id=r_;
  if public.t2_almashtirilgan_hajm(a_) <> 40 then raise exception '7: oddiy qoralama qatori progressga kirdi: %', public.t2_almashtirilgan_hajm(a_); end if;

  -- O'zgarmaslik: asl smeta va tasdiqlangan F2.
  if snapA is distinct from (select to_jsonb(q) from public.t2_qator q where id=a_) then raise exception '8: asl qator o''zgargan'; end if;
  if snapF1 is distinct from (select coalesce(jsonb_agg(to_jsonb(aq) order by aq.id),'[]') from public.t2_akt_qator aq where aq.akt_id=f1) then raise exception '9: tasdiqlangan F2 o''zgargan'; end if;
  if has_table_privilege('anon','public.t2_zamena_qoplash','select') or has_table_privilege('authenticated','public.t2_zamena_qoplash','select') then raise exception '10: ruxsat ochiq'; end if;
end $test$;
rollback;
