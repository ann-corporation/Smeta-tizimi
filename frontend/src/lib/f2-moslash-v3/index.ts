/**
 * F2 MOSLASH V3 — qavatma-qavat moslik bali (egasi, 2026-09-25):
 *   "avto bog'lashda razdel nomi, ish turi shifri, ish turi nomi, birligi, ish turi obyomi,
 *    ish turi resurslari (mat, ob …) — xuddi shu tartibdagi qavatlarda qanchalik moslik
 *    bo'lsa, shunchalik mos variant hisoblanadi."
 * Kontrakt: docs/architecture/F2_IMPORT_V3.md §2.
 *
 * Tizim1 (`Smeta tizimi/35_F2Moslash.js`) himoyalari saqlanadi: lotin→kirill, kod-kanon,
 * razdel nomi tozalash, chizma kodlari; BIRLIK QALQONI (Т↔КГ — hech qachon avto emas),
 * MARKA FARQI (ПК↔ПБ → ehtimoliy zamena), resurslar faqat bog'langan ish ichida, har smeta
 * qatori bir marta band. Avto-bog'lash faqat eng yaxshi nomzod ikkinchisidan ANIQ ustun
 * bo'lganda; qolganlari — "◐ taklif" (operator tasdiqlaydi) yoki "✕ topilmadi" (nomzodlar,
 * qo'shimcha/zamena).
 *
 * Qavatlar va ballar (jami ≈ 120):
 *   1. Razdel     0…25  — eng yaqin razdel nomi, lokal smeta nomi ("СМЕТА № … НА X" — raqam
 *                          e'tiborga olinmaydi, F2 va smetada farq qiladi), ЛИСТ, chizma kodi
 *   2. Shifr      0…25  — aynan 25, kod-kanon 18
 *   3. Nom        0…20  — aynan 20, o'xshash (raqamlari teng) Dice×15
 *   4. Birlik     qalqon — farqli bo'lsa −100 (avto yo'q)
 *   5. Resurslar −5…+25 — tarkib (kod/nom+birlik) Jaccard×15, norma tengligi ×7, tartib ×3
 *   6. Hajm       0…+2  — ENG OXIRGI: faqat teng nomzodlarni ajratadi (teng smeta +2, ≤ qoldiq +1);
 *                          hech qachon jarima emas — F2 ishni qisman oladi; oshsa faqat ogohlantirish
 *   + xotira (o'tgan oy tasdiqlangan) — ball emas, darhol; marka farqi −30; tartib +2
 */
import { kodKanon, normBir, normKod, normNom, normRz, rzKodlar } from '../f2-match-engine';
import type { F2Tugun } from '../smeta-anatomiya/f2';

// ─── Kirish/chiqish ──────────────────────────────────────────────────────────

/** Smeta (LRV) qatori — `t2_qator` dan. */
export interface SmetaQator {
  id: number;
  otaId: number | null;
  tur: 'rz' | 'bl' | 'rs' | 'mat' | 'ob' | string;
  kod: string | null;
  nom: string | null;
  birlik: string | null;
  hajm: number | null;
  narx?: number | null;
  /** Resurs normasi (ish birligiga) — ko'rsatish uchun. */
  norma?: number | null;
  tartib?: number | null;
}

export type F2Holat = 'aniq' | 'xotira' | 'taklif' | 'topilmadi';

export interface Qavat { nom: 'razdel' | 'shifr' | 'nom' | 'birlik' | 'hajm' | 'resurslar' | 'marka' | 'texnik_tafsilot' | 'tartib'; ball: number; izoh: string }

export interface Nomzod {
  qatorId: number;
  ball: number;
  /** Smetadagi yo'li (RZ nomlari). */
  yol: string;
  qavatlar: Qavat[];
  /** Qisqa: ['razdel ✓', 'shifr ✓', …]. */
  sabab: string[];
}

export interface F2QatorNatija {
  uid: string;
  holat: F2Holat;
  qatorId: number | null;
  usul?: string;
  nomzodlar: Nomzod[];
  sabab: string;
}

export interface RzDiag { f2Uid: string; nom: string; smetaRzIdlar: number[]; ok: boolean; usul: string }

export interface F2MoslashOpts {
  /** F2 imzosi → smeta qator id (o'tgan oylarda tasdiqlangan). */
  xotira?: ReadonlyMap<string, number>;
  /** F2 razdel uid → smeta razdel id (operator o'rgatgan). */
  rzBog?: ReadonlyMap<string, number>;
  /** smeta qator id → qolgan hajm (smeta − oldingi F2). Berilmasa smeta hajmi. */
  qoldiq?: ReadonlyMap<number, number>;
  /** Avto-bog'lash chegaralari (sinov uchun). */
  avtoMin?: number;
  avtoFarq?: number;
}

export interface F2MoslashNatija {
  natijalar: Map<string, F2QatorNatija>;
  rzDiag: RzDiag[];
  stat: { aniq: number; xotira: number; taklif: number; topilmadi: number };
}

// ─── Normallashtirish ────────────────────────────────────────────────────────

const nb = (nom: unknown, bir: unknown) => normNom(nom) + '||' + normBir(bir);
const birMos = (a: unknown, b: unknown) => { const x = normBir(a), y = normBir(b); return !x || !y || x === y; };

