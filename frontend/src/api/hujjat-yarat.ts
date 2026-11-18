/**
 * Yagona hujjat dvigateli mijozi (egasi 2026-11-16): sayt ham, Android/Windows/Telegram ham hujjatni SERVERDAN so'raydi
 * (`POST /api/hujjat-yarat`) — brauzerda hujjat quruvchisi chaqirilmaydi. Server shu quruvchilar (src/lib/*) bilan yasaydi,
 * tokenni o'zi yechadi (F-2: obyekt+oy+raqam kaliti; qayta yuklash bepul) va tayyor fayl baytlarini qaytaradi.
 */
import { vaqtliOqish } from './vaqtli-fetch';

export type HujjatTur = 'f2' | 'forma3' | 'nakopitelniy' | 'm29' | 'slichitelniy' | 'ostatka';
export type HujjatFormat = 'xlsx' | 'pdf';

export type HujjatYaratNatija =
  | { ok: true; bytes: Uint8Array; faylNomi: string; mime: string; sarflandi: number; bepulTakror: boolean }
  | { ok: false; status: number; code: string | null; xabar: string };

export type HujjatRoyxatQator = {
  kalit: string; tur: HujjatTur | string; sarlavha: string; holat: string; summa: number | null;
  parametrlar: Record<string, number>; formatlar: HujjatFormat[];
};

const YAKUN = 120_000; // og'ir F-2 (minglab qator) uchun

function faylNomi(h: string | null, zaxira: string): string {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(h ?? '');
  if (m) { try { return decodeURIComponent(m[1]); } catch { /* zaxira */ } }
  return zaxira;
}

export async function hujjatYarat(p: { kompaniyaId: number; obyektId: number; tur: HujjatTur; format?: HujjatFormat; parametrlar?: Record<string, number | string> }): Promise<HujjatYaratNatija> {
  const format = p.format ?? 'xlsx';
  let r: Response;
  try {
    r = await vaqtliOqish('/api/hujjat-yarat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amal: 'yarat', tur: p.tur, format, kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, ...(p.parametrlar ?? {}) }),
    }, YAKUN);
  } catch (e) { return { ok: false, status: 0, code: 'TARMOQ', xabar: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
  const tur = r.headers.get('Content-Type') ?? '';
  if (!r.ok || tur.startsWith('application/json')) {
    const j = await r.json().catch(() => null) as { code?: string; xato?: string; error?: string } | null;
    if (r.status === 401) return { ok: false, status: 401, code: 'SESSION_EXPIRED', xabar: 'Sessiya tugadi — qayta kiring.' };
    return { ok: false, status: r.ok ? 502 : r.status, code: j?.code ?? null, xabar: j?.xato || j?.error || 'Hujjat yaratilmadi.' };
  }
  const bytes = new Uint8Array(await r.arrayBuffer());
  return {
    ok: true, bytes, faylNomi: faylNomi(r.headers.get('Content-Disposition'), `hujjat.${format}`), mime: tur,
    sarflandi: Number(r.headers.get('X-Hujjat-Sarf')) || 0, bepulTakror: r.headers.get('X-Hujjat-Bepul-Takror') === '1',
  };
}

/** Serverdan: shu obyekt uchun qaysi hujjatlar yaratilishi mumkin (mobil ilova ham shu ro'yxatdan foydalanadi). */
export async function hujjatRoyxatOl(kompaniyaId: number, obyektId: number): Promise<{ ok: true; hujjatlar: HujjatRoyxatQator[] } | { ok: false; xabar: string }> {
  try {
    const r = await vaqtliOqish('/api/hujjat-yarat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal: 'royxat', kompaniya_id: kompaniyaId, obyekt_id: obyektId }) });
    const j = await r.json() as { ok?: boolean; hujjatlar?: HujjatRoyxatQator[]; xato?: string };
    return r.ok && j.ok && j.hujjatlar ? { ok: true, hujjatlar: j.hujjatlar } : { ok: false, xabar: j.xato || 'Ro‘yxat o‘qilmadi' };
  } catch (e) { return { ok: false, xabar: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}
