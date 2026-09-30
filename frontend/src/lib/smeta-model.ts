/**
 * smeta-model.ts — SMETAGA BOG'LIQ BARCHA FUNKSIYALAR UCHUN YAGONA SMETA MODELI.
 *
 * Egasi 2026-09-30: "nakrutka ham, F2 import ham — hamma smetaga bog'liq funksiyalar shu bitta
 * smeta bilan ishlaydigan modul orqali ishlasin. Smetadan bir variant o'zgarish chiqsa, bitta
 * o'shani o'zgartirganimizda qolgan funksiyalar uchun ham to'g'ri ishlaydi".
 *
 * Bu modul bazadagi kanonik smetani (t2_daraxt + zamena bog'lanishi) BIR MARTA o'qiydi va
 * hujjat/hisob funksiyalari (Nakopitelniy, F3, M-29, Slichitelniy, LRV, F2 tasdiqlash…) uchun
 * umumiy qoidalarni beradi:
 *   - daraxt: ota, daraja, tartib (zamena almashtirgan qatoridan KEYIN) — `tartibla`;
 *   - o'zgarish semantikasi: qo'shimcha ish / zamena (qaysi qator o'rniga) — `ozgarishIzohi`.
 * Fayl o'qish (Excel → smeta) — smeta-anatomiya; bu yerda — bazadagi smetaning ma'nosi.
 */
import { sbOqi, sbT2DaraxtOl } from '../api/supabase';
import { daraxtTartibida } from './daraxt-tartibi';

export interface SmetaModelQator {
  id: number; ota_id: number | null; daraja: number | null; tur: string | null;
  kod: string | null; nom: string | null; birlik: string | null;
  qoshimcha: boolean; zamena: boolean;
  /** Zamena qatori qaysi smeta qatori o'rniga (replaces_line_id). */
  almashtirgan: number | null;
}

export interface SmetaModel {
  byId: ReadonlyMap<number, SmetaModelQator>;
  /** zamena qatori id → almashtirgan (eski) qator id. */
  almashtiradi: ReadonlyMap<number, number>;
}

export function smetaModeliQur(qatorlar: ReadonlyArray<Omit<SmetaModelQator, 'almashtirgan'> & { almashtirgan?: number | null }>): SmetaModel {
  const byId = new Map<number, SmetaModelQator>();
  const almashtiradi = new Map<number, number>();
  for (const q of qatorlar) {
    const r: SmetaModelQator = { ...q, qoshimcha: Boolean(q.qoshimcha), zamena: Boolean(q.zamena), almashtirgan: q.almashtirgan ?? null };
    byId.set(r.id, r);
    if (r.zamena && r.almashtirgan != null) almashtiradi.set(r.id, r.almashtirgan);
  }
  return { byId, almashtiradi };
}

/** Obyekt smetasini bir marta o'qiydi (daraxt + zamena bog'lanishi). Xato bo'lsa — bo'sh model (hujjat to'xtamaydi). */
export async function smetaModeliniYukla(obyektId: number): Promise<SmetaModel> {
  const [d, z] = await Promise.all([
    sbT2DaraxtOl(obyektId, 'id,ota_id,daraja,tur,kod,nom,birlik,qoshimcha,zamena'),
    sbOqi<{ id: number; replaces_line_id: number | null }>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&zamena=is.true`, ustunlar: 'id,replaces_line_id', limit: 20000 }).catch(() => null),
  ]);
  const alm = new Map<number, number>();
  if (z?.ok) for (const r of z.qatorlar ?? []) if (r.replaces_line_id != null) alm.set(Number(r.id), Number(r.replaces_line_id));
  const rows = d.ok ? (d.qatorlar ?? []) : [];
  return smetaModeliQur(rows.map((q) => ({
    id: Number(q.id), ota_id: q.ota_id ?? null, daraja: q.daraja ?? null, tur: q.tur ?? null,
    kod: q.kod ?? null, nom: q.nom ?? null, birlik: q.birlik ?? null,
    qoshimcha: Boolean(q.qoshimcha), zamena: Boolean(q.zamena), almashtirgan: alm.get(Number(q.id)) ?? null,
  })));
}

/**
 * Hujjatdagi izoh (ruscha, rasmiy): qo'shimcha ish yoki zamena — nima o'rniga.
 * Egasi 2026-09-30: "F3 va Nakopitelniyda qo'shimcha ish yoki zamenani topolmayapman — aniq izoh
 * bilan ajralib turishi kerak; zamena bor, lekin nima ekani bilinmaydi".
 */
export function ozgarishIzohi(q: { qator_id?: number; id?: number; qoshimcha?: boolean | null; zamena?: boolean | null }, model?: SmetaModel | null): string | null {
  if (q.zamena) {
    const id = q.qator_id ?? q.id;
    const eskiId = id != null ? model?.almashtiradi.get(id) : undefined;
    const eski = eskiId != null ? model?.byId.get(eskiId) : undefined;
    const eskiNom = eski ? `${eski.kod ? eski.kod + ' ' : ''}${eski.nom ?? ''}`.trim() : '';
    return eskiNom ? `ЗАМЕНА: вместо «${eskiNom}»` : 'ЗАМЕНА позиции сметы';
  }
  if (q.qoshimcha) return 'ДОПОЛНИТЕЛЬНАЯ РАБОТА (не предусмотрена сметой)';
  return null;
}

/** Nom + izoh (hujjat katagi uchun): "НАИМЕНОВАНИЕ [ЗАМЕНА: вместо «…»]". */
export function nomIzohBilan(nom: string, izoh: string | null | undefined): string {
  return izoh ? `${nom} [${izoh}]` : nom;
}

/** Qatorlarni smeta DARAXT tartibida (zamena — almashtirgan qatoridan keyin). */
export function tartibla<T extends { qator_id: number; ota_id?: number | null; tartib?: number | null }>(rows: readonly T[], model?: SmetaModel | null): T[] {
  return daraxtTartibida(rows, model?.almashtiradi);
}
