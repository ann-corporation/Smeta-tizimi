/**
 * Mindmap ko‘rinishi — «Kompaniya xaritasi» (egasi 2026-10-25: rahbar panelida mindmapga urg‘u, ko‘rgan odam
 * ishlar holatini darhol tushunsin). Bu fayl SOF hisob: `t2_mindmap_grafi` javobidan (MindmapGraf) ierarxiya
 * Kompaniya → Loyiha → Obyekt quriladi, har tugunga real holat (smeta / fakt / F2, belgilar) yig‘iladi va
 * ikki tomonlama (mindmap) yoki radial joylashuv hisoblanadi. Server chaqiruvi va yozish yo‘q.
 *
 * Qoidalar: noma’lum qiymat 0 emas — `null` (smeta yuklanmagan obyekt foizi yo‘q); jamlanma qisman bo‘lsa
 * `smetaToliq=false` bilan aniq aytiladi. Pul — serverdagi ustamasiz (rz qatorlar yig‘indisi) qiymat.
 */
import type { MindmapBelgi, MindmapGraf, MindmapTugun, TugunTur } from '../api/t2-mindmap';
import { qidiruvdaBor } from '../i18n/lotin-kirill';

export type XHolat = 'xavf' | 'etibor' | 'yaxshi' | 'nomalum';
export const HOLAT_TARTIB: XHolat[] = ['xavf', 'etibor', 'yaxshi', 'nomalum'];
const HOLAT_OGIRLIK: Record<XHolat, number> = { xavf: 0, etibor: 1, nomalum: 2, yaxshi: 3 };

export type XTur = 'kompaniya' | 'loyiha' | 'obyekt' | 'guruh';
export type ResursSanoq = { shartnoma: number; sklad: number; texnika: number; kadr: number; kontragent: number };
export type HolatSanoq = Record<XHolat, number>;

export type XTugun = {
  id: string;
  tur: XTur;
  /** Real nom; `guruh` (loyihasiz obyektlar) uchun bo‘sh — UI tarjima qiladi. */
  nom: string;
  manba: MindmapTugun | null;
  ota: string | null;
  bolalar: string[];
  daraja: 0 | 1 | 2;
  /** Mindmap tomoni: 1 — o‘ng, -1 — chap, 0 — markaz. */
  tomon: -1 | 0 | 1;
  holat: XHolat;
  /** Ustamasiz smeta. `null` — hech bir obyektda smeta yo‘q (0 emas). */
  smeta: number | null;
  /** Jamlanmadagi barcha obyektlarning smetasi ma’lummi. */
  smetaToliq: boolean;
  fakt: number | null;
  f2: number | null;
  faktFoiz: number | null;
  f2Foiz: number | null;
  belgilar: MindmapBelgi[];
  /** Ochiq zayavkalar soni (`null` — manba yo‘q). */
  zayavka: number | null;
  narxsiz: number | null;
  obyektSoni: number;
  holatSanoq: HolatSanoq;
  resurs: ResursSanoq;
  /** Smetadan oshgan (fakt yoki F2 > 100%). */
  oshgan: boolean;
};

export type XDaraxt = {
  ildiz: string;
  tugunlar: Map<string, XTugun>;
  /** Chizish tartibi: ildiz, loyihalar, obyektlar. */
  tartib: string[];
  /** Hech bir obyekt/loyihaga biriktirilmagan resurslar. */
  biriktirilmagan: ResursSanoq;
  maxSmeta: number;
};

const bosResurs = (): ResursSanoq => ({ shartnoma: 0, sklad: 0, texnika: 0, kadr: 0, kontragent: 0 });
const bosHolat = (): HolatSanoq => ({ xavf: 0, etibor: 0, yaxshi: 0, nomalum: 0 });
const son = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Qism / jami foizi; jami noma’lum yoki 0 bo‘lsa — `null` (yolg‘on «0%» yo‘q). */
export function foiz(qism: number | null | undefined, jami: number | null | undefined): number | null {
  if (qism == null || jami == null || !Number.isFinite(qism) || !Number.isFinite(jami) || jami <= 0) return null;
  return Math.round((qism / jami) * 1000) / 10;
}

export function belgilariOl(t: MindmapTugun | null | undefined): MindmapBelgi[] {
  const b = t?.meta?.belgi;
  return Array.isArray(b) ? (b as MindmapBelgi[]) : [];
}

