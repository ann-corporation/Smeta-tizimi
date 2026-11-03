/**
 * TENDER takliflarini taqqoslash va baholash (sof funksiyalar, bazaga tegmaydi).
 * Taqqoslash QQS BILAN narx bo'yicha (to'lovchi bo'lmagan yetkazuvchi 0 %, boshqasi 12 %): xaridor aslida to'laydigan summa.
 * Noma'lum qiymat o'ylab topilmaydi: narx bermagan qator jamiga kirmaydi va taklif «to'liq emas» deb belgilanadi.
 * Ball: narx/muddat/kafolat/reyting avtomatik (0..100), to'lov sharti — baholovchi qo'lda; qo'lda ball yo'q mezon bo'lsa jami = null.
 */
import { yaxlit2 } from '../hisob-yadro';
import { pulJuft, qatorSumma } from './pul';

export type TQator = { id: number; qatorNo: number; lotNo: number; nom: string; birlik: string; miqdor: number };
export type TTaklifQator = { rfqQatorId: number; narx: number; muddatKun: number | null; mavjudMiqdor: number | null };
export type TTaklif = {
  id: number; yetkazuvchiId: number; nom: string;
  /** Taklifdagi QQS stavkasi (%); null = noma'lum. */
  qqsFoiz: number | null; yetkazishNarx: number | null;
  amalKun: number | null; kafolatOy: number | null;
  /** Reyting 1..5 (o'rtacha); null = hali baho yo'q. */
  reyting: number | null;
  qatorlar: TTaklifQator[];
};
export type Mezon = 'narx' | 'muddat' | 'tolov' | 'kafolat' | 'reyting';
export const MEZONLAR: readonly Mezon[] = ['narx', 'muddat', 'tolov', 'kafolat', 'reyting'];
export type Meyor = Partial<Record<Mezon, number>>;
/** Reytingi yo'q yetkazuvchiga beriladigan neytral ball (hujjatlashtirilgan siyosat; UI «taxminiy» deb ko'rsatadi). */
export const REYTING_NEYTRAL = 50;

export type Katak = {
  taklifId: number;
  /** Birlik narxi NDS siz / QQS bilan. */
  narx: number; narxQqsBilan: number | null;
  miqdor: number; summaQqsBilan: number | null; summaNdsSiz: number | null;
  muddatKun: number | null;
  /** Shu qatordagi eng arzon (QQS bilan) — teng bo'lsa hammasi belgilanadi. */
  eng: boolean;
  /** Mavjud miqdor talabdan kam. */
  qisman: boolean;
};
export type Satr = { qator: TQator; kataklar: Katak[]; engTaklifIdlar: number[] };
export type TaklifJami = {
  taklifId: number; nom: string; yetkazuvchiId: number;
  jamiNdsSiz: number | null; jamiQqsBilan: number | null; qqsSumma: number | null;
  yetkazishQqsBilan: number | null;
  yopilgan: number; jamiQator: number; toliq: boolean; maxMuddatKun: number | null;
  /** Qatorlar jami QQS stavkasi noma'lum bo'lsa true (QQS bilan hisoblab bo'lmaydi). */
  qqsNomalum: boolean;
};
export type Jadval = { satrlar: Satr[]; jami: TaklifJami[]; engArzonToliqId: number | null };

