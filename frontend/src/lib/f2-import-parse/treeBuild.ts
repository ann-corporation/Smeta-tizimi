/**
 * Ported from `apiF2FaylOqi` in `Smeta tizimi/30_Panel.js` (line ~3569) —
 * T2-GAS-EXIT-001 §4 ("F2 file parsing must exit GAS"). This file ports only
 * the PURE, GAS-API-free part: turning an already-read 2D cell grid into the
 * act tree (rz/bl/rs/mat/ob). The Drive/Sheets file-access part of the
 * original function (`Drive.Files.get`, `SpreadsheetApp.openById`,
 * `_excelToNative`, `apiXlsxQiymatBilanOch`) is NOT ported here — getting a
 * `SheetGrid` from an uploaded workbook without GAS is a separate, still-open
 * piece of work (see `ops/handoff/T2_GAS_EXIT_001.md` §Remaining item 1); it
 * needs real F2 file fixtures to prove against, which live only on the
 * owner's machine (`_f2lab/README.md`), not in this repo.
 *
 * ⚠️ Every branch below exists because of a real, dated bug against real F2
 * files — see the matching comment in `30_Panel.js` for the incident. Do not
 * simplify a branch without reading why it exists.
 */
import type { AktNode, F2NodeType } from '../f2-match-engine';
import { f2UstunAniqla } from './columnDetect';
import { lrvDaraxti, ustunXaritasigaQayt } from '../smeta-anatomiya/yuklash';
import { varaqniTahlilQil } from '../smeta-anatomiya/varaq';
import type { Katak } from '../smeta-anatomiya/turlar';
import type { CellValue, F2FaylOqiCoreResult, F2ColumnConfig, SheetGrid } from './types';

function cell(v: CellValue): string {
  return String(v == null ? '' : v).trim();
}
function up(v: CellValue): string {
  return String(v == null ? '' : v).toUpperCase();
}
function hasLetters(s: string): boolean {
  return /[А-ЯЁA-Za-zа-яё]/.test(s);
}

/** Raw cell -> {value, isEmpty}. Comma-decimal and whitespace-thousands tolerant. */
function cellNum(rowArr: SheetGrid[number] | undefined, idx: number): { v: number; empty: boolean } {
  if (idx < 0 || !rowArr) return { v: 0, empty: true };
  const raw = cell(rowArr[idx]);
  if (raw === '') return { v: 0, empty: true };
  const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
  return { v: isNaN(n) ? 0 : n, empty: false };
}

const TOTALS_ROW_RE = /^(ИТОГО|ВСЕГО|ЖАМИ|ПОДЫТОГ|СУММА\sПО|ВСЕГО\sПО|ОБЩАЯ)/;

function detectHasMarker(data: SheetGrid): boolean {
  let n = 0;
  for (let li = 0; li < Math.min(400, data.length); li++) {
    const row = data[li];
    if (!row || row.length < 9) continue;
    const m9 = up(row[8]).trim().toLowerCase().replace(/[+~]$/, '');
    if (m9 === 'rz' || m9 === 'bl' || m9 === 'rs' || m9 === 'mat' || m9 === 'ob') n++;
  }
  return n >= 3;
}

/**
 * `apiF2FaylOqi`'s pure core, split by whether a column mapping was already
 * confirmed: with no `colConfig`, returns an auto-detected mapping + preview
 * for a confirmation UI (dual-mode return preserved for 1:1 diffability
 * against the GAS source); with `colConfig`, builds and returns the act tree.
 */
function safeGrid(data: unknown): SheetGrid {
  if (!Array.isArray(data)) return [];
  return data.map((row) => Array.isArray(row) ? row : []);
}

