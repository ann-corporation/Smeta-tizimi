/**
 * Shartnoma oylik paketi: bitta obyektning qo'shimcha hujjatlari (Nakopitelniy, M-29, Ostatka, Slichitelniy).
 * Har bir hujjat sahifadagi bilan BIR XIL yuklagich va quruvchidan chiqadi (lib/oylik-hujjat/*), token esa `tokenla`
 * orqali (sahifada ham `hujjatTokenBilan`) olinadi. Xato bitta hujjatni tushirib qoldiradi, paketni to'xtatmaydi.
 */
import type { Katak, KirishFayl, YaratilganTuri } from '../f2-oylik-paket/shartnoma';
import type { ImzoNomlar } from '../hujjat-yozuvchi';
import { m29PaketFayli } from './m29';
import { nakopitelniyPaketFayli } from './nakopitelniy';
import { ostatkaPaketFayli } from './ostatka-slichitelniy';

export type TokenlaFn = (p: { bytes: Uint8Array; hujjat: string; sabab: string; obyektId: number }) => Promise<{ ok: true } | { ok: false; xabar: string }>;
export type ObyektHujjatlariNatija = { fayllar: KirishFayl[]; kataklar: Partial<Record<YaratilganTuri, Katak>>; otkazilgan: string[] };

export async function obyektHujjatlariniYigish(p: {
  kompaniyaId: number; obyekt: { id: number; nom: string }; oy: string; imzo?: ImzoNomlar; ndsFoiz: number | null; pudratchi?: string | null; tokenla: TokenlaFn;
}): Promise<ObyektHujjatlariNatija> {
  const fayllar: KirishFayl[] = []; const kataklar: ObyektHujjatlariNatija['kataklar'] = {}; const otkazilgan: string[] = [];
  const bosqichlar: Array<{ tur: YaratilganTuri; hujjat: string; nomi: string; sabab: string; yasa: () => Promise<{ ok: true; nom: string; bytes: Uint8Array } | { ok: false; bosh?: boolean; xato: string }> }> = [
    { tur: 'nakopitelniy', hujjat: 'NAKOPITELNIY', nomi: 'Nakopitelniy', sabab: `Накопительная ведомость · ${p.obyekt.nom} · ${p.oy}`,
      yasa: () => nakopitelniyPaketFayli({ kompaniyaId: p.kompaniyaId, obyektId: p.obyekt.id, obyektNom: p.obyekt.nom, oy: p.oy, imzo: p.imzo, ndsFoiz: p.ndsFoiz }) },
    { tur: 'm29', hujjat: 'M-29', nomi: 'M-29', sabab: `М-29 · ${p.obyekt.nom} · ${p.oy}`,
      yasa: () => m29PaketFayli({ kompaniyaId: p.kompaniyaId, obyektId: p.obyekt.id, obyektNom: p.obyekt.nom, oy: p.oy, imzo: p.imzo, pudratchi: p.pudratchi }) },
    { tur: 'ostatka', hujjat: 'OSTATKA', nomi: 'Ostatka', sabab: `Ведомость остатка · ${p.obyekt.nom}`,
      yasa: () => ostatkaPaketFayli({ kompaniyaId: p.kompaniyaId, obyektId: p.obyekt.id, obyektNom: p.obyekt.nom, imzo: p.imzo, tur: 'ostatka' }) },
    { tur: 'slichitelniy', hujjat: 'SLICHITELNIY', nomi: 'Slichitelniy', sabab: `Сличительная ведомость · ${p.obyekt.nom}`,
      yasa: () => ostatkaPaketFayli({ kompaniyaId: p.kompaniyaId, obyektId: p.obyekt.id, obyektNom: p.obyekt.nom, imzo: p.imzo, tur: 'slichitelniy' }) },
  ];
  for (const b of bosqichlar) {
    const belgi = `${p.obyekt.nom} · ${b.nomi}`;
    try {
      const r = await b.yasa();
      if (!r.ok) {
        // «Hujjat yo'q» (ma'lumot yo'q) - xato emas: katak tushuntirish bilan, ZIP ning «kirmadi» ro'yxatiga yozilmaydi.
        kataklar[b.tur] = r.bosh ? { holat: b.tur === 'nakopitelniy' ? 'ogoh' : 'na', izoh: r.xato } : { holat: 'yoq', izoh: r.xato };
        if (!r.bosh) otkazilgan.push(`${belgi}: ${r.xato}`);
        continue;
      }
      const q = await p.tokenla({ bytes: r.bytes, hujjat: b.hujjat, sabab: b.sabab, obyektId: p.obyekt.id });
      if (!q.ok) { kataklar[b.tur] = { holat: 'yoq', izoh: q.xabar }; otkazilgan.push(`${belgi}: ${q.xabar}`); continue; }
      fayllar.push({ nom: r.nom, bytes: r.bytes, tur: b.tur, obyektId: p.obyekt.id });
      kataklar[b.tur] = { holat: 'ok' };
    } catch (e) {
      const sabab = e instanceof Error && e.message ? e.message : 'yaratib bo‘lmadi';
      kataklar[b.tur] = { holat: 'yoq', izoh: sabab }; otkazilgan.push(`${belgi}: ${sabab}`);
    }
  }
  return { fayllar, kataklar, otkazilgan };
}