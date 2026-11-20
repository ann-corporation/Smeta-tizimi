# Android paritet: Disk (sayt -> Android chek-list)

Manba: `frontend/src/hujjat-maydoni/*` (`HujjatMaydoni.tsx` 350 qator, `DiskRejalari`, `FaylYon`, `DiskdanTanlash`, `UlashilganBolim`, `BoshqaruvBolim`, `AdminPanel`), server `/api/hujjat-maydoni`.
Android: umumiy `ui-common/.../screens/Disk.kt` (Android + Windows), `shared/.../feature/disk/{DiskContract,DiskFiles}.kt`, ilova tomoni `feature/hujjat/HujjatScreen.kt`.
Holat: CHEK-LIST, amalga oshirish hali boshlanmagan. Baho sayt manbasidagi matnlar ro'yxati va Android fayllarini o'qish bilan qo'yilgan; ekranlar qadamma-qadam qo'lda solishtirilmagan («TEKSHIRILMAGAN» belgisi shuni bildiradi).

| № | Saytda (matn = i18n kaliti) | Android | Holat |
|---|---|---|---|
| 1 | Tablar: «Mening diskim», «Kompaniya diski» (yoki «Shaxsiy disk»), «Ulashilgan», «Savat»; yana «Faoliyat», «Boshqaruv», «Bo'limlar» | 4 tab: Mening diskim / Kompaniya diski / Ulashilgan / Savat | GAP («Faoliyat», «Boshqaruv» yo'q; «Bo'limlar» tekshirilmagan) |
| 2 | «Disk hajmi» (kvota chizig'i), «Disk deyarli to'ldi ({f}%)...», «Disk to'ldi: yangi fayl yuklab bo'lmaydi...», «Tarif sahifasiga o'tish» | kvota qatori va ogohlantirish yo'q | GAP |
| 3 | Papka yo'li (non-chiqish yo'li) va «Diskka qaytish» | `crumbs` + «Orqaga» qatori | TEKSHIRILMAGAN (matnlar) |
| 4 | «Yangi papka» (nom so'rash), «Papka nomi» | papka yaratish bor | TEKSHIRILMAGAN (matnlar) |
| 5 | «Fayl qo'shish» / «Fayl tanlash» / «Yuklash» + sudrab tashlash; jarayon «Yuklanmoqda: {nom} ({i}/{n})», «Yangi versiya yuklandi», «Mazmun o'zgarmagan: {nom}», «Yuklandi: {nom}» | yuklash bor (bitta fayl <= 25 MB, server tomonda kvota/MIME) | TEKSHIRILMAGAN (ko'p fayl ketma-ket, matnlar) |
| 6 | Qidiruv: «Nom yoki fayl ichidagi matn bo'yicha qidirish», natija «matn ichida», «Hech narsa topilmadi» | qidiruv bor | TEKSHIRILMAGAN (fayl ichidagi matn bo'yicha) |
| 7 | Ro'yxat ustunlari: Nomi, Hajmi, Versiya, O'zgargan; «Tizim papkasi» belgisi (o'chirib/ko'chirib/nomini o'zgartirib bo'lmaydi), «Qulflagan: {kim}» | nom, hajm, belgi; tizim papkasi qoidasi serverda | TEKSHIRILMAGAN (qulf belgisi, tizim papkasi matni) |
| 8 | Fayl amallari: «Ko'rish», «Yuklab olish», nomini o'zgartirish, ko'chirish, «Savatga»; versiyalar ro'yxati | `QDiskFile` dialogi: ochish, yuklab olish, nom, ko'chirish, savat, versiyalar | OK (asosiy), TEKSHIRILMAGAN (matnlar) |
| 9 | Savat: «Mening savatim» / «Kompaniya savati», «Savatdagi fayllar 30 kundan keyin o'zi o'chadi. Ular disk hajmiga kiradi.», «Tiklash», «Butunlay o'chirish» (tasdiq «Fayl butunlay o'chirilsinmi?»), «Savatni bo'shatish» (tasdiq «...Bu qaytarilmaydi.»), «Savat bo'sh.» | savat va tiklash bor; «Butunlay o'chirish» va «Savatni bo'shatish» tekshirilmagan | TEKSHIRILMAGAN |
| 10 | «Papkani ZIP» va «Hammasi + ma'lumotlar (ZIP)»: «ZIP tayyorlanmoqda...», «ZIP tayyor: {n} fayl», manifest.json | yo'q | GAP (server tomonda ZIP kerak, xuddi Hujjatlar paketi kabi; alohida taklif) |
| 11 | Hujjatga havola xatolari: «Bu hujjatga ruxsatingiz yo'q.», «Bu hujjat Diskda topilmadi.», «Bu hujjat boshqa kompaniya diskida: yuqoridan shu kompaniyani tanlang.» | umumiy xato matni | GAP |
| 12 | Ulashish/ruxsat (ulash, daraja), «Faoliyat» jurnali, fayl-bog'lash | yo'q (`PARITET.md` 36-qator) | GAP |
| 13 | «Diskdan tanlash» (boshqa sahifalarga fayl biriktirish) | ilovada `DiskPick` bor | TEKSHIRILMAGAN |
| 14 | Matnlar: sayt i18n kalitlari | `strings.xml`/`QDisk*Labels` o'z matnlari | GAP (SiteI18n ga o'tkazish) |

## Tavsiya etilgan tartib
1. Matnlarni sayt kalitlariga o'tkazish va 3, 4, 5, 6, 7, 9-bandlarni ekranda qadamma-qadam solishtirish (emulyatorda sayt bilan yonma-yon).
2. Kvota chizig'i va ogohlantirishlar (2), savat tasdiqlari (9), hujjat xato matnlari (11).
3. «Faoliyat» va «Boshqaruv» (1, 12), ulashish/ruxsat.
4. Papkani ZIP (10): `PAKET_SERVER_TAKLIF.md` dagi server-yig'ish naqshi bo'yicha, mijozda ZIP yozilmaydi.
