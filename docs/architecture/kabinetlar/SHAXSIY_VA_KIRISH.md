# «Shaxsiy» kabinet va kirish — birinchi 10 daqiqa (tadqiqot va loyiha, 2026-11-14)

Holat: 1-bosqich, FAQAT tadqiqot; kod yozilmagan. Branch `claude/kabinet-shaxsiy`. Dalil formati: `fayl:qator` yoki prod so'rov soni.
Belgilar: **FAKT** — kod/ma'lumot bilan isbotlangan; **TAXMIN** — brauzerda kirib sinalmagan (kirgan holatni ochish taqiqlangan edi), egasiga savol.

## 0. Qisqa xulosa (eng muhim 10 ta)

1. **Ro'yxatdan o'tgan odam 57 % hollarda a'zoliksiz qolgan va hech nima qilmagan.** Prod: 14 faol foydalanuvchidan 8 tasi a'zoliksiz; shu 8 tasida mutaxassis profili 0, xizmat taklifi 0, haydovchi/tashuvchi profili 0, Jarvis suhbati 0, imzo 0, kompaniya so'rovi 0. (FAKT, sonlar.)
2. **«Shaxsiy» kabinet yo'q — bor narsa «shaxsiy ish joyi» (`t2_kompaniya.turi='shaxsiy'`)**, ya'ni 1 kishilik KOMPANIYA, unda odam `boss`. Prodda bunday joy 1 ta, «o'zi och» chaqiruvi 1 marta. Kompaniyasiz odamning o'z ekrani yo'q: u `/admin` ga tushadi va u yerda hamma narsa kompaniya oynasi.
3. **Kirgach birinchi ekran — «Kompaniyangizni oching»** (`RolBoshSahifa.tsx:21` → `YANGI_HISOB_KIRISH='/admin/kompaniya'`). Usta, haydovchi, sotuvchi, texnadzor uchun bu YOLG'ON savol: ularga kompaniya kerak emas.
4. **«Haydovchi bo'lish» / «Yuk e'lon qilish» / «Taklif berish» tugmalari niyatni yo'qotadi.** `YukOchiq.tsx:11-12`, `TenderOchiq.tsx:82`, `BozorOchiq.tsx:25,106` hammasi `navigate('/', {state:{qaytish}})` qiladi, lekin `qaytish` ni HECH QAYERDA o'qiydigan kod yo'q (butun `frontend/src` bo'yicha qidirildi; `KirishSahifa.tsx` da `useLocation` ham yo'q). Natija: haydovchi kirgach «Kompaniyangizni oching» ga tushadi. (FAKT.)
5. **Taklif bilan kelgan tashqi tomon (texnadzor, buyurtmachi xodimi) kompaniyasiz «Qabul qilish» ni bosa olmaydi.** `UlashSahifa.tsx:30-32` faqat boss/rahbar/admin ish joylarini sanaydi; yo'q bo'lsa «Avval shaxsiy ish joyingizni oching» (`:80`). Ya'ni tomon-kabinet uchun odam avval soxta kompaniya ochishi kerak. (FAKT.)
6. **Kurs kompaniyasiz foydalanuvchiga BO'SH**: `lib/kurs/yol.ts` `darsMos`: `if (!rol) return false`. Eng muhtoj odamga o'rganish yo'li yo'q. (FAKT.)
7. **Landing faqat kompaniya uchun yozilgan**: sarlavha «QURILISH KOMPANIYASI UCHUN YAGONA ISH MUHITI» (`product-scope.ts`), 6 rol kartasi (Rahbar, PTO, Smetachi, Ta'minot, Moliya, Buyurtmachi) — usta, haydovchi, yakka mutaxassis, texnadzor yo'q. Matnda LRV, RES, F2, nakopitelniy, F3, АОСР, ustamali/ustamasiz — ko'chadan kirgan odamga begona.
8. **Yaxshi tayyor qismlar bor, faqat ulanmagan**: `t2_shaxs_yonalish` jadvali (usta, haydovchi, PTO…; E7 hujjati) prodda 0 qator, frontendda 0 ishlatish — aynan «Siz kimsiz?» javobini saqlash uchun mo'ljallangan. `t2_mutaxassis_profil`, `t2_yb_tashuvchi` (yakka haydovchi), `t2_kadr_mustaqil`, `t2_xizmat_taklif` mavjud (yangi modul ochilmaydi).
9. **Eskirgan matnlar**: `KirishSahifa.tsx` (3 joyda) hali «kompaniya oching (so'rov) yoki direktordan taklif oling» deydi, `boshSahifa.ts:20-22` izohi «superadmin tasdiqlaydi» deydi — lekin `t2_kompaniya_ozi_och_v1` (prodda bor) kompaniyani DARHOL ochadi. Ro'yxatdan o'tish matni esa smeta/F2 va «300 token» haqida.
10. **Telefon holati**: haydovchi, topshiriq, bozor, tender, QR-tekshiruv telefon-birinchi yozilgan (katta tugmalar), lekin kirish, «Ish joylarim», «Mening xizmatlarim», Kurs, Akkaunt — oddiy «desktop» kartalar, 44px tugma qoidasi yo'q. Kompaniya sahifasi 19 ta jadval/min-w elementiga ega.

## 1. Foydalanuvchi turlari va ularning HOZIRGI yo'li (a)

### 1.1. Umumiy yo'l (hamma turga bir xil)

| Qadam | Nima bor | Nima tushunarsiz / boshi berk | Dalil |
|---|---|---|---|
| 1. Landing `/` | Sarlavha «Qurilishni boshqaring. Smetadan to'lovgacha — bitta tirik zanjir», Excel namunasi, «Bitta qator hikoyasi» (smeta→fakt→F2→nakopitelniy→F3→to'lov), F2 anatomiyasi, AI smetachi, 6 rol, «Ishonch qoidalari», 8 modul, narx («Bepul: 300 token»), 3 savol-javob | Birinchi ekranda «usta/haydovchi/sotuvchi uchun nima bor» degan javob yo'q. Birinchi 5 ekran = smeta mutaxassisiga mo'ljal. Jargon: LRV, RES, F2, F3, nakopitelniy, АОСР, ЧЕЛ/МАШ/МАТ/ОБ. Hamma tugma bitta «Hisob ochish» | `PublicEntry.tsx`, `intro/copy.ts`, brauzerda o'qildi |
| 2. Landingdan boshqa yo'l | Faqat header menyusi emas: `/bozor`, `/tender`, `/yuk` ochiq, lekin landingda ularga havola YO'Q (faqat ochiq sahifalar bir-biriga bog'langan) | Ko'chadan kelgan sotuvchi/haydovchi landingdan bozor/yuk sahifasini topa olmaydi; landingning «Imkoniyatlar»ida «Ta'minot va sklad» bor, ochiq bozor ko'rsatilmagan | `PublicEntry.tsx` nav: Qanday ishlaydi / Jamoa uchun / Imkoniyatlar / Boshlash bepul / Aloqa |
| 3. Kirish/ro'yxat formasi | Kirish: 3 plitka (Telefon+parol, Telegram (server yoqsa), Email kod) + Google; Ro'yxat: Google + email kod; ostida «Bepul tarif: 300 token… «Tokenlar va obuna» bo'limida tarif tanlaysiz» | Odam «Kirish» va «Ro'yxatdan o'tish» farqini bilishi shart (email kod ikkalasida bir xil, hisob avtomatik ochiladi — shuni aytadi). «Token», «tarif» — birinchi daqiqada keraksiz tushuncha. Telefon+parol: parolni kim beradi? (faqat taklif bilan) | `KirishSahifa.tsx:100-180` |
| 4. Kirgach | `/admin` → `RolBoshSahifa` → a'zoligi yo'q → «Kompaniyangizni oching»; a'zoligi bor → «Bugun» | Yangi odamga tost: «Hisobingiz tayyor. Keyingi qadam: kompaniya oching (so'rov) yoki direktordan taklif oling» — eskirgan va 2 yo'lli (so'rov!) | `KirishSahifa.tsx:73,78,95`, `RolBoshSahifa.tsx:21` |
| 5. «Kompaniyangizni oching» | Nom + ixtiyoriy STIR → «Kompaniyani ochish»; pastda «Taklif havolam bor» | Bu YAGONA ekran. «Men ustaman / haydovchiman / ish qidiryapman / shunchaki ko'ryapman» uchun tugma yo'q. Sidebar bu paytda: nomi «Smeta tizimi», pastida «Kompaniya tanlanmagan» (`AdminShell.tsx:288-290`) | `KompaniyaOching.tsx` |

