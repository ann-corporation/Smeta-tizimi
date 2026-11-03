-- ROLLBACK: 20261122000000_t2_buyurtma_searchpath_v1 (search_path sozlamasini olib tashlaydi)
begin;
alter function public._t2_buyurtma_bosqich_holat(text) reset search_path;
alter function public._t2_buyurtma_otish_ruxsat(text,text,text) reset search_path;
alter function public._t2_yet_qator_xato(jsonb) reset search_path;
commit;
