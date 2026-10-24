/**
 * F2 V3 ish joyi holati — ikki oynali moslashtirish ekranining TOZA (UI siz) mantig'i.
 * Kontrakt: docs/architecture/F2_IMPORT_V3.md §3–§4.
 *
 * Dvigatel (`f2MoslashV3`) bir marta taklif beradi; keyin operator qarorlari shu yerda
 * yashaydi: bog'lash (ish — resurslari bilan birga), uzish, ◐ taklifni tasdiqlash, qatorni
 * ongli ravishda o'tkazib yuborish. Yozish qatorlari ham shu yerda quriladi:
 *   - ish qatori (resurslari bor) — faqat HAJM (pul resurslarda);
 *   - resurs / resurssiz ish — hajm + hujjatning o'z narxi va summasi.
 * Hal qilinmagan (✕/◐) qator qolsa — yozish YO'Q, sababi ro'yxat bilan.
 */
import { kodKanon, normBir, normKod, normNom } from '../f2-match-engine';
import type { F2Akt, F2Tugun } from '../smeta-anatomiya/f2';
import type { F2ExactManbaTugun } from '../../test02/f2-exact-payload';
import { f2Imzo, gradeFarq, resursNomKalit, rzKalit, yagonaResursMos, type F2MoslashNatija, type SmetaQator } from './index';

export type BogHolat = 'aniq' | 'xotira' | 'taklif' | 'qolda';
export interface Bog { qatorId: number; holat: BogHolat; usul: string }

/** Ekranda ko'rinadigan holat: ✓ aniq/xotira/qo'lda · ◐ taklif · ✕ topilmadi · – o'tkazildi. */
export type KorinishHolat = BogHolat | 'topilmadi' | 'otkazildi';

export interface IshJoyi {
  bog: ReadonlyMap<string, Bog>;
  otkaz: ReadonlySet<string>;
}

// ─── Indekslar ───────────────────────────────────────────────────────────────

export interface F2Indeks {
  byUid: Map<string, F2Tugun>;
  ota: Map<string, F2Tugun | null>;
  /** Pul/hajm yoziladigan tugunlar (ish va resurslar), fayl tartibida. */
  qatorlar: F2Tugun[];
}

export function f2Indeks(daraxt: readonly F2Tugun[]): F2Indeks {
  const byUid = new Map<string, F2Tugun>();
  const ota = new Map<string, F2Tugun | null>();
  const qatorlar: F2Tugun[] = [];
  const yur = (list: readonly F2Tugun[], o: F2Tugun | null) => {
    for (const t of list) {
      byUid.set(t.uid, t);
      ota.set(t.uid, o);
      if (t.tur !== 'rz') qatorlar.push(t);
      yur(t.bolalar, t);
    }
  };
  yur(daraxt, null);
  return { byUid, ota, qatorlar };
}

export interface SmetaIndeks {
  byId: Map<number, SmetaQator>;
  bolalar: Map<number | null, SmetaQator[]>;
}

export function smetaIndeks(smeta: readonly SmetaQator[]): SmetaIndeks {
  const byId = new Map<number, SmetaQator>();
  const bolalar = new Map<number | null, SmetaQator[]>();
  for (const q of smeta) {
    byId.set(q.id, q);
    const k = q.otaId ?? null;
    const a = bolalar.get(k);
    if (a) a.push(q); else bolalar.set(k, [q]);
  }
  for (const a of bolalar.values()) a.sort((x, y) => (x.tartib ?? x.id) - (y.tartib ?? y.id));
  return { byId, bolalar };
}

// ─── Boshlang'ich holat ──────────────────────────────────────────────────────

export function boshlangich(n: F2MoslashNatija, avvalgi?: IshJoyi): IshJoyi {
  const bog = new Map<string, Bog>();
  for (const [uid, r] of n.natijalar) {
    if (r.qatorId == null || r.holat === 'topilmadi') continue;
    bog.set(uid, { qatorId: r.qatorId, holat: r.holat, usul: r.usul ?? r.holat });
  }
  // Operator qarorlari qayta hisoblashda (masalan razdel o'rgatilganda) yo'qolmaydi.
  if (avvalgi) for (const [uid, b] of avvalgi.bog) if (b.holat !== 'taklif') bog.set(uid, b);
  return { bog, otkaz: new Set(avvalgi?.otkaz ?? []) };
}

export function korinish(ij: IshJoyi, uid: string): KorinishHolat {
  if (ij.otkaz.has(uid)) return 'otkazildi';
  return ij.bog.get(uid)?.holat ?? 'topilmadi';
}

