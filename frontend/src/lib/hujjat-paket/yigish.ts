/**
 * Hujjatlar paketi: yig'ish (Diskdan olish + yasash), ZIP va bitta Excel. `nomzod.ts` dagi toza reja ustiga qurilgan; tarmoq qismi
 * (`Yetkazuvchi`) tashqaridan beriladi - sayt `hujjatYarat`/Disk yuklash, MCP o'z yo'li, test - soxta. Bu yerda yangi hujjat mantig'i YO'Q.
 */
import { paketZip } from '../f2-oylik-paket/eksport';
import type { PaketFayl, PaketFaylTuri } from '../f2-oylik-paket/oylik';
import { parallelIsh } from '../f2-oylik-paket/parallel';
import { tarkibMatni, zipYollari, TUR_NOMI, type Nomzod, type PaketReja } from './nomzod';

export type Olingan = { bytes: Uint8Array; faylNomi: string };
export type Yetkazuvchi = {
  /** Diskdagi joriy versiya baytlari (BEPUL). */
  diskdan: (n: Nomzod) => Promise<Olingan>;
  /** Hujjatni yasaydi (server dvigateli: token yechiladi, Diskka yoziladi). */
  yasa: (n: Nomzod) => Promise<Olingan>;
};
export type YigilganFayl = { n: Nomzod; bytes: Uint8Array; faylNomi: string; manba: 'disk' | 'yasaldi' };
export type YigishNatija = { fayllar: YigilganFayl[]; xatolar: string[] };

const xabar = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/** Rejadagi hujjatlarni oladi: avval Disk (parallel, bepul), keyin yasash (kamroq parallel: token va server yuki). Bitta xato butun paketni to'xtatmaydi. */
export async function paketYigish(reja: Pick<PaketReja, 'diskdan' | 'yasash'>, d: Yetkazuvchi, o: { parallel?: number; yasashParallel?: number; tayyor?: (bajarildi: number, jami: number) => void } = {}): Promise<YigishNatija> {
  const jami = reja.diskdan.length + reja.yasash.length; let bajarildi = 0;
  const bos = () => o.tayyor?.(++bajarildi, jami);
  const ish = (manba: 'disk' | 'yasaldi', f: Yetkazuvchi['diskdan']) => async (n: Nomzod): Promise<YigilganFayl | string> => {
    try { const r = await f(n); bos(); return { n, bytes: r.bytes, faylNomi: r.faylNomi, manba }; }
    catch (e) { bos(); return `${n.sarlavha}${n.obyekt_nom ? ` - ${n.obyekt_nom}` : ''}${n.oy ? ` ${n.oy}` : ''}: ${xabar(e)}`; }
  };
  const diskNatija = await parallelIsh(reja.diskdan, o.parallel ?? 4, (n) => ish('disk', d.diskdan)(n));
  const yasaNatija = await parallelIsh(reja.yasash, o.yasashParallel ?? 2, (n) => ish('yasaldi', d.yasa)(n));
  const fayllar: YigilganFayl[] = []; const xatolar: string[] = [];
  for (const r of [...diskNatija, ...yasaNatija]) { if (typeof r === 'string') xatolar.push(r); else fayllar.push(r); }
  return { fayllar, xatolar };
}

