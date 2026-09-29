/**
 * F2 (Форма № 02 — АКТ О ПРИЁМКЕ ВЫПОЛНЕННЫХ РАБОТ) o'quvchisi — smeta anatomiyasi
 * ustida. Kontrakt: docs/architecture/F2_IMPORT_V3.md §1, F1.
 *
 * F2 paketi: ОБЛОЖКА + СЧЁТ-ФАКТ. + akt varag'i (LRV smeta shaklida: РАЗДЕЛ → ish (shu oy
 * hajmi) → resurslar → podval → "Итого по ранее оформленным Формам №2" → imzolar).
 * Bu modul faqat O'QIYDI va hujjatni o'zi bilan solishtiradi — hech narsani to'g'irlamaydi:
 *   - pul faqat barglarda (resurslar; resurssiz ish — o'zi), ish qatori — hajm;
 *   - hujjat ИТОГО ПРЯМЫЕ ЗАТРАТЫ ↔ qatorlar yig'indisi; farq bo'lsa sababi izlanadi
 *     (masalan hujjat formulasi oxirgi ishlarni qamramagan);
 *   - #REF!/#VALUE! kataklari, nomsiz resurs, hajmi bo'sh (bajarilmagan) ish, manfiy
 *     (ПЕРЕРАСЧЕТ) qatorlar — ochiq ogohlantirish, jim tuzatish YO'Q.
 */
import { kitobAnatomiyasi } from './index';
import { sarlavhaYoli } from './ierarxiya';
import { kalit, xom } from './matn';
import type { Ish, KirishKitob, KirishVaraq, Manzil, Resurs, VaraqAnatomiyasi } from './turlar';

export type F2TugunTuri = 'rz' | 'bl' | 'rs';

export interface F2Tugun {
  /** Fayl ichida barqaror manzil: `varaq!qator`. */
  uid: string;
  tur: F2TugunTuri;
  kod: string | null;
  nom: string;
  birlik: string | null;
  /** Ish: shu oy hajmi; resurs: shu oy sarfi (norma × ish hajmi). Manfiy — перерасчет. */
  hajm: number | null;
  narx: number | null;
  summa: number | null;
  /** Resurs: norma (birlikka). */
  norma?: number | null;
  manzil: Manzil;
  /** RZ nomlari ildizdan (asl matn). */
  yol: string[];
  bolalar: F2Tugun[];
  /** Pulga kiradimi (barg): resurs yoki resurssiz ish. */
  barg: boolean;
  /** Hujjatda qo'shimcha ish (+) yoki zamena (~) deb belgilangan. */
  belgi?: 'qoshimcha' | 'zamena';
  ogohlantirish?: string[];
}

export interface F2Ogohlantirish {
  kod: 'JAMI_FARQ' | 'XATO_QIYMAT' | 'NOMSIZ_RESURS' | 'HAJMSIZ_ISH' | 'MANFIY_QATOR' | 'DAVR_YOQ' | 'AKT_VARAQ_YOQ' | 'KOP_AKT_VARAQ';
  izoh: string;
  manzil?: Manzil;
}

export interface F2Jami {
  /** ИТОГО ПРЯМЫЕ ЗАТРАТЫ — hujjatning o'z qiymati (null — topilmadi, 0 EMAS). */
  pryamye: number | null;
  vsego: number | null;
  /** "Итого по ранее оформленным Формам №2". */
  ranee: number | null;
  /** "Разница по перерасчёту" (bo'lsa). */
  raznica: number | null;
  nds: number | null;
}

export interface F2Akt {
  fayl: string;
  varaq: string;
  /** "YYYY-MM" — fayldan ("За сентябрь месяц 2025 года", "Отчетный период: Сентябрь.2025"). */
  davr: string | null;
  davrMatn: string | null;
  daraxt: F2Tugun[];
  jami: F2Jami;
  /** Barglar (pul) yig'indisi — XATO_QIYMAT qatorlarsiz. */
  qatorlarJami: number;
  barglarSoni: number;
  ishlarSoni: number;
  ogohlantirishlar: F2Ogohlantirish[];
  /** Anatomiya natijasi (ichki tekshiruv uchun). */
  anatomiya: VaraqAnatomiyasi;
}

