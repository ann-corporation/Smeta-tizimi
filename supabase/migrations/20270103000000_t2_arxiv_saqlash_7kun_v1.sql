-- Saqlash muddati 7 kun (DB 500 MB limitda): onboarding/addrepl buyruq jurnallari, audit jurnali, hal bo'lgan F2 qoralama qatorlari.
-- ARXIV_OGOH_MB 450 -> 380 va snapshot toast autovacuum sozlamasi ham shu yerda. t2_ozgarish 30 kunda QOLADI (muhr farq ko'rinishi o'qiydi).
-- Arxivlash mexanizmi o'zgarmagan: t2_arxiv_batch_v1 muddatni t2_arxiv_siyosat.saqlash_kun dan oladi, qatorlar R2 ga ndjson.gz + manifest;
-- tiklash: t2_arxiv_tikla_v1 / POST /api/arxiv-tick {amal:'tikla'} (muddatga bog'liq emas). Faqat metama'lumot - qator o'chirmaydi (o'chirishni arxivlovchi qiladi).
-- TS reyestri (frontend/functions/_shared/arxiv-siyosat.ts) bilan mosligi arxiv-siyosat.test.ts da tekshiriladi.
begin;
set local lock_timeout = '3s';

update public.t2_arxiv_siyosat set saqlash_kun = 7 where jadval = 't2_onboarding_command_log';
update public.t2_arxiv_siyosat set saqlash_kun = 7 where jadval = 't2_addrepl_command';
update public.t2_arxiv_siyosat set saqlash_kun = 7 where jadval = 't2_audit_log';
update public.t2_arxiv_siyosat set saqlash_kun = 7 where jadval = 't2_f2_import_draft_qator';

-- Bo'sh qolgan toast joyi tez qayta ishlatilsin (88 MB toast; sukut 20% scale factor juda kech).
alter table snapshot.bolak_mazmun set (toast.autovacuum_vacuum_scale_factor = 0.02, toast.autovacuum_vacuum_threshold = 200, autovacuum_vacuum_scale_factor = 0.05);

commit;