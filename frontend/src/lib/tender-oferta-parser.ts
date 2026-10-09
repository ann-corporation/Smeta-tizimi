import type { SheetGrid, XlsxWorkbook } from './f2-import-parse';
import type { T2ResursKategoriya } from '../api/supabase';
import type { OfertaKategoriya, OfertaKategoriyaManbasi, OfertaMalumKategoriya, OfertaQator, OfertaRol } from './tender-oferta';
import { podvalBlokTuri, resBolimKategoriya, resursMkKabAniqla } from './res-kategoriya';
import { sarlavhaBlokiniTop, uchlikniMoslashtir, ustunXaritasi, type Katak, type UstunXaritasi } from './smeta-anatomiya';
import { varaqniTahlilQil } from './smeta-anatomiya/varaq';
import { varaqRoliniAniqla } from './smeta-anatomiya/rol';

export type OfertaSheetRole = 'res' | 'lrv' | 'transport' | 'unknown';
export type OfertaSheetConfidence = 'yuqori' | 'o‘rta' | 'past';
export type OfertaManbaFormati = 'abc' | 'tn' | 'noma’lum';

export type OfertaResursUstunlar = {
  tartib: number;
  shifr: number;
  nom: number;
  birlik: number;
  hajm: number;
  smetaNarx: number;
  smetaSumma: number;
  sarlavhaBoshlanishi: number;
  malumotBoshlanishi: number;
};

export type OfertaSheetTahlili = {
  nom: string;
  role: OfertaSheetRole;
  format: OfertaManbaFormati;
  confidence: OfertaSheetConfidence;
  evidence: string[];
  resScore: number;
  lrvScore: number;
  ustunlar: OfertaResursUstunlar | null;
  qatorlar: OfertaQator[];
  skippedRows: number;
  /** Bir fayldagi ayni RES jadvalining alternativ ko‘rinishi (masalan RES_A).
   * Ikkalasi birga tanlansa, bitta resurs ikki marta hisoblanib ketadi. */
  alternativVaraq?: string;
  /** Excelda yashirin varaq — odatda eski davr qoralamasi; sukut bo‘yicha tanlanmaydi. */
  yashirin?: boolean;
  /** Yagona smeta anatomiyasi (smeta-anatomiya) bergan ustun xaritasi va Oferta
   * ustunlari bilan solishtiruv. `mos: false` — farq bor, `farqlar` da qaysi
   * ustun (real korpus bilan anatomiyaga to'liq o'tishdan oldingi dalil). */
  anatomiya?: { ustunlar: UstunXaritasi | null; mos: boolean; farqlar: string[] };
};

const text = (value: unknown): string => String(value ?? '').replace(/Ё/g, 'Е').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const upper = (value: unknown): string => text(value).toUpperCase();