### 1.2. Yetti tur bo'yicha (qayerga tushadi → nima ko'radi → keyingi qadam)

| # | Tur | Qayerga tushadi | Nima ko'radi | Keyingi qadam aniqmi? |
|---|---|---|---|---|
| 1 | Yakka usta/brigadir (ish qidiradi) | Landing → ro'yxat → «Kompaniyangizni oching» | Faqat kompaniya ochish. «Mening xizmatlarim» (`/admin/mutaxassis`) menyuda bor, lekin taklif qilinadigan rollar faqat pto/prorab/bugalter/kuzatuvchi (`Mutaxassis.tsx:21` `ROLLAR`; kasb ro'yxati `KASB_NOMI` tarkibi tekshirilmadi) — «ish qidirish» e'loni yo'q; taklif faqat «kompaniyani topib taklif yuborish» | **Yo'q.** Ish qidirishning o'zi yo'q: odam kompaniyani nom/STIR bilan topib «xizmat taklif qilishi» kerak. E'lonlar doskasi (ish topish) yo'q. |
| 1b | Usta — kompaniyadan taklif kutadi | Taklif havolasi `/qoshil/:kod` yoki `/taklif` (telefon+8 xonali kod+parol) | Taklif sahifasi yaxshi tuzilgan (lavozim taklifdagidek, mijoz tanlamaydi); keyin «Bugun» → `UstaBugun` (telefon ekrani, oflayn) | **Ha — eng yaxshi ishlaydigan yo'l.** Faqat havolani boshqa odam yuborishi kerak. |
| 2 | Yakka haydovchi | `/yuk` → «Haydovchi bo'lish» → `/` (niyat yo'qoladi, 4-xulosa) | Ro'yxatdan o'tgach — «Kompaniyangizni oching». `/admin/haydovchi` mavjud (telefon-birinchi, 52px tugmalar, joylashuv, foto, imzo) lekin menyuda «Yana…» ichida (`qoshimcha:true`), ruxsati `[]` | **Yo'q.** Haydovchi o'z sahifasini topa olmaydi; sahifa o'zi yaxshi (`HaydovchiSahifa.tsx` «Yakka haydovchi kompaniyasiz ishlaydi»). |
| 3 | Yakka sotuvchi/mutaxassis (smetachi, PTO, loyihachi) | Landing → ro'yxat | «Mening xizmatlarim»: profil + kompaniyaga xizmat taklif qilish + yuborilgan takliflar. Sotuvchi uchun `/admin/bozor-kabinet` — menyuda faqat rahbariyat/ichki rollar uchun ruxsat (`sahifa.ts`: `ruxsat:[RAHBARIYAT, ...ICHKI_ISH, procurement.read]`), kompaniyasiz odamga ko'rinmaydi | Mutaxassis uchun qisman. Sotuvchi: **yo'q** (ochiq `/bozor` ko'rinadi, lekin «E'lon berish» kirishdan keyin niyatni yo'qotadi). |
| 4 | Kompaniya ochmoqchi rahbar | Ro'yxat → «Kompaniyangizni oching» | Nom (+STIR) → 1 qadam → ish joyiga | **Ha** (2026-11-13 tuzatildi; faqat tost matni eskirgan). 2-kompaniya — eski so'rov oqimi. |
| 5 | Taklif havolasi bilan kelgan xodim | `/qoshil/:kod` yoki `/taklif/:token` | Kirishdan keyin havolaga QAYTADI (`kutilayotganTaklifKodi`, `KirishSahifa.tsx:44-47`) — bu qaytish ishlaydi | **Ha.** |
| 6 | Shunchaki ko'rib chiqayotgan odam | Landing; `/bozor`, `/tender`, `/yuk` ochiq | Landing — uzun, 15+ blok, tashqarida demo yo'q (namuna Excel bor, lekin «sinab ko'rish» tugmasi yo'q); `/bozor` va `/tender` ro'yxat (yuklanishi «Yuklanmoqda…», brauzerda o'qilganda bo'sh) | Qisman. «Hisob ochmasdan sinash» yo'q; har bosish «Hisob ochish» ga olib boradi. |
| 7 | Tashqi tomon vakili (texnadzor, buyurtmachi xodimi) | QR → `/t/:token` yoki obyekt-ulash havolasi `/ulash/:kod` | `/t/:token` — kirmasdan: hujjat turi, sana, imzolar holati, «asl/yangi tahriri bor» (summa yo'q) — **yaxshi**. `/ulash/:kod` — kirish talab; kirgach faqat boss/rahbar/admin ish joyi bo'lsa «Qabul qilish» | QR ko'rish — ha. Taklifni qabul qilish — **yo'q** (5-xulosa). |

**Boshi berk joylar (hammasi FAKT):** (B1) `qaytish` o'qilmaydi — 4-xulosa; (B2) `/ulash` kompaniyasiz — 5-xulosa; (B3) Kurs bo'sh — 6-xulosa; (B4) landing/ro'yxat matni va tost eskirgan; (B5) «Kompaniyangizni oching» sahifasidan boshqa joyga chiqish yo'li ko'rinmaydi: `/admin/kompaniya` o'zi menyuda rahbariyatga (`RAHBARIYAT`), rol bo'sh odamga menyu band emas — odam yagona ekranda qolib ketadi (TAXMIN: sidebarda nima ko'rinishi `navFiltr.sahifaKorinadi` bo'yicha `ruxsat:[]` sahifalar — Ish joylarim, Kurs, Mening xizmatlarim, Akkaunt, Sozlamalar, Mening imzom; kirgan holatda tekshirilmadi); (B6) «Bugun» ekranida kompaniyasiz odamga UMUMIY_PROFIL tugmalari (`tomonProfil.ts:30`): Ish joylarim, Obyektlar, Hujjatlar, Topshiriqlar, Akkaunt, Sozlamalar — Obyektlar/Hujjatlar ko'rinmaydi, Topshiriqlar kompaniyasiz bo'sh (`Topshiriqlar.tsx:35` `if (!joriyId) return`).

**Matnlar tahlili (jargon / uzunlik):**

| Joy | Muammo | Misol |
|---|---|---|
| Landing hero | «Smeta», «zanjir», «F2, nakopitelniy, F3» birinchi jumlada | `ic.lead`: «…fakt, F2, nakopitelniy, F3 va to'lov bir-biriga bog'lanadi» |
| Landing — 6 rol | Faqat idoraviy rollar | `productRoles` |
| Ro'yxat matni | «smeta import, F2» — haydovchi/sotuvchi uchun begona | `KirishSahifa.tsx:158` |
| «Bepul tarif: 300 token» | Token nimaligi tushuntirilmaydi, har sahifada | `KirishSahifa.tsx:171`, hero `ic.free` |
| Tost | Eskirgan va ikki yo'lli | «kompaniya oching (so'rov) yoki direktordan taklif oling» |
| Ish joylarim | «ish joyi» = kompaniya; odam «ish joyi»ni «men ishlaydigan joy» deb o'qiydi, lekin bu yerda 👤/🏢 | `IshJoylarim.tsx` |

