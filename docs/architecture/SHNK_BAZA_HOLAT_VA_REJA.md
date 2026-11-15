# ShNK bazasi: holat va tugatish rejasi (2026-11-15)

Manba: D:\ShNK (disk), `t2_normativ_hujjat/bolak` (DB, faqat COUNT so'rovlar), repo skriptlari. R2 ro'yxati olinmadi (`wrangler r2 object list` shu versiyada mavjud emas; `wrangler r2 object` faqat get/put/delete). Qiymatlar R2 da tekshirilmagan.

## 1. Raqamlar

| Ko'rsatkich | Qiymat |
|---|---|
| D:\ShNK fayllari | 353 (348 PDF, 3 ZIP, 2 DOCX), 473 MB, papkasiz (tekis) |
| Seriyalar (fayl soni) | 2.xx: ~127; 4.xx: ~132 (4.02 - narx/resurs normalari, 4.13, 4.17); 1.xx: ~21; 3.xx: 7; KR 01-07: 27; ShNK/KMK/QMQ: ~25; SBORNIK 1-9; DOPOLNENIE 1-15 (3 tasi ZIP); 460-son qarori; SRN 4.02.07/11/12-23 |
| Yuklangan hujjat (DB) | **3** (hammasi PUBLISHED, 7 noyabr 2026): 4.02.08-22, 2.03.01-24, 4.02.06-04; 5.2 MB |
| Bo'lak (chunk) | 379 (108 o'rtacha, 0 hujjat bo'laksiz) = sahifa/blok birligi, matn R2 da, DB da faqat metadata |
| Qamrov | 3 / ~348 PDF = **~1%** (kodlar bo'yicha ~0.9%); ZIP/DOCX 0 |
| bob_punkt to'ldirilgan | 0 ta bo'lak (jadval_kod: 3 ta bo'lak) -> punkt darajasidagi iqtibos yo'q |
| BOG_MIYASI | faqat `05_KALKULYATSIYALAR_SHNQ_TASHQARI` (ShNK normalari emas) |

Eslatma: `+` / `++` qo'shimchali fayllar (masalan 2.04.17-19, -19+, -19++) bitta hujjatning nashrlari/qo'shimchalari; dubl tahririni aniqlash kerak. Ko'p fayl nomlari kirill/lotin aralash (`4.02.13-04+`, `4.02.13-04`).

## 2. Mavjud quvur (pipeline)
- K1: `scripts/normativ/pipeline.py` (PDF native + Tesseract OCR ixtiyoriy, DOCX, ZIP; checkpoint, OCR_REQUIRED bayroqlari). Tesseract bu mashinada **o'rnatilmagan**.
- K4: `tools/normativ-ingest/prepare.py D:/ShNK ...` -> `ingest-queue.json`; `table_candidates.py`. Bu bosqichda **titul metadatasi qo'lda** tekshiriladi (norma_kod, tahrir, nom) - asosiy to'siq.
- K2: `scripts/normativ/r2_upload.py` (private R2 `normativ/original|chunks|manifests`) + RPC `t2_normativ_hujjat_qosh_v1`, `t2_normativ_holat_v1` (REVIEW -> INDEXED -> PUBLISHED, CAS). Migratsiya 20261203001100/1400.
- K3: `functions/api/normativ-qidir.ts` + `NormativAiQidiruv.tsx`, `_shared/normativ-evidence.ts` (sahifa dalili).
- Har hujjat qo'lda review qilinadi; flag bor hujjat INDEXED bo'lmaydi. Shu sababli 3 ta hujjatdan keyin to'xtagan (qo'l mehnati to'sig'i).

## 3. Bo'shliqlar (gap)
1. **Qamrov ~1%**: 345+ hujjat yuklanmagan (4.02.xx narx-resurs normalari, 2.xx hisob normalari, KR, SRN, qo'shimchalar).
2. **Punkt/jadval metadatasi bo'sh**: bob_punkt hamma joyda NULL; qidiruv faqat yorliq (qidiruv_yorliq) bo'yicha - "nega bu norma" uchun aniq punkt iqtibosi yo'q.
3. **Skan/OCR noma'lum**: 33 fayl >3 MB, 16 fayl <200 KB; qaysi biri skan ekani tekshirilmagan (Tesseract yo'q, pdf matn tekshiruvi qilinmadi). Kirill (rus + o'zbek kirill) uchun `rus+uzb_cyrl` til ma'lumoti kerak.
4. **Qidiruv sifati**: tsvector `simple` konfig, faqat kod/yorliq indekslanadi (to'liq matn emas, K2 qarori). Rus morfologiyasi (бетонный/бетонные/бетона) va o'zbek kirill/lotin aralashuvi hal qilinmagan; trigram `nom` va `qidiruv_yorliq` da (ikkinchisi katta jadvalda og'ir).
5. **Nashr/versiya boshqaruvi yo'q**: bitta norma_kod uchun bir necha tahrir (-97, -04, -22) va '+' qo'shimchalar; "amaldagi" bayrog'i, almashtirilgan hujjat aloqasi (superseded_by) yo'q. Kod unikal emas (kod+tahrir).
6. **Norma katalogi (R2 norm-library, 48 083 ish, 112 to'plam)**: 2 411 norma resurs tarkibisiz (SMETA_USTASI_V1.md). Katalog ish-normasi bilan ShNK hujjat o'rtasida **bog'lanish jadvali yo'q** (norma shifri -> ShNK punkti). To'plamlar bo'yicha to'liq/qisman jadval R2 dan olinmadi (shard o'qish alohida bosqich).

## 4. Tugatish rejasi

Faza 0 (0.5 kun) - inventar: fayl -> (kod, tahrir, til, matn/skan, sahifa soni, SHA256) CSV; takrorlar va '+' qo'shimchalarni guruhlash. Pdf matn qatlami tekshiruvi (pypdfium2) -> skan ro'yxati. Chiqish: `D:\private\shnk-inventar.csv` (repoga emas).
Faza 1 (1-2 kun) - matnli PDF'lar (kutilgan ko'pchilik): `prepare.py` + `r2_upload.py` ommaviy rejim; titul metadatasi avtomatik (regex kod-yil + birinchi sahifa nomi), faqat past ishonchli qatorlar qo'lda. Review bayroqlari bo'yicha ommaviy INDEXED (admin tasdig'i ro'yxat bo'yicha, har biriga alohida bosish emas).
Faza 2 (2-3 kun) - skanlar: Tesseract (bepul, mahalliy, `rus` + `uzb_cyrl`), 300 dpi, sahifa PNG R2 da (DB ga emas), ishonchlilik < 90 bayroq. Workers AI OCR faqat zaxira (limit/narx tekshirilsin).
Faza 3 (1-2 kun) - qidiruv: yangi migratsiya (L0 ruxsati bilan): `qidiruv` ni `russian` konfig + `unaccent` ga, kirill/lotin transliteratsiya yorlig'i; trigram faqat `nom` da, `qidiruv_yorliq` trigram o'chiriladi (hajm/IO). Tekshiruv: 30 ta real so'rov (beton, armatura, g'isht devor...) top-3 aniqligi >= 70%. Indekslar hajmini oldindan hisoblash (500 MB chegara; hozir metadata ~ juda kichik: 379 satr).
Faza 4 (1 kun) - nashr/versiya: `t2_normativ_hujjat` ga `amaldagi boolean`, `almashtirgan_id` (kichik migratsiya); kod+tahrir bo'yicha unikal; ustoz qidiruvi default faqat amaldagi.
Faza 5 (2 kun) - Smeta ustasiga ulash: `norma_normativ_bogla` (norma shifri/to'plam -> hujjat_id + sahifa_pdf + bob_punkt), avval 4.02.xx va 2.03.xx dan boshlab. Ustasi "nega bu norma" javobida `normativ-qidir` natijasidan sahifa dalilini (rasm+iqtibos, `normativ-evidence.ts`) ko'rsatadi; model punkt yoki raqam o'ylab topmaydi - faqat ko'rsatilgan bo'lak. 2 411 resurssiz norma alohida ro'yxat sifatida chiqariladi.
Faza 6 (davomiy) - sifat: bob_punkt/jadval_kod annotatsiyasi `table_candidates.py` orqali eng ko'p ishlatiladigan 30 hujjat uchun.

Jami taxmin: ~8-11 ish kuni bitta agent bilan (OCR mashina vaqti alohida: ~scan sahifa soniga qarab soatlar). DB hajmi: ~1 KB/bo'lak * ~40-60 ming bo'lak ~ 50 MB dan kam, matn va rasm R2 da.

## 5. Xavflar
- DB disk IO yaqinda tugagan: ommaviy yozish paketlab, kechasi, bo'laklar bo'yicha; GIN indekslarni yuklashdan keyin qurish.
- Mualliflik/rasmiy nashr: ShNK matni ichki foydalanish uchun; "amaldagi" ekani huquqiy tasdiq emas.
- Migratsiyalar (Faza 3-5) L0 ruxsatini talab qiladi; bu hujjat faqat reja.
