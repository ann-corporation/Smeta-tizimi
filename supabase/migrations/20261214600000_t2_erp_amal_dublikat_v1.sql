-- AUDIT 121 (2026-11-11): «Yangi zayavka» -> «Ma'lumotni yuklab bo'lmadi». Ildiz sabab: prodda t2_erp_amal IKKI nusxada:
--   t2_erp_amal(bigint, text, text,  text)  - eski (maxsulot/miqdor/holat ustunlari; ustunlar 20260829051300 da item_text/requested_qty/status ga o'zgargan -> endi ISHLAMAYDI)
--   t2_erp_amal(bigint, text, jsonb, text)  - canonical (t2_procurement_request_create/transition)
-- PostgREST bir xil nomli argumentlar bilan nusxani tanlay olmaydi (PGRST203) -> shlyuz uni «UPSTREAM» deb yashirgan.
-- Eski nusxa olib tashlanadi; shlyuz (sb-yoz.ts erp_amal) p_payload ni endi OBYEKT sifatida yuboradi (jsonb nusxa).
-- Faqat funksiya; jadval/ma'lumotga tegmaydi. Hajm: 0 MB.
drop function if exists public.t2_erp_amal(bigint, text, text, text);