/** Obyekt holati faqat real belgilardan: `ogoh` (narxsiz, ko‘zgu, smeta yo‘q) — xavf; zayavka yoki smetadan oshish — e’tibor. */
export function obyektHolati(t: MindmapTugun): XHolat {
  if (!t.meta) return 'nomalum';
  const b = belgilariOl(t);
  if (b.some((x) => x.daraja === 'ogoh')) return 'xavf';
  const fk = son(t.meta.fakt_foiz), f2 = son(t.meta.f2_foiz);
  if (b.length > 0 || (fk != null && fk > 100) || (f2 != null && f2 > 100)) return 'etibor';
  return 'yaxshi';
}

/** Bir nechta holatdan eng og‘iri (bo‘sh bo‘lsa — nomalum). */
export function ogirHolat(s: HolatSanoq): XHolat {
  if (s.xavf) return 'xavf';
  if (s.etibor) return 'etibor';
  if (s.yaxshi) return 'yaxshi';
  return 'nomalum';
}

function yigindi(qiymatlar: (number | null)[]): { jami: number | null; toliq: boolean } {
  let jami: number | null = null; let toliq = qiymatlar.length > 0;
  for (const v of qiymatlar) {
    if (v == null) { toliq = false; continue; }
    jami = (jami ?? 0) + v;
  }
  return { jami, toliq };
}

const LOYIHASIZ = 'guruh:loyihasiz';

