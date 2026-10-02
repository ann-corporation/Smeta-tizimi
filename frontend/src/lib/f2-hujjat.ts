/**
 * Ф-2 hujjati — LRV_PLUS'ning asosiy ustunlari asosida (egasi, 2026-10-02: "LRV PLUS dagi asosiy ustunlar,
 * summagacha + I dagi markirovka; eski tizim uchun o'ngdagi yordamchi ustunlar kerak emas").
 *
 * Hujjat TO'LIQ TIRIK: texnadzor oldida ish hajmini (F) o'zgartirsangiz —
 *   resurs miqdori  F = ROUND(E × F_ish; 6)   (norma × ish hajmi),
 *   summa           H = ROUND(F × G; 2),
 *   ish summasi     = resurslari yig'indisi,
 *   bo'lim jami     = ishlar va materiallar yig'indisi,
 *   ИТОГО           = bo'limlar yig'indisi,
 *   podval          = xarajat turi (yashirin J) bo'yicha SUMIF → ustamalar kaskadi → НДС
 *   I — qator turi (rz/bl/rs/mat) LRV_PLUS kabi: hujjat F2 importga qaytib yuklansa aniq o'qiladi.
 * hammasi o'zi qayta hisoblanadi. Narxsiz resurs (ongli tanlov) — summa bo'sh va jami bo'sh (H7: NULL ≠ 0).
 */
import type { F2Bolim, F2Qator } from './f2-tayyor';
import { RANG_TARTIB, RasmiyVaraq, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, yaxlit2, type ImzoNomlar, type QatorRangi, type RangMavzusi, type Qiymat, type RasmiyUstun } from './hujjat-yozuvchi';
import { davrMatni } from './nakopitelniy-vedomost-export';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { NAKRUTKA_KATLAR, nakrutkaKat, nakrutkaPodvaliYoz, type KatSummalar, type NakrutkaKat } from './nakrutka-podval';
import { podvalgaKoefQoy, type Podval } from './nakrutka-konstruktor';

export type F2HujjatOpsiya = {
  obyektNom: string;
  davr: string;
  raqam?: string | null;
  imzo?: ImzoNomlar;
  shartnoma?: string | null;
  ndsFoiz?: number | null;
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  podval?: Podval | null;
  /** Rang mavzusi (berilmasa — sahifada tanlangan joriy mavzu). */
  mavzu?: RangMavzusi;
};

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 17, tur: 'kod' },
  { sarlavha: 'Наименование работ и затрат', kenglik: 58, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 16, tur: 'birlik' },
  { sarlavha: 'Расход на ед.', kenglik: 12, tur: 'norma' },
  { sarlavha: 'Количество', kenglik: 14, tur: 'hajm' },
  { sarlavha: 'Цена за ед., сум', kenglik: 16, tur: 'narx' },
  { sarlavha: 'Сумма, сум', kenglik: 18, tur: 'pul' },
  /* I — LRV_PLUS'dagi kabi qator turi (rz/bl/rs/mat/ob): tizimning o'z F2 importi aynan shu belgidan o'qiydi —
     hujjat qaytib yuklanganda ish/resurs/material ADASHMAYDI. */
  { sarlavha: 'Тип', kenglik: 7, tur: 'birlik' },
  /* J — xarajat turi (ЧЕЛ/МАШ/МАТ/…): podval SUMIF va ranglar uchun, chop etilmaydi. */
  { sarlavha: 'Кат.', kenglik: 8, tur: 'texnik', yashirin: true },
];

