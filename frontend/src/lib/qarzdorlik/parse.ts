/**
 * Qarzdorlik Excel importi (parser) - ikki format:
 *   1) «shablon»  - egasining «ОБОСНОВАНИЕ ЗАДОЛЖЕННОСТИ» shabloni: ko'k qator = pozitsiya (shartnoma), ostida asos qatorlari
 *      (nakladnoy / akt / to'lov). Ustunlar sarlavha matni bo'yicha topiladi (tartib muhim emas).
 *   2) «spravka»  - finansoviy spravka: Наименование, Контрагент, Договор сумма, Оплата, Факт задолженность, прогноз.
 * Parser TOZA: katakchalar to'ri (`Grid`) bilan ishlaydi; fayl o'qish - readWorkbookGrids() (exceljs, faqat brauzer/Node).
 * Hamma summa QQS bilan; minus ruxsat; bo'sh/noma'lum = NULL (0 emas).
 */
import type { AsosQator, AsosTur } from './hisob';
import { qatorSumma } from './hisob';

export type Cell = string | number | Date | null | undefined;
export type Grid = Cell[][];

export type ImportShartnoma = {
  kontragent: string;
  inn?: string | null;
  turi: 'postavshik' | 'subpudrat' | 'xizmat';
  raqam: string;
  sana: string | null;
  nom: string | null;
  predmet: string | null;
  summa: number | null;
  spravka: { qarz: number | null; tolangan: number | null; prognoz: number | null; sana: string | null } | null;
  qatorlar: AsosQator[];
  /** Foydalanuvchiga ko'rsatiladigan izohlar (parser qarori: raqam yaratildi, namuna o'tkazildi ...). */
  eslatmalar: string[];
};

export type ImportNatija = {
  format: 'shablon' | 'spravka' | null;
  shartnomalar: ImportShartnoma[];
  /** Saqlanishiga to'sqinlik qiluvchi xatolar (shu qator o'tkazib yuboriladi). */
  xatolar: string[];
};

export type ParseSozlama = { turi?: ImportShartnoma['turi']; spravkaSana?: string | null };

/* ---------- yordamchilar ---------- */

const matn = (c: Cell): string => {
  if (c == null) return '';
  if (c instanceof Date) return '';
  return String(c).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
};