/** MindmapGraf → Kompaniya → Loyiha → Obyekt daraxti, real holat bilan. */
export function daraxtQur(graf: MindmapGraf): XDaraxt {
  const tugunlar = new Map<string, XTugun>();
  const byId = new Map(graf.tugunlar.map((t) => [t.id, t]));
  const kompaniya = graf.tugunlar.find((t) => t.tur === 'kompaniya') ?? null;
  const ildiz = kompaniya?.id ?? 'kompaniya:0';

  const yangi = (id: string, tur: XTur, nom: string, manba: MindmapTugun | null, ota: string | null, daraja: 0 | 1 | 2): XTugun => ({
    id, tur, nom, manba, ota, bolalar: [], daraja, tomon: 0, holat: 'nomalum',
    smeta: null, smetaToliq: false, fakt: null, f2: null, faktFoiz: null, f2Foiz: null,
    belgilar: [], zayavka: null, narxsiz: null, obyektSoni: 0, holatSanoq: bosHolat(), resurs: bosResurs(), oshgan: false,
  });
  tugunlar.set(ildiz, yangi(ildiz, 'kompaniya', kompaniya?.nom ?? '', kompaniya, null, 0));

  // Obyekt → loyiha: avval bog‘lanish (obyekt_loyiha), keyin meta.loyiha_id.
  const obyektLoyiha = new Map<string, string>();
  for (const b of graf.bogichlar) if (b.tur === 'obyekt_loyiha' && byId.has(b.manba) && byId.get(b.maqsad)?.tur === 'obyekt') obyektLoyiha.set(b.maqsad, b.manba);

  const loyihalar = graf.tugunlar.filter((t) => t.tur === 'loyiha');
  for (const l of loyihalar) {
    const x = yangi(l.id, 'loyiha', l.nom, l, ildiz, 1);
    x.belgilar = belgilariOl(l);
    tugunlar.set(l.id, x);
  }
  const obyektlar = graf.tugunlar.filter((t) => t.tur === 'obyekt');
  for (const o of obyektlar) {
    let ota = obyektLoyiha.get(o.id);
    const metaLoyiha = son(o.meta?.loyiha_id);
    if (!ota && metaLoyiha != null && tugunlar.has('loyiha:' + metaLoyiha)) ota = 'loyiha:' + metaLoyiha;
    if (!ota) {
      if (!tugunlar.has(LOYIHASIZ)) tugunlar.set(LOYIHASIZ, yangi(LOYIHASIZ, 'guruh', '', null, ildiz, 1));
      ota = LOYIHASIZ;
    }
    const m = o.meta;
    const x = yangi(o.id, 'obyekt', o.nom, o, ota, 2);
    x.smeta = son(m?.smeta);
    if (x.smeta === 0) x.smeta = null; // smeta 0 — yuklanmagan; foiz ham yo‘q
    x.smetaToliq = x.smeta != null;
    x.fakt = son(m?.fakt);
    x.f2 = son(m?.f2);
    x.faktFoiz = son(m?.fakt_foiz) ?? foiz(x.fakt, x.smeta);
    x.f2Foiz = son(m?.f2_foiz) ?? foiz(x.f2, x.smeta);
    x.belgilar = belgilariOl(o);
    x.zayavka = son(m?.zayavka);
    x.narxsiz = son(m?.narxsiz);
    x.holat = obyektHolati(o);
    x.oshgan = (x.faktFoiz ?? 0) > 100 || (x.f2Foiz ?? 0) > 100;
    x.obyektSoni = 1;
    x.holatSanoq[x.holat] = 1;
    tugunlar.set(o.id, x);
  }

  // Resurslar: obyektga (sklad/texnika/kadr/shartnoma) yoki loyihaga (shartnoma, kontragent) bog‘langan.
  const biriktirilmagan = bosResurs();
  const bogliResurs = new Set<string>();
  const RESURS_TUR: Partial<Record<TugunTur, keyof ResursSanoq>> = { shartnoma: 'shartnoma', sklad: 'sklad', texnika: 'texnika', kadr: 'kadr', kontragent: 'kontragent' };
  const sanalgan = new Set<string>();
  for (const b of graf.bogichlar) {
    const a = byId.get(b.manba), c = byId.get(b.maqsad);
    if (!a || !c) continue;
    for (const [res, joy] of [[a, c], [c, a]] as const) {
      const kalit = RESURS_TUR[res.tur];
      const nishon = tugunlar.get(joy.id);
      if (!kalit || !nishon || (nishon.tur !== 'obyekt' && nishon.tur !== 'loyiha')) continue;
      bogliResurs.add(res.id);
      const k = res.id + '>' + joy.id;
      if (sanalgan.has(k)) continue;
      sanalgan.add(k);
      nishon.resurs[kalit] += 1;
    }
  }
  for (const t of graf.tugunlar) {
    const kalit = RESURS_TUR[t.tur];
    if (kalit && !bogliResurs.has(t.id)) biriktirilmagan[kalit] += 1;
  }

  // Bolalar va tartib.
  const turSort = (a: XTugun, b: XTugun) => HOLAT_OGIRLIK[a.holat] - HOLAT_OGIRLIK[b.holat] || (b.smeta ?? -1) - (a.smeta ?? -1) || a.nom.localeCompare(b.nom);
  const otaTugunlar = [...tugunlar.values()].filter((x) => x.daraja === 1);
  for (const o of [...tugunlar.values()].filter((x) => x.daraja === 2).sort(turSort)) tugunlar.get(o.ota!)!.bolalar.push(o.id);

  // Loyiha / guruh / kompaniya jamlanmasi.
  const jamla = (x: XTugun, bolalar: XTugun[]) => {
    const s = yigindi(bolalar.map((b) => b.smeta));
    x.smeta = s.jami; x.smetaToliq = s.toliq;
    x.fakt = bolalar.length ? yigindi(bolalar.map((b) => b.fakt)).jami : null;
    x.f2 = bolalar.length ? yigindi(bolalar.map((b) => b.f2)).jami : null;
    // Foiz faqat smetasi ma’lum obyektlar bo‘yicha (smetasiz obyektning fakti maxrajsiz qo‘shilmaydi).
    const maLum = bolalar.filter((b) => b.smeta != null);
    x.faktFoiz = foiz(yigindi(maLum.map((b) => b.fakt)).jami, x.smeta);
    x.f2Foiz = foiz(yigindi(maLum.map((b) => b.f2)).jami, x.smeta);
    x.obyektSoni = bolalar.reduce((n, b) => n + b.obyektSoni, 0);
    x.holatSanoq = bosHolat();
    for (const b of bolalar) for (const h of HOLAT_TARTIB) x.holatSanoq[h] += b.holatSanoq[h];
    const z = bolalar.map((b) => b.zayavka).filter((v): v is number => v != null);
    x.zayavka = z.length ? z.reduce((a, b) => a + b, 0) : null;
    const nz = bolalar.map((b) => b.narxsiz).filter((v): v is number => v != null);
    x.narxsiz = nz.length ? nz.reduce((a, b) => a + b, 0) : null;
    x.holat = ogirHolat(x.holatSanoq);
    x.oshgan = bolalar.some((b) => b.oshgan);
  };
  for (const l of otaTugunlar) {
    jamla(l, l.bolalar.map((id) => tugunlar.get(id)!));
    const r = l.resurs;
    for (const id of l.bolalar) { const b = tugunlar.get(id)!.resurs; r.sklad += b.sklad; r.texnika += b.texnika; r.kadr += b.kadr; }
  }
  const root = tugunlar.get(ildiz)!;
  const birinchi = otaTugunlar.sort((a, b) => (a.tur === 'guruh' ? 1 : 0) - (b.tur === 'guruh' ? 1 : 0) || (b.smeta ?? -1) - (a.smeta ?? -1) || a.nom.localeCompare(b.nom));
  root.bolalar = birinchi.map((x) => x.id);
  jamla(root, birinchi);
  root.obyektSoni = obyektlar.length;
  // Kompaniya darajasida — har resurs bir marta (bog‘lanishlar soni emas).
  root.resurs = bosResurs();
  for (const t of graf.tugunlar) { const k = RESURS_TUR[t.tur]; if (k) root.resurs[k] += 1; }
  // Kompaniya smetasi — server jamlanmasi bo‘lsa o‘sha (bir manba).
  const j = graf.jamlanma;
  if (j) {
    const sj = son(j.smeta_jami);
    root.smeta = sj === 0 ? null : sj;
    root.smetaToliq = (son(j.smetasiz_obyekt) ?? 0) === 0 && root.smeta != null;
    root.fakt = son(j.fakt_jami); root.f2 = son(j.f2_jami);
    root.zayavka = son(j.zayavka_kutilmoqda);
  }

  const tartib = [ildiz, ...root.bolalar, ...root.bolalar.flatMap((id) => tugunlar.get(id)!.bolalar)];
  const maxSmeta = Math.max(0, ...[...tugunlar.values()].filter((x) => x.daraja === 2).map((x) => x.smeta ?? 0));
  return { ildiz, tugunlar, tartib, biriktirilmagan, maxSmeta };
}

