/**
 * Jarvis F2/fakt vositalari gateway mijozi — YAGONA server nuqtasi `/api/f2-buyruq` (web, Android BFF, Telegram bir xil mantiq).
 * Shartnoma: frontend/functions/api/f2-buyruq.ts. Aktor sessiyadan; mijoz hech qachon actor_id yubormaydi.
 * Yozuvchi vositalar avval PREVIEW (server dry_run) + token qaytaradi; yozish faqat `f2Tasdiq` bilan.
 */
import type { F2Javob } from '../lib/jarvis/f2-javob';
export type { F2Javob, F2Preview, F2Uchlik } from '../lib/jarvis/f2-javob';

export async function f2Buyruq(kompaniyaId: number, body: Record<string, unknown>): Promise<F2Javob> {
  try {
    const r = await fetch('/api/f2-buyruq', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kompaniya_id: kompaniyaId, ...body }) });
    const j = await r.json().catch(() => null) as F2Javob | null;
    return j && typeof j === 'object' ? { ...j, ok: r.ok && j.ok !== false } : { ok: false, code: 'JAVOB_YOQ' };
  } catch { return { ok: false, code: 'TARMOQ_XATO' }; }
}
export const f2Vosita = (kompaniyaId: number, nom: string, args: Record<string, unknown>) => f2Buyruq(kompaniyaId, { amal: 'vosita', nom, args });
export const f2Tasdiq = (kompaniyaId: number, token: string) => f2Buyruq(kompaniyaId, { amal: 'tasdiq', token, tasdiqlayman: true });
