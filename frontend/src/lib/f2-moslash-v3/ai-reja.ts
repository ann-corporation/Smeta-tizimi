/**
 * B8 — F2 YORDAMCHI REJASI (toza mantiq, AI SIZ). «Shu oy nima bajarildi?» matni → niyatlar → smeta ishlariga moslash → reja.
 *
 * Qoidalar (egasi/koordinator 2026-10-24):
 *  - Reja HECH NARSA YOZMAYDI: natija — jadval + `kiritma` (faqat ✓ qatorlar uchun hajm); operator «Qoralamaga qo'shish» ni bosadi.
 *  - Norma/narx/hajm to'qilmaydi: moslash — nom/birlik/razdel bo'yicha; hajm — faqat matndagi son yoki ifoda (kod hisoblaydi);
 *    pul — f2-tayyor (oldingi F2 / smeta narxi) hisobi.
 *  - ✓ FAQAT yagona nomzod yoki operator razdelni ko'rsatgan bo'lsa. Matnda joy/razdel yo'q va mos ish bir necha razdelda
 *    bo'lsa — ◐ (razdel tanlovi bilan). Topilmasa — ✕ (qo'shimcha ish taklifi sifatida qoladi).
 *  - Hajm bo'yicha BLOK yo'q: qoldiqdan oshsa faqat ogohlantirish.
 * AI qatlami (keyingi PR) faqat matnni `IshNiyati[]` ga aylantiradi; shu modul esa deterministik.
 */
import { normBir, normNom, normRz } from '../f2-match-engine';
import { ifodaHisobla } from '../smeta-ai/ifoda';
import { bosKiritma, f2Jami, f2Qatorlar, type F2Bolim, type F2Ish, type F2Kiritma } from '../f2-tayyor';

export interface IshNiyati {
  /** Matndan: ish tavsifi («betonlash», «армирование фундамента»). */
  tavsif: string;
  birlik?: string | null;
  /** Son (m3 ...) yoki ifoda («12*0,6*0,1») — kod hisoblaydi. */
  hajm?: number | string | null;
  /** Operator ko'rsatgan razdel/joy («fundament», «ЗЕМЛЯНЫЕ РАБОТЫ»). */
  razdel?: string | null;
  /** Operator ◐ da aniq ishni tanlagan — shu ish (✓, operator qarori). */
  tanlanganIsh?: number | null;
}

export type RejaHolat = 'aniq' | 'taklif' | 'topilmadi';

export interface RejaNomzod { ishId: number; razdelId: number | null; razdelNom: string; kod: string | null; nom: string; birlik: string | null; ball: number }

export interface RejaQator {
  niyat: IshNiyati;
  holat: RejaHolat;
  /** ✓ bo'lsa — tanlangan ish. */
  ishId: number | null;
  nomzodlar: RejaNomzod[];
  hajm: number | null;
  /** F2 ga olish mumkin qoldiq / smeta / oldin olingan (tanlangan ish bo'yicha). */
  mumkin: number | null;
  olingan: number | null;
  /** Shu hajm uchun pul (f2-tayyor hisobi: resurslar normadan, narx manbasi bilan); noma'lum — null. */
  pul: number | null;
  /** Bitta qisqa jumla: qaysi so'z → qaysi qator. */
  dalil: string;
  ogoh: string[];
}

export interface Reja {
  qatorlar: RejaQator[];
  /** Faqat ✓ qatorlar (operator «Qoralamaga qo'shish» bosganda f2-tayyorlash kiritmasiga tushadi). */
  kiritma: F2Kiritma;
  jami: { aniq: number; taklif: number; topilmadi: number; pul: number };
}

// ─── Matn → niyatlar ─────────────────────────────────────────────────────────

