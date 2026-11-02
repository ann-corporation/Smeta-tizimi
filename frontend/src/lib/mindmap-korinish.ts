/**
 * Mindmap ko‘rinishi — «Kompaniya xaritasi» (egasi 2026-10-25: rahbar panelida mindmapga urg‘u, ko‘rgan odam
 * ishlar holatini darhol tushunsin). Bu fayl SOF hisob: `t2_mindmap_grafi` javobidan (MindmapGraf) ierarxiya
 * Kompaniya → Loyiha → Obyekt quriladi, har tugunga real holat (smeta / fakt / F2, belgilar) yig‘iladi va
 * ikki tomonlama (mindmap) yoki radial joylashuv hisoblanadi. Server chaqiruvi va yozish yo‘q.
 *
 * Qoidalar: noma’lum qiymat 0 emas — `null` (smeta yuklanmagan obyekt foizi yo‘q); jamlanma qisman bo‘lsa
 * `smetaToliq=false` bilan aniq aytiladi. Pul — serverdagi ustamasiz (rz qatorlar yig‘indisi) qiymat.
 */
import type { MindmapBelgi, MindmapGraf, MindmapKorinish, MindmapSignal, MindmapTugun, TugunTur } from '../api/t2-mindmap';
import type { TizimMeta, TizimTugunTur } from '../api/t2-tizim-xaritasi';
import { qidiruvdaBor } from '../i18n/lotin-kirill';

export type XHolat = 'xavf' | 'etibor' | 'yaxshi' | 'nomalum';
export const HOLAT_TARTIB: XHolat[] = ['xavf', 'etibor', 'yaxshi', 'nomalum'];
const HOLAT_OGIRLIK: Record<XHolat, number> = { xavf: 0, etibor: 1, nomalum: 2, yaxshi: 3 };

/** `tizim` / `modul` / `platforma` — «Tizim xaritasi» (lib/tizim-xaritasi.ts) tugunlari; kompaniya xaritasida uchramaydi. */
export type XTur = 'kompaniya' | 'loyiha' | 'obyekt' | 'guruh' | 'jamoa' | 'odam' | 'tizim' | 'modul' | 'platforma';

/* ───────────── Jamoa (v4: odamlar) ───────────── */
export type JamoaGuruhKalit = 'rahbariyat' | 'pto' | 'prorab' | 'bugalter' | 'boshqa';
export const JAMOA_TARTIB: JamoaGuruhKalit[] = ['rahbariyat', 'pto', 'prorab', 'bugalter', 'boshqa'];
export const JAMOA_ID = 'jamoa:odamlar';

/** A'zolik roli → «Jamoa» guruhi. Noma'lum rol — `boshqa` (yashirilmaydi). */
export function jamoaGuruhi(rol: string | null | undefined): JamoaGuruhKalit {
  const r = (rol ?? '').toLowerCase();
  if (['boss', 'admin', 'rahbar', 'superadmin', 'direktor'].includes(r)) return 'rahbariyat';
  if (r === 'pto') return 'pto';
  if (r === 'prorab') return 'prorab';
  if (r === 'bugalter') return 'bugalter';
  return 'boshqa';
}

/** Ism → bosh harflar («Anvar Ahatqulov» → «AA»). Bo'sh bo'lsa «?». */
export function bosharflar(nom: string | null | undefined): string {
  const sozlar = (nom ?? '').trim().split(/\s+/).filter(Boolean);
  if (!sozlar.length) return '?';
  const h = sozlar.slice(0, 2).map((x) => Array.from(x)[0] ?? '').join('');
  return h.toLocaleUpperCase('uz-UZ') || '?';
}

