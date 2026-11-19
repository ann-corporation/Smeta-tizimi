# Fakt kiritish: sayt vs Windows (1:1 tekshiruv ro'yxati)

Sana: 2026-11-19. Manba (sayt): `frontend/src/lib/reestr/sahifa.ts` (`fakt` -> `/admin/fakt`) -> `FaktNative.tsx` (115 qator) -> `FaktJurnal.tsx` (1263 qator), `XotiradanFakt.tsx`, `FaktQamrov.tsx`, `FaktBajarilmadiTez.tsx`, `FaktF2Tenglash.tsx`, `FaktTiklash.tsx`, `FaktInlineAmal.tsx`, `UstaKutilmoqda.tsx`, `SmetaTree` (daraxt). Windows: `android-native/desktop/.../Modules.kt` `FaktScreen`.
Belgi: ✅ saytdagidek; 🟡 qisman/boshqacha; ❌ yo'q. **Holat (PR-C dan keyin: bu faylning oxiridagi «PR-C holati» jadvaliga qarang; yuqoridagi jadvallar PR-C dan OLDINGI holatni ko'rsatadi).** Windows `FaktScreen` saytning Fakt sahifasi emas, uning o'rniga o'ylab topilgan oddiy shakl (qidiruv + ro'yxat + «Yozish»). Bu shakl saytda yo'q, shuning uchun 1:1 emas; u haqiqiy sahifa qurilguncha almashtiriladi.

Bu sessiyada ishlab chiqilgan, saytdan chetga chiqqan Fakt UI (`/api/f2-buyruq` fakt_yoz preview paneli, «Bajarilmadi»/«Zamena» oynalari) **tashlab yuborildi**, repoga kirmadi. Saytning o'zi `fakt_yoz` ni `sbFaktYoz` / `sbFaktBelgilaV2` orqali (`/api/sb-yoz`, `t2_fakt_yoz_v2`, `operation_id` bilan) chaqiradi, Jarvis preview yo'li bilan emas; Windows shu yo'lni ishlatishi kerak.

## 1. Sahifa ramkasi (`FaktNative`)

| Sayt elementi | Windows | Holat |
|---|---|---|
| Sarlavha «Bajarilgan ishlar (Fakt)», izoh «Smeta hajmi va Faktni RZ -> BL -> RS/MAT/OB daraxtida boshqaring» | «Fakt: <obyekt>» | ❌ |
| `ZanjirChizigi` (obyekt zanjiri: smeta -> fakt -> F2) | yo'q | ❌ |
| `UstaKutilmoqda` (usta yuborgan, tasdiq kutayotgan fakt, `fakt.write` bilan) | yo'q | ❌ |
| Obyekt tanlovi `<select>` («-- obyektni tanlang --») | yuqori panelda umumiy tanlov | 🟡 |
| Tugmalar: «Obyekt holatiga qaytish», «Yangilash», «F2 tayyorlash ->» (avval saqlanmaganni saqlaydi) | faqat F5 | ❌ |
| Ko'rinish almashtirgich: «Fakt jurnali» / «Xotiradan» / «Daraxt» (`aria-pressed`) | yo'q | ❌ |
| Holatlar: «Avval yuqoridan obyektni tanlang...», xato `role=alert`, skeleton | «Yuqoridan obyektni tanlang» | 🟡 |
| Daraxt ko'rinishi: «Smeta: ... Fakt: ...», «Markirovka bo'yicha 100%», «100% qilish», «Faqat BL/MAT/OB; RS avtomatik hisoblanadi.» | yo'q | ❌ |

## 2. Fakt jurnali (`FaktJurnal`, asosiy ko'rinish)

| Sayt elementi | Windows | Holat |
|---|---|---|
| Qator ustunlari: Kod, Nomi, Kat/tur, Holat, Smeta hajmi, Birlik, Birlik narxi, Bajarilish foizi, Fakt hajm, F2 hajmi, Bu fakt, Ochiq qoldiq, F2 ga olish mumkin, Fakt summasi | yo'q (jurnal = F2 hujjatlar ro'yxati) | ❌ |
| Bo'limlar/ildiz ishlar, «Bo'limsiz», «Butun obyekt (barcha bo'limlar)», bo'limni ochish | yo'q | ❌ |
| Katakda to'g'ridan-to'g'ri hajm kiritish; rejim «+ bugun bajarilgan (qo'shiladi)» / «= jami fakt»; foiz («50%») va formula (`=SMETA-FAKT`, `=QOLDIQ`, `=SMETA*0.5`) | yo'q | ❌ |
| Excel ustunini joylash, Enter = pastga, Ctrl+S saqlash, Ctrl+Z orqaga | yo'q | ❌ |
| Klaviatura: strelkalar, Home/End, PageUp/PageDown, qidiruv (/), g+l «to'xtagan joy» | yo'q | ❌ |
| «Fakt = F2» (bo'lim / butun obyekt), «Orqaga (ommaviy kiritma)», «Qamrov %» (bo'lim) | yo'q | ❌ |
| Resurs qatorlari: «Resurslar: <nom>», «Materiallarni ham olish», ish ulushida taklif (avtomatik yozilmaydi), norma x ish fakti «avto» | yo'q | ❌ |
| Qator amallari: «Bajarilmaydi / qilib bo'lmaydi», «Zamena» (ish/resurs), «Resursni ishdan chiqarish», «Zamenani bekor qilish» | yo'q | ❌ |
| Belgilar: «bajarilmaydi», «zamena», «qo'shimcha», «narxsiz», «qoldiqdan oshdi», «F2 faktdan +n», «taklif» | yo'q | ❌ |
| Sana «Fakt sanasi», qoralama banneri/«Fakt tiklash» (`FaktTiklash`) | sana maydoni bor (boshqa shaklda) | 🟡 |
| Matnlar (i18n): 150+ kalit `t('...')` (masalan «Fakt jurnali», «Saqlash», «Qidirish», «Ochiq qoldiq = smeta - fakt - almashtirilgan - bajarilmaydi») | Windows matnlari alohida yozilgan | ❌ |

## 3. Qolgan ko'rinishlar

| Sayt elementi | Windows | Holat |
|---|---|---|
| «Xotiradan» (`XotiradanFakt`) | yo'q | ❌ |
| «Daraxt» (`SmetaTree` + `onFaktSave`: «qo'shish» va «jami» rejimi, `FAKT_CONFLICT` «Qator serverda o'zgargan. Yangilang.») | Smeta daraxti faqat o'qish | ❌ |
| `FaktQamrov` (100% oynasi, preview, bitta `fakt_yoz_v2`) | yo'q | ❌ |
| Foto-dalil yuklash | «Foto yuklash / Fayl yuklash / Diskdan tanlash» | 🟡 (sayt: alohida `foto` sahifasi) |

## 4. Server chaqiruvlari (sayt -> Windows)

| Sayt | Windows | Holat |
|---|---|---|
| `sbFaktYoz({obyektId, sana, operationId, qatorlar:[{qator_id, hajm}], izoh})` -> `/api/sb-yoz` | `/api/sb-yoz` `faktPayload` (bor, UI'siz 1:1 emas) | 🟡 |
| `sbFaktBelgilaV2` («jami» tahriri, `expectedFaktHajm`, `FAKT_CONFLICT`) | yo'q | ❌ |
| Holat o'qish (`useT2Daraxt`, `t2_qator_holat`) | `qator_holat` o'qiydi (Smeta) | 🟡 |
| Bajarilmaydi (`bajarilmaydiXarita`), Zamena/resurs amallari (`FaktInlineAmal`) | yo'q | ❌ |

## 5. Yo'l (1:1 ga erishish tartibi)

Sahifa 1263 + ~900 qator mantiq va 150+ matn kaliti: bitta PR emas. Tartib: (1) matn kalitlarini Android `strings` ga sinxronlash (Windows allaqachon o'sha XML'larni o'qiydi), (2) `lib/fakt-jurnal.ts` mantig'ini (`jurnalQur`, `holatXarita`, `bajarilmaydiXarita`, formulalar, foiz) `shared` ga tarjima + sayt testlari bilan solishtirish, (3) jurnal jadvali (ustunlar, bo'limlar, katakda kiritish, Ctrl+S), (4) qator amallari (bajarilmaydi, zamena, resurs), (5) Fakt = F2, Qamrov %, Xotiradan, Daraxt, UstaKutilmoqda. Har bosqichda shu fayldagi qatorlar ✅ ga o'tkaziladi, ✅ faqat saytga yonma-yon qarab tasdiqlangandan keyin.

---

# Yetkazilgan Windows ekranlari auditi (sayt bilan farqlar)

## F-2 tayyorlash (`F2TayyorlashNative.tsx`, 1361 qator)
- **Ramka:** sayt «F2 tayyorlash» sahifasi: obyekt + oy tanlanadi, jadval ish/resurs daraxti (Resurs, Birlik, Hajm, Narx · manba, Summa, Holat), «Tez kiritish», «Fakt qoldig'idan olish», «F2 qoralama yaratish». Windows: faqat mavjud aktning tekis qatorlari (grid), yaratish yo'q. ❌
- **Server yo'li:** sayt `sbT2AktYaratV2` / `sbT2F2QoralamaYangila` (`/api/sb-yoz`, `operation_id`, qulf, ogohlantirishlarda `tasdiqSora` oynalari). Windows: `/api/f2-buyruq` (Jarvis preview + «Tasdiqlayman» kartasi): saytning F2 sahifasida bunday karta yo'q. ❌ (sayt yo'liga o'tkazish kerak; preview kartasi faqat texnadzor «Qabul» qadamida saytda ham bor)
- **Yo'q elementlar:** daraxt (ish/resurs), Narx · manba, storno bloki/pereraschet, «Resursni ishdan chiqarish», «Zamena», «Smeta normasiga qaytarish», dublikat himoyasi, «Qayta yuklash», Excel qoralama yuklash, Qoldiqdan olish. ❌
- **Bor va saytga mos:** minus hajm ruxsat (0 yo'q), narx manfiy emas, qator ranglari (minus = ogohlantirish) 🟡; texnadzor takliflari «Qabul / Rad / Keyinroq» (`F2TekshiruvTakliflari`) 🟡 (`/api/tekshiruv` BFF ro'yxati #705 da).
- **Windows'ga xos qo'shimchalar (saytda yo'q):** o'ng panel «Qatorni tanlang...», CommandBar «Saqlash - oldindan ko'rish (Ctrl+S)», Ctrl+Z, CSV eksport. Saytning F2 sahifasida bunday elementlar yo'q: olib tashlash yoki saytga ham qo'shish kerak.

## Hujjatlar (Windows «Hujjat aylanishi» ichidagi ro'yxat)
- Saytda `/admin/documents` = **Disk** (4 tab: Mening diskim, Kompaniya diski, Ulashilgan, Savat). Hujjat registri ro'yxati (`/api/hujjat-royxat`) uchun saytda aniq mos sahifa shu qurilishda topilmadi; Windows'dagi «tur tugmalari + qidiruv + faqat tayyor + papkaga yuklab olish» paneli saytdan ko'chirilmagan, o'ylab topilgan. ❌ (mos sayt sahifasini aniqlab, 1:1 qilish yoki olib tashlash kerak)
- Disk: ui-common umumiy kodi (sayt Disk bilan bir xil tablar), ulashish/ruxsat va fayl-bog'lash yo'q. 🟡

## Ombor (`TestSklad.tsx`, #697 dan keyin)
- **Sayt:** yuqorida «Ombor» tanlovi («Barcha omborlar»), «KELDI - omborga kirim» va «BERDIM - ombordan obyektga» tugmalari, «Ombor ko'rsatkichlari» (KPI: manfiy qoldiq, tugagan, oxirgi harakat), bo'limlar: Jamlangan ombor, Obyekt qoldiqlari («Obyektlarga berilgan pozitsiyalar»), Harakatlar tarixi, M-29 hisobot, QR pasport, «Excel'dan yuklash», ombor yaratish, qidiruv «Material nomi bo'yicha...».
- **Windows:** ombor tanlovi (faqat bitta ombor, «Barcha omborlar» yo'q) ❌; tablar «Kirim / chiqim» (matn buyrug'i + server preview), «Qoldiq», «Hisobot», «Obyektlarda» (saytdagi bo'limlar nomi va tuzilishi boshqa) ❌; KELDI/BERDIM shakllari (obyekt majburiy tanlov) yo'q ❌; KPI, QR pasport, Excel yuklash, ombor yaratish yo'q ❌.
- **Mos:** default obyekt yo'q va «Obyektlarda» butun kompaniya bo'yicha (#697) ✅.

## Umumiy (grid bloklari)
Saytda jadvallar boshqacha (HTML `fz-table`); Windows grid (Ctrl+C -> Excel, CSV, ko'p tanlash) saytda mavjud bo'lmagan qulaylik: farq emas, ortiqcha. Lekin har ekranning ustunlari va matnlari sayt bilan bir xil bo'lishi shart (yuqorida ro'yxat).

---

# PR-C holati (2026-11-19): Windows Fakt jurnali = saytning `FaktJurnal`ining birinchi bo'lagi

Windows `FaktScreen` endi o'ylab topilgan shakl emas: saytning «Bajarilgan ishlar (Fakt)» sahifasi tuzilmasi (toolbar kartasi -> Bo'limlar paneli + jurnal jadvali -> Saqlash paneli), matnlar saytning o'z `t()` kalitlari (`SiteI18n`, uz/ru/en), mantiq ko'chirilgan `lib/fakt-jurnal.ts` (parite testlari bilan), ma'lumot `/api/obyekt-paket` (saytning `useT2Daraxt` paket yo'li), yozish `fakt_yoz_v2` (`/api/sb-yoz`, bitta operation_id, saytning `sbFaktYoz` qo'ng'irog'i). Foto-dalil paneli Fakt sahifasidan olib tashlandi (saytda u alohida «Foto-dalil» sahifasi).

| Sayt elementi | Windows | Holat |
|---|---|---|
| Sarlavha «Bajarilgan ishlar (Fakt)» + izoh «Smeta hajmi va Faktni RZ -> BL -> RS/MAT/OB daraxtida boshqaring» | aynan shu kalitlar | ✅ |
| Toolbar: «Sana» (Fakt sanasi), qidirish «Butun obyekt bo'yicha qidirish...  ( / )», «faqat bajarilmaganlar», Holat filtri Hammasi/Kiritilganlar/Boshlanmagan/Chala | bor, saytning mantiq funksiyalari (`holatFiltrMos`, `ochiqBor`) | ✅ (Alt+1..4 tez tugmalar ❌) |
| Toolbar: «fakti yo'q, F2 olingan», «Faqat zamena va qo'shimchalar», «Klaviatura ?», Fakt = F2, Fakt tiklash, Qamrov %, Egizaklarga ham yozish, Smetadan tashqari ish | yo'q | ❌ |
| «Bajarilish tahlili» (FaktXulosaPanel), `FaktStudioBar`, qoralama banneri, avvalgi F2 ko'chmagan banneri | yo'q (xulosa hisoblari `jurnalXulosa`/`obyektUlushi` ko'chirilgan, UI yo'q) | ❌ |
| Bo'limlar paneli: nom, «{n} ish», bajarilish chizig'i, «{a} / {b} tugagan», «Bo'limsiz · {n} ish» | bor | ✅ (panelni yig'ish va ichki bo'limni yopish ❌) |
| Jurnal sarlavhasi: bo'lim nomi, «{n} ish · {q} qator», «{a} / {b} ish bajarilgan», «Jami %:» 25/50/75/100, «Hammasini yopish/ochish» | bor | 🟡 (MeterLegenda ❌, «Bo'lim: materiallarni ham olish» ❌; Smeta/F2/Fakt/F2 qoldiq summa juftligi ✅ PR-C2: bolimSummalari + obyekt podvali/koeffitsienti, QQS bilan · ustamali · ustamasiz; ▸ kesim tafsiloti ❌) |
| Jadval ustunlari: Kod, Nomi, Kat/tur, Holat, Smeta hajmi, Birlik, Birlik narxi, Bajarilish foizi, Fakt hajm, F2 hajmi, Bu fakt, Ochiq qoldiq, F2 ga olish mumkin, Fakt summasi | barcha ustun, saytning nomlari | 🟡 (ustun guruhlari/ikki qatorli sarlavha, ustun filtri tugmalari ❌; «Fakt summasi» = ustamali · ustamasiz juftligi (qatorFaktKesimi = taxminKesim, qiymatUchligi) ✅; ishdan chiqarilgan (Bajarilmaydi) resurslar hali chiqarilmaydi ❌) |
| Resurs qatorlari: ish ostida mat/ob, avtomatik rs «avto», zamena/qo'shimcha belgisi, Holat muhri (Boshlanmagan/Jarayonda/Bajarildi/Smetadan oshdi) | bor | 🟡 (norma «avto» hajm, almashtirilgan/bajarilmaydi/ishdan chiqarilgan belgilar ❌) |
| Katak ichida kiritish: son, foiz (50%), formula (=SMETA-FAKT, =QOLDIQ), noaniq «1.234», MANFIY/NOL/ISHORA xatolari | saytning `kiritmaSoni`/`jurnalPaket` | ✅ (Excel ustunini joylash, Enter = pastga ❌) |
| Rejim «+» bugun / «=» jami | kontekst menyu va «+ / =» ustuni | 🟡 (saytdagi tugma va klaviatura tezkor tugmalari ❌) |
| Qoldiq ulushi tugmalari (25/50/100 % ochiq qoldiq) | yo'q | ❌ |
| Saqlash paneli: «Saqlash» (Ctrl+S), «Orqaga» (Ctrl+Z), «sana: {s}», xato soni | bor | ✅ |
| Server: bitta `fakt_yoz_v2` paketi (delta), operation_id, ogohlantirish/narxsiz javobi | `/api/sb-yoz` shu amal | ✅ (javob ogohlantirishlarini ko'rsatish ❌) |
| Xotiradan, Daraxt, Qamrov %, Fakt = F2, Fakt tiklash, Egizaklar, Bajarilmaydi/Zamena/resurs amallari, Smetadan tashqari ish (IshAbcModal), UstaKutilmoqda, AI yordamchi, klaviatura navigatsiyasi (g+l, /, ?) | yo'q | ❌ (mantiq `shared`da: Qamrov B3a (#719), Fakt = F2/Tiklash B3b) |

Skrinshotlar: `C:\Temp\windows-paritet\40-fakt-jurnal.png` ... `43-after.png` (repoda emas). Yonma-yon (sayt bilan) skrinshot hali olinmagan: bu «✅» lar kod va matn kalitlari bo'yicha, ko'z bilan yonma-yon tasdiqlash qolgan.

## Foto-dalil (FotoLenta.tsx, saytda alohida sahifa)

Saytda menyuda emas, modul ro'yxati orqali ochiladi; Windows'da Fakt toolbar'idagi «Foto-dalil» tugmasi (Foto sahifasida «Fakt kiritish» orqaga).

| Sayt | Windows | Holat |
|---|---|---|
| Filtr: Oy, Razdel, Sana/Razdel bo'yicha | FotoScreen filtr kartasi | ✅ |
| Yuklash kartasi (FotoDalil) | UploadBar | ✅ |
| Lenta: guruhlar, thumbnail, izoh, Jami | FotoScreen | ✅ |
| Foto-hisobot (Excel/PDF, token) | yo'q | ⬜ |
