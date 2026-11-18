/**
 * GOLDEN testlar uchun: server fayli QURAI kolontituli (headerFooter + docProps) bilan keladi, sayt quruvchisi esa uning
 * o'zi. «Bayt-bayt teng» endi «kolontituldan boshqa hammasi teng» degani: varaq XML idan <headerFooter> olib tashlanadi,
 * docProps va ularning paket bog'lanishi hisobga olinmaydi, qolgan har fayl (shu jumladan ichidagi xlsx) aynan teng bo'lishi shart.
 */
import { strFromU8, unzipSync } from 'fflate';

const HF = /<((?:\w+:)?headerFooter)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g;
const zipMi = (b: Uint8Array): boolean => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b;

function tekis(bytes: Uint8Array, prefiks: string, out: Map<string, string>): void {
  const f = unzipSync(bytes);
  for (const [nom, b] of Object.entries(f)) {
    if (/^docProps\/(core|app)\.xml$/.test(nom) || nom === '[Content_Types].xml' || nom === '_rels/.rels') continue; // docProps va ularni bog'lovchi paket qismlari
    if (zipMi(b) && /\.(xlsx|xlsm|zip)$/i.test(nom)) { tekis(b, `${prefiks}${nom}/`, out); continue; }
    out.set(prefiks + nom, /^xl\/worksheets\/[^/]+\.xml$/.test(nom) ? strFromU8(b).replace(HF, '') : strFromU8(b, true));
  }
}

export function kolontitulsiz(bytes: Uint8Array): Map<string, string> {
  const m = new Map<string, string>();
  if (zipMi(bytes)) tekis(bytes, '', m); else m.set('raw', strFromU8(bytes, true));
  return m;
}

/** Kolontitul (QURAI imzosi) dan boshqa hammasi teng. */
export function tengKolontitulsiz(a: Uint8Array, b: Uint8Array): boolean {
  const x = kolontitulsiz(a), y = kolontitulsiz(b);
  if (x.size !== y.size) return false;
  for (const [k, v] of x) if (y.get(k) !== v)  return false;
  return true;
}