/** Razdel/lokal nomi kaliti: "СМЕТА № 01-01 НА X" → X (raqam F2 va smetada farq qiladi). */
export function rzKalit(s: unknown): string {
  const t = String(s ?? '').toUpperCase().replace(/Ё/g, 'Е')
    .replace(/^\s*(РАЗДЕЛ\s*[:№.-]*\s*)?(ЛОКАЛЬНАЯ\s+)?СМЕТА\s*№?\s*[\dA-ZА-Я./-]*\s*(НА\s+)?/, ' ');
  return normRz(t);
}
function listRaqamlari(s: unknown): string {
  const m = String(s ?? '').toUpperCase().match(/ЛИСТ[-\s.№]*(?:[А-Я]{1,3}[-\s.]*)?([0-9][0-9,\s.-]*)/);
  return m ? m[1].replace(/[^0-9,]/g, '').replace(/,+/g, ',').replace(/^,|,$/g, '') : '';
}
function tokenlar(s: unknown): string[] {
  return String(s ?? '').toUpperCase().replace(/Ё/g, 'Е').split(/[^0-9A-Za-zА-Яа-я]+/).map(normNom).filter((t) => t.length >= 2);
}
function raqamlar(s: unknown): string {
  return (String(s ?? '').match(/\d+([.,]\d+)?/g) || []).map((x) => x.replace(',', '.')).sort().join('|');
}
function dice(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const m = new Map<string, number>();
  b.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1));
  let hit = 0;
  a.forEach((t) => { const n = m.get(t) ?? 0; if (n > 0) { hit++; m.set(t, n - 1); } });
  return (2 * hit) / (a.length + b.length);
}
/** Tizim1 dagi harfli marka qalqoni; loyiha qator kodi bu tekshiruvga kiritilmaydi. */
function harfliMarkaFarq(a: unknown, b: unknown): boolean {
  const A = tokenlar(a).filter((t) => /^[А-Я]{2,3}$/.test(t));
  const B = tokenlar(b).filter((t) => /^[А-Я]{2,3}$/.test(t));
  if (!A.length || !B.length) return false;
  const sa = new Set(A), sb = new Set(B);
  return A.some((t) => !sb.has(t)) && B.some((t) => !sa.has(t));
}

/**
 * Construction-grade signatures are extracted only for known, explicit
 * designation families. A difference is a hard review gate, not a fuzzy-score
 * penalty: B15/B25, A400/A500, W6/W8, F100/F200, M200/M300 and DN values must
 * not be silently treated as the same resource merely because their code is
 * equal. Unknown designations remain candidates for a human; we do not infer
 * missing grade data.
 */
function texnikBelgilar(s: unknown): Map<string, string> {
  // normNom nom mosligi uchun barcha tinish belgilarini olib tashlaydi; marka
  // tahlilida esa W/F kabi lotincha standart belgilar va ularning chegarasi zarur.
  const text = String(s ?? '').toUpperCase().replace(/Ё/g, 'Е')
    .replace(/[ABCDEHIKMNOPTVXY]/g, (ch) => ({ A: 'А', B: 'В', C: 'С', D: 'Д', E: 'Е', H: 'Н', I: 'И', K: 'К', M: 'М', N: 'Н', O: 'О', P: 'Р', T: 'Т', V: 'В', X: 'Х', Y: 'У' })[ch] ?? ch)
    .replace(/[^0-9A-ZА-Я]+/g, ' ').trim();
  const out = new Map<string, string>();
  const putFirst = (key: string, pattern: RegExp) => {
    const m = text.match(pattern);
    if (m) out.set(key, m[1]);
  };
  putFirst('beton_klass', /(?:^|[^А-Я0-9])В\s*(10|12|15|20|22|25|30|35|40|45|50|55|60|70|80|90|100)(?!\d)/);
  putFirst('armatura_klass', /(?:^|[^А-Я0-9])А\s*(240|300|400|500|600|800)(?!\d)/);
  putFirst('armatura_roman', /(?:^|[^А-Я0-9])А\s*(И{1,3}|ИВ)(?![А-Я])/);
  putFirst('suv_otkazmaslik', /(?:^|[^A-Z0-9])W\s*(1|2|3|4|5|6|8|10|12|14|16|18|20)(?!\d)/);
  putFirst('sovuqqa_chidamlilik', /(?:^|[^A-Z0-9])F\s*(25|35|50|75|100|150|200|300)(?!\d)/);
  putFirst('beton_markasi', /(?:^|[^А-Я0-9])М\s*(50|75|100|150|200|250|300|350|400|450|500|550|600|700|800|900|1000)(?!\d)/);
  putFirst('diametr', /(?:^|[^А-Я0-9])(?:ДН|ДИАМ(?:ЕТР(?:ОМ)?)?\.?)\s*(\d{1,4})(?!\d)/);
  return out;
}

/** Ikki nomda ham mavjud bo'lgan bir xil texnik o'lchovning qiymati farqlimi? */
export function texnikTafsilotFarqlari(a: unknown, b: unknown): string[] {
  const A = texnikBelgilar(a), B = texnikBelgilar(b);
  const labels: Record<string, string> = {
    beton_klass: 'beton klassi', armatura_klass: 'armatura klassi', armatura_roman: 'armatura markasi',
    suv_otkazmaslik: 'suv o‘tkazmaslik markasi', sovuqqa_chidamlilik: 'sovuqqa chidamlilik markasi',
    beton_markasi: 'beton markasi', diametr: 'diametr',
  };
  return [...A.keys()].filter((key) => B.has(key) && A.get(key) !== B.get(key)).map((key) => labels[key] ?? key);
}

/** Marka/klass farqi — bir xil kod ham bu to'siqni chetlab o'tmaydi. */
export function gradeFarq(a: unknown, b: unknown): boolean {
  return harfliMarkaFarq(a, b) || texnikTafsilotFarqlari(a, b).length > 0;
}

