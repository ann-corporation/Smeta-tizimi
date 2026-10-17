-- T2-TOKEN-MONETIZATSIYA-001 — hujjat narxi faqat tizim HISOBLAGAN kataklar bo'yicha (egasi, 2026-10-17):
--   "tizim faqatgina o'zi ishlatgan, ya'ni hisob qilib yozgan narsalarni yozishi kerak; tayyor hujjatlardan olingan
--    narsalarga ham yacheyka deb hisoblash noto'g'ri".
-- Sanash qoidasi kodda (frontend `lib/token-hujjat.ts`, `hujjat-yozuvchi/rasmiy.ts`): faqat formula bor katak;
-- matn, ish nomlari, hujjatdan ko'chirilgan sonlar va foydalanuvchining asl faylidagi o'zgarmagan kataklar sanalmaydi.
-- Bu migratsiya faqat foydalanuvchiga ko'rinadigan izohni (amal katalogi) shu qoidaga moslaydi; narx sonlari o'zgarmaydi.
begin;

update public.t2_token_narx
   set izoh = 'F2 hujjati: asosiy + har 100 ta tizim hisoblagan katak (formula; matn va ko‘chirilgan sonlar sanalmaydi). Yuqori chegara yo‘q',
       yangilandi = now()
 where amal = 'f2_hujjat';

update public.t2_token_narx
   set izoh = 'Rasmiy hujjatlar: LRV, F3, nakopitelniy, ostatka, slichitelniy, M-29, resurs vedomost, LRV↔RES sverka, oferta, AOSR va reestrlar, Studio smeta hujjatlari — asosiy + har 100 ta tizim hisoblagan katak (formula; matn, ko‘chirilgan sonlar va foydalanuvchining asl faylidagi kataklar sanalmaydi). Yuqori chegara yo‘q',
       yangilandi = now()
 where amal = 'hujjat';

commit;