export type MasulYozuv = { odamId: string; nom: string; initsial: string; rol: string | null; ruxsat: string | null };
export type XOdamBiriktirma = { id: string; ruxsat: string | null };
export type XOdam = {
  id: string;
  /** `t2_foydalanuvchi.id`. */
  sonId: number | null;
  nom: string;
  login: string | null;
  rol: string | null;
  rollar: string[];
  guruh: JamoaGuruhKalit;
  initsial: string;
  /** Mas'ul bo'lgan (serverning ko'rish doirasidagi) obyekt/loyihalar. */
  obyektlar: XOdamBiriktirma[];
  loyihalar: XOdamBiriktirma[];
};
export type XJamoa = {
  odamlar: Map<string, XOdam>;
  /** Faqat bo'sh bo'lmagan guruhlar, `JAMOA_TARTIB` tartibida; odamlar nom bo'yicha. */
  guruhlar: { kalit: JamoaGuruhKalit; odamlar: string[] }[];
};
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
  /** F2 — FAQAT tasdiqlangan (v3). Eski RPCda qoralama aralash bo‘lishi mumkin (`f2Tasdiqlangan=false`). */
  f2: number | null;
  /** Tasdiqlanmagan F2 qoralamalar summasi; `null` — server yubormagan (eski shakl). */
  f2Qoralama: number | null;
  /** Server F2 asosini `tasdiqlangan` deb tasdiqladimi (v3). */
  f2Tasdiqlangan: boolean;
  faktFoiz: number | null;
  f2Foiz: number | null;
  belgilar: MindmapBelgi[];
  /** Ochiq zayavkalar soni (`null` — manba yo‘q). */
  zayavka: number | null;
  narxsiz: number | null;
  obyektSoni: number;
  holatSanoq: HolatSanoq;
  resurs: ResursSanoq;
  /** F2 oshgan: v3 da server `ortiqcha` belgisi (overbilling radari); eski RPCda — foiz > 100 (zaxira qoida). */
  oshgan: boolean;
  /** Ochiq signallar (`null` — manba yo‘q). */
  signalSoni: number | null;
  kritikSoni: number | null;
  /** Eng og‘ir 3 signal (obyektda). */
  topSignallar: MindmapSignal[];
  /** v4: shu obyekt/loyihaga mas'ul odamlar (boshqa turlarda bo'sh). */
  masullar: MasulYozuv[];
  /** `odam` turida — odam yozuvi. */
  odam: XOdam | null;
  /** Faqat «Tizim xaritasi» tugunlarida: server tuguni (tur + meta). Kompaniya xaritasida — yo'q. */
  tizim?: { tur: TizimTugunTur; meta: TizimMeta } | null;
};

export type XDaraxt = {
  ildiz: string;
  tugunlar: Map<string, XTugun>;
  /** Chizish tartibi: ildiz, loyihalar, obyektlar. */
  tartib: string[];
  /** Hech bir obyekt/loyihaga biriktirilmagan resurslar. */
  biriktirilmagan: ResursSanoq;
  maxSmeta: number;
  /** v4: odamlar. `null` — server odam yubormagan (eski RPC). */
  jamoa: XJamoa | null;
  /** Server `korinish` (v4). `null` — eski RPC (cheklov noma'lum). */
  korinish: MindmapKorinish | null;
  /** `true` — moliyaviy ruxsat yo'q: summalar serverda olib tashlangan, UI «—» va sababini ko'rsatadi (0 EMAS). */
  pulYoq: boolean;
  /** `true` — obyektlarning bir qismi shu foydalanuvchidan yashirilgan. */
  doiraCheklangan: boolean;
};

export const bosResurs = (): ResursSanoq => ({ shartnoma: 0, sklad: 0, texnika: 0, kadr: 0, kontragent: 0 });
export const bosHolat = (): HolatSanoq => ({ xavf: 0, etibor: 0, yaxshi: 0, nomalum: 0 });
export const son = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Qism / jami foizi; jami noma’lum yoki 0 bo‘lsa — `null` (yolg‘on «0%» yo‘q). */
export function foiz(qism: number | null | undefined, jami: number | null | undefined): number | null {
  if (qism == null || jami == null || !Number.isFinite(qism) || !Number.isFinite(jami) || jami <= 0) return null;
  return Math.round((qism / jami) * 1000) / 10;
}

/** Obyektda fakt umuman kiritilganmi (fakt summasi > 0). `null` — ma'lumot yo'q. */
export function faktKiritilgan(t: MindmapTugun | null | undefined): boolean | null {
  const f = son(t?.meta?.fakt);
  return f == null ? null : f > 0;
}

