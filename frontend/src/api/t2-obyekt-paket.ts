/**
 * Obyekt paketi o'qish porti (ADR OBYEKT_PAKET §1.4, PR1a) — `/api/obyekt-paket`.
 * Sahifalarga hali ulanmagan (PR2, bayroq ostida). D2 conditional reader alohida export, legacy shakl saqlanadi.
 * PR2 eslatmasi (L1): f2.read/narx.read yo'q foydalanuvchi 403 PERMISSION_DENIED oladi — eski o'qish yo'liga qaytish shart.
 */
import { OQISH_CHEGARA_MS, vaqtliFetch } from './supabase';
import type { PaketXom } from '../ombor/paket';

export type PaketJavob =
  | { ok: true; paket: PaketXom }
  | { ok: false; status: number; code?: string; error: string };

export type PaketTekshirJavob = Exclude<PaketJavob, { ok: true }> |
  { ok: true; notModified: true; etag: string } |
  { ok: true; notModified: false; paket: PaketXom; etag: string | null };

/** To'liq obyekt paketi (keshsiz; ETag/delta — keyingi PR lar). */
export async function obyektPaketOl(obyektId: number): Promise<PaketJavob> {
  const r = await obyektPaketTekshir(obyektId);
  if (!r.ok) return r;
  if (r.notModified) return { ok: false, status: 502, code: 'UNEXPECTED_304', error: 'Obyekt paketini yuklab bo‘lmadi.' };
  return { ok: true, paket: r.paket };
}

/** D2: 304 — faqat oldingi tasdiqlangan paket/muhr jufti bor caller uchun. */
export async function obyektPaketTekshir(obyektId: number, etag?: string): Promise<PaketTekshirJavob> {
  try {
    const r = await vaqtliFetch('/api/obyekt-paket?obyekt_id=' + encodeURIComponent(String(obyektId)),
      { credentials: 'same-origin', cache: 'no-store', ...(etag ? { headers: { 'If-None-Match': etag } } : {}) }, OQISH_CHEGARA_MS);
    if (r.status === 304) {
      const actual = r.headers.get('ETag');
      if (!etag || !actual || actual.replace(/^W\//, '') !== etag.replace(/^W\//, '')) {
        return { ok: false, status: 502, code: 'PAKET_MUHR_INVALID', error: 'Obyekt paketini yuklab bo‘lmadi.' };
      }
      return { ok: true, notModified: true, etag: actual };
    }
    if (!r.ok) {
      const j = await r.json().catch(() => null) as { code?: string; error?: string } | null;
      return { ok: false, status: r.status, code: j?.code, error: j?.error || 'Obyekt paketi olinmadi (' + r.status + ')' };
    }
    return { ok: true, notModified: false, paket: await r.json() as PaketXom, etag: r.headers.get('ETag') };
  } catch (e) {
    return { ok: false, status: 0,
      error: e instanceof DOMException && e.name === 'AbortError' ? 'Server 60 soniyada javob bermadi.' : 'Obyekt paketini yuklab bo‘lmadi.' };
  }
}
