/**
 * Smeta yuklash: «Ko'rib chiqish» bosqichi uchun sof yordamchilar (UI yo'q, yangi formula yo'q).
 * Pul hisobi faqat `lib/hisob-yadro` orqali (yigindi2, qqsBilan); bu yerda faqat o'qiladi va solishtiriladi.
 */
import { qqsBilan, yigindi2 } from '../../../lib/hisob-yadro';
import { jamiQatorlarYigindisi } from '../../../lib/nakrutka-smetadan';
import { t } from '../../../i18n/til';

export type KorinishTugun = { type: string; kod?: string; nom?: string; summa?: number; children?: KorinishTugun[] };

/** `nakrutkaPodvaliniOqi` natijasidan faqat kerakli qism. */
export type PodvalOqishQisqa = {
  holat: 'topildi' | 'qisman' | 'topilmadi' | string;
  koeffitsientlar: Record<string, number | undefined>;
  qatorlar: ReadonlyArray<{ kod: string; summa: number | null; masshtab: number }>;
};

export type OldindanKorinish = {
  /** Resurslar yig'indisi, ustamasiz va QQS siz. null — birorta ham resursda summa yo'q (0 emas!). */
  resursSumma: number | null;
  /** Shu yig'indi QQS bilan (fayl podvalidagi foiz, bo'lmasa 12). */
  resursQqsBilan: number | null;
  qqsFoiz: number;
  qqsFaylda: boolean;
  /** Faylning o'z «ВСЕГО С НДС» (ustamali, QQS bilan). null — faylda yo'q. */
  faylVsego: number | null;
  /** Faylning o'z «ПРЯМЫЕ ЗАТРАТЫ» (ustamasiz). */
  faylPryamye: number | null;
  /** tizim ustamasiz − fayl pryamye (ikkalasi bor bo'lsa). */
  farqPryamye: number | null;
  podval: 'topildi' | 'qisman' | 'topilmadi';
  podvalFoizSoni: number;
  /** Shifri (kodi) yo'q ish qatorlari soni. */
  kodsizIsh: number;
  /** Tizim resurs yig‘indisi ↔ faylning «прямые затраты» (transport/ombor qatorlari ustama sifatida alohida — hisobga olinadi). */
  pryamyeFarq: PryamyeFarq | null;
};

export type PryamyeFarq = {
  farq: number;
  /** |farq| / fayl «прямые», foizda. */
  foiz: number;
  /** mos ≤ 0,5 %; ogoh 0,5–2 % (sariq); tasdiq > 2 % (importdan oldin tasdiq so‘raladi). */
  daraja: 'mos' | 'ogoh' | 'tasdiq';
  faylPryamye: number;
  /** Faylning «прямые» tarkibiga kirgan va tizimda ustama (nakrutka) sifatida alohida hisoblanadigan transport/ombor qatorlari. */
  transportKodlari: string[];
};

const TRANSPORT_KODLARI = ['tr_mat', 'tr_kab', 'tr_ob', 'skl_mat', 'skl_mk', 'zag_ob'];

/**
 * Fayl «прямые» tarkibida RES dagi transport/ombor xarajatlari ham bo‘lishi mumkin (materiallar + transport).
 * Tizimda ular ustama kaskadida alohida hisoblanadi, shuning uchun resurslar yig‘indisi bilan solishtirishda ular chiqarib tashlanadi.
 * Qaysi transport qatorlari «прямые» ga kirgani faylda yozilmagan — eng kichik farq beradigan to‘plam tanlanadi (taxmin emas, tekshiruv).
 */
export function pryamyeTaqqos(resursSumma: number | null, oqish: PodvalOqishQisqa | null): PryamyeFarq | null {
  const pryamye = yigish(oqish, 'pryamye');
  if (resursSumma == null || pryamye == null || pryamye <= 0) return null;
  const tr = (oqish?.qatorlar ?? []).filter((x) => TRANSPORT_KODLARI.includes(x.kod) && x.summa != null && x.summa > 0).slice(0, 8);
  let eng = { farq: yigindi2([resursSumma, -pryamye]), kodlar: [] as string[] };
  for (let mask = 1; mask < (1 << tr.length); mask++) {
    const tanlangan = tr.filter((_, i) => mask & (1 << i));
    const s = yigindi2(tanlangan.map((x) => x.summa as number));
    const farq = yigindi2([resursSumma, -pryamye, s]);
    if (Math.abs(farq) < Math.abs(eng.farq) - 0.005) eng = { farq, kodlar: tanlangan.map((x) => x.kod) };
  }
  const foiz = Math.abs(eng.farq) / pryamye * 100;
  return { farq: eng.farq, foiz, daraja: foiz > 2 ? 'tasdiq' : foiz > 0.5 ? 'ogoh' : 'mos', faylPryamye: pryamye, transportKodlari: eng.kodlar };
}

