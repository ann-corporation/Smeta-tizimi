/**
 * api/t2-nashr.ts - manba QR nashri adapteri (brauzer): /api/imzo nashr_tayyor / nashr_nusxa va R2 ga nusxa yuklash (hujjat-yukla).
 * Alohida fayl: downloadBlob uni FAQAT nashr yoqilganda dinamik yuklaydi (asosiy bundlega tushmaydi).
 */
import { hujjatYukla } from './t2-hujjat-canonical';
import type { NashrAdapter } from '../lib/imzo/nashr';

async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch('/api/imzo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    return r.ok && j?.ok === true ? j : null;
  } catch { return null; }
}

export const nashrAdapter: NashrAdapter = {
  tayyor: async (b) => {
    const j = await post({ amal: 'nashr_tayyor', ...b });
    return j && typeof j.token === 'string' ? { ok: true, token: j.token, yangi: j.yangi === true, hujjat_id: typeof j.hujjat_id === 'number' ? j.hujjat_id : null } : { ok: false };
  },
  yukla: async ({ bytes, nom, kompaniyaId, obyektId }) => {
    const file = new File([bytes as BlobPart], nom, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const r = await hujjatYukla({ file, kompaniyaId, obyektId, documentType: 'nashr' });
    return r.ok ? r.data.document_id : null;
  },
  biriktir: async (token, hujjatId) => (await post({ amal: 'nashr_nusxa', token, hujjat_id: hujjatId })) !== null,
  origin: () => window.location.origin,
};
