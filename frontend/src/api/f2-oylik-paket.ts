/**
 * Oylik F2 paketi uchun faqat o'qish: obyektning smeta daraxti, shu oyning F2 tafsilot qatorlari va hujjat konteksti
 * (ustama koeffitsientlari, podval, imzo). Hech narsa yozilmaydi; mavjud o'qishlar (F2 tarixi bilan bir xil) chaqiriladi.
 */
import { sbOqi, sbT2DaraxtOl, type T2Qator } from './supabase';
import { aktPodvallariniOl } from './t2-akt-podval';
import { aktPodvalXaritasi, type AktPodvalQator } from '../lib/akt-podval';
import type { PereraschetAktQator } from '../lib/f2-pereraschet';
import { sbT2F2TafsilotOl, type F2Tafsilot } from './t2-narx';
import { T2_DARAXT_USTUNLARI } from './t2-daraxt-ustunlar';
import { f2HujjatKonteksti, type F2HujjatKonteksti } from './f2-hujjat-kontekst';
import { shartnomaSvodOl } from './t2-nakopitelniy';
import type { SvodShartnoma } from '../lib/nakopitelniy-svod';
import { t2ToliqOqi } from './t2-toliq-oqish';

export type OyObyektMalumot = { smeta: T2Qator[]; tafsilot: F2Tafsilot[]; kontekst: F2HujjatKonteksti };

/* ───────────── Smeta TARIXI bilan (audit C B2) ───────────── */

const BOLAK = 150;

/**
 * Saqlangan F2 qatorlari ESKI smeta versiyasida bo'lishi mumkin (`t2_daraxt` faqat faol versiya — 20261114700000).
 * Faol daraxtda yo'q akt qatorlari `t2_qator` dan id bo'yicha (versiya: tarix, AGENTS.md 2c-B) o'qiladi, ota zanjiri
 * (razdel/ish) bilan; tarixdagi ishlarning bolalari ham (server barg qoidasi uchun). Faol daraxt + tarix qatorlari qaytadi.
 * O'qish xato / to'liq emas — throw (yarim daraxtdan hujjat yoki summa chiqmaydi). Topilmagan id lar chaqiruvchida
 * `topilmagan` bo'lib qoladi (eksport bloklanadi).
 */