const BIRLIK = '(?:м3|м³|m3|м2|м²|m2|мп|м\\.п\\.|п\\.м|м|m|т|t|кг|kg|шт|sht|компл|komp|л|l)';
const RAZDEL_QAYD = /(?:^|\s)(?:razdel|bo['‘’`]?lim|раздел|в\s+разделе|в\s+р\.)\s*[:\-–]?\s*([^,;()]+)/i;

/**
 * Oddiy qatorlar: «betonlash 120 m3», «Армирование фундамента — 5 т (Фундаменты)», «gruntni qazish 12*0,6*0,1 м3».
 * Har satr/«;» bitta niyat. Tushunilmagan satr hajmsiz niyat bo'lib qoladi (hajm kerak deb ko'rsatiladi) — jim tashlanmaydi.
 */
export function matnniNiyatlarga(matn: string): IshNiyati[] {
  const out: IshNiyati[] = [];
  for (const xom of String(matn ?? '').split(/[\n;]+/)) {
    let s = xom.trim().replace(/^[-•*\d.)\s]+(?=[A-Za-zА-Яа-яЎўҚқҒғҲҳ])/, '');
    if (!s) continue;
    let razdel: string | null = null;
    const qavs = s.match(/\(([^()]{3,80})\)\s*$/);
    if (qavs && !new RegExp(`^[\\d\\s.,*×x+\\-/]*${BIRLIK}?$`, 'i').test(qavs[1].trim())) { razdel = qavs[1].trim(); s = s.slice(0, qavs.index).trim(); }
    const rm = s.match(RAZDEL_QAYD);
    if (rm) { razdel = rm[1].trim(); s = s.slice(0, rm.index).trim(); }
    // Oxiridagi «<ifoda/son> <birlik>».
    const m = s.match(new RegExp(`^(.*?)[\\s:—–-]+([\\d][\\d\\s.,*×x/+()\\-−]*?)\\s*(${BIRLIK})?\\s*$`, 'i'));
    if (m && m[1].trim()) out.push({ tavsif: m[1].trim().replace(/[:—–-]+$/, '').trim(), birlik: m[3] ?? null, hajm: m[2].trim(), razdel });
    else out.push({ tavsif: s, birlik: null, hajm: null, razdel });
  }
  return out;
}

// ─── Moslash ─────────────────────────────────────────────────────────────────

/** So'z o'zagi: normNom (lotin→kirill) + 5 belgilik prefiks («бетонирование» ≈ «бетон»); qisqa/umumiy so'zlar tashlanadi. */
const TOXTASH = new Set(['РАБОТ', 'УСТРО', 'ПРИ', 'ДЛЯ', 'ЭТОГО', 'ВИДЫ', 'ISH', 'ISHL']);
function ozaklar(matn: string): string[] {
  const out = new Set<string>();
  for (const w of String(matn ?? '').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ')) {
    const n = normNom(w);
    if (n.length < 4 || /^\d+$/.test(n)) continue;
    const o = n.slice(0, 5);
    if (!TOXTASH.has(o)) out.add(o);
  }
  return [...out];
}

function ball(niyat: string[], ish: F2Ish, birlik: string | null | undefined): number {
  if (!niyat.length) return 0;
  const ishOz = new Set(ozaklar(`${ish.nom}`));
  const mos = niyat.filter((w) => ishOz.has(w)).length;
  if (!mos) return 0;
  let b = mos / niyat.length;
  if (birlik && ish.birlik) b *= normBir(birlik) === normBir(ish.birlik) ? 1 : 0.5; // birlik farqi ballni pasaytiradi (rad etmaydi)
  return b;
}

const ESHIK = 0.6;
const FARQ = 0.15;

function razdelMos(rz: string | null | undefined, razdelNom: string): boolean {
  if (!rz) return true;
  const a = normRz(rz), b = normRz(razdelNom);
  return !!a && (b.includes(a) || a.includes(b) || ozaklar(rz).every((w) => ozaklar(razdelNom).includes(w)));
}

function hajmOl(h: IshNiyati['hajm']): { son: number | null; xato?: string } {
  if (h == null || h === '') return { son: null };
  if (typeof h === 'number') return Number.isFinite(h) && h > 0 ? { son: h } : { son: null, xato: 'hajm 0 dan katta son bo‘lsin' };
  try {
    const v = Number(ifodaHisobla(h).qiymat);
    return Number.isFinite(v) && v > 0 ? { son: v } : { son: null, xato: 'hajm 0 dan katta son bo‘lsin' };
  } catch { return { son: null, xato: `hajm ifodasi noto‘g‘ri: «${String(h).slice(0, 40)}»` }; }
}

export function rejaTuz(niyatlar: readonly IshNiyati[], bolimlar: readonly F2Bolim[]): Reja {
  const kiritma = bosKiritma();
  const qatorlar: RejaQator[] = [];
  for (const niyat of niyatlar) {
    const oz = ozaklar(niyat.tavsif);
    const hajm = hajmOl(niyat.hajm);
    const ogoh: string[] = [];
    if (hajm.xato) ogoh.push(hajm.xato);
    const nomzod: RejaNomzod[] = [];
    const bolimSoni = new Map<number | null, number>();
    for (const b of bolimlar) for (const ish of b.ishlar) {
      const bl = ball(oz, ish, niyat.birlik);
      if (bl >= ESHIK) nomzod.push({ ishId: ish.id, razdelId: b.id, razdelNom: b.nom, kod: ish.kod, nom: ish.nom, birlik: ish.birlik, ball: bl });
    }
    nomzod.sort((x, y) => y.ball - x.ball || x.ishId - y.ishId);
    const qaror = niyat.tanlanganIsh != null ? nomzod.find((n) => n.ishId === niyat.tanlanganIsh) ?? null : null;
    for (const n of nomzod) bolimSoni.set(n.razdelId, (bolimSoni.get(n.razdelId) ?? 0) + 1);
    const korsatilgan = !!niyat.razdel?.trim();
    const tanlov = korsatilgan ? nomzod.filter((n) => razdelMos(niyat.razdel, n.razdelNom)) : nomzod;
    let holat: RejaHolat = 'topilmadi';
    let ish: RejaNomzod | null = null;
    let dalil = '';
    if (qaror) {
      holat = 'aniq'; ish = qaror; dalil = `«${niyat.tavsif}» → ${qaror.kod ? qaror.kod + ' ' : ''}${qaror.nom} (${qaror.razdelNom}) — operator tanlagan.`;
    } else if (!nomzod.length) {
      dalil = `«${niyat.tavsif}» — smetada mos ish topilmadi (qo‘shimcha ish sifatida kiriting).`;
    } else if (korsatilgan && !tanlov.length) {
      holat = 'taklif';
      dalil = `«${niyat.razdel}» razdelida mos ish yo‘q; boshqa razdellarda ${nomzod.length} ta nomzod bor — razdelni tanlang.`;
    } else {
      const eng = tanlov[0], ikkinchi = tanlov[1];
      const razdelDa = new Set(tanlov.map((n) => n.razdelId));
      const yagona = tanlov.length === 1 || (!!ikkinchi && eng.ball - ikkinchi.ball >= FARQ && razdelDa.size === 1) || (korsatilgan && (!ikkinchi || eng.ball - ikkinchi.ball >= FARQ));
      // Razdel ko'rsatilmagan va mos ish bir necha razdelda — ✓ EMAS (egasining razdel qoidasi).
      const kopRazdel = !korsatilgan && new Set(nomzod.filter((n) => n.ball >= eng.ball - FARQ).map((n) => n.razdelId)).size > 1;
      if (yagona && !kopRazdel) { holat = 'aniq'; ish = eng; dalil = `«${niyat.tavsif}» → ${eng.kod ? eng.kod + ' ' : ''}${eng.nom} (${eng.razdelNom})${korsatilgan ? ' — razdel ko‘rsatilgan' : ' — yagona nomzod'}.`; }
      else {
        holat = 'taklif';
        dalil = kopRazdel
          ? `«${niyat.tavsif}» bir necha razdelda bor (${[...new Set(nomzod.map((n) => n.razdelNom))].slice(0, 3).join('; ')}) — razdelni tanlang.`
          : `«${niyat.tavsif}» uchun ${tanlov.length} ta yaqin nomzod — to‘g‘risini tanlang.`;
      }
    }
    qatorlar.push({ niyat, holat, ishId: ish?.ishId ?? null, nomzodlar: nomzod.slice(0, 8), hajm: hajm.son, mumkin: null, olingan: null, pul: null, dalil, ogoh });
  }
  // ✓ qatorlar: qoldiq/oldingi, kiritma, pul (f2-tayyor hisobi).
  const ishById = new Map<number, F2Ish>();
  for (const b of bolimlar) for (const i of b.ishlar) ishById.set(i.id, i);
  for (const q of qatorlar) {
    if (q.holat !== 'aniq' || q.ishId == null) continue;
    const ish = ishById.get(q.ishId)!;
    q.mumkin = ish.mumkin; q.olingan = ish.olingan;
    if (q.hajm == null) { q.ogoh.push('hajm kiritilmagan — F2 ga olinmaydi'); continue; }
    if (q.hajm > ish.mumkin + 1e-9) q.ogoh.push(`qoldiqdan oshadi (+${Math.round((q.hajm - ish.mumkin) * 1e6) / 1e6}) — faqat ogohlantirish`);
    kiritma.hajm[q.ishId] = String((kiritma.hajm[q.ishId] ? Number(kiritma.hajm[q.ishId]) : 0) + q.hajm);
  }
  // Pul: har ✓ qator uchun alohida hisob (resurslar normadan, narx manbasi bilan).
  for (const q of qatorlar) {
    if (q.holat !== 'aniq' || q.ishId == null || q.hajm == null) continue;
    const bitta = bosKiritma(); bitta.hajm[q.ishId] = String(q.hajm);
    const f = f2Qatorlar(bolimlar as F2Bolim[], bitta);
    const j = f2Jami(f);
    q.pul = j.narxsiz > 0 ? null : j.summa;
    if (j.narxsiz > 0) q.ogoh.push('narx manbasi yo‘q resurslar bor — pul to‘liq emas');
  }
  const jami = { aniq: 0, taklif: 0, topilmadi: 0, pul: 0 };
  for (const q of qatorlar) { jami[q.holat === 'aniq' ? 'aniq' : q.holat === 'taklif' ? 'taklif' : 'topilmadi']++; if (q.pul != null) jami.pul += q.pul; }
  return { qatorlar, kiritma, jami };
}

/** Operator ◐ qatorda razdel/ishni tanlaganda: shu niyat uchun ✓ qilib qayta hisoblash (boshqa niyatlar o'zgarmaydi). */
export function nomzodniTanla(niyatlar: readonly IshNiyati[], bolimlar: readonly F2Bolim[], niyatIdx: number, nomzod: Pick<RejaNomzod, 'ishId'>): Reja {
  const yangi = niyatlar.map((n, i) => (i === niyatIdx ? { ...n, tanlanganIsh: nomzod.ishId } : n));
  return rejaTuz(yangi, bolimlar);
}
