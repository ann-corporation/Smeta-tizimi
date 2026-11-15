# Oflayn rejim - Windows'da qo'lda sinov ro'yxati

Maqsad: shifrlangan kesh + Fakt navbati (PR #499) haqiqiy ilovada ishlashini tekshirish.
Kerak: QURAI Windows o'rnatuvchisi (0.1.1+), sinov hisobi (haqiqiy ma'lumotga zarar bermaydigan obyekt), Wi-Fi/Ethernet'ni o'chirib-yoqish imkoni.
Eslatma: sinovda GitHub/chatga summa, INN, bank raqami yozilmaydi.

## 1. O'rnatish va kirish
- [ ] O'rnatuvchini ishga tushiring, ilova ochiladi, sarlavhada «QURAI» va versiya 0.1.1 (yoki yangisi).
- [ ] Hisobga kiring (Google/email/Telegram). `/admin` ish joyi ochiladi.
- [ ] Ilova ichida «Oflayn uchun tayyorlash» (agar ko'rsatilsa) bosing va tugashini kuting (qobiq ~15 MB keshlanadi).

## 2. Obyektni ochish (onlayn)
- [ ] Obyektlar ro'yxatidan bitta obyektni oching: ish joyi, smeta qatorlari, Fakt oynasi ko'rinadi.
- [ ] Yana 1-2 bo'limni ko'rib chiqing (kesh to'lishi uchun).

## 3. Tarmoqni uzish
- [ ] Wi-Fi/Ethernet'ni o'chiring (ilovani yopmang).
- [ ] Yuqorida ko'k/sariq «Oflayn» banneri chiqadi, oxirgi yangilanish vaqti ko'rsatiladi.
- [ ] Oldin ko'rilgan obyekt ma'lumoti faqat o'qish uchun ochiladi (ko'rilmagan sahifa ma'lumotsiz qolishi normal).
- [ ] F-2 yaratish/tasdiqlash, imzo, to'lov, import, foto yuklash tugmalari bosilsa aniq xabar chiqadi (oflayn ishlamaydi).

## 4. Oflayn Fakt kiritish
- [ ] Obyektda bitta qatorga Fakt hajmini kiriting va saqlang.
- [ ] «Oflayn: yozuv navbatga olindi» xabari chiqadi, bannerda navbat soni 1.
- [ ] Yana 1-2 ta Fakt kiriting (navbat 2-3).
- [ ] Ilovani to'liq yoping va qayta oching (tarmoq hali o'chiq): banner va navbat joyida, ma'lumot ochiladi.

## 5. Tarmoqni tiklash va qayta yuborish
- [ ] Tarmoqni yoqing. Navbat o'zi yuboriladi (bannerda «yuborilmoqda», keyin navbat 0).
- [ ] Fakt jurnalida har bir yozuv BIR martadan paydo bo'ldi (takror yo'q). Yig'indi kiritilgan hajmga teng.
- [ ] Takror tekshiruv: tarmoqni qayta uzib-yoqing, navbat bo'sh bo'lsa hech narsa yana yuborilmaydi.
- [ ] Nizo: boshqa qurilma/brauzerdan o'sha qatorni F-2'ga tasdiqlang yoki akt qulflang, so'ng oflayndan Fakt yuboring: yozuv jim yo'qolmaydi, «nizo» bo'lib ko'rsatiladi; «qayta yuborish» yoki «bekor» tanlanadi.

## 6. Xavfsizlik va muddat
- [ ] Chiqish (Logout) bosing: yuborilmagan yozuv bo'lsa ogohlantirish chiqadi; tasdiqlangach kesh va navbat o'chadi.
- [ ] Chiqqandan keyin tarmoqsiz ochilsa eski obyekt ma'lumoti ko'rinmaydi.
- [ ] Boshqa hisob bilan kiring: avvalgi hisob ma'lumoti ko'rinmaydi.
- [ ] `%APPDATA%` ichidagi ilova papkasida `oflayn-v1` fayllari o'qilmas (shifrlangan), matnli obyekt nomlari/summalar topilmaydi.
- [ ] Windows «Credential Manager»da QURAI yozuvi bor; kalit hech bir faylda ochiq matnda yo'q.
- [ ] 72 soatdan keyin tarmoqsiz ochilsa «muddat tugadi» deb kesh ishlatilmaydi (tezkor sinov uchun: qurilma soatini +4 kunga surib, tarmoqsiz oching; sinovdan keyin soatni qaytaring).

## 7. Natija
Har band uchun: OK / XATO + skrinshot (summasiz). Xatolarni L0'ga yuboring.
Ma'lum cheklov: oflayn foto yuklash navbatga kirmaydi (keyingi bosqich).