/* ───────────── Joylashuv ───────────── */

export type Joy = { x: number; y: number; w: number; h: number };
export type Chegara = { x1: number; y1: number; x2: number; y2: number };
export type Joylashuv = { joylar: Map<string, Joy>; chegara: Chegara; tomon: Map<string, -1 | 1> };

export const OLCHAM = {
  ildiz: { w: 228, h: 108 },
  loyiha: { w: 206, h: 80 },
  obyekt: { w: 252, h: 84 },
  /** Ildiz markazidan loyiha / obyekt markazigacha. */
  dx1: 262, dx2: 530,
  qator: 94, loyihaOraligi: 26,
} as const;

/**
 * Ikki tomonlama mindmap: ildiz markazda, loyihalar o‘ng va chapga (obyekt soni bo‘yicha muvozanat),
 * obyektlar har loyiha bandida tik qatorda. `yigilgan` — bolalari yashirilgan loyihalar.
 */
export function mindmapJoyla(d: XDaraxt, yigilgan: ReadonlySet<string> = new Set()): Joylashuv {
  const joylar = new Map<string, Joy>();
  const tomon = new Map<string, -1 | 1>();
  const root = d.tugunlar.get(d.ildiz)!;
  const korinadi = (l: XTugun) => (yigilgan.has(l.id) ? 0 : l.bolalar.length);
  const band = (l: XTugun) => Math.max(1, korinadi(l)) * OLCHAM.qator;
  const tomonlar: Record<'1' | '-1', XTugun[]> = { '1': [], '-1': [] };
  let ong = 0, chap = 0;
  for (const id of root.bolalar) {
    const l = d.tugunlar.get(id)!;
    if (ong <= chap) { tomonlar['1'].push(l); ong += band(l) + OLCHAM.loyihaOraligi; }
    else { tomonlar['-1'].push(l); chap += band(l) + OLCHAM.loyihaOraligi; }
  }
  joylar.set(root.id, { x: 0, y: 0, ...OLCHAM.ildiz });
  for (const s of [1, -1] as const) {
    const ls = tomonlar[String(s) as '1' | '-1'];
    const H = ls.reduce((n, l) => n + band(l), 0) + Math.max(0, ls.length - 1) * OLCHAM.loyihaOraligi;
    let y = -H / 2;
    for (const l of ls) {
      const b = band(l);
      joylar.set(l.id, { x: s * OLCHAM.dx1, y: y + b / 2, ...OLCHAM.loyiha });
      tomon.set(l.id, s);
      if (!yigilgan.has(l.id)) {
        l.bolalar.forEach((oid, i) => {
          joylar.set(oid, { x: s * OLCHAM.dx2, y: y + i * OLCHAM.qator + OLCHAM.qator / 2, ...OLCHAM.obyekt });
          tomon.set(oid, s);
        });
      }
      y += b + OLCHAM.loyihaOraligi;
    }
  }
  return { joylar, chegara: chegaraHisobla(joylar.values()), tomon };
}

