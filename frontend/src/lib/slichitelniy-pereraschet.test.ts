import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { slichitelniyHujjatXlsx, slichitelniyModeli, ozgarishSvodi, QOSHIMCHA_BOLIM_NOMI, type BekorAkt } from './slichitelniy-vedomost';
import { yaxlitQatorIdlari, type SvodYaxlit } from './svod-yaxlit';
import { NAKRUTKA_KATLAR } from './nakrutka-podval';
import { kaskad, standartPodval } from './hisob-yadro';
import { namunaSaqla } from './hujjat-yozuvchi/test-yordam';

/*
 * Sintetik obyekt (mijoz ma'lumoti emas). Pereraschet: fakt − ranee predyavleno po F-2 (tasdiqlangan F-2 lar yig'indisi, tuzatish aktlari
 * ishorasi bilan — `t2_qator_holat.f2_*`). Excel formulalari ichki mini-hisoblagich bilan QAYTA hisoblanadi va keshga tengligi tekshiriladi.
 */
const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

function q(id: number, ota_id: number | null, tur: string, hajm: number | null, nom: string, ex: Partial<T2Qator> = {}): T2Qator {
  return {
    id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: 'К' + id, nom,
    birlik: 'м3', hajm, narx: 1000, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
    d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, ...ex,
  } as T2Qator;
}
/** fakt_hajm, f2_hajm, f2_summa (F-2 summasi — tasdiqlangan aktlar sof yig'indisi, tuzatish aktlari manfiy hissa bilan). */
function h(qator_id: number, fakt_hajm: number | null, f2_hajm: number | null = 0, f2_summa: number | null = 0): T2QatorHolat {
  return { id: qator_id, qator_id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null,
    smeta_summa: null, fakt_hajm, fakt_summa: 0, f2_hajm, f2_summa, qoldiq_hajm: null, qoldiq_summa: null } as unknown as T2QatorHolat;
}

const DARAXT: T2Qator[] = [
  q(1, null, 'rz', null, 'СМЕТА 01 ОСНОВНАЯ'),
  // F-2 < fakt (ikkala resurs ham): к доплате
  q(2, 1, 'bl', 10, 'БЕТОН МОНОЛИТ'),
  q(3, 2, 'rs', 20, 'ТРУД БЕТОН', { kat: 'ЧЕЛ', narx: 500 }),
  q(4, 2, 'mat', 10, 'БЕТОН В25', { kat: 'МАТ', narx: 1000 }),
  // F-2 > fakt: к снятию
  q(5, 1, 'bl', 5, 'КИРПИЧНАЯ КЛАДКА'),
  q(6, 5, 'mat', 5, 'КИРПИЧ', { kat: 'МАТ', narx: 2000 }),
  // almashtirish: eski (исключается, fakt 0) va yangi (взамен)
  q(7, 1, 'bl', 4, 'ПОЗИЦИЯ СТАРАЯ'),
  q(8, 7, 'mat', 4, 'МАТЕРИАЛ СТАРЫЙ', { kat: 'МАТ', narx: 3000 }),
  q(9, 1, 'bl', 4, 'ПОЗИЦИЯ НОВАЯ ВЗАМЕН', { zamena: true, replaces_line_id: 7 }),
  q(10, 9, 'mat', 4, 'МАТЕРИАЛ НОВЫЙ', { kat: 'МАТ', narx: 3500 }),
  // qo'shimcha ish (razdel darajasida) — alohida bo'limga ajratiladi
  q(11, 1, 'bl', 2, 'ДОП РАБОТА ПЛИТКА', { qoshimcha: true }),
  q(12, 11, 'mat', 2, 'ПЛИТКА ДОП', { kat: 'МАТ', narx: 10_000 }),
  // tuzatish akti: F-2 sof yig'indi 8 (10 − 2), summa 800
  q(13, 1, 'bl', 10, 'ПОЗИЦИЯ С КОРРЕКТИРОВКОЙ'),
  q(14, 13, 'mat', 10, 'ПЕСОК КОРР', { kat: 'МАТ', narx: 100 }),
  // fakt noma'lum — NULL ≠ 0
  q(15, 1, 'bl', 3, 'ПОЗИЦИЯ БЕЗ ФАКТА'),
  q(16, 15, 'mat', 3, 'МАТЕРИАЛ БЕЗ ФАКТА', { kat: 'МАТ', narx: 700 }),
  // svod yaxlit bo'lim
  q(30, null, 'rz', null, 'СВОД ЦЕЛИКОМ'),
  q(31, 30, 'bl', 1, 'ПОЗИЦИЯ СВОДА'),
  q(32, 31, 'rs', 0.3, 'ТРУД СВОД', { kat: 'ЧЕЛ' }),
  q(33, 31, 'rs', 0.7, 'МАТЕРИАЛ СВОД', { kat: 'МАТ' }),
];
const HOLAT: T2QatorHolat[] = [
  h(2, 10, 6), h(3, 20, 10, 5000), h(4, 10, 6, 6000),
  h(5, 3, 5), h(6, 3, 5, 10_000),
  h(7, 0, 0), h(8, 0, 0, 0),
  h(9, 4, 0), h(10, 4, 0, 0),
  h(11, 2, 1), h(12, 2, 1, 10_000),
  h(13, 10, 8), h(14, 10, 8, 800),
  h(15, null, 0), h(16, null, 0, 0),
  h(31, 1, 0.6), h(32, 0.15, 0.1, 100), h(33, 0.7, 0.5, 500),
];
const SVOD: SvodYaxlit = {
  qqssiz: 1200, barglar: 1000, summasiz: 0,
  bolimlar: [{ id: 1, qator_id: 30, nom: 'СВОД ЦЕЛИКОМ', svod_summa: 1344, qqs_stavka: 12, qqssiz: 1200, barglar: 1000, asos: 'svod', dalil: {} }],
};

