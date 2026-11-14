/**
 * Moslash qutisi (istisnolar qutisi) klienti. O'qish: /api/sb `moslash_qutisi_v1` (a'zolik + financial.read, bazada). FAQAT O'QISH:
 * tizim tafovutni aniqlaydi va ko'rsatadi, hech narsani o'zi tuzatmaydi.
 */
export type MoslashTur = 'f2_podval_farq' | 'f2_podval_yoq' | 'kesh_eskirgan' | 'fakt_kam_f2' | 'narxsiz' | 'f3_f2_farq';
export type MoslashBand = { tur: MoslashTur | string; obyekt_id: number | null; obyekt_nom: string | null; akt_id: number | null; akt_raqam: string | null; summa: number | null; farq: number | null; izoh: string; havola: string };
export type MoslashQutisi = { jami: number; tur_soni: Record<string, number>; bandlar: MoslashBand[]; hisoblandi: string | null; hisoblanmagan?: boolean; eskirgan?: boolean };

const son = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function moslashTozala(x: unknown): MoslashQutisi | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (o.ok !== true || !Array.isArray(o.bandlar)) return null;
  const bandlar = o.bandlar.filter((b): b is Record<string, unknown> => !!b && typeof b === 'object').map((b) => ({
    tur: String(b.tur ?? ''), obyekt_id: son(b.obyekt_id), obyekt_nom: typeof b.obyekt_nom === 'string' ? b.obyekt_nom : null,
    akt_id: son(b.akt_id), akt_raqam: typeof b.akt_raqam === 'string' ? b.akt_raqam : null, summa: son(b.summa), farq: son(b.farq),
    izoh: String(b.izoh ?? ''), havola: typeof b.havola === 'string' && b.havola.startsWith('/') && !b.havola.startsWith('//') ? b.havola : '/admin/solishtiruv',
  }));
  const ts = o.tur_soni && typeof o.tur_soni === 'object' ? Object.fromEntries(Object.entries(o.tur_soni as Record<string, unknown>).map(([k, v]) => [k, son(v) ?? 0])) : {};
  return { jami: son(o.jami) ?? bandlar.length, tur_soni: ts, bandlar, hisoblandi: typeof o.hisoblandi === 'string' ? o.hisoblandi : null, ...(o.hisoblanmagan === true ? { hisoblanmagan: true } : {}), ...(o.eskirgan === true ? { eskirgan: true } : {}) };
}

/** null — o'qilmadi (ruxsat yo'q, migratsiya qo'llanmagan yoki tarmoq): «bo'sh» deb ko'rsatilmaydi. */
export async function moslashQutisiOl(kompaniyaId: number): Promise<MoslashQutisi | null> {
  try {
    const r = await fetch('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soro: 'moslash_qutisi_v1', kompaniya_id: kompaniyaId }) });
    const j = await r.json() as { ok?: boolean; natija?: unknown };
    return r.ok && j.ok !== false ? moslashTozala(j.natija) : null;
  } catch { return null; }
}
