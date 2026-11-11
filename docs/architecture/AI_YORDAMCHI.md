# Yagona AI yordamchi (Jarvis)

Egasi (2026-11-11): tizimning eng katta ustunligi — HAR BIR ishni AI orqali oson bajarish. Bitta yordamchi, Ctrl+K va pastki o'ng tugma bilan ochiladi.

## Qatlamlar
1. `frontend/src/lib/yordamchi/` — sof mantiq (testlanadi): `matn` (uz lotin/kirill/ru/en normalizatsiya), `sinonim` (sahifa iboralari), `sahifa-qidiruv` (navReestr -> sahifa, ruxsat filtri, URL), `kontekst-ajrat` (obyekt, oy), `niyat` (matn -> navigatsiya / o'qish / yozuv / noma'lum), `vositalar-reestr` (yagona vositalar ro'yxati), `sahifa-store` (foydalanuvchiga ochiq sahifalar; AdminShell yozadi).
2. `frontend/src/umumiy/ui/yordamchi/` — `ishlov.ts` (niyat -> javob/taklif), `useObyektMotor` (obyekt ma'lumoti + vositalar), `YordamchiTaklif` (tasdiq kartasi).
3. `AiHelper` (oyna, Ctrl+K) + `AiChat` (suhbat, ovoz). Hal qilinmagan so'rov mavjud server oqimiga (`kasbSavolOqim` / `tizimYordamSavol`) o'tadi; token hisobi (aiHisobli) o'zgarmagan.
4. Model (`/api/smeta-ai`, sahifa `buyruq`): o'qish `qidir|holat|narxsiz|qoldiq`, amal `fakt_hajm|narx_tuzat|korsat|och`. Sxema: `lib/ai-yordamchi/protokol.ts`, ko'rsatma: `prompt.ts`.

## Qoidalar (majburiy)
- **Yangi sahifa** `lib/nav/navReestr.ts` ga qo'shilsa: ochish niyati avtomatik paydo bo'ladi, LEKIN `lib/yordamchi/sinonim.ts` ga kamida bitta `ru` va bitta `en` ibora yoziladi. `niyat.test.ts` (REESTR QOPLAMI) aks holda yiqiladi.
- **Yangi RPC / yangi asosiy amal**: `vositalar-reestr.ts` ga o'qish yoki yozuv vositasi sifatida yoziladi (`manba` — mavjud yo'l). Modelga ham ochiladigan bo'lsa `SAHIFA_VOSITALARI.buyruq` + `prompt.ts` + `buyruq-vositalar.ts`. `vositalar-reestr.test.ts` model sxemasi bilan mosligini tekshiradi.
- **Yozuv** faqat mavjud xavfsiz yo'l (RPC/gateway, operation_id) orqali va DOIM avval taklif kartasi («Tasdiqlash»); pul/huquqiy amal — ikkinchi «Tasdiqlayman»; ovoz hech qachon tasdiqlamaydi. F2 va АОСР hech qachon avtomatik tasdiqlanmaydi: yordamchi faqat qoralama sahifasini obyekt/oy bilan ochadi.
- **O'qish** sahifalar ishlatadigan hisob yadrosi funksiyalari orqali (qayta hisoblanmaydi); pul — ustamasiz + ustamali, NDS siz.
- **Hech qachon rad etmaydi**: aniqlanmagan so'rovda eng yaqin sahifa/amallar taklif qilinadi.
- **Ruxsat**: faqat AdminShell sidebar ro'yxati (rol/ruxsat/modul) bo'yicha sahifa ochiladi; ruxsatsiz bo'lim haqida «ruxsat yo'q» deyiladi.
- Interfeys matnlari `t()` bilan, ru/en tarjimasi `i18n/lugat/qism/yordamchi.json` da.
