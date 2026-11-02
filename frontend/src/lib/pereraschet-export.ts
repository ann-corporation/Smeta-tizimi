import { qqsBilan, qqsFormulasi, qqsSumma } from './hisob-yadro';
/**
 * «ПЕРЕРАСЧЁТ — <объект>» rasmiy hujjati (egasi 2026-10-25): buyurtmachi bilan pereraschet asosi.
 * Hujjat standarti H1–H9 (RasmiyVaraq): narx NDS SIZ, summalar formulada (to'g'ri xarajat), ustamali (obyekt kaskadi)
 * qiymati alohida qatorda, NDS faqat OXIRIDA bir marta. Tekshirish kerak qatorlar pulga KIRMAYDI — «требуют проверки»
 * ro'yxatida sababi bilan. Hisob — `lib/pereraschet.ts`; bu yerda faqat yozish.
 */
import {
  RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, sumRefs,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import type { BandTur, PNatija, PNatijaQator, TekshirSabab } from './pereraschet';
import type { BoglanmaganSabab, FNatija, FPozitsiya, FaktTekshirSabab } from './pereraschet-fakt';

export const PERERASCHET_BAND_RU: Record<BandTur, string> = {
  ortiqcha: 'Излишне предъявлено (Ф-2 > сметы)',
  narx_farqi: 'Разница в цене (Ф-2 к смете)',
  olinmagan: 'Не предъявлено (выполнено по факту)',
  chegirma: 'Исключение (вычет) — пропорционально основной работе',
};
export const PERERASCHET_TEKSHIR_RU: Record<TekshirSabab, string> = {
  birlik_shubha: 'сомнение в единице измерения (соотношение объёмов/цен более чем в 5 раз)',
  smeta_hajm_yoq: 'в смете объём не указан или равен 0',
  narx_yoq: 'в смете нет цены',
  chegirma_asosiy_yoq: 'строка исключения (отрицательный объём) — основная работа не найдена',
  eski_smeta: 'строка раздела «до экспертизы» — не закрыта корректировкой',
  zamena: 'пара замены (исходная/заменяющая позиция)',
  f2_hajmsiz_summa: 'нулевой итоговый объём Ф-2 при ненулевой подтверждённой сумме — требуется проверка актов',
  f2_summa_yoq: 'сумма Ф-2 неизвестна — разница в цене не рассчитана',
};

export type PereraschetOpsiya = {
  obyektNomi: string;
  /** Filtr (uchastka/razdel) nomi — titulda. */
  bolimNomi?: string | null;
  sana?: string;
  imzo?: ImzoNomlar;
  /** QQS stavkasi, % (null — qo'shilmaydi). */
  ndsFoiz: number | null;
  /** Ustamali (ИТОГО-4, NDS siz) qiymatlar: kategoriya kaskadi bo'yicha; null — hisoblanmadi. */
  ustamali: { plus: number; minus: number } | null;
};

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Шифр', kenglik: 13, tur: 'kod' },
  { sarlavha: 'Наименование', kenglik: 44, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'по смете', kenglik: 12, tur: 'hajm', guruh: 'ОБЪЁМ' },
  { sarlavha: 'по факту', kenglik: 12, tur: 'hajm', guruh: 'ОБЪЁМ' },
  { sarlavha: 'предъявлено Ф-2', kenglik: 12, tur: 'hajm', guruh: 'ОБЪЁМ' },
  { sarlavha: 'цена по смете', kenglik: 14, tur: 'narx', guruh: 'БЕЗ НДС' },
  { sarlavha: 'сумма Ф-2', kenglik: 16, tur: 'pul', guruh: 'БЕЗ НДС' },
  { sarlavha: 'Основание перерасчёта', kenglik: 26, tur: 'matn' },
  { sarlavha: 'объём к перерасчёту', kenglik: 12, tur: 'hajm' },
  { sarlavha: 'к получению (+)', kenglik: 16, tur: 'pul', guruh: 'СУММА ПЕРЕРАСЧЁТА' },
  { sarlavha: 'к возврату (−)', kenglik: 16, tur: 'pul', guruh: 'СУММА ПЕРЕРАСЧЁТА' },
];
// Ustun harflari: E smeta, F fakt, G F2, H narx, I F2 summa, K hajm, L plus, M minus.

