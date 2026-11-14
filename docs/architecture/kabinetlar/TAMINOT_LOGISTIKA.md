# Ta'minot zanjiri: Yetkazuvchi, Logistika va pudratchi ombori (1-bosqich: tadqiqot va loyiha)

Sana: 2026-11-13. Kod yozilmadi. Manba: `main` (516b438f), prod (faqat o'qish: `sql_oqish`/`sxema`), `docs/architecture/BOZOR_TENDER_LOGISTIKA.md`.
Belgilar: **FAKT** = kod/ma'lumot dalili bor; **TAXMIN** = tekshirilmagan, egasiga savol.
Egasining talabi (12.11): logistika = yuk tashishdagi «taksi» (yuk egasi buyurtma beradi → yaqin tashuvchi → narx → kuzatuv → dalil → reyting); bozor/tender sklad ichiga tiqilmasin.

## 1. Xulosa (10 qator)
1. Zanjirning SERVER tomoni deyarli to'liq (buyurtma → qabul → sklad kirim + qarz; narx → narx manbasi; yuk ↔ zayavka/buyurtma FK). Prodda uni hech kim bosib o'tmagan: buyurtma 0, kirim-buyurtmali 0, chiqim 0, M-29 0.
2. «Logistika» deb atalgan sahifa (`/admin/logistika`) yuk tashish emas — zayavka + sklad + birja + material nomlari. Yuk tashish boshqa 3 joyda, «Ta'minot» guruhi ichida.
3. Bir ishga 3–5 kirish nuqtasi: narx so'rash 5 yo'l, zayavka 3 yo'l, yuk e'loni 2 yo'l, pudratchining o'z transporti — 10 RPC va 9 jadval bor, ekrani YO'Q.
4. Smeta МАТ → zayavka tanlovi prodda ishlamaydi: so'rov `kat=in.(mat,ob)` (kichik harf), bazada `МАТ`/`ОБ` (kirill, katta): mos qator 0 (bazada 50 126 ta bor).
5. Tashuvchi — kompaniya emas, foydalanuvchi profili (`t2_yb_tashuvchi.foydalanuvchi_id`, `kompaniya_id` NULL bo'lishi mumkin). Yuk egasi esa kompaniya talab qiladi (`t2_yb_yuk.kompaniya_id NOT NULL`) — yakka shaxs yuk bera olmaydi.
6. Yetkazuvchining o'z kabineti yo'q: «Yetkazuvchi: bugun» 4 katakning hammasi pudratchining Tender/Yuk birjasi sahifalariga olib boradi; katalog (bozor kabineti) alohida va bo'sh.
7. Ombor: 8 720 kirim 1C dan, hammasi obyektsiz (markaziy). Markaziy → obyekt «berdim» yo'li, obyekt qoldig'i (0 qator) va M-29 shu qoldiqdan yechadi: zanjir o'rtasi bo'sh.
8. Maqsad: 3 ko'z — (1) pudratchi ichidagi «Ta'minot» (zanjir qadamlari), (2) «Yetkazuvchi» kabineti, (3) «Logistika» kabineti (yuk egasi / tashuvchi / haydovchi). Yangi modul yo'q: mavjud RPC va sahifalar qayta joylanadi.
9. Baza tor (469/500 MB), lekin logistika jadvallari jami 2 MB: xavf joylashuv (har 5 s UPDATE) va 1C kirim (5,9 MB), «ko'p yozuv» emas.
10. Reja: 7 kichik PR, avval pudratchi ichidagi zanjir (PR1–PR3), keyin tashqi kabinetlar (PR4–PR7).

## 2. (a) Haqiqiy zanjir (qurilishda)
| # | Qadam | Kim (tomon · rol) | Hujjat | Tizimda hozir |
|---|---|---|---|---|
| 1 | Material ehtiyoji | PTO / smetachi | smeta МАТ/ОБ qatorlari | `t2_qator`: kompaniya 123 da 35 193 МАТ + 1 615 ОБ + 2 848 БЕЗСКЛАД (omborga kirmaydi) |
| 2 | Zayavka | prorab / PTO → ta'minotchi tasdiqlaydi | zayavka (talabnoma) | `t2_erp_taminot`: 1 qator (bekor) |
| 3 | Narx so'rovi / tender | ta'minotchi (xaridor) → yetkazuvchilar | RFQ, taklif, bayonnoma | `t2_birja_rfq`/`t2_bz_sorov`: 0 |
| 4 | Buyurtma (g'olib) | ta'minotchi ↔ yetkazuvchi | buyurtma / shartnoma | `t2_buyurtma`: 0 |
| 5 | Yetkazib berish | yetkazuvchi o'zi YOKI pudratchi transporti YOKI yollangan tashuvchi | yuk xati / TTN | `t2_yb_yuk`: 2 (qoralama, e'lon), `t2_tr_reys`: 0 |
| 6 | Omborga kirim | omborchi (qabul) | nakladnoy (kirim) | `t2_sklad_harakat`: 8 720 prixod (1C), buyurtmali 0 |
| 7 | Obyektga chiqim | omborchi → prorab | berish / chiqim | rasxod 0, `t2_sklad_qoldiq` 0 |
| 8 | M-29 | PTO / omborchi | M-29 (sarf, davr) | `t2_m29_hujjat`: 0 |
| 9 | Smeta/fakt bilan solishtiruv | PTO | M-29 norma ↔ fakt, F-2 | kod bor (`M29Native`), ma'lumot yo'q |
| 10 | To'lov | buxgalter / rahbar | to'lov, akt-sverka | `t2_qarz_asos` qabuldan hosil bo'ladi (kod bor), buyurtma 0 |

## 3. (b) Hozirgi holat jadvali
Holat: K = kerak (qoladi), T = takror, N = noto'g'ri joyda, O = o'lik (ma'lumot/foydalanuvchi yo'q yoki yo'l yo'q).
| Sahifa / RPC guruhi | Zanjir qadami | Kimniki | Holat | Dalil |
|---|---|---|---|---|
| `/admin/logistika` (`WrapperLogistika`: zayavka, sklad, birja, alias) | 2,3,6,7 | pudratchi ta'minotchisi | K, lekin nomi noto'g'ri | `test02/WrapperLogistika.tsx`; reestr nomi «Ta'minot va sklad» |
| `/admin/zayavka` (`TestZayavka`) | 2 | prorab/ta'minotchi | K; 2-nusxa wrapper tabida | `App.tsx:362`, wrapper `activeTab==='zayavka'` |
| `/admin/taminot` (`ErpTaminot`: zayavka/sklad/postavshik) | 2,6 | eski ERP | O | `App.tsx:351`; `lib/reestr` da yo'q, faqat URL |
| `TestBirja` (wrapper «Ta'minot va birja»), `t2_birja_*` | 3 | xaridor | T (tender oddiy nusxasi) | `t2_birja_rfq` ni `TenderSahifa` ham ishlatadi |
| `/admin/tender` (`TenderSahifa`, `t2_tender_*` 17 RPC) | 3,4 | xaridor VA yetkazuvchi bir sahifada | K, lekin ikki ko'z aralash | `YetkazuvchiBugun` «Narx berish» → `/admin/tender` |
| `/admin/tender-ochiq` + ochiq `/tender` (`t2_tn_*`) | 3 | xaridor / tashqi | beta, 0 ma'lumot | `t2_tn_ochiq_*`, `t2_tender_jurnal` 0 |
| `/admin/bozor-sorov`, `-kabinet`, `-moderatsiya`, ochiq `/bozor` (`t2_bz_*`) | 3 / katalog | xaridor / sotuvchi / moderator | T (3-narx so'rash yo'li) + K (katalog) | `t2_bz_sorov` 0, `t2_bz_elon` 0, `t2_bz_profil` 0 |
| `/admin/yuk-birjasi` (`YukBirjasiSahifa`, `t2_yb_yuk_*_v1`) | 5 | yuk egasi | T (eski avlod) | bir jadval `t2_yb_yuk`, `YukChaqirish` bilan |
| `/admin/yuk-chaqirish` (`YukChaqirish`, `t2_yb_p1/p2_*`) | 5 | yuk egasi | K (yangi avlod, «taksi») | 8 `p1` + 13 `p2` RPC, gateway aralash ishlatadi (`_shared/yuk-tashish.ts:17-34`) |
| `/admin/haydovchi` (`HaydovchiSahifa`: haydovchi + dispetcher bir sahifada) | 5 | tashuvchi firma + haydovchi | K, N joyda | reestr `ishJoyi:'bugun'`, `navGuruh:'shaxsiy'`, `ruxsat: []` |
| `/yuk` (`YukOchiq`, 15 qator) | kirish | begona | O (faqat 2 havola, «/» ga) | `YukOchiq.tsx:11-12` |
| `t2_tr_*` (reys, mashina, haydovchi, tarif, yoqilg'i; 10 RPC, 9 jadval) | 5 | pudratchining o'z transporti | O: ekran yo'q | `src` da faqat `lib/transport/holat.ts`; 0 qator |
| `/admin/yetkazuvchi` (`YetkazuvchiBugun`) | 3–5 | yetkazuvchi | K, lekin pudratchi menyusida | `sahifa.ts:126` `navGuruh:'taminot'` |
| Buyurtma komponentlari (`components/buyurtma/*`) | 4,6 | ikkala | K; mustaqil sahifasi yo'q (tender/zayavka ichida) | `BuyurtmaKabinet` 3 joyda ishlatiladi |
| Ombor (`components/ombor/*`, `t2_sklad_*`) | 6,7 | omborchi | K | `TestSklad` wrapper tabida |
| M-29 (`M29Native`, `t2_m29_bajar_v1`) | 8 | PTO | K (`fakt` guruhida) | ma'lumot 0 |

## 4. Nega egasi «noto'g'ri tashkil qilingan» deydi — 8 sabab
1. **Nom ≠ mazmun.** «Logistika» (`/admin/logistika`, menyuda «Ta'minot va sklad») — zayavka, sklad, birja. Haqiqiy logistika (yuk tashish) «Yuk birjasi», «Yuk chaqirish», «Haydovchi rejimi» nomlari ostida tarqoq (`sahifa.ts:144,147,152,153`).
2. **Yuk tashish pudratchi menyusining ichida.** `ishJoyi:'taminot'`, `navGuruh:'taminot'`, ruxsat `ICHKI_ISH`: yuk egasi sifatida qurilish xodimi ko'radi, tashuvchi/haydovchi uchun alohida kabinet yo'q; «Haydovchi rejimi» «Mening xizmatlarim» (shaxsiy) ostida. Egasi aytgan «hammasi bir joyda» aynan shu.
3. **Bir ishga ko'p kirish.** Narx so'rash: wrapper «birja» tabi, `/admin/tender`, `/admin/tender-ochiq`, `/admin/bozor-sorov`, ochiq `/tender`/`/bozor` (3 xil jadval oilasi: `t2_birja_*`, `t2_tn_*`, `t2_bz_*`). Zayavka: `/admin/zayavka`, wrapper tabi, `/admin/taminot`. Yuk e'loni: `YukBirjasiSahifa` va `YukChaqirish` (bir jadval, ikki avlod RPC).
4. **Smeta → zayavka uzilgan.** `TestZayavka.tsx:131`: `t2_qator?kat=in.(mat,ob)`; prodda `kat` = `МАТ`/`ОБ` (kirill, katta): kichik harfda 0 qator, kirillda 50 126. Ya'ni «smeta materiali bo'yicha miqdor/birlik» taklifi (`lib/zayavka-material.ts`) prodda bo'sh. Qolgan moslik — nom matni bo'yicha (`material_id` ixtiyoriy), bitta qator-bitta zayavka (ommaviy tanlov yo'q).
5. **Zanjir oxiri bo'sh va faqat 1C bilan to'lgan.** `t2_sklad_harakat` 8 720 ta — hammasi `prixod`, `manba='c11_warehouse_receipt_v1'`, `obyekt_id` NULL, buyurtmali 0, M-29li 0; `t2_sklad_qoldiq` 0; chiqim 0. M-29 (`t2_m29_bajar_v1`) aynan `t2_sklad_qoldiq(obyekt_id, nomi)` dan yechadi — u bo'sh, shuning uchun M-29 «sklad ma'lumoti yo'q» ko'rsatadi.
6. **Tashuvchi kompaniya emas, yuk egasi kompaniyasiz bo'lolmaydi.** `t2_yb_tashuvchi`: `foydalanuvchi_id` + ixtiyoriy `kompaniya_id` (1 qator, sinov 439, tur `firma`); `t2_yb_haydovchi` 0. Yuk egasi esa `t2_yb_yuk.kompaniya_id NOT NULL` + `procurement.*` ruxsati: kompaniyasiz foydalanuvchi yuk bera olmaydi; «Yuk e'lon qilish» tugmasi `/` ga qaytaradi. Bir kompaniya ham yuk egasi, ham tashuvchi bo'lishi (rol = munosabat) modelda yo'q.
7. **Buyurtma ↔ yuk bog'i ekranda yo'q.** FK bor (`t2_yb_yuk.buyurtma_id/zayavka_id`, `t2_sklad_harakat.buyurtma_id`), lekin ulanish faqat havola: `BuyurtmaRoyxati` «Mashina top» → `/admin/yuk-chaqirish?buyurtma=`; yetkazildi → ombor kirimi avtomatik EMAS (yetkazish holati va omborxona qabuli ikki alohida oqim). Yuk (2 ta) ning ikkalasida zayavka/buyurtma «-».
8. **Yetkazuvchi o'z uyida emas.** «Yetkazuvchi: bugun» 4 katak, lekin ularning har biri pudratchining sahifalariga (`/admin/tender`, `/admin/yuk-birjasi`, `#buyurtmalar`) olib boradi; menyuda pudratchi guruhida («Ta'minot»); katalog/narx (`bozor-kabinet`) alohida, bo'sh; to'lov holati RPC (`t2_yet_tolov_holati_v1`) bor, ekran bo'limi yo'q.
Qo'shimcha: pudratchining o'z transporti (`t2_tr_*`, reys tannarxi, yoqilg'i, tarif) ekransiz — «yuk tashish» pudratchiga faqat tashqi xizmat ko'rinadi.

## 5. (c) Uzilishlar
| # | Uzilish | Holat | Dalil / yechim yo'nalishi |
|---|---|---|---|
| U-L1 | smeta МАТ → zayavka | kod xato (harf) + faqat nom moslik | `TestZayavka.tsx:131`; tuzatish: `kat` kirill/`resurs_kodi` bo'yicha, `material_id`/`smeta_qator_id` yozish |
| U-L2 | zayavka → narx so'rovi/tender | bor (`zayavkadanQatorlar`, `bozor havola`), 2 yo'l | `lib/tender/zayavka.ts`, `lib/bozor/havola.ts`; bittasini asosiy qilish |
| U-L3 | buyurtma → yuk | havola, avtomatik emas | `BuyurtmaRoyxati.tsx:46`; `t2_yb_p1_yuk_qosh_v1` `buyurtma_id` oladi |
| U-L4 | yetkazildi → ombor kirimi | uzilgan: `t2_buyurtma_qabul_yakunla_v1` kirim yozadi, lekin yuk «yetkazildi» emas, xaridor «qabul» bosadi | `20261211100000_*`; yuk holati va qabulni bog'lash (xaridor qabuli = yetkazish dalili) |
| U-L5 | kirim → obyekt qoldig'i → M-29 | markaziy kirim obyektsiz; `t2_sklad_markaziy_berdim_v1` ishlatilmagan; qoldiq 0 | prod: harakat obyektsiz 8 720; «berdim» bo'lmasa M-29 hech qachon to'lmaydi |
| U-L6 | xarid narxi → F-2 narxi (max qoidasi) | buyurtma yaratilganda `t2_narx_manba` ga yoziladi (trigger, `20261214600200`); prodda `t2_narx_manba` 1 qator, buyurtmadan 0; F-2 ga tushishi smetachi tasdig'i | qoida to'g'ri, oqim ishlamagan |
| U-L7 | bir necha yetkazuvchi narxi → o'rtacha + xabar | bozor taqqosida bor (`BozorSorov`); tender/buyurtma yo'lida tekshirilmadi — TAXMIN | bitta joyda (narx manbasi tahlili) bo'lishi kerak |
| U-L8 | yetkazish xarajati → buyurtma/tannarx | `t2_buyurtma.yetkazish_narx` ustuni bor; yuk bitimi narxi unga yozilishi yo'q — TAXMIN | `t2_buyurtma` ustunlari |
| U-L9 | pudratchi o'z transporti ↔ yuk birjasi | `t2_yb_mashina.tr_mashina_id` bor, UI yo'q | O: `t2_tr_*` |

## 6. (d) Maqsad: uch alohida ko'z
### 6.1 Pudratchi ichidagi «Ta'minot» (ta'minotchi / omborchi)
Bitta ish joyi, zanjir tartibida: **Ehtiyoj → Zayavka → Xarid → Yetkazish → Ombor → Chiqim** (har bo'lim — bitta qadam, oldingisidan natija oladi).
- **Bugun:** tasdiq kutayotgan zayavkalar; narx kutayotgan so'rovlar; yo'ldagi yetkazishlar (qabul kutadi); qoldig'i yetmaydigan materiallar; kutilayotgan M-29.
- **Bo'limlar:** Ehtiyoj (smeta МАТ, qoldiq = smeta − so'ralgan − ombordagi), Zayavka (ommaviy tanlov), Xarid (bitta kirish: narx so'rash = tender; ichida «yopiq/ochiq/bozor» tanlovi), Buyurtma va yetkazish (yetkazuvchi buyurtmasi + «Mashina top» bir bosish), Ombor (kirim, markaziy→obyekt, chiqim), M-29.
- **Telefon:** omborchi «Qabul» (buyurtma qatorlari, foto, bitta tugma «hammasi keldi»), prorab «Zayavka» (qidiruv + miqdor). Hozirgi `fz-btn`, 48 px tugma qoidasi saqlanadi.
- **Mavjud sahifa taqdiri:** `/admin/logistika` → «Ta'minot» (nom o'zgaradi, tablar zanjirga mos); `/admin/zayavka`, `/admin/tender` → shu ichiga; `TestBirja` tabi — olib tashlanadi (tenderga); `ErpTaminot` — o'chiriladi; bozor-sorov — Xaridning bir varianti; yuk chaqirish — Yetkazish bo'limidan «Mashina top».

### 6.2 «Yetkazuvchi» kabineti (sotuvchi kompaniya yoki yakka sotuvchi)
- **Bugun:** yangi so'rovlar (narx ber), natijasi kutilayotgan takliflar, qadam kutayotgan buyurtmalar (qabul/boshlash/tayyor/topshirdim), yo'ldagi yetkazishlar, to'lov holati.
- **Bo'limlar:** Kelgan so'rovlar va tenderlar · Takliflarim · Buyurtmalarim · Yetkazishlarim (o'zi tashiydi yoki «transport so'ra» → Logistika) · To'lovlar (`t2_yet_tolov_holati_v1`, faqat xaridor grant bersa) · Katalog va narxlar (`t2_bz_elon`/`bz_profil`).
- **Telefon:** «Bugun» + narx berish formasi (qatorma-qator QQS siz) + «Topshirdim» (foto).
- **Mavjud sahifa taqdiri:** `YetkazuvchiBugun` kabinetning bosh ekrani bo'ladi; xaridor tomonidagi `TenderSahifa` dan sotuvchi rejimi ajratiladi (sotuvchi pudratchi tender sahifasiga tushmaydi); `bozor-kabinet` → Katalog; `bozor-moderatsiya` → platforma egasi ishi, kabinetdan tashqari.

### 6.3 «Logistika» kabineti: yuk egasi / tashuvchi / haydovchi
Taksi modeli: yuk egasi buyurtma beradi → tizim narx tavsiya qiladi (`narx_tavsiya`) → yaqin tashuvchiga chaqiriq (`t2_yb_p2_yaqin` trigger, `t2_yb_p1_yaqin_v1`) → birinchi qabul qilgan (qat'iy narx) yoki takliflar → kuzatuv → yetkazish dalili (foto, imzo, qabul kodi) → ikki tomonlama reyting.
| Ko'z | Bugun | Bo'limlar | Telefon |
|---|---|---|---|
| Yuk egasi | faol yuklarim, taklif kutayotganlar, yo'ldagilar | Yuk chaqirish (5 maydon), Yuklarim, Kuzatuv, Hisob (narx QQS siz), Reyting | 3 qadam, xarita, «Chaqirish» |
| Tashuvchi (firma dispetcheri) | bo'sh/band mashinalar, tayinlanmagan buyurtmalar | Park (mashina, haydovchi), Buyurtmalar, Tayinlash, Daromad | ro'yxat + «Tayinla» |
| Haydovchi | navbatdagi yuk, keyingi qadam | Yaqin yuklar, Mening reysim (keldi → yukladim → yo'lda → yetkazdim), Dalil foto, Daromad | bitta katta tugma, ekran o'chmaydi (wake lock) |
Kompaniyasiz yakka haydovchi: `t2_yb_tashuvchi` (`kompaniya_id` NULL) — hozirgi model buni qo'llaydi; yuk egasi tomonida ham «shaxsiy» (kompaniyasiz) variant kerak (Shaxsiy kabinet: `turi='shaxsiy'`, E1) — `yb_yuk.kompaniya_id` ni shaxsiy kompaniyaga bog'lash yetadi, sxema o'zgarmaydi (TAXMIN: tekshirilsin).
**Mavjud sahifa taqdiri:** `YukChaqirish` + `YukBirjasiSahifa` → bittasi (Yuklarim va Yuk chaqirish); `HaydovchiSahifa` → ikkiga ajratiladi (Haydovchi / Dispetcher); `YukOchiq` (`/yuk`) → haqiqiy ochiq kirish sahifasi; `t2_tr_*` → pudratchi «Ta'minot» ichida «Mening transportim» (yoki ixtiyoriy, §9 savol 4).

## 7. (e) Bog'lanishlar
| Qayerdan → qayerga | Qanday | Holat |
|---|---|---|
| Ta'minot → Yetkazuvchi | so'rov/buyurtma (`t2_tomon_aloqa` faol aloqa, 7 ta) | bor |
| Ta'minot → Logistika | «Mashina top» (buyurtma/zayavka → yuk, havola + `buyurtma_id`) | havola; ichki bog' PR |
| Yetkazuvchi → Logistika | «Transport so'ra» (yetkazuvchi — yuk egasi) | bor (havola) |
| Logistika → Ta'minot | yetkazildi + xaridor qabuli → ombor kirimi (qoralama) | uzilgan (U-L4) |
| Ta'minot → pudratchi yadrosi | kirim → obyekt qoldig'i → M-29 → fakt/F-2; narx manbasi → F-2 narxi (max) | M-29 va narx manbasi serverda bor |
| Yetkazuvchi → to'lov | qabul → `t2_qarz_asos` → to'lov holati (grant bilan) | serverda bor |
| Bir kompaniya — ikki rol | kabinetlar munosabatdan hosil bo'ladi: kompaniya ham yuk egasi (Logistika), ham sotuvchi (Yetkazuvchi) bo'lsa ikkalasi ham ko'rinadi, almashinadi | umumiy modelga mos; `t2_tomon_aloqa` + ro'yxatdan hosil bo'lishi kerak |
| Reyting | bitta modul: yuk reytingi bozor vitrinasida ham | `BOZOR_TENDER_LOGISTIKA §D` |

## 8. (f) Baza hajmi (≈469/500 MB)
- Logistika jadvallari jami **2 064 kB** (43 jadval): hajm xavfi yo'q. Eng og'ir — `t2_sklad_harakat` 5,9 MB (8 720 qator, 1C kirim, bir martalik).
- **Saqlanadi:** yuk, taklif, bron, hodisa (≈8–10 KB/reys), baho, dalil metama'lumoti (R2 kalit + sha256), reys xulosasi (km, vaqt, R2 kalit), buyurtma, narx manbasi.
- **Saqlanmaydi (Postgresda):** joylashuv tarixi. Hozir: `t2_yb_joy` bron bo'yicha 1 qator (`lat,lng,iz jsonb`) + `t2_yb_tashuvchi.joy_lat/lng/onlayn` har yangilanishda UPDATE (o'lik qatorlar), 5 s oraliq `yuk-tashish.ts` da Worker xotirasidagi `Map` (isolate-lokal, kafolatsiz). Tavsiya: tashuvchi qatorida faqat «onlayn» + oxirgi nuqta, ≥30 s throttle; iz — yetkazilgach R2 ga gzip (`izniArxivla` buni qiladi, `yb/iz/<bron>.json.gz`), Postgresda faqat masofa/davomiylik; R2 da 12 oy.
- **Foto/imzo/nakladnoy:** faqat R2, Postgresda kalit + xesh. 1C kirimni ko'paytirish: yangi import — `t2_sklad_harakat` o'sishi (≈0,7 KB/qator) uchun arxivlash siyosati (TAXMIN, alohida savol).

## 9. (g) Qurish rejasi: 7 kichik PR
Birinchi uchtasi pudratchi ichidagi zanjir, keyingi to'rttasi tashqi kabinetlar. Har PR migratsiyasiz yoki additive; har biri alohida yashil; bir ish — bir joy.
| PR | Nima | Tegadi | Test |
|---|---|---|---|
| 1 | **Smeta → zayavka tuzatish:** `kat` kirill/`resurs_kodi` bo'yicha tanlov, ommaviy zayavka (МАТ qatorlar), `material_id`/`smeta_qator_id` yoziladi; БЕЗСКЛАД ajratiladi | `TestZayavka`, `zayavka-material.ts`, `t2_erp_taminot` | egasining haqiqiy МАТ qatorlari bilan regressiya (maxfiy yozilmaydi) |
| 2 | **«Ta'minot» ish joyi:** `/admin/logistika` → zanjir tartibidagi tablar; `ErpTaminot`, `TestBirja` tabi olib tashlanadi; «Mashina top» va yetkazish bir joyda | `WrapperLogistika`, `sahifa.ts`, `App.tsx` | `navFiltr.test.ts`, reestr qamrovi |
| 3 | **Yetkazish → ombor → M-29:** yetkazish qabuli = kirim qoralamasi; markaziy → obyekt «berdim» ekrani; 1C kirimni obyektga bog'lash qoidasi | `BuyurtmaQabul`, `MarkaziyBerdimForm`, `t2_buyurtma_qabul_yakunla_v1` | `tomonlararo_zanjir_v1`/`oltin_zanjir_v1` 5- va 7-qadam |
| 4 | **«Yetkazuvchi» kabineti:** alohida bosh ekran, menyu pudratchi guruhidan chiqadi, sotuvchi rejimi tenderdan ajraladi, to'lovlar bo'limi, katalog ulanadi | `YetkazuvchiBugun`, `TenderSahifa`, `bozor-kabinet` | rol × sahifa jadvali |
| 5 | **«Logistika» — yuk egasi:** `YukChaqirish` + `YukBirjasi` bittaga, kompaniyasiz (shaxsiy) yuk egasi, kuzatuv | `yuk-tashish/*`, `yuk-birjasi/*`, `t2_yb_yuk_*` | server testi 7-qadam |
| 6 | **«Logistika» — tashuvchi va haydovchi:** `HaydovchiSahifa` → Haydovchi / Dispetcher, telefon ko'rinishi, yakka haydovchi onboarding, joylashuv throttle + R2 iz | `HaydovchiSahifa`, `yuk-tashish.ts` | `t2_yb_p2_*` acceptance |
| 7 | **Tozalash va bog'lash:** eski avlod (`t2_yb_yuk_*_v1` ekran, `t2_birja_*` UI, `/yuk` landing), `t2_tr_*` ekrani (yoki rad), reyting umumiy, narx o'rtachasi/max bir joyda | turli | to'liq vitest |

## 10. Egasiga savollar (≤7)
1. Kabinet nomlari: «Ta'minot» (pudratchi ichida), «Yetkazuvchi», «Logistika» — shu uch nom to'g'rimi? (a) ha, (b) «Logistika» o'rniga «Yuk tashish».
2. Narx so'rash BITTA kirish bo'lsin: tender (yopiq/ochiq/bozor — ichida tanlov). Bozor-sorov va birja tabi tenderga qo'shilsinmi? (a) ha, (b) bozor alohida qolsin.
3. Pudratchining o'z transporti (`t2_tr_*`: reys, yoqilg'i, tannarx) kerakmi? (a) ha — «Ta'minot» ichida, (b) hozir emas, o'chirmay muzlatish, (c) kerak emas.
4. Kompaniyasiz yuk egasi (shaxs) bo'la oladimi? (a) ha, (b) faqat kompaniya, shaxs — faqat haydovchi.
5. Yetkazildi → ombor kirimi: xaridor «qabul» bosgach qoralama avtomatik yaratilsinmi? (a) ha (omborchi tasdiqlaydi), (b) faqat omborchi qo'lda.
6. 1C dan kelgan 8 720 kirim obyektga bog'lansinmi (qoida: nomi/qabul qiluvchi bo'yicha)? (a) ha, qoida bilan, (b) markaziy qoladi, faqat yangi kirimlar obyektli, (c) qo'lda.
7. Bir necha yetkazuvchi narxi: arifmetik o'rtacha + xabar faqat bozorda emas, tender g'olibida ham ishlasinmi? (a) ha, (b) tenderda g'olib narxi (eng arzon).

## 11. Tekshirilmadi
- Ekranlarni brauzerda sinash (rol bo'yicha); faqat kod va prod ma'lumoti o'qildi.
- `t2_yb_p2_yaqin` triggerining haqiqiy ishlashi (tashuvchi 1, haydovchi 0 — sinov ma'lumoti yo'q).
- Tender/buyurtma yo'lida o'rtacha narx qoidasi; `yetkazish_narx` ga yozilishi.
- Kompaniyasiz yuk egasi sxemada ishlashi (§6.3 TAXMIN); sinov kompaniyalari (433–440) ichidagi to'liq zanjir yurishi.
- Rollar bo'yicha ruxsat (`ICHKI_ISH`, `supply.*`) matritsasi to'liq tahlil qilinmadi.
