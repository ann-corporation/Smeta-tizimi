# Android paritet: F-2 qoralama (sayt -> Android)

Manba: `frontend/src/admin/sahifalar/F2TayyorlashNative.tsx` (1332 qator), `F2V3Workbench`, `components/f2-tayyorlash/F2TekshiruvTakliflari.tsx`, `F2QatorTakliflari.tsx`.
Android: `android-native/app/.../feature/f2/F2DraftScreen.kt` (PR #711), umumiy mantiq `shared/.../feature/f2/F2Draft.kt`.
Matnlar: ekrandagi matnlar saytning i18n kalitlariga o'tkazildi (kalit = o'zbekcha matn; ru/en `SiteI18n` lug'atidan aynan). Pastdagi jadvalda faqat solishtirilgan qismlar.

| Sayt (F2TayyorlashNative / takliflar) | Android | Holat |
|---|---|---|
| «F2 qoralamani tahrirlash» sarlavha | «F2 qoralamani tahrirlash» (sayt kaliti) | OK |
| «Bu F2 qoralama emas (tasdiqlangan yoki yuborilgan) - faqat ko'rish; o'zgartirib bo'lmaydi.» | aynan shu matn | OK |
| Texnadzor takliflari: «N ta taklif, M tasi hal qilindi», Qabul / Rad / Keyinroq, Rad sababi (≥3 belgi), «Olib tashlansin», «Hajm noto'g'ri», «Hujjat kerak», «Qo'shish taklifi», «eski versiya», holat belgilari | aynan shu matnlar va qoidalar; Qabul avval preview, so'ng «Tasdiqlayman» (`f2_qoralama_tahrir`, olib tashlashda + `bajarilmadi`) | OK |
| «Qadam i/n», «Tasdiqlash», «Bekor» | sayt kalitlari | OK |
| Qator tahriri: hajm (minus mumkin) va narx | hajm (0 rad), narx (QQS siz) alohida varaqda; preview serverdan | OK (mantiq), GAP (shakl: saytda jadval katagida) |
| Hujjat summasi uch xil (QQS bilan / ustamali / ustamasiz) serverdan | bir xil | OK |
| Bo'limlar | keshdagi smeta daraxtidan | OK (kesh bo'sh bo'lsa «bo'limsiz») |
| Holat tugmalari (yuborish/tekshirildi/tasdiqlash/rad) | `akt_lifecycle_transition_v1`, ruxsatni server hal qiladi | OK |

## Android'da hali YO'Q (sayt muharririda bor)
Bu qismlar kunlik ish uchun muhim; har biri alohida PR bo'ladi, mantiq serverdan olinadi, mijozda qayta yozilmaydi.
- Resurs darajasidagi jadval (Resurs / Birlik / Hajm / Narx · manba / Summa / Holat) va filtr, qidiruv, «Bo'limlar» bo'yicha olish.
- Tez kiritish (Ctrl+Enter, keyingi/oldingi ish hajmiga o'tish).
- Hajm manbai (Fakt / Smeta qoldig'i), fakt qoldig'i bo'yicha avtomatik olish, minus (storno) bloki, pereraschet.
- Zamena, «ishdan chiqarish», «Smeta normasiga qaytarish», «oldingi F2 narxini qo'llash», «narxsiz belgilash».
- Yangi F2 qoralama yaratish (F2 parametrlari: obyekt, oy, raqam), AOSR yaratish, saqlash tekshiruvi («xato — saqlash yopiq»).
- Narx taklifi (ТН·КМ), qator ustidagi smeta/fakt/F2 solishtiruvi.