const q = (x: number | null | undefined): Qiymat => (x == null ? null : x);

function qatorYoz(v: RasmiyVaraq, p: PNatijaQator, no: () => number, plusQ: number[], minusQ: number[]): void {
  for (const b of p.bandlar) {
    const r = v.qator('oddiy', (n) => {
      let plus: Qiymat = null; let minus: Qiymat = null;
      if (b.tur === 'chegirma') { if (b.summa > 0) plus = { f: `ROUND(K${n}*H${n},2)`, v: b.summa }; else minus = { f: `ROUND(-K${n}*H${n},2)`, v: -b.summa }; }
      else if (b.tur === 'ortiqcha') minus = { f: `ROUND(K${n}*H${n},2)`, v: -b.summa };
      else if (b.tur === 'olinmagan') plus = { f: `ROUND(K${n}*H${n},2)`, v: b.summa };
      else if (b.summa > 0) plus = { f: `ROUND(G${n}*H${n}-I${n},2)`, v: b.summa };
      else minus = { f: `ROUND(I${n}-G${n}*H${n},2)`, v: -b.summa };
      const hajm: Qiymat = b.tur === 'ortiqcha' ? { f: `ROUND(G${n}-E${n},6)`, v: -b.hajm }
        : b.tur === 'olinmagan' || b.tur === 'chegirma' ? b.hajm : null;
      const ch = b.tur === 'chegirma' && p.chegirma?.asosiy
        ? `основная работа ${p.chegirma.asosiy.kod ?? ''} предъявлена на ${(Math.min(1, Math.max(0, p.chegirma.asosiy.ulush)) * 100).toFixed(1)}%, исключение применено на ${(p.chegirma.y * 100).toFixed(1)}%` : '';
      const izoh = [PERERASCHET_BAND_RU[b.tur], ch,p.eslatma.includes('fakt_norma') && b.tur === 'olinmagan' ? 'факт по норме работы' : '',
        p.almashtirilgan > 0 ? `заменено ${p.almashtirilgan}` : ''].filter(Boolean).join('; ');
      return [no(), p.kod, p.nom, p.birlik, q(p.smetaHajm), q(p.faktHajm), q(p.f2Hajm), q(p.smetaNarx), q(p.f2Summa), izoh, hajm, plus, minus];
    });
    if (b.summa > 0) plusQ.push(r); else minusQ.push(r);
  }
}

