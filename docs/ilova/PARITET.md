# Ilova paritet matritsasi: sayt vs Windows vs Android

Sana: 2026-11-19. Manba: `frontend/src/lib/reestr/sahifa.ts` (81 sahifa), `android-native/*` (Kotlin, 194 fayl, 30 541 qator, testsiz), Windows = `android-native/desktop` (Compose Desktop), Android = `android-native/app` + `shared` + `ui-common`.
Belgilar: ✅ asosiy oqim (ko'rish + yozish) bor; 🟡 qisman (asosan faqat o'qish yoki toraytirilgan); ❌ yo'q.
Baho kod o'qish bilan qo'yilgan (qaysi ekran/marshrut ulangan), qo'lda ishga tushirib sinalmagan. Windows'da 13 modul (`Mod` enum, Shell.kt) bor, Android'da ~28 modul (`ModuleCatalog`), ularning 9 tasi (narx, moliya, buxgalteriya, АОСР, tender, logistika, HR, sotuv, kompaniya) bitta umumiy «server qatorlarini kartalar qilib ko'rsatish» ekrani (`ModuleScreen` + `ModuleFeed.kt`), yozish yo'q.

## 1. Jami

| | ✅ to'liq | 🟡 qisman | ❌ yo'q |
|---|---|---|---|
| Windows | 1 | 21 | 59 |
| Android | 4 | 37 | 40 |

81 sahifadan ikkala ilovada ham umuman yo'q: 40 ta (49 %). Windows'da bor, Android'da yo'q: 0 ta (Windows Android'ning to'plami ichida). Androidda to'liq ✅: fakt, foto, zayavka, Disk. Windows'da to'liq ✅: faqat Disk (umumiy `ui-common` kodi).

Qo'shimcha: ikkala ilovada ham Jarvis (AI chat, yozish-oldindan ko'rish kartasi) bor, lekin u sayt reestrida alohida sahifa emas, shuning uchun jadvalga kirmagan.

## 2. Sahifa bo'yicha matritsa

