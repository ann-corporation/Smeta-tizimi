# BOZOR В· TENDER В· LOGISTIKA вЂ” uch mustaqil mahsulot (ADR)

Holat: TAKLIF (egasi qarori kutiladi) В· 2026-11-12 В· Claude.
Asos: egasi tanqidi вЂ” logistika В«xarobВ», bozor va tender В«skladga tiqib qo'yilganВ». Bu hujjat ularni
ekotizimning uchta to'liq mahsuloti sifatida qayta o'ylaydi: bitta pudratchi emas, kompaniya va yakka
shaxslar uchun ochiq. Mavjud ADR lar (E1вЂ“E7, YUK_BIRJASI_V1) bekor qilinmaydi; ular ustiga quriladi.
Belgi В«T вЂ” tekshirilsinВ»: men ishonchli tasdiqlay olmagan qonun/narx/litsenziya fakti.

## 0. Audit (2026-11-12, prod faqat o'qildi; summalar yo'q)

| Joy | Nima bor | Holat |
|---|---|---|
| `/admin/logistika` В«Ta'minot va skladВ» | `WrapperLogistika`: 4 tab вЂ” Zayavkalar, Sklad (qoldiq), Ta'minot va birja, Material nomlari (AI). Reestrda `ishJoyi: taminot` | Ishlaydi, lekin bu ombor+xarid vositasi. Yuk tashish (freight) bu sahifada YO'Q |
| `/admin/yuk-birjasi` | 3 fayl (ro'yxat, tafsilot, tahrir), `api/t2-yuk-birjasi`, shlyuz `yuk-marshrut` (ochiq OSRM, km), narx dvigateli `lib/yuk-birjasi/narx.ts`, holat mashinasi | Backend qurilgan, ishlatilmagan |
| yuk birjasi bazasi | 11 ta `t2_yb_*` jadval prodda, ~28 `t2_yb_*` RPC, `t2_yb_sozlama` 10 qator. `yb_yuk / tashuvchi / bron / taklif` = **0 qator** | Bo'sh. Hech bir haqiqiy yuk o'tmagan |
| Yuk birjasi UI da yo'q narsalar | xarita yo'q (paketda leaflet/maplibre yo'q), haydovchi yuzi yo'q, onlayn/yaqin yuk yo'q, jonli kuzatuv yo'q, Telegram bot (PR4) yo'q, isbot/baho faqat ko'rsatiladi | Faqat yuk egasi uchun jadval-forma |
| `/admin/tender` | 8 fayl: ro'yxat, tafsilot, tahrir, taklif formasi, savollar, taqqos jadvali (ball, muddat, kafolat, reyting), tahlil; 17 `t2_tender_*` RPC; `lib/tender/*` testli. `t2_tender_jurnal/savol/baho` = 0, `t2_birja_rfq/taklif` = 0 | Eng pishgani. Lekin faqat tizim ichidagi a'zolar; ochiq e'lon va muhrlangan taklif yo'q |
| `/admin/zayavka` | `TestZayavka` (+ buyurtmaga aylantirish testi), `t2_buyurtma*` = 0 qator | Mantiq bor, real oqim yo'q |
| Yetkazuvchi tomoni | `/admin/yetkazuvchi` В«BugunВ»; `t2_narx_manba` 1 qator, `t2_narx_manba_qator` 0; buyurtmaв†’qabulв†’qarzв†’narx manbai migratsiyalari bor | Yopiq oqim: faqat taklif etilgan yetkazuvchi |
| Kontragentlar | `/admin/kontragentlar`, `t2_kontragent` 1, `t2_tomon_aloqa` 0, `t2_telegram_ulanish` 1 | CRM kartochka; bozor katalogi emas |
| Uy sotish | `/admin/sotuv`, `t2_sotuv_*` 14 jadval; bitim/mijoz/loyiha = 0, birlik 96 | Alohida ish joyi, bozorga ulanmagan |
| Token/billing | `t2_token_*` (harakat 221, saga 286) | Ishlaydi; bozor/yuk uchun narx qatori yo'q |
| Baza | 463 MB / 500 MB; eng katta: `t2_qator` 117 MB, `t2_qator_muhr` 66, `t2_akt_qator` 57 | Bo'sh joy в‰€ 37 MB |

Nega В«skladga tiqilganВ» ko'rinadi: (1) uchala mahsulot `taminot` ish joyida 36вЂ“39 tartib raqamli menyu
bandlari; (2) `logistika` kaliti omborni anglatadi, yuk tashishni emas (nom to'qnashuvi); (3) hamma narsa
`/admin/*` вЂ” ichki ofis ilovasi, tashqi odam (haydovchi, sotuvchi) kira olmaydi; (4) bitta odam qaysi
yuzga tegishli ekanini tanlay olmaydi (rol/yo'nalish yo'q); (5) uchalasi bo'sh вЂ” jonli bozor effekti yo'q.
Xulosa: kod emas, mahsulot shakli va tashqi kirish yo'q. Backend poydevori (RFQ, taklif, holat
mashinasi, narx, outbox, tomon-aloqa, token) qayta ishlatiladi; yuzlar va jonli qatlam yangidan quriladi.

## 1. Umumiy qaror (tavsiya)

1. **Uchta mahsulot, bitta platforma yadrosi.** Bozor, Tender, Logistika вЂ” har biri o'z nomi, o'z ochiq
   sahifasi, o'z mobil yuzi; ular bir identifikatsiya, bir reyting, bir token hisobi, bir bildirishnoma,
   bir katalog ustida. Yangi parallel taklif/buyurtma mexanizmi YASALMAYDI (E7: P2 tender, P3 buyurtma,
   P5 taqdim).
2. **Ichki ofis в‰  ochiq bozor.** `/admin/*` = kompaniya ichki ishi (tenant). Ochiq qatlam alohida
   marshrut daraxti: `/bozor`, `/tender`, `/yuk` (kirmasdan ko'rish) va `/m/*` (mobil PWA). Ma'lumot
   ikki sinfga bo'linadi: **tenant** (kompaniyaniki, RLS) va **ochiq** (e'lon, profil, reyting; alohida
   `pub_*` ko'rinishlar/jadvallar, kompaniya ma'lumotiga tegmaydi).
3. **Birinchi bo'lib Logistika** (В§G), keyin Bozor, keyin Tender ochiq rejimi. Sabab: talab bizning o'zimizda
   bor (zayavka в†’ В«yuk kerakВ»), bo'sh joy eng katta (haydovchi yuzi umuman yo'q), va backend allaqachon bor.

## A. BOZOR вЂ” qurilish tovar, ish va xizmat bozori

**Ishtirokchilar.** Sotuvchi (kompaniya yoki yakka shaxs), xaridor, usta/brigada (ish taklif qiladi),
texnika ijarachisi (ekskavator, kran, mixer), yetkazuvchi (tovar sotuvchining bir turi). Hammasi bitta
akkaunt; yo'nalishlar (`t2_yonalish`) ish davomida qo'shiladi (E1/E7).

**Katalog modeli.** Bozor В«e'lon saytiВ» emas, mavjud ma'lumotnoma ustida:
- `bozor_pozitsiya` в†’ mavjud material/ish ma'lumotnomasi kodiga (smeta resursi, `t2_material_alias`) bog'lanadi.
  Kodsiz e'lon ham mumkin, lekin В«tasniflanmaganВ» deb, AI taklif qilgan kodga tayinlanadi.
- Birlik va narx qoidalari o'zgarmas: narx **doim QQS siz** birlik darajasida; QQS alohida yorliq.
- Bir mahsulotga bir necha sotuvchi narxi в†’ **arifmetik o'rtacha + foydalanuvchiga xabar**; F2 narxi =
  max(smeta, xarid/shartnoma, QQS siz). Bozor taklif narxlari `t2_narx_manba` ga manba sifatida tushadi
  (manba turi `bozor`, havola e'londa). Tushishi avtomatik emas: smetachi tasdiqlaydi (smeta CONST).
- **Bir bosishda so'rov:** smeta qatori / zayavka qatori в†’ В«Bozorda narx so'raВ» в†’ `bozor_sorov` (xaridorga
  RFQ). Javoblar (taklif) qaytib narx manbasi sifatida qatorga tushadi.

**Obyektlar (jadval nomlari taklif, `bozor_` prefiksi).**
`bozor_profil` (sotuvchi vitrini), `bozor_elon` (tovar/ish/xizmat/ijara; tur, pozitsiya_kodi, birlik, narx_qqs_siz,
min_hajm, hudud, muddat), `bozor_sorov` + `bozor_sorov_taklif` (to'g'ridan-to'g'ri RFQ вЂ” Tender bilan bir
primitiv, В§B), `bozor_buyurtma` (mavjud `t2_buyurtma` ga tegadi, yangisi emas), `bozor_baho`, `bozor_nizo`.

**Oqim.** E'lon в†’ qidiruv/so'rov в†’ taklif yoki В«savatgaВ» в†’ buyurtma (`t2_buyurtma`) в†’ yetkazish
(Logistika mahsuloti, В§C) в†’ qabul (sklad kirim qoralamasi) в†’ to'lov holati в†’ ikki tomonlama baho.
To'lov holati faqat belgi (kutilmoqda / to'landi вЂ” tomonlar tasdig'i); pul harakati qaror emas (В§H).

**Nizo va moderatsiya.** Nizo sabab + dalil (R2 foto) bilan; moderator qarori audit jurnalida. E'lon
tekshiruvi: yangi sotuvchi birinchi 3 e'loni moderatsiyadan o'tadi; shikoyat 3 tadan oshsa e'lon
yashiriladi; shubhali narx (medianadan В±60%) belgilanadi.

**Qidiruv.** Lotin/kirill farqsiz: `qidiruvKaliti()` + lug'at (`lugat`) + pozitsiya sinonimlari
(В«sementВ» = В«С†РµРјРµРЅС‚В» = В«portlandВ»). Postgres `pg_trgm` + sinonim jadvali; ming e'longacha oddiy ILIKE yetadi.

**Ochiq vitrina.** Kirmasdan: e'lonlar, sotuvchi profili, reyting, narx diapazoni (ko'rinadi). Akkaunt kerak:
taklif/buyurtma, kontakt ochish, e'lon berish. Sahifalar statik keshlanadi (Cloudflare edge) вЂ” bazaga
yuk tushmaydi. SEO uchun `/bozor/<hudud>/<pozitsiya>` URL.

**Daromad (savol, qaror emas).** Variantlar: (1) yopilgan bitimdan komissiya, (2) e'lon/obuna oylik,
(3) В«yuqoridaВ» (boost, reklama belgisi bilan). O'zgarmas qoida: hujjat/paket/AI natijasi token yechadi
(bepul qilinmaydi). Tavsiya boshlang'ich: komissiyasiz, faqat token; komissiya liquidity paydo bo'lgach.

## B. TENDER вЂ” ikki yo'nalishli xarid

**So'rov turlari** (hammasi bitta `t2_birja_rfq` primitivi, E7-P2): (1) material RFQ вЂ” zayavka/smeta
qatorlaridan; (2) ish/subpudrat lot вЂ” smeta podval/bo'limidan (hajm, shifr bilan), (3) texnika/transport
ijarasi, (4) **buyurtmachi e'loni**: buyurtmachi ishni e'lon qiladi, pudratchilar taklif beradi (hozir
teskari yo'nalish yo'q вЂ” faqat pudratchi xarid qiladi).

**Rejim.** `taklif_bilan` (faqat taklif qilingan, `t2_tomon_aloqa` orqali) va `ochiq` (hamma ko'radi,
akkauntli hamma taklif beradi). Ochiq rejim yangi; taklif rejimi mavjud.

**Taklif.** Narx qatorma-qator QQS siz; muddat, kafolat, fayl (R2). **Muhrlangan** variant: taklif
muddatgacha egasi ham ko'rmaydi вЂ” server taklif summasini muddatdan oldin RPC da NULL qaytaradi (RLS +
ustun darajasida), faqat В«taklif borВ» belgisi; ochilish muddat o'tgach `t2_tender_otish_v1` orqali,
jurnalga yoziladi. Egasi ko'rsatmasi: ochiq (ko'rinadigan) rejim ham tanlanadi.