function normal(v: unknown): string {
  return upper(v).replace(/№/g, ' NO ').replace(/[«»“”"'`.,:;()[\]{}\\/|_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function numberValue(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  let raw = String(value).replace(/[\s\u00a0]/g, '').replace(',', '.').replace(/%$/, '');
  if (/^\(.*\)$/.test(raw)) raw = '-' + raw.slice(1, -1);
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function safeRows(rows: SheetGrid | null | undefined): SheetGrid {
  return Array.isArray(rows) ? rows.map((row) => Array.isArray(row) ? row : []) : [];
}

function maxCols(rows: SheetGrid): number {
  return rows.slice(0, 100).reduce((max, row) => Math.max(max, row.length), 0);
}

/** Ikki va undan ko'p son katakli satr — ma'lumot, sarlavha emas (kod ustunidagi
 * "ЦЕНА" kabi qiymat sarlavhaga qo'shilib, kod ustunini narx ustuni qilib qo'yardi).
 * smeta-anatomiya/ustun.ts dagi chegara bilan bir xil qoida. */
function isDataLikeRow(row: readonly unknown[]): boolean {
  return row.filter((cell) => typeof cell === 'number' || (text(cell) !== '' && numberValue(cell) != null)).length >= 2;
}

function columnHeader(rows: SheetGrid, start: number, end: number, col: number): string {
  return rows.slice(start, end + 1).filter((row) => {
    if (isDataLikeRow(row)) return false;
    const rowText = row.map(normal).join(' ');
    const standaloneTotal = /^(ИТОГО|ВСЕГО|JAMI|ЖАМИ|TOTAL)\b/.test(rowText);
    return !standaloneTotal && /(НАИМЕНОВАНИЕ|РЕСУРС|RESURS|RESOURCE|ЕДИНИЦ|ЕД ИЗМ|БИРЛИК|BIRLIK|UNIT|НА ЕД|ЗА ОДИН|ЦЕНА|НАРХ|NARX|СТОИМОСТ|КОЛИЧЕСТВ|ОБЪЕМ|ҲАЖМ|ХАЖМ|HAJM|MIQDOR|ШИФР|SHIFR|КОД|CODE|СУММА|SUMMA|ОБЩАЯ|НА ВЕСЬ ОБЪЕМ|TOTAL|Т\/КМ)/.test(rowText);
  }).map((row) => normal(row[col])).filter(Boolean).join(' ');
}

function firstColumn(headers: readonly string[], patterns: readonly RegExp[], avoid: readonly RegExp[] = []): number {
  for (let i = 0; i < headers.length; i++) {
    if (patterns.some((p) => p.test(headers[i])) && !avoid.some((p) => p.test(headers[i]))) return i;
  }
  return -1;
}

const NAME_PRIMARY_PATTERNS = [/НАИМЕНОВАНИЕ/, /НАМЕНОВАН/, /НАЗВАНИЕ/];
const NAME_FALLBACK_PATTERNS = [/РЕСУРС/, /RESURS/, /RESOURCE/];
const NAME_PATTERNS = [...NAME_PRIMARY_PATTERNS, ...NAME_FALLBACK_PATTERNS];
const UNIT_PATTERNS = [/ЕДИНИЦ/, /ЕД ИЗМ/, /БИРЛИК/, /BIRLIK/, /UNIT/];
const QTY_PATTERNS = [/КОЛИЧЕСТВ/, /КОЛИ/, /КОЛ /, /ПОТРЕБ/, /ОБЪЕМ/, /ОБЬЕМ/, /ҲАЖМ/, /ХАЖМ/, /HAJM/, /MIQDOR/, /QTY/, /QUANTITY/];
const CODE_PATTERNS = [/ШИФР/, /КОД/, /ОБОСНОВАН/, /НОМЕР НОРМАТИВ/, /SHIFR/, /KOD/, /CODE/];
const ORDER_PATTERNS = [/^NO$/, /^NO NO$/, /N P P/, /П П/, /П П$/, /TARTIB/, /№/];
const PRICE_PATTERNS = [
  /НА ЕД/, /ЗА ЕД/, /UNIT PRICE/, /ЦЕНА/, /НАРХ/, /СТОИМОСТЬ ЕД/,
  /СТОИМОСТ.*ЕДИНИЦ/, /ЗА ОДИН/, /БИРЛИК НАРХ/, /BIRLIK NARX/, /NARX/, /Т КМ/,
];
const TOTAL_PATTERNS = [/ОБЩ/, /ИТОГ/, /ВСЕГО/, /СУММА/, /SUMMA/, /ЖАМИ/, /JAMI/, /УМУМИЙ/, /TOTAL/, /НА ВЕСЬ ОБЪЕМ/, /ГРУЗОПЕРЕВОЗ/];
const SUM_PATTERNS = [
  /ОБЩ/, /ИТОГ/, /ВСЕГО/, /СУММА/, /SUMMA/, /ЖАМИ/, /JAMI/, /УМУМИЙ/, /TOTAL/, /НА ВЕСЬ ОБЪЕМ/,
  /СТОИМОСТЬ ГРУЗОПЕРЕВОЗ/, /ОБЩАЯ ТОННА/,
];

function totalHeaderScore(header: string): number {
  if (/СТОИМОСТЬ ГРУЗОПЕРЕВОЗ/.test(header)) return 100;
  if (/НА ВЕСЬ ОБЪЕМ/.test(header)) return 90;
  if (/СУММА|TOTAL/.test(header)) return 80;
  if (/ОБЩАЯ ТОННА/.test(header)) return 10;
  if (/ОБЩ|ИТОГ|ВСЕГО|ЖАМИ|УМУМИЙ/.test(header)) return 50;
  return 0;
}

function headerScore(header: string): number {
  let score = 0;
  if (NAME_PATTERNS.some((p) => p.test(header))) score += 3;
  if (UNIT_PATTERNS.some((p) => p.test(header))) score += 2;
  if (PRICE_PATTERNS.some((p) => p.test(header))) score += 3;
  if (QTY_PATTERNS.some((p) => p.test(header))) score += 1;
  return score;
}

function findHeaders(rows: SheetGrid): OfertaResursUstunlar | null {
  const cols = maxCols(rows);
  let best: { score: number; result: OfertaResursUstunlar } | null = null;
  for (let start = 0; start < Math.min(rows.length, 100); start++) {
    // smeta-anatomiya/ustun.ts bilan bir xil chegara: titul ("НАИМЕНОВАНИЕ СТРОЙКИ: …",
    // 1–2 katakli) sarlavha boshi bo'lolmaydi — aks holda A ustuni nom ustuni bo'lib
    // qolardi; blok "1 | 2 | 3 …" tartib qatorida tugaydi.
    if ((rows[start] || []).filter((c) => text(c) !== '').length < 3) continue;
    let end = Math.min(rows.length - 1, start + 5);
    for (let k = start + 1; k <= end; k++) if (isOrdinalHeaderRow(rows[k] || [])) { end = k - 1; break; }
    const headers = Array.from({ length: cols }, (_, col) => columnHeader(rows, start, end, col));
    // “Kategoriya” ustuni sarlavhasiga pastdagi “ЧЕЛ (1 resurs)” qo‘shilib
    // RESURS so‘zini oladi — shuning uchun zaxira naqshda sarlavhasi aynan
    // RESURS/РЕСУРС bilan BOSHLANADIGAN ustun afzal.
    const nomFallbackStrict = firstColumn(headers, [/^(RESURS|РЕСУРС|RESOURCE)/]);
    const nom = firstColumn(headers, NAME_PRIMARY_PATTERNS) >= 0
      ? firstColumn(headers, NAME_PRIMARY_PATTERNS)
      : nomFallbackStrict >= 0 ? nomFallbackStrict : firstColumn(headers, NAME_FALLBACK_PATTERNS);
    const birlik = firstColumn(headers, UNIT_PATTERNS);
    const hajm = firstColumn(headers, QTY_PATTERNS, [/НА ВЕСЬ/]);
    const shifr = firstColumn(headers, CODE_PATTERNS);
    const tartib = firstColumn(headers, ORDER_PATTERNS);
    const priceCandidates = headers.map((h, i) => ({ h, i }))
      .filter(({ h, i }) => i !== shifr && PRICE_PATTERNS.some((p) => p.test(h)) && !TOTAL_PATTERNS.some((p) => p.test(h)));
    const smetaNarx = priceCandidates[0]?.i ?? -1;
    const totalCandidates = headers.map((h, i) => ({ h, i }))
      .filter(({ h, i }) => i !== smetaNarx && SUM_PATTERNS.some((p) => p.test(h)) && !PRICE_PATTERNS.some((p) => p.test(h)));
    const smetaSumma = [...totalCandidates].sort((a, b) => totalHeaderScore(b.h) - totalHeaderScore(a.h))[0]?.i ?? -1;
    if (nom < 0 || birlik < 0 || (smetaNarx < 0 && smetaSumma < 0)) continue;
    let score = headerScore(headers[nom]) + headerScore(headers[birlik]) + 3;
    if (hajm >= 0) score += 2;
    if (shifr >= 0) score += 1;
    if (smetaSumma >= 0) score += 1;
    if (!best || score > best.score) {
      let lastHeader = start;
      for (let rowIndex = start; rowIndex <= end; rowIndex++) {
        if (isDataLikeRow(rows[rowIndex] || [])) break;
        const rowText = (rows[rowIndex] || []).map(normal).join(' ');
        const isStandaloneTotal = /^(ИТОГО|ВСЕГО|JAMI|TOTAL)\b/.test(rowText);
        if (!isStandaloneTotal && /(НАИМЕНОВАНИЕ|РЕСУРС|ЕДИНИЦ|НА ЕД|ЗА ОДИН|ЦЕНА|СТОИМОСТ|КОЛИЧЕСТВ|ОБЪЕМ|ҲАЖМ|ХАЖМ|ШИФР|КОД|СУММА|НА ВЕСЬ ОБЪЕМ|ГРУЗОПЕРЕВОЗ)/.test(rowText)) lastHeader = rowIndex;
      }
      let firstHeader = lastHeader;
      for (let rowIndex = start; rowIndex <= lastHeader; rowIndex++) {
        const rowText = (rows[rowIndex] || []).map(normal).join(' ');
        if (/(НАИМЕНОВАН|РЕСУРС|ЕДИНИЦ|КОЛ|СТОИМОСТ|СУММА|ОБЩАЯ|№№|NO NO)/.test(rowText)) { firstHeader = rowIndex; break; }
      }
      let dataStart = lastHeader + 1;
      while (dataStart < rows.length && isOrdinalHeaderRow(rows[dataStart])) dataStart++;
      best = {
        score,
        result: {
          tartib, shifr, nom, birlik, hajm, smetaNarx, smetaSumma,
          sarlavhaBoshlanishi: firstHeader,
          malumotBoshlanishi: dataStart,
        },
      };
    }
  }
  return best?.result ?? null;
}

function isOrdinalHeaderRow(row: readonly unknown[]): boolean {
  const cells = row.map(text).filter(Boolean);
  if (cells.length < 2) return false;
  return cells.every((cell) => numberValue(cell) != null || /^(NO|NO NO|П П|[0-9]+)$/.test(normal(cell)));
}

function formatFor(sheetName: string, head: string): { format: OfertaManbaFormati; evidence: string[] } {
  const evidence: string[] = [];
  const value = `${normal(sheetName)} ${head}`;
  if (/ABC4|\bABC\b|АВС/.test(value)) { evidence.push('ABC/ABC4 belgisi'); return { format: 'abc', evidence }; }
  if (/\bТН\b|\bTN\b|ТЕРР|ТЕРРИТОР/.test(value)) { evidence.push('TN/TН belgisi'); return { format: 'tn', evidence }; }
  return { format: 'noma’lum', evidence };
}

function evidenceFor(rows: SheetGrid, sheetName: string): { resScore: number; lrvScore: number; roleHint: 'transport' | null; evidence: string[]; format: OfertaManbaFormati } {
  const head = rows.slice(0, 45).flatMap((row) => row.map(normal)).join(' ');
  const evidence: string[] = [];
  let resScore = 0;
  let lrvScore = 0;
  if (/РЕСУРС|RESURS|МАТЕРИАЛЬНЫЕ|ТРУДОВЫЕ|ОБОРУДОВАНИ|МАТЕРИАЛЛАР|РЕСУРСЛАР/.test(head)) { resScore += 4; evidence.push('RES/resurs sarlavhasi'); }
  if (/НА ЕД|ЕДИНИЧН|ЕД ИЗМ|UNIT PRICE|НАРХ|NARX|ЗА ОДИН|Т КМ/.test(head)) { resScore += 3; evidence.push('birlik narx sarlavhasi'); }
  if (/КОЛИЧЕСТВ|ОБЪЕМ|ОБЬЕМ|ҲАЖМ|ХАЖМ|HAJM|MIQDOR/.test(head)) { resScore += 1; evidence.push('hajm/miqdor sarlavhasi'); }
  if (/ЛОКАЛЬН.{0,30}СМЕТ|ЛОКАЛЬНО СМЕТ|ВИД РАБОТ|РАБОТ И ЗАТРАТ/.test(head)) { lrvScore += 5; evidence.push('LRV/ish sarlavhasi'); }
  if (/ШИФР.*НОРМ|НОРМ.*РАСХОД/.test(head)) { lrvScore += 2; evidence.push('ish normasi belgisi'); }
  if (/ЦЕНА|СТОИМОСТ/.test(head)) { resScore += 1; evidence.push('narx qiymati sarlavhasi'); }
  // T1 LRV_PLUS: ТИП ustunida rz/bl/rs — bu ish/hajm ierarxiyasi (LRV),
  // resurs ro'yxati emas, garchi rs qatorlari resurs nomiga o'xshasa ham.
  const tipCounts = { rz: 0, bl: 0, rs: 0 };
  for (const row of rows.slice(0, 400)) for (const cell of row) {
    const v = String(cell ?? '').trim();
    if (v === 'rz' || v === 'bl' || v === 'rs') tipCounts[v]++;
  }
  if (tipCounts.bl >= 2 && tipCounts.rs >= 2) { lrvScore += 12; evidence.push('LRV ТИП ustuni (rz/bl/rs)'); }
  const namedLrv = /LRV|СМЕТА|СМЕТНЫЙ/.test(normal(sheetName));
  const namedRes = /RES|РЕСУРС/.test(normal(sheetName));
  const transport = /ТРАНСП|ПЕРЕВОЗ|ГРУЗОПЕРЕВОЗ|ВОЗКА/.test(normal(sheetName))
    || (/ТРАНСП|ПЕРЕВОЗ|ГРУЗОПЕРЕВОЗ|ВОЗКА/.test(rows.slice(0, 8).flatMap((row) => row.map(normal)).join(' ')) && !/РЕСУРС/.test(head));
  if (namedLrv && !namedRes) { lrvScore += 7; evidence.push('varaq nomi LRV/smeta'); }
  else if (namedLrv) { lrvScore += 3; evidence.push('varaq nomida LRV va RES aralash belgisi'); }
  if (namedRes) { resScore += 2; evidence.push('varaq nomi RES/resurs'); }
  if (transport) { resScore += 2; evidence.push('transport hisob varaqlari'); }
  const format = formatFor(sheetName, head);
  evidence.push(...format.evidence);
  return { resScore, lrvScore, roleHint: transport ? 'transport' : null, evidence, format: format.format };
}

function valueAt(row: readonly unknown[], index: number): unknown {
  return index >= 0 ? row[index] : null;
}

const MONEY_UNIT = /^(СУМ|СУММА|SUM|SUMMA|SOM|SO M|UZS|РУБ|%)?$/;
const TRANSPORT_LABEL = /ТРАНСП|ТРАСП|ПЕРЕВОЗ|ДОСТАВ|ГРУЗОПЕРЕВОЗ|ВОЗКА/;
const STORAGE_LABEL = /СКЛАДСК|ЗАГОТОВИТЕЛЬН|ХРАНЕН/;

function isTotalLabel(name: string): boolean {
  return /^(ИТОГО|ВСЕГО|JAMI|ЖАМИ|TOTAL|ОБЩАЯ СТОИМОСТЬ|УМУМИЙ)/.test(normal(name));
}

function isGlobalTotal(name: string): boolean {
  // Oddiy ВСЕГО/JAMI ko‘p ABC/TN fayllarida bo‘limning yakuniy satri bo‘ladi.
  // Faqat aniq umumiy yorliqlar paket/varaq darajasidagi jami hisoblanadi.
  return /^(ОБЩАЯ СТОИМОСТЬ|ВСЕГО МАТЕРИАЛОВ|ИТОГО РЕСУРСЫ ПО ПРОЕКТУ|ИТОГО ПО ПРОЕКТУ|УМУМИЙ ҚИЙМАТ)|ПРЯМЫЕ ЗАТРАТЫ/.test(normal(name));
}

/** ABC/TN/RESURS_VEDOMOST: “ЧЕЛ (1 resurs)”, “МАШ (48 resurs)” — kategoriya
 * bo‘limi sarlavhasi (o‘z summasi bilan). Resurs emas, lekin KATEGORIYA
 * dalili: pastidagi qatorlar shu toifaga tegishli. */
function categorySummary(name: string): OfertaMalumKategoriya | 'UNKNOWN' | null {
  const raw = upper(name).replace(/\s+/g, ' ').trim();
  if (!/\(\s*\d+\s+(?:RESURS|RESURSLAR|РЕСУРС|РЕСУРСА|РЕСУРСОВ|RESOURCE|RESOURCES)\s*\)$/.test(raw)) return null;
  // JS `\b` kirill harflarida ishlamaydi — chegara aniq yoziladi.
  const m = raw.match(/^(ЧЕЛ|МАШ|МАТ|ОБ|М\s*\/\s*К|КАБ|БЕЗ\s*СКЛАД|БЕЗСКЛАД)(?=[\s(]|$)/);
  if (!m) return 'UNKNOWN';
  const k = m[1].replace(/\s+/g, '');
  if (k === 'М/К') return 'М/К';
  if (k === 'БЕЗСКЛАД') return 'БЕЗСКЛАД';
  return k as OfertaMalumKategoriya;
}

function isSectionLabel(name: string): boolean {
  const normalized = normal(name);
  if (/^(РАЗДЕЛ|РЕСУРСЫ ПО|ЗАТРАТЫ ТРУДА|ТРУДОВЫЕ РЕСУРСЫ|СТРОИТЕЛЬНЫЕ МАШИН|СТРОИТЕЛЬНЫЕ МАТЕРИАЛ|МАТЕРИАЛЬНЫЕ РЕСУРСЫ|МЕСТНЫЕ МАТЕРИАЛ|ИНЕРТНЫЕ МАТЕРИАЛ|ОБОРУДОВАНИЕ|РАБОТЫ ВЕДУТСЯ|РЕСУРСЫ$|МАТЕРИАЛЫ$)/.test(normalized)) return true;
  // Qatorning o‘zida birlik/hajm/narx bo‘lmasa, faqat katta harflardan
  // iborat uzun nomni yangi bo‘lim deb olamiz (masalan “МЕТАЛЛОКОНСТРУКЦИИ”).
  return normalized.length >= 5 && !/\d/.test(normalized) && /^[A-ZА-ЯЁЎҚҒҲІЇЄ\s-]+$/.test(normalized);
}

/** Ko‘p paketli RES (masalan Karting: “АР И КЖ”, keyin “НБШ”) ichida jadval
 * sarlavhasi qayta keladi. U resurs emas — paket chegarasi. */
function isRepeatedHeader(row: readonly unknown[], columns: OfertaResursUstunlar): boolean {
  const nom = normal(valueAt(row, columns.nom));
  const bir = normal(valueAt(row, columns.birlik));
  return /НАИМЕНОВАН|^RESURS$|^РЕСУРС$/.test(nom) && /ЕДИНИЦ|ЕД ИЗМ|BIRLIK|UNIT/.test(bir);
}

function fallbackNumber(row: readonly unknown[], rol: OfertaRol, columns: OfertaResursUstunlar): number | null {
  if (columns.smetaSumma >= 0) return numberValue(valueAt(row, columns.smetaSumma));
  if (rol === 'RESOURCE' || rol === 'SECTION' || rol === 'INFO') return null;
  const values = row.map(numberValue).filter((value): value is number => value != null);
  if (!values.length) return null;
  return rol === 'SUBTOTAL' || rol === 'GRAND_TOTAL' ? values[0] : values[values.length - 1];
}

/** Podval/НДС qatorining nom va summa ustunidan boshqa kataklaridagi foizlar:
 * `0,05` → 5; `5%` → 5; НДС qatorida `1,12` → 12 (P4.2, Pomoshnik PTO saboqi). */
function katakFoizlari(row: readonly unknown[], columns: OfertaResursUstunlar, ndsQatori: boolean): number[] {
  const out: number[] = [];
  row.forEach((cell, i) => {
    if (i === columns.nom || i === columns.smetaSumma || i === columns.tartib) return;
    const t = text(cell);
    if (!t) return;
    const pm = t.match(/^(\d+(?:[.,]\d+)?)\s*%$/);
    if (pm) { out.push(Number(pm[1].replace(',', '.'))); return; }
    const n = typeof cell === 'number' ? cell : numberValue(cell);
    if (n == null || !/^[\d\s.,]+$/.test(t)) return;
    if (n > 0 && n < 1) out.push(Number((n * 100).toPrecision(12)));
    else if (ndsQatori && n > 1 && n < 1.5) out.push(Number(((n - 1) * 100).toPrecision(12)));
  });
  return out;
}

function rowLabel(row: readonly unknown[], columns: OfertaResursUstunlar): string {
  const preferred = text(valueAt(row, columns.nom));
  if (preferred) return preferred;
  return row.map(text).find((value) => value && numberValue(value) == null && !/^(СУМ|SUM|№№|[0-9.]+)$/.test(normal(value))) ?? '';
}

type Tasnif = { rol: OfertaRol; hosila?: boolean; vedomostKat?: OfertaMalumKategoriya | 'UNKNOWN' };

function tasnifla(nom: string, row: readonly unknown[], columns: OfertaResursUstunlar, transportSheet: boolean): Tasnif | null {
  const birlik = text(valueAt(row, columns.birlik));
  const hajm = numberValue(valueAt(row, columns.hajm));
  const narx = numberValue(valueAt(row, columns.smetaNarx));
  const summa = columns.smetaSumma >= 0 ? numberValue(valueAt(row, columns.smetaSumma)) : null;
  const hasUnitOrAmount = Boolean(birlik || hajm != null || narx != null || summa != null);
  const n = normal(nom);

  const vedomostKat = categorySummary(nom);
  if (vedomostKat) return { rol: 'SECTION', vedomostKat };

  // Foizli podval/hosila qatori: transport yoki sklad, lekin o‘zida
  // hajm × narx tuzilmasi yo‘q (birligi СУМ/% yoki bo‘sh). Nomida ДОСТАВКА
  // bo‘lgan HAQIQIY resurs (КОМПЛ, hajm va narx bilan) bu yerga tushmaydi.
  const pulBirligi = MONEY_UNIT.test(normal(birlik));
  const hajmNarxli = hajm != null && narx != null;
  if (!transportSheet && pulBirligi && !hajmNarxli && (summa != null || hasUnitOrAmount)) {
    if (STORAGE_LABEL.test(n)) return { rol: 'STORAGE', hosila: true };
    if (TRANSPORT_LABEL.test(n)) return { rol: 'TRANSPORT', hosila: true };
  }
  if (isTotalLabel(nom)) return { rol: isGlobalTotal(nom) ? 'GRAND_TOTAL' : 'SUBTOTAL' };
  if (!hasUnitOrAmount && (isSectionLabel(nom) || resBolimKategoriya(nom) != null)) return { rol: 'SECTION' };
  if (!hasUnitOrAmount) return null;
  // Mashinist mehnati mashina-soat narxining ichida: ABC/TN uni o‘z narxisiz
  // (bo‘sh, '--' yoki 0) ma'lumot qatori sifatida ko‘rsatadi. U narxlanmaydi va
  // “narxsiz” deb ogohlantirilmaydi. Musbat narx/summa bo‘lsagina resurs.
  if (/ТРУДА МАШИНИСТ/.test(n) && !((narx ?? 0) > 0) && !((summa ?? 0) > 0)) return { rol: 'INFO' };
  if (transportSheet) return { rol: 'TRANSPORT', hosila: false };
  return { rol: 'RESOURCE' };
}

type JoriyKat = { kat: OfertaMalumKategoriya; manba: 'bolim' | 'vedomost' } | null;

function resursKategoriyasi(nom: string, birlik: string | null, joriy: JoriyKat): { kategoriya: OfertaKategoriya; manba: OfertaKategoriyaManbasi } {
  const b = String(birlik || '').toUpperCase().replace(/Ё/g, 'Е').replace(/[.\s]/g, '');
  const bolim = joriy && joriy.kat !== 'БЕЗСКЛАД' ? joriy.kat as T2ResursKategoriya : undefined;
  const r = resursMkKabAniqla(nom, birlik ?? '', bolim);
  if (b.startsWith('ЧЕЛ') || b.startsWith('МАШ')) return { kategoriya: r ?? 'UNKNOWN', manba: 'birlik' };
  if (r == null) return joriy?.kat === 'БЕЗСКЛАД' ? { kategoriya: 'БЕЗСКЛАД', manba: joriy.manba } : { kategoriya: 'UNKNOWN', manba: 'yoq' };
  if (joriy?.kat === 'БЕЗСКЛАД') return { kategoriya: r, manba: 'nom' };
  if (r !== joriy?.kat) return { kategoriya: r, manba: 'nom' };
  return { kategoriya: r, manba: joriy.manba };
}

type Birlik = { id: string; src: number; total: boolean; consumed: boolean };

/**
 * Jami ↔ bolalar munosabati DALIL bilan quriladi: jami qatorining manba
 * summasi oxirgi iste'mol qilinmagan birliklar (barg, hosila, ichki jami)
 * yig'indisiga aynan teng bo'lgan eng qisqa ketma-ketlik uning bolalari.
 * Shu tariqa “ИТОГО → транспорт → ИТОГО ПО МАТЕРИАЛАМ → ИТОГО ПРЯМЫЕ”
 * zanjiri o'z-o'zidan ierarxiyaga aylanadi va hech narsa ikki marta
 * sanalmaydi. Manba summasi 0/bo'sh bo'lsa (narxsiz ABC) faqat oddiy
 * bo'lim jamisi tuzilma bo'yicha bog'lanadi; boshqasi 'mos_emas'.
 */
function jamiBogla(qator: OfertaQator, units: Birlik[], sectionStart: number, paketStart: number): void {
  const S = qator.smetaSumma;
  let picked: number[] = [];
  let moslik: OfertaQator['jamiMoslik'] = 'mos_emas';
  if (S != null && Number.isFinite(S) && S !== 0) {
    const tol = Math.max(0.05, Math.abs(S) * 1e-9);
    let acc = 0;
    const tried: number[] = [];
    for (let j = units.length - 1; j >= paketStart; j--) {
      if (units[j].consumed) continue;
      acc += units[j].src;
      tried.push(j);
      if (Math.abs(acc - S) <= tol) { picked = tried; moslik = 'summa'; break; }
    }
    // Paket ichida topilmasa, varaq boshigacha (paketlararo umumiy jami).
    if (moslik !== 'summa' && paketStart > 0) {
      for (let j = paketStart - 1; j >= 0; j--) {
        if (units[j].consumed) continue;
        acc += units[j].src;
        tried.push(j);
        if (Math.abs(acc - S) <= tol) { picked = tried; moslik = 'summa'; break; }
      }
    }
  } else if (qator.rol === 'SUBTOTAL') {
    const open: number[] = [];
    for (let j = sectionStart; j < units.length; j++) if (!units[j].consumed) open.push(j);
    if (open.length && open.filter((j) => units[j].total).length <= 1) { picked = open; moslik = 'tuzilma'; }
  }
  for (const j of picked) units[j].consumed = true;
  qator.jamiMoslik = moslik;
  qator.jamiBolalari = picked.sort((a, b) => a - b).map((j) => units[j].id);
  units.push({ id: qator.sourceId, src: S ?? picked.reduce((a, j) => a + units[j].src, 0), total: true, consumed: false });
}

function parseRows(sheetName: string, rows: SheetGrid, columns: OfertaResursUstunlar, transportSheet = false): { qatorlar: OfertaQator[]; skippedRows: number } {
  const qatorlar: OfertaQator[] = [];
  let skippedRows = 0;
  let joriy: JoriyKat = null;
  let joriyTaklif: OfertaMalumKategoriya | undefined;
  let blokBoshi = 0;
  const units: Birlik[] = [];
  let sectionStart = 0;
  let paketStart = 0;
  for (let i = columns.malumotBoshlanishi; i < rows.length; i++) {
    const row = rows[i] || [];
    const hasAnyValue = row.some((cell) => text(cell));
    if (!hasAnyValue) continue;
    if (isRepeatedHeader(row, columns) || isOrdinalHeaderRow(row)) {
      paketStart = sectionStart = units.length;
      joriy = null; blokBoshi = qatorlar.length;
      continue;
    }
    const nom = rowLabel(row, columns);
    const t = nom ? tasnifla(nom, row, columns, transportSheet) : null;
    if (!t) { skippedRows++; continue; }

    const birlik = text(valueAt(row, columns.birlik)) || null;
    const hajm = numberValue(valueAt(row, columns.hajm));
    const smetaNarx = numberValue(valueAt(row, columns.smetaNarx));
    const smetaSumma = fallbackNumber(row, t.rol, columns);
    const tartibRaw = valueAt(row, columns.tartib);
    const tartibText = text(tartibRaw);
    const tartibNumber = numberValue(tartibRaw);
    const qator: OfertaQator = {
      sourceId: `${sheetName}::r${i + 1}`,
      sourceSheet: sheetName,
      sourceRow: i + 1,
      tartibRaqami: tartibText ? (tartibNumber == null ? tartibText : tartibNumber) : null,
      shifr: text(valueAt(row, columns.shifr)) || null,
      nom,
      birlik,
      hajm,
      smetaBirlikNarx: smetaNarx,
      smetaSumma,
      rol: t.rol,
      hisobTuri: 'yoq',
      kategoriya: null,
      kategoriyaManbasi: 'yoq',
      ...(t.hosila != null ? { hosila: t.hosila } : {}),
      manbaHajmUstuni: columns.hajm,
      manbaNarxUstuni: columns.smetaNarx,
      manbaSummaUstuni: columns.smetaSumma,
      manbaHajmSon: typeof valueAt(row, columns.hajm) === 'number',
      manbaSummaSon: typeof valueAt(row, columns.smetaSumma) === 'number',
    };
    if (t.hosila || ((t.rol === 'SUBTOTAL' || t.rol === 'GRAND_TOTAL') && /НДС|ҚҚС|QQS/.test(normal(nom)))) {
      const kf = katakFoizlari(row, columns, /НДС|ҚҚС|QQS/.test(normal(nom)));
      if (kf.length) qator.katakFoizlari = kf;
    }

    if (t.rol === 'SECTION') {
      joriyTaklif = /ИНЕРТН/.test(normal(nom)) ? 'БЕЗСКЛАД' : undefined;
      if (t.vedomostKat) joriy = t.vedomostKat === 'UNKNOWN' ? null : { kat: t.vedomostKat, manba: 'vedomost' };
      else {
        const b = resBolimKategoriya(nom);
        if (b === 'YAKUN') joriy = null;
        else if (b) joriy = { kat: b, manba: 'bolim' };
      }
      sectionStart = units.length;
      blokBoshi = qatorlar.length;
    } else if (t.rol === 'RESOURCE') {
      const k = resursKategoriyasi(nom, birlik, joriy);
      qator.kategoriya = k.kategoriya;
      qator.kategoriyaManbasi = k.manba;
      if (k.kategoriya === 'UNKNOWN' && joriyTaklif) qator.kategoriyaTaklifi = joriyTaklif;
      // RESURS_VEDOMOST: alohida birlik narx ustuni yo‘q — soxta narx
      // yaratmaymiz, manba summasi bo‘yicha taklif beriladi.
      qator.hisobTuri = columns.smetaNarx < 0 && smetaSumma != null ? 'manba_jami' : 'birlik';
    } else if (t.rol === 'TRANSPORT' && t.hosila === false) {
      // TN transport varag‘i ko‘p bosqichli (т/км × masofa × tonna) hisob:
      // uni hajm × narxga buzmaymiz.
      qator.hisobTuri = 'manba_jami';
    }

    // Podval (МАТ/ОБ ajratuvchi) — resSatrlariniOl bilan bir xil qoida:
    // faqat bo‘lim/zaxiradan kelgan МАТ/ОБ/noma’lum qatorlar orqaga belgilanadi.
    const blokTuri = podvalBlokTuri(nom);
    if (blokTuri) {
      for (let j = blokBoshi; j < qatorlar.length; j++) {
        const q = qatorlar[j];
        if (q.rol !== 'RESOURCE') continue;
        if (q.kategoriyaManbasi === 'birlik' || q.kategoriyaManbasi === 'nom' || q.kategoriyaManbasi === 'vedomost') continue;
        if (q.kategoriya === 'UNKNOWN' || q.kategoriya === 'МАТ' || q.kategoriya === 'ОБ') { q.kategoriya = blokTuri; q.kategoriyaManbasi = 'podval'; }
      }
      blokBoshi = qatorlar.length + 1;
    }

    if (t.rol === 'SUBTOTAL' || t.rol === 'GRAND_TOTAL') {
      jamiBogla(qator, units, sectionStart, paketStart);
      if (resBolimKategoriya(nom) === 'YAKUN') joriy = null;
      blokBoshi = qatorlar.length + 1;
    } else if (t.rol !== 'SECTION') {
      units.push({ id: qator.sourceId, src: smetaSumma ?? 0, total: false, consumed: false });
    }
    qatorlar.push(qator);
  }
  return { qatorlar, skippedRows };
}


function resursSignature(sheet: OfertaSheetTahlili): Set<string> {
  return new Set(sheet.qatorlar.filter((qator) => qator.rol === 'RESOURCE').map((qator) => [
    normal(qator.nom),
    normal(qator.birlik),
    qator.hajm == null ? '' : String(qator.hajm),
    qator.smetaSumma == null ? '' : String(qator.smetaSumma),
  ].join('|')));
}

function duplicateScore(left: OfertaSheetTahlili, right: OfertaSheetTahlili): number {
  const a = resursSignature(left);
  const b = resursSignature(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const key of a) if (b.has(key)) common++;
  return common / Math.min(a.size, b.size);
}

function primaryDuplicateSheet(left: OfertaSheetTahlili, right: OfertaSheetTahlili): OfertaSheetTahlili {
  const score = (sheet: OfertaSheetTahlili): number => {
    let value = 0;
    if (sheet.ustunlar?.shifr != null && sheet.ustunlar.shifr >= 0) value += 4;
    if (/^(RES|РЕСУРС)(_|$)/i.test(sheet.nom.trim())) value += 3;
    if (/_A$/i.test(sheet.nom.trim())) value -= 2;
    return value;
  };
  return score(left) >= score(right) ? left : right;
}

/**
 * Anatomiya RES deb tanigan varaqning ustunlari (oferta shaklida). Korpus: oferta detektori
 * ЛРВ .xls da nom sarlavhasini birlik deb olardi; tizimning RESURS_VEDOMOST eksporti ham
 * anatomiyada taniladi. Rol RES emas yoki nom/birlik/narx-summa yo'q bo'lsa — null (oferta detektori).
 */
function anatomiyaResUstunlari(nom: string, rows: SheetGrid): OfertaResursUstunlar | null {
  try {
    const v = varaqniTahlilQil(nom, { nom, rows: rows as Katak[][] });
    const u = v.ustunlar;
    if (!u || u.nom < 0 || u.birlik < 0 || (u.narx < 0 && u.summa < 0)) return null;
    return {
      tartib: u.tartib, shifr: u.shifr, nom: u.nom, birlik: u.birlik,
      hajm: u.hajmLoyiha >= 0 ? u.hajmLoyiha : u.hajmBirlikka,
      smetaNarx: u.narx, smetaSumma: u.summa,
      sarlavhaBoshlanishi: u.sarlavhaQatori, malumotBoshlanishi: u.malumotBoshi,
    };
  } catch {
    return null;
  }
}

/** Anatomiya ustun xaritasi ↔ Oferta ustunlari solishtiruvi (faqat dalil — natijaga ta'sir qilmaydi). */
export function anatomiyaSolishtir(rows: SheetGrid, ustunlar: OfertaResursUstunlar | null): NonNullable<OfertaSheetTahlili['anatomiya']> {
  const blok = sarlavhaBlokiniTop(rows);
  const a = blok ? ustunXaritasi(blok) : null;
  if (!a || !ustunlar) return { ustunlar: a, mos: !a && !ustunlar, farqlar: a ? ['oferta ustunlari topilmadi'] : ustunlar ? ['anatomiya sarlavha blokini topmadi'] : [] };
  const juftlar: Array<[string, number, number]> = [
    ['nom', ustunlar.nom, a.nom], ['birlik', ustunlar.birlik, a.birlik], ['hajm', ustunlar.hajm, a.hajmLoyiha],
    ['narx', ustunlar.smetaNarx, a.narx], ['summa', ustunlar.smetaSumma, a.summa],
  ];
  const farqlar = juftlar.filter(([, o, x]) => o !== x).map(([nom, o, x]) => `${nom}: oferta ${o}, anatomiya ${x}`);
  return { ustunlar: a, mos: !farqlar.length, farqlar };
}

export function ofertaResursVaraqlariniAniqla(workbook: XlsxWorkbook): OfertaSheetTahlili[] {
  const analyses: OfertaSheetTahlili[] = workbook.sheets.map((sheet) => {
    const rows = safeRows(workbook.sheet(sheet.name)?.rows ?? sheet.rows);
    const evidenceData = evidenceFor(rows, sheet.name);
    // C4: RES varag'i ustunlari yagona anatomiyadan; anatomiya RES deb tanimasa — oferta detektori.
    const anatUstun = anatomiyaResUstunlari(sheet.name, rows);
    const ustunlar = anatUstun ?? findHeaders(rows);
    // PTO qo'shgan/o'zgartirgan ustunlar: hajm/narx/summa uchligi ma'lumot
    // bilan isbotlanadi (hajm × narx ≈ summa) — sarlavha faqat nomzod.
    // Anatomiya ustunlari buni o'zi ichida isbotlagan.
    let ustunDalil: ReturnType<typeof uchlikniMoslashtir> | null = null;
    if (ustunlar && !anatUstun) {
      const blok = sarlavhaBlokiniTop(rows);
      const kenglik = maxCols(rows);
      const matnlar = blok?.sarlavhalar ?? Array.from({ length: kenglik }, (_, c) => columnHeader(rows, ustunlar.sarlavhaBoshlanishi, ustunlar.malumotBoshlanishi - 1, c));
      const band = new Set([ustunlar.tartib, ustunlar.shifr, ustunlar.nom, ustunlar.birlik].filter((i) => i >= 0));
      ustunDalil = uchlikniMoslashtir(matnlar, rows.slice(ustunlar.malumotBoshlanishi, ustunlar.malumotBoshlanishi + 2000), { hajm: ustunlar.hajm, narx: ustunlar.smetaNarx, summa: ustunlar.smetaSumma }, band);
      if (ustunDalil.qoida === 'arifmetika') {
        ustunlar.hajm = ustunDalil.uchlik.hajm; ustunlar.smetaNarx = ustunDalil.uchlik.narx; ustunlar.smetaSumma = ustunDalil.uchlik.summa;
      }
    }
    const parsed = ustunlar ? parseRows(sheet.name, rows, ustunlar, evidenceData.roleHint === 'transport') : { qatorlar: [], skippedRows: 0 };
    const hasResourceShape = Boolean(ustunlar && parsed.qatorlar.some((qator) => qator.rol === 'RESOURCE' || qator.rol === 'TRANSPORT'));
    const namedLrv = /LRV|СМЕТА|СМЕТНЫЙ/.test(normal(sheet.name));
    const namedRes = /RES|РЕСУРС/.test(normal(sheet.name));
    // SMETA YADROSI: rolni yagona `varaqRoliniAniqla` (nom → tuzilma) aytadi; eski ball faqat yadro aniqlamasa.
    const yadro = varaqRoliniAniqla(sheet.name, rows);
    let role: OfertaSheetRole = 'unknown';
    let confidence: OfertaSheetConfidence = 'past';
    if (yadro.rol === 'lrv') { role = 'lrv'; confidence = yadro.ishonch === 'yuqori' ? 'yuqori' : 'o‘rta'; }
    else if ((yadro.rol === 'res' || yadro.rol === 'transport') && hasResourceShape) { role = yadro.rol; confidence = yadro.ishonch === 'yuqori' ? 'yuqori' : 'o‘rta'; }
    else if (yadro.rol === 'nomalum') {
      if (hasResourceShape && namedLrv && !namedRes) role = 'lrv';
      else if (hasResourceShape && evidenceData.roleHint === 'transport') role = 'transport';
      else if (hasResourceShape && (evidenceData.resScore >= evidenceData.lrvScore || evidenceData.lrvScore < 5)) role = 'res';
      if (evidenceData.lrvScore >= evidenceData.resScore + 3) role = 'lrv';
      confidence = role === 'res' || role === 'transport' ? 'o‘rta' : role === 'lrv' ? 'o‘rta' : 'past';
    }
    const evidence = [...yadro.dalil.slice(0, 2), ...evidenceData.evidence];
    if ((yadro.rol === 'res' || yadro.rol === 'transport') && !hasResourceShape) evidence.push(`${yadro.rol.toUpperCase()} deb aniqlandi, lekin resurs jadvali (nom/birlik/narx ustunlari) topilmadi`);
    if (!ustunlar) evidence.push('RES ustunlari to‘liq aniqlanmadi');
    else if (!parsed.qatorlar.length) evidence.push('sarlavha topildi, lekin resurs satrlari topilmadi');
    else evidence.push(`${parsed.qatorlar.filter((qator) => qator.rol === 'RESOURCE').length} ta resurs, ${parsed.qatorlar.filter((qator) => qator.rol !== 'RESOURCE').length} ta hisob/bo‘lim satri`);
    if (sheet.hidden) evidence.push('Excelda yashirin varaq — sukut bo‘yicha tanlanmaydi');
    if (ustunDalil?.qoida === 'arifmetika') evidence.push(ustunDalil.izoh);
    const anatomiya = anatomiyaSolishtir(rows, ustunlar);
    if (ustunlar && !anatomiya.mos) evidence.push(`anatomiya ustun xaritasi farq qiladi (${anatomiya.farqlar.join('; ')})`);
    return { nom: sheet.name, role, format: evidenceData.format, confidence, evidence, resScore: evidenceData.resScore, lrvScore: evidenceData.lrvScore, ustunlar, ...parsed, ...(sheet.hidden ? { yashirin: true } : {}), anatomiya };
  });

  // ABC eksportlarida RES va RES_A ko‘pincha ayni ma’lumotning ikki ko‘rinishi:
  // biri kodli, ikkinchisi kodsiz. Ularni avtomatik birga tanlash 20 mlrdni
  // 38 mlrd qilib yuborishi mumkin. Faqat qator nomi+birlik+hajm+manba summasi
  // kamida 90% mos tushganida alternativ deb belgilaymiz; alohida paketlar
  // o‘xshash nomlarga ega bo‘lsa ham bir-biriga yutilmaydi.
  for (let i = 0; i < analyses.length; i++) {
    const left = analyses[i];
    if (left.role !== 'res') continue;
    for (let j = i + 1; j < analyses.length; j++) {
      const right = analyses[j];
      if (right.role !== 'res' || left.alternativVaraq || right.alternativVaraq) continue;
      if (duplicateScore(left, right) < 0.9) continue;
      const primary = primaryDuplicateSheet(left, right);
      const alternate = primary.nom === left.nom ? right : left;
      alternate.alternativVaraq = primary.nom;
      alternate.evidence = [...alternate.evidence, `alternativ ko‘rinish: ${primary.nom}; ikkalasi birga tanlanmaydi`];
    }
  }
  return analyses;
}

export function ofertaTanlanganQatorlari(
  tahlillar: readonly OfertaSheetTahlili[],
  tanlanganVaraqlar: readonly string[],
): OfertaQator[] {
  const wanted = new Set(tanlanganVaraqlar);
  return tahlillar.filter((sheet) => wanted.has(sheet.nom) && !(sheet.alternativVaraq && wanted.has(sheet.alternativVaraq))).flatMap((sheet) => sheet.qatorlar);
}
