/**
 * F2 reestri uchun faqat o'qish (lib/f2-reestr): kompaniyaning obyektlari, F2 aktlari (t2_akt_reestr), shartnoma bog'lanishlari,
 * loyihalar va har aktning manbasi (import ishi / manba hujjati / tizimda yasalgan). Hech narsa yozilmaydi.
 */
import { sbOqi, sbT2ObyektlarOlKomp, type T2AktReestr } from './supabase';
import { sbT2ShartnomaBogOl, sbT2ShartnomalarOl } from './t2-shartnoma';
import { sbT2LoyihalarOl } from './t2-loyiha';
import { hujjatRoyxatOl, type CenterDocument } from './t2-hujjat-canonical';
import { manbaAniqla, type ReestrAkt, type ReestrObyekt, type ReestrShartnoma } from '../lib/f2-reestr/reestr';

/** Bir vaqtda ≤ n so'rov (obyekt/akt bo'yicha o'qishlar — kompaniyada o'nlab). */
async function navbat<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

export type ReestrMalumot = {
  obyektlar: ReestrObyekt[]; aktlar: ReestrAkt[];
  shartnomalar: Map<number, ReestrShartnoma[]>; loyihalar: Map<number, string>;
  /** Manbasini o'qib bo'lmagan aktlar soni (ular «aniqlanmadi» deb ko'rsatiladi). */
  manbaXato: number;
  /** Faol manba hujjatlar nomi (id → fayl nomi). Yangi versiyaga almashgan hujjat ro'yxatda yo'q — u «hujjat №» bilan ko'rsatiladi. */
  faylNomlari: Map<number, string>;
};

export async function f2ReestrOl(kompaniyaId: number): Promise<ReestrMalumot> {
  const [ob, ak, sh, ly, hj] = await Promise.all([
    sbT2ObyektlarOlKomp(kompaniyaId),
    sbOqi<T2AktReestr>({ jadval: 't2_akt_reestr', filtr: `kompaniya_id=eq.${kompaniyaId}&tur=eq.f2`, tartib: 'oy.desc', limit: 5000 }),
    sbT2ShartnomalarOl(kompaniyaId, false),
    sbT2LoyihalarOl(kompaniyaId),
    hujjatRoyxatOl({ kompaniyaId, limit: 1000 }).catch(() => null),
  ]);
  const faylNomlari = new Map((hj?.documents ?? []).filter(d => d.type === 'f2_akt').map(d => [Number(d.id), d.filename]));
  if (!ob.ok) throw new Error(ob.error || 'OBYEKTLAR_OQILMADI');
  if (!ak.ok) throw new Error(ak.error || 'F2_OQILMADI');
  const obyektlar: ReestrObyekt[] = (ob.qatorlar ?? []).map(o => ({ id: o.id, nom: o.nom, loyiha_id: o.loyiha_id, jami: o.jami, narxsiz: o.narxsiz }));
  const shById = new Map((sh.ok ? sh.qatorlar ?? [] : []).map(s => [s.id, { id: s.id, raqam: s.raqam, nom: s.nom, jami_nds_bilan: s.jami_nds_bilan, summa_bez_nds: s.summa_bez_nds }]));
  const loyihalar = new Map((ly.ok ? ly.qatorlar ?? [] : []).map(l => [l.id, l.nom]));
  // Obyekt → faol shartnoma bog'lanishlari (tenant chegarasi obyekt bo'yicha — har obyekt alohida o'qiladi).
  const boglar = await navbat(obyektlar, 6, o => sbT2ShartnomaBogOl(o.id));
  const shartnomalar = new Map<number, ReestrShartnoma[]>();
  obyektlar.forEach((o, i) => {
    const l = (boglar[i].ok ? boglar[i].qatorlar ?? [] : []).map(b => shById.get(b.shartnoma_id)).filter((x): x is ReestrShartnoma => !!x);
    if (l.length) shartnomalar.set(o.id, l);
  });
  // Har akt: birinchi qatorining import belgilari (bitta akt = bitta import ishi = bitta manba hujjat). Server JSON-yo'l
  // ustunlarini qabul qilmaydi — raw_snapshot butunligicha (≈0,4 KB) bitta qator bilan o'qiladi.
  let manbaXato = 0;
  const xom = ak.qatorlar ?? [];
  const manbalar = await navbat(xom, 6, async a => {
    const r = await sbOqi<{ raw_snapshot: Record<string, unknown> | null }>({ jadval: 't2_akt_qator', filtr: `akt_id=eq.${a.id}`, limit: 1, ustunlar: 'raw_snapshot' });
    if (!r.ok) { manbaXato++; return { manba: null, import_job_id: null, hujjat_id: null } as const; }
    const q = r.qatorlar?.[0];
    return manbaAniqla(q ? q.raw_snapshot ?? {} : null);
  });
  const aktlar: ReestrAkt[] = xom.map((a, i) => ({ id: a.id, obyekt_id: a.obyekt_id, oy: a.oy, raqam: a.raqam, holat: a.holat,
    lifecycle_status: a.lifecycle_status ?? null, hujjat_jami: a.hujjat_jami, farq: a.farq, qator_soni: a.qator_soni, narxsiz_qator: a.narxsiz_qator, ...manbalar[i] }));
  return { obyektlar, aktlar, shartnomalar, loyihalar, manbaXato, faylNomlari };
}

/** Obyektga yuklangan F2 import fayllari (manba hujjatlar, turi «f2_akt») — obyekt qatori ochilganda o'qiladi. */
export async function obyektF2Fayllari(kompaniyaId: number, obyektId: number): Promise<CenterDocument[]> {
  const r = await hujjatRoyxatOl({ kompaniyaId, obyektId, limit: 500 });
  return r.documents.filter(d => d.type === 'f2_akt');
}
