# Tizimdan chiqadigan hujjatlar — inventar va umumiy qoidalar (2026-11-13)

Sabab: egasi shikoyati (2026-11-13) — (A) «F2 paket» bitta ko‘p varaqli Excel berardi; (B) uzun matn katakka sig‘dirilib kichrayib ketardi (`shrinkToFit`);
(C) yashirin «Тип / Кат. / КАЛИТ» ustunlari o‘ralgan va tor bo‘lgani uchun «вода» kabi oddiy resurs qatori ham semiz chiqardi.
Hujjatlar RUS tilida qoladi; interfeys matni o‘zbekcha (`t()`).

## 1. Umumiy qoidalar (BITTA manba)

| # | Qoida | Qayerda hal qilinadi | Kim tekshiradi |
|---|---|---|---|
| R1 | Matn katagi **o‘raladi** (wrap) va qator balandligi matnga qarab hisoblanadi; `shrinkToFit` yo‘q | `hujjat-yozuvchi/qator-balandlik.ts` (hisoblagich), `rasmiy.ts` (`RasmiyVaraq`), `exceljs-dizayn.ts` | `dizayn-tekshir.ts` (rasmiy), `xlsx-qoida.ts` (har qanday .xlsx) |
| R2 | Son katagi hech qachon o‘ralmaydi / kichraymaydi — ustun kengayadi (`kerakYangila`); markazdagi son uchun alohida uslub (`markazSon`) | `rasmiy.ts` | ikkalasi |
| R3 | Yashirin / texnik ustun (`yashirin`, `tur:'texnik'`, dizayn bilan yashirilgan «Тип»): `wrapText` yo‘q, kenglikni kengaytirmaydi, qator balandligiga ta’sir qilmaydi; qator balandligi FAQAT ko‘rinadigan ustunlardan | `rasmiy.ts` (`texnik` uslub turi, `HEADER_YASHIRIN_XF`), `exceljs-dizayn.ts` | ikkalasi |
| R4 | Bir qatorli qator — sukut balandlik (`ht` yozilmaydi); o‘ralgan matn uchun `ht` majburiy | `qator-balandlik.ts` | ikkalasi |
| R5 | Chop: A4, bir sahifa eniga (`fitToWidth=1`), yo‘nalish, sarlavha qatorlari har sahifada (`Print_Titles` / `printTitlesRow`) | `rasmiyKitob`, `exceljsJadvalUslubi` | ikkalasi |
| R6 | Paket = ZIP, papkalarda ALOHIDA hujjatlar; papka/fayl nomi rus, raqamlangan, xavfsiz, takrorsiz; token BIR marta | `f2-oylik-paket/portfel-zip.ts`, `fayl-nomi.ts` (`xavfsizQism`) | `portfel-zip.test.ts` |

Tekshiruv zanjiri: `vitest.setup.ts` HAR `rasmiyKitob` chiqishini `hujjatDizaynTekshir` dan o‘tkazadi (R1–R5) — ya’ni rasmiy yozuvchi bilan yasaydigan
barcha generatorlarning O‘Z testlari avtomatik shu qoidalarni tekshiradi. Qo‘shimcha: `src/lib/hujjat-chiqish.qoida.test.ts` — sintetik fixture
dan 11 hujjat (rasmiy va exceljs) yasab `xlsxQoidaTekshir` dan o‘tkazadi va Ф-2 aktda egasi shikoyatlarini (B, C) sonlarda isbotlaydi.

## 2. Hujjatlar ro‘yxati

Belgilar: ✅ — umumiy qoidalardan o‘tadi (avtomatik test bor); 🟡 — qisman / qo‘lda tekshirilgan; ⛔ — umumiy yozuvchiga ulanmagan (qolgan nuqsonlar §3).

