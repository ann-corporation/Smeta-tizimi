# Subpudratchi kabineti — tuzilish, sahifalar, uchrashuv nuqtalari

Holat: 1-bosqich (tadqiq/loyiha), kod yo'q. Sana: 2026-11-14. Umumiy model: `MUNOSABAT_MODELI.md` (kabinet = kompaniya × munosabat ko'zi). «TAXMIN» — tekshirilmagan.

## 1. Subpudratchining haqiqiy ishi

| # | Ish | Hozir tizimda | Holat |
|---|---|---|---|
| 1 | Bosh pudratchidan ish olish (shartnoma/topshiriq) | `t2_sub_topshiriq` (hajm + kelishilgan narx, QQS siz); `sub_ishlarim` | bor, prodda 2 qator (sinov) |
| 2 | O'z smetasi / narxi | **yo'q**: topshiriq GC smeta qatoriga bog'liq, sub GC smeta narxini ko'rmaydi; o'z xarajat asosi yo'q | **yetishmaydi** (savol 1) |
| 3 | Bajarilgan ishni topshirish (akt) | `t2_sub_akt` + `_qator` → `t2_tomon_taqdim` (`sub_akt_yoz/yubor`) | bor, prodda 0 akt |
| 4 | Qabul / rad / tuzatish | `t2_sub_akt_qaror_v1` (GC tomonda); sub ko'radi, qaytarib oladi (`sub_akt_qaytar`) | bor |
| 5 | To'lov va qarzdorlik | `t2_sub_tolov_holati_v1`: GC `t2_tolov` ni faqat `shartnoma_id` bog'liq bo'lsa ko'rsatadi | qisman: prodda `shartnoma_id` NULL → `tolangan` NULL |
| 6 | O'z ustalari / naryad | `t2_naryad_yoz_v1` faqat o'z kompaniya obyekti; `t2_sub_topshiriq` ga bog'i yo'q (funksiya matni) | **uzilgan** |
| 7 | O'z materiali | o'z kompaniya M-29/ombori (GC obyektiga bog'lanmaydi) | **uzilgan** (TAXMIN: M-29 ham obyekt egasi bo'yicha) |

## 2. Mavjud sahifalar: kerak / takror / o'lik

