-- Hujjat reestri: loyihasi yo'q obyekt ham manba fayl saqlay olsin (egasi, 2026-10-17: «16-Etaj Dom» smetasi
-- «Manba fayli kanonik R2 saqlashga qabul qilinmadi» bilan yuklanmadi — sabab faqat shu NOT NULL cheklovi).
-- Reserve RPC lari (t2_document_canonical_reserve_v1/_slot_v1) loyiha NULL ni allaqachon to'g'ri qo'llaydi:
-- R2 kaliti `docs/<k>/_/<o>/...`, solishtirishlar `is not distinct from`; fayl explorer `left join` bilan.
-- Laboratoriya, ekspert, buyurtmachi kabi loyihasiz kompaniyalar uchun ham kerak (KOORDINATSIYA ochiq qarori, variant b).
alter table public.t2_document_registry alter column loyiha_id drop not null;