/** Kichik karta uchun radial joylashuv: loyihalar 1-halqada (obyekt soniga mutanosib sektor), obyektlar 2-halqada. */
export function radialJoyla(d: XDaraxt, r1 = 70, r2 = 120): Map<string, { x: number; y: number; burchak: number }> {
  const natija = new Map<string, { x: number; y: number; burchak: number }>();
  const root = d.tugunlar.get(d.ildiz)!;
  natija.set(root.id, { x: 0, y: 0, burchak: 0 });
  const vazn = root.bolalar.map((id) => Math.max(1, d.tugunlar.get(id)!.bolalar.length));
  const jami = vazn.reduce((a, b) => a + b, 0) || 1;
  let a0 = -Math.PI / 2;
  root.bolalar.forEach((id, i) => {
    const sektor = (vazn[i] / jami) * Math.PI * 2;
    const markaz = a0 + sektor / 2;
    natija.set(id, { x: Math.cos(markaz) * r1, y: Math.sin(markaz) * r1, burchak: markaz });
    const bolalar = d.tugunlar.get(id)!.bolalar;
    bolalar.forEach((oid, j) => {
      const a = bolalar.length === 1 ? markaz : a0 + (sektor * (j + 0.5)) / bolalar.length;
      natija.set(oid, { x: Math.cos(a) * r2, y: Math.sin(a) * r2, burchak: a });
    });
    a0 += sektor;
  });
  return natija;
}

export function chegaraHisobla(joylar: Iterable<Joy>): Chegara {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const j of joylar) {
    x1 = Math.min(x1, j.x - j.w / 2); x2 = Math.max(x2, j.x + j.w / 2);
    y1 = Math.min(y1, j.y - j.h / 2); y2 = Math.max(y2, j.y + j.h / 2);
  }
  if (!Number.isFinite(x1)) return { x1: -100, y1: -100, x2: 100, y2: 100 };
  return { x1, y1, x2, y2 };
}

export type Kamera = { x: number; y: number; k: number };
export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 2.4;
export const zoomCheg = (k: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));

/** Chegara ekranga sig‘adigan kamera (ekran = dunyo·k + (x, y)). */
export function sigdirKamera(c: Chegara, w: number, h: number, chet = 40, maxK = 1.1): Kamera {
  const k = zoomCheg(Math.min(maxK, (w - chet * 2) / Math.max(1, c.x2 - c.x1), (h - chet * 2) / Math.max(1, c.y2 - c.y1)));
  return { k, x: w / 2 - ((c.x1 + c.x2) / 2) * k, y: h / 2 - ((c.y1 + c.y2) / 2) * k };
}

/** Nuqtani ekran markaziga keltiruvchi kamera (zum kamida `minK`). */
export function markazlaKamera(j: { x: number; y: number }, w: number, h: number, joriyK: number, minK = 0.85): Kamera {
  const k = zoomCheg(Math.max(joriyK, minK));
  return { k, x: w / 2 - j.x * k, y: h / 2 - j.y * k };
}

/** Kursor ostidagi nuqtani joyida saqlab zumlash. */
export function zumla(kam: Kamera, omil: number, mx: number, my: number): Kamera {
  const k = zoomCheg(kam.k * omil);
  return { k, x: mx - ((mx - kam.x) / kam.k) * k, y: my - ((my - kam.y) / kam.k) * k };
}

/* ───────────── Qidiruv, fokus, navigatsiya ───────────── */