| Sahifa | Kim uchun | Baho | Izoh |
|---|---|---|---|
| `/admin/subpudratchi` — `SubpudratchiBugun.tsx` (261 qator) | sub | **KERAK** (yadro) | 1–5 qadam: shartnomalarim, ishlar, hajm kiritish+akt, aktlarim, to'lov. Hozir `tomonlar` ish joyi + `hujjat` ilovasi; ruxsat `[RAHBARIYAT,'f2.prepare','fakt.write']` — GC ning PTO si ham shu sahifani «Bugun» sifatida ko'radi (begona band) |
| `/admin/subpudrat` — `SubpudratBoshqaruv.tsx` (290) | bosh pudratchi | **KERAK**, lekin sub kabinetida emas — Pudratchi kabinetidagi «Subpudratchilar» bo'limi | topshirish, kelgan aktlarni qabul/rad (`reestr sahifa.ts:129`) |
| `/admin/qarzdorlik` («Postavshik, subpudrat») | GC | KERAK (GC qarzi); sub tomoni emas | sub-akt qabulida `t2_qarz_asos` faqat shartnoma bog'liq bo'lsa yoziladi |
| `/admin/shartnoma-liniya` (tur «Subpudrat») | GC | KERAK; sub o'z shartnomasini ko'rmaydi | subga berilgan shartnoma GC tenantida; sub tomoniga `shartnoma_xulosa` grant ko'rinishi yo'q |
| `/admin/topshiriqlar` (`t2_topshiriq`, umumiy vazifa primitivi) | hamma | KERAK, lekin **boshqa narsa**; prodda 0 qator | nom to'qnashadi: `t2_topshiriq` (matnli vazifa) ≠ `t2_sub_topshiriq` (smeta qatorining hajmi). Sub kabinetida «Vazifalar» va «Topshirilgan ishlar» deb ajratib nomlash |
| `/admin/taqdimlar` («Tomonlar hujjatlari») | tashqi tomon | sub-akt uchun **takror / o'lik eshik** (TAXMIN) | `t2_tomon_taqdimlar_v1` da `sub_akt` filtri yo'q; qaror trigger bilan boshqa yo'lga qaytariladi (`SUB_AKT_QAROR_BOSHQA_YOL`) → sub-akt faqat sub bo'limidan |
| `HujjatTomonlari` (imzo qatori, «Subpudratchi — 3 tomonlama bo'lsa») | hujjat | boshqa vazifa (imzolovchilar), takror emas | — |
| `/admin/kontragentlar?tab=aloqa` | hamma | KERAK: taklif/qabul/grant | sub aloqasini boshlash va grantlarni shu yerdan |
| `ParticipantsPage` (`/admin/participants`) | loyiha | sub uchun ahamiyatsiz | — |

O'lik sahifa topilmadi (barchasi reestrda, ishlaydi); **takror xavfi**: sub-akt ikki joyda (Subpudrat va Taqdimlar), «topshiriq» nomi ikki ma'noda.

## 3. Maqsad tuzilishi (telefon, ixcham)

Kabinet: «Subpudratchi — <kompaniya>», tepada bitta tanlov **«Kimdan: <bosh pudratchi> ▾»** (sukut: hammasi). Besh katta tugma (bugungi qurilma ekrani, 4–6 qoidasi), har biri bitta keyingi qadam:

| Tugma | Mazmun | Manba (mavjud) |
|---|---|---|
| 1. Ishlarim | kimdan, qaysi obyekt, qoldiq hajm (topshirilgan − qabul − kutilayotgan) | `sub_ishlarim`, `ishQoldigi` (`lib/subpudratchi/hisob.ts`) |
| 2. Hajm kiritish → Akt | oy tanlanadi, qator bo'yicha hajm, «Yuborish»; qoralama saqlanadi | `sub_akt_yoz/yubor` |
| 3. Aktlarim | holat: qoralama / kutilmoqda / qabul / tuzatishga; rad izohi | `sub_aktlar(yuborilgan)` |
| 4. Pul | qabul qilingan jami (QQS siz va QQS bilan), to'langan, qarz; narxsiz = «—» | `sub_tolov` |
| 5. Mening odamlarim va materialim | naryad (usta), material — **hozir yo'q**, 4-bo'lim | — |

Pul: birlik narxi QQS siz; jami avval QQS bilan, so'ng ustamasiz; NULL ≠ 0 (hisob faqat `lib/hisob-yadro`, `lib/subpudratchi/hisob.ts`). Sub ustama/GC smeta narxini ko'rmaydi (server shuni majburlaydi). Telefon: bir ustunli ro'yxat, hajm kiritish katta tugmalar, oflayn qoralama (TAXMIN: qurilma oflayn navbati `UstaBugun` bilan bir xil mexanizm bo'lishi mumkin; sub sahifasida tekshirilmagan).

## 4. Yetishmaydigan bo'laklar (taklif, yangi modulsiz)

