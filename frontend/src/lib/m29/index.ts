/**
 * М-29 — ОТЧЁТ О РАСХОДЕ ОСНОВНЫХ МАТЕРИАЛОВ В СТРОИТЕЛЬСТВЕ В СОПОСТАВЛЕНИИ
 * С РАСХОДОМ, ОПРЕДЕЛЁННЫМ ПО ПРОИЗВОДСТВЕННЫМ НОРМАМ.
 *
 * Egasi (2026-09-28): "M29 oylik va umumiy hamma davr uchun qilib beradigan
 * narsa yo'q. Haqiqiy tizimda resurs va ostatka nazorati to'g'ridan-to'g'ri
 * foydaga katta aloqasi bor" + (o'sha kun) "sarflash kiritilmagan bo'lsa tizim
 * aytsin — bularni qayerga ishlatding".
 *
 * TOZA modul (UI yo'q, ikkinchi hisob yo'q). Manbalar kanonik:
 *   - NORMA BO'YICHA sarf — tasdiqlangan F2 (`t2_f2_tafsilot`, akt_holat=
 *     'tasdiqlangan'): resurs qatorining o'z F2 miqdori (F2 resurs sarfini
 *     o'zi yozadi) yoki, resurs F2 da alohida bo'lmasa, ish (bl) F2 hajmi ×
 *     smeta normasi (`t2_qator.norma`; yo'q bo'lsa resurs hajmi / ish hajmi).
 *     Bazada tekshirilgan: resurs hajmi = norma × ish hajmi.
 *   - HAQIQIY sarf — sklad chiqimi (`t2_sklad_harakat`, operatsiya='rasxod');
 *     kirim ('prixod') — ostatka uchun.
 * Bog'lash: material = normNom(nom) + normBir(birlik) (M-29 materiallar
 * bo'yicha, kodlar farq qilsa ham bir material). Sklad yozuvi shu kalit bilan.
 *
 * Qonunlar: NULL ≠ 0 — skladda umuman uchramagan material uchun "фактически"
 * NOMA'LUM (bo'sh), nol emas; farq ham bo'sh. Hech narsa jim to'g'irlanmaydi —
 * perерасход, asossiz chiqim ("qayerga ishlatildi?"), normasi noma'lum ish,
 * smetada yo'q sklad materiali — hammasi DIQQAT ro'yxatida.
 */
import { normBir, normNom } from '../f2-match-engine';
import { nakrutkaKat } from '../nakrutka-podval';

export interface M29SmetaQator {
  id: number; ota_id: number | null; tur: string | null;
  kod: string | null; nom: string | null; birlik: string | null;
  hajm: number | null; narx: number | null; norma?: number | null; kat: string | null;
}
export interface M29F2Qator { qator_id: number; oy: string; hajm: number | null; akt_holat: string }
export interface M29SkladQator { operatsiya: string; sana: string; nomi: string | null; birligi: string | null; obyomi: number | null }

export interface M29Kirish { smeta: readonly M29SmetaQator[]; f2: readonly M29F2Qator[]; sklad: readonly M29SkladQator[] }

/** M-29 guruhlari (hujjat tartibi). ЧЕЛ/МАШ — M-29 ga kirmaydi. */
export const M29_GURUHLAR = [
  { kat: 'МАТ', nom: 'МАТЕРИАЛЫ' },
  { kat: 'КАБ', nom: 'КАБЕЛИ И ПРОВОДА' },
  { kat: 'М/К', nom: 'МЕТАЛЛОКОНСТРУКЦИИ' },
  { kat: 'ОБ', nom: 'ОБОРУДОВАНИЕ' },
] as const;
export type M29Kat = typeof M29_GURUHLAR[number]['kat'];

export interface M29Ish {
  blId: number; kod: string | null; nom: string; birlik: string | null;
  /** Ish birligiga material normasi (null — noma'lum). */
  norma: number | null;
  /** Ish hajmi (tasdiqlangan F2): davr va boshidan. */
  /** null — F2 da ish hajmi yozilmagan (faqat resurs miqdori bor): NULL ≠ 0. */
  hajmOy: number | null; hajmJami: number | null;
  /** Shu ish bo'yicha normativ sarf. */
  normaOy: number; normaJami: number;
  /** Resurs F2 da o'zi yozilgan (true) yoki ish hajmi × norma (false). */
  toGridan: boolean;
}

