/**
 * Hujjatlar paketi - sayt mijozi (egasi 2026-11-19): nomzodlar serverdan (`/api/hujjat-maydoni?amal=paket_nomzod`: Disk + akt reestri),
 * mavjud versiya Diskdan (BEPUL, `/api/hujjat-maydoni-ol`), yo'qlari - yagona dvigatel `/api/hujjat-yarat` (token yechiladi, Diskka yoziladi).
 * Yangi hujjat mantig'i yo'q; hammasi mavjud endpointlar ustida.
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { hujjatYarat, type HujjatTur } from './hujjat-yarat';
import { filtrServerga, type Nomzod, type PaketFiltr } from '../lib/hujjat-paket/nomzod';
import type { Olingan, Yetkazuvchi } from '../lib/hujjat-paket/yigish';

export type NomzodNatija = { ok: true; nomzodlar: Nomzod[]; jami: number; kesilgan: boolean } | { ok: false; xabar: string };

export async function paketNomzodOl(kompaniyaId: number, filtr: PaketFiltr): Promise<NomzodNatija> {
  try {
    const q = new URLSearchParams({ amal: 'paket_nomzod', kompaniya_id: String(kompaniyaId), filtr: JSON.stringify(filtrServerga(filtr)) });
    const r = await vaqtliOqish(`/api/hujjat-maydoni?${q.toString()}`);
    const j = await r.json().catch(() => null) as { ok?: boolean; nomzodlar?: Nomzod[]; jami?: number; kesilgan?: boolean; code?: string; xato?: string } | null;
    if (r.ok && j?.ok && Array.isArray(j.nomzodlar)) return { ok: true, nomzodlar: j.nomzodlar, jami: j.jami ?? j.nomzodlar.length, kesilgan: j.kesilgan === true };
    return { ok: false, xabar: j?.xato || j?.code || 'Hujjatlar ro\'yxati o\'qilmadi' };
  } catch (e) { return { ok: false, xabar: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

const fayloNomi = (h: string | null, zaxira: string): string => {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(h ?? '');
  if (m) { try { return decodeURIComponent(m[1]); } catch { /* zaxira */ } }
  return zaxira;
};

/** Diskdagi joriy versiya (BEPUL). */
export async function diskdanOl(n: Pick<Nomzod, 'fayl_id' | 'sarlavha'>): Promise<Olingan> {
  if (n.fayl_id == null) throw new Error('Diskda fayl yo\'q');
  const r = await vaqtliOqish(`/api/hujjat-maydoni-ol?id=${n.fayl_id}`, {}, 120_000);
  if (!r.ok) throw new Error(`Diskdan o'qilmadi (HTTP ${r.status})`);
  return { bytes: new Uint8Array(await r.arrayBuffer()), faylNomi: fayloNomi(r.headers.get('Content-Disposition'), `${n.sarlavha}.xlsx`) };
}

/** `/api/hujjat-yarat` parametrlari (nomzod -> tur + parametrlar). null - bu turni yasab bo'lmaydi. */
export function yasashSorovi(n: Nomzod): { tur: HujjatTur; parametrlar: Record<string, number> } | null {
  switch (n.tur) {
    case 'f2': return n.akt_id != null ? { tur: 'f2', parametrlar: { akt_id: n.akt_id } } : null;
    case 'forma3': return n.forma3_id != null && n.shartnoma_id != null ? { tur: 'forma3', parametrlar: { shartnoma_id: n.shartnoma_id, f3_id: n.forma3_id } } : null;
    case 'nakopitelniy': case 'm29': return n.oy ? { tur: n.tur, parametrlar: { oy_son: Number(n.oy.replace('-', '')) } } : null;
    case 'slichitelniy': case 'ostatka': return { tur: n.tur, parametrlar: {} };
    default: return null;
  }
}

export function saytYetkazuvchi(kompaniyaId: number): Yetkazuvchi {
  return {
    diskdan: diskdanOl,
    async yasa(n) {
      const s = yasashSorovi(n);
      if (!s) throw new Error('Bu hujjat turini yasab bo\'lmaydi');
      if (n.obyekt_id == null) throw new Error('Obyekt aniqlanmadi (Diskda ham yo\'q)');
      const r = await hujjatYarat({ kompaniyaId, obyektId: n.obyekt_id, tur: s.tur, format: 'xlsx', parametrlar: s.parametrlar });
      if (!r.ok) throw new Error(r.xabar);
      return { bytes: r.bytes, faylNomi: r.faylNomi };
    },
  };
}
