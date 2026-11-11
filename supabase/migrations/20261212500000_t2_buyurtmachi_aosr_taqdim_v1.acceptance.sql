-- acceptance 20261212500000_t2_buyurtmachi_aosr_taqdim_v1
-- BEGIN..ROLLBACK ichida migratsiyadan KEYIN ishga tushiriladi; hamma ma'lumotni o'zi seed qiladi (mavjud ma'lumotga tegmaydi).
-- Natija: har tekshiruv "OK ..."/"FAIL ..."; birorta FAIL bo'lsa oxirida exception (butun hisobot matnda).
-- versiya: tarix
begin;
do $$
declare
  p bigint; z bigint; x bigint;                          -- pudratchi, buyurtmachi (texnadzor shu tenantda), begona kompaniya
  up bigint; upto bigint; uz bigint; uin bigint; uzk bigint; ux bigint;
  o1 bigint; akt bigint;
  al bigint; a1 bigint; a2 bigint; a3 bigint; t1 bigint; t2 bigint; t3 bigint; v integer;
  r jsonb; rep text[] := array[]::text[]; h text; nom1 text;
begin
  -- ── tayyorgarlik ──
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_PUD', 'ACC-P', '900000011', true) returning id into p;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_BUYURTMACHI', 'ACC-Z', '900000012', true) returning id into z;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_BEGONA', 'ACC-X', '900000013', true) returning id into x;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_up', 'P boss', 'faol') returning id into up;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_upto', 'P pto', 'faol') returning id into upto;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_uz', 'Z boss', 'faol') returning id into uz;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_uin', 'Z texnadzor', 'faol') returning id into uin;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_uzk', 'Z kuzatuvchi', 'faol') returning id into uzk;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_ux', 'X boss', 'faol') returning id into ux;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values
    (up, p, 'boss', 'faol'), (upto, p, 'pto', 'faol'), (uz, z, 'boss', 'faol'), (uin, z, 'inspektor', 'faol'), (uzk, z, 'kuzatuvchi', 'faol'), (ux, x, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('ACC-OBYEKT', p) returning id into o1;
  insert into t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status)
    values (o1, p, 'f2', 'ACC-F2', date '2099-01-01', 1000, 'tasdiqlangan', 'approved') returning id into akt;
  r := t2_tomon_taklif_v1(up, p, z, '900000012', null, 'pudratchi', 'zakazchik', 'shartnoma', 'ACC aloqa', null, null, gen_random_uuid());
  al := (r->>'id')::bigint;
  r := t2_tomon_javob_v1(uz, z, al, 'qabul', null);
  rep := rep || (case when r->>'holat' = 'faol' then 'OK   aloqa faol' else 'FAIL aloqa: ' || r::text end);

  -- ── 1. Resurs katalogi ──
  rep := rep || (case when (select faol and taqdim_mumkin from t2_tomon_resurs where kalit = 'aosr') then 'OK   aosr resursi faol + taqdim_mumkin' else 'FAIL aosr resursi' end);
  rep := rep || (case when not exists (select 1 from t2_tomon_resurs where kalit in ('remark','foto','fakt','grafik') and faol) then 'OK   remark/foto/fakt/grafik yoqilmagan' else 'FAIL ortiqcha resurs yoqilgan' end);

  -- ── 2. Muallif «tasdiqlangan» qo'ya olmaydi (yaratishda ham, tahrirda ham, to'g'ridan-to'g'ri SQL da ham) ──
  r := t2_aosr_yoz_v2(p, o1, '{"ish_nomi":"ACC ish 0","raqam":"ACC-0","holat":"tasdiqlangan"}'::jsonb, null, null, gen_random_uuid(), 'acc');
  rep := rep || (case when r->>'code' = 'TASDIQ_BOSHQA_TOMON' and not (r->>'ok')::boolean then 'OK   yaratishda tasdiqlangan — rad' else 'FAIL yaratishda tasdiqlangan: ' || r::text end);
  r := t2_aosr_yoz_v2(p, o1, '{"ish_nomi":"ACC qogoz","raqam":"ACC-Q","holat":"qogoz"}'::jsonb, null, null, gen_random_uuid(), 'acc');
  a3 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and (select holat from t2_aosr where id = a3) = 'qogoz' then 'OK   qogoz (qog''ozda imzolangan) saqlanadi' else 'FAIL qogoz: ' || r::text end);
  r := t2_aosr_yoz_v2(p, o1, '{"ish_nomi":"ACC ish 1","raqam":"ACC-1","ish_tavsifi":"tavsif","komissiya":[{"rol":"texnadzor","fio":"Test"}]}'::jsonb, null, null, gen_random_uuid(), 'acc');
  a1 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and (select holat from t2_aosr where id = a1) = 'yangi' then 'OK   yangi akt (qoralama) yaratildi' else 'FAIL yangi akt: ' || r::text end);
  select versiya into v from t2_aosr where id = a1;
  r := t2_aosr_yoz_v2(p, o1, '{"holat":"tasdiqlangan"}'::jsonb, a1, v, null, 'acc');
  rep := rep || (case when r->>'code' = 'TASDIQ_BOSHQA_TOMON' then 'OK   tahrirda tasdiqlangan — rad' else 'FAIL tahrirda tasdiqlangan: ' || r::text end);
  begin
    update t2_aosr set holat = 'tasdiqlangan' where id = a1;
    rep := rep || 'FAIL SQL update tasdiqlangan o''tdi';
  exception when others then
    rep := rep || (case when sqlstate = '42501' and sqlerrm like 'AOSR_TASDIQ_BOSHQA_TOMON%' then 'OK   SQL update tasdiqlangan — trigger to''sdi' else 'FAIL SQL update xato turi: ' || sqlerrm end);
  end;
  begin
    insert into t2_aosr (kompaniya_id, obyekt_id, raqam, ish_nomi, holat) values (p, o1, 'ACC-INS', 'x', 'tasdiqlangan');
    rep := rep || 'FAIL SQL insert tasdiqlangan o''tdi';
  exception when others then
    rep := rep || (case when sqlstate = '42501' then 'OK   SQL insert tasdiqlangan — trigger to''sdi' else 'FAIL SQL insert xato turi: ' || sqlerrm end);
  end;

  -- ── 3. Taqdim: faqat qoralama АОСР; tahrirlash taqdim vaqtida bloklanadi ──
  r := t2_tomon_taqdim_yarat_v1(upto, p, al, 'aosr', a3, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'HOLAT_YARAMAYDI' then 'OK   qogoz akt yuborilmaydi' else 'FAIL qogoz taqdim: ' || r::text end);
  r := t2_tomon_taqdim_yarat_v1(uz, z, al, 'aosr', a1, null, gen_random_uuid());   -- buyurtmachi tomoni pudratchi aktini o'z nomidan yubora olmaydi
  rep := rep || (case when r->>'code' = 'HUJJAT_YOQ' then 'OK   qarshi tomon pudratchi aktini yubora olmaydi' else 'FAIL begona taqdim: ' || r::text end);
  r := t2_tomon_taqdim_yarat_v1(upto, p, al, 'aosr', a1, 'ko''rib chiqing', gen_random_uuid());
  t1 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'yuborilgan' then 'OK   АОСР yuborildi (pto)' else 'FAIL АОСР taqdim: ' || r::text end);
  select nom into nom1 from t2_tomon_taqdim where id = t1;
  rep := rep || (case when nom1 like 'АОСР № ACC-1%' and (select manba_jadval from t2_tomon_taqdim where id = t1) = 't2_aosr' then 'OK   taqdim nomi va manbasi' else 'FAIL taqdim nomi: ' || coalesce(nom1, '?') end);
  r := t2_tomon_taqdim_yarat_v1(upto, p, al, 'aosr', a1, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'ALLAQACHON' then 'OK   ochiq taqdim takrorlanmaydi' else 'FAIL takror taqdim: ' || r::text end);
  select versiya into v from t2_aosr where id = a1;
  r := t2_aosr_yoz_v2(p, o1, '{"ish_nomi":"O''ZGARDI"}'::jsonb, a1, v, null, 'acc');
  rep := rep || (case when r->>'code' = 'TAQDIMDA' then 'OK   qaror kutilayotgan akt tahrirlanmaydi' else 'FAIL taqdimda tahrir: ' || r::text end);

  -- ── 4. Texnadzor/buyurtmachi tomoni ──
  r := t2_tomon_taqdim_tafsilot_v1(uin, z, t1);
  rep := rep || (case when (r->>'ok')::boolean and (r->'butunlik_ok')::text = 'true' and r->'taqdim'->'snapshot'->>'ish_nomi' = 'ACC ish 1'
                      then 'OK   tafsilot: snapshot + butunlik true' else 'FAIL tafsilot: ' || r::text end);
  r := t2_tomon_taqdimlar_v1(uin, z, 'kelgan', 'yuborilgan', null, 50);
  rep := rep || (case when exists (select 1 from jsonb_array_elements(r) e where (e->>'id')::bigint = t1 and e->>'manba_jadval' = 't2_aosr') then 'OK   texnadzor inboxida АОСР bor' else 'FAIL inbox: ' || r::text end);
  r := t2_tomon_taqdim_tafsilot_v1(ux, x, t1);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   begona kompaniya taqdimni ko''rmaydi' else 'FAIL begona tafsilot: ' || r::text end);
  begin perform t2_tomon_qaror_v1(uzk, z, t1, 'qabul', null); rep := rep || 'FAIL kuzatuvchi qaror chiqardi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   kuzatuvchi qaror chiqara olmaydi — 42501' else 'FAIL kuzatuvchi: ' || sqlerrm end); end;
  r := t2_tomon_qaror_v1(upto, p, t1, 'qabul', null);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   muallif (pudratchi) o''z aktini tasdiqlay olmaydi' else 'FAIL o''zi tasdiqladi: ' || r::text end);
  r := t2_tomon_qaror_v1(uin, z, t1, 'tuzatish', '');
  rep := rep || (case when r->>'code' = 'IZOH_KERAK' then 'OK   tuzatish izohsiz — rad' else 'FAIL izohsiz tuzatish: ' || r::text end);
  r := t2_tomon_qaror_v1(uin, z, t1, 'tuzatish', 'Materiallar bandida sertifikat raqami yo''q');
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'tuzatish' then 'OK   texnadzor (inspektor) tuzatishga qaytardi' else 'FAIL tuzatish: ' || r::text end);
  rep := rep || (case when (select holat from t2_aosr where id = a1) = 'yangi' then 'OK   tuzatishda akt qoralama (yangi) qoladi' else 'FAIL tuzatishda holat o''zgardi' end);
  r := t2_tomon_taqdimlar_v1(upto, p, 'yuborilgan', 'tuzatish', null, 50);
  rep := rep || (case when exists (select 1 from jsonb_array_elements(r) e where (e->>'id')::bigint = t1 and e->>'qaror_izoh' like 'Materiallar%') then 'OK   pudratchi qaytarilgan taqdim va izohni ko''radi' else 'FAIL pudratchi ko''rinishi: ' || r::text end);

  -- ── 5. Pudratchi tuzatadi va qayta yuboradi ──
  select versiya into v from t2_aosr where id = a1;
  r := t2_aosr_yoz_v2(p, o1, '{"materiallar":"Beton B25, sertifikat ACC-77"}'::jsonb, a1, v, null, 'acc');
  rep := rep || (case when (r->>'ok')::boolean then 'OK   tuzatishdan keyin tahrirlash ochiq' else 'FAIL tuzatishdan keyin tahrir: ' || r::text end);
  r := t2_tomon_taqdim_yarat_v1(upto, p, al, 'aosr', a1, 'tuzatildi', gen_random_uuid());
  t2 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and (select oldingi_taqdim_id from t2_tomon_taqdim where id = t2) = t1 then 'OK   qayta yuborildi (oldingi taqdim zanjiri)' else 'FAIL qayta yuborish: ' || r::text end);

  -- ── 6. Butunlik: yuborilgandan keyin akt qo'lda o'zgarsa qabul bloklanadi; tiklansa o'tadi ──
  update t2_aosr set ish_nomi = 'BOSHQA' where id = a1;
  r := t2_tomon_qaror_v1(uin, z, t2, 'qabul', null);
  rep := rep || (case when r->>'code' = 'BUTUNLIK' then 'OK   o''zgargan akt qabul qilinmaydi (BUTUNLIK)' else 'FAIL butunlik: ' || r::text end);
  update t2_aosr set ish_nomi = 'ACC ish 1' where id = a1;
  r := t2_tomon_qaror_v1(uin, z, t2, 'qabul', 'Mos');
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'qabul' then 'OK   texnadzor qabul qildi' else 'FAIL qabul: ' || r::text end);
  rep := rep || (case when (select holat = 'tasdiqlangan' and tasdiq_taqdim_id = t2 and tasdiq_vaqti is not null from t2_aosr where id = a1)
                      then 'OK   АОСР tasdiqlangan (qarshi tomon qarori bilan, tasdiq_taqdim_id yozildi)' else 'FAIL tasdiqlanmadi' end);
  r := t2_tomon_qaror_v1(uin, z, t2, 'rad', 'qayta qaror');
  rep := rep || (case when r->>'code' = 'HOLAT' then 'OK   qaror o''zgarmaydi' else 'FAIL qaror qayta: ' || r::text end);

  -- ── 7. Tasdiqlangan akt: qayta yuborilmaydi; mavjud holat o'zgarishsiz saqlanishi mumkin ──
  r := t2_tomon_taqdim_yarat_v1(upto, p, al, 'aosr', a1, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'HOLAT_YARAMAYDI' then 'OK   tasdiqlangan akt qayta yuborilmaydi' else 'FAIL tasdiqlangan taqdim: ' || r::text end);
  select versiya into v from t2_aosr where id = a1;
  r := t2_aosr_yoz_v2(p, o1, '{"holat":"tasdiqlangan","izoh":"yozuv"}'::jsonb, a1, v, null, 'acc');
  rep := rep || (case when (r->>'ok')::boolean then 'OK   mavjud tasdiqlangan holat o''zgarishsiz saqlanadi' else 'FAIL tasdiqlangan qayta saqlash: ' || r::text end);

  -- ── 8. Regressiya: F2 taqdimi o'zgarmagan; yopiq resurslar yopiq ──
  r := t2_tomon_taqdim_yarat_v1(upto, p, al, 'f2', akt, null, gen_random_uuid());
  t3 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and (select resurs from t2_tomon_taqdim where id = t3) = 'f2' then 'OK   F2 taqdimi avvalgidek' else 'FAIL F2 taqdim: ' || r::text end);
  r := t2_tomon_qaror_v1(uin, z, t3, 'qabul', null);
  rep := rep || (case when (r->>'ok')::boolean then 'OK   F2 qabul (texnadzor roli ham)' else 'FAIL F2 qabul: ' || r::text end);
  r := t2_tomon_taqdim_yarat_v1(upto, p, al, 'remark', a1, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'RESURS_YOQ' then 'OK   remark resursi yopiq' else 'FAIL remark: ' || r::text end);

  select string_agg(e, E'\n') into h from unnest(rep) e;
  if h like '%FAIL%' then raise exception E'ACCEPTANCE FAIL\n%', h; end if;
  raise notice E'ACCEPTANCE OK\n%', h;
end $$;
rollback;
