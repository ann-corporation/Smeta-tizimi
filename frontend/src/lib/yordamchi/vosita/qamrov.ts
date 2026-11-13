/**
 * «Jarvis bu yerda nima qila oladi» — reestrdagi HAR sahifa uchun: qaysi vositalar/niyatlar (qila) va qaysi asosiy yozuv amallari hali faqat
 * sahifada (sahifada — halol bo'shliqlar ro'yxati). Yangi sahifa SAHIFALAR ga qo'shilsa, qamrov testi shu jadvalga qator qo'shishni talab qiladi.
 * `niyat:*` — Vosita reestridan tashqari, mahalliy niyat oqimlari (navigatsiya, o'qish, fakt/narx yozuvi, F2/АОСР qoralama).
 */
export const NIYAT_OQIMLARI = ['niyat:navigatsiya', 'niyat:oqish', 'niyat:yozuv', 'niyat:f2Qoralama', 'niyat:aosrQoralama', 'niyat:qarz', 'niyat:sahifaAmal'] as const;

export type Qamrov = { qila: readonly string[]; sahifada: readonly string[] };
const NAV = 'niyat:navigatsiya';
const q = (qila: string[], sahifada: string[] = []): Qamrov => ({ qila: [NAV, ...qila], sahifada });

export const QAMROV: Readonly<Record<string, Qamrov>> = {
  pult: q(['bugun', 'solishtiruv']), dashboard: q(['bugun']),
  obyektlar: q(['niyat:oqish'], ['smeta faylini yuklash', 'obyekt yaratish/arxivlash']),
  loyiha: q([], ['loyiha yaratish/tahrirlash']), participants: q([], ['ishtirokchi qo‘shish/olib tashlash']),
  mindmap: q([], ['chiziq tortib bog‘lash (2D tahrir)']), grafik: q(['niyat:oqish'], ['grafikni tahrirlash']),
  'smeta-studio': q(['niyat:oqish'], ['katalogdan ish qo‘shish va smetani tahrirlash (sahifa amallari orqali taklif)']),
  holat: q(['niyat:oqish']), 'loyiha-smeta': q(['niyat:oqish'], ['loyiha qatorini smetaga bog‘lash']),
  'smeta-narxlash': q(['niyat:oqish', 'niyat:yozuv'], ['ommaviy narxlash (RES)']), 'narx-dalil': q([], ['narx dalilini shakllantirish/eksport']),
  'narx-tekshiruv': q(['niyat:oqish']), nakrutka: q([], ['nakrutka foizini belgilash']), narxlar: q(['niyat:oqish']),
  'narx-manbalari': q([], ['katalog/faktura/КП yuklash']), oferta: q([], ['oferta tuzish']),
  fakt: q(['niyat:yozuv', 'niyat:oqish', 'zamena_korsatma'], ['zamena va qo‘shimcha ishni saqlash (Jarvis tartibni ko‘rsatadi, saqlash sahifada)', 'bajarilmadi belgilash (oyna)']),
  naryad: q(['niyat:oqish'], ['naryad yaratish/qabul qilish']), foto: q([], ['foto yuklash']), bugun: q(['bugun']),
  m29: q([], ['M-29 yaratish']),
  'f2-tayyorlash': q(['niyat:f2Qoralama', 'niyat:oqish'], ['F2 ni yakuniy shakllantirish (qoralamadan keyingi qadam)']),
  f2: q([], ['tayyor F2 faylini import qilish']),
  'f2-tarix': q(['f2_tasdiqla', 'f2_bekor', 'taqdim_yubor', 'niyat:oqish', 'niyat:sahifaAmal'], ['F2 PDF/arxiv eksporti (Excel — «F2 ni Excel ga yuklash» sahifa amali orqali, token kartada)', 'F2 dan Forma 3 yaratish']),
  'f2-reestr': q(['niyat:oqish']),
  nakopitelniy: q(['niyat:oqish'], ['nakopitelniy/F3 Excel eksporti', 'Forma 3 yaratish (davr, F2 tanlovi)']),
  solishtiruv: q(['solishtiruv'], ['tafovutni «tushuntirildi» deb belgilash (sabab bilan)']),
  moliya: q(['xarajat_yoz', 'tolov_yoz', 'niyat:qarz'], ['xarajat/to‘lovni tahrirlash va bekor qilish']),
  'shartnoma-liniya': q(['tolov_yoz'], ['shartnoma yaratish/tahrirlash']),
  qarzdorlik: q(['niyat:qarz']), buxgalteriya: q(['xarajat_yoz', 'tolov_yoz'], ['provodka tahriri']),
  kontragentlar: q([], ['kontragent yaratish']), yetkazuvchi: q(['bugun'], ['yetkazuvchi amallari (narx taklifi, yetkazish)']),
  subpudratchi: q(['bugun'], ['subpudrat akt topshirish']), subpudrat: q([], ['subpudrat akt tasdiqlash']),
  documents: q(['murojaat_yubor'], ['hujjat yuklash/versiya']), 'hujjat-nazorat': q([], ['hujjat o‘zgarishini tasdiqlash']),
  aosr: q(['niyat:aosrQoralama', 'niyat:oqish', 'slichitelniy'], ['АОСР tasdiqlash/imzolash', 'АОСР ni smeta qatoriga ommaviy bog‘lash (taklif — #413 dan keyin)']),
  storage: q([], ['fayl yuklash/o‘chirish']), nazorat: q(['murojaat_yubor']), 'nazorat/tekshiruv': q([], ['tekshiruv kiritish']), 'nazorat/jurnal': q([]),
  zakazchik: q(['bugun', 'murojaat_yubor']), taqdimlar: q(['taqdim_yubor', 'bugun'], ['taqdimga qaror (qabul/rad)']),
  murojaatlar: q(['murojaat_yubor', 'bugun'], ['murojaatga javob berish/yopish']), chizmalar: q([], ['chizma yuklash/revizya']),
  loyihachi: q(['bugun']), laboratoriya: q(['murojaat_yubor'], ['sinov so‘rovi/protokol']), 'hujjat-aylanish': q(['bugun'], ['hujjat tasdiqlash zanjiri']),
  logistika: q([], ['sklad kirim/chiqim']), zayavka: q([], ['zayavka yaratish (sahifa yaratish formasini ochadi)']),
  tender: q([], ['tender yaratish']), 'yuk-birjasi': q([]), 'bozor-sorov': q([], ['narx so‘rovi yuborish']), 'bozor-kabinet': q([], ['e’lon/taklif']),
  'bozor-moderatsiya': q([], ['moderatsiya qarori']), 'tender-ochiq': q([], ['lot/taklif']), 'yuk-chaqirish': q([], ['yuk chaqirish (slot bilan forma ochiladi)']),
  haydovchi: q([], ['reys amallari']), erp: q([], ['xodim/texnika']), hr: q([], ['KPI/oylik']), sotuv: q([], ['bron/bitim/to‘lov grafigi']),
  kompaniya: q([], ['a’zo/modul boshqaruvi']), 'system-control': q([], ['integratsiya sozlamalari']),
  'tizim-sozlama': q(['xotira_korsat', 'xotira_yoz', 'xotira_unut']), 'hujjat-dizayn': q([], ['hujjat dizayni sozlamalari']), tokenlar: q([], ['obuna/token to‘ldirish']),
  'ai-agentlar': q(['xotira_korsat'], ['AI ishchilar sozlamalari']), korzinka: q([], ['tiklash']),
  'ish-joylarim': q(['bugun']), kurs: q([]), topshiriqlar: q(['bugun']), mutaxassis: q([], ['xizmat e’lon qilish']),
  osuvchi: q(['niyat:oqish'], ['taklifni qabul/rad']), akkaunt: q([], ['akkaunt sozlamalari']), sozlamalar: q(['xotira_korsat', 'xotira_yoz', 'xotira_unut']),
  boshqaruv: q([], ['platforma boshqaruvi']), 'tizim-xaritasi': q([]), 'fayl-boglash': q([], ['fayl bog‘lash']),
};

/** Sahifa uchun «Jarvis bu yerda nima qila oladi»: vositalar/niyatlar va hali sahifada qoladigan amallar. */
export const jarvisQamrovi = (sahifaKalit: string): Qamrov | null => QAMROV[sahifaKalit] ?? null;

/** Hisobot uchun: hali Jarvis orqali bajarilmaydigan amallar (sahifa -> amallar). */
export const QAMROV_BOSHLIQLARI = (): Array<{ sahifa: string; amallar: readonly string[] }> =>
  Object.entries(QAMROV).filter(([, v]) => v.sahifada.length).map(([sahifa, v]) => ({ sahifa, amallar: v.sahifada }));
