-- Egasi 2026-10-20: «narxsiz» = narxi YO'Q (NULL) NOYOB resurslar soni (nom+birlik bo'yicha). ЗАТРАТЫ ТРУДА МАШИНИСТОВ
-- (mashina-soat ichida) va narx 0 (foydalanuvchi qo'ygan haqiqiy narx) hisobga KIRMAYDI.
-- Amfiteatr: 1455 qator → 74 resurs; Suniy ko'l: 3655 → 198. Faqat narxsiz ustuni o'zgardi, qolgan ustunlar aynan.
begin;
create or replace view public.t2_obyekt_jami as
 SELECT id,
    nom,
    tur,
    ( SELECT count(*) AS count FROM t2_qator q WHERE q.obyekt_id = o.id) AS qator_soni,
    ( SELECT count(*) AS count FROM t2_qator q WHERE q.obyekt_id = o.id AND q.tur = 'rz'::text) AS razdel,
    ( SELECT count(*) AS count FROM t2_qator q WHERE q.obyekt_id = o.id AND q.tur = 'bl'::text) AS ish,
    ( SELECT count(*) AS count FROM t2_qator q WHERE q.obyekt_id = o.id AND q.tur = 'rs'::text) AS resurs,
    ( SELECT sum(q.summa) AS sum FROM t2_qator q WHERE q.obyekt_id = o.id AND q.tur = 'rz'::text) AS jami,
    ( SELECT count(DISTINCT (upper(btrim(COALESCE(q.nom, ''::text))), COALESCE(q.birlik, ''::text))) AS count FROM t2_qator q
       WHERE q.obyekt_id = o.id AND (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.narx IS NULL
         AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text) AS narxsiz,
    ( SELECT sum(q.summa) AS sum FROM t2_qator q WHERE q.obyekt_id = o.id AND (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ЧЕЛ'::text) AS chel,
    ( SELECT sum(q.summa) AS sum FROM t2_qator q WHERE q.obyekt_id = o.id AND (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАШ'::text) AS mash,
    ( SELECT sum(q.summa) AS sum FROM t2_qator q WHERE q.obyekt_id = o.id AND (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАТ'::text) AS mat,
    ( SELECT sum(q.summa) AS sum FROM t2_qator q WHERE q.obyekt_id = o.id AND (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ОБ'::text) AS ob,
    yangilandi,
    kompaniya_id,
    lat,
    lng,
    versiya,
    loyiha_id
   FROM t2_obyekt o
  WHERE holat <> 'bekor'::text;
commit;
