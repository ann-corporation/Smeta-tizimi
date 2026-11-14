/**
 * tekshiruv.ts - texnik nazorat sayt tekshiruvi (tashrif): ish turi bo'yicha tayyor checklist, yakunlash tekshiruvi
 * va kunlik jurnal (rasmiy ruscha reestr, mavjud RasmiyVaraq). Sof funksiyalar: DB ham, pul ham yo'q.
 * Server (t2_nazorat_tekshiruv_yoz_v1) bir xil qoidani qayta tekshiradi: nomuvofiq band = izoh + foto; natija bo'lmagan band - "tekshirilmadi".
 */
import { RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, type ImzoNomlar, type RasmiyUstun } from '../hujjat-yozuvchi';
import type { TekshiruvBand, TekshiruvQisqa } from '../../api/t2-nazorat';

export type TekshiruvShablon = { kalit: string; nom: string; bandlar: ReadonlyArray<{ kod: string; nom: string }> };

const b = (kod: string, nom: string) => ({ kod, nom });
/** Ish turi -> tekshiriladigan bandlar (qisqa, ustaga tushunarli). Ro'yxat kengayadi; "Boshqa" bo'sh checklist bilan boshlanadi. */
export const TEKSHIRUV_SHABLONLAR: readonly TekshiruvShablon[] = [
  { kalit: 'beton', nom: 'Beton ishlari', bandlar: [b('b1', 'Qolip va tayanchlar mustahkam, o‘lchamlari loyihaga mos'), b('b2', 'Armatura diametri va qadami loyihaga mos'), b('b3', 'Himoya qatlami qalinligi'), b('b4', 'Beton markasi va hujjati (pasport) mos'), b('b5', 'Beton qorishmasi qo‘yilishi va zichlanishi'), b('b6', 'Kub namunalar olingan (laboratoriya)')] },
  { kalit: 'armatura', nom: 'Armatura ishlari', bandlar: [b('a1', 'Armatura sinfi va diametri sertifikatga mos'), b('a2', 'Qadam va ulanish (ustma-ust) uzunligi'), b('a3', 'Payvand/bog‘lash sifati'), b('a4', 'Zanglash yoki ifloslik yo‘q'), b('a5', 'Fiksatorlar o‘rnatilgan')] },
  { kalit: 'qolip', nom: 'Qolip ishlari', bandlar: [b('q1', 'Qolip geometriyasi va vertikalligi'), b('q2', 'Tayanch va ustunlar mustahkamligi'), b('q3', 'Qolip choklari zich'), b('q4', 'Qolipni yechish muddati saqlangan')] },
  { kalit: 'grunt', nom: 'Grunt va asos tayyorlash', bandlar: [b('g1', 'Tagi tabiiy grunt, yumshoq qatlam olingan'), b('g2', 'Qatlam qalinligi va zichlash'), b('g3', 'Zichlik laboratoriya xulosasi bor'), b('g4', 'Otmetkalar loyihaga mos')] },
  { kalit: 'gisht', nom: 'G‘isht / blok terish', bandlar: [b('k1', 'Devor vertikalligi va tekisligi'), b('k2', 'Choklar qalinligi va to‘ldirilganligi'), b('k3', 'Bog‘lash (perevyaz) tartibi'), b('k4', 'Ochiq (proyom) va armatura to‘ri o‘rnatilgan')] },
  { kalit: 'suvoq', nom: 'Suvoq va pardozlash', bandlar: [b('s1', 'Sirt tekisligi (reyka bilan)'), b('s2', 'Yopishish (bo‘shliq yo‘q)'), b('s3', 'Burchaklar va qiyaliklar'), b('s4', 'Yoriqlar yo‘q')] },
  { kalit: 'gidroizolyatsiya', nom: 'Gidroizolyatsiya / tom', bandlar: [b('h1', 'Asos tayyor, quruq va tekis'), b('h2', 'Qatlamlar soni va ustma-ust qo‘yilishi'), b('h3', 'Devorga chiqish va burchak detallari'), b('h4', 'Suv sinovi (ho‘llash) o‘tkazilgan'), b('h5', 'Material sertifikati mos')] },
  { kalit: 'metall', nom: 'Metall konstruksiya / payvand', bandlar: [b('m1', 'Elementlar markasi va o‘qlari loyihaga mos'), b('m2', 'Payvand choklari tashqi ko‘rik'), b('m3', 'Payvandchi attestati bor'), b('m4', 'Bolt ulanishlari tortilgan'), b('m5', 'Korroziyaga qarshi qoplama')] },
  { kalit: 'elektr', nom: 'Elektr ishlari', bandlar: [b('e1', 'Kabel markasi va kesimi loyihaga mos'), b('e2', 'Yerga ulash (zazemleniye) bajarilgan'), b('e3', 'Izolyatsiya qarshiligi o‘lchangan'), b('e4', 'Shit va avtomatlar belgilangan')] },
  { kalit: 'santexnika', nom: 'Suv / kanalizatsiya / isitish', bandlar: [b('t1', 'Quvur diametri va qiyaligi'), b('t2', 'Ulanishlar zich'), b('t3', 'Bosim sinovi (gidravlik) o‘tkazilgan'), b('t4', 'Mahkamlash va o‘tish joylari (gilza)')] },
  { kalit: 'umumiy', nom: 'Umumiy ko‘rik (xavfsizlik, tartib)', bandlar: [b('u1', 'Ishchilar kaska va himoya vositasida'), b('u2', 'Yuqorida ishlash uchun to‘siq / belbog‘'), b('u3', 'Maydon tartibli, materiallar saqlanishi'), b('u4', 'Ish jurnali yuritilmoqda')] },
  { kalit: 'boshqa', nom: 'Boshqa ish', bandlar: [] },
];

