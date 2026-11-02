/**
 * Pozitsiyalar: (1) yuklangan LRV fayl → `smeta-anatomiya` (YAGONA smeta yadrosi; parallel aniqlagich yozilmaydi) →
 * versiya pozitsiyalari; (2) joriy smeta (t2_qator daraxti) → solishtiriladigan pozitsiyalar. Ikkala tomon bir xil
 * kalitlarga keltiriladi: lokal smeta (kod + nom), razdel, blok, shifr, nom, birlik.
 */
import { sarlavhaYoli, type KitobAnatomiyasi } from '../smeta-anatomiya';
import type { Sarlavha, VaraqAnatomiyasi } from '../smeta-anatomiya/turlar';
import { ESKI_SMETA } from '../f2-dublikat/tekshiruv';
import type { JPozitsiya, VPozitsiya, VResurs } from './turlar';
import { son } from './turlar';

/** Matn kaliti: katta harf, Ё→Е, bo'shliqlar bitta. */
export const norm = (s: string | null | undefined): string =>
  String(s ?? '').replace(/Ё/g, 'Е').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim().toUpperCase();

const GOMOGLIF: Record<string, string> = { Е: 'E', С: 'C', А: 'A', О: 'O', Р: 'P', К: 'K', Т: 'T', Х: 'X', М: 'M', Н: 'H', В: 'B' };
/** Shifr kaliti: bo'shliqsiz, katta harf, kirill/lotin bir xil ko'rinadigan harflar bir xil. */
export const kodNorm = (k: string | null | undefined): string =>
  norm(k).replace(/\s+/g, '').replace(/[ЕСАОРКТХМНВ]/g, (c) => GOMOGLIF[c] ?? c);

/** Birlik kaliti: «100 М2» = «100М2», «М²» = «М2». */
export const birlikNorm = (b: string | null | undefined): string => norm(b).replace(/\s+/g, '').replace(/²/g, '2').replace(/³/g, '3').replace(/\.$/, '');

const LS_RE = /СМЕТА\s*№\s*(\S+)\s+НА\s+(.+)$/i;
/** «РАЗДЕЛ: СМЕТА № 03-03 НА БЛОГОУСТРОЙСТВА(ЗАМЕН)» → { kod: '03-03', nom: 'БЛОГОУСТРОЙСТВА(ЗАМЕН)' }. */
export function lsAjrat(matn: string | null | undefined): { kod: string; nom: string } | null {
  const m = LS_RE.exec(norm(matn));
  return m ? { kod: m[1], nom: m[2].trim() } : null;
}
/** Razdel nomi: «РАЗДЕЛ 1: БЛОГОУСТРОЙСТВО» va «РАЗДЕЛ: БЛОГОУСТРОЙСТВО» bir xil. */
export const razdelNorm = (s: string | null | undefined): string => norm(s).replace(/^РАЗДЕЛ\s*№?\s*[\d.]*\s*[:.]?\s*/, '');

const resursOl = (r: { kod: string | null; xom: string; birlik: string | null; normaBirlikka: number | null; hajm: number | null }): VResurs =>
  ({ kod: r.kod, nom: r.xom, birlik: r.birlik, norma: r.normaBirlikka, hajm: r.hajm });

/** Yo'l (ildizdan) → lokal / razdel / blok. */
function yoldan(yol: readonly Sarlavha[]): Pick<VPozitsiya, 'lsKod' | 'lsNom' | 'razdel' | 'blok'> {
  let ls: { kod: string; nom: string } | null = null;
  let razdel: string | null = null; let blok: string | null = null;
  for (const s of yol) {
    if (s.tur === 'lokal') { ls = lsAjrat(s.xom) ?? { kod: '', nom: norm(s.xom) }; razdel = null; blok = null; }
    else if (s.tur === 'razdel') { razdel = s.xom; blok = null; }
    else if (s.tur === 'blok') blok = s.xom;
  }
  return { lsKod: ls?.kod || null, lsNom: ls?.nom ?? null, razdel, blok };
}