const yaxlit6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Ф-2 hujjati: `bolimlar` — F2 tayyorlash daraxti, `qatorlar` — shu aktga tanlangan qatorlar (f2Qatorlar natijasi). */
export function f2Hujjat(bolimlar: readonly F2Bolim[], qatorlar: readonly F2Qator[], o: F2HujjatOpsiya): { bytes: Uint8Array; faylNomi: string; jami: number | null; yacheykalar: number } {
  const tanlangan = new Map(qatorlar.filter((x) => !x.xato).map((x) => [x.id, x]));
  if (!tanlangan.size) throw new Error('F2_HUJJAT_BOSH');
  const raqam = (o.raqam ?? '').trim();
  const v = new RasmiyVaraq({
    nom: 'Ф-2',
    sarlavha: `АКТ ПРИЕМКИ ВЫПОЛНЕННЫХ РАБОТ${raqam ? ` № ${raqam}` : ''} (ФОРМА № 2)`,
    ostSarlavha: [`за отчетный период: ${davrMatni(o.davr)}`],
    titul: [['Объект:', o.obyektNom], ['Заказчик:', o.imzo?.zakazchik], ['Подрядчик:', o.imzo?.pudratchi], ...(o.imzo?.subpudratchi ? [['Субподрядчик:', o.imzo.subpudratchi] as const] : []), ['Договор:', o.shartnoma]],
    ustunlar: USTUNLAR,
    yonalish: 'portrait',
  });

  let n = 0;
  let jamiJS: number | null = 0;
  const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
  const bolimJamiQatorlari: number[] = [];
  const birinchi = v.r;

  /** Oxirgi yozilgan resursning summasi (null — narxsiz) — ish/bo'lim jamlari keshi uchun. */
  let oxirgiSumma: number | null = null;
  /** Resurs/material qatori: `ishQator` berilsa — miqdor = norma × ish hajmi (tirik). */
  /** Resurs vedomosti uchun: har resurs qaysi qatorga yozilgani (kalit — kat|kod|nom|birlik). */
  const vedomost = new Map<string, { kat: NakrutkaKat | null; kod: string; nom: string; birlik: string; qatorlar: number[]; hajm: number; summa: number | null; narxlar: Set<number> }>();
  const resursYoz = (x: F2Qator, kod: string | null, norma: number | null, ishQator: number | null): number => {
    const kat = nakrutkaKat(x.kat) ?? (x.tur === 'mat' ? 'МАТ' : x.tur === 'ob' ? 'ОБ' : null);
    const narxBor = !x.narxsiz && x.narx != null;
    const hisob = narxBor ? yaxlit2(x.hajm * (x.narx as number)) : null;
    // Hujjat summasi qo'lda o'zgartirilgan (ARIFMETIKA) yoki resurs fakt bilan cheklangan — qiymat yoziladi.
    const summaQiymat = narxBor && x.summa != null && Math.abs((x.summa as number) - (hisob as number)) > 0.005;
    const ishgaBogliq = ishQator != null && norma != null && norma > 0 && x.ogoh !== 'RESURS_CHEGARA';
    oxirgiSumma = narxBor && x.summa != null ? x.summa : null;
    if (oxirgiSumma != null) { jamiJS = jamiJS == null ? null : jamiJS + oxirgiSumma; if (kat) ks[kat] += oxirgiSumma; } else jamiJS = null;
    const qatorR = v.r;
    const vk = `${kat ?? ''}|${(kod ?? '').trim()}|${x.nom.trim()}|${(x.birlik ?? '').trim()}`;
    const vd = vedomost.get(vk) ?? { kat, kod: (kod ?? '').trim(), nom: x.nom.trim(), birlik: (x.birlik ?? '').trim(), qatorlar: [], hajm: 0, summa: 0, narxlar: new Set<number>() };
    vd.qatorlar.push(qatorR); vd.hajm = yaxlit6(vd.hajm + x.hajm);
    vd.summa = vd.summa == null || oxirgiSumma == null ? null : yaxlit2(vd.summa + oxirgiSumma);
    if (narxBor) vd.narxlar.add(x.narx as number);
    vedomost.set(vk, vd);
    return v.qator('oddiy', (r): Qiymat[] => [
      ++n, kod ?? '', x.nom, x.birlik ?? '',
      norma != null ? { n: norma, uslub: 'norma' } : null,
      ishgaBogliq ? { f: `ROUND(E${r}*F${ishQator},6)`, v: yaxlit6(x.hajm) } : x.hajm,
      narxBor ? x.narx : null,
      !narxBor ? null : summaQiymat ? x.summa : { f: `ROUND(F${r}*G${r},2)`, v: hisob },
      x.tur, kat ?? '',
    ], { daraja: 2, rang: kat && (RANG_TARTIB as readonly string[]).includes(kat) ? kat as QatorRangi : null });
  };

  for (const b of bolimlar) {
    const ishlar = b.ishlar.filter((i) => tanlangan.has(i.id) || i.resurslar.some((r) => tanlangan.has(r.id) && !r.avto));
    const alohida = b.alohida.filter((r) => tanlangan.has(r.id));
    if (!ishlar.length && !alohida.length) continue;
    v.bolim(b.nom, { daraja: 0 });
    const tarkib: number[] = [];
    let bolimJS = 0;
    const qosh = (x: number | null) => { bolimJS += x ?? 0; };
    for (const ish of ishlar) {
      const bl = tanlangan.get(ish.id);
      const avto = ish.resurslar.filter((r) => r.avto && tanlangan.has(r.id));
      const mustaqil = ish.resurslar.filter((r) => !r.avto && tanlangan.has(r.id));
      let blQ: number | null = null;
      if (bl) {
        const ishJS = yaxlit2(avto.reduce((s2, r) => s2 + (tanlangan.get(r.id)?.summa ?? 0), 0));
        blQ = v.qator('ish', (r): Qiymat[] => [++n, ish.kod ?? '', ish.nom, ish.birlik ?? '', null, bl.hajm, null,
          avto.length ? { f: `SUM(H${r + 1}:H${r + avto.length})`, v: ishJS } : null, 'bl', ''], { daraja: 1 });
        tarkib.push(blQ);
        qosh(ishJS);
        for (const r of avto) resursYoz(tanlangan.get(r.id)!, r.kod, r.norma, blQ);
      }
      for (const r of mustaqil) { tarkib.push(resursYoz(tanlangan.get(r.id)!, r.kod, null, null)); qosh(oxirgiSumma); }
    }
    for (const r of alohida) { tarkib.push(resursYoz(tanlangan.get(r.id)!, r.kod, null, null)); qosh(oxirgiSumma); }
    bolimJamiQatorlari.push(v.qator('jami', (): Qiymat[] => [null, null, `Итого по разделу «${b.nom}»`, null, null, null, null,
      { f: tarkib.length ? `SUM(${tarkib.map((q) => `H${q}`).join(',')})` : '0', v: yaxlit2(bolimJS) }, null, null]));
  }
  const oxirgi = v.r - 1;
  // Narxsiz resurs bo'lsa — ИТОГО bo'sh (0 emas): markirovkasi bor va summasi bo'sh qator sanaladi.
  const bosh = `COUNTIFS(J${birinchi}:J${oxirgi},"<>",H${birinchi}:H${oxirgi},"")`;
  const itogoR = v.r;
  v.qator('vsego', (): Qiymat[] => [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ ПО АКТУ', null, null, null, null,
    { f: `IF(${bosh}>0,"",SUM(${bolimJamiQatorlari.map((q) => `H${q}`).join(',')}))`, v: jamiJS == null ? '' : yaxlit2(jamiJS) }, null, null]);

  v.bosh();
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  if (o.ndsFoiz != null && Number.isFinite(o.ndsFoiz) && o.ndsFoiz >= 0) nk.НДС = o.ndsFoiz;
  const podval = o.podval ? podvalgaKoefQoy(o.podval, nk) : null;
  nakrutkaPodvaliYoz(v, { podval, katUstun: 'J', oraliq: [birinchi, oxirgi], pulUstunlar: ['H'], foizUstun: 'G', nk, katSummalar: { H: ks }, kfJadval: false });
  v.imzo(imzoTomonlari(o.imzo?.subpudratchi ? ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СУБПОДРЯДЧИК', 'ТЕХНАДЗОР'] : ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР'], o.imzo));
  const rv = resursVedomosti([...vedomost.values()], { nom: v.nom, itogoR, jami: jamiJS, raqam, davr: o.davr, obyektNom: o.obyektNom });
  const { bytes, yacheykalar } = rasmiyKitob([v, rv], { mavzu: o.mavzu, tur: 'f2' });
  return {
    bytes, yacheykalar,
    faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: `АКТ_Ф-2${raqam ? `_№${raqam}` : ''}`, davr: o.davr.slice(0, 7) }),
    jami: jamiJS == null ? null : yaxlit2(jamiJS),
  };
}