export interface M29Material {
  kalit: string; kat: M29Kat; kod: string | null; nom: string; birlik: string | null;
  /** Smeta narxi (hajm bo'yicha o'rtacha); farqli narxlar bo'lsa ham o'rtacha, izohda. */
  narx: number | null; narxlarFarqli: boolean;
  smetaHajm: number;
  normaOy: number; normaJami: number;
  /** Sklad chiqimi — skladda umuman yo'q bo'lsa null (NULL ≠ 0). */
  faktOy: number | null; faktJami: number | null;
  /** fakt − norma: + перерасход, − экономия. */
  farqOy: number | null; farqJami: number | null;
  /** farqJami × narx — foydaga ta'sir (+ yo'qotish, − tejash). */
  farqSummaJami: number | null;
  kirimJami: number | null;
  /** Skladdagi qoldiq = kirim − chiqim (boshidan). */
  skladQoldiq: number | null;
  ishlar: M29Ish[];
}

export interface M29Diqqat { tur: 'PERERASXOD' | 'ASOSSIZ_CHIQIM' | 'NORMA_YOQ' | 'SMETADA_YOQ' | 'SKLAD_KIRITILMAGAN' | 'NARX_FARQLI'; nom: string; sabab: string; summa?: number | null }

export interface M29Natija {
  davr: string;
  guruhlar: Array<{ kat: M29Kat; nom: string; materiallar: M29Material[]; farqSummaJami: number | null; normaSummaJami: number | null }>;
  /** Smetada yo'q, lekin skladdan chiqarilgan materiallar — "qayerga ishlatildi?". */
  smetadaYoq: Array<{ nomi: string; birligi: string | null; kirimJami: number; chiqimOy: number; chiqimJami: number }>;
  diqqat: M29Diqqat[];
  jami: { farqSummaJami: number | null; tejashSumma: number; ortiqchaSumma: number };
}

const matKalit = (nom: unknown, bir: unknown) => `${normNom(nom)}||${normBir(bir)}`;
const EPS = 1e-9;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

function m29Kat(q: M29SmetaQator): M29Kat | null {
  const k = nakrutkaKat(q.kat);
  if (k === 'МАТ' || k === 'КАБ' || k === 'М/К' || k === 'ОБ') return k;
  if (k) return null; // ЧЕЛ / МАШ
  return q.tur === 'mat' ? 'МАТ' : q.tur === 'ob' ? 'ОБ' : null;
}