/** Kitob(lar) anatomiyasi → versiya pozitsiyalari (asosiy LRV varag'idan; dublikat F5_UZB o'tkaziladi). */
export function anatomiyadanPozitsiyalar(kitoblar: readonly KitobAnatomiyasi[]): { pozitsiyalar: VPozitsiya[]; ogohlar: string[] } {
  const pozitsiyalar: VPozitsiya[] = [];
  const ogohlar: string[] = [];
  for (const k of kitoblar) {
    const v: VaraqAnatomiyasi | undefined = k.varaqlar.find((x) => x.varaq === k.asosiyLrv);
    if (!v) { ogohlar.push(`${k.fayl}: LRV varag'i topilmadi`); continue; }
    for (const r of k.review) ogohlar.push(`${k.fayl}: ${r.izoh}`);
    const sarlavhalar = [...v.titul, ...v.sarlavhalar];
    for (const ish of v.ishlar) {
      const yol = sarlavhaYoli(sarlavhalar, ish.sarlavha);
      pozitsiyalar.push({
        tartib: pozitsiyalar.length, ...yoldan(yol), raqam: ish.tartib || null, kod: ish.shifr, nom: ish.xom.trim(),
        birlik: ish.birlik, hajm: ish.hajm, resurslar: ish.resurslar.map(resursOl),
        manba: { fayl: k.fayl, varaq: v.varaq, qator: ish.manzil.qator },
      });
    }
    for (const r of v.mustaqilResurslar ?? []) {
      const yol = sarlavhaYoli(sarlavhalar, r.sarlavha ?? null);
      pozitsiyalar.push({
        tartib: pozitsiyalar.length, ...yoldan(yol), raqam: r.tartib || null, kod: r.kod, nom: r.xom.trim(),
        birlik: r.birlik, hajm: r.hajm, resurslar: [],
        manba: { fayl: k.fayl, varaq: v.varaq, qator: r.manzil.qator },
      });
    }
  }
  return { pozitsiyalar: pozitsiyalar.filter((p) => p.nom), ogohlar };
}

/** Joriy smeta qatori (o'qish uchun kerakli ustunlar). */
export type JQator = {
  id: number; ota_id: number | null; tur: string | null; kod: string | null; nom: string | null; birlik: string | null;
  hajm: number | string | null; narx?: number | string | null; summa?: number | string | null; kat?: string | null; norma?: number | string | null;
  qoshimcha?: boolean | null; zamena?: boolean | null;
};

const POZ_TUR = new Set(['bl', 'mat', 'ob']);
const RES_TUR = new Set(['rs', 'mat', 'ob']);

/**
 * t2_qator daraxti → joriy pozitsiyalar: ish (bl) va bo'lim ostidagi mustaqil mat/ob. Nomida «(ekspertizagacha)»
 * bo'lgan bo'lim ostidagilar (eski smeta shu daraxtga qo'shilgan) — `eskiChiqarildi` ga, solishtirishga kirmaydi.
 */
export function qatorlardanPozitsiyalar(rows: readonly JQator[]): { pozitsiyalar: JPozitsiya[]; eskiChiqarildi: number } {
  const byId = new Map<number, JQator>();
  const bolalar = new Map<number, JQator[]>();
  for (const r of rows) {
    byId.set(r.id, r);
    if (r.ota_id != null) { const a = bolalar.get(r.ota_id); if (a) a.push(r); else bolalar.set(r.ota_id, [r]); }
  }
  const yolMemo = new Map<number, { yol: JQator[]; eski: boolean }>();
  const yolOl = (id: number | null): { yol: JQator[]; eski: boolean } => {
    if (id == null) return { yol: [], eski: false };
    const c = yolMemo.get(id);
    if (c) return c;
    const zanjir: JQator[] = [];
    let p: number | null = id;
    while (p != null && zanjir.length < 64) { const q = byId.get(p); if (!q) break; zanjir.unshift(q); p = q.ota_id; }
    const yol = zanjir.filter((q) => q.tur === 'rz');
    const natija = { yol, eski: zanjir.some((q) => ESKI_SMETA.test(String(q.nom ?? ''))) };
    yolMemo.set(id, natija);
    return natija;
  };
  const pozitsiyalar: JPozitsiya[] = [];
  let eskiChiqarildi = 0;
  for (const r of rows) {
    const tur = r.tur ?? '';
    if (!POZ_TUR.has(tur)) continue;
    const ota = r.ota_id != null ? byId.get(r.ota_id) : undefined;
    if (tur !== 'bl' && ota && ota.tur !== 'rz') continue; // ish ichidagi material — resurs
    const { yol, eski } = yolOl(r.ota_id);
    if (eski || ESKI_SMETA.test(String(r.nom ?? ''))) { eskiChiqarildi++; continue; }
    let i = yol.findIndex((q) => lsAjrat(q.nom) != null);
    let ls = i >= 0 ? lsAjrat(yol[i].nom) : null;
    if (i < 0 && yol.length) { i = 0; ls = { kod: '', nom: razdelNorm(yol[0].nom) }; }
    const ost = i >= 0 ? yol.slice(i + 1) : [];
    const resurslar: VResurs[] = tur === 'bl'
      ? (bolalar.get(r.id) ?? []).filter((c) => RES_TUR.has(c.tur ?? '')).map((c) => ({ kod: c.kod, nom: c.nom, birlik: c.birlik, norma: son(c.norma), hajm: son(c.hajm) }))
      : [];
    pozitsiyalar.push({
      qatorId: r.id, lsKod: ls?.kod || null, lsNom: ls?.nom ?? null,
      razdel: ost[0]?.nom ?? null, blok: ost.length > 1 ? ost[ost.length - 1].nom : null,
      kod: r.kod, nom: String(r.nom ?? '').trim(), birlik: r.birlik, hajm: son(r.hajm), tur, resurslar,
      qoshimcha: r.qoshimcha === true || r.zamena === true,
    });
  }
  return { pozitsiyalar, eskiChiqarildi };
}