export function pereraschetXlsx(n: PNatija, o: PereraschetOpsiya): { bytes: Uint8Array; faylNomi: string; yacheykalar: number } {
  const sana = o.sana ?? bugunSana();
  const v = new RasmiyVaraq({
    nom: 'Перерасчёт',
    sarlavha: 'ВЕДОМОСТЬ ПЕРЕРАСЧЁТА ВЫПОЛНЕННЫХ РАБОТ',
    ostSarlavha: [`по состоянию на ${sana.split('-').reverse().join('.')} (накопительно, по утверждённым Ф-2)`],
    titul: [
      ['Объект:', o.obyektNomi],
      ...(o.bolimNomi ? [['Раздел:', o.bolimNomi] as const] : []),
      ['Подрядчик:', o.imzo?.pudratchi],
      ['Заказчик:', o.imzo?.zakazchik],
    ],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
    muzlatUstun: 3,
  });
  let no = 0;
  const raqam = () => ++no;
  const plusQ: number[] = []; const minusQ: number[] = [];
  // Razdel bo'yicha guruhlab (razdel ichida summa kamayish tartibida — hisobda allaqachon saralangan).
  const guruh = new Map<string, PNatijaQator[]>();
  for (const p of n.hisobda) {
    const k = p.bolimYol.join(' › ') || 'Без раздела';
    const a = guruh.get(k); if (a) a.push(p); else guruh.set(k, [p]);
  }
  const guruhlar = [...guruh.entries()].sort((a, b) => Math.abs(b[1].reduce((s, x) => s + x.sof, 0)) - Math.abs(a[1].reduce((s, x) => s + x.sof, 0)));
  const bolimJamiP: number[] = []; const bolimJamiM: number[] = [];
  for (const [nom, qs] of guruhlar) {
    v.bolim(nom);
    const bp: number[] = []; const bm: number[] = [];
    for (const p of qs) qatorYoz(v, p, raqam, bp, bm);
    plusQ.push(...bp); minusQ.push(...bm);
    const r = v.qator('jami', [null, null, 'Итого по разделу', null, null, null, null, null, null, null, null,
      { f: sumRefs('L', bp), v: qs.reduce((s, x) => s + x.bandlar.filter((b) => b.summa > 0).reduce((t, b) => t + b.summa, 0), 0) },
      { f: sumRefs('M', bm), v: qs.reduce((s, x) => s + x.bandlar.filter((b) => b.summa < 0).reduce((t, b) => t - b.summa, 0), 0) }]);
    bolimJamiP.push(r); bolimJamiM.push(r);
  }
  const tL = v.qator('vsego', [null, null, 'ИТОГО прямые затраты (без НДС)', null, null, null, null, null, null, null, null,
    { f: sumRefs('L', bolimJamiP), v: n.jami.plus }, { f: sumRefs('M', bolimJamiM), v: n.jami.minus }]);
  const saldo = v.qator('vsego', [null, null, 'Сальдо перерасчёта (прямые затраты): + к получению / − к возврату', null, null, null, null, null, null, null, null,
    { f: `L${tL}-M${tL}`, v: n.jami.sof }, null]);
  let asos = saldo;
  if (o.ustamali) {
    const u = v.qator('jami', [null, null, 'ИТОГО с начислениями по объекту (накладные, транспорт, прочие — без НДС)', null, null, null, null, null, null, null, null,
      o.ustamali.plus, o.ustamali.minus]);
    asos = v.qator('vsego', [null, null, 'Сальдо с начислениями (без НДС)', null, null, null, null, null, null, null, null,
      { f: `L${u}-M${u}`, v: o.ustamali.plus - o.ustamali.minus }, null]);
  }
  const asosQiymat = o.ustamali ? o.ustamali.plus - o.ustamali.minus : n.jami.sof;
  if (o.ndsFoiz != null) {
    const nds = v.qator('jami', [null, null, `НДС ${o.ndsFoiz}%`, null, null, null, null, null, null, null, null,
      { f: qqsFormulasi(`L${asos}`, o.ndsFoiz), v: qqsSumma(asosQiymat, o.ndsFoiz) }, null]);
    v.qator('vsego', [null, null, 'ВСЕГО ПО ПЕРЕРАСЧЁТУ С НДС', null, null, null, null, null, null, null, null,
      { f: `L${asos}+L${nds}`, v: qqsBilan(asosQiymat, o.ndsFoiz) }, null]);
  }
  v.filtrOxiri(tL);
  v.bosh();
  v.izoh('Перерасчёт выполнен по смете объекта и утверждённым актам Ф-2 (с учётом корректировочных актов). Излишне предъявлено = (объём Ф-2 − объём сметы) × цена сметы; разница в цене = сумма Ф-2 − объём Ф-2 × цена сметы; не предъявлено = (min(факт, смета) − объём Ф-2) × цена сметы. Цены — без НДС; НДС начислен один раз в конце.');
  if (!o.ustamali) v.izoh('Начисления по объекту (коэффициенты) не прочитаны — НДС начислен на прямые затраты.');
  if (n.faktNormaPlus > 0) v.izoh(`В т.ч. «не предъявлено» по факту, рассчитанному по норме работы (не по отдельному факту ресурса): ${n.faktNormaPlus.toFixed(2)}.`);
  const tashqari = n.hisobda.filter((p) => p.tashqariHajm > 0);
  if (tashqari.length) v.izoh(`Факт сверх сметы (${tashqari.length} поз.) в перерасчёт не включён — требуется дополнительное соглашение.`);
  v.diqqat(n.tekshirish.map((p) => ({
    nom: `${p.kod ? `${p.kod} ` : ''}${p.nom}${p.birlik ? `, ${p.birlik}` : ''}`,
    joy: p.bolimYol.join(' › ') || undefined,
    sabab: `${p.tekshir.map((s) => PERERASCHET_TEKSHIR_RU[s]).join('; ')}${p.sof ? ` (ориентировочно ${p.sof.toFixed(2)}, в итог не включено)` : ''}`,
  })), 'ПОЗИЦИИ, ТРЕБУЮЩИЕ ПРОВЕРКИ (в итог не включены)');
  v.imzo(imzoTomonlari(['ПОДРЯДЧИК', 'ЗАКАЗЧИК', 'СОСТАВИЛ'], o.imzo));
  const k = rasmiyKitob([v]);
  return { bytes: k.bytes, yacheykalar: k.yacheykalar, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'ПЕРЕРАСЧЁТ', davr: sana }) };
}