function resKalit(kod: unknown, nom: unknown, bir: unknown): string {
  // LRV_PLUS/F2 can place `С` in the code field for unrelated materials.
  // A one-letter marker is not identity; use name + unit instead.
  const code = resursKodiIshonchlimi(kod) ? normKod(kod) : '';
  const base = code || nb(nom, bir);
  const specs = [...texnikBelgilar(nom)].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(',');
  return specs ? `${base}||${specs}` : base;
}
function resursKodiIshonchlimi(kod: unknown): boolean {
  const k = normKod(kod);
  return !!k && (/[0-9]/.test(k) || k.length >= 2);
}
function lcsNisbat(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const t = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = t;
    }
  }
  return dp[b.length] / Math.max(a.length, b.length);
}

/** Oy-dan-oyga barqaror F2 imzosi (xotira kaliti). */
export function f2Imzo(t: Pick<F2Tugun, 'tur' | 'kod' | 'nom' | 'birlik' | 'yol'>, otaImzo?: string): string {
  const yol = t.yol.map(rzKalit).filter(Boolean).join('/');
  if (t.tur === 'rs') return `${otaImzo ?? yol}>${(resursKodiIshonchlimi(t.kod) ? normKod(t.kod) : '')}|${nb(t.nom, t.birlik)}`;
  return `${yol}|${kodKanon(t.kod) || normKod(t.kod)}|${nb(t.nom, t.birlik)}`;
}

// ─── Smeta indeksi ───────────────────────────────────────────────────────────

interface STugun extends SmetaQator {
  bolalar: STugun[]; ota: STugun | null; yol: string;
  // oldindan hisoblangan kalitlar
  kKod: string; kKanon: string; kNb: string; kTok: string[]; kRaq: string;
  rzZanjir: string[];   // rzKalit lar ildizdan
  rzTok: string[];      // eng yaqin razdel tokenlari
  lokalTok: string[];   // eng yuqori (lokal) razdel tokenlari
  rzList: string[];     // ЛИСТ raqamlari zanjirda
  rzChizma: string[];
  resKalitlar: string[];
  resNorma: Map<string, number>;
}

function smetaIndeksi(qatorlar: readonly SmetaQator[]) {
  const byId = new Map<number, STugun>();
  for (const q of qatorlar) {
    byId.set(q.id, {
      ...q, bolalar: [], ota: null, yol: '', kKod: normKod(q.kod), kKanon: kodKanon(q.kod), kNb: nb(q.nom, q.birlik),
      kTok: tokenlar(q.nom), kRaq: raqamlar(q.nom), rzZanjir: [], rzTok: [], lokalTok: [], rzList: [], rzChizma: [], resKalitlar: [], resNorma: new Map(),
    });
  }
  const tartibli = [...qatorlar].sort((a, b) => (a.tartib ?? a.id) - (b.tartib ?? b.id) || a.id - b.id);
  const ildiz: STugun[] = [];
  for (const q of tartibli) {
    const t = byId.get(q.id)!;
    const ota = q.otaId != null ? byId.get(q.otaId) : undefined;
    if (ota) { t.ota = ota; ota.bolalar.push(t); } else ildiz.push(t);
  }
  const yur = (t: STugun, yol: string, zanjir: STugun[]) => {
    t.yol = yol;
    const rzlar = zanjir;
    t.rzZanjir = rzlar.map((r) => rzKalit(r.nom));
    t.rzTok = rzlar.length ? tokenlar(rzKalit(rzlar[rzlar.length - 1].nom)) : [];
    t.lokalTok = rzlar.length ? tokenlar(rzKalit(rzlar[0].nom)) : [];
    t.rzList = rzlar.map((r) => listRaqamlari(r.nom)).filter(Boolean);
    t.rzChizma = rzlar.flatMap((r) => rzKodlar(r.nom));
    const bu = t.tur === 'rz' ? (yol ? `${yol} › ${t.nom ?? ''}` : String(t.nom ?? '')) : yol;
    const keyingi = t.tur === 'rz' ? [...zanjir, t] : zanjir;
    for (const b of t.bolalar) yur(b, bu, keyingi);
    if (t.tur !== 'rz' && t.bolalar.length) {
      t.resKalitlar = t.bolalar.map((b) => resKalit(b.kod, b.nom, b.birlik));
      for (const b of t.bolalar) if (b.hajm != null && t.hajm) t.resNorma.set(resKalit(b.kod, b.nom, b.birlik), b.hajm / t.hajm);
    }
  };
  for (const t of ildiz) yur(t, '', []);
  const ishlar = [...byId.values()].filter((t) => t.tur !== 'rz' && (t.tur === 'bl' || !t.ota || t.ota.tur === 'rz'));
  const idx = (f: (t: STugun) => string) => {
    const m = new Map<string, STugun[]>();
    for (const t of ishlar) { const k = f(t); if (k) { const a = m.get(k); if (a) a.push(t); else m.set(k, [t]); } }
    return m;
  };
  const tokIdx = new Map<string, STugun[]>();
  for (const t of ishlar) for (const tok of new Set(t.kTok)) if (tok.length >= 4) { const a = tokIdx.get(tok); if (a) a.push(t); else tokIdx.set(tok, [t]); }
  return { byId, ildiz, ishlar, byKod: idx((t) => t.kKod), byKanon: idx((t) => t.kKanon), byNb: idx((t) => t.kNb), tokIdx };
}

// ─── Dvigatel ────────────────────────────────────────────────────────────────