## 2. Kompaniyasiz odam HOZIR nima qila oladi (b)

| Imkoniyat | Qayerda | Holat |
|---|---|---|
| Kompaniya ochish (nom+STIR, 1 qadam) | `KompaniyaOching` (`/admin/kompaniya`, `IshJoylarim` ichida ham) | Ishlaydi; prodda 1 marta ishlatilgan |
| Taklif kodi/havolasi bilan qo'shilish | `KompaniyaOching` ostida, `/taklif`, `/qoshil/:kod` | Ishlaydi |
| Mutaxassis profili, xizmat taklif qilish, yuborilgan takliflar | `/admin/mutaxassis` (`ruxsat:[]`) | Ishlaydi; prodda profil 1 ta (kompaniyasizlarda 0), taklif 0 |
| Yakka haydovchi profili va reyslar | `/admin/haydovchi`, `t2_yb_tashuvchi` | Ishlaydi; menyuda «Yana…» ichida; prodda 1 tashuvchi |
| Akkaunt markazi: kirish usullari, profil, imzo, xavfsizlik, tarif, desktop | `/admin/akkaunt` | Ishlaydi; «Kompaniyalar va rollar» bo'limi bo'sh |
| «Mening imzom» (kalit, QR) | `/admin/imzo`; prodda `t2_imzo` kompaniyasizlarda 0 | Ishlaydi |
| Ochiq: `/bozor`, `/tender`, `/yuk`, `/t/:token` | kirishsiz | Ko'rish — ha; amal — kirish talab, niyat yo'qoladi |
| Kurs | `/admin/kurs` | **Bo'sh** (rol yo'q) |
| Jarvis/Ctrl+K | shell | TAXMIN: kompaniyasiz kontekstda AI vositalari cheklangan; tekshirilmadi |
| Topshiriqlar | `/admin/topshiriqlar` | Bo'sh/ishlamaydi (`joriyId` kerak) |

