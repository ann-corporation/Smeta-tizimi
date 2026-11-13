/**
 * hujjat-yozuvchi/exceljs-dizayn.ts — exceljs bilan yoziladigan ISHCHI eksportlarga (bajarilmadi, moliya tahlili,
 * rahbar paneli, qarzdorlik, ombor reestri) hujjat dizaynini qo'llaydi. `RasmiyVaraq` ishlatmaydigan hujjatlar uchun
 * xuddi shu resolver (`dizayn.ts`): shrift, daraja uslubi, har katakda ramka, o'ralgan matn, sarlavha fon/o'rash,
 * mazmundan hisoblangan ustun eni va qator balandligi, A4 sahifaga sig'dirish.
 * Qiymat va formulaga TEGILMAYDI; katakning o'z foni (agar bor bo'lsa) saqlanadi; asl shablonni davom ettiruvchi
 * hujjatlarga (LRV_PLUS) qo'llanmaydi.
 */
import type { Worksheet } from 'exceljs';
import { qatorBalandligi, type BalandlikKatak } from './qator-balandlik';
import { joriyHujjatDizayni, sonUzunligi, type DarajaKalit, type HujjatDizayn } from './dizayn';

export type ExceljsDizaynOpsiya = {
  /** Jadval sarlavhasi qatori (1-asosli); undan tepadagi qatorlar — hujjat sarlavhasi (faqat shrift). */
  sarlavha: number;
  /** Oxirgi jadval qatori (berilmasa — varaqning oxirgisi). */
  oxir?: number;
  /** Qator darajalari (1-asosli qator → daraja): BL/RS/MAT/OB/jami/ВСЕГО uslubi shu qatorga qo'llanadi. */
  darajalar?: ReadonlyMap<number, DarajaKalit>;
  /** Pul / hajm ustunlari (1-asosli): yangi katak formatini faqat son formati yo'q katakka beradi. */
  pulUstunlari?: readonly number[];
  hajmUstunlari?: readonly number[];
  /** Hujjat yo'nalishi (dizaynda "auto" bo'lsa shu). */
  yonalish?: 'portrait' | 'landscape';
  dizayn?: HujjatDizayn;
};

const argb = (h: string) => `FF${h}`;
const CHEGARA = { thin: 'thin', hair: 'hair', medium: 'medium' } as const;

function korinadiganMatn(v: unknown): { matn: string; son: number | null } {
  if (v == null) return { matn: '', son: null };
  if (typeof v === 'number') return { matn: String(v), son: v };
  if (v instanceof Date) return { matn: '00.00.0000', son: null };
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: Array<{ text: string }>; text?: string };
    if (typeof o.result === 'number') return { matn: String(o.result), son: o.result };
    if (o.result != null) return { matn: String(o.result), son: null };
    if (o.richText) return { matn: o.richText.map((t) => t.text).join(''), son: null };
    if (o.text) return { matn: o.text, son: null };
    return { matn: '', son: null };
  }
  return { matn: String(v), son: null };
}