// ─── Amallar (har biri yangi IshJoyi qaytaradi) ─────────────────────────────

const nb = (nom: unknown, bir: unknown) => normNom(nom) + '||' + normBir(bir);
const birMos = (a: unknown, b: unknown) => { const x = normBir(a), y = normBir(b); return !x || !y || x === y; };

export function bogla(ij: IshJoyi, uid: string, qatorId: number): IshJoyi {
  const bog = new Map(ij.bog);
  bog.set(uid, { qatorId, holat: 'qolda', usul: 'qolda' });
  const otkaz = new Set(ij.otkaz); otkaz.delete(uid);
  return { bog, otkaz };
}

export interface IshBoglaNatija { ij: IshJoyi; boglandi: number; qoldi: number }

/**
 * Ishni RESURSLARI BILAN bog'lash (Tizim1 drag-drop: "o'sha ishga tashlansa — bog'lash + bolalar").
 * Resurslar faqat shu smeta ishi ichida: kod → kod-kanon → nom+birlik, yagona bo'lsa;
 * birlik yoki marka farqli bo'lsa bog'lanmaydi (zamena material bo'lishi mumkin — operator hal qiladi).
 */
export function ishniBogla(ij: IshJoyi, fIsh: F2Tugun, sIshId: number, S: SmetaIndeks): IshBoglaNatija {
  let yangi = bogla(ij, fIsh.uid, sIshId);
  const bog = new Map(yangi.bog);
  const ichki = (S.bolalar.get(sIshId) ?? []).filter((t) => t.tur !== 'rz');
  // Shu ish resurslaridan boshqa F2 qatorlari band qilgan smeta qatorlari.
  const bolaUid = new Set(fIsh.bolalar.map((r) => r.uid));
  const band = new Set<number>();
  for (const [uid, b] of bog) if (!bolaUid.has(uid)) band.add(b.qatorId);
  let boglandi = 0, qoldi = 0;
  for (const r of fIsh.bolalar) {
    const joriy = bog.get(r.uid);
    if (joriy?.holat === 'qolda' && ichki.some((t) => t.id === joriy.qatorId)) { band.add(joriy.qatorId); boglandi++; continue; }
    bog.delete(r.uid);
    const bosh = ichki.filter((t) => !band.has(t.id));
    const t = resursMosTop(r, bosh);
    if (t && birMos(r.birlik, t.birlik) && !gradeFarq(r.nom, t.nom)) {
      bog.set(r.uid, { qatorId: t.id, holat: 'qolda', usul: 'ish_ichida' });
      band.add(t.id);
      boglandi++;
    } else qoldi++;
  }
  yangi = { bog, otkaz: yangi.otkaz };
  return { ij: yangi, boglandi, qoldi };
}

/** Ish ichidagi bo'sh smeta resurslari orasidan F2 resursiga mosi: kod → kod-kanon → nom+birlik, yagona bo'lsa. */
function resursMosTop(r: F2Tugun, bosh: readonly SmetaQator[]): SmetaQator | null {
  const rk = normKod(r.kod), rkan = kodKanon(r.kod), rnb = nb(r.nom, r.birlik);
  for (const c of [
    rk ? bosh.filter((x) => normKod(x.kod) === rk) : [],
    rkan ? bosh.filter((x) => kodKanon(x.kod) === rkan) : [],
    bosh.filter((x) => nb(x.nom, x.birlik) === rnb),
    bosh.filter((x) => resursNomKalit(x.nom, x.birlik) === resursNomKalit(r.nom, r.birlik)),
  ]) {
    const selected = yagonaResursMos(c, r);
    if (selected) return selected;
  }
  return null;
}

export interface IshTasdiqNatija { ij: IshJoyi; tasdiqlandi: number; boglandi: number; qoldi: number }

/**
 * Ishni RESURSLARI BILAN TASDIQLASH (egasi 2026-10-24: «ish va uning resurslari bitta guruh»): ish ◐ → ✓; resurslari — ◐ lari tasdiqlanadi,
 * bog'lanmaganlari ish ichida avtomatik bog'lanadi (kod → kanon → nom+birlik); mos topilmaganlar `qoldi` — ish ichida zamena/qo'shimcha taklifi bilan.
 * Mavjud bog'lanishlar (aniq/xotira/qo'lda) O'ZGARMAYDI. Aktga kiritilmagan resurslarga tegilmaydi. Ish bog'lanmagan bo'lsa — hech narsa.
 */