/** "1 250 000,50" / 1250000.5 / "–" / "" -> son yoki null. */
export function sonOl(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  if (c == null || c instanceof Date) return null;
  const s = String(c).replace(/[\s ]/g, '').replace(/[−–—]/g, '-').replace(',', '.');
  if (!s || s === '-' || s === '.') return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Tush vaqti (12:00Z) shu kunda qoladi; mahalliy yarim tun (UTC+5 da 19:00Z oldingi kun) keyingi kunga o‘tadi. */
const SANA_SILJISH = 12 * 3600e3 - 60e3;

/** Sana: Date (tushlik siljishi bilan - vaqt mintaqasi farqi kunni buzmasin), "dd.mm.yyyy", "yyyy-mm-dd" -> "yyyy-mm-dd". */
export function sanaOl(c: Cell): string | null {
  if (c instanceof Date) {
    if (Number.isNaN(c.getTime())) return null;
    return new Date(c.getTime() + SANA_SILJISH).toISOString().slice(0, 10);
  }
  if (typeof c === 'number') {
    if (c > 20000 && c < 80000) return new Date(Math.round((c - 25569) * 86400e3) + SANA_SILJISH).toISOString().slice(0, 10);
    return null;
  }
  const s = matn(c);
  let m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Deterministik qisqa kalit (FNV-1a) - raqamsiz shartnomalar uchun takroriy importda bir xil raqam. */
export function qisqaKalit(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/** Matndan shartnoma raqami: «Договор № 45-A», «shartnoma N 12». */
export function raqamTopish(s: string): string | null {
  const m = /(?:договор|контракт|шартнома|shartnoma|contract)[^\d№nN]{0,12}(?:№|n|N)\s*([\p{L}\d][\p{L}\d\-/._]*)/iu.exec(s);
  return m ? m[1].replace(/[.,;]+$/, '') : null;
}

function turiAniq(sozlama: ParseSozlama, ...matnlar: string[]): ImportShartnoma['turi'] {
  const t = norm(matnlar.join(' '));
  if (/субподряд|subpudrat|подряд/.test(t)) return 'subpudrat';
  return sozlama.turi ?? 'postavshik';
}

const TOTAL_RE = /итого|всего|jami|total|умумий/i;

/* ---------- format aniqlash ---------- */

type Sarlavha = { qator: number; format: 'shablon' | 'spravka'; ustun: Record<string, number> };

function sarlavhaTopish(grid: Grid): Sarlavha | null {
  const lim = Math.min(grid.length, 25);
  for (let r = 0; r < lim; r++) {
    const row = grid[r] ?? [];
    const cells = row.map((c) => norm(matn(c)));
    const idx = (re: RegExp) => cells.findIndex((c) => c !== '' && re.test(c));
    // 1) egasining shabloni: «Поставлено / выполнено» + «Оплачено»
    const yetk = idx(/поставлено|выполнено/); const tolov = idx(/^оплачено/);
    if (yetk >= 0 && tolov >= 0) {
      const ustun: Record<string, number> = { yetk, tolov };
      const q = (k: string, re: RegExp) => { const i = idx(re); if (i >= 0) ustun[k] = i; };
      q('nom', /наименован/); q('kontragent', /контрагент/); q('sana', /^дата/); q('birlik', /ед\.? ?изм/); q('hajm', /кол-?во/);
      q('narx', /^цена/); q('shartnoma', /сумма договора/); q('izoh', /примечан/); q('tip', /^тип$/); q('spravka', /справк/);
      const aj = cells.findIndex((c) => c === '№' || c === 'n' || c === 'no'); ustun.raqam = aj >= 0 ? aj : 0;
      if (ustun.nom == null) ustun.nom = 1; if (ustun.kontragent == null) ustun.kontragent = 2;
      return { qator: r, format: 'shablon', ustun };
    }
    // 2) finansoviy spravka
    const kon = idx(/контрагент/); const dog = idx(/договор/); const opl = idx(/оплат/); const zad = idx(/задолж/);
    if (kon >= 0 && dog >= 0 && opl >= 0 && zad >= 0) {
      const ustun: Record<string, number> = { kontragent: kon, shartnoma: dog, tolov: opl, qarz: zad };
      const nm = idx(/наименован/); if (nm >= 0) ustun.nom = nm;
      const pr = idx(/прогноз/); if (pr >= 0) ustun.prognoz = pr;
      return { qator: r, format: 'spravka', ustun };
    }
  }
  return null;
}

/* ---------- shablon ---------- */

function asosTuri(...matnlar: string[]): AsosTur {
  const t = norm(matnlar.join(' '));
  if (/начальн|сальдо|остаток|boshlang|ochilish/.test(t)) return 'boshlangich_qoldiq';
  if (/(?:^|[^а-яё])акт[а-яё]{0,2}(?![а-яё])|выполнен|работ|bajar/.test(t)) return 'bajarilgan_ish';
  return 'yetkazib_berish';
}

function parseShablon(grid: Grid, h: Sarlavha, sozlama: ParseSozlama): ImportNatija {
  const u = h.ustun;
  const get = (row: Cell[], k: string): Cell => (u[k] == null ? undefined : row[u[k]]);
  const out: ImportShartnoma[] = [];
  const xatolar: string[] = [];
  const korilgan = new Map<string, number>();
  let joriy: ImportShartnoma | null = null; // null = o'tkazib yuborilgan/bo'sh pozitsiya

  for (let r = h.qator + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const belgi = matn(row[u.raqam]);
    if (TOTAL_RE.test(belgi) || TOTAL_RE.test(matn(row[u.nom]))) continue;
    const tip = matn(get(row, 'tip')).toUpperCase().replace('P', 'П').replace('O', 'О'); // lotin P/O -> kirill
    const nom = matn(get(row, 'nom'));
    const kontragent = matn(get(row, 'kontragent'));
    const izoh = matn(get(row, 'izoh'));
    const shSumma = sonOl(get(row, 'shartnoma'));
    const yetkV = sonOl(get(row, 'yetk')); const tolovV = sonOl(get(row, 'tolov'));
    const hajm = sonOl(get(row, 'hajm')); const narx = sonOl(get(row, 'narx'));
    const sana = sanaOl(get(row, 'sana')); const birlik = matn(get(row, 'birlik'));
    const spravkaV = sonOl(get(row, 'spravka'));
    const pozitsiya = tip === 'П' ? true : tip === 'О' ? false : !belgi.includes('.') && belgi !== '';
    const bosh = !nom && !kontragent && shSumma == null && !yetkV && !tolovV && hajm == null && narx == null && !sana;

    if (pozitsiya) {
      joriy = null;
      if (bosh || (!nom && !kontragent)) continue; // to'ldirilmagan shablon pozitsiyasi
      if (/пример|namuna|example/i.test(nom + ' ' + izoh)) continue; // shablon namunasi
      if (!kontragent) { xatolar.push(`${r + 1}-qator (${belgi || '?'}-pozitsiya): kontragent ko‘rsatilmagan - o‘tkazib yuborildi`); continue; }
      const eslatmalar: string[] = [];
      let raqam = raqamTopish(`${nom} ${izoh}`);
      if (!raqam) {
        const kal = `${norm(kontragent)}|${norm(nom)}`;
        const n = (korilgan.get(kal) ?? 0) + 1; korilgan.set(kal, n);
        raqam = `PZ-${qisqaKalit(kal)}${n > 1 ? `-${n}` : ''}`;
        eslatmalar.push('Shartnoma raqami faylda yo‘q - avtomatik kalit berildi');
      }
      joriy = {
        kontragent, turi: turiAniq(sozlama, nom, kontragent), raqam, sana: null, nom: nom || null, predmet: nom || null, summa: shSumma,
        spravka: spravkaV != null ? { qarz: spravkaV, tolangan: null, prognoz: null, sana: sozlama.spravkaSana ?? null } : null,
        qatorlar: [], eslatmalar,
      };
      out.push(joriy);
      continue;
    }

    // asos qatori
    if (bosh) continue;
    if (!joriy) continue; // o'tkazib yuborilgan pozitsiya asoslari
    const hujjat = matn(get(row, 'kontragent')) || null; // «Контрагент / документ-основание» ustuni
    const nomi = nom || null;
    const buq = (tur: AsosTur, summa: number | null): AsosQator => ({
      tur, hujjat_raqam: hujjat, sana, nomi, birlik: birlik || null, hajm, narx, summa, izoh: izoh || null,
    });
    const yetkNol = yetkV == null || yetkV === 0;
    const tolovNol = tolovV == null || tolovV === 0;
    if (!tolovNol && yetkNol) {
      joriy.qatorlar.push({ ...buq('tolov', tolovV), hajm: null, narx: null, birlik: null });
    } else {
      const hisob = qatorSumma({ summa: null, hajm, narx });
      const summa = !yetkNol ? yetkV : hisob;
      joriy.qatorlar.push(buq(asosTuri(nom, hujjat ?? ''), summa));
      if (!tolovNol) joriy.qatorlar.push({ ...buq('tolov', tolovV), hajm: null, narx: null, birlik: null });
    }
  }
  return { format: 'shablon', shartnomalar: out, xatolar };
}

/* ---------- spravka ---------- */

function parseSpravka(grid: Grid, h: Sarlavha, sozlama: ParseSozlama): ImportNatija {
  const u = h.ustun;
  const out: ImportShartnoma[] = [];
  const xatolar: string[] = [];
  const korilgan = new Map<string, number>();
  for (let r = h.qator + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const nom = u.nom == null ? '' : matn(row[u.nom]);
    let kontragent = matn(row[u.kontragent]);
    const summa = sonOl(row[u.shartnoma]); const tolangan = sonOl(row[u.tolov]); const qarz = sonOl(row[u.qarz]);
    const prognoz = u.prognoz == null ? null : sonOl(row[u.prognoz]);
    if (!nom && !kontragent && summa == null && tolangan == null && qarz == null && prognoz == null) continue;
    if (TOTAL_RE.test(nom) || TOTAL_RE.test(kontragent)) continue;
    if (!kontragent) kontragent = nom;
    if (!kontragent) { xatolar.push(`${r + 1}-qator: kontragent ko‘rsatilmagan - o‘tkazib yuborildi`); continue; }
    const kal = `${norm(kontragent)}|${norm(nom)}`;
    const n = (korilgan.get(kal) ?? 0) + 1; korilgan.set(kal, n);
    const raqam = raqamTopish(nom) ?? `SPR-${qisqaKalit(kal)}${n > 1 ? `-${n}` : ''}`;
    out.push({
      kontragent, turi: turiAniq(sozlama, nom, kontragent), raqam, sana: null, nom: nom || null, predmet: nom || null, summa,
      spravka: { qarz, tolangan, prognoz, sana: sozlama.spravkaSana ?? null }, qatorlar: [],
      eslatmalar: ['Faqat spravka: asos qatorlari yo‘q - FARQ asos kiritilgach hisoblanadi'],
    });
  }
  return { format: 'spravka', shartnomalar: out, xatolar };
}

/** Bitta varaq (katakchalar to'ri) -> import tuzilmasi. Format sarlavhadan aniqlanadi. */
export function parseGrid(grid: Grid, sozlama: ParseSozlama = {}): ImportNatija {
  const h = sarlavhaTopish(grid);
  if (!h) return { format: null, shartnomalar: [], xatolar: ['Fayl formati tanilmadi: «Поставлено / выполнено» + «Оплачено» (shablon) yoki «Контрагент / Договор / Оплата / Факт задолженность» (spravka) sarlavhasi topilmadi.'] };
  return h.format === 'shablon' ? parseShablon(grid, h, sozlama) : parseSpravka(grid, h, sozlama);
}

/** Bir nechta varaq: birinchi taniladigan varaq olinadi. */
export function parseVaraqlar(varaqlar: ReadonlyArray<{ nom: string; grid: Grid }>, sozlama: ParseSozlama = {}): ImportNatija & { varaq: string | null } {
  for (const v of varaqlar) {
    const n = parseGrid(v.grid, sozlama);
    if (n.format) return { ...n, varaq: v.nom };
  }
  return { format: null, shartnomalar: [], varaq: null, xatolar: varaqlar.length ? parseGrid(varaqlar[0].grid, sozlama).xatolar : ['Fayl bo‘sh.'] };
}

/** RPC (t2_qarzdorlik_import_v1) uchun yuk. */
export function importYuk(sh: ReadonlyArray<ImportShartnoma>) {
  return sh.map((s) => ({
    kontragent: s.kontragent, inn: s.inn ?? null, turi: s.turi, raqam: s.raqam, sana: s.sana, nom: s.nom, predmet: s.predmet, summa: s.summa,
    ...(s.spravka ? { spravka: s.spravka } : {}),
    qatorlar: s.qatorlar.map((q) => ({
      tur: q.tur, hujjat_raqam: q.hujjat_raqam, sana: q.sana, nomi: q.nomi, birlik: q.birlik, hajm: q.hajm, narx: q.narx, summa: qatorSumma(q), izoh: q.izoh,
    })),
  }));
}

/* ---------- fayl o'qish (exceljs) ---------- */

type CellValueLike = unknown;
function katak(v: CellValueLike): Cell {
  if (v == null) return null;
  if (v instanceof Date || typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return katak(o.result);
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text?: string }>).map((x) => x.text ?? '').join('');
    if (typeof o.text === 'string') return o.text;
    if ('error' in o) return null;
  }
  return null;
}

/** .xlsx fayl -> varaqlar (formulalar natijasi bilan). exceljs og'ir - faqat kerak bo'lganda yuklanadi. */
export async function readWorkbookGrids(buf: ArrayBuffer): Promise<Array<{ nom: string; grid: Grid }>> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets.map((ws) => {
    const grid: Grid = [];
    ws.eachRow({ includeEmpty: true }, (row, rn) => {
      const arr: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (c, cn) => { arr[cn - 1] = katak(c.value); });
      grid[rn - 1] = arr;
    });
    for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
    return { nom: ws.name, grid };
  });
}
