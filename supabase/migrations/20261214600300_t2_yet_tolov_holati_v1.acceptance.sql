-- ACCEPTANCE: 20261214600300 - yetkazuvchi to'lov holati (grant bilan). BEGIN..ROLLBACK, sintetik ma'lumot.
-- Talab: 20261211100000, 20261214600100, 20261214600300 qo'llangan. 'tolov_holati' resursi bu testda vaqtincha faollashtiriladi (rollback qaytaradi).
begin;
set local statement_timeout = '300s';

do $acc$
declare
  x bigint; y bigint; ux bigint; uy bigint; ox bigint; sh bigint; b bigint; al bigint; r jsonb; q jsonb;
begin
  update t2_tomon_resurs set faol = true where kalit = 'tolov_holati';
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_XARIDOR4', 'ACC-X4', '920000031', true) returning id into x;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('ACC_YETKAZUVCHI4', 'ACC-Y4', '920000032', true) returning id into y;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc4_bx', 'X boss', 'faol') returning id into ux;
  insert into t2_foydalanuvchi (login, ism, holat) values ('acc4_by', 'Y boss', 'faol') returning id into uy;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ux, x, 'boss', 'faol'), (uy, y, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('ACC4-X-obyekt', x) returning id into ox;
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id)
    values (x, y, 'xaridor', 'yetkazuvchi', 'kontakt', 'faol', ux) returning id into al;
  insert into t2_buyurtma (kompaniya_id, ijrochi_kompaniya_id, aloqa_id, tur, obyekt_id, holat, qqs_foiz, operation_id, yaratdi_actor_id)
    values (x, y, al, 'material', ox, 'qabul_qilindi_yakuniy', 12, gen_random_uuid(), ux) returning id into b;
  insert into t2_buyurtma_qator (kompaniya_id, buyurtma_id, qator_no, nom, birlik, miqdor, narx, qabul_miqdor, qabul_holat)
    values (x, b, 1, 'ACC4 Sement', 'tonna', 10, 100, 10, 'butun');
  insert into t2_shartnoma (kompaniya_id, raqam, asosiy, taraf) values (x, 'ACC4-YET', false, 'ACC_YETKAZUVCHI4') returning id into sh;
  perform t2_buyurtma_qabul_yakunla_v1(ux, x, gen_random_uuid(), b, sh);      -- qarz 1120 (QQS bilan)

  -- 1. grant yo'q -> ruxsat=false, pul NULL
  r := t2_yet_tolov_holati_v1(uy, y);
  q := r->'qatorlar'->0;
  if (q->>'ruxsat')::boolean or q->>'qarz_qqs_bilan' is not null or q->>'tolov_holati' is not null then raise exception 'ACC_FAIL 1 grantsiz: %', q; end if;

  -- 2. grant -> qarz 1120, holat tolanmagan
  insert into t2_tomon_grant (aloqa_id, beruvchi_kompaniya_id, oluvchi_kompaniya_id, resurs, amallar, obyekt_id, berdi_actor_id)
    values (al, x, y, 'tolov_holati', array['korish'], ox, ux);
  r := t2_yet_tolov_holati_v1(uy, y);
  q := r->'qatorlar'->0;
  if not (q->>'ruxsat')::boolean or (q->>'qarz_qqs_bilan')::numeric <> 1120 or q->>'tolov_holati' is distinct from 'tolanmagan' then raise exception 'ACC_FAIL 2 grantli: %', q; end if;

  -- 3. qisman to'lov -> qisman; to'liq -> tolangan
  insert into t2_tolov (kompaniya_id, shartnoma_id, tur, summa, sana, holat) values (x, sh, 'tolov', 500, current_date, 'faol');
  q := (t2_yet_tolov_holati_v1(uy, y))->'qatorlar'->0;
  if q->>'tolov_holati' is distinct from 'qisman' or (q->>'qarz_qqs_bilan')::numeric <> 620 then raise exception 'ACC_FAIL 3a: %', q; end if;
  insert into t2_tolov (kompaniya_id, shartnoma_id, tur, summa, sana, holat) values (x, sh, 'tolov', 620, current_date, 'faol');
  q := (t2_yet_tolov_holati_v1(uy, y))->'qatorlar'->0;
  if q->>'tolov_holati' is distinct from 'tolangan' then raise exception 'ACC_FAIL 3b: %', q; end if;

  -- 4. begona actor (xaridor a'zosi yetkazuvchi tenantida emas) -> 42501
  begin perform t2_yet_tolov_holati_v1(ux, y); raise exception 'ACC_FAIL 4 begona o''tdi';
  exception when others then if sqlstate <> '42501' then raise exception 'ACC_FAIL 4: % %', sqlstate, sqlerrm; end if; end;

  raise notice 'ACCEPTANCE OK 20261214600300';
end$acc$;

rollback;
