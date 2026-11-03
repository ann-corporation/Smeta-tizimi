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
import { lrvKalitYoz } from './lrv-qayta-import';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { NAKRUTKA_KATLAR, nakrutkaKat, nakrutkaPodvaliYoz, type KatSummalar, type NakrutkaKat } from './nakrutka-podval';
import { serverMerosKoefQoy, yigindi2, type Podval } from './hisob-yadro';
import { kodlarMatni, resursGuruhKaliti, shifrKorinish } from './f2-resurs-guruh';
import { BOLIMSIZ_KALIT, f2BolimIerarxiya } from './f2-bolim-daraxti';
import { sumRefs } from './hujjat-yozuvchi/formula';
import type { T2Qator } from '../api/supabase';

/** Vedomost qatori: bitta resurs (kat + nom kaliti + birlik kaliti) va bitta narx; narxi farqli guruhlar alohida qatorlarga ajraladi. */
type VedQator = { guruh: string; kat: NakrutkaKat | null; kodlar: string[]; nom: string; birlik: string; qatorlar: number[]; summaQatorlar: number[]; hajm: number; summa: number | null; narx: number | null; narxFarqli: boolean; /** Eng yuqori razdel (uchastka/fayl) - vedomost shu bo'yicha bo'limlanadi (iyerarxiya bo'lsa). */ ildiz: number | null; ildizNom: string };

