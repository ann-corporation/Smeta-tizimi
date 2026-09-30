import type { SheetGrid, XlsxWorkbook } from './f2-import-parse';
import { HAJM_NAQSH, NARX_NAQSH, SUMMA_NAQSH, uchlikniMoslashtir } from './smeta-anatomiya/ustun-dalil';
import { varaqniTahlilQil } from './smeta-anatomiya/varaq';

export type ResNarx = { kod?: string; nom: string; birlik: string; narx: number };
/** `dalil` — narx ustuni qanday isbotlandi (sarlavha / ma'lumot arifmetikasi). */
export type ResUstunlar = { kod: number; nom: number; birlik: number; narx: number; sarlavha: number; dalil?: string };
export type NarxsizQator = { id: number; tur: string | null; kod: string | null; nom: string | null; birlik: string | null; narx: number | null };
export type ResMoslashmaganSabab = 'QATOR_IDENTIYASI_YOQ' | 'RES_MANBASI_TOPILMADI' | 'RES_MANBA_ZIDDIYATI' | 'BIR_NECHTA_NARX_VARIANTI';
export type ResMoslashmagan = { tur: string; kod: string | null; nom: string | null; birlik: string | null; sabab: ResMoslashmaganSabab };
export type ResPreview = {
  narxsiz: number;
  mos: number;
  narxsizQoldi: number;
  ziddiyatliManba: number;
  qatorNarxlari: Map<number, number>;
  moslashmagan: ResMoslashmagan[];
  turBoyicha: Record<'rs' | 'mat' | 'ob', { narxsiz: number; mos: number }>;
};

const plain = (v: unknown) => String(v ?? '').trim();
const up = (v: unknown) => plain(v).toUpperCase();

/** PostgreSQL `t2_resurs_nom_kalit` bilan aynan bir semantika. */
export function resNomKalit(v: unknown): string {
  return up(v).replace(/Ё/g, 'Е').replace(/[^0-9A-ZА-Я]/g, '');
}

/** PostgreSQL `t2_resurs_birlik_kalit` bilan aynan bir semantika. */
export function resBirlikKalit(v: unknown): string {
  return up(v).replace(/³/g, '3').replace(/²/g, '2').replace(/[\s\p{P}]/gu, '');
}

function resKodKalit(v: unknown): string {
  return up(v).replace(/[\s\p{P}]/gu, '');
}

