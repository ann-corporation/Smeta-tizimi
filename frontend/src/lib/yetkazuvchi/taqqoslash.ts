/**
 * Yetkazuvchi takliflarini taqqoslash (T2 ta'minot zanjiri). Sof funksiyalar, bazaga tegmaydi.
 * Qoidalar (egasi): narx doim NDS siz; bir mahsulotga bir necha yetkazuvchi narxi -> arifmetik o'rtacha
 * VA foydalanuvchiga xabar; narx o'ylab topilmaydi: narxsiz taklif o'rtachaga/eng yaxshiga kirmaydi, 0 esa haqiqiy 0.
 * Bir yetkazuvchining bir qatordagi bir nechta taklifi - oxirgisi hisoblanadi (har yetkazuvchi bir marta).
 */
export type Taklif = {
  yetkazuvchiId: number; yetkazuvchiNom: string;
  /** Birlik narxi, NDS siz. null = yetkazuvchi narx bermagan. */
  narx: number | null;
  muddatKun: number | null;
  /** Butun qator uchun yetkazish haqi, NDS siz (null = noma'lum). */
  yetkazishNarx: number | null;
};
export type TaklifQatori = { qatorId: number; nom: string; birlik: string | null; miqdor: number | null; takliflar: Taklif[] };
export type QatorTaqqos = {
  qatorId: number; nom: string; birlik: string | null; miqdor: number | null;
  /** Narx bergan noyob yetkazuvchilar soni. */
  narxliSoni: number;
  ortacha: number | null;
  /** Eng arzon narx; teng bo'lsa kam muddatli, keyin yetkazuvchi id. */
  eng: Taklif | null;
  /** Foydalanuvchiga ko'rsatiladigan xabar (bir nechta narx o'rtachalanganda). */
  xabar: string | null;
};
export type YetkazuvchiJami = {
  yetkazuvchiId: number; yetkazuvchiNom: string;
  /** Narx bergan qatorlar yig'indisi (narx*miqdor + yetkazish), NDS siz. */
  jami: number; yopilganQator: number; jamiQator: number;
  /** false: ba'zi qatorlarga narx berilmagan - jami to'liq emas, boshqasi bilan to'g'ridan-to'g'ri solishtirilmaydi. */
  toliq: boolean;
  maxMuddatKun: number | null;
};

const yaxlit = (n: number) => Math.round(n * 100) / 100;
const haqiqiyNarx = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Har yetkazuvchining oxirgi taklifi (massivda keyingisi yangi). */
export function noyobTakliflar(takliflar: readonly Taklif[]): Taklif[] {
  const m = new Map<number, Taklif>();
  for (const t of takliflar) m.set(t.yetkazuvchiId, t);
  return [...m.values()];
}

const solishtir = (a: Taklif, b: Taklif) =>
  (a.narx as number) - (b.narx as number)
  || (a.muddatKun ?? Infinity) - (b.muddatKun ?? Infinity)
  || a.yetkazuvchiId - b.yetkazuvchiId;

export function qatorniTaqqosla(q: TaklifQatori): QatorTaqqos {
  const narxli = noyobTakliflar(q.takliflar).filter((t) => haqiqiyNarx(t.narx));
  const eng = narxli.length ? [...narxli].sort(solishtir)[0] : null;
  const ortacha = narxli.length ? yaxlit(narxli.reduce((s, t) => s + (t.narx as number), 0) / narxli.length) : null;
  const xabar = narxli.length > 1 ? `${narxli.length} ta yetkazuvchi narxi o'rtachalandi` : null;
  return { qatorId: q.qatorId, nom: q.nom, birlik: q.birlik, miqdor: q.miqdor, narxliSoni: narxli.length, ortacha, eng, xabar };
}

export function taqqosla(qatorlar: readonly TaklifQatori[]): { qatorlar: QatorTaqqos[]; yetkazuvchilar: YetkazuvchiJami[]; xabarlar: string[] } {
  const qt = qatorlar.map(qatorniTaqqosla);
  const by = new Map<number, YetkazuvchiJami>();
  for (const q of qatorlar) for (const t of noyobTakliflar(q.takliflar)) {
    let y = by.get(t.yetkazuvchiId);
    if (!y) { y = { yetkazuvchiId: t.yetkazuvchiId, yetkazuvchiNom: t.yetkazuvchiNom, jami: 0, yopilganQator: 0, jamiQator: qatorlar.length, toliq: false, maxMuddatKun: null }; by.set(t.yetkazuvchiId, y); }
    if (haqiqiyNarx(t.narx) && q.miqdor != null && Number.isFinite(q.miqdor)) {
      y.jami = yaxlit(y.jami + t.narx * q.miqdor + (haqiqiyNarx(t.yetkazishNarx) ? t.yetkazishNarx : 0));
      y.yopilganQator++;
    }
    if (t.muddatKun != null && Number.isFinite(t.muddatKun)) y.maxMuddatKun = Math.max(y.maxMuddatKun ?? 0, t.muddatKun);
  }
  const yetkazuvchilar = [...by.values()].map((y) => ({ ...y, toliq: y.yopilganQator === y.jamiQator && y.jamiQator > 0 }))
    .sort((a, b) => Number(b.toliq) - Number(a.toliq) || a.jami - b.jami || a.yetkazuvchiId - b.yetkazuvchiId);
  const xabarlar = qt.filter((q) => q.xabar).map((q) => `${q.nom}: ${q.xabar}`);
  return { qatorlar: qt, yetkazuvchilar, xabarlar };
}
