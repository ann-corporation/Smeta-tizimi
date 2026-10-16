-- T2-TOKEN-MONETIZATSIYA-001 — token narxi v3: yuqori chegara olib tashlanadi (egasi qarori).
-- Egasi (2026-10-02, BUSINESS_MODEL v3): "30–100 ming — fiksirlangan summa EMAS, taxminiy mo'ljal edi; min–max qattiq
--   chegara sifatida qolmasin; narx = haqiqiy ish hajmi va qiyinligi".
-- Egasi (2026-10-16): "tizimni maksimal pul ishlaydigan darajada qil — juda kam xizmat uchun token hisoblanadi".
-- O'zgarish: f2_hujjat va hujjat uchun max_som = NULL (minimum saqlanadi). Katta hujjat endi kataklar soniga mos narxlanadi:
--   masalan 20 000 yacheykali F2: (20 000 + 200 × 1 000) × 1,3 = 286 000 so'm (oldin 100 000 da kesilardi).
-- `hujjat` izohi — shu toifadagi barcha rasmiy hujjatlar ro'yxati (amal katalogi foydalanuvchiga ko'rinadi, «Tokenlar» sahifasi).
-- Faqat narx jadvali qatorlari; sxema o'zgarmaydi. Qaytarish: .rollback.sql (oldingi chegaralar).
begin;

update public.t2_token_narx
   set max_som = null,
       izoh = 'F2 hujjati: asosiy + har 100 yacheyka (yuqori chegara yo‘q — narx hajmga mos)',
       yangilandi = now()
 where amal = 'f2_hujjat';

update public.t2_token_narx
   set max_som = null,
       izoh = 'Rasmiy hujjatlar: LRV, F3, nakopitelniy, ostatka, slichitelniy, M-29, resurs vedomost, LRV↔RES sverka, oferta, AOSR va reestrlar, Studio smeta hujjatlari — asosiy + har 100 yacheyka (yuqori chegara yo‘q)',
       yangilandi = now()
 where amal = 'hujjat';

commit;