function son(v: unknown): number | undefined {
  const raw = plain(v).replace(/[\s ]/g, '').replace(',', '.');
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** RES sarlavhasi ikki yoki uch qatorga bo'linishini hisobga oladi.
 *
 * Egasi (2026-09-25): PTO ustun qo'shishi yoki nomini o'zgartirishi mumkin —
 * narx ustuni sarlavha so'zi bilan emas, oxir-oqibat MA'LUMOT bilan
 * isbotlanadi: hajm × narx ≈ summa (smeta-anatomiya/ustun-dalil.ts, barcha
 * hujjat o'quvchilari uchun yagona mexanizm). */
export function resUstunlariniAniqla(rows: SheetGrid): ResUstunlar | null {
  // C4: ustunlarni avval yagona anatomiya aniqlaydi; topilmasa — quyidagi RES detektori.
  try {
    const v = varaqniTahlilQil('', { nom: '', rows });
    const u = v.ustunlar;
    if (u && u.nom >= 0 && u.birlik >= 0 && u.narx >= 0) {
      return { kod: u.shifr, nom: u.nom, birlik: u.birlik, narx: u.narx, sarlavha: Math.max(0, u.malumotBoshi - 1), dalil: v.rolDalil.map((d) => d.izoh).filter((x) => /ustun|narx|summa|hajm/.test(x)).join('; ') || 'anatomiya ustunlari' };
    }
  } catch { /* zaxira detektor */ }
  return resUstunlariEski(rows);
}

function resUstunlariEski(rows: SheetGrid): ResUstunlar | null {
  for (let r = 0; r < Math.min(rows.length, 80); r++) {
    const row = rows[r] ?? [];
    let nom = -1; let birlik = -1; let kod = -1;
    for (let c = 0; c < row.length; c++) {
      const cell = up(row[c]);
      if (nom < 0 && /НАИМЕНОВАНИЕ/.test(cell)) nom = c;
      if (birlik < 0 && /ЕД\.?\s*ИЗМ|ЕДИНИЦ/.test(cell)) birlik = c;
      if (kod < 0 && /ШИФР|КОД/.test(cell)) kod = c;
    }
    if (nom < 0 || birlik < 0) continue;
    // Sarlavha matnlari (asosiy qator + keyingi 3 qator, raqamlash/ma'lumotgacha).
    const sarQatorlar: number[] = [];
    for (let rr = r; rr < Math.min(rows.length, r + 4); rr++) {
      const q = rows[rr] ?? [];
      const sonlar = q.filter((v) => son(v) != null).length;
      if (rr > r && sonlar >= 2) break;
      sarQatorlar.push(rr);
    }
    const kenglik = Math.max(0, ...sarQatorlar.map((rr) => (rows[rr] ?? []).length));
    const matnlar = Array.from({ length: kenglik }, (_, c) => sarQatorlar.map((rr) => up((rows[rr] ?? [])[c]).replace(/\s+/g, ' ')).filter(Boolean).join(' '));
    let narx = matnlar.findIndex((t) => /НА\.?\s*ЕД\.?\s*(ИЗМ|ИЗМЕР)|НА\s*ЕДИНИЦУ/.test(t));
    if (narx < 0) narx = matnlar.findIndex((t, i) => i !== nom && i !== birlik && NARX_NAQSH.test(t) && !/ОБЩ|ВСЕГО|ВЕСЬ/.test(t));
    const hajm = matnlar.findIndex((t, i) => i !== narx && HAJM_NAQSH.test(t) && !/ЦЕНА|НАРХ|СУММ|СТОИМ/.test(t));
    const summa = matnlar.findIndex((t, i) => i !== narx && SUMMA_NAQSH.test(t) && !NARX_NAQSH.test(t));
    const band = new Set([kod, nom, birlik].filter((i) => i >= 0));
    const oxirgiSar = sarQatorlar[sarQatorlar.length - 1] ?? r;
    const m = uchlikniMoslashtir(matnlar, rows.slice(oxirgiSar + 1, oxirgiSar + 2001), { hajm, narx, summa }, band);
    if (m.qoida === 'arifmetika') narx = m.uchlik.narx;
    return narx >= 0 ? { kod, nom, birlik, narx, sarlavha: r, dalil: m.izoh } : null;
  }
  return null;
}

export function resQatorlariniOl(rows: SheetGrid, cols: ResUstunlar): ResNarx[] {
  const out: ResNarx[] = [];
  for (const row of rows.slice(cols.sarlavha + 1)) {
    const nom = plain(row[cols.nom]);
    const birlik = plain(row[cols.birlik]);
    const narx = son(row[cols.narx]);
    if (!nom || !birlik || narx == null || narx <= 0) continue;
    out.push({ kod: plain(cols.kod >= 0 ? row[cols.kod] : '') || undefined, nom, birlik, narx });
  }
  return out;
}

export function resVaraqlariniTop(workbook: XlsxWorkbook): Array<{ nom: string; cols: ResUstunlar }> {
  return workbook.sheets.flatMap((s) => {
    const sheet = workbook.sheet(s.name);
    const cols = sheet ? resUstunlariniAniqla(sheet.rows) : null;
    return cols ? [{ nom: s.name, cols }] : [];
  });
}

function sourceKaliti(code: string, nom: string, birlik: string): string {
  return `${code}|${nom}|${birlik}`;
}

function sourceQur(rows: ResNarx[]): {
  ziddiyatli: number;
  ziddiyatliKalitlar: Set<string>;
  narxlarByKalit: Map<string, Set<number>>;
} {
  const grouped = new Map<string, Set<number>>();
  for (const row of rows) {
    const nom = resNomKalit(row.nom);
    const birlik = resBirlikKalit(row.birlik);
    const code = resKodKalit(row.kod);
    if (!nom || !birlik || !Number.isFinite(row.narx) || row.narx <= 0) continue;
    const key = sourceKaliti(code, nom, birlik);
    const prices = grouped.get(key) ?? new Set<number>();
    prices.add(row.narx);
    grouped.set(key, prices);
  }
  let ziddiyatli = 0;
  const ziddiyatliKalitlar = new Set<string>();
  const narxlarByKalit = new Map<string, Set<number>>();
  for (const [key, prices] of grouped) {
    narxlarByKalit.set(key, prices);
    if (prices.size !== 1) {
      ziddiyatli++;
      ziddiyatliKalitlar.add(key);
    }
  }
  return { ziddiyatli, ziddiyatliKalitlar, narxlarByKalit };
}

/**
 * Server bilan bir xil, fail-closed preview. Kod bo'lsa aynan u ham mos
 * bo'lishi shart; kod yo'q manba faqat nom+birlik orqali ishlaydi.
 */
export function resNarxlashPreview(qatorlar: NarxsizQator[], reslar: ResNarx[]): ResPreview {
  const { ziddiyatli, ziddiyatliKalitlar, narxlarByKalit } = sourceQur(reslar);
  const qatorNarxlari = new Map<number, number>();
  const moslashmagan: ResMoslashmagan[] = [];
  const turBoyicha: ResPreview['turBoyicha'] = {
    rs: { narxsiz: 0, mos: 0 },
    mat: { narxsiz: 0, mos: 0 },
    ob: { narxsiz: 0, mos: 0 },
  };
  let narxsiz = 0;
  for (const q of qatorlar) {
    if (!['rs', 'mat', 'ob'].includes(q.tur ?? '') || !(q.narx == null || q.narx === 0)) continue;
    narxsiz++;
    const tur = q.tur as 'rs' | 'mat' | 'ob';
    turBoyicha[tur].narxsiz++;
    const nom = resNomKalit(q.nom);
    const birlik = resBirlikKalit(q.birlik);
    const code = resKodKalit(q.kod);
    if (!nom || !birlik) {
      moslashmagan.push({ tur, kod: q.kod, nom: q.nom, birlik: q.birlik, sabab: 'QATOR_IDENTIYASI_YOQ' });
      continue;
    }

    // Kodli manba aynan shu kodli qatorga, kodsiz manba esa nom+birlikka
    // tushadi. Indeks ishlatilgani uchun har bir qator uchun butun RES fayli
    // qayta aylanilmaydi; moslashuv natijasi hanuz qat'iy va taxminsiz.
    const keys = code
      ? [sourceKaliti(code, nom, birlik), sourceKaliti('', nom, birlik)]
      : [sourceKaliti('', nom, birlik)];
    const candidates = new Set<number>();
    let ziddiyatliMoslik = false;
    for (const key of keys) {
      if (ziddiyatliKalitlar.has(key)) ziddiyatliMoslik = true;
      for (const narx of narxlarByKalit.get(key) ?? []) candidates.add(narx);
    }
    if (candidates.size === 1 && !ziddiyatliMoslik) {
      qatorNarxlari.set(q.id, [...candidates][0]);
      turBoyicha[tur].mos++;
      continue;
    }
    moslashmagan.push({
      tur,
      kod: q.kod,
      nom: q.nom,
      birlik: q.birlik,
      sabab: ziddiyatliMoslik ? 'RES_MANBA_ZIDDIYATI'
        : candidates.size > 1 ? 'BIR_NECHTA_NARX_VARIANTI'
          : 'RES_MANBASI_TOPILMADI',
    });
  }
  return {
    narxsiz,
    mos: qatorNarxlari.size,
    narxsizQoldi: narxsiz - qatorNarxlari.size,
    ziddiyatliManba: ziddiyatli,
    qatorNarxlari,
    moslashmagan,
    turBoyicha,
  };
}
