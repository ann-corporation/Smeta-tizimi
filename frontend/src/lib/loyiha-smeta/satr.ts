/**
 * satr.ts — sarlavhasiz (qator shaklidagi) qoidalar, MA'LUMOT sifatida: «Бетон кл. В20 | 43,25 | м³» va armatura massasi
 * (bar pozitsiyasi / «п.м» to'r qatoridan keyingi 3-son = jami massa). Real chizmalarda bu jadvallar sarlavhasiz yoki sarlavha ustunlarga mos emas.
 */
import { qatorQutisi, sonOqi, type JQator, type MatnBo } from './jadval';
import type { Element } from './profil';

export type SatrQoidalari = {
  /** Beton qatori: nom (1-guruh = sinf), keyin son va birlik. */
  betonNom: string; birlikM3: string;
  /** Armatura: bar pozitsiyasi yoki to'r («п.м») langari; langardan keyingi N-son = jami massa. */
  armaturaLangar: string[]; massaIndeksi: number; oyna: number;
  /** Armatura faqat jadval sarlavhasi (qoida) ostidagi hududda sanaladi: chizmadagi «Ø10 АIII» izohlari kirmasin. */
  jadvalSarlavha: string; hududEni: number; hududBoyi: number;
  /** Jami massa ustuni: shu sarlavha (qoida) ostidagi o'nlik sonlar. Topilmasa — langar usuli. */
  massaUstuni: string;
};

export const SATR_STANDART: SatrQoidalari = {
  betonNom: 'бетон\\s*(?:кл\\s*\\.?\\s*)?([BВ]\\s?\\d+(?:[.,]\\d+)?)',
  birlikM3: '^(м[³3]|м\\s?3|m3)\\.?$',
  armaturaLangar: ['^[∅Ø⌀ǿФ]\\s?\\d{1,2}\\s?[AА]', '^=?\\s*п\\.?\\s?м\\.?$'],
  massaIndeksi: 2, oyna: 450,
  jadvalSarlavha: 'спецификаци|ведомость расхода|расход стали', hududEni: 1300, hududBoyi: 4000, massaUstuni: '^приме',
};

const sinfKanon = (s: string) => s.replace(/\s/g, '').replace(',', '.').toUpperCase().replace('B', 'В');