**«Bo'sh ekran» holatlari:** `/admin/topshiriqlar` (kompaniyasiz), `/admin/kurs` (dars 0), «Ish joylarim» (ro'yxat bo'sh, faqat «Kompaniyangizni oching»), «Bugun» (tugmalarning yarmi ko'rinmaydi). Hech birida «siz nima qila olasiz» degan bitta jumla yo'q.

**Prod (faqat sonlar):** foydalanuvchi 14 faol; a'zoliksiz 8 (2 Google+email, 3 login-parol, 3 tarixiy/test); a'zoliksizlarning hammasida 0 amal. `t2_kirish_usul` yozuvlari jami 17; `t2_shaxs_yonalish` 0; `t2_mutaxassis_profil` 1; `t2_yb_tashuvchi` 1; `t2_kadr_mustaqil` 1; `t2_kompaniya_royxat` (so'rovlar) 0; taklif havolalari 1; `turi='shaxsiy'` kompaniya 1 (faol 1). Namuna juda kichik: xulosa — «oqim sinalmagan», statistik tendensiya emas.

## 3. MAQSAD: bitta savol va «Shaxsiy» kabinet (c)

### 3.1. Kirgandan keyingi BITTA savol — «Siz kimsiz / nima qilmoqchisiz?»

Ko'rsatiladi: a'zoligi yo'q foydalanuvchiga birinchi kirishda (va keyin «Shaxsiy» bosh sahifasida doim «Yana nima qilmoqchisiz?» havolasi). Javob `t2_shaxs_yonalish` ga yoziladi (yangi jadval kerak emas; `t2_yonalish` katalogida usta/haydovchi/… bor — to'liqligi TAXMIN, tekshirish kerak). Har tugma — BIR bosishda ishga, savol bo'lmasa ham kirish mumkin («Keyinroq»).

