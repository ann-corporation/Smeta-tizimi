# Kabinetlar: BUYURTMACHI va TEXNIK NAZORAT (1-bosqich: tadqiqot va loyiha, kod yo'q)

Sana 2026-11-14, tarmoq `claude/kabinet-buyurtmachi`. Dalil: `fayl:qator` yoki so'rov. TAXMIN — tekshirilmagan, egasiga savol.
Maxfiylik: real hujjatlardan faqat fayl NOMLARI mavzusi olingan; ism, summa, INN yo'q.

## 0. Qisqa xulosa
- Server tomoni deyarli tayyor: taqdim -> qaror, murojaat -> javob -> yopish, to'lov xabari, vakolat/tayinlash (migratsiya `20261218300000_t2_nazorat_uch_tur_v1`). Muammo — YUZA: bir ish 4 sahifada, rol menyusi pudratchiniki bilan deyarli bir xil, kabinet bosh sahifasi yo'q.
- Buyurtmachi ham, texnadzor ham ayni paytda pudratchi menyusining nusxasini ko'radi (Obyekt, Hujjatlar, Moliya, F2...), o'ziga kerakli 6 ish esa «Tomonlar» ostida «Kiruvchi (tomonlar)» tablarida yashirin.
- Prodda kompaniya 123 da buyurtmachi YO'Q: `t2_shartnoma` 6 ta, `zakazchik_inn` to'ldirilgani 0; `t2_tomon_aloqa` 7, `t2_tomon_taqdim` 1, `t2_tomon_vakolat` 0, `t2_nazorat_tayinlash` 0, `t2_tomon_murojaat` 0. Ya'ni oqim prodda hali ishlatilmagan.

