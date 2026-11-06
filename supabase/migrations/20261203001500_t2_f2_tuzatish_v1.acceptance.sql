-- Qabul (BEGIN..ROLLBACK, o'zi yetarli sintetik ma'lumot): migratsiya qo'llangandan KEYIN ishga tushiriladi. Hech narsa saqlanmaydi.
-- Muvaffaqiyat: NOTICE 'F2_TUZATISH_ACCEPTANCE_PASS'.
begin;
do $test$
declare c bigint; a bigint; o bigint; rz bigint; x bigint; y bigint; z bigint;
  s bigint; l1 bigint; l2 bigint; lz bigint; d bigint; d2 bigint; d3 bigint; rr bigint; n1 bigint; n2 bigint; fk bigint;
  r jsonb; v int; v0 int; op uuid; pl jsonb; st1 jsonb; st2 jsonb; yq jsonb; xato text;
begin
  insert into public.t2_kompaniya(nom,kod) values('_TEST_F2T_',gen_random_uuid()::text) returning id into c;
  insert into public.t2_foydalanuvchi(login) values('_TEST_F2T_'||gen_random_uuid()) returning id into a;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol) values(a,c,'admin');
  insert into public.t2_obyekt(nom,kompaniya_id) values('_TEST_F2T_',c) returning id into o;
  insert into public.t2_qator(obyekt_id,kompaniya_id,tur,nom,tartib) values(o,c,'rz','_TEST_F2T_rz',1) returning id into rz;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_F2T_X','m3',200,10,2000,2) returning id into x;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_F2T_Y','m3',50,10,500,3) returning id into y;
  insert into public.t2_qator(obyekt_id,kompaniya_id,ota_id,tur,nom,birlik,hajm,narx,summa,tartib) values(o,c,rz,'bl','_TEST_F2T_Z','m3',30,5,150,4) returning id into z;

  -- Manba S: tasdiqlangan (pereraschet uslubidagi) F2 — X da ikki qator (+40, −10), Z da +5.
  insert into public.t2_akt(obyekt_id,kompaniya_id,tur,oy,holat,raqam) values(o,c,'f2','2026-09-01','qoralama','_T_F2T_S') returning id into s;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,kompaniya_id,hajm,narx,certified_quantity,certified_unit_price,certified_amount)
    values(s,x,o,c,40,10,40,10,400) returning id into l1;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,kompaniya_id,hajm,narx,certified_quantity,certified_unit_price,certified_amount)
    values(s,x,o,c,-10,10,-10,10,-100) returning id into l2;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,kompaniya_id,hajm,narx,certified_quantity,certified_unit_price,certified_amount)
    values(s,z,o,c,5,5,5,5,25) returning id into lz;
  update public.t2_akt set holat='tasdiqlangan' where id=s;

  yq := jsonb_build_object('qator_id',y,'certified_quantity',5,'certified_unit_price',10,'certified_amount',50,
          'raw_snapshot',jsonb_build_object('source','native_f2_preparation'));

  -- 1) Versiya CAS (A6/C-M3).
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(yq),a,'_T_F2T_D',gen_random_uuid());
  if (r->>'ok')::boolean is not true then raise exception '1: yaratilmadi: %', r; end if;
  d := (r->>'akt_id')::bigint;
  select versiya into v0 from public.t2_akt where id=d;
  r := public.t2_f2_qoralama_yangila_v1(a,c,d,v0,jsonb_build_array(yq),gen_random_uuid());
  if (r->>'ok')::boolean is not true then raise exception '1a: %', r; end if;
  select versiya into v from public.t2_akt where id=d;
  if v <> v0 + 1 or (r->>'versiya')::int <> v then raise exception '1b: versiya oshmadi: % -> % (%)', v0, v, r; end if;
  r := public.t2_f2_qoralama_yangila_v1(a,c,d,v0,jsonb_build_array(yq),gen_random_uuid());
  if r->>'code' is distinct from 'STALE_VERSION' then raise exception '1c: eski versiya o''tdi: %', r; end if;

  -- 5) Pereraschet F2 ni storno: X da ikki storno (manba qatori bo'yicha) + plyus — qabul.
  st1 := jsonb_build_object('qator_id',x,'certified_quantity',-40,'certified_unit_price',10,'certified_amount',-400,
           'raw_snapshot',jsonb_build_object('source','storno','stornoOf',s,'manba_akt_qator_id',l1));
  st2 := jsonb_build_object('qator_id',x,'certified_quantity',10,'certified_unit_price',10,'certified_amount',100,
           'raw_snapshot',jsonb_build_object('source','storno','stornoOf',s,'manba_akt_qator_id',l2));
  pl := jsonb_build_object('qator_id',x,'certified_quantity',60,'certified_unit_price',10,'certified_amount',600,
           'raw_snapshot',jsonb_build_object('source','native_f2_preparation'));
  r := public.t2_f2_qoralama_yangila_v1(a,c,d,v,jsonb_build_array(st1,st2,pl),gen_random_uuid());
  if (r->>'ok')::boolean is not true then raise exception '5: ikki storno + plyus rad: %', r; end if;
  if (select count(*) from public.t2_akt_qator where akt_id=d and qator_id=x) <> 3 then raise exception '5a: 3 qator emas'; end if;
  if not exists (select 1 from public.t2_akt_qator where akt_id=d and certified_quantity=10 and raw_snapshot->>'manba_akt_qator_id'=l2::text)
     or exists (select 1 from public.t2_akt_qator where akt_id=d and manba_akt_qator_id is not null) then
    raise exception '5b: manba izi noto''g''ri: %', (select jsonb_agg(to_jsonb(q)) from public.t2_akt_qator q where akt_id=d);
  end if;
  select versiya into v from public.t2_akt where id=d;
  r := public.t2_f2_qoralama_yangila_v1(a,c,d,v,jsonb_build_array(st1,st1),gen_random_uuid());
  if r->>'code' is distinct from 'DUPLICATE_F2_SOURCE_LINE' then raise exception '5c: bir manba qatoriga ikki storno o''tdi: %', r; end if;
  r := public.t2_f2_qoralama_yangila_v1(a,c,d,v,jsonb_build_array(st1, st2 || jsonb_build_object('raw_snapshot',jsonb_build_object('source','storno','stornoOf',s))),gen_random_uuid());
  if r->>'code' is distinct from 'DUPLICATE_F2_SOURCE_LINE' then raise exception '5d: manbasiz + manbali storno o''tdi: %', r; end if;
  r := public.t2_f2_qoralama_yangila_v1(a,c,d,v,jsonb_build_array(pl,pl),gen_random_uuid());
  if r->>'code' is distinct from 'DUPLICATE_F2_SOURCE_LINE' then raise exception '5e: ikki oddiy o''tdi: %', r; end if;

  -- 6) Storno himoyasi: hajm oshadi / ishora bir xil / narx boshqa — rad (yangila va yarat_v2).
  r := public.t2_f2_qoralama_yangila_v1(a,c,d,v,jsonb_build_array(st1 || jsonb_build_object('certified_quantity',-50,'certified_amount',-500)),gen_random_uuid());
  if r->>'code' is distinct from 'STORNO_LINE_INVALID' then raise exception '6a: |hajm| > manba o''tdi: %', r; end if;
  r := public.t2_f2_qoralama_yangila_v1(a,c,d,v,jsonb_build_array(st1 || jsonb_build_object('certified_quantity',40,'certified_amount',400)),gen_random_uuid());
  if r->>'code' is distinct from 'STORNO_LINE_INVALID' then raise exception '6b: ishora bir xil o''tdi: %', r; end if;
  r := public.t2_f2_qoralama_yangila_v1(a,c,d,v,jsonb_build_array(st1 || jsonb_build_object('certified_unit_price',11,'certified_amount',-440)),gen_random_uuid());
  if r->>'code' is distinct from 'STORNO_LINE_INVALID' then raise exception '6c: boshqa narx o''tdi: %', r; end if;
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(st1 || jsonb_build_object('certified_quantity',-50,'certified_amount',-500)),a,'_T_F2T_6',gen_random_uuid());
  if r->>'code' is distinct from 'STORNO_LINE_INVALID' then raise exception '6d: yarat_v2 |hajm| > manba o''tdi: %', r; end if;
  if (select count(*) from public.t2_akt_qator where akt_id=d) <> 3 then raise exception '6e: rad etilgan saqlash qatorlarni o''zgartirdi'; end if;

  -- 4) Almashtirilgan qatorga storno yoziladi, oddiy qator — QATOR_ALMASHTIRILGAN.
  update public.t2_qator set versiya_holat='almashtirilgan' where id=z;
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(yq),a,'_T_F2T_D2',gen_random_uuid());
  d2 := (r->>'akt_id')::bigint;
  select versiya into v from public.t2_akt where id=d2;
  r := public.t2_f2_qoralama_yangila_v1(a,c,d2,v,jsonb_build_array(yq, jsonb_build_object('qator_id',z,'certified_quantity',-5,'certified_unit_price',5,'certified_amount',-25,
         'raw_snapshot',jsonb_build_object('source','storno','stornoOf',s,'manba_akt_qator_id',lz))),gen_random_uuid());
  if (r->>'ok')::boolean is not true then raise exception '4a: almashtirilgan qatorga storno rad: %', r; end if;
  select versiya into v from public.t2_akt where id=d2;
  r := public.t2_f2_qoralama_yangila_v1(a,c,d2,v,jsonb_build_array(jsonb_build_object('qator_id',z,'certified_quantity',1,'certified_unit_price',5,'certified_amount',5)),gen_random_uuid());
  if r->>'code' is distinct from 'QATOR_ALMASHTIRILGAN' then raise exception '4b: almashtirilgan qatorga oddiy qator o''tdi: %', r; end if;
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(jsonb_build_object('qator_id',z,'certified_quantity',-5,'certified_unit_price',5,'certified_amount',-25,
         'raw_snapshot',jsonb_build_object('source','storno','stornoOf',s,'manba_akt_qator_id',lz))),a,'_T_F2T_D3',gen_random_uuid());
  if (r->>'ok')::boolean is not true then raise exception '4c: yarat_v2 almashtirilgan storno rad: %', r; end if;
  d3 := (r->>'akt_id')::bigint;
  begin
    insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,kompaniya_id,hajm,narx) values(d3,z,o,c,1,5);
    raise exception '4d: trigger oddiy qatorni o''tkazdi';
  exception when sqlstate 'P0001' then
    get stacked diagnostics xato = message_text;
    if xato not like 'QATOR_ALMASHTIRILGAN%' then raise; end if;
  end;

  -- 2) rejected → draft: qoralama_yangila rad etilgan F2 ni qabul qiladi.
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(yq),a,'_T_F2T_R',gen_random_uuid());
  rr := (r->>'akt_id')::bigint;
  select versiya into v from public.t2_akt where id=rr;
  r := public.t2_akt_lifecycle_transition_v1(c,rr,'submitted',a,v,gen_random_uuid(),null); v := (r->>'version')::int;
  r := public.t2_akt_lifecycle_transition_v1(c,rr,'checked',a,v,gen_random_uuid(),null); v := (r->>'version')::int;
  r := public.t2_akt_lifecycle_transition_v1(c,rr,'rejected',a,v,gen_random_uuid(),'test rad');
  if (r->>'ok')::boolean is not true then raise exception '2: rad qilinmadi: %', r; end if;
  v := (r->>'version')::int;
  r := public.t2_f2_qoralama_yangila_v1(a,c,rr,v,jsonb_build_array(yq || jsonb_build_object('certified_quantity',6,'certified_amount',60)),gen_random_uuid());
  if (r->>'ok')::boolean is not true or (r->>'rad_etilgandan_qaytdi')::boolean is not true then raise exception '2a: rad etilgan F2 yangilanmadi: %', r; end if;
  if (select lifecycle_status from public.t2_akt where id=rr) <> 'draft' or (select versiya from public.t2_akt where id=rr) <> v + 2 then
    raise exception '2b: holat/versiya: % %', (select lifecycle_status from public.t2_akt where id=rr), (select versiya from public.t2_akt where id=rr);
  end if;
  if not exists (select 1 from public.t2_akt_holat_tarix where akt_id=rr and from_status='rejected' and to_status='draft') then raise exception '2c: tarix yo''q'; end if;

  -- 11) Avto qoralama narxsiz qatori: saqlanadi, lekin yuborish/tasdiq — NARXSIZ_QATOR_BOR; sababsiz narxsiz — o'tadi.
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(jsonb_build_object('qator_id',y,'certified_quantity',2,'price_intentionally_absent',true,
         'raw_snapshot',jsonb_build_object('source','native_f2_preparation','narxsizSabab','avto_qoralama'))),a,'_T_F2T_N1',gen_random_uuid());
  if (r->>'ok')::boolean is not true then raise exception '11a: avto narxsiz qoralama yaratilmadi: %', r; end if;
  n1 := (r->>'akt_id')::bigint;
  select versiya into v from public.t2_akt where id=n1;
  r := public.t2_f2_qoralama_yangila_v1(a,c,n1,v,jsonb_build_array(jsonb_build_object('qator_id',y,'certified_quantity',3,'price_intentionally_absent',true,
         'raw_snapshot',jsonb_build_object('narxsizSabab','avto_qoralama'))),gen_random_uuid());
  if (r->>'ok')::boolean is not true or (r->>'narxsiz_avto')::int <> 1 then raise exception '11b: yangila avto narxsiz: %', r; end if;
  v := (r->>'versiya')::int;
  r := public.t2_akt_lifecycle_transition_v1(c,n1,'submitted',a,v,gen_random_uuid(),null);
  if r->>'code' is distinct from 'NARXSIZ_QATOR_BOR' or (r->>'soni')::int <> 1 then raise exception '11c: submitted o''tdi: %', r; end if;
  begin
    update public.t2_akt set holat='tasdiqlangan' where id=n1;
    raise exception '11d: eski tasdiq yo''li o''tdi';
  exception when sqlstate 'P0001' then
    get stacked diagnostics xato = message_text;
    if xato not like 'NARXSIZ_QATOR_BOR%' then raise; end if;
  end;
  r := public.t2_akt_yarat_v2(o,'2026-11-01',jsonb_build_array(jsonb_build_object('qator_id',y,'certified_quantity',2,'price_intentionally_absent',true,
         'raw_snapshot',jsonb_build_object('source','native_f2_preparation'))),a,'_T_F2T_N2',gen_random_uuid());
  n2 := (r->>'akt_id')::bigint;
  select versiya into v from public.t2_akt where id=n2;
  r := public.t2_akt_lifecycle_transition_v1(c,n2,'submitted',a,v,gen_random_uuid(),null);
  if (r->>'ok')::boolean is not true then raise exception '11e: ongli narxsiz bloklandi: %', r; end if;

  -- 7) t2_qator_holat.fakt_summa_nomalum: narxsiz fakt qatori sanaladi (direct_fakt_summa ma'nosi o'zgarmagan).
  insert into public.t2_akt(obyekt_id,kompaniya_id,tur,oy,holat) values(o,c,'fakt','2026-10-01','qoralama') returning id into fk;
  insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,kompaniya_id,hajm,narx) values(fk,y,o,c,3,null);
  if (select fakt_summa_nomalum from public.t2_qator_holat where qator_id=y) <> 1 then raise exception '7a: fakt_summa_nomalum 1 emas'; end if;
  if (select fakt_summa_nomalum from public.t2_qator_holat where qator_id=x) <> 0 then raise exception '7b: x da fakt_summa_nomalum 0 emas'; end if;

  -- 3) Tasdiqlangan S ga faol storno bog'langan — bekor qilinmaydi; storno qoralamalari bekor qilingach — bo'ladi.
  select versiya into v from public.t2_akt where id=s;
  r := public.t2_akt_lifecycle_transition_v1(c,s,'cancelled',a,v,gen_random_uuid(),'test bekor');
  if r->>'code' is distinct from 'DEPENDENTS_EXIST' or not (r->'bogliq'->'storno_aktlar' @> to_jsonb(d)) then raise exception '3a: bog''liq storno bilan bekor o''tdi: %', r; end if;
  foreach d in array array[d, d2, d3] loop
    select versiya into v from public.t2_akt where id=d;
    r := public.t2_akt_lifecycle_transition_v1(c,d,'cancelled',a,v,gen_random_uuid(),'test bekor');
    if (r->>'ok')::boolean is not true then raise exception '3b: storno qoralama bekor qilinmadi: %', r; end if;
  end loop;
  select versiya into v from public.t2_akt where id=s;
  r := public.t2_akt_lifecycle_transition_v1(c,s,'cancelled',a,v,gen_random_uuid(),'test bekor');
  if (r->>'ok')::boolean is not true then raise exception '3c: bog''liqsiz bekor rad: %', r; end if;
  if (select certified_amount from public.t2_akt_qator where id=l1) <> 400 then raise exception '3d: manba qatori o''zgargan'; end if;

  -- 8) Trigger tartibi.
  if not exists (select 1 from pg_trigger where tgrelid='public.t2_akt'::regclass and tgname='t2_akt_zz_raqam_takror')
     or exists (select 1 from pg_trigger where tgrelid='public.t2_akt'::regclass and tgname='t2_akt_raqam_takror') then
    raise exception '8: trigger nomi';
  end if;
  -- 10) correction_create ruxsat tekshiruvi (o'zgarishsiz, faqat tasdiq).
  if position('''f2.correct''' in pg_get_functiondef('public.t2_akt_correction_create_v1(bigint,bigint,bigint,uuid,integer,bigint,text,text)'::regprocedure)) = 0 then
    raise exception '10: correction_create da f2.correct yo''q';
  end if;
  -- Ruxsatlar va versiya auditi.
  if has_function_privilege('authenticated','public._t2_f2_storno_qator_xato(jsonb,bigint)','execute')
     or has_function_privilege('anon','public._t2_f2_akt_bogliq_v1(bigint)','execute')
     or has_function_privilege('authenticated','public.t2_f2_qoralama_yangila_v1_pre_20261203001500(bigint,bigint,bigint,integer,jsonb,uuid,text)','execute')
     or not has_function_privilege('service_role','public.t2_f2_qoralama_yangila_v1(bigint,bigint,bigint,integer,jsonb,uuid,text)','execute') then
    raise exception '12: ruxsatlar';
  end if;
  if exists (select 1 from public.t2_versiya_xabardorlik_audit_v1() z where z.nom like '%20261203001500%' or z.nom like '\_t2\_f2\_%' or z.nom = 't2_qator_holat') then
    raise exception '13: versiya auditida yangi yozuv';
  end if;
  raise notice 'F2_TUZATISH_ACCEPTANCE_PASS';
end $test$;
rollback;
