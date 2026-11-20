# Android paritet: Hujjatlar paketi (sayt -> Android 1:1)

Manba: `frontend/src/admin/sahifalar/HujjatPaket.tsx` (sayt, F-2 reestri sahifasi tagida), `src/api/hujjat-paket.ts`, `src/lib/hujjat-paket/*`.
Android: `android-native/app/.../feature/hujjat/PaketScreen.kt`, umumiy mantiq `android-native/shared/.../feature/hujjat/HujjatPaket.kt` (Windows ham ishlata oladi).
Matnlar: sayt i18n kalitlari (o'zbekcha matn = kalit) va ularning ru/en tarjimalari aynan ko'chirilgan (`strings_paket.xml`, 3 til).
Belgilar: OK = aynan bir xil, GAP = hozircha yo'q (sabab yozilgan), BFF = qurilma BFF'ida yo'l ochilishi kerak.

| № | Saytda | Android | Holat |
|---|---|---|---|
| 1 | Sahifa joyi: F-2 reestri sahifasi tagida | F-2 reestri ekrani tagidagi «Hujjatlar paketi» tugmasi | OK |
| 2 | Sarlavha «Hujjatlar paketi» + «Yangilash» tugmasi | bir xil | OK |
| 3 | Izoh «Hujjatlar Diskda doim tayyor turadi...» | bir xil matn | OK |
| 4 | Filtr: Shartnoma tanlovi (Hammasi + №raqam); shartnoma o'zgarsa obyektlar tozalanadi | bir xil (variantlar serverdan, birinchi yuklashda) | OK |
| 5 | Filtr: Oydan / Oygacha; bitta oy = dan=gacha; teskari oraliq almashtiriladi | matn maydoni YYYY-MM (saytda `type=month`); almashtirish qoidasi bir xil (`withMonths`) | OK (kiritish shakli telefon uchun) |
| 6 | Filtr: Obyekt nomini yozib qidirish (8 tagacha taklif), tanlangani chip, «Olib tashlash» | bir xil (`searchObjects`) | OK |
| 7 | Filtr: Hujjat turi chiplari (F-2, F-3, Nakopitelniy, M-29, Slichitelniy, Ostatka, AOSR) | bir xil tur va tartib | OK |
| 8 | Filtr: Holat chiplari (Tasdiqlangan, Qoralama), «Filtrni tozalash» | bir xil | OK |
| 9 | Saqlangan filtrlar: ro'yxat, qo'llash, o'chirish, nom bilan saqlash (60 belgi); nom bo'sh = «Filtr nomini yozing»; natija «Filtr saqlandi» / «Filtr saqlanmadi» | bir xil (`filtr_royxat`, `filtr_saqla`, `filtr_ochir`, sahifalash maydonlarisiz) | OK |
| 10 | «Topildi: N», «Hammasini tanlash» (server kalitlari bilan), «Tanlovni bekor qilish» | bir xil | OK |
| 11 | Ro'yxat qatori: obyekt · hujjat · oy · holat (+ «oyga ikkinchi F-2») · yangilik matni · «yangilanmoqda» | bir xil; takror va taxminiy tanlanmaydi | OK |
| 12 | Yangilik matni: «Excel tayyor · v5 · 2 daqiqa oldin» / «Eski versiya» / «Yangilanmoqda» / «Diskda yo'q» / «Yangilanmadi (qayta uriniladi)» | bir xil | OK |
| 13 | «Yana N ta» (50 tadan, server sahifalaydi) | bir xil | OK |
| 14 | Yuklab olish: avval Disk (bepul), yo'qi `/api/hujjat-yarat`; takror/taxminiy tashlanadi; bitta xato butun paketni to'xtatmaydi; «Hujjat tanlanmagan» | server `/api/hujjat-paket` `yig` (saytdagi reja qoidasi bir xil kod); telefon faqat yuklab oladi va ulashadi | OK |
| 15 | Chiqish formati ZIP (papkalar) + «Tarkib» | server `paketZipi` (sayt bilan bir xil yo'llar va «Tarkib»; test fflate bilan solishtiradi) | OK |
| 16 | Chiqish formati «Bitta Excel» | server `paketExcel` (`exceljs`); Workers muhitida `exceljs` yuklanishi sinovdan o'tkazilmagan | OK (kod), TEKSHIRILMAGAN (prod) |
| 17 | Token bahosi yuklashdan oldin («Token: ≈ N (k ta yangi hujjat)», «Bepul (to'langan)», «Token: narx hisoblanmoqda») | server `baho` (`yuklashBahosi`, hech narsa yechilmaydi); matnlar sayt kalitlari | OK || 18 | Jarayon «Yig'ilmoqda 3/10», natija «Paket tayyor» | bir xil | OK |

| 18 | Jarayon «Yig'ilmoqda», natija «Paket tayyor» | bir xil (server yig'adi, telefon «Yig'ilmoqda ...» ko'rsatadi) | OK |

## Boshqa modullar (hali yozilmagan, keyingi qadam)
- Ombor (sayt sahifasi `logistika`): Android'da buyruq oqimi, variant tugmalari (`holat savol`) va ovoz bor; sayt sahifasi bilan qadamma-qadam solishtirish hali qilinmagan.
- Disk (`documents`): Android'da 4 tab bor; sayt bilan qadamma-qadam solishtirish hali qilinmagan.
- F-2 qatorlari (#711): sayt `F2TayyorlashNative`/`F2V3Workbench` bilan solishtirish hali qilinmagan; ma'lum farq: bo'lim nomlari keshdagi daraxtdan, matnlar saytning i18n kalitlari emas.