### 2.1 Rasmiy yozuvchi (`RasmiyVaraq` → `rasmiyKitob`) — ✅ (R1–R5 har testda tekshiriladi)
| Hujjat | Generator | Format |
|---|---|---|
| Акт Ф-2 + Ведомость ресурсов | `lib/f2-hujjat.ts` (`f2Hujjat`, `f2HujjatVaraqlar`) | xlsx (+ cross-doc test) |
| Ведомость ресурсов (smeta) | `lib/resurs-vedomost.ts` | xlsx |
| Справка Ф-3 | `lib/forma3-export.ts` | xlsx |
| Накопительная ведомость | `lib/nakopitelniy-vedomost-export.ts` | xlsx (+ cross-doc test) |
| Остаток работ | `lib/ostatka-export.ts` | xlsx (+ cross-doc test) |
| Сличительная ведомость | `lib/slichitelniy-vedomost.ts` | xlsx |
| М-29 | `lib/m29/export.ts` | xlsx |
| ЛРВ (+ pivot varaqlari) | `lib/lrv-hujjat.ts`, `hujjat-yozuvchi/pivot.ts` | xlsx |
| LRV ↔ RES сверка | `lib/lrv-res-sverka-export.ts` | xlsx |
| Обоснование выполненных объёмов | `lib/fakt-obosnovanie.ts` | xlsx |
| Обоснование цен / Протокол согласования цен | `lib/narx-asoslash-export.ts`, `lib/narx-protokol-hujjat.ts` | xlsx |
| Пересчёт (smeta / fakt) | `lib/pereraschet-export.ts` | xlsx |
| Реестр АОСР / лаб. протоколов | `lib/ijro-reestr-export.ts` | xlsx |
| Наряд-задание | `lib/naryad/hujjat.ts` | xlsx |
| Акт сверки, ОСВ, бухгалтерский отчёт | `lib/buxgalteriya/eksport.ts` | xlsx |
| Субподрядный акт | `lib/subpudratchi/eksport.ts` | xlsx |
| Реестр и Свод Ф-2 (oylik), MUNDARIJA | `lib/f2-oylik-paket/eksport.ts` | xlsx (+ cross-doc test) |
| Свод F2 portfeli | `lib/f2-oylik-paket/portfel-eksport.ts` | xlsx (+ cross-doc test) |
| **Реестр пакета (YANGI)** | `lib/f2-oylik-paket/portfel-zip.ts` | xlsx (+ cross-doc test) |
| Ведомость ЗП / KPI | `lib/hr/eksport.ts` | xlsx |
| Отчёт заказчику | `lib/zakazchik-hisobot.ts` | xlsx |
| Дефектная ведомость (dava) / solishtirma / kunlik jurnal / ABC / oferta svod / shablon / boss hisobot | `lib/smeta-versiya/dava-export.ts`, `lib/loyiha-smeta/solishtirma-export.ts`, `lib/nazorat/tekshiruv.ts`, `lib/smeta-studio/abc-hujjat.ts`, `lib/tender-oferta-paket.ts`, `lib/hujjat-aylanish/shablon.ts`, `components/boss-decision/report.ts` | xlsx |

### 2.2 exceljs + `exceljsJadvalUslubi` (bir xil dizayn resolveri) — ✅
| Hujjat | Generator | Izoh |
|---|---|---|
| Bajarilmadi | `lib/bajarilmadi-export.ts` | cross-doc test |
| Moliya tahlili | `lib/moliya-tahlil.ts` | cross-doc test |
| Rahbar paneli | `lib/rahbar-panel/eksport.ts` | helper orqali (alohida fixture testi yo‘q) 🟡 |
| Qarzdorlik | `lib/qarzdorlik/eksport.ts` | BU ISHDA tuzatildi: yashirin 13-ustun uslubdan OLDIN yashiriladi; cross-doc test |
| Ombor reestri | `lib/ombor-prixod/davr-eksport.ts` | BU ISHDA helper'ga ulandi (avval: barcha katak wrap, sarlavha qatorlari tor A ustunida o‘ralgan, Print_Titles yo‘q); cross-doc test |

### 2.3 Paketlar (ZIP)
| Paket | Kod | Holat |
|---|---|---|
| **F2 portfeli → ZIP (sukut)** | `admin/sahifalar/F2Portfel.tsx` + `portfel-zip.ts` | ✅ `Реестр пакета.xlsx`, `01 Акты Ф-2/[<объект>/]…`, `02 Свод Ф-2/…`; alohida hujjat; token BIR marta (`hujjatTokenBilan`, ZIP xeshi); eski «Bitta Excel» shakl tanlovida qoldi |
| Oylik shartnoma paketi (Ф-2, Ф-3, akt-sverka, MUNDARIJA) | `admin/sahifalar/F2OylikPaket.tsx`, `lib/f2-oylik-paket/eksport.ts`, `shartnoma.ts` | 🟡 allaqachon ZIP va alohida fayllar; papka nomlari lotincha/raqamsiz (§3, N3) |
| Tender oferta paketi | `lib/tender-oferta-paket.ts` (`paketZip`) | 🟡 ZIP, alohida fayllar; papka rejasi tekshirilmagan |