// ─── Davr ────────────────────────────────────────────────────────────────────

const OYLAR: Array<[RegExp, number]> = [
  [/ЯНВАР|YANVAR/, 1], [/ФЕВРАЛ|FEVRAL/, 2], [/МАРТ|MART/, 3], [/АПРЕЛ|АРРЕЛ|APREL/, 4], [/(^|[^А-Я])МА[ЙЯ]([^А-Я]|$)|\bMAY\b/, 5],
  [/ИЮН|IYUN/, 6], [/ИЮЛ|IYUL/, 7], [/АВГУСТ|AVGUST/, 8], [/СЕНТЯБР|SENTYABR/, 9], [/ОКТЯБР|OKTYABR/, 10],
  [/НОЯБР|NOYABR/, 11], [/ДЕКАБР|DEKABR/, 12],
];

/** Matndan davr: oy nomi + yil (2020–2099). Faqat aniq topilsa. */
export function davrniOqi(matn: string): string | null {
  const k = kalit(matn);
  const yil = k.match(/\b(20[2-9]\d)\b/);
  if (!yil) return null;
  for (const [re, oy] of OYLAR) if (re.test(k)) return `${yil[1]}-${String(oy).padStart(2, '0')}`;
  return null;
}

function davrniTop(kitob: KirishKitob, aktVaraq: KirishVaraq): { davr: string | null; matn: string | null } {
  // Akt varag'ining yuqorisi → muqova ("Отчетный период") → boshqa varaqlar.
  const tartib = [aktVaraq, ...kitob.varaqlar.filter((v) => /ОБЛОЖК|ТИТУЛ/i.test(v.nom)), ...kitob.varaqlar.filter((v) => v !== aktVaraq)];
  for (const v of tartib) {
    for (const row of v.rows.slice(0, 40)) {
      for (const c of row) {
        const t = xom(c);
        if (!t || t.length > 120) continue;
        if (!/(^|\s)ЗА\s|ПЕРИОД|MUDDAT|DAVR|МЕСЯЦ|OY/i.test(t) && !/^[А-ЯA-Z][а-яa-z]+\.?\s*20\d\d$/.test(t)) continue;
        const d = davrniOqi(t);
        if (d) return { davr: d, matn: t };
      }
    }
  }
  return { davr: null, matn: null };
}

// ─── Daraxt ──────────────────────────────────────────────────────────────────

const XATO = /^#(REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!)/i;

function qiymatXatosi(v: VaraqAnatomiyasi, k: KirishVaraq, qator1: number): string | null {
  const u = v.ustunlar;
  if (!u) return null;
  const row = k.rows[qator1 - 1] ?? [];
  for (const c of [u.nom, u.hajmBirlikka, u.hajmLoyiha, u.narx, u.summa]) {
    if (c >= 0 && XATO.test(xom(row[c]))) return xom(row[c]);
  }
  return null;
}

function jamiTop(v: VaraqAnatomiyasi): F2Jami {
  const j = (re: RegExp) => v.jamilar.find((x) => re.test(kalit(x.xom)))?.qiymat ?? null;
  return {
    pryamye: j(/ПРЯМЫЕ/),
    // ⚠️ `\b` kirillni bilmaydi (JS) — chegara qo'lda.
    vsego: j(/^ВСЕГО(\s|:|$)/),
    ranee: j(/РАНЕЕ ОФОРМЛ/),
    raznica: j(/РАЗНИЦА/),
    nds: j(/^НДС(\s|$)/),
  };
}

/** Kitobdagi F2 akt varaq(lar)i: ishlari bor LRV shaklidagi varaqlar (СЧЁТ-ФАКТ, ОБЛОЖКА emas). */
export function f2AktlarniOqi(kitob: KirishKitob): F2Akt[] {
  const anat = kitobAnatomiyasi(kitob);
  const aktlar = anat.varaqlar.filter((v) => v.rol === 'lrv' && v.ishlar.length > 0);
  return aktlar.map((v) => aktQur(kitob, v));
}