| № | kalit | sayt nomi | ish joyi | sayt holati | Windows | Android | Yetishmayotgan amallar / izoh |
|---|---|---|---|---|---|---|---|| 1 | `pult` | Direktor pulti | bugun | tayyor | 🟡 | 🟡 | Win: Bugun (81 qator, ro'yxat); And: Rahbar paneli. Direktor pulti kartalari/grafiklari yo'q |
| 2 | `dashboard` | Rahbar paneli | bugun | tayyor | ❌ | 🟡 | And: RahbarScreen (rahbar_panel_v1, SumPack ko'rsatadi). Win: yo'q |
| 3 | `obyektlar` | Obyektlar | obyekt | tayyor | 🟡 | 🟡 | Ikkalasida ro'yxat + Loyiha>Shartnoma>Obyekt daraxti (#685); yaratish/tahrir/arxiv yo'q. And: ObjectCard (3 summa paketi) |
| 4 | `loyiha` | Loyihalar | obyekt | tayyor | 🟡 | 🟡 | Faqat daraxt ichida ko'rinadi; loyiha yaratish/tahrir yo'q |
| 5 | `participants` | Loyiha ishtirokchilari | tomonlar | tayyor | ❌ | 🟡 | And: PeopleScreens/Invite (taklif); Win yo'q |
| 6 | `mindmap` | Mindmap (xarita) | obyekt | beta | ❌ | ❌ | Karta/kanvas (egasi talabi «pult») ikkala ilovada yo'q |
| 7 | `grafik` | Ish grafigi va pul oqimi | obyekt | beta | ❌ | ❌ | Ish grafigi/pul oqimi yo'q |
| 8 | `smeta-studio` | Smeta studiyasi | obyekt | tayyor | 🟡 | 🟡 | Faqat o'qish: daraxt + qator tafsiloti. Yo'q: LRV import (SmetaYuklaNative 2630 qator), tahrir, qator qo'shish/o'chirish, versiya farqi, studiya bosqichlari |
| 9 | `holat` | Smeta va Fakt / LRV | obyekt | tayyor | 🟡 | 🟡 | Daraxt summalari (smeta/fakt/F2) bor; HolatNative (LRV solishtirma) yo'q |
| 10 | `loyiha-smeta` | Loyiha ↔ Smeta ↔ Fakt | obyekt | beta | ❌ | ❌ | Yo'q |
| 11 | `smeta-narxlash` | Smetani narxlash (RES) | obyekt | tayyor | ❌ | 🟡 | And: ResursScreen (resurs vedomosti, o'qish). Narxlash (stavka+manbali narx, RES) yo'q ikkalasida |
| 12 | `narx-dalil` | Narx dalili (Обоснование цен) | obyekt | tayyor | ❌ | ❌ | Yo'q |
| 13 | `narx-tekshiruv` | Narx tekshiruvi (usta narxi) | obyekt | beta | ❌ | ❌ | Yo'q |
| 14 | `nakrutka` | Nakrutka (ustama) | obyekt | tayyor | ❌ | ❌ | Yo'q; ilova nakrutkani serverdan oladi, tahrir yo'q |
| 15 | `narxlar` | Narxlar nazorati | obyekt | tayyor | 🟡 | 🟡 | Win: NarxScreen (o'qish); And: umumiy ModuleScreen kartalari (narx). Tahrir/tasdiq yo'q |
| 16 | `narx-manbalari` | Narx manbalari (katalog, faktura, КП) | obyekt | tayyor | 🟡 | 🟡 | Katalog/faktura/KP yuklash, manba biriktirish yo'q |
| 17 | `oferta` | Tender oferta | obyekt | beta | ❌ | ❌ | Yo'q |
| 18 | `fakt` | Fakt kiritish | obyekt | tayyor | 🟡 | ✅ | Win: faktni /api/sb-yoz bilan yozadi (oflayn navbat, foto-dalil, qoralama sinxroni yo'q). And: qoralama + Outbox oflayn + foto navbati; yo'q: bajarilmadi, zamena/qo'shimcha oqimi saytdagidek |
| 19 | `naryad` | Naryad (brigada topshirig‘i) | obyekt | beta | ❌ | 🟡 | And: NaryadScreen (yaratish/yopish + foto). Win yo'q |
| 20 | `foto` | Foto-dalil | obyekt | tayyor | ❌ | ✅ | And: PhotoScreen (kamera, siqish, oflayn navbat). Win yo'q |
| 21 | `m29` | M-29 (material sarfi) | obyekt | tayyor | ❌ | 🟡 | And: M29Screen (sarf yozish, outbox). Win yo'q |
| 22 | `f2-tayyorlash` | F2 tayyorlash | obyekt | tayyor | 🟡 | 🟡 | Win (2026-11-19, windows-native-paritet-1): qoralama qatorlari to'r (grid) ichida tahrir (hajm/narx, minus mumkin), Del = olib tashlash, Ctrl+S = serverdan oldindan ko'rish (qator eski→yangi + QQS bilan/ustamali/ustamasiz jami) va faqat «Tasdiqlayman» yozadi (/api/f2-buyruq, saytdagi yo'l); texnadzor takliflari Qabul/Rad/Keyinroq (qurilma BFF ro'yxatida /api/tekshiruv yo'q: serverga qo'shilguncha yashirin). Yo'q: yangi qoralama yaratish, hajm manbai/storno/pereraschet bloklari, resurs chiqarish |
| 23 | `f2` | F2 import (tayyor F2 faylidan) | obyekt | tayyor | ❌ | ❌ | F2 import (F2ImportV3 1963 qator, shifrsiz qator, subpudrat yoyilma) yo'q ikkalasida |
| 24 | `f2-tarix` | F2 tarixi va tasdiqlash | obyekt | tayyor | 🟡 | 🟡 | Ro'yxat + holat; tasdiqlash/bekor/qayta ochish tugmalari Win'da qisman (Approve.kt), And: ApprovalScreens |
| 25 | `f2-reestr` | F2 reestri | obyekt | tayyor | 🟡 | 🟡 | And: F2RegistryScreen; Win: F2 ichida |
| 26 | `nakopitelniy` | Nakopitelniy va F3 | obyekt | tayyor | 🟡 | 🟡 | Faqat ko'rish; slichitelniy/nakopitelniy hujjat tuzatishi, F3 yo'q |
| 27 | `solishtiruv` | Solishtiruv (qayerda farq bor) | moliya | beta | ❌ | ❌ | Yo'q |
| 28 | `moliya` | Moliya (to‘lov, xarajat) | moliya | tayyor | 🟡 | 🟡 | Win: MoneyScreen; And: ModuleScreen (kartalar). To'lov/xarajat kiritish yo'q |
| 29 | `shartnoma-liniya` | Shartnomalar va tomonlar | moliya | tayyor | ❌ | 🟡 | And: Contract.kt (obyekt kartasida shartnoma); alohida sahifa yo'q |
| 30 | `qarzdorlik` | Qarzdorlik (postavshik, subpudrat) | moliya | beta | ❌ | 🟡 | And: QarzdorScreen (o'qish); Win yo'q |
| 31 | `buxgalteriya` | Buxgalteriya (provodka, hisob-kitob) | moliya | beta | ❌ | 🟡 | And: ModuleScreen kartalari; provodka/jurnal kiritish yo'q |
| 32 | `kontragentlar` | Kontragentlar | tomonlar | tayyor | ❌ | ❌ | Yo'q |
| 33 | `yetkazuvchi` | Yetkazuvchi: bugun | tomonlar | tayyor | ❌ | ❌ | Yo'q |
| 34 | `subpudratchi` | Subpudratchi: bugun | tomonlar | tayyor | ❌ | ❌ | Yo'q |
| 35 | `subpudrat` | Subpudrat boshqaruvi | tomonlar | tayyor | ❌ | ❌ | Yo'q |
| 36 | `documents` | Disk | hujjatlar | tayyor | ✅ | ✅ | Disk 4 tab: yuklash, papka, nom, ko'chirish, savat, versiyalar (umumiy ui-common kodi). Yo'q: ulashish/ruxsat, fayl-bog'lash |
| 37 | `hujjat-nazorat` | Hujjat nazorati | hujjatlar | tayyor | ❌ | ❌ | Yo'q |
| 38 | `aosr` | Yashirin ishlar akti (АОСР) | hujjatlar | tayyor | ❌ | 🟡 | And: ModuleScreen kartalari; АОСР generatsiyasi yo'q |
| 39 | `nazorat` | Texnik nazorat | hujjatlar | beta | ❌ | 🟡 | And: NazoratScreen (qaror); Win yo'q |
| 40 | `nazorat/tekshiruv` | Yangi tekshiruv (sayt) | hujjatlar | beta | ❌ | 🟡 | And: NazoratScreen ichida |
| 41 | `nazorat/jurnal` | Tekshiruvlar jurnali | hujjatlar | beta | ❌ | 🟡 | And: NazoratScreen ichida |
| 42 | `zakazchik` | Buyurtmachi kabineti | tomonlar | beta | ❌ | ❌ | Yo'q |
| 43 | `taqdimlar` | Tomonlar hujjatlari | tomonlar | beta | ❌ | ❌ | Yo'q |
| 44 | `murojaatlar` | Murojaatlar (remark, so‘rov) | tomonlar | beta | ❌ | ❌ | Yo'q |
| 45 | `chizmalar` | Chizmalar va revizyalar | hujjatlar | beta | ❌ | ❌ | Yo'q |
| 46 | `loyihachi` | Loyihachi: bugun | bugun | beta | ❌ | ❌ | Yo'q |
| 47 | `laboratoriya` | Laboratoriya (sinov so‘rovlari) | tomonlar | beta | ❌ | ❌ | Yo'q |
| 48 | `hujjat-aylanish` | Hujjat aylanishi (kiruvchi, xat, tasdiq) | hujjatlar | beta | 🟡 | 🟡 | Win: DocsScreen; And: HujjatScreen + Approval zanjiri. Yangi xat/zanjir yaratish qisman |
| 49 | `logistika` | Ta‘minot va sklad | taminot | tayyor | 🟡 | 🟡 | Win: Ombor.kt (qoldiq + buyruq); And: Warehouse native (skaner, outbox, hisobot). Sklad yetkazib berish/yuk chaqirish yo'q |
| 50 | `zayavka` | Zayavkalar | taminot | beta | ❌ | ✅ | And: Zayavka ro'yxat + yaratish + outbox. Win yo'q |
| 51 | `tender` | Tender / xarid | taminot | beta | ❌ | 🟡 | And: ModuleScreen kartalari |
| 52 | `yuk-birjasi` | Yuk birjasi | taminot | beta | ❌ | ❌ | Yo'q |
| 53 | `bozor-sorov` | Bozordan narx so‘rash | taminot | beta | ❌ | ❌ | Yo'q |
| 54 | `bozor-kabinet` | Bozor kabineti (sotuvchi) | taminot | beta | ❌ | ❌ | Yo'q |
| 55 | `bozor-moderatsiya` | Bozor moderatsiyasi | taminot | beta | ❌ | ❌ | Yo'q |
| 56 | `tender-ochiq` | Ochiq tender (lot, taqqos, bayonnoma) | taminot | beta | ❌ | ❌ | Yo'q |
| 57 | `yuk-chaqirish` | Yuk chaqirish | taminot | beta | ❌ | ❌ | Yo'q |
| 58 | `haydovchi` | Haydovchi rejimi | bugun | beta | ❌ | ❌ | Yo'q |
| 59 | `erp` | Kadrlar va texnika | taminot | beta | ❌ | 🟡 | And: ModuleScreen (hr feed) |
| 60 | `hr` | Kadrlar, KPI va ish haqi | taminot | beta | ❌ | 🟡 | And: ModuleScreen (hr feed); KPI/oylik hisoblash yo'q |
| 61 | `sotuv` | Uy sotish | sotuv | tayyor | ❌ | 🟡 | And: ModuleScreen kartalari; Uy sotish oqimi yo'q |
| 62 | `kompaniya` | Kompaniya, a‘zolar va modullar | kompaniya | tayyor | ❌ | 🟡 | And: ModuleScreen + a'zo taklifi; modul yoqish/o'chirish, rol tahriri yo'q |
| 63 | `system-control` | Integratsiyalar va audit | platforma | texnik | ❌ | ❌ | Texnik sahifa |
| 64 | `tizim-sozlama` | Sozlamalar | kompaniya | tayyor | 🟡 | 🟡 | Profil/til/mavzu/qulf; kompaniya sozlamalari yo'q |
| 65 | `hujjat-dizayn` | Hujjatlar dizayni | kompaniya | tayyor | ❌ | ❌ | Hujjat dizayni sozlamasi yo'q |
| 66 | `tokenlar` | Tokenlar va obuna | kompaniya | tayyor | ❌ | ❌ | Token/obuna yo'q |
| 67 | `ai-agentlar` | AI ishchilar | kompaniya | tayyor | ❌ | ❌ | Yo'q (Jarvis chat bor, lekin ish agentlari boshqaruvi yo'q) |
| 68 | `korzinka` | Korzinka | kompaniya | tayyor | 🟡 | 🟡 | Disk savati ichida |
| 69 | `ish-joylarim` | Ish joylarim | bugun | tayyor | 🟡 | 🟡 | Win: Ish joyi tanlagich; And: WorkplaceSheet |
| 70 | `kurs` | Kurs (o‘rganish) | bugun | tayyor | ❌ | ❌ | Yo'q |
| 71 | `topshiriqlar` | Mening topshiriqlarim | bugun | beta | ❌ | ❌ | Yo'q |
| 72 | `mutaxassis` | Mening xizmatlarim | bugun | tayyor | ❌ | ❌ | Yo'q |
| 73 | `osuvchi` | Tizim o‘rganishi | kompaniya | beta | ❌ | ❌ | Yo'q |
| 74 | `akkaunt` | Akkaunt markazi | kompaniya | tayyor | 🟡 | 🟡 | Profil + parol/qulf; sessiyalar/qurilmalar yo'q |
| 75 | `imzo` | Mening imzom | hujjatlar | beta | ❌ | ❌ | Yo'q (Qulf PIN bor, imzo emas) |
| 76 | `sozlamalar` | Sozlamalar markazi | kompaniya | tayyor | 🟡 | 🟡 | Sozlamalar markazi qisman |
| 77 | `bugun` | Bugun | bugun | tayyor | 🟡 | 🟡 | Win: Today 81 qator; And: Home+Today+Bildirishnoma |
| 78 | `ruxsatlar-jadvali` | Ruxsatlar jadvali | kompaniya | tayyor | ❌ | ❌ | Yo'q |
| 79 | `boshqaruv` | Platforma boshqaruvi | platforma | texnik | ❌ | ❌ | Texnik |
| 80 | `tizim-xaritasi` | Tizim xaritasi | platforma | texnik | ❌ | ❌ | Texnik |
| 81 | `fayl-boglash` | Fayl bog‘lash (texnik) | platforma | texnik | ❌ | ❌ | Texnik |


## 3. Eng muhim yozish oqimlari, ilovada yo'q

Sayt (fakt: `FaktJurnal.tsx` 1263 qator; F2: `F2V3Workbench.tsx` 2070, `F2ImportV3.tsx` 1963, `F2TayyorlashNative.tsx` 1361; LRV import: `SmetaYuklaNative.tsx` 2630; `NakopitelniyVedomost.tsx` 823) kunlik pul ishlatadigan oqimlari:

1. LRV/smeta import va tahrir (smeta-studio): ikkala ilovada faqat daraxtni o'qish.
2. F2 import (tayyor F2 fayldan) va F2 qoralamani qatorma-qator tahrirlash/moslash (zamena, qo'shimcha, norma): yo'q. Windows F2 ekrani aktlar ro'yxati + hujjat generatsiyasi, xolos.
3. Narxlash: stavka + manbali narx, RES, narx dalili, nakrutka tahriri: yo'q. Ilova nakrutka/ustamani serverdan tayyor oladi.
4. Slichitelniy / nakopitelniy / F3 tuzatish va solishtiruv (qayerda farq bor): yo'q.
5. Moliya yozuvlari (to'lov, xarajat, provodka), kontragent, shartnoma tahriri: yo'q (faqat kartalar).
6. Tender/bozor/yuk birjasi/haydovchi/yuk chaqirish, uy sotish, HR/KPI/oylik: Android'da faqat kartalar, Windows'da yo'q.
7. Hujjat dizayni, tokenlar va obuna, AI ishchilar, kurs, imzo, ruxsatlar jadvali, mindmap, ish grafigi: yo'q.
8. Windows'da fakt: foto-dalil, oflayn navbat, naryad, M-29, bajarilmadi yo'q. Android'da bor.

## 4. Ma'lumot va mantiq farqlari (ilova mantiqni o'zi qayta yozgan joylar)

Yaxshi xabar: pul arifmetikasini ilovalar hisoblamaydi. Hamma summa serverning bitta yadrosidan olinadi va faqat ko'rsatiladi (`Money.kt`, `AktSumma.kt`, `NodeSums.kt`: `rahbar_panel_v1`, `akt_summa_paket_v1`, `/api/obyekt-tugun-summa`; ular `_t2_summa_paket_v1` ga olib boradi, sayt va MCP bilan bir xil). Yo'qolgan summa `null` (nol emas). Ustama, QQS, yaxlitlash ilovada hisoblanmaydi. Shuning uchun qamrab olingan ekranlarda raqamlar saytdagidek chiqadi.

Lekin quyidagilar ikki joyda qo'lda takrorlangan (drift xavfi):

| Qayerda | Nima | Saytdagi manba | Xavf |
|---|---|---|---|
| `shared/.../F2Registry.kt`, `F2List.kt` (`F2Status`, `statusUz`) | F2 hayot sikli holatlari (draft, submitted, checked, approved, rejected, cancelled, superseded) va ularning o'zbekcha matni | sayt F2 lifecycle + i18n | yangi holat qo'shilsa ilova «UNKNOWN» ko'rsatadi |
| `F2List.kt` `hasDiff` | farq `abs(farq) > 1.0` mijoz tomonida tanlangan chegara | serverdagi `t2_qator_muhr_farq` mantig'i | yaxlitlash qoidasi saytdan farq qilishi mumkin |
| `app/.../Modules.kt` `ModuleCatalog.anyOf` | har modul uchun ruxsat ro'yxati qo'lda ko'chirilgan | `sahifa.ts` `ruxsat` | yangi ruxsat qo'shilsa ilovada menyu noto'g'ri |
| `ui-common/.../Nav.kt` `QNav` | 7 ish joyi, ~20 band qo'lda yozilgan | reestrdan hosil bo'ladigan menyu (81 sahifa) | har yangi sahifa qo'lda qo'shilishi kerak; hozir 40 sahifa umuman yo'q |
| `shared/.../Format.kt`, `I18n.kt`, Android `strings.xml` | pul/sana formati va tarjimalar alohida | sayt `i18n/til` | uch xil matn manbai |
| `shared/.../FaktContract.kt`, `FaktQabul.kt` | fakt yozish yuklamasi (`/api/sb-yoz`) mijozda yig'iladi | sayt fakt yozish yo'li (`t2_fakt_yoz_v2`) | server shartnomasi o'zgarsa ilova jim sinadi; shartnoma testlari bor |
| `app/.../core/demo/Demo.kt` | demo ma'lumotda `ustamali = plain*1.17`, `qqs = *1.12` | hisoblash yadrosi | faqat demo; prodda ishlatilmaydi |
| F2 aktlar ro'yxati | summa qasddan ko'rsatilmaydi (QQS bilan/ustamali qoidasi) | sayt F2 reestri ko'rsatadi | ilova reestrida summa ustuni yo'q |

Qamrov: ilova 32 ta `/api/*` yo'lni chaqiradi va 8 ta nomli RPC (`soro`), sayt esa 77 ta `/api/*` yo'l va 53 ta `soro` ishlatadi (219 ta funksiya fayli `functions/api`). Ya'ni server API'ning ~40 % i ilovaga ochilgan.

## 5. Hajm (qayta yozish ishi uchun asos)

| | qator (testsiz) | fayl |
|---|---|---|
| Sayt `frontend/src` | 205 908 | 1 605 |
| shundan `admin/sahifalar` (to'liq sahifalar) | 35 654 | 133 |
| Kotlin hammasi (Android+Windows+umumiy) | 30 541 | 194 |
| shundan Windows | 2 702 | 21 |
| shundan Android `app` | 20 167 | 158 |

Android + Windows birga sayt kodining ~15 % i hajmida; sahifalarning 41 tasi (51 %) kamida bitta ilovada qisman bor, Windows'da 22 tasi (27 %), Android'da 41 tasi (51 %). Windows kodi sayt kodining 1,3 % i.

## Windows: hisob va yangi qurilish bloklari (2026-11-19)

Windows soni o'zgarmadi (1 ✅ / 21 🟡 / 59 ❌): F2 tayyorlash 🟡 bo'lib qoldi (qoralama tahriri bor, yaratish va storno bloklari yo'q). Umumiy bloklar (desktop/DataGrid.kt, Blocks.kt, mantiq ui-common/GridModel.kt): 10 000+ qatorli virtual to'r, ustun o'lchami/yashirish/muzlatish, ko'p ustunli saralash, filtr, ko'p tanlash, klaviatura, Ctrl+C = Excelga TSV, CSV eksport, kontekst menyu, master-detail, buyruq paneli, «oldindan ko'rish → Tasdiqlash» kartasi. Keyingi sahifalar shu bloklar ustiga quriladi.