### 2.4 Boshqa generatorlar — qoidalar bilan to‘liq emas
| Hujjat | Generator | Holat |
|---|---|---|
| АОСР | `lib/aosr-export.ts` | 🟡 exceljs, o‘z hisoblagichi (`bal`), A4/fitToWidth bor; umumiy yozuvchiga ulanmagan (N5) |
| Фотоотчёт | `lib/foto-hisobot.ts` | 🟡 BU ISHDA chop sozlamasi + Print_Titles qo‘shildi; qator balandligi rasm bo‘yicha (to‘g‘ri) |
| Протокол тендера (bayonnoma) | `lib/tender-ochiq/bayonnoma-export.ts` | 🟡 BU ISHDA chop sozlamasi qo‘shildi; matn o‘ramaydi (N6) |
| LRV_PLUS (egasi shablonini davom ettiradi) | `lib/lrv-plus-export.ts` (xlsx-js-style) | ⛔ egasi shabloni — uslubi ataylab o‘zgarmaydi; qatorlar balandligi qat’iy (N4) |
| Tender oferta (asl smetani davom ettiradi) | `lib/tender-oferta-export.ts` | ⛔ H1 (asl faylni davom ettirish) — umumiy yozuvchi qo‘llanmaydi (N7) |

## 3. Qolgan nuqsonlar (tuzatilmadi) — muhimlik bo‘yicha

| # | Nuqson | Joy |
|---|---|---|
| N1 | **Hech bir fayl Excelning o‘zida ochib ko‘rilmadi** (muhit imkonsiz). Qator balandligi hisoblagichi — taxmin (1 ustun birligi ≈ 1.15 belgi, Times New Roman 10 pt); haqiqiy Excel/LibreOffice biroz boshqacha o‘rashi mumkin → ba’zan 1 qator ortiq/kam. | `hujjat-yozuvchi/qator-balandlik.ts` (`BELGI_KOEF`) |
| N2 | `qatorMaks=3` (egasi 2026-11-06 «qatorlar semiz») — 3 qatordan uzun nom ko‘rinadigan qismi 3 qator, qolgani katakda (yacheyka ichida to‘liq) kesiladi. Egasi «uzun matn to‘liq ko‘rinsin» desa — sozlama `Hujjat dizayni → qatorMaks` (0 = cheksiz) yoki sukutni oshirish kerak. | `hujjat-yozuvchi/dizayn.ts:77` |
| N3 | Oylik paket ZIP papkalari lotincha (`F2`, `Forma-3`) va raqamsiz; `00_MUNDARIJA.xlsx`, `ПАКЕТ_СОСТАВ.txt` — portfel paketidagi «01 Акты Ф-2 / 02 …» uslubiga o‘tkazilmagan (manifest/arxiv testlari yo‘llarga bog‘liq — alohida ish). | `admin/sahifalar/F2OylikPaket.tsx:465`, `:485`; `lib/f2-oylik-paket/eksport.ts:120`, `:187` |
| N4 | LRV_PLUS: qator balandligi qat’iy (`hpt` 23/25/34) — uzun nom o‘ralgan, lekin balandlik matnga qarab hisoblanmaydi; yashirin «Даража/КАЛИТ» ustunlari uslubsiz (o‘ralmagan — xavfsiz). | `lib/lrv-plus-export.ts:535-538`, `:860-869` |
| N5 | АОСР: o‘z balandlik hisoblagichi (`bal`, 95 belgi/qator) — umumiy `qatorBalandligi` bilan farq qilishi mumkin; barcha katak (son ham) `wrapText`. | `lib/aosr-export.ts:161`, `:166`, `:170` |
| N6 | Tender bayonnomasi: ustunlar 18/40 kenglikda, uzun matn o‘ralmagan va uslubsiz (dizayn resolveri qo‘llanmagan). | `lib/tender-ochiq/bayonnoma-export.ts:52` |
| N7 | Tender oferta: asl smeta uslubini davom ettiradi; yashirin K ustuni asl uslubda — qoida tekshirilmagan (fixture og‘ir). | `lib/tender-oferta-export.ts:261` |
| N8 | Фотоотчёт: qator darajasidagi `wrapText` sonli «№» katagiga ham tushadi (zararsiz, lekin R2 ga zid). | `lib/foto-hisobot.ts:63` |
| N9 | RS (resurs) qatori «Kontrastli» presetda 1 pt kichik shrift (9 pt) + kursiv — bu `shrinkToFit` emas, daraja dizayni (egasi 2026-11-03); «hamma matn oddiy shriftda» talab qilinsa `olchamQosh` ni 0 qilish kerak. | `hujjat-yozuvchi/dizayn.ts:87` |
| N10 | `rahbar-panel`, `hr`, `zakazchik-hisobot` va boshqalar uchun alohida sintetik fixture testi yo‘q (qoidalar `kitobKuzatuvchi` / helper orqali kafolatlanadi, lekin cross-doc testga qo‘shilmagan). | `src/lib/hujjat-chiqish.qoida.test.ts` |