function aktQur(kitob: KirishKitob, v: VaraqAnatomiyasi): F2Akt {
  const k = kitob.varaqlar.find((x) => x.nom === v.varaq)!;
  const ogoh: F2Ogohlantirish[] = [];
  const barchaSarlavha = [...v.titul, ...v.sarlavhalar];
  const rzXarita = new Map<string, F2Tugun>();
  const ildiz: F2Tugun[] = [];
  const uid = (m: Manzil) => `${m.varaq}!${m.qator}`;

  /** RZ zanjiri (titul/qurilish darajalari bundan tashqari — ular varaq sarlavhasi). */
  const rzTugun = (ish: Ish): F2Tugun | null => {
    const yol = sarlavhaYoli(barchaSarlavha, ish.sarlavha).filter((s) => s.tur !== 'qurilish' && s.tur !== 'obyekt');
    let ota: F2Tugun | null = null;
    const nomlar: string[] = [];
    for (const s of yol) {
      nomlar.push(s.xom);
      const kalitS = `${s.id}`;
      let t = rzXarita.get(kalitS);
      if (!t) {
        t = { uid: uid(s.manzil), tur: 'rz', kod: s.belgi, nom: s.xom, birlik: null, hajm: null, narx: null, summa: null, manzil: s.manzil, yol: nomlar.slice(0, -1), bolalar: [], barg: false };
        rzXarita.set(kalitS, t);
        if (ota) ota.bolalar.push(t); else ildiz.push(t);
      }
      ota = t;
    }
    return ota;
  };

  let qatorlarJami = 0;
  let barglar = 0;
  let ishlar = 0;
  for (const ish of v.ishlar) {
    const ota = rzTugun(ish);
    const yol = ota ? [...ota.yol, ota.nom] : [];
    const ishXato = qiymatXatosi(v, k, ish.manzil.qator);
    const bl: F2Tugun = {
      uid: uid(ish.manzil), tur: 'bl', kod: ish.shifr, nom: ish.xom, birlik: ish.birlik,
      hajm: ish.hajm, narx: ish.narx, summa: ish.summa, manzil: ish.manzil, yol, bolalar: [],
      barg: ish.resurslar.length === 0,
      ...(ish.belgi ? { belgi: ish.belgi } : {}),
    };
    if (ish.hajm == null && !ishXato) {
      ogoh.push({ kod: 'HAJMSIZ_ISH', izoh: `${ish.tartib}-ish "${ish.xom.slice(0, 50)}" — hajmi bo'sh: shu oy bajarilmagan deb olinadi (aktga kirmaydi)`, manzil: ish.manzil });
      continue;
    }
    ishlar++;
    if (ishXato) {
      (bl.ogohlantirish ??= []).push(`katakda ${ishXato}`);
      ogoh.push({ kod: 'XATO_QIYMAT', izoh: `${ish.tartib}-ish: katakda ${ishXato} (tashqi faylga havola) — qiymat noma'lum`, manzil: ish.manzil });
    }
    if ((ish.hajm ?? 0) < 0) ogoh.push({ kod: 'MANFIY_QATOR', izoh: `${ish.tartib}-ish: manfiy hajm ${ish.hajm} — перерасчет (oldingi F2 kamayadi)`, manzil: ish.manzil });
    for (const r of ish.resurslar) {
      const rt = resursTugun(r, [...yol, ish.xom]);
      const xato = qiymatXatosi(v, k, r.manzil.qator);
      if (xato) {
        (rt.ogohlantirish ??= []).push(`katakda ${xato}`);
        ogoh.push({ kod: 'XATO_QIYMAT', izoh: `${r.tartib} "${(r.xom || r.kod || '').slice(0, 40)}": katakda ${xato} — qiymat noma'lum`, manzil: r.manzil });
      } else if (r.summa != null) {
        qatorlarJami += r.summa;
      }
      if (!r.xom) ogoh.push({ kod: 'NOMSIZ_RESURS', izoh: `${r.tartib} (kod ${r.kod ?? '—'}) — nomi bo'sh; kod bo'yicha bog'lanadi`, manzil: r.manzil });
      barglar++;
      bl.bolalar.push(rt);
    }
    if (bl.barg) {
      barglar++;
      if (!ishXato && ish.summa != null) qatorlarJami += ish.summa;
    }
    if (ota) ota.bolalar.push(bl); else ildiz.push(bl);
  }

  const jami = jamiTop(v);
  const { davr, matn } = davrniTop(kitob, k);
  if (!davr) ogoh.push({ kod: 'DAVR_YOQ', izoh: 'hisobot davri (oy, yil) fayldan topilmadi — qo‘lda tanlang' });
  if (jami.pryamye != null && Math.abs(jami.pryamye - qatorlarJami) > 1) {
    ogoh.push({ kod: 'JAMI_FARQ', izoh: farqTushuntir(jami.pryamye, qatorlarJami, v) });
  }
  return {
    fayl: kitob.fayl, varaq: v.varaq, davr, davrMatn: matn, daraxt: ildiz, jami,
    qatorlarJami, barglarSoni: barglar, ishlarSoni: ishlar, ogohlantirishlar: ogoh, anatomiya: v,
  };
}