const sonmi = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function taqqoslashJadvali(qatorlar: readonly TQator[], takliflar: readonly TTaklif[]): Jadval {
  const satrlar: Satr[] = qatorlar.map((qator) => {
    const kataklar: Katak[] = [];
    for (const t of takliflar) {
      const tq = t.qatorlar.find((x) => x.rfqQatorId === qator.id);
      if (!tq || !sonmi(tq.narx)) continue;
      const miqdor = tq.mavjudMiqdor ?? qator.miqdor;
      const birlik = pulJuft(tq.narx, t.qqsFoiz);
      const summa = pulJuft(qatorSumma(miqdor, tq.narx), t.qqsFoiz);
      kataklar.push({ taklifId: t.id, narx: tq.narx, narxQqsBilan: birlik.qqsBilan, miqdor, summaQqsBilan: summa.qqsBilan, summaNdsSiz: summa.qqsSiz,
        muddatKun: tq.muddatKun, eng: false, qisman: tq.mavjudMiqdor != null && tq.mavjudMiqdor < qator.miqdor });
    }
    // Eng arzon: QQS bilan birlik narx; QQS noma'lum bo'lsa NDS siz narxga qaytamiz (baribir ogohlantirish ko'rsatiladi).
    const kalit = (k: Katak) => k.narxQqsBilan ?? k.narx;
    const min = kataklar.length ? Math.min(...kataklar.map(kalit)) : null;
    for (const k of kataklar) k.eng = min != null && kalit(k) === min;
    return { qator, kataklar, engTaklifIdlar: kataklar.filter((k) => k.eng).map((k) => k.taklifId) };
  });

  const jami: TaklifJami[] = takliflar.map((t) => {
    let siz = 0, yopilgan = 0, maxM: number | null = null;
    for (const s of satrlar) {
      const k = s.kataklar.find((x) => x.taklifId === t.id);
      if (!k || k.summaNdsSiz == null) continue;
      siz += k.summaNdsSiz; yopilgan++;
      if (k.muddatKun != null) maxM = Math.max(maxM ?? 0, k.muddatKun);
    }
    const toliq = yopilgan === qatorlar.length && qatorlar.length > 0 && satrlar.every((s) => !s.kataklar.find((x) => x.taklifId === t.id)?.qisman);
    const yet = sonmi(t.yetkazishNarx) ? t.yetkazishNarx : 0;
    const jamiSiz = yopilgan > 0 ? yaxlit2(siz + yet) : null;
    const pj = pulJuft(jamiSiz, t.qqsFoiz);
    return { taklifId: t.id, nom: t.nom, yetkazuvchiId: t.yetkazuvchiId, jamiNdsSiz: jamiSiz, jamiQqsBilan: pj.qqsBilan, qqsSumma: pj.qqs,
      yetkazishQqsBilan: sonmi(t.yetkazishNarx) ? pulJuft(t.yetkazishNarx, t.qqsFoiz).qqsBilan : null,
      yopilgan, jamiQator: qatorlar.length, toliq, maxMuddatKun: maxM, qqsNomalum: t.qqsFoiz == null };
  });
  const toliqlar = jami.filter((j) => j.toliq && (j.jamiQqsBilan ?? j.jamiNdsSiz) != null);
  const val = (j: TaklifJami) => (j.jamiQqsBilan ?? j.jamiNdsSiz) as number;
  const eng = toliqlar.length ? [...toliqlar].sort((a, b) => val(a) - val(b) || (a.maxMuddatKun ?? Infinity) - (b.maxMuddatKun ?? Infinity) || a.taklifId - b.taklifId)[0] : null;
  return { satrlar, jami, engArzonToliqId: eng ? eng.taklifId : null };
}

/** Qator darajasida eng arzon taklifga bo'linma g'olib: [{taklifId, qatorIdlar}] (teng narxda — oldingi taklif id). */
export function engArzonBolinma(jadval: Jadval): { taklifId: number; qatorIdlar: number[] }[] {
  const m = new Map<number, number[]>();
  for (const s of jadval.satrlar) {
    if (!s.engTaklifIdlar.length) continue;
    const id = Math.min(...s.engTaklifIdlar);
    m.set(id, [...(m.get(id) ?? []), s.qator.id]);
  }
  return [...m].map(([taklifId, qatorIdlar]) => ({ taklifId, qatorIdlar })).sort((a, b) => a.taklifId - b.taklifId);
}

/** Tanlangan g'olib qatorlardan qaysilari eng arzon EMAS (asos yozilishi kerak). */
export function engArzonEmas(jadval: Jadval, tanlov: readonly { taklifId: number; qatorIdlar: readonly number[] }[]): number[] {
  const chiq: number[] = [];
  for (const t of tanlov) for (const qid of t.qatorIdlar) {
    const s = jadval.satrlar.find((x) => x.qator.id === qid);
    if (s && !s.engTaklifIdlar.includes(t.taklifId)) chiq.push(qid);
  }
  return chiq;
}

export type BallNatija = {
  taklifId: number;
  /** Mezon -> ball (0..100); null = hisoblab bo'lmadi / qo'lda kiritilmagan. */
  ballar: Partial<Record<Mezon, number | null>>;
  /** Ishlatilgan mezonlar vazni bo'yicha jami (0..100); biror vaznli mezon balli null bo'lsa — null. */
  jami: number | null;
  /** Ma'lumot taklifda ko'rsatilmagani uchun 0 yoki neytral ball berilgan mezonlar. */
  yetishmaydi: Mezon[];
  toliq: boolean;
};

/** min/qiymat * 100 (kichik yaxshi) yoki qiymat/max * 100 (katta yaxshi). */
const kichikYaxshi = (min: number, v: number) => (v <= 0 ? 100 : yaxlit2((min / v) * 100));
const kattaYaxshi = (max: number, v: number) => (max <= 0 ? 0 : yaxlit2((v / max) * 100));

