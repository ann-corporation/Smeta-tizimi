-- Rollback: trigger va yordamchi funksiyalar olib tashlanadi. Allaqachon yozilgan narx manbalari qoladi (kerak bo'lsa t2_narx_manba_bekor_v1 bilan bekor qiling).
drop trigger if exists t2_buyurtma_narx_manba_trg on public.t2_buyurtma;
drop function if exists public._t2_yet_narx_manba_trg();
drop function if exists public._t2_yet_narx_manba_yoz(bigint, bigint, text);