| # | Tugma (oddiy so'z) | Kim | Bir bosishda nima ochiladi | Kerakli mavjud narsa |
|---|---|---|---|---|
| 1 | **Men ishlayman — ish yoki buyurtma kerak** | usta, brigadir, mutaxassis | Qisqa profil (kasb, hudud, tajriba) → «Menga ish kelsin» yoqiladi; pastda «Kompaniyadan taklif kodim bor» | `Mutaxassis.tsx` (profil) + `/taklif` |
| 2 | **Mashinam bor — yuk tashiyman** | yakka haydovchi | `/admin/haydovchi` (telefon rejimi) | `HaydovchiSahifa`, `t2_yb_tashuvchi` |
| 3 | **Material/texnika/xizmat sotaman** | yakka sotuvchi | `/admin/bozor-kabinet` (e'lon berish) | `BozorKabinet`, `/bozor` |
| 4 | **Kompaniyam bor — tizimga ochaman** | rahbar | «Kompaniyangizni oching» (hozirgi ekran) | `KompaniyaOching` |
| 5 | **Menga havola/kod yuborishgan** | xodim, texnadzor, buyurtmachi xodimi | Havola yoki kod maydoni (bitta) → mos kabinetga | `/qoshil`, `/taklif`, `/ulash` |
| 6 | **Hozircha faqat ko'rmoqchiman** | qiziquvchi | Ochiq bozor/tender + qisqa «bu nima» + «Kurs» | `/bozor`, `/tender`, `Kurs` |

Qoidalar: 6 tadan ko'p emas; har tugma 1 jumla (jargonsiz), ostida 1 qator misol («masalan: pol yotqizaman, g'isht teraman»); javobni keyin o'zgartirish mumkin (Akkaunt → Profil); bir odam bir nechtasini tanlashi mumkin (usta + haydovchi) — bu `t2_shaxs_yonalish` ning ko'p qatorli tabiati bilan mos. Tashqi tomon (texnadzor) uchun alohida tugma qilinmaydi: ular #5 orqali keladi va tomon-agentlar kabinetiga o'tadi.

### 3.2. «Shaxsiy» kabinet tuzilishi (kompaniyasiz foydalanuvchi ko'zi)

Bitta bosh sahifa «Men» (hozirgi «Bugun»ning kompaniyasiz varianti), 6 blok; har blok mavjud sahifaga havola, takrorlanmaydi (3-qoida «Bir ish — bir joy»):