// ───────────────────────── FAKT ASOSIDAGI PERERASCHET (egasi 2026-10-26) ─────────────────────────
// Bitta kitob, ikki varaq (natija bir xil): (a) «Сторно и повтор» — ранее предъявленное полностью сторнируется и
// предъявляется заново по факту; (b) «Разница» — по позиции только разница. Ustamali — obyekt kaskadi (alohida qator),
// NDS faqat oxirida bir marta. Tekshirish qatorlari pulga KIRMAYDI.

export const FAKT_BOGLANMAGAN_RU: Record<BoglanmaganSabab, string> = {
  eski_smeta: 'раздел «до экспертизы»',
  smeta_hajm_yoq: 'в смете нет объёма',
  qoshimcha_narxsiz: 'позиция добавлена при импорте Ф-2 (нет в смете, без цены)',
};
export const FAKT_TEKSHIR_RU: Record<FaktTekshirSabab, string> = {
  narx_yoq: 'в смете нет цены',
  f2_summa_nomalum: 'сумма в Ф-2 не указана',
  chegirma: 'строка исключения (отрицательный объём) — см. перерасчёт «Ф-2 к смете»',
};

export type PereraschetFaktOpsiya = Omit<PereraschetOpsiya, 'ustamali'> & {
  /** Ustamali (ИТОГО-4, NDS siz): storno formati uchun kerak/olingan, farq formati uchun plus/minus. */
  ustamali: { kerak: number; olingan: number; plus: number; minus: number } | null;
};

const FAKT_TITUL = (o: PereraschetFaktOpsiya) => [
  ['Объект:', o.obyektNomi] as const,
  ...(o.bolimNomi ? [['Раздел:', o.bolimNomi] as const] : []),
  ['Подрядчик:', o.imzo?.pudratchi] as const,
  ['Заказчик:', o.imzo?.zakazchik] as const,
];

/** Ustamali, saldo va NDS dumi (pul ustunlari: `pL` — asosiy/saldo ustuni). */
/**
 * Ustamali, saldo va NDS dumi. `pL` — saldo ustuni; `pB` — ikkinchi pul ustuni (farq varag'ida «к возврату»).
 * Ustamali: `a` − `b` (storno varag'ida a = kerak, b = olingan — ikkalasi bir ustunda: a qatori va b qatori).
 */
function faktDum(v: RasmiyVaraq, nUst: number, saldo: number, sof: number, ust: { a: number; b: number } | null, pL: string, pB: string | null, ndsFoiz: number | null): void {
  const L = pL.charCodeAt(0) - 65; const B = pB ? pB.charCodeAt(0) - 65 : -1;
  const yoz = (tur: 'jami' | 'vsego', nom: string, l: Qiymat, b: Qiymat = null) => { const r: Qiymat[] = Array(nUst).fill(null); r[2] = nom; r[L] = l; if (B >= 0) r[B] = b; return v.qator(tur, r); };
  let asos = saldo; let asosQ = sof;
  if (ust) {
    const uq = ust.a - ust.b;
    if (B >= 0) {
      const u = yoz('jami', 'ИТОГО с начислениями по объекту (накладные, транспорт, прочие — без НДС)', ust.a, ust.b);
      asos = yoz('vsego', 'Сальдо с начислениями (без НДС): + к получению / − к возврату', { f: `${pL}${u}-${pB}${u}`, v: uq });
    } else {
      const ua = yoz('jami', 'Предъявляется по факту с начислениями (без НДС)', ust.a);
      const ub = yoz('jami', 'Сторно ранее предъявленного с начислениями (без НДС)', -ust.b);
      asos = yoz('vsego', 'Сальдо с начислениями (без НДС): + к получению / − к возврату', { f: `${pL}${ua}+${pL}${ub}`, v: uq });
    }
    asosQ = uq;
  }
  if (ndsFoiz != null) {
    const nq = qqsSumma(asosQ, ndsFoiz);
    const nds = yoz('jami', `НДС ${ndsFoiz}%`, { f: qqsFormulasi(`${pL}${asos}`, ndsFoiz), v: nq });
    yoz('vsego', 'ВСЕГО ПО ПЕРЕРАСЧЁТУ С НДС', { f: `${pL}${asos}+${pL}${nds}`, v: qqsBilan(asosQ, ndsFoiz) });
  }
}

