/**
 * MUSTAQIL QATORLAR (egasi 2026-10-24, Amfiteatr «СМЕТА № 01-10 НА ГОРЯЧИЙ ВОДОПРОВОД»): F2 da ish ostida resurs bo'lib
 * kelgan qatorlar (12-505-14 ТРОЙНИК …, 12-505-15 …) smetada o'sha bo'limda ish OSTIDA EMAS, razdel ostida MUSTAQIL
 * qator bo'lib, xuddi shu tartibda turadi. Ota-ish boshqa joyga (◐) bog'lansa yoki smeta ishining razdeli boshqa bo'lsa,
 * ular «qo'shimcha resurs» ✕ bo'lib qolardi va operator ularni bittalab bog'lardi.
 *
 * Qoida (bitta joyda — dvigatel ham, «⇣ Ish resurslarini bog'lash» ham shu funksiyadan foydalanadi):
 *  - nomzod — razdel ostidagi barg qator (ish ham, material ham; ishning resursi EMAS), turi rz emas;
 *  - dalil: nom + birlik aynan, YOKI kod aynan + nomdagi raqamlar (o'lcham/diametr) teng + nom o'xshash.
 *    Faqat kodga ishonilmaydi: F2 dagi kod ba'zan smetadagidan bitta raqamga siljigan bo'ladi (stend: 15-106496-21 ↔ -22);
 *  - birlik farqli — hech qachon; marka/diametr farqi (gradeFarq) — hech qachon;
 *  - bitta F2 ishining resurslari qaysi razdelda ko'proq topilsa (OVOZ) — avval o'sha razdeldan; ichida bir nechta bo'lsa
 *    oldingi topilganidan keyingisi (ketma-ketlik);
 *  - ✓ faqat: F2 bo'limi doirasida, nomzod yagona, kod + nom + birlik aynan va hajm teng (±0,5%); aks holda ◐ taklif;
 *  - doiradan tashqarida (boshqa bo'lim) — faqat ◐ va `tashqiUsul` bilan (ommaviy tasdiqda alohida so'raladi, #84).
 */
import { normBir, normKod, normNom } from '../f2-match-engine';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import type { SmetaQator } from './index';
import type { F2Indeks, IshJoyi, SmetaIndeks, Bog } from './ishJoyi';

export const MUSTAQIL_ANIQ_USUL = 'kod_bolim_ichida';
export const MUSTAQIL_TAKLIF_USUL = 'kod_bolim_taklif';

type MQ = Pick<SmetaQator, 'id' | 'tur' | 'kod' | 'nom' | 'birlik' | 'hajm' | 'tartib'>;

const tokenlar = (s: unknown): string[] =>
  String(s ?? '').toUpperCase().replace(/Ё/g, 'Е').split(/[^0-9A-Za-zА-Яа-я]+/).map(normNom).filter((t) => t.length >= 2);
function dice(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const m = new Map<string, number>();
  b.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1));
  let hit = 0;
  a.forEach((t) => { const n = m.get(t) ?? 0; if (n > 0) { hit++; m.set(t, n - 1); } });
  return (2 * hit) / (a.length + b.length);
}
const raqamlar = (s: unknown): string => (String(s ?? '').match(/\d+([.,]\d+)?/g) || []).map((x) => x.replace(',', '.')).join('|');
/** Bir harfli «С» kabi belgi — identifikator emas. */
export const kodIshonchli = (kod: unknown): boolean => { const k = normKod(kod); return !!k && (/[0-9]/.test(k) || k.length >= 2); };
const nb = (nom: unknown, bir: unknown) => normNom(nom) + '||' + normBir(bir);
/** Birlik qalqoni: ikkalasi ham bor va farqli — juftlanmaydi. Biri bo'sh bo'lsa ruxsat (lekin ✓ uchun ikkalasi teng bo'lishi shart). */
const birOk = (a: unknown, b: unknown) => { const x = normBir(a), y = normBir(b); return !x || !y || x === y; };
const hajmTeng = (a: number | null | undefined, b: number | null | undefined) =>
  a != null && b != null && b !== 0 && Math.abs(Math.abs(a) - Math.abs(b)) <= Math.abs(b) * 0.005;

