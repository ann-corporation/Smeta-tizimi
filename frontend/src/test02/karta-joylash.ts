/**
 * Karta: tugunlarni ustunlarga AVTO-joylash (sof). Faqat saqlangan joyi YO‘Q tugunlar joylanadi; mavjudlarga tegilmaydi.
 * Yangi tugun ustun ostidagi band joydan keyin boshlanadi (mavjud tugun bilan ustma-ust tushmaydi).
 */
import type { MindmapTugun, TugunTur } from '../api/t2-mindmap';

export type XY = { x: number; y: number };
export const NODE_W = 200;
export const TUGUN_BALANDLIGI = (tur?: string) => (tur === 'obyekt' ? 140 : 54);
export const USTUN_ORALIGI = 300;
export const USTUN_TARTIB: TugunTur[][] = [
  ['kontragent'], ['kompaniya', 'loyiha'], ['shartnoma'], ['obyekt'], ['zayavka'], ['sklad', 'texnika', 'kadr'], ['tomon'], ['foydalanuvchi'],
];

export function kartaAvtoJoylash(tugunlar: MindmapTugun[], mavjud: Record<string, XY>): Record<string, XY> {
  const natija: Record<string, XY> = { ...mavjud };
  USTUN_TARTIB.forEach((turlar, ui) => {
    const x = 60 + ui * USTUN_ORALIGI;
    const ustunda = tugunlar.filter((t) => turlar.includes(t.tur));
    // Shu ustundagi allaqachon joylangan tugunlardan keyin boshlanadi.
    let y = ustunda.reduce((m, t) => { const p = mavjud[t.id]; return p && Math.abs(p.x - x) < NODE_W ? Math.max(m, p.y + TUGUN_BALANDLIGI(t.tur) + 24) : m; }, 80);
    ustunda.forEach((t) => { if (natija[t.id]) return; natija[t.id] = { x, y }; y += TUGUN_BALANDLIGI(t.tur) + 24; });
  });
  return natija;
}