const nomli = (p: FPozitsiya) => `${p.kod ? `${p.kod} ` : ''}${p.nom}${p.birlik ? `, ${p.birlik}` : ''}`;
const guruhla = (ps: readonly FPozitsiya[]) => {
  const g = new Map<string, FPozitsiya[]>();
  for (const p of ps) { const k = p.bolimYol.join(' › ') || 'Без раздела'; const a = g.get(k); if (a) a.push(p); else g.set(k, [p]); }
  return [...g.entries()];
};

const STORNO_USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Шифр', kenglik: 13, tur: 'kod' },
  { sarlavha: 'Наименование', kenglik: 42, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'по смете', kenglik: 12, tur: 'hajm', guruh: 'ОБЪЁМ' },
  { sarlavha: 'по факту (в расчёт)', kenglik: 12, tur: 'hajm', guruh: 'ОБЪЁМ' },
  { sarlavha: 'предъявлено Ф-2', kenglik: 12, tur: 'hajm', guruh: 'ОБЪЁМ' },
  { sarlavha: 'цена по смете (без НДС)', kenglik: 14, tur: 'narx' },
  { sarlavha: 'Примечание', kenglik: 24, tur: 'matn' },
  { sarlavha: 'объём', kenglik: 12, tur: 'hajm', guruh: 'СТОРНО РАНЕЕ ПРЕДЪЯВЛЕННОГО' },
  { sarlavha: 'сумма', kenglik: 16, tur: 'pul', guruh: 'СТОРНО РАНЕЕ ПРЕДЪЯВЛЕННОГО' },
  { sarlavha: 'объём', kenglik: 12, tur: 'hajm', guruh: 'ПРЕДЪЯВЛЯЕТСЯ ПО ФАКТУ' },
  { sarlavha: 'сумма', kenglik: 16, tur: 'pul', guruh: 'ПРЕДЪЯВЛЯЕТСЯ ПО ФАКТУ' },
  { sarlavha: 'разница', kenglik: 16, tur: 'pul' },
];
// Harflar: E smeta, F fakt, G F2 hajm, H narx, I izoh, J storno hajm, K storno summa, L fakt hajm, M fakt summa, N farq.

