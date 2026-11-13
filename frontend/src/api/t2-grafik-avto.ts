/** P6/P7 klienti: avto grafik + cashflow. Shlyuz: /api/grafik (ruxsat va tomon granti bazada). */
import { grafikMalumot, type GrafikMalumot } from '../lib/grafik/reja';

type Xato = { ok: false; error: string; code?: string };

const XATOLAR: Record<string, string> = {
  VERSIYA_ESKI: 'Sozlama shu orada o‘zgargan — sahifani yangilab qayta urining.',
  RUXSAT_YOQ: 'Grafik sozlamasini o‘zgartirish huquqingiz yo‘q.',
  TOMON_RUXSAT_YOQ: 'Bu obyektning grafigini ko‘rishga ruxsat berilmagan.',
  AZO_EMAS: 'Siz bu kompaniyaning faol a’zosi emassiz.',
};
const xato = (j: { code?: string; error?: string } | null): Xato => ({ ok: false, code: j?.code, error: (j?.code && XATOLAR[j.code]) || j?.error || 'Amal bajarilmadi.' });

/** Grafik ma'lumotini oladi. `beruvchiKompaniyaId` berilsa - buyurtmachi (tomon) ko'rinishi. */
export async function grafikOl(kompaniyaId: number, obyektId: number, beruvchiKompaniyaId?: number | null): Promise<{ ok: true; malumot: GrafikMalumot } | Xato> {
  try {
    const q = new URLSearchParams({ kompaniya_id: String(kompaniyaId), obyekt_id: String(obyektId), ...(beruvchiKompaniyaId ? { beruvchi_kompaniya_id: String(beruvchiKompaniyaId) } : {}) });
    const r = await fetch('/api/grafik?' + q.toString(), { credentials: 'same-origin' });
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (!r.ok || !j) return xato(j as { code?: string; error?: string } | null);
    const m = grafikMalumot(j);
    return m ? { ok: true, malumot: m } : { ok: false, error: 'Server javobi noto‘g‘ri.' };
  } catch { return { ok: false, error: 'Tarmoq xatosi' }; }
}

export type SozlamaYuk = {
  kompaniyaId: number; obyektId: number; razdelId: number;
  brigada?: number | null; smenaSoat?: number | null; boshlanishSana?: string | null; kun?: number | null;
  kutilganVersiya?: number | null; tozala?: boolean;
};

/** Override saqlaydi (razdelId 0 = obyekt sukutlari). */
export async function grafikSozlamaSaqla(p: SozlamaYuk): Promise<{ ok: true; versiya: number | null } | Xato> {
  try {
    const r = await fetch('/api/grafik', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amal: 'sozlama', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, razdel_id: p.razdelId, brigada: p.brigada ?? null, smena_soat: p.smenaSoat ?? null,
        boshlanish_sana: p.boshlanishSana ?? null, kun: p.kun ?? null, kutilgan_versiya: p.kutilganVersiya ?? null, tozala: p.tozala === true }),
    });
    const j = await r.json().catch(() => null) as { ok?: boolean; versiya?: number | null; code?: string; error?: string } | null;
    return r.ok && j?.ok ? { ok: true, versiya: j.versiya ?? null } : xato(j);
  } catch { return { ok: false, error: 'Tarmoq xatosi' }; }
}
