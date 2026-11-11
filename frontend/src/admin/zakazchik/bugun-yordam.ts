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

export type PortfelUstun = 'shartnoma' | 'smeta' | 'fakt' | 'f2' | 'f2_ustamali' | 'f2_qqs' | 'f3' | 'tolangan' | 'qarz';

/** Bitta obyektning bir ustundagi qiymati (ruxsat yo'q yoki noma'lum — null). */
export function ustunQiymati(o: BugunObyekt, u: PortfelUstun): number | null {
  switch (u) {
    case 'shartnoma': return o.shartnoma_summa;
    case 'smeta': return o.smeta?.summa ?? null;
    case 'fakt': return o.fakt?.summa ?? null;
    case 'f2': return o.f2 && o.f2.soni > 0 ? o.f2.jami : null;
    case 'f2_ustamali': return o.f2?.ustama_jami?.ustamali ?? null;
    case 'f2_qqs': return o.f2?.ustama_jami?.podval?.vsego ?? null;
    case 'f3': return o.f3?.summa ?? null;
    case 'tolangan': return o.tolangan?.summa ?? null;
    case 'qarz': return o.qarz;
  }
}

/** Tartib: QQS bilan birinchi (F2 uchun ham), keyin ustamali QQS siz, keyin ustamasiz (egasi qoidasi). */
export const PORTFEL_USTUNLAR: readonly PortfelUstun[] = ['shartnoma', 'smeta', 'fakt', 'f2_qqs', 'f2_ustamali', 'f2', 'f3', 'tolangan', 'qarz'];

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
