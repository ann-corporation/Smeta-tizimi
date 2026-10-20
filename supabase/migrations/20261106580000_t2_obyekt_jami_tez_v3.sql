-- TEZLIK (egasi 2026-10-20: «qisqa kutish ham ishonchni o'ldiradi»): t2_obyekt_jami har obyekt uchun t2_qator ni 10 marta
-- alohida o'qirdi — deyarli har sahifa va har obyekt ro'yxati shuni o'qiydi (726 chaqiruv, o'rtacha 1,6 s, eng uzuni 20 s).
-- Endi bitta o'tishda FILTER bilan yig'iladi: kompaniya 17 uchun 4258 ms → 119 ms. Qiymatlar 20261106570000 bilan aynan
-- (26 obyekt, EXCEPT ikkala tomonga 0 farq). Ustunlar, ularning tartibi va turi o'zgarmagan.
begin;
create or replace view public.t2_obyekt_jami as
 SELECT o.id, o.nom, o.tur,
    coalesce(a.qator_soni, 0::bigint) AS qator_soni, coalesce(a.razdel, 0::bigint) AS razdel, coalesce(a.ish, 0::bigint) AS ish, coalesce(a.resurs, 0::bigint) AS resurs,
    a.jami, coalesce(a.narxsiz, 0::bigint) AS narxsiz, a.chel, a.mash, a.mat, a.ob,
    o.yangilandi, o.kompaniya_id, o.lat, o.lng, o.versiya, o.loyiha_id
   FROM t2_obyekt o
   LEFT JOIN LATERAL (
     SELECT count(*) AS qator_soni,
       count(*) FILTER (WHERE q.tur = 'rz') AS razdel,
       count(*) FILTER (WHERE q.tur = 'bl') AS ish,
       count(*) FILTER (WHERE q.tur = 'rs') AS resurs,
       sum(q.summa) FILTER (WHERE q.tur = 'rz') AS jami,
       count(DISTINCT (upper(btrim(COALESCE(q.nom, ''))), COALESCE(q.birlik, ''))) FILTER (WHERE q.tur IN ('rs','mat','ob') AND q.narx IS NULL AND COALESCE(q.nom, '') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ') AS narxsiz,
       sum(q.summa) FILTER (WHERE q.tur IN ('rs','mat','ob') AND q.kat = 'ЧЕЛ') AS chel,
       sum(q.summa) FILTER (WHERE q.tur IN ('rs','mat','ob') AND q.kat = 'МАШ') AS mash,
       sum(q.summa) FILTER (WHERE q.tur IN ('rs','mat','ob') AND q.kat = 'МАТ') AS mat,
       sum(q.summa) FILTER (WHERE q.tur IN ('rs','mat','ob') AND q.kat = 'ОБ') AS ob
     FROM t2_qator q WHERE q.obyekt_id = o.id) a ON true
  WHERE o.holat <> 'bekor';
commit;
