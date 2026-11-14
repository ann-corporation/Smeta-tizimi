/**
 * uskuna-guruh.ts — ЭО/ВК/ОВ uskunalar ro'yxati smetaning YIG'MA qatoriga (komplekt/ustanovka) 1:1 mos kelmaydi. Shuning uchun element-element emas:
 * loyiha uskunalari smeta yig'ma qatori bo'yicha GURUHLANADI va yonma-yon ko'rsatiladi («loyiha ro'yxati ↔ smeta yig'ma qatori»); odam tasdiqlaydi.
 * Tasdiqlangach guruh jami (birlik koeffitsiyenti bilan) smeta qatori hajmi bilan solishtiriladi (farq.ts). Hech narsa avtomatik qabul qilinmaydi.
 */
import { birlikTahlil, normMiqdor } from './birlik';
import type { SmetaQator } from './moslash';

export type UskunaElement = { id: number; nom: string; birlik: string; miqdor: number | null; belgi?: string | null };
export type UskunaGuruh = {
  qatorId: number; qatorNom: string; qatorBirlik: string | null; qatorHajm: number | null;
  elementlar: UskunaElement[]; loyihaJami: number | null; farq: number | null; sabab: string[];
};

/** So'z o'zagi (rus morfologiyasi: «радиатор» ≈ «радиаторов»): dastlabki 5 harf. */
const o = (w: string) => w.slice(0, 5);
const sozlar = (s: string) => new Set(s.toLowerCase().replace(/[^a-zа-я0-9]+/g, ' ').split(' ').filter((w) => w.length > 3).map(o));
const UMUMIY = new Set(['установка', 'монтаж', 'устройство', 'комплект', 'системы', 'оборудования', 'прокладка', 'тип', 'стальной'].map(o));

/** Har uskuna uchun eng mos yig'ma qator (kamida 1 umumiy ma'noli so'z + mos baza birlik); qator bo'yicha guruhlanadi. */
export function uskunaGuruhlari(elementlar: readonly UskunaElement[], smeta: readonly SmetaQator[], qatorlarMaydoni?: (q: SmetaQator) => boolean): UskunaGuruh[] {
  const nomzod = smeta.filter((q) => q.tur === 'bl' && (qatorlarMaydoni ? qatorlarMaydoni(q) : true));
  const guruh = new Map<number, UskunaGuruh>();
  for (const e of elementlar) {
    const es = [...sozlar(e.nom)].filter((w) => !UMUMIY.has(w));
    if (es.length === 0) continue;
    const eb = birlikTahlil(e.birlik).baza;
    let eng: { q: SmetaQator; ball: number; umum: string[] } | null = null;
    for (const q of nomzod) {
      const qs = sozlar(q.nom); const umum = es.filter((w) => qs.has(w));
      if (umum.length === 0) continue;
      const qb = birlikTahlil(q.birlik).baza;
      const ball = umum.length / es.length + (eb && qb && eb === qb ? 0.25 : 0);
      if (!eng || ball > eng.ball) eng = { q, ball, umum };
    }
    if (!eng) continue;
    const g = guruh.get(eng.q.id) ?? { qatorId: eng.q.id, qatorNom: eng.q.nom, qatorBirlik: eng.q.birlik, qatorHajm: eng.q.hajm, elementlar: [], loyihaJami: null, farq: null, sabab: [] };
    g.elementlar.push(e); for (const w of eng.umum) if (!g.sabab.includes(w)) g.sabab.push(w);
    guruh.set(eng.q.id, g);
  }
  for (const g of guruh.values()) {
    const baza = birlikTahlil(g.qatorBirlik).baza;
    const q = g.elementlar.map((e) => (birlikTahlil(e.birlik).baza === baza ? normMiqdor(e.miqdor, e.birlik) : null));
    g.loyihaJami = baza && q.every((x) => x != null) ? (q as number[]).reduce((a, b) => a + b, 0) : null;   // birligi mos emas yoki noma'lum bo'lsa — jami yo'q (0 emas)
    const qh = normMiqdor(g.qatorHajm, g.qatorBirlik);
    g.farq = g.loyihaJami != null && qh != null ? g.loyihaJami - qh : null;
  }
  return [...guruh.values()].sort((a, b) => b.elementlar.length - a.elementlar.length);
}
