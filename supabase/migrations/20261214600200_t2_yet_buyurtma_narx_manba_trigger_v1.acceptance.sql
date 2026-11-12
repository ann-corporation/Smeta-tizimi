-- ACCEPTANCE: 20261214600200 - buyurtma yaratilganda narx manbasi. BEGIN..ROLLBACK, sintetik ma'lumot. Talab: 20261214600100 + 20261214600200 qo'llangan.
begin;
set local statement_timeout = '300s';

do $acc$
declare
  x bigint; y bigint; ux bigint; ox bigint; b bigint; n integer; m numeric; mid bigint;
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_XARIDOR3', 'ACC-X3', '920000021', true) returning id into x;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_YETKAZUVCHI3', 'ACC-Y3', '920000022', true) returning id into y;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc3_bx', 'X boss', 'faol') returning id into ux;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ux, x, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('ACC3-X-obyekt', x) returning id into ox;
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id)
    values (x, y, 'xaridor', 'yetkazuvchi', 'kontakt', 'faol', ux);
  insert into t2_buyurtma (kompaniya_id, ijrochi_kompaniya_id, aloqa_id, tur, obyekt_id, holat, operation_id, yaratdi_actor_id)
    values (x, y, (select max(id) from t2_tomon_aloqa), 'material', ox, 'yuborildi', gen_random_uuid(), ux) returning id into b;
  insert into t2_buyurtma_qator (kompaniya_id, buyurtma_id, qator_no, nom, birlik, miqdor, narx) values (x, b, 1, 'ACC3 Sement', 'tonna', 10, 100), (x, b, 2, 'ACC3 Qum', 'm3', 5, null);

  -- trigger DEFERRED: tranzaksiya oxirida ishlaydi; testda uni qo'lda tez ishga tushiramiz
  set constraints t2_buyurtma_narx_manba_trg immediate;
  set constraints t2_buyurtma_narx_manba_trg deferred;
  -- (immediate qilish kutilayotgan triggerlarni darhol bajaradi)
  select count(*), max(id) into n, mid from t2_narx_manba where kompaniya_id = x and tur = 'kp' and nds_holati = 'nds_siz' and yetkazuvchi = 'ACC_YETKAZUVCHI3';
  if n <> 1 then raise exception 'ACC_FAIL 1 manba soni %', n; end if;
  select count(*), max(narx) into n, m from t2_narx_manba_qator where manba_id = mid;
  if n <> 1 or m is distinct from 100 then raise exception 'ACC_FAIL 2 qatorlar % narx %', n, m; end if;

  -- IDEMPOTENT: yordamchini qayta chaqirish yangi manba yaratmaydi
  perform public._t2_yet_narx_manba_yoz(x, b, 'acc');
  select count(*) into n from t2_narx_manba where kompaniya_id = x and tur = 'kp';
  if n <> 1 then raise exception 'ACC_FAIL 3 takror manba %', n; end if;

  raise notice 'ACCEPTANCE OK 20261214600200';
end$acc$;

rollback;
