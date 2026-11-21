/**
 * Hujjatlar paketi: yig'ish (Diskdan olish + yasash), ZIP va bitta Excel. `nomzod.ts` dagi toza reja ustiga qurilgan; tarmoq qismi
 * (`Yetkazuvchi`) tashqaridan beriladi - sayt `hujjatYarat`/Disk yuklash, MCP o'z yo'li, test - soxta. Bu yerda yangi hujjat mantig'i YO'Q.
 */
import { paketZip } from '../f2-oylik-paket/eksport';
import type { PaketFayl, PaketFaylTuri } from '../f2-oylik-paket/oylik';
import { parallelIsh } from '../f2-oylik-paket/parallel';
import { kengaytmaBilan } from './fayl-nomi';
import { tarkibMatni, zipYollari, TUR_NOMI, type Nomzod, type PaketReja } from './nomzod';

export type Olingan = { bytes: Uint8Array; faylNomi: string; /** Server aytgan manba (X-Hujjat-Manba): Diskdan berildi yoki hozir yasaldi (va Diskka yozildi). */ manba?: 'disk' | 'yasaldi'; /** Fayl mime (kengaytmasiz nom uchun). */ mime?: string | null };
export type Yetkazuvchi = {
  /** Diskdagi joriy versiya baytlari (BEPUL). */
  diskdan: (n: Nomzod) => Promise<Olingan>;
  /** Hujjatni yasaydi (server dvigateli: token yechiladi, Diskka yoziladi). */
  yasa: (n: Nomzod) => Promise<Olingan>;
};
export type YigilganFayl = { n: Nomzod; bytes: Uint8Array; faylNomi: string; manba: 'disk' | 'yasaldi' };

/**
 * Hujjat bo'yicha natija (paket hech qachon jim tashlamaydi): `tayyor` - Diskdan berildi; `yangilandi` - hozir serverda yasalib Diskka qaytarib yozildi
 * (keyingi safar tayyor turadi); `eskirgan` - Diskdagi versiya berildi, lekin manba o'zgargan va fonda yangilanmoqda; `xato` - kirmadi (sabab bilan).
 */
export type HujjatNatijasi = 'tayyor' | 'yangilandi' | 'eskirgan' | 'xato';
export type HujjatHolati = { kalit: string; tur: string; sarlavha: string; obyekt_id: number | null; obyekt_nom: string | null; oy: string | null; natija: HujjatNatijasi; sabab?: string };
export type YigishNatija = { fayllar: YigilganFayl[]; xatolar: string[]; holatlar?: HujjatHolati[] };

/** Yetkazuvchi xatosi: `vaqtinchalik` - bir marta qayta uriniladi (tarmoq/502/503/504); `toxtat` - qolgan YASASH to'xtatiladi (masalan token yetmaydi). */
export class YetkazishXato extends Error {
  readonly o: { vaqtinchalik?: boolean; toxtat?: boolean };
  constructor(msg: string, o: { vaqtinchalik?: boolean; toxtat?: boolean } = {}) { super(msg); this.name = 'YetkazishXato'; this.o = o; }
}

const xabar = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const kech = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Yasash yengilmi: Diskda tayyor fayl bor va fonda yangilanmayapti - server uni to'g'ridan beradi (og'ir hisob yo'q), shuning uchun ko'proq parallel. */
export const yasashYengilmi = (n: Nomzod): boolean => n.fayl_id != null && (n as { yangilanmoqda?: boolean }).yangilanmoqda !== true;

/** Obyekt bo'yicha qisqa holat (UI: «Obyekt 1: 5 tayyor, 1 yangilandi, 2 xato»). Hujjat tartibi saqlanadi, xatolari bilan. */
export type ObyektHolati = { obyekt_id: number | null; obyekt_nom: string; jami: number; tayyor: number; yangilandi: number; eskirgan: number; xato: number; xatolar: string[] };
export function obyektHolatlari(h: readonly HujjatHolati[]): ObyektHolati[] {
  const m = new Map<string, ObyektHolati>();
  for (const x of h) {
    const k = String(x.obyekt_id ?? 0);
    let o = m.get(k);
    if (!o) { o = { obyekt_id: x.obyekt_id, obyekt_nom: x.obyekt_nom ?? 'Obyektsiz', jami: 0, tayyor: 0, yangilandi: 0, eskirgan: 0, xato: 0, xatolar: [] }; m.set(k, o); }
    o.jami++; o[x.natija]++;
    if (x.natija === 'xato') o.xatolar.push(`${x.sarlavha}${x.oy ? ` ${x.oy}` : ''}: ${x.sabab ?? ''}`.trim());
  }
  return [...m.values()].sort((a, b) => a.obyekt_nom.localeCompare(b.obyekt_nom, 'ru'));
}

