-- ACCEPTANCE: 20261122000000_t2_buyurtma_searchpath_v1 - BEGIN..ROLLBACK, ma'lumot yozmaydi.
-- Tekshiradi: 3 funksiya ham proconfig da search_path=public, pg_temp ga ega va xulq o'zgarmagan.
begin;

do $acc$
declare n int;
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='public' and p.proname in ('_t2_buyurtma_bosqich_holat','_t2_buyurtma_otish_ruxsat','_t2_yet_qator_xato')
     and p.proconfig @> array['search_path=public, pg_temp'];
  if n <> 3 then raise exception 'SEARCHPATH_NOT_SET: % / 3', n; end if;
  if public._t2_buyurtma_otish_ruxsat('yuborildi','qabul_qilindi','ijrochi') is distinct from true then raise exception 'OTISH_RUXSAT_REGRESS'; end if;
  if public._t2_buyurtma_otish_ruxsat('yuborildi','qabul_qilindi','xaridor') is distinct from false then raise exception 'OTISH_RUXSAT_REGRESS2'; end if;
  if public._t2_buyurtma_bosqich_holat('tayyorlanmoqda') is distinct from 'bajarilmoqda' then raise exception 'BOSQICH_REGRESS'; end if;
  if public._t2_yet_qator_xato(null) is distinct from 'QATORLAR_NOTOGRI' then raise exception 'YET_QATOR_REGRESS'; end if;
  raise notice 'ACCEPTANCE OK';
end$acc$;

rollback;