const VED_USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Код ресурса', kenglik: 14, tur: 'kod' },
  { sarlavha: 'Наименование ресурса', kenglik: 64, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 12, tur: 'birlik' },
  { sarlavha: 'Количество', kenglik: 15, tur: 'hajm' },
  { sarlavha: 'Цена за ед., сум', kenglik: 16, tur: 'narx' },
  { sarlavha: 'Сумма, сум', kenglik: 18, tur: 'pul' },
];
const VED_GURUH: Record<NakrutkaKat, string> = {
  ЧЕЛ: 'ЗАТРАТЫ ТРУДА РАБОЧИХ (ЧЕЛ)', МАШ: 'МАШИНЫ И МЕХАНИЗМЫ (МАШ)', МАТ: 'МАТЕРИАЛЫ (МАТ)', ОБ: 'ОБОРУДОВАНИЕ (ОБ)',
  КАБ: 'КАБЕЛИ И ПРОВОДА (КАБ)', 'М/К': 'МЕТАЛЛОКОНСТРУКЦИИ (М/К)', 'БЕЗ СКЛАД': 'МАТЕРИАЛЫ БЕЗ СКЛАДСКОГО ХРАНЕНИЯ (БЕЗ СКЛАД)',
};

/**
 * Ведомость ресурсов к акту Ф-2 — F2 varag'iga to'g'ridan-to'g'ri havolalar bilan (SUMIFS emas: nomlardagi * va ? —
 * Excel shabloni bo'lib qoladi). Miqdor = Ф-2 dagi shu resurs qatorlari F yig'indisi, summa — H yig'indisi;
 * narx — bitta bo'lsa o'zi, har xil bo'lsa o'rtacha (Сумма / Количество). Oxirida akt bilan solishtiruv (0 bo'lishi shart).
 */