// ───────────── mini formula hisoblagich (faqat shu hujjatda ishlatiladigan funksiyalar) ─────────────
type V = number | string | boolean | null;
class Hisob {
  private memo = new Map<string, V>();
  unsupported = new Set<string>();
  private readonly wb: ExcelJS.Workbook;
  constructor(wb: ExcelJS.Workbook) { this.wb = wb; }
  raw(sheet: string, ref: string): { formula?: string; value: V } {
    const c = this.wb.getWorksheet(sheet)!.getCell(ref).value as unknown;
    if (c && typeof c === 'object' && 'formula' in (c as object)) { const o = c as { formula: string }; return { formula: o.formula, value: keshOl(this.wb, sheet, ref) }; }
    if (c && typeof c === 'object') return { value: null };
    return { value: (c ?? null) as V };
  }
  get(sheet: string, ref: string): V {
    const k = `${sheet}!${ref}`;
    if (this.memo.has(k)) return this.memo.get(k)!;
    const r = this.raw(sheet, ref);
    const v = r.formula ? this.eval(r.formula, sheet) : r.value;
    this.memo.set(k, v);
    return v;
  }
  cache(sheet: string, ref: string): V { return this.raw(sheet, ref).value; }
  eval(f: string, sheet: string): V {
    const tok = f.match(/"[^"]*"|'[^']+'![A-Z]+\d+(?::[A-Z]+\d+)?|[A-Z]+\d+(?::[A-Z]+\d+)?|[A-Z]+(?=\()|<>|>=|<=|\d+(?:\.\d+)?|[=<>+\-*/(),]/g) ?? [];
    let p = 0;
    const self = this;
    const num = (x: V): number => { if (x === null) return 0; if (typeof x === 'number') return x; if (typeof x === 'boolean') return x ? 1 : 0; throw new Error('VALUE'); };
    const cells = (t: string): V[] => {
      const m = /^(?:'([^']+)'!)?([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(t)!;
      const sh = m[1] ?? sheet;
      if (!m[4]) return [self.get(sh, m[2] + m[3])];
      const colN = (s: string) => [...s].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
      const colS = (n: number) => { let s = ''; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
      const out: V[] = [];
      for (let c = colN(m[2]); c <= colN(m[4]); c++) for (let r = +m[3]; r <= +m[5]; r++) out.push(self.get(sh, colS(c) + r));
      return out;
    };
    function cmp(): V {
      let a = add();
      while (['=', '<>', '<', '>', '<=', '>='].includes(tok[p])) {
        const op = tok[p++]; const b = add();
        const na = a === null ? (typeof b === 'string' ? '' : 0) : a, nb = b === null ? (typeof a === 'string' ? '' : 0) : b;
        a = op === '=' ? na === nb : op === '<>' ? na !== nb : op === '<' ? (na as number) < (nb as number) : op === '>' ? (na as number) > (nb as number) : op === '<=' ? (na as number) <= (nb as number) : (na as number) >= (nb as number);
      }
      return a;
    }
    function add(): V {
      let a = mul();
      while (tok[p] === '+' || tok[p] === '-') { const op = tok[p++]; const b = mul(); a = op === '+' ? num(a) + num(b) : num(a) - num(b); }
      return a;
    }
    function mul(): V {
      let a = un();
      while (tok[p] === '*' || tok[p] === '/') { const op = tok[p++]; const b = un(); a = op === '*' ? num(a) * num(b) : num(a) / num(b); }
      return a;
    }
    function un(): V { if (tok[p] === '-') { p++; return -num(un()); } return prim(); }
    function args(): V[][] {
      const out: V[][] = [];
      p++; // (
      if (tok[p] === ')') { p++; return out; }
      for (;;) {
        // range yoki ifoda
        if (/^(?:'[^']+'!)?[A-Z]+\d+:[A-Z]+\d+$/.test(tok[p] ?? '')) out.push(cells(tok[p++]));
        else out.push([cmp()]);
        if (tok[p] === ',') { p++; continue; }
        p++; // )
        return out;
      }
    }
    function prim(): V {
      const t = tok[p++];
      if (t === '(') { const v = cmp(); p++; return v; }
      if (t.startsWith('"')) return t.slice(1, -1);
      if (/^\d/.test(t)) return Number(t);
      if (/^[A-Z]+$/.test(t) && tok[p] === '(') {
        const lazy = t === 'IF';
        if (lazy) {
          p++;
          const c = cmp(); p++;
          const shart = c === true || (typeof c === 'number' && c !== 0);
          const a = skipOrEval(shart);
          p++; // ,
          const b = skipOrEval(!shart);
          p++; // )
          return shart ? a : b;
        }
        const a = args();
        const flat = a.flat();
        const nums = flat.filter((x): x is number => typeof x === 'number');
        switch (t) {
          case 'OR': return flat.some((x) => x === true);
          case 'AND': return flat.every((x) => x === true);
          case 'SUM': return nums.reduce((s, x) => s + x, 0);
          case 'MAX': return Math.max(...nums);
          case 'MIN': return Math.min(...nums);
          case 'ROUND': { const k = 10 ** num(a[1][0]); const x = num(a[0][0]); return Math.sign(x) * Math.round(Math.abs(x) * k + 1e-9) / k; }
          case 'SUMIF': { const [rng, crit, sr] = a; return rng.reduce<number>((s, x, i) => (x === crit[0] && typeof sr[i] === 'number' ? s + (sr[i] as number) : s), 0); }
          case 'ISNUMBER': return typeof flat[0] === 'number';
          case 'ABS': return Math.abs(num(flat[0]));
          case 'N': return typeof flat[0] === 'number' ? flat[0] : 0;
          default: throw new Error(`UNSUPPORTED:${t}`);
        }
      }
      if (/^(?:'[^']+'!)?[A-Z]+\d+$/.test(t)) return cells(t)[0];
      throw new Error(`TOKEN:${t}`);
    }
    /** IF shoxini o'qiydi: ishlatilishi kerak bo'lsa — qiymat, aks holda faqat o'tkazib yuboradi (qavs balansi bilan). */
    function skipOrEval(kerak: boolean): V {
      if (kerak) return cmp();
      let d = 0;
      while (p < tok.length) { if (tok[p] === '(') d++; else if (tok[p] === ')') { if (d === 0) break; d--; } else if (tok[p] === ',' && d === 0) break; p++; }
      return null;
    }
    const out = cmp();
    return out;
  }
}

const XML = new WeakMap<ExcelJS.Workbook, Map<string, string>>();
/** Keshlangan natija — to'g'ridan-to'g'ri XML dan (exceljs natijasi 0 ni yo'qotadi). */
function keshOl(wb: ExcelJS.Workbook, sheet: string, ref: string): V {
  const idx = wb.worksheets.findIndex((w) => w.name === sheet) + 1;
  const x = XML.get(wb)!.get('xl/worksheets/sheet' + idx + '.xml')!;
  const m = new RegExp('<c r="' + ref + '"([^>/]*)(?:/>|>(.*?)</c>)').exec(x);
  if (!m || m[2] === undefined) return null;
  const t = /t="([^"]+)"/.exec(m[1])?.[1];
  const v = /<v>(.*?)<\/v>/.exec(m[2])?.[1];
  if (v === undefined) return t === 'str' ? '' : null;
  const dec = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return t === 'str' ? dec(v) : t === 'b' ? v === '1' : Number(v);
}
async function yuk(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const z = await JSZip.loadAsync(bytes);
  const xml = new Map<string, string>();
  for (const n of Object.keys(z.files)) if (/xl\/worksheets\/sheet\d+\.xml$/.test(n)) xml.set(n, await z.file(n)!.async('string'));
  XML.set(wb, xml);
  return wb;
}
const ASOSIY = 'Сличительная ведомость';
const SVOD_V = 'Свод изменений';

