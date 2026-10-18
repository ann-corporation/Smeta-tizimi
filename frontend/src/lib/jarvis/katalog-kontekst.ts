/**
 * Jarvis uchun platforma narx indeksi (egasi 2026-10-15: "Jarvis faqat Supabase emas, R2 ma'lumotnomalaridan ham — narx indeksi
 * barcha nashrlari — qidirib javob bersin"). Indeks R2 da (≈130 ming qator) va serverda nom bo'yicha qidirib bo'lmaydi, shuning
 * uchun narx haqidagi savolda brauzer uni bir marta yuklaydi (Studio bilan bir xil kesh) va eng mos qatorlarni javobga
 * kontekst sifatida yuboradi. Bu ochiq ma'lumotnoma — kompaniya ma'lumoti emas. Narx savoli bo'lmasa hech narsa yuklanmaydi.
 */
import { qidiruvSozlari } from './qidiruv-sozlari';

export type KatalogKontekst = { nom: string; birlik: string | null; narx: number; manba: string; hudud: string | null };

// Only explicit price words: "qancha"/"сколько" alone asks for a quantity ("Omborda sement qancha?"), not a price.
const NARX_SAVOLI = /narx|necha\s*pul|qanchadan|turadi|stoim|цен[аыуе]|стоим|стои[тл]|стоят|почём|почем|katalog|каталог|birja|бирж/i;
export const narxSavolimi = (savol: string) => NARX_SAVOLI.test(savol) && qidiruvSozlari(savol).resurs.length > 0;
/** The index download must never hold the answer up: after `ms` Jarvis answers without it. */
export const vaqtBilan = <T,>(p: Promise<T>, ms: number, zaxira: T) => Promise.race([p, new Promise<T>(r => setTimeout(() => r(zaxira), ms))]);

/** Up to 6 gated catalogue / exchange / price-list rows for the resource named in the question; [] when nothing fits. */
export async function katalogKonteksti(savol: string): Promise<KatalogKontekst[]> {
  if (!narxSavolimi(savol)) return [];
  const { resurs } = qidiruvSozlari(savol);
  const [{ narxKatalogi }, { matchResource }] = await Promise.all([import('../narx-katalog/price-remote'), import('../smeta-studio/resource-match')]);
  const cat = await narxKatalogi();
  const m = matchResource(cat.matchView(), resurs.join(' '), null, null, 12);
  const seen = new Set<string>();
  return m.candidates.flatMap(c => {
    const r = c.row;
    if (r.narx == null || r.nds_holati === 'nds_bilan') return [];
    const davr = r.manba_sana ?? (r.yil ? `${r.yil}${r.kvartal ? ` ${r.kvartal}-chorak` : ''}` : null);
    const manba = [r.manba_nom, davr, r.ishlab_chiqaruvchi].filter(Boolean).join(', ').slice(0, 160);
    const k = `${r.nom}|${r.birlik}|${r.narx}|${manba}`;
    if (seen.has(k)) return [];
    seen.add(k);
    return [{ nom: r.nom.slice(0, 200), birlik: r.birlik, narx: r.narx, manba, hudud: r.hudud }];
  }).slice(0, 6);
}
