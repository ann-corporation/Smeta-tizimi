# ADR: drive_id va papka daraxti - R2 kalit + o'z papka daraxtimiz

Sana: 2026-11-15. Holat: qabul qilingan (egasi qarori: Google Drive tizimdan butunlay chiqariladi).

## Qaror
1. Fayl haqiqati: private R2 (`R2_CANONICAL`), kalit sxemasi `docs/{kompaniya}/{loyiha|0}/{obyekt|0}/d{document_id}/r{seq}`; yozish faqat `r2Yoz` (functions/_shared/r2-saqlash.ts) orqali. Metama'lumot: `t2_document_registry` (sha256, r2_key, versiya).
2. Papka daraxti: tashqi Drive papkalari o'rniga o'zimizning daraxt (`t2_papka` / papka daraxti jadvallari, `lib/fayl-daraxt`). Papka - mantiqiy guruh; hujjat papkaga registry orqali bog'lanadi, jismoniy joy R2 kalitida o'zgarmaydi (ko'chirish/nom o'zgartirish = metama'lumot yangilash, R2 baytlari qayta yozilmaydi).
3. `drive_id` / `drive_file_id` / `drive_parent_id` / `drive_revision` / `drive_sync_status`: yangi kodda ishlatilmaydi. Eski qiymatlar faqat `t2_document_registry_drive_bak` zaxira jadvalida saqlanadi (20261230000000 migratsiyasi yaratadi); `t2_papka` / `t2_obyekt` dagi drive_id ustunlari alohida keyingi migratsiyada olib tashlanadi, avval qiymatlari shu zaxiraga nusxalanadi.
4. Replika navbati (`t2_replica_sync_job`), `t2_document_replica_*_v1` va `t2_replica_job_*_v1` funksiyalari o'chadi.

## Tartib (migratsiya)
- 20261229000000: Drive ustunlariga murojaat qiladigan funksiyalar Drive'siz qayta yoziladi (qo'llanmagan).
- 20261230000000: zaxira jadval, funksiyalar/navbat/ustunlar drop (qo'llanmagan; guard Drive-only hujjat yoki murojaat qiluvchi funksiya topsa to'xtatadi).

## Oqibatlar
- Drive ga bog'liq UI (fayl saqlash workspace sozlamalari, Drive nusxa holati) olib tashlanadi; hujjat markazi faqat R2 + registry (+ Sheets replika) ko'rsatadi.
- Orqaga qaytish: rollback zaxiradan drive_* ustunlarini tiklaydi; kod tomonini git orqali qaytarish mumkin.