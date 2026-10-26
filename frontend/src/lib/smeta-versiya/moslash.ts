/**
 * Versiya ↔ joriy smeta moslash dvigateli (sof funksiya). Mantiq Sun'iy ko'l qo'lda solishtiruvidan (2026-10-26,
 * compare.py — 4 941 pozitsiya, egasi bilan ko'rib chiqilgan) olindi:
 *   LS juftlash: lokal smeta kodi + nomi aniq; bo'lmasa shu kod va nom o'xshashligi ≥ 0,7.
 *   LS ichida pog'onalar:
 *     1) razdel + blok + shifr + nom + birlik aniq          → 100 %
 *     2) shifr + nom + birlik aniq (blok/razdel nomi farq)   → 90 %
 *     3) shifr + birlik bir xil, nom o'xshash (≥ 0,6)        → o'xshashlik %
 *     3c) shifr bir xil, BIRLIK farq (nom ≥ 0,5)             → 60 %, hajm solishtirilmaydi
 *     4) shifr farq, birlik bir xil, nom juda o'xshash (≥ 0,9) → o'xshashlik − 10
 *     5) ZAMENA: shu razdel + blok + birlik, hajm teng, shifr/nom boshqa → 70 %, «almashtirilgan»
 *   Qolganlari: eski — «o'chirilgan», joriy — «yangi».
 * Holat: ishonch < 90 → «noaniq» (inson tasdig'i kutiladi); hajm NULL bo'lsa — «noaniq» (NULL ≠ 0, farq to'qilmaydi).
 */
import { birlikNorm, kodNorm, norm, razdelNorm } from './pozitsiya';
import { oxshashlik, oxshashlikChegarasi } from './oxshash';
import type { JPozitsiya, MoslikHolat, MoslikTaklif, VPozitsiya } from './turlar';

type Poz = Pick<VPozitsiya, 'lsKod' | 'lsNom' | 'razdel' | 'blok' | 'kod' | 'nom' | 'birlik' | 'hajm'>;

const lsKalit = (p: Poz) => `${kodNorm(p.lsKod)}|${norm(p.lsNom)}`;
const kalit1 = (p: Poz) => [razdelNorm(p.razdel), norm(p.blok), kodNorm(p.kod), norm(p.nom), birlikNorm(p.birlik)].join('|');
const kalit2 = (p: Poz) => [kodNorm(p.kod), norm(p.nom), birlikNorm(p.birlik)].join('|');