export async function smetaTarixBilan(obyektId: number, smeta: readonly T2Qator[], qatorIdlar: Iterable<number>): Promise<T2Qator[]> {
  const bor = new Map(smeta.map((r) => [r.id, r] as const));
  const qoshimcha: T2Qator[] = [];
  const oqi = async (filtrQism: string): Promise<void> => {
    // versiya: tarix — F2 tarixi almashtirilgan qatorlarda (AGENTS.md 2c-B)
    const r = await sbOqi<T2Qator>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&${filtrQism}`, limit: 5000, versiya: 'tarix' });
    if (!r.ok || r.toliq === false) throw new Error('SMETA_TARIX_OQILMADI');
    for (const q of r.qatorlar ?? []) if (!bor.has(q.id)) { bor.set(q.id, q); qoshimcha.push(q); }
  };
  const bolaklab = async (ids: readonly number[], f: (b: string) => string) => {
    for (let i = 0; i < ids.length; i += BOLAK) await oqi(f(ids.slice(i, i + BOLAK).join(',')));
  };
  let kerak = [...new Set(qatorIdlar)].filter((id) => Number.isSafeInteger(id) && id > 0 && !bor.has(id));
  if (!kerak.length) return [...smeta];
  for (let daraja = 0; kerak.length && daraja < 16; daraja++) {
    const oldin = qoshimcha.length;
    await bolaklab(kerak, (b) => `id=in.(${b})`);
    kerak = [...new Set(qoshimcha.slice(oldin).map((q) => q.ota_id).filter((x): x is number => x != null && !bor.has(x)))];
  }
  const tarixIshlar = qoshimcha.filter((q) => q.tur === 'bl').map((q) => q.id);
  await bolaklab(tarixIshlar, (b) => `ota_id=in.(${b})`);
  return [...smeta, ...qoshimcha];
}

/**
 * `t2_akt_qator` (raw_snapshot bilan) — NOYOB tartib (id) va to'liqlik tekshiruvi bilan (audit C M1: tartibsiz OFFSET
 * sahifalash > 1000 qatorda takror/yo'qolish berardi). Xato / to'liq emas — throw.
 */
export type AktQatorXom = PereraschetAktQator & { id: number; akt_id: number; narx?: number | string | null; summa?: number | string | null };
export async function aktQatorlariOl(obyektId: number, aktIdlar: readonly number[]): Promise<Map<number, AktQatorXom[]>> {
  const ids = [...new Set(aktIdlar)].filter((x) => Number.isSafeInteger(x) && x > 0);
  const out = new Map<number, AktQatorXom[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await t2ToliqOqi<AktQatorXom>(sbOqi, {
      jadval: 't2_akt_qator', filtr: `obyekt_id=eq.${obyektId}&akt_id=in.(${ids.slice(i, i + 100).join(',')})`,
      ustunlar: 'id,akt_id,qator_id,hajm,narx,summa,certified_quantity,certified_unit_price,certified_amount,raw_snapshot', limit: 200000,
    }, 'id');
    if (!r.ok || r.toliq === false) throw new Error('AKT_QATOR_OQILMADI');
    for (const q of r.qatorlar ?? []) {
      const l = out.get(q.akt_id);
      if (l) l.push(q); else out.set(q.akt_id, [q]);
    }
  }
  return out;
}

/* ───────────── F2 portfeli (egasi 2026-11-05): obyektning BARCHA oylari, F2 tarixi bilan bir xil o'qishlar ───────────── */

export type PortfelObyektMalumot = OyObyektMalumot & {
  /** Akt id → `t2_akt_qator` qatorlari (raw_snapshot bilan — storno bloklari). */
  aktQatorlar: Map<number, PereraschetAktQator[]>;
  /** `akt:blok` → hujjat podvali (`t2_akt_podval`). */
  podvallar: Map<string, AktPodvalQator>;
};

/**
 * Bir obyekt: smeta (+ akt qatorlari uchun tarix) + barcha F2 tafsilot + kontekst + akt podvallari + akt qatorlari
 * (faqat berilgan aktlar). Faqat o'qish. Biror o'qish xato/to'liq emas bo'lsa — throw (yarim ma'lumotdan summa
 * hisoblanmaydi; podval o'qilmasa jim smeta podvaliga o'tilmaydi).
 */
export async function portfelObyektOl(kompaniyaId: number, obyektId: number, aktIdlar: readonly number[]): Promise<PortfelObyektMalumot> {
  const [daraxt, kontekst, tafsilot, pv, aq] = await Promise.all([
    sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI),
    f2HujjatKonteksti(kompaniyaId, obyektId),
    sbT2F2TafsilotOl({ obyektId, tur: 'f2' }),
    aktPodvallariniOl(obyektId),
    aktQatorlariOl(obyektId, aktIdlar),
  ]);
  if (!daraxt.ok || daraxt.toliq === false) throw new Error('SMETA_OQILMADI');
  if (!tafsilot.ok || tafsilot.toliq === false) throw new Error('F2_TAFSILOT_OQILMADI');
  if (kontekst.xato) throw new Error(`USTAMA_OQILMADI: ${kontekst.xato}`);
  if (!pv.ok) throw new Error('PODVAL_OQILMADI');
  const lines = (tafsilot.qatorlar ?? []) as F2Tafsilot[];
  const smeta = await smetaTarixBilan(obyektId, (daraxt.qatorlar ?? []) as unknown as T2Qator[], lines.map((l) => l.qator_id));
  return { smeta, tafsilot: lines, kontekst, aktQatorlar: aq as Map<number, PereraschetAktQator[]>, podvallar: aktPodvalXaritasi(pv.podvallar) };
}

/** Bir obyekt: smeta (+ tarix) + F2 tafsilot (barcha oylar — `oy` filtri har aktning o'z oyi bilan chaqiriladi) + kontekst. Xato — throw. */
export async function oyObyektOl(kompaniyaId: number, obyektId: number, oylar: readonly string[]): Promise<OyObyektMalumot> {
  const [daraxt, kontekst, ...tafsilotlar] = await Promise.all([
    sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI),
    f2HujjatKonteksti(kompaniyaId, obyektId),
    ...oylar.map((oy) => sbT2F2TafsilotOl({ obyektId, tur: 'f2', oy })),
  ]);
  if (!daraxt.ok || daraxt.toliq === false) throw new Error('SMETA_OQILMADI');
  if (tafsilotlar.some((d) => !d.ok || d.toliq === false)) throw new Error('F2_TAFSILOT_OQILMADI');
  // Ustama/podval o'qilmasa paket jimgina standart podval yoki ustamasiz hisoblanmaydi — sabab bilan to'xtaydi.
  if (kontekst.xato) throw new Error(`USTAMA_OQILMADI: ${kontekst.xato}`);
  const tafsilot = tafsilotlar.flatMap((d) => (d.qatorlar ?? []) as F2Tafsilot[]);
  const smeta = await smetaTarixBilan(obyektId, (daraxt.qatorlar ?? []) as unknown as T2Qator[], tafsilot.map((l) => l.qator_id));
  return { smeta, tafsilot, kontekst };
}

/** Forma-3 (akt-sverkadagi «Продажа» asosida) uchun shartnoma svodi. Xato — null (paket F3 siz yig'iladi, foydalanuvchiga aytiladi). */
export async function f3SvodOl(kompaniyaId: number): Promise<SvodShartnoma[] | null> {
  const r = await shartnomaSvodOl(kompaniyaId);
  return r.ok ? r.natija.shartnomalar : null;
}