/** ZIP: papkalar Disk ierarxiyasi (Loyiha/Shartnoma/Obyekt/Oy/Tur), ildizda «Tarkib» txt. */
export function paketZipi(y: YigishNatija, o: { sarlavha: string; reja?: Pick<PaketReja, 'rad' | 'olinmaydi'> }): { bytes: Uint8Array; yollar: Array<{ kalit: string; yol: string }> } {
  const yollar = zipYollari(y.fayllar.map((f) => ({ n: f.n, faylNomi: f.faylNomi })));
  const yolKalit = new Map(yollar.map((x) => [x.kalit, x.yol]));
  const fayllar: PaketFayl[] = y.fayllar.map((f) => ({ yol: yolKalit.get(f.n.kalit) ?? f.faylNomi, bytes: f.bytes, tur: (TUR_NOMI[f.n.tur] ? f.n.tur : 'reestr') as PaketFaylTuri, obyektId: f.n.obyekt_id }));
  const tarkib = tarkibMatni({ sarlavha: o.sarlavha, qatorlar: y.fayllar.map((f) => ({ yol: yolKalit.get(f.n.kalit) ?? f.faylNomi, n: f.n, manba: f.manba })), xatolar: y.xatolar, rad: o.reja?.rad, olinmaydi: o.reja?.olinmaydi });
  return { bytes: paketZip(fayllar, tarkib), yollar };
}

const VARAQ_BELGI = /[\\/*?:[\]]/g;
/** Excel varaq nomi: ≤31 belgi, taqiqlangan belgilarsiz, takrorsiz (`_2` ...). */
export function varaqNomi(asos: string, band: Set<string>): string {
  const t = asos.replace(VARAQ_BELGI, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '') || 'Hujjat';
  let nom = t.slice(0, 31); let i = 2;
  while (band.has(nom.toLowerCase())) { const q = `_${i++}`; nom = t.slice(0, 31 - q.length) + q; }
  band.add(nom.toLowerCase());
  return nom;
}

/**
 * Bitta Excel kitob: birinchi varaq «Tarkib» (ro'yxat), keyin har hujjat varaqlari (ko'p varaqli hujjatning hammasi) - qiymat, uslub, birlashgan kataklar,
 * ustun kengligi o'zgarmay ko'chadi. Formulalar ko'chadi (qiymat qayta hisoblanadi). xlsx bo'lmagan fayllar o'tkazib yuboriladi va ro'yxatga yoziladi.
 */
export async function paketExcel(y: YigishNatija, o: { sarlavha: string }): Promise<{ bytes: Uint8Array; otkazilgan: string[] }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const tarkib = wb.addWorksheet('Tarkib');
  const band = new Set<string>(['tarkib']); const otkazilgan: string[] = [];
  tarkib.addRow([o.sarlavha]); tarkib.addRow(['Hujjat', 'Obyekt', 'Oy', 'Holat', 'Manba', 'Varaq']);
  tarkib.getRow(1).font = { bold: true }; tarkib.getRow(2).font = { bold: true };
  for (const f of y.fayllar) {
    if (!/\.xlsx$/i.test(f.faylNomi)) { otkazilgan.push(`${f.faylNomi}: Excel emas`); continue; }
    const src = new ExcelJS.Workbook();
    try { await src.xlsx.load(f.bytes as unknown as ArrayBuffer); } catch (e) { otkazilgan.push(`${f.faylNomi}: ${xabar(e)}`); continue; }
    const kop = src.worksheets.length > 1;
    for (const ws of src.worksheets) {
      const nom = varaqNomi(`${TUR_NOMI[f.n.tur] ?? f.n.tur} ${f.n.obyekt_nom ?? ''} ${f.n.oy ?? ''}${kop ? ` ${ws.name}` : ''}`, band);
      const t = wb.addWorksheet(nom);
      const m = ws.model as unknown as Record<string, unknown>;
      t.model = { ...m, name: nom, mergeCells: (m.merges as string[] | undefined) ?? [] } as unknown as typeof t.model;
      tarkib.addRow([f.n.sarlavha, f.n.obyekt_nom ?? '', f.n.oy ?? '', f.n.holat, f.manba === 'disk' ? 'Diskdan' : 'yasaldi', nom]);
    }
  }
  for (const [i, w] of [34, 28, 10, 14, 12, 31].entries()) tarkib.getColumn(i + 1).width = w;
  const buf = await wb.xlsx.writeBuffer();
  return { bytes: new Uint8Array(buf as ArrayBuffer), otkazilgan };
}
