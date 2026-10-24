-- 20261108101000 - Buyurtmachi so'rovlari: murojaat turlari katalogiga ikki qator (schema o'zgarmaydi, E1/E7: yangi tur = bitta qator).
--   ozgartirish_sorovi - o'zgartirish / qo'shimcha ish so'rovi (buyurtmachi -> pudratchi; javob + dalil + yopish mavjud oqim bilan)
--   hujjat_sorovi      - hujjat so'rovi (ruxsatnoma, sertifikat, F-3 nusxasi va h.k.; javobga dalil hujjat biriktiriladi)
insert into public.t2_tomon_murojaat_turi (kalit, nom, nom_ru, faol, tartib) values
  ('ozgartirish_sorovi', 'O‘zgartirish / qo‘shimcha ish so‘rovi', 'Запрос на изменение / дополнительные работы', true, 80),
  ('hujjat_sorovi',      'Hujjat so‘rovi',                         'Запрос документа',                          true, 90)
on conflict (kalit) do nothing;
