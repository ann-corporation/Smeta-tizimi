/**
 * Ф-2 hujjati uchun obyekt konteksti — imzolovchilar va shartnoma (shartnoma liniyasidan), nakrutka, podval.
 * F2 tayyorlash va F2 tarixi bir xil manbadan foydalanadi (bitta hujjat — bitta shakl).
 */
import { shartnomaLiniyaOl } from './t2-shartnoma-liniya';
import { t2ObyektNakrutka, type NakrutkaKoeffitsientlar } from './t2-nakrutka';
import { obyektPodvaliOqi, ustamaKontekstXatosi } from './t2-nakrutka-podval';
import { obyektImzoNomlari, shartnomaImzoNomlari } from '../lib/obyekt-imzochi';
import { obyektImzochilarOl } from './obyekt-imzochi';
import { kompaniyaSozlamaOl } from './kompaniya-sozlama';
import type { ImzoNomlar } from '../lib/hujjat-yozuvchi';
import type { Podval } from '../lib/nakrutka-konstruktor';
import type { SvodYaxlit } from '../lib/svod-yaxlit';

/** svodYaxlit — smeta darajasidagi hujjatlar (LRV) uchun; tasdiqlangan F2 hujjati undan foydalanmaydi. */
export type F2HujjatKonteksti = { imzo: ImzoNomlar; shartnoma: string | null; nakrutka: Partial<NakrutkaKoeffitsientlar> | null; podval: Podval | null; svodYaxlit?: SvodYaxlit | null; nkManba?: string | null;
  /** Ustama/podval o'qilmadi — sabab (smeta darajasidagi hujjatlar bloklanadi; null — hammasi o'qildi). */
  xato?: string | null };

/**
 * Imzo: obyektdagi tayinlangan imzochi > shartnoma tomoni > bo'sh; tuzuvchi/tekshiruvchi — kompaniya sukuti.
 * F2 tayyorlash, F2 tarixi va oylik paket bir xil imzochilarni chiqaradi (bitta resolver: lib/obyekt-imzochi).
 */
export async function f2HujjatKonteksti(kompaniyaId: number, obyektId: number): Promise<F2HujjatKonteksti> {
  const [liniya, nk, imz, soz] = await Promise.all([
    shartnomaLiniyaOl(kompaniyaId).catch(() => null), t2ObyektNakrutka(obyektId).catch(() => null),
    obyektImzochilarOl(kompaniyaId, obyektId).catch(() => null), kompaniyaSozlamaOl(kompaniyaId).catch(() => null),
  ]);
  let shartnoma: string | null = null;
  if (liniya?.ok) {
    const ob = liniya.natija.obyektlar.find((o) => o.id === obyektId);
    const asosiy = liniya.natija.shartnomalar.find((s) => s.id === ob?.asosiy_shartnoma_id);
    shartnoma = asosiy ? `№ ${asosiy.raqam}${asosiy.nom ? ` — ${asosiy.nom}` : ''}` : null;
  }
  const sukut = soz?.sozlamalar['hujjat.imzo_tomonlari']?.qiymat;
  const imzo = obyektImzoNomlari({
    imzochilar: imz?.ok ? imz.natija.imzochilar : null,
    shartnoma: liniya?.ok ? shartnomaImzoNomlari(liniya.natija, obyektId) : null,
    kompaniya: sukut && typeof sukut === 'object' ? sukut as ImzoNomlar : null,
  });
  // «Podval yo'q» va «o'qilmadi» farqlanadi: o'qish xatosi xato da (jim standartga tushilmaydi).
  const pod = nk?.ok ? await obyektPodvaliOqi(kompaniyaId, obyektId, nk.shartnoma_id ?? null, nk.nakrutka_podval_id ?? null) : null;
  const podval = pod?.ok ? pod.podval : null;
  return { imzo, shartnoma, nakrutka: nk?.ok ? nk.koeffitsientlar ?? null : null, podval, svodYaxlit: nk?.ok ? nk.svod_yaxlit ?? null : null, nkManba: nk?.ok ? nk.nk_manba ?? null : null,
    xato: ustamaKontekstXatosi(nk, pod) };
}

/** F2 hujjati "kimligi" — bir xil F2 (obyekt + oy + raqam) uchun token bir marta olinadi, qayta chiqarish bepul. */
export function f2HujjatKaliti(obyektId: number, oy: string, raqam: string | null | undefined): string | null {
  const r = (raqam ?? '').trim();
  return r ? `f2:${obyektId}:${oy.slice(0, 7)}:${r}`.slice(0, 200) : null;
}
