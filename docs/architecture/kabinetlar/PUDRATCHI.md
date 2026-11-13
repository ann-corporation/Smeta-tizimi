# PUDRATCHI KABINETI — tadqiqot va loyiha (1-bosqich)

Sana: 2026-11-14. Branch `claude/kabinet-pudratchi`. Faqat tadqiqot; kod o'zgarmagan (istisno: Forma 3 — PR #435, oylik paket 402 — PR #433).
Manbalar: `D:\BOG_MIYASI` (faqat o'qildi, hech narsa ko'chirilmadi, real summa/ism/INN yozilmadi), `lib/reestr/sahifa.ts`, audit `AUDIT_PUDRATCHI_OQIM_2026-11-13.md` (U1–U12), prod `sql_oqish` (faqat o'qish). Taxmin — «TAXMIN».

## 0. Asosiy xulosa
Pudratchi zanjiri kodda deyarli to'liq (smeta → fakt → AOSR → F-2 → F3 → to'lov), lekin foydalanuvchi uni ko'rmaydi: qadam chizig'i faqat Faktdan boshlanadi, 82 sahifa bir menyuda, fakt 8 joyda yoziladi, F3 esa egasining real shaklidan farq qiladi. Maqsad — 8 bo'limli, rol bo'yicha «Bugun»li kabinet; yangi modul yo'q.

## (a) HAQIQIY ISH TARTIBI (rollar bo'yicha)
Real arxiv tuzilmasi (`D:\BOG_MIYASI`) zanjirni o'zi ko'rsatadi: `01_SMETALAR` → `03_SHARTNOMALAR` → `04_FAKT_VA_OLCHOVLAR` → `06_AOSR_IJRO_HUJJATLAR` → `02_F2_REESTR_VA_AKTLAR` → `90_HISOBOTLAR/*_F3_PAKET`, `*_F3_SVERKA` → `10_SVERKA_MOLIYA` (direksiya sverkasi), `*_QARZDORLIK`; yozishmalar `*_KELISHUV_XATLARI` (umumiy xat + ilova jadval, TQ/defektli akt, material almashtirish, shartnomadan oshgan ish). Oy davomida F3 «справка-счет-фактура» sifatida ham ishlaydi (hisob-faktura vazifasi).

| Rol | Qachon | Nima qiladi (hujjat) | Kimga beradi | Nima qaytadi |
|---|---|---|---|---|
| Boss/direktor | boshida; oy oxirida | shartnoma imzosi, narx/ustama qarori, F3 va xatlarga imzo, to'lov nazorati | buyurtmachi direksiyasiga | to'lov, qarz, TQ/kelishuv javobi |
| PTO | doim; oy oxirida asosiy | smeta yuklash/narxlash, fakt tekshirish, AOSR, F-2 (tayyorlash → tasdiq), Forma 3, oylik paket, slichitelniy/zamena, kelishuv xatlari | prorabdan fakt oladi; buyurtmachiga F2/F3/paket; texnadzorga AOSR | AOSR qarori, F2 tasdig'i, izoh/remark |
| Prorab | har kuni | kunlik fakt, usta qoralamasini tasdiqlash, naryad, material zayavka, foto, AOSR uchun tayyorlov | PTO ga fakt/foto; omborga zayavka | qoldiq, usta so'rovlari |
| Usta/brigadir | har kuni (telefon) | bugungi ish hajmi, foto, naryad qabuli | prorabga qoralama | naryad bo'yicha haq, rad izohi |
| Buxgalter | oylik | to'lov yozish, akt-sverka, qarzdorlik, provodka | direksiya bilan sverka | to'lov tasdig'i, farq |
| Omborchi/ta'minotchi | har kuni | zayavka → yetkazuvchi → kirim → M-29 | yetkazuvchi, logistika | yetkazish holati, hisob-faktura |

