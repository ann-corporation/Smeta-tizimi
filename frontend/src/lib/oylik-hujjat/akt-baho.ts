/**
 * Hisobot oyigacha (oy <= davr) HAMMA tasdiqlangan F2 aktlari — har biri O'Z podvali bilan (`f2AktBaho` yadro, portfel bilan bir xil).
 * F-3 («с начала», «с начала года», «за месяц») va nakopitelniy «ИТОГО К ОПЛАТЕ» shu yig'indidan: imzolangan F2 hujjatlari ВСЕГО yig'indisi
 * (server `_t2_summa_paket_v1` bilan tiyinigacha). Akt qatori smetada topilmasa — throw (yarim summa bilan hujjat tuzilmaydi).
 */
import { portfelObyektOl } from '../../api/f2-oylik-paket';
import { oyAktlarBahosi } from '../f2-oylik-paket/portfel';
import type { F3DavrAktKeng as F3DavrAkt } from '../f2-oylik-paket/portfel';

export type AktQatorKirish = { akt_id: number; akt_holat?: string | null; oy: string; raqam?: string | null };

/** `tanlangan` berilsa — hisobot oyining FAQAT shu aktlari kiradi (oldingi oylar hammasi). Natija: har akt `oy` («YYYY-MM») bilan. */
export async function aktlarBahosiOl(p: {
  kompaniyaId: number; obyektId: number; obyektNom: string; qatorlar: ReadonlyArray<AktQatorKirish>; davr: string; tanlangan?: ReadonlySet<number> | null;
}): Promise<F3DavrAkt[]> {
  const oy = p.davr.slice(0, 7);
  const aktlar = new Map<number, { id: number; oy: string; raqam: string | null }>();
  for (const l of p.qatorlar) {
    const lOy = String(l.oy).slice(0, 7);
    if (l.akt_holat !== 'tasdiqlangan' || lOy > oy) continue;
    if (lOy === oy && p.tanlangan && !p.tanlangan.has(l.akt_id)) continue;
    aktlar.set(l.akt_id, { id: l.akt_id, oy: l.oy, raqam: l.raqam ?? null });
  }
  if (!aktlar.size) return [];
  const pm = await portfelObyektOl(p.kompaniyaId, p.obyektId, [...aktlar.keys()]);
  const baho = oyAktlarBahosi(pm, [...aktlar.values()], p.obyektNom, new Map([...aktlar.values()].map((a) => [a.id, a.raqam] as const)));
  return baho.map((b) => ({ ...b, oy: String(aktlar.get(b.aktId)?.oy ?? '').slice(0, 7) }));
}