export function ishniTasdiqla(ij: IshJoyi, f: F2Tugun, S: SmetaIndeks): IshTasdiqNatija {
  const b0 = ij.bog.get(f.uid);
  if (!b0 || f.tur !== 'bl') return { ij: tasdiqla(ij, [f.uid]), tasdiqlandi: b0?.holat === 'taklif' ? 1 : 0, boglandi: 0, qoldi: 0 };
  const bog = new Map(ij.bog);
  let tasdiqlandi = 0, boglandi = 0, qoldi = 0;
  const tasdiq = (uid: string) => { const b = bog.get(uid); if (b?.holat === 'taklif') { bog.set(uid, { ...b, holat: 'qolda', usul: 'taklif_tasdiq' }); tasdiqlandi++; } };
  tasdiq(f.uid);
  const ichki = (S.bolalar.get(b0.qatorId) ?? []).filter((t) => t.tur !== 'rz');
  const bolaUid = new Set(f.bolalar.map((r) => r.uid));
  const band = new Set<number>();
  for (const [uid, b] of bog) if (!bolaUid.has(uid)) band.add(b.qatorId);
  for (const r of f.bolalar) {
    if (ij.otkaz.has(r.uid)) continue;
    const cb = bog.get(r.uid);
    if (cb) { tasdiq(r.uid); band.add(cb.qatorId); continue; }
    const t = resursMosTop(r, ichki.filter((x) => !band.has(x.id)));
    if (t && birMos(r.birlik, t.birlik) && !gradeFarq(r.nom, t.nom)) { bog.set(r.uid, { qatorId: t.id, holat: 'qolda', usul: 'ish_ichida' }); band.add(t.id); boglandi++; }
    else qoldi++;
  }
  return { ij: { bog, otkaz: ij.otkaz }, tasdiqlandi, boglandi, qoldi };
}

export function uz(ij: IshJoyi, f: F2Tugun): IshJoyi {
  const bog = new Map(ij.bog);
  bog.delete(f.uid);
  if (f.tur === 'bl') for (const r of f.bolalar) bog.delete(r.uid);
  return { bog, otkaz: ij.otkaz };
}

/** ◐ taklif(lar)ni operator tasdiqlaydi → ✓ qo'lda. */
export function tasdiqla(ij: IshJoyi, uidlar: Iterable<string>): IshJoyi {
  const bog = new Map(ij.bog);
  for (const uid of uidlar) {
    const b = bog.get(uid);
    if (b?.holat === 'taklif') bog.set(uid, { ...b, holat: 'qolda', usul: 'taklif_tasdiq' });
  }
  return { bog, otkaz: ij.otkaz };
}

/** Qatorni aktga KIRITMASLIK (ongli qaror: masalan #REF! katak yoki boshqa oyga tegishli).
 *  Ish o'tkazilsa — resurslari ham. */
export function otkazibYubor(ij: IshJoyi, f: F2Tugun, on: boolean): IshJoyi {
  const otkaz = new Set(ij.otkaz);
  const bog = new Map(ij.bog);
  const uidlar = [f.uid, ...(f.tur === 'bl' ? f.bolalar.map((r) => r.uid) : [])];
  for (const u of uidlar) {
    if (on) { otkaz.add(u); bog.delete(u); } else otkaz.delete(u);
  }
  return { bog, otkaz };
}

// ─── Hisob va yozish ─────────────────────────────────────────────────────────

// ─── Guruh (ish + resurslari) darajasidagi holat va hisoblagichlar ─────────

export type GuruhHolat = 'aniq' | 'xotira' | 'qolda' | 'taklif' | 'topilmadi' | 'otkazildi';

/** Ildiz qator: resursi bo'lgan ish ichidagi resurs EMAS (ish yoki mustaqil resurs). */
export function guruhIldizi(ind: F2Indeks, uid: string): F2Tugun | undefined {
  const o = ind.ota.get(uid);
  return o && o.tur === 'bl' ? o : ind.byUid.get(uid);
}

/**
 * Guruh holati: ish o'zi hal qilinmagan bo'lsa — o'sha; ish ✓ bo'lsa-yu resurslaridan biri ◐ yoki bog'lanmagan bo'lsa — ◐ (tekshirish kerak,
 * bitta ro'yxatda); aks holda ishning o'z holati. Resurslar navbatga bitta-bitta chiqmaydi.
 */