**Taqqoslash.** Mavjud `TenderTaqqos` mantiqi kengayadi: qatorma-qator jadval, jami, muddat, kafolat,
reyting (umumiy reyting modulidan); narxsiz qator = В«bo'shВ» (0 emas); mos kelmagan pozitsiya belgilanadi.

**G'olib в†’ shartnoma.** `t2_tender_golib_v2` в†’ buyurtma (`t2_buyurtma_yarat_v1`) yoki shartnoma/subpudrat
qoralamasi (delegatsiya `t2_tomon_taqdim` hayot sikli bilan: taklif в†’ qabul в†’ grant). Subpudrat lot
g'olibi obyektda subpudrat tomoni sifatida qo'shiladi (E2 grant), F2/fakt faqat grant bilan.

**Audit izi** (tekshiruv uchun): `t2_tender_jurnal` o'zgarmas (trigger bilan o'zgartirib bo'lmaydi), har
hodisa: kim, qachon, qaysi versiya, taklif xeshi. Ochilish bayonnomasi hujjati (PDF, token yechadi).

**Kelishuvga qarshi minimal choralar.** Bir IP/qurilishdan bir nechta taklif вЂ” belgi; bir xil muhrlangan
fayl xeshi вЂ” belgi; narx bir xil yaxlitlanishi вЂ” belgi; g'olibni faqat egasi tanlaydi, tizim
tavsiya beradi; moderator ko'radi. Kafolat: bu signal, hukm emas.