/** F2 smetadan oshganmi (obyekt jami bo'yicha). */
function f2SmetadanOshgan(t: MindmapTugun): boolean {
  const f2 = son(t.meta?.f2), sm = son(t.meta?.smeta);
  return f2 != null && sm != null && sm > 0 && f2 > sm;
}

/**
 * Belgilar. Egasi 2026-10-27 tekshiruvi: «ortiqcha» 18 obyektda yongan, 17 tasida fakt UMUMAN kiritilmagan — bu
 * F2 ortiqchasi emas, fakt bo'shligi. Shuning uchun: fakt yo'q obyektda server `ortiqcha` belgisi (agar F2 smetadan
 * ham oshmagan bo'lsa) `fakt_yoq` (info) bilan almashtiriladi — signal asosli bo'lishi uchun.
 */
export function belgilariOl(t: MindmapTugun | null | undefined): MindmapBelgi[] {
  const b = t?.meta?.belgi;
  const xom = Array.isArray(b) ? (b as MindmapBelgi[]) : [];
  if (!t || faktKiritilgan(t) !== false || f2SmetadanOshgan(t)) return xom;
  const f2 = son(t.meta?.f2);
  const qolgan = xom.filter((x) => x.tur !== 'ortiqcha');
  if (f2 != null && f2 > 0 && !qolgan.some((x) => x.tur === 'fakt_yoq')) {
    qolgan.push({ tur: 'fakt_yoq', daraja: 'info', matn: 'Fakt kiritilmagan — F2 ni fakt bilan solishtirib bo‘lmaydi' });
  }
  return qolgan;
}

/** Serverdan `ortiqcha_soni` kelganmi (v3). Kelmasa — eski RPC shakli. */
export function serverOrtiqchaBilar(t: MindmapTugun): boolean {
  return son(t.meta?.ortiqcha_soni) != null;
}

/** F2 oshishi: v3 da — server belgisi (`ortiqcha_soni > 0`); eski RPC shaklida — foiz > 100 (zaxira). */
export function obyektOshgan(t: MindmapTugun): boolean {
  const o = son(t.meta?.ortiqcha_soni);
  // Fakt umuman kiritilmagan bo'lsa — faqat F2 smetadan oshgani ortiqcha hisoblanadi (yuqoridagi izohga qarang).
  if (o != null) return o > 0 && (faktKiritilgan(t) !== false || f2SmetadanOshgan(t));
  const fk = son(t.meta?.fakt_foiz), f2 = son(t.meta?.f2_foiz);
  return (fk != null && fk > 100) || (f2 != null && f2 > 100);
}

/**
 * Obyekt holati faqat real belgilardan:
 *  - xavf: `ogoh` belgi (narxsiz qator, ko‘zgu farqi, smeta yo‘q) yoki kritik signal;
 *  - e’tibor: boshqa belgi (ochiq zayavka, resurs yo‘q, F2 ortiqcha), oddiy ochiq signal yoki F2 oshishi;
 *  - yaxshi: hech biri; meta yo‘q — nomalum.
 * Signal soni `null` (manba yo‘q) — hech narsa qo‘shmaydi (0 ham emas, signal ham emas).
 */
export function obyektHolati(t: MindmapTugun): XHolat {
  if (!t.meta) return 'nomalum';
  const b = belgilariOl(t);
  if (b.some((x) => x.daraja === 'ogoh') || (son(t.meta.critical_count) ?? 0) > 0) return 'xavf';
  if (b.length > 0 || (son(t.meta.signal_count) ?? 0) > 0 || obyektOshgan(t)) return 'etibor';
  return 'yaxshi';
}

/** Meta.top_signals — faqat yaroqli yozuvlar, ko‘pi bilan 3 ta. */
export function topSignallarOl(t: MindmapTugun | null | undefined): MindmapSignal[] {
  const v = t?.meta?.top_signals;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is MindmapSignal => !!x && typeof x === 'object').slice(0, 3);
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

