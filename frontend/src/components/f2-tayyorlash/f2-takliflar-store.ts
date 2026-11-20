/** F2QatorTakliflari va F2TekshiruvTakliflari orasidagi kichik umumiy xotira (takliflar + amallar). */
import type { AktTaklif } from '../../lib/tekshiruv/pto';

export type TaklifAmallari = {
  /** Mavjud preview -> tasdiq yo'li (umumiy blok oynasi ochiladi). */
  qabul: (x: AktTaklif) => void;
  qaror: (x: AktTaklif, q: 'qabul' | 'rad' | 'keyinroq', sabab?: string) => Promise<boolean>;
  band: boolean;
};
type Holat = { aktId: number | null; takliflar: readonly AktTaklif[]; amallar: TaklifAmallari | null };
const BOSH: Holat = { aktId: null, takliflar: [], amallar: null };
let holat: Holat = BOSH;
const tinglovchilar = new Set<() => void>();
const xabar = () => tinglovchilar.forEach((f) => f());
export const takliflarOrnat = (h: Holat): void => { holat = h; xabar(); };
export const takliflarTozala = (aktId: number | null): void => { if (holat.aktId === aktId) { holat = BOSH; xabar(); } };
export const obuna = (f: () => void) => { tinglovchilar.add(f); return () => { tinglovchilar.delete(f); }; };
export const holatOl = () => holat;

/** Bitta qator uchun takliflar (sof tanlash: testlanadi). */
export const qatorTakliflari = (takliflar: readonly AktTaklif[], qatorId: number): AktTaklif[] => takliflar.filter((x) => x.qator_id === qatorId && !x.eskirgan);