/**
 * Bitta F2 qatori va smeta qatori «o'sha qator»mi (ketma-ket bog'lash va mustaqil qidiruv uchun umumiy dalil):
 * nom + birlik aynan, yoki kod aynan + nomdagi raqamlar teng + nom o'xshash (≥ 50%). Birlik/marka farqi — yo'q.
 */
export function qatorMosmi(f: Pick<F2Tugun, 'kod' | 'nom' | 'birlik'>, s: Pick<SmetaQator, 'kod' | 'nom' | 'birlik'>, farq: (a: unknown, b: unknown) => boolean): 'nom' | 'kod' | null {
  if (!birOk(f.birlik, s.birlik) || farq(f.nom, s.nom)) return null;
  if (normNom(f.nom) && normNom(f.nom) === normNom(s.nom)) return 'nom';
  if (kodIshonchli(f.kod) && normKod(f.kod) === normKod(s.kod) && raqamlar(f.nom) === raqamlar(s.nom)
    && dice(tokenlar(f.nom), tokenlar(s.nom)) >= 0.5) return 'kod';
  return null;
}

export interface MustaqilIndeks<T extends MQ> {
  /** Razdel ostidagi barg qatorlar: nom+birlik → qatorlar. */
  byNb: Map<string, T[]>;
  byKod: Map<string, T[]>;
  /** Qatorning eng yaqin razdeli. */
  rz: (t: T) => T | null;
  ajdodmi: (a: T, t: T) => boolean;
}

export function mustaqilIndeks<T extends MQ>(qatorlar: Iterable<T>, ota: (t: T) => T | null | undefined, bolalar: (t: T) => readonly T[]): MustaqilIndeks<T> {
  const byNb = new Map<string, T[]>(), byKod = new Map<string, T[]>();
  const qosh = (m: Map<string, T[]>, k: string, t: T) => { if (!k) return; const a = m.get(k); if (a) a.push(t); else m.set(k, [t]); };
  for (const t of qatorlar) {
    if (t.tur === 'rz') continue;
    const o = ota(t);
    if (o && o.tur !== 'rz') continue; // ish ichidagi resurs — mustaqil emas
    if (bolalar(t).some((c) => c.tur !== 'rz')) continue; // resurslari bor ish — mustaqil barg emas
    qosh(byNb, nb(t.nom, t.birlik), t);
    if (kodIshonchli(t.kod)) qosh(byKod, normKod(t.kod), t);
  }
  const rz = (t: T) => { let o = ota(t); while (o && o.tur !== 'rz') o = ota(o); return o ?? null; };
  const ajdodmi = (a: T, t: T) => { for (let o = ota(t); o; o = ota(o)) if (o === a || o.id === a.id) return true; return false; };
  return { byNb, byKod, rz, ajdodmi };
}

export interface MustaqilTopilma<T> { uid: string; qator: T; aniq: boolean; usul: string; sabab: string }

export interface MustaqilOpts<T> {
  /** F2 bo'limi doirasidagi smeta razdellari; null — doira yo'q (butun smeta bitta doira). */
  doira: readonly T[] | null;
  /** ✓ berish mumkinmi (bo'lim aniq ulangan). */
  aniqMumkin: boolean;
  mumkinmi: (t: T) => boolean;
  farq: (a: unknown, b: unknown) => boolean;
  /** Doiradan tashqaridagi topilma usuli (boshqa bo'lim — ◐). */
  tashqiUsul: string;
}

