# IJRO HUJJATLARI MARKAZI — dizayn hujjati (TIZIM_02)

Holat: TAKLIF (egasi tasdig'iga) · 2026-11-03 · muallif: arxitektor (Claude)
Qamrov: laboratoriya, nazorat, buyurtmachi, loyihachi, ekspertiza, hujjat almashinuvi, tasdiqlash, xat almashinuvi, ogohlantirish, talab qiluvchi tuzilmalar — «qog'ozbozlik»ni oxirigacha yetkazish.
Cheklov: bu hujjat KOD emas. Repo nusxasi (/home/user/sotuv) faqat o'qildi; prod Supabase'dan faqat SELECT (information_schema va katalog jadvali `t2_tomon_resurs`) qilindi; mijoz ma'lumoti/summa hujjatga yozilmadi.

Belgilar: **[B]** repo yoki prod schemada tasdiqlangan · **[T]** tekshirish kerak (norma/ilova raqami yoki texnik taxmin ishonchsiz) · **[⚠]** egasi qarori kerak.

---

## 0. Qisqa xulosa

1. Hozir ijro liniyasida ishlaydigan narsa: АОСР (ShNQ 3.01.01-22, 6-ilova) blank maydonlari + laboratoriya protokoli reestri + ikkalasini smeta qatoriga bog'lash + RU eksport. Bu — «yagona akt».
2. Yo'q: boshqa aktlar uchun alohida shablon (7-ilova, sinov aktlari), jurnallar, sertifikat/pasport reestri, kirish nazorati, ijro sxemalari, tasdiqlash zanjiri, E-IMZO, xat reestri, muddatli ko'rsatma, avtomatik ogohlantirish.
3. Eng xavfli bo'shliq: `t2_aosr_yoz_v2` holatni `tasdiqlangan` qilib yozishga yozuvchining o'ziga ruxsat beradi — imzo yoki boshqa tomon tasdig'i yo'q. «Tasdiqlangan» hozir bayroq, dalil emas.
4. Asos tayyor: R2 kanonik hujjat reyestri, tomon (aloqa/grant/taqdim/murojaat/izoh), outbox → bildirishnoma, quality.*/design.* capability'lar. Yangi «party», yangi fayl ombori, yangi invite jadvali KERAK EMAS (E1/E2/E6 qoidasi).
5. Tavsiya: bitta «ijro hujjati» konverti (`t2_ijro_hujjat`) + turlar katalogi + shablon + talab/qoida registri + imzo qadamlari. Mavjud `t2_aosr` va `t2_lab_protokol` ko'chirilmaydi — havola bilan o'raladi.
6. Birinchi PR: «Turlar katalogi + talab qoidalari + F2 uchun yetishmayotgan hujjatlar (faqat o'qish)». Yozuv oqimi, imzo, kompaniyalararo — keyingi PR'larda.

---

## 1. Inventarizatsiya

### 1.1 Ishlaydi **[B]**

| Soha | Nima | Qayerda |
|---|---|---|
| АОСР jadvali | `t2_aosr` (27 ustun): raqam, sana, ish_nomi, ish_tavsifi, loyiha_tashkiloti, loyiha_hujjati, materiallar, chetlanishlar, keyingi_ishlar, komissiya (jsonb massiv), boshlanish/tugash, tur (`aosr`/`oraliq_qabul`/`sinov`), blank_varianti (subpudratchili/subpudratchisiz), holat (`yangi`/`tasdiqlangan`/`qogoz`/`bekor`), versiya, operation_id | migratsiya `20261105100000_t2_ijro_aosr_lab_logo_v1.sql` |
| АОСР ↔ qator | `t2_aosr_bog` (M:N, smeta qatoriga), view `t2_aosr_reestr_v2`, `t2_aosr_coverage` (faktli qator uchun «akt bormi», `yashirin` belgisi), `t2_aosr_qator_holat` | shu va `20261108300000_t2_nazorat_aosr_holat_v1.sql` |
| АОСР RPC | `t2_aosr_yoz_v2`, `t2_aosr_bekor`, `t2_aosr_bog_saqla/ochir` — `/api/sb-yoz` amallari `aosr_yoz_v2`, `aosr_bekor`, `aosr_bog_*` | `frontend/functions/api/sb-yoz.ts` (~173–182, 1712–1814) |
| Laboratoriya | `t2_lab_protokol` (sinov_turi: beton/grunt/armatura/payvand/material/boshqa; natija mos/mos_emas/kutilmoqda; laboratoriya = `t2_kontragent`, mavqe `laboratoriya`; hajm/summa NULL≠0; `fayl_document_id`), `t2_lab_protokol_bog` (aosr/qator), view `t2_lab_protokol_reestr`, RPC `t2_lab_protokol_yoz_v1`, `_bekor_v1`, `_bog_saqla_v1` | shu migratsiya; klient `frontend/src/api/t2-ijro.ts` |
| АОСР eksport | ShNQ 3.01.01-22 6-ilova, RU, komissiya tartibi (subpudratchili/siz); ijro reestri eksporti | `frontend/src/lib/aosr-export.ts`, `ijro-reestr-export.ts`, `aosr-korinish.ts`, `aosr-qoralama.ts` |
| Ekran | `/admin/aosr` «АОСР va laboratoriya» (ruxsat: rahbariyat, `document.write`, `quality.read`; modul `module.aosr`) | `frontend/src/test02/TestAosr.tsx` (488 qator), `lib/nav/navReestr.ts:145`, `App.tsx` |
| Imzochilar katalogi | `t2_obyekt_imzochi` (daraja loyiha/obyekt/razdel, rol, tashkilot, lavozim, fio, tomon_kompaniya_id), `t2_imzochi_tarix` (avto-taklif) — hujjat komissiyasini to'ldirish uchun | prod schema |
| Fayl haqiqati | `t2_document_registry` (41 ustun: r2_key, sha256, sha256_verified, canonical_storage_status, revision_seq, blob_key, drive_* ikkilamchi). Yuklash: reserve → R2 put → finalize/reconcile | `functions/api/hujjat-yukla.ts`, `hujjat-r2.ts`, `hujjat-ol.ts`, `hujjat-royxat.ts` |
| Tomon yadrosi | `t2_tomon_aloqa` (handshake), `t2_tomon_grant` (resurs×amal×obyekt/loyiha/shartnoma), `t2_tomon_taqdim` (snapshot+xesh+qaror: yuborilgan/ko_rilmoqda/qabul/rad/tuzatish/qaytarilgan), `t2_tomon_hodisa` (o'zgarmas jurnal), `t2_tomon_resurs` katalogi | `20261106200000_t2_tomon_aloqa_v1.sql`, `functions/api/tomon.ts` |
| Murojaat primitivi | `t2_tomon_murojaat` (turi, joy, sarlavha, matn, muhimlik, **muddat**, holat ochiq/bajarildi/yopildi/bekor, **raund**, javob, yopish) + `_hujjat` (dalil, R2 reyestrdan) + turlar: remark, **predpisaniya**, ekspertiza_izoh, mualliflik_remark, savol (RFI), **sinov_sorovi**, yetkazish_talabi | `20261106240000_t2_tomon_murojaat_v1.sql` |
| Qator izohi | `t2_izoh` (hozir faqat `t2_akt_qator`; `t2_aosr`, `t2_qator`, `t2_chizma_revizya` allow-list'da, resolver yo'q) | `20261108100000_t2_izoh_v1.sql` |
| Hodisa shinasi | `t2_outbox` (+kursor, `t2_outbox_yoz`), `t2_bildirishnoma` (ilova ichida), `t2_outbox_ishlov_v1` (cron, har 1 daq) | `20261108000000_t2_ekotizim_f1_yadro_v1.sql` |
| Buyurtmachi UI | `ZakazchikKabinet`, `TomonlarAloqa`, `TaqdimlarInbox`, `Murojaatlar`, `ObyektPortali`, `ObyektSorovlari`, `QatorIzohlari` | `frontend/src/admin/zakazchik/` |
| Ruxsatlar | `quality.read/inspect/decide`, `design.read/write/issue`; rol `inspektor` (quality.*), `loyihachi` (design.*), `pto`/`prorab` (faqat `quality.read`) | `20261108010000_t2_ekotizim_f1_ruxsat_v1.sql` |
| Closeout modeli | `validateProjectCloseout` (required/present/pending/approved/rejected/superseded/missing/unresolved), 9 ta `DocumentType` (contract, f2, cumulative_statement, aosr, act, invoice, handover, change_evidence, payment_certification); UI `ProjectCloseoutWorkspace` | `frontend/src/lib/construction-document-control/`, `components/construction-document-control/` |
| Rasmiy hujjat quruvchi | `RasmiyVaraq` (RU, A4, imzo bloki, print area) — H1–H9 standart | `frontend/src/lib/hujjat-yozuvchi/`, `docs/architecture/HUJJAT_STANDARTI_V1.md` |
| Ma'lumotnoma | Katalog tadqiqoti (DOC-01…18, TPL-01…12, A–E darajalar) | `docs/architecture/UZ_CONSTRUCTION_DOCUMENT_CATALOG_AND_TEMPLATES_V1.md` |

### 1.2 Qisman / xavfli **[B]**

- `tur='oraliq_qabul'` va `'sinov'` — faqat `t2_aosr` ustida qiymat; maydonlar АОСР maydonlari (ish_tavsifi, materiallar…). 7-ilova (oraliq qabul) va sinov aktlariga xos maydonlar (o'lchovlar, asbob, kalibrovka, mezon, natija, xulosa darajasi) YO'Q.
- `holat='tasdiqlangan'` — `t2_aosr_yoz_v2` ichida yozuvchi o'zi qo'yadi; imzo, ketma-ketlik, boshqa tomon qarori bog'lanmagan. `qogoz` = qog'ozda imzolangan degan da'vo, dalil (skan) majburiy emas.
- Komissiya — erkin jsonb (`rol, tashkilot, fio, lavozim`); haqiqiy foydalanuvchi/kompaniya bilan bog'lanmagan, imzo holati yo'q.
- Kompaniyalararo АОСР: `t2_tomon_resurs.aosr` — `taqdim_mumkin=true`, lekin `faol=false` (prod SELECT bilan tasdiqlandi); `remark`, `foto`, `grafik`, `fakt` ham `faol=false`. Ya'ni zakazchik/texnadzor/loyihachi АОСРni tizimda ko'rolmaydi va imzolay olmaydi — bu «tomonlar orasidagi aloqa yaxshi emas»ning asosiy texnik sababi.
- `t2_izoh` АОСР satriga izoh yozishni hali qo'llamaydi (resolver yo'q).
- Murojaat: `muddat` va `raund` bor, lekin muddat bo'yicha avtomatik eslatma/kechikish signali, foto-dalil majburiyligi, qayta tekshiruv (alohida qadam) va KPI/jarima bog'lanishi yo'q.
- Bildirishnoma — faqat ilova ichida. Telegram/email iste'molchisi outbox'ga ulanmagan (E4: «v1 — ilova ichida + Telegram (outbox iste'molchisi)» rejalangan, qurilmagan) **[T: Telegram bot kodi `functions/api/telegram/` bor, outbox bilan bog'lanishi tekshirilsin]**.
- Closeout validatori faqat 9 turni biladi; lab protokol, sertifikat, jurnal, ijro sxemasi turlari yo'q; qoidalar (qaysi ish uchun qaysi hujjat) kodda emas.

### 1.3 Umuman yo'q **[B: repo va prod schema'da topilmadi]**

E-IMZO/ERI (kodda faqat `TestSozlama.tsx` matnida eslatma); jurnallar (umumiy, beton, payvand, montaj); material sertifikat/pasport reestri va kirish nazorati; ijro sxemalari/as-built reestri; hujjat shablon versiyalari (DB'da); tasdiqlash zanjiri/qadamlari; xat reestri (kiruvchi/chiquvchi, raqamlash, javob zanjiri); `t2_tekshiruv` (inspeksiya tashrifi — E3 §4.9 da rejalangan, schema'da yo'q); `t2_chizma_*` (loyihachi chizma/revizya — E3 §4.8 rejalangan, yo'q); «F2 yopilishi uchun yetishmayotgan hujjatlar» tekshiruvi; ekspertiza/inspeksiya uchun kirish yuzasi.

---

## 2. O'zbekistondagi ijro hujjatlari katalogi

Ishonch darajasi: **A** = repo tadqiqotida ShNQ ilovasi tasdiqlangan (3.01.01-22, 1/6/7-ilova); **T** = norma yoki ilova raqami ishonchsiz — yuridik/PTO mutaxassis tekshirishi shart. Ro'yxat obyekt turi, loyiha va shartnoma bilan kengayadi (katalog DB'da yuritiladi, kodda emas).

Eslatma: ushbu hujjat normativ matnni qayta yozmaydi. Normativ blank maydonlari — egasining `AKT_SYSTEM_TEMPLATES` va ShNQ ilovasi bo'yicha; yangi blank qo'shishdan oldin PTO rasmiy blankni tasdiqlaydi (A-daraja eksport maydonlari o'zgarmaydi).

### 2.1 Katalog jadvali

| Kod | Hujjat (RU nom — rasmiy) | Asos | Ishonch | Kim tuzadi | Kim imzolaydi | Qaysi ishga bog'liq | Majburiy maydonlar (minimal) |
|---|---|---|---|---|---|---|---|
| IJ-01 | Акт освидетельствования скрытых работ (АОСР) | ShNQ 3.01.01-22, 6-ilova | A | pudratchi (PTO/prorab) | pudratchi, texnadzor (buyurtmachi), loyihachi/mualliflik nazorati (loyiha talabi bo'lsa), subpudratchi (bo'lsa) | berkitiladigan ish (keyingi qatlam bilan yopiladi) | №, sana, obyekt/joy, ish nomi va tavsifi, ishchi chizma №/sana/loyiha tashkiloti, materiallar + sifat hujjati (sertifikat/protokol №), loyihadan chetlanish (yo'q/havola), boshlanish-tugash, qaror (keyingi ishga ruxsat), komissiya a'zolari, ilovalar, smeta qator ID |
| IJ-02 | Акт промежуточной приёмки ответственных конstrukций | ShNQ 3.01.01-22, 7-ilova | A | pudratchi | pudratchi, texnadzor, loyihachi; maxsus vakillar (loyiha bo'yicha) | muhim/yuk ko'taruvchi konstruksiya (poydevor, karkas, plita…) | №, sana, konstruksiya + aniq joy/o'qlar, chizma/reviziya, bog'langan АОСRlar, sinov/lab/geodeziya dalillari, o'lchovlar, chetlanish, xulosa (qabul/shartli/rad), keyingi bosqichga ruxsat, komissiya |
| IJ-03 | Акт испытания: уплотнение грунта/основания | ГОСТ 22733 (laboratoriya zichligi), ShNQ 3.02.01 (asos va poydevorlar) | T | laboratoriya (protokol) → pudratchi akt | laboratoriya, pudratchi, texnadzor | tuproq to'shamasi, ko'milma, yo'l asosi | qatlam/joy/koordinata, qalinlik, zichlash koeffitsienti (loyiha talabi vs o'lchangan), usul, asbob, namuna №, sana, natija, xulosa |
| IJ-04 | Протокол/акт: прочность бетона (куб/нераз-рушающий) | ГОСТ 10180, ГОСТ 18105, ГОСТ 22690 (NK) | T | laboratoriya | laboratoriya mas'uli, pudratchi (qabul), texnadzor | har quyma partiya/konstruksiya | beton markasi/sinfi, quyma sanasi/partiya, namuna soni, yosh (kun), o'lchangan MPa, talab, xulosa, asbob+kalibrovka |
| IJ-05 | Акт/заключение по сварным соединениям (визуал/УЗК/рентген) | ГОСТ 5264, ГОСТ 14771, ГОСТ 7512/14782 (NK usullari); ShNQ 3.03.01 | T | payvand laboratoriyasi (NK) / pudratchi | laboratoriya, payvandchi rahbari, texnadzor | metall konstruksiya, armatura payvandi, quvur | choklar ro'yxati/raqami, payvandchi (attestat №), usul, standart, baho, nuqson, xulosa |
| IJ-06 | Акт гидравлического (опрессовка) испытания | ShNQ 3.05.01 (ichki tizimlar), 3.05.04 (tashqi tarmoqlar) | T | pudratchi (santexnik/muhandislik) | pudratchi, texnadzor, ekspluatatsiya vakili (talab bo'lsa) | suv/kanalizatsiya/isitish quvuri | uchastka/tizim, sinov bosimi, ushlab turish vaqti, bosim pasayishi, asbob, natija, xulosa |
| IJ-07 | Акт испытания электроустановок: изоляция/заземление/УЗО | ПУЭ / ShNQ 3.05.06 (elektr), **[T: UZ analogi]** | T | elektr laboratoriyasi / pudratchi | laboratoriya, pudratchi, texnadzor | kabel, shit, zazemleniye | tizim/liniya, megger kuchlanishi, izolyatsiya qarshiligi, kontur qarshiligi, asbob/kalibrovka, natija, xulosa |
| IJ-08 | Акт индивидуального/комплексного опробования оборудования | ShNQ 3.05.xx, uskuna pasporti **[T]** | T | pudratchi + ishga tushirish tashkiloti | pudratchi, texnadzor, buyurtmachi, ishlab chiqaruvchi vakili (talab bo'lsa) | uskuna (lift, HVAC, nasos) | uskuna ID/zavod №, dastur, parametrlar, natija, xulosa |
| IJ-09 | Акт входного контроля материалов | ГОСТ 24297; ShNQ 3.01.01-22 (kirish nazorati talabi) **[T: aniq band]** | T | pudratchi (omborchi/prorab/PTO) | pudratchi, texnadzor (tanlab) | materiallar partiyasi, konstruksiya, uskuna | material, marka, ishlab chiqaruvchi/yetkazuvchi, partiya, miqdor, sertifikat/pasport №, tashqi ko'rik, lab. sinov kerakmi, xulosa (qabul/rad/karantin) |
| IJ-10 | Лабораторный протокол (umumiy) | ГОСТ/ShNQ sinov turiga qarab | T | akkreditatsiyalangan laboratoriya | laboratoriya mas'uli (+ imzo/muhr) | material/konstruksiya/grunt | protokol №/sana, obyekt/joy, namuna ID, usul/standart, asbob+kalibrovka, mezon, natija, xulosa, ilova fayl. Akkreditatsiya attestati №/muddati **[T]** |
| IJ-11 | Общий журнал работ | ShNQ 3.01.01-22, 1-ilova | A | pudratchi (mas'ul muhandis) | pudratchi mas'uli; texnadzor/loyihachi yozuvlarni tasdiqlaydi | butun obyekt | muqova (pudratchi, obyekt, loyihachi, texnadzor, muddatlar), xodimlar ro'yxati, АОСR/7-ilova reestri, sifat nazorati yozuvlari, kunlik yozuvlar |
| IJ-12 | Журнал бетонных работ | **[T: SP 70 / ShNQ 3.03.01 ilova]** | T | pudratchi | pudratchi, texnadzor, laboratoriya (kub namunalar) | monolit quyma | sana, konstruksiya, beton markasi, partiya/mixer №, harorat, saqlash, kub namunalar olinishi, qolip yechish |
| IJ-13 | Журнал сварочных работ | **[T]** | T | pudratchi (payvand rahbari) | rahbar, texnadzor | payvand ishlari | sana, chok №, payvandchi, attestat, material/elektrod, rejim, nazorat usuli, natija |
| IJ-14 | Журнал монтажа строительных конструкций | **[T]** | T | pudratchi | pudratchi, texnadzor | montaj | sana, element markasi/o'qi, montaj sharoiti, ulanish turi, geodezik tekshiruv, qabul |
| IJ-15 | Исполнительные схемы / геодезические съёмки | ShNQ 3.01.01-22; geodeziya talabi **[T: ГОСТ Р 51872 analogi]** | T | pudratchi geodezisti | geodezist, pudratchi, texnadzor | konstruksiya/kommunikatsiya o'qlari, otmetkalar | chizma/reviziya, o'lchov natijalari vs loyiha, ruxsat etilgan og'ish, geodezist attestati |
| IJ-16 | Исполнительные чертежи (as-built) | ShNQ 3.01.01-22 | T | pudratchi (loyihachi bilan) | pudratchi, loyihachi (kelishuv), texnadzor | obyekt qismi | chizma №, reviziya, o'zgarish belgilari, asos (aosr/kelishuv) |
| IJ-17 | Реестр сертификатов/паспортов качества | **[T: norma]** | T | pudratchi (PTO) | PTO tekshiradi (imzo shart emas) | resurs/material | sertifikat/pasport №, sana, amal qilish muddati, ishlab chiqaruvchi, partiya, fayl, qayerda ishlatildi (АОСР/qator) |
| IJ-18 | Акт о дефектах / предписание об устранении | ShNQ 3.01.01-22 **[T]**, shartnoma | T | texnadzor/inspeksiya/zakazchik | beruvchi + pudratchi ijroni tasdiqlaydi | nuqsonli ish | `t2_tomon_murojaat(turi='predpisaniya')` |
| IJ-19 | Акт на дополнительные работы/изменения | shartnoma, `t2_smeta_ozgarish` | T | pudratchi/zakazchik | pudratchi, zakazchik, loyihachi | scope o'zgarishi | allaqachon alohida kontrakt (SMETA_F2_NAKOPITELNIY_CHANGE_CONTROL_V1) — bu hujjatda faqat havola |
| IJ-20 | Реестр исполнительной документации (closeout index) | UZ katalog TPL-11 | T | pudratchi (PTO) | PTO; buyurtmachi qabul paytida | obyekt | har bo'lim: tur, №, sana, reviziya, fayl hash, holat |

Qo'shimcha (kelajak, yozilmagan): yong'in/ventilyatsiya/lift texnik tekshiruvi, tarmoq ulash (texnik shartlar), yakuniy qabul/ruxsatnoma — davlat xizmati (VM 200) — tizim faqat tayyorlov paketi va natija rekvizitlarini saqlaydi, rasmiy blankni o'zi yaratmaydi (UZ katalog DOC-18).

F-2/F-3, nakopitelniy, slichitelniy — ijro hujjati EMAS (moliyaviy/ichki nazorat); mavjud kontraktlar o'zgarmaydi. Ular bu markazda faqat «talab»ning iste'molchisi (§4.3).

### 2.2 Umumiy qoidalar

- Har hujjat: rasmiy shakl RU tilida, interfeys 4 tilda; matn maydonlari tarjima qilinmaydi.
- NULL ≠ 0: noma'lum o'lchov/natija bo'sh qoladi; «mos» faqat o'lchangan va mezonga solishtirilgan bo'lsa.
- AI to'ldirmaydi: sertifikat №, natija, imzo, chetlanish — faqat inson kiritadi. Avto-to'ldirish faqat manbaga bog'langan maydonlarda (§4.1) va har maydonda `manba` belgisi bilan.
- Tasdiqlangan hujjat tahrirlanmaydi — yangi reviziya (eski `superseded`), sabab majburiy.

---

## 3. Tomonlar modeli

Yangi «party» jadvali yaratilmaydi (E1). Tomon = `t2_kompaniya` (tenant); munosabat = `t2_tomon_aloqa` (tomon roli `t2_yonalish` kaliti); odam = `t2_azolik.rol` → capability.

### 3.1 Tomon → kirish roli → capability

| Tomon | Tomon roli (`t2_yonalish`) | A'zo roli (mavjud) | Hozirgi capability | Yetishmaydi **[⚠]** |
|---|---|---|---|---|
| Pudratchi (bosh/sub) | `bosh_pudratchi`, `subpudratchi` | `pto`, `prorab`, `boss/rahbar` | `quality.read`, `document.read/write` | `quality.write` (ijro hujjati qoralama/yuborish), `quality.sign` (imzo qadami) |
| Laboratoriya | `laboratoriya` (alohida tenant — egasi 2026-09-30 qarori) | `inspektor` (+`boss` o'z kompaniyasida) | `quality.read/inspect/decide` | protokol yaratish = `quality.inspect`, imzo = `quality.decide` — yetarli; faqat «faqat o'z protokoli» obyekt doirasi `_t2_obyekt_doira_ok` |
| Texnik nazorat (texnadzor) | `texnadzor` (zakazchik tenanti ichida yoki mustaqil shaxsiy/tashkilot tenant) | `inspektor` | `quality.*` | — |
| Buyurtmachi | `buyurtmachi` | `buyurtmachi` (eski rol), `boss`, `kuzatuvchi` | `_t2_tomon_rol_ok`: qaror/murojaat | tomon qarori hozir rolga qattiq bog'langan (`buyurtmachi`, boss…) — `quality.decide` ga ko'chirish **[⚠]** |
| Loyihachi (mualliflik nazorati) | `loyihachi`, `mualliflik_nazorati` | `loyihachi` | `design.read/write/issue` | `design.review` (АОСR/7-ilovaga mualliflik imzosi; `design.issue` — chizmani ishga chiqarish uchun, boshqa ma'no) |
| Ekspertiza | `ekspertiza` | `inspektor` | `quality.read`, `design.read` | faqat o'qish + `murojaat(ekspertiza_izoh)`; imzo qadami yo'q (ekspertiza loyiha bosqichi) |
| Inspeksiya (davlat qurilish nazorati) | `inspeksiya` | `inspektor` | `quality.read/inspect` | `t2_tekshiruv` + predpisaniya; hujjatlarni imzolamaydi, ko'radi va ko'rsatma beradi |

Egasi uchun eslatma: kompaniya tizimda yo'q bo'lsa (oflayn tomon) — `t2_kontragent`, ularning imzosi `qogoz` yo'li bilan (skan R2 + imzolovchi F.I.O. + sana) kiritiladi (§4.4).

### 3.2 Hujjat → kim ko'radi / imzolaydi (grant resurslari)

Resurs kalitlari (`t2_tomon_resurs`, `faol=false` bilan boshlanadi, E3 §4.9 tartibi): `aosr` (bor), `ijro_hujjat` (yangi), `lab_protokol`, `sertifikat`, `jurnal`, `xat`, `predpisaniya` (= murojaat turi, resurs `remark` o'rniga aniqlanadi **[⚠]**).

| Hujjat turi | Pudratchi | Lab | Texnadzor | Buyurtmachi | Loyihachi | Ekspertiza | Inspeksiya |
|---|---|---|---|---|---|---|---|
| IJ-01 АОСР | yaratadi, imzolaydi | ko'radi (o'z protokoli bog'langan bo'lsa) | imzolaydi | ko'radi (imzolashi shartnomaga qarab) | imzolaydi (talab bo'lsa) | — | ko'radi |
| IJ-02 7-ilova | yaratadi, imzolaydi | ko'radi | imzolaydi | imzolaydi/ko'radi | imzolaydi | — | ko'radi |
| IJ-03…05, 07 (sinov) | yaratadi/qabul qiladi | yaratadi, imzolaydi | imzolaydi | ko'radi | ko'radi | — | ko'radi |
| IJ-06, IJ-08 | yaratadi, imzolaydi | — | imzolaydi | imzolaydi/ko'radi | ko'radi | — | ko'radi |
| IJ-09 kirish nazorati | yaratadi, imzolaydi | lab. so'rovi bo'lsa ko'radi | tanlab imzolaydi | ko'radi | — | — | ko'radi |
| IJ-10 lab. protokoli | qabul qiladi (o'qiydi) | yaratadi, imzolaydi | ko'radi | ko'radi | — | — | ko'radi |
| IJ-11…14 jurnallar | yozadi, imzolaydi | — (kub namunalar yozuvi) | yozuvni tasdiqlaydi | ko'radi | mualliflik yozuvi | — | ko'radi |
| IJ-15/16 sxema, as-built | yaratadi | — | imzolaydi | ko'radi | kelishadi | — | ko'radi |
| IJ-17 sertifikat reestri | yuritadi | — | ko'radi | ko'radi | — | — | ko'radi |
| Xat | yuboradi/oladi | oladi/yuboradi | yuboradi/oladi | yuboradi/oladi | yuboradi/oladi | oladi/yuboradi | yuboradi |
| Predpisaniya | ijrochi | — | beradi/qayta tekshiradi | beradi | mualliflik remarki | ekspertiza izohi | beradi |

«Ko'radi» = faol aloqa + faol grant + obyekt doirasi (E2 §1 L2); ma'lumot nusxalanmaydi (tenant egasida qoladi), qabul qiluvchi faqat `t2_tomon_ruxsat_bor` orqali o'qiydi. Imzolash — grantdagi `imzo` amali.

---

## 4. Oqimlar

### 4.1 Hujjat yaratish (shablondan, smeta/F2 dan avto-to'ldirish)

1. Foydalanuvchi obyektda «Yangi ijro hujjati» → tur tanlaydi (katalogdan) yoki «talab» kartasidan (F2/АОСR coverage) boshlaydi.
2. Tizim shablon versiyasini (`t2_ijro_shablon`, tur+versiya) oladi; maydonlar `maydon_sxema` jsonb dan.
3. Avto-to'ldirish (taklif, tasdiqlash shart; har maydonda `manba` va `manba_id` provenance):

| Maydon | Manba |
|---|---|
| obyekt nomi/manzil, pudratchi/buyurtmachi rekvizitlari, shartnoma | `t2_obyekt`, `t2_kompaniya`/`t2_kontragent`, `t2_shartnoma` |
| ish nomi, birlik, hajm | `t2_qator` (`versiya_holat='faol'`, stable line ID) yoki `t2_akt_qator` (tasdiqlangan F2 qatori) — smeta versiyasi qoidasi (AGENTS §2c) majburiy |
| komissiya a'zolari | `t2_obyekt_imzochi` (daraja: razdel → obyekt → loyiha), `t2_loyiha_qatnashchi` |
| loyiha tashkiloti, chizma №/reviziya | `t2_loyiha_qatnashchi` (loyihachi); chizma — `t2_chizma_*` yo'q bo'lgani uchun qo'lda **[T]** |
| materiallar + sifat hujjati | sertifikat reestri (IJ-17) va `t2_lab_protokol` (bog' orqali) |
| sanalar | jurnal yozuvlari (IJ-11), fakt |

4. Hajm/summa/natija/chetlanish — hech qachon avto-«0» emas; manba yo'q bo'lsa maydon bo'sh va hujjat «to'liq emas» deb belgilanadi (H7 «ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ»).
5. Fayllar (skan, foto, chizma) — `hujjat-yukla` orqali R2, RPC'ga faqat `document_id`.
6. Eksport — `RasmiyVaraq` (RU), `hujjatTekshir` testi; PDF + (kerak bo'lsa) xlsx.

### 4.2 Yuborish → ko'rib chiqish → tasdiq/rad → E-IMZO → arxiv

Holatlar (`t2_ijro_hujjat.holat`):

```text
qoralama → yuborilgan → korib_chiqilmoqda ─┬→ izoh_bilan_qaytarilgan → qoralama (raund+1)
                                           ├→ rad_etilgan (yakuniy; yangi hujjat yoki yangi reviziya)
                                           └→ tasdiqlangan → imzolanmoqda → imzolangan → arxivlangan
tasdiqlangan/imzolangan → bekor (sabab, tarix saqlanadi) | superseded (yangi reviziya)
```

- Imzo zanjiri turi bo'yicha katalogda: `imzo_qadamlari` (rol, ketma-ket yoki parallel, majburiy/ixtiyoriy). Masalan АОСR: pudratchi → texnadzor → (loyihachi, talab bo'lsa).
- Har qadam: kim (tenant + foydalanuvchi + rol), qaror (tasdiqlash/izoh bilan qaytarish/rad), izoh matni, dalil fayllari, vaqt. O'zgarmas hodisa jurnali (`t2_tomon_hodisa` uslubi).
- Boshqa tenantga yuborish = `t2_tomon_taqdim` (snapshot + xesh + qaror) mavjud mexanizmi; `manba_jadval` allow-list'iga `t2_ijro_hujjat` qo'shiladi. Mavjud F2 taqdimi o'zgarmaydi.
- E-IMZO **[T: texnik tafsilot]**: brauzerda E-IMZO plagini (lokal WebSocket, CAPIWS) bilan PKCS#7 (attached/detached) imzo; imzolanadigan narsa = hujjatning kanonik PDF'i yoki kanonik JSON'ning SHA-256 xeshi (R2'dagi aniq reviziya). Server saqlaydi: `.p7s` fayli R2'da, sertifikat meta (egasi F.I.O., JSHSHIR/INN, serial, amal muddati), xesh, vaqt. Serverda imzo/sertifikat zanjirini tekshirish xizmati (E-IMZO server/davlat tekshiruv API) — **[⚠] tanlov: (a) tekshiruvli (tashqi xizmat, narx/SLA), (b) tekshiruvsiz saqlash + holat `tekshirilmagan`**. Imzolovchi sertifikati INN/JSHSHIR ↔ foydalanuvchi/kompaniya mosligi shart. `qogoz` rejimi: skan + imzolovchi F.I.O. + sana + «qog'ozda imzolangan» deb mas'ul tasdig'i (alohida holat `qogoz_imzo`, E-IMZO'dan past darajada ko'rsatiladi).
- Arxiv: `imzolangan` → `arxivlangan` — R2 fayl + `.p7s` + xesh o'zgarmas; Drive nusxasi faqat ikkilamchi.
- Qaytarish raundlari: har qaytarishda `raund+1`, eski izohlar o'chmaydi; ochiq izohlar hal bo'lmaguncha qayta yuborish bloklanadi.

### 4.3 «F2 yopilishi uchun yetishmayotgan hujjatlar» tekshiruvi

- Kirish: `t2_akt_id` (F2 qoralama/ko'rib chiqishdagi) yoki `obyekt_id + davr`.
- Qoida registri `t2_ijro_qoida`: ish toifasi (smeta shifr prefiksi / `kat` / ish turi / `yashirin` belgisi) → talab qilinadigan hujjat turlari, daraja: `majburiy` | `shartli` | `tekshirish_kerak`, `asos` (norma/shartnoma bandi matni).
- Algoritm: F2 qatorlari (stable line ID) → mos qoidalar → mavjud hujjatlarni qator/AOSR/protokol bog'lari bo'yicha qidirish → har talab uchun holat: `bor_tasdiqlangan` / `bor_kutilmoqda` (imzo/qaror kutmoqda) / `rad_etilgan` / `muddati_otgan` (sertifikat) / `yetishmaydi` / `qoida_noaniq`.
- Natija — ro'yxat va xulosa; **bloklamaydi** (v1: ogohlantirish). Bloklash rejimi `t2_ijro_sozlama` orqali kompaniya/shartnoma bo'yicha, faqat egasi qarori bilan **[⚠]**. F2 summalari/jami bu tekshiruvga tegmaydi (F2 muzlash qoidasi saqlanadi).
- Natija UI'da: F2 ekranida «Ijro hujjatlari» paneli (n ta yetishmaydi) va closeout matritsa; `validateProjectCloseout` 9 turdan katalog-turlarga kengaytiriladi.
- Hisob faqat o'qish; serverda nomli RPC, sahifalash; katta F2 uchun hisob qatorlar bo'yicha SQL'da (brauzerga butun reestr yuklanmaydi).

### 4.4 Xat reestri

- Bitta reestr, ikki yo'nalish: `kiruvchi` / `chiquvchi`.
- Raqamlash: kompaniya + yil + yo'nalish bo'yicha atomik hisoblagich (RPC ichida `for update` yoki `insert … on conflict`), namuna `ISH-{yil}/{n}`; qo'lda raqam (qog'oz xat) ham mumkin, tekshiruv: bir kompaniya+yil+yo'nalishda takror yo'q **[⚠: raqam formati egasi qarori]**.
- Maydonlar: raqam, sana, mavzu, kimdan/kimga (platformadagi kompaniya YOKI `t2_kontragent`), obyekt/shartnoma, `javob_kerak` + `javob_muddati`, `ota_xat_id` (javob zanjiri), ilovalar (R2), holat (`qoralama` → `yuborilgan` → `qabul_qilindi` → `javob_berilgan` | `javobsiz_yopildi` | `bekor`), `muhimlik`.
- Platformadagi qabul qiluvchiga yetkazish — `t2_tomon_taqdim` (resurs `xat`), oflayn tomonga — «qog'ozda/emailda yuborildi» belgisi + skan.
- Javob muddati o'tsa — outbox hodisa `xat.muddat_otdi`; zanjir ko'rinishi (ota → javob → javobga javob).
- Imzo: xat odatda rahbar imzosi/muhri; E-IMZO ixtiyoriy (tur sozlamasi).

### 4.5 Ko'rsatma / predpisaniya

Mavjud `t2_tomon_murojaat(turi='predpisaniya')` ustiga (yangi asosiy jadval yaratilmaydi):

- Qo'shimcha 1:1 jadval `t2_predpisaniya_tafsilot` (P1 «tafsilot» uslubi): me'yoriy asos (norma/shartnoma bandi matni), nuqson toifasi (`ahamiyatsiz/ahamiyatli/kritik`), `bartaraf_muddati`, foto-dalil majburiyligi, `bartaraf_dalil` (hujjat idlar — mavjud `t2_tomon_murojaat_hujjat`), `qayta_tekshiruv` (kim, qachon, natija), `togtatish_talabi` (ishni to'xtatish), `shartnoma_band` (jarima/KPI asosi — faqat matn/ID).
- Oqim: ochiq → ijrochi javob + foto-dalil → «bajarildi» → beruvchi qayta tekshiruv (ijobiy → `yopildi`; salbiy → qayta ochiladi, `raund+1`) → `yopildi`.
- Muddat: kunlik skan (cron) → `muddat_yaqin` (T-2 kun), `muddat_otdi` hodisalari; takroriy ogohlantirish (qayta-qayta xabar yubormaslik uchun ketma-ketlik: 1 marta, keyin har 2 kunda — sozlanadi).
- KPI/jarima: tizim jarima summasini AVTOMATIK HISOBLAMAYDI (formula shartnomada, noma'lum = noma'lum). Faqat signal: `predpisaniya_kechikdi`, `predpisaniya_soni`, `qayta_ochilgan_soni` → `CONTROL_SIGNAL_ENGINE_V1` ga hodisa va PTO uchun hisobot. Jarima kerak bo'lsa — alohida tasdiqlanadigan `t2_smeta_ozgarish`-uslubidagi hujjat (keyin) **[⚠]**.
- Inspeksiya tashrifi: `t2_tekshiruv` (E3 §4.9) — tashrif, topilmalar → predpisaniya.

### 4.6 Bildirishnomalar (Telegram / email)

- Manba — mavjud outbox. Yangi mavzular (`^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$` ga mos, E3 §6 jadvaliga qo'shiladi): `ijro.yuborildi`, `ijro.izoh`, `ijro.tasdiqlandi`, `ijro.rad`, `ijro.imzo_kerak`, `ijro.imzolandi`, `ijro.talab_yetishmaydi`, `xat.keldi`, `xat.javob_kerak`, `xat.muddat_otdi`, `predpisaniya.berildi`, `predpisaniya.muddat_yaqin`, `predpisaniya.muddat_otdi`, `predpisaniya.qayta_tekshiruv`, `sertifikat.muddat_yaqin`.
- Iste'molchilar: `bildirishnoma` (bor) → `telegram` (yangi, kursorli, at-least-once, idempotent) → `email` (yangi, [T] Cloudflare Email Service yoki mavjud provayder; qaysi biri egasi qarori). Foydalanuvchi kanal sozlamasi: `t2_bildirishnoma_sozlama` (foydalanuvchi, mavzu guruhi, kanal, jim soatlar). Telegramga ulanish — mavjud `functions/api/telegram/` kodi va ulash kodi (10 daqiqa) uslubi; xabar matni 4 tilda, shaxsiy ma'lumot minimal (hujjat nomi + havola, mazmun emas).
- Eslatma/ogohlantirish cron: `/api/ijro-muddat-skan` (Cloudflare Cron, kuniga 1–2 marta), faqat «yaqinlashgan/o'tgan» qatorlarni indeks bo'yicha tanlaydi; outbox `operation_id` = deterministik (entity+hodisa+sana) → takror yo'q.

---

## 5. Ma'lumotlar modeli (eskizlar)

Umumiy qoida (E2 §5 shabloni): har jadvalda `kompaniya_id` (egasi tenant), `holat` (hard delete yo'q), `versiya`, `operation_id` (unique kompaniya bilan), `yaratdi_actor_id`, `yaratildi/yangilandi`; RLS on, policy yo'q, `revoke` anon/authenticated; RPC — SECURITY DEFINER, faqat `service_role`; outbox yoziladi; pul — NDS siz, NULL ≠ 0. Fayl baytlari DB'da YO'Q.

### 5.1 Jadvallar

| Jadval | Maqsad | Asosiy ustunlar |
|---|---|---|
| `t2_ijro_hujjat_turi` | Katalog (§2): kalit (`aosr`, `oraliq_qabul`, `sinov_zichlash`, …), nom/nom_ru, daraja (A–E), norma_matni, `shablon_joriy_versiya`, `imzo_qadamlari` jsonb, `oraliq_talab` (jurnal/AOSR bog'lash), faol | seed migratsiyada; yangi tur = 1 qator |
| `t2_ijro_shablon` | Shablon versiyasi | turi, versiya, `maydon_sxema` jsonb (nom, tip, majburiy, manba_qoidasi, birlik), `eksport_kodi`, holat |
| `t2_ijro_hujjat` | Konvert (barcha yangi turlar + eskilarga havola) | id, kompaniya_id, obyekt_id, shartnoma_id?, turi, shablon_id, raqam, sana, **holat** (§4.2), raund, `maydonlar` jsonb (≤64 KB, `manba` provenance bilan), `joriy_hujjat_id` → `t2_document_registry` (kanonik PDF), `xesh` (sha256), `ota_hujjat_id` (reviziya zanjiri), `manba_jadval/manba_id` (eski `t2_aosr`/`t2_lab_protokol` ga havola — nusxa emas), ish bog'lari |
| `t2_ijro_hujjat_bog` | Bog'lanishlar | hujjat_id, `qator_id`/`akt_qator_id`/`aosr_id`/`protokol_id`/`sertifikat_id`/`chizma_id` (kamida bittasi), rol (`asos`/`dalil`/`keyingi_ish`) |
| `t2_ijro_qadam` | Imzo/tasdiq qadamlari | hujjat_id, tartib, rol, imzolovchi_kompaniya_id, imzolovchi_foydalanuvchi_id?, holat (`kutmoqda/tasdiqladi/qaytardi/rad`), izoh, `qaror_vaqti`, muddat |
| `t2_ijro_imzo` | Imzo dalili | qadam_id, usul (`eimzo`/`qogoz`), `imzo_document_id` (R2 `.p7s` yoki skan), `hujjat_xeshi`, sertifikat meta (serial, subyekt, INN-xesh*, amal muddati), `tekshiruv_holati` (`tekshirilgan/tekshirilmagan/xato`), vaqt. *JSHSHIR ochiq saqlanmaydi (PII) — xesh/oxirgi raqamlar **[⚠]** |
| `t2_ijro_hodisa` | O'zgarmas jurnal | hujjat_id, tur, actor, matn, meta (trigger bilan update/delete taqiq — `t2_tomon_hodisa` uslubi) |
| `t2_ijro_qoida` | F2/ish → talab (§4.3) | shifr/kat/ish_turi mezoni jsonb, talab_turi, daraja, asos, faol, tartib; kompaniya darajasida qo'shimcha (override) mumkin |
| `t2_ijro_talab` (ixtiyoriy keyin) | Obyekt uchun qotirilgan checklist | obyekt_id, qoida_id, holat; v1 da kerak emas — hisob dinamik |
| `t2_sertifikat` | Reestr (IJ-17) | resurs/material (`resurs_kodi`), ishlab chiqaruvchi, partiya, №, sana, `amal_muddati`, fayl (document_id), holat, kirish nazorati xulosasi |
| `t2_sertifikat_bog` | Qayerda ishlatildi | sertifikat_id, aosr/hujjat/qator |
| `t2_jurnal` | Jurnal muqovasi (IJ-11…14) | obyekt_id, turi (`umumiy/beton/payvand/montaj`), raqam, mas'ul, holat (`ochiq/yopilgan`), muqova jsonb |
| `t2_jurnal_yozuv` | Yozuvlar | jurnal_id, sana, bo'lim, `maydonlar` jsonb, muallif, tasdiqlagan (texnadzor/loyihachi), `tuzatish_uchun_ota_id` (o'chirish yo'q) |
| `t2_xat` | Xat reestri | yo'nalish, raqam, sana, mavzu, `kimdan/kimga` (kompaniya_id yoki kontragent_id), obyekt/shartnoma, `javob_kerak`, `javob_muddati`, `ota_xat_id`, holat, `hujjat_id`, `ilovalar` (document_id massiv) |
| `t2_xat_raqam` | Hisoblagich | kompaniya_id, yil, yo'nalish, oxirgi_n |
| `t2_predpisaniya_tafsilot` | 1:1 murojaat ustiga (§4.5) | murojaat_id PK, me'yoriy asos, toifa, bartaraf_muddati, foto_majburiy, qayta_tekshiruv jsonb, togtatish, shartnoma_band |
| `t2_tekshiruv` (E3 §4.9 mavjud reja) | Inspeksiya/texnadzor tashrifi | inspektor_kompaniya_id, aloqa_id, obyekt_id, sana, natija, hujjat_idlar |
| `t2_bildirishnoma_sozlama` | Kanal sozlamasi | foydalanuvchi_id, guruh, kanal, faol, jim soatlar |
| `t2_telegram_ulanish` ... | mavjud mexanizmga qo'shiladi (yangi invite jadvali yo'q) | — |

Mavjud jadvallarga o'zgarish (additiv): `t2_tomon_resurs` — qatorlar (`ijro_hujjat`, `lab_protokol`, `sertifikat`, `jurnal`, `xat`) `faol=false`, tayyor bo'lganda `faol=true`; `t2_tomon_taqdim.manba_jadval` check kengayadi; `t2_izoh.manba_jadval` allow-list'ga `t2_ijro_hujjat` (resolver bilan); `t2_tomon_hodisa.tur` kengayishi — yoki `t2_ijro_hodisa` alohida (tavsiya: alohida; chunki bu check constraint har safar qayta yoziladi — migratsiya konfliktlari).

### 5.2 Eski jadvallar bilan munosabat

- `t2_aosr`, `t2_lab_protokol` — o'zgarmaydi, qayta yozilmaydi. Yangi `t2_ijro_hujjat` ularga `manba_jadval/manba_id` bilan ulanadi. Imzo/qadam/tomon oqimi shu konvert orqali ishlaydi; eski yozuvchi ekran (`/admin/aosr`) ishlashda davom etadi.
- `t2_aosr_yoz_v2` dagi `holat='tasdiqlangan'` yozish — yangi bosqichda cheklanadi: «tasdiqlangan» faqat `t2_ijro_qadam` tugagandan keyin (yoki `qogoz` + dalil fayl). Bu xulq o'zgarishi, egasi qarori bilan **[⚠]** (hozirgi foydalanuvchilar ishiga ta'sir qiladi).
- Data migratsiya (eski AOSR → konvert) keyinga, ixtiyoriy, prod'ga yozish faqat alohida ruxsat bilan.

### 5.3 RPC ro'yxati (hammasi `_v1`, imzo: `(p_actor_id, p_kompaniya_id, p_operation_id, p_kutilgan_versiya, p_malumot jsonb)` — E2 shabloni; actor sessiyadan)

Katalog/o'qish:
- `t2_ijro_turlar_v1`, `t2_ijro_shablon_ol_v1`
- `t2_ijro_hujjatlar_v1` (filtr: obyekt, tur, holat, muddat; sahifalash), `t2_ijro_hujjat_tafsilot_v1`
- `t2_ijro_yetishmayotgan_v1(obyekt, akt_id|davr)` — §4.3
- `t2_ijro_closeout_v1` (matritsa)

Yozish (egasi tenant):
- `t2_ijro_hujjat_yarat_v1`, `_yangila_v1` (qoralama), `_bog_saqla_v1`, `_bekor_v1`, `_reviziya_v1`
- `t2_ijro_yubor_v1` (tekshiruv: majburiy maydonlar to'liq; ochiq izoh yo'q; keyin `t2_tomon_taqdim_yarat` chaqiradi yoki ichki qadamlarni ochadi)
- `t2_ijro_qaror_v1` (qadam: tasdiqlash / izoh bilan qaytarish / rad)
- `t2_ijro_imzo_yoz_v1` (E-IMZO natijasi: `document_id` of `.p7s`, xesh, sertifikat meta), `t2_ijro_qogoz_imzo_v1`
- `t2_ijro_arxivla_v1`
Kompaniyalararo o'qish/qaror: `t2_ijro_taqdimlar_v1`, `t2_ijro_ulashilgan_tafsilot_v1` (har biri `t2_tomon_ruxsat_bor`), `t2_ijro_ulashilgan_qaror_v1`, `t2_ijro_ulashilgan_imzo_v1`.
Sertifikat/kirish nazorati: `t2_sertifikat_yoz_v1`, `_royxat_v1`, `_bog_saqla_v1`, `t2_kirish_nazorati_yoz_v1` (= IJ-09 hujjat).
Jurnal: `t2_jurnal_och_v1`, `t2_jurnal_yozuv_qosh_v1`, `t2_jurnal_yozuv_tasdiq_v1`, `t2_jurnal_yop_v1`, `t2_jurnal_royxat_v1`.
Xat: `t2_xat_yarat_v1` (raqam beradi), `t2_xat_yubor_v1`, `t2_xat_javob_v1`, `t2_xat_yop_v1`, `t2_xat_royxat_v1`, `t2_xat_zanjir_v1`.
Predpisaniya: `t2_predpisaniya_yarat_v1` (murojaat_yarat + tafsilot), `_bartaraf_v1`, `_qayta_tekshiruv_v1`; mavjud `t2_tomon_murojaat_*` qayta ishlatiladi. `t2_tekshiruv_yoz_v1`.
Fon: `t2_ijro_muddat_skan_v1` (cron — outbox hodisa yozadi), `t2_outbox_ishlov_v1` kengaytma (telegram/email iste'molchi).

Shlyuz: `frontend/functions/api/ijro.ts` (yangi), `SCOPED_APIS` ga qo'shiladi, RPC nomlari qat'iy ro'yxat, actor `roleAuthority`'dan, body'dagi actor/rolga ishonilmaydi; `/api/sb`/`/api/sb-yoz` ga kompaniyalararo narsa qo'shilmaydi (E2).

### 5.4 R2 fayl tuzilmasi

Yangi bucket/ombor YO'Q — mavjud `R2_CANONICAL` va `hujjat-yukla` (reserve → put → finalize). Kalitni server beradi (deterministik); quyidagi — mantiqiy tuzilma va nomlash konventsiyasi (mavjud reserve RPC'dagi kalit shabloniga moslash **[T: aniq pattern RPC ichida tekshirilsin]**):

```text
k{kompaniya_id}/o{obyekt_id}/ijro/{tur}/{yil}/{hujjat_id}/v{reviziya}/
    hujjat.pdf          # kanonik RU PDF (imzolanadigan baytlar)
    maydonlar.json      # kanonik JSON snapshot (xesh manbai)
    imzo/{qadam}.p7s    # E-IMZO imzolar
    ilova/{n}-{sha8}.*  # skan, foto (siqilgan ≤1600px), chizma
k{kompaniya_id}/o{obyekt_id}/jurnal/{tur}/{jurnal_id}/{yil-oy}.pdf   # davriy PDF snapshot
k{kompaniya_id}/xat/{yil}/{yo'nalish}/{xat_id}/xat.pdf, ilova/...
k{kompaniya_id}/o{obyekt_id}/sertifikat/{sertifikat_id}/{sha8}.pdf
```

Qoidalar: baytlar boshqa tenant bilan nusxalanmaydi; qabul qiluvchi faqat `t2_tomon_hujjat_ol_v1` uslubidagi RPC orqali (aniq hujjat) ochadi; `sha256` majburiy, `sha256_verified`; reviziya yangi fayl; Drive/Sheets — ikkilamchi sinxron nusxa.
Supabase yuki: DB'da faqat metadata va ≤64 KB jsonb; hujjat PDF'i brauzerda/Worker'da yasaladi (`RasmiyVaraq`) va R2'ga yoziladi; ro'yxat RPC'lari sahifalangan (≤200), `select` ustunlari tor; cron skan indeksli (`muddat`, `holat` partial index); outbox payload ≤4 KB (mavjud check).

### 5.5 Ekranlar

Ofis web (`/admin/ijro/*`, papka `frontend/src/admin/ijro/`, `marshrutlar.tsx`, i18n `lugat/qism/ijro.json`):
1. **Ijro markazi** (bosh): obyekt tanlash, 4 ta karta (kutilmoqda imzo, yetishmayotgan, muddat yaqin, ochiq ko'rsatmalar).
2. **Hujjatlar reestri**: filtr tur/holat/davr; qatorga bosganda tafsilot (maydonlar, fayl, qadamlar, jurnal).
3. **Yaratish ustasi** (wizard): tur → manba tanlash (smeta qator/F2) → avto-to'ldirish ko'rish → fayl → yuborish.
4. **Yetishmayotgan hujjatlar / Closeout matritsa**: qator × talab; F2 ekranida panel.
5. **Imzo markazim** («Menga kelganlar»): kutayotgan qadamlar, E-IMZO tugmasi, ommaviy imzo (bir xil tur).
6. **Laboratoriya** (mavjud `/admin/aosr` ichidan ajratiladi): protokollar, so'rovlar (`sinov_sorovi`), bog'lash.
7. **Sertifikat va kirish nazorati**.
8. **Jurnallar** (4 tur): kunlik yozuv, davr yopish, PDF.
9. **Xatlar**: kiruvchi/chiquvchi, zanjir ko'rinishi, javob muddati, yaratish.
10. **Ko'rsatmalar**: ro'yxat/tafsilot, foto-dalil, qayta tekshiruv, hisobot (kechikkanlar).
11. **Sozlamalar**: qoidalar (override), imzo qadamlari (o'qish), bildirishnoma kanallari, xat raqam formati.

Tomon kabineti (`/admin/kabinet/<tomon>`; mavjud `/admin/zakazchik/*` saqlanadi):
- `/admin/kabinet/laboratoriya`: kelgan so'rovlar → protokol yuklash/imzo.
- `/admin/kabinet/nazorat` (texnadzor/inspeksiya): imzolash, ko'rsatma berish, qayta tekshirish, tashrif.
- Buyurtmachi: mavjud `TaqdimlarInbox`/`Murojaatlar` ga ijro hujjati va xat bo'limlari.
- `/admin/kabinet/loyihachi`: mualliflik imzosi, remark, chizma (keyin).
- Ekspertiza: `/admin/kabinet/ekspertiza` — faqat o'qish + izoh (kichik).
Mobil (`/m/inspektor`, E4/F4 bog'liq): foto-dalil, ko'rsatma bartaraf belgisi, offline navbat (operation_id).
Hammasi `t()` bilan, lug'at yangi faylga; pul — `SummaJuft`; rasmiy hujjat RU.

---

## 6. Bosqichli reja (har PR 1–2 hafta)

Umumiy: har PR — owned paths, migratsiya + rollback + `supabase/tests/*_contract.sql` (E2 §6, minimal 10 holat), shlyuz testi, i18n, `node ops/governance-check.cjs`. Prod migratsiyani arxitektura ko'rigidan keyin parent qo'llaydi (E6). Migratsiya raqami — nazorat oralig'i `20261108300000–399999` **[T: repo'da `202611…` dan keyingi (masalan `20261124…`) migratsiyalar bor — yangi fayl tartibi oxirgi qo'llangandan keyin bo'lishi shart; ko'rik paytida tekshiriladi]**.

| # | PR | Mazmun | Tayyor mezoni |
|---|---|---|---|
| **PR1** (1 hafta) | **Turlar katalogi + talab qoidalari + «F2 uchun yetishmayotgan hujjatlar» (faqat o'qish)** | `t2_ijro_hujjat_turi` (seed: §2 dagi IJ-01…IJ-20, `norma_matni` va ishonch belgisi), `t2_ijro_qoida` (boshlang'ich: yashirin ish → АОСR; beton → lab protokol(beton) + sertifikat [T]; payvand/gidravlik/elektr — `tekshirish_kerak`), RPC `t2_ijro_turlar_v1`, `t2_ijro_yetishmayotgan_v1` (mavjud `t2_aosr*`, `t2_lab_protokol*`, `t2_document_registry` dan o'qiydi), `functions/api/ijro.ts` (GET), `api/t2-ijro-markaz.ts`, UI: F2 ekranida panel + `/admin/ijro` ichida «Yetishmayotgan» sahifa (yagona), i18n, `validateProjectCloseout` ni katalog turlariga kengaytirish | Yozuv oqimi yo'q; mavjud jadvallar o'zgarmaydi; tekshiruv F2 ni bloklamaydi; contract test (katalog, qoida, tenant izolyatsiya, anon yo'q, sahifalash); egasi ko'rib turib «to'g'ri/noto'g'ri» deb qoidalarni to'g'rilaydi — normalar ishonchsizligini yopadi |
| PR2 (1–2 h) | Konvert + shablon + holat mashinasi (o'z tenant ichida) | `t2_ijro_hujjat`, `_shablon`, `_bog`, `_hodisa`, RPC yarat/yangila/yubor/qaror (ichki qadamlar), 7-ilova (IJ-02) va 2 ta sinov akti shabloni (zichlash, beton) RU eksport (`RasmiyVaraq`), `qogoz` imzo (skan majburiy). `t2_aosr` ga havola (migratsiyasiz) | Pudratchi ichida yaratish→ko'rib chiqish→tasdiq→arxiv; `holat='tasdiqlangan'` cheklovi (egasi tasdig'i bilan) |
| PR3 (2 h) | Tomonlar: kompaniyalararo ijro + laboratoriya/nazorat kabineti | `t2_tomon_resurs`: `aosr`, `ijro_hujjat`, `lab_protokol` → `faol=true` (alohida kichik migratsiya, testdan keyin), taqdim `manba_jadval` kengayishi, `t2_ijro_ulashilgan_*` RPC, `capability` kengaytma (`quality.write`, `quality.sign`, `design.review`) — ⚠, kabinetlar: laboratoriya, nazorat; `sinov_sorovi` → protokol oqimi | Texnadzor tizimda АОСRni ko'rib qaror beradi; lab o'z kabinetidan protokol yuklaydi; 10 holatli grant testi (aloqa yopilsa — ko'rinmaydi) |
| PR4 (1 h) | Bildirishnoma: Telegram + email iste'molchilar + muddat skan | yangi outbox mavzular, `telegram`/`email` kursor iste'molchilari, `t2_bildirishnoma_sozlama`, cron `ijro-muddat-skan` | PR3 hodisalari Telegramga tushadi; takror yo'q (idempotent); kanal sozlamasi |
| PR5 (1–2 h) | Xat reestri | `t2_xat`, `t2_xat_raqam`, RPC, ekranlar, javob zanjiri, platforma ichi yetkazish (taqdim `xat`) | raqamlash parallel so'rovda takrorlanmaydi (test) |
| PR6 (1–2 h) | Predpisaniya kengaytmasi + inspeksiya tashrifi | `t2_predpisaniya_tafsilot`, `t2_tekshiruv`, foto-dalil, qayta tekshiruv, KPI signal hodisalari, ko'rsatmalar hisoboti | muddat o'tgan ko'rsatma signal beradi; jarima hisoblanmaydi |
| PR7 (2 h) | E-IMZO | brauzer imzolash komponenti, `t2_ijro_imzo`, `.p7s` R2, tekshiruv tanlovi (egasi qarori), ommaviy imzo | imzolangan hujjat xeshi o'zgarsa — «buzilgan» deb ko'rsatiladi; test sertifikat bilan |
| PR8 (1–2 h) | Sertifikat/pasport reestri + kirish nazorati (IJ-09, IJ-17) | `t2_sertifikat*`, muddat signal, АОСR materiallar maydoniga avto-bog | sertifikati muddati o'tgan material АОСRda ogohlantiriladi |
| PR9 (2 h) | Jurnallar (umumiy, beton, payvand, montaj) | `t2_jurnal*`, davr yopish → PDF snapshot, tasdiq yozuvlari | yozuv o'chmaydi, tuzatish alohida yozuv |
| PR10 (1–2 h) | Ijro sxemalari/as-built + closeout paket + ekspertiza/inspeksiya yuzasi | IJ-15/16 reestri, closeout indeks eksporti (IJ-20), ekspertiza kabineti | obyekt yopilish checklisti to'liq |

Tartib mantig'i: PR1 darhol qiymat beradi va xavfsiz (faqat o'qish); PR2–3 «tomonlar aloqasi»ning yadrosini yopadi; PR4 — ogohlantirish; PR5–6 — xat va ko'rsatma; PR7 — E-IMZO (tashqi bog'liqlik — oxirga, lekin yo'l xaritasida erta boshlash mumkin: egasi tekshiruv xizmatini erta tanlasa); PR8–10 — to'ldirish.

### PR1 — aniq hajm (birinchi PR nima bo'lishi kerak)

Nima BO'LADI: (a) katalog jadvali + seed; (b) qoida jadvali + 6–8 boshlang'ich qoida (faqat «majburiy» bo'lganlari: yashirin ish → АОСР; qolganlari `tekshirish_kerak`); (c) bitta o'qish RPC (yetishmayotgan) va katalog RPC; (d) GET shlyuz; (e) F2 ekranida «Ijro hujjatlari: n ta yetishmaydi» paneli va ro'yxat sahifasi; (f) 4 tilda matnlar; (g) contract test + shlyuz testi + closeout validator testi.
Nima BO'LMAYDI: yozuv RPC, imzo, tomon resurslarini yoqish, capability o'zgarishi, `t2_aosr` o'zgarishi, bloklash, bildirishnoma. Shuning uchun egasining ⚠ qarorlari PR1 ni to'smaydi (faqat qoidalar mazmuni va norma matnini PTO tekshiradi).

---

## 7. Ochiq savollar (egasi javob berishi kerak)

1. Imzo darajasi: E-IMZO majburiymi, yoki boshlanishida `qogoz` imzo (skan + mas'ul tasdig'i) ham qabul qilinadimi? Va davlat/yirik buyurtmachi obyektlarida qaysi biri talab qilinadi?
2. E-IMZO tekshiruvi: tashqi tekshiruv xizmatiga (pullik/SLA bor) ulanamizmi, yoki dastlab imzoni saqlab, «tekshirilmagan» deb ko'rsatamizmi?
3. `t2_aosr_yoz_v2` da yozuvchi o'zi `tasdiqlangan` qo'ya olishi — bekor qilinsinmi (faqat imzo qadamlari/`qogoz`+dalil bilan)? Eski foydalanuvchilar uchun o'tish davri kerakmi?
4. Normalar: PTO/yuristingiz IJ-03…IJ-09, IJ-12…IJ-17 uchun amaldagi norma/ilova raqamlarini va rasmiy blanklarni bera oladimi? Ayniqsa jurnallar (beton, payvand, montaj) va sinov aktlari.
5. Laboratoriyalar o'z tenanti sifatida tizimga kiradimi (taklif kodi bilan), yoki ko'pchiligi oflayn qoladi (pudratchi protokolni skan qilib yuklaydi)? Akkreditatsiya attestati tekshiruvi kerakmi?
6. Texnadzor: buyurtmachi ichidagi xodimmi yoki alohida tashkilotmi? Ikkalasi ham bo'ladimi? АОСР'ni kimlar majburiy imzolashi (buyurtmachi, loyihachi) shartnomaga bog'liq — shartnoma bo'yicha sozlama kerakmi?
7. Yangi capability'lar (`quality.write`, `quality.sign`, `design.review`, `correspondence.*`) va mavjud `_t2_tomon_rol_ok` rolga bog'langanligini capability'ga ko'chirish tasdiqlansinmi (E2 ⚠ bandi)?
8. F2 yopilishi uchun yetishmayotgan hujjat — avval faqat ogohlantirish bo'lsinmi? Keyin qaysi obyekt/shartnomalarda bloklash yoqiladi?
9. Xat raqamlash formati va qog'oz xatlar raqami (qo'lda kiritiladimi, tizim beradimi)?
10. Ko'rsatma uchun jarima/KPI: shartnomada aniq qoida bormi? Tizim faqat signal beradi, summani hisoblamaydi — shu yetarlimi?
11. Email kanali: qaysi provayder (Cloudflare Email Service / mavjud SMTP)? Telegram — faqat mavjud bot (`qur_uz_bot`) orqalimi?
12. Ekspertiza va inspeksiya tashkilotlari tizimga kiradimi, yoki faqat «tashqi» hujjat sifatida skan yuklanadi (oflayn tomon)? Ularga kabinet kerakmi hozir?
13. Jurnallar: elektron jurnal qog'oz jurnalning o'rnini bosadimi, yoki faqat nusxa/ko'zgu (qog'oz asosiy)? Bu IJ-11…14 ning huquqiy maqomi va PR9 hajmini belgilaydi.
14. Mavjud АОСР/protokol yozuvlarini keyin yangi konvertga ko'chirish kerakmi (prod'ga yozish — alohida ruxsat) yoki eski holda qolsinmi?

---

## Ilova A — tekshirilgan fayllar

Hujjatlar: `AGENTS.md`, `docs/architecture/ekotizim/E1_TOMON_MODELI.md`, `E2_TENANCY_RUXSAT.md`, `E3_DOMEN_CHEGARALARI.md`, `E4_KLIENT_YUZALARI.md`, `E6_YOL_XARITASI.md`, `docs/architecture/HUJJAT_STANDARTI_V1.md`, `UZ_CONSTRUCTION_DOCUMENT_CATALOG_AND_TEMPLATES_V1.md`.
Migratsiyalar: `20261105100000_t2_ijro_aosr_lab_logo_v1`, `20261106200000_t2_tomon_aloqa_v1`, `…210000_t2_tomon_resurslar_v1`, `…220000_t2_tomon_hujjat_ol_v1`, `…240000_t2_tomon_murojaat_v1`, `20261108000000_t2_ekotizim_f1_yadro_v1`, `20261108010000_t2_ekotizim_f1_ruxsat_v1`, `20261108100000_t2_izoh_v1`, `20261108300000_t2_nazorat_aosr_holat_v1`, `20260830052000_t2_company_storage_foundation_v1`.
Kod: `frontend/src/api/t2-aosr.ts`, `t2-ijro.ts`, `src/lib/aosr-export.ts`, `src/lib/construction-document-control/*`, `src/components/construction-document-control/*`, `src/admin/zakazchik/*`, `src/test02/TestAosr.tsx`, `functions/api/{sb-yoz,tomon,hujjat-nazorat,hujjat-yukla,hujjat-r2}.ts`.
Prod Supabase (faqat SELECT): `information_schema` (jadval/ustun nomlari), `t2_tomon_resurs` (katalog: kalit/guruh/faol).