Real amaliyotdan muhim kuzatuvlar (dalil: fayl nomlari/tuzilma):
1. Slichitelniy qo'lda bir necha versiyada (`v2…v12`) yuritilgan, har bir tuzatish alohida fayl; faraz va «egasi tasdiqlashi kerak» bandlari README da — tizimda versiya + tasdiq oqimi shart.
2. Buyurtmachi bilan kelishuv — oy emas, ish bo'yicha (31 ta masala, 4 guruh): bu «murojaat/taqdim» ga mos, lekin pudratchi tomonida ish ro'yxati (reestr) yo'q.
3. F3 zanjiri — har obyekt/shartnoma bo'yicha ketma-ket hujjatlar, «с начала» oldingisiga qo'shilib boradi (§g).

## (b) HOZIRGI HOLAT — sahifalar (pudratchi rollari menyusi)
Belgilar: K — kerak; T — takror (qaysi bilan); B — boshqa tomonniki (pudratchiga ko'rinmasin); O — o'lik/yashirin; ? — nomi/o'rni noaniq.

| Sahifa (kalit) | Holat | Izoh |
|---|---|---|
| bugun, ish-joylarim, topshiriqlar | K | «Bugun» rolga mos emas (sonlar yo'q, U11); `ish-joylarim` = kompaniyalarim ? |
| pult, dashboard | T (bir-biri) | ikkalasi «bir qarashda holat»; 8 holat yuzasidan 2 tasi |
| obyektlar, loyiha, participants | K (participants — T: tomonlar) | «Obyektlar va smeta yuklash» nomi yolg'on: yuklash `holat/:id` tabida |
| holat (Smeta va Fakt/LRV) | K | obyekt ish joyining yadrosi |
| smeta-studio, loyiha-smeta, mindmap, grafik | K (beta); mindmap — ? | grafik zanjir chizig'ida yo'q (U1) |
| smeta-narxlash, narx-dalil, narx-tekshiruv, nakrutka, narxlar, narx-manbalari, oferta | K, lekin 7 sahifa = BIR «Narx» ishi | birlashtirish: bitta «Narx» bo'limi, 7 tab → 4 |
| fakt, foto | K | fakt kamida 8 yuzada yoziladi (audit §2.1) |
| naryad | K (beta) | qabul → `fakt_yoz_v2`; fakt bilan bir joyga |
| m29 | K | ombor ma'lumotidan; omborchi uchun |
| f2-tayyorlash | K | asosiy yo'l; obyekt sahifasida tugmasi yo'q (U6) |
| f2 (import) | K | tayyor fayl bilan kirish; T: f2-tayyorlash (ikki kirish) |
| f2-tarix, f2-reestr, TayyorlanganF2lar | K / T | tasdiq va chop bir joyda, reestr alohida; 3 ro'yxat ko'rinishi |
| nakopitelniy (+F3) | K | F3 uchun alohida sahifa yo'q; shartnoma F3 shu yerda |
| shartnoma-liniya | K | zanjir boshi, lekin «Moliya» da (U9); T: Moliya→Shartnomalar (ikkinchi RPC) |
| moliya (to'lov/xarajat/faktura/shartnoma) | K | 3 tab T: to'lov formasi 3 joyda (audit §2.1-3) |
| qarzdorlik, buxgalteriya, solishtiruv | K (beta), nom ? | oxirgi yarmi: prodda 0 qator (REESTR_HOLAT 2026-11-11) |
| kontragentlar | K | «Yana» da; F3 rekvizit manbai |
| subpudrat | K | pudratchi sub'ga BUYURTMACHI — to'lov/qarzga havola yo'q (U7) |
| subpudratchi (Subpudratchi: bugun) | B | subpudratchi kompaniyasining uyi |
| yetkazuvchi (Yetkazuvchi: bugun) | B | yetkazuvchi tomon uyi |
| loyihachi, chizmalar | B / K (chizmalar o'qish) | loyihachi uyi; pudratchiga faqat kelgan chizma/revizya |
| laboratoriya | B | lab tomoni; pudratchi faqat so'rov beradi (AOSR ichida) |
| documents, storage | T | ikkalasi fayl ko'rinishi; bitta «Hujjatlar» |
| hujjat-nazorat, hujjat-aylanish, taqdimlar, murojaatlar, zakazchik | K / T | «Kiruvchi quti» 2 joyda (audit §2.1-7); zakazchik — B (buyurtmachi kabineti) |
| aosr | K | zanjirda F3 dan KEYIN turibdi (U2) |
| nazorat (+tekshiruv, jurnal) | B | texnik nazorat tomoni; pudratchiga faqat qaror ko'rinadi |
| logistika, zayavka | K, T (zayavka 2 joyda) | ombor ishi; zayavka «Yana» da (kundalik uchun asosiy bo'lishi kerak) |
| tender, tender-ochiq, bozor-sorov, yuk-chaqirish, yuk-birjasi | K (xarid) / bozor-kabinet, bozor-moderatsiya — B | yetkazuvchiga buyurtma va logistika ehtiyoji |
| haydovchi, mutaxassis | B | logistika/shaxsiy kabinet |
| erp, hr | K (boss/buxgalter) | kadrlar/KPI; usta uchun emas |
| sotuv (Uy sotish) | B | qurilish pudratchisi ishi emas (modul yoqilganda) |
| kompaniya, tokenlar, tizim-sozlama, sozlamalar, akkaunt, osuvchi, hujjat-dizayn, ai-agentlar, korzinka, ruxsatlar-jadvali | K / T | 3 «sozlama» sinonim (tizim-sozlama, sozlamalar, akkaunt) → bitta «Sozlamalar» |
| imzo, kurs | K | usta uchun ham |
| system-control, boshqaruv, tizim-xaritasi, fayl-boglash | O (texnik) | menyudan chiqarilsin |
| AdditionalReplacementNative, WrapperPortfel, TestFakt; `/admin/test/*` | O | hech qayerdan ochilmaydi (audit §2.2) |

## (c) UZILISHLAR (kiritilgan ma'lumot keyingi qadamda ishlatilmaydi)
| № | Ma'lumot / qayerda kiritiladi | Qayerda qayta so'raladi yoki ko'rinmaydi |
|---|---|---|
| 1 | Kontragent rekviziti (nom, INN, manzil, hisob, MFO, rahbar) — `kontragentlar` | F3 «Банк», «Телефон», «ОКЭД» har safar qo'lda: `KontragentRek` (`forma3-rekvizit.ts:9`) da bank/telefon/OKED maydoni yo'q, `f3Yetishmaydi` bankni doim so'raydi |
| 2 | Shartnoma summasi/raqami/sanasi — `shartnoma-liniya` | F3 «Договор … Общая договорная стоимость» faqat `shartnomaSumma` uzatilsa chiqadi; to'liq shaklda sarlavhada bo'sh qolishi mumkin (TAXMIN: yo'l tekshirilmadi) |
| 3 | Fakt (usta qoralamasi) — `UstaBugun` | Prorab uchun «Bugun»da ko'rinmaydi, faqat Fakt sahifasi tepasida (U11) |
| 4 | Fakt/F2/F3 summalari | Qarzdorlik asos qatorlari qo'lda yoki Excel orqali (U8) — F2/F3 dan avtomatik emas; F2 → buxgalteriya provodka ulanmagan |
| 5 | F3 / oylik paket «Topshirildi» | Buyurtmachi tomoniga rasmiy yuborilmaydi: `TAQDIM_MANBA_JADVAL` faqat `f2` va `aosr` (`hujjat-dvigatel/reestr.ts:251`); F3, paket, akt-sverka, M-29 uchun «Yuborish» tugmasi yo'q |
| 6 | AOSR ishlari — `aosr` | F2 tayyorlashda «AOSRsiz ishlar» ogohlantirishi chiqadi, lekin qadam chizig'i va «keyingi qadam» AOSR ni bilmaydi (U1–U3) |
| 7 | To'lov — 3 forma (`TolovForma`, nakopitelniy bloki, qarzdorlik asosi) | ikki haqiqat manbai xavfi (TAXMIN: ikki jadval) |
| 8 | Subpudrat akt qabuli → xarajat | to'lov/qarz/akt-sverkaga havola yo'q (U7) |
| 9 | Obyekt/oy tanlovi | 5 xil boshqaruv, 20 ta sahifa o'z `<select>`i (audit §4.1–4.2); «Ish doirasi» paneli faqat PTO sahifalarida |
| 10 | Narx, ustama (nakrutka) — `nakrutka` | F3 «процент не задан» ogohlantirishi: nakrutka o'qilmasa «стоимость к оплате не определена» — foydalanuvchi qaysi sahifada to'ldirishni topolmaydi (TAXMIN) |

## (d) MAQSAD KABINET

### Bugun ekranlari (rol bo'yicha; hammasida «kutayotgan ish» sonlari + bitta keyingi qadam)
| Rol | «Bugun» tarkibi |
|---|---|
| Boss | qarz/to'lov (QQS bilan birinchi), yopilmagan oylar, imzo kutayotgan hujjatlar, buyurtmachidan javob kutayotgan taqdimlar, kelishuv xatlari reestri |
| PTO | oylik yopish jadvali (obyekt × oy: fakt → AOSR → F2 → F3 → to'lov, holat belgisi), usta qoralamalari soni, AOSRsiz ishlar, F3 yetishmayotgan rekvizit, texnadzor qaytargan hujjatlar |
| Prorab | bugungi ishlar, usta qoralamalari (tasdiqlash), zayavka holati, ertangi reja, foto yetishmayotgan ishlar |
| Usta/brigadir (telefon) | `UstaBugun`: obyekt → bugungi ish → hajm → foto; naryad holati; mening imzom |
| Buxgalter | kelgan to'lovlar, sverka farqi, qarzdorlik, provodkasiz F2 |
| Omborchi/ta'minotchi | ochiq zayavka, kelayotgan yuk, M-29 kutayotgan, yetkazuvchi javobi |

### 8 bo'lim (zanjir tartibida) va ularda nima qoladi
| № | Bo'lim | Qoladi / birlashadi / yo'qoladi |
|---|---|---|
| 1 | Bugun | `bugun` rol bo'yicha; `pult`+`dashboard` birlashadi; `ish-joylarim`, `topshiriqlar` shu yerda |
| 2 | Shartnoma va smeta | `shartnoma-liniya` (Moliya dan ko'chadi; TestShartnoma yo'qoladi), `obyektlar`, `loyiha`, `holat`, `smeta-studio`, `loyiha-smeta`, `grafik`; 7 narx sahifasi → bitta «Narx» (tablar); `participants`, `mindmap` — yana |
| 3 | Fakt va ish | `fakt` (jurnal/xotiradan/daraxt/ish varag'i — bitta sahifa, rejimlar), `foto`, `naryad`; `UstaBugun` telefon yuzasi |
| 4 | Material va ombor | `zayavka`, `logistika` (sklad), `m29`; yetkazuvchiga buyurtma: `tender`, `bozor-sorov`, `yuk-chaqirish`; moliyadagi «Fakturalar» shu yerga (kirim) |
| 5 | Ijro hujjatlari | `aosr` (+ lab so'rovi, ОЖР tab — yangi modul emas, `aosr` ichida), `hujjat-nazorat`, texnadzor qarori (faqat ko'rish), `chizmalar` (o'qish) |
| 6 | F-2 va Forma 3 | `f2-tayyorlash` asosiy; `f2` import — «tayyor fayl bilan» tab; `f2-tarix`+`f2-reestr`+TayyorlanganF2lar → bitta «F2 reestri»; `nakopitelniy` (+F3); oylik paket; «Buyurtmachiga yuborish» hamma hujjatga |
| 7 | To'lov va sverka | `moliya` (to'lov — bitta forma), `qarzdorlik`, `buxgalteriya`, `solishtiruv`; akt-sverka shu yerda; `hr`/`erp` — «Kompaniya» ostida |
| 8 | Subpudratchilar | `subpudrat` (topshirish → narx → akt qabul), `kontragentlar`; to'lov/qarzga havola. (Subga ish topshirish — tomon-subpudrat agentiniki) |

Menyuda ko'rinmaydigan: «B» belgili sahifalar, texnik sahifalar, o'lik kod. «Kompaniya» (sozlamalar, a'zolar, token, hujjat dizayni, AI) — pastda alohida.

### Rol × bo'lim
| Rol | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Boss | Bugun | o'qish+shartnoma | o'qish | o'qish | imzo | tasdiq/imzo | to'liq | to'liq |
| PTO | Bugun | to'liq (narx) | tasdiq | o'qish | to'liq | to'liq | o'qish | o'qish |
| Prorab | Bugun | o'qish (narxsiz) | to'liq | zayavka | tayyorlov | — | — | — |
| Usta/brigadir | UstaBugun | — | hajm+foto | — | imzo | — | — | — |
| Buxgalter | Bugun | shartnoma o'qish | — | faktura | — | o'qish | to'liq | o'qish |
| Omborchi/ta'minotchi | Bugun | — | — | to'liq | — | — | — | — |

### Telefon (prorab/usta)
`UstaBugun` (≤375 px, oflayn navbat, pul yo'q) — kunlik fakt uchun yagona yuza bo'lib qoladi; prorab uchun shu ekranda qo'shimcha: qoralamalarni tasdiqlash, zayavka, foto. Desktop Fakt jadvali faqat PTO/prorab. Kodda: `UstaBugun.tsx` (IndexedDB navbati, `yangiOperationId` — takror xavfsiz).

## (e) BOG'LANISHLAR (boshqa kabinetlar bilan)
| Uchrashuv | Kim boshlaydi | Ikkinchi tomon nima ko'radi | Holat qayerda |
|---|---|---|---|
| Buyurtmachiga hujjat (F2, AOSR) | PTO: «Buyurtmachiga yuborish» (`ZakazchigaYuborish`, faqat f2/aosr) | tahrir qila olmaydi; qaror: qabul/qaytarish+izoh | tugma yonida; `taqdimlar` |
| Buyurtmachiga F3, paket, akt-sverka | PTO | HOZIR hech narsa (resurs yo'q) | yo'q — §c-5; eng kerakli bo'shliq |
| Texnadzor qarori (AOSR) | pudratchi yuboradi | texnadzor: `aosr[qaror]` | `aosr` sahifasida, «Bugun»da qaytarilganlar; server isbotlangan (`tomonlararo_zanjir_v1`, 2-qadam) |
| Buyurtmachi remark/murojaat | buyurtmachi | pudratchi `murojaatlar` da | Bugun: soni |
| Subga topshiriq | pudratchi = buyurtmachi roli (tomon-subpudrat agenti) | sub: topshiriq, narx taklifi | `subpudrat`; EHTIYOJ: akt qabul → xarajat → qarzga/sverkaga havola |
| Yetkazuvchiga buyurtma | ta'minotchi: zayavka → tender/bozor-sorov | yetkazuvchi: taklif/bajarish | `zayavka` holati; hisob-faktura → ombor kirimi |
| Logistikaga yuk | ta'minotchi: yuk chaqirish (zayavkaga bog'liq) | yuk egasi/tashuvchi: lot, reys | `yuk-chaqirish` holati zayavkada |
| Laboratoriya | pudratchi so'rov (AOSR ichida) | lab: protokol (grant bilan) | AOSR «Laboratoriya» varag'i; protokol fayli grant bilan |
Nomuvofiqlik: yuqorida «Holat qayerda» ustuni bo'sh joylar — «Bugun»dagi kutish sonlari va taqdim holati bilan to'ldiriladi (PR4–PR5).

## (f) QURISH REJASI (5–8 kichik PR; ustuvorlik bilan)
| № | PR | O'chadi / birlashadi / ko'chadi |
|---|---|---|
| P0 | #433 (tayyor) — arxivdagi zip/xlsx 402 | — |
| P0 | #435 (tayyor) — F3 «с начала» narastayushchiy (egasi savoli kerak) | — |
| 1 | Pudratchi menyusi: «B» sahifalarni yashirish, 3 sozlama → 1, texnik sahifalar menyudan, `ilova` tasnifi bekor | o'chadi: loyihachi/subpudratchi/yetkazuvchi/haydovchi/mutaxassis «bugun», uy sotish (modul yo'q bo'lsa) |
| 2 | Zanjir chizig'i: shartnoma → smeta → fakt → AOSR → F2 → F3 → to'lov; 2 «keyingi qadam» vidjeti → 1 | birlashadi: `ObyektQadamlari`+`KeyingiQadamPanel`; ko'chadi: AOSR F2 dan oldin |
| 3 | Fakt — bitta sahifa (jurnal/xotiradan/daraxt/ish varag'i rejimlari), naryad qabuli shu yerda | birlashadi: 8 yozish yuzasi |
| 4 | «Bugun» rol bo'yicha (sonlar, usta qoralamalari prorabga, oylik yopish jadvali) | yangi plitkalar mavjud ma'lumotdan |
| 5 | Buyurtmachiga yuborish: F3, paket, akt-sverka (taqdim resurslari) + F3 real shablon (1 qator/obyekt, 16 grafa) | taqdim jadvali kengayadi |
| 6 | Shartnoma muharriri bitta (TestShartnoma → ShartnomaLiniya), to'lov formasi bitta, qarzdorlik asosi F2/F3/to'lovdan | o'chadi: 2-muharrir, 2 to'lov forma |
| 7 | Narx bo'limi (7 → 4 tab), F2 reestri (3 ro'yxat → 1), hujjatlar (documents+storage) | birlashadi |
| 8 | O'lik kod: AdditionalReplacementNative, WrapperPortfel, TestFakt, `/admin/test/*`, `pageCatalog.ts` ikkinchi ro'yxat | o'chadi |

## (g) FORMA 3 — real namuna bilan solishtirish
Namuna: egasining real F3 xlsx hujjatlari (`…/Для_ф2_arxiv…/*/Ф3*.xlsx`, `ф3 СЕНТЯБРЬ.xlsx`; `90_HISOBOTLAR/2026-10-23_F3_SVERKA` da 30 hujjat zanjiri). Namuna ANIQ: 3 obyekt bo'yicha barcha hujjatlar bir xil tuzilmada. Tizim chiqishi sintetik ma'lumotda ikkala shakl (`toliq`, `bir_qatorli`) bilan olindi.

| Element | Real namuna | Tizim | Holat |
|---|---|---|---|
| Sarlavha | «СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ (ПОНЕСЕННЫХ ЗАТРАТ)» | xuddi shu | bor |
| «ЗА <МЕСЯЦ> МЕСЯЦ <ГОД> ГОДА» | bor | bor | bor |
| «Форма № 3» yozuvi; «Форма одобрена решением Республиканской комиссии…» izohi | yo'q (varaq nomi «СЧЁТ-ФАКТ. (obyekt)») | varaq «Форма № 3», pastida rasmiy izoh | ortiqcha — egasidan so'ralsin |
| Номер / Дата составления / Отчётный период | bor; «по» = дата составления; «с» = oldingi F3 sanasi | «с»=oy 1-kuni, «по»=oy oxiri | NOTO'G'RI (davr kalendar oy emas) |
| Rekvizit bloki | Подрядчик \| Заказчик: Адрес, Телефон, р/с (zakazchikda «Основной счёт»), Банк, МФО, ИНН, ОКЕД | Адрес, Расчетный счет, Банк, МФО, ИНН; Телефон va ОКЭД qiymat bo'lsa | QISMAN (Телефон/ОКЭД ko'pincha yo'q, §c-1) |
| «Наименование объекта и его адрес», «Договор № … от … Общая договорная текущая стоимость … сўм» | bor | bor; summa faqat uzatilsa | QISMAN |
| Jadval ustunlari | 16 grafa: №, наименование, ед.изм., объём (всего/в т.ч. на тек.год), стоимость (всего/в т.ч. на тек.год), «Сначала проведённых работ» (физ./%/цена), «Сначала года» (3), «в т.ч. за отчётный месяц» (3); 1..16 raqamlar | `toliq`: xuddi 16 grafa; `bir_qatorli`: 7 ustun («Ставка, %») | `toliq` bor; `bir_qatorli` yo'q (16 grafa emas) |
| «с начала строительства / года» semantikasi | NARASTAYUSHCHIY, oy qo'shiladi: `J_n = J_(n-1) + P_n` (30 hujjat, birinchisida `J=P`) | oy QO'SHILMAS edi (ikkala shaklda, `forma3-export.ts:299-301`, SUMIFS `"<davr"`) | NOTO'G'RI → #435 da tuzatildi |
| Qatorlar | obyekt nomi qatori; «ИТОГО ЗАТРАТЫ ПО ОБЪЕКТАМ» (QQS siz) / «НДС 12%» / «ВСЕГО ПО ОБЪЕКТУ» (QQS bilan, qalin); F-grafa = shartnoma jami | `toliq`: har ish/razdel qatori + «ИТОГО-1…4», «НДС, %», «ИТОГО К ОПЛАТЕ»; `bir`: «СУММА БЕЗ НДС / НДС / ВСЕГО К ОПЛАТЕ» | NOTO'G'RI nomlar; real shakl — obyekt boshiga bitta qator (tizim `toliq` da ish ro'yxati chiqaradi) |
| «ИТОГО К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ» + so'z bilan | yo'q | bor | ortiqcha (foydali bo'lishi mumkin) |
| Izoh «Стоимость объекта в текущих ценах определяется после разработки ПСД…» | bor | yo'q | YO'Q (shartnomaga xos; egasidan so'ralsin) |
| Imzo bloki | ЗАКАЗЧИК (chapda) → Директор, Гл. бухгалтер; ПОДРЯДЧИК (o'ngda) → Директор, Гл. бухгалтер; М.П. yo'q | ПОДРЯДЧИК birinchi, «Руководитель», «Главный бухгалтер», М.П. | NOTO'G'RI tartib/nom |
| Sahifa | A4 albom, fitToPage, print area | A4 albom, fitToPage, print area bor | bor |
| Fayl tuzilmasi | bir fayl, har obyekt alohida varaq | har F3 alohida fayl, + «Ф-2 (источник)» varag'i | farq (manba varag'i — ortiqcha, audit uchun foydali) |
| Shrift | Times New Roman (sarlavha 14 qalin, jadval 9–11) | tekshirilmadi | — |
Shartnoma darajasidagi F3 (`forma3ShartnomaHujjat`, 8 ustun, «по одной строке на объект») real 16 grafali bir-qatorli shaklga ham mos emas — #435 dan keyingi alohida PR (P5).
Eski kod «Game Club (2026-10-02)» da «с начала = faqat may» deb qotirilgan edi — real zanjirga zid; #435 testlari yangi qoidada, merge egasi javobidan keyin.

## (h) P0 — OYLIK PAKET (F2OylikPaket) YUKLASHI PRODDA SINADIMI?
- **Yo'q, sinalmagan:** prodda `document_type='shartnoma_oylik_paket'` hujjat 0 ta, `meta.hujjat='SHARTNOMA_OYLIK_PAKET'` token sarfi 0 ta (faqat `f3`: 4 hujjat; `F3`: 7 sarf).
- **Yozish yo'li:** «Topshirildi» (`F2OylikPaket.tsx:405-424`) avval mijozda to'laydi (`hujjatTokenBilan`, amal `hujjat`, 0 katak → asos narx; prodda `asos_som=10000` > 0 → sarf qatori `meta.xesh = mazmunXeshi(zip)` yoziladi), keyin `/api/hujjat-yukla`. Server ≤25 MiB faylda baytni o'zi o'qib `mazmunXeshi` hisoblaydi — mijoz bilan bir xil funksiya → dalil `bor` → 402 bo'lmaydi (oddiy yo'l).
- **402 qaysi shartda:** (1) ZIP > 25 MiB: dalil kaliti xom `sha256` — mijoz esa mazmun xeshi bilan to'lagan → har doim `TOKEN_TOLOV_YOQ` (R2/reyestrga yozilmaydi); (2) sarf qaytarilgan (refund); (3) dalilni o'qib bo'lmasa 503. `turi==='shartnoma_oylik_paket'` da server o'zi yechmaydi (ichki hujjatlar alohida to'langan) — shuning uchun dalil yo'q bo'lsa to'g'ridan 402.
- **Haqiqiy xato (O'QISH yo'li):** `/api/hujjat-ol` dalilni reyestrdagi XOM sha256 prefiksi bilan qidirardi, token esa MAZMUN xeshi bilan → 2026-11-05 dan keyin saqlangan zip/xlsx arxivi (paket, F3) qayta ochilganda 402. `PaketArxivi` yuklab olishi (`saqlanganZipniOl`) shu yo'ldan o'tadi. Prod F3 hujjatlarida (4 ta) tokenlar eski (xom) xesh bilan yozilgan — shuning uchun ular hali ishlaydi; yangilari yo'q. → **PR #433** (testli, `hujjat-ol`: xom xesh topmasa baytlarning mazmun xeshi bilan qayta tekshiriladi).
- **Fayl foydalanuvchiga beriladimi:** «Paketni yuklash» (`shartnomaPaketiniYuklash`) to'g'ridan-to'g'ri `downloadBlob` — serverga chiqmaydi, arxiv xatosi unga ta'sir qilmaydi (har doim beriladi). «Topshirildi» faylni bermaydi: arxivga yuklash xato bersa toast + qaytadi, yozuv saqlanmaydi, token esa mijozda allaqachon yechilgan va QAYTARILMAYDI (`F2OylikPaket.tsx:413-417`); «Qayta yig'ish» yangi ZIP (TAXMIN: manifest vaqti tufayli yangi xesh) → yana asos narx (130 token) — egasi qarori.
- Mavjud testlar xeshni sarf so'roviga bog'lamaydi (mock har qanday so'rovga javob beradi) — shuning uchun xato ushlanmagan; #433 da regressiya testi bor.

## Egasiga savollar (≤7)
1. F3 «с начала» oyni o'z ichiga oladimi (real zanjir — ha; eski kod «Game Club» — yo'q)? [ha → #435 merge / yo'q → yopiladi]
2. F3 «Отчётный период с» — oldingi F3 sanasimi (real) yoki oy 1-kunimi? [oldingi F3 / oy boshi]
3. F3 — obyekt boshiga bitta qator, 16 grafa (real) ni asosiy shakl qilamizmi, ish ro'yxatli `toliq` qolsinmi? [real asosiy / ikkalasi]
4. «Форма одобрена решением Республиканской комиссии…» izohi va «Форма № 3» yozuvi kerakmi (real hujjatda yo'q)? [olib tashlash / qoldirish]
5. Prorab narxni (`narx.write`) tahrirlashi mumkinmi (hozir `object.write` orqali ochiq)? [ha / yo'q]
6. AOSR zanjirda F2 dan OLDIN turishi (ShNQ) tasdiqlansinmi? [ha / F3 dan keyin]
7. Paket ZIP uchun «asos narx» (130 token) olinadimi yoki ichki hujjatlar to'langan bo'lsa ZIP bepulmi? [bepul / olinadi]

## Tekshirilmadi
Mobil/telefon ko'rinish qurilmada ochilmadi (kod asosida); real xlsx shrift/chegaralari; `forma3ShartnomaHujjat` real shartnoma bilan; prod rol ruxsatlari (`t2_men_v1`) — audit hisobi frontend ko'zgusidan; F3 PDF namunalari (poppler yo'q) — faqat xlsx; `docs/architecture/UZ_CONSTRUCTION_DOCUMENT_CATALOG…` bilan mos kelish; ОЖР sahifasi yo'qligi — grep (audit U12).
