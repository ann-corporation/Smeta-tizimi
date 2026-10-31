/**
 * Obyekt paketi o'qish porti (ADR OBYEKT_PAKET §1.4) — `/api/obyekt-paket`.
 * Sahifalarga hali ulanmagan (PR2). Vaqt chegarasi — umumiy `vaqtliFetch` (o'qish 60 s).
 */
import { OQISH_CHEGARA_MS, vaqtliFetch } from './supabase';
import type { PaketXom } from '../ombor/paket';

export type ObyektRev = { rev: number; meta_rev: number; toliq_rev: number; min_rev: number; obyekt_id: number; kompaniya_id: number };

export type PaketJavob =
  | { ok: true; ozgarmagan: false; paket: PaketXom; etag: string | null; kesh: string | null }
  | { ok: true; ozgarmagan: true; etag: string | null }
  | { ok: false; status: number; code?: string; error: string };

const yol = (obyektId: number, q = '') => '/api/obyekt-paket?obyekt_id=' + encodeURIComponent(String(obyektId)) + q;

async function xatoJavob(r: Response): Promise<{ ok: false; status: number; code?: string; error: string }> {
  const j = await r.json().catch(() => null) as { code?: string; error?: string } | null;
  return { ok: false, status: r.status, code: j?.code, error: j?.error || 'Obyekt paketi olinmadi (' + r.status + ')' };
}

const tarmoqXato = (e: unknown) => ({ ok: false as const, status: 0,
  error: e instanceof DOMException && e.name === 'AbortError' ? 'Server 60 soniyada javob bermadi.' : 'Obyekt paketini yuklab bo‘lmadi.' });

/** Arzon probe: {rev, meta_rev, …}. */
export async function obyektRevOl(obyektId: number): Promise<{ ok: true; rev: ObyektRev } | { ok: false; status: number; code?: string; error: string }> {
  try {
    const r = await vaqtliFetch(yol(obyektId, '&rev_faqat=1'), { credentials: 'same-origin' }, OQISH_CHEGARA_MS);
    if (!r.ok) return xatoJavob(r);
    return { ok: true, rev: await r.json() as ObyektRev };
  } catch (e) { return tarmoqXato(e); }
}

/** To'liq paket. `etag` berilsa va o'zgarmagan bo'lsa — 304 (`ozgarmagan: true`, tana yo'q). */
export async function obyektPaketOl(obyektId: number, etag?: string | null): Promise<PaketJavob> {
  try {
    const r = await vaqtliFetch(yol(obyektId), { credentials: 'same-origin', headers: etag ? { 'If-None-Match': etag } : {} }, OQISH_CHEGARA_MS);
    if (r.status === 304) return { ok: true, ozgarmagan: true, etag: r.headers.get('ETag') ?? etag ?? null };
    if (!r.ok) return xatoJavob(r);
    return { ok: true, ozgarmagan: false, paket: await r.json() as PaketXom, etag: r.headers.get('ETag'), kesh: r.headers.get('X-Paket-Kesh') };
  } catch (e) { return tarmoqXato(e); }
}
