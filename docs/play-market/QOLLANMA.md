# QURAI ni Google Play'ga chiqarish: egasi uchun qo'llanma

Hammasini ketma-ket bajaring. Hisob ochish, to'lov, shaxsni tasdiqlash va «Yuborish» tugmalarini faqat egasi bosadi. Biz tayyorlagan narsalar pastda ajratilgan.

## 0. Nima tayyor, nima sizning ishingiz

| Tayyor (repo'da) | Egasi qiladi |
| --- | --- |
| CI da `.aab` qurish va yuklash kaliti bilan imzolash (artifact `android-native-aab`) | Play Console hisobi, $25 to'lov, shaxs/tashkilot tasdiqlash |
| Play uchun siyosatga mos build (o'z-o'zini yangilash o'chirilgan) | Ilovani Console'da yaratish, AAB ni yuklash |
| Maxfiylik siyosati va hisobni o'chirish sahifalari (uz/ru/en), ilova ichida «Hisobni o'chirishni so'rash» | Sahifalar deploy bo'lganini tekshirish; support@qurai.uz qutisini yaratish |
| Do'kon matnlari uz/ru/en, ikonka 512, feature graphic 1024x500 (`docs/play-market/`) | Skrinshotlarni olish (ro'yxat `LISTING.md` da), formalarni to'ldirish |
| Data safety, kontent reytingi, target audience, App access javoblari (`POLICY_AUDIT.md`) | 12 tester topish (shaxsiy hisob bo'lsa), 14 kun yopiq test |

## 1. Developer hisobi: shaxsiy yoki tashkilot

- **Tashkilot (tavsiya, QURAI kompaniya mahsuloti bo'lsa):** yuridik shaxs nomidan. D-U-N-S raqami kerak (bepul, dnb.com orqali olinadi, odatda bir necha kundan 30 kungacha). Kompaniya nomi, manzili, veb-sayt, telefon D-U-N-S dagi ma'lumot bilan bir xil bo'lishi shart. Plus: do'kon sahifasida kompaniya nomi ko'rinadi; yopiq test (12 tester x 14 kun) talabi odatda tashkilot hisoblariga qo'llanmaydi.
- **Shaxsiy:** D-U-N-S kerak emas. Pasport/ID tasdiqlanadi, ismingiz va manzilingiz do'konda ochiq ko'rinadi. 2023-11-13 dan keyin ochilgan shaxsiy hisob production'ga chiqishdan oldin: kamida 12 tester, 14 kun ketma-ket yopiq test.
- Har ikki holatda bir martalik **$25** to'lov (xalqaro karta kerak; O'zbekiston kartalari ishlamasligi mumkin, tayyor muqobil: virtual USD karta yoki chet eldagi ishonchli shaxs/kompaniya kartasi). Bu bosqichni faqat egasi bajaradi.
- Tasdiqlash: ro'yxatdan o'tgach Google shaxsni (pasport/ID, ba'zan video) va tashkilot uchun D-U-N-S/hujjatlarni tekshiradi, bu 2 kundan 2 haftagacha cho'zilishi mumkin. Real telefon raqami va Android qurilmada Play Console ilovasi orqali tasdiqlash so'raladi.
- Ro'yxatdan o'tish: https://play.google.com/console/signup. Alohida (ish) Google hisobidan foydalaning, shaxsiy pochtadan emas.

## 2. Ilovani yaratish (Console)

1. All apps > Create app. Nomi: «QURAI: smeta va ombor». Til: Uzbek (uz). App yoki game: App. Free yoki paid: Free (keyin pullikka o'zgartirib bo'lmaydi). Deklaratsiyalarni belgilang.
2. Package name keyin AAB dan olinadi: `uz.anncorp.smeta` (o'zgarmaydi, Tauri ilovasi bilan bir xil).
3. Dashboard'dagi «Set up your app» vazifalarini to'ldiring (javoblar `POLICY_AUDIT.md` da):
   - Privacy policy: `https://qurai.uz/maxfiylik`
   - App access: «restricted», matn `POLICY_AUDIT.md` 9-bo'lim (Demo rejimi)
   - Ads: No
   - Content rating: so'rovnoma, `POLICY_AUDIT.md` 7-bo'lim
   - Target audience: 18+
   - Data safety: `POLICY_AUDIT.md` 6-bo'lim jadvali; account deletion URL: `https://qurai.uz/hisobni-ochirish`
   - Financial features: none; Government apps: No; Health: No
   - Category: Business; kontakt e-pochta, veb-sayt
4. Main store listing: `LISTING.md` dan matnlar (uz, keyin Add translation: ru, en), `assets/icon-512.png`, `assets/feature-graphic-1024x500.png`, skrinshotlar.

## 3. Play App Signing va AAB

1. Birinchi AAB yuklanganda Play App Signing yoqiladi (majburiy). Standart tanlov: «Use Google-generated key» (tavsiya). Bizning hozirgi kalitimiz **upload key** bo'ladi; Play har bir yuklamani shu kalit bilan tekshiradi va foydalanuvchilarga o'z kaliti bilan imzolab beradi. Kalit yo'qolsa Play'da upload key'ni tiklash mumkin.
2. Muhim oqibat: Play orqali o'rnatilgan ilova va saytdagi (bizning kalit bilan imzolangan) APK imzosi har xil, ular bir-birining ustiga yangilanmaydi. Foydalanuvchi bir kanalni tanlaydi. Saytdagi APK va Telegram tarqatish o'zgarishsiz ishlayveradi.
3. AAB olish: GitHub > Actions > «Android native» > `main` dagi so'nggi muvaffaqiyatli ishga tushirish (yoki Run workflow) > Artifacts > `android-native-aab` > `qurai-<versiya>-play-<N>.aab`. Fayl `signed` bo'lishi uchun workflow `main` da ishlashi va 4 ta `ANDROID_KEYSTORE_*` secret bo'lishi kerak (PR dan chiqqan AAB imzosiz, Play'ga yuklanmaydi).
4. versionCode: Play AAB uchun `3 000 000 + GitHub run raqami`, har yangi build'da avtomatik oshadi (Play har yuklashda oldingisidan katta kod talab qiladi). Saytdagi APK o'z kodini (`2 000 xxx`) saqlaydi. Qo'lda raqam yozish kerak emas. Agar bir xil run qayta yuklansa, Play rad etadi: yangi run kerak. versionName (`build.gradle.kts`, hozir 0.2.0) ni yangi reliz oldin qo'lda oshiring.

## 4. Testlash yo'li (ketma-ket)

1. **Internal testing** (eng tez, ko'rib chiqishsiz, 100 tagacha tester): Testing > Internal testing > Create release > AAB yuklash > reliz izohi > Save > Review > Roll out. Testerlar ro'yxatini (Gmail) qo'shing, opt-in havolani yuboring. Birinchi smoke sinov shu yerda: o'rnatish, Demo rejimi, kamera, mikrofon, «Hisobni o'chirishni so'rash».
2. **Closed testing**: shaxsiy hisob uchun majburiy. Kamida **12 tester** opt-in qilgan holda **14 kun ketma-ket** (hammasi test davomida o'rnatilgan bo'lishi kerak; testerlar sonini 12 dan oshiq qilib zaxira oling, ketganlar uchun). Testerlar: Gmail manzillari ro'yxati (Google Group ham mumkin). Tashkilot hisobida bu talab odatda yo'q, Console «Production access» bo'limida ko'rsatadi.
3. Shu davr oxirida Dashboard > «Apply for production access» so'rovi: test qanday o'tdi, fikrlar, tuzatishlar haqida qisqa javob (uz yoki ingliz) yoziladi. Google odatda ~7 kunda javob beradi.
4. **Production**: Production > Create release > AAB (internal/closed dagi build'ni «Promote» qilish ham mumkin) > Countries: O'zbekiston (kerak bo'lsa boshqalar) > Roll out. Staged rollout (masalan 20% > 50% > 100%) tavsiya. Birinchi review odatda 1 dan 7 kungacha (yangi hisoblarda uzoqroq bo'lishi mumkin).
5. Har keyingi reliz: versionName oshirish, `main` ga merge, CI dan yangi AAB, Production > Create release, reliz izohi (`LISTING.md` shabloni).

## 5. Qabul qilinmaslik xavfi bo'yicha eslatmalar

- Maxfiylik siyosati URL ochilishi shart (deploy qiling va brauzerda tekshiring).
- Data safety formasi ilova xatti-harakatiga mos bo'lsin; keyin SDK/ruxsat qo'shilsa, forma ham yangilanadi.
- Kirish talab qilinadigan ilovada reviewer'ga kirish yo'li berilishi shart: Demo rejimi matni App access da.
- support@qurai.uz va hisobni o'chirish so'rovlariga haqiqatan javob bering.
- Do'kon matnlarida «eng yaxshi/#1», kalit so'z spam, boshqa brend nomlari qo'ymang.
- Android 15 va targetSdk: yangi ilova 35+ kerak (bizda 35). Play yiliga bir marta talabni oshiradi, ogohlantirish pochtasiga keladi.

## 6. Qisqa nazorat ro'yxati

- [ ] Developer hisobi ochildi, to'lov, shaxs/tashkilot tasdiqlandi
- [ ] D-U-N-S (tashkilot bo'lsa)
- [ ] https://qurai.uz/maxfiylik va /hisobni-ochirish brauzerda ochiladi (deploy'dan keyin)
- [ ] support@qurai.uz ishlaydi
- [ ] 8 ta telefon skrinshoti + planshet skrinshotlari olindi
- [ ] AAB `main` dan olindi (signed), internal testing ishladi
- [ ] 12 tester x 14 kun (shaxsiy hisob bo'lsa)
- [ ] Production access so'rovi yuborildi, reliz chiqarildi
