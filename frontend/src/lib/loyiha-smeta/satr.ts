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
  /** Armatura emas po'lat qatorlari (plastina, profil, burchak): shu belgi bor va armatura belgisi yo'q qator massasi ustundan chiqariladi. */
  armaturaYoq: string; armaturaBor: string;
};

export const SATR_STANDART: SatrQoidalari = {
  betonNom: 'бетон\\s*(?:кл\\s*\\.?\\s*)?([BВ]\\s?\\d+(?:[.,]\\d+)?)',
  birlikM3: '^(м[³3]|м\\s?3|m3)\\.?$',
  armaturaLangar: ['^[∅Ø⌀ǿФ]\\s?\\d{1,2}\\s?[AА]', '^=?\\s*п\\.?\\s?м\\.?$'],
  massaIndeksi: 2, oyna: 450,
  jadvalSarlavha: 'спецификаци|ведомость расхода|расход стали', hududEni: 1300, hududBoyi: 4000, massaUstuni: '^приме',
  armaturaYoq: 'ГОСТ\\s*(19903|8240|8509|8510|8239|535|380)|^-\\s?\\d+\\s?[xх×]\\s?\\d+|швеллер|уголок|пластин|двутавр|\\bлист\\b',
  armaturaBor: '[∅Ø⌀ǿФ]\\s?\\d{1,2}\\s?[AА]|ГОСТ\\s*(5781|34028|10884)|^=?\\s*п\\.?\\s?м',
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
  // Sarlavha: «Приме-» katagi yonida (±200 x, ±60 y) «Масса»/«Кол.» sarlavhasi bor — jadval sarlavhasi (nomi sarlavhadan chapda yoki yo'q bo'lishi mumkin).
  const yonRe = /^(масса|кол)/i;
  for (const r of qatorlar) for (const c of r.kataklar) {
    if (!massaRe.test(c.matn)) continue;
    const yonida = qatorlar.some((z) => Math.abs(z.y - r.y) <= 60 && z.kataklar.some((k) => yonRe.test(k.matn) && Math.abs(k.x0 - c.x0) <= 200));
    if (yonida && !ustunlar.some((u) => Math.abs(u.x - c.x0) < 40 && Math.abs(u.y0 - r.y) < 120)) ustunlar.push({ x: c.x0, y0: r.y, y1: r.y + q.hududBoyi });
  }  const yoqRe = new RegExp(q.armaturaYoq, 'i'); const borRe = new RegExp(q.armaturaBor, 'i');
  const sanalgan = new Set<string>(); let ustunMassa = 0; let ustunSoni = 0; let ustunTor = false; const ustunQatorlar: JQator[] = [];
  for (const r of qatorlar) {
    for (const c of r.kataklar) {
      const u = ustunlar.find((z) => Math.abs(c.x0 - z.x) <= 40 && r.y > z.y0 + 8 && r.y <= z.y1);
      const qiymat = c.matn.trim().replace(',', '.');
      if (!u || !/^\d+(?:[.]\d+)?$/.test(qiymat)) continue;
      // Butun son (o'nlik yo'q) faqat armatura belgisi bor qatorda: «1», «шт» kabi hisoblagichlar massa emas.
      if (!qiymat.includes('.') && !r.kataklar.some((z) => z.x0 < c.x0 && c.x0 - z.x0 <= 450 && new RegExp(q.armaturaBor, 'i').test(z.matn))) continue;
      const kalit = `${r.sahifa}:${Math.round(r.y)}:${Math.round(c.x0)}`; if (sanalgan.has(kalit)) continue;
      // Po'lat plastina/profil qatori armatura massasiga kirmasin (massa katagidan chapga <= 450 oralig'idagi kataklar bo'yicha)
      const yon = r.kataklar.filter((z) => z.x0 < c.x0 && c.x0 - z.x0 <= 450).map((z) => z.matn);
      if (yon.some((m) => yoqRe.test(m)) && !yon.some((m) => borRe.test(m))) continue;
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