/** «YYYY-MM» (davr) — oy va boshidan beri. */
export function m29Hisobla(k: M29Kirish, davr: string): M29Natija {
  const oyMos = (oy: string) => oy.slice(0, 7) === davr;
  const jamiMos = (oy: string) => oy.slice(0, 7) <= davr;
  const byId = new Map(k.smeta.map((q) => [q.id, q]));

  // Tasdiqlangan F2 — qator bo'yicha oy/jami hajmlar.
  const f2Oy = new Map<number, number>(), f2Jami = new Map<number, number>(), f2Bor = new Set<number>();
  for (const f of k.f2) {
    if (f.akt_holat !== 'tasdiqlangan' || f.hajm == null) continue;
    f2Bor.add(f.qator_id);
    if (jamiMos(f.oy)) f2Jami.set(f.qator_id, (f2Jami.get(f.qator_id) ?? 0) + f.hajm);
    if (oyMos(f.oy)) f2Oy.set(f.qator_id, (f2Oy.get(f.qator_id) ?? 0) + f.hajm);
  }

  const diqqat: M29Diqqat[] = [];
  const mats = new Map<string, M29Material & { _narxS: number; _narxH: number; _narxlar: Set<number> }>();
  const normaYoqIshlar = new Set<string>();

  for (const r of k.smeta) {
    if (r.tur === 'rz' || r.tur === 'bl') continue;
    const kat = m29Kat(r);
    if (!kat) continue;
    const kalit = matKalit(r.nom, r.birlik);
    let m = mats.get(kalit);
    if (!m) {
      m = {
        kalit, kat, kod: r.kod, nom: r.nom ?? '', birlik: r.birlik, narx: null, narxlarFarqli: false, smetaHajm: 0,
        normaOy: 0, normaJami: 0, faktOy: null, faktJami: null, farqOy: null, farqJami: null, farqSummaJami: null,
        kirimJami: null, skladQoldiq: null, ishlar: [], _narxS: 0, _narxH: 0, _narxlar: new Set(),
      };
      mats.set(kalit, m);
    }
    m.smetaHajm += r.hajm ?? 0;
    if (r.narx != null && r.narx > 0) {
      m._narxlar.add(r.narx);
      const w = r.hajm && r.hajm > 0 ? r.hajm : 1;
      m._narxS += r.narx * w; m._narxH += w;
    }

    const bl = r.ota_id != null ? byId.get(r.ota_id) : undefined;
    const blNom = bl?.nom ?? '(ish aniqlanmagan)';
    let ish: M29Ish | null = null;
    if (f2Bor.has(r.id)) {
      // Resurs F2 da o'zi yozilgan — uning miqdori normativ sarf.
      const blBor = !!bl && f2Bor.has(bl.id);
      const bh = blBor ? { oy: f2Oy.get(bl!.id) ?? 0, jami: f2Jami.get(bl!.id) ?? 0 } : { oy: null, jami: null };
      ish = {
        blId: bl?.id ?? r.id, kod: bl?.kod ?? null, nom: blNom, birlik: bl?.birlik ?? null,
        norma: r.norma ?? (bl?.hajm ? (r.hajm ?? 0) / bl.hajm : null),
        hajmOy: bh.oy, hajmJami: bh.jami,
        normaOy: f2Oy.get(r.id) ?? 0, normaJami: f2Jami.get(r.id) ?? 0, toGridan: true,
      };
    } else if (bl && f2Bor.has(bl.id)) {
      const norma = r.norma ?? (bl.hajm && bl.hajm > 0 && r.hajm != null ? r.hajm / bl.hajm : null);
      const hOy = f2Oy.get(bl.id) ?? 0, hJ = f2Jami.get(bl.id) ?? 0;
      ish = {
        blId: bl.id, kod: bl.kod, nom: blNom, birlik: bl.birlik, norma, hajmOy: hOy, hajmJami: hJ,
        normaOy: norma == null ? 0 : r6(norma * hOy), normaJami: norma == null ? 0 : r6(norma * hJ), toGridan: false,
      };
      if (norma == null && hJ > EPS) normaYoqIshlar.add(`${r.nom} — ${blNom}`);
    }
    if (ish && (ish.normaJami > EPS || (ish.hajmJami ?? 0) > EPS)) {
      m.ishlar.push(ish);
      m.normaOy += ish.normaOy; m.normaJami += ish.normaJami;
    }
  }
  for (const x of normaYoqIshlar) diqqat.push({ tur: 'NORMA_YOQ', nom: x, sabab: 'норма расхода в смете не указана — расход по норме не определён' });

  // Sklad: kalit bo'yicha kirim/chiqim.
  const skl = new Map<string, { nomi: string; birligi: string | null; kirimJ: number; chiqimOy: number; chiqimJ: number }>();
  for (const s of k.sklad) {
    if (s.obyomi == null || !s.sana) continue;
    const oy = s.sana.slice(0, 7);
    if (!jamiMos(oy)) continue;
    const kalit = matKalit(s.nomi, s.birligi);
    const x = skl.get(kalit) ?? { nomi: s.nomi ?? '', birligi: s.birligi, kirimJ: 0, chiqimOy: 0, chiqimJ: 0 };
    if (s.operatsiya === 'prixod') x.kirimJ += s.obyomi;
    else if (s.operatsiya === 'rasxod') { x.chiqimJ += s.obyomi; if (oy === davr) x.chiqimOy += s.obyomi; }
    skl.set(kalit, x);
  }

  const smetadaYoq: M29Natija['smetadaYoq'] = [];
  for (const [kalit, x] of skl) {
    const m = mats.get(kalit);
    if (!m) {
      smetadaYoq.push({ nomi: x.nomi, birligi: x.birligi, kirimJami: x.kirimJ, chiqimOy: x.chiqimOy, chiqimJami: x.chiqimJ });
      if (x.chiqimJ > EPS) diqqat.push({ tur: 'SMETADA_YOQ', nom: `${x.nomi} (${x.birligi ?? '—'})`, sabab: `со склада списано ${fmt(x.chiqimJ)}, но в смете такого материала нет — где использован?` });
      continue;
    }
    m.faktOy = x.chiqimOy; m.faktJami = x.chiqimJ; m.kirimJami = x.kirimJ;
    m.skladQoldiq = r6(x.kirimJ - x.chiqimJ);
  }

  // Yakuniy hisob va diqqat.
  let tejash = 0, ortiqcha = 0, farqJamiSum: number | null = 0;
  const guruhlar: M29Natija['guruhlar'] = M29_GURUHLAR.map((g) => ({ kat: g.kat, nom: g.nom, materiallar: [] as M29Material[], farqSummaJami: 0 as number | null, normaSummaJami: 0 as number | null }));
  for (const m of mats.values()) {
    const faol = m.normaJami > EPS || (m.faktJami ?? 0) > EPS || (m.kirimJami ?? 0) > EPS;
    if (!faol) continue;
    m.narx = m._narxH > 0 ? r6(m._narxS / m._narxH) : null;
    m.narxlarFarqli = m._narxlar.size > 1;
    m.normaOy = r6(m.normaOy); m.normaJami = r6(m.normaJami);
    if (m.faktJami != null) {
      m.farqOy = r6((m.faktOy ?? 0) - m.normaOy);
      m.farqJami = r6(m.faktJami - m.normaJami);
      m.farqSummaJami = m.narx == null ? null : Math.round(m.farqJami * m.narx * 100) / 100;
    }
    const nomi = `${m.nom} (${m.birlik ?? '—'})`;
    if (m.faktJami == null && m.normaJami > EPS) {
      diqqat.push({ tur: 'SKLAD_KIRITILMAGAN', nom: nomi, sabab: `по норме израсходовано ${fmt(m.normaJami)}, списание со склада не внесено — фактический расход неизвестен` });
    } else if (m.farqJami != null && m.farqJami > EPS) {
      if (m.normaJami <= EPS) diqqat.push({ tur: 'ASOSSIZ_CHIQIM', nom: nomi, sabab: `со склада списано ${fmt(m.faktJami!)}, а работ с этим материалом по утверждённым Ф-2 нет — где использован?`, summa: m.farqSummaJami });
      else diqqat.push({ tur: 'PERERASXOD', nom: nomi, sabab: `перерасход ${fmt(m.farqJami)} (${fmt(m.farqJami / m.normaJami * 100)} %) сверх нормы`, summa: m.farqSummaJami });
    }
    if (m.narxlarFarqli) diqqat.push({ tur: 'NARX_FARQLI', nom: nomi, sabab: 'в смете у материала разные цены — сумма отклонения по средней цене' });
    if (m.farqSummaJami != null) { if (m.farqSummaJami > 0) ortiqcha += m.farqSummaJami; else tejash += -m.farqSummaJami; }
    const g = guruhlar.find((x) => x.kat === m.kat)!;
    g.materiallar.push(m);
  }
  for (const g of guruhlar) {
    g.materiallar.sort((a, b) => a.nom.localeCompare(b.nom, 'ru'));
    let fs: number | null = 0, ns: number | null = 0;
    for (const m of g.materiallar) {
      if (m.farqSummaJami == null) { if (m.faktJami != null) fs = null; } else if (fs != null) fs += m.farqSummaJami;
      if (m.narx == null) ns = null; else if (ns != null) ns += m.normaJami * m.narx;
    }
    g.farqSummaJami = fs == null ? null : Math.round(fs * 100) / 100;
    g.normaSummaJami = ns == null ? null : Math.round(ns * 100) / 100;
    if (g.farqSummaJami == null) farqJamiSum = null; else if (farqJamiSum != null) farqJamiSum += g.farqSummaJami;
  }
  // Tartib: eng katta pul ta'siri birinchi.
  diqqat.sort((a, b) => Math.abs(b.summa ?? 0) - Math.abs(a.summa ?? 0));
  return {
    davr, guruhlar: guruhlar.filter((g) => g.materiallar.length), smetadaYoq, diqqat,
    jami: { farqSummaJami: farqJamiSum == null ? null : Math.round(farqJamiSum * 100) / 100, tejashSumma: Math.round(tejash * 100) / 100, ortiqchaSumma: Math.round(ortiqcha * 100) / 100 },
  };
}

function fmt(x: number): string {
  return x.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}
