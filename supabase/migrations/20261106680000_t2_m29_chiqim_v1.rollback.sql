-- Rollback 20261106680000: Fakt → ombor triggerlari qayta ulanadi; M-29 funksiyalari olib tashlanadi.
-- DIQQAT: bajarilgan M-29 hujjatlarining chiqimlari ombor tarixida QOLADI (manba='m29'); jadval saqlanadi (m29_hujjat_id FK uchun).
-- Agar ularni ham olib tashlash kerak bo'lsa — avval har birini t2_m29_bekor_v1 bilan bekor qiling.
create trigger trg_akt_sklad_sync after insert on public.t2_akt_qator for each row execute function trg_t2_akt_qator_sklad();
create trigger trg_akt_sklad_sync_del after delete on public.t2_akt_qator for each row execute function trg_t2_akt_qator_sklad_bekor();
drop function if exists public.t2_m29_bajar_v1(bigint, bigint, bigint, text, jsonb, uuid, boolean, boolean);
drop function if exists public.t2_m29_bekor_v1(bigint, bigint, bigint, text);
