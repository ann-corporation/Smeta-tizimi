# Taklif: Hujjatlar paketi yig'ishni serverga (BFF) ko'chirish

Holat: TAKLIF, egasi tasdiqlamaguncha amalga oshirilmaydi.

## Muammo
Saytda paket yig'ish mijozda (brauzerda) bajariladi: `lib/hujjat-paket/{nomzod,yigish,royxat}.ts` (reja, ZIP ierarxiyasi `zipYollari`, «Tarkib» matni, bitta Excel `exceljs` bilan, token bahosi `narxHisob`).
Android va Windows bu mantiqni Kotlin'da qayta yozsa, ikki nusxa bo'ladi va yo'llar/«Tarkib»/narx qoidasi farq qilib ketadi. Hozir Android'da yo'q (`ANDROID_PARITET_HUJJAT_PAKET.md`, 15-17-qatorlar): ZIP ierarxiyasi va «Tarkib», «Bitta Excel», token bahosi.

## Allaqachon bor narsa
Telegram bot paketni **serverda** yig'adi (`functions/_shared/telegram-toliq-paket.ts`): u `src/lib/hujjat-paket` dagi o'sha `paketReja`, `paketYigish`, `paketZipi`, `tokenBahosi` ni Worker ichida chaqiradi. Ya'ni bu TS kod serverda ishlaydi va testlangan; yangi mantiq yozish kerak emas, faqat uni umumiy endpoint orqali ochish kerak.

## Taklif
Yangi endpoint `POST /api/hujjat-paket` (sessiya/qurilma aktori, `kompaniya_id` majburiy), qurilma BFF ro'yxatiga (`MOBIL_PATH`, `amal` oq ro'yxati) qo'shiladi. Amallar:

| amal | kirish | chiqish |
|---|---|---|
| `baho` | `filtr` yoki `kalitlar` | `{ tanlangan, tolanadigan, bepul, token \| null }` (sayt `yuklashBahosi` bilan bir xil, narx serverda hisoblanadi) |
| `yig` | `filtr`/`kalitlar`, `chiqish: "zip" \| "excel"`, `sarlavha` | fayl baytlari (ZIP yo'llari va «Tarkib» sayt bilan bir xil; Excel — «Tarkib» + hujjat varaqlari) + `xatolar[]` sarlavhada (`X-Paket-Xatolar`) |

Token yechish faqat `yig` da, mavjud mazmun kaliti qoidasi bilan (qayta yuklash bepul); `baho` hech narsa yozmaydi. Tasdiq «narxni ko'rsat -> bosib yuklash» sayt bilan bir xil tartibda.
Yuklama chegarasi: BFF javobi hozir 25 MB (`DOC_MAX_BYTES`), katta paketda Telegramdagidek chegara va xabar kerak; to'liq hajm uchun javobni R2 vaqtinchalik havolasi orqali berish variantini ko'rib chiqish.

## Natija
- Sayt, Android, Windows va bot bitta paket mantig'idan foydalanadi; Kotlin'da nusxa yo'q.
- Android'da 15-17-qatorlar yopiladi: «Chiqish» tanlovi (ZIP / Bitta Excel) va «Token: ≈ N (k ta yangi hujjat)» saytdagidek.
- Sayt keyinroq o'z mijoz kodini ham shu endpointga o'tkazishi mumkin (ixtiyoriy), shunda brauzerdagi `exceljs` yuki ham kamayadi.

## Tasdiq kerak bo'lgan savollar
1. Endpoint nomi va javob formati (to'g'ridan-to'g'ri fayl yoki vaqtinchalik havola) — qaysi biri?
2. 25 MB dan katta paket uchun xatti-harakat (Telegramdagidek rad + havola, yoki R2 havola)?
3. Sayt mijozini ham endpointga o'tkazamizmi yoki hozircha ikkalasi yonma-yon qoladimi?
