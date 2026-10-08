/**
 * resurs-vedomost.ts — T2-PTO-CLOSURE-007 (Claude lane).
 * ═══════════════════════════════════════════════════════════════════
 *
 * Egasining so'rovi: butun smeta va F2'dan har bir KATEGORIYA
 * (ЧЕЛ/МАШ/МАТ/ОБ/КАБ/М-К) resurslarining yig'ma vedomosti — hozirgi
 * Forma-2/Nakopitelniy hujjatlarida bunday kesim yo'q edi.
 *
 * Manba — `t2_qator_holat` (allaqachon to'g'ri, bu sessiyada tuzatilgan:
 * F2 ustunlari `certified_quantity`/`certified_amount`ni ustun qo'yadi).
 * Bu yerda YANGI HISOB-KITOB YO'Q — faqat mavjud, allaqachon to'g'ri
 * qator-darajasidagi haqiqatni resurs+kategoriya bo'yicha JAMLAYDI.
 * Ikkinchi haqiqat manbai emas: har bir jamlangan raqam to'g'ridan-to'g'ri
 * `t2_qator_holat` qatorlaridan sum() qilingan.
 *
 * Faqat resurs BARGLARI jamlanadi (`tur` in rs/mat/ob) — `rz` (razdel)
 * va `bl` (ish) qatorlari o'tkazib yuboriladi, aks holda ish narxi
 * resurs narxi bilan ikki marta hisoblangan bo'lardi.
 */
import type { T2QatorHolat } from '../api/supabase';
import { RasmiyVaraq, bugunSana, sumRefs, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, type ImzoNomlar } from './hujjat-yozuvchi';

export type ResursVedomostQator = {
  kat: string;
  kod: string | null;
  nom: string;
  birlik: string | null;
  smetaHajm: number;
  smetaSumma: number;
  f2Hajm: number;
  /** NULL = at least one certified F2 amount is unknown (price intentionally absent) — never 0. */
  f2Summa: number | null;
  qoldiqHajm: number;
  qoldiqSumma: number | null;
  /** Nechta smeta qatorida shu resurs ishlatilgan (bir xil nom/birlik/kat kelib qo'shilgan). */
  qatorSoni: number;
};

const RESURS_TUR = new Set(['rs', 'mat', 'ob']);

/**
 * Owner (2026-09-08): "resurs vedemostda birinchi chel chas, keyin mash
 * chas keyin material keyin oborudovaniya shaklida taxlab berilishi
 * kerak" -- kategoriyalar ALIFBO tartibida emas, shu ANIQ ma'noli
 * tartibda ko'rsatilishi kerak (aynan nakrutka kaskadining o'zi ham shu
 * tartibda ishlaydi -- t2_nakrutka_hisobla_v1: ЧЕЛ+МАШ+МАТ+ОБ). Ro'yxatda
 * yo'q har qanday kategoriya (masalan КАБ/М/К/BOSHQA) oxirida, o'zaro
 * alifbo tartibida qoladi.
 */
const KATEGORIYA_TARTIB = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'КАБ', 'М/К'];

function katTartibRaqami(kat: string): number {
  const i = KATEGORIYA_TARTIB.indexOf(kat);
  return i < 0 ? KATEGORIYA_TARTIB.length : i;
}

function katTaqqosla(a: string, b: string): number {
  return katTartibRaqami(a) - katTartibRaqami(b) || a.localeCompare(b);
}

/** Sticky-unknown addition: once any part is unknown the total is unknown (NULL ≠ 0). */
const qosh = (a: number | null, v: unknown): number | null => (a == null || v == null || v === '' || !Number.isFinite(Number(v)) ? null : a + Number(v));
const yigN = (xs: Array<number | null>): number | null => xs.reduce<number | null>((s, x) => (s == null || x == null ? null : s + x), 0);