## (a) Haqiqiy ish (direksiya xatlari fayl nomlaridan, `Вх./Исх.(Дирекция)`, 22 kiruvchi + 36 chiquvchi)
| Direksiya/texnadzor nima qiladi | Xat mavzusi (fayl nomidan) | Tizimda kerak bo'lgan ob'ekt |
|---|---|---|
| Hujjat taqdim etishni talab qiladi | «Поручение, hujjatlarni taqdim qilish», «Yopiq ishlar dalolatnomalarini taqdim etish» | Talab (murojaat turi `hujjat_sorovi`) + muddat + javob dalili |
| Grafik talab qiladi | «График taqdim qilish bo'yicha», «51 savolni hal qilish grafigi» | Talab + muddat; grafik sahifasi (`/admin/grafik`) bilan bog'lanish |
| Pul nazorati | «Moliyalashtirish», «To'langan mablag'dan qanday foydalanilgani», «To'langan mablag' monitoringi» | To'langan summa va uning sarfi (to'lov monitoringi) |
| Sifat/zamechaniya | «Texnadzor zamechaniyalari tuzatilmaganligi», «Daraxt, brusчатка sifatsizligi» | Predpisaniya -> javob -> qayta tekshiruv -> yopish (muddat, kechikish) |
| Ish hajmi/smeta qarorlari | «Smetaga qo'shish» (metall to'sin, import material, daraxt, 2-lot hajmlari), «Bajarilgan ishlar foizi» | O'zgartirish/qo'shimcha ish so'rovi; bajarilish foizi |
| Ruxsat/ordrlar (pudratchi so'raydi, direksiya hal qiladi) | «Ordеr olish: internet, tashqi suv, 10 kV» | Oddiy xat (xatlar reestri) |
| Loyihachiga yo'naltirish | «Loyiha institutiga xat», «loyiha instituti javobi» | Xat + loyihachi kabinetiga o'tkazish |
Xulosa: direksiya 5 ta ish bajaradi — (1) talab/xat yuboradi, (2) pudratchi hujjatini qabul qiladi/qaytaradi, (3) zamechaniya beradi va yopilishini nazorat qiladi, (4) bajarilish foizi va to'lov/sarfni kuzatadi, (5) smeta o'zgarishi so'rovini hal qiladi. Texnadzor: obyektda tekshiradi (foto), AOSR/F2 bo'yicha texnik qaror, predpisaniya beradi.

## (b) Hozirgi holat
Menyu natijasi (`ishJoyiMenyu` ni 4 rol uchun ishga tushirib olindi; `lib/nav/ishJoyiMenyu.ts`, rol ruxsatlari `effective-authorization.ts:114-125`):
| Rol | Ruxsat | Ko'radi |
|---|---|---|
| buyurtmachi | company/project/object/document/financial/f2/smeta/fakt/narx/accounting.read | Bugun(4), Obyektlar+loyihalar, Smeta va Fakt, F2(3 tab), Hujjatlar(3 tab), Hujjat aylanishi, Imzo, Shartnomalar, Ishtirokchilar, «Kiruvchi (tomonlar)» 4 tab, Kompaniya(3) |
| inspektor | company/object/document/quality.read/inspect/decide (project.read YO'Q) | Bugun(4), Hujjatlar=`/admin/aosr`, Hujjat aylanishi, Imzo, «Kiruvchi» 4 tab; Texnik nazorat — faqat «Yana…» ichida |
| kuzatuvchi | pudratchi bilan bir xil ruxsat | pudratchi bilan bir xil menyu; «Bugun» tugmalari — `UMUMIY_PROFIL` (profil yo'q) |
Sahifa-sahifa baho:
| Sahifa | Baho | Dalil |
|---|---|---|
| `/admin/zakazchik` Buyurtmachi kabineti | KERAK — bosh sahifa bo'lishi kerak; hozir ichida: Bugun bo'limi, nazorat tayinlash, KPI, qaror kutayotganlar, obyektlar jadvali | `ZakazchikKabinet.tsx` |
| `/admin/zakazchik/obyekt/:aloqa/:obyekt` | KERAK (obyekt portali) | `ObyektPortali.tsx` |
| `/admin/taqdimlar` Tomonlar hujjatlari | KERAK, lekin 2-quti: «Kelgan» + «Yuborilgan» bitta sahifada aralash (yuborilgan — pudratchi ishi) | `TaqdimlarInbox.tsx:2-4` |
| `/admin/murojaatlar` | KERAK (zamechaniya/talab); «menga/mendan» aralash | `Murojaatlar.tsx:2-5` |
| `/admin/hujjat-aylanish` | TAKROR: «Kiruvchi quti» + «Tasdiq zanjirlari» + Xatlar + Shablonlar; kiruvchi quti taqdim+murojaat bilan bir narsa | `HujjatAylanish.tsx:3-4,28,360` |
| `/admin/laboratoriya` | PUDRATCHI/LAB ning ishi; buyurtmachi menyusida «Kiruvchi» tabida ko'rinadi — keraksiz shovqin. Texnadzor uchun faqat natija o'qish (NazoratUy ichida bor) | menyu dumpi |
| `/admin/nazorat` Texnik nazorat uyi | KERAK — texnadzorning bosh sahifasi, lekin inspektorda «Yana…» ostida (qoshimcha:true) — XATO | `sahifa.ts:134` |
| `/admin/nazorat/tekshiruv`, `/jurnal` | KERAK (obyektdagi ish); formada kamera/geolokatsiya chaqiruvi 0 (TAXMIN: telefon kamerasi `<input capture>` orqali) | `TekshiruvForma.tsx` |
| `/admin/aosr`, `/admin/hujjat-nazorat` | texnadzorga AOSR ko'rish uchun kerak; `hujjat-nazorat` pudratchi tekshiruvi — inspektor uchun asosiy tugmada «Hujjatlar»dan bu yoqqa tushadi (chalkash) | `tomonProfil.ts:42` |
| `/admin/aloqalar` (Kontragentlar tabi) | KERAK bir marta (ulanish); har kunlik emas | `TomonlarAloqa.tsx` |
| Bugun / Ish joylarim / Kurs / Mening xizmatlarim / Topshiriqlar | Bugun KERAK; «Ish joylarim», «Mening xizmatlarim» (mutaxassis, haydovchi) — buyurtmachi/texnadzor uchun KERAKSIZ (o'lik shovqin) | menyu dumpi |
| Obyektlar+loyihalar (buyurtmachi menyusida) | TAKROR/pudratchiniki: buyurtmachi o'z-o'zidan «obyekt»ni emas, ulangan pudratchi obyektlarini ko'radi (kabinet jadvali) | `t2_zakazchik_obyektlar_v2` grant orqali |
| F2 (tarix/reestr/nakopitelniy) | Buyurtmachida PUDRATCHINIKI: u F2 ni o'z kompaniyasida emas, taqdim orqali ko'radi | — |
| Shartnomalar va tomonlar, Imzo, Akkaunt, Sozlamalar | Shartnoma — o'z shartnomasi uchun KERAK; imzo KERAK; qolgani umumiy |
«Kiruvchi quti» 4 yuza: (1) Taqdimlar «Kelgan», (2) Hujjat aylanishi «Kiruvchi hujjatlar», (3) Murojaatlar «menga», (4) Kabinet «Qaror kutayotgan» + Bugun «Sizdan nima kutilmoqda» (`ZakazchikKabinet.tsx:75-80`, `BugunBolimi.tsx`). Audit 2 joy degan edi (`AUDIT_PUDRATCHI_OQIM` qator 79); aslida 4-5.
Nomlanish nomuvofiqligi: reestrda qabul qiluvchi rol `zakazchik`/`texnadzor` (`lib/hujjat-dvigatel/reestr.ts:251`), zanjirda va menyuda `buyurtmachi`/`inspektor`/`texnadzor` (`zanjir.ts:55`, `tomonProfil.ts`) — uch xil nom bir tushuncha uchun.

## (c) Uzilishlar
| # | Uzilish | Dalil | Natija |
|---|---|---|---|
| U-B1 | Qaror kutayotganlar 4 joyda, hech biri to'liq emas; texnadzor «Kiruvchi» tabiga chiqib, 3 tab orasida qidiradi | yuqorida | Hujjat ko'rinmaydi / ikki marta sanaladi |
| U-B2 | Bir hujjatga ikki tasdiq mexanizmi: taqdim (`t2_tomon_taqdim`, AOSR/F2) va tasdiq zanjiri (`STANDART_ZANJIRLAR.aosr: texnadzor -> buyurtmachi`) | `zanjir.ts:55`, `reestr.ts:251` | Qaysi biri «rasmiy»? Qo'lda qayta yuborish |
| U-B3 | Forma-3 buyurtmachiga taqdim orqali ketmaydi: `taqdim.resurs:'hujjat', manbaJadval:null`; `ZakazchigaYuborish` faqat f2 va aosr | `reestr.ts:251-255`, `ZakazchigaYuborish.tsx` | F3 (pul hujjati) uchun yagona yo'l — hujjat aylanishi/qo'lda; direksiya eng ko'p so'raydigan hujjat |
| U-B4 | Zamechaniya -> javob -> yopish zanjiri BOR (murojaat: ochiq->bajarildi->yopildi, raund), lekin obyektdagi tekshiruv (`/nazorat/tekshiruv`) topgan kamchilik avtomatik predpisaniya bo'lmaydi (TAXMIN: faqat `PredpisaniyaOgohlantirish` ogohlantiradi) | `Murojaatlar.tsx:2-5`, `PredpisaniyaOgohlantirish.tsx` | Texnadzor bir narsani ikki joyga yozadi |
| U-B5 | To'lov: buyurtmachi `TolovXabariYozish`, pudratchi tasdiqlaydi -> `t2_tolov`. Yaxshi. Lekin direksiyaning «to'langan mablag'dan foydalanish» talabi (xat №252, №236) uchun pudratchi tomonda sarf hisoboti buyurtmachiga ko'rinmaydi; Bugun faqat `tolangan`/`qarz` | `TolovXabarlari.tsx:1-5`, `BugunObyekt` | To'lov monitoringi bir tomonlama |
| U-B6 | Buyurtmachida talab (xat) yuborish: `ObyektSorovlari` faqat 2 tur (`ozgartirish_sorovi`, `hujjat_sorovi`); «grafik talabi», «zamechaniya», «foiz so'rovi» turlari yo'q (`murojaat_turlari` serverdan; TAXMIN: predpisaniya/remark turlari bor, grafik yo'q) | `ObyektSorovlari.tsx:11` | Direksiya xatlari tizimdan tashqarida |
| U-B7 | Vakil texnadzor (B) uchun «kim nomidan» faqat NazoratUy ichida qatorcha; hujjatlar ro'yxatida qaysi buyurtmachi nomidan ekani ko'rinishi TAXMIN | `NazoratUy.tsx:80-95` | Aralashadi, agar texnadzor ikki direksiyaga xizmat qilsa |
| U-B8 | Bosh pudratchi sub aktini `/admin/subpudrat` da oladi (`t2_sub_akt_royxat_v1`, yo'nalish `kelgan`), buyurtmachi kabinetida emas | `sahifa.ts:129`, RPC | Bir odam ikki «qabul»: direksiyaniki alohida, subniki alohida sahifa |
| U-B9 | Direksiya/texnadzor menyusida pudratchi bo'limlari (F2 reestr, Narxlash, Obyektlar+loyihalar) — «hamma narsa bir joyda» shikoyatining aynan o'zi | menyu dumpi | Chalkashlik |
| U-B10 | Bajarilish foizi: `sertifikatlangan F2 / shartnoma` (`ObyektPortali`), pudratchi fakti bo'yicha `fakt` paketi alohida; direksiya xati «bajarilgan ishlar foizi» — qaysi ta'rif? | `bajarilishFoizi`, `BugunObyekt.fakt` | TAXMIN: egasidan so'rash |

## (d) Maqsad kabinetlar
Har ikkisi — bitta ish joyi, o'z menyusi (5-6 band), telefonda ham.
### «Buyurtmachi» kabineti
| Band | Mazmun | Mavjud manba | Qoladi/birlashadi |
|---|---|---|---|
| 1. Bugun | Qaror kutayotganlar (hujjat, F3, to'lov javobi, javob bergan murojaat), kechikkan talablar | `BugunBolimi` + `KutayotganQator` | `ZakazchikKabinet` tepasi = shu |
| 2. Obyektlar | Pudratchi bo'yicha jadval: bajarilish %, shartnoma, F2/F3, to'langan, qarz; obyekt portali | kabinet jadvali + `ObyektPortali` | Qoladi; «Obyektlar+loyihalar» yashiriladi |
| 3. Kelgan hujjatlar | BITTA quti: taqdim (F2, AOSR, F3, akt), xat; filtr: kutayotgan/qaror qilingan | `TaqdimlarInbox` «Kelgan» + `HujjatAylanish` kiruvchi | Birlashadi; «Yuborilgan» pudratchiga |
| 4. Talablar va xatlar | Yangi talab (turlar: hujjat, grafik, zamechaniya, o'zgartirish), xatlar reestri | `ObyektSorovlari`, `Murojaatlar`, xat reestri | Birlashadi (bitta «Talablar» ro'yxati, raund/muddat bilan) |
| 5. Zamechaniyalar | Texnadzor predpisaniyalari holati (ochiq/kechikkan/yopilgan) | `Murojaatlar` filtri | Talablar ichida filtr |
| 6. To'lovlar | To'lov xabari yuborish; pudratchi tasdig'i holati; qarz | `TolovXabarlari` | Qoladi |
| Sozlamalar | Texnadzorni tayinlash (A/B), ulangan pudratchilar | `NazoratTayinlash`, `TomonlarAloqa` | Bir marta ishlatiladigan |
### «Texnik nazorat» kabineti
| Band | Mazmun | Mavjud manba | Qoladi/birlashadi |
|---|---|---|---|
| 1. Bugun | Qaror kutayotgan AOSR/F2, kechikkan predpisaniya, qayta tekshiruv | `NazoratUy` tugmalari | Qoladi, bosh sahifa |
| 2. Obyekt (telefon) | Tekshiruv + foto + predpisaniya bitta oqimda | `TekshiruvForma`, `KorikPanellari`, `AosrFotoBiriktir` | Qoladi |
| 3. Kelgan hujjatlar | Bitta quti (buyurtmachining 3-bandi bilan bir komponent, rol bo'yicha filtr) | yuqoridagi | Birlashadi |
| 4. Predpisaniyalar | Berish -> pudratchi javobi -> qayta tekshiruv -> yopish | `Murojaatlar` | Qoladi |
| 5. Jurnal | Tekshiruvlar jurnali + Excel | `TekshiruvJurnal` | Qoladi |
| 6. Laboratoriya natijalari | O'qish | `NazoratUy` | Qoladi |
Telefon: texnadzor obyektda yuradi. Hozir NazoratUy tugmalari `sm:grid-cols-2` kartochkalar (mobil moslik TAXMIN: sinalmagan); yo'qotilishi mumkin bo'lgan narsa — oflayn foto navbati (`UstaBugun`da bor; texnadzorda yo'q — TAXMIN).
### Rol x bo'lim
| Bo'lim | buyurtmachi | texnadzor (A: xodim) | texnadzor (B: vakil) | kuzatuvchi |
|---|---|---|---|---|
| Bugun | to'liq | texnik qaror ro'yxati | vakolat doirasida | faqat o'qish |
| Obyektlar/pul | to'liq (grant bo'yicha) | faqat %, pul yo'q | faqat grant resurslari | o'qish |
| Kelgan hujjatlar | yakuniy qaror | texnik qaror | `texnik_qaror` yoki `qaror` (vakolat amallari) | yo'q |
| Talablar/zamechaniya | yozadi, yopadi | predpisaniya beradi | beradi (vakolat) | ko'radi |
| To'lovlar | yozadi | yo'q | yo'q | yo'q |
Ruxsat serverda majburlanadi (`t2_tomon_ruxsat_bor` vakil shoxi); UI faqat ko'rsatmaslik uchun.

## (e) Bog'lanishlar
| Kabinet | Bog'lanish | Qanday |
|---|---|---|
| Pudratchi | Yuborilgan hujjat -> buyurtmachi «Kelgan»; qaror -> pudratchida «Yuborilgan» holat belgisi (`ZakazchigaYuborish` doim holat ko'rsatadi) | Mavjud; yangi pudratchi-tomon kabineti shu holatni «Bugun»ga olib chiqadi |
| Pudratchi | To'lov xabari -> pudratchi tasdig'i -> `t2_tolov` -> qarz | Mavjud |
| Subpudratchi | Sub topshiradi (`t2_sub_topshir_v1`) -> bosh pudratchi qabul (`t2_sub_akt_qaror_v1`) -> bosh pudratchi o'z hujjati sifatida direksiyaga | Bosh pudratchi = sub uchun buyurtmachi: o'sha «Kelgan hujjatlar» komponenti, manba `kelgan` sub aktlar bilan kengayadi |
| Loyihachi | Loyiha o'zgarishi / mualliflik remarki -> «Talablar»da tur sifatida; zanjir `loyiha_ozgarish: loyihachi -> buyurtmachi` | Murojaat turlari + zanjir; birlashadi |
| Laboratoriya | Natija -> texnadzorga o'qish (`labNatijalarOl`); `lab_protokol: texnadzor` zanjiri | Mavjud |
| Bir odam, ikki kabinet | Bosh pudratchi: «Pudratchi» (direksiyaga) + «Buyurtmachi» (subga) | Kabinet almashtirgich; kabinetlar munosabatlardan hosil bo'ladi (UMUMIY model §2). Bitta komponent, ikki kontekst (`kompaniyaId` + `aloqa`) |

## (f) Egasining real holati — QURISH REJASI (faqat reja, prodga yozilmaydi)
Maqsad: Navoiy bog'i (loyiha 22, kompaniya 123), direksiya = buyurtmachi, ikki texnadzor = direksiya xodimi (A).
| Qadam | RPC/ma'lumot | Kerak narsa |
|---|---|---|
| 1 | Direksiya kompaniyasi: `t2_kompaniya` (rasmiy nom, STIR) — pudratchi ro'yxatdan o'tkazadi yoki taklif orqali (`kompaniyaQidir`/`taklifYubor`, `t2_tomon_taklif_v1`) | Rasmiy to'liq nom, STIR (egasidan) |
| 2 | Aloqa: pudratchi -> direksiya, rollar `pudratchi`/`buyurtmachi` (`t2_tomon_taklif_v1`); direksiya qabul qiladi (`t2_tomon_javob_v1`) yoki kod orqali (`kod_qabul`) | Direksiyada kamida bitta tizim foydalanuvchisi (rahbar/ma'sul) |
| 3 | Grant: pudratchi direksiyaga obyekt va resurslarni ochadi (`t2_tomon_grant_saqla_v1`: shartnoma_xulosa, f2, lab_natija, obyekt_holat) | Qaysi obyektlar, qaysi resurs |
| 4 | Shartnomaga bog'lash: `t2_shartnoma.zakazchik_kompaniya_id` + `zakazchik_inn` (hozir 6 shartnomada bo'sh) | STIR, to'liq nom, bank rekvizitlari (rekvizit — bilan Forma-3 ham to'ldiriladi, `forma3-rekvizit.ts:23`) |
| 5 | Texnadzorlar: direksiya kompaniyasiga a'zo qilish (`t2_azolik`, rol `inspektor`, `quality.decide`), keyin `t2_nazorat_tayinlash_v1` (A) | Har texnadzorning foydalanuvchi hisobi (telefon/email); `nazoratTayinla` faqat tizimga kirgan a'zoni tanlay oladi (`NazoratTayinlash.tsx`, `azolikRuxsatlariOl`) |
| 6 | Pudratchi ichki nazorati (C) ixtiyoriy: `t2_nazorat_sozlama_saqla_v1` | — |
**Texnadzorlar tizimga kirmasa:** (1) hujjatni direksiya xodimi qabul qiladi, `texnik_bosqich='avto'` faqat TAYINLANGAN nazoratchi bo'lsa texnik qaror shart qiladi (migratsiya sarlavhasi) — tayinlamasangiz bu bosqich o'tkazib yuboriladi, ya'ni pudratchi bloklanmaydi; (2) yoki pudratchi PTO ularning qog'oz zamechaniyalarini murojaat sifatida o'zi kiritadi (TAXMIN: bu rolda yozish ruxsati kerak — egasiga savol); (3) yoki direksiya rahbari ularning nomidan qaror yozadi (nazorat turi `buyurtmachi_xodimi` ga to'g'ri kelmaydi). Tavsiya: ularga telefondagi bitta «Texnik nazorat» havolasi bilan oddiy kirish (`t2_kirish_emailsiz_v1` migratsiyasi bor — TAXMIN: telefon orqali kirish).
Ochiq: direksiya uchun AGAR tizimga kirmasa, taqdim «qabul» belgisini kim qo'yadi (pudratchi qog'ozdagi imzodan keyin o'zi «qabul qilindi (qog'ozda)» deydimi?) — egasidan so'rash; huquqiy dalil muhim.

## (g) QURISH REJASI (4-6 kichik PR)
| # | PR | Mazmun | Xavf |
|---|---|---|---|
| 1 | Menyu tozalash (rol bo'yicha) | `inspektor`: `/admin/nazorat` asosiy bandga (`qoshimcha` olib tashlash, `tashqiAsosiy`); `buyurtmachi/kuzatuvchi/inspektor` uchun «Ish joylarim», «Mening xizmatlarim», «Obyektlar va loyihalar», F2 reestri yashirish; `kuzatuvchi` uchun profil qo'shish; rol nomini bitta atamaga keltirish | Past (`reestr.ruxsat` snapshot testlari yangilanadi) |
| 2 | Bitta «Kelgan» quti | `TaqdimlarInbox` «Kelgan» + `HujjatAylanish` kiruvchi + murojaat «menga» -> bitta komponent; eski yo'llar yo'naltiriladi. «Yuborilgan» pudratchiga | O'rta; UI faqat |
| 3 | Buyurtmachi «Bugun» | `ZakazchikKabinet` tartibi: Bugun -> obyektlar -> to'lov; `NazoratTayinlash` «Sozlamalar»ga | Past |
| 4 | Talablar turlari | `murojaat_turlari` ga `grafik_talabi`, `foiz_sorovi` (ma'lumot, migratsiya); `ObyektSorovlari` turlar ro'yxatini serverdan oladi | O'rta; migratsiya ruxsati kerak |
| 5 | F3 taqdimi | `TAQDIM_MANBA_JADVAL` ga `forma3` (F3 -> buyurtmachi qarori, to'lov xabari F3 ga bog'lanadi); zanjir va taqdim ikki mexanizmini bittaga yig'ish qarori (ADR) | Yuqori; ADR kerak |
| 6 | Texnadzor telefon | `NazoratUy` mobil sinov (390 px), oflayn foto navbati (`UstaBugun` mexanizmi), predpisaniya tekshiruvdan bir bosishda | O'rta |
Tartib: 1 -> 3 -> 2 -> 4 -> 6 -> 5. 1 va 3 darhol ko'rinadigan yengillik beradi va xavfsiz.

## Egasiga savollar
1. Direksiya rasmiy nomi va STIR (shartnoma rekvizitlari uchun) — beraysizmi? [ha, hoziroq / keyinroq]
2. Ikki texnadzor tizimga o'zi kiradimi? [ha, telefonda / yo'q, qog'ozda ishlaydi, PTO kiritadi]
3. «Bajarilish foizi» direksiya uchun nima? [sertifikatlangan F2 / shartnoma; fakt / shartnoma; ikkalasi]
4. Texnadzor «qabul»ini tasdiqlashda qog'oz imzo yetarlimi yoki tizim yozuvi ham shartmi? [faqat qog'oz + PTO belgisi / tizim yozuvi majburiy]
5. Direksiya uchun F3 ni qanday olasiz: tizimdan (qaror bilan) yoki qog'ozda? [tizim / qog'oz]
6. AOSR/F2 uchun tasdiq mexanizmi: taqdim (bitta qaror) mi yoki zanjir (texnadzor -> buyurtmachi ketma-ket) mi? [taqdim / zanjir]
7. To'lov monitoringi — direksiya o'zi yozadimi yoki pudratchi ma'lumot beradimi? [direksiya yozadi / pudratchi beradi / ikkalasi]

## Tekshirilmadi
Brauzer sinovi (mobil, haqiqiy rol bilan kirish); `murojaat_turlari` serverdagi to'liq ro'yxati; tayinlash RPC ichki shartlari; xatlar mazmuni (faqat fayl nomlari); loyihachi/laboratoriya kabinetlari ichi.