/** Bitta F2 ishining (yoki qo'shni) bog'lanmagan qatorlari uchun mustaqil smeta qatorlari. */
export function mustaqilQatorlarniTop<T extends MQ>(I: MustaqilIndeks<T>, qatorlar: readonly F2Tugun[], o: MustaqilOpts<T>): MustaqilTopilma<T>[] {
  const ichidami = (t: T) => !o.doira || o.doira.some((r) => r.id === t.id || I.ajdodmi(r, t));
  type N = { t: T; dalil: 'nom' | 'kod' };
  const nomzodlar = qatorlar.map((r) => {
    const s = new Map<number, N>();
    for (const t of I.byNb.get(nb(r.nom, r.birlik)) ?? []) s.set(t.id, { t, dalil: 'nom' });
    if (kodIshonchli(r.kod)) for (const t of I.byKod.get(normKod(r.kod)) ?? []) if (!s.has(t.id)) s.set(t.id, { t, dalil: 'kod' });
    let c = [...s.values()].filter((x) => o.mumkinmi(x.t) && qatorMosmi(r, x.t, o.farq) != null);
    // Nom aynan topilgan bo'lsa — faqat kod bo'yicha (nomi boshqa) nomzodlar chiqariladi.
    if (c.some((x) => x.dalil === 'nom')) c = c.filter((x) => x.dalil === 'nom');
    const ichki = c.filter((x) => ichidami(x.t));
    // Boshqa bo'limdan faqat butun smetada YAGONA nomzod (#84: egizaklar bo'lsa qaysi biri ekani ma'lumotdan ajralmaydi).
    return { r, c: ichki.length ? ichki : c.length === 1 ? c : [], ichida: ichki.length > 0 };
  });
  // OVOZ: qaysi razdelda shu guruhning nechta qatori topiladi.
  const ovoz = new Map<number, number>();
  for (const x of nomzodlar) for (const rzId of new Set(x.c.map((n) => I.rz(n.t)?.id ?? -1))) ovoz.set(rzId, (ovoz.get(rzId) ?? 0) + 1);
  const out: MustaqilTopilma<T>[] = [];
  const olingan = new Set<number>();
  let oldingi: T | null = null;
  for (const x of nomzodlar) {
    const c = x.c.filter((n) => !olingan.has(n.t.id));
    if (!c.length) continue;
    const ovozi = (n: N) => ovoz.get(I.rz(n.t)?.id ?? -1) ?? 0;
    const eng = Math.max(...c.map(ovozi));
    let top = c.filter((n) => ovozi(n) === eng);
    const rzlar = new Set(top.map((n) => I.rz(n.t)?.id ?? -1));
    if (rzlar.size > 1 && oldingi) {
      // Teng ovoz — oldingi topilma turgan razdel (ketma-ketlik).
      const orz = I.rz(oldingi)?.id ?? -1;
      if (top.some((n) => (I.rz(n.t)?.id ?? -1) === orz)) top = top.filter((n) => (I.rz(n.t)?.id ?? -1) === orz);
    }
    const yagona = top.length === 1 && new Set(top.map((n) => I.rz(n.t)?.id ?? -1)).size === 1;
    // Umumiy material (armatura, beton …) bo'limda o'nlab marta takrorlanadi — bunday taxmin shovqin: ko'pi bilan 3 ta nomzod.
    if (top.length > 3) continue;
    const tr = (t: T): number => t.tartib ?? t.id;
    const oT: number = oldingi ? tr(oldingi) : -Infinity;
    const tanlangan: N = yagona ? top[0] : [...top].sort((a: N, b: N): number => {
      const ka: number = tr(a.t) > oT ? 0 : 1, kb: number = tr(b.t) > oT ? 0 : 1;
      return ka - kb || (ka === 0 ? tr(a.t) - tr(b.t) : tr(b.t) - tr(a.t)) || a.t.id - b.t.id;
    })[0];
    const t: T = tanlangan.t;
    const r = x.r;
    const birTeng = !!normBir(r.birlik) && normBir(r.birlik) === normBir(t.birlik);
    const kodTeng = kodIshonchli(r.kod) && normKod(r.kod) === normKod(t.kod);
    const nomTeng = normNom(r.nom) === normNom(t.nom);
    const aniq = o.aniqMumkin && x.ichida && yagona && x.c.filter((n) => !olingan.has(n.t.id)).length === 1
      && kodTeng && nomTeng && birTeng && hajmTeng(r.hajm, t.hajm);
    const rzNom = String(I.rz(t)?.nom ?? '').slice(0, 60);
    out.push({
      uid: r.uid, qator: t, aniq,
      usul: aniq ? MUSTAQIL_ANIQ_USUL : x.ichida ? MUSTAQIL_TAKLIF_USUL : o.tashqiUsul,
      sabab: aniq
        ? `smetada bu qator ish ostida emas — «${rzNom}» bo‘limida mustaqil qator: kod, nom, birlik va hajm aynan, yagona`
        : x.ichida
          ? `smetada «${rzNom}» bo‘limida mustaqil qator (${tanlangan.dalil === 'nom' ? 'nom va birlik aynan' : 'kod va o‘lcham mos'}${yagona ? '' : `; ${top.length} ta nomzoddan ketma-ketlik bo‘yicha`}) — tasdiqlang`
          : `boshqa bo‘limda («${rzNom}») mustaqil qator — ${tanlangan.dalil === 'nom' ? 'nom va birlik aynan' : 'kod va o‘lcham mos'}; zamena/qo‘shimcha ham bo‘lishi mumkin — tekshirib tasdiqlang`,
    });
    olingan.add(t.id);
    oldingi = t;
  }
  return out;
}

