/**
 * t2-f2-versiya-kochirma.ts — smeta versiyasi faollashtirilgandan keyin eski (almashtirilgan) qatorlardagi tasdiqlangan F2
 * ning yangi faol qatorga ko'chirmasi (20261203001000). O'qish: /api/sb {soro:'f2_versiya_kochirma_v1'}; actor sessiyadan.
 * Faqat ko'rsatish qatlami — hech qanday jamiga qo'shilmaydi (eski F2 obyekt jamisida eski qatorda bir marta).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import type { F2VersiyaKochirma } from '../lib/f2-versiya-kochirma';

export async function f2VersiyaKochirmaOl(obyektId: number): Promise<{ ok: true; natija: F2VersiyaKochirma } | { ok: false; error: string }> {
  const r = await vaqtliOqish('/api/sb', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soro: 'f2_versiya_kochirma_v1', obyekt_id: obyektId }),
  });
  const j = await r.json() as { ok: boolean; natija?: (Omit<F2VersiyaKochirma, 'ok'> & { ok?: boolean; code?: string }); error?: string };
  const n = j.natija;
  if (!j.ok || !n || n.ok !== true) return { ok: false, error: j.error || n?.code || 'F2_VERSIYA_KOCHIRMA_OQILMADI' };
  return { ok: true, natija: { ...n, ok: true } };
}