function resursVedomosti(
  rs: Array<{ kat: NakrutkaKat | null; kod: string; nom: string; birlik: string; qatorlar: number[]; hajm: number; summa: number | null; narxlar: Set<number> }>,
  o: { nom: string; itogoR: number; jami: number | null; raqam: string; davr: string; obyektNom: string },
): RasmiyVaraq {
  const ref = (c: string, r: number) => `'${o.nom}'!${c}${r}`;
  const w = new RasmiyVaraq({
    nom: 'Ведомость ресурсов',
    sarlavha: `ВЕДОМОСТЬ РЕСУРСОВ К АКТУ${o.raqam ? ` № ${o.raqam}` : ''} (ФОРМА № 2)`,
    ostSarlavha: [`за отчетный период: ${davrMatni(o.davr)}`],
    titul: [['Объект:', o.obyektNom]],
    ustunlar: VED_USTUNLAR,
    yonalish: 'portrait',
  });
  let n = 0;
  const guruhJami: number[] = [];
  let jamiJS: number | null = 0;
  const tartib = [...NAKRUTKA_KATLAR, null] as const;
  for (const kat of tartib) {
    const guruh = rs.filter((x) => x.kat === kat).sort((a, b) => a.nom.localeCompare(b.nom, 'ru') || a.kod.localeCompare(b.kod));
    if (!guruh.length) continue;
    w.bolim(kat ? VED_GURUH[kat] : 'ПРОЧИЕ РЕСУРСЫ (без маркировки)');
    const rang = kat && (RANG_TARTIB as readonly string[]).includes(kat) ? kat as QatorRangi : null;
    const boshi = w.r;
    let gJS: number | null = 0;
    for (const x of guruh) {
      gJS = gJS == null || x.summa == null ? null : yaxlit2(gJS + x.summa);
      const bittaNarx = x.narxlar.size === 1 ? [...x.narxlar][0] : null;
      w.qator('oddiy', (r): Qiymat[] => [
        ++n, x.kod, x.nom, x.birlik,
        { f: `ROUND(${x.qatorlar.map((q) => ref('F', q)).join('+')},6)`, v: x.hajm },
        bittaNarx != null ? { f: ref('G', x.qatorlar[0]), v: bittaNarx } : x.summa != null && x.hajm ? { f: `IF(E${r}=0,"",ROUND(G${r}/E${r},2))`, v: yaxlit2(x.summa / x.hajm) } : null,
        x.summa == null ? null : { f: `ROUND(${x.qatorlar.map((q) => ref('H', q)).join('+')},2)`, v: x.summa },
      ], { rang });
    }
    const oxiri = w.r - 1;
    jamiJS = jamiJS == null || gJS == null ? null : yaxlit2(jamiJS + gJS);
    guruhJami.push(w.qator('jami', (): Qiymat[] => [null, null, `Итого: ${kat ? VED_GURUH[kat] : 'прочие ресурсы'}`, null, null, null,
      { f: `SUM(G${boshi}:G${oxiri})`, v: gJS ?? '' }]));
  }
  const vR = w.qator('vsego', (): Qiymat[] => [null, null, 'ВСЕГО ПО ВЕДОМОСТИ РЕСУРСОВ', null, null, null,
    { f: `SUM(${guruhJami.map((q) => `G${q}`).join(',')})`, v: jamiJS ?? '' }]);
  w.qator('jami', (): Qiymat[] => [null, null, 'Сверка с актом Ф-2: ведомость − итого по акту (должно быть 0,00)', null, null, null,
    { f: `IF(${ref('H', o.itogoR)}="","",ROUND(G${vR}-${ref('H', o.itogoR)},2))`, v: jamiJS == null || o.jami == null ? '' : yaxlit2(jamiJS - o.jami) }]);
  return w;
}
