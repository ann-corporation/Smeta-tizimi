/**
 * F2 reestri uchun faqat o'qish (lib/f2-reestr): kompaniyaning obyektlari, F2 aktlari (t2_akt_reestr), shartnoma bog'lanishlari,
 * loyihalar va har aktning manbasi (import ishi / manba fayli / tizimda yasalgan). Hech narsa yozilmaydi.
 *
 * Ikki bosqich (production 2026-10-22: hammasini kutish ≈ 15 s, 68 so'rov): asosiy jadval 4 so'rov bilan darhol
 * (`onQisman`), shartnoma bog'lanishlari (tenant chegarasi — obyektma-obyekt) va akt manbalari (aktma-akt) fonda to'lib boradi.
 */
import { sbOqi, sbT2ObyektlarOlKomp, type T2AktReestr } from './supabase';
import { sbT2ShartnomaBogOl, sbT2ShartnomalarOl } from './t2-shartnoma';
import { sbT2LoyihalarOl } from './t2-loyiha';
import { hujjatRoyxatOl, type CenterDocument } from './t2-hujjat-canonical';
import { manbaAniqla, type ReestrAkt, type ReestrObyekt, type ReestrShartnoma } from '../lib/f2-reestr/reestr';

/** Bir vaqtda ≤ n so'rov; har natija kelganda `tayyor` chaqiriladi. */
async function navbat<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>, tayyor?: (k: number, r: R) => void): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); tayyor?.(k, out[k]); }
  }));
  return out;
}

export type ReestrMalumot = {
  obyektlar: ReestrObyekt[]; aktlar: ReestrAkt[];
  shartnomalar: Map<number, ReestrShartnoma[]>; loyihalar: Map<number, string>;
  /** Manbasini o'qib bo'lmagan aktlar soni (ular «aniqlanmadi» deb ko'rsatiladi). */
  manbaXato: number;
  /** Manba fayl nomlari (hujjat id → fayl nomi) — akt qatoridagi raw_snapshot.fayl dan (almashgan hujjat nomi ham shu yerda). */
  faylNomlari: Map<number, string>;
  /** Fon bosqichi: shartnomasi o'qilgan obyektlar va manbasi o'qilgan aktlar; hammasi o'qilgach `tayyor`. */
  shartnomaOqilgan?: Set<number>; manbaOqilgan?: Set<number>; tayyor?: boolean;
};

