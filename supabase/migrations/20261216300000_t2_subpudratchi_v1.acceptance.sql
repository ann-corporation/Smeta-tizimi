-- ACCEPTANCE: 20261216300000 - subpudratchi tomoni. BEGIN..ROLLBACK, sintetik ma'lumot (hech narsa qolmaydi).
-- Talab: 20261216300000 qo'llangan. 'tolov_holati' resursi bu testda vaqtincha faollashtiriladi (rollback qaytaradi).
begin;
set local statement_timeout = '300s';

do $acc$
declare
  x bigint; y bigint; z bigint; ux bigint; uy bigint; uz bigint; ox bigint; rz bigint; b1 bigint; b2 bigint; al bigint;
  b3 bigint; b4 bigint; t1 bigint; t2 bigint; a1 bigint; a2 bigint; tq1 bigint; tq2 bigint; r jsonb; n integer; v_oy date; v_oy0 date; sh bigint; fh numeric;
begin
  update t2_tomon_resurs set faol = true where kalit in ('tolov_holati', 'sub_ish', 'sub_akt');
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_BOSH_PUDRATCHI', 'ACC-GC9', '920000091', true) returning id into x;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_SUBPUDRATCHI', 'ACC-SB9', '920000092', true) returning id into y;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_BEGONA', 'ACC-BG9', '920000093', true) returning id into z;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc9_gc', 'GC boss', 'faol') returning id into ux;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc9_sb', 'SUB boss', 'faol') returning id into uy;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc9_bg', 'BEGONA boss', 'faol') returning id into uz;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ux, x, 'boss', 'faol'), (uy, y, 'boss', 'faol'), (uz, z, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('ACC9-obyekt', x) returning id into ox;
  insert into t2_qator (obyekt_id, kompaniya_id, tur, nom, tartib) values (ox, x, 'rz', 'ACC9 bo''lim', 1) returning id into rz;
  insert into t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (ox, x, rz, 'bl', 'ACC9-1', 'ACC9 ish bir', 'm2', 100, 1234.56, 123456, 2) returning id into b1;
  insert into t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (ox, x, rz, 'bl', 'ACC9-2', 'ACC9 ish ikki', 'm2', 100, 1234.56, 123456, 3) returning id into b2;
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id)
    values (x, y, 'pudratchi', 'subpudratchi', 'subpudrat', 'faol', ux) returning id into al;
  insert into t2_qator (obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib) values (ox, x, 'bl', 'ACC9-3', 'ACC9 ish uch', 'm2', 3, 10, 30, 4) returning id into b3;
  insert into t2_qator (obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib) values (ox, x, 'bl', 'ACC9-4', 'ACC9 ish tort', 'm2', 7, 20, 140, 5) returning id into b4;
  insert into t2_shartnoma (kompaniya_id, raqam, asosiy, taraf) values (x, 'ACC9-SUB', false, 'ACC_SUBPUDRATCHI') returning id into sh;
  v_oy := date_trunc('month', current_date)::date;
  v_oy0 := date_trunc('month', current_date - interval '1 month')::date;

  -- 1. Topshirish: aniq qator (hajm 60, kelishilgan narx 800), keyin butun bo'lim (ikkinchi qator narxsiz; birinchisi o'zgarmaydi)
  r := t2_sub_topshir_v1(ux, x, al, ox, jsonb_build_array(jsonb_build_object('qator_id', b1, 'hajm', 60, 'narx', 800)));
  if not (r->>'ok')::boolean or (r->>'yangi')::int <> 1 or not (r->>'grant_yaratildi')::boolean then raise exception 'ACC_FAIL 1a: %', r; end if;
  r := t2_sub_topshir_v1(ux, x, al, ox, null, rz);
  if not (r->>'ok')::boolean or (r->>'yangi')::int <> 1 or (r->>'yangilandi')::int <> 1 then raise exception 'ACC_FAIL 1b: %', r; end if;
  select id into t1 from t2_sub_topshiriq where qator_id = b1 and holat = 'faol';
  select id into t2 from t2_sub_topshiriq where qator_id = b2 and holat = 'faol';
  if (select hajm from t2_sub_topshiriq where id = t1) <> 60 or (select narx from t2_sub_topshiriq where id = t1) <> 800 or (select narx from t2_sub_topshiriq where id = t2) is not null then
    raise exception 'ACC_FAIL 1c: hajm/narx'; end if;
  -- smeta hajmidan ortiq topshirib bo'lmaydi
  r := t2_sub_topshir_v1(ux, x, al, ox, jsonb_build_array(jsonb_build_object('qator_id', b2, 'hajm', 101)));
  if (r->>'ok')::boolean or r->>'code' <> 'QATOR_NOTOGRI' then raise exception 'ACC_FAIL 1d: %', r; end if;

  -- 2. Subpudratchi faqat topshirilgan qatorlarni va FAQAT o'z narxini ko'radi (smeta narxi 1234.56 hech qayerda yo'q)
  r := t2_sub_ishlarim_v1(uy, y);
  if jsonb_array_length(r->'ishlar') <> 2 or position('1234.56' in r::text) > 0 or r::text like '%smeta_narx%' or r::text like '%"summa"%' then raise exception 'ACC_FAIL 2a: %', r; end if;
  -- 3. Begona kompaniya: a'zo emas -> 42501; o'z kompaniyasida esa hech narsa ko'rmaydi va aloqa orqali yoza olmaydi
  begin perform t2_sub_topshir_v1(uz, x, al, ox, jsonb_build_array(jsonb_build_object('qator_id', b2, 'hajm', 1)));
    raise exception 'ACC_FAIL 3a begona o''tdi';
  exception when others then if sqlstate <> '42501' then raise exception 'ACC_FAIL 3a: % %', sqlstate, sqlerrm; end if; end;
  r := t2_sub_ishlarim_v1(uz, z);
  if jsonb_array_length(r->'ishlar') <> 0 then raise exception 'ACC_FAIL 3b: %', r; end if;
  r := t2_sub_akt_yoz_v1(uz, z, al, ox, v_oy, jsonb_build_array(jsonb_build_object('topshiriq_id', t1, 'hajm', 1)));
  if (r->>'ok')::boolean or r->>'code' <> 'ALOQA_YOQ' then raise exception 'ACC_FAIL 3c: %', r; end if;
  -- bosh pudratchi a'zosi subpudratchi tenantida emas
  begin perform t2_sub_ishlarim_v1(ux, y); raise exception 'ACC_FAIL 3d';
  exception when others then if sqlstate <> '42501' then raise exception 'ACC_FAIL 3d: % %', sqlstate, sqlerrm; end if; end;

  -- 4. Subpudratchi fakti: topshirilgan hajmdan ortiq -> rad; narxsiz qator bilan yuborib bo'lmaydi; to'g'ri akt yuboriladi
  r := t2_sub_akt_yoz_v1(uy, y, al, ox, v_oy, jsonb_build_array(jsonb_build_object('topshiriq_id', t1, 'hajm', 70)));
  if (r->>'ok')::boolean or r->>'code' <> 'QATOR_NOTOGRI' then raise exception 'ACC_FAIL 4a: %', r; end if;
  select count(*) into n from t2_sub_akt where sub_kompaniya_id = y;
  if n <> 0 then raise exception 'ACC_FAIL 4a2 xato so''rov akt qoldirdi: %', n; end if;
  r := t2_sub_akt_yoz_v1(uy, y, al, ox, v_oy, jsonb_build_array(jsonb_build_object('topshiriq_id', t1, 'hajm', 40), jsonb_build_object('topshiriq_id', t2, 'hajm', 10)), null, 'A-1', null, gen_random_uuid());
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 4b: %', r; end if;
  a1 := (r->>'id')::bigint;
  r := t2_sub_akt_yubor_v1(uy, y, a1, null, gen_random_uuid());
  if (r->>'ok')::boolean or r->>'code' <> 'NARX_KERAK' then raise exception 'ACC_FAIL 4c: %', r; end if;
  r := t2_sub_akt_yoz_v1(uy, y, al, ox, v_oy, jsonb_build_array(jsonb_build_object('topshiriq_id', t1, 'hajm', 40)), a1);
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 4d: %', r; end if;
  r := t2_sub_akt_yubor_v1(uy, y, a1, 'tekshiring', gen_random_uuid());
  if not (r->>'ok')::boolean or r->>'holat' <> 'yuborilgan' then raise exception 'ACC_FAIL 4e: %', r; end if;
  tq1 := (r->>'id')::bigint;
  -- qaror chiqmaguncha qaytarib olish; qaytarilgan taqdimga qaror bo'lmaydi; tahrirlab qayta yuboriladi (yangi taqdim)
  r := t2_sub_akt_qaytar_v1(uy, y, a1);
  if not (r->>'ok')::boolean or r->>'holat' <> 'qoralama' then raise exception 'ACC_FAIL 4e2: %', r; end if;
  r := t2_sub_akt_qaror_v1(ux, x, tq1, 'qabul', null);
  if (r->>'ok')::boolean or r->>'code' <> 'HOLAT' then raise exception 'ACC_FAIL 4e3: %', r; end if;
  r := t2_sub_akt_yoz_v1(uy, y, al, ox, v_oy, jsonb_build_array(jsonb_build_object('topshiriq_id', t1, 'hajm', 40)), a1);
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 4e4: %', r; end if;
  r := t2_sub_akt_yubor_v1(uy, y, a1, 'qayta yubordim', gen_random_uuid());
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 4e5: %', r; end if;
  tq1 := (r->>'id')::bigint;
  -- shu oyda boshqa qator uchun yana akt ochish mumkin; yuborilgan aktdagi qator ikkinchi aktga kirmaydi
  r := t2_sub_akt_yoz_v1(uy, y, al, ox, v_oy, jsonb_build_array(jsonb_build_object('topshiriq_id', t2, 'hajm', 10)), null, 'A-1b', null, gen_random_uuid());
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 4e6 ikkinchi akt: %', r; end if;
  r := t2_sub_akt_yoz_v1(uy, y, al, ox, v_oy, jsonb_build_array(jsonb_build_object('topshiriq_id', t1, 'hajm', 5)), null, 'A-1c', null, gen_random_uuid());
  if (r->>'ok')::boolean or r->>'code' <> 'QATOR_NOTOGRI' then raise exception 'ACC_FAIL 4e7: %', r; end if;
  if (select snapshot_xesh from t2_tomon_taqdim where id = tq1) is null or (select qabul_qiluvchi_kompaniya_id from t2_tomon_taqdim where id = tq1) <> x then raise exception 'ACC_FAIL 4f'; end if;
  -- yuborilgandan keyin tahrir yo'q
  r := t2_sub_akt_yoz_v1(uy, y, al, ox, v_oy, jsonb_build_array(jsonb_build_object('topshiriq_id', t1, 'hajm', 41)), a1);
  if (r->>'ok')::boolean or r->>'code' <> 'HOLAT' then raise exception 'ACC_FAIL 4g: %', r; end if;
  -- bosh pudratchi inboxida ko'rinadi (qoralamalarsiz), summa = 40 x 800 (QQS siz)
  r := t2_sub_akt_royxat_v1(ux, x, 'kelgan');
  if jsonb_array_length(r->'aktlar') <> 1 or (r->'aktlar'->0->>'jami_qqs_siz')::numeric <> 32000 then raise exception 'ACC_FAIL 4h: %', r; end if;

  -- 5. Umumiy yo'l bilan qaror chiqarib bo'lmaydi (fakt/xarajatni aylanib o'tadi)
  begin update t2_tomon_taqdim set holat = 'qabul' where id = tq1; raise exception 'ACC_FAIL 5 trigger o''tkazdi';
  exception when others then if sqlstate <> '42501' then raise exception 'ACC_FAIL 5: % %', sqlstate, sqlerrm; end if; end;

  -- 6. Qabul: fakt BIR marta (40), bitta xarajat (32000); qayta chaqiruv idempotent
  r := t2_sub_akt_qaror_v1(ux, x, tq1, 'qabul', null);
  if not (r->>'ok')::boolean or r->>'holat' <> 'qabul' or r->>'fakt_akt_id' is null or r->>'xarajat_id' is null then raise exception 'ACC_FAIL 6a: %', r; end if;
  select fakt_hajm into fh from t2_qator_holat where id = b1;
  if fh is distinct from 40 then raise exception 'ACC_FAIL 6b fakt=%', fh; end if;
  r := t2_sub_akt_qaror_v1(ux, x, tq1, 'qabul', null);
  if not (r->>'ok')::boolean or not coalesce((r->>'qayta')::boolean, false) then raise exception 'ACC_FAIL 6c: %', r; end if;
  select fakt_hajm into fh from t2_qator_holat where id = b1;
  select count(*) into n from t2_xarajat where hujjat_ref = 'sub_akt:' || a1::text and holat = 'faol' and toifa = 'subpudrat' and kat = 'SUB' and summa = 32000 and kompaniya_id = x;
  if fh is distinct from 40 or n <> 1 then raise exception 'ACC_FAIL 6d fakt=% xarajat=%', fh, n; end if;
  -- qabul qilingan aktni subpudratchi tahrirlay olmaydi; topshiriqni bekor qilib bo'lmaydi
  r := t2_sub_topshiriq_bekor_v1(ux, x, t1);
  if (r->>'ok')::boolean or r->>'code' <> 'ISHLATILGAN' then raise exception 'ACC_FAIL 6e: %', r; end if;
  -- bosh pudratchining tarmoq ko'rinishi: qabul 40, gc fakt 0 (sub faktini u qayta kiritmaydi)
  r := t2_sub_boshqaruv_v1(ux, x, ox);
  if (select (e->>'qabul_hajm')::numeric from jsonb_array_elements(r->'topshiriqlar') e where (e->>'qator_id')::bigint = b1) <> 40
     or (select (e->>'gc_fakt_hajm')::numeric from jsonb_array_elements(r->'topshiriqlar') e where (e->>'qator_id')::bigint = b1) <> 0 then raise exception 'ACC_FAIL 6f: %', r; end if;

  -- 7. Ikki marta hisoblanmaydi: bosh pudratchi 2-qatorga qo'lda 95 fakt kiritgan; subpudratchi 10 yuborsa qabul bloklanadi, 5 ga tuzatilsa o'tadi
  r := t2_sub_topshir_v1(ux, x, al, ox, jsonb_build_array(jsonb_build_object('qator_id', b2, 'narx', 500)), null, sh);
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 7a: %', r; end if;
  r := t2_fakt_yoz_v2(ox, current_date, jsonb_build_array(jsonb_build_object('qator_id', b2, 'hajm', 95)), ux, gen_random_uuid());
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 7b: %', r; end if;
  r := t2_sub_akt_yoz_v1(uy, y, al, ox, v_oy0, jsonb_build_array(jsonb_build_object('topshiriq_id', t2, 'hajm', 10)), null, 'A-2', null, gen_random_uuid());
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 7c: %', r; end if;
  a2 := (r->>'id')::bigint;
  r := t2_sub_akt_yubor_v1(uy, y, a2, null, gen_random_uuid());
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 7d: %', r; end if;
  tq2 := (r->>'id')::bigint;
  r := t2_sub_akt_qaror_v1(ux, x, tq2, 'qabul', null);
  if (r->>'ok')::boolean or r->>'code' <> 'ORTIQCHA' then raise exception 'ACC_FAIL 7e: %', r; end if;
  select fakt_hajm into fh from t2_qator_holat where id = b2;
  if fh is distinct from 95 then raise exception 'ACC_FAIL 7f fakt=%', fh; end if;
  -- tuzatishga qaytarish izohsiz mumkin emas; izoh bilan -> subpudratchi tahrirlaydi va qayta yuboradi
  r := t2_sub_akt_qaror_v1(ux, x, tq2, 'tuzatish', null);
  if (r->>'ok')::boolean or r->>'code' <> 'IZOH_KERAK' then raise exception 'ACC_FAIL 7g: %', r; end if;
  r := t2_sub_akt_qaror_v1(ux, x, tq2, 'tuzatish', 'hajmni kamaytiring');
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 7h: %', r; end if;
  r := t2_sub_akt_yoz_v1(uy, y, al, ox, v_oy0, jsonb_build_array(jsonb_build_object('topshiriq_id', t2, 'hajm', 5)), a2);
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 7i: %', r; end if;
  r := t2_sub_akt_yubor_v1(uy, y, a2, 'tuzatdim', gen_random_uuid());
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 7j: %', r; end if;
  tq2 := (r->>'id')::bigint;
  if (select oldingi_taqdim_id from t2_tomon_taqdim where id = tq2) is null then raise exception 'ACC_FAIL 7k zanjir yo''q'; end if;
  r := t2_sub_akt_qaror_v1(ux, x, tq2, 'qabul', null);
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 7l: %', r; end if;
  select fakt_hajm into fh from t2_qator_holat where id = b2;
  select count(*) into n from t2_xarajat where hujjat_ref = 'sub_akt:' || a2::text and summa = 2500;
  if fh is distinct from 100 or n <> 1 then raise exception 'ACC_FAIL 7m fakt=% xarajat=%', fh, n; end if;
  -- shartnoma bog'langan: bitta qarz asosi (QQS bilan 2500 x 1.12 = 2800), qayta chaqiruvda ortmaydi
  select count(*) into n from t2_qarz_asos where kompaniya_id = x and shartnoma_id = sh and tur = 'bajarilgan_ish' and summa = 2800 and holat = 'faol';
  if n <> 1 then raise exception 'ACC_FAIL 7n qarz=%', n; end if;
  perform t2_sub_akt_qaror_v1(ux, x, tq2, 'qabul', null);
  select count(*) into n from t2_qarz_asos where kompaniya_id = x and shartnoma_id = sh;
  if n <> 1 then raise exception 'ACC_FAIL 7o qarz takror=%', n; end if;

  -- 8. To'lov holati: topshirishda 'tolov_holati' granti avtomatik beriladi; shartnoma bog'langan akt bo'yicha to'langan ko'rinadi; grant bekor -> pul maydonlari NULL
  insert into t2_tolov (kompaniya_id, shartnoma_id, tur, summa, sana, holat) values (x, sh, 'tolov', 500, current_date, 'faol');
  r := t2_sub_tolov_holati_v1(uy, y);
  if jsonb_array_length(r->'aktlar') <> 2 or not (r->'aktlar'->0->>'ruxsat')::boolean or (r->'aktlar'->0->>'shartnoma_id')::bigint <> sh
     or (r->'aktlar'->0->>'tolangan')::numeric <> 500 or (r->'aktlar'->0->>'shartnoma_qabul_qqs_siz')::numeric <> 2500 then raise exception 'ACC_FAIL 8a: %', r; end if;
  update t2_tomon_grant set holat = 'bekor' where resurs = 'tolov_holati' and aloqa_id = al;
  r := t2_sub_tolov_holati_v1(uy, y);
  if (r->'aktlar'->0->>'ruxsat')::boolean or r->'aktlar'->0->>'tolangan' is not null or r->'aktlar'->0->>'shartnoma_id' is not null then raise exception 'ACC_FAIL 8b: %', r; end if;

  -- 8c. Ulgurji summa: butun to'plam shu summaga chiqadi (176.47 + 823.54 = 1000.01), tiyin yo'qolmaydi
  r := t2_sub_topshir_v1(ux, x, al, ox, jsonb_build_array(jsonb_build_object('qator_id', b3), jsonb_build_object('qator_id', b4)), null, null, null, 1000.01);
  if not (r->>'ok')::boolean then raise exception 'ACC_FAIL 8c: %', r; end if;
  if (select sum(round(t.hajm * t.narx, 2)) from t2_sub_topshiriq t where t.qator_id in (b3, b4) and t.holat = 'faol') is distinct from 1000.01
     or (select round(t.hajm * t.narx, 2) from t2_sub_topshiriq t where t.qator_id = b3 and t.holat = 'faol') is distinct from 176.47 then raise exception 'ACC_FAIL 8d ulgurji'; end if;
  -- 9. Grant bekor -> subpudratchi hammasini ko'rmay qoladi va yangi akt boshlay olmaydi
  update t2_tomon_grant set holat = 'bekor' where resurs = 'sub_ish' and aloqa_id = al;
  r := t2_sub_ishlarim_v1(uy, y);
  if jsonb_array_length(r->'ishlar') <> 0 then raise exception 'ACC_FAIL 9a: %', r; end if;
  r := t2_sub_akt_yoz_v1(uy, y, al, ox, (date_trunc('month', current_date - interval '2 month'))::date, jsonb_build_array(jsonb_build_object('topshiriq_id', t2, 'hajm', 1)));
  if (r->>'ok')::boolean or r->>'code' <> 'RUXSAT_YOQ' then raise exception 'ACC_FAIL 9b: %', r; end if;

  raise notice 'ACCEPTANCE OK 20261216300000';
end$acc$;

rollback;
