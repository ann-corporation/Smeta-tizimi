/**
 * Narx manbalarining rasmiy Excel nashrlarini o'qish (egasi 2026-10-15: "obosnovaniya birja yoki katalogdan olinishi kerak").
 * Uch turdagi nashr bir xil tuzilishda chiqadi va uchalasi ham tizim bo'yicha ishlatiladi:
 *
 *   • katalog          — «Каталог цен РУз» (hudud varaqlari; ustunlar: с НДС ×3 oy, без НДС ×3 oy);
 *   • asosiy_material  — «Текущие цены по основным строительным материалам» (ishlab chiqaruvchi + hudud qatorlari);
 *   • birja            — UzRTSB kotirovkalari (oy bo'yicha, butun respublika).
 *
 * Qoidalar (o'zgarmas): narx doim QQS SIZ; bir nashr ichida bir mahsulotning bir necha oy narxidan ENG QIMMATI olinadi
 * (egasi: "narxni eng qimmatiga"); dollar varaqlari olinmaydi (valyuta kursi tashqi qoida). Birja faylida QQS siz ustun
 * bo'lmasa narx kotirovka ÷ 1,12 bilan hisoblanadi — egasining o'z fayllaridagi amaliyoti (2024-03, 2024-12 birja
 * fayllarida aynan shu ustun bor) va har qatorga "hisoblangan" izohi yoziladi.
 */
export type ManbaTuri = 'katalog' | 'asosiy_material' | 'birja' | 'prays';
export type SheetRows = unknown[][];
export type NashrQatori = { nom: string; birlik: string; narx: number; hudud: string | null; zavod: string | null; guruh: string | null;
  /** Price date (ISO) of the month column the price came from. */
  sana: string | null; izoh: string | null };
export type Nashr = { tur: ManbaTuri; nom: string; yil: number | null; kvartal: number | null; oy: number | null;
  /** Manufacturer / supplier of a price list (tur = prays). */
  yetkazuvchi?: string | null;
  /** Latest price date in the edition (ISO) — orders editions. */
  sana: string | null; qatorlar: NashrQatori[];
  hisob: { varaqlar: number; olinmaganVaraqlar: string[]; qatorlar: number; narxsiz: number; hisoblanganQqs: number } };

/** Region names as written in sheet names / region rows → the platform region key (same keys as lib/hudud). */
const HUDUD_PREFIKS: Array<[RegExp, string, string]> = [
  [/^(?:республика\s+)?кара|каракалпак/i, 'qoraqalpogiston', 'Республика Каракалпакстан'],
  [/^г\.?\s*ташкент|^город\s+ташкент/i, 'toshkent_sh', 'г. Ташкент'],
  [/^ташкентская/i, 'toshkent_vil', 'Ташкентская область'],
  [/^андижан/i, 'andijon', 'Андижанская область'], [/^бухар/i, 'buxoro', 'Бухарская область'],
  [/^джизак/i, 'jizzax', 'Джизакская область'], [/^кашкадар/i, 'qashqadaryo', 'Кашкадарьинская область'],
  [/^наманган/i, 'namangan', 'Наманганская область'], [/^навои/i, 'navoiy', 'Навоийская область'],
  [/^самарканд/i, 'samarqand', 'Самаркандская область'], [/^сурхандар/i, 'surxondaryo', 'Сурхандарьинская область'],
  [/^сырдар/i, 'sirdaryo', 'Сырдарьинская область'], [/^ферган/i, 'fargona', 'Ферганская область'],
  [/^хорезм/i, 'xorazm', 'Хорезмская область'],
];
export function hududAniqla(matn: string | null | undefined): { kalit: string; nom: string } | null {
  const s = (matn ?? '').trim();
  const h = HUDUD_PREFIKS.find(([re]) => re.test(s));
  return h ? { kalit: h[1], nom: h[2] } : null;
}

const str = (v: unknown) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const s = str(v).replace(/\s/g, '').replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) && Number(s) > 0 ? Number(s) : null;
};
const round2 = (v: number) => Math.round(v * 100) / 100;
/** "01.04.2026" / "24.03.2025\nпо\n30.03.2025" → the LAST date as ISO. */
export function sanaOl(v: unknown): string | null {
  const all = [...str(v).matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)];
  const m = all[all.length - 1];
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
/** Every non-empty cell holds the same text (merged title / region / group rows). */
function birXil(r: unknown[]): string | null {
  const v = r.map(str).filter(Boolean);
  return v.length && v.every(x => x === v[0]) ? v[0] : null;
}
const QQS = 1.12;

/** Kind of the workbook from its own title text. */
export function manbaTuriniAniqla(sheets: Array<{ nom: string; rows: SheetRows }>): ManbaTuri | null {
  const head = sheets.slice(0, 3).flatMap(s => s.rows.slice(0, 6).flat().map(str)).join(' ').toLowerCase();
  if (/товарно-сырьев|биржа|котировк/.test(head)) return 'birja';
  if (/основным строительным материалам/.test(head)) return 'asosiy_material';
  if (/выпускаемой продукции|отпускная текущая цена/.test(head)) return 'katalog';
  return null;
}