function qur(extra: { svod?: boolean; holat?: T2QatorHolat[]; vne?: 'alohida' | 'daraxt'; bajar?: ReadonlySet<number>; bekor?: BekorAkt[] } = {}) {
  const rows = extra.svod === false ? DARAXT.filter((x) => x.id < 30) : DARAXT;
  const holat = extra.holat ?? HOLAT;
  const model = slichitelniyModeli(rows, holat, { ...(extra.svod === false ? {} : { svodYaxlit: SVOD }), bajarilmadiIdlar: extra.bajar ?? null });
  const r = slichitelniyHujjatXlsx(model, { obyektNomi: 'Объект', sana: '2026-11-14', nakrutka: NK, svodYaxlit: extra.svod === false ? null : SVOD,
    yaxlitIdlar: extra.svod === false ? null : yaxlitQatorIdlari(rows, SVOD), vneSmeta: extra.vne, bekorAktlar: extra.bekor });
  namunaSaqla('slichitelniy_pereraschet.xlsx', r.bytes);
  return { model, r, rows };
}
/** Asosiy varaqda nom bo'yicha qator raqami (C ustuni). */
function qatorNomi(wb: ExcelJS.Workbook, nom: string): number {
  const ws = wb.getWorksheet(ASOSIY)!;
  for (let i = 1; i <= ws.rowCount; i++) if (String(ws.getCell(`C${i}`).value ?? '') === nom) return i;
  throw new Error('qator topilmadi: ' + nom);
}

