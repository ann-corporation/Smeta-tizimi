-- ACCEPTANCE: 20261214600100 - qarz QQS bilan + g'olib narxi narx manbasiga. BEGIN..ROLLBACK, sintetik ma'lumot, hech narsa qoldirmaydi.
-- Talab: 20261211100000 + 20261214600100 qo'llangan; ruxsat katalogi (rol 'boss'). Muvaffaqiyat: NOTICE 'ACCEPTANCE OK ...'.
begin;
set local statement_timeout = '300s';

do $acc$
declare
  x bigint; y bigint; ux bigint; uy bigint; ox bigint; sh bigint; b bigint; qa bigint; qb bigint; r jsonb; n integer; m numeric; v numeric; mid bigint;
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_XARIDOR2', 'ACC-X2', '920000011', true) returning id into x;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_YETKAZUVCHI2', 'ACC-Y2', '920000012', true) returning id into y;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc2_bx', 'X boss', 'faol') returning id into ux;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc2_by', 'Y boss', 'faol') returning id into uy;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ux, x, 'boss', 'faol'), (uy, y, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('ACC2-X-obyekt', x) returning id into ox;
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id)
    values (x, y, 'xaridor', 'yetkazuvchi', 'kontakt', 'faol', ux);
  insert into t2_buyurtma (kompaniya_id, ijrochi_kompaniya_id, aloqa_id, tur, obyekt_id, holat, qqs_foiz, operation_id, yaratdi_actor_id)
    values (x, y, (select max(id) from t2_tomon_aloqa), 'material', ox, 'qabul_qilindi_yakuniy', 12, gen_random_uuid(), ux) returning id into b;
  insert into t2_buyurtma_qator (kompaniya_id, buyurtma_id, qator_no, nom, birlik, miqdor, narx, qabul_miqdor, qabul_holat)
    values (x, b, 1, 'ACC2 Sement', 'tonna', 10, 100, 10, 'butun') returning id into qa;
  insert into t2_buyurtma_qator (kompaniya_id, buyurtma_id, qator_no, nom, birlik, miqdor, narx, qabul_miqdor, qabul_holat)
    values (x, b, 2, 'ACC2 Qum', 'm3', 5, null, 5, 'butun') returning id into qb;
  insert into t2_shartnoma (kompaniya_id, raqam, asosiy, taraf) values (x, 'ACC2-YET', false, 'ACC_YETKAZUVCHI2') returning id into sh;

  r := t2_buyurtma_qabul_yakunla_v1(ux, x, gen_random_uuid(), b, sh);
  if not (r->>'ok')::boolean or (r->>'sklad_soni')::int <> 2 or (r->>'qarz_soni')::int <> 2 then raise exception 'ACC_FAIL 1: %', r; end if;

  -- QARZ QQS BILAN: 100 -> 112, 10 ta -> 1120; narxsiz qator NULL (0 emas)
  select narx, summa into m, v from t2_qarz_asos where buyurtma_qator_id = qa;
  if m is distinct from 112 or v is distinct from 1120 then raise exception 'ACC_FAIL 2 qarz QQS bilan emas: % %', m, v; end if;
  select narx, summa into m, v from t2_qarz_asos where buyurtma_qator_id = qb;
  if m is not null or v is not null then raise exception 'ACC_FAIL 3 narxsiz qarz NULL bo''lishi kerak: % %', m, v; end if;
  -- sklad narxi NDS siz qoladi
  select narx into m from t2_sklad_harakat where buyurtma_qator_id = qa;
  if m is distinct from 100 then raise exception 'ACC_FAIL 4 sklad narxi: %', m; end if;

  -- NARX MANBASI: bitta manba (kp, nds_siz), faqat narxli qator (1 ta), yetkazuvchi nomi bilan
  select count(*), max(id) into n, mid from t2_narx_manba where kompaniya_id = x and tur = 'kp' and nds_holati = 'nds_siz' and yetkazuvchi = 'ACC_YETKAZUVCHI2';
  if n <> 1 then raise exception 'ACC_FAIL 5 manba soni %', n; end if;
  if (r->>'narx_manba_id')::bigint is distinct from mid then raise exception 'ACC_FAIL 5b javobda narx_manba_id: %', r; end if;
  select count(*), max(narx) into n, m from t2_narx_manba_qator where manba_id = mid;
  if n <> 1 or m is distinct from 100 then raise exception 'ACC_FAIL 6 manba qatorlari % narx %', n, m; end if;

  -- IDEMPOTENT: qayta chaqirish yangi manba/qarz/kirim yaratmaydi
  r := t2_buyurtma_qabul_yakunla_v1(ux, x, gen_random_uuid(), b, sh);
  select count(*) into n from t2_narx_manba where kompaniya_id = x and tur = 'kp';
  if n <> 1 or (r->>'qarz_soni')::int <> 0 or (r->>'sklad_soni')::int <> 0 then raise exception 'ACC_FAIL 7 takror: % manba %', r, n; end if;

  raise notice 'ACCEPTANCE OK 20261214600100';
end$acc$;

rollback;