type Ustunlar = { nom: number; birlik: number; zavod: number | null; netto: Array<{ col: number; sana: string | null }>; brutto: Array<{ col: number; sana: string | null }>; boshi: number };
/** Header rows: «без НДС» / «с НДС» row + the dates row under it. */
function ustunlarniTop(rows: SheetRows): Ustunlar | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i].map(str);
    const netto = r.flatMap((v, c) => (/без\s*ндс/i.test(v) ? [c] : []));
    const brutto = r.flatMap((v, c) => (/^(цены\s+)?с\s*ндс/i.test(v) ? [c] : []));
    if (!netto.length && !brutto.length) continue;
    const nom = r.findIndex(v => /наименование\s+(выпускаемой|материал|продукц)/i.test(v));
    const birlik = r.findIndex(v => /^ед/i.test(v));
    if (nom < 0 || birlik < 0) continue;
    const zavod = r.findIndex(v => /изготовител|предприяти/i.test(v));
    const sanaQator = (rows[i + 1] ?? []).map(str);
    const s = (c: number) => sanaOl(sanaQator[c]);
    // Data starts after the dates row and the optional "1 2 3 …" numbering row.
    let boshi = i + 2;
    if ((rows[boshi] ?? []).slice(0, 3).every((v, k) => Number(v) === k + 1)) boshi++;
    return { nom, birlik, zavod: zavod >= 0 && zavod !== nom ? zavod : null, netto: netto.map(c => ({ col: c, sana: s(c) })), brutto: brutto.map(c => ({ col: c, sana: s(c) })), boshi };
  }
  return null;
}

/** Highest VAT-free price among the month columns (and its date). */
function engQimmat(r: unknown[], u: Ustunlar): { narx: number; sana: string | null; hisoblangan: boolean } | null {
  let best: { narx: number; sana: string | null; hisoblangan: boolean } | null = null;
  for (const c of u.netto) { const v = num(r[c.col]); if (v != null && (!best || v > best.narx)) best = { narx: v, sana: c.sana, hisoblangan: false }; }
  if (best || u.netto.length) return best;
  for (const c of u.brutto) { const v = num(r[c.col]); if (v != null && (!best || v / QQS > best.narx)) best = { narx: round2(v / QQS), sana: c.sana, hisoblangan: true }; }
  return best;
}

function katalogVaraq(nom: string, rows: SheetRows, out: NashrQatori[], c: Nashr['hisob'], asosiy: boolean) {
  const u = ustunlarniTop(rows);
  if (!u) { c.olinmaganVaraqlar.push(`${nom}: sarlavha topilmadi`); return; }
  let hudud = asosiy ? null : hududAniqla(nom)?.nom ?? null;
  let zavod: string | null = null, guruh: string | null = null;
  for (const r of rows.slice(u.boshi)) {
    const narx = engQimmat(r, u);
    const nomi = str(r[u.nom]);
    if (!narx || !nomi || !/[А-Яа-яA-Za-z]/.test(nomi) || !str(r[u.birlik])) {
      const t = birXil(r);
      if (t) {
        const h = hududAniqla(t);
        if (asosiy && h) hudud = h.nom;
        else if (/^\d+\.\s/.test(t)) zavod = t.replace(/^\d+\.\s*/, '').split(/\s+(?:Руководитель|Адрес|Тел)/)[0].slice(0, 200);
        else guruh = t.slice(0, 200);
      } else if (nomi && str(r[u.birlik]) && u.netto.some(x => str(r[x.col]))) c.narxsiz++;
      continue;
    }
    if (asosiy && u.zavod != null && str(r[u.zavod])) zavod = str(r[u.zavod]).slice(0, 200);
    out.push({ nom: nomi.slice(0, 1500), birlik: str(r[u.birlik]).slice(0, 40), narx: round2(narx.narx), hudud, zavod, guruh, sana: narx.sana,
      izoh: narx.hisoblangan ? 'hisoblangan: QQS 12% chiqarildi' : null });
    if (narx.hisoblangan) c.hisoblanganQqs++;
  }
}

function birjaVaraq(nom: string, rows: SheetRows, out: NashrQatori[], c: Nashr['hisob']) {
  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) if (rows[i].some(v => /наименование\s+продукц/i.test(str(v)))) { h = i; break; }
  if (h < 0) { c.olinmaganVaraqlar.push(`${nom}: sarlavha topilmadi`); return; }
  const r0 = rows[h].map(str);
  const ni = r0.findIndex(v => /наименование/i.test(v)), bi = r0.findIndex(v => /^ед/i.test(v)), pi = r0.findIndex(v => /котировк|цен/i.test(v) && !/наименование/i.test(v));
  if (ni < 0 || bi < 0 || pi < 0) { c.olinmaganVaraqlar.push(`${nom}: ustunlar topilmadi`); return; }
  const sana = sanaOl(rows[h + 1]?.[pi]);
  for (const r of rows.slice(h + 2)) {
    const nomi = str(r[ni]), birlik = str(r[bi]), q = num(r[pi]);
    if (!nomi || !birlik || !/[А-Яа-яA-Za-z]/.test(nomi)) continue;
    if (q == null) { c.narxsiz++; continue; }
    // An explicit VAT-free column next to the quote (= quote ÷ 1.12) is used as is; otherwise it is derived the same way.
    const yon = num(r[pi + 1]);
    const tayyor = yon != null && Math.abs(yon * QQS - q) <= Math.max(1, q * 0.002);
    const narx = tayyor ? round2(yon) : round2(q / QQS);
    if (!tayyor) c.hisoblanganQqs++;
    out.push({ nom: nomi.slice(0, 1500), birlik: birlik.slice(0, 40), narx, hudud: null, zavod: null, guruh: null, sana,
      izoh: `kotirovka ${q} (с НДС)${tayyor ? '' : ' ÷ 1,12'}` });
  }
}