export function ballashtir(jadval: Jadval, takliflar: readonly TTaklif[], meyor: Meyor, qolda: Readonly<Record<number, Partial<Record<Mezon, number>>>> = {}): BallNatija[] {
  const vazn = MEZONLAR.filter((m) => (meyor[m] ?? 0) > 0);
  const toliqJami = jadval.jami.filter((j) => j.toliq && (j.jamiQqsBilan ?? j.jamiNdsSiz) != null);
  const narxQiy = (j: TaklifJami) => (j.jamiQqsBilan ?? j.jamiNdsSiz) as number;
  const minNarx = toliqJami.length ? Math.min(...toliqJami.map(narxQiy)) : null;
  const muddatlar = jadval.jami.filter((j) => j.toliq && j.maxMuddatKun != null).map((j) => j.maxMuddatKun as number);
  const minMuddat = muddatlar.length ? Math.min(...muddatlar) : null;
  const kafolatlar = takliflar.map((t) => t.kafolatOy).filter(sonmi);
  const maxKafolat = kafolatlar.length ? Math.max(...kafolatlar) : null;
  const reytinglangan = takliflar.some((t) => t.reyting != null);
  return takliflar.map((t) => {
    const j = jadval.jami.find((x) => x.taklifId === t.id)!;
    const q = qolda[t.id] ?? {};
    const ballar: Partial<Record<Mezon, number | null>> = {};
    const yetishmaydi: Mezon[] = [];
    for (const m of vazn) {
      if (q[m] != null) { ballar[m] = Math.min(100, Math.max(0, q[m] as number)); continue; }
      if (m === 'narx') ballar[m] = j.toliq && minNarx != null && (j.jamiQqsBilan ?? j.jamiNdsSiz) != null ? kichikYaxshi(minNarx, narxQiy(j)) : null;
      else if (m === 'muddat') {
        if (j.toliq && j.maxMuddatKun != null && minMuddat != null) ballar[m] = kichikYaxshi(minMuddat, j.maxMuddatKun);
        else { ballar[m] = 0; yetishmaydi.push(m); }
      } else if (m === 'kafolat') {
        if (t.kafolatOy != null && maxKafolat != null) ballar[m] = kattaYaxshi(maxKafolat, t.kafolatOy);
        else { ballar[m] = 0; yetishmaydi.push(m); }
      } else if (m === 'reyting') {
        if (t.reyting != null) ballar[m] = yaxlit2(((t.reyting - 1) / 4) * 100);
        else { ballar[m] = reytinglangan ? REYTING_NEYTRAL : null; if (reytinglangan) yetishmaydi.push(m); }
      } else ballar[m] = null; // tolov: faqat qo'lda
    }
    const toliq = vazn.length > 0 && vazn.every((m) => ballar[m] != null);
    const w = vazn.reduce((s, m) => s + (meyor[m] as number), 0);
    const jami = toliq ? yaxlit2(vazn.reduce((s, m) => s + (meyor[m] as number) * (ballar[m] as number), 0) / w) : null;
    return { taklifId: t.id, ballar, jami, yetishmaydi, toliq };
  });
}

/** Reyting jadvali: ball usulida jami ball kamayish bo'yicha (null — oxirida), narx usulida jami QQS bilan o'sish bo'yicha (to'liq emas — oxirida). */
export function tartibla(usuli: 'narx' | 'ball', jadval: Jadval, ballar: readonly BallNatija[]): number[] {
  const j = (id: number) => jadval.jami.find((x) => x.taklifId === id)!;
  const ids = jadval.jami.map((x) => x.taklifId);
  if (usuli === 'ball') {
    return ids.sort((a, b) => {
      const x = ballar.find((n) => n.taklifId === a)?.jami ?? null, y = ballar.find((n) => n.taklifId === b)?.jami ?? null;
      if (x == null && y == null) return a - b;
      if (x == null) return 1; if (y == null) return -1;
      return y - x || a - b;
    });
  }
  const val = (id: number) => { const q = j(id); return q.toliq ? (q.jamiQqsBilan ?? q.jamiNdsSiz ?? Infinity) : Infinity; };
  return ids.sort((a, b) => val(a) - val(b) || a - b);
}

/** Meyor yig'indisi: ball usulida 100 bo'lishi va narx mezoni bo'lishi shart (baza `MEYOR_YIGINDI` bilan bir xil). */
export function meyorXato(usuli: 'narx' | 'ball', meyor: Meyor): 'MEYOR_NOTOGRI' | 'MEYOR_YIGINDI' | null {
  let s = 0;
  for (const m of MEZONLAR) {
    const v = meyor[m]; if (v == null) continue;
    if (!Number.isFinite(v) || v < 0 || v > 100) return 'MEYOR_NOTOGRI';
    s += v;
  }
  if (usuli === 'ball' && (s !== 100 || meyor.narx == null)) return 'MEYOR_YIGINDI';
  return null;
}
