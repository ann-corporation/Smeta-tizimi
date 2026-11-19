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

## Ochiq (tuzatilmadi)

| ID | Daraja | Nuqson | Sabab / keyingi qadam |
| --- | --- | --- | --- |
| B-O1 | P1 | Disk: ilovada yuklash (upload), yangi papka, nomini o'zgartirish/ko'chirish/o'chirish, "Diskdan tanlash" yo'q (sayt bor). Mobil BFF multipart o'tkazmaydi (`hujjat-maydoni-yukla` yo'q) | Server ish: BFF ga JSON `audio_b64`ga o'xshash base64 yuklash yo'li kerak. Alohida PR |
| B-O2 | P2 | Disk ro'yxatida fayl sarlavhasi "v1", tafsilotda joriy "v3" (demo ma'lumot yoki versiya maydoni noto'g'ri) | Haqiqiy server ma'lumoti bilan tekshirish kerak |
| B-O3 | P2 | Disk ekrani pastki navigatsiya panelini yashiradi (Android) | Dizayn qarori: Hujjatlar to'liq ekran; tasdiqlash kerak |
| B-O4 | P2 | Windows: Jarvis paneli ochiqda jadval ustunlari o'ngdan kesiladi (gorizontal aylantirish yo'q) | Obyektlar jadvali boshqa agent (A) hududi |
| B-O5 | P1 | MSI o'rnatish/yangilash/o'chirish, yorliqlar, push, oflayn navbat, avto-yangilash, Android orqaga/aylanish: bu sessiyada sinalmadi | Vaqt; relizdan oldin L0 yoki keyingi agent sinashi shart |
