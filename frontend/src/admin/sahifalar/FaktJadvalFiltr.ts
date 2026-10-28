/**
 * Fakt jadvali uchun Excel uslubidagi ustun filtrlari (egasi 2026-10-27) — sof yordamchilar.
 *
 * Jadval tuzilmasi: bo'lim bo'lagi → ish → resurs (resurslar + avtomatik). Filtr ISH darajasida:
 * - ish o'z qiymatlari bo'yicha mos bo'lsa — o'zi va barcha bolalari odatdagidek ko'rinadi;
 * - ish mos emas, lekin bolasi (resurs) mos bo'lsa — ish ko'rinadi, ostida FAQAT mos bolalari;
 * - bo'lim guruhi saqlanadi: mos ishi qolmagan bo'lim sarlavhasi (avlodlari ham bo'sh bo'lsa) tashlanadi;
 * - saralash faqat bo'lim ICHIDA ishlarga qo'llanadi (bo'lim → ish → resurs ierarxiyasi buzilmaydi).
 */
import { faolSoni, filtrla, qatorMos, type Daraxt, type FiltrHolat, type Saralash, type Ustun } from '../../umumiy/jadval-filtr/ustunFiltr';

type Qator = { id: number };
type Ish<Q extends Qator> = Q & { resurslar: readonly Q[]; avtomatik: readonly Q[] };

/** Filtr uchun tekis qator: ish yoki uning bolasi (resurs/avto). */
export type FaktFiltrQator<Q extends Qator> = { q: Q; ishId: number; bola: boolean; avto: boolean };

type Bolak<I> = { bolim: { id: number; otaId: number | null } | null; yol?: string; ishlar: I[] };

/** Daraxt: bola → ota ish (filtrla mos bolaning ota ishini ham qoldiradi). Barcha qatorlar barg. */
export const FAKT_DARAXT: Daraxt<FaktFiltrQator<Qator>> = {
  id: (r) => r.q.id,
  ota: (r) => (r.bola ? r.ishId : null),
};

export function faktFiltrQatorlar<Q extends Qator>(bolaklar: readonly { ishlar: readonly Ish<Q>[] }[]): FaktFiltrQator<Q>[] {
  const out: FaktFiltrQator<Q>[] = [];
  for (const b of bolaklar) for (const ish of b.ishlar) {
    out.push({ q: ish, ishId: ish.id, bola: false, avto: false });
    for (const r of ish.resurslar) out.push({ q: r, ishId: ish.id, bola: true, avto: false });
    for (const a of ish.avtomatik) out.push({ q: a, ishId: ish.id, bola: true, avto: true });
  }
  return out;
}

function solishtir(va: unknown, vb: unknown, son: boolean, k: number): number {
  const ba = va == null || va === ''; const bb = vb == null || vb === '';
  if (ba || bb) return ba === bb ? 0 : ba ? 1 : -1; // bo'shlar doim oxirida
  if (son) return (Number(va) - Number(vb)) * k;
  return String(va).localeCompare(String(vb), 'ru', { numeric: true }) * k;
}

/**
 * Bo'laklarga filtr va saralashni qo'llaydi. `bolaKorinadi` — ish o'zi mos bo'lmagan holatda ko'rinadigan bolalar
 * (null — filtr yo'q, hamma bolalar ko'rinadi). Ish o'zi mos bo'lsa uning bolalari doim to'liq ko'rinadi.
 */
export function faktFiltrQoll<Q extends Qator, I extends Ish<Q>, B extends Bolak<I>>(
  bolaklar: readonly B[], ustunlar: readonly Ustun<FaktFiltrQator<Q>>[], holat: FiltrHolat, saralash: Saralash,
): { bolaklar: B[]; bolaKorinadi: ((ishId: number, bolaId: number) => boolean) | null } {
  const filtrBor = faolSoni(holat) > 0;
  if (!filtrBor && !saralash) return { bolaklar: bolaklar.slice(), bolaKorinadi: null };
  const tekis = faktFiltrQatorlar<Q>(bolaklar);
  const qoldi = new Set(filtrla(tekis, ustunlar, holat, null, FAKT_DARAXT as Daraxt<FaktFiltrQator<Q>>).map((r) => r.q.id));
  const ishQator = new Map(tekis.filter((r) => !r.bola).map((r) => [r.ishId, r]));
  const ozMos = new Set<number>();
  if (filtrBor) for (const r of ishQator.values()) if (qatorMos(r, ustunlar, holat)) ozMos.add(r.ishId);
  const su = saralash ? ustunlar.find((u) => u.kalit === saralash.kalit) : undefined;
  const k = saralash?.yonalish === 'kamayish' ? -1 : 1;

  const yangi = bolaklar.map((b) => {
    const ishlar = filtrBor ? b.ishlar.filter((i) => qoldi.has(i.id)) : b.ishlar.slice();
    if (su) ishlar.sort((a, c) => solishtir(su.qiymat(ishQator.get(a.id)!), su.qiymat(ishQator.get(c.id)!), su.tur === 'son', k));
    return { ...b, ishlar };
  });
  // Bo'sh qolgan bo'lim shoxlari tashlanadi (ishli avlodi bor bo'lim sarlavhasi qoladi); asosiy (bolim=null, yolsiz) bo'lak qoladi.
  const toliq = new Set<number>();
  for (let i = yangi.length - 1; i >= 0; i--) {
    const x = yangi[i];
    if (x.bolim && (x.ishlar.length || toliq.has(x.bolim.id))) { toliq.add(x.bolim.id); if (x.bolim.otaId != null) toliq.add(x.bolim.otaId); }
  }
  const natija = yangi.filter((x) => x.ishlar.length > 0 || (x.bolim ? toliq.has(x.bolim.id) : x.yol == null));
  return {
    bolaklar: natija,
    bolaKorinadi: filtrBor ? (ishId, bolaId) => ozMos.has(ishId) || qoldi.has(bolaId) : null,
  };
}
