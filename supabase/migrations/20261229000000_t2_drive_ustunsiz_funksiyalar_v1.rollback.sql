-- Rollback 20261229000000: funksiyalarning eski (Drive ustunlariga murojaat qiluvchi) ta'riflarini qaytarish uchun quyidagi migratsiyalarni funksiya bo'yicha qayta yuriting:
--   reserve_v1: 20261106230000; reserve_slot/finalize/reconcile: 20261025090000; registry_v1: 20261021120000; boss_dashboard_v1: 20261217000000; tizim_xaritasi_v1: 20261114100000.
-- (Drive ustunlari 20261230000000 gacha mavjud.) Ma'lumotga ta'sir yo'q.
select 1;
