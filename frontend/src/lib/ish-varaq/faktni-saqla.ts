/**
 * Fakt paketini BITTA tranzaksiyada yozish (Fakt jurnali va Ish varag'i uchun yagona yo'l):
 * CAS («jami» kiritmalar serverdagi faktga nisbatan) → topshirilgan paket ogohi → `sbFaktYoz` (`fakt_yoz_v2`).
 * Toast/UI chaqiruvchida; bu yerda faqat natija turi qaytadi. Istisno (tarmoq/chunk) — chaqiruvchining catch'iga o'tadi.
 */
import { sbFaktYoz } from '../../api/t2-fakt';
import { sbT2QatorHolatQisman } from '../../api/t2-holat-qisman';
import { topshirilganPaketOgohi } from '../f2-oylik-paket/ogoh';
import { casZiddiyat } from '../fakt-foiz-grid';

export type FaktPaketQator = { qator_id: number; hajm: number };
export type FaktSaqlashNatijasi =
  | { ok: true; idlar: Set<number>; /** Server shu operation_id ni avval bajargan (hech narsa yangi yozilmadi). */ takror: boolean;
      /** Narxsiz (summasi bo'sh) qatorlar soni — fakt yozildi, lekin summa narx qo'yilguncha bo'sh (bloklanmaydi, ogohlantiriladi). */ narxsiz?: number }
  | { ok: false; sabab: 'HOLAT'; kod?: string; matn?: string }
  | { ok: false; sabab: 'CAS'; ziddiyat: Array<{ id: number; brauzer: number; server: number | null }> }
  | { ok: false; sabab: 'YOZ'; matn: string; tarmoq: boolean; kod?: string };

export async function faktPaketniYoz(a: {
  obyektId: number; sana: string; operationId: string;
  qatorlar: FaktPaketQator[];
  /** CAS tekshiriladigan qator id lari («jami» kiritmalari + tuzatish deltalari). */
  jamiIdlar: readonly number[];
  /** Brauzerdagi joriy faktlar (CAS uchun). */
  faktlar: ReadonlyMap<number, number>;
  izoh: string;
}): Promise<FaktSaqlashNatijasi> {
  if (a.jamiIdlar.length) {
    const h = await sbT2QatorHolatQisman(a.obyektId, a.jamiIdlar);
    if (!h.ok) return { ok: false, sabab: 'HOLAT', kod: h.code, matn: h.error };
    const server = new Map((h.qatorlar ?? []).map((x) => [Number(x.qator_id), Number(x.fakt_hajm ?? 0)] as const));
    const z = casZiddiyat(a.jamiIdlar, a.faktlar, server);
    if (z.length) return { ok: false, sabab: 'CAS', ziddiyat: z };
  }
  await topshirilganPaketOgohi(a.obyektId, a.sana); // topshirilgan oylik paket bo'lsa - ogohlantirish (saqlashni to'smaydi)
  const r = await sbFaktYoz({ obyektId: a.obyektId, sana: a.sana, operationId: a.operationId, qatorlar: a.qatorlar, izoh: a.izoh });
  if (!r.ok) return { ok: false, sabab: 'YOZ', matn: r.error || r.xabar || 'Fakt saqlanmadi.', tarmoq: r.code === 'NETWORK' || r.code === 'OFFLINE' || r.code === 'SEND_FAILED', kod: r.code };
  return { ok: true, idlar: new Set(a.qatorlar.map((x) => x.qator_id)), takror: r.takror === true, narxsiz: Number(r.narxsiz_soni) > 0 ? Number(r.narxsiz_soni) : 0 };
}
