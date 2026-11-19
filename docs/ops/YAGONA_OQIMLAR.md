# Yagona oqimlar xaritasi (sayt · Android · Windows · Telegram)

Egasi tamoyili (2026-11-19): BITTA markazlashgan tizim. Bir vazifa har platformada BIR XIL qadamlar va BIR XIL so'zlar bilan bajariladi;
bitta platformani o'rgangan odam hammasini ishlata oladi. Yangi funksiya qo'shilganda shu jadval yangilanadi va AI (Jarvis / Ctrl+K) tooliga ham qo'shiladi.

## Umumiy qoidalar (hamma platformada)
- **Til**: hisob tili (`t2_foydalanuvchi.til`; bo'sh bo'lsa o'zbek lotin). Telegram `language_code` javob tilini belgilamaydi. O'zgartirish: sayt profili yoki botda `/til`. Bir chatda til almashmaydi.
- **Obyekt tanlash**: ro'yxat oxirgi yangilanish tartibida; sinov obyektlari (`SINOV…`, `TEST…`) haqiqiy ro'yxatda ko'rinmaydi (faqat ular qolsa ko'rinadi); aniq `#raqam` yozilsa ruxsat doirasida ishlaydi. Standart obyekt hech qachon sinov obyekt emas.
- **Yozish = preview + tasdiq**: hech narsa bevosita yozilmaydi; hamma yozuv mavjud shlyuz (`sb-yoz`, `ombor-buyruq`, `f2-buyruq`, `foto-dalil`) orqali, ruxsat va audit serverda.
- **Savol → javob**: bot/ilova savol bersa (obyekt raqami, odam, fakt matni) keyingi oddiy xabar/kiritish shu amalni yakunlaydi (qisqa muddatli holat, 10 daqiqa; maxfiy ma'lumot saqlanmaydi).
- **Tokenlar**: tasdiq tokeni foydalanuvchi ko'radigan matnda chiqmaydi (Telegram: ko'rinmas `text_link` entity yoki `callback_data`).
- **Summalar**: NDS siz birlik narxi; QQS bilan asosiy, ustamali/ustamasiz alohida; noma'lum = «—» (0 emas).

## Oqim jadvali: amal × platforma

| Amal | Sayt (admin) | Android | Windows | Telegram |
|---|---|---|---|---|
| Obyekt tanlash | Obyektlar → karta | Obyektlar → karta | Obyektlar → karta | `Obyektlar` / `/obyektlar` → karta (`g:k:`); `#raqam` yozish |
| F-2 ko'rish | Obyekt → F-2 reestri | Obyekt → F-2 | Obyekt → F-2 | karta → `F-2` (`g:f:`) → akt xulosasi |
| F-2 tahrir (hajm) | qator → hajm → preview → Tasdiqlash | shu | shu | `g:l:` → hajm so'rovi → preview → `Tasdiqlash` (`g:ok`) |
| Fakt kiritish | obyekt → qator qidirish → hajm → preview → Tasdiqlash | shu | shu | `Fakt kiritish`/`/fakt` → (obyekt) → matn («12,5 m3 beton quyildi») → qator tanlash → `Saqlash` (qoralama; PTO/prorab tasdiqlaydi). Obyektsiz bo'lsa «Qaysi obyekt? Raqamini yozing» |
| Fakt jurnali | obyekt → Fakt jurnali | shu | shu | karta → `Fakt jurnali` (`g:j:`) |
| Foto-dalil | Foto-dalil → obyekt → qator | kamera → obyekt → qator | fayl → obyekt → qator | rasm yuborish (izohda `#raqam` yoki keyingi xabarda «240») → bo'lim → so'z → qator |
| Ombor KELDI / BERDIM | Ombor (omborxona avval) → KELDI/BERDIM → preview → Tasdiqlash | shu | shu | faqat ombor niyatida («keldi», «berdim», «qoldiq»…) yoki ovoz → preview kartasi → `Tasdiqlash` (`ob:y`); noaniqlikda variant tugmalari (`os:`) |
| Hujjatlar paketi | Hujjatlar paketi → shartnoma → oy → ZIP | shu | shu | `Hujjatlar paketi` (`g:pk`) → shartnoma → oy → ZIP |
| Hujjat / fayl saqlash | Hujjat maydoni | Hujjat maydoni | Hujjat maydoni | fayl yuborish → «qaysi papkaga?» |
| Tasdiqlar | Hujjat aylanishi | shu | shu | `Tasdiqlar` / `/tasdiqlar` |
| Jarvis (AI) | Jarvis / Ctrl+K | Jarvis | Jarvis | oddiy matn (faol suhbat bo'lsa o'sha suhbatga, bo'lmasa yagona savol); `/jarvis` suhbat tanlash. Reply shart emas |
| Til | Profil → Til | Profil → Til | Profil → Til | `/til` (uz / ru / en) |
| Odam taklif qilish | Kompaniya → A'zolar → Taklif | shu | shu | `/taklif` → «Kimni?» → «Qaysi rolda?» (yoki bitta xabarda `/taklif @user prorab`) |
| Ilovani yuklab olish | Yuklab olish sahifasi | — | — | menyu → `📥 Ilovani yuklab olish` / `/yuklash` |

## Telegram matn yo'naltirish tartibi (oddiy xabar, buyruq emas)
1. Kanal tahrir javobi / `force_reply` javoblari (qidiruv, hajm, rad sababi) — bot xabaridagi belgi bo'yicha.
2. Doimiy menyu tugmalari matni.
3. **Kutilgan niyat** (rasm obyekti, `/fakt`, `/taklif`) — keyingi xabar shu amalni yakunlaydi.
4. **Niyat aniqlagich** (`telegram-holat.ts: niyatAniqla`): ombor so'zlari → ombor (faqat omborchi); bajarilgan ish + hajm → fakt (standart obyekt bilan); qolgani → Jarvis.
5. Hech qachon «bot shu buyruqlarni tushunadi» ro'yxati oddiy matnga javob bo'lmaydi (faqat noma'lum buyruq/matnsiz xabarga).

## Kod xaritasi
- `functions/api/telegram/webhook.ts` — kirish, til, /start, buyruqlar.
- `functions/_shared/telegram-holat.ts` — hisob tili, kutilgan niyat holati, sinov obyektlari filtri, niyat aniqlagich.
- `functions/_shared/telegram-sifat.ts` — kutilgan niyatni yakunlash, fakt/taklif dialoglari, matn yo'naltirish.
- `functions/_shared/telegram-ombor.ts` — ombor kartasi; tokenlar ko'rinmas entity da.
- `functions/_shared/telegram-jarvis.ts` — Jarvis suhbati (faol suhbat chat holatida).
- Testlar: `functions/api/telegram/sifat.test.ts`.