describe('Сличительная ведомость — pereraschet modeli', () => {
  const { model } = qur();
  const m = (nom: string) => model.qatorlar.find((x) => x.nom === nom)!;

  it('к доплате / к снятию / tuzatish akti / noma‘lum — qator darajasida (fakt F-2 narxida − F-2)', () => {
    expect([m('ТРУД БЕТОН').doplataHajm, m('ТРУД БЕТОН').doplataSumma]).toEqual([10, 5000]);       // fakt 20 @500, F-2 10
    expect([m('БЕТОН В25').doplataHajm, m('БЕТОН В25').doplataSumma]).toEqual([4, 4000]);
    expect([m('КИРПИЧ').doplataHajm, m('КИРПИЧ').doplataSumma]).toEqual([-2, -4000]);              // F-2 > fakt: снятие
    expect([m('ПЕСОК КОРР').doplataHajm, m('ПЕСОК КОРР').doplataSumma]).toEqual([2, 200]);          // F-2 sof 8 (10 − 2 tuzatish)
    expect([m('МАТЕРИАЛ СТАРЫЙ').doplataHajm, m('МАТЕРИАЛ СТАРЫЙ').doplataSumma]).toEqual([0, 0]);
    expect([m('МАТЕРИАЛ НОВЫЙ').doplataHajm, m('МАТЕРИАЛ НОВЫЙ').doplataSumma]).toEqual([4, 14_000]);
    expect([m('ПЛИТКА ДОП').doplataHajm, m('ПЛИТКА ДОП').doplataSumma]).toEqual([1, 10_000]);
    expect([m('МАТЕРИАЛ БЕЗ ФАКТА').doplataHajm, m('МАТЕРИАЛ БЕЗ ФАКТА').doplataSumma]).toEqual([null, null]); // NULL ≠ 0
  });

  it('svod yaxlit bo‘lim: fakt taqsimlanmaydi (850, to‘g‘ri narx), F-2 aynan (600) — к доплате taqsimlanmagan fakt − F-2 (to‘g‘ri narx)', () => {
    const sv = model.qatorlar.filter((x) => x.yaxlitTaqsim != null);
    expect(sv).toHaveLength(2);
    expect(r2(sv.reduce((t, x) => t + (x.faktSumma ?? 0), 0))).toBe(850);
    expect(r2(sv.reduce((t, x) => t + x.f2Summa, 0))).toBe(600);
    expect(r2(sv.reduce((t, x) => t + (x.doplataSumma ?? 0), 0))).toBe(250);
  });

  it('pereraschet yakuni: + / − alohida, net = fakt − F-2, noma‘lum soni', () => {
    const p = model.pereraschet;
    expect(p.doplata).toBe(5000 + 4000 + 200 + 14_000 + 10_000 + 250);
    expect(p.snyatie).toBe(-4000);
    expect(r2(p.net)).toBe(r2(p.doplata + p.snyatie));
    expect(p.nomalum).toBeGreaterThanOrEqual(1);
    expect(model.diqqat.some((d) => d.nom.startsWith('МАТЕРИАЛ БЕЗ ФАКТА') && /нет данных о выполнении/.test(d.sabab))).toBe(true);
  });

  it('bo‘limlar: qo‘shimcha ish alohida «ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ» ildizida (smeta bo‘limidan ajratilgan); resurs-darajadagi joyida', () => {
    const roots = model.ildizlar.map((i) => model.qatorlar[i].nom);
    expect(roots[roots.length - 1]).toBe(`ИТОГО ПО РАЗДЕЛУ: ${QOSHIMCHA_BOLIM_NOMI}`);
    const dop = model.qatorlar.findIndex((x) => x.nom === 'ДОП РАБОТА ПЛИТКА');
    const asosiyItogo = model.qatorlar.findIndex((x) => x.nom === 'ИТОГО ПО РАЗДЕЛУ: СМЕТА 01 ОСНОВНАЯ');
    expect(dop).toBeGreaterThan(asosiyItogo);
    expect(model.qatorlar[model.ildizlar[model.ildizlar.length - 1]].bolalar).toContain(dop);
  });

  it('almashtirish: eski «исключается», yangi «взамен», o‘zaro bog‘langan', () => {
    expect(m('ПОЗИЦИЯ СТАРАЯ').izoh).toContain('исключается (заменена поз. ');
    expect(m('ПОЗИЦИЯ НОВАЯ ВЗАМЕН').izoh).toContain(`взамен поз. ${m('ПОЗИЦИЯ СТАРАЯ').tartib}`);
    expect(m('ПОЗИЦИЯ СТАРАЯ').izoh).toContain(m('ПОЗИЦИЯ НОВАЯ ВЗАМЕН').tartib);
    expect(m('ПОЗИЦИЯ СТАРАЯ').faktHajm).toBe(0);
    expect(m('ПОЗИЦИЯ СТАРАЯ').farqHajm).toBe(-4);
  });

  it('заменяемая позиция, fakt ≠ 0 — diqqatda (jim o‘tmaydi)', () => {
    const H = HOLAT.map((x) => (x.qator_id === 7 ? h(7, 1, 0) : x));
    const mm = slichitelniyModeli(DARAXT, H, { svodYaxlit: SVOD });
    expect(mm.diqqat.some((d) => /исключается/.test(d.sabab) && d.nom.startsWith('ПОЗИЦИЯ СТАРАЯ'))).toBe(true);
  });

  it('F-2 summasi noma‘lum (NULL) — к доплате bo‘sh, diqqatda; 0 emas', () => {
    const H = HOLAT.map((x) => (x.qator_id === 14 ? h(14, 10, 8, null) : x));
    const mm = slichitelniyModeli(DARAXT, H, { svodYaxlit: SVOD });
    const r = mm.qatorlar.find((x) => x.nom === 'ПЕСОК КОРР')!;
    expect([r.doplataSumma, r.nomalum]).toEqual([null, 1]);
    expect(mm.diqqat.some((d) => d.nom.startsWith('ПЕСОК КОРР') && /Ф-2/.test(d.sabab))).toBe(true);
  });
});

