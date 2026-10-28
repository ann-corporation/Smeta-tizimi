# Ombor qanday ishlaydi?

**Bu — C11 bo‘yicha bir sahifalik taklif. Hozircha dizayn; tizimga o‘zgartirish kiritilmadi.**

## Uchta asosiy amal

- **📥 KELDI** — materialni omborga qabul qilish. Materialni qidiruvdan yoki smetadagi taklifdan tanlaysiz, miqdorni kiritasiz, birlik o‘zi chiqadi, kimdan kelgani va qaysi omborga tushganini tanlaysiz, so‘ng tasdiqlaysiz. Yetkazuvchi mavjud `t2_kontragent` bilan STIR/INN orqali bog‘lanadi.
- **📤 BERDIM** — materialni ombordan ustaga yoki obyektga berish. Kimga va qayerga ketgani qayd qilinadi. Smeta qatori faqat taklif bo‘ladi; noto‘g‘ri tanlovni tasdiqlamasdan tuzatish mumkin.
- **📦 QOLDIQ** — tanlangan ombordagi material va miqdorni ko‘rish. Markaziy ombor bir nechta obyektga xizmat qilishi mumkin, lekin uning materiali har bir obyektga alohida bor deb ko‘rsatilmaydi.

Har bir ish telefonda ko‘pi bilan uchta qisqa qadamda bajariladi. Tugmalar yirik, so‘zlar sodda. Yozish qiyin bo‘lsa, ro‘yxatdan tanlanadi. Internet uzilsa, yuborish qayta uriniladi; bitta amal ikkinchi marta yozilmasligi kerak.

## Xato bo‘lsa

Miqdor g‘alati yoki qoldiq yetarli bo‘lmasa, tizim sariq ogohlantirish ko‘rsatadi. Ishonchingiz komil bo‘lsa, «Ha, to‘g‘ri» deb davom etasiz. Xato yozuv o‘chirib tashlanmaydi: 24 soat ichida sabab bilan **storno** qilinadi. Tarixda kim, qachon va nima uchun tuzatgani qoladi.

## Qaysi ma’lumot qayerda turadi?

Bitta harakat jurnali kelgan, berilgan va tuzatilgan materiallarni saqlaydi. Qoldiq shu jurnaldan hisoblanadi va tekshiriladi. Zayavka, buyurtma, yetkazib berish, kontragent va hujjat reestri o‘z joyida qoladi; ombor ularni qaytadan yaratmaydi. Nakladnoyning asl fayli hujjat reestri orqali saqlanadi, harakat esa fayl, varaq va qatoriga bog‘lanadi.

## Navoiy bog‘ ombor daftari

Importda faqat **«Приход»** varag‘i ko‘rib chiqiladi. Boshqa varaqlar yuklanmaydi. Avval preview chiqadi: yangi qator, takror bo‘lishi mumkin bo‘lgan qator, xato va material nomi/birligi bo‘yicha taklif. Takliflar o‘z-o‘zidan birlashtirilmaydi. Obyektga taqsimlash ham faqat taklif; avtomatik yozuv yo‘q. Egasi ko‘rib tasdiqlagandan keyingina harakatlar ombor jurnaliga o‘tadi. Chiqim hali kiritilmagan bo‘lsa, qoldiq «to‘liq yakuniy» deb ko‘rsatilmaydi.

Narx yoki QQS haqida ma’lumot bo‘lmasa, tizim uni o‘ylab topmaydi. QQS alohida ko‘rsatiladi; ombordagi miqdorga qo‘shib yuborilmaydi.

## Ishga tushirish tartibi

Avval mavjud ombor va eski qoldiqlar tekshiriladi. Keyin jurnal, takroriy yuborishni himoyalash va storno qoidasi sinovdan o‘tadi. Shundan so‘ng preview va ombor ekranlari ulanadi. Sinovlar faqat sun’iy ma’lumotda; haqiqiy yozuvga o‘tishdan oldin L0 va egasi tasdiqlaydi.

*Asos: 2026-10-27 dagi C11 topshirig‘i va ruxsat etilgan `WAREHOUSE_LIVE_INVENTORY_20261027.json` sxema snapshoti.*
