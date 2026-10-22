/**
 * F2 REESTR — kompaniya darajasidagi F2 holati (egasi 2026-10-21: «F2 import qilyapman, F2 yasayapman — obyektlar darajasida
 * qaysini import qildim, qaysi qanday ahvolda bilib bo'lmayapti; butun kompaniya darajasida reestr kerak: shartnoma, obyekt,
 * obyektdagi o'tgan va yasalgan F2 summalari»). Faqat o'qish: mavjud F2 aktlardan kesim, hech narsa yozilmaydi.
 *
 * Qoidalar: NULL ≠ 0 — summasi noma'lum akt «noma'lum» deb alohida sanaladi, jamiga 0 bo'lib qo'shilmaydi;
 * shartnoma biriktirilmagan bo'lsa shunday ko'rsatiladi (taxmin bilan bog'lanmaydi, ADR-1). Import / tizimda yasalgan va
 * qaysi fayldan — akt qatoridagi `raw_snapshot.import_job_id` / `hujjat_id` (bitta akt = bitta import ishi = bitta manba hujjat;
 * eski importlarda faqat `manba = 'f2_v3'`); o'qib bo'lmasa «aniqlanmadi».
 */

export type F2Manba = 'import' | 'tizim' | null;
export type F2Bosqich = 'tasdiqlangan' | 'jarayonda' | 'rad' | 'bekor';

export type ReestrAkt = {
  id: number; obyekt_id: number; oy: string; raqam: string | null;
  /** t2_akt_reestr dagi obyekt nomi — faol ro'yxatda yo'q (bekor qilingan) obyektni nomi bilan ko'rsatish uchun. */
  obyekt_nom?: string | null;
  holat: string; lifecycle_status?: string | null;
  hujjat_jami: number | null; farq: number | null; qator_soni: number | null; narxsiz_qator: number | null;
  /** null — hali o'qilmagan yoki o'qib bo'lmadi. */
  manba: F2Manba;
  /** Import qilingan aktning server import ishi va manba hujjati (t2_document_registry.id). */
  import_job_id?: number | null; hujjat_id?: number | null;
};
/** Akt qatoridagi raw_snapshot belgilaridan manba: import ishi yoki 'f2_v3' — import; qator bor-u belgi yo'q — tizimda yasalgan. */
export function manbaAniqla(q: { import_job_id?: unknown; hujjat_id?: unknown; manba?: unknown } | null): Pick<ReestrAkt, 'manba' | 'import_job_id' | 'hujjat_id'> {
  if (!q) return { manba: null, import_job_id: null, hujjat_id: null };
  const son = (v: unknown) => (v != null && /^\d+$/.test(String(v)) ? Number(v) : null);
  const job = son(q.import_job_id), hujjat = son(q.hujjat_id);
  return { manba: job != null || q.manba === 'f2_v3' ? 'import' : 'tizim', import_job_id: job, hujjat_id: hujjat };
}
/** Obyektga yuklangan F2 import fayllaridan hech bir aktga yozilmaganlari (server import ishi qoralamasi yoki tashlab ketilgan). */
export function aktsizFayllar<T extends { id: string | number }>(fayllar: T[], aktlar: ReadonlyArray<Pick<ReestrAkt, 'hujjat_id'>>): T[] {
  const bor = new Set(aktlar.map(a => a.hujjat_id).filter((x): x is number => x != null));
  return fayllar.filter(f => !bor.has(Number(f.id)));
}
export type ReestrObyekt = { id: number; nom: string; loyiha_id: number | null; jami: number | null; narxsiz: number | null;
  /** Faol obyektlar ro'yxatida yo'q (bekor qilingan), lekin F2 aktlari saqlangan. */
  faolEmas?: boolean };
export type ReestrShartnoma = { id: number; raqam: string; nom: string | null; jami_nds_bilan: number | null; summa_bez_nds: number | null };

/** Ma'lum summa, summasi noma'lum aktlar soni va jami aktlar soni. */
export type Summa = { malum: number; nomalum: number; soni: number };
const bosSumma = (): Summa => ({ malum: 0, nomalum: 0, soni: 0 });

export function bosqich(a: Pick<ReestrAkt, 'holat' | 'lifecycle_status'>): F2Bosqich {
  const l = a.lifecycle_status ?? null;
  if (l === 'approved' || (!l && (a.holat === 'tasdiqlangan' || a.holat === 'yakunlangan'))) return 'tasdiqlangan';
  if (l === 'cancelled' || l === 'superseded' || a.holat === 'bekor') return 'bekor';
  if (l === 'rejected') return 'rad';
  return 'jarayonda';
}