/** Qidiruvga mos tugunlar + ularning ajdodlari (kontekst saqlanadi). Bo‘sh qidiruv — `null`. */
export function qidiruvMoslari(d: XDaraxt, q: string, guruhNomi = ''): { mos: Set<string>; korinadi: Set<string> } | null {
  if (!q.trim()) return null;
  const mos = new Set<string>();
  for (const x of d.tugunlar.values()) if (qidiruvdaBor(x.tur === 'guruh' ? guruhNomi : x.nom, q)) mos.add(x.id);
  const korinadi = new Set<string>();
  for (const id of mos) {
    let c: string | null = id;
    while (c) { korinadi.add(c); c = d.tugunlar.get(c)?.ota ?? null; }
    for (const b of d.tugunlar.get(id)?.bolalar ?? []) korinadi.add(b);
  }
  return { mos, korinadi };
}

/** Tanlangan tugunning yo‘li: ajdodlar + o‘zi + avlodlari. */
export function fokusYoli(d: XDaraxt, id: string): Set<string> {
  const s = new Set<string>();
  let c: string | null = id;
  while (c) { s.add(c); c = d.tugunlar.get(c)?.ota ?? null; }
  const ich = (x: string) => { for (const b of d.tugunlar.get(x)?.bolalar ?? []) { s.add(b); ich(b); } };
  ich(id);
  return s;
}

/** Strelka tugmalari bilan daraxtda yurish. Tashqariga = bola, ichkariga = ota, yuqori/past = qo‘shni. */
export function klaviaturaQadam(d: XDaraxt, j: Joylashuv, id: string, kalit: string, yigilgan: ReadonlySet<string> = new Set()): string | null {
  const x = d.tugunlar.get(id);
  if (!x) return null;
  const s = j.tomon.get(id) ?? 0;
  const korBolalar = (t: XTugun) => (yigilgan.has(t.id) ? [] : t.bolalar);
  if (kalit === 'ArrowRight' || kalit === 'ArrowLeft') {
    const yon = kalit === 'ArrowRight' ? 1 : -1;
    if (x.tur === 'kompaniya') return x.bolalar.find((b) => j.tomon.get(b) === yon) ?? null;
    if (s === yon) return korBolalar(x)[0] ?? null;
    return x.ota;
  }
  if (kalit === 'ArrowUp' || kalit === 'ArrowDown') {
    if (!x.ota) return null;
    const ota = d.tugunlar.get(x.ota)!;
    const qoshnilar = ota.bolalar.filter((b) => (x.daraja === 1 ? j.tomon.get(b) === s : true));
    const i = qoshnilar.indexOf(id);
    const n = kalit === 'ArrowDown' ? i + 1 : i - 1;
    return qoshnilar[n] ?? null;
  }
  if (kalit === 'Home') return d.ildiz;
  return null;
}

/** Romb (status) o‘lchami smeta summasiga mutanosib (kvadrat ildiz — maydon summaga teng). */
export function hajmOlcham(smeta: number | null, max: number, min = 5, katta = 12): number {
  if (smeta == null || smeta <= 0 || max <= 0) return min;
  return min + (katta - min) * Math.sqrt(Math.min(1, smeta / max));
}

/** Holat bo‘yicha diqqat ro‘yxati: avval xavf, keyin e’tibor (smetasi kattasi oldin). */
export function diqqatRoyxati(d: XDaraxt, n = 5): XTugun[] {
  return [...d.tugunlar.values()]
    .filter((x) => x.tur === 'obyekt' && (x.holat === 'xavf' || x.holat === 'etibor'))
    .sort((a, b) => HOLAT_OGIRLIK[a.holat] - HOLAT_OGIRLIK[b.holat] || b.belgilar.length - a.belgilar.length || (b.smeta ?? -1) - (a.smeta ?? -1))
    .slice(0, n);
}

/** Tugunga bevosita bog‘langan real yozuvlar (shartnoma, sklad, texnika, xodim, kontragent). */
export function boglanganlar(graf: MindmapGraf, id: string): MindmapTugun[] {
  const byId = new Map(graf.tugunlar.map((t) => [t.id, t]));
  const natija = new Map<string, MindmapTugun>();
  for (const b of graf.bogichlar) {
    const boshqa = b.manba === id ? b.maqsad : b.maqsad === id ? b.manba : null;
    const t = boshqa ? byId.get(boshqa) : null;
    if (t && t.tur !== 'kompaniya' && t.tur !== 'loyiha' && t.tur !== 'obyekt') natija.set(t.id, t);
  }
  return [...natija.values()];
}

export const entityId = (id: string): number | null => {
  const n = Number(id.split(':')[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