export async function f2ReestrOl(kompaniyaId: number, onQisman?: (m: ReestrMalumot) => void): Promise<ReestrMalumot> {
  const [ob, ak, sh, ly] = await Promise.all([
    sbT2ObyektlarOlKomp(kompaniyaId),
    sbOqi<T2AktReestr>({ jadval: 't2_akt_reestr', filtr: `kompaniya_id=eq.${kompaniyaId}&tur=eq.f2`, tartib: 'oy.desc', limit: 5000 }),
    sbT2ShartnomalarOl(kompaniyaId, false),
    sbT2LoyihalarOl(kompaniyaId),
  ]);
  if (!ob.ok || ('toliq' in ob && ob.toliq === false)) throw new Error(ob.error || 'OBYEKTLAR_OQILMADI');
  if (!ak.ok || ak.toliq === false || (ak.jamiServerda != null && ak.jamiServerda > (ak.qatorlar?.length ?? 0))) throw new Error(ak.error || 'F2_OQILMADI');
  if (!sh.ok || sh.toliq === false) throw new Error(sh.error || 'SHARTNOMALAR_OQILMADI');
  if (!ly.ok || ly.toliq === false) throw new Error(ly.error || 'LOYIHALAR_OQILMADI');
  const obyektlar: ReestrObyekt[] = (ob.qatorlar ?? []).map(o => ({ id: o.id, nom: o.nom, loyiha_id: o.loyiha_id, jami: o.jami, narxsiz: o.narxsiz }));
  const shById = new Map((sh.qatorlar ?? []).map(s => [s.id, { id: s.id, raqam: s.raqam, nom: s.nom, jami_nds_bilan: s.jami_nds_bilan, summa_bez_nds: s.summa_bez_nds }]));
  const loyihalar = new Map((ly.qatorlar ?? []).map(l => [l.id, l.nom]));
  const xom = ak.qatorlar ?? [];
  // t2_akt_reestr obyekt nomini beradi — faol ro'yxatda yo'q (bekor qilingan) obyektning F2 si ham nomi bilan ko'rinadi.
  const aktlar: ReestrAkt[] = xom.map(a => ({ id: a.id, obyekt_id: a.obyekt_id, obyekt_nom: a.obyekt, oy: a.oy, raqam: a.raqam, holat: a.holat,
    lifecycle_status: a.lifecycle_status ?? null, hujjat_jami: a.hujjat_jami, farq: a.farq, qator_soni: a.qator_soni, narxsiz_qator: a.narxsiz_qator,
    manba: null, import_job_id: null, hujjat_id: null }));
  const m: ReestrMalumot = { obyektlar, aktlar, shartnomalar: new Map(), loyihalar, manbaXato: 0, faylNomlari: new Map(),
    shartnomaOqilgan: new Set(), manbaOqilgan: new Set(), tayyor: false };
  const nusxa = (): ReestrMalumot => ({ ...m, aktlar: [...m.aktlar], shartnomalar: new Map(m.shartnomalar), faylNomlari: new Map(m.faylNomlari),
    shartnomaOqilgan: new Set(m.shartnomaOqilgan), manbaOqilgan: new Set(m.manbaOqilgan) });
  onQisman?.(nusxa());
  // Yangilash tez-tez emas: har ~8 natijada bir marta (jadval qayta chizilishi arzon bo'lsin).
  let sanoq = 0;
  const xabar = () => { if (onQisman && ++sanoq % 8 === 0) onQisman(nusxa()); };

  let bogXato = false;
  const shartnomaIshi = navbat(obyektlar, 10, o => sbT2ShartnomaBogOl(o.id), (k, r) => {
    if (!r.ok || r.toliq === false) { bogXato = true; return; }
    const l = (r.qatorlar ?? []).map(b => shById.get(b.shartnoma_id)).filter((x): x is ReestrShartnoma => !!x);
    if (l.length) m.shartnomalar.set(obyektlar[k].id, l);
    m.shartnomaOqilgan!.add(obyektlar[k].id);
    xabar();
  });
  // Har akt: birinchi qatorining raw_snapshot i (≈0,4 KB; server JSON-yo'l ustunlarini qabul qilmaydi).
  // Bitta akt = bitta import ishi = bitta manba fayl (import_job_id, hujjat_id, fayl); belgisiz — tizimda yasalgan.
  const manbaIshi = navbat(xom, 10, a => sbOqi<{ raw_snapshot: Record<string, unknown> | null }>({ jadval: 't2_akt_qator', filtr: `akt_id=eq.${a.id}`, limit: 1, ustunlar: 'raw_snapshot' }), (k, r) => {
    if (!r.ok) { m.manbaXato++; xabar(); return; }
    const q = r.qatorlar?.[0], s = q ? q.raw_snapshot ?? {} : null;
    const mb = manbaAniqla(s);
    m.aktlar[k] = { ...m.aktlar[k], ...mb };
    const fayl = s && typeof s.fayl === 'string' ? s.fayl : null;
    if (mb.hujjat_id != null && fayl) m.faylNomlari.set(mb.hujjat_id, fayl);
    m.manbaOqilgan!.add(m.aktlar[k].id);
    xabar();
  });
  await Promise.all([shartnomaIshi, manbaIshi]);
  if (bogXato) throw new Error('SHARTNOMA_BOGLANISHLARI_OQILMADI');
  m.tayyor = true;
  return nusxa();
}

/** Obyektga yuklangan F2 import fayllari (manba hujjatlar, turi «f2_akt») — obyekt qatori ochilganda o'qiladi. */
export async function obyektF2Fayllari(kompaniyaId: number, obyektId: number): Promise<CenterDocument[]> {
  const r = await hujjatRoyxatOl({ kompaniyaId, obyektId, limit: 500 });
  return r.documents.filter(d => d.type === 'f2_akt');
}