/** Parses one workbook (all sheets) into an edition. Throws when the kind is not recognised. */
export function nashrniOqi(faylNomi: string, sheets: Array<{ nom: string; rows: SheetRows }>, tur = manbaTuriniAniqla(sheets)): Nashr {
  if (!tur) throw new Error('MANBA_TURI_NOMALUM');
  const qatorlar: NashrQatori[] = [];
  const hisob: Nashr['hisob'] = { varaqlar: 0, olinmaganVaraqlar: [], qatorlar: 0, narxsiz: 0, hisoblanganQqs: 0 };
  for (const s of sheets) {
    if (/доллар|usd/i.test(s.nom)) { hisob.olinmaganVaraqlar.push(`${s.nom}: valyuta narxi (olinmaydi)`); continue; }
    if (tur === 'katalog' && !hududAniqla(s.nom)) { hisob.olinmaganVaraqlar.push(`${s.nom}: hudud aniqlanmadi`); continue; }
    hisob.varaqlar++;
    if (tur === 'birja') birjaVaraq(s.nom, s.rows, qatorlar, hisob);
    else katalogVaraq(s.nom, s.rows, qatorlar, hisob, tur === 'asosiy_material');
  }
  hisob.qatorlar = qatorlar.length;
  const sanalar = qatorlar.map(q => q.sana).filter((x): x is string => !!x).sort();
  const sana = sanalar[sanalar.length - 1] ?? null;
  // Period: the quarter whose LAST month the edition's last price date opens (01.04 → Q1; birja: the quote month).
  let yil: number | null = null, kvartal: number | null = null, oy: number | null = null;
  // The document's own title wins ("Каталог 1-кв. 2025" is cited as such even when its columns are dated 01.11.2024–01.01.2025).
  const nomdan = davrNomdan(faylNomi);
  if (nomdan && tur !== 'birja') ({ yil, kvartal } = nomdan);
  else if (sana) {
    const [y, m, d] = sana.split('-').map(Number);
    if (tur === 'birja') { yil = y; oy = m; kvartal = Math.ceil(m / 3); }
    else { const prev = d === 1 ? (m === 1 ? 12 : m - 1) : m; yil = d === 1 && m === 1 ? y - 1 : y; kvartal = Math.ceil(prev / 3); }
  }
  return { tur, nom: faylNomi, yil, kvartal, oy, sana, qatorlar, hisob };
}

/** "Каталог 1-кв. 2025", "КАТАЛОГ 4-КВ2025", "Каталог_цен_РУз,_2025_год,_III_квартал" → {yil, kvartal}. */
export function davrNomdan(nom: string): { yil: number; kvartal: number } | null {
  const s = nom.replace(/_/g, ' ');
  const y = s.match(/(20\d{2})/);
  const k = s.match(/(?:^|[^\d])([1-4])\s*-?\s*(?:й\s*)?(?:и\s*\d\s*-?\s*й\s*)?кв/i) ?? s.match(/(?:^|[\s,])(IV|I{1,3})\s*-?\s*кв/i);
  if (!y || !k) return null;
  const kv = /^\d$/.test(k[1]) ? Number(k[1]) : ({ I: 1, II: 2, III: 3, IV: 4 } as Record<string, number>)[k[1].toUpperCase()];
  return kv ? { yil: Number(y[1]), kvartal: kv } : null;
}

/** Human title of an edition for the «обоснование» line. */
export function nashrSarlavhasi(n: Pick<Nashr, 'tur' | 'yil' | 'kvartal' | 'oy' | 'sana'> & { yetkazuvchi?: string | null }): string {
  const OY = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  if (n.tur === 'prays') return `Прайс-лист${n.yetkazuvchi ? ` ${n.yetkazuvchi}` : ''}${n.sana ? ` от ${n.sana.split('-').reverse().join('.')}` : ''}`;
  if (n.tur === 'birja') return `Котировки УзРТСБ${n.oy && n.yil ? `, ${OY[n.oy - 1]} ${n.yil} г.` : ''}`;
  const davr = n.kvartal && n.yil ? `${n.kvartal} кв. ${n.yil} г.` : n.yil ? `${n.yil} г.` : '';
  return n.tur === 'asosiy_material' ? `Текущие цены на основные строительные материалы${davr ? `, ${davr}` : ''}` : `Каталог цен РУз${davr ? `, ${davr}` : ''}`;
}