export function qosh(s: Summa, qiymat: number | null): Summa {
  return qiymat == null || !Number.isFinite(Number(qiymat))
    ? { ...s, nomalum: s.nomalum + 1, soni: s.soni + 1 }
    : { malum: Math.round((s.malum + Number(qiymat)) * 100) / 100, nomalum: s.nomalum, soni: s.soni + 1 };
}
export const yigindi = (aktlar: ReadonlyArray<Pick<ReestrAkt, 'hujjat_jami'>>): Summa => aktlar.reduce((s, a) => qosh(s, a.hujjat_jami), bosSumma());

export type Ogoh = { tur: 'shartnomasiz' | 'shartnomadan_oshgan' | 'oy_takror' | 'summa_nomalum' | 'manba_nomalum'; matn: string; qiymat?: number };

export type ReestrQator = {
  obyekt: ReestrObyekt; loyiha: string | null;
  shartnomalar: ReestrShartnoma[];
  /** Shartnoma bog'lanishi hali o'qilmagan (fon bosqichi) — «biriktirilmagan» deb aytilmaydi. */
  shartnomaNomalum?: boolean;
  aktlar: ReestrAkt[];
  boyicha: Record<F2Bosqich, Summa>;
  /** Tasdiqlangan F2 manba bo'yicha: o'tgan davr importi va tizimda tayyorlangan. */
  tasdiqImport: Summa; tasdiqTizim: Summa;
  oxirgiOy: string | null;
  ogohlar: Ogoh[];
};
export type ReestrJami = { obyekt: number; aktlar: number; boyicha: Record<F2Bosqich, Summa>; tasdiqImport: Summa; tasdiqTizim: Summa; smeta: Summa; shartnomasiz: number };

const bosqichlar = (): Record<F2Bosqich, Summa> => ({ tasdiqlangan: bosSumma(), jarayonda: bosSumma(), rad: bosSumma(), bekor: bosSumma() });

