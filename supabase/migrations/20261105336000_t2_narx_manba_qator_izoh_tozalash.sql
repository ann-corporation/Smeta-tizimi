-- Egasi 2026-10-05: "nima uchun 317 MB bo'lib ketdi" — t2_narx_manba_qator.izoh ustuniga har qatorga
-- avtomatik 500 belgigacha kesilgan JSON yozilgan (sourceKey/varaqqa/manbaQatori/hudud/davr/narxVarianti/
-- valyuta/originalIzoh/warnings), holbuki hudud/davr/narxVarianti/valyuta allaqachon alohida ustunlarda bor —
-- toza duplikat. Bundan tashqari 500 belgida kesilgani uchun eng qimmatli maydon (warnings) deyarli hamma
-- qatorda yo'q qilib tashlangan edi (tekshirildi: manba_id=5 213 691 qatorning birortasida ham warnings
-- saqlanib qolmagan). Ya'ni bu ma'lumot allaqachon yo'qolgan — tozalash hech narsani yo'qotmaydi.
--
-- Kod manbasi tuzatildi: frontend/src/lib/catalog-manba-import/parse.ts (catalogQatorlariniApiFormatga) endi
-- faqat haqiqiy ogohlantirish bo'lsa izoh yozadi; aks holda NULL. Bu migratsiya faqat ESKI, ushbu aniq buzuq
-- shaklda (JSON + "sourceKey" maydoni) yozilgan qatorlarni tozalaydi — boshqa manba yoki qo'lda yozilgan
-- erkin matnli izohlarga tegmaydi.

update t2_narx_manba_qator
set izoh = null
where izoh like '{%' and izoh like '%sourceKey%';