function guruhla<T extends Poz>(arr: readonly T[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  arr.forEach((p, i) => { const k = lsKalit(p); const a = m.get(k); if (a) a.push(i); else m.set(k, [i]); });
  return m;
}

/** LS juftlari: [eski LS indekslari | null, joriy LS indekslari | null]. */
function lsJuftla(eski: readonly Poz[], joriy: readonly Poz[]): Array<[number[], number[]]> {
  const ge = guruhla(eski); const gj = guruhla(joriy);
  const ishlatildi = new Set<string>();
  const juftlar: Array<[number[], number[]]> = [];
  for (const [k, ei] of ge) {
    if (gj.has(k) && !ishlatildi.has(k)) { juftlar.push([ei, gj.get(k)!]); ishlatildi.add(k); continue; }
    const [kod, nom] = k.split('|');
    let eng: string | null = null; let engS = 0;
    for (const k2 of gj.keys()) {
      if (ishlatildi.has(k2)) continue;
      const [kod2, nom2] = k2.split('|');
      if (kod2 !== kod) continue;
      const s = oxshashlik(nom, nom2);
      if (s > engS) { eng = k2; engS = s; }
    }
    if (eng && engS >= 0.7) { juftlar.push([ei, gj.get(eng)!]); ishlatildi.add(eng); }
    else juftlar.push([ei, []]);
  }
  for (const [k2, ji] of gj) if (!ishlatildi.has(k2)) juftlar.push([[], ji]);
  return juftlar;
}

function holatAniqla(eh: number | null, jh: number | null, ishonch: number, zamena: boolean, birlikFarq: boolean): MoslikHolat {
  if (zamena) return 'almashtirilgan';
  if (ishonch < 90 || birlikFarq) return 'noaniq';
  if (eh == null || jh == null) return 'noaniq';
  const d = jh - eh;
  if (Math.abs(d) <= 1e-9 * Math.max(1, Math.abs(eh))) return 'ozgarmagan';
  return d < 0 ? 'kamaygan' : 'oshgan';
}

/**
 * `joriy[i].qoshimcha` — smetaga keyin qo'shilgan qator (AddRepl: qo'shimcha ish / zamena). Avval faqat asosiy (import
 * qilingan) qatorlar bilan moslanadi; qolgan eski pozitsiyalar keyin qo'shimcha qatorlar bilan (1–4 pog'ona) moslanadi va
 * bunday juft doim «noaniq» (inson tasdig'i) — qo'shimcha qator ekspertiza smetasining qismi emas.
 */
export function versiyaMoslash(eski: readonly Poz[], joriy: ReadonlyArray<Poz & { qoshimcha?: boolean }>): MoslikTaklif[] {
  const asosiy = joriy.map((_, i) => i).filter((i) => !joriy[i].qoshimcha);
  const qosh = joriy.map((_, i) => i).filter((i) => joriy[i].qoshimcha);
  const birinchi = moslashIchki(eski, joriy, eski.map((_, i) => i), asosiy, true);
  if (!qosh.length) return birinchi;
  const qolganEski = birinchi.filter((m) => m.holat === 'ochirilgan').map((m) => m.eski!);
  const ikkinchi = moslashIchki(eski, joriy, qolganEski, qosh, false).map((m): MoslikTaklif => (m.eski != null && m.joriy != null
    ? { ...m, holat: 'noaniq', ishonch: Math.min(m.ishonch ?? 0, 80), usul: [m.usul, 'qo‘shimcha qator (smetaga keyin qo‘shilgan)'].filter(Boolean).join('; ') }
    : m));
  const ikkinchiEski = new Set(ikkinchi.filter((m) => m.eski != null).map((m) => m.eski));
  return [...birinchi.filter((m) => !(m.holat === 'ochirilgan' && ikkinchiEski.has(m.eski))), ...ikkinchi];
}

function moslashIchki(eski: readonly Poz[], joriy: readonly Poz[], eskiIdx: readonly number[], joriyIdx: readonly number[], zamenaBilan: boolean): MoslikTaklif[] {
  const natija: MoslikTaklif[] = [];
  const eJ = lsJuftla(eskiIdx.map((i) => eski[i]), joriyIdx.map((i) => joriy[i]))
    .map(([e, j]): [number[], number[]] => [e.map((x) => eskiIdx[x]), j.map((x) => joriyIdx[x])]);
  for (const [ei, ji] of eJ) {
    const bosh = new Set(ji);
    const juft: Array<{ e: number; j: number; ishonch: number; usul: string; zamena?: boolean; birlikFarq?: boolean }> = [];
    const ol = (e: number, j: number, ishonch: number, usul: string, x: { zamena?: boolean; birlikFarq?: boolean } = {}) => {
      bosh.delete(j); juft.push({ e, j, ishonch, usul, ...x });
    };
    const indeks = (f: (p: Poz) => string) => {
      const m = new Map<string, number[]>();
      for (const j of ji) if (bosh.has(j)) { const k = f(joriy[j]); const a = m.get(k); if (a) a.push(j); else m.set(k, [j]); }
      return m;
    };
    const birinchiBosh = (lst: number[] | undefined) => { if (!lst) return null; while (lst.length) { const j = lst.shift()!; if (bosh.has(j)) return j; } return null; };

    // 1–2: aniq kalitlar.
    let qolgan: number[] = [];
    let idx = indeks(kalit1);
    for (const e of ei) { const j = birinchiBosh(idx.get(kalit1(eski[e]))); if (j != null) ol(e, j, 100, ''); else qolgan.push(e); }
    idx = indeks(kalit2);
    let keyingi: number[] = [];
    for (const e of qolgan) { const j = birinchiBosh(idx.get(kalit2(eski[e]))); if (j != null) ol(e, j, 90, 'blok/razdel nomi farq'); else keyingi.push(e); }
    qolgan = keyingi; keyingi = [];

    // 3 / 3c: shifr bir xil.
    const eng = (e: number, shart: (j: number) => boolean, chegara: number): [number | null, number] => {
      let bj: number | null = null; let bs = 0;
      const n = norm(eski[e].nom);
      for (const j of ji) {
        if (!bosh.has(j) || !shart(j)) continue;
        const m = norm(joriy[j].nom);
        if (oxshashlikChegarasi(n, m) < Math.max(chegara, bs)) continue;
        const s = oxshashlik(n, m);
        if (s > bs) { bj = j; bs = s; }
      }
      return [bs >= chegara ? bj : null, bs];
    };
    for (const e of qolgan) {
      const k = kodNorm(eski[e].kod); const b = birlikNorm(eski[e].birlik);
      const [j, s] = eng(e, (x) => kodNorm(joriy[x].kod) === k && birlikNorm(joriy[x].birlik) === b, 0.6);
      if (j != null) ol(e, j, Math.floor(s * 100), 'shifr bir xil, nom farq'); else keyingi.push(e);
    }
    qolgan = keyingi; keyingi = [];
    for (const e of qolgan) {
      const k = kodNorm(eski[e].kod);
      if (!k) { keyingi.push(e); continue; }
      const [j] = eng(e, (x) => kodNorm(joriy[x].kod) === k, 0.5);
      if (j != null) ol(e, j, 60, 'shifr bir xil, BIRLIK farq (hajm solishtirilmaydi)', { birlikFarq: true }); else keyingi.push(e);
    }
    qolgan = keyingi; keyingi = [];
    // 4: shifr farq, nom juda o'xshash.
    for (const e of qolgan) {
      const b = birlikNorm(eski[e].birlik);
      const [j, s] = eng(e, (x) => birlikNorm(joriy[x].birlik) === b, 0.9);
      if (j != null) ol(e, j, Math.floor(s * 100) - 10, 'shifr farq, nom o‘xshash'); else keyingi.push(e);
    }
    qolgan = keyingi; keyingi = [];
    // 5: zamena — shu razdel+blok, shu birlik, hajm teng.
    for (const e of qolgan) {
      const p = eski[e];
      let topildi: number | null = null;
      if (p.hajm && zamenaBilan) {
        for (const j of ji) {
          if (!bosh.has(j)) continue;
          const q = joriy[j];
          if (razdelNorm(q.razdel) !== razdelNorm(p.razdel) || norm(q.blok) !== norm(p.blok) || birlikNorm(q.birlik) !== birlikNorm(p.birlik) || !q.hajm) continue;
          if (Math.abs(q.hajm - p.hajm) <= 1e-6 * Math.max(1, Math.abs(p.hajm))) { topildi = j; break; }
        }
      }
      if (topildi != null) ol(e, topildi, 70, 'ZAMENA: ish turi almashtirilgan, hajm teng', { zamena: true }); else keyingi.push(e);
    }

    for (const m of juft.sort((a, b) => a.e - b.e)) {
      const holat = holatAniqla(eski[m.e].hajm, joriy[m.j].hajm, m.ishonch, !!m.zamena, !!m.birlikFarq);
      const usul = [m.usul, holat === 'noaniq' && (eski[m.e].hajm == null || joriy[m.j].hajm == null) ? 'hajm noma’lum' : ''].filter(Boolean).join('; ');
      natija.push({ eski: m.e, joriy: m.j, holat, ishonch: m.ishonch, usul, birlikFarq: !!m.birlikFarq });
    }
    for (const e of keyingi) natija.push({ eski: e, joriy: null, holat: 'ochirilgan', ishonch: null, usul: '', birlikFarq: false });
    for (const j of ji) if (bosh.has(j)) natija.push({ eski: null, joriy: j, holat: 'yangi', ishonch: null, usul: '', birlikFarq: false });
  }
  return natija;
}

/** Ko'rinish uchun moslikni ikki pozitsiya bilan birga. */
export type MoslikJuft = MoslikTaklif & { e: VPozitsiya | null; j: JPozitsiya | null };