export function reestrQur(p: {
  obyektlar: ReestrObyekt[]; aktlar: ReestrAkt[];
  shartnomalar: Map<number, ReestrShartnoma[]>; loyihalar: Map<number, string>;
  /** Berilsa — faqat shu obyektlarning shartnomasi o'qilgan; qolganlari «o'qilmoqda». */
  shartnomaOqilgan?: Set<number>;
}): { qatorlar: ReestrQator[]; jami: ReestrJami } {
  const byObyekt = new Map<number, ReestrAkt[]>();
  for (const a of p.aktlar) { const l = byObyekt.get(a.obyekt_id); if (l) l.push(a); else byObyekt.set(a.obyekt_id, [a]); }
  const known = new Set(p.obyektlar.map(o => o.id));
  const missingObjects: ReestrObyekt[] = [...byObyekt.keys()].filter(id => !known.has(id))
    .map(id => ({ id, nom: byObyekt.get(id)?.find(a => a.obyekt_nom)?.obyekt_nom ?? String(id), loyiha_id: null, jami: null, narxsiz: null, faolEmas: true }));
  const qatorlar = [...p.obyektlar, ...missingObjects].map((o): ReestrQator => {
    const aktlar = [...(byObyekt.get(o.id) ?? [])].sort((a, b) => b.oy.localeCompare(a.oy) || b.id - a.id);
    const boyicha = bosqichlar();
    let tasdiqImport = bosSumma(), tasdiqTizim = bosSumma();
    for (const a of aktlar) {
      const b = bosqich(a);
      boyicha[b] = qosh(boyicha[b], a.hujjat_jami);
      if (b === 'tasdiqlangan' && a.manba === 'import') tasdiqImport = qosh(tasdiqImport, a.hujjat_jami);
      if (b === 'tasdiqlangan' && a.manba === 'tizim') tasdiqTizim = qosh(tasdiqTizim, a.hujjat_jami);
    }
    const shartnomalar = p.shartnomalar.get(o.id) ?? [];
    // Faol bo'lmagan obyektning bog'lanishi o'qilmaydi (u ro'yxatda yo'q) — u ham «o'qilmagan» emas, shunchaki shartnomasiz ko'rinadi.
    const shartnomaNomalum = !!p.shartnomaOqilgan && !o.faolEmas && !p.shartnomaOqilgan.has(o.id);
    const ogohlar: Ogoh[] = [];
    if (aktlar.length && !shartnomalar.length && !shartnomaNomalum) ogohlar.push({ tur: 'shartnomasiz', matn: 'Shartnoma biriktirilmagan' });
    const shartnomaJami = shartnomalar.reduce<number | null>((s, x) => (s == null || x.jami_nds_bilan == null ? null : s + Number(x.jami_nds_bilan)), shartnomalar.length ? 0 : null);
    if (shartnomaJami != null && shartnomaJami > 0 && boyicha.tasdiqlangan.malum > shartnomaJami)
      ogohlar.push({ tur: 'shartnomadan_oshgan', matn: 'Tasdiqlangan F2 shartnoma summasidan oshgan', qiymat: Math.round((boyicha.tasdiqlangan.malum / shartnomaJami) * 10) / 10 });
    const oylar = new Map<string, number>();
    for (const a of aktlar) if (bosqich(a) === 'tasdiqlangan') oylar.set(a.oy.slice(0, 7), (oylar.get(a.oy.slice(0, 7)) ?? 0) + 1);
    const takror = [...oylar.values()].filter(n => n > 1).length;
    if (takror) ogohlar.push({ tur: 'oy_takror', matn: 'Bir oyda bir nechta tasdiqlangan F2', qiymat: takror });
    const nomalum = aktlar.filter(a => a.hujjat_jami == null).length;
    if (nomalum) ogohlar.push({ tur: 'summa_nomalum', matn: 'Summasi noma’lum F2', qiymat: nomalum });
    return { obyekt: o, loyiha: o.loyiha_id != null ? p.loyihalar.get(o.loyiha_id) ?? null : null, shartnomalar, shartnomaNomalum, aktlar, boyicha,
      tasdiqImport, tasdiqTizim, oxirgiOy: aktlar[0]?.oy ?? null, ogohlar };
  });
  const jami: ReestrJami = { obyekt: qatorlar.length, aktlar: p.aktlar.length, boyicha: bosqichlar(), tasdiqImport: bosSumma(), tasdiqTizim: bosSumma(), smeta: bosSumma(), shartnomasiz: 0 };
  for (const q of qatorlar) {
    for (const b of Object.keys(jami.boyicha) as F2Bosqich[]) jami.boyicha[b] = birlashtir(jami.boyicha[b], q.boyicha[b]);
    jami.tasdiqImport = birlashtir(jami.tasdiqImport, q.tasdiqImport);
    jami.tasdiqTizim = birlashtir(jami.tasdiqTizim, q.tasdiqTizim);
    jami.smeta = qosh(jami.smeta, q.obyekt.jami);
    if (q.ogohlar.some(o => o.tur === 'shartnomasiz')) jami.shartnomasiz++;
  }
  return { qatorlar, jami };
}
function birlashtir(a: Summa, b: Summa): Summa {
  return { malum: Math.round((a.malum + b.malum) * 100) / 100, nomalum: a.nomalum + b.nomalum, soni: a.soni + b.soni };
}

export type ReestrFiltr = { bosqich: F2Bosqich | 'hammasi' | 'f2siz'; matn: string; faqatMuammo: boolean };
export function filtrla(qatorlar: ReestrQator[], f: ReestrFiltr): ReestrQator[] {
  const m = f.matn.trim().toLowerCase();
  return qatorlar.filter(q => {
    if (m && !`${q.obyekt.nom} ${q.loyiha ?? ''} ${q.shartnomalar.map(s => `${s.raqam} ${s.nom ?? ''}`).join(' ')}`.toLowerCase().includes(m)) return false;
    if (f.faqatMuammo && !q.ogohlar.length) return false;
    if (f.bosqich === 'f2siz') return q.aktlar.length === 0;
    if (f.bosqich !== 'hammasi') return q.boyicha[f.bosqich].soni > 0;
    return true;
  });
}

/** Obyekt qatorlari: avval muammolilar, keyin F2 si borlar (oxirgi oy bo'yicha), oxirida F2 siz obyektlar. */
export function tartibla(qatorlar: ReestrQator[]): ReestrQator[] {
  return [...qatorlar].sort((a, b) => (b.ogohlar.length ? 1 : 0) - (a.ogohlar.length ? 1 : 0)
    || (b.aktlar.length ? 1 : 0) - (a.aktlar.length ? 1 : 0)
    || (b.oxirgiOy ?? '').localeCompare(a.oxirgiOy ?? '')
    || a.obyekt.nom.localeCompare(b.obyekt.nom, 'ru'));
}