export type F2HujjatOpsiya = {
  obyektNom: string;
  davr: string;
  raqam?: string | null;
  imzo?: ImzoNomlar;
  shartnoma?: string | null;
  ndsFoiz?: number | null;
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  /** Server `nk_manba` — meros foizlari izohi (yadro `serverMerosKoefQoy`). */
  nkManba?: string | null;
  podval?: Podval | null;
  /** Rang mavzusi (berilmasa — sahifada tanlangan joriy mavzu). */
  mavzu?: RangMavzusi;
  /** Saqlangan/tasdiqlangan akt: faqat qiymatlar, bitta ham formula yo'q (egasi 2026-10-02). */
  formulasiz?: boolean;
  /** Smeta qatorlari (rz zanjiri): berilsa - hujjatda uchastka/fayl > razdel > ichki razdel iyerarxiyasi. */
  rows?: readonly T2Qator[];
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
  /* K — yashirin КАЛИТ <t2_qator.id>:<barmoq izi> (round-trip: texnadzor tuzatgan fayl qaytganda F2 import aniq bog'laydi; lrv-qayta-import himoyasi). Chop etilmaydi. */
  { sarlavha: 'КАЛИТ', kenglik: 10, tur: 'texnik', yashirin: true },
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
  let nomJS = 0; // kategoriyasi ko'rsatilmagan summa
  const bolimJamiQatorlari: number[] = [];
  const birinchi = v.r;

  /** Oxirgi yozilgan resursning summasi (null — narxsiz) — ish/bo'lim jamlari keshi uchun. */
  let oxirgiSumma: number | null = null;
  /** Hozir yozilayotgan uchastka/fayl (iyerarxiya rejimida). */
  let joriyIldiz: { kalit: number; nom: string } | null = null;
  /** Resurs/material qatori: `ishQator` berilsa — miqdor = norma × ish hajmi (tirik). */
  /** Resurs vedomosti uchun: har resurs qaysi qatorga yozilgani (kalit — kat|kod|nom|birlik). */
  const vedomost = new Map<string, VedQator>();
  const resursYoz = (x: F2Qator, kod: string | null, norma: number | null, ishQator: number | null): number => {
    // Kategoriya faqat qatorning o'zidan (tur bo'yicha МАТ/ОБ taxmin yo'q); yo'q — ustamasiz qism (podvalda alohida).
    const kat = nakrutkaKat(x.kat);
    const narxBor = !x.narxsiz && x.narx != null;
    const hisob = narxBor ? yaxlit2(x.hajm * (x.narx as number)) : null;
    // Hujjat summasi qo'lda o'zgartirilgan (ARIFMETIKA) yoki resurs fakt bilan cheklangan — qiymat yoziladi.
    const summaQiymat = narxBor && x.summa != null && Math.abs((x.summa as number) - (hisob as number)) > 0.005;
    const ishgaBogliq = ishQator != null && norma != null && norma > 0 && x.ogoh !== 'RESURS_CHEGARA';
    /* Ongli narxsiz (masalan «затраты труда машинистов» — mashina narxi ichida, alohida to'lanmaydi): summa yo'q,
     * lekin bu MA'LUMOT YETISHMASLIGI EMAS — jami bo'sh bo'lmaydi (Game Club F2 №249: 31 shunday qator ИТОГО ni yo'qotardi).
     * Egasi qoidasi (2026-10-08): narxsiz qator jamini HECH QACHON bo'shatmaydi — faqat o'zi bo'sh qoladi. */
    const ongliNarxsiz = x.narxsiz;
    oxirgiSumma = narxBor && x.summa != null ? x.summa : null;
    if (oxirgiSumma != null) { jamiJS = (jamiJS ?? 0) + oxirgiSumma; if (kat) ks[kat] += oxirgiSumma; else nomJS += oxirgiSumma; }
    const qatorR = v.r;
    const guruh = resursGuruhKaliti(kat, x.nom, x.birlik);
    const vk = `${joriyIldiz?.kalit ?? ''}|${guruh}|${narxBor ? x.narx : '-'}`;
    const vd: VedQator = vedomost.get(vk) ?? { guruh, kat, kodlar: [], nom: x.nom.trim(), birlik: (x.birlik ?? '').trim(), qatorlar: [], summaQatorlar: [], hajm: 0, summa: null, narx: narxBor ? (x.narx as number) : null, narxFarqli: false, ildiz: joriyIldiz?.kalit ?? null, ildizNom: joriyIldiz?.nom ?? '' };
    vd.qatorlar.push(qatorR); vd.hajm = yaxlit6(vd.hajm + x.hajm);
    if (kod) vd.kodlar.push(kod);
    // Faqat sonli summali qatorlar formulaga kiradi (narxsiz/ma'lumot qatori - matn «—», SUM/ROUND uni #VALUE! qilardi).
    if (oxirgiSumma != null) { vd.summa = yaxlit2((vd.summa ?? 0) + oxirgiSumma); vd.summaQatorlar.push(qatorR); }
    vedomost.set(vk, vd);
    return v.qator('oddiy', (r): Qiymat[] => [
      ++n, shifrKorinish(kod), x.nom, x.birlik ?? '',
      norma != null ? { n: norma, uslub: 'norma' } : null,
      ishgaBogliq ? { f: `ROUND(E${r}*F${ishQator},6)`, v: yaxlit6(x.hajm) } : x.hajm,
      narxBor ? x.narx : null,
      // «—» (matn): SUM uni o'tkazib yuboradi, ИТОГО dagi «bo'sh summa» tekshiruvi esa uni yetishmovchilik deb sanamaydi.
      !narxBor ? (ongliNarxsiz ? '—' : null) : summaQiymat ? x.summa : { f: `ROUND(F${r}*G${r},2)`, v: hisob },
      x.tur, kat ?? '', lrvKalitYoz(x.id, kod, x.nom, x.birlik),
    ], { daraja: 2, rang: kat && (RANG_TARTIB as readonly string[]).includes(kat) ? kat as QatorRangi : null });
  };

  const tanlash = (b: F2Bolim) => ({
    ishlar: b.ishlar.filter((i) => tanlangan.has(i.id) || i.resurslar.some((r) => tanlangan.has(r.id) && !r.avto)),
    alohida: b.alohida.filter((r) => tanlangan.has(r.id)),
  });
  /** Bo'limning o'z ishlari/materiallari qatorlari: yig'iladigan (H) qatorlar va ularning yig'indisi. */
  const bolimQatorlari = (b: F2Bolim): { tarkib: number[]; js: number } => {
    const { ishlar, alohida } = tanlash(b);
    const tarkib: number[] = [];
    let bolimJS = 0;
    const qosh = (x: number | null) => { bolimJS += x ?? 0; };
    for (const ish of ishlar) {
      const bl = tanlangan.get(ish.id);
      const avto = ish.resurslar.filter((r) => r.avto && tanlangan.has(r.id));
      const mustaqil = ish.resurslar.filter((r) => !r.avto && tanlangan.has(r.id));
      let blQ: number | null = null;
      if (bl) {
        const ishJS = yigindi2(avto.map((r) => tanlangan.get(r.id)?.summa)); // noma'lum summa o'tkaziladi (Excel SUM bo'sh katakni shunday sanaydi)
        blQ = v.qator('ish', (r): Qiymat[] => [++n, shifrKorinish(ish.kod), ish.nom, ish.birlik ?? '', null, bl.hajm, null,
          avto.length ? { f: `SUM(H${r + 1}:H${r + avto.length})`, v: ishJS } : null, 'bl', '', lrvKalitYoz(ish.id, ish.kod, ish.nom, ish.birlik)], { daraja: 1 });
        tarkib.push(blQ);
        qosh(ishJS);
        for (const r of avto) resursYoz(tanlangan.get(r.id)!, r.kod, r.norma, blQ);
      }
      for (const r of mustaqil) { tarkib.push(resursYoz(tanlangan.get(r.id)!, r.kod, null, null)); qosh(oxirgiSumma); }
    }
    for (const r of alohida) { tarkib.push(resursYoz(tanlangan.get(r.id)!, r.kod, null, null)); qosh(oxirgiSumma); }
    return { tarkib, js: bolimJS };
  };
  const jamiQator = (matn: string, tarkib: readonly number[], js: number): number =>
    v.qator('jami', (): Qiymat[] => [null, null, matn, null, null, null, null, { f: sumRefs('H', tarkib), v: yaxlit2(js) }, null, null]);

  const bolimById = new Map(bolimlar.map((b) => [b.id ?? BOLIMSIZ_KALIT, b] as const));
  const ier = o.rows ? f2BolimIerarxiya(o.rows, bolimlar) : null;
  const yozilgan = new Set<number>();
  /** Iyerarxiya: uchastka/fayl > razdel > ichki razdel; har darajada formulali oraliq jami (shu razdel ishlari + ichki razdel jamilari). */
  const tugunBor = (kalit: number): boolean => {
    const t = ier?.byKalit.get(kalit); if (!t) return false;
    const b = bolimById.get(kalit); const s = b ? tanlash(b) : null;
    return !!(s && (s.ishlar.length || s.alohida.length)) || t.farzandlar.some(tugunBor);
  };
  const tugunYoz = (kalit: number): { satr: number; js: number } | null => {
    const t = ier!.byKalit.get(kalit)!;
    if (!tugunBor(kalit)) return null;
    v.bolim(t.nom, { daraja: 0 });
    if (t.ota == null) joriyIldiz = { kalit: t.kalit, nom: t.nom };
    const b = bolimById.get(kalit);
    const tarkib: number[] = []; let js = 0;
    if (b) { yozilgan.add(kalit); const r = bolimQatorlari(b); tarkib.push(...r.tarkib); js += r.js; }
    for (const f of t.farzandlar) { const c = tugunYoz(f); if (c) { tarkib.push(c.satr); js += c.js; } }
    return { satr: jamiQator(t.daraja === 0 ? `Итого по «${t.nom}»` : `Итого по разделу «${t.nom}»`, tarkib, js), js: yaxlit2(js) };
  };
  if (ier) for (const t of ier.tugunlar) if (t.ota == null) { const r = tugunYoz(t.kalit); if (r) bolimJamiQatorlari.push(r.satr); joriyIldiz = null; }
  // Iyerarxiyasiz (rows berilmagan) yoki daraxtda topilmagan bo'limlar - yassi, avvalgidek.
  for (const b of bolimlar) {
    if (yozilgan.has(b.id ?? BOLIMSIZ_KALIT)) continue;
    const { ishlar, alohida } = tanlash(b);
    if (!ishlar.length && !alohida.length) continue;
    v.bolim(b.nom, { daraja: 0 });
    const r = bolimQatorlari(b);
    bolimJamiQatorlari.push(jamiQator(`Итого по разделу «${b.nom}»`, r.tarkib, r.js));
  }
  const oxirgi = v.r - 1;
  const itogoR = v.r;
  v.qator('vsego', (): Qiymat[] => [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ ПО АКТУ', null, null, null, null,
    { f: sumRefs('H', bolimJamiQatorlari), v: yaxlit2(jamiJS ?? 0) }, null, null]);

  v.bosh();
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  if (o.ndsFoiz != null && Number.isFinite(o.ndsFoiz) && o.ndsFoiz >= 0) nk.НДС = o.ndsFoiz;
  const podval = o.podval ? serverMerosKoefQoy(o.podval, nk, o.nkManba) : null;
  nakrutkaPodvaliYoz(v, { podval, katUstun: 'J', oraliq: [birinchi, oxirgi], pulUstunlar: ['H'], foizUstun: 'G', nk, katSummalar: { H: ks }, kfJadval: false, nomalum: Math.abs(nomJS) >= 0.005 ? { H: yaxlit2(nomJS) } : null });
  v.imzo(imzoTomonlari(o.imzo?.subpudratchi ? ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СУБПОДРЯДЧИК', 'ТЕХНАДЗОР'] : ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР'], o.imzo));
  const ved = [...vedomost.values()];
  const narxlari = new Map<string, number>();
  const nk2 = (x: VedQator) => `${x.ildiz}|${x.guruh}`;
  for (const x of ved) if (x.narx != null) narxlari.set(nk2(x), (narxlari.get(nk2(x)) ?? 0) + 1);
  for (const x of ved) x.narxFarqli = x.narx != null && (narxlari.get(nk2(x)) ?? 0) > 1;
  const rv = resursVedomosti(ved, { nom: v.nom, itogoR, jami: jamiJS, raqam, davr: o.davr, obyektNom: o.obyektNom });
  const { bytes, yacheykalar } = rasmiyKitob([v, rv], { mavzu: o.mavzu, tur: 'f2', formulasiz: o.formulasiz });
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
  rs: VedQator[],
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
  /* Iyerarxiya: vedomost uchastka/fayl bo'yicha bo'limlanadi (har birida oraliq jami); bo'lmasa - bitta umumiy ro'yxat. */
  const bolimlar: Array<{ kalit: number | null; nom: string }> = [];
  for (const x of rs) if (!bolimlar.some((b) => b.kalit === x.ildiz)) bolimlar.push({ kalit: x.ildiz, nom: x.ildizNom });
  const bolimli = bolimlar.some((b) => b.kalit != null);
  const bolimJami: number[] = [];
  for (const sec of bolimli ? bolimlar : [{ kalit: null as number | null, nom: '' }]) {
  if (bolimli && sec.nom) w.bolim(sec.nom);
  const secBoshi = guruhJami.length;
  for (const kat of tartib) {
    const guruh = rs.filter((x) => x.kat === kat && (!bolimli || x.ildiz === sec.kalit)).sort((a, b) => a.nom.localeCompare(b.nom, 'ru', { sensitivity: 'base' }) || (a.narx ?? 0) - (b.narx ?? 0));
    if (!guruh.length) continue;
    w.bolim(kat ? VED_GURUH[kat] : 'ПРОЧИЕ РЕСУРСЫ (без маркировки)');
    const rang = kat && (RANG_TARTIB as readonly string[]).includes(kat) ? kat as QatorRangi : null;
    const boshi = w.r;
    let gJS: number | null = 0;
    for (const x of guruh) {
      if (x.summa != null) gJS = yaxlit2((gJS ?? 0) + x.summa);
      w.qator('oddiy', (r): Qiymat[] => [
        ++n, kodlarMatni(x.kodlar), x.narxFarqli ? `${x.nom} [ЦЕНА ОТЛИЧАЕТСЯ]` : x.nom, x.birlik,
        { f: `ROUND(${x.qatorlar.map((q) => ref('F', q)).join('+')},6)`, v: x.hajm },
        x.narx != null ? { f: ref('G', x.qatorlar[0]), v: x.narx } : null,
        x.summa == null ? null : { f: `ROUND(${x.summaQatorlar.map((q) => ref('H', q)).join('+')},2)`, v: x.summa },
      ], { rang });
    }
    const oxiri = w.r - 1;
    jamiJS = yaxlit2((jamiJS ?? 0) + (gJS ?? 0));
    guruhJami.push(w.qator('jami', (): Qiymat[] => [null, null, `Итого: ${kat ? VED_GURUH[kat] : 'прочие ресурсы'}`, null, null, null,
      { f: `SUM(G${boshi}:G${oxiri})`, v: gJS ?? '' }]));
  }
  if (bolimli && sec.nom) {
    const q = guruhJami.slice(secBoshi);
    bolimJami.push(w.qator('jami', (): Qiymat[] => [null, null, `Итого по «${sec.nom}»`, null, null, null,
      { f: q.length ? sumRefs('G', q) : '0', v: yigindi2(rs.filter((x) => x.ildiz === sec.kalit).map((x) => x.summa)) }]));
  }
  }
  const vR = w.qator('vsego', (): Qiymat[] => [null, null, 'ВСЕГО ПО ВЕДОМОСТИ РЕСУРСОВ', null, null, null,
    { f: sumRefs('G', bolimli ? bolimJami : guruhJami), v: jamiJS ?? '' }]);
  w.qator('jami', (): Qiymat[] => [null, null, 'Сверка с актом Ф-2: ведомость − итого по акту (должно быть 0,00)', null, null, null,
    { f: `IF(${ref('H', o.itogoR)}="","",ROUND(G${vR}-${ref('H', o.itogoR)},2))`, v: jamiJS == null || o.jami == null ? '' : yaxlit2(jamiJS - o.jami) }]);
  return w;
}
