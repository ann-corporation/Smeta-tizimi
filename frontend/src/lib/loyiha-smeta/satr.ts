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
  out.push(...oynaDanOqi(qatorlar));
  out.push(...spesKolOqi(qatorlar));
  return out;
}

/**
 * Eshik/oyna/vitraj VEDOMOSTI (АР): ko'p qatorli sarlavha («Количество | 1 этаж | 2 этаж | Площадь, м² | 1 изделия | Всего») va «hхb» o'lcham katagi.
 * Ustunlar sarlavha x-holatidan: «Количество» -> «Площадь» orasidagi sonlar yig'indisi = soni; «Площадь» ustunlari oxirgisi = umumiy maydon.
 * Nomi — o'lchamdan chapdagi matn + yuqoridagi guruh sarlavhasi (masalan «Витражи»). Tekshiruv: bitta maydon × soni ≈ umumiy maydon.
 */
export type OynaQoidalari = { olcham: string; kolSarlavha: string; plosSarlavha: string; keyingiSarlavha: string; guruhOyna: number; tol: number };
export const OYNA_STANDART: OynaQoidalari = {
  olcham: '^\\d{3,4}\\s?[xх×]\\s?\\d{3,4}$', kolSarlavha: '^количество', plosSarlavha: '^площадь', keyingiSarlavha: '^(длина|длинна|подоконн|наличник|примечание)', guruhOyna: 450, tol: 0.02,
};

export function oynaDanOqi(qatorlar: JQator[], q: OynaQoidalari = OYNA_STANDART): Element[] {
  const olchamRe = new RegExp(q.olcham, 'i'); const kolRe = new RegExp(q.kolSarlavha, 'i'); const plosRe = new RegExp(q.plosSarlavha, 'i'); const keyRe = new RegExp(q.keyingiSarlavha, 'i');
  const out: Element[] = [];
  const bosh = qatorlar.flatMap((r) => r.kataklar.filter((c) => kolRe.test(c.matn)).map((c) => ({ x: c.x0, y: r.y })));
  if (bosh.length === 0) return out;
  for (const r of qatorlar) {
    const k = r.kataklar; const oi = k.findIndex((c) => olchamRe.test(c.matn.trim()));
    if (oi < 0) continue;
    // Eng yaqin yuqoridagi sarlavha (Количество) shu o'lcham katagidan chapda/yonida
    const h = bosh.filter((b) => b.y < r.y && r.y - b.y < 400 && Math.abs(b.x - k[oi].x0) < 700).sort((a, b) => b.y - a.y)[0];
    if (!h) continue;
    const sar = qatorlar.filter((z) => z.y >= h.y - 5 && z.y <= h.y + 150).flatMap((z) => z.kataklar);
    const plos = sar.find((c) => plosRe.test(c.matn) && c.x0 > h.x);
    if (!plos) continue;
    const kelasi = sar.filter((c) => keyRe.test(c.matn) && c.x0 > plos.x0 + 20).sort((a, b) => a.x0 - b.x0)[0];
    const plosOxiri = kelasi ? kelasi.x0 - 8 : plos.x0 + 200;
    const son = (c: { matn: string }) => sonOqi(c.matn);
    const kolSon = k.filter((c) => c.x0 >= h.x - 25 && c.x0 < plos.x0 - 12 && son(c) != null).map((c) => son(c) as number);
    const plosSon = k.filter((c) => c.x0 >= plos.x0 - 12 && c.x0 <= plosOxiri && son(c) != null).map((c) => son(c) as number);
    const soni = kolSon.length ? kolSon.reduce((a, b) => a + b, 0) : null; const bitta = plosSon.length >= 2 ? plosSon[0] : null; const jami = plosSon.length ? plosSon[plosSon.length - 1] : null;
    const ogoh: string[] = [];
    if (soni != null && bitta != null && jami != null && Math.abs(soni * bitta - jami) > Math.max(0.05, jami * q.tol)) ogoh.push('maydon_mos_emas');
    const matnChap = k.slice(0, oi).filter((c) => k[oi].x0 - c.x1 < q.guruhOyna).map((c) => c.matn).join(' ');
    const guruh = qatorlar.filter((z) => z.y < r.y && r.y - z.y < 90 && z.kataklar.length <= 2 && z.kataklar.every((c) => sonOqi(c.matn) == null && c.x0 < k[oi].x0)).map((z) => z.kataklar[0].matn)[0] ?? '';
    const nom = `${guruh} ${matnChap} ${k[oi].matn.trim()}`.replace(/\s+/g, ' ').trim();
    const baza = { profil: 'satr_oyna', tur: 'eshik_oyna' as const, nom, belgi: k[oi].matn.trim(), sahifa: r.sahifa, qutisi: qatorQutisi(r), odamKerak: false };
    if (soni != null) out.push({ ...baza, birlik: 'шт', miqdor: soni, manbaRef: `satr_oyna:${r.sahifa}:${Math.round(r.y)}:soni`, ishonch: ogoh.length ? 0.5 : 0.75, ogohlantirish: ogoh });
    if (jami != null) out.push({ ...baza, nom: nom + ' (площадь)', birlik: 'м2', miqdor: jami, manbaRef: `satr_oyna:${r.sahifa}:${Math.round(r.y)}:maydon`, ishonch: ogoh.length ? 0.5 : 0.75, ogohlantirish: ogoh });
  }
  return out;
}