export const tekshiruvShabloni = (kalit: string) => TEKSHIRUV_SHABLONLAR.find((s) => s.kalit === kalit) ?? null;

/** Shablondan bo'sh checklist: har band "tekshirilmadi" (natija = yoq) bilan boshlanadi. */
export function bandlarniBoshlash(s: TekshiruvShablon): TekshiruvBand[] {
  return s.bandlar.map((x) => ({ kod: x.kod, nom: x.nom, natija: 'yoq', izoh: '', muhimlik: 'yuqori', document_ids: [] }));
}

export type TekshiruvXulosa = { mos: number; mosEmas: number; yoq: number; muammolar: string[]; tayyor: boolean };
/** Yakunlashdan oldingi tekshiruv (serverdagi qoidaning aynan nusxasi, foydalanuvchiga oldindan aytish uchun). */
export function tekshiruvXulosa(bandlar: readonly TekshiruvBand[]): TekshiruvXulosa {
  let mos = 0, mosEmas = 0, yoq = 0;
  const muammolar: string[] = [];
  for (const x of bandlar) {
    if (x.natija === 'mos') mos++;
    else if (x.natija === 'mos_emas') {
      mosEmas++;
      if ((x.izoh ?? '').trim().length < 3) muammolar.push(`«${x.nom}»: nima noto‘g‘riligini yozing`);
      if (!(x.document_ids?.length)) muammolar.push(`«${x.nom}»: foto qo‘shing`);
    } else yoq++;
  }
  if (mos + mosEmas === 0) muammolar.push('Hech bo‘lmasa bitta bandni tekshiring');
  return { mos, mosEmas, yoq, muammolar, tayyor: muammolar.length === 0 };
}

/** Taklif qilinadigan bartaraf muddati (kun): kritik - 3, qolgani - 7. */
export const muddatKunTaklif = (muhimlik?: string | null) => (muhimlik === 'kritik' ? 3 : 7);

const NATIJA_RU: Record<string, string> = { mos: 'Соответствует', mos_emas: 'Выявлены замечания', yoq: '' };
const ddmmyyyy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : null);

const JURNAL_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Дата', kenglik: 11, tur: 'birlik' },
  { sarlavha: 'Объект', kenglik: 26, tur: 'matn' },
  { sarlavha: 'Вид работ', kenglik: 24, tur: 'matn' },
  { sarlavha: 'Место (ось, этаж)', kenglik: 18, tur: 'matn' },
  { sarlavha: 'Проверено пунктов', kenglik: 11, tur: 'birlik' },
  { sarlavha: 'Результат', kenglik: 22, tur: 'matn' },
  { sarlavha: 'Замечания (пункты с отклонением)', kenglik: 46, tur: 'matn' },
  { sarlavha: 'Предписаний выдано', kenglik: 11, tur: 'birlik' },
];
/** Kunlik / davr jurnali: faqat yakunlangan tekshiruvlar, sana bo'yicha o'sish tartibida. */
export function kunlikJurnalXlsx(royxat: readonly TekshiruvQisqa[], o: { davr: string; inspektorNomi?: string; imzo?: ImzoNomlar }) {
  const yakun = royxat.filter((t) => t.holat === 'yakunlandi').slice().sort((a, c) => a.sana.localeCompare(c.sana) || a.id - c.id);
  const v = new RasmiyVaraq({
    nom: 'Журнал проверок',
    sarlavha: 'ЖУРНАЛ ПОСЕЩЕНИЙ И ПРОВЕРОК ТЕХНИЧЕСКОГО НАДЗОРА',
    ostSarlavha: [`за период: ${o.davr}`],
    titul: [['Инспектор:', o.inspektorNomi]],
    ustunlar: JURNAL_USTUN,
    yonalish: 'landscape',
  });
  let no = 0;
  for (const t of yakun) {
    const tekshirilgan = t.bandlar.filter((x) => x.natija !== 'yoq');
    const kamchilik = t.bandlar.filter((x) => x.natija === 'mos_emas').map((x) => `${x.nom}${x.izoh ? ` — ${x.izoh}` : ''}`).join('; ');
    v.qator('oddiy', [++no, ddmmyyyy(t.sana), t.obyekt_nom, t.ish_turi, t.joy, tekshirilgan.length, NATIJA_RU[t.natija ?? 'yoq'] ?? '', kamchilik || null, t.predpisaniya_soni || null]);
  }
  v.bosh();
  v.izoh(`Всего проверок: ${yakun.length}; с замечаниями — ${yakun.filter((t) => t.natija === 'mos_emas').length}; предписаний выдано — ${yakun.reduce((s, t) => s + (t.predpisaniya_soni || 0), 0)}.`);
  v.imzo(imzoTomonlari(['ТЕХНАДЗОР'], o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'ijro_reestr' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: 'TEXNADZOR', hujjat: 'ZHURNAL_PROVEROK', davr: o.davr || bugunSana() }) };
}