const yigish = (oqish: PodvalOqishQisqa | null, kod: string): number | null => {
  const q = (oqish?.qatorlar ?? []).filter((x) => x.kod === kod && x.summa != null);
  if (!q.length) return null;
  return yigindi2([jamiQatorlarYigindisi(q.map((x) => (x.summa as number) * x.masshtab))]);
};

export function oldindanKorinish(tree: readonly KorinishTugun[], oqish: PodvalOqishQisqa | null): OldindanKorinish {
  const summalar: number[] = [];
  let kodsizIsh = 0;
  const yur = (n: KorinishTugun) => {
    if (n.children?.length) { n.children.forEach(yur); if (n.type === 'bl' && !(n.kod ?? '').trim()) kodsizIsh++; return; }
    if (n.type === 'bl' && !(n.kod ?? '').trim()) kodsizIsh++;
    if ((n.type === 'rs' || n.type === 'mat' || n.type === 'ob') && typeof n.summa === 'number' && Number.isFinite(n.summa) && n.summa !== 0) summalar.push(n.summa);
  };
  tree.forEach(yur);
  const resursSumma = summalar.length ? yigindi2(summalar) : null;
  const faylFoiz = oqish?.koeffitsientlar?.['НДС'];
  const qqsFaylda = typeof faylFoiz === 'number' && faylFoiz > 0;
  const qqsFoiz = qqsFaylda ? (faylFoiz as number) : 12;
  const faylPryamye = yigish(oqish, 'pryamye');
  const holat = oqish?.holat;
  return {
    resursSumma,
    resursQqsBilan: resursSumma == null ? null : qqsBilan(resursSumma, qqsFoiz),
    qqsFoiz, qqsFaylda,
    faylVsego: yigish(oqish, 'vsego'),
    faylPryamye,
    farqPryamye: resursSumma != null && faylPryamye != null ? yigindi2([resursSumma, -faylPryamye]) : null,
    pryamyeFarq: pryamyeTaqqos(resursSumma, oqish),
    podval: holat === 'topildi' || holat === 'qisman' ? holat : 'topilmadi',
    podvalFoizSoni: Object.keys(oqish?.koeffitsientlar ?? {}).length,
    kodsizIsh,
  };
}

/** Tarmoq/server xato kodlarini oddiy o'zbekchaga o'giradi (texnik so'z yo'q). `qadam` — qaysi bosqichda yiqilgani. */
export function importXatoMatni(kod: string | undefined, xato?: string, qadam?: string): string {
  const q = qadam ? `${qadam}: ` : '';
  switch (kod) {
    case 'NETWORK': return q + t('Internet aloqasi uzildi. Aloqani tekshirib, qayta urinib ko‘ring — yuborilgan qismlar saqlangan.');
    case 'BAD_RESPONSE': return q + t('Server javob bermadi. Birozdan keyin qayta urinib ko‘ring.');
    case 'AUTH_REQUIRED': return q + t('Sessiya tugagan. Sahifani yangilab, qaytadan kiring.');
    case 'SMETA_ALREADY_EXISTS': return q + t('Bu obyektda smeta allaqachon bor — ustidan yozilmaydi. Yangi fayl versiya sifatida saqlanadi.');
    case 'TOO_MANY_ROWS': return q + t('Fayl juda katta: qatorlar soni chegaradan oshdi. Faylni bo‘lib (uchastkalar bo‘yicha) yuklang.');
    case 'MISSING_ROWS': case 'MISSING_TREE': return q + t('Fayldan bironta ham qator o‘qilmadi. Varaq turini tekshiring.');
    case 'BAD_CHUNK_SIZE': return q + t('Qatorlar bo‘lagi juda katta. Sahifani yangilab, qayta urinib ko‘ring.');
    default: return q + (xato && !/[A-Z_]{4,}/.test(xato) ? xato : t('Kutilmagan xato. Qayta urinib ko‘ring; takrorlansa, fayl nomini yozib qo‘llab-quvvatlashga yuboring.'));
  }
}

/** Fayl tanlanganda o'qib bo'lmagan sabab — «Fayl o'qilmadi» umumiy matni o'rniga. */
export function faylOqishXatosi(e: unknown, maxMb: number): string {
  const m = e instanceof Error ? e.message : '';
  if (/dan katta/.test(m)) return t('Fayl juda katta ({mb} MB dan oshiq). Uni uchastkalar bo‘yicha bo‘lib yuklang.', { mb: maxMb });
  if (/XLSX_NOT_A_ZIP|End-of-central-directory|not a zip/i.test(m)) return t('Bu haqiqiy Excel fayli emas yoki Excel uni hali band qilgan. Faylni yopib, asosiy .xlsx faylni tanlang.');
  if (/password|encrypt|parol/i.test(m)) return t('Fayl parol bilan himoyalangan. Parolni olib tashlab, qayta saqlang.');
  return t('Fayl o‘qilmadi. Uni Excelda ochib, yangi .xlsx sifatida saqlang va qayta tanlang.');
}