function son(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * `t2_qator_holat` qatorlarini kategoriya+resurs bo'yicha jamlaydi.
 * Kalit — `kat|nom|birlik` (bitta resurs bir nechta BL ostida bir xil
 * nom/birlik bilan takrorlanishi mumkin — ular BITTA vedomost qatoriga
 * qo'shiladi).
 */
export function resursVedomostQur(qatorlar: readonly T2QatorHolat[]): ResursVedomostQator[] {
  const guruh = new Map<string, ResursVedomostQator>();
  for (const q of qatorlar) {
    if (!q.tur || !RESURS_TUR.has(q.tur)) continue;
    const kat = q.kat || 'BOSHQA';
    const nom = q.nom || '(nomsiz)';
    const birlik = q.birlik || '';
    const kalit = kat + '|' + nom + '|' + birlik;
    let r = guruh.get(kalit);
    if (!r) {
      r = { kat, kod: q.kod, nom, birlik: q.birlik, smetaHajm: 0, smetaSumma: 0, f2Hajm: 0, f2Summa: 0, qoldiqHajm: 0, qoldiqSumma: 0, qatorSoni: 0 };
      guruh.set(kalit, r);
    }
    r.smetaHajm += son(q.smeta_hajm);
    r.smetaSumma += son(q.smeta_summa);
    r.f2Hajm += son(q.f2_hajm);
    r.f2Summa = qosh(r.f2Summa, q.f2_summa);
    r.qoldiqHajm += son(q.qoldiq_hajm);
    r.qoldiqSumma = qosh(r.qoldiqSumma, q.qoldiq_summa);
    r.qatorSoni += 1;
    if (!r.kod && q.kod) r.kod = q.kod;
  }
  return [...guruh.values()].sort((a, b) => katTaqqosla(a.kat, b.kat) || a.nom.localeCompare(b.nom));
}

export type ResursVedomostKategoriya = {
  kat: string;
  qatorlar: ResursVedomostQator[];
  jamiSmetaSumma: number;
  jamiF2Summa: number | null;
  jamiQoldiqSumma: number | null;
};

/**
 * Owner (2026-09-10): "excel lrv hujjatlari ichida bo'lishi kerak" — resurs
 * vedomosti ilova ichidagi alohida ko'rinish (`ResursVedomostNative.tsx`)
 * bilan CHEKLANMASIN, LRV_PLUS/Forma-2 eksportining O'ZI ichida alohida
 * varaq bo'lib chiqsin. Bu yerda XLSX'ga bog'liqlik YO'Q (pure, testable) —
 * `lrv-plus-export.ts` shu qatorlar massivini `aoa_to_sheet`ga beradi.
 * Xuddi shu `resursVedomostKategoriyalarga` natijasidan quriladi — ekrandagi
 * va Excel'dagi vedomost IKKI XIL HISOB-KITOB emas, bitta manba.
 */
export const RESURS_VEDOMOST_SARLAVHA = ['Категория', 'Код', 'Наименование ресурса', 'Ед. изм.', 'Кол-во по смете', 'Сумма по смете, сум', 'Кол-во по Ф-2', 'Сумма по Ф-2, сум', 'Остаток, кол-во', 'Остаток, сумма, сум'];

/** Hujjatdagi kategoriya nomi (H9: rus tilida). */
export const RESURS_KATEGORIYA_NOMI: Record<string, string> = {
  ЧЕЛ: 'Затраты труда рабочих',
  МАШ: 'Строительные машины и механизмы',
  МАТ: 'Строительные материалы',
  ОБ: 'Оборудование',
  КАБ: 'Кабельно-проводниковая продукция',
  'М/К': 'Металлоконструкции',
  BOSHQA: 'Прочие ресурсы (категория не указана)',
};

/** 1 ресурс, 2 ресурса, 5 ресурсов. */
export function resursSoni(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  const soz = m10 === 1 && m100 !== 11 ? 'ресурс' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'ресурса' : 'ресурсов';
  return `${n} ${soz}`;
}

/** Kategoriya guruh qatori matni: "ЧЕЛ — Затраты труда рабочих (3 ресурса)".
 *  Oferta parseri (`categorySummary`) shu shaklni kategoriya dalili sifatida taniydi. */
export function resursKategoriyaSarlavha(kat: string, n: number): string {
  const kod = kat === 'BOSHQA' ? 'ПРОЧИЕ' : kat;
  return `${kod} — ${RESURS_KATEGORIYA_NOMI[kat] ?? kat} (${resursSoni(n)})`;
}

export function resursVedomostAoa(qatorlar: readonly T2QatorHolat[]): (string | number)[][] {
  const aoa: (string | number)[][] = [[...RESURS_VEDOMOST_SARLAVHA]];
  for (const k of resursVedomostKategoriyalarga(qatorlar)) {
    aoa.push([resursKategoriyaSarlavha(k.kat, k.qatorlar.length), '', '', '', '', k.jamiSmetaSumma, '', k.jamiF2Summa ?? '', '', k.jamiQoldiqSumma ?? '']);
    for (const r of k.qatorlar) {
      aoa.push(['', r.kod || '', r.nom, r.birlik || '', r.smetaHajm, r.smetaSumma, r.f2Hajm, r.f2Summa ?? '', r.qoldiqHajm, r.qoldiqSumma ?? '']);
    }
  }
  return aoa;
}

/** Kategoriya bo'yicha guruhlangan ko'rinish — sahifada bo'lim-bo'lim chizish uchun. */
export function resursVedomostKategoriyalarga(qatorlar: readonly T2QatorHolat[]): ResursVedomostKategoriya[] {
  const barchasi = resursVedomostQur(qatorlar);
  const guruh = new Map<string, ResursVedomostQator[]>();
  for (const r of barchasi) {
    const a = guruh.get(r.kat);
    if (a) a.push(r); else guruh.set(r.kat, [r]);
  }
  return [...guruh.entries()]
    .sort(([a], [b]) => katTaqqosla(a, b))
    .map(([kat, list]) => ({
      kat, qatorlar: list,
      jamiSmetaSumma: list.reduce((s, r) => s + r.smetaSumma, 0),
      jamiF2Summa: yigN(list.map(r => r.f2Summa)),
      jamiQoldiqSumma: yigN(list.map(r => r.qoldiqSumma)),
    }));
}

// ═══════════ Ресурсная ведомость — rasmiy hujjat (P1, H1–H9) ═══════════

export type ResursVedomostHujjatOpsiya = { obyektNomi: string; sana?: string; imzo?: ImzoNomlar };

/**
 * РЕСУРСНАЯ ВЕДОМОСТЬ объекта: ЧЕЛ → МАШ → МАТ → ОБ → КАБ → М/К; har resurs
 * bo'yicha smeta, qabul qilingan (Ф-2) va qoldiq. Qatorlar — read-model
 * qiymatlari (qayta hisoblanmaydi), kategoriya va umumiy jamilar — SUM
 * formulalari. Hech qanday yangi biznes hisobi yo'q (sahifadagi bilan bir manba).
 */
export function resursVedomostHujjat(holatlar: readonly T2QatorHolat[], o: ResursVedomostHujjatOpsiya): { bytes: Uint8Array; faylNomi: string } {
  const kategoriyalar = resursVedomostKategoriyalarga(holatlar);
  const sana = o.sana ?? bugunSana();
  const v = new RasmiyVaraq({
    nom: 'Ресурсная ведомость',
    sarlavha: 'РЕСУРСНАЯ ВЕДОМОСТЬ',
    ostSarlavha: [`(потребность в ресурсах по смете, принято по актам формы № 2 и остаток — по состоянию на ${sana.split('-').reverse().join('.')})`],
    titul: [['Объект:', o.obyektNomi], ['Заказчик:', o.imzo?.zakazchik], ['Подрядчик:', o.imzo?.pudratchi]],
    ustunlar: [
      { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
      { sarlavha: 'Код', kenglik: 13, tur: 'kod' },
      { sarlavha: 'Наименование ресурса', kenglik: 50, tur: 'matn' },
      { sarlavha: 'Ед. изм.', kenglik: 9, tur: 'birlik' },
      { sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: 'ПО СМЕТЕ' },
      { sarlavha: 'сумма, сум', kenglik: 17, tur: 'pul', guruh: 'ПО СМЕТЕ' },
      { sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: 'ПРИНЯТО ПО АКТАМ Ф-2' },
      { sarlavha: 'сумма, сум', kenglik: 17, tur: 'pul', guruh: 'ПРИНЯТО ПО АКТАМ Ф-2' },
      { sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: 'ОСТАТОК' },
      { sarlavha: 'сумма, сум', kenglik: 17, tur: 'pul', guruh: 'ОСТАТОК' },
    ],
    yonalish: 'landscape',
  });
  let no = 0;
  const guruhlar: number[] = [];
  const sum = (c: string, a: number, b: number) => `SUM(${c}${a}:${c}${b})`;
  // An empty (unknown) F2/remainder cell makes the group total unknown instead of a partial sum.
  const sumN = (c: string, a: number, b: number) => `IF(COUNTIF(${c}${a}:${c}${b},"")>0,"",SUM(${c}${a}:${c}${b}))`;
  for (const k of kategoriyalar) {
    const r0 = v.r;
    const a = r0 + 1, b = r0 + k.qatorlar.length;
    guruhlar.push(v.qator('ish', [null, null, resursKategoriyaSarlavha(k.kat, k.qatorlar.length), null,
      null, { f: sum('F', a, b), v: k.jamiSmetaSumma }, null, { f: sumN('H', a, b), v: k.jamiF2Summa ?? '' }, null, { f: sumN('J', a, b), v: k.jamiQoldiqSumma ?? '' }]));
    for (const r of k.qatorlar) {
      v.qator('oddiy', [++no, r.kod ?? '', r.nom, r.birlik ?? '', r.smetaHajm, r.smetaSumma, r.f2Hajm, r.f2Summa, r.qoldiqHajm, r.qoldiqSumma], { daraja: 1 });
    }
  }
  if (guruhlar.length) {
    const s = (c: string) => sumRefs(c, guruhlar);
    const j = (f: (k: ResursVedomostKategoriya) => number) => kategoriyalar.reduce((x, k) => x + f(k), 0);
    const jN = (f: (k: ResursVedomostKategoriya) => number | null) => yigN(kategoriyalar.map(f));
    const sN = (c: string) => `IF(OR(${guruhlar.map(r => `${c}${r}=""`).join(',')}),"",${s(c)})`;
    v.qator('vsego', [null, null, 'ВСЕГО ПО ВЕДОМОСТИ', null, null, { f: s('F'), v: j((k) => k.jamiSmetaSumma) }, null, { f: sN('H'), v: jN((k) => k.jamiF2Summa) ?? '' }, null, { f: sN('J'), v: jN((k) => k.jamiQoldiqSumma) ?? '' }]);
  }
  v.bosh();
  v.izoh('Количество по разделам и объекту не суммируется (разные единицы измерения). Затраты труда машинистов учтены в стоимости машино-часа.');
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'resurs_vedomost' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'РЕСУРСНАЯ_ВЕДОМОСТЬ', davr: sana }) };
}