export function f2MoslashV3(f2: readonly F2Tugun[], smeta: readonly SmetaQator[], opts: F2MoslashOpts = {}): F2MoslashNatija {
  const S = smetaIndeksi(smeta);
  const natijalar = new Map<string, F2QatorNatija>();
  const rzDiag: RzDiag[] = [];
  const band = new Set<number>();
  /** Egizaklar tartib bo'yicha TAKLIF bilan band qilgan smeta qatorlari (tasdiqlanmagan). */
  const tartibBand = new Set<number>();
  const AVTO_MIN = opts.avtoMin ?? 75;
  const AVTO_FARQ = opts.avtoFarq ?? 12;
  const barchaRz = [...S.byId.values()].filter((t) => t.tur === 'rz');
  const ajdodmi = (a: STugun, b: STugun) => { for (let t = b.ota; t; t = t.ota) if (t === a) return true; return false; };
  /** Oxirgi bog'langan smeta tartibi (lokal bo'yicha) — tartib bonusi. */
  let oxirgiTartib = -1;

  // ── Razdel doirasi (ierarxik): bonus uchun, qat'iy cheklov emas ──
  type Doira = { rzlar: STugun[] | null; holat: 'global' | 'scoped' | 'unresolved' };
  function doiraTop(rz: F2Tugun, ota: Doira): Doira {
    const qolda = opts.rzBog?.get(rz.uid);
    if (qolda != null && S.byId.get(qolda)) {
      rzDiag.push({ f2Uid: rz.uid, nom: rz.nom, smetaRzIdlar: [qolda], ok: true, usul: 'qolda' });
      return { rzlar: [S.byId.get(qolda)!], holat: 'scoped' };
    }
    const nomzod = ota.rzlar ? barchaRz.filter((s) => ota.rzlar!.some((o) => ajdodmi(o, s))) : barchaRz;
    const k = rzKalit(rz.nom);
    let mos = k ? nomzod.filter((s) => rzKalit(s.nom) === k) : [];
    let usul = 'nom';
    if (!mos.length) {
      const kodlar = new Set(rzKodlar(rz.nom));
      if (kodlar.size) { mos = nomzod.filter((s) => rzKodlar(s.nom).some((x) => kodlar.has(x))); usul = 'chizma_kodi'; }
    }
    if (!mos.length && k) {
      const ft = tokenlar(rzKalit(rz.nom));
      const ball = nomzod.map((s) => ({ s, d: dice(ft, tokenlar(rzKalit(s.nom))) })).filter((x) => x.d >= 0.75).sort((a, b) => b.d - a.d);
      if (ball.length) { mos = ball.filter((x) => x.d >= ball[0].d - 0.01).map((x) => x.s); usul = 'nom_oxshash'; }
    }
    if (mos.length > 1) {
      // F2 razdeli bir nechta varaqni qamrashi mumkin ("ЛИСТ.-8,9,15") — to'plam bo'yicha.
      const lr = new Set(listRaqamlari(rz.nom).split(',').filter(Boolean));
      const aniq = lr.size ? mos.filter((s) => listRaqamlari(s.nom).split(',').some((x) => lr.has(x))) : [];
      if (aniq.length) { mos = aniq; usul += '+list'; }
    }
    if (mos.length > 1) mos = mos.filter((s) => !mos.some((b) => b !== s && ajdodmi(s, b)));
    if (!mos.length) {
      rzDiag.push({ f2Uid: rz.uid, nom: rz.nom, smetaRzIdlar: [], ok: false, usul: 'ota_doirasi' });
      // An unmatched heading is a real scope ambiguity even when its parent
      // matched: sibling subsections may contain duplicate work codes. A later
      // child heading can resolve the scope again; otherwise require an
      // explicit operator section link instead of falling back to its parent.
      return { rzlar: ota.rzlar, holat: 'unresolved' };
    }
    rzDiag.push({ f2Uid: rz.uid, nom: rz.nom, smetaRzIdlar: mos.map((s) => s.id), ok: true, usul });
    return { rzlar: mos, holat: 'scoped' };
  }
  const doiradami = (d: Doira, t: STugun) => !!d.rzlar && d.rzlar.some((r) => ajdodmi(r, t));

  // ── Qavatma-qavat ball ──
  function ballHisobla(f: F2Tugun, t: STugun, d: Doira): Nomzod {
    const q: Qavat[] = [];
    const lineSpecConflicts = texnikTafsilotFarqlari(f.nom, t.nom);
    // 1. Razdel
    let rz = 0;
    const fYol = f.yol.map(rzKalit).filter(Boolean);
    const fYaqin = fYol.length ? tokenlar(fYol[fYol.length - 1]) : [];
    const fLokal = fYol.length ? tokenlar(fYol[0]) : [];
    if (doiradami(d, t)) rz += 8;
    const dYaqin = dice(fYaqin, t.rzTok);
    rz += Math.round(dYaqin * 8);
    const dLokal = fLokal.length ? Math.max(...t.rzZanjir.map((z) => dice(fLokal, tokenlar(z))), 0) : 0;
    rz += Math.round(dLokal * 5);
    const fList = new Set(f.yol.flatMap((y) => listRaqamlari(y).split(',')).filter(Boolean));
    if (fList.size && t.rzList.some((l) => l.split(',').some((x) => fList.has(x)))) rz += 4;
    const fCh = new Set(f.yol.flatMap((y) => rzKodlar(y)));
    if (fCh.size && t.rzChizma.some((c) => fCh.has(c))) rz += 3;
    rz = Math.min(rz, 25);
    q.push({ nom: 'razdel', ball: rz, izoh: rz >= 15 ? 'razdel ✓' : rz >= 6 ? 'razdel ≈' : 'razdel ✗' });
    // 2. Shifr
    const fk = normKod(f.kod), fkan = kodKanon(f.kod);
    const sh = fk && t.kKod === fk ? 25 : fkan && t.kKanon === fkan ? 18 : 0;
    q.push({ nom: 'shifr', ball: sh, izoh: sh === 25 ? 'shifr ✓' : sh ? 'shifr ≈ (kanon)' : f.kod ? 'shifr ✗' : 'shifr —' });
    // 3. Nom
    let nm = 0;
    if (normNom(f.nom) === normNom(t.nom)) nm = 20;
    else if (raqamlar(f.nom) === t.kRaq) nm = Math.round(dice(tokenlar(f.nom), t.kTok) * 15);
    q.push({ nom: 'nom', ball: nm, izoh: nm === 20 ? 'nom ✓' : nm >= 10 ? 'nom ≈' : 'nom ✗' });
    // 4. Birlik — qalqon
    const bm = birMos(f.birlik, t.birlik);
    q.push({ nom: 'birlik', ball: bm ? 0 : -100, izoh: bm ? 'birlik ✓' : `birlik ✗ (${f.birlik ?? '?'} ↔ ${t.birlik ?? '?'})` });
    // 5. Resurslar
    let rs = 0; let rIzoh = 'resurslar —';
    if (f.bolalar.length && t.resKalitlar.length) {
      const fk2 = f.bolalar.map((r) => resKalit(r.kod, r.nom, r.birlik));
      const A = new Set(fk2), B = new Set(t.resKalitlar);
      const kesish = [...A].filter((x) => B.has(x));
      const jac = kesish.length / new Set([...A, ...B]).size;
      let normaTeng = 0;
      for (const r of f.bolalar) {
        const k = resKalit(r.kod, r.nom, r.birlik);
        const sn = t.resNorma.get(k);
        if (sn != null && r.norma != null && Math.abs(sn - r.norma) <= Math.max(Math.abs(r.norma) * 0.01, 1e-6)) normaTeng++;
      }
      rs = Math.round(jac * 15 + (normaTeng / Math.max(f.bolalar.length, 1)) * 7 + lcsNisbat(fk2, t.resKalitlar) * 3);
      rIzoh = `resurslar ${kesish.length}/${Math.max(A.size, B.size)}${normaTeng ? `, norma ${normaTeng}` : ''}`;
    } else if (f.bolalar.length && !t.resKalitlar.length) { rs = -5; rIzoh = 'smetada resurssiz'; }
    q.push({ nom: 'resurslar', ball: rs, izoh: rIzoh });
    // 6. Hajm — ENG OXIRGI va eng kuchsiz qavat (egasi, 2026-09-25): F2 ko'pincha ishning bir
    //    qismini oladi, shuning uchun hajm hech qachon jarima bermaydi — faqat teng nomzodlarni
    //    ajratadi. Qoldiqdan oshsa — ball emas, ogohlantirish (o'ng oynada qizil qoldiq).
    let hj = 0; let hIzoh = 'hajm —';
    const chegara = opts.qoldiq?.get(t.id) ?? t.hajm;
    if (f.hajm != null && chegara != null) {
      if (t.hajm != null && t.hajm !== 0 && Math.abs(f.hajm - t.hajm) <= Math.abs(t.hajm) * 0.005) { hj = 2; hIzoh = 'hajm = smeta'; }
      else if (chegara > 0 && f.hajm <= chegara * 1.001) { hj = 1; hIzoh = 'hajm ≤ qoldiq'; }
      else { hIzoh = `⚠ hajm > qoldiq (${f.hajm} > ${+chegara.toFixed(4)})`; }
    }
    q.push({ nom: 'hajm', ball: hj, izoh: hIzoh });
    // Marka farqi, tartib
    if (gradeFarq(f.nom, t.nom)) q.push({ nom: 'marka', ball: -30, izoh: 'marka farqli — ehtimoliy zamena' });
    const resourceSpecConflicts = new Set<string>();
    for (const fr of f.bolalar) {
      const fkRes = resursKodiIshonchlimi(fr.kod) ? normKod(fr.kod) : '';
      if (!fkRes) continue;
      for (const sr of t.bolalar) {
        if (normKod(sr.kod) !== fkRes || !birMos(fr.birlik, sr.birlik)) continue;
        for (const label of texnikTafsilotFarqlari(fr.nom, sr.nom)) resourceSpecConflicts.add(label);
      }
    }
    const specConflicts = [...new Set([...lineSpecConflicts, ...resourceSpecConflicts])];
    if (specConflicts.length) q.push({
      nom: 'texnik_tafsilot', ball: -100,
      izoh: `texnik spetsifikatsiya farqli (${specConflicts.join(', ')}) — avtomatik bog‘lash bloklandi`,
    });
    if (oxirgiTartib >= 0 && (t.tartib ?? t.id) > oxirgiTartib) q.push({ nom: 'tartib', ball: 2, izoh: 'tartib ✓' });
    const ball = q.reduce((s, x) => s + x.ball, 0);
    return { qatorId: t.id, ball, yol: t.yol, qavatlar: q, sabab: q.filter((x) => x.nom !== 'tartib').map((x) => x.izoh) };
  }

  function nomzodHovuz(f: F2Tugun): STugun[] {
    const out = new Set<STugun>();
    const qosh = (a?: STugun[]) => a?.forEach((t) => out.add(t));
    const fk = normKod(f.kod), fkan = kodKanon(f.kod);
    if (fk) qosh(S.byKod.get(fk));
    if (fkan) qosh(S.byKanon.get(fkan));
    qosh(S.byNb.get(nb(f.nom, f.birlik)));
    if (out.size < 3) {
      // Noyob so'zlar (≥4 harf) — kamida 2 tasi umumiy nomzodlar, doira ichidagilar ustun.
      const hisob = new Map<STugun, number>();
      for (const tok of new Set(tokenlar(f.nom))) {
        const a = S.tokIdx.get(tok);
        if (!a || a.length > 400) continue;
        for (const t of a) hisob.set(t, (hisob.get(t) ?? 0) + 1);
      }
      [...hisob.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 60).forEach(([t]) => out.add(t));
    }
    return [...out].filter((t) => !band.has(t.id) && f2TuriMos(f, t));
  }

  // T1 processStandalone: mustaqil resurs faqat barg qatorga boradi. T2
  // canonical qator turi esa aniq: explicit marker bo'lsa aynan shu tur; eski,
  // markersiz F2 da `rs` umumiy resurs deb olinadi. Markerli BL hech qachon
  // MAT/OB bilan almashtirilmaydi. Markersiz tarixiy BL leaf fallback saqlanadi.
  function f2TuriMos(f: F2Tugun, t: STugun): boolean {
    if (f.tur === 'bl') return t.tur === 'bl' || (!f.texnikBelgi && t.tur !== 'rz' && !t.bolalar.length);
    const belgiTuri = f.texnikBelgi?.replace(/[+~]$/, '').toLowerCase();
    if (belgiTuri) return t.tur === belgiTuri;
    return t.tur === 'rs' || t.tur === 'mat' || t.tur === 'ob';
  }

  function yoz(uid: string, n: F2QatorNatija) {
    natijalar.set(uid, n);
    if (n.qatorId != null) {
      band.add(n.qatorId);
      const t = S.byId.get(n.qatorId);
      if (t && (n.holat === 'aniq' || n.holat === 'xotira' || n.usul === 'tartib')) oxirgiTartib = t.tartib ?? t.id;
      if (n.usul === 'tartib') tartibBand.add(n.qatorId);
    }
  }

  function ishniMosla(f: F2Tugun, d: Doira, otaImzo: string): STugun | null {
    const imzo = f2Imzo(f, otaImzo);
    const x = opts.xotira?.get(imzo);
    const xt = x != null ? S.byId.get(x) : undefined;
    // Tasdiqlangan xotira kuchli dalil, lekin joriy importning qator turi,
    // birlik va tanlangan canonical razdel chegarasini chetlab o'tmaydi.
    if (xt && !band.has(xt.id) && birMos(f.birlik, xt.birlik)
      && f2TuriMos(f, xt) && (!d.rzlar || doiradami(d, xt))) {
      yoz(f.uid, { uid: f.uid, holat: 'xotira', qatorId: xt.id, usul: 'xotira', nomzodlar: [], sabab: 'o‘tgan oylarda tasdiqlangan bog‘lanish' });
      return xt;
    }
    // Tizim1: doira ichida nomzod bo'lsa — faqat doira; global faqat doira bo'sh bo'lsa.
    const hovuz = nomzodHovuz(f);
    const ichida = d.rzlar ? hovuz.filter((t) => doiradami(d, t)) : [];
    const nz = (ichida.length ? ichida : hovuz).map((t) => ballHisobla(f, t, d))
      .sort((a, b) => b.ball - a.ball || (S.byId.get(a.qatorId)!.tartib ?? a.qatorId) - (S.byId.get(b.qatorId)!.tartib ?? b.qatorId)).slice(0, 12);
    const [b1, b2] = nz;
    const toza = (n: Nomzod) => {
      if (n.qavatlar.some((q) => (q.nom === 'birlik' || q.nom === 'marka' || q.nom === 'texnik_tafsilot') && q.ball < 0)) return false;
      const target = S.byId.get(n.qatorId);
      // Legacy F2 rows without a row-type marker may be offered against any
      // canonical leaf for review, but a work row must not auto-certify as MAT/OB.
      if (f.tur === 'bl' && !f.texnikBelgi && target?.tur !== 'bl') return false;
      return true;
    };
    // Egasi sinovi 2026-09-28: F2 razdeli smetadagi razdelga ANIQ bog'langan-u, shu razdel ichida
    // nomzod yo'q — boshqa razdeldan (masalan fasad paroizolyatsiyasiga POL paroizolyatsiyasi)
    // taklif BERILMAYDI: bu zamena yoki qo'shimcha ish. Tashqi nomzodlar faqat variant sifatida.
    if (d.rzlar && !ichida.length) {
      const rzNom = d.rzlar.map((r) => r.nom).filter(Boolean).join(' / ');
      yoz(f.uid, { uid: f.uid, holat: 'topilmadi', qatorId: null, nomzodlar: nz,
        sabab: `smetaning «${rzNom}» razdelida mos ish yo‘q — zamena (shu razdeldagi ish o‘rniga) yoki qo‘shimcha ish${nz.length ? `; boshqa razdellarda ${nz.length} ta o‘xshash bor (variantlar)` : ''}` });
      return null;
    }
    if (d.holat === 'unresolved') {
      yoz(f.uid, { uid: f.uid, holat: 'topilmadi', qatorId: null, nomzodlar: nz,
        sabab: 'F2 bo‘limi smeta bo‘limiga hali bog‘lanmagan — avval bo‘limni o‘ngdagi mos RZga ulang; boshqa bo‘limdan avtomatik tanlanmadi' });
      return null;
    }
    // Razdel ichida nomi va birligi AYNAN bir xil yagona qator (masalan «С БЛОКИ ДВЕРНЫЕ ПВХ») — ✓.
    if (ichida.length) {
      const aynan = nz.filter((n) => toza(n) && normNom(S.byId.get(n.qatorId)!.nom) === normNom(f.nom) && normBir(S.byId.get(n.qatorId)!.birlik) === normBir(f.birlik));
      if (aynan.length === 1) {
        const t = S.byId.get(aynan[0].qatorId)!;
        const egizakBor = [...tartibBand].some((id) => { const e = S.byId.get(id); return !!e && e.id !== t.id && e.kNb === t.kNb; });
        if (!egizakBor) {
          yoz(f.uid, { uid: f.uid, holat: 'aniq', qatorId: t.id, usul: 'nom_aynan', nomzodlar: nz, sabab: 'o‘sha razdelda nomi va birligi aynan bir xil yagona qator' });
          return t;
        }
      }
    }
    // EGIZAKLAR (Tizim1 `ekvivmi` → birinchi bo'sh): eng yuqori ballli nomzodlar shifr, nom,
    // birlik va resurs tarkibi bo'yicha AYNAN bir xil bo'lsa — qaysi biri ekani ma'lumotdan
    // ajralmaydi; F2 tartibi smeta tartibiga tekislanadi (nz tartib bo'yicha saralangan).
    if (b1 && b2 && toza(b1) && b1.ball >= AVTO_MIN && b1.ball - b2.ball < AVTO_FARQ) {
      const t1 = S.byId.get(b1.qatorId)!;
      const egizak = (n: Nomzod) => { const t = S.byId.get(n.qatorId)!; return t.kKod === t1.kKod && t.kNb === t1.kNb && t.resKalitlar.join() === t1.resKalitlar.join(); };
      const teng = nz.filter((n) => b1.ball - n.ball < AVTO_FARQ);
      if (teng.every(egizak) && teng.every((n) => n.ball === b1.ball)) {
        // Arxitektura (F2_IMPORT_V3 §2) + Codex tekshiruvi 2026-09-28: 'aniq' faqat yagona nomzodda.
        // Egizaklarda tartib bo'yicha birinchi bo'shi OLDINDAN TANLANADI, lekin ◐ taklif — operator
        // tasdiqlaydi (bir bosishda hammasini tasdiqlash bor). Jim avto-tasdiq yo'q.
        yoz(f.uid, { uid: f.uid, holat: 'taklif', qatorId: b1.qatorId, usul: 'tartib', nomzodlar: nz, sabab: `bir xil ish ${teng.length} joyda (shifr, nom, birlik, resurslar teng) — tartib bo‘yicha taklif, tasdiqlang` });
        return t1;
      }
    }
    const egizakTaklifBand = (qid: number) => {
      const t = S.byId.get(qid)!;
      for (const id of tartibBand) {
        const e = S.byId.get(id);
        if (e && e.id !== t.id && e.kKod === t.kKod && e.kNb === t.kNb && e.resKalitlar.join() === t.resKalitlar.join()) return true;
      }
      return false;
    };
    if (b1 && toza(b1) && b1.ball >= AVTO_MIN && egizakTaklifBand(b1.qatorId)) {
      yoz(f.uid, { uid: f.uid, holat: 'taklif', qatorId: b1.qatorId, usul: 'tartib', nomzodlar: nz, sabab: `bir xil ish boshqa joyda ham bor va u hali tasdiqlanmagan — tartib bo‘yicha taklif, tasdiqlang` });
      return S.byId.get(b1.qatorId)!;
    }
    if (b1 && toza(b1) && b1.ball >= AVTO_MIN && (!b2 || b1.ball - b2.ball >= AVTO_FARQ)) {
      yoz(f.uid, { uid: f.uid, holat: 'aniq', qatorId: b1.qatorId, usul: 'ball', nomzodlar: nz, sabab: `${b1.ball} ball: ${b1.sabab.join(', ')}` });
      return S.byId.get(b1.qatorId)!;
    }
    // Hal qiluvchi dalil: F2 hajmi aynan b1 ning smeta hajmiga teng, qolganlariniki emas —
    // PTO shu ishni to'liq yopgan (bu tasodif bo'lishi ehtimoli juda past).
    const hajmTeng = (n?: Nomzod) => !!n?.qavatlar.some((q) => q.nom === 'hajm' && q.ball === 2);
    if (b1 && toza(b1) && b1.ball >= AVTO_MIN && hajmTeng(b1) && nz.slice(1).every((n) => !hajmTeng(n) && b1.ball > n.ball)) {
      yoz(f.uid, { uid: f.uid, holat: 'aniq', qatorId: b1.qatorId, usul: 'hajm_aynan', nomzodlar: nz, sabab: `${b1.ball} ball, F2 hajmi aynan shu qatorning smeta hajmiga teng: ${b1.sabab.join(', ')}` });
      return S.byId.get(b1.qatorId)!;
    }
    // Legacy work rows can lack a trustworthy BL/MAT/OB marker. Preserve a
    // unique exact cross-type candidate as an explicit operator proposal, never
    // as an automatic link (e.g. a work label matching a canonical equipment row).
    if (f.tur === 'bl' && !f.texnikBelgi && b1 && S.byId.get(b1.qatorId)?.tur !== 'bl'
      && normNom(S.byId.get(b1.qatorId)!.nom) === normNom(f.nom)
      && normBir(S.byId.get(b1.qatorId)!.birlik) === normBir(f.birlik)
      && (!b2 || b1.ball > b2.ball)) {
      const target = S.byId.get(b1.qatorId)!;
      yoz(f.uid, { uid: f.uid, holat: 'taklif', qatorId: target.id, usul: 'ball', nomzodlar: nz,
        sabab: `legacy F2 qator turi aniqlanmagan; nomi va birligi aynan mos ${target.tur.toUpperCase()} nomzodi — operator tekshiruvi shart` });
      return target;
    }
    if (b1 && toza(b1) && b1.ball >= 45) {
      const izoh = b2 && b1.ball - b2.ball < AVTO_FARQ ? `2 ta nomzod yaqin (${b1.ball} va ${b2.ball})` : `${b1.ball} ball`;
      yoz(f.uid, { uid: f.uid, holat: 'taklif', qatorId: b1.qatorId, usul: 'ball', nomzodlar: nz, sabab: `${izoh}: ${b1.sabab.join(', ')} — tasdiqlang` });
      return S.byId.get(b1.qatorId)!;
    }
    const sab = !nz.length ? 'smetada mos shifr/nom yo‘q — qo‘shimcha ish yoki zamena'
      : !toza(nz[0]) ? `eng yaqin nomzod: ${nz[0].sabab.filter((s) => s.includes('✗') || s.includes('farqli')).join(', ')} — qo‘lda tekshiring (zamena bo‘lishi mumkin)`
        : `${nz.length} ta nomzod, eng yuqori ${nz[0].ball} ball — qo‘lda tanlang yoki qo‘shimcha/zamena`;
    yoz(f.uid, { uid: f.uid, holat: 'topilmadi', qatorId: null, nomzodlar: nz, sabab: sab });
    return null;
  }

  /** Resurslar faqat bog'langan ish ichida (Tizim1). Topilmasa — zamena material/qo'shimcha resurs. */
  function resurslarniMosla(fIsh: F2Tugun, sIsh: STugun | null, otaImzo: string) {
    for (const r of fIsh.bolalar) {
      if (!sIsh) {
        yoz(r.uid, { uid: r.uid, holat: 'topilmadi', qatorId: null, nomzodlar: [], sabab: 'ishi bog‘lanmagan — ish hal qilinganda resurs ham hal bo‘ladi' });
        continue;
      }
      const markerTuri = r.texnikBelgi?.replace(/[+~]$/, '').toLowerCase();
      const ichki = sIsh.bolalar.filter((t) =>
        (t.tur === 'rs' || t.tur === 'mat' || t.tur === 'ob')
        && (!markerTuri || t.tur === markerTuri)
        && !band.has(t.id));
      const x = opts.xotira?.get(f2Imzo(r, otaImzo));
      if (x != null && ichki.some((t) => t.id === x)) {
        yoz(r.uid, { uid: r.uid, holat: 'xotira', qatorId: x, usul: 'xotira', nomzodlar: [], sabab: 'o‘tgan oylarda tasdiqlangan' });
        continue;
      }
      const codeIsIdentity = resursKodiIshonchlimi(r.kod);
      const rk = codeIsIdentity ? normKod(r.kod) : '', rkan = codeIsIdentity ? kodKanon(r.kod) : '', rnb = nb(r.nom, r.birlik);
      let topildi: STugun | null = null; let usul = '';
      for (const [u, c] of [
        ['kod', rk ? ichki.filter((t) => t.kKod === rk) : []],
        ['kanon', rkan ? ichki.filter((t) => t.kKanon === rkan) : []],
        ['nomBir', ichki.filter((t) => t.kNb === rnb)],
      ] as Array<[string, STugun[]]>) {
        if (c.length === 1) { topildi = c[0]; usul = u; break; }
      }
      if (topildi && birMos(r.birlik, topildi.birlik) && !gradeFarq(r.nom, topildi.nom)) {
        yoz(r.uid, { uid: r.uid, holat: 'aniq', qatorId: topildi.id, usul: `ish_ichida:${usul}`, nomzodlar: [], sabab: 'ish ichida yagona' });
        continue;
      }
      const nz: Nomzod[] = ichki.map((t) => {
        const qv: Qavat[] = [];
        const kb = rk && t.kKod === rk ? 30 : 0;
        qv.push({ nom: 'shifr', ball: kb, izoh: kb ? 'kod ✓' : 'kod ✗' });
        const nmb = Math.round(dice(tokenlar(r.nom), t.kTok) * 25);
        qv.push({ nom: 'nom', ball: nmb, izoh: `nom ${Math.round(nmb * 4)}%` });
        const bmb = birMos(r.birlik, t.birlik);
        qv.push({ nom: 'birlik', ball: bmb ? 10 : -40, izoh: bmb ? 'birlik ✓' : 'birlik ✗' });
        const ball = qv.reduce((s, y) => s + y.ball, 0);
        return { qatorId: t.id, ball, yol: t.yol, qavatlar: qv, sabab: qv.map((y) => y.izoh) };
      })
        // A shared unit alone (for example Т) is not matching evidence. Do not
        // send unrelated materials to the operator as plausible suggestions.
        .filter((n) => n.qavatlar.some((q) => q.nom === 'shifr' && q.ball > 0)
          || n.qavatlar.some((q) => q.nom === 'nom' && q.ball > 0))
        .sort((a, b) => b.ball - a.ball).slice(0, 8);
      yoz(r.uid, { uid: r.uid, holat: 'topilmadi', qatorId: null, nomzodlar: nz, sabab: topildi ? 'birlik yoki marka farqli — zamena material bo‘lishi mumkin' : 'smeta ishida bu resurs yo‘q — zamena material yoki qo‘shimcha resurs' });
    }
  }

  function yur(tugunlar: readonly F2Tugun[], d: Doira) {
    for (const t of tugunlar) {
      if (t.tur === 'rz') { yur(t.bolalar, doiraTop(t, d)); continue; }
      const s = ishniMosla(t, d, t.yol.map(rzKalit).join('/'));
      if (t.tur === 'bl') resurslarniMosla(t, s, f2Imzo(t));
    }
  }
  yur(f2, { rzlar: null, holat: 'global' });

  const stat = { aniq: 0, xotira: 0, taklif: 0, topilmadi: 0 };
  for (const n of natijalar.values()) stat[n.holat]++;
  return { natijalar, rzDiag, stat };
}