/**
 * Ish joyi bosqichi («Mos qatorlarni bog'lash» va «⇣ Ish resurslarini bog'lash» oxirida): HAR F2 ishining hali bog'lanmagan
 * resurslari uchun mustaqil smeta qatorlari. Ish bog'langan (✓) bo'lsa doira — o'sha ishning eng tashqi razdeli (lokal smeta),
 * ✓ mumkin; ish ◐ yoki bog'lanmagan bo'lsa — faqat ◐. Mavjud bog'lanishlar va aktga kiritilmaganlar o'zgarmaydi;
 * boshqa F2 qatorlari band qilgan smeta qatorlari olinmaydi.
 */
export function mustaqilResurslarniBogla(ij: IshJoyi, ind: F2Indeks, S: SmetaIndeks, farq: (a: unknown, b: unknown) => boolean, tashqiUsul: string): { ij: IshJoyi; boglandi: number; taklif: number } {
  const ota = (t: SmetaQator) => (t.otaId != null ? S.byId.get(t.otaId) : undefined);
  const bol = (t: SmetaQator) => S.bolalar.get(t.id) ?? [];
  let I: MustaqilIndeks<SmetaQator> | null = null;
  const band = new Set<number>();
  for (const b of ij.bog.values()) band.add(b.qatorId);
  let bog: Map<string, Bog> | null = null;
  let boglandi = 0, taklif = 0;
  for (const f of ind.qatorlar) {
    if (f.tur !== 'bl' || !f.bolalar.length || ij.otkaz.has(f.uid)) continue;
    const qoldi = f.bolalar.filter((r) => r.tur !== 'rz' && !ij.otkaz.has(r.uid) && !(bog ?? ij.bog).has(r.uid));
    if (!qoldi.length) continue;
    I ??= mustaqilIndeks(S.byId.values(), ota, bol);
    const b0 = ij.bog.get(f.uid);
    let tashqi: SmetaQator | undefined = b0 ? S.byId.get(b0.qatorId) : undefined;
    for (let o = tashqi ? ota(tashqi) : undefined; o; o = ota(o)) if (o.tur === 'rz') tashqi = o;
    const doira = tashqi && tashqi.tur === 'rz' ? [tashqi] : null;
    const topilma = mustaqilQatorlarniTop(I, qoldi, { doira, aniqMumkin: !!b0 && b0.holat !== 'taklif' && !!doira, mumkinmi: (t) => !band.has(t.id), farq, tashqiUsul: doira ? tashqiUsul : MUSTAQIL_TAKLIF_USUL });
    for (const x of topilma) {
      bog ??= new Map(ij.bog);
      bog.set(x.uid, { qatorId: x.qator.id, holat: x.aniq ? 'aniq' : 'taklif', usul: x.usul });
      band.add(x.qator.id);
      if (x.aniq) boglandi++; else taklif++;
    }
  }
  return { ij: bog ? { bog, otkaz: ij.otkaz } : ij, boglandi, taklif };
}