function stornoVaraq(n: FNatija, o: PereraschetFaktOpsiya, sana: string): RasmiyVaraq {
  const v = new RasmiyVaraq({
    nom: 'Сторно и повтор', sarlavha: 'ВЕДОМОСТЬ ПЕРЕРАСЧЁТА ПО ФАКТИЧЕСКИМ ОБЪЁМАМ',
    ostSarlavha: [`по состоянию на ${sana.split('-').reverse().join('.')}: сторно всех утверждённых Ф-2 и предъявление по факту`],
    titul: FAKT_TITUL(o), ustunlar: STORNO_USTUNLAR, yonalish: 'landscape', muzlatUstun: 3,
  });
  let no = 0;
  const jamiQ: number[] = [];
  const qatorYozS = (p: FPozitsiya) => v.qator('oddiy', (r) => {
    const fakt: Qiymat = p.boglangan && p.smetaNarx != null && p.hisobFakt > 0 ? { f: `ROUND(L${r}*H${r},2)`, v: p.kerak } : p.boglangan ? 0 : null;
    const izoh = [p.boglangan ? '' : `не привязано к смете: ${FAKT_BOGLANMAGAN_RU[p.boglanmaganSabab!]}`,
      p.eslatma.includes('smetadan_tashqari') ? `факт сверх сметы ${p.tashqariHajm} — не включён (нужно доп. соглашение)` : '',
      p.eslatma.includes('fakt_norma') ? 'факт по норме работы' : '',
      p.almashtirilgan > 0 ? `заменено ${p.almashtirilgan}` : ''].filter(Boolean).join('; ');
    return [++no, p.kod, p.nom, p.birlik, q(p.smetaHajm), p.boglangan ? p.hisobFakt : null, p.f2Hajm, q(p.smetaNarx), izoh,
      { f: `-G${r}`, v: -p.f2Hajm }, -p.f2Summa, p.boglangan ? p.hisobFakt : null, fakt, { f: `M${r}+K${r}`, v: p.farq }];
  });
  const bolak = (sarlavha: string, ps: readonly FPozitsiya[]) => {
    if (!ps.length) return;
    v.bolim(sarlavha);
    const ichki: number[] = [];
    for (const [nom, qs] of guruhla(ps)) {
      v.bolim(nom, { daraja: 1 });
      const rs = qs.map(qatorYozS);
      ichki.push(v.qator('jami', [null, null, 'Итого по разделу', null, null, null, null, null, null, null,
        { f: sumRefs('K', rs), v: -qs.reduce((s, x) => s + x.f2Summa, 0) }, null,
        { f: sumRefs('M', rs), v: qs.reduce((s, x) => s + x.kerak, 0) },
        { f: sumRefs('N', rs), v: qs.reduce((s, x) => s + x.farq, 0) }]));
    }
    jamiQ.push(...ichki);
  };
  const boglangan = n.hisobda.filter((p) => p.boglangan);
  bolak('1. ПОЗИЦИИ СМЕТЫ: сторно предъявленного и предъявление по факту', boglangan);
  bolak('2. ПРЕДЪЯВЛЕНО ВНЕ СМЕТЫ (позиция не привязана к смете) — сторно полностью', n.boglanmagan);
  const t = v.qator('vsego', [null, null, 'ИТОГО прямые затраты (без НДС)', null, null, null, null, null, null, null,
    { f: sumRefs('K', jamiQ), v: -n.jami.olingan }, null, { f: sumRefs('M', jamiQ), v: n.jami.kerak }, { f: sumRefs('N', jamiQ), v: n.jami.sof }]);
  const saldo = v.qator('vsego', [null, null, 'Сальдо перерасчёта (прямые затраты): + к получению / − к возврату', null, null, null, null, null, null, null, null, null, null,
    { f: `M${t}+K${t}`, v: n.jami.sof }]);
  faktDum(v, STORNO_USTUNLAR.length, saldo, n.jami.sof, o.ustamali ? { a: o.ustamali.kerak, b: o.ustamali.olingan } : null, 'N', null, o.ndsFoiz);
  v.filtrOxiri(t);
  return v;
}

