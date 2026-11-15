-- 20261229500000 - t2_document_canonical_backfill_v1 ni o'chirish (20261230000000 guard o'tishi uchun).
-- Bir martalik Drive-only -> R2 backfill yordamchisi (drive_revision/drive_sync_status yozadi). Repo bo'yicha chaqiruvchisi yo'q:
-- frontend/functions/GAS/cron/ops skriptlarida topilmadi (faqat hujjat/reestr tilga olinadi); ops/scripts/drive-r2-kochir.mjs /api/hujjat-yukla ishlatadi.
-- Drive-only hujjat 0 (2026-11-15 o'lchovi), shuning uchun kerak emas. Ma'lumotga tegmaydi; non-Drive ma'lumot yo'qolmaydi.
drop function if exists public.t2_document_canonical_backfill_v1(bigint,text,text,bigint,text,text);