/** Bo'sh (hali hisoblanmagan) tugun — noma'lum qiymatlar `null`, 0 emas. Tizim xaritasi ham shundan quradi. */
export function bosTugun(id: string, tur: XTur, nom: string, manba: MindmapTugun | null, ota: string | null, daraja: 0 | 1 | 2): XTugun {
  return {
    id, tur, nom, manba, ota, bolalar: [], daraja, tomon: 0, holat: 'nomalum',
    smeta: null, smetaToliq: false, fakt: null, f2: null, faktFoiz: null, f2Foiz: null,
    belgilar: [], zayavka: null, narxsiz: null, obyektSoni: 0, holatSanoq: bosHolat(), resurs: bosResurs(), oshgan: false,
    f2Qoralama: null, f2Tasdiqlangan: false, signalSoni: null, kritikSoni: null, topSignallar: [], masullar: [], odam: null,
  };
}

/** MindmapGraf → Kompaniya → Loyiha → Obyekt daraxti, real holat bilan. */
export function daraxtQur(graf: MindmapGraf): XDaraxt {
  const tugunlar = new Map<string, XTugun>();
  const byId = new Map(graf.tugunlar.map((t) => [t.id, t]));
  const kompaniya = graf.tugunlar.find((t) => t.tur === 'kompaniya') ?? null;
  const ildiz = kompaniya?.id ?? 'kompaniya:0';

  const yangi = bosTugun;
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
    x.f2Qoralama = son(m?.f2_qoralama);
    x.f2Tasdiqlangan = m?.f2_asos === 'tasdiqlangan';
    x.signalSoni = son(m?.signal_count);
    x.kritikSoni = son(m?.critical_count);
    x.topSignallar = topSignallarOl(o);
    x.faktFoiz = son(m?.fakt_foiz) ?? foiz(x.fakt, x.smeta);
    x.f2Foiz = son(m?.f2_foiz) ?? foiz(x.f2, x.smeta);
    x.belgilar = belgilariOl(o);
    x.zayavka = son(m?.zayavka);
    x.narxsiz = son(m?.narxsiz);
    x.holat = obyektHolati(o);
    x.oshgan = obyektOshgan(o);
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
    const qor = yigindi(bolalar.map((b) => b.f2Qoralama));
    x.f2Qoralama = qor.toliq ? qor.jami : null; // qisman ma’lum bo‘lsa — to‘liq deb ko‘rsatilmaydi
    // Aralash (eski/yangi) obyektlar bo‘lsa — F2 asosi tasdiqlangan deb aytilmaydi.
    x.f2Tasdiqlangan = bolalar.length > 0 && bolalar.every((b) => b.f2Tasdiqlangan);
    const sg = bolalar.map((b) => b.signalSoni).filter((v): v is number => v != null);
    x.signalSoni = sg.length ? sg.reduce((a, b) => a + b, 0) : null;
    const kr = bolalar.map((b) => b.kritikSoni).filter((v): v is number => v != null);
    x.kritikSoni = kr.length ? kr.reduce((a, b) => a + b, 0) : null;
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
    root.f2Qoralama = son(j.f2_qoralama_jami);
    root.f2Tasdiqlangan = j.f2_asos === 'tasdiqlangan';
    root.zayavka = son(j.zayavka_kutilmoqda);
  }

  const tartib = [ildiz, ...root.bolalar, ...root.bolalar.flatMap((id) => tugunlar.get(id)!.bolalar)];
  const maxSmeta = Math.max(0, ...[...tugunlar.values()].filter((x) => x.daraja === 2).map((x) => x.smeta ?? 0));

  // Jamoa (v4) — loyiha/obyekt hisobidan KEYIN qo'shiladi, `root.bolalar` ga kirmaydi (u faqat loyihalar).
  const jamoa = jamoaQur(graf, tugunlar, yangi, ildiz);
  if (jamoa) {
    tartib.push(JAMOA_ID);
    for (const g of jamoa.guruhlar) tartib.push(...g.odamlar);
  }
  const korinish = graf.korinish ?? null;
  return { ildiz, tugunlar, tartib, biriktirilmagan, maxSmeta, jamoa, korinish,
    pulYoq: korinish?.pul === false, doiraCheklangan: korinish?.toliq === false };
}

