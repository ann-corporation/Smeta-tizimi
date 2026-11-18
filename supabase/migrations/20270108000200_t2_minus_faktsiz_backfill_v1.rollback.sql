-- Teskari: 20270108000200 (backfill funksiyalari). Yozilgan fakt akti (izoh 'minus juft backfill') bo'lsa — uni akt_bekor bilan bekor qiling. BEGIN/COMMIT yo'q.
drop function if exists public.t2_fakt_minus_qollash_v1(bigint, bigint, bigint, date, boolean, uuid);
drop function if exists public.t2_fakt_minus_korik_v1(bigint);