function farqVaraq(n: FNatija, o: PereraschetFaktOpsiya, sana: string): RasmiyVaraq {
  const v = new RasmiyVaraq({
    nom: 'Разница', sarlavha: 'ВЕДОМОСТЬ ПЕРЕРАСЧЁТА ПО ФАКТИЧЕСКИМ ОБЪЁМАМ (РАЗНИЦА)',
    ostSarlavha: [`по состоянию на ${sana.split('-').reverse().join('.')}: положено по факту − предъявлено по Ф-2`],
    titul: FAKT_TITUL(o), ustunlar: USTUNLAR, yonalish: 'landscape', muzlatUstun: 3,
  });
  let no = 0;
  const bolimQ: number[] = [];
  const ps = n.hisobda.filter((p) => Math.abs(p.farq) >= 0.005);
  for (const [nom, qs] of guruhla(ps)) {
    v.bolim(nom);
    const rs = qs.map((p) => v.qator('oddiy', (r) => {
      const fx = p.boglangan && p.smetaNarx != null ? `F${r}*H${r}` : '0';
      const plus: Qiymat = p.farq > 0 ? { f: `ROUND(${fx}-I${r},2)`, v: p.farq } : null;
      const minus: Qiymat = p.farq < 0 ? { f: `ROUND(I${r}-${fx},2)`, v: -p.farq } : null;
      const izoh = p.boglangan ? `положено по факту ${p.kerak.toFixed(2)}` : `не привязано к смете (${FAKT_BOGLANMAGAN_RU[p.boglanmaganSabab!]}) — сторно полностью`;
      return [++no, p.kod, p.nom, p.birlik, q(p.smetaHajm), p.boglangan ? p.hisobFakt : 0, p.f2Hajm, q(p.smetaNarx), p.f2Summa, izoh,
        { f: `ROUND(F${r}-G${r},6)`, v: (p.boglangan ? p.hisobFakt : 0) - p.f2Hajm }, plus, minus];
    }));
    bolimQ.push(v.qator('jami', [null, null, 'Итого по разделу', null, null, null, null, null, null, null, null,
      { f: sumRefs('L', rs), v: qs.reduce((s, x) => s + Math.max(0, x.farq), 0) },
      { f: sumRefs('M', rs), v: qs.reduce((s, x) => s + Math.max(0, -x.farq), 0) }]));
  }
  const t = v.qator('vsego', [null, null, 'ИТОГО прямые затраты (без НДС)', null, null, null, null, null, null, null, null,
    { f: sumRefs('L', bolimQ), v: n.jami.plus }, { f: sumRefs('M', bolimQ), v: n.jami.minus }]);
  const saldo = v.qator('vsego', [null, null, 'Сальдо перерасчёта (прямые затраты): + к получению / − к возврату', null, null, null, null, null, null, null, null,
    { f: `L${t}-M${t}`, v: n.jami.sof }, null]);
  faktDum(v, USTUNLAR.length, saldo, n.jami.sof, o.ustamali ? { a: o.ustamali.plus, b: o.ustamali.minus } : null, 'L', 'M', o.ndsFoiz);
  v.filtrOxiri(t);
  return v;
}

export function pereraschetFaktXlsx(n: FNatija, o: PereraschetFaktOpsiya): { bytes: Uint8Array; faylNomi: string; yacheykalar: number } {
  const sana = o.sana ?? bugunSana();
  const a = stornoVaraq(n, o, sana);
  const b = farqVaraq(n, o, sana);
  for (const v of [a, b]) {
    v.bosh();
    v.izoh('Перерасчёт по фактическим объёмам: положено = min(факт, объём сметы − заменено) × цена сметы; предъявлено = сумма всех утверждённых Ф-2 (с учётом корректировочных актов). Позиции, не привязанные к смете, сторнируются полностью. Итог листов «Сторно и повтор» и «Разница» одинаков. Цены — без НДС; НДС начислен один раз в конце.');
    if (!o.ustamali) v.izoh('Начисления по объекту (коэффициенты) не прочитаны — НДС начислен на прямые затраты.');
    const tashqari = n.hisobda.filter((p) => p.tashqariHajm > 0);
    if (tashqari.length) v.izoh(`Факт сверх сметы (${tashqari.length} поз.) в перерасчёт не включён — требуется дополнительное соглашение.`);
    v.diqqat(n.tekshirish.map((p) => ({
      nom: nomli(p), joy: p.bolimYol.join(' › ') || undefined,
      sabab: `${p.tekshir.map((s) => FAKT_TEKSHIR_RU[s]).join('; ')}${p.f2Summa ? ` (предъявлено ${p.f2Summa.toFixed(2)}, в итог не включено)` : ''}`,
    })), 'ПОЗИЦИИ, ТРЕБУЮЩИЕ ПРОВЕРКИ (в итог не включены)');
    v.imzo(imzoTomonlari(['ПОДРЯДЧИК', 'ЗАКАЗЧИК', 'СОСТАВИЛ'], o.imzo));
  }
  const k = rasmiyKitob([a, b]);
  return { bytes: k.bytes, yacheykalar: k.yacheykalar, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'ПЕРЕРАСЧЁТ ПО ФАКТУ', davr: sana }) };
}