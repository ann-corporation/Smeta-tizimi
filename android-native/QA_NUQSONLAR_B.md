# QURAI ilova - QA nuqsonlar B (ilova qobig'i va umumiy) - 2026-11-19

Usul: Android emulyator (API 34, debug demo rejimi, `files/demo.flag`) va Windows ilova (`QURAI_DEMO=1`, `:desktop:run`). Skrinshotlar lokal (C:\Temp\ilova-ideal-b\), repoda yo'q. Belgilar: OK = qayta sinaldi.

## Kritik (egasi talabi, 2026-11-19)

| ID | Nuqson | Holat |
| --- | --- | --- |
| B-C1 | Jarvis (APK + Windows) yozish so'roviga serverdan preview qaytsa (`f2_preview`, PR #666) ilova uni tanimadi: oddiy matn ko'rsatdi, "Tasdiqlash" yo'q edi | TUZATILDI. Javobdagi `f2_preview.token` (holat `tasdiq_kerak`) o'qiladi, kartada "Tasdiqlash" / "Bekor qilish" (sayt bilan bir xil `POST /api/f2-buyruq {amal: tasdiq, token, tasdiqlayman}`). Tasdiqdan oldin "Hali yozilmagan" yozuvi; muvaffaqiyatda "Tasdiqlandi va yozildi"; xatoda karta qoladi. Sinov: emulyator + Windows OK (demo fixture), unit test `JarvisPreviewTest` |
| B-C2 | Jarvis chatida mikrofon yo'q | TUZATILDI. Mikrofon tugmasi: bosib tursa = push-to-talk, qisqa bosish = boshlash/to'xtatish. Android: ombor yozuvchisi (AAC) + RECORD_AUDIO so'rovi; Windows: tizim mikrofoni (javax.sound, WAV 16 kHz). Server STT `/api/ombor-ovoz` (matnga aylantirish, hech narsa yozilmaydi); matn kiritish maydoniga tushadi, yuborishdan oldin o'qiladi. Server: ombor-ovoz JSON `audio_b64` qabul qiladi va mobil BFF ro'yxatiga qo'shildi (mobil BFF faqat JSON). Sinov: emulyator + Windows OK (demo fixture; haqiqiy STT prodda ELEVENLABS/AI sozlamasiga bog'liq, kompaniya uchun `document.write` yoki `warehouse.write` kerak) |
| B-C3 | "Fast Food 1 ga 10 qop sement kirim qil" / "817 F-2 da 1074871 hajmini 2 qil" | Ilova tomoni tayyor: server preview qaytarsa karta chiqadi. Server omborga yozishni (Codex PR-3) hali qo'llamasa, server o'z xabarini qaytaradi va ilova uni aynan ko'rsatadi. "Yoza olmayman" matni ilovada yo'q (modeldan keladi). Haqiqiy serverda sinov qolgan: prod'ga ulanish bu sessiyada yo'q |

## Topilgan va tuzatilgan

| ID | Daraja | Joy | Nuqson | Tuzatish |
| --- | --- | --- | --- | --- |
| B-1 | P2 | Android bosh sahifa (Yana) | "Bugungi ishlar"/"Tasdiqlash" bo'limlarida sarlavha, "Ochish" tugmasi va ichida yana shu nom (pastga o'q belgisi bilan) takrorlanardi | Bo'lim sarlavhasi + bitta "Ochish >" kartasi, o'q o'ngga. OK (emulyator) |
| B-2 | P2 | Jarvis (ikkala ilova) | Tez savol tugmalari doim ekranning yarmini egallardi (klaviatura ochiq paytda suhbat ko'rinmasdi) | Tugmalar faqat bo'sh suhbatda. OK |

## B2 turi (2026-11-19, claude/ilova-ideal-b2): ochiq bandlar bo'yicha natija

| ID | Holat | Qanday tekshirildi |
| --- | --- | --- |
| B-O1 Disk yozish (yuklash, yangi papka, nomlash, ko'chirish, savatga, savatdan qaytarish, "Diskdan tanlash") | TUZATILDI (ilova tomoni) | Server yo'li tayyor edi: `/api/mobil/hujjat-yukla` (multipart, <= 25 MB, qurilma aktori, kvota/MIME/ruxsat endpoint ichida) va BFF ro'yxatidagi `/api/hujjat-maydoni` POST (`papka`/`fayl` amallari, saytniki bilan bir xil); parallel yozish yo'li YO'Q, BFF o'zgartirilmadi. Ilova: `DiskController`/`DiskRepository` (shared) + Android `HujjatScreen` (kamera/galereya/fayl tanlash) + Windows `DiskScreen` (fayl oynasi). Unit: `DiskWriteTest` 8 ta (so'rov tanasi, multipart maydonlari, kod xaritasi KVOTA_TUGADI/MIME_REJECTED/NOM_BAND/RUXSAT_YOQ, papka/fayl amallari, 25 MB dan katta rad, Savat/Ulashilgan'da yozuv yo'q). Emulyator (API 34, demo): yozuv paneli, "Nimani yuklaymiz?" (Kamera/Galereya/Fayl), "Yangi papka" dialogi, fayl kartasida Nomi/Ko'chirish/Savatga. Haqiqiy serverda yuklash sinalmadi (prodga yozish taqiqlangan) |
| "Diskdan tanlash" | TUZATILDI | Android: Foto ekrani galereya tugmasi -> Galereya yoki Diskdan tanlash; Windows: `UploadBar` "Diskdan tanlash". Tanlangan fayl baytlari mavjud yuklash oqimiga beriladi |
| 25 MB dan katta fayl | OCHIQ | Bo'lakli yuklash (`amal=boshla/qism/tugat`) ilovada yo'q; ilova "saytdan yuklang" deb aytadi |
| B-O2 Disk "v1" va "v3 (joriy)" | TUZATILDI | Karta sarlavhasi endi versiyalar ro'yxatidagi joriy versiyani ko'rsatadi (emulyator: "v3  ·  14.11.2026", ro'yxatda v3 joriy; `cardHeaderShowsTheCurrentVersionOfTheList`). Sabab demo fixture (ro'yxat v1, versiyalar v3); serverda `versiya` = joriy versiya |
| B-O3 Disk pastki navigatsiyani yashiradi | NUQSON EMAS | Pastki panel faqat Bosh sahifada (`HomeScreen`); Fakt/Foto/Hujjat kabi hamma modul ekranlari to'liq ekran + orqaga tugmasi |
| B-O4 Windows: Jarvis ochiq -> Obyektlar jadvali o'ngdan kesiladi | TUZATILDI (kod, `:desktop:test` yashil) | `QObjectList`: ustunlar mavjud kenglikka moslanadi (nom ustuni qolganini oladi, tor bo'lsa Tur/Qator tushiriladi). Windows oynasida ko'z bilan tekshirish qolgan |
| Settings: ism bo'sh bo'lsa buzilgan belgi | TUZATILDI | `SettingsScreen.kt:161` "—"; Windows `Modules.kt:153` daraxt belgilari (▾/▸) ham buzilgan edi, tuzatildi |
| values-ru/strings_ombor.xml ~23-qator | NUQSON TOPILMADI | Barcha res XML fayllar qat'iy UTF-8 dan o'tdi; 23-qator "Загрузка остатков…" to'g'ri |
| P1-b MSI yig'ish | BLOKLANGAN | Bu kompyuterda WiX 3 (candle.exe) yo'q, choco/admin yo'q; o'rnatish yuklab olishni talab qiladi (ruxsat kerak). `:desktop:packageReleaseMsi` yig'ilmadi. CI'da yig'iladi |
| P1-b MSI o'rnatish/yangilash/o'chirish | OK (reliz MSI bilan) | QURAI-0.2.6.msi o'chirildi (o'rnatish papkasi, Start menyu va ish stoli yorlig'i qoldiqsiz yo'qoldi; `%APPDATA%\QURAI` foydalanuvchi ma'lumoti saqlandi) -> 0.2.0 o'rnatildi -> 0.2.6 ustiga yangilandi (bitta yozuv 0.2.6, yorliqlar bor, qurilma/kesh saqlandi, `RemoveExistingProducts` ishladi) -> ilova demo rejimida ochildi. Holat boshlang'ichga qaytarildi (0.2.6 o'rnatilgan). Logi C:\Temp\ilova-ideal-b2\ |
| P1-c Orqaga tugmasi | QISMAN OK | Dialog ustida BACK dialogni yopadi (emulyator). Papka ichida BACK avval butun ekrandan chiqardi -> endi bir papka yuqoriga (`BackHandler`; kodda, emulyator yuklanib qolgani uchun ko'z bilan tasdiqlanmadi). Qolgan ekranlar to'liq aylanib chiqilmadi |
| P1-c Aylantirish | OK (Disk) | "Yangi papka" dialogi ochiq + matn "Akt": gorizontal -> vertikal, dialog va matn saqlandi (`rememberSaveable`) |
| P1-c Klaviatura kiritishni yopadimi | OK (Disk dialogi) | Matn maydoni klaviatura ustida ko'rinadi (skrinshot 04) |
| P1-c Oflayn fakt navbati + ulanishdan keyin sync | OCHIQ | Demo rejimda tarmoq uzilmaydi; unit testlar bor (`PhotoQueueTest` va b.), emulyatorda haqiqiy serverda sinash kerak |
| P1-c Bildirishnoma/push ruxsati | MAVJUD EMAS | Ilova tizim bildirishnomasi yubormaydi (`POST_NOTIFICATIONS`, FCM yo'q); ruxsat oqimi yo'q. Push alohida vazifa |