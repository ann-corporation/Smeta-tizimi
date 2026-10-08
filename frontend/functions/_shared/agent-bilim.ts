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
    sarlavha: 'Narxsiz qator: NULL ≠ 0',
    matn: 'Narxi ataylab yo‘q qator (price_intentionally_absent) summasi NULL — «noma‘lum», 0 EMAS. Bunday qator jamiga 0 qilib qo‘shilmaydi va «0 so‘m» deb aytilmaydi: «narx yo‘q» yoki «summa belgilanmagan» deyiladi. Manbadagi sertifikatlangan summa qty×narx dan ustun; dalil yetmasa javob — «noma‘lum».' },
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