/** Dizaynni varaqqa qo'llaydi (qiymatlarga tegmaydi). */
export function exceljsJadvalUslubi(ws: Worksheet, o: ExceljsDizaynOpsiya): void {
  const d = o.dizayn ?? joriyHujjatDizayni();
  const S = d.shrift.olcham;
  const oxir = o.oxir ?? ws.rowCount;
  const ustunSoni = ws.columnCount;
  const bst = d.chegara === 'none' ? null : CHEGARA[d.chegara];
  const need = new Array<number>(ustunSoni + 1).fill(0);
  const pul = new Set(o.pulUstunlari ?? []);
  const hajm = new Set(o.hajmUstunlari ?? []);
  const pulFmt = `#,##0${d.xonaPul > 0 ? `.${'0'.repeat(d.xonaPul)}` : ''}`;
  const hajmFmt = `#,##0${d.xonaHajm > 0 ? `.${'0'.repeat(d.xonaHajm)}` : ''}`;

  // Yashirin ustunlar (egasi 2026-11-13): o'ralmaydi, kenglikka va qator balandligiga ta'sir qilmaydi.
  const yashirin = (c: number): boolean => ws.getColumn(c).hidden === true;

  for (let r = 1; r <= oxir; r++) {
    const row = ws.getRow(r);
    const jadval = r >= o.sarlavha;
    const sarlavhaQ = r === o.sarlavha;
    const lv = jadval && !sarlavhaQ ? o.darajalar?.get(r) ?? null : null;
    const u = lv ? d.daraja[lv] : null;
    const sz = Math.max(6, S + (u?.olchamQosh ?? 0));
    for (let c = 1; c <= ustunSoni; c++) {
      const cell = row.getCell(c);
      const eski = (cell.font ?? {}) as Record<string, unknown>;
      const qalin = sarlavhaQ ? true : u ? u.qalin : !!eski.bold;
      const kursiv = u ? u.kursiv : !!eski.italic;
      const matnRang = u?.matnRang ?? null;
      cell.font = { ...eski, name: d.shrift.nom, size: !jadval ? (eski.size as number | undefined) ?? S : sz, bold: qalin, italic: kursiv, ...(matnRang ? { color: { argb: argb(matnRang) } } : {}) };
      if (!jadval) continue;
      const { matn, son } = korinadiganMatn(cell.value);
      // son formati (faqat yo'q bo'lsa)
      if (son != null && !cell.numFmt) {
        if (pul.has(c)) cell.numFmt = pulFmt; else if (hajm.has(c)) cell.numFmt = hajmFmt;
      }
      const fmt = cell.numFmt ?? '';
      const ond = /\.(0+)/.exec(fmt)?.[1].length ?? 0;
      const kerak = son != null ? sonUzunligi(son, ond, ond) : 0;
      const soz = son == null ? Math.max(0, ...matn.split(/\s+/).map((s) => s.length)) : 0;
      const kk = son != null ? kerak : Math.min(30, soz);
      if (!yashirin(c)) need[c] = Math.max(need[c], Math.ceil(kk * (qalin ? 1.12 : 1) * (sz / 10) + 2.2));
      // ramka: har katakda (ichki qo'sh yuqori chiziq — jami/ВСЕГО, qalin yuqori — BL)
      if (bst) {
        const top = lv === 'jami' || lv === 'vsego' ? (d.jamiQosChiziq ? 'double' : bst) : lv === 'bl' && d.blQalinChiziq ? 'medium' : bst;
        const c0 = { style: bst, color: { argb: 'FF000000' } };
        cell.border = { left: c0, right: c0, bottom: lv === 'vsego' ? { style: 'medium', color: { argb: 'FF000000' } } : c0, top: { style: top, color: { argb: 'FF000000' } } };
      }
      // fon: katakning o'z foni saqlanadi
      const fonHex = sarlavhaQ ? d.sarlavhaFon : u?.fon ?? null;
      const bor = (cell.fill as { fgColor?: unknown } | undefined)?.fgColor != null;
      if (fonHex && !bor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(fonHex) } };
      cell.alignment = {
        ...(cell.alignment ?? {}),
        // Matn o'raladi (shrinkToFit emas); son va yashirin ustun katagi o'ralmaydi.
        wrapText: son == null && !(cell.value instanceof Date) && !yashirin(c), shrinkToFit: false, vertical: sarlavhaQ ? 'middle' : 'top',
        horizontal: sarlavhaQ ? 'center' : son != null ? 'right' : (cell.alignment?.horizontal ?? 'left'),
        ...(!sarlavhaQ && son == null && u && u.otstup > 0 && c === 2 ? { indent: u.otstup } : {}),
      };
    }
  }

  // Ustun eni: belgilangan eni va mazmun talabidan kattasi (hech qachon toraymaydi).
  for (let c = 1; c <= ustunSoni; c++) {
    const col = ws.getColumn(c);
    col.width = Math.min(70, Math.max(col.width ?? 9, need[c]));
  }
  // Qator balandligi: o'ralgan matn (so'z bo'yicha) uchun — exceljs o'zi hisoblamaydi.
  for (let r = o.sarlavha; r <= oxir; r++) {
    const row = ws.getRow(r);
    const lv = r === o.sarlavha ? null : o.darajalar?.get(r) ?? null;
    const sz = Math.max(6, S + (lv ? d.daraja[lv].olchamQosh : 0));
    const kataklar: BalandlikKatak[] = [];
    for (let c = 1; c <= ustunSoni; c++) {
      const { matn, son } = korinadiganMatn(row.getCell(c).value);
      if (son != null || !matn) continue;
      const bold = r === o.sarlavha || (lv ? d.daraja[lv].qalin : false);
      kataklar.push({ matn, eni: ws.getColumn(c).width ?? 9, yashirin: yashirin(c), qalin: bold, sz, otstup: lv && c === 2 ? d.daraja[lv].otstup : 0 });
    }
    const ht = qatorBalandligi(kataklar, { maks: d.qatorMaks });
    if (ht) row.height = Math.max(row.height ?? 0, ht);
  }

  // Sahifa: A4, eniga sig'ish, dizayn chekkalari.
  ws.pageSetup = {
    ...(ws.pageSetup ?? {}),
    paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    orientation: d.yonalish === 'auto' ? o.yonalish ?? 'landscape' : d.yonalish,
    // Jadval sarlavhasi har sahifada takrorlanadi (egasi 2026-11-13).
    printTitlesRow: `${o.sarlavha}:${o.sarlavha}`,
    margins: { left: d.chekka.chap, right: d.chekka.ong, top: d.chekka.yuqori, bottom: d.chekka.past, header: 0.3, footer: 0.3 },
  };
}
