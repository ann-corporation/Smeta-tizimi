# DIQQAT barcha agentlarga — prod bazani tozalash (egasi qarori, 2026-10-27)

Egasi: «NEW TIMES BUILDINGS MCHJ (123) kompaniya ma'lumotlari qolsin, qolgani kerak emas — hammasini o'chirib tashla».
Sabab: baza 671 MB > bepul tarif 500 MB (t2_qator 298 MB, t2_qator_muhr 141 MB; 28 bekor obyekt + 17/123 dagi dublikat obyektlar).

- **O'chadi:** kompaniyalar 17 (NEW TIMES BUILDINGS), 21 (iho), 39 (Anvar shaxsiy, DEMO), 178 (test) va ularning BARCHA ma'lumotlari;
  kompaniya 1 ning ma'lumotlari (obyektlar, smeta…). Kompaniya 1 qatori «Platforma (tizim)» nomi bilan faqat superadmin a'zoligi uchun qoladi.
- **Qoladi:** kompaniya 123 to'liq; barcha foydalanuvchi hisoblari (faqat o'chgan kompaniyalardagi a'zoliklari ketadi).
- **Sinov loginlari** `testboss` (52), `prorab` (84), `testpto` (303), `boss` (3), `annakh` (33) a'zoliksiz qoladi — QA/smoke uchun
  ishlatsangiz, 123 ga taklif havolasi bilan qayta qo'shing yoki egasidan so'rang.
- Skript: `ops/sql/20261027_5A_tozalash_SINOV.sql` (rollback bilan) → egasi natijasi tekshiriladi → `5B` (commit) → `5C` (VACUUM FULL).
- Testlaringiz kompaniya 17 / obyekt id larga qattiq bog'langan bo'lsa (masalan 17, 127, 147), ular endi yo'q — 123 dagi mos obyektlar: 151, 182, 153, 170, 154, 155.