const masulRuxsatTartib = (r: string | null) => (r === 'manage' ? 0 : r === 'write' ? 1 : r === 'read' ? 2 : 3);

function jamoaQur(graf: MindmapGraf, tugunlar: Map<string, XTugun>,
  yangi: (id: string, tur: XTur, nom: string, manba: MindmapTugun | null, ota: string | null, daraja: 0 | 1 | 2) => XTugun, ildiz: string): XJamoa | null {
  const odamNodelar = graf.tugunlar.filter((t) => t.tur === 'foydalanuvchi');
  if (!odamNodelar.length) return null;
  const odamlar = new Map<string, XOdam>();
  for (const n of odamNodelar) {
    const m = n.meta ?? {};
    const rol = typeof m.rol === 'string' && m.rol ? m.rol : null;
    const rollar = Array.isArray(m.rollar) ? (m.rollar as unknown[]).filter((r): r is string => typeof r === 'string') : rol ? [rol] : [];
    odamlar.set(n.id, {
      id: n.id, sonId: entityId(n.id), nom: n.nom, login: typeof m.login === 'string' ? m.login : null,
      rol, rollar, guruh: jamoaGuruhi(rol ?? rollar[0]), initsial: bosharflar(n.nom), obyektlar: [], loyihalar: [],
    });
  }
  for (const b of graf.bogichlar) {
    if (b.tur !== 'masul_obyekt' && b.tur !== 'masul_loyiha') continue;
    const od = odamlar.get(b.manba);
    const nishon = tugunlar.get(b.maqsad);
    if (!od || !nishon || nishon.tur !== (b.tur === 'masul_obyekt' ? 'obyekt' : 'loyiha')) continue;
    const ruxsat = b.ruxsat ?? null;
    (b.tur === 'masul_obyekt' ? od.obyektlar : od.loyihalar).push({ id: nishon.id, ruxsat });
    nishon.masullar.push({ odamId: od.id, nom: od.nom, initsial: od.initsial, rol: od.rol, ruxsat });
  }
  for (const x of tugunlar.values()) x.masullar.sort((a, c) => masulRuxsatTartib(a.ruxsat) - masulRuxsatTartib(c.ruxsat) || a.nom.localeCompare(c.nom));

  const guruhlar = JAMOA_TARTIB.map((kalit) => ({
    kalit,
    odamlar: [...odamlar.values()].filter((o) => o.guruh === kalit).sort((a, c) => a.nom.localeCompare(c.nom)).map((o) => o.id),
  })).filter((g) => g.odamlar.length > 0);

  const j = yangi(JAMOA_ID, 'jamoa', '', null, ildiz, 1);
  j.bolalar = guruhlar.flatMap((g) => g.odamlar);
  j.obyektSoni = 0;
  tugunlar.set(JAMOA_ID, j);
  for (const o of odamlar.values()) {
    const x = yangi(o.id, 'odam', o.nom, odamNodelar.find((n) => n.id === o.id) ?? null, JAMOA_ID, 2);
    x.odam = o;
    tugunlar.set(o.id, x);
  }
  return { odamlar, guruhlar };
}

/* ───────────── Joylashuv ───────────── */

export type Joy = { x: number; y: number; w: number; h: number };
export type Chegara = { x1: number; y1: number; x2: number; y2: number };
export type Joylashuv = { joylar: Map<string, Joy>; chegara: Chegara; tomon: Map<string, -1 | 1>; /** Jamoa guruhlari sarlavhalari (x, y — matn boshi). */ yorliqlar: { kalit: JamoaGuruhKalit; x: number; y: number }[] };