/** Sahifa qatorlaridan beton (sinf, hajm) va armatura massasi (varaq bo'yicha jami) elementlarini oladi. */
export function satrdanOqi(qatorlar: JQator[], q: SatrQoidalari = SATR_STANDART, items: MatnBo[] = qatorlar.flatMap((r) => r.kataklar.flatMap((c) => c.bo))): Element[] {
  const out: Element[] = [];
  const betonRe = new RegExp(q.betonNom, 'i'); const m3Re = new RegExp(q.birlikM3, 'i');
  const langar = q.armaturaLangar.map((s) => new RegExp(s, 'i'));
  const sinfSoni = new Map<string, number>();
  let massa = 0; let massaSoni = 0; let tor = false;
  const armQatorlar: JQator[] = [];
  const sarRe = new RegExp(q.jadvalSarlavha, 'i');
  const hududlar = qatorlar.flatMap((r) => r.kataklar.filter((c) => sarRe.test(c.matn)).map((c) => ({ x: c.x0, y: r.y })));
  const hududda = (r: JQator, x: number) => hududlar.some((h) => x >= h.x - 60 && x <= h.x + q.hududEni && r.y >= h.y && r.y <= h.y + q.hududBoyi);
  // 1) Ustun usuli: jadval sarlavhasi ostidagi «Приме-» ustuni = jami massa (har bar/to'r qatori uchun); langar usulidan aniqroq va qatorga bo'linmaydi.
  const massaRe = new RegExp(q.massaUstuni, 'i'); const ustunlar: { x: number; y0: number; y1: number }[] = [];
  for (const h of hududlar) {
    const sar = qatorlar.flatMap((r) => r.kataklar.filter((c) => massaRe.test(c.matn) && c.x0 >= h.x - 60 && c.x0 <= h.x + q.hududEni && r.y >= h.y && r.y <= h.y + 250).map((c) => ({ x: c.x0, y: r.y })))
      .sort((a, b) => a.y - b.y)[0];
    if (sar && !ustunlar.some((u) => Math.abs(u.x - sar.x) < 40 && u.y0 === sar.y)) ustunlar.push({ x: sar.x, y0: sar.y, y1: h.y + q.hududBoyi });
  }
  const sanalgan = new Set<string>(); let ustunMassa = 0; let ustunSoni = 0; let ustunTor = false; const ustunQatorlar: JQator[] = [];
  for (const r of qatorlar) {
    for (const c of r.kataklar) {
      const u = ustunlar.find((z) => Math.abs(c.x0 - z.x) <= 40 && r.y > z.y0 + 8 && r.y <= z.y1);
      if (!u || !/^\d+[.]\d+$/.test(c.matn.trim().replace(',', '.'))) continue;
      const kalit = `${r.sahifa}:${Math.round(r.y)}:${Math.round(c.x0)}`; if (sanalgan.has(kalit)) continue;
      sanalgan.add(kalit); ustunMassa += sonOqi(c.matn) ?? 0; ustunSoni++; ustunQatorlar.push(r);
      if (r.kataklar.some((z) => /^=?\s*п\.?\s?м/i.test(z.matn))) ustunTor = true;
    }
  }  for (const r of qatorlar) {
    const k = r.kataklar;
    for (let i = 0; i < k.length; i++) {
      const bm = betonRe.exec(k[i].matn);
      if (bm) {
        // Son va birlik: nom katagi bilan bir asosiy chiziqda (±6) o'ngdagi eng yaqin element (qator guruhlash xatosiga bog'liq emas)
        const nb = k[i].bo[0]; const asos = nb.y + nb.h;
        const o = items.filter((t) => t.sahifa === nb.sahifa && Math.abs(t.y + t.h - asos) <= 6 && t.x >= k[i].x1 - 1 && t.x - k[i].x1 < q.oyna * 1.5).sort((a, b) => a.x - b.x);
        let miq: number | null = null; let bir = false;
        for (const t of o) {
          if (betonRe.test(t.s)) break;
          const n = sonOqi(t.s);
          if (miq == null && n != null) { miq = n; continue; }
          if (miq != null && m3Re.test(t.s.trim())) { bir = true; break; }
        }        if (miq != null && bir) {
          const sinf = sinfKanon(bm[1]); const n = (sinfSoni.get(sinf) ?? 0) + 1; sinfSoni.set(sinf, n);
          out.push({ profil: 'satr_beton', tur: 'beton', nom: `Бетон кл. ${sinf}`, belgi: `${sinf}#${n}`, birlik: 'м3', miqdor: miq, sahifa: r.sahifa, qutisi: qatorQutisi(r),
            manbaRef: `satr_beton:${r.sahifa}:${Math.round(r.y)}:${Math.round(k[i].x0)}`, ishonch: 0.9, odamKerak: false, ogohlantirish: [] });
        }
        continue;
      }
      const lg = langar.findIndex((re) => re.test(k[i].matn));
      if (lg < 0 || ustunlar.length > 0 || !hududda(r, k[i].x0)) continue;
      const nums: number[] = [];
      for (let j = i + 1; j < k.length && k[j].x0 - k[i].x1 < q.oyna; j++) {
        if (langar.some((re) => re.test(k[j].matn))) break;
        const n = sonOqi(k[j].matn); if (n != null) nums.push(n);
      }
      if (nums.length > q.massaIndeksi) { massa += nums[q.massaIndeksi]; massaSoni++; armQatorlar.push(r); if (lg === 1) tor = true; }
    }
  }
  if (ustunSoni > 0) { massa = ustunMassa; massaSoni = ustunSoni; tor = ustunTor; armQatorlar.push(...ustunQatorlar); }
  if (massaSoni > 0) {
    const bo = armQatorlar.map(qatorQutisi);
    out.push({ profil: 'satr_armatura', tur: 'armatura', nom: 'Арматура (масса по спецификации)', belgi: 'Σ', birlik: 'кг', miqdor: Math.round(massa * 1000) / 1000, sahifa: armQatorlar[0].sahifa,
      qutisi: { x0: Math.min(...bo.map((b) => b.x0)), y0: Math.min(...bo.map((b) => b.y0)), x1: Math.max(...bo.map((b) => b.x1)), y1: Math.max(...bo.map((b) => b.y1)) },
      manbaRef: `satr_armatura:${armQatorlar[0].sahifa}:${massaSoni}`, ishonch: 0.8, odamKerak: false, ogohlantirish: tor ? ['tor'] : [] });
  }
  return out;
}
