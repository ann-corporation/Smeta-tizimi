# PUDRATCHI (QURUVCHI) ISH OQIMI VA INTERFEYS TASHKILI — MAHSULOT AUDITI

Sana: 2026-11-13. Repo: /home/user/integ (faqat o'qildi; kod, baza, git — o'zgartirilmadi).
Yo'llar `frontend/src/` ga nisbatan, agar `docs/`, `AGENTS.md` deb boshlanmasa. Format: `fayl:qator`.

## 0. Metod va cheklovlar (halol)
- Menyu/rol jadvallari kodni ishga tushirib (vite-node skripti, scratchpad) hisoblandi: `lib/nav/ishJoyiMenyu.ts`, `lib/nav/navFiltr.ts`, rol ruxsatlari — frontend ko'zgusi `lib/company-authorization/effective-authorization.ts` (ROLE_PERMISSIONS, taxm. 96-133-qatorlar). Prodda rol ruxsatlari bazadan (`t2_men_v1`) keladi — farq bo'lishi mumkin (TAXMIN). Modul bayroqlari "hammasi yoqiq" deb olindi.
- Mobil, tezlik haqidagi gaplar KOD asosida (sinfi/kenglik/import); qurilmada ochib ko'rilmadi, profil o'lchanmadi — hammasi «TAXMIN» deb belgilangan.
- Prod ma'lumot (docs/architecture/REESTR_HOLAT_2026-11-11.md:3-4): to'lov, qarz, buxgalteriya, HR jadvallari 0 qator; tasdiqlangan F2 aktlari 48. Ya'ni kod bor, lekin ish oqimining oxirgi yarmi (to'lov, qarz, sverka) hali amalda ishlatilmagan — bu ustuvorlikka ta'sir qiladi.
- Real mijoz nomi/summa yozilmadi.

## 1. HOZIRGI MENYU VA SAHIFALAR XARITASI (pudratchi rollari)

### 1.1 Tuzilma — bir vaqtda UCH tasnif va IKKI menyu
- Reestr: 82 sahifa (`lib/reestr/sahifa.ts` SAHIFALAR; 45 tayyor, 33 beta, 4 texnik). Ish joyi bo'yicha: obyekt 23, taminot 11, hujjatlar 10, kompaniya 10, bugun 9, tomonlar 9, moliya 5, platforma 4, sotuv 1.
- Uch tasnif bir sahifaga birdan yopishgan: `navGuruh/navBand` (eski sidebar, sahifa.ts:78-90 NAV_GURUH_META), `ishJoyi` (yangi 7 ish joyi, lib/reestr/ishJoyi.ts:6-28), `ilova` (8 ilova: PTO, Fakt va F2, Moliya, ... lib/ilova/ilovalar.ts:29-36). Foydalanuvchi uchun faqat bittasi kerak.
- Ikki sidebar: yangi «7 ish joyi» (sukut) va eski guruhli menyu (+ «Kundalik ishlar», «Qo'shimcha bo'limlar»); pastdagi tugma bilan almashadi (admin/AdminShell.tsx:114-115, 242-252, 350). `KUNDALIK_ISHLAR` (nav/navReestr.ts:85-92) FAQAT eski menyuda; yangi menyuda yo'q.
- Qo'shimcha: «Bugun» plitkalari (admin/sahifalar/Bugun.tsx), Ctrl+K, kontekst panelidagi ilova ishga tushirgichi (AdminShell.tsx:375). Yangi menyuda ilova filtri bekor (`ilova: 'hammasi'`, AdminShell.tsx:244) — ya'ni ishga tushirgich yangi menyuga ta'sir qilmaydi (TAXMIN: UI da ko'rinib turishi chalg'itadi).
- Bosh sahifa: yangi menyuda hamma `/admin/bugun` ga tushadi (admin/RolBoshSahifa.tsx:19); `ROL_BOSH_SAHIFA` (lib/nav/boshSahifa.ts:23-41) faqat eski menyu yoki kompaniyasiz holatda ishlaydi — ikki «bosh» qoidasi.

### 1.2 Har rol kirganda nimani ko'radi (hisoblangan)
«Asosiy» = sidebar bandi (tabli band 1 ta hisoblanadi), «Yana» = ish joyining «Yana…» ro'yxati. «Eski menyu» = eski sidebarda ko'rinadigan sahifalar soni.