export function guruhHolati(ind: F2Indeks, ij: IshJoyi, ildiz: F2Tugun): GuruhHolat {
  const k = korinish(ij, ildiz.uid);
  if (k === 'otkazildi' || k === 'topilmadi' || k === 'taklif') return k;
  if (ildiz.tur === 'bl' && ildiz.bolalar.some((r) => { const rk = korinish(ij, r.uid); return rk === 'taklif' || rk === 'topilmadi'; })) return 'taklif';
  return k;
}

export interface GuruhHisob { tizimTopdi: number; avvalgiQaror: number; operatorTasdiqladi: number; taklif: number; topilmadi: number; otkazildi: number; hal: string[] }

/** Ish darajasidagi hisoblagichlar (egasi 2026-10-24): ✓/◐/✕ va «Keyingi tekshirilmagan» ildiz (ish/mustaqil resurs) bo'yicha. */
export function guruhHisobla(ind: F2Indeks, ij: IshJoyi): GuruhHisob {
  const h: GuruhHisob = { tizimTopdi: 0, avvalgiQaror: 0, operatorTasdiqladi: 0, taklif: 0, topilmadi: 0, otkazildi: 0, hal: [] };
  for (const t of ind.qatorlar) {
    const o = ind.ota.get(t.uid);
    if (o && o.tur === 'bl') continue;
    const g = guruhHolati(ind, ij, t);
    if (g === 'aniq') h.tizimTopdi++; else if (g === 'xotira') h.avvalgiQaror++; else if (g === 'qolda') h.operatorTasdiqladi++;
    else if (g === 'taklif') { h.taklif++; h.hal.push(t.uid); } else if (g === 'topilmadi') { h.topilmadi++; h.hal.push(t.uid); } else h.otkazildi++;
  }
  return h;
}

export interface IshJoyiHisob {
  jami: number;
  tayyor: number; // ✓ (aniq + xotira + qo'lda)
  tizimTopdi: number;
  avvalgiQaror: number;
  operatorTasdiqladi: number;
  taklif: number;
  topilmadi: number;
  otkazildi: number;
  /** Bog'langan barglar puli (o'tkazilganlarsiz). */
  boglanganSumma: number;
  /** Fayldagi barcha barglar puli. */
  hujjatSumma: number;
  otkazilganSumma: number;
  /** Bir smeta qatoriga bir nechta F2 qatori tushgan joylar (ogohlantirish, xato emas). */
  kopBog: Map<number, string[]>;
}

export function hisobla(ind: F2Indeks, ij: IshJoyi): IshJoyiHisob {
  const h: IshJoyiHisob = { jami: 0, tayyor: 0, tizimTopdi: 0, avvalgiQaror: 0, operatorTasdiqladi: 0, taklif: 0, topilmadi: 0, otkazildi: 0, boglanganSumma: 0, hujjatSumma: 0, otkazilganSumma: 0, kopBog: new Map() };
  const qayerga = new Map<number, string[]>();
  for (const t of ind.qatorlar) {
    h.jami++;
    const k = korinish(ij, t.uid);
    if (k === 'taklif') h.taklif++;
    else if (k === 'topilmadi') h.topilmadi++;
    else if (k === 'otkazildi') h.otkazildi++;
    else {
      h.tayyor++;
      if (k === 'aniq') h.tizimTopdi++;
      else if (k === 'xotira') h.avvalgiQaror++;
      else if (k === 'qolda') h.operatorTasdiqladi++;
    }
    const b = ij.bog.get(t.uid);
    if (b) { const a = qayerga.get(b.qatorId); if (a) a.push(t.uid); else qayerga.set(b.qatorId, [t.uid]); }
    if (t.barg && t.summa != null) {
      h.hujjatSumma += t.summa;
      if (k === 'otkazildi') h.otkazilganSumma += t.summa;
      else if (b) h.boglanganSumma += t.summa;
    }
  }
  for (const [id, a] of qayerga) if (a.length > 1) h.kopBog.set(id, a);
  return h;
}

export interface YozishManbasi {
  nodes: F2ExactManbaTugun[];
  mapping: Map<string, number>;
  /** Yozishni to'xtatuvchi sabablar (bo'sh bo'lsa — yozish mumkin). */
  toxtatish: string[];
  /** Har manba qatori uchun xotira imzosi (keyingi oylarda avtomatik bog'lash uchun). */
  imzolar: Map<string, string>;
}

