# Yuk birjasi (Freight marketplace) — arxitektura V1

Holat: LOYIHA (kod va migratsiya YO'Q). Rezerv migratsiya versiyasi: `20261201000000`.
Maqsad: «Yandex Dostavka, lekin yuk uchun» — Toshkentdagi materialni Navoiy bog'iga tez yetkazish; o'tkazma (perechisleniye) bilan ishlaydigan tashuvchini topish.

## 1. Bozor tadqiqoti (qisqa, manbali)

| Platforma | E'lon oqimi | Narx | Ishonch / reyting | To'lov | Yakka haydovchi onboarding | Daromad modeli |
|---|---|---|---|---|---|---|
| Yandex Go «Gruzovoy» / Yandex Delivery | Buyurtmachi ilovada «Cargo» tarifi va mashina turini tanlaydi, tizim haydovchiga uzatadi | Dinamik, ilovada hisoblanadi; statik tarif jadvali ochiq emas (yo'nalish, mashina o'lchami, yuklovchi) | Platforma reytingi, haydovchi tekshiruvi | Ilova ichida | Oson (ilova + hujjat) | Haydovchidan komissiya. Cargo uchun foiz topilmadi; taksida O'zbekistonda 13% dan 14,6% gacha oshgan [1][2] |
| Lardi-Trans | Yuk egasi e'lon beradi yoki tender o'tkazadi; to'g'ridan-to'g'ri tanlangan hamkorga buyurtma yuborish (2026) | Tenderda eng past narx g'olib; kelishuv | Kontragent tekshiruvi; reyting tafsiloti topilmadi | Birja tashqarisida | Asosan kompaniyalar | Obuna (narxlar tekshirilmadi) [3] |
| ATI.SU (O'zbekistonda ofisi bor) / Della | Yuk va transport e'lonlari, qidiruv | Kelishuv | Ishtirokchi reytingi, sharhlar, «Haqiqiy tashuvchi» tekshiruvi, «Ishtirokchi pasporti» [4][5] | Birja tashqarisida | Asosan kompaniyalar | Tashuvchi obunasi (3 990 RUB/oy — uchinchi manba, eskirgan bo'lishi mumkin) [6]. Della.kz haqida tasdiq topilmadi |
| Uber Freight | Tashuvchi «bir bosish» bilan yukni bron qiladi | Oldindan qat'iy narx, real vaqt bozor narxi | Tasdiqlash (sug'urta, shartnoma) | 7 kunda, tezkor to'lov (komissiya bilan) | Faqat tasdiqdan keyin; haydovchi telefon orqali taklif etiladi | Brokerlik marjasi [7] |
| O'zbekiston: E-Logistika (Transport vazirligi / UZEX), Cargoinfo.UZ, Diip.uz, UzTruck | E'lon va qidiruv; Diip.uz yuk egasi + mashina egasi + dispetcher | Asosan kelishuv | Zaif/noma'lum | Birja tashqarisida | Diip.uz: komissiyasiz (o'zlari aytadi) | Aniqlanmagan [8][9] |

Manbalar: [1] kun.uz Yandex Go komissiya; [2] delivery.yandex.com (Georgia/Armenia); [3] lardi-trans.de/en/gruz; [4] spot.uz/ru/2022/12/07/ati-su; [5] comnews.ru 2021-07-05; [6] toolfox.ru/services/s/ati-su; [7] apps.apple.com Uber Freight, shipscience.com; [8] navoiy.mintrans.uz/en/news/yangilik19, daryo.uz 2023-02-06 (E-Logistika); [9] app.dealroom.co/companies/diip_uz. «Yukla/Yuk.uz» O'zbekistonda topilmadi (Ýükle — Turkmaniston). Ma'lumotlar ikkilamchi manbalardan, ishonch qisqa tekshiruv darajasida.

**Xulosa:** mahalliy bozorda bo'shliq — ishonch (reyting), to'lov shakli filtri (o'tkazma/naqd) va yakka haydovchi uchun Telegram-first oqim. Bu uchala narsa bizning ustunligimiz.

### O'zbekiston xususiyatlari (tekshirish kerak)
| Masala | Holat |
|---|---|
| Yakka haydovchi: YaTT yoki o'zini o'zi band qilgan | tekshirish kerak (soliq.uz rasmiy hujjati bilan). Yuk tashuvchi YaTT uchun qat'iy JShDS/ijtimoiy soliq haqida gov.uz xabari bor, yili aniq emas |
| QQS | Umumbelgilangan tizimga o'tish chegarasi 2026-06-01 dan 12 000 BHM (≈4,9 mlrd so'm) deb yoziladi, manbalar ziddiyatli — tekshirish kerak |
| Naqd va soliq | Naqd hisob-kitobda tashuvchi daromadi yashirinishi/soliq xarajati — yuridik masala, tekshirish kerak. Platforma faqat «to'lov shakli» maydonini va hujjat (yuk xati/akt) yaratadi, to'lovni o'zi ushlamaydi |
| Narx va QQS | Tizim qoidasi: narx doim QQS siz kiritiladi; QQS to'lovchi tashuvchi uchun QQS alohida qator (12%, tekshirish kerak) |
| Platforma komissiyasi | Litsenziya/ro'yxat talabi bormi — tekshirish kerak |

## 2. Personalar va oqimlar

| Persona | Kim | Asosiy oqim | Kanal |
|---|---|---|---|
| Yuk egasi | Qurilish kompaniyasi snabjeni, do'kon, yakka shaxs | E'lon -> takliflarni ko'rish -> tanlash/bron -> yetkazildi tasdig'i -> baho | Veb (T2) + Telegram bildirishnoma |
| Tashuvchi firma | Logistika kompaniyasi | Yuklarni ko'rish, taklif, o'z reysini (t2_tr_reys) bog'lash, haydovchi tayinlash | Veb back-office + Telegram |
| Yakka haydovchi | O'z mashinasi bor odam | Telefon + mashina + sig'im -> yuk lentasi -> «Bron» yoki «Narx taklif» -> yo'lda -> yetkazildi | Telegram bot / mini-ilova (asosiy), veb ixtiyoriy |
| Dispetcher | Firma xodimi yoki platforma moderatori | Haydovchi tayinlash, nizo ko'rish, ishonchsiz e'lonni to'xtatish | Veb |

Yuk egasi uchun tez yo'l: «Toshkent -> Navoiy, 20 t, sement, ertaga, o'tkazma» — 5 maydon, qolganini tizim hisoblaydi (masofa, tavsiya narx).

## 3. Yukning holat mashinasi

```
qoralama -> e'lon -> takliflar -> bron -> yolda -> yetkazildi -> yopildi
              |          |         |       |          |
              v          v         v       v          v
           bekor      muddat_tugadi bekor  nizo -----> yopildi (hal bo'lgach)
```

| Holat | Kim o'tkazadi | Shart | Yon ta'sir |
|---|---|---|---|
| qoralama -> e'lon | yuk egasi | majburiy maydonlar to'ldirilgan | Mos tashuvchilarga outbox bildirishnoma |
| e'lon -> takliflar | tizim | birinchi taklif/qarshi taklif | Egaga xabar |
| takliflar -> bron | yuk egasi qabul qiladi, yoki «Bron» (qat'iy narxda) | bitta g'olib; qolganlar avtomatik rad | Kelishilgan narx va to'lov shakli muzlatiladi (o'zgarish = qayta kelishuv) |
| bron -> yolda | tashuvchi | yuklangan (foto/kod) | Yo'l kuzatuvi ixtiyoriy |
| yolda -> yetkazildi | tashuvchi belgilaydi | manzilda | Qabul qiluvchi kod/foto bilan tasdiqlaydi |
| yetkazildi -> yopildi | yuk egasi tasdiqlaydi yoki 48 soat javobsiz (avto) | nizo ochilmagan | Ikki tomonlama baho, komissiya yoziladi |
| har qaysi -> bekor | tomonlar | bron'dan keyin bekor = reyting jarimasi sababi bilan | Hodisa jurnaliga yoziladi |
| yetkazildi/yolda -> nizo | har ikki tomon | sabab + dalil (R2 foto) | Moderator hal qiladi |

Barcha o'tishlar RPC orqali, `operation_id` bilan idempotent (t2_tr_operation / t2_birja uslubida), versiya (`versiya`) optimistik bloklash bilan.

## 4. Narx dvigateli (tavsiya, kelishuv erkin)

```
tavsiya = max( min_tarif ,
               masofa_km * tonna * stavka_tkm * k_yuk * k_qaytish * k_shoshilinch * k_mashina )
```

| Parametr | Manba | Boshlang'ich qiymat |
|---|---|---|
| masofa_km | Server funksiyasi: OSRM yoki OpenRouteService (A,B = lat/lng; `t2_obyekt` koordinatalari mavjud bo'lsa shundan). Kesh: juft nuqta bo'yicha | Marshrut real masofasi |
| tonna | E'londan; hajm (m3) berilsa zichlikdan tonnaga aylantiriladi | — |
| stavka_tkm | Yagona jadval (sozlanadigan); tashuvchi firma o'zining `t2_tr_tarif` bilan solishtira oladi | Boshlang'ich — bozor so'rovidan keyin (hozir TO'LDIRILMAGAN) |
| k_yuk | Yuk turi koeffitsiyenti: sochma 1.0, qoplangan 1.0, mo'rt/xavfli 1.3–1.6, uzun/negabarit 1.5 | taxminiy |
| k_qaytish | Bo'sh qaytish: bir tomonlama 1.6–1.8 (qaytishda yuk topilmasa), qaytishda yuk bor 1.0 | taxminiy |
| k_shoshilinch | Bugun 1.3, ertaga 1.1, 3+ kun 1.0 | taxminiy |
| k_mashina | Mashina turi/yuklash usuli (samosval, tent, ref) | 1.0 |
| min_tarif | Eng kam reys narxi | sozlanadi |

Qoidalar: natija «tavsiya» sifatida chiziq (±15% diapazon) bilan ko'rsatiladi; tomonlar erkin kelishadi. Narx QQS siz, QQS alohida qator. To'lov shakli narxni o'zgartirishi mumkin: o'tkazma narxi = naqd + QQS/soliq ustamasi (ko'rsatma sifatida «tekshirish kerak»). Tavsiya narx va yakuniy kelishuv farqi statistika sifatida saqlanadi — stavkani sozlash uchun.

Koeffitsiyent qiymatlari TAXMINIY; bozor kalibrovkasi MVP 1 da 30–50 haqiqiy reys bilan.

## 5. Ma'lumotlar modeli

### 5.1 Qayta ishlatiladigan mavjud jadvallar
| Mavjud | Qanday ishlatiladi |
|---|---|
| `t2_birja_rfq` / `t2_birja_taklif` (+ `_qator`, `_oluvchi`) | Yuk e'loni = RFQ turi; taklif/qarshi taklif = taklif. Asosiy g'oya: yangi parallel taklif mexanizmi YASALMAYDI. Hozirgi RFQ materiallar uchun (nom, birlik, hajm) — yuk uchun ustun yetishmaydi, shuning uchun 5.2 dagi `yb_yuk` RFQ ga `rfq_id` bilan bog'lanadi |
| `t2_tender_*` (jurnal, savol, baho) | Tur raundlari, savol-javob, baho; yuk uchun «to'g'ridan-to'g'ri» va «aukson» rejimi |
| `t2_tomon_aloqa` | «Doimiy hamkor tashuvchi»: yuk egasi <-> tashuvchi firma aloqasi; hamkorga yopiq e'lon |
| `t2_outbox` -> `t2_bildirishnoma` | Barcha bildirishnoma (yangi yuk, taklif, bron, yetkazildi) |
| `t2_telegram_*` | Bot kirishi, kod bilan ulash, bildirishnoma sozlamasi, update qabul (idempotent) |
| `t2_obyekt` (lat/lng) | Manzil: qurilish obyektini «A/B nuqta» sifatida tanlash |
| `t2_tr_mashina`, `t2_tr_haydovchi`, `t2_tr_reys`, `t2_tr_tarif`, `t2_transport_ol_v1` | Firma tashuvchi o'z parki va tannarxi. Yakka haydovchi uchun YANGI, yengil profil (5.2) — chunki `t2_tr_*` `kompaniya_id` ga bog'liq |
| R2 | Foto, hujjat; faqat kalit/xesh jadvalda, fayl R2 da (asl o'zgarmaydi qoidasi) |

### 5.2 Yangi jadvallar (migratsiya `20261201000000`, faqat shaklan; har biri RLS yoqilgan, RPC orqali kirish)
| Jadval | Vazifa | Asosiy ustunlar |
|---|---|---|
| `yb_tashuvchi` | Tashuvchi profili (firma yoki yakka) | foydalanuvchi_id, kompaniya_id (null = yakka), tur (firma/yakka), telefon, daraja (0–3), reyting_ortacha, reyting_soni, holat |
| `yb_mashina` | Yakka haydovchi mashinasi (firma `t2_tr_mashina` ga `tr_mashina_id` bilan bog'lanishi mumkin) | tashuvchi_id, davlat_raqami, turi, yuk_t, yuk_m3, tr_mashina_id, hujjat_r2 |
| `yb_yuk` | Yuk e'loni | rfq_id, egasi_kompaniya_id/foydalanuvchi, A/B (matn, lat, lng, obyekt_id), masofa_km, tonna, hajm_m3, yuk_turi, sana_dan/sana_gacha, tolov_shakli (naqd/otkazma/ikkalasi), narx_taklif, narx_tavsiya, qqs_bilan (bool), holat, versiya |
| `yb_bron` | Tanlangan tashuvchi va kelishilgan shartlar | yuk_id, tashuvchi_id, mashina_id, kelishilgan_narx, tolov_shakli, tr_reys_id (ixtiyoriy), holat, yuklandi/yetkazildi vaqti |
| `yb_dalil` | Isbot fayllari | bron_id, tur (yuklash/yetkazish/nizo), r2_kalit, sha256, yaratuvchi, vaqt |
| `yb_baho` | Ikki tomonlama baho | bron_id, kimdan, kimga, ball 1–5, izoh |
| `yb_nizo` | Nizo | bron_id, ochgan, sabab, holat, qaror, moderator |
| `yb_hodisa` | O'zgarmas hodisa jurnali (`t2_tomon_hodisa` uslubi, trigger bilan yangilab bo'lmaydi) | bron_id/yuk_id, tur, meta, vaqt |
| `yb_tarif_stavka` | Narx dvigateli parametrlari | kalit, qiymat, amal_qilish_sanasi |
| `yb_hisob` | Komissiya/obuna/boost hisobi | tashuvchi_id, tur, summa (QQS siz), holat, bron_id |

Yangi jadval qo'shishdan oldin dublikat tekshiruvi shart (loyiha qoidasi): taklif, aloqa, bildirishnoma, telegram jadvallari QAYTA yaratilmaydi.

Telegram kirishi va yakka haydovchi: `t2_telegram_ulanish` orqali `t2_foydalanuvchi` ga bog'lanadi. Yakka haydovchi uchun kompaniya yaratilmaydi (INN talab qilinmaydi) — shu sababli `yb_tashuvchi.kompaniya_id` null bo'la oladi. Bu `t2_*` ruxsat modeli (kompaniya bo'yicha) bilan to'qnashuvi arxitektura qarori talab qiladi (xavf R3).

## 6. Ishonch

| Daraja | Talab | Nima ochiladi |
|---|---|---|
| 0 | Telefon (Telegram kontakti) | Yuk ko'rish, taklif (cheklangan: kuniga N, 1 ta faol bron) |
| 1 | Ism, mashina, davlat raqami, sig'im | Bron, ko'p faol bron |
| 2 | Texpasport + haydovchilik guvohnomasi + pasport foto (R2), moderator ko'rib chiqadi | «Tasdiqlangan» belgi, yuqori summali yuk |
| 3 | Firma: INN, litsenziya/shartnoma, sug'urta; yoki 20+ yopilgan reys va reyting >= 4.7 | «Ishonchli» belgi, hamkor tarmoq |

- Reyting: ikki tomonlama 1–5 + sabab teglari (vaqtida, toza, yuk butun); ko'rsatma og'irligi — yangi reyting kam soniga kamaytiriladi (Bayes silliqlash).
- Isbot: yuklash fotosi (yuk + mashina raqami), yetkazish fotosi, qabul qiluvchi 4 xonali kod (Telegramda yuboriladi) — foto yoki kod, kod bo'lsa foto ixtiyoriy. Hammasi R2 ga, `yb_dalil` ga xesh bilan.
- Nizo: ochish (sabab + dalil) -> ikkinchi tomon 48 soatda javob -> moderator qarori (to'liq/qisman/rad) -> reyting va hisobga ta'siri. Platforma pulni ushlamaydi, shuning uchun nizo asosan reyting/bloklash va hujjat vositasida.
- Firibgarlik: bir raqamdan ko'p akkaunt, e'londan tashqari bog'lanish (aylanib o'tish) signali, sezilarli past narx ogohlantirishi.

## 7. Daromad modeli

| Manba | Mexanizm | Tavsiya | Izoh |
|---|---|---|---|
| Komissiya | Yopilgan bronning % i, tashuvchidan | 3–5% (boshlang'ich; Yandex taksi 14,6% [1] — biz past) | Hisob `yb_hisob`; to'lovni platforma ushlamaydi, hisob-faktura/oylik hisob orqali |
| Obuna | Firma uchun oylik (cheksiz taklif, hamkor tarmoq, tahlil) | MVP 2+ | ATI modeli kabi [6] |
| Boost | Tashuvchi profili/taklifi yoki egasi e'loni yuqorida | MVP 3 | Faqat reklama belgisi bilan |
| Loyiha qoidasi | Hujjat/paket natijasi token yechadi («har ish pul ishlasin») | Yuk hujjatlari (yuk xati, akt) pullik tokenda | Bepul qilish taklif qilinmaydi |

Boshlang'ich bosqichda komissiyasiz (likvidlik uchun), keyin yoqiladi — Diip.uz komissiyasiz deydi [9].

## 8. Mobil va Telegram-first UX (haydovchi)

- Ro'yxatdan o'tish: Telegram bot -> «Kontaktni ulashish» tugmasi -> mashina turi / yuk (t) / raqam -> tayyor (3 savol, 1 daqiqa). Daraja 2 hujjatlar keyin.
- Lenta: bot yo'nalish bo'yicha mos yuk kartasini yuboradi («Toshkent -> Navoiy, 20 t, ertaga, o'tkazma, ~X so'm»), tugmalar: Bron / Narx taklif / Rad.
- Qarshi taklif: tugma yoki raqam yozish; ega javobi shu chatga keladi.
- Yo'lda: «Yukladim» (foto), «Yetkazdim» (foto + qabul qiluvchi kodi), lokatsiya yuborish ixtiyoriy.
- Mini-ilova (Telegram WebApp) faqat xarita, ro'yxat filtri va hujjat yuklash uchun; asosiy harakatlar bot tugmasida.
- Til: o'zbek (lotin) + rus; oddiy matn, katta tugmalar, kam trafik (foto siqish).
- Oflayn: yetkazish tasdig'i keyin yuborilishi mumkin (vaqt belgisi qurilmadan, serverda tekshiruv).

## 9. MVP bo'laklari (PR reja)

| Faza | PR | Mazmun | Natija |
|---|---|---|---|
| 0 | Hujjat | Shu hujjat; egasi qarorlari (5.2 yakka profil modeli, komissiya, to'lov shakli matni) | Tasdiq |
| 1 | PR1 | Migratsiya `20261201000000`: `yb_tashuvchi`, `yb_mashina`, `yb_yuk`, `yb_bron`, `yb_hodisa`, RPC (e'lon, taklif, bron) + SQL acceptance | Backend yadro |
| 1 | PR2 | Narx dvigateli (server funksiya, OSRM/ORS, kesh) + `yb_tarif_stavka` | Tavsiya narx |
| 1 | PR3 | Yuk egasi veb: e'lon formasi, takliflar ro'yxati, qabul qilish; outbox bildirishnoma | Egasi uchun MVP |
| 2 | PR4 | Telegram bot: haydovchi onboarding, lenta, bron/taklif tugmalari | Haydovchi uchun MVP |
| 2 | PR5 | Holat o'tishlari (yo'lda/yetkazildi), isbot (R2), kod tasdig'i | Yopiq sikl |
| 3 | PR6 | Baho, daraja, nizo, moderator oynasi | Ishonch |
| 3 | PR7 | Firma back-office ulanishi (`t2_tr_reys` bron'ga bog'lash), `t2_tomon_aloqa` hamkor tarmoq | Firmalar |
| 4 | PR8 | Komissiya hisobi, obuna, boost | Daromad |

Pilot: park obyekti snabjeni (Toshkent -> Navoiy) 10–20 haydovchi bilan, qo'lda moderatsiya. Har ko'rinadigan o'zgarish `public/yangiliklar.json` ga yoziladi; migratsiya avval prod, keyin merge.

## 10. Xavflar

| # | Xavf | Chora |
|---|---|---|
| R1 | Likvidlik (tovuq-tuxum): yuk yo'q -> haydovchi yo'q | Pilot: o'z snabjenimiz yuki; Telegram guruhlardan haydovchi yig'ish |
| R2 | Aylanib o'tish (tomonlar platformadan tashqarida kelishadi) | Komissiya past; qiymat = reyting, hujjat, kafolat, ishonch |
| R3 | Yakka haydovchi `t2_*` kompaniya-markazli ruxsat modeliga sig'maydi | Alohida `yb_*` kirish qatlami; arxitektura qarori PR1 dan oldin |
| R4 | Soliq/yuridik: naqd, YaTT/o'zini o'zi band, QQS, platforma maqomi | tekshirish kerak — yurist/soliq maslahati, MVP da to'lov platformadan o'tmaydi |
| R5 | Firibgarlik, soxta hujjat | Daraja tizimi, moderatsiya, R2 xesh, hodisa jurnali |
| R6 | Narx koeffitsiyentlari noto'g'ri | Faqat tavsiya, kalibrovka 30–50 reysdan, sozlanadigan jadval |
| R7 | OSRM/ORS limit va ishonchlilik | Kesh, server funksiya, zaxira havola; o'zbek yo'llari sifati |
| R8 | Shaxsiy ma'lumot (pasport, guvohnoma) | R2 yopiq, kirish loglanadi, saqlash muddati; GitHub'ga real ma'lumot yo'q |
| R9 | Telegram'ga qaramlik | Veb zaxira, SMS kod keyinroq |
| R10 | Raqobat (E-Logistika davlat platformasi, Diip.uz) | Farq: ishonch + to'lov shakli + Telegram-first |

## 11. Ochiq savollar (egasiga)
1. Yakka haydovchi uchun alohida profil (tavsiya) yoki har biriga yashirin kompaniya?
2. Boshlang'ich komissiya: 0% (pilot) yoki 3–5%?
3. Platforma pul ushlaydimi (escrow) yoki faqat bog'laydimi? (tavsiya: MVP da faqat bog'laydi)
4. Faqat ichki yo'nalishlar (O'zbekiston) yoki tashqi ham?