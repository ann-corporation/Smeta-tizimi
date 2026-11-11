/**
 * Ish varag'i holat filtri (Alt+1…4 — Fakt jurnali bilan BIR XIL tugmalar va tartib: 1 = hammasi). Sof mantiq.
 * Filtr qatorni YASHIRADI, hajm/summaga tegmaydi; kiritmasi bor (saqlanmagan) qator filtrdan qat'i nazar ko'rinadi.
 */
import type { JurnalQator } from '../fakt-jurnal';

export type VaraqFiltr = 'hammasi' | 'qoldiq' | 'oshgan' | 'narxsiz';

export const VARAQ_FILTRLAR: ReadonlyArray<{ kalit: VaraqFiltr; nom: string; tugma: string }> = [
  { kalit: 'hammasi', nom: 'Hammasi', tugma: 'alt+1' },
  { kalit: 'qoldiq', nom: 'Qoldig‘i bor', tugma: 'alt+2' },
  { kalit: 'oshgan', nom: 'Smetadan oshgan', tugma: 'alt+3' },
  { kalit: 'narxsiz', nom: 'Narxsiz', tugma: 'alt+4' },
];

const EPS = 1e-9;

/** `narxsiz` — qator summasi noma'lum (NULL ≠ 0): `qatorSumma(...).ustamasiz == null`. */
export function varaqFiltrMos(f: VaraqFiltr, q: Pick<JurnalQator, 'holat' | 'qoldiq' | 'smeta'>, narxsiz: boolean): boolean {
  switch (f) {
    case 'hammasi': return true;
    // Ochiq qoldiq (smeta − fakt − almashtirilgan − bajarilmaydi); chegirma (manfiy smeta) qatorida qoldiq ham manfiy.
    case 'qoldiq': return q.qoldiq != null && ((q.smeta ?? 0) < 0 ? q.qoldiq < -EPS : q.qoldiq > EPS);
    case 'oshgan': return q.holat === 'oshdi';
    case 'narxsiz': return narxsiz;
  }
}