export function yozishManbasi(ind: F2Indeks, ij: IshJoyi): YozishManbasi {
  const nodes: F2ExactManbaTugun[] = [];
  const mapping = new Map<string, number>();
  const imzolar = new Map<string, string>();
  const hal: string[] = [];
  const qiymatsiz: string[] = [];
  const summasiz: string[] = [];
  const qisqa = (t: F2Tugun) => `«${(t.kod ? t.kod + ' ' : '') + t.nom.slice(0, 60)}» (${t.manzil.varaq}!${t.manzil.qator})`;
  for (const t of ind.qatorlar) {
    const k = korinish(ij, t.uid);
    if (k === 'otkazildi') continue;
    // Podvaldagi qo'lda qator bog'lanmagan bo'lsa — jim o'tkaziladi (blok yo'q); ◐ taklif esa tasdiq/o'tkazishni kutadi.
    if (t.podval && k === 'topilmadi') continue;
    if (k === 'topilmadi' || k === 'taklif') { hal.push(qisqa(t)); continue; }
    const b = ij.bog.get(t.uid)!;
    if (t.hajm == null || t.ogohlantirish?.length) { qiymatsiz.push(qisqa(t)); continue; }
    mapping.set(t.uid, b.qatorId);
    const ota = ind.ota.get(t.uid);
    imzolar.set(t.uid, t.tur === 'rs' && ota ? f2Imzo(t, f2Imzo(ota)) : f2Imzo(t, t.yol.map(rzKalit).join('/')));
    // Resurslari bor ish — faqat hajm; pul uning resurslarida (ikki marta sanalmaydi).
    if (t.tur === 'bl' && !t.barg) nodes.push({ uid: t.uid, hajm: t.hajm, narx: undefined, summa: undefined, tur: 'bl' });
    else {
      // Narxi bor-u hujjatda summasi bo'sh — pul to'qilmaydi: aniq qator nomi bilan to'xtatiladi.
      if (t.narx != null && t.narx > 0 && t.summa == null) summasiz.push(qisqa(t));
      nodes.push({ uid: t.uid, hajm: t.hajm, narx: t.narx, summa: t.summa, tur: t.tur, summaYozilgan: t.summa != null });
    }
  }
  const toxtatish: string[] = [];
  if (hal.length) toxtatish.push(`${hal.length} ta qator hal qilinmagan (✕ yoki ◐): ${hal.slice(0, 5).join('; ')}${hal.length > 5 ? ' …' : ''}`);
  if (qiymatsiz.length) toxtatish.push(`${qiymatsiz.length} ta qatorda qiymat noma'lum (#REF! yoki bo'sh) — hujjatni tuzating yoki qatorni o'tkazib yuboring: ${qiymatsiz.slice(0, 5).join('; ')}${qiymatsiz.length > 5 ? ' …' : ''}`);
  if (summasiz.length) toxtatish.push(`${summasiz.length} ta qatorda narx bor, lekin hujjatda summa bo'sh — summa to'qilmaydi, hujjatni tuzating yoki qatorni aktga kiritmang: ${summasiz.slice(0, 5).join('; ')}${summasiz.length > 5 ? ' …' : ''}`);
  if (!nodes.length && !toxtatish.length) toxtatish.push('Aktga kiradigan qator yo‘q.');
  return { nodes, mapping, toxtatish, imzolar };
}

/** F2 tuguni smeta qatoriga "o'sha ish"mi — tashlaganda to'g'ridan-to'g'ri bog'lash mumkinmi
 *  yoki operatordan so'rash kerak (Bog'lash / ⇄ Zamena / ＋ Qo'shimcha). */
export function oshaQatormi(f: F2Tugun, s: SmetaQator): boolean {
  if (!birMos(f.birlik, s.birlik) || gradeFarq(f.nom, s.nom)) return false;
  const fk = normKod(f.kod);
  if (fk && normKod(s.kod) === fk) return true;
  const fkan = kodKanon(f.kod);
  if (fkan && kodKanon(s.kod) === fkan) return true;
  return nb(f.nom, f.birlik) === nb(s.nom, s.birlik);
}

/** F2 akt jami: hujjatdagi ИТОГО ПРЯМЫЕ ↔ qatorlar (ekranda ko'rsatish uchun). */
export function aktJamiMatni(a: F2Akt): { hujjat: number | null; qatorlar: number; farq: number | null } {
  return { hujjat: a.jami.pryamye, qatorlar: a.qatorlarJami, farq: a.jami.pryamye == null ? null : a.qatorlarJami - a.jami.pryamye };
}
