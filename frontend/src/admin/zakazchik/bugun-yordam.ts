/**
 * Buyurtmachi «Bugun» portfeli uchun toza yordamchilar (DOM yo'q). Pul qoidasi: null = noma'lum (0 emas); jamlar faqat
 * ma'lum qiymatlardan, nechta noma'lum qolgani alohida aytiladi. Qarz serverda hisoblanadi (F3 - to'langan) — bu yerda qayta hisoblanmaydi.
 */
import { yaxlit2 } from '../../lib/hisob-yadro';
import type { Bugun, BugunKutayotgan, BugunObyekt } from '../../api/t2-tomon';

export type NullJami = { summa: number | null; nomalum: number };

/** Ma'lum qiymatlar yig'indisi: hammasi noma'lum bo'lsa summa null (0 emas). */
export function nullJami(qiymatlar: ReadonlyArray<number | null | undefined>): NullJami {
  let s = 0; let bor = false; let nomalum = 0;
  for (const q of qiymatlar) {
    if (q == null || !Number.isFinite(q)) { nomalum++; continue; }
    s += q; bor = true;
  }
  return { summa: bor ? yaxlit2(s) : null, nomalum };
}

export type PaketUstun = 'smeta' | 'fakt' | 'f2';
export type PortfelUstun = 'shartnoma' | `${PaketUstun}_${'qqs' | 'ustamali' | 'ustamasiz'}` | 'f3' | 'tolangan' | 'qarz';

const PAKET_MAYDON = { qqs: 'qqs_bilan', ustamali: 'ustamali', ustamasiz: 'ustamasiz' } as const;

/** Bitta obyektning bir ustundagi qiymati (ruxsat yo'q yoki noma'lum — null). Smeta/fakt/F2 — hisob yadrosi paketidan. */
export function ustunQiymati(o: BugunObyekt, u: PortfelUstun): number | null {
  if (u === 'shartnoma') return o.shartnoma_summa;
  if (u === 'f3') return o.f3?.summa ?? null;
  if (u === 'tolangan') return o.tolangan?.summa ?? null;
  if (u === 'qarz') return o.qarz;
  const [paket, tur] = u.split('_') as [PaketUstun, keyof typeof PAKET_MAYDON];
  const p = o[paket];
  return p ? (p[PAKET_MAYDON[tur]] ?? null) : null;
}

/** Excel uchun to'liq tartib: har paket QQS bilan -> ustamali (QQS siz) -> ustamasiz (QQS siz). */
export const PORTFEL_USTUNLAR: readonly PortfelUstun[] = [
  'shartnoma', 'smeta_qqs', 'smeta_ustamali', 'smeta_ustamasiz', 'fakt_qqs', 'fakt_ustamali', 'fakt_ustamasiz', 'f2_qqs', 'f2_ustamali', 'f2_ustamasiz', 'f3', 'tolangan', 'qarz',
];
/** Ekrandagi asosiy ustunlar (ustamali/ustamasiz kichik qator bo'lib katak ostida chiqadi). */
export const EKRAN_USTUNLAR: readonly PortfelUstun[] = ['shartnoma', 'smeta_qqs', 'fakt_qqs', 'f2_qqs', 'f3', 'tolangan', 'qarz'];
/** Butun portfel jami: har ustun alohida (ustunlar turli ruxsatda bo'lishi mumkin). */
export function portfelJami(obyektlar: readonly BugunObyekt[]): Record<PortfelUstun, NullJami> {
  const r = {} as Record<PortfelUstun, NullJami>;
  for (const u of PORTFEL_USTUNLAR) r[u] = nullJami(obyektlar.map((o) => ustunQiymati(o, u)));
  return r;
}

/** «Hozir sizdan nima kutilmoqda» — jami son va bo'laklari (bitta ko'rinadigan raqam). */
export function kutishJami(k: BugunKutayotgan): { hujjat: number; murojaatJavob: number; murojaatTekshiruv: number; kechikkan: number; jami: number } {
  const hujjat = Object.values(k.taqdim).reduce((s, n) => s + Number(n || 0), 0);
  return { hujjat, murojaatJavob: k.murojaat_menga_ochiq, murojaatTekshiruv: k.murojaat_tekshiruv, kechikkan: k.murojaat_kechikkan, jami: hujjat + k.murojaat_menga_ochiq + k.murojaat_tekshiruv };
}

/** Taqdim resursi → odam tilida (F2, Forma-3/hujjat, АОСР). */
export const TAQDIM_RESURS_NOMI: Record<string, string> = { f2: 'Forma-2 aktlar', hujjat: 'Hujjatlar (Forma-3 va boshqa)', aosr: 'АОСР (yashirin ishlar)' };

/** Portfel qatorlarini pudratchi bo'yicha guruhlash (tartib saqlanadi). */
export function pudratchiBoyicha(b: Bugun): Array<{ id: number; nom: string; obyektlar: BugunObyekt[] }> {
  const m = new Map<number, { id: number; nom: string; obyektlar: BugunObyekt[] }>();
  for (const o of b.obyektlar) {
    const g = m.get(o.qarshi_kompaniya_id) ?? { id: o.qarshi_kompaniya_id, nom: o.qarshi_nom, obyektlar: [] };
    g.obyektlar.push(o); m.set(o.qarshi_kompaniya_id, g);
  }
  return [...m.values()];
}

/** Obyektda e'tibor talab qiladigan holat: qarz bor, qaror kutayotgan hujjat yoki ochiq murojaat. */
export function etiborBelgisi(o: BugunObyekt): 'qarz' | 'qaror' | 'murojaat' | null {
  if (o.kutayotgan_taqdim > 0) return 'qaror';
  if (o.qarz != null && o.qarz > 0) return 'qarz';
  if (o.ochiq_murojaat > 0) return 'murojaat';
  return null;
}