/**
 * Rejadagi hujjatlarni oladi. Uchta hovuz BIR VAQTDA ishlaydi (avval ketma-ket edi - Disk tugamaguncha yasash boshlanmasdi):
 *   Disk (bepul, `parallel`=6) | yasash-yengil (Diskda tayyor, `yengilParallel`=4) | yasash-og'ir (Diskda yo'q/eskirgan, `yasashParallel`=3: server/token yuki).
 * Bitta xato butun paketni to'xtatmaydi; vaqtinchalik xato (tarmoq/502/503/504) bir marta qayta uriladi; `toxtat` xatosi (token yetmaydi) qolgan yasashni
 * to'xtatadi, lekin ularning har biri sabab bilan `holatlar` va `xatolar` ga yoziladi - hech narsa jim tashlanmaydi.
 */
export async function paketYigish(reja: Pick<PaketReja, 'diskdan' | 'yasash'>, d: Yetkazuvchi, o: { parallel?: number; yasashParallel?: number; yengilParallel?: number; qaytaKutish?: number; tayyor?: (bajarildi: number, jami: number) => void } = {}): Promise<YigishNatija> {
  const jami = reja.diskdan.length + reja.yasash.length; let bajarildi = 0;
  const bos = () => o.tayyor?.(++bajarildi, jami);
  let toxtatildi: string | null = null;
  type Ish = { fayl: YigilganFayl } | { xato: string; holat: HujjatHolati };
  const belgi = (n: Nomzod) => `${n.sarlavha}${n.obyekt_nom ? ` - ${n.obyekt_nom}` : ''}${n.oy ? ` ${n.oy}` : ''}`;
  const xatoIsh = (n: Nomzod, sabab: string): Ish => ({ xato: `${belgi(n)}: ${sabab}`, holat: { kalit: n.kalit, tur: n.tur, sarlavha: n.sarlavha, obyekt_id: n.obyekt_id, obyekt_nom: n.obyekt_nom, oy: n.oy, natija: 'xato', sabab } });
  const ish = (manba: 'disk' | 'yasaldi', f: Yetkazuvchi['diskdan']) => async (n: Nomzod): Promise<Ish> => {
    if (manba === 'yasaldi' && toxtatildi) { bos(); return xatoIsh(n, toxtatildi); }
    for (let urinish = 0; ; urinish++) {
      try { const r = await f(n); bos(); return { fayl: { n, bytes: r.bytes, faylNomi: kengaytmaBilan(r.faylNomi, r.bytes, r.mime, n.sarlavha), manba: r.manba ?? manba } }; }
      catch (e) {
        const x = e instanceof YetkazishXato ? e.o : {};
        if (x.vaqtinchalik && urinish < 1) { await kech(o.qaytaKutish ?? 500); continue; }
        if (x.toxtat && manba === 'yasaldi') toxtatildi = `${xabar(e)} (qolgan hujjatlar yasalmadi)`;
        bos(); return xatoIsh(n, xabar(e));
      }
    }
  };
  const yengil = reja.yasash.filter(yasashYengilmi); const ogir = reja.yasash.filter((n) => !yasashYengilmi(n));
  const [diskNatija, yengilNatija, ogirNatija] = await Promise.all([
    parallelIsh(reja.diskdan, o.parallel ?? 6, (n) => ish('disk', d.diskdan)(n)),
    parallelIsh(yengil, o.yengilParallel ?? 4, (n) => ish('yasaldi', d.yasa)(n)),
    parallelIsh(ogir, o.yasashParallel ?? 2, (n) => ish('yasaldi', d.yasa)(n)),
  ]);
  // Tartib: Disk, keyin yasash - reja tartibida (yengil/og'ir hovuzlari qayta birlashtiriladi).
  const yasaNatija = new Map<string, Ish>();
  yengil.forEach((n, i) => yasaNatija.set(n.kalit, yengilNatija[i])); ogir.forEach((n, i) => yasaNatija.set(n.kalit, ogirNatija[i]));
  const fayllar: YigilganFayl[] = []; const xatolar: string[] = []; const holatlar: HujjatHolati[] = [];
  const yigish = (n: Nomzod, r: Ish) => {
    if ('xato' in r) { xatolar.push(r.xato); holatlar.push(r.holat); return; }
    fayllar.push(r.fayl);
    const eski = (n as { yangilanmoqda?: boolean }).yangilanmoqda === true && r.fayl.manba === 'disk';
    holatlar.push({ kalit: n.kalit, tur: n.tur, sarlavha: n.sarlavha, obyekt_id: n.obyekt_id, obyekt_nom: n.obyekt_nom, oy: n.oy, natija: eski ? 'eskirgan' : r.fayl.manba === 'yasaldi' ? 'yangilandi' : 'tayyor' });
  };
  reja.diskdan.forEach((n, i) => yigish(n, diskNatija[i]));
  for (const n of reja.yasash) yigish(n, yasaNatija.get(n.kalit)!);
  return { fayllar, xatolar, holatlar };
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