export function f2FaylOqiCore(data: SheetGrid | null | undefined, colConfig?: Partial<F2ColumnConfig> | null): F2FaylOqiCoreResult {
  const grid = safeGrid(data);
  if (grid.length === 0) return { ok: true, tree: [] };

  const hasMarker = detectHasMarker(grid);
  let cKod: number, cNom: number, cBir: number, cNorma: number, cObyom: number, cNarx: number, cSum: number;
  let hdrRow = -1;

  if (colConfig) {
    const n = (x: unknown) => { const p = parseInt(String(x), 10); return isNaN(p) ? -1 : p; };
    cKod = n(colConfig.kod); cNom = n(colConfig.nom); cBir = n(colConfig.bir);
    cNorma = n(colConfig.norma); cObyom = n(colConfig.obyom);
    cNarx = n(colConfig.narx); cSum = n(colConfig.sum);
  } else {
    const det = f2UstunAniqla(grid);
    cKod = det.kod; cNom = det.nom; cBir = det.bir;
    cNorma = det.norma; cObyom = det.obyom; cNarx = det.narx; cSum = det.sum;
    hdrRow = det.hdrRow;
    const preview: Array<{ r: number; cells: string[]; mk: string }> = [];
    for (let pi = 0; pi < grid.length && preview.length < 28; pi++) {
      const rowArr = grid[pi] || [];
      const cells: string[] = [];
      for (let cc = 0; cc < Math.min(10, rowArr.length); cc++) cells.push(cell(rowArr[cc]));
      if (cells.join('').trim() === '') continue;
      preview.push({ r: pi + 1, cells, mk: rowArr.length >= 9 ? String(rowArr[8] ?? '') : '' });
    }
    return {
      ok: true, mode: 'config', hasMarker,
      cols: { kod: cKod, nom: cNom, bir: cBir, norma: cNorma, obyom: cObyom, narx: cNarx, sum: cSum },
      maxCol: (grid[0] || []).length, preview, hdrQator: hdrRow >= 0 ? hdrRow + 1 : 0,
      ...(det.dalil ? { ustunDalil: det.dalil } : {}),
      ...(det.qoshimcha?.length ? { qoshimchaUstunlar: det.qoshimcha } : {}),
    };
  }

  // SMETA YADROSI: ichma-ich bo'limli daraxtni anatomiya quradi (eski quruvchi ketma-ket sarlavhalardan faqat oxirgisini
  // qoldirardi — 09-23 gacha tekis saqlangan smetalar shu sababli). Eski quruvchi faqat yadro LRV daraxtini bermasa.
  try {
    const v = varaqniTahlilQil('', { nom: '', rows: grid as Katak[][] }, 1, {
      ustunlar: ustunXaritasigaQayt({ kod: cKod, nom: cNom, bir: cBir, norma: cNorma, obyom: cObyom, narx: cNarx, sum: cSum }),
    });
    const d = lrvDaraxti('', grid as Katak[][], v);
    if (d.anatomiya && d.tree.length) return { ok: true, tree: d.tree };
  } catch { /* eski quruvchi */ }

  const result: AktNode[] = [];
  let rzSeq = 0;
  let currentRz: AktNode = { uid: 'f2rz_' + rzSeq++, type: 'rz', nom: 'Асосий бўлим', children: [] };
  result.push(currentRz);
  let currentBl: AktNode | null = null;

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] || [];
    const kod = cKod >= 0 ? cell(row[cKod]) : '';
    const nom = cNom >= 0 ? cell(row[cNom]) : '';
    const bir = cBir >= 0 ? cell(row[cBir]) : '';
    const normaC = cellNum(row, cNorma); // E
    const obyomC = cellNum(row, cObyom); // F
    const narx = cellNum(row, cNarx).v; // G
    const summa = cellNum(row, cSum).v; // H — already-computed total, copied verbatim

    // REAL VOLUME: F if filled, else E. E ("norma") only makes sense on an rs row.
    const fEmpty = obyomC.empty;
    const volume = fEmpty ? normaC.v : obyomC.v;
    const norma = fEmpty ? 0 : normaC.v;

    const nomU = up(nom);
    if (TOTALS_ROW_RE.test(nomU)) continue; // totals/subtotal rows never enter the tree
    if (/^\d+$/.test(nom) && /^\d+$/.test(bir)) continue; // column-numbering row under the header (№|2|3|4…)

    const mk9 = hasMarker && row.length >= 9 ? up(row[8]).trim().toLowerCase().replace(/[+~]$/, '') : '';

    let isRz = mk9 === 'rz';
    if (!mk9) {
      const isEmptyDEF = !bir && normaC.empty && obyomC.empty;
      if (isEmptyDEF) {
        const aTxt = cell(row[0]);
        const bTxt = cKod >= 0 ? cell(row[cKod]) : '';
        const cTxt = cNom >= 0 ? cell(row[cNom]) : '';
        const fullTxt = up((aTxt + ' ' + bTxt + ' ' + cTxt).trim());
        if (fullTxt.length > 2 && hasLetters(fullTxt) && !/^(ИТОГО|ВСЕГО|ЖАМИ|ПОДЫТОГ|СУММА)/.test(fullTxt)) {
          isRz = true;
        }
      }
    }
    if (isRz) {
      let rzNom = nom;
      if (!rzNom) {
        for (let rc = 0; rc < 8; rc++) {
          const rv = cell(row[rc]);
          if (rv && hasLetters(rv)) { rzNom = rv; break; }
        }
      }
      currentRz = { uid: 'f2rz_' + rzSeq++, type: 'rz', nom: rzNom || 'Раздел ' + rzSeq, children: [] };
      result.push(currentRz);
      currentBl = null;
      continue;
    }

    // Negative volume is intentionally KEPT (storno/recalculation acts can be
    // entirely negative-quantity sections) — only a genuinely empty/zero
    // volume or missing name is skipped.
    if (!nom || !volume) continue;

    let nType: F2NodeType;
    if (mk9 === 'bl' || mk9 === 'rs' || mk9 === 'mat' || mk9 === 'ob') {
      nType = mk9;
    } else if (!fEmpty) {
      nType = 'rs'; // F (ОБЪЁМ) filled -> resource (norma lives in E)
    } else {
      // F empty -> either a work item (bl) or a material/equipment sibling.
      // Look ahead to the next meaningful row: if IT has F filled, this row
      // is the parent work item.
      let nextIsRs = false;
      for (let j = i + 1; j < grid.length; j++) {
        const jRow = grid[j] || [];
        const jNom = cNom >= 0 ? cell(jRow[cNom]) : '';
        const jOb = cObyom >= 0 ? cell(jRow[cObyom]) : '';
        const jNr = cNorma >= 0 ? cell(jRow[cNorma]) : '';
        if (!jNom && !jOb && !jNr) continue;
        nextIsRs = jOb !== '';
        break;
      }
      if (nextIsRs || nomU.indexOf('ЗАТРАТЫ ТРУДА') >= 0) nType = 'bl';
      else if (nomU.indexOf('ОБОРУДОВАН') >= 0 || up(currentRz.nom).indexOf('ОБОРУДОВАН') >= 0) nType = 'ob';
      else nType = 'mat';
    }

    const node: AktNode = { uid: 'f2_' + i, type: nType, kod, nom, bir, hajm: volume, narx, summa, children: [] };
    (node as unknown as { norma: number }).norma = norma; // carried for parity with the GAS node shape; not part of AktNode's declared contract

    // Act tree shape matches the LRV tree shape: mat/ob are RAZDEL siblings,
    // never nested under a `bl` (this was a real bug — the two trees having
    // different shapes broke auto-matching's structural assumptions).
    if (nType === 'bl') { currentBl = node; currentRz.children!.push(node); }
    else if (nType === 'rs') { (currentBl ? currentBl.children! : currentRz.children!).push(node); }
    else { currentRz.children!.push(node); }
  }

  const tree = result.filter((n) => !(n.type === 'rz' && (!n.children || !n.children.length)));
  return { ok: true, tree };
}
