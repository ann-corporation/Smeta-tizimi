-- ACCEPTANCE: 20261211100000_t2_buyurtma_qabul_sklad_qarz_v1 - BEGIN..ROLLBACK, o'zi sintetik ma'lumot yaratadi, hech narsa qoldirmaydi.
-- Talab: migratsiya qo'llangan (yoki shu faylni undan keyin ishga tushiring) + 20261108410000 (buyurtma P3) + ruxsat katalogi (rol 'boss' / 'kuzatuvchi').
-- Muvaffaqiyat: oxirida NOTICE 'ACCEPTANCE OK ...'. Xato: exception 'ACC_FAIL ...'. Oxirgi buyruq ROLLBACK.
begin;

do $acc$
declare
  x bigint; y bigint; ux bigint; uxk bigint; uz bigint; uy bigint; ox bigint; oz bigint; sh bigint; sh_asosiy bigint;
  b bigint; b2 bigint; b3 bigint; qa bigint; qb bigint; r jsonb; n integer; m numeric; v numeric;
  op1 uuid := gen_random_uuid(); op2 uuid := gen_random_uuid(); op3 uuid := gen_random_uuid();
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_XARIDOR', 'ACC-X', '920000001', true) returning id into x;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_YETKAZUVCHI', 'ACC-Y', '920000002', true) returning id into y;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_bx', 'X boss', 'faol') returning id into ux;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_bxk', 'X kuzatuvchi', 'faol') returning id into uxk;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_by', 'Y boss', 'faol') returning id into uy;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc_bz', 'Z begona', 'faol') returning id into uz;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat)
    values (ux, x, 'boss', 'faol'), (uxk, x, 'kuzatuvchi', 'faol'), (uy, y, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('ACC-X-obyekt', x) returning id into ox;
  insert into t2_obyekt (nom, kompaniya_id) values ('ACC-Y-obyekt', y) returning id into oz;

  -- buyurtma: qisman qabul qilingan. A: 10 ta (qabul 10, narx 100); B: 5 (qabul 4 'kam', narx YO'Q); C: qabul 0; D: shikast
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id)
    values (x, y, 'xaridor', 'yetkazuvchi', 'kontakt', 'faol', ux);
  insert into t2_buyurtma (kompaniya_id, ijrochi_kompaniya_id, aloqa_id, tur, obyekt_id, holat, operation_id, yaratdi_actor_id)
    values (x, y, (select max(id) from t2_tomon_aloqa), 'material', ox, 'qisman', gen_random_uuid(), ux) returning id into b;
  insert into t2_buyurtma_qator (kompaniya_id, buyurtma_id, qator_no, nom, birlik, miqdor, narx, qabul_miqdor, qabul_holat)
    values (x, b, 1, 'ACC Sement', 'tonna', 10, 100, 10, 'butun') returning id into qa;
  insert into t2_buyurtma_qator (kompaniya_id, buyurtma_id, qator_no, nom, birlik, miqdor, narx, qabul_miqdor, qabul_holat)
    values (x, b, 2, 'ACC Qum', 'm3', 5, null, 4, 'kam') returning id into qb;
  insert into t2_buyurtma_qator (kompaniya_id, buyurtma_id, qator_no, nom, birlik, miqdor, narx, qabul_miqdor, qabul_holat)
    values (x, b, 3, 'ACC Shag''al', 'm3', 3, 50, 0, 'kam'), (x, b, 4, 'ACC Shisha', 'dona', 2, 70, 2, 'shikast');

  -- 1. ruxsatsiz rol va begona actor: 42501, yozuv yo'q
  begin perform t2_buyurtma_qabul_yakunla_v1(uxk, x, op1, b, null); raise exception 'ACC_FAIL 1a kuzatuvchi o''tdi';
  exception when others then if sqlstate <> '42501' then raise exception 'ACC_FAIL 1a: % %', sqlstate, sqlerrm; end if; end;
  begin perform t2_buyurtma_qabul_yakunla_v1(uz, x, op1, b, null); raise exception 'ACC_FAIL 1b begona actor o''tdi';
  exception when others then if sqlstate <> '42501' then raise exception 'ACC_FAIL 1b: % %', sqlstate, sqlerrm; end if; end;
  -- 1c. yetkazuvchi tenanti (boshqa kompaniya) xaridor buyurtmasini yakunlay olmaydi
  r := t2_buyurtma_qabul_yakunla_v1(uy, y, op1, b, null);
  if r->>'code' is distinct from 'TOPILMADI' then raise exception 'ACC_FAIL 1c: %', r; end if;
  select count(*) into n from t2_sklad_harakat where buyurtma_id = b;
  if n <> 0 then raise exception 'ACC_FAIL 1 yozuv qoldi'; end if;

  -- 2. holat 'topshirildi' (hali qabul qilinmagan) -> HOLAT, yozuv yo'q
  update t2_buyurtma set holat = 'topshirildi' where id = b;
  r := t2_buyurtma_qabul_yakunla_v1(ux, x, op1, b, null);
  if r->>'code' is distinct from 'HOLAT' then raise exception 'ACC_FAIL 2: %', r; end if;
  update t2_buyurtma set holat = 'qisman' where id = b;

  -- 3. asosiy oqim: shartnomasiz -> 2 ta kirim (C: 0 miqdor, D: shikast - kirmaydi), qarz yaratilmaydi + ogohlantirish
  r := t2_buyurtma_qabul_yakunla_v1(ux, x, op1, b, null);
  if not (r->>'ok')::boolean or (r->>'sklad_soni')::int <> 2 or (r->>'qarz_soni')::int <> 0 then raise exception 'ACC_FAIL 3a: %', r; end if;
  if not (r->'ogohlantirish') ? 'SHARTNOMA_YOQ' or not (r->'ogohlantirish') ? 'NARX_YOQ' then raise exception 'ACC_FAIL 3b ogohlantirish: %', r; end if;
  select count(*) into n from t2_sklad_harakat where buyurtma_id = b and operatsiya = 'prixod' and obyekt_id = ox and kompaniya_id = x and postavshik = 'ACC_YETKAZUVCHI';
  if n <> 2 then raise exception 'ACC_FAIL 3c harakat soni %', n; end if;
  select narx, obyomi into m, v from t2_sklad_harakat where buyurtma_qator_id = qa;
  if m is distinct from 100 or v <> 10 then raise exception 'ACC_FAIL 3d A narx/hajm % %', m, v; end if;
  select narx, obyomi into m, v from t2_sklad_harakat where buyurtma_qator_id = qb;
  if m is not null or v <> 4 then raise exception 'ACC_FAIL 3e B narx NULL bo''lishi kerak (0 emas): % %', m, v; end if;
  select qoldiq into m from t2_sklad_qoldiq where obyekt_id = ox and nomi = 'ACC Sement';
  select qoldiq into v from t2_sklad_qoldiq where obyekt_id = ox and nomi = 'ACC Qum';
  if m is distinct from 10 or v is distinct from 4 then raise exception 'ACC_FAIL 3f qoldiq % %', m, v; end if;
  select count(*) into n from t2_qarz_asos where buyurtma_qator_id in (qa, qb);
  if n <> 0 then raise exception 'ACC_FAIL 3g shartnomasiz qarz yozildi'; end if;
  select count(*) into n from t2_shartnoma where kompaniya_id = x;
  if n <> 0 then raise exception 'ACC_FAIL 3h shartnoma o''ylab topildi'; end if;

  -- 4. idempotent: shu operation_id ham, boshqa operation_id ham ikkinchi kirim yaratmaydi
  r := t2_buyurtma_qabul_yakunla_v1(ux, x, op1, b, null);
  if not (r->>'ok')::boolean or (r->>'sklad_soni')::int <> 0 or not (r->>'takror')::boolean then raise exception 'ACC_FAIL 4a: %', r; end if;
  r := t2_buyurtma_qabul_yakunla_v1(ux, x, op2, b, null);
  if (r->>'sklad_soni')::int <> 0 then raise exception 'ACC_FAIL 4b: %', r; end if;
  select qoldiq into m from t2_sklad_qoldiq where obyekt_id = ox and nomi = 'ACC Sement';
  select count(*) into n from t2_sklad_harakat where buyurtma_id = b;
  if m <> 10 or n <> 2 then raise exception 'ACC_FAIL 4c qoldiq % harakat %', m, n; end if;

  -- 5. noto'g'ri shartnoma (asosiy=true) rad, hech narsa yozilmaydi
  insert into t2_shartnoma (kompaniya_id, raqam, asosiy, taraf) values (x, 'ACC-BOSH', true, 'ACC_YETKAZUVCHI') returning id into sh_asosiy;
  r := t2_buyurtma_qabul_yakunla_v1(ux, x, op3, b, sh_asosiy);
  if r->>'code' is distinct from 'SHARTNOMA_NOTOGRI' then raise exception 'ACC_FAIL 5: %', r; end if;

  -- 6. yetkazuvchi shartnomasi paydo bo'ldi -> qayta chaqirilsa qarz qatorlari to'ldiriladi (kirim takrorlanmaydi)
  insert into t2_shartnoma (kompaniya_id, raqam, asosiy, taraf) values (x, 'ACC-YET-1', false, 'ACC_YETKAZUVCHI') returning id into sh;
  r := t2_buyurtma_qabul_yakunla_v1(ux, x, op3, b, sh);
  if not (r->>'ok')::boolean or (r->>'qarz_soni')::int <> 2 or (r->>'sklad_soni')::int <> 0 then raise exception 'ACC_FAIL 6a: %', r; end if;
  select summa, narx into m, v from t2_qarz_asos where buyurtma_qator_id = qa and tur = 'yetkazib_berish' and shartnoma_id = sh and sklad_harakat_id is not null;
  if m is distinct from 1000 or v is distinct from 100 then raise exception 'ACC_FAIL 6b A summa % narx %', m, v; end if;
  select summa, narx into m, v from t2_qarz_asos where buyurtma_qator_id = qb and tur = 'yetkazib_berish';
  if m is not null or v is not null then raise exception 'ACC_FAIL 6c B narxsiz: summa NULL bo''lishi kerak (0 emas): % %', m, v; end if;
  r := t2_buyurtma_qabul_yakunla_v1(ux, x, gen_random_uuid(), b, sh);
  select count(*) into n from t2_qarz_asos where buyurtma_qator_id in (qa, qb);
  if n <> 2 or (r->>'qarz_soni')::int <> 0 then raise exception 'ACC_FAIL 6d qarz takrorlandi: %', n; end if;

  -- 7. M-29 yo'li: obyekt qoldig'i t2_skladga_yozish (rasxod) orqali yechiladi - qoldiq yetarli (m29_bajar_v1 shu jadvaldan o'qiydi)
  r := t2_skladga_yozish(x, 'rasxod', ox, 'mat', current_date, 'ACC Sement', 'tonna', 6, null, null, null, 'acc', gen_random_uuid(), 'acceptance', null);
  select qoldiq into m from t2_sklad_qoldiq where obyekt_id = ox and nomi = 'ACC Sement';
  if not (r->>'ok')::boolean or m <> 4 then raise exception 'ACC_FAIL 7 rasxod: % qoldiq %', r, m; end if;

  -- 8. tur material emas -> sklad yozilmaydi; obyektsiz buyurtma -> OBYEKT_YOQ
  insert into t2_buyurtma (kompaniya_id, ijrochi_kompaniya_id, aloqa_id, tur, obyekt_id, holat, operation_id, yaratdi_actor_id)
    values (x, y, (select max(id) from t2_tomon_aloqa), 'transport', ox, 'qabul_qilindi_yakuniy', gen_random_uuid(), ux) returning id into b2;
  insert into t2_buyurtma_qator (kompaniya_id, buyurtma_id, qator_no, nom, birlik, miqdor, qabul_miqdor, qabul_holat) values (x, b2, 1, 'ACC Reys', 'reys', 1, 1, 'butun');
  r := t2_buyurtma_qabul_yakunla_v1(ux, x, gen_random_uuid(), b2, null);
  select count(*) into n from t2_sklad_harakat where buyurtma_id = b2;
  if r->>'otkazildi' is distinct from 'TUR_MATERIAL_EMAS' or n <> 0 then raise exception 'ACC_FAIL 8a: %', r; end if;
  insert into t2_buyurtma (kompaniya_id, ijrochi_kompaniya_id, aloqa_id, tur, obyekt_id, holat, operation_id, yaratdi_actor_id)
    values (x, y, (select max(id) from t2_tomon_aloqa), 'material', null, 'qabul_qilindi_yakuniy', gen_random_uuid(), ux) returning id into b3;
  r := t2_buyurtma_qabul_yakunla_v1(ux, x, gen_random_uuid(), b3, null);
  if r->>'code' is distinct from 'OBYEKT_YOQ' then raise exception 'ACC_FAIL 8b: %', r; end if;

  -- 9. O'qish RPC lari STABLE
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname in ('t2_buyurtmalar_v1', 't2_buyurtma_tafsilot_v1') and provolatile = 's';
  if n <> 2 then raise exception 'ACC_FAIL 9 STABLE emas: % / 2', n; end if;

  raise notice 'ACCEPTANCE OK 20261211100000';
end$acc$;

rollback;