| Rol | Kirishda (yangi menyu) | Ish joyi | Asosiy band | Yana | Eski menyu sahifa | Ko'radigan ish joylari |
|---|---|---|---|---|---|---|
| boss | Bugun (eski: /admin/pult) | 8 | 32 | 14 | 78 | Bugun, Obyekt, Hujjatlar, Ta'minot, Moliya, Tomonlar, Kompaniya, Uy sotish |
| rahbar (faqat o'qish) | Bugun | 8 | 34 | 12 | 76 | boss bilan bir xil |
| pto | Bugun (eski: /admin/obyektlar -> oxirgi obyekt) | 7 | 27 | 10 | 69 | Bugun, Obyekt, Hujjatlar, Ta'minot, Moliya, Tomonlar, Kompaniya(3 ta) |
| prorab | Bugun (eski: obyektlar) | 7 | 24 | 10 | 63 | pto bilan deyarli bir xil; Moliya da faqat «Shartnomalar» |
| bugalter | Bugun (eski: obyektlar) | 8 | 18 | 7 | 38 | Bugun, Obyekt(F2 o'qish), Hujjatlar, Ta'minot, Moliya, Tomonlar(yana), Kompaniya, Uy sotish |
| usta | Bugun = UstaBugun (telefon) | 4 | 9 | 1 | 12 | Bugun, Obyekt(Fakt+Foto), Hujjatlar(Mening imzom), Kompaniya(3) |
| brigadir | Bugun = UstaBugun | 5 | 9 | 2 | 13 | usta + Kadrlar(yana) |
| omborchi | Bugun | 5 | 10 | 5 | 20 | Bugun, Obyekt(faqat M-29), Hujjatlar, Ta'minot, Kompaniya |
| taminotchi | Bugun | 5 | 10 | 5 | 20 | Bugun, Hujjatlar, Ta'minot, Tomonlar(Yetkazuvchi: bugun), Kompaniya |

Manba: tomonProfil.ts:28-44 (rol profili), navFiltr.ts:51-60 (ko'rinish qoidasi).

### 1.3 Har rolga kerak bo'lmagan «shovqin» (ko'rinadi, lekin ishga aloqasi yo'q)
- «Bugun» ish joyi pto/prorab/boss uchun 6 band, shundan qurilishga tegishlisi 1–2: «Loyihachi: bugun» (sahifa.ts:141, ruxsat `ICHKI_ISH` orqali pto/prorab/boss ko'radi — bu loyihachi tashkilotining uyi), «Mening xizmatlarim» tabi: mutaxassis bozori + haydovchi rejimi (sahifa.ts:153,167) — usta, omborchi, hamma uchun (ruxsat `[]`), «Kurs», «Ish joylarim».
- Tomonlar: pto/prorab uchun «Subpudrat{subpudrat, subpudratchi}» — ikkinchisi subpudratchi KOMPANIYASINING uyi (sahifa.ts:128), bosh pudratchiga begona nuqtai nazar. boss/rahbar uchun ham «Yetkazuvchi: bugun» (sahifa.ts:126, taminotchi emas, yetkazuvchi tomonining uyi).
- Kompaniya: 3 ta «sozlama» sinonim: «Sozlamalar» (tizim-sozlama, sahifa.ts:159), «Sozlamalar markazi» (sozlamalar, :171), «Akkaunt markazi» (:169) + «Tizim o'rganishi» (osuvchi, :168 — nomi tushunarsiz) — usta ham, pto ham shuni ko'radi.
- Uy sotish (boss/rahbar/bugalter) — qurilish pudratchisi uchun emas; modul o'chirilsa yo'qoladi (menyuModulYoqilgan) — qaysi kompaniyada yoqilganini tekshirmadim.
- Usta menyusida bir vaqtda ham telefon «Bugun», ham desktop jadval `Fakt kiritish{fakt, foto}` (ruxsat: `'fakt.read+self.work.write'`, sahifa.ts:109) — ikki fakt kiritish yuzasi.
- Obyekt ish joyi pto/prorab uchun 9 band / 24 sahifa; ulardan faqat «Narxlash» bandida 7 tab (smeta-narxlash, narx-dalil, narx-tekshiruv, nakrutka, narxlar, narx-manbalari, oferta; sahifa.ts:102-108). Prorab ham `narx.write` ni `object.write` orqali oladi (effective-authorization.ts, `p.includes('object.write')` bloki) — narx tahriri prorabga ochiq ekani EGASI QARORI bo'lishi kerak (ruxsat o'zgarishi).

## 2. ZANJIR: HAR QADAM QAYERDA BAJARILADI

Qurilish zanjiri: shartnoma+smeta -> grafik -> kunlik fakt -> material -> AOSR/lab -> F2 -> F3/nakopitelniy -> to'lov/qarz/sverka -> subpudrat hisobi.

| # | Qadam | Sahifa(lar) | Marshrut | Fayl | Izoh |
|---|---|---|---|---|---|
| 1 | Shartnoma | Shartnoma liniyasi | /admin/shartnoma-liniya | admin/sahifalar/ShartnomaLiniya.tsx (yozish `shartnoma_saqla_v2`, api/t2-shartnoma-liniya.ts:42) | MOLIYA ish joyida (sahifa.ts:120), zanjirning boshida emas |
| 1b | Shartnoma (TAKROR) | Moliya -> «Shartnomalar» tabi | /admin/moliya?tab=shartnoma | test02/TestShartnoma.tsx (WrapperMoliya.tsx:5,33; yozish `shartnoma_saqla`, api/t2-shartnoma.ts:197) | Ikkinchi muharrir, boshqa RPC |
| 2 | Loyiha/obyekt | Loyihalar; Obyektlar | /admin/loyiha; /admin/obyektlar | test02/TestLoyiha.tsx; test02/TestObyektlar.tsx | «Obyektlar va smeta yuklash» deb nomlangan (sahifa.ts:94), lekin yuklash YO'Q (TestObyektlar.tsx faqat ro'yxat/yaratish; «yukla» so'zi faqat yuklanish holati) |
| 3 | Smeta yuklash/ko'rish | Obyekt ish joyi (tab: Smeta, Resurslar, Narxlar nazorati, Smeta yuklash, Versiyalar, Shartnoma doirasi) | /admin/holat/:id | admin/sahifalar/HolatNative.tsx:317-319 (TABLAR), SmetaYuklaNative (2551 qator) | Yuklash shu yerda yashirin tabda |
| 3b | Smeta tuzish | Smeta studiyasi | /admin/smeta-studio | admin/sahifalar/SmetaStudio.tsx | Mustaqil ish joyi |
| 3c | Narxlash | 7 sahifa | /admin/smeta-narxlash, narx-dalil, narx-tekshiruv, nakrutka, narxlar, narx-manbalari, oferta | admin/sahifalar/*Narx*, NakrutkaNative, OfertaNative | Hammasi bir «Narxlash» bandida |
| 4 | Ish grafigi | Ish grafigi va pul oqimi (beta) | /admin/grafik | admin/sahifalar/GrafikSahifa.tsx | «Obyektlar va loyihalar» 4-tabi; zanjir chizig'ida YO'Q |
| 5 | Kunlik fakt (desktop) | Fakt kiritish (3 rejim: jurnal/xotiradan/daraxt) | /admin/fakt | admin/sahifalar/FaktNative.tsx:31, FaktJurnal.tsx (1261 q), XotiradanFakt.tsx | |
| 5b | Kunlik fakt (telefon) | Bugun -> UstaBugun (qoralama, oflayn) | /admin/bugun | admin/sahifalar/UstaBugun.tsx | faqat usta/brigadir |
| 5c | Naryad (brigada) | Naryad | /admin/naryad | admin/sahifalar/Naryad.tsx | qabul -> `fakt_yoz_v2` (yana bir fakt yozuvchi) |
| 5d | Foto-dalil | Fakt tabi | /admin/foto | admin/sahifalar/FotoLenta.tsx | |
| 5e | Ish varag'i | Obyekt ish joyi rejimi | /admin/holat/:id | admin/sahifalar/IshVaraq.tsx (HolatNative.tsx:469) | fakt yozadi; `/admin/fakt` bilan ikkinchi yuza |
| 6 | Material: zayavka | Zayavkalar | /admin/zayavka (+ Logistika 1-tabi) | test02/TestZayavka.tsx; test02/WrapperLogistika.tsx:15 | Ikki joyda: alohida band VA Logistika tabi |
| 6b | Material: kirim/qoldiq | Ta'minot va sklad (Zayavkalar, Sklad, Birja, Material nomlari) | /admin/logistika | test02/WrapperLogistika.tsx, TestSklad.tsx | tab URLda emas (useState), sukut = Zayavkalar |
| 6c | Material: kirim fakturasi | Moliya -> «Fakturalar (PDF, AI)» | /admin/moliya?tab=faktura | test02/TestFaktura.tsx (sbSkladgaYozish, :3) | Omborga kirim, lekin MOLIYA da |
| 6d | Material sarfi M-29 | М-29 | /admin/m29 | admin/sahifalar/M29Native.tsx (+M29Chiqim) | «Obyekt» ish joyida, ombor ma'lumotidan |
| 6e | Xarid | Tender / Ochiq tender / Bozor / Yuk chaqirish | /admin/tender, tender-ochiq, bozor-sorov, yuk-chaqirish | admin/tender/*, admin/bozor/*, admin/yuk-tashish/* | hammasi «Yana…» |
| 7 | Yashirin ish akti + lab | АОСР va laboratoriya | /admin/aosr | test02/TestAosr.tsx (722 q) | stepper chizig'ida YO'Q |
| 7b | Lab (qo'shimcha) | Laboratoriya kabineti; Hujjat aylanishi shablonlari | /admin/laboratoriya; /admin/hujjat-aylanish | admin/laboratoriya/LabKabinet.tsx; admin/zakazchik/HujjatAylanish.tsx | lab protokoli 3 joyda |
| 8 | F2 tayyorlash (fakt dan) | F2 tayyorlash | /admin/f2-tayyorlash | admin/sahifalar/F2TayyorlashNative.tsx (1305 q) | |
| 8b | F2 import (tayyor fayl) | F2 import | /admin/f2 | admin/sahifalar/F2ImportV3.tsx (1931 q) + F2V3Workbench (2070 q) | KUNDALIK_ISHLAR da ham |
| 8c | F2 tasdiqlash + hujjat | F2 tarixi va tasdiqlash | /admin/f2-tarix | admin/sahifalar/F2TarixNative.tsx | tasdiq VA chop shu yerda |
| 8d | F2 reestr + oylik paket | F2 reestri | /admin/f2-reestr | admin/sahifalar/F2Reestr.tsx (+F2Portfel, F2OylikPaket) | kompaniya miqyosida |
| 9 | Forma 3 / nakopitelniy | Nakopitelniy va F3 | /admin/nakopitelniy (?f3=shartnoma) | admin/sahifalar/NakopitelniyVedomost.tsx (779 q) | F3 uchun alohida sahifa yo'q |
| 10 | To'lov | Moliya -> To'lovlar; Nakopitelniy shartnoma bloki; Qarzdorlik asos qatori | /admin/moliya?tab=tolov; /admin/nakopitelniy; /admin/qarzdorlik | test02/TestTolov.tsx + components/moliya/TolovForma.tsx; NakopitelniyVedomost.tsx:620 (`tolovYoz`); Qarzdorlik.tsx:30-35 | 3 kiritish joyi |
| 11 | Qarzdorlik / sverka | Qarzdorlik (+Debitor), Buxgalteriya (Hisob-kitob, Sverka), Solishtiruv | /admin/qarzdorlik, buxgalteriya, solishtiruv | Qarzdorlik.tsx, DebitorPanel.tsx, admin/buxgalteriya/*, Solishtiruv.tsx | qarz+buxgalteriya `qoshimcha` tab |
| 12 | Subpudrat hisobi | Subpudrat boshqaruvi (topshirish -> narx -> akt qabul -> marja) | /admin/subpudrat | admin/subpudratchi/SubpudratBoshqaruv.tsx | to'lov/qarzga havola YO'Q |
| 13 | Buyurtmachiga topshirish | Taqdimlar / Murojaatlar / Hujjat aylanishi / Zakazchik kabineti | /admin/taqdimlar, murojaatlar, hujjat-aylanish, zakazchik | admin/zakazchik/* | «Kiruvchi quti» 2 joyda (TaqdimlarInbox.tsx:2-4 va HujjatAylanish.tsx:2-4) |

### 2.1 TAKROR bajariladigan ishlar (bitta ish — 2–5 joy)
1. Kunlik fakt yozish: kamida 8 UI yuzasi `fakt_yoz_v2`/`faktTogriYoz` ga yozadi: FaktJurnal, XotiradanFakt, Daraxt (SmetaTree onFaktSave, FaktNative.tsx:109), IshVaraq (HolatNative.tsx:469), UstaBugun, Naryad (qabul), FaktQamrov (100% belgisi), FaktF2Tenglash/FaktEgizakOyna/FaktTiklash (fayllar `grep fakt_yoz` ro'yxati), F2ImportV3, AI yordamchi (`lib/ai-yordamchi/buyruq-vositalar.ts`). Domen qoidasi «bitta ish — bitta fakt» (docs/architecture/DOMEN_SHARTNOMALARI.md:34) server tomonda saqlanadi, lekin foydalanuvchi uchun «fakt qayerda kiritiladi?» javobi bitta emas.
2. Shartnoma muharriri: ShartnomaLiniya (`shartnoma_saqla_v2`) vs TestShartnoma Moliya tabida (`shartnoma_saqla`) — ikki RPC versiyasi (api/t2-shartnoma.ts:197 vs api/t2-shartnoma-liniya.ts:42). Bir shartnoma ikki joyda ikki xil maydon to'plami bilan tahrirlanadi (TAXMIN: maydonlar to'plami farq qiladi; ikkala forma ham mavjud).
3. To'lov yozish: `TolovForma` (sbT2TolovYoz, api/t2-buxgalteriya.ts:117) va Nakopitelniy shartnoma bloki (`tolovYoz`, api/t2-nakopitelniy.ts:229) — bir xil `tolov_yoz` amali, ikki forma; Qarzdorlik esa «to'lov» asos qatorini ALOHIDA `qarzdorlik_saqla_v1` bilan yozadi (api/t2-qarzdorlik.ts:47; ASOS_TURLAR `tolov`, Qarzdorlik.tsx:30-35) — ikki haqiqat manbai xavfi (TAXMIN: ikki jadval).
4. F2: tayyorlash (fakt dan), import (fayldan), F2 Tarixi (tasdiq), F2 reestri (+paket), Fakt ichidagi «F2 tenglash», Obyekt sahifasidagi «F2 import»/«Nakopitelniy» tugmalari (HolatNative.tsx, nav tugmalari) — 5 sahifa, 2 ta eski/yangi juftlik: eski `TestF2` (570 q) hali /admin/test/smeta da (App.tsx:335, faqat superadmin), `/admin/f2-eski` -> /admin/f2.
5. «Keyingi qadam»: ikki mustaqil vidjet BIR sahifada (HolatNative): `ObyektQadamlari` (4 qadam: Fakt, F2, Forma 3, Hujjatlar; lib/pto-markazi/keyingiQadam.ts) va `KeyingiQadamPanel` (6 qadam: Smeta, Podval, Fakt, F2, Tasdiqlash, Portfel; lib/qollanma/keyingiQadam.ts, components/qollanma/KeyingiQadamPanel.tsx:11-13,60-77) — HolatNative.tsx:350 va :370; ikkalasi bir xil `data-testid="keyingi-qadam"`; ikkalasi akt reestrini alohida o'qiydi (KeyingiQadamPanel.tsx:25-30, useQadamMalumot.ts:34) — bir sahifa ochilishida kamida 2 marta bir xil so'rov.
6. Boshqaruv «holati» ko'rinishlari: Direktor pulti (pult), Rahbar paneli (dashboard) — bir bandda 2 tab (sahifa.ts:92-93, `DirektorPult.tsx`, `BossDashboard.tsx`), Bugun, Ish joylarim, Solishtiruv, Obyekt ish joyi (holat/:id), F2 reestri, Hujjat nazorati — 8 «bir qarashda holat» yuzasi.
7. Hujjatlar ombori: «Hujjatlar» (documents = fayl menejeri, pages/DocumentsPage.tsx:1-7) va «Fayllar (saqlash)» (storage = TestSaqlash.tsx:1-9, sahifa.ts:133) — ikkita fayl ko'rinishi bir bandda. Kiruvchi hujjat: Taqdimlar (kelgan/yuborilgan), Hujjat aylanishi (kiruvchi quti, xatlar, shablonlar), Murojaatlar, Zakazchik kabineti — 4 yuza (docs/architecture/EKOTIZIM_ARXITEKTURA_V2.md:25 «Bugun -> Kiruvchi» rejalangan).
8. Zayavka: alohida band (/admin/zayavka, sahifa.ts:145) VA Logistika 1-tabi (WrapperLogistika.tsx:15,22-26).
9. Lab protokol: AOSR sahifasi «Laboratoriya» varag'i (TestAosr.tsx:1-14), LabKabinet (/admin/laboratoriya), HujjatAylanish shablonlari.
10. Akt-sverka: SverkaImportPanel (Nakopitelniy), ShartnomaZanjir, Buxgalteriya (SverkaTomon, HisobKitob), F2OylikPaket (sverkaXlsx).

### 2.2 Eskirgan / hech qayerdan ochilmaydigan / nomi tushunarsiz
- Hech qayerdan import qilinmaydi: `admin/sahifalar/AdditionalReplacementNative.tsx` (202 q), `test02/WrapperPortfel.tsx` (59 q) va faqat unga bog'liq `test02/TestFakt.tsx` (296 q) — o'lik kod (men tekshirgan importlar grafida 0 havola).
- Faqat qo'lda URL / superadmin: `/admin/test/*` (TestSmetaBirlashgan->TestF2, TestDaraxt, TestTolov, TestFaktura, TestHisobot, TestTizim) App.tsx:333-345; `/admin/texnika|taminot|sifat` (ErpTexnika/ErpTaminot/ErpSifat, App.tsx:350-352 — reestrda yo'q, menyuda yo'q); `/boss/eski` (Umumiy). docs/architecture/AXLAT_TOZALASH_2026-11-11.md §2 buni «egasi qarori» deb qoldirgan.
- Menyuda faqat «Yana…»da, ammo kundalik ish uchun zarur: Zayavkalar (sahifa.ts:145 qoshimcha), Kontragentlar (:124), Qarzdorlik, Buxgalteriya (qoshimcha tab), Texnik nazorat. Zayavka ombor/ta'minot uchun asosiy bo'lishi kerak.
- Nomi tushunarsiz: «Tizim o'rganishi» (osuvchi), «Mening xizmatlarim» (mutaxassis bozori), «LRV», «RES», «Slichitelniy», «Oferta», «Nakrutka», «Solishtiruv (qayerda farq bor)», «Ish varag'i», «Mindmap (xarita)», «Ish joylarim» (aslida kompaniyalarim).
- Beta holatdagi sahifalar zanjirning o'rtasida: grafik, naryad, qarzdorlik, buxgalteriya, loyiha-smeta, zayavka (sahifa.ts `holat: 'beta'`; 33 sahifa beta). Pudratchi uchun muhim qadamlar «beta» deb belgilangan.
- Ikkinchi, qo'lda yuritiladigan sahifa ro'yxati: `lib/sayt-xaritasi/pageCatalog.ts` (68 yozuv): kalitlari reestrnikidan farq qiladi (`sozlamalar` -> /admin/tizim-sozlama, `sozlamalar-markazi` -> /admin/sozlamalar; `aloqalar` redirect bo'lgan yo'l hamon bor; `aosr` nomi «QA/QC — AOSR»). AGENTS.md §5 «ikkinchi ro'yxat yaratilmaydi» qoidasiga zid.

## 3. ZANJIRDAGI UZILISHLAR

| ID | Uzilish | Dalil |
|---|---|---|
| U1 | Qadam chizig'i Faktdan boshlanadi; shartnoma, smeta, grafik chiziqda YO'Q. Smeta yo'q bo'lsa faqat «Smetani yuklang» chiqadi | admin/components/ObyektQadamlari.tsx:25-30 (QADAMLAR = Fakt, F2, Forma 3, Hujjatlar); lib/pto-markazi/keyingiQadam.ts:33-35 |
| U2 | AOSR zanjirda F3 DAN KEYIN (4-qadam), «Hujjatlar» chipida holat yo'q, «Keyingi qadam» hech qachon AOSR ni tavsiya qilmaydi. Haqiqatda yashirin ishlar akti F2 topshirishdan oldin yoki u bilan birga kerak; F2 tayyorlash o'zi «AOSRsiz ishlar» ogohlantirishini chiqaradi (lib/f2-tayyorlash-korinish.ts:127 va F2TayyorlashNative.tsx:1113 «АОСР yaratish» havolasi) | ObyektQadamlari.tsx chipOl() (hujjatlar -> undefined); keyingiQadam.ts (kodlar: smeta-yoq, fakt-yakunla, import-davom, f2-tasdiqla, fakt-kiriting, f2-yasang, forma3, paket — aosr yo'q). Tartib qoidasi — TAXMIN (ShNQ amaliyoti), egasi tasdiqlasin |
| U3 | Qadam chizig'i faqat 5 sahifada: Fakt, F2 tayyorlash, F2 import, Nakopitelniy, Obyekt. AOSR, M-29, Naryad, Foto, F2 tarixi, Moliya, Qarzdorlik, Shartnoma sahifalarida YO'Q — ulardan zanjirga qaytish yo'li yo'q | grep `<ObyektQadamlari`: F2ImportV3.tsx:1533, F2TayyorlashNative.tsx:1147, FaktNative.tsx:84, HolatNative.tsx:350, NakopitelniyVedomost.tsx:454 |
| U4 | Zanjir oxiri: F3 dan keyin «Hammasi joyida -> F2 paketi» (kompaniya reestri). To'lov, qarz, akt-sverka qadami yo'q; F3 -> to'lov o'tish tugmasi yo'q | keyingiQadam.ts:54 (`kod:'paket'`, qadam `f2-paket`) |
| U5 | F2 tayyorlash -> tasdiqlash boshqa sahifada; o'tish faqat 12 soniyalik toast tugmasi va pastdagi «F2 tarixi» havolasi | F2TayyorlashNative.tsx:809,835,1281 |
| U6 | Obyekt sahifasida F2 uchun faqat «F2 import» va «Nakopitelniy va F3» tugmalari; «F2 tayyorlash» (asosiy yo'l) yo'q | HolatNative.tsx (nav ichida `navigate('/admin/f2?obyekt=…')`, `…/nakopitelniy…`) |
| U7 | Subpudrat: akt qabul -> xarajat yoziladi, lekin to'lov/qarzdorlik/akt-sverkaga havola yo'q (faqat kontragentlar va tender havolalari) | admin/subpudratchi/SubpudratBoshqaruv.tsx:159-197 |
| U8 | Ma'lumot qayta kiritiladi: (a) Qarzdorlik asos qatorlari («bajarilgan ish», «to'lov») qo'lda yoki Excel orqali — F2/F3/to'lovdan avtomatik emas (TAXMIN); (b) F2->buxgalteriya provodka ulanmagan (docs/architecture/REESTR_HOLAT_2026-11-11.md #4 «Chala»); (c) shartnoma ikki muharrirda | Qarzdorlik.tsx:30-35 (+ import, `qarzdorlikImport`); REESTR_HOLAT:#4 |
| U9 | Shartnoma — zanjirning 1-qadami, lekin MOLIYA ish joyida va prorab uchun «Moliya» faqat shu bitta band | sahifa.ts:120 (ishJoyi moliya) |
| U10 | Ombor chizig'i: zayavka -> (tender/yuk/so'rov havolalari bor, TestZayavka.tsx:288-295) -> sklad -> M-29 (TestSklad.tsx:288 havola bor) — yaxshi; lekin M-29 dan AOSR/F2 ga havola yo'q, M-29 «Obyekt» ish joyida, omborchi uni bitta band ostida ko'radi; ombor tabi URLda emas, sukut tab «Zayavkalar» («Ombor (kirim, chiqim)» yorlig'i shu yerga olib boradi, navReestr.ts:91) | WrapperLogistika.tsx:15 vs WrapperMoliya.tsx:18-20 (u useSearchParams ishlatadi) |
| U11 | Prorab: usta qoralamalarini tasdiqlash (UstaKutilmoqda) faqat Fakt sahifasining tepasida (fakt.write bo'lsa), «Bugun» da ko'rinmaydi; «Bugun» plitkalarida sonlar yo'q | FaktNative.tsx:36 (UstaKutilmoqda); Bugun.tsx:31-63 (faqat havolalar) |
| U12 | YO'Q NARSALAR (pudratchiga kerak): (1) Ishlarning umumiy jurnali (ОЖР, DOC-05) — katalogda A-sinf hujjat (docs/architecture/UZ_CONSTRUCTION_DOCUMENT_CATALOG_AND_TEMPLATES_V1.md:116,140-167), kodda sahifa topilmadi (grep «umumiy jurnal/ОЖР» 0); (2) prorabning kunlik hisoboti direktorga (Bugun da avtomatik xulosa); (3) oylik yopish kontrol ro'yxati (obyekt x oy: fakt -> AOSR -> F2 -> F3 -> to'lov) bitta jadvalda; (4) akt-sverkani chop etish (REESTR_HOLAT #4 «Yo'q»); (5) «Mening KPI» prorab uchun (REESTR_HOLAT #3) |

## 4. INTERFEYS IZCHILLIGI VA MOBIL

### 4.1 Obyekt tanlash
- Yagona «Ish doirasi» paneli (loyiha/obyekt/davr/manba) FAQAT `PTO_ROUTE_PREFIXES` ro'yxatidagi sahifalarda chiqadi (umumiy/kontekst/PTOWorkspaceContext.tsx:92-117, 535). Unga kirmaydi: /admin/f2-reestr (prefiks `/admin/f2` faqat aniq yoki `/admin/f2/…`), moliya, qarzdorlik, shartnoma-liniya, zayavka, subpudrat, grafik, loyiha-smeta, solishtiruv, obyektlar, smeta-studio, hujjat-aylanish.
- Panelsiz sahifalarda har biri o'z `<select>`i: Qarzdorlik, ShartnomaLiniya, F2Reestr, F2Portfel, F2OylikPaket, LoyihaSmetaFakt, SmetaStudio, BossDashboard, StudioBosqichlar… (grep: ObyektOptionlari ishlatmay obyekt `<select>` yozgan 20 ta fayl).
- Yozuvlar turlicha: «Obyekt tanlang» (panel), «-- obyektni tanlang --» (FaktNative.tsx, HolatNative.tsx), «Tanlang» (NakopitelniyVedomost.tsx:460). Panelning matnlari `t()` siz va ingliz aria-label («PTO loyiha», «Source document», «Revision», PTOWorkspaceContext.tsx:563-587) — 4 tilli qoidaga (AGENTS.md §2a) zid.
- Panel va sahifa ikkalasida ham obyekt tanlash ko'rinishi mumkin (FaktNative.tsx:86 `!workspace.isProvider`), `/admin/holat/:id` uchun panel navigatsiya qiladi (PTOWorkspaceContext.tsx:537-542) — maxsus holat.

### 4.2 Oy tanlash
Bir tushuncha — 5 xil boshqaruv va 4 xil nom: panel `type="month"` «Davr» (PTOWorkspaceContext.tsx:574, izoh: «Yagona oy»), Nakopitelniy `select` «Davr» (NakopitelniyVedomost.tsx:466-467), M-29 `select` «Hisobot oyi» (M29Native.tsx:100-101), F2OylikPaket `type="month"` «Oy»/«Hisobot oyi» (F2OylikPaket.tsx:510-511), Qadam chizig'i «Ish oyi» (faqat o'qish; ObyektQadamlari.tsx), HR `select` «Oy» (admin/hr/HrMen.tsx:32). Qaysi biri «haqiqiy oy» ekani noaniq (URL kaliti ham 3 xil: davr/oy/period, PTOWorkspaceContext.tsx:80).

### 4.3 Summa ko'rinishi
- Qoida: AGENTS.md §2b — ustamali (asosiy) + ustamasiz (yonida), QQS alohida yorliq. Amalda: DirektorPult «uchlik: QQS bilan birinchi · ustamali · ustamasiz» (DirektorPult.tsx:4-5); F2OylikPaket «QQS bilan asosiy, ustamali va ustamasiz yonida» (F2OylikPaket.tsx:5-6); REESTR_HOLAT: F3/to'lov QQS bilan, F2 ustamasiz alohida ustun. Foydalanuvchi bir xil raqamni turli ustunlikda ko'radi.
- `SummaJuft` Moliya sahifalarida 0 marta, oddiy `FmtN` (TestTolov 4, TestShartnoma 3, Qarzdorlik 3, TestFaktura 6, TestSklad 3); F2/Fakt sahifalarida `SummaJuft` bor. To'lovlar haqiqiy pul harakati bo'lgani uchun ustamasiz qoida qisman asosli (test02/TestTolov.tsx izohi), lekin shartnoma summalari (TestShartnoma) uchun qoida buzilishi mumkin — TAXMIN, tekshirish kerak.
- «Fakt» (bajarilgan hajm) va «Faktura» (kirim hisob-fakturasi, TestFaktura) va F3 dagi «ESF» (components/forma3/Forma3EsfBolim.tsx) — uch xil «faktura/fakt» so'zi turli ma'noda.

### 4.4 Nomlash (bir sahifa — bir nom bo'lishi kerak)
| Sahifa | Menyu | Sahifa sarlavhasi | Boshqa joyda |
|---|---|---|---|
| /admin/aosr | «АОСР va laboratoriya» (sahifa.ts:132) | «Ijro hujjatlari: АОСР va laboratoriya» (TestAosr.tsx:409) | «Yashirin ish akti» (navReestr.ts:90), «QA/QC — AOSR» (pageCatalog.ts), qadam chizig'ida «Hujjatlar» |
| /admin/nakopitelniy | «Nakopitelniy va F3» (sahifa.ts:117) | «Nakopitelniy vedomost» | «Forma 3 va nakopitelniy» (navReestr.ts:89), qadam «Forma 3» |
| /admin/f2 | «F2 import (tayyor F2 faylidan)» | «F2 import» | «F2 faylni yuklash (Excel)» (navReestr.ts:88) |
| /admin/logistika | «Ta'minot va sklad» | tab «Sklad (qoldiq)»/«Ombor (sklad)…» (TestSklad.tsx:139) | «Ombor (kirim, chiqim)» |
| /admin/obyektlar | «Obyektlar va smeta yuklash» | «Loyihalar va obyektlar» (TestObyektlar.tsx:207) | band «Obyektlar va loyihalar»; /admin/loyiha sarlavhasi «Loyihalar» |
| /admin/holat | «Smeta va Fakt / LRV» | obyekt nomi / «Obyekt ish joyi» (HolatNative.tsx ~335) | |
| /admin/fakt | «Fakt kiritish» | «Bajarilgan ishlar (Fakt)» (FaktNative.tsx ~83) | |
«Ish joyi» so'zi 3 ma'noda: sidebar bo'limi (7 ish joyi), «Ish joylarim» (kompaniya almashtirgich), «Obyekt ish joyi» (/admin/holat sarlavhasi) + «Ish doirasi» (panel).

### 4.5 Saqlash/tasdiqlash tugmalari
«Saqlash» 47, «Tasdiqlash» 18, «Yuborish» 12 marta (grep t('…') admin+test02). Bitta «qoralama -> tasdiq» semantikasi uchun harakat fe'llari turlicha: usta «yuborish» (qoralama), Fakt «saqlash», F2 «qoralama yaratish/yangilash (n)», tasdiq alohida sahifada, AOSR «Saqlash» + «Zakazchiga yuborish». Yagona qoida yo'q (TAXMIN: UX qo'llanma kerak).

### 4.6 Mobil (prorab/usta)
- Yaxshi: UstaBugun (≤375px dizayn, 56px tugmalar, oflayn navbat, foto siqish, ovozli kiritish): admin/sahifalar/UstaBugun.tsx:1-8, 22-23.
- Muammo 1: UstaBugun faqat `usta`/`brigadir` uchun (lib/reestr/tomonProfil.ts:60-64); fayl sarlavhasi «USTA/BRIGADIR/PROROB» deydi (UstaBugun.tsx:1), lekin prorabda `fakt.write` bor -> «Bugun» da oddiy plitkalar (tomonProfil.ts:31: fakt, obyektlar, m29, holat, aosr, zayavka) va /admin/fakt jadvali: `min-w-[980px]` (FaktJurnal.tsx:1188) — telefonda gorizontal siljish (TAXMIN: qurilmada tekshirilmagan).
- Muammo 2: Kontekst paneli telefonda 8 ta boshqaruv: menyu, ilova ishga tushirgich, orqaga/oldinga, kompaniya, loyiha, obyekt, oy, «Manba», Jarvis, qidiruv (admin/AdminShell.tsx:371-382) — TAXMIN: tor ekranda 2–3 qatorga o'raladi.
- Muammo 3: jadvalga asoslangan sahifalar: Qarzdorlik `min-w-[1080px]/[980px]/[760px]`, Naryad `min-w-[640px]` (overflow-x bor, lekin telefonda qulay emas); F2 tarixi/tayyorlash ikki ustunli (xl dan pastda bir ustun — yaxshi).
- Muammo 4: ustaga ham desktop «Fakt kiritish» menyuda qoladi (sahifa.ts:109 `fakt.read+self.work.write`).

### 4.7 Tezlik (TAXMIN — o'lchanmagan)
- HolatNative (pto/prorab eski menyuda ham, obyekt sahifasi) 0 ta `lazy()`, 46 ta import: SmetaYuklaNative (2551 q), SmetaVersiyaFarq (600 q), IshVaraq (466 q), ResursVedomostNative, NarxNazoratNative, ObosnovaniePanel, ContractScopePanel, MarketPriceComparison hammasi sahifa bilan birga yuklanadi (HolatNative.tsx:2-46), garchi ko'pi faqat tab bosilganda kerak.
- Bir sahifa ochilishida ikki «keyingi qadam» vidjeti = akt reestrini ikki marta o'qish (4-bo'lim 2.1.5).
- Katta ekranlar: F2ImportV3 1931 q + F2V3Workbench 2070 q + F2TayyorlashNative 1305 q + FaktJurnal 1261 q — bo'lib yuklash (lazy ichki panellar) afzal.

## 5. TAKLIF — PUDRATCHI UCHUN IDEAL TUZILMA

### 5.1 Tamoyil
Sidebar tartibi = qurilish zanjiri tartibi. Har rol kirganda o'z «Bugun»ini ko'radi; pastda ko'pi bilan 6 band; boshqasi Ctrl+K da. Bitta ish — bitta joy; takrorlari yo'naltiriladi (redirect, `eskiYollar`), hech narsa o'chirilmaydi (AGENTS.md §6; reestr.ishJoylari testlari).

### 5.2 Yuqori daraja (6 + akkaunt)
1. **Bugun** — rol uyi (5.3).
2. **Obyekt** — Obyektlar (ro'yxat + «Smeta yuklash» tugmasi), Obyekt kartasi (smeta, shartnoma, grafik bir joyda), Smeta studiyasi, Narxlash (tablar; faqat PTO), Loyihalar (yana).
3. **Ish (kunlik)** — Fakt (jurnal/xotiradan/daraxt), Naryad, Foto-dalil, Topshiriqlarim.
4. **Material** — Zayavka, Ombor (qoldiq, kirim, kirim fakturasi), М-29, Xarid (tender, bozor, yuk — yana), Yetkazuvchilar.
5. **Hujjat (oylik topshirish)** — AOSR + lab, F2 (tayyorlash -> tasdiq -> paket), Forma 3 + nakopitelniy, Chizmalar, Fayllar, Kiruvchi/yuborilgan (Taqdim, Murojaat, Aylanish — bitta «Aloqa» tabli sahifa).
6. **Hisob** — Shartnomalar, To'lovlar, Qarzdorlik (postavshik/subpudrat/buyurtmachi), Akt-sverka, Subpudrat hisobi, Foyda/zarar, Solishtiruv; Buxgalteriya (yana).
Avatar/⚙: Kompaniya (a'zolar, rollar, ruxsat jadvali, sozlama, hujjat dizayni, tokenlar), Kadrlar/KPI, Akkaunt, Kurs, Imzo, Korzinka.

Reestr nuqtai nazaridan: `ISH_JOYLARI` (lib/reestr/ishJoyi.ts:6) ni `obyekt, ish, taminot->material, hujjatlar, moliya->hisob, kompaniya` ga qayta nomlash/yangi `ish` kaliti — V2 hujjat «yangi ish joyi FAQAT ma'lumot bilan» deydi (EKOTIZIM_ARXITEKTURA_V2.md:50), ya'ni kod emas, `ISH_JOYI_META` va sahifalarning `ishJoyi` maydoni o'zgaradi. Ruxsat xulqi o'zgarmaydi, lekin rol x sahifa snapshoti o'zgaradi -> egasi tasdig'i (V2 §5).

### 5.3 Rol bo'yicha bosh ekran (Bugun) va ko'rinadigan bandlar
| Rol | «Bugun» tarkibi (mavjud ma'lumotdan: sonlar bilan) | Ko'rinadigan band (maks.) |
|---|---|---|
| usta/brigadir | UstaBugun (mavjud) + naryad + tabel; desktop Fakt menyudan yashirinadi | Bugun (1–2 band) |
| prorab | MOBIL «Bugun»: bugungi fakt, usta qoralamalari (tasdiq soni), zayavka/kirim, AOSR (foto + yaratish), naryad qabul | Bugun, Obyekt (o'qish), Ish, Material, Hujjat (AOSR/kiruvchi) |
| PTO | Obyekt x oy yopish jadvali: Fakt -> AOSR -> F2 -> F3 holati (lib/pto-markazi/markaz.ts mavjud `markazHolati`), qoralamalar, qaytarilgan hujjatlar | Bugun, Obyekt, Ish(o'qish), Hujjat, Hisob(o'qish) |
| omborchi | Kutilayotgan kirim, ochiq zayavkalar, kam qolgan material, M-29 farqi | Bugun, Material |
| ta'minotchi | Zayavka -> tender -> buyurtma holati, yetkazuvchi javoblari | Bugun, Material |
| buxgalter | F3 tayyor -> to'lov/sverka navbati, muddati o'tgan qarz, F2 tasdiqlanganlar (o'qish) | Bugun, Hujjat(F3/nakopitelniy), Hisob |
| boss | Portfel (pult), qaror kutayotganlar, qarz/to'lov muddatlari, xavfli obyektlar | Bugun, Obyekt, Hujjat(o'qish), Hisob |

### 5.4 Sahifalar taqdiri
| Harakat | Sahifa | Izoh |
|---|---|---|
| BIRLASHTIRISH | Shartnoma: `moliya?tab=shartnoma` (TestShartnoma) -> ShartnomaLiniya | bitta muharrir, bitta RPC |
| BIRLASHTIRISH | To'lov kiritish: TolovForma = Nakopitelniy shartnoma bloki formasi; Qarzdorlik «to'lov» asosi t2_tolov dan o'qiladi | bitta kiritish komponenti |
| BIRLASHTIRISH | ObyektQadamlari + KeyingiQadamPanel | bitta zanjir (5.5) |
| BIRLASHTIRISH | Taqdimlar + Hujjat aylanishi kiruvchi quti + Murojaatlar -> «Aloqa» (tablar) | V2 8-qadam |
| BIRLASHTIRISH | Documents + Storage -> «Fayllar» | |
| BIRLASHTIRISH | Zayavka band -> Ombor tabi (redirect `eskiYollar`) | |
| BIRLASHTIRISH | Pult + Dashboard -> bitta «Boshqaruv paneli» (pult — yuqori qism) | |
| KO'CHIRISH | Shartnoma -> Obyekt/Hisob; Fakturalar (TestFaktura) -> Material/Ombor; M-29 -> Material; Grafik -> Obyekt kartasi | |
| YASHIRISH (pudratchi menyusida) | Loyihachi: bugun, Yetkazuvchi: bugun, Subpudratchi: bugun (bosh pudratchi uchun), Mening xizmatlarim (mutaxassis/haydovchi), Tizim o'rganishi, ilova ishga tushirgichi (yangi menyuda), 2 ta sozlama sahifasi | tomon profili bo'yicha ko'rinsin (`TomonProfil`) |
| YASHIRISH (usta) | desktop Fakt/Foto | |
| QAYTA NOMLASH | «Obyektlar va smeta yuklash» -> «Obyektlar»; «АОСР va laboratoriya»/«Yashirin ish akti»/«QA/QC — AOSR» -> «Yashirin ishlar akti (АОСР)»; «Nakopitelniy va F3» -> «Forma 3 va nakopitelniy»; «F2 import…» -> «F2 faylni yuklash»; «Ta'minot va sklad» -> «Ombor»; «Ish joylarim» -> «Kompaniyalarim»; «Smeta va Fakt / LRV» -> «Obyekt kartasi»; «Tizim o'rganishi» -> yashirin | pageCatalog ham shundan hosila |
| O'CHIRISH NOMZODI (egasi qarori) | AdditionalReplacementNative, WrapperPortfel, TestFakt, /admin/test/* (TestF2…), /boss/eski, /admin/texnika|taminot|sifat | AXLAT_TOZALASH §2 |
| ASOSIYGA CHIQARISH | Zayavka, Qarzdorlik, Grafik | beta -> tayyor (holat) |

### 5.5 Yagona zanjir chizig'i
Qadamlar: Smeta -> Shartnoma/Grafik -> Fakt -> Material(M-29) -> AOSR -> F2 -> F3 -> To'lov/sverka. Bitta komponent, bitta hisob manbai (`lib/pto-markazi/markaz.ts` ni kengaytirish; `lib/qollanma/keyingiQadam.ts` o'chiriladi), 1 ta tugma «Keyingi qadam»; hamma qadam sahifasida yuqorida ko'rinadi. AOSR tartibi egasi tasdig'ida.

## 6. ANIQ O'ZGARISHLAR RO'YXATI

Hajm: S ≤ 0.5 kun, M ≈ 1–3 kun, L > 3 kun. «Bog'liq» — oldin tushishi kerak bo'lgan ID.

### P0 — ishni to'xtatadi / adashtiradi
| ID | O'zgarish | Fayllar | Hajm | Bog'liq |
|---|---|---|---|---|
| C-01 | «Obyektlar va smeta yuklash» yorlig'i yolg'on: nom «Obyektlar», sahifada ko'rinadigan «Smeta yuklash» tugmasi (-> /admin/holat/:id tab yuklash). KUNDALIK/Bugun/katalog nomlarini birxillashtirish (4.4 jadval) | lib/reestr/sahifa.ts:94 va nom ustunlari; lib/nav/navReestr.ts:85-92; lib/sayt-xaritasi/pageCatalog.ts; test02/TestObyektlar.tsx; fixtures (`reestr/__fixtures__`, `npm run site-map:generate`); i18n lugat/qism | S | — |
| C-02 | Ikki «Keyingi qadam» vidjetini bittaga: `KeyingiQadamPanel` ni olib tashlab, `ObyektQadamlari` ni kengaytirish (Smeta, Shartnoma, Fakt, AOSR, F2, F3, To'lov). Ikki marta so'rovni bittaga | components/qollanma/KeyingiQadamPanel.tsx, lib/qollanma/keyingiQadam.ts (+test), admin/components/ObyektQadamlari.tsx, lib/pto-markazi/{keyingiQadam,markaz,useQadamMalumot}.ts, admin/sahifalar/HolatNative.tsx:350,370 | M | C-03 bilan bitta PR ham bo'lishi mumkin |
| C-03 | Zanjir tartibi va qamrovi: AOSR ni F2 dan oldin; «Hujjatlar» chipiga holat; zanjir chizig'ini AOSR, M-29, Naryad, F2 tarixi, Qarzdorlik, Shartnoma sahifalariga qo'yish; F3 dan so'ng «To'lov/sverka» qadami (-> Hisob) | admin/components/ObyektQadamlari.tsx, lib/pto-markazi/keyingiQadam.ts+markaz.ts, test02/TestAosr.tsx, admin/sahifalar/{M29Native,Naryad,F2TarixNative,Qarzdorlik,ShartnomaLiniya}.tsx | M | C-02 |
| C-04 | Shartnoma muharriri bitta: Moliya «Shartnomalar» tabi ShartnomaLiniya ga yo'naltiriladi; `shartnoma_saqla` (eski) yozuvchisi faqat bitta yo'ldan; maydonlar bir xil | test02/WrapperMoliya.tsx:5,33; test02/TestShartnoma.tsx; admin/sahifalar/ShartnomaLiniya.tsx; api/t2-shartnoma.ts; api/t2-shartnoma-liniya.ts; functions/_shared/write-command-policy.ts (tekshirish) | M | server: ikki RPC mosligi tekshiruvi (TAXMIN) |
| C-05 | To'lov kiritish bitta komponent (shartnoma kartasidan); Qarzdorlik «to'lov» asosini t2_tolov dan o'qish; F3 sahifasidan «To'lov kiritish» tugmasi | components/moliya/TolovForma.tsx; admin/sahifalar/NakopitelniyVedomost.tsx:620; admin/sahifalar/Qarzdorlik.tsx:30-35; api/t2-{buxgalteriya,nakopitelniy,qarzdorlik}.ts | M–L | C-04; backend (migratsiya kerak bo'lishi mumkin — TAXMIN) |
| C-06 | Prorab uchun telefon «Bugun»: `bugunEkrani` 'prorab' qiymati; usta qoralamalarini tasdiqlash (UstaKutilmoqda ni qayta ishlatish), bugungi fakt, zayavka, AOSR foto, naryad qabul; `/admin/fakt` jadvaliga telefonda kartochka ko'rinishi | lib/reestr/tomonProfil.ts:60-64; admin/sahifalar/Bugun.tsx; admin/sahifalar/UstaBugun.tsx; admin/sahifalar/UstaKutilmoqda.tsx; admin/sahifalar/FaktJurnal.tsx:1188 | L | — |

### P1 — noqulay
| ID | O'zgarish | Fayllar | Hajm | Bog'liq |
|---|---|---|---|---|
| C-07 | «Bugun» rol vidjetlari (sonlar): PTO — obyekt x oy yopish jadvali; boss — qaror kutayotganlar; buxgalter — F3->to'lov navbati; omborchi — kirim/zayavka; mavjud RPC/`markazHolati` dan | admin/sahifalar/Bugun.tsx; lib/reestr/tomonProfil.ts:28-44; lib/pto-markazi/markaz.ts; api/t2-rahbar-pult.ts | L | C-02 |
| C-08 | Menyuni zanjir tartibiga o'tkazish: ish joylarini qayta nomlash/yangi `ish`, sahifalarning `ishJoyi`, `tartib` ini o'zgartirish; 5.4 jadvali | lib/reestr/ishJoyi.ts:6-28; lib/reestr/sahifa.ts; lib/nav/ishJoyiMenyu.ts; lib/nav/ruxsatMatritsa.ts snapshot; docs/architecture/EKOTIZIM_ARXITEKTURA_V2.md | M–L | C-01, egasi tasdig'i (snapshot) |
| C-09 | Begona rol «Bugun»larini pudratchi menyusida yashirish (Loyihachi, Yetkazuvchi, Subpudratchi, Mening xizmatlarim, Tizim o'rganishi, ilova ishga tushirgichi yangi menyuda); 3 sozlama sahifasini avatar menyusiga | lib/reestr/sahifa.ts:128,141,153,167-171; lib/reestr/tomonProfil.ts; admin/AdminShell.tsx:244,375 | S–M | C-08 bilan birga yaxshi |
| C-10 | F2 bitta oqim: tayyorlash qoralamasidan so'ng ichki «Tasdiqlashga o'tish»; obyekt sahifasiga «F2 tayyorlash» tugmasi; `KUNDALIK_ISHLAR` dan «F2 faylni yuklash» olib tashlash (import — ikkinchi daraja); F2 reestri+paket «Oylik topshirish» | admin/sahifalar/{F2TayyorlashNative.tsx:809,835,1281; HolatNative.tsx; F2Reestr.tsx}; lib/nav/navReestr.ts:85-92 | M | C-03 |
| C-11 | Yagona obyekt/oy tanlash: panelni barcha obyektga bog'liq sahifaga yoyish (F2 reestr, moliya, qarzdorlik, shartnoma, zayavka, subpudrat, grafik); sahifa ichidagi `<select>` lar o'rniga bitta `ObyektTanlov`; yagona `OyTanlov` («Oy») va URL kaliti; panel matnlari `t()` | umumiy/kontekst/PTOWorkspaceContext.tsx:92-117,531-591; umumiy/ui/ObyektOptionlari.tsx; admin/sahifalar/{Nakopitelniy,M29Native,F2OylikPaket}.tsx; admin/hr/HrMen.tsx; i18n | M–L | — |
| C-12 | Fakt yuzalarini kamaytirish: usta desktop Fakt/Foto yashirish; IshVaraq vs FaktJurnal qarori (egasi); Naryad qabul -> fakt oqimini «Fakt» sahifasida ko'rsatish | lib/reestr/sahifa.ts:109-111; admin/sahifalar/{IshVaraq,FaktJurnal,Naryad}.tsx; HolatNative.tsx:469 | M | egasi qarori |
| C-13 | Tezlik: HolatNative da `lazy()` (SmetaYuklaNative, SmetaVersiyaFarq, ResursVedomostNative, NarxNazoratNative, IshVaraq, ObosnovaniePanel); ikki marta so'rovni yo'qotish; F2ImportV3/Workbench bo'lib yuklash. Oldin o'lchang (Lighthouse/Network) | admin/sahifalar/HolatNative.tsx:2-46 | M | C-02 |
| C-14 | Ombor: Logistika tabini URLga (`?tab=`), sukut tab rolga qarab (omborchi: Sklad); `/admin/zayavka` -> `/admin/logistika?tab=zayavka` (`eskiYollar`); TestFaktura -> Ombor tabi (kirim fakturasi); M-29 -> Material | test02/WrapperLogistika.tsx:15; test02/WrapperMoliya.tsx; lib/reestr/sahifa.ts:144-145; lib/nav/navReestr.ts:91 | S–M | C-08 |
| C-15 | Hisob ish joyi: Moliya tablari + Qarzdorlik + Buxgalteriya + Akt-sverka bitta joyda; subpudrat akt qabuldan qarz/to'lovga havola; qarzdorlik beta->tayyor | lib/reestr/sahifa.ts:119-122; admin/subpudratchi/SubpudratBoshqaruv.tsx:159-197; admin/sahifalar/Qarzdorlik.tsx | M | C-05 |
| C-16 | Hujjat: «Aloqa» (Taqdimlar+Murojaatlar+Hujjat aylanishi kiruvchi); «Fayllar» (Documents+Storage) | admin/zakazchik/{TaqdimlarInbox,Murojaatlar,HujjatAylanish}.tsx; admin/pages/DocumentsPage.tsx; test02/TestSaqlash.tsx | L | C-08 |
| C-17 | YANGI: Ishlarning umumiy jurnali (DOC-05) — obyekt/sana/javobgar, faktga havola, ShNQ blank Excel eksporti | yangi sahifa (reestr `Sahifa` + `Amal`); docs/architecture/UZ_CONSTRUCTION_DOCUMENT_CATALOG_AND_TEMPLATES_V1.md:116,140-167 | L | egasi ustuvorlik qarori |

### P2 — bezak/tozalash
| ID | O'zgarish | Fayllar | Hajm |
|---|---|---|---|
| C-18 | Jargon nomlari («LRV», «RES», «Slichitelniy», «Oferta», «Nakrutka») uchun tooltip/oddiy nom | lib/reestr/sahifa.ts nomlar; lugat | S |
| C-19 | O'lik/yetim kodni olib tashlash (egasi qarori): AdditionalReplacementNative, WrapperPortfel+TestFakt, TestSmetaBirlashgan/TestF2/TestDaraxt/TestHisobot/TestTizim, /boss/eski, ErpTexnika/Taminot/Sifat | App.tsx:333-352,396-403; test02/* | M |
| C-20 | `pageCatalog.ts` ni reestrdan hosila qilish (qo'lda 68 yozuv) | lib/sayt-xaritasi/pageCatalog.ts; scripts/generate-site-map.mjs | M |
| C-21 | «Ish joyi» so'zini 1 ma'noga keltirish | sahifa.ts, ISH_JOYI_META, IshJoylarim | S |
| C-22 | Qoralama->tasdiq tugma fe'llari qoidasi (UX qo'llanma) | umumiy/ui, admin/sahifalar/* | M |

## 7. BIRINCHI 5 TA PR

1. **PR-1 «Nom va menyu tozalash»** (C-01 + C-09 ning nom/yashirish qismi) — S, ma'lumot o'zgarishi (kod xulqi yo'q). Birinchi chunki foydalanuvchi adashishini zudlik bilan kamaytiradi, xavfsiz. Rol x sahifa snapshoti diff beradi -> egasi ko'radi.
2. **PR-2 «Yagona zanjir chizig'i»** (C-02 + C-03) — M. Ikki vidjet -> bitta; AOSR/To'lov qadamlari; barcha qadam sahifalarida chiziq. Boshqa ko'p ishning (Bugun vidjetlari, menyu) asosi.
3. **PR-3 «Shartnoma va to'lov bitta joyda»** (C-04, C-05 ning birinchi qismi) — M. «To'g'ri hisob» uchun: ikki RPC (`shartnoma_saqla` / `_v2`) va ikki to'lov formasi — ma'lumot nomuvofiqligi xavfi. Backend moslik tekshiruvi bilan.
4. **PR-4 «Prorab telefon Bugun»** (C-06) — L. Egasining «qulay interfeys» talabining asosiy qismi; UstaBugun + UstaKutilmoqda qayta ishlatiladi.
5. **PR-5 «Menyuni zanjir tartibiga o'tkazish»** (C-08) — M–L. PR-1 va PR-2 tushgach: sidebar = qurilish zanjiri (Obyekt -> Ish -> Material -> Hujjat -> Hisob). Ruxsat snapshoti egasi tasdig'i bilan.

Keyingi: C-13 (tezlik, oldin o'lchash), C-10, C-11, C-07.

## 8. QAYSI SAVOLGA EGASI JAVOBI KERAK
1. AOSR F2 dan oldinmi (taklif) yoki kerak bo'lganda — tartib tasdig'i. 2. Prorab narx tahriri (`narx.write`) kerakmi. 3. Fakt kiritish: IshVaraq yoki FaktJurnal — qaysi biri qoladi. 4. Eski `/admin/test/*`, ERP sahifalari o'chirilsinmi. 5. ОЖР (umumiy jurnal) ustuvorligi. 6. Uy sotish, Bozor, Tender, Yuk birjasi — pudratchi menyusidan butunlay yashirinsinmi (hozir «Yana…»).
