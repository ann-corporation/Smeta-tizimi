/**
 * Obyekt paketi o'qish porti (ADR OBYEKT_PAKET §1.4, PR1a) — `/api/obyekt-paket`.
 * Sahifalarga hali ulanmagan (PR2, bayroq ostida). Vaqt chegarasi — umumiy `vaqtliFetch` (o'qish 60 s).
 * PR2 eslatmasi (L1): f2.read/narx.read yo'q foydalanuvchi 403 PERMISSION_DENIED oladi — eski o'qish yo'liga qaytish shart.
 */
import { OQISH_CHEGARA_MS, vaqtliFetch } from './supabase';
import type { PaketXom } from '../ombor/paket';

export type PaketJavob =
  | { ok: true; paket: PaketXom }
  | { ok: false; status: number; code?: string; error: string };

/** To'liq obyekt paketi (keshsiz; ETag/delta — keyingi PR lar). */
export async function obyektPaketOl(obyektId: number): Promise<PaketJavob> {
  try {
    const r = await vaqtliFetch('/api/obyekt-paket?obyekt_id=' + encodeURIComponent(String(obyektId)),
      { credentials: 'same-origin', cache: 'no-store' }, OQISH_CHEGARA_MS);
    if (!r.ok) {
      const j = await r.json().catch(() => null) as { code?: string; error?: string } | null;
      return { ok: false, status: r.status, code: j?.code, error: j?.error || 'Obyekt paketi olinmadi (' + r.status + ')' };
    }
    return { ok: true, paket: await r.json() as PaketXom };
  } catch (e) {
    return { ok: false, status: 0,
      error: e instanceof DOMException && e.name === 'AbortError' ? 'Server 60 soniyada javob bermadi.' : 'Obyekt paketini yuklab bo‘lmadi.' };
  }
}
