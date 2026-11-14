-- Backfill qaytarish: faqat shu avto-yozuvlar (manba 'backfill' + tekshiruv.avto) va faqat qoralama aktlarda.
delete from public.t2_akt_podval p using public.t2_akt a
 where a.id = p.akt_id and a.tur = 'f2' and a.holat = 'qoralama' and p.manba = 'backfill' and p.tekshiruv ? 'avto';