-- 20261221830000 — mavjud podvalsiz F-2 QORALAMALAR uchun smeta podvali backfill (idempotent; tasdiqlangan/bekor aktlarga TEGMAYDI).
-- Funksiya 20261221810000 da. Smeta podvali yo'q obyekt — o'tkaziladi (ogohlantirish, qulf yo'q). Qayta chaqirish zararsiz.
select public.t2_akt_podval_backfill_qoralama_v1(null);