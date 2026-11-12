/**
 * profil.ts — chizma jadvallari uchun MA'LUMOT asosidagi (data-driven) qoida profillari va ularning umumiy parseri.
 * Yangi jadval turi = yangi profil obyekti (kod emas). Parser: sarlavha qatorini topadi -> ustun chegaralari -> qatorlarni element qiladi;
 * ko'p qatorli katak (davomi) birlashtiriladi; armatura jami qatori tekshiruv sifatida ishlatiladi (element emas); to'r (С-1) qatori saqlanadi.
 * Qoida bilan o'qib bo'lmagan sahifa «AI bilan o'qish»ga taklif qilinadi (tahlil.ts).
 */
import { qatorQutisi, qatorHujayralari, sonOqi, ustunlarQur, type JQator } from './jadval';

export type Tur = 'beton' | 'armatura' | 'pardoz' | 'eshik_oyna' | 'uskuna' | 'boshqa';
export type UstunKalit = 'nom' | 'belgi' | 'birlik' | 'miqdor';

export type Profil = {
  id: string;
  tur: Tur;
  /** Sahifa matnida bo'lishi kerak (kichik harfda regex manbalari); bo'sh = har sahifa. */
  sahifaKalit: string[];
  /** Ustun kaliti -> sarlavha katagi regex manbalari (kichik harfda). */
  sarlavha: Record<UstunKalit, string[]>;
  minMos: number;
  standartBirlik: string;
  /** Uskunalar: ro'yxat aggregatlangan smetaga 1:1 mos kelmaydi -> faqat qo'lda tasdiq. */
  odamKerak?: boolean;
  jamiQator?: string;
};

export const PROFILLAR: Profil[] = [
  {
    id: 'armatura', tur: 'armatura', minMos: 2, standartBirlik: 'кг',
    sahifaKalit: ['арматур', 'расход стали', 'ведомость расхода', 'сетк', 'армирован'],
    sarlavha: { nom: ['наименование', 'класс', 'диаметр', 'обозначение'], belgi: ['^поз', 'марка'], birlik: ['^ед'], miqdor: ['масса', 'всего', 'вес'] },
    jamiQator: '^(итого|всего|jami|total)',
  },
  {
    id: 'eshik_oyna', tur: 'eshik_oyna', minMos: 2, standartBirlik: 'шт',
    sahifaKalit: ['двер', 'окон', 'окна', 'заполнени', 'проем'],
    sarlavha: { nom: ['наименование', 'обозначение'], belgi: ['^поз', 'марка'], birlik: ['^ед'], miqdor: ['^кол', 'количество'] },
  },
  {
    id: 'uskuna', tur: 'uskuna', minMos: 2, standartBirlik: 'шт', odamKerak: true,
    sahifaKalit: ['оборудован', 'спецификация оборуд', 'насос', 'светильник', 'щит'],
    sarlavha: { nom: ['наименование', 'тип', 'марка'], belgi: ['^поз', 'обозначение'], birlik: ['^ед'], miqdor: ['^кол', 'количество'] },
  },
  {
    id: 'beton_hajm', tur: 'beton', minMos: 2, standartBirlik: 'м3',
    sahifaKalit: [],
    sarlavha: { nom: ['наименование', 'конструкц', 'элемент'], belgi: ['^поз', 'марка', 'обозначение'], birlik: ['^ед'], miqdor: ['объ[её]м', '^v\\b', 'v,'] },
  },
  {
    id: 'element_spes', tur: 'boshqa', minMos: 2, standartBirlik: 'шт',
    sahifaKalit: [],
    sarlavha: { nom: ['наименование'], belgi: ['^поз', 'марка', 'обозначение'], birlik: ['^ед'], miqdor: ['^кол', 'количество'] },
  },
];

export type Element = {
  profil: string;
  tur: Tur;
  nom: string;
  belgi: string | null;
  birlik: string;
  /** null = noma'lum (0 emas). */
  miqdor: number | null;
  sahifa: number;
  /** Manba: jadval qatori (sahifa koordinatalari) — bosiladigan manba va qizil ramka uchun. */
  qutisi: { x0: number; y0: number; x1: number; y1: number };
  manbaRef: string;
  ishonch: number;
  odamKerak: boolean;
  ogohlantirish: string[];
};

export type ProfilNatija = {
  profil: Profil;
  elementlar: Element[];
  /** Armatura: ko'rsatilgan jami (kg-ga keltirilgan emas — xom). */
  jami: number | null;
  sarlavhaQatori: number;
};

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const mosmi = (matn: string, manbalar: string[]) => manbalar.some((m) => new RegExp(m, 'i').test(matn));

/** Birlikni sarlavha katagi matnidan topadi: «Объем, м3» -> м3. */
export function birlikSarlavhadan(s: string): string | null {
  const t = norm(s);
  if (/м3|м³|m3/.test(t)) return 'м3';
  if (/м2|м²|m2/.test(t)) return 'м2';
  if (/п\.?\s?м/.test(t)) return 'п.м';
  if (/\bкг\b|кг\)/.test(t)) return 'кг';
  if (/,\s*т\b|\bт\b/.test(t)) return 'т';
  if (/шт/.test(t)) return 'шт';
  return null;
}

