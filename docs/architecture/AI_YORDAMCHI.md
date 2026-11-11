# Yagona AI yordamchi (Jarvis)

Egasi (2026-11-11): tizimning eng katta ustunligi — HAR BIR ishni AI orqali oson bajarish. Bitta yordamchi, Ctrl+K va pastki o'ng tugma bilan ochiladi.

## Qatlamlar
1. `frontend/src/lib/yordamchi/` — sof mantiq (testlanadi): `matn` (uz lotin/kirill/ru/en normalizatsiya), `sinonim` (sahifa iboralari), `sahifa-qidiruv` (navReestr -> sahifa, ruxsat filtri, URL), `kontekst-ajrat` (obyekt, oy), `niyat` (matn -> navigatsiya / o'qish / yozuv / noma'lum), `vositalar-reestr` (yagona vositalar ro'yxati), `sahifa-store` (foydalanuvchiga ochiq sahifalar; AdminShell yozadi).
2. `frontend/src/umumiy/ui/yordamchi/` — `ishlov.ts` (niyat -> javob/taklif), `useObyektMotor` (obyekt ma'lumoti + vositalar), `YordamchiTaklif` (tasdiq kartasi).
3. `AiHelper` (oyna, Ctrl+K) + `AiChat` (suhbat, ovoz). Hal qilinmagan so'rov mavjud server oqimiga (`kasbSavolOqim` / `tizimYordamSavol`) o'tadi; token hisobi (aiHisobli) o'zgarmagan.
4. Model (`/api/smeta-ai`, sahifa `buyruq`): o'qish `qidir|holat|narxsiz|qoldiq`, amal `fakt_hajm|narx_tuzat|korsat|och`. Kundalik ish jurnali (P1, `lib/ish-jurnal/`): o'qish `jurnal`, amal `jurnal_yoz` (faqat qoralama izoh; tasdiqlash — jurnal sahifasida, prorab o'zi). Sxema: `lib/ai-yordamchi/protokol.ts`, ko'rsatma: `prompt.ts`.

## Hujjatlar va sahifa amallari
- O'qish: qarz (`qarz_svod_v1`), F2 ro'yxati (obyekt/oy), АОСР «nima yetishmayapti» — `lib/yordamchi/hujjat-oqim.ts`. TODO(stream A): pul o'qishlari yagona hisob yadrosi merge bo'lgach shunga almashtiriladi.
- Qoralama (faqat taklif kartasi -> «Bajarish»): F2 oylik qoralama (`sbT2AktYaratV2`, tokenBilan `f2_qoralama`; shu oyga F2 bor bo'lsa yoki manba o'qilmasa yozilmaydi; ikkinchi «Tasdiqlayman») va АОСР qoralama (`sbAosrYozV2` holat «yangi» + `sbAosrBogSaqla`). Tasdiqlash hech qachon avtomatik emas.
- Sahifa amallari (registry hook): sahifa `useYordamchiSahifaAmallari([...])` bilan o'z buyruqlarini beradi (hozir Smeta Studio); Ctrl+K hamma joyda, Studioda ham, Jarvisni ochadi. Yozuvga o'xshash amal `tasdiq: true`.
- Suhbat tarixi seans davomida saqlanadi (sessionStorage, kompaniya bo'yicha); Jarvis tugmasi — sarlavha qatorida (suzuvchi tugma yo'q).

## Qoidalar (majburiy)
- **Yangi sahifa** `lib/nav/navReestr.ts` ga qo'shilsa: ochish niyati avtomatik paydo bo'ladi, LEKIN `lib/yordamchi/sinonim.ts` ga kamida bitta `ru` va bitta `en` ibora yoziladi. `niyat.test.ts` (REESTR QOPLAMI) aks holda yiqiladi.
- **Yangi RPC / yangi asosiy amal**: `vositalar-reestr.ts` ga o'qish yoki yozuv vositasi sifatida yoziladi (`manba` — mavjud yo'l). Modelga ham ochiladigan bo'lsa `SAHIFA_VOSITALARI.buyruq` + `prompt.ts` + `buyruq-vositalar.ts`. `vositalar-reestr.test.ts` model sxemasi bilan mosligini tekshiradi.
- **Yozuv** faqat mavjud xavfsiz yo'l (RPC/gateway, operation_id) orqali va DOIM avval taklif kartasi («Tasdiqlash»); pul/huquqiy amal — ikkinchi «Tasdiqlayman»; ovoz hech qachon tasdiqlamaydi. F2 va АОСР hech qachon avtomatik tasdiqlanmaydi: yordamchi faqat qoralama sahifasini obyekt/oy bilan ochadi.
- **O'qish** sahifalar ishlatadigan hisob yadrosi funksiyalari orqali (qayta hisoblanmaydi); pul — ustamasiz + ustamali, NDS siz.
- **Hech qachon rad etmaydi**: aniqlanmagan so'rovda eng yaqin sahifa/amallar taklif qilinadi.
- **Ruxsat**: faqat AdminShell sidebar ro'yxati (rol/ruxsat/modul) bo'yicha sahifa ochiladi; ruxsatsiz bo'lim haqida «ruxsat yo'q» deyiladi.
- Interfeys matnlari `t()` bilan, ru/en tarjimasi `i18n/lugat/qism/yordamchi.json` da.