/**
 * «Спецификация материалов» (АР: tashqi pardoz, fasad panellari): «Наименование | Кол. | birlik» — birlik ustuni sarlavhasiz, nom KO'P QATORLI va
 * raqam qatoriga nisbatan vertikal markazlangan: har nom qatori eng yaqin (y bo'yicha) raqam qatoriga biriktiriladi.
 */
export type SpesKolQoidalari = { nomSarlavha: string; kolSarlavha: string; birlik: string; yaqinlik: number; sarlavhaMasofa: number; boyi: number };
export const SPES_KOL_STANDART: SpesKolQoidalari = {
  nomSarlavha: '^наименование', kolSarlavha: '^кол\\.?$', birlik: '^(м[²2]|м[³3]|м|шт|п\\.?\\s?м|кг|т|компл)\\.?$', yaqinlik: 45, sarlavhaMasofa: 30, boyi: 1500,
};

export function spesKolOqi(qatorlar: JQator[], q: SpesKolQoidalari = SPES_KOL_STANDART): Element[] {
  const nomRe = new RegExp(q.nomSarlavha, 'i'); const kolRe = new RegExp(q.kolSarlavha, 'i'); const birRe = new RegExp(q.birlik, 'i');
  const out: Element[] = [];
  for (const r of qatorlar) for (const kc of r.kataklar) {
    if (!kolRe.test(kc.matn.trim())) continue;
    const nc = qatorlar.filter((z) => Math.abs(z.y - r.y) <= q.sarlavhaMasofa).flatMap((z) => z.kataklar).find((c) => nomRe.test(c.matn) && c.x0 < kc.x0 && kc.x0 - c.x0 < 700);
    if (!nc) continue;
    const y0 = r.y + q.sarlavhaMasofa; const y1 = r.y + q.boyi;
    const satrlar = qatorlar.filter((z) => z.y > y0 && z.y <= y1);
    const raqam: { y: number; son: number; birlik: string; q: JQator }[] = [];
    for (const z of satrlar) {
      const k = z.kataklar; const i = k.findIndex((c) => Math.abs(c.x0 - kc.x0) <= 40 && sonOqi(c.matn) != null);
      if (i < 0) continue;
      const b = k.slice(i + 1).find((c) => c.x0 - kc.x0 < 160 && birRe.test(c.matn.trim()));
      if (b) raqam.push({ y: z.y, son: sonOqi(k[i].matn) as number, birlik: b.matn.trim(), q: z });
    }
    if (raqam.length === 0) continue;
    const qatorNom = new Map<number, { y: number; m: string }[]>();
    for (const z of satrlar) {
      const m = z.kataklar.filter((c) => c.x0 >= nc.x0 - 250 && c.x0 < kc.x0 - 15 && sonOqi(c.matn) == null && !/^(наименование|обозначение|поз\\.?|примечание)/i.test(c.matn.trim())).map((c) => c.matn).join(' ').trim();
      if (!m) continue;
      let eng = 0; let d = Infinity; raqam.forEach((a, i) => { const dd = Math.abs(a.y - z.y); if (dd < d) { d = dd; eng = i; } });
      if (d <= q.yaqinlik) qatorNom.set(eng, [...(qatorNom.get(eng) ?? []), { y: z.y, m }]);
    }
    raqam.forEach((a, i) => {
      const nom = (qatorNom.get(i) ?? []).sort((x, y) => x.y - y.y).map((x) => x.m).join(' ').replace(/\s+/g, ' ').trim();
      if (!nom) return;
      out.push({ profil: 'satr_spes', tur: 'boshqa', nom, belgi: null, birlik: a.birlik, miqdor: a.son, sahifa: a.q.sahifa, qutisi: qatorQutisi(a.q), manbaRef: `satr_spes:${a.q.sahifa}:${Math.round(a.y)}`,
        ishonch: 0.65, odamKerak: false, ogohlantirish: ['kop_qatorli'] });
    });
  }
  return out;
}
