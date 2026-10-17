-- ROLLBACK for 20261106460000_t2_token_hisoblangan_katak_izoh.sql — 20261106450000 dagi izohlar qaytadi.
begin;

update public.t2_token_narx
   set izoh = 'F2 hujjati: asosiy + har 100 yacheyka (yuqori chegara yo‘q — narx hajmga mos)', yangilandi = now()
 where amal = 'f2_hujjat';

update public.t2_token_narx
   set izoh = 'Rasmiy hujjatlar: LRV, F3, nakopitelniy, ostatka, slichitelniy, M-29, resurs vedomost, LRV↔RES sverka, oferta, AOSR va reestrlar, Studio smeta hujjatlari — asosiy + har 100 yacheyka (yuqori chegara yo‘q)', yangilandi = now()
 where amal = 'hujjat';

commit;
