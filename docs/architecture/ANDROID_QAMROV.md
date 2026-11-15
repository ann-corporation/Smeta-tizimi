# Android ilova qamrovi (parity) — 100% kirish + native reja

Egasi (2026-11-16): «ilova tizimning ~80 % qismidan mahrum». Bugundan boshlab ilova tizimning **hamma sahifasiga** kira oladi;
native ekranlar bor joyda native, qolganida ilova ichidagi xavfsiz veb konteyner. Keyingi bosqich — eng ko'p ishlatiladigan modullarni native qilish.

## 1. Arxitektura (bitta manba)

| Qatlam | Nima | Fayl |
|---|---|---|
| Reestr | har sahifa bitta yozuv (yo'l, ruxsat, modul, ish joyi) | `frontend/src/lib/reestr/sahifa.ts` |
| Filtr | veb yon menyu bilan **bir xil** `menyuQur` (ruxsat, kompaniya moduli, rol, superadmin qatlami) | `frontend/src/lib/nav/navFiltr.ts` |
| Katalog API | `GET /api/ish-joyi?bolim=katalog&kompaniya_id=` (BFF orqali ilova ham) — uz/ru/en nom, guruh, ikonka, `yol`, `native`, `tanlangan` | `functions/_shared/modul-katalog.ts` |
| Native jadval | `NATIVE_YOL`: veb yo'l → native ekran kodi (yangi native = bitta qator) | shu fayl |
| Ilova | «Barcha modullar» (qidiruv + guruhlar), hub qidiruvida sahifalar | `feature/hub/AllModulesScreen.kt`, `core/data/Catalog.kt` |
| Veb konteyner | WebView: bir martalik bilet (`/api/mobil/web-bilet` → `web-kirish`), faqat o'z origin, yuklash/yuklab olish, pull-to-refresh, oflayn banner, sessiya tugasa jim qayta-bilet | `feature/web/WebModuleScreen.kt`, `WebLogic.kt` |
| Veb tomoni | `app-embed`: UA `QURAIApp/<v>` yoki `?app=android` → yon menyu/yuqori panel yashirinadi, «QURAI · Android» belgisi bir marta; `k=` ish joyi, `tema=` mavzu | `frontend/src/lib/app-embed.ts`, `dizayn/mobil.css` |

Katalog **faqat ko'rinish**: sahifani server va RuxsatGuard baribir qo'riqlaydi. Foydalanuvchi tanlovi (`/api/modullarim`) ro'yxatdan sahifani **olib tashlamaydi**
(100 % kirish), faqat `tanlangan` bayrog'ini beradi; `&tanlov=1` bilan toraytirish mumkin.

## 2. Parity matritsasi (reestrdagi barcha sahifalar)

Ustunlar: veb yo'l | nom | ish joyi | ilovada | asosiy rol (ruxsatdan taxmin) | native ustuvorligi.
Ustuvorlik: **P0** — native tayyor; **P1** — keyingi 10 ta (pastda); **P2** — o'rta; **P3** — kam ishlatiladi (kompaniya/shaxsiy); **P4** — veb qoladi (platforma/texnik).

| Yo'l | Nom | Ish joyi | Ilovada | Asosiy rol | Ustuvorlik |
|---|---|---|---|---|---|
| `/admin/pult` | Direktor pulti | bugun | veb konteyner | buxgalter / rahbar | P3 |
| `/admin/dashboard` | Rahbar paneli | bugun | **native** (`rahbar`) | buxgalter / rahbar | P0 (native) |
| `/admin/obyektlar` | Obyektlar | obyekt | **native** (`obyektlar`) | PTO / smetachi | P0 (native) |
| `/admin/loyiha` | Loyihalar | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/participants` | Loyiha ishtirokchilari | tomonlar | veb konteyner | PTO / smetachi | P2 |
| `/admin/mindmap` | Mindmap (xarita) | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/grafik` | Ish grafigi va pul oqimi | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/smeta-studio` | Smeta studiyasi | obyekt | veb konteyner | PTO / smetachi | P1 #1 |
| `/admin/holat` | Smeta va Fakt / LRV | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/loyiha-smeta` | Loyiha ↔ Smeta ↔ Fakt | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/smeta-narxlash` | Smetani narxlash (RES) | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/narx-dalil` | Narx dalili (Обоснование цен) | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/narx-tekshiruv` | Narx tekshiruvi (usta narxi) | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/nakrutka` | Nakrutka (ustama) | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/narxlar` | Narxlar nazorati | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/narx-manbalari` | Narx manbalari (katalog, faktura, КП) | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/oferta` | Tender oferta | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/fakt` | Fakt kiritish | obyekt | **native** (`fakt`) | prorab (dala) | P0 (native) |
| `/admin/naryad` | Naryad (brigada topshirig‘i) | obyekt | veb konteyner | PTO / smetachi | P1 #6 |
| `/admin/foto` | Foto-dalil | obyekt | **native** (`foto`) | prorab (dala) | P0 (native) |
| `/admin/m29` | M-29 (material sarfi) | obyekt | veb konteyner | omborchi / ta’minot | P1 #3 |
| `/admin/f2-tayyorlash` | F2 tayyorlash | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/f2` | F2 import (tayyor F2 faylidan) | obyekt | veb konteyner | PTO / smetachi | P2 |
| `/admin/f2-tarix` | F2 tarixi va tasdiqlash | obyekt | veb konteyner | PTO / smetachi | P1 #2 |
| `/admin/f2-reestr` | F2 reestri | obyekt | veb konteyner | PTO / smetachi | P1 #9 |
| `/admin/nakopitelniy` | Nakopitelniy va F3 | obyekt | veb konteyner | PTO / smetachi | P1 #8 |
| `/admin/solishtiruv` | Solishtiruv (qayerda farq bor) | moliya | veb konteyner | buxgalter / rahbar | P2 |
| `/admin/moliya` | Moliya (to‘lov, xarajat) | moliya | veb konteyner | buxgalter / rahbar | P1 #7 |
| `/admin/shartnoma-liniya` | Shartnomalar va tomonlar | moliya | veb konteyner | buxgalter / rahbar | P2 |
| `/admin/qarzdorlik` | Qarzdorlik (postavshik, subpudrat) | moliya | veb konteyner | buxgalter / rahbar | P2 |
| `/admin/buxgalteriya` | Buxgalteriya (provodka, hisob-kitob) | moliya | veb konteyner | buxgalter / rahbar | P2 |
| `/admin/kontragentlar` | Kontragentlar | tomonlar | veb konteyner | buxgalter / rahbar | P2 |
| `/admin/yetkazuvchi` | Yetkazuvchi: bugun | tomonlar | veb konteyner | rahbar | P2 |
| `/admin/subpudratchi` | Subpudratchi: bugun | tomonlar | veb konteyner | prorab (dala) | P2 |
| `/admin/subpudrat` | Subpudrat boshqaruvi | tomonlar | veb konteyner | PTO / smetachi | P2 |
| `/admin/documents` | Hujjatlar | hujjatlar | veb konteyner | buxgalter / rahbar | P2 |
| `/admin/hujjat-nazorat` | Hujjat nazorati | hujjatlar | veb konteyner | buxgalter / rahbar | P2 |
| `/admin/aosr` | Yashirin ishlar akti (АОСР) | hujjatlar | veb konteyner | PTO / smetachi | P2 |
| `/admin/nazorat` | Texnik nazorat | hujjatlar | veb konteyner | PTO / smetachi | P2 |
| `/admin/nazorat/tekshiruv` | Yangi tekshiruv (sayt) | hujjatlar | veb konteyner | PTO / smetachi | P2 |
| `/admin/nazorat/jurnal` | Tekshiruvlar jurnali | hujjatlar | veb konteyner | PTO / smetachi | P2 |
| `/admin/zakazchik` | Buyurtmachi kabineti | tomonlar | veb konteyner | PTO / smetachi | P2 |
| `/admin/taqdimlar` | Tomonlar hujjatlari | tomonlar | veb konteyner | PTO / smetachi | P2 |
| `/admin/murojaatlar` | Murojaatlar (remark, so‘rov) | tomonlar | veb konteyner | PTO / smetachi | P2 |
| `/admin/chizmalar` | Chizmalar va revizyalar | hujjatlar | veb konteyner | PTO / smetachi | P2 |
| `/admin/loyihachi` | Loyihachi: bugun | bugun | veb konteyner | rahbar | P3 |
| `/admin/laboratoriya` | Laboratoriya (sinov so‘rovlari) | tomonlar | veb konteyner | PTO / smetachi | P2 |
| `/admin/hujjat-aylanish` | Hujjat aylanishi (kiruvchi, xat, tasdiq) | hujjatlar | veb konteyner | PTO / smetachi | P1 #4 |
| `/admin/logistika` | Ta‘minot va sklad | taminot | veb konteyner | omborchi / ta’minot | P1 #10 |
| `/admin/zayavka` | Zayavkalar | taminot | **native** (`zayavka`) | omborchi / ta’minot | P0 (native) |
| `/admin/tender` | Tender / xarid | taminot | veb konteyner | PTO / smetachi | P2 |
| `/admin/yuk-birjasi` | Yuk birjasi | taminot | veb konteyner | PTO / smetachi | P2 |
| `/admin/bozor-sorov` | Bozordan narx so‘rash | taminot | veb konteyner | PTO / smetachi | P2 |
| `/admin/bozor-kabinet` | Bozor kabineti (sotuvchi) | taminot | veb konteyner | PTO / smetachi | P2 |
| `/admin/bozor-moderatsiya` | Bozor moderatsiyasi | taminot | veb konteyner | PTO / smetachi | P2 |
| `/admin/tender-ochiq` | Ochiq tender (lot, taqqos, bayonnoma) | taminot | veb konteyner | PTO / smetachi | P2 |
| `/admin/yuk-chaqirish` | Yuk chaqirish | taminot | veb konteyner | PTO / smetachi | P2 |
| `/admin/haydovchi` | Haydovchi rejimi | bugun | veb konteyner | hamma | P3 |
| `/admin/erp` | Kadrlar va texnika | taminot | veb konteyner | PTO / smetachi | P2 |
| `/admin/hr` | Kadrlar, KPI va ish haqi | taminot | veb konteyner | kadrlar | P2 |
| `/admin/sotuv` | Uy sotish | sotuv | veb konteyner | sotuv | P2 |
| `/admin/kompaniya` | Kompaniya, a‘zolar va modullar | kompaniya | veb konteyner | rahbar | P3 |
| `/admin/system-control` | Integratsiyalar va audit | platforma | veb konteyner | rahbar | P4 (veb qoladi) |
| `/admin/tizim-sozlama` | Sozlamalar | kompaniya | veb konteyner | rahbar | P3 |
| `/admin/hujjat-dizayn` | Hujjatlar dizayni | kompaniya | veb konteyner | rahbar | P3 |
| `/admin/tokenlar` | Tokenlar va obuna | kompaniya | veb konteyner | rahbar | P3 |
| `/admin/ai-agentlar` | AI ishchilar | kompaniya | veb konteyner | rahbar | P3 |
| `/admin/korzinka` | Korzinka | kompaniya | veb konteyner | rahbar | P3 |
| `/admin/ish-joylarim` | Ish joylarim | bugun | veb konteyner | hamma | P3 |
| `/admin/kurs` | Kurs (o‘rganish) | bugun | veb konteyner | hamma | P3 |
| `/admin/topshiriqlar` | Mening topshiriqlarim | bugun | veb konteyner | hamma | P3 |
| `/admin/mutaxassis` | Mening xizmatlarim | bugun | veb konteyner | hamma | P3 |
| `/admin/osuvchi` | Tizim o‘rganishi | kompaniya | veb konteyner | hamma | P3 |
| `/admin/akkaunt` | Akkaunt markazi | kompaniya | veb konteyner | hamma | P3 |
| `/admin/imzo` | Mening imzom | hujjatlar | veb konteyner | hamma | P2 |
| `/admin/sozlamalar` | Sozlamalar markazi | kompaniya | veb konteyner | hamma | P3 |
| `/admin/bugun` | Bugun | bugun | veb konteyner | hamma | P3 |
| `/admin/ruxsatlar-jadvali` | Ruxsatlar jadvali | kompaniya | veb konteyner | rahbar | P3 |
| `/admin/boshqaruv` | Platforma boshqaruvi | platforma | veb konteyner | hamma | P4 (veb qoladi) |
| `/admin/tizim-xaritasi` | Tizim xaritasi | platforma | veb konteyner | hamma | P4 (veb qoladi) |
| `/admin/fayl-boglash` | Fayl bog‘lash (texnik) | platforma | veb konteyner | hamma | P4 (veb qoladi) |

Native Android-only kirish nuqtalari (veb sahifasi yo'q yoki boshqa shaklda): Jarvis, Tasdiq (tab), Bugun (tab), Ombor, Bildirishnomalar, QULF/PIN — ilovaning o'z uyasida.

## 3. Keyingi 10 ta native (tavsiya, dala va chastota bo'yicha)

| # | Modul | Nega | Asosiy rol |
|---|---|---|---|
| 1 | Smeta studiyasi (ko'rish + qator tahriri, yengil) | eng ko'p ochiladi; hozir veb konteyner og'ir jadval | PTO |
| 2 | F2 tarixi va tasdiqlash | tasdiq navbati ilovada bor, F2 tafsiloti veb | rahbar / PTO |
| 3 | M-29 (material sarfi) | omborchi/prorab dalada kiritadi | prorab, omborchi |
| 4 | Hujjat aylanishi | kiruvchi/tasdiq, bildirishnomadan to'g'ri o'tish | hamma |
| 5 | Zayavkalar ro'yxati va holati | so'rov yaratish native; kuzatuv veb | ta'minot |
| 6 | Naryad (brigada topshirig'i) | dalada bajarilishni belgilash | prorab |
| 7 | Moliya xulosasi | rahbar dashboardining davomi | rahbar |
| 8 | Nakopitelniy / Forma-3 ko'rish | PDF/XLSX ko'rish allaqachon bor, ro'yxat veb | PTO |
| 9 | F2 reestri | obyekt bo'yicha F2 ro'yxati native bor, umumiy reestr veb | PTO |
| 10 | Logistika / reys | haydovchi dalada | haydovchi, ta'minot |

**O'lchov:** native qilishdan oldin veb konteynerdagi ochilish soni (`/api/mobil/web-bilet` chaqiruvlari yo'l bo'yicha) va dalada oflayn ehtiyoji
hisoblanadi; ro'yxat shu raqam bilan qayta tartiblanadi. Har yangi native ekran = `NATIVE_YOL` ga bitta qator + Android `nativeTargetFor`.

## 4. Cheklovlar (ochiq)

- Veb konteyner oflayn ishlamaydi (banner ko'rsatiladi); oflayn ish faqat native ekranlarda (fakt, foto, ombor).
- Blob eksport (brauzerda yaratilgan fayl) JS ko'prik orqali ulashish oynasiga beriladi (25 MB gacha); oddiy yuklab olish — DownloadManager.
- Emulyatorda veb sahifalarni tekshirish haqiqiy server sessiyasini talab qiladi (demo rejimda bilet yo'q).