**Qayta ishlatiladi:** `t2_tender_*` RPC (17 ta), `lib/tender/*`, `t2_tomon_aloqa/grant/taqdim`, outbox.
Yangi: ochiq rejim, muhr, buyurtmachi yo'nalishi, taklif beruvchi tashqi akkaunt.

## C. LOGISTIKA вЂ” yuk uchun В«taksiВ»

**Yuk egasi oqimi (5 maydon).** Nima (tur, tonna/m3, mashina turi) в†’ qayerdan/qayerga (xaritada nuqta
yoki obyekt tanlash) в†’ vaqt oynasi в†’ tizim narx diapazonini ko'rsatadi в†’ В«ChaqirishВ». Zayavka qatoridan
bir bosishda: В«Shu zayavka uchun mashina topВ» (material, og'irlik, obyekt manzili avtomatik).

**Haydovchi oqimi.** В«Liniyaga chiqishВ» (mashina, sig'im tanlangan) в†’ yaqin mos yuklar ro'yxati/xaritasi в†’
qabul в†’ marshrutga o'tish (tashqi navigatsiya havolasi) в†’ holatlar: `yetib_keldi в†’ yuklandi в†’ yolda в†’
yetkazildi` в†’ yetkazish isboti (foto + qabul qiluvchi kodi/imzo) в†’ yuk xati (hujjat, token) в†’ baho.
Mavjud holat mashinasi (`t2_yb_*`: qoralamaв†’elonв†’takliflarв†’bronв†’yoldaв†’yetkazildiв†’yopildi + nizo)
shu oqimga mos; `yetib_keldi/yuklandi` pastki holatlari qo'shiladi (hodisa jurnali orqali, enum o'zgarmaydi).

**Dispatch: avval qat'iy narx, auktsion ikkinchi.** Tavsiya: asosiy rejim вЂ” tizim hisoblagan qat'iy narx
(В±15% diapazonda egasi o'zgartira oladi) va В«birinchi qabul qilganВ». Auktsion (takliflar) faqat katta/nostandart
yuk uchun ixtiyoriy. Sabab: taksi mexanikasi tezlikni beradi; auktsion yangi bozorda suyuqlik yo'q payti
sekin va haydovchini charchatadi. Mavjud taklif/qarshi taklif oqimi saqlanadi, ikkinchi darajaga tushadi.
Mos tanlov: (1) mashina turi/sig'imi mos, (2) 25 km radius (kengayib boradi), (3) reyting va faol bron soni,
(4) avval В«hamkorВ» tashuvchilar (`t2_tomon_aloqa`) 3 daqiqa, keyin hamma. Taklif haydovchiga 60 s
beriladi, rad = keyingisi.

**Narx formulasi (ma'lumot sifatida, `t2_yb_sozlama`).** Mavjud: `max(min_tarif, kmВ·tonnaВ·stavka_tkmВ·k_yukВ·
k_qaytishВ·k_shoshilinchВ·k_mashina)`. Qo'shiladi: `yuklash_narx` (qo'lda/kran), `kutish_narx_soat` (bepul 30
daqiqadan keyin), `k_hudud`. Boshlang'ich stavkalar bozor so'rovidan keyin to'ldiriladi (hozir bo'sh/taxminiy).
Natija В«tavsiyaВ» belgisi bilan; farq statistikasi saqlanadi.

**Jonli kuzatuv.** Haydovchi qurilmasi faqat faol reysda joylashuv yuboradi (10вЂ“15 s; harakatsizlikda
60 s). Oqim Postgres'ga EMAS (В§D). Egasi xaritada mashinani ko'radi; yetkazishga 5 km qolganda qabul
qiluvchiga xabar.

**Baho va jarima.** Ikki tomonlama 1вЂ“5. Bron'dan keyin bekor: birinchi marta ogohlantirish, keyin reyting
jarimasi (sabab bilan); yuk egasi kech bekor qilsa haydovchiga kompensatsiya вЂ” savol (В§H), hozir faqat belgi.

**Park egalari.** Firma bir nechta haydovchi/mashina boshqaradi: dispetcher ko'rinishi (yuklarni
haydovchilarga tayinlash), `t2_tr_mashina/haydovchi` bilan bog'lanadi; yakka haydovchi = `turi=shaxsiy`
kompaniya (E1), alohida yengil profil.

**Qaytish yuki.** Haydovchi Aв†’B yetkazgach, B atrofida (50 km) mos yuk bo'lsa В«qaytishda yuk borВ» taklifi;
`k_qaytish` koeffitsiyenti shuni hisobga oladi.

**Integratsiya.** Zayavka/buyurtma в†’ yuk e'loni (bir bosish). Yetkazildi + qabul tasdig'i в†’ **sklad kirim
qoralamasi** avtomatik (mavjud buyurtma-qabul-sklad oqimi, `20261211100000`) вЂ” qoralama, tasdiqlash odam
qo'lida. Buxgalteriya: yetkazish xizmati xarajati sifatida o'tkazma qoralamasi (BUXGALTERIYA_V1 bilan
moslab, qoralama); komissiya hisobi `t2_yb_tolov` ga.

**PWA nimani qila olmaydi (halol).** Haydovchi ilovasi birinchi bosqichda o'rnatiladigan PWA
(`/m/haydovchi`, mavjud E4). Cheklov: telefon ekrani o'chiq/ilova yopiq bo'lganda fon joylashuvi
ishonchsiz (iOS deyarli yo'q, Android Chrome o'zgaruvchan; Background Sync/Periodic Sync va Geolocation
fonda kafolat bermaydi; push qabul qilish iOS da faqat ekranga o'rnatilgan PWA da). Shu sababli PWA da
kuzatuv В«ilova ochiq + ekran yoniqВ» yoki haydovchi В«Yo'ldamanВ» bosgandagina ishonchli; ekranni
yoqiq saqlash (Wake Lock API) yordam beradi. **Native Android ilovasi kerak bo'ladi**, qachonki: (1) haydovchilarning
ko'pi uzoq yo'nalishli (>2 soat), (2) jonli kuzatuv mijoz talabiga aylansa, (3) takliflarga javob 60 s dan
tezroq bo'lishi kerak bo'lsa (ishonchli push/chaqiruv). Taxminan 300 faol haydovchi yoki birinchi 3 ta
shikoyat shuni ko'rsatadi. iOS native вЂ” Android'dan keyin (T: App Store talablari).

## D. Umumiy platforma qismlari

**Tashqi odam identifikatsiyasi.** Telegram-first: telefon (Telegram kontakti) = daraja 0 (YUK_BIRJASI В§6 daraja
jadvali saqlanadi). Kompaniya tasdig'i: STIR (INN) + faoliyat turi + egasi hujjati (R2), moderator;
yakka shaxs: pasport/guvohnoma/texpasport foto (R2, shaxsiy ma'lumot вЂ” qisqa saqlash, kirish jurnali).
Ishonch darajalari 0вЂ“3 uchala mahsulot uchun umumiy. Yakka tadbirkor/o'zini o'zi band qilgan maqomi
talablari: T вЂ” tekshirilsin (soliq.uz).

**Geo.** Tanlov (litsenziya/narx вЂ” hammasi T):
| Variant | Nima | Izoh |
|---|---|---|
| OpenStreetMap + MapLibre GL + o'z/hosting plitka | Xarita, bepul ma'lumot (ODbL, atribut kerak) | Boshlash uchun tavsiya. Plitka: o'z plitka serveri R2 da (PMTiles, bir fayl, O'zbekiston в‰€ 100вЂ“300 MB T) |
| Geokodlash: Nominatim/Photon | Manzil в†’ nuqta | Ochiq Nominatim ommaviy ishlatishga cheklangan (T siyosat) вЂ” o'z nusxa yoki obyekt koordinatalari bilan cheklash |
| Marshrut: OSRM / OpenRouteService / Valhalla | km, vaqt | Hozir ochiq OSRM (`yuk-marshrut`); ishlab chiqarishda o'z OSRM yoki ORS (T bepul kvota) |
| Yandex Maps / 2GIS API | Eng yaxshi mahalliy manzil sifati | Pullik, shartlar T; xaritani keshlash/saqlash cheklanishi mumkin |
| Google Maps | Qamrov | Narx yuqori, T |
**Tavsiya:** MapLibre + OSM (PMTiles R2), marshrutni o'z OSRM (kichik VPS yoki shlyuz kesh) bilan, manzil
qidirishni obyekt koordinatalari + qo'lda nuqta qo'yish + keyinroq Photon bilan. Mahalliy manzil sifati
yetmasa вЂ” Yandex/2GIS pullik qatlami ixtiyoriy (В§H savol).

**Real vaqt.** Taklif: Cloudflare Durable Objects (WebSocket) вЂ” har faol reys/hudud uchun bitta obyekt,
joylashuv xotirada; mijoz ulangan bo'lsa shu yerdan uzatiladi. Muqobillar: Supabase Realtime (Free da
ulanish va xabar limiti, jonli joylashuvga mos emas, T), Ably/Pusher (pullik), polling (15 s вЂ” eng oddiy,
dastlabki bosqich uchun yetarli). **Joylashuv tarixi Postgres'ga qator-qator YOZILMAYDI.** Dizayn: DO xotirasi
в†’ so'nggi nuqta + so'nggi 30 daqiqa halqa buferi; reys tugaganda Douglas-Peucker bilan soddalashtirilgan
yo'l (в‰€100вЂ“150 nuqta, gzip в‰€ 2 KB) bitta R2 obyektiga (`yol/<reys>.json.gz`) yoziladi; Postgres'da faqat
reys xulosasi (km, vaqt, R2 kalit) вЂ” bitta qator. Saqlash: R2 yo'l 12 oy, so'ng o'chiriladi (nizo yo'q bo'lsa).
DO narxi/free: T (Workers Paid kerak bo'lishi mumkin).

**Bildirishnoma.** Telegram bot (mavjud `t2_telegram_*`, outbox) вЂ” asosiy; Web Push (PWA) ikkinchi; SMS (T
provayder, narx) faqat tasdiq kodi uchun. Taklifga javob 60 s вЂ” Telegram push ishonchli, lekin
kechikishi mumkin: shuning uchun native ilova savoli (В§C).

**To'lov/escrow (faqat savollar, qaror yo'q).** Variantlar: (1) platforma pulni ushlamaydi вЂ” tomonlar o'zaro,
tizim faqat holat va hujjat; (2) to'lov provayderi (Payme/Click/Uzum вЂ” litsenziya, komissiya, shartnoma
T) orqali to'lov holatini tasdiqlash; (3) escrow (pulni ushlab turish) вЂ” yuridik litsenziya/ro'yxat T,
boshlang'ichda tavsiya etilmaydi. Hozirgi `yb_*` dizayni (1) ni qo'llaydi.

**Reyting umumiy.** Bitta `reyting` modul: kim kimga, bitim turi (bozor/tender/yuk), ball, izoh;
o'rtacha vaznli (yangi baho kamroq og'irlik emas, eski baho 12 oydan keyin pasayadi); mahsulotlararo
ko'rinadi: yuk reytingi bozor vitrinasida ham ko'rinadi. O'z-o'ziga baho va juft guruh (ikki hisob)
bahosi bloklanadi (qurilma/telefon/bitim summasi minimumi).

**Moderatsiya/suiiste'mol.** Shikoyat tugmasi, avto-belgilar (spam, shubhali narx, takroriy hisob),
moderator navbati `/admin/moderatsiya` (rahbariyat roli), bloklash sabab bilan va audit; telefon bo'yicha
tezlik limiti; to'lov/shaxsiy ma'lumotni chatda yuborish filtri.

**Tokenlar.** Har ish pul ishlaydi: yuk xati, tender ochilish bayonnomasi, tender taqqos hisoboti, narx
manbasi tahlili, AI qidiruv natijasi вЂ” `t2_token_narx` ga qator, `t2_token_harakat` orqali yechiladi (saga).
Tashqi akkaunt balansi: boshlang'ich sovg'a tokenlar (savol). Qayta yuklash takror yechilmaydi.

## E. Ma'lumot va masshtab

**Qatlamlar.** Postgres: tenant jadvallar (RLS) + ochiq jadvallar (`pub_*`, anon o'qish faqat RPC/ko'rinish
orqali) + hodisa jurnallari. R2: foto, hujjat, yo'l tarixi, PMTiles, e'lon rasmlari (kalit va xesh
jadvalda). Durable Object/KV: jonli joylashuv, taklif/chaqiruv navbati, qisqa muddatli. Cloudflare edge
kesh: ochiq vitrina sahifalari.

**Hajm baholash (qo'pol, indeksi bilan).** Bitta yopilgan reys в‰€ 8вЂ“10 KB Postgres (yuk, 3 taklif, bron,
~8 hodisa, baho); bozor ishtirokchisi oyiga в‰€ 20 KB (e'lon, taklif, buyurtma); tender в‰€ 15 KB; outbox
в‰€ 30 bildirishnoma Г— 0,3 KB (90 kundan keyin o'chiriladi).
| Faol foydalanuvchi | Reys/oy | Postgres MB/oy | R2 GB/oy (foto, yo'l) |
|---|---|---|---|
| 100 | ~300 | 6вЂ“8 | 0,5вЂ“1 |
| 1 000 | ~3 000 | 60вЂ“80 | 5вЂ“10 |
| 10 000 | ~30 000 | 600вЂ“800 | 50вЂ“100 |
(Taxmin: faol = oyiga kamida bir bitim; foydalanuvchilarning ~30% haydovchi/sotuvchi.)

**Bepul 500 MB ga sig'adimi?** Hozir 463 MB, bo'sh в‰€ 37 MB (`t2_qator` 117 MB вЂ” asosiy PTO ma'lumot). Dieta
migratsiyasi (`20261212100000`, qo'llanmagan) bir necha MB beradi. Xulosa:
- **Bepulda boshlash mumkin:** pilot в‰¤ 100вЂ“200 faol foydalanuvchi, 3вЂ“4 oy (в‰€ 25вЂ“30 MB), agar jonli joylashuv
  Postgres'ga yozilmasa, outbox va hodisa jurnallari muddatli o'chirilsa, rasmlar R2 da bo'lsa.
- **Pullik kerak bo'ladi:** ~300вЂ“500 faol foydalanuvchida (в‰€ 20вЂ“40 MB/oy) bo'sh joy 1вЂ“2 oyda tugaydi; ikkinchi
  sabab вЂ” Free rejimda zaxira va 1 haftalik harakatsizlikda pauza (T), jonli bozor uchun mos emas.
  Qoida: bo'sh joy < 15 MB yoki birinchi 300 faol foydalanuvchi вЂ” qaysi biri oldin bo'lsa вЂ” Pro ga o'tish.
  Pro narxi va 8 GB limit: T. Cloudflare Durable Objects ham Workers Paid talab qilishi mumkin (T).
- Birinchi bosqich (haydovchi pilot) uchun polling (15 s) + Postgres'da faqat so'nggi nuqta bilan bepulda
  ishlash mumkin, DO'ga o'tish pullik bosqich bilan birga.

## F. Navigatsiya va AI

**Ish joylari.** Hozirgi 7 ish joyi (reestr: `frontend/src/lib/reestr`, parallel agent menyuni qayta
guruhlayapti вЂ” bu PR navni TEGMAYDI). Taklif: `taminot` dan chiqarib, har mahsulot uchun alohida ish
joyi: **Bozor**, **Tender**, **Logistika** (yuk tashish) va `taminot` ni В«Ombor va xaridВ» ga qaytarish
(sklad, zayavka). Reestr kaliti `logistika` omborni bildirgani uchun yuk uchun `yuk` kaliti
(`/admin/yuk` в†’ ichki dispetcher; ochiq `/yuk`). Navigatsiya agenti tugagach keyingi PR da qo'shiladi.
**Ochiq kirish nuqtalari:** `/bozor`, `/tender`, `/yuk` (kirmasdan ko'rish, SEO), `/m/haydovchi`,
`/m/usta`, `/m/sotuvchi` (PWA, E4); Telegram bot `/start` вЂ” rol tanlamasdan.
**AI (Jarvis/Ctrl+K) qila olishi kerak** (har yangi funksiya AI tool'iga ham qo'shiladi; token yechadi):
- В«5 tonna sement uchun yuk mashina topВ» в†’ yuk e'loni qoralamasi (tur, 5 t, obyekt manzili), narx diapazoni,
  tasdiqdan keyin e'lon.
- В«Shu zayavkaga tender e'lon qilВ» в†’ zayavka qatorlaridan RFQ qoralamasi, taklif qilinadigan yetkazuvchilar.
- В«G'isht narxlarini solishtirВ» в†’ bozor + narx manbalari, o'rtacha (QQS siz) + ogohlantirish, max qoidasi.
- В«Yaqin yuklarni ko'rsatВ» (haydovchi), В«shu sotuvchining reytingiВ», В«tenderni yop va g'olibni ko'rsatВ».
Yozuvchi amallar har doim tasdiq bilan; AI tool nomli RPC ni chaqiradi (Konstitutsiya).

## G. Yo'l xaritasi (har bosqich foydalanish mumkin natija beradi)

| Bosqich | Mahsulot | Mazmun | Migratsiya | Xavf | Kod tashqarisidagi ish |
|---|---|---|---|---|---|
| 1 (2вЂ“3 hafta) | **Logistika yadro** | Xarita (MapLibre) + A/B nuqta tanlash; yuk egasi 5 maydonli forma; `/m/haydovchi` PWA: liniyaga chiqish, yaqin yuk, qabul, holat qadamlari, foto isbot; Telegram bildirishnoma; polling kuzatuv | `t2_yb_*` ga qo'shimcha ustunlar (joy lat/lng, holat pastki qadamlar, mashina onlayn); yo'l tarixi R2 | PWA fon joylashuv; xarita plitkalari; birinchi haydovchilar yo'q | 10вЂ“20 haydovchini yig'ish (ToshkentвЂ“Navoiy yo'nalishi), qo'llab-quvvatlash telefoni, oferta matni (T yuridik), tarif so'rovi |
| 2 (3вЂ“4 hafta) | **Bozor** | `bozor_profil/elon/sorov`, ochiq vitrina, qidiruv, zayavka/smetaв†’so'rov, narx manbasiga tushirish, baho | `bozor_*` jadvallar + `pub_*` ko'rinishlar | Likvidlik (sotuvchi kam); moderatsiya yuki | 20вЂ“30 sotuvchini qo'lda jalb qilish; kategoriya ro'yxati; moderator |
| 3 (3 hafta) | **Tender ochiq** | Ochiq rejim, muhrlangan taklif, buyurtmachi e'loni, ochilish bayonnomasi, kelishuv belgilari | `t2_tender_*` kengaytma (muhr, rejim) | Muhr xatosi = ishonchsiz | Tender qoidalari matni (T); birinchi 3 haqiqiy tender |
| 4 | Jonli qatlam | Durable Objects, jonli xarita, native Android (agar В§C shartlari bajarilsa) | yo'q (R2/DO) | Ish hajmi, pullik reja | App Store/Play hisoblari |
| 5 | To'lov/obuna | Egasi qarori bo'yicha | `yb_hisob` kengaytma | Yuridik | Provayder shartnomasi |

Nega Logistika birinchi: (1) bizning zayavka/buyurtma oqimi talab beradi вЂ” taklif tarafi yetarli bo'lsa
birinchi kundan haqiqiy yuk bor; (2) backend 28 RPC bilan tayyor, yuz yo'q вЂ” eng katta bo'shliq, kichik xavf;
(3) haydovchi tarmog'i qurilish bozori uchun ham (yetkazish) shart; (4) Bozor haydovchisiz sotuvchi
yetkaza olmaydi, tender esa allaqachon eng pishgan.

## H. EGASIGA SAVOL (tavsiya bilan)

1. **Komissiya:** yo'q (faqat token) / yopilgan bitimdan 3вЂ“5% / obuna. Tavsiya: 1-bosqichda faqat token,
   komissiya 100+ faol bitimdan keyin 3%.
2. **Birinchi foydalanuvchilar:** o'z zayavkalarimiz (Navoiy bog') + 10вЂ“20 tanish haydovchi. Tavsiya: shu.
3. **Hudud:** ToshkentвЂ“Navoiy yo'nalishi, keyin Samarqand/Buxoro. Tavsiya: bitta yo'nalishda zichlik.
4. **Yuk narxi:** qat'iy narx (tavsiya) / auktsion / aralash. Tavsiya: qat'iy + ixtiyoriy auktsion.
5. **Escrow:** yo'q (tavsiya, boshlang'ichda) / provayder orqali holat tasdig'i / haqiqiy escrow (yuridik T).
6. **Native Android:** qachon? Tavsiya: PWA pilotdan keyin, В§C shartlaridan biri bajarilganda.
7. **Pullik baza (Supabase Pro):** qachon? Tavsiya: 300 faol foydalanuvchi yoki bo'sh joy < 15 MB.
8. **Moderatsiya javobgarligi:** kim hal qiladi (siz/ofis xodimi/avtomatik)? Tavsiya: boshlang'ichda egasi + bitta
   moderator; nizo qarori platformaning maslahati, yuridik hukm emas (oferta matnida, T).
9. **Yopiq yetkazuvchi oqimi bilan munosabat:** mavjud yopiq yetkazuvchi/buyurtma oqimi saqlansin va bozor
   uning ustiga ochiq qatlam bo'lsinmi, yoki yagona oqimga birlashtirilsinmi? Tavsiya: saqlanadi; bozor
   narx manbai va yangi yetkazuvchi topish kanali bo'ladi.
10. **Brend:** bozor/tender/logistika alohida nom va domen (tashqi odam uchun) yoki tizim ichida? Tavsiya: alohida
   ochiq nomlar (`/yuk`, `/bozor`, `/tender`), bitta akkaunt, ichkarida ekotizim bilan bog'liq.

## I. Bu PR da nima YO'Q
Migratsiya, kod, navigatsiya o'zgarishi yo'q (Deliverable 3 ataylab qilinmadi: seedni EXPLAIN bilan tekshirish
uchun bazaga yozish kerak, bu ruxsat etilmagan; `t2_yb_*` allaqachon prodda). Hamma В«TВ» bandlari
amalga oshirishdan oldin tekshiriladi. Real ism, summa, STIR hujjatda yo'q.
