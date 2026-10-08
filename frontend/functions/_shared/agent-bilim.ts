/**
 * TIZIM BILIMI: AI ga «qaysi ma'lumot nimani bildiradi va qanday mantiq bilan hisoblanadi» ni o'rgatuvchi qatlam.
 * Ikki manba: (1) qo'lda yozilgan atama/mantiq lug'ati (Obsidian DOMAIN_MODEL, SMETA_ANATOMIYA, PTO_PRO_V1 ishonch qonunlari asosida);
 * (2) sahifa katalogi (SAHIFA_KATALOGI — koddan tekshiriladigan, har sahifa nimaga xizmat qiladi).
 * Bilim — tushuntirish, qoida emas: faktlar (raqamlar) faqat FAKTLAR bo'limidan olinadi. Savol/sahifaga qarab faqat tegishli qismi promptga qo'shiladi.
 */
import { SAHIFA_KATALOGI } from '../../src/lib/sayt-xaritasi/pageCatalog';

export type BilimYozuv = { id: string; kalit: string[]; sarlavha: string; matn: string; sahifa?: string[] };

/** Normallashtirilgan kalit so'zlar (kichik harf, apostrofsiz) — savol ham shunday normallanadi. */
export const normBilim = (s: string): string => s.toLowerCase().replace(/['‘’ʻʼ`´′]/g, '').replace(/\s+/g, ' ').trim();

export const BILIM: readonly BilimYozuv[] = [
  { id: 'f2', kalit: ['f2', 'ф2', 'форма 2', 'форма № 2', 'akt', 'акт приемки', 'bajarilgan ishlar akti'], sahifa: ['/admin/f2', '/admin/f2-tayyorlash', '/admin/f2-tarix'],
    sarlavha: 'F2 (Форма № 2 — Акт приёмки выполненных работ)',
    matn: 'F2 — davr uchun bajarilgan ishlar akti. Ish (bl) qatori FAQAT hajm ko‘rsatadi, narxsiz; uning resurslari (rs: ЧЕЛ/МАШ/МАТ) hajm = ish hajmi × norma, narx va summa bilan keladi; mustaqil materiallar o‘z hajmi/narxi bilan. F2 hajmi fakt qoldig‘idan oshmaydi (f2_mumkin). Narx manbasi: oldingi F2 → smeta (manba ko‘rinadi). Holat: qoralama → tasdiqlangan; tasdiqlangan F2 muzlaydi, jim o‘zgartirilmaydi (tuzatish alohida correction orqali).' },
  { id: 'fakt', kalit: ['fakt', 'факт', 'bajarilgan hajm', 'bugun', 'delta'], sahifa: ['/admin/fakt', '/admin/holat'],
    sarlavha: 'Fakt (bajarilgan ish)',
    matn: 'Fakt — obyektda haqiqatda bajarilgan hajm. Kiritish ikki xil: «+ bugun» (qo‘shimcha, delta) yoki «= jami» (umumiy). Ish (bl) va mustaqil resurs (mat/ob) uchun kiritiladi; ishning resursi (rs) fakti = ish fakti × norma. Smetadan oshib ketish ruxsat etiladi, lekin ogohlantirish chiqadi. Fakt F2 uchun asos: F2 faqat fakt qoldig‘i doirasida tuziladi.' },
  { id: 'qator_turlari', kalit: ['rz', 'bl', 'rs', 'mat', 'qator turi', 'bolim', 'razdel', 'раздел', 'daraxt', 'lrv'], sahifa: ['/admin/holat', '/admin/smeta-studio', '/admin/ierarxiya'],
    sarlavha: 'Smeta qator turlari',
    matn: 'Smeta daraxti qator turlari: rz — bo‘lim (РАЗДЕL, ichma-ich bo‘lishi mumkin); bl — ish (ШНК shifri, nomi, birligi, hajmi); rs — ishning resursi (norma × ish hajmi); mat — mustaqil material; ob — uskuna. LRV (локальная ресурсная ведомость) — shu daraxtning hujjati; RES — resurslar jamlanmasi (ВЕДОМОСТЬ РЕСУРСОВ).' },
  { id: 'resurs_kat', kalit: ['chel', 'чел', 'mash', 'маш', 'mat', 'мат', 'resurs kategoriya', 'kategoriya', 'mehnat', 'mashina', 'material', 'kab', 'bez sklad', 'без склад', 'beton', 'rastvor'],
    sarlavha: 'Resurs kategoriyalari',
    matn: 'Kategoriyalar: ЧЕЛ — mehnat (odam-soat); МАШ — mashina/mexanizm (mash-soat); МАТ — material; ОБ — uskuna; КАБ — kabel; М/К; БЕЗ СКЛАД — omborda saqlanmaydigan, kelishi bilan ishlatiladigan (tovar beton, beton/qorishma, asfaltobeton — beton/rastvor va м³ birlikda); u omborga kirmaydi. Mehnat va mash-soat narxi material katalogidan emas, alohida soatlik katalogdan olinadi.' },
  { id: 'null_nol', kalit: ['narxsiz', 'null', 'nol', 'noma‘lum', 'nomalum', 'bosh summa', 'summa yoq', 'сумма пуст', 'без цены', 'ноль'], sahifa: ['/admin/f2-tarix', '/admin/nakopitelniy', '/admin/f2-tayyorlash'],
    sarlavha: 'Narxsiz qator va jamilar (summalar doim ko‘rinadi)',
    matn: 'Hujjatlarda (LRV, RES, F2, nakopitelniy, ostatka, slichitelniy, oferta) jamilar HAR DOIM ko‘rinadi — ma‘lum summalar yig‘indisi, jami bo‘sh qolmaydi. Narxi yo‘q qator faqat O‘ZI bo‘sh qoladi (summasi to‘qilmaydi, taxmin qilinmaydi) va faqat o‘sha qator uchun bildirishnoma beriladi; «ЗАТРАТЫ ТРУДА МАШИНИСТОВ» (narxi mashina ichida) va ish/bo‘lim qatorlari bildirishnoma olmaydi. Narx foydalanuvchi roziligi bilan 0 qilingan bo‘lsa — bu haqiqiy 0, ogohlantirish yo‘q. Hujjatlarda maksimal Excel formula ishlatiladi; faqat tasdiqlangan F2 qiymatlari qiymat sifatida yoziladi. Manbadagi sertifikatlangan summa qty×narx dan ustun. AI narx yoki summani o‘zi to‘qimaydi: ma‘lumot bo‘lmasa «noma‘lum» deydi.' },
  { id: 'nakopitelniy', kalit: ['nakopitelniy', 'накопительная', 'slichitelniy', 'сличительная', 'f3', 'ф3', 'schet-faktura', 'справка-счет', 'ostatka', 'остатка', 'qoldiq vedomost'], sahifa: ['/admin/nakopitelniy'],
    sarlavha: 'Nakopitelniy, Slichitelniy, F3, Ostatka',
    matn: 'Nakopitelniy — davrlar bo‘yicha yig‘ilgan bajarilgan hajm/summa (FAQAT tasdiqlangan F2 dan). Slichitelniy — smeta ↔ bajarilgan solishtiruv. F3 (справка-счет, форма № 3) — davr summasi va ustamalar. Ostatka — qoldiq vedomost. Qonun: tasdiqlangan F2 bularning hammasida aynan bir xil; tarixiy F2 qayta hisoblanmaydi.' },
  { id: 'm29', kalit: ['m29', 'm-29', 'м-29', 'material hisobot', 'norma boyicha', 'sarf'], sahifa: ['/admin/m29'],
    sarlavha: 'M-29 (material sarfi hisoboti)',
    matn: 'M-29 — material hisoboti: norma bo‘yicha sarf ↔ haqiqiy sarf, oylar kesimida. Faqat materiallar kiradi (ЧЕЛ/МАШ kirmaydi). Manba: tasdiqlangan F2 oylari va smeta normalari.' },
  { id: 'nakrutka', kalit: ['nakrutka', 'накрутка', 'ustama', 'podval', 'подвал', 'nds', 'ндс', 'itogo', 'итого', 'transport', 'kutilmagan', 'sugurta', 'risk', 'vsego', 'всего'], sahifa: ['/admin/nakrutka'],
    sarlavha: 'Nakrutka (ustama) kaskadi',
    matn: 'Kaskad: to‘g‘ridan-to‘g‘ri xarajatlar (kategoriyalar) → transport/sklad → ИТОГО-1 → boshqa (прочие) → ИТОГО-2 → uskuna → ИТОГО-3 → sug‘urta/risk → ИТОГО-4 → НДС → ВСЕГО. Har kompaniya/smeta uchun podval konstruktori bor. Foiz qaysi bazaga va qaysi tartibda qo‘llangani asl fayldagi summa bilan tiyingacha solishtiriladi; mos kelmasa farq va sababi ko‘rsatiladi.' },
  { id: 'narx', kalit: ['narx', 'цена', 'nds siz', 'без ндс', 'narx dalili', 'обоснование', 'katalog narx', 'faktura', 'kp', 'кп', 'oferta', 'mash-soat', 'mashsoat', 'maxsoat'], sahifa: ['/admin/narxlar', '/admin/smeta-narxlash', '/admin/narx-dalil', '/admin/narx-manbalari', '/admin/oferta'],
    sarlavha: 'Narx, narx dalili va manbalar',
    matn: 'Smeta narxi doim НДС siz. Narx manbalari: katalog (material, ish haqi, mash-soat), faktura, КП, oldingi F2, shu smeta RES. Har narx manbasi bilan saqlanadi («Обоснование цен» — НАПУ himoyasi uchun). Takliflar smeta yuklanganda individual beriladi; qo‘llash — foydalanuvchi qarori, avtomatik yozilmaydi. Qoidalar: mash-soat uchun aynan bir xil texnikaning eng yuqori narxi (variantlar ko‘paytirilmaydi); mehnatda ijtimoiy 12% ikki marta qo‘shilmaydi; zaif moslik avtomatik qabul qilinmaydi — ko‘rib chiqishga ketadi. LRV da narx ustuni yo‘q, narx RES da.' },
  { id: 'aosr', kalit: ['aosr', 'аоср', 'yashirin ish', 'скрытых работ', 'laboratoriya', 'лаборатор', 'protokol', 'протокол', 'dalil'], sahifa: ['/admin/aosr', '/admin/hujjat-nazorat'],
    sarlavha: 'АОСР va laboratoriya',
    matn: 'АОСР (ШНК 3.01.01-22 Прил.6) — yashirin ishlar dalolatnomasi. Yo‘q bo‘lsa F2 bloklanmaydi, ogohlantirish chiqadi. Laboratoriya — alohida kompaniya (kontragent roli «laboratoriya»); protokollar ish yoki АОСР ga bog‘lanadi. «Hujjat nazorati» F2/Nakopitelniy/dalillar to‘liqligini ko‘rsatadi.' },
  { id: 'ierarxiya', kalit: ['kompaniya', 'loyiha', 'shartnoma', 'obyekt', 'tenant', 'asosiy shartnoma', 'qoshimcha shartnoma', 'tomonlar'], sahifa: ['/admin/shartnoma-liniya', '/admin/loyiha', '/admin/obyektlar', '/admin/moliya'],
    sarlavha: 'Ierarxiya: kompaniya → loyiha → shartnoma → obyekt',
    matn: 'Tuzilma: KOMPANIYA (alohida ma‘lumot egasi) → LOYIHA → SHARTNOMA (asosiy yoki qo‘shimcha; tomonlari erkin rolli) → OBYEKT → SMETA → FAKT → F2 → NAKOPITELNIY → F3. Obyektda bitta asosiy shartnoma, qo‘shimchalari cheklanmagan. Har kompaniya faqat o‘z ma‘lumotini ko‘radi; boshqa kompaniya ma‘lumoti hech qachon aralashmaydi.' },
  { id: 'rol_ishonch', kalit: ['rol', 'ruxsat', 'tasdiqlash', 'maker', 'checker', 'approver', 'kim tasdiqlaydi', 'ishonch', 'immutable', 'ozgarmas', 'tuzatish', 'correction'],
    sarlavha: 'Ishonch qonunlari va rollar',
    matn: 'Tasdiqlangan yozuv jim o‘zgartirilmaydi; original smeta baseline o‘zgarmas; revision = yangi baseline; tarixiy F2 qayta hisoblanmaydi; almashtirish eski qatorni o‘chirmaydi; tayyorlovchi ≠ tekshiruvchi ≠ tasdiqlovchi; har tashkilotning o‘z haqiqati; superadmin ham tasdiqlangan haqiqatni jim o‘zgartirmaydi; dalil yetmasa — «noma‘lum». AI ham haqiqat yaratmaydi: taklif beradi, inson tasdiqlaydi.' },
  { id: 'token', kalit: ['token', 'токен', 'hamyon', 'tarif', 'obuna', 'balans', 'tolov paketi'], sahifa: ['/admin/tokenlar'],
    sarlavha: 'Token, hamyon va tarif',
    matn: 'Platforma token bilan ishlaydi: kompaniya hamyoni, tarif/paketlar, o‘zgarmas daftar. To‘lov hozircha qo‘lda (o‘tkazma → superadmin tasdiqlaydi). AI sarfi ham token bilan: kompaniya faqat token sarfini ko‘radi (narx/ustama ko‘rinmaydi).' },
  { id: 'tomonlar', kalit: ['zakazchik', 'заказчик', 'buyurtmachi', 'taqdim', 'murojaat', 'remark', 'aloqa', 'handshake', 'grant', 'nazorat'], sahifa: ['/admin/zakazchik', '/admin/taqdimlar', '/admin/murojaatlar', '/admin/aloqalar'],
    sarlavha: 'Tomonlar aloqasi (zakazchik tomoni)',
    matn: 'Ikki kompaniya ikki tomonlama tasdiq (handshake) bilan bog‘lanadi; ruxsatlar (grant) default-deny: ikkinchi tomon faqat siz ochgan narsani ko‘radi. Pudratchi hujjat taqdim etadi, zakazchik qabul / rad / tuzatish so‘raydi (qaror o‘zgarmaydi). Murojaat — remark/savol/predpisaniye uchun yagona mexanizm.' },
  { id: 'studiya', kalit: ['studiya', 'studio', 'smeta tuzish', 'smeta yaratish', 'normativ', 'katalog', 'abc', 'tn', 'excel import', 'xarakteristika'], sahifa: ['/admin/smeta-studio'],
    sarlavha: 'Smeta studiyasi',
    matn: 'Smeta studiyasi — ikki panelli muharrir: chapda normativ katalog, o‘ngda bo‘lim/ish/resurs daraxti; barcha o‘zgarish yagona buyruq qatlami orqali (undo/redo). Narx avto-qo‘yiladi (resurs xarakteristikasi — beton klassi, armatura diametri, o‘lcham, marka qattiq darvoza; birlik; obyekt hududi), noaniqlari ko‘rib chiqishga; AI smetachi faqat taklif beradi, smetaga qo‘shish foydalanuvchi tasdig‘idan keyin.' },
  { id: 'sklad', kalit: ['ombor', 'sklad', 'склад', 'kirim', 'chiqim', 'zayavka', 'заявка', 'taminot', 'logistika', 'qoldiq'], sahifa: ['/admin/logistika', '/admin/zayavka'],
    sarlavha: 'Ombor va ta‘minot',
    matn: 'Ombor: kirim / chiqim / qoldiq. Chiqim qoldiqdan oshsa — yuqori xavf (har doim tasdiq so‘raladi). Zayavka — loyiha ehtiyoji (material/xizmat so‘rovi); ta‘minot smeta resurslaridan omborga o‘tadi. БЕЗ СКЛАД materiallar omborga kirmaydi.' },
  { id: 'sod_rollar', kalit: ['sod', 'rollar', 'kim qiladi', 'kim tasdiqlaydi', 'mas‘uliyat', 'masuliyat', 'prorab nima', 'buxgalter nima', 'pto nima', 'omborchi nima', 'segregation', 'роли', 'кто утверждает'],
    sarlavha: 'Rollar va vazifalar taqsimoti (SoD)',
    matn: 'Bitta odam yaratib, tekshirib, o‘zi tasdiqlab, keyin tarixni o‘zgartira olmaydi. Prorab: kunlik fakt, ishchi/texnika/material sarfi, foto — smeta narxi, F2 tasdig‘i va to‘lovni qilmaydi. PTO: smeta, fakt tekshiruvi, F2, nakopitelniy, F3, АОСР, M-29 — o‘z hujjatini yolg‘iz o‘zi yakuniy tasdiqlamaydi, to‘lov qilmaydi. Buxgalter: faktura, to‘lov, xarajat, debitor/kreditor, НДС — fizik hajm va F2 miqdoriga tegmaydi. Ta‘minot: zayavka, КП, xarid, yetkazish. Omborchi: kirim, chiqim, qoldiq. Rahbar: tasdiq, monitoring, risk. Zakazchik: qabul/rad/izoh — pudratchi originalini tahrirlamaydi. Nazorat: tekshiruv, NCR — pudratchi yozuvini tahrirlamaydi.' },
  { id: 'zamena_qoshimcha', kalit: ['zamena', 'замена', 'qoshimcha ish', 'qo‘shimcha', 'dop', 'kichik abc', 'asl smeta', 'smeta const', 'ozgartirib bolmaydi', 'replaces'], sahifa: ['/admin/holat', '/admin/smeta-studio'],
    sarlavha: 'Smeta o‘zgarmasligi: zamena va qo‘shimcha ish',
    matn: 'Asl smeta ishlari va resurslari hech qachon o‘chmaydi va o‘zgarmaydi; faqat qo‘shilgan (qo‘shimcha) qatorlar tahrirlanadi/o‘chiriladi (arxivi saqlanadi). ZAMENA: eski qator o‘zgarmaydi, yangi mustaqil qator eskisiga ishora qiladi. QO‘SHIMCHA: mustaqil qator, ishora yo‘q. Qo‘shimcha ish, zamena va resurs zamenasi «kichik ABC» (ШНК tuzilishi) bilan kiritiladi; narx tartibi: shu smeta RES → shu shartnoma smetalari → boshqa shartnomalar; katalog alohida taklif sifatida.' },
  { id: 'status_oqim', kalit: ['status', 'holat', 'qoralama', 'tasdiqlangan', 'correction', 'revision', 'bekor qilish', 'locked', 'черновик', 'утверждён'], sahifa: ['/admin/f2-tarix', '/admin/f2-tayyorlash'],
    sarlavha: 'Holatlar: qoralama → tasdiq → o‘zgarmas',
    matn: 'Universal oqim: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → LOCKED; o‘zgartirish faqat revision orqali (REVISION_REQUESTED → REVISION_CREATED → REVIEW → APPROVED). F2 da: qoralama → tasdiqlangan; tasdiqlangan F2 o‘zgartirilmaydi, xato bo‘lsa alohida correction akti tuziladi (masalan fakt +100, xato bo‘lsa −20 correction → joriy 80; asl yozuv saqlanadi). Moliyaviy/tasdiqlangan yozuvlarda hard delete yo‘q — holat va audit orqali.' },
  { id: 'f2_parity', kalit: ['slichitelniy', 'parity', 'bir xil', 'jami mos', 'f2 nakopitelniy farq', 'f3 mos', 'davr jami', 'сличительная', 'совпад'], sahifa: ['/admin/nakopitelniy', '/admin/hujjat-nazorat'],
    sarlavha: 'F2 = Slichitelniy = Nakopitelniy = F3 (aynan mos)',
    matn: 'Tasdiqlangan F2 boshqa hujjatlarga aynan kiradi: bir qator qo‘shilmaydi va kamaymaydi. Masalan dekabr F2 = shu davr slichitelniy = nakopitelniy = F3 (qatorma-qator, summa-summa). Hujjat nazorati sahifasi F2/Nakopitelniy/dalillar to‘liqligini tekshiradi; mos kelmasa farq va sababi ko‘rsatiladi. Smeta yoki narx o‘zgarsa tarixiy F2 qayta hisoblanmaydi — yangi baseline boshlanadi.' },
  { id: 'pto_zanjir', kalit: ['pto zanjiri', 'oqim', 'qadam', 'qanday ishlayman', 'boshlash', 'smetadan f2 gacha', 'ish tartibi', 'workflow', 'с чего начать', 'порядок работы'],
    sarlavha: 'PTO ish zanjiri: smetadan F3 gacha',
    matn: 'Tartib: smeta yuklash (Obyektlar → import) → Smeta va Fakt / LRV (/admin/holat) → fakt jurnali (/admin/fakt) → F2 tayyorlash (/admin/f2-tayyorlash) → F2 qoralama → tasdiqlash (/admin/f2-tarix) → Nakopitelniy (/admin/nakopitelniy) → Slichitelniy / F3 / Ostatka → M-29 (/admin/m29), АОСР va laboratoriya (/admin/aosr), narx dalili (/admin/narx-dalil). Egasi F2 fayllari bo‘lsa: F2 import (/admin/f2) → moslashtirish → akt. Tashqi 3 qadam: 1) smetani yuklang, 2) faktni kiriting, 3) F2 ni tayyorlang.' },
  { id: 'xavf_markazi', kalit: ['muammo', 'xavf', 'risk', 'ogohlantirish', 'diqqat', 'nima xato', 'kamchilik', 'проблем', 'риск'], sahifa: ['/admin/dashboard', '/admin/hujjat-nazorat'],
    sarlavha: 'Muammo va xavf signallari (nimalarga qaraladi)',
    matn: 'Tizim quyidagilarni muammo deb belgilaydi: fakt bor lekin F2 ga kirmagan; F2 bor lekin АОСР yo‘q; fakt smetadan oshgan; material normadan oshgan; yetkazish kechikkan; narx dalili eskirgan; shartnoma limiti yaqin; to‘lov kechikkan; cashflow minus xavfi; grafikdan kechikish; dublikat import; declared↔accepted farqi; ombor keyingi ehtiyojga yetmaydi. AI bu signallarni tushuntiradi, ammo ularni o‘zi tuzatmaydi.' },
  { id: 'xarid_oqim', kalit: ['xarid', 'rfq', 'taklif solishtir', 'po', 'procurement', 'zayavkadan', 'yetkazib beruvchi', 'закупк', 'поставщик'], sahifa: ['/admin/zayavka', '/admin/logistika'],
    sarlavha: 'Ta‘minot zanjiri',
    matn: 'Reja → resurs talabi → zaxira → tanqislik → zayavka → RFQ → takliflar → solishtiruv → tasdiq → buyurtma (PO) → yetkazish → ombor kirimi → sarf. Zayavka loyiha ehtiyoji sifatida boshlanadi; omborda yetarli bo‘lsa tanqislik yo‘q. Ta‘minotchi F2, fakt va buxgalteriyaga tegmaydi.' },
  { id: 'm29_qoida', kalit: ['m-29 qoida', 'norma bilan haqiqiy', 'perexod', 'ortiqcha sarf', 'tejash', 'asossiz chiqim', 'qayerga ishlatildi', 'перерасход', 'экономия'], sahifa: ['/admin/m29'],
    sarlavha: 'M-29 hisoblash qoidalari',
    matn: 'Norma bo‘yicha sarf FAQAT tasdiqlangan F2 dan: resurs F2 da o‘z miqdori bilan yozilgan bo‘lsa shu; bo‘lmasa ish F2 hajmi × smeta normasi. Haqiqiy sarf — ombor chiqimi; kirim ostatka uchun. Material nom + birlik bo‘yicha bog‘lanadi. Farq: + перерасход (ortiqcha sarf) / − экономия (tejash), smeta narxida pulga aylantiriladi. Omborda umuman yo‘q material — «noma‘lum», nol emas. Smetada yo‘q material chiqsa yoki F2 da ish yo‘q-u material chiqqan bo‘lsa — «asossiz chiqim» diqqat ro‘yxatida. ЧЕЛ/МАШ M-29 ga kirmaydi.' },
  { id: 'tomon_korinish', kalit: ['zakazchik nimani koradi', 'ruxsat bering', 'grant', 'deny', 'asosiy shartnoma', 'subpudrat', 'laboratoriya kompaniya', 'ko‘rinish', 'korinish', 'imzo', 'что видит заказчик'], sahifa: ['/admin/aloqalar', '/admin/zakazchik'],
    sarlavha: 'Tomonlar: kim nimani ko‘radi',
    matn: 'Obyektda asosiy shartnoma (buyurtmachi ↔ pudratchi) bitta; subpudrat, laboratoriya, loyihachi, yetkazib beruvchi cheklanmagan, rollar va shartnoma turlari erkin matn. Ko‘rinish deny-by-default: har tomon ikkinchisiga nimani ko‘rsatishini grant bilan beradi (zakazchikka odatda F2/F3/nakopitelniy/АОСР; ichki narx tahlili, ish haqi, ombor va boshqa obyektlar — yo‘q). Bog‘lanish: A taraf taklif yuboradi → B tasdiqlaydi → faol. Har tomon o‘z haqiqatini yozadi (Declared/Accepted/Disputed).' },
  { id: 'hujjat_standarti', kalit: ['hujjat tili', 'excel hujjat', 'formula', 'chop', 'a4', 'imzo bloki', 'rang mavzusi', 'формул', 'документ на русском'],
    sarlavha: 'Hujjat standarti',
    matn: 'Rasmiy hujjatlar (Excel) rus tilida, A4, chop sozlamasi va imzo bloki bilan; formulalar tirik (qiymat qotirilmaydi, `$`siz), kesh qiymatlari yoziladi; rang mavzusi har hujjat turi uchun alohida tanlanadi (/admin/hujjat-dizayn). F2 hujjatida ish (bl) qatori faqat hajm, resurslari (rs) narx va summa bilan; ikkinchi varaq — Ведомость ресурсов (solishtiruv farqi 0 bo‘lishi kerak). Sayt va izohlar — o‘zbekcha.' },
  { id: 'ai_imkon', kalit: ['ai', 'ии', 'yordamchi', 'nima qila olasan', 'nimaga qodirsan', 'qanday yordam', 'imkoniyat', 'что умеешь'],
    sarlavha: 'AI nima qila oladi',
    matn: 'AI: (1) lavozimga ruxsat etilgan ma‘lumot bo‘yicha savolga aniq javob (raqamlar FAKTLAR dan); (2) tizimdagi atama/mantiqni tushuntiradi; (3) kerakli sahifani ko‘rsatadi va ochish tugmasini beradi; (4) ombor kirim/chiqim, grafik foizi, eslatma kabi ishlarni TAKLIF qiladi — bajarish foydalanuvchi tasdig‘idan keyin (xavfi past ishni sozlamaga ko‘ra o‘zi bajarishi mumkin, yuqori xavf hech qachon avtomatik emas); (5) foydalanuvchi uslubiga moslashadi. AI ruxsatsiz ma‘lumotni ko‘rsatmaydi va tasdiqlangan hujjatni o‘zgartirmaydi.' },
];

/** Bazadagi (superadmin/kompaniya admini tasdiqlagan) bilim yozuvi — `t2_agent_bilim_v1` natijasi. */
export type DbBilim = { kod: string; doira?: string; sarlavha: string; matn: string; kalit: string[]; manba_url?: string | null };

/** DB yozuvini qidiruv yozuviga aylantiradi (manba havolasi matn oxirida; kalit va matn uzunligi chegaralanadi). */
export function dbBilimYozuvlari(royxat: unknown): BilimYozuv[] {
  if (!Array.isArray(royxat)) return [];
  return royxat.slice(0, 300).flatMap((x): BilimYozuv[] => {
    const o = (x ?? {}) as Partial<DbBilim>;
    if (typeof o.kod !== 'string' || typeof o.sarlavha !== 'string' || typeof o.matn !== 'string' || !Array.isArray(o.kalit)) return [];
    const kalit = o.kalit.filter((k): k is string => typeof k === 'string' && k.length >= 2).slice(0, 12);
    if (!kalit.length) return [];
    const manba = typeof o.manba_url === 'string' && o.manba_url.startsWith('https://') ? ` (manba: ${o.manba_url.slice(0, 200)})` : '';
    return [{ id: 'db:' + o.kod, kalit, sarlavha: o.sarlavha.slice(0, 200) + (o.doira === 'company' ? ' · kompaniya bilimi' : ''), matn: o.matn.slice(0, 1500) + manba }];
  });
}

/** Savol va sahifa bo'yicha eng mos bilim yozuvlari (ball: kalit so'z urishi + sahifa moslik), belgilar byudjeti bilan. `qoshimcha` — bazadagi tasdiqlangan bilim. */
export function bilimTanla(savol: string, sahifa?: string | null, byudjet = 3000, maks = 5, qoshimcha: readonly BilimYozuv[] = []): BilimYozuv[] {
  const q = normBilim(savol); const s = (sahifa ?? '').toLowerCase();
  const ball = (y: BilimYozuv): number => {
    let b = 0;
    for (const k of y.kalit) if (q.includes(normBilim(k))) b += k.length >= 4 ? 3 : 2;
    if (s && y.sahifa?.some((p) => s.startsWith(p))) b += 2;
    return b;
  };
  // Bazadagi tasdiqlangan bilim (yangi me'yor/qonun) bir xil ball bo'lsa USTUN: kod ichidagi lug'at eskirgan bo'lishi mumkin.
  const tartib = [...BILIM.map((y) => ({ y, b: ball(y) })), ...qoshimcha.map((y) => ({ y, b: ball(y) + 0.5 }))].filter((x) => x.b > 0).sort((a, c) => c.b - a.b);
  const chiqish: BilimYozuv[] = []; let n = 0;
  for (const { y } of tartib) {
    const uzun = y.sarlavha.length + y.matn.length + 6;
    if (chiqish.length >= maks || n + uzun > byudjet) continue;
    chiqish.push(y); n += uzun;
  }
  return chiqish;
}

const KATALOG_YOL = new Map(SAHIFA_KATALOGI.map((x) => [x.yol, x]));

/** Joriy sahifaning ma'nosi (eng uzun mos yo'l) — AI «foydalanuvchi hozir qayerda» ni biladi. */
export function sahifaBilimi(sahifa: string | null | undefined): string | null {
  if (!sahifa) return null;
  const yol = sahifa.split('?')[0].toLowerCase().replace(/\/+$/, '');
  let eng: (typeof SAHIFA_KATALOGI)[number] | null = null;
  for (const p of SAHIFA_KATALOGI) if ((yol === p.yol || yol.startsWith(p.yol + '/')) && (!eng || p.yol.length > eng.yol.length)) eng = p;
  if (!eng) return null;
  const keyingi = eng.beradi.filter((x) => KATALOG_YOL.has(x)).map((x) => `${KATALOG_YOL.get(x)!.nom} (${x})`).slice(0, 4);
  return [`Foydalanuvchi hozir: «${eng.nom}» (${eng.yol}) — ${eng.izoh}`,
    eng.chiqaradi.length ? `Bu sahifa ko‘rsatadi: ${eng.chiqaradi.join('; ')}.` : '',
    keyingi.length ? `Odatda keyingi qadam: ${keyingi.join(', ')}.` : ''].filter(Boolean).join(' ');
}

/** Sahifa yo'li katalogda bormi (AI «sahifani ochish» tugmasi uchun — o'ylab topilgan yo'l rad etiladi). */
export function yolTekshir(yol: unknown): string | null {
  if (typeof yol !== 'string') return null;
  const y = yol.split('?')[0].replace(/\/+$/, '');
  return KATALOG_YOL.has(y) ? y : null;
}

const TOKEN_TASHLA = new Set(['qayerda', 'qayer', 'nima', 'qanday', 'ochib', 'ber', 'menga', 'kerak', 'sahifa', 'bolim', 'menyu', 'bor', 'mumkin', 'качать', 'где', 'как', 'что', 'мне', 'нужно', 'открой', 'страница', 'раздел']);

/** Savolga eng mos sahifalar (so'z kesishuvi); legacy sahifalar oxirida. Model ishtirokisiz, shuning uchun tokensiz ishlaydi. */
export function sahifaQidirish(savol: string, maks = 3): Array<{ yol: string; nom: string }> {
  const sozlar = [...new Set(normBilim(savol).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !TOKEN_TASHLA.has(w)))];
  if (!sozlar.length) return [];
  const ball = SAHIFA_KATALOGI.map((p) => {
    const matn = normBilim([p.nom, p.izoh, p.kalit, ...p.chiqaradi].join(' '));
    const b = sozlar.reduce((a, w) => a + (matn.includes(w.length > 5 ? w.slice(0, w.length - 1) : w) ? 1 : 0), 0);
    return { p, b: p.legacy ? b - 0.5 : b };
  }).filter((x) => x.b >= 1).sort((a, c) => c.b - a.b);
  return ball.slice(0, maks).map((x) => ({ yol: x.p.yol, nom: x.p.nom }));
}

/**
 * Kompaniya/lavozimi yo'q foydalanuvchi uchun TOKENSIZ «Tizim yordamchisi»: lug'at va sahifa katalogi asosida javob.
 * Kompaniya ma'lumotiga umuman tegmaydi; mos qo'llanma topilmasa — halol shuni aytadi.
 */
export function tizimYordamJavobi(savol: string, sahifa?: string | null, qoshimcha: readonly BilimYozuv[] = []): { javob: string; sahifalar: Array<{ yol: string; nom: string }>; topildi: boolean } {
  const yozuvlar = bilimTanla(savol, sahifa, 2600, 3, qoshimcha);
  const sahifalar = sahifaQidirish(savol, 3);
  const qismlar: string[] = [];
  if (yozuvlar.length) qismlar.push(...yozuvlar.map((x) => `**${x.sarlavha}**\n${x.matn}`));
  if (navigatsiyaSorovi(savol) || !yozuvlar.length) {
    if (sahifalar.length) qismlar.push('Mos sahifalar: ' + sahifalar.map((s) => `«${s.nom}»`).join(', ') + '.');
  }
  if (!qismlar.length) return { javob: 'Bu savolga mos qo‘llanma topilmadi. Kompaniyani tanlasangiz, lavozimingizga mos AI ishchi sizning ma‘lumotlaringiz bo‘yicha javob beradi.', sahifalar: [], topildi: false };
  return { javob: qismlar.join('\n\n'), sahifalar: navigatsiyaSorovi(savol) || !yozuvlar.length ? sahifalar : [], topildi: true };
}

const NAVIGATSIYA =/(qayerda|qayer|qanday och|ochib ber|otib ber|olib bor|sahifa|bolim|menyu|где|открой|как найти|как открыть|куда|перейд|navigate)/i;
export const navigatsiyaSorovi = (savol: string): boolean => NAVIGATSIYA.test(normBilim(savol));

/** Kundalik sahifalar xaritasi (legacy siz) — «qayerda?» savollari va tizim yordamchisi uchun. */
export function sahifalarXaritasi(): string {
  return SAHIFA_KATALOGI.filter((p) => !p.legacy && p.scope !== 'GLOBAL').map((p) => `- ${p.nom}: ${p.yol} — ${p.izoh.split('.')[0]}`).join('\n');
}

/** Promptga qo'shiladigan bilim bo'limi (bo'sh bo'lishi mumkin). */
export function bilimBolimi(savol: string, sahifa: string | null | undefined, byudjet = 3200, qoshimcha: readonly BilimYozuv[] = []): string {
  const y = bilimTanla(savol, sahifa, byudjet, 5, qoshimcha);
  const sb = sahifaBilimi(sahifa);
  const xarita = navigatsiyaSorovi(savol) ? `\nSAHIFALAR XARITASI (faqat shu yo‘llar mavjud):\n${sahifalarXaritasi()}` : '';
  if (!y.length && !sb && !xarita) return '';
  return ['TIZIM BILIMI (atama va mantiqni tushuntirish uchun; RAQAMLAR faqat FAKTLAR dan olinadi, bu bo‘limdan emas):',
    sb ?? '', ...y.map((x) => `• ${x.sarlavha}: ${x.matn}`), xarita].filter(Boolean).join('\n');
}