| # | Nima | Qanday (mavjudga tayanib) |
|---|---|---|
| S1 | Sub ustalari/naryadi | sub o'z kompaniyasida naryad yozadi, `topshiriq_id` bog'i `t2_naryad_qator` ga NULL ustun sifatida (sub `meta` bilan) — yoki sub o'z «ichki obyekt»ini GC obyektining ko'zgusi qilib ochadi. **Qaror kerak** (savol 1); ikkala yo'l ham GC smetasiga tegmaydi |
| S2 | Sub o'z narxi/smetasi | sub faqat kelishilgan narxni ko'radi; o'z xarajati (usta, material) o'z kompaniyasida yoziladi; sub marjasi = kelishilgan narx − o'z xarajati (hisob-yadro orqali). Alohida «sub smetasi» yaratilmaydi |
| S3 | Shartnoma ko'rinishi | sub topshirishda `shartnoma_id` majburiy-yarim (ogohlantirish): `to'langan/qarz` faqat shundan ishlaydi. Grantga `shartnoma_xulosa` (mavjud resurs) qo'shiladi |
| S4 | Aloqa 97 grantlari | 123 ning sub ko'zi bo'sh (grant 0): bosh pudratchi (440) tomonidan `sub_ish`, `tolov_holati`, `obyekt_holat` grantlari — sinov to'ldirishi, shablon (`subpudrat`/`subpudratchi`) kalitini prod `turi=shartnoma` ga moslab |
| S5 | 3-daraja | MUNOSABAT_MODELI M5: `ota_topshiriq_id` |

## 5. Bosh pudratchi (buyurtmachi roli) kabineti bilan uchrashuv nuqtalari

| Nuqta | Sub tomoni | Bosh pudratchi tomoni | Manba |
|---|---|---|---|
| Taklif/aloqa | «Takliflar» (kod/INN), `men_rol=subpudratchi` | «Subpudratchi taklif qilish» (`SubpudratBoshqaruv`) | `t2_tomon_aloqa` |
| Doira (grant) | olingan grantlar | beriladigan grantlar (`sub_ish`, doira obyekt) | `t2_tomon_grant`; `sub_topshir` o'zi `grant_yaratildi` qaytaradi |
| Topshiriq | «Ishlarim» | «Ish topshirish» (hajm + kelishilgan narx yoki ulgurji summa) | `t2_sub_topshiriq` |
| Akt | «Aktlarim» | «Kelgan aktlar» → qabul/rad/tuzatish | `t2_sub_akt` ↔ `t2_tomon_taqdim`; qaror `t2_sub_akt_qaror_v1` |
| Fakt va xarajat | — (sub faqat «qabul» holatini ko'radi) | qabulda avtomatik: fakt (`fakt_akt_id`), `t2_xarajat` (`subpudrat`), `t2_qarz_asos` | server isbotlangan; UI havolasi yo'q (MUNOSABAT_MODELI U-c) |
| F-2 / direksiya | — | fakt qatori orqali F-2 ga hajm; sub narxi F-2 narxiga ta'sir qilmaydi | F2 narxi = max qoidasi |
| To'lov | «Pul» tugmasi | GC `t2_tolov` + qarzdorlik | `t2_sub_tolov_holati_v1` |
| Qaytarish | akt «tuzatish» → qayta | rad izohi (≥3 belgi) | `t2_sub_akt_qaror_v1` |

Bir ish — bitta fakt: qabul qilingan sub hajmi + GC ning qo'lda fakti topshirilgan hajmdan oshmaydi (`ORTIQCHA`), ikki marta sanalmaydi.

## 6. Egasining real ma'lumoti (faqat o'qish) va modelga aks etishi

Kompaniya 123 da subpudrat ishi **sub-akt shaklida emas**, GC ning o'z smetasi/F2 sida yoziladi: (a) yaxlit svod qatorlari — «СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ» varag'i: shartnoma qiymati, bajarilish % (boshidan / yil boshidan / davr), `lib/smeta-anatomiya/f2-yaxlit.ts`; (b) obyekt 152: «сум» birlikli qatorlar (prodda `birlik='сум'`: 7 `bl` + 28 `rs` + 5 `ob`, 2 obyektda; hajm va narx to'ldirilgan) — smetasiz subpudrat ishi, pul bilan o'lchanadi.

Modelga aks etishi:
1. Sub topshirig'i ikki turda: **(i) hajmli** (qator × hajm × kelishilgan narx; joriy `t2_sub_topshiriq`) va **(ii) yaxlit** (qator birligi «сум» — hajm = pul ulushi; sub aktida oylik % yoki summa). Joriy `sub_topshir` allaqachon `p_umumiy_summa` (ulgurji, ulush/hajm) beradi — «сум» qatori uchun tabiiy kengayish: hajm = bajarilgan ulush (0..1), narx = shartnoma qiymati (`f2-yaxlit.ts` bilan bir xil ma'no).
2. Real sub-aktlar boshqa korxona hujjati bo'lgani uchun, 123 ning kiruvchi sub-aktlari **import yo'li** (`f2-yaxlit`) bilan o'qiladi; kabinetga ichki akt oqimi (`t2_sub_akt`) faqat subning o'zi tizimda bo'lganda ishlaydi — ikki manba bitta natijaga (GC fakt/xarajat) keladi, takror hisob yo'q (`t2_sub_akt.fakt_akt_id` / import F2 faktga yagona kalit).
3. Minus qatorlar, asl smeta o'zgarmasligi qoidalari saqlanadi: sub qabuli smeta qatoriga tegmaydi, faqat fakt qatlami.
4. «сум» qatorda «narxsiz» emas, hajm bilan o'lchanadi: UI bu qatorni «summa bilan topshirish» deb ko'rsatishi kerak (savol 2).

## 7. Egasiga savollar

1. Sub ustalari/materiali: sub o'z kompaniyasida naryad/M-29 yuritadimi (o'z hisobi) yoki faqat akt hajmini kiritadimi? (a — o'z hisobi, b — faqat akt)
2. «сум» (yaxlit) sub qatorlari: sub aktida summa yoki % kiritadimi? (a — summa, b — %)
3. Sub o'z narxini ko'radimi/yozadimi yoki faqat GC bergan kelishilgan narxni? (a — faqat kelishilgan, b — o'z xarajati ham)
4. Subning subi: 3-daraja kerakmi hozir? (ha — M5, yo'q — keyinroq)
