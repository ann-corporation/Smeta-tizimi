import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import { readXlsxCellEvidence } from '../f2-import-parse/xlsxReader';
import type { PrixodKitob, PrixodOpsiya, PrixodQator } from './turlar';

const matn = (v: unknown): string => v == null ? '' : String(v).trim();
const aynan = (v: string): string => v.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const sarlavha = (v: unknown): string => aynan(matn(v)).replace(/[.\s]/g, '');

/** Source identity is conservative. Transliteration/typo suggestions NEVER merge movements. */
export function prixodKaliti(kompaniyaId: number, skladId: number, q: Pick<PrixodQator, 'sana' | 'nom' | 'birlik' | 'miqdor' | 'yetkazuvchi' | 'manbaQator'>): string {
  return JSON.stringify(['prixod-kitob-v1', kompaniyaId, skladId, q.sana, aynan(q.nom), aynan(q.birlik), q.miqdor, aynan(q.yetkazuvchi), q.manbaQator]);
}

export function prixodMiqdor(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER ? v : null;
  const s = matn(v).replace(/[\s\u00a0\u202f]/g, '');
  // A single decimal separator; mixed separators/units/formulas are not guessed.
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? n : null;
}

function sanaQur(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2199 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}

/** Explicit dates only; a missing date never becomes today. */
export function prixodSana(v: unknown): string | null {
  const s = matn(v);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(s);
  if (iso) return sanaQur(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  return ru ? sanaQur(Number(ru[3]), Number(ru[2]), Number(ru[1])) : null;
}

export async function prixodKitobOqi(bytes: Uint8Array, o: PrixodOpsiya): Promise<PrixodKitob> {
  if (!Number.isSafeInteger(o.kompaniyaId) || o.kompaniyaId <= 0 || (o.skladId != null && (!Number.isSafeInteger(o.skladId) || o.skladId <= 0))) throw new Error('PRIXOD_SCOPE_INVALID');
  const metadata = await readXlsxCellEvidence(bytes, 'Приход');
  if (!metadata.sheet) throw new Error('PRIXOD_SHEET_REQUIRED');
  const sourceSheet = metadata.sheet.name;
  const cells = metadata.sheet.cells;
  const cell = (r: number, c: number) => cells[r]?.[c];
  const value = (r: number, c: number): unknown => cell(r, c)?.value;
  let header = -1;
  for (let r = 0; r <= Math.min(cells.length - 1, 25); r++) {
    if (/^(№|no|номер)$/.test(sarlavha(value(r, 0))) && sarlavha(value(r, 2)) === 'дата'
      && /^(едизм|единица)$/.test(sarlavha(value(r, 4))) && sarlavha(value(r, 5)) === 'приход'
      && sarlavha(value(r, 7)) === 'поставщик') { header = r; break; }
  }
  if (header < 0) throw new Error('PRIXOD_HEADER_REQUIRED');
  const out: PrixodKitob = { faylNomi: o.faylNomi,
    sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer))).map(b => b.toString(16).padStart(2, '0')).join(''),
    varaq: 'Приход', sarlavhaQator: header + 1, kompaniyaId: o.kompaniyaId, skladId: o.skladId,
    takrorTekshirildi: o.skladId != null && o.oldingiKalitlar !== undefined,
    qatorlar: [], otkazilganVaraqlar: metadata.sheetNames.filter(n => n !== sourceSheet), boshQatorlar: 0, ogohlar: [], nomTakliflari: [],
    jami: { yangi: 0, takror: 0, xato: 0, ogohli: 0 } };
  // Known source layout has an accidentally overwritten D-header. Preserve it as a warning.
  if (!/^(наименование|название|номи)$/.test(sarlavha(value(header, 3)))) out.ogohlar.push('NOM_SARLAVHASI');
  const old = new Set(o.oldingiKalitlar ?? []);
  const aliases = new Map<string, { names: Set<string>; rows: number[] }>();
  for (let r = header + 1; r < cells.length; r++) {
    const raw = [0, 2, 3, 4, 5, 6].map(c => value(r, c));
    // Pre-filled type/supplier without any entry data is a template, not a receipt.
    if (raw.every(v => v == null || matn(v) === '')) { out.boshQatorlar++; continue; }
    const q: PrixodQator = { manbaQator: r + 1, manbaRaqam: matn(value(r, 0)) || null,
      sana: null, nom: matn(value(r, 3)), birlik: matn(value(r, 4)), miqdor: null,
      miqdorMatni: matn(cell(r, 5)?.displayed ?? value(r, 5)), tur: matn(value(r, 1)), yetkazuvchi: matn(value(r, 7)), hujjat: matn(value(r, 6)),
      narx: null, summa: null, qqs: null, kalit: null, holat: 'yangi', xatolar: [], ogohlar: [] };
    const dv = value(r, 2);
    if (typeof dv === 'number') {
      const p = cell(r, 2)?.excelDate;
      q.sana = p ? sanaQur(p.y, p.m, p.d) : null;
    } else q.sana = prixodSana(dv);
    if (!q.sana) q.xatolar.push(dv == null || matn(dv) === '' ? 'SANA_YOQ' : 'SANA_XATO');
    if (!q.nom) q.xatolar.push('NOM_YOQ');
    if (!q.birlik) q.xatolar.push('BIRLIK_YOQ');
    const qty = cell(r, 5);
    if (qty?.dateFormatted) q.xatolar.push('MIQDOR_SANA');
    else {
      q.miqdor = qty?.type === 'e' ? null : prixodMiqdor(qty?.value);
      if (q.miqdor == null) q.xatolar.push(qty?.value == null || matn(qty?.value) === '' ? 'MIQDOR_YOQ' : 'MIQDOR_XATO');
      else if (q.miqdor <= 0) q.xatolar.push('MIQDOR_XATO');
    }
    if (qty?.formula) q.ogohlar.push('MIQDOR_FORMULA');
    if (!q.yetkazuvchi) q.ogohlar.push('YETKAZUVCHI_YOQ');
    if (!q.manbaRaqam) q.ogohlar.push('RAQAM_YOQ');
    if (!q.xatolar.length && o.skladId != null) q.kalit = prixodKaliti(o.kompaniyaId, o.skladId, q);
    q.holat = q.xatolar.length ? 'xato' : q.kalit && old.has(q.kalit) ? 'takror' : 'yangi';
    out.jami[q.holat]++; if (q.ogohlar.length) out.jami.ogohli++;
    out.qatorlar.push(q);
    if (q.nom && q.birlik) {
      const k = qidiruvKaliti(q.nom).replace(/aftomat/g, 'avtomat') + '|' + aynan(q.birlik);
      const a = aliases.get(k) ?? { names: new Set<string>(), rows: [] };
      a.names.add(q.nom); a.rows.push(q.manbaQator); aliases.set(k, a);
    }
  }
  out.nomTakliflari = [...aliases.values()].filter(a => a.names.size > 1).map(a => ({ nomlar: [...a.names], qatorlar: a.rows }));
  return out;
}