export const OLCHAM = {
  ildiz: { w: 228, h: 108 },
  loyiha: { w: 206, h: 80 },
  obyekt: { w: 252, h: 84 },
  /** Ildiz markazidan loyiha / obyekt markazigacha. */
  dx1: 262, dx2: 530,
  qator: 94, loyihaOraligi: 26,
  /** Jamoa shoxi: kompaniya tagida, odam kartalari qatorlarda (qatorda ko'pi bilan `odamQatorda`). */
  jamoa: { w: 228, h: 64 }, odam: { w: 200, h: 64 }, odamDx: 214, odamQatorda: 5, jamoaBoshlanish: 96,
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
  const yorliqlar: Joylashuv['yorliqlar'] = [];
  if (d.jamoa) {
    const O = OLCHAM;
    const yMax = chegaraHisobla(joylar.values()).y2;
    const jy = yMax + O.jamoaBoshlanish + O.jamoa.h / 2;
    joylar.set(JAMOA_ID, { x: 0, y: jy, ...O.jamoa });
    if (!yigilgan.has(JAMOA_ID)) {
      let y = jy + O.jamoa.h / 2 + 52;
      for (const g of d.jamoa.guruhlar) {
        const kenglik = Math.min(g.odamlar.length, O.odamQatorda) * O.odamDx;
        yorliqlar.push({ kalit: g.kalit, x: -kenglik / 2 + 4, y });
        y += 10;
        for (let i = 0; i < g.odamlar.length; i += O.odamQatorda) {
          const qator = g.odamlar.slice(i, i + O.odamQatorda);
          qator.forEach((id, k) => joylar.set(id, { x: (k - (qator.length - 1) / 2) * O.odamDx, y: y + O.odam.h / 2, ...O.odam }));
          y += O.odam.h + 14;
        }
        y += 24;
      }
    }
  }
  return { joylar, chegara: chegaraHisobla(joylar.values()), tomon, yorliqlar };
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
  const yuqori = (boshi: string) => { let c: string | null = boshi; while (c) { s.add(c); c = d.tugunlar.get(c)?.ota ?? null; } };
  yuqori(id);
  const ich = (x: string) => { for (const b of d.tugunlar.get(x)?.bolalar ?? []) { s.add(b); ich(b); } };
  ich(id);
  // Mas'ullik: obyekt tanlansa — mas'ul odamlar; odam tanlansa — uning obyekt/loyihalari (ajdodlari bilan).
  const x = d.tugunlar.get(id);
  if (x?.tur === 'obyekt' || x?.tur === 'loyiha') for (const m of x.masullar) yuqori(m.odamId);
  if (x?.tur === 'odam' && x.odam) for (const b of [...x.odam.obyektlar, ...x.odam.loyihalar]) yuqori(b.id);
  return s;
}

/** Strelka tugmalari bilan daraxtda yurish. Tashqariga = bola, ichkariga = ota, yuqori/past = qo‘shni. */
export function klaviaturaQadam(d: XDaraxt, j: Joylashuv, id: string, kalit: string, yigilgan: ReadonlySet<string> = new Set()): string | null {
  const x = d.tugunlar.get(id);
  if (!x) return null;
  const s = j.tomon.get(id) ?? 0;
  const korBolalar = (t: XTugun) => (yigilgan.has(t.id) ? [] : t.bolalar);
  // Jamoa shoxi pastda: kompaniya ↓ jamoa ↓ odamlar; odamlar orasida ← → ↑ ↓ qator bo'yicha.
  if (x.tur === 'kompaniya' && kalit === 'ArrowDown') return d.tugunlar.has(JAMOA_ID) ? JAMOA_ID : null;
  if (x.tur === 'jamoa') {
    if (kalit === 'ArrowUp') return d.ildiz;
    if (kalit === 'ArrowDown') return korBolalar(x)[0] ?? null;
    return null;
  }
  if (x.tur === 'odam') {
    const q = d.tugunlar.get(JAMOA_ID)?.bolalar ?? [];
    const i = q.indexOf(id);
    if (kalit === 'ArrowUp') return JAMOA_ID;
    if (kalit === 'ArrowRight') return q[i + 1] ?? null;
    if (kalit === 'ArrowLeft') return q[i - 1] ?? null;
    if (kalit === 'ArrowDown') return q[i + 5] ?? null;
    if (kalit === 'Home') return d.ildiz;
    return null;
  }
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