| Blok | Mazmun | Manba (mavjud) | Yangi kod kerakmi |
|---|---|---|---|
| 1. Profil va ko'nikmalar | Ism, kasb(lar), hudud, tajriba, ochiq/yopiq | `ProfilBolimi`, `Mutaxassis` | kichik: ikki sahifa birlashtiriladi |
| 2. Menga kelganlar | Taklif (kompaniyadan), topshiriq, buyurtma (yukdan) | `OdamTakliflari`, `Topshiriqlar`, `t2_topshiriqlar_v1(menga)`, `t2_buyurtmalar_v1(menga)` | topshiriq kompaniyasiz — `joriyId` talabi olinadi |
| 3. Ish qidirish / xizmat taklif qilish | Profil «ochiq», kompaniyaga taklif yuborish; sotuvchi uchun e'lon | `Mutaxassis`, `BozorKabinet` | «ish qidiruvchi» e'loni — TAXMIN: bozorga xizmat turi bor («Ish va xizmat») |
| 4. Yakka usta/haydovchi ekrani (telefon) | Bugungi ish/reys, katta tugmalar | `UstaBugun`, `HaydovchiSahifa` | yo'q |
| 5. Hujjatlarim | QR orqali ko'rganlarim, imzolarim, kalitlarim | `/admin/imzo`, `ImzoBolimi`, `/t/:token` tarixi | «ko'rganlarim» ro'yxati — TAXMIN: hozir saqlanmaydi |
| 6. Kurs (rolga mos) | Tanlangan yo'nalishga mos 3–5 dars | `Kurs`, `lib/kurs/yol.ts` | `darsMos` ga «shaxs yo'nalishi» (kompaniya roli o'rniga) |

Pastda har doim ikki tugma: **«Kompaniya ochish»** va **«Kompaniyaga qo'shilish (kod/havola)»**.

### 3.3. Kompaniyaga qo'shilgach shaxsiy kabinet qanday qoladi

Tamoyil: **odam = bitta hisob; kabinetlar = munosabatlardan** (UMUMIY model 1–2). Shaxsiy blok yo'qolmaydi:
- Kabinet almashtirgichda «Men» doim birinchi qator (kompaniya qatorlari ostida). Kompaniya yoki rol qo'shilsa, yangi kabinet qatori paydo bo'ladi; «Men» o'chmaydi.
- Odam bir vaqtda xodim (kompaniyada `usta`) va yakka usta bo'la oladi: kompaniya naryadi — kompaniya kabinetida; o'zining yakka buyurtmasi/yuki — «Men»da. Pul, hujjat, imzo kompaniyaga aralashmaydi: imzo (`t2_imzo`) hozir ham foydalanuvchiga bog'liq, kompaniyaga emas — to'g'ri.
- `turi='shaxsiy'` kompaniya (1 kishilik) — hozirgi «Tools beta, yakka smetachi» oqimi; u kompaniyasiz «Men» dan FARQ qiladi va qoladi (egasi ADR qarori: Tools beta). Savol egasiga (S2).
- Kompaniyadan chiqilsa (a'zolik tugasa) odam yana faqat «Men» bilan qoladi — bo'sh ekran emas.

## 4. Ishonch va xavfsizlik (d)

| Mavzu | Hozirgi holat | Taklif |
|---|---|---|
| Kompaniyasiz foydalanuvchi nimani KO'RMASLIGI kerak | Server `t2_effective_authorization_v1` a'zoliksizga rad etadi; `RuxsatGuard` faqat kompaniya-scoped sahifalarni qo'riqlaydi — scope'siz sahifalar (`mutaxassis`, `kurs`, `akkaunt`, `haydovchi`, `imzo`, `ish-joylarim`) qo'riqchidan o'tadi, ma'lumotni API o'zi cheklaydi | Hech qanday kompaniya ma'lumoti, narx, summa, obyekt; boshqa foydalanuvchi telefoni/emaili; `/t/:token` da summa va mazmun ko'rsatilmaydi (hozir shunday — saqlansin) |
| Spam / soxta profil | Ro'yxatga IP bo'yicha 5/24 soat limit (`t2_ozi_royxat_log`); email kodi 5 urinish; telefon Telegram orqali tasdiqlanadi (`telefon_manba`) | Ochiq profil faqat tasdiqlangan telefon/email bilan; «tasdiqlangan» belgisi (`t2_shaxs_yonalish.tasdiqlangan` ustuni bor) faqat kompaniya baholagach; ochiq profilda to'liq telefon yo'q — «bog'lanish so'rovi» orqali; kompaniya taklifi kuniga limit; shikoyat (`t2_bz_shikoyat` bor) |
| Shaxsiy ma'lumot | Mutaxassis kartasida statistika «ko'rsat» tanlovi bor (`statistika_korsat`); profil `ochiq` bayrog'i | Sukut: profil YOPIQ, odam o'zi ochadi; ko'rinadigan maydonlar ro'yxati profil ustida ko'rsatiladi; `qaytish` bilan kelgan niyat (masalan haydovchi) profilni avtomatik ochmaydi |
| Kompaniya ochish suiiste'moli | 1 kishi = 1 tasdiqsiz kompaniya (`OZI_OCHILGAN`); STIR band bo'lsa rad | Soxta kompaniya nomi bilan tomon-taklif jo'natish: «tasdiqsiz» kompaniya tomonlarga «tasdiqlanmagan» belgisi bilan ko'rinsin (TAXMIN: hozirgi ko'rinishi tekshirilmadi — tomon-agentlar bilan kelishiladi) |

## 5. Bog'lanishlar (e)

| Shaxsiy kabinet ↔ | Qanday bog'lanadi | Hozir | Kerak |
|---|---|---|---|
| Pudratchi | Taklif (kompaniya odamni a'zo qiladi), naryad (`t2_naryad.usta_foydalanuvchi_id`) | Taklif ishlaydi; naryad usta foydalanuvchiga bog'liq | Yakka usta kompaniyaga a'zosiz ham naryad qabul qila olsin (subpudrat-aloqa orqali, a'zolik emas) — pudratchi/subpudrat agentlari bilan S5 |
| Logistika | Yakka haydovchi = `t2_yb_tashuvchi`, «taksi» modeli | Profil kompaniyasiz | Haydovchi yo'nalishi tanlanganda `/admin/haydovchi` asosiy ekran; `qaytish` tuzatiladi |
| Bozor | Yakka sotuvchi `t2_bz_profil` | Menyu faqat rahbariyat/ichki rollarga | «Men» dan e'lon berish ochiq bo'lsin |
| Tomonlar | Taklif bilan texnadzor/buyurtmachi xodimi | `/ulash` kompaniya talab qiladi (B2) | Kabinet «Texnik nazorat»/«Buyurtmachi» a'zolik/aloqa orqali hosil bo'lsin, soxta shaxsiy kompaniya shart emas — tomon agentlari bilan S6 |
| Imzo/QR | `/t/:token` ochiq, kirgan odamga kengroq | Yaxshi | «Men» da «Ko'rganlarim» |

## 6. Telefon holati (f)

| Sahifa | Telefon qulayligi (kod bo'yicha) |
|---|---|
| `HaydovchiSahifa` | Yaxshi: telefon-birinchi, `min-h-[52px]` (11 ta katta tugma) |
| `UstaBugun` | Yaxshi: ≤375px, oflayn navbat, katta +/− |
| `Topshiriqlar` | Yaxshi: `min-h-12` (5) |
| `BozorOchiq`, `TenderOchiq`, `YukOchiq`, `ImzoTekshiruv` | Yaxshi: `min-h-[48-56px]` ochiq sahifalar |
| `PublicEntry` (landing) | Ko'p animatsiya, uzun; mobil sticky «Boshlash» bor (`MobileCta`) — yaxshi; blok soni ko'p |
| `KirishSahifa` | Plitkalar `auto-fit minmax(120px)` — normal; Google tugmasi + email — qisqa emas |
| `IshJoylarim`, `Mutaxassis`, `KursSahifa` | Tor ekran qoidasi yo'q (`sm:` 1 marta, katta tugma yo'q) |
| `AkkauntMarkazi` | Bo'lim navigatsiyasi mobilda gorizontal — yaxshi |
| `KompaniyaPage` | 19 ta jadval/min-w elementi — telefonda noqulay (TAXMIN: brauzer sinovi yo'q) |

Telefon qoidasi «Men» uchun: bitta ustun, tugma ≥48px, jadval yo'q, har ekranda BITTA asosiy tugma; oflayn — mavjud IndexedDB navbati (`lib/usta/navbat`).

## 7. QURISH REJASI — 6 ta kichik PR (g)

| PR | Mazmun | Hajm | Bog'liqlik |
|---|---|---|---|
| **P1. Niyatni saqlash** | `KirishSahifa`/`navigate` `location.state.qaytish` (va `sessionStorage`) ni o'qisin; kirgach `qaytish`ga borsin (taklif/ulash kodi ustuvorligi saqlanadi) | kichik, test bilan | yo'q — eng birinchi, eng katta foyda |
| **P2. «Siz kimsiz?» ekrani** | Yangi hisob uchun `/admin/kompaniya` o'rniga 6 tugmali ekran; javob `t2_shaxs_yonalish` ga (mavjud RPC `t2_shaxs_yonalish_saqla_v1`); «Keyinroq» | o'rta | P1; migratsiya YO'Q (jadval bor) — `t2_yonalish` katalogiga usta/haydovchi/sotuvchi bor-yo'qligi tekshirilsin |
| **P3. «Men» bosh sahifasi va menyu** | A'zoliksiz uchun `Bugun` o'rniga «Men» (6 blok havolalari); haydovchi/bozor-kabinet/topshiriq kompaniyasiz ko'rinsin va ishlasin; «Yana…» ichidagi haydovchi chiqarilsin | o'rta | P2; menyu-v2 agenti bilan kelishuv |
| **P4. Tomon taklifi kompaniyasiz** | `/ulash` va tomon-aloqa: boss ish joyi shart emas; «Qabul qilish» shaxsiy hisobga (`t2_tomon_aloqa`) | server + front | tomon-buyurtmachi/subpudrat agentlari; migratsiya kelishiladi |
| **P5. Kurs kompaniyasiz** | `darsMos` ga `yonalish` (shaxs yo'nalishi) qo'shish; 3–5 dars: tizim nima, profil, taklif qabul qilish, telefondan ish | kichik–o'rta | P2 |
| **P6. Matnlar va landing** | Quyidagi matnlar + landingga «Men ustaman / haydovchiman / sotaman» qatori va ochiq bozor/yuk havolalari | kichik, matn | mustaqil |

**Qayta yoziladigan matnlar:**

| Joy | Hozir | Yangi (o'zbekcha, oddiy) |
|---|---|---|
| Landing hero | «Smetadan to'lovgacha — bitta tirik zanjir» (asosiy) | «Qurilishda ish, material va yuk — bir joyda» ostida «Smeta va hujjatlar ham shu yerda» (egasi qarori S1) |
| Landing ro'llar | 6 idoraviy rol | + «Usta», «Haydovchi», «Sotuvchi», «Texnadzor» kartalari |
| Ro'yxat matni | «…smeta import, F2 va hujjatlarni sinab ko'ring» | «1 daqiqada hisob oching — emailingizga kod keladi. Parol shart emas.» |
| «300 token» | hamma joyda | faqat kompaniya ochilgandan keyin Akkaunt ichida; landingda «Bepul boshlang» |
| Kirish tosti (3 joy) | «kompaniya oching (so'rov) yoki direktordan taklif oling» | tost olib tashlansin — o'rniga «Siz kimsiz?» ekrani |
| `boshSahifa.ts` izohi | «so'rov, superadmin tasdiqlaydi» | `t2_kompaniya_ozi_och_v1` bilan yangilansin |
| «Kompaniyangizni oching» | yagona ekran | #4 tugma ostidagi qadam; qo'shimcha «Menga havola yuborishgan» |
| `Mutaxassis` | rollar pto/prorab/bugalter/kuzatuvchi | + usta, brigadir, haydovchi (yo'nalish katalogidan) |
| Bo'sh holatlar | «Hozircha sizga ochiq sahifa yo'q» | «Siz hozir yakka foydalanuvchisiz. Quyidagilardan birini tanlang» + 3 tugma |

## 8. Egasiga savollar (≤7)

| # | Savol | Variantlar |
|---|---|---|
| S1 | Landingning asosiy va'dasi nima bo'lsin? | (a) kompaniya uchun smeta-zanjir (hozirgi); (b) «qurilish ishi uchun bitta joy» + 4 turdagi foydalanuvchi; (c) ikkita landing: `/` va `/men` |
| S2 | «Shaxsiy» = kompaniyasiz «Men» kabineti bo'lsa, hozirgi `turi='shaxsiy'` bir kishilik kompaniya (Tools beta) qolsinmi? | (a) qoladi, «Smeta bilan ishlayman» tugmasi ostida; (b) «Men»ga birlashtiriladi |
| S3 | Yakka haydovchi/usta/sotuvchi kompaniyasiz pul/to'lov bilan ishlay oladimi? | (a) ha, faqat o'z buyurtmalari; (b) faqat ko'rish + qabul, pul kompaniya orqali |
| S4 | Tashqi tomon (texnadzor, buyurtmachi xodimi) taklif bilan kirsa, kompaniya ochishi shartmi? | (a) yo'q — aloqa orqali kabinet; (b) ha (hozirgi) |
| S5 | Yakka usta kompaniyaga a'zo bo'lmasdan naryad qabul qila oladimi (subpudrat-aloqa)? | (a) ha; (b) faqat a'zo bo'lgach |
| S6 | Ochiq profil sukuti nima? | (a) yopiq (taklif); (b) ochiq, telefon yashirin |
| S7 | Landing va tizimda «token» tushunchasi yangi foydalanuvchiga qachon ko'rsatilsin? | (a) darhol (hozirgi); (b) kompaniya ochilgandan keyin |

## 9. Nima tekshirilmadi

- Kirgan holatdagi ekranlar (egasi brauzerda kirgan edi — landing «Boshqaruv paneliga o'tish» ko'rsatdi, shuning uchun kirgan sahifalar ochilmadi; sidebar/«Bugun» a'zoliksiz foydalanuvchi uchun KOD bo'yicha tahlil qilindi, TAXMIN).
- Kirmagan landing holati («Hisob ochish» tugmasi, formalar) faqat kod bo'yicha; ochiq `/bozor`, `/tender` ro'yxatlari brauzerda «Yuklanmoqda…» da o'qildi (ma'lumot kelmadi — ehtimol bo'sh yoki kech yuklandi).
- Telefon holati kod bo'yicha (min-height/min-width hisobi), real qurilma/emulyatsiya sinovi yo'q.
- `t2_yonalish` katalog qiymatlari, `t2_shaxs_yonalish_saqla_v1` imzosi va tomon-aloqa RPClari ichi o'qilmadi (P2/P4 oldidan).
- Jarvis/Ctrl+K kompaniyasiz holati.
