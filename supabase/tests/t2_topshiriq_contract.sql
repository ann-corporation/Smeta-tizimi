-- T2_TOPSHIRIQ (P1) contract test. Natija: oxirgi exception "TEST_TOPSHIRIQ ..." (= rollback, hech narsa saqlanmaydi).
-- Faqat disposable branch / lokal. Prodda ishga tushirilmaydi.
do $$
declare
  p bigint; z bigint; x bigint;                         -- beruvchi (pudratchi), ijrochi (subpudratchi), begona
  ub bigint; uk bigint; uu1 bigint; uu2 bigint; uz bigint; ux bigint;
  o1 bigint; xo bigint; al bigint; t1 bigint; t2 bigint; t3 bigint; tz bigint;
  r jsonb; op uuid := gen_random_uuid(); rep text[] := array[]::text[]; n int; v int;
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_TOP_P', 'TTP', '910000001', true) returning id into p;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_TOP_Z', 'TTZ', '910000002', true) returning id into z;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_TOP_X', 'TTX', '910000003', true) returning id into x;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tt_ub', 'boss', 'faol') returning id into ub;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tt_uk', 'kuzatuvchi', 'faol') returning id into uk;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tt_uu1', 'usta1', 'faol') returning id into uu1;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tt_uu2', 'usta2', 'faol') returning id into uu2;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tt_uz', 'sub boss', 'faol') returning id into uz;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tt_ux', 'begona', 'faol') returning id into ux;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values
    (ub, p, 'boss', 'faol'), (uk, p, 'kuzatuvchi', 'faol'), (uu1, p, 'usta', 'faol'), (uu2, p, 'usta', 'faol'), (uz, z, 'boss', 'faol'), (ux, x, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('TOP-obyekt', p) returning id into o1;
  insert into t2_obyekt (nom, kompaniya_id) values ('TOP-begona', x) returning id into xo;

  -- 1/2/3. ruxsat
  r := t2_topshiriq_ber_v1(ub, p, gen_random_uuid(), 'ish', p, uu1, null, o1, 'Devor g''isht', 'matn', current_date + 3, null, null);
  t1 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and t1 is not null then 'OK   boss topshiriq berdi' else 'FAIL ber: ' || r::text end);
  begin perform t2_topshiriq_ber_v1(uk, p, gen_random_uuid(), 'ish', p, null, null, o1, 'x', null, null, null, null); rep := rep || 'FAIL kuzatuvchi berdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   kuzatuvchi ber olmaydi 42501' else 'FAIL kuzatuvchi: ' || sqlerrm end); end;
  begin perform t2_topshiriq_ber_v1(ux, p, gen_random_uuid(), 'ish', p, null, null, o1, 'x', null, null, null, null); rep := rep || 'FAIL begona actor berdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   begona kompaniya actori rad 42501' else 'FAIL begona actor: ' || sqlerrm end); end;
  -- 4. begona tenant obyekti
  r := t2_topshiriq_ber_v1(ub, p, gen_random_uuid(), 'ish', p, null, null, xo, 'x', null, null, null, null);
  rep := rep || (case when r->>'code' = 'OBYEKT_BEGONA' then 'OK   begona obyekt rad' else 'FAIL begona obyekt: ' || r::text end);
  -- 5. operation_id takrori
  r := t2_topshiriq_ber_v1(ub, p, op, 'ish', p, null, null, o1, 'Takror', null, null, null, null);
  r := t2_topshiriq_ber_v1(ub, p, op, 'ish', p, null, null, o1, 'Takror', null, null, null, null);
  select count(*) into n from t2_topshiriq where kompaniya_id = p and operation_id = op;
  rep := rep || (case when n = 1 and (r->>'takror')::boolean then 'OK   operation_id takrori — bitta qator, takror=true' else 'FAIL takror: ' || r::text end);
  -- NULL != 0: muddat/matn noma'lum NULL saqlanadi
  rep := rep || (case when (select muddat is null and matn is null from t2_topshiriq where kompaniya_id = p and operation_id = op) then 'OK   noma''lum maydon NULL (0/bo''sh emas)' else 'FAIL NULL' end);

  -- hayot sikli: usta1 qabul -> bajarilmoqda -> bajarildi ; boss tasdiqlaydi
  r := t2_topshiriq_otish_v1(uu2, p, gen_random_uuid(), t1, 1, 'qabul_qilindi', null, null);
  rep := rep || (case when r->>'code' = 'IJROCHI_EMAS' then 'OK   boshqa usta o''tkaza olmaydi (doira)' else 'FAIL boshqa usta: ' || r::text end);
  r := t2_topshiriqlar_v1(uu2, p, 'menga', null, null, 30, null);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 0 then 'OK   usta2 usta1 topshirig''ini ko''rmaydi' else 'FAIL usta2 ko''rdi: ' || r::text end);
  r := t2_topshiriqlar_v1(uu1, p, 'menga', null, null, 30, null);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 1 then 'OK   usta1 o''zinikini ko''radi' else 'FAIL usta1 ro''yxat: ' || r::text end);
  r := t2_topshiriq_otish_v1(uu1, p, gen_random_uuid(), t1, 99, 'qabul_qilindi', null, null);
  rep := rep || (case when r->>'code' = 'VERSIYA_ESKI' then 'OK   eski versiya rad' else 'FAIL versiya: ' || r::text end);
  r := t2_topshiriq_otish_v1(uu1, p, gen_random_uuid(), t1, 1, 'bajarildi', null, null);
  rep := rep || (case when r->>'code' = 'OTISH_MUMKIN_EMAS' then 'OK   sakrab o''tish rad' else 'FAIL sakrash: ' || r::text end);
  r := t2_topshiriq_otish_v1(uu1, p, gen_random_uuid(), t1, 1, 'qabul_qilindi', null, null);
  r := t2_topshiriq_otish_v1(uu1, p, gen_random_uuid(), t1, 2, 'bajarilmoqda', null, null);
  r := t2_topshiriq_otish_v1(uu1, p, gen_random_uuid(), t1, 3, 'bajarildi', 'tayyor', array[11,12]::bigint[]);
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'bajarildi' then 'OK   usta qabul -> bajarilmoqda -> bajarildi' else 'FAIL sikl: ' || r::text end);
  begin perform t2_topshiriq_otish_v1(uu1, p, gen_random_uuid(), t1, 4, 'tasdiqlandi', null, null); rep := rep || 'FAIL usta o''zi tasdiqladi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   usta o''zi tasdiqlay olmaydi 42501' else 'FAIL usta tasdiq: ' || sqlerrm end); end;
  r := t2_topshiriq_otish_v1(ub, p, gen_random_uuid(), t1, 4, 'qaytarildi', 'qayta', null);
  r := t2_topshiriq_otish_v1(uu1, p, gen_random_uuid(), t1, 5, 'bajarilmoqda', null, null);
  r := t2_topshiriq_otish_v1(uu1, p, gen_random_uuid(), t1, 6, 'bajarildi', null, null);
  r := t2_topshiriq_otish_v1(ub, p, gen_random_uuid(), t1, 7, 'tasdiqlandi', null, null);
  rep := rep || (case when (r->>'ok')::boolean then 'OK   qaytarildi -> qayta -> tasdiqlandi' else 'FAIL tasdiq: ' || r::text end);
  select count(*) into n from t2_topshiriq_otish where topshiriq_id = t1;
  rep := rep || (case when n = 8 then 'OK   o''tish jurnali 8 qator' else 'FAIL jurnal: ' || n end);
  r := t2_topshiriq_otish_v1(ub, p, gen_random_uuid(), t1, 8, 'bekor', null, null);
  rep := rep || (case when r->>'code' = 'OTISH_MUMKIN_EMAS' then 'OK   tasdiqlangan topshiriq yopiq' else 'FAIL yopiq: ' || r::text end);
  begin perform t2_topshiriq_otish_v1(uk, p, gen_random_uuid(), t1, 8, 'bekor', null, null); rep := rep || 'FAIL kuzatuvchi bekor';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   kuzatuvchi bekor qila olmaydi 42501' else 'FAIL kuzatuvchi bekor: ' || sqlerrm end); end;

  -- 8. kompaniyalararo
  r := t2_topshiriq_ber_v1(ub, p, gen_random_uuid(), 'ish', z, null, null, o1, 'Sub ish', null, null, null, null);
  rep := rep || (case when r->>'code' = 'ALOQA_YOQ' then 'OK   aloqasiz kompaniyalararo rad' else 'FAIL aloqasiz: ' || r::text end);
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id)
    values (p, z, 'pudratchi', 'subpudratchi', 'subpudrat', 'faol', ub) returning id into al;
  r := t2_topshiriq_ber_v1(ub, p, gen_random_uuid(), 'ish', z, null, al, o1, 'Sub ish', null, null, null, null);
  t2 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean then 'OK   faol aloqa bilan sub ijrochiga berildi' else 'FAIL sub ber: ' || r::text end);
  r := t2_topshiriq_otish_v1(ub, p, gen_random_uuid(), t2, 1, 'qabul_qilindi', null, null);
  rep := rep || (case when r->>'code' = 'TOMON_NOTOGRI' then 'OK   beruvchi ijrochi harakatini qila olmaydi' else 'FAIL tomon: ' || r::text end);
  r := t2_topshiriqlar_v1(uz, z, 'menga', null, null, 30, null);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 1 then 'OK   ijrochi kompaniya o''z topshirig''ini ko''radi' else 'FAIL ijrochi ro''yxat: ' || r::text end);
  r := t2_topshiriqlar_v1(ux, x, 'menga', null, null, 30, null);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 0 then 'OK   uchinchi tomon ko''rmaydi' else 'FAIL uchinchi: ' || r::text end);
  r := t2_topshiriq_otish_v1(ux, x, gen_random_uuid(), t2, 1, 'qabul_qilindi', null, null);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   uchinchi tomon o''tkaza olmaydi (TOPILMADI)' else 'FAIL uchinchi o''tish: ' || r::text end);
  r := t2_topshiriq_otish_v1(uz, z, gen_random_uuid(), t2, 1, 'rad', null, null);
  rep := rep || (case when r->>'code' = 'IZOH_KERAK' then 'OK   rad izohsiz bo''lmaydi' else 'FAIL rad izoh: ' || r::text end);
  r := t2_topshiriq_otish_v1(uz, z, gen_random_uuid(), t2, 1, 'rad', 'sig''maydi', null);
  rep := rep || (case when (r->>'ok')::boolean then 'OK   ijrochi kompaniya rad etdi' else 'FAIL rad: ' || r::text end);
  update t2_tomon_aloqa set holat = 'yopilgan' where id = al;
  r := t2_topshiriq_ber_v1(ub, p, gen_random_uuid(), 'ish', z, null, al, o1, 'Yopilgach', null, null, null, null);
  rep := rep || (case when r->>'code' = 'ALOQA_YOQ' then 'OK   aloqa yopilgach yangi topshiriq yo''q' else 'FAIL yopiq aloqa: ' || r::text end);

  -- 9. anon/authenticated
  rep := rep || (case when not has_function_privilege('anon', 'public.t2_topshiriq_ber_v1(bigint,bigint,uuid,text,bigint,bigint,bigint,bigint,text,text,date,jsonb,jsonb)', 'execute')
                   and not has_function_privilege('authenticated', 'public.t2_topshiriq_otish_v1(bigint,bigint,uuid,bigint,integer,text,text,bigint[])', 'execute')
                   and not has_function_privilege('authenticated', 'public.t2_topshiriqlar_v1(bigint,bigint,text,text,bigint,integer,bigint)', 'execute')
                  then 'OK   anon/authenticated RPC chaqira olmaydi' else 'FAIL grant' end);
  rep := rep || (case when not has_table_privilege('authenticated', 'public.t2_topshiriq', 'select') then 'OK   jadvalga to''g''ridan kirish yo''q' else 'FAIL jadval grant' end);
  -- 10. outbox (F1 tushgach majburiy)
  if to_regclass('public.t2_outbox') is null then rep := rep || 'SKIP outbox jadvali hali yo''q (F1)';
  else
    begin execute 'select count(*) from public.t2_outbox where mavzu = ''topshiriq.berildi'' and kompaniya_id = $1' into n using p;
      rep := rep || (case when n >= 2 then 'OK   outbox topshiriq.berildi yozilgan' else 'FAIL outbox: ' || n end);
    exception when others then rep := rep || 'SKIP outbox ustun nomi: ' || sqlerrm; end;
  end if;
  raise exception 'TEST_TOPSHIRIQ %', array_to_string(rep, E'\n');
end $$;