describe('Сличительная ведомость — xlsx (exceljs bilan qayta o‘qildi)', () => {
  it('«Основание» (АОСР) ustuni yo‘q; yangi guruhlar sarlavhada; varaqlar: ведомость + Свод изменений', async () => {
    const { r } = qur();
    const wb = await yuk(r.bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual([ASOSIY, SVOD_V, 'Плюсы и минусы']);
    const ws = wb.getWorksheet(ASOSIY)!;
    const matn: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => { if (typeof c.value === 'string') matn.push(c.value); }));
    const hammasi = matn.join('\n');
    expect(hammasi).not.toMatch(/Основание \(АОСР/i);
    expect(hammasi).toContain('ПЕРЕРАСЧЕТ: К ДОПЛАТЕ (+) / К СНЯТИЮ (−) (ФАКТ − ПРЕДЪЯВЛЕНО ПО Ф-2)');
    expect(hammasi).toContain('РАНЕЕ ПРЕДЪЯВЛЕНО ПО Ф-2');
    expect(hammasi).toContain('ОТКЛОНЕНИЕ (ФАКТ − СМЕТА)');
    expect(hammasi).toContain(QOSHIMCHA_BOLIM_NOMI);
    expect(ws.getCell('S11').value).toBeDefined();
  });

  it('tana: har qatorda perereschet formulalari (N/O), ajratish U/V; ustamali / «к оплате» ustunlari YO‘Q', async () => {
    const { r, model } = qur();
    const wb = await yuk(r.bytes);
    const ws = wb.getWorksheet(ASOSIY)!;
    const f = (ref: string) => ({ formula: (ws.getCell(ref).value as { formula: string }).formula, result: keshOl(wb, ASOSIY, ref) });
    const n = qatorNomi(wb, 'ТРУД БЕТОН');
    expect(f(`N${n}`).formula).toBe(`IF(H${n}="","",ROUND(H${n}-J${n},6))`);
    expect(f(`O${n}`).formula).toBe(`IF(OR(I${n}="",K${n}=""),"",ROUND(I${n}-K${n},2))`);
    expect(f(`N${n}`).result).toBe(10);
    expect(f(`O${n}`).result).toBe(5000);
    expect(f(`U${n}`).formula).toBe(`IF(O${n}="","",MAX(O${n},0))`);
    expect(f(`V${n}`).formula).toBe(`IF(O${n}="","",MIN(O${n},0))`);
    expect(f(`U${n}`).result).toBe(5000);
    expect(f(`V${n}`).result).toBe(0);
    const k = qatorNomi(wb, 'КИРПИЧ');
    expect(f(`O${k}`).result).toBe(-4000);
    expect(f(`V${k}`).result).toBe(-4000);
    expect(f(`U${k}`).result).toBe(0);
    // noma'lum fakt — O bo'sh ('' natija), «ТРЕБУЮТ ВНИМАНИЯ» (Q) = 1, U/V bo'sh
    const z = qatorNomi(wb, 'МАТЕРИАЛ БЕЗ ФАКТА');
    expect(f(`O${z}`).result).toBe('');
    expect(f(`U${z}`).result).toBe('');
    expect(f(`Q${z}`).result).toBe(1);
    expect(model.pereraschet.nomalum).toBeGreaterThanOrEqual(1);
    // (d) tanada «к оплате» / накрутка / ustamali sarlavha yo'q; ko'rinadigan ustunlar 16 ta (A–P)
    const sarl = [9, 10].flatMap((i) => (ws.getRow(i).values as unknown[]).map((x) => String(x ?? '')));
    expect(sarl.join('|')).not.toMatch(/К ОПЛАТЕ|НАКЛАДН|НАКРУТ|С НАКРУТКОЙ/i);
    const korinadigan = ws.columns.filter((c) => !c.hidden).length;
    expect(korinadigan).toBe(16);
  });

  it('formula == kesh: hamma formulali katak mini-hisoblagich bilan qayta hisoblanadi (ikkala varaq, podval, Свод)', async () => {
    const { r } = qur();
    const wb = await yuk(r.bytes);
    const H = new Hisob(wb);
    let tekshirilgan = 0;
    const nomos: string[] = [];
    for (const ws of wb.worksheets) {
      ws.eachRow((row, rn) => row.eachCell((c) => {
        const v = c.value as unknown;
        if (!v || typeof v !== 'object' || !('formula' in (v as object))) return;
        const ref = `${c.address}`;
        let hisob: V;
        try { hisob = H.get(ws.name, ref); } catch (e) { H.unsupported.add(`${ws.name}!${ref}:${(e as Error).message}`); return; }
        const kesh = keshOl(wb, ws.name, ref);
        const a = hisob === null ? '' : hisob, b = kesh === null ? '' : kesh;
        tekshirilgan++;
        const teng = typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.0051 : a === b;
        if (!teng) nomos.push(`${ws.name}!${ref} (qator ${rn}): formula=${String(a)} kesh=${String(b)} :: ${(v as { formula: string }).formula.slice(0, 90)}`);
      }));
    }
    expect(H.unsupported.size, [...H.unsupported].slice(0, 5).join('\n')).toBe(0);
    expect(tekshirilgan).toBeGreaterThan(150);
    expect(nomos, nomos.slice(0, 8).join('\n')).toEqual([]);
  });

  it('(a) zamena asl qator tagida: izohlar, formula; qo‘shimcha bo‘lim; svod bo‘limi qatorlari formulali', async () => {
    const { r } = qur();
    const wb = await yuk(r.bytes);
    const ws = wb.getWorksheet(ASOSIY)!;
    const eski = qatorNomi(wb, 'ПОЗИЦИЯ СТАРАЯ'), yangi = qatorNomi(wb, 'ПОЗИЦИЯ НОВАЯ ВЗАМЕН');
    expect(String(ws.getCell(`P${eski}`).value)).toMatch(/ИСКЛЮЧАЕТСЯ \(ЗАМЕНЕНА ПОЗ\. \d/);
    expect(String(ws.getCell(`P${yangi}`).value)).toMatch(/ВЗАМЕН ПОЗ\. \d/);
    expect(ws.getCell(`H${eski}`).value).toBe(0);                  // fakt 0
    // zamena asl qatorning TAGIDA (eski bl → uning resursi → yangi bl): oraliq faqat asl resursi
    expect(yangi - eski).toBe(2);
    // asl qatorda smeta summasi ko'rinadi (formula), farq formulasi minusni beradi
    const eskiRes = qatorNomi(wb, 'МАТЕРИАЛ СТАРЫЙ');
    expect(typeof (ws.getCell(`G${eskiRes}`).value as { formula: string }).formula).toBe('string');
    expect(keshOl(wb, ASOSIY, `G${eskiRes}`)).toBe(12_000);
    expect(keshOl(wb, ASOSIY, `M${eskiRes}`)).toBe(-12_000);
    expect(typeof (ws.getCell(`M${eskiRes}`).value as { formula: string }).formula).toBe('string');
    const bolim = qatorNomi(wb, QOSHIMCHA_BOLIM_NOMI);
    expect(qatorNomi(wb, 'ДОП РАБОТА ПЛИТКА')).toBeGreaterThan(bolim);
    expect(qatorNomi(wb, 'ПЛИТКА ДОП')).toBeGreaterThan(bolim);
    expect(String(ws.getCell(`P${qatorNomi(wb, 'ДОП РАБОТА ПЛИТКА')}`).value)).toContain('ДОП. РАБОТА');
    // svod bo'limi qatorlari: fakt formula (hajm x narx), perereschet O formula (endi qiymat emas)
    const s = qatorNomi(wb, 'ТРУД СВОД');
    expect(typeof (ws.getCell(`I${s}`).value as { formula: string }).formula).toBe('string');
    expect(typeof (ws.getCell(`O${s}`).value as { formula: string }).formula).toBe('string');
    expect(String(ws.getCell(`P${s}`).value)).toMatch(/СПРАВОЧНО/);
  });

  it('(c) har summa katagi formula; tasdiqlangan F-2 (J/K) — aynan qiymat', async () => {
    const { r, model } = qur();
    const wb = await yuk(r.bytes);
    const ws = wb.getWorksheet(ASOSIY)!;
    let barglar = 0;
    model.qatorlar.forEach((q) => {
      if (q.tur !== 'barg') return;
      const n = ws.getRow(qatorNomi(wb, q.nom)).number; // qator
      for (const c of ['G', 'I', 'M', 'O']) {
        const v = ws.getCell(`${c}${n}`).value as unknown;
        if (q.faktServerdan && c === 'I') continue;
        expect(v && typeof v === 'object' && 'formula' in (v as object), `${q.nom} ${c}${n}`).toBe(true);
      }
      for (const c of ['J', 'K']) expect(typeof ws.getCell(`${c}${n}`).value !== 'object' || ws.getCell(`${c}${n}`).value === null, `${q.nom} ${c}${n} qiymat`).toBe(true);
      barglar++;
    });
    expect(barglar).toBeGreaterThanOrEqual(10);
    // bo'lim / ИТОГО / ВСЕГО jamilari ham formula
    const vs = qatorNomi(wb, 'ИТОГО ПО ОБЪЕКТУ: ПРЯМЫЕ ЗАТРАТЫ (БЕЗ НАКЛАДНЫХ И НДС, БЕЗ РАЗДЕЛОВ ПО СВОДУ)');
    for (const c of ['G', 'I', 'K', 'M', 'O']) expect(typeof (ws.getCell(`${c}${vs}`).value as { formula: string }).formula).toBe('string');
  });

  it('(b) svod bo‘limi bir marta: tana jami svodsiz, yaxlit summa faqat podvalda (bitta katak)', async () => {
    const { r, model } = qur();
    const wb = await yuk(r.bytes);
    const ws = wb.getWorksheet(ASOSIY)!;
    // tana jami: svod qatorlari kirmaydi (fakt: svodsiz 7500+… ; svod fakti 850 alohida)
    const vs = qatorNomi(wb, 'ИТОГО ПО ОБЪЕКТУ: ПРЯМЫЕ ЗАТРАТЫ (БЕЗ НАКЛАДНЫХ И НДС, БЕЗ РАЗДЕЛОВ ПО СВОДУ)');
    expect(keshOl(wb, ASOSIY, `I${vs}`)).toBe(model.tana.fakt);
    expect(model.jami.fakt).toBe(r2((model.tana.fakt ?? 0) + 850));
    expect(model.svodIldizlar).toHaveLength(1);
    // yaxlit svod summasi (QQS bilan 1344) butun varaqda G ustunida FAQAT BIR marta (podval yaxlit qatori)
    let marta = 0;
    for (let i = 1; i <= ws.rowCount; i++) if (keshOl(wb, ASOSIY, `G${i}`) === 1344) marta++;
    expect(marta).toBe(1);
    // svod qatorlari tanada to'g'ri narxda (1000 / 850 / 600) va jamilarga kirmaydi
    const s = qatorNomi(wb, 'ТРУД СВОД');
    expect(keshOl(wb, ASOSIY, `I${s}`)).toBe(150);
  });

  it('(e) podval ВСЕГО = yadro hisobi (smeta / fakt / Ф-2 / otklonenie / perereschet ustunlari; svod bir marta)', async () => {
    const { r, model } = qur();
    const wb = await yuk(r.bytes);
    const ws = wb.getWorksheet(ASOSIY)!;
    const vsegoRow = qatorNomi(wb, 'ВСЕГО К ОПЛАТЕ (С НАКЛАДНЫМИ РАСХОДАМИ И НДС)');
    const kat = (q: (typeof model.qatorlar)[number]) => q.kat as string | null;
    const bo = Object.fromEntries(['G', 'I', 'K', 'M', 'O'].map((c) => {
      const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as Record<string, number>;
      for (const q of model.qatorlar) {
        if (q.tur !== 'barg' || !kat(q)) continue;
        const svodMeh = q.yaxlitTaqsim != null && (kat(q) === 'ЧЕЛ' || kat(q) === 'МАШ');
        if (q.yaxlitTaqsim != null && (c === 'G' || !svodMeh)) continue;
        const val = c === 'G' ? q.smetaSumma : c === 'I' ? q.faktSumma : c === 'K' ? q.f2Summa : c === 'M' ? (q.yaxlitTaqsim != null ? q.faktSumma : q.farqSumma) : q.doplataSumma;
        if (val != null) ks[kat(q)!] += val;
      }
      return [c, ks];
    }));
    const podval = standartPodval(NK);
    const yaxK = (x: number) => r2(x * 1.12);
    const yaxlit: Record<string, number> = { G: 1344, I: yaxK(700), K: yaxK(500), M: 0, O: yaxK(200) };
    for (const c of ['G', 'I', 'K', 'M', 'O']) {
      const nat = kaskad(bo[c] as never, podval, { asosiy: c === 'G', yaxlit: { qqsBilan: yaxlit[c] } });
      expect(keshOl(wb, ASOSIY, `${c}${vsegoRow}`), `ВСЕГО ${c}`).toBeCloseTo(nat.vsego as number, 2);
    }
    expect(vsegoRow).toBeGreaterThan(0);
    let sq = 0; for (let i = 1; i <= ws.rowCount; i++) if (String(ws.getCell(`C${i}`).value ?? '').startsWith('РАЗДЕЛЫ ПО СВОДУ ЦЕЛОЙ')) sq = i;
    expect(sq).toBeGreaterThan(0);
    expect(ws.getCell(`M${sq}`).value ?? null).toBeNull();
    expect(keshOl(wb, ASOSIY, `G${sq}`)).toBe(1344);
  });

  it('Свод изменений: до → исключаемые → замена → доп → после (formulalar), bo‘limlar, svod bir marta, podval jami; formula = kesh', async () => {
    const { r, model } = qur();
    const wb = await yuk(r.bytes);
    const ws = wb.getWorksheet(SVOD_V)!;
    const H = new Hisob(wb);
    const rowOf = (pref: string): number => { let x = 0; ws.eachRow((row, rn) => { if (String(row.getCell(2).value ?? '').toUpperCase().startsWith(pref.toUpperCase())) x = rn; }); return x; };
    const v = (c: string, rn: number) => Number(H.get(SVOD_V, `${c}${rn}`));
    const oz = ozgarishSvodi(model);
    const dorow = rowOf('Смета до изменений'), a = rowOf('(а) Замена'), b = rowOf('(б) Замена'), vv = rowOf('(в) Дополнительные'), posle = rowOf('СМЕТА ПОСЛЕ ИЗМЕНЕНИЙ');
    expect([dorow, a, b, vv, posle].every((x) => x > 0)).toBe(true);
    expect(a).toBe(dorow + 1); expect(b).toBe(a + 1); expect(vv).toBe(b + 1); expect(posle).toBe(vv + 1);
    expect(typeof (ws.getCell(`C${dorow}`).value as { formula: string }).formula).toBe('string');
    expect(r2(v('C', dorow))).toBe(oz.asl.reja);
    expect(r2(v('C', a))).toBe(oz.istisno.reja);          // minus
    expect(oz.istisno.reja).toBeLessThan(0);
    expect(r2(v('C', b))).toBe(oz.zamena.reja);
    expect(r2(v('C', vv))).toBe(oz.qoshimcha.reja);
    expect(r2(v('C', posle))).toBe(oz.keyin.reja);
    expect(r2(v('D', posle))).toBe(oz.keyin.fakt);
    expect(r2(v('H', posle))).toBe(oz.keyin.doplata);
    // bo'limlar (svodsiz) jami = tana
    const pry = rowOf('ИТОГО: ПРЯМЫЕ ЗАТРАТЫ');
    expect(r2(v('C', pry))).toBe(model.tana.smeta);
    expect(r2(v('D', pry))).toBe(model.tana.fakt);
    expect(r2(v('E', pry))).toBe(model.tana.f2);
    // svod: bir qator, perereschet to'g'ri narxda (to'g'ri farq 250); smeta katagi bo'sh
    const sv = rowOf('РАЗДЕЛ ПО СВОДУ:');
    expect(sv).toBeGreaterThan(0);
    expect(r2(v('H', sv))).toBe(250);
    expect(ws.getCell(`C${sv}`).value).toBeNull();
    // podval jami (ustama + QQS bilan) asosiy varaq podvalidan havola
    const pod = rowOf('ВСЕГО ПО ПОДВАЛУ');
    expect(typeof (ws.getCell(`C${pod}`).value as { formula: string }).formula).toBe('string');
    expect(rowOf('в том числе: разделы по своду')).toBe(pod + 1);
    expect(v('C', pod + 1)).toBe(1344);
  });

  it('(7) «bajarilmadi» va исключаемые — hujjatda o‘z joyida belgisi bilan, smeta ko‘rinadi, fakt 0, farq minus; bekor F-2 lar jamiga kirmaydi', async () => {
    const rows = [...DARAXT, q(40, 1, 'bl', 2, 'НЕ ВЫПОЛНЕНО БЛОК'), q(41, 40, 'mat', 2, 'НЕ ВЫПОЛНЕНО МАТ', { kat: 'МАТ', narx: 5000 })];
    const holat = [...HOLAT, h(40, 0), h(41, 0)];
    const model = slichitelniyModeli(rows, holat, { svodYaxlit: SVOD, bajarilmadiIdlar: new Set([40, 41]) });
    const bytes = slichitelniyHujjatXlsx(model, { obyektNomi: 'Объект', sana: '2026-11-14', nakrutka: NK, svodYaxlit: SVOD, yaxlitIdlar: yaxlitQatorIdlari(rows, SVOD),
      bekorAktlar: [{ nomer: '№ 7', sana: '2026-10-01', summa: 123, almashtirgan: '№ 8', sabab: 'исправлен' }] }).bytes;
    const wb = await yuk(bytes);
    const ws = wb.getWorksheet(ASOSIY)!;
    const n = qatorNomi(wb, 'НЕ ВЫПОЛНЕНО МАТ');
    expect(String(ws.getCell(`P${n}`).value)).toContain('НЕ ВЫПОЛНЯЕТСЯ');
    expect(keshOl(wb, ASOSIY, `G${n}`)).toBe(10_000);   // smeta ko'rinadi
    expect(keshOl(wb, ASOSIY, `I${n}`)).toBe(0);        // fakt 0
    expect(keshOl(wb, ASOSIY, `M${n}`)).toBe(-10_000);  // farq formulasi minus
    expect(typeof (ws.getCell(`M${n}`).value as { formula: string }).formula).toBe('string');
    // «Свод изменений»: alohida ro'yxat qatori
    const sv = wb.getWorksheet(SVOD_V)!;
    const matn: string[] = [];
    sv.eachRow((row) => matn.push(String(row.getCell(2).value ?? '')));
    expect(matn.some((s) => s.startsWith('НЕ ВЫПОЛНЯЕТСЯ (ОТМЕЧЕНО'))).toBe(true);
    expect(matn.some((s) => s.startsWith('ИСКЛЮЧАЕТСЯ (ЗАМЕНЕНО'))).toBe(true);
    // bekor F-2: alohida varaq, jamiga kirmaydi
    expect(wb.worksheets.map((w) => w.name)).toContain('Отмененные Ф-2');
    const bk = wb.getWorksheet('Отмененные Ф-2')!;
    const bt: string[] = [];
    bk.eachRow((row) => row.eachCell((c) => bt.push(String(c.value ?? ''))));
    expect(bt.join('|')).toContain('№ 8');
    expect(bt.join('|')).toContain('СПРАВОЧНО');
    const vs = qatorNomi(wb, 'ИТОГО ПО ОБЪЕКТУ: ПРЯМЫЕ ЗАТРАТЫ (БЕЗ НАКЛАДНЫХ И НДС, БЕЗ РАЗДЕЛОВ ПО СВОДУ)');
    expect(keshOl(wb, ASOSIY, `K${vs}`)).toBe(model.tana.f2);
  });

  it('NULL ≠ 0: fakt noma‘lum qatori jamilarni «ТРЕБУЮТ ВНИМАНИЯ» ga o‘tkazadi, Свод da izoh «Итог неполный»', async () => {
    const { r } = qur();
    const wb = await yuk(r.bytes);
    const ws = wb.getWorksheet(SVOD_V)!;
    let izoh = '';
    ws.eachRow((row) => { const t = String(row.getCell(1).value ?? ''); if (t.startsWith('Итог неполный')) izoh = t; });
    expect(izoh).toMatch(/позиций, требующих внимания/);
    const asosiy = wb.getWorksheet(ASOSIY)!;
    const txt: string[] = [];
    asosiy.eachRow((row) => { const t = String(row.getCell(1).value ?? ''); if (t) txt.push(t); });
    expect(txt.some((t) => t.startsWith('ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ'))).toBe(true);
  });

  it('sof F-2 = fakt (qo‘shimcha/zamena yo‘q, barchasi teng) — к доплате 0, kesh formulaga teng', async () => {
    const rows = DARAXT.filter((x) => x.id === 1 || x.id === 13 || x.id === 14);
    const holat = [h(13, 10, 10), h(14, 10, 10, 1000)];
    const model = slichitelniyModeli(rows, holat);
    expect(model.pereraschet).toMatchObject({ doplata: 0, snyatie: 0, net: 0, nomalum: 0 });
    const bytes = slichitelniyHujjatXlsx(model, { obyektNomi: 'Объект', sana: '2026-11-14', nakrutka: NK }).bytes;
    const wb = await yuk(bytes);
    const H = new Hisob(wb);
    const ws = wb.getWorksheet(ASOSIY)!;
    const n = qatorNomi(wb, 'ПЕСОК КОРР');
    expect(H.get(ASOSIY, `T${n}`)).toBe(0);
    expect(keshOl(wb, ASOSIY, `T${n}`)).toBe(0);
  });
});

describe('bekorAktlarQur (t2_akt: cancelled + correction_of_akt_id)', () => {
  it('bekor akt: raqam, sana, almashtirgan akt, sabab; bekor emas — kirmaydi', async () => {
    const { bekorAktlarQur } = await import('./oylik-hujjat/ostatka-slichitelniy');
    const r = bekorAktlarQur([
      { id: 1, raqam: '7', oy: '2026-10-01', lifecycle_status: 'cancelled', lifecycle_reason: 'ошибка', hujjat_jami: 100 },
      { id: 2, raqam: '8', oy: '2026-10-01', lifecycle_status: 'approved', correction_of_akt_id: 1 },
      { id: 3, raqam: '9', oy: '2026-11-01', lifecycle_status: 'approved' },
    ]);
    expect(r).toEqual([{ nomer: '№ 7', sana: '2026-10-01', summa: 100, almashtirgan: '№ 8', sabab: 'ошибка' }]);
  });
});
