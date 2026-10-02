/**
 * Ф-2 hujjati uchun obyekt konteksti — imzolovchilar va shartnoma (shartnoma liniyasidan), nakrutka, podval.
 * F2 tayyorlash va F2 tarixi bir xil manbadan foydalanadi (bitta hujjat — bitta shakl).
 */
import { shartnomaLiniyaOl } from './t2-shartnoma-liniya';
import { t2ObyektNakrutka, type NakrutkaKoeffitsientlar } from './t2-nakrutka';
import { obyektPodvali } from './t2-nakrutka-podval';
import { imzoNomlariTomonlardan } from '../lib/shartnoma-liniya';
import type { ImzoNomlar } from '../lib/hujjat-yozuvchi';
import type { Podval } from '../lib/nakrutka-konstruktor';

export type F2HujjatKonteksti = { imzo: ImzoNomlar; shartnoma: string | null; nakrutka: Partial<NakrutkaKoeffitsientlar> | null; podval: Podval | null };

export async function f2HujjatKonteksti(kompaniyaId: number, obyektId: number): Promise<F2HujjatKonteksti> {
  const [liniya, nk] = await Promise.all([shartnomaLiniyaOl(kompaniyaId).catch(() => null), t2ObyektNakrutka(obyektId).catch(() => null)]);
  let imzo: ImzoNomlar = {};
  let shartnoma: string | null = null;
  if (liniya?.ok) {
    const ob = liniya.natija.obyektlar.find((o) => o.id === obyektId);
    const asosiy = liniya.natija.shartnomalar.find((s) => s.id === ob?.asosiy_shartnoma_id);
    const qoshimcha = liniya.natija.shartnomalar.filter((s) => !s.asosiy && s.obyektlar.includes(obyektId));
    imzo = imzoNomlariTomonlardan([...(asosiy?.tomonlar ?? []), ...qoshimcha.flatMap((s) => s.tomonlar)]);
    shartnoma = asosiy ? `№ ${asosiy.raqam}${asosiy.nom ? ` — ${asosiy.nom}` : ''}` : null;
  }
  const podval = await obyektPodvali(kompaniyaId, obyektId, nk?.ok ? nk.shartnoma_id : null);
  return { imzo, shartnoma, nakrutka: nk?.ok ? nk.koeffitsientlar ?? null : null, podval };
}

/** F2 hujjati "kimligi" — bir xil F2 (obyekt + oy + raqam) uchun token bir marta olinadi, qayta chiqarish bepul. */
export function f2HujjatKaliti(obyektId: number, oy: string, raqam: string | null | undefined): string | null {
  const r = (raqam ?? '').trim();
  return r ? `f2:${obyektId}:${oy.slice(0, 7)}:${r}`.slice(0, 200) : null;
}
