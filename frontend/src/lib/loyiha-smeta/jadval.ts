/**
 * jadval.ts — pdf.js matn elementlaridan (koordinatalari bilan) jadvalni qayta tiklash. Toza funksiyalar: brauzer ham, test ham ishlatadi.
 * Server PDF kutubxonasi YO'Q; matn qatlami ~99% sahifada bor (OCR kerak emas).
 */
export type MatnBo = { s: string; x: number; y: number; w: number; h: number; sahifa: number };
export type Katak = { matn: string; x0: number; x1: number; bo: MatnBo[] };
export type JQator = { y: number; sahifa: number; kataklar: Katak[] };

export type YigOpts = { yTol?: number; bosh?: number };

/** Elementlarni qatorlarga (y bo'yicha) va kataklarga (x oralig'i bo'yicha) ajratadi. y yuqoridan pastga o'sadi deb qabul qilinadi. */
export function qatorlarYig(items: MatnBo[], o: YigOpts = {}): JQator[] {
  const yTol = o.yTol ?? 3;
  const bosh = o.bosh ?? 8;
  const toza = items.filter((i) => i.s.trim() !== '');
  const sahifalar = [...new Set(toza.map((i) => i.sahifa))].sort((a, b) => a - b);
  const out: JQator[] = [];
  for (const sh of sahifalar) {
    const on = toza.filter((i) => i.sahifa === sh).sort((a, b) => a.y - b.y || a.x - b.x);
    const guruh: MatnBo[][] = [];
    for (const it of on) {
      const g = guruh[guruh.length - 1];
      if (g && Math.abs(g[0].y - it.y) <= yTol) g.push(it); else guruh.push([it]);
    }
    for (const g of guruh) {
      const t = [...g].sort((a, b) => a.x - b.x);
      const kataklar: Katak[] = [];
      for (const it of t) {
        const k = kataklar[kataklar.length - 1];
        if (k && it.x - k.x1 < bosh) {
          k.matn += (it.x - k.x1 > 0.5 ? ' ' : '') + it.s.trim(); k.x1 = Math.max(k.x1, it.x + it.w); k.bo.push(it);
        } else kataklar.push({ matn: it.s.trim(), x0: it.x, x1: it.x + it.w, bo: [it] });
      }
      out.push({ y: g[0].y, sahifa: sh, kataklar });
    }
  }
  return out;
}

export type Ustun = { kalit: string; x0: number; x1: number };

/** Sarlavha qatoridan ustun chegaralari: har ustun o'z sarlavha katagidan keyingi sarlavha boshigacha. */
export function ustunlarQur(sarlavha: JQator, kalitlar: (string | null)[]): Ustun[] {
  const u: Ustun[] = [];
  sarlavha.kataklar.forEach((k, i) => {
    const kalit = kalitlar[i];
    if (!kalit) return;
    const keyingi = sarlavha.kataklar[i + 1];
    u.push({ kalit, x0: i === 0 ? -Infinity : (sarlavha.kataklar[i - 1].x1 + k.x0) / 2, x1: keyingi ? (k.x1 + keyingi.x0) / 2 : Infinity });
  });
  return u;
}

/** Katakni markazi bo'yicha ustunga tayinlaydi. */
export function ustunTop(k: Katak, ustunlar: Ustun[]): string | null {
  const c = (k.x0 + k.x1) / 2;
  const u = ustunlar.find((x) => c >= x.x0 && c < x.x1);
  return u ? u.kalit : null;
}

/** Qatorni {ustunKaliti: matn} ga aylantiradi (bir ustunga tushgan kataklar bo'shliq bilan qo'shiladi). */
export function qatorHujayralari(q: JQator, ustunlar: Ustun[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (const k of q.kataklar) {
    const u = ustunTop(k, ustunlar);
    if (u) r[u] = r[u] ? r[u] + ' ' + k.matn : k.matn;
  }
  return r;
}

/** «1 234,5» / «12.5» / «0,25» -> son; son bo'lmasa null (0 emas). */
export function sonOqi(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = s.replace(/ /g, ' ').trim().replace(/\s+/g, '');
  if (!/^[-+]?[0-9]+([.,][0-9]+)?$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Qatorning sahifadagi chegara qutisi (manba ko'rsatish uchun). */
export function qatorQutisi(q: JQator): { x0: number; y0: number; x1: number; y1: number } {
  const bo = q.kataklar.flatMap((k) => k.bo);
  return {
    x0: Math.min(...bo.map((b) => b.x)), x1: Math.max(...bo.map((b) => b.x + b.w)),
    y0: Math.min(...bo.map((b) => b.y)), y1: Math.max(...bo.map((b) => b.y + b.h)),
  };
}
