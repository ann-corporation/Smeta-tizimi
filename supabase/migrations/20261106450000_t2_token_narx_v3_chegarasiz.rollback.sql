-- ROLLBACK for 20261106450000_t2_token_narx_v3_chegarasiz.sql — v2 chegaralari va izohlari qaytadi.
begin;

update public.t2_token_narx
   set max_som = 100000, izoh = 'F2 hujjati: asosiy + har 100 yacheyka', yangilandi = now()
 where amal = 'f2_hujjat';

update public.t2_token_narx
   set max_som = 60000, izoh = 'Boshqa hujjatlar (nakopitelniy, F3, M-29, akt…)', yangilandi = now()
 where amal = 'hujjat';

commit;