/** Sahifa matni profilga mosmi (sahifaKalit). */
export function profilSahifagaMos(p: Profil, sahifaMatni: string): boolean {
  if (p.sahifaKalit.length === 0) return true;
  const t = norm(sahifaMatni);
  return p.sahifaKalit.some((k) => t.includes(k));
}

function sarlavhaKalitlari(q: JQator, p: Profil): (UstunKalit | null)[] {
  const used = new Set<UstunKalit>();
  return q.kataklar.map((k) => {
    const t = norm(k.matn);
    for (const kalit of ['miqdor', 'belgi', 'birlik', 'nom'] as UstunKalit[]) {
      if (used.has(kalit)) continue;
      if (mosmi(t, p.sarlavha[kalit])) { used.add(kalit); return kalit; }
    }
    return null;
  });
}

const TOR_RE = /^[CСcс]-?\s?\d+/;

/** Bitta profil bilan qatorlarni o'qiydi; sarlavha topilmasa null. */
export function profilBilanOqi(p: Profil, qatorlar: JQator[]): ProfilNatija | null {
  let ust: ReturnType<typeof ustunlarQur> | null = null;
  let miqdorSarlavha = '';
  const out: Element[] = [];
  let jami: number | null = null;
  let sarIdx = -1;
  let oxirgi: Element | null = null;
  for (let i = 0; i < qatorlar.length; i++) {
    const q = qatorlar[i];
    const kalitlar = sarlavhaKalitlari(q, p);
    const mos = new Set(kalitlar.filter(Boolean)).size;
    if (mos >= p.minMos && kalitlar.includes('miqdor')) {
      ust = ustunlarQur(q, kalitlar);
      const mi = kalitlar.indexOf('miqdor');
      miqdorSarlavha = q.kataklar[mi]?.matn ?? '';
      if (sarIdx < 0) sarIdx = i;
      oxirgi = null;
      continue;
    }
    if (!ust) continue;
    const h = qatorHujayralari(q, ust);
    const nom = (h.nom ?? '').trim();
    const belgi = (h.belgi ?? '').trim() || null;
    const miq = sonOqi(h.miqdor);
    if (p.jamiQator && new RegExp(p.jamiQator, 'i').test(norm(nom || belgi || ''))) {
      jami = miq ?? jami;
      oxirgi = null;
      continue;
    }
    // Davomi qatori: ko'p qatorli katak (nom davomi) yoki miqdor pastki qatorda
    if (oxirgi && !belgi) {
      if (miq == null && nom) { oxirgi.nom += ' ' + nom; oxirgi.ogohlantirish.push('kop_qatorli'); oxirgi.ishonch = Math.min(oxirgi.ishonch, 0.7); continue; }
      if (miq != null && !nom && oxirgi.miqdor == null) { oxirgi.miqdor = miq; oxirgi.ishonch = Math.min(oxirgi.ishonch, 0.7); continue; }
    }
    if (!nom && !belgi) continue;
    if (miq == null && !belgi && !nom) continue;
    const qBirlik = (h.birlik ?? '').trim();
    const torQator = p.tur === 'armatura' && (TOR_RE.test(belgi ?? '') || TOR_RE.test(nom));
    const birlik = qBirlik || birlikSarlavhadan(miqdorSarlavha) || (torQator ? 'п.м' : p.standartBirlik);
    const og: string[] = [];
    let ishonch = 0.9;
    if (!qBirlik) { ishonch -= 0.1; og.push('birlik_sarlavhadan'); }
    if (miq == null) { ishonch = Math.min(ishonch, 0.3); og.push('miqdor_yoq'); }
    if (nom.length < 4) { ishonch -= 0.15; og.push('nom_qisqa'); }
    if (torQator) og.push('tor');
    const el: Element = {
      profil: p.id, tur: p.tur, nom: nom || (belgi ?? ''), belgi, birlik, miqdor: miq, sahifa: q.sahifa, qutisi: qatorQutisi(q),
      manbaRef: `${p.id}:${q.sahifa}:${Math.round(q.y)}`, ishonch: Math.max(0.05, ishonch), odamKerak: !!p.odamKerak, ogohlantirish: og,
    };
    if (p.odamKerak) el.ishonch = Math.min(el.ishonch, 0.3);
    out.push(el);
    oxirgi = el;
  }
  if (sarIdx < 0) return null;
  // Armatura: qatorlar yig'indisi ko'rsatilgan jamiga mos kelmasa — ogohlantirish (kg ga keltirilgan xom yig'indi).
  if (jami != null && p.tur === 'armatura') {
    const s = out.filter((e) => e.miqdor != null && e.birlik === 'кг').reduce((a, e) => a + (e.miqdor as number), 0);
    if (jami > 0 && Math.abs(s - jami) / jami > 0.01) for (const e of out) { e.ogohlantirish.push('jami_mos_emas'); e.ishonch = Math.min(e.ishonch, 0.5); }
  }
  return { profil: p, elementlar: out, jami, sarlavhaQatori: sarIdx };
}