function resursTugun(r: Resurs, yol: string[]): F2Tugun {
  return {
    uid: `${r.manzil.varaq}!${r.manzil.qator}`, tur: 'rs', kod: r.kod, nom: r.xom || (r.kod ? `(nomsiz, kod ${r.kod})` : '(nomsiz)'),
    birlik: r.birlik, hajm: r.hajm, narx: r.narx, summa: r.summa, norma: r.normaBirlikka, manzil: r.manzil, yol, bolalar: [], barg: true,
  };
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);

/** Hujjat jami ↔ qatorlar: farq aynan oxirgi (yoki birinchi) bir necha ishlar yig'indisiga
 *  teng bo'lsa — ularni ko'rsatadi (hujjat formulasi ularni qamramagan). */
export function farqTushuntir(hujjat: number, qatorlar: number, v: VaraqAnatomiyasi): string {
  const farq = qatorlar - hujjat;
  const asos = `Hujjatdagi ИТОГО ПРЯМЫЕ ЗАТРАТЫ ${fmt(hujjat)}, qatorlar yig'indisi ${fmt(qatorlar)} — farq ${fmt(farq)}`;
  const ishPuli = v.ishlar.map((i) => (i.resurslar.length ? i.resurslar.reduce((s, r) => s + (r.summa ?? 0), 0) : (i.summa ?? 0)));
  const tekshir = (tartib: number[]) => {
    let s = 0;
    for (let n = 0; n < tartib.length && n < 30; n++) {
      s += ishPuli[tartib[n]];
      if (Math.abs(s - farq) <= 1) return tartib.slice(0, n + 1);
    }
    return null;
  };
  // Farq aynan bitta pozitsiyaga teng (masalan zamena «~» materiali hujjat jamisiga kiritilmagan).
  const yakka = ishPuli.findIndex((p) => p !== 0 && Math.abs(p - farq) <= 1);
  if (yakka >= 0) {
    const i = v.ishlar[yakka];
    const b = i.belgi === 'zamena' ? 'zamena (~) ' : i.belgi === 'qoshimcha' ? "qo'shimcha (+) " : '';
    return `${asos}: farq aynan ${b}${i.tartib ? `${i.tartib}-ish ` : ''}(${i.shifr ?? ''}, ${i.manzil.qator}-qator) "${i.xom.slice(0, 50)}" summasiga teng — u hujjat formulasiga kirmagan. Qatorlar o'zaro to'g'ri.`;
  }
  const oxiri = tekshir(v.ishlar.map((_, i) => v.ishlar.length - 1 - i));
  const boshi = oxiri ? null : tekshir(v.ishlar.map((_, i) => i));
  const topildi = oxiri ?? boshi;
  if (topildi && farq > 0) {
    const nomlar = [...topildi].sort((a, b) => a - b).map((i) => `${v.ishlar[i].tartib}-ish (${v.ishlar[i].shifr ?? ''}, ${v.ishlar[i].manzil.qator}-qator)`);
    return `${asos}: ${nomlar.join(', ')} hujjat formulasiga kirmagan. Qatorlar to'g'ri — hujjat jami noto'g'ri bo'lishi mumkin.`;
  }
  return `${asos}. Qatorlar o'zaro to'g'ri (summa = hajm × narx); hujjat jami formulasini tekshiring.`;
}
