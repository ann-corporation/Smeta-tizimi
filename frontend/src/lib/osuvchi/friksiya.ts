/**
 * O'rganish halqasi — ISHQALANISH SENSORI (mijoz tomoni). HODISA-QATOR YOZILMAYDI: hodisalar xotirada (sahifa, amal, hodisa, kod) bo'yicha
 * SANALADI va partiyalab bitta shlyuz amaliga (`osuvchi_yoz_v1/friksiya_yubor`) yuboriladi; server upsert-increment qiladi (DB: t2_friksiya).
 *
 *  - hodisa: boshlandi / tugadi (kod = vaqt chelagi t0..t4) / tashlandi / xato (kod = xato kodi) / nol_qidiruv (kod = normallashgan qidiruv so'zi).
 *  - Shaxsiy ma'lumot YO'Q: so'z kichik harfga, tinish belgilarisiz, ≤40 belgi; 5+ xonali raqam yoki e-pochta bo'lgan so'z tashlanadi (server ham tekshiradi).
 *  - «odam» sanagich: shu brauzer shu kuni shu kalitni birinchi marta yuborsa 1 (localStorage, kunlik); foydalanuvchi id yuborilmaydi.
 *  - Partiya idempotent: bir `operation_id` bir marta sanaladi; yuborish muvaffaqiyatsiz bo'lsa AYNAN shu partiya qayta yuboriladi.
 *  - Kardinallik: xotirada ≤200 kalit; serverda kompaniya-kun boshiga ≤100 kalit (undan ortig'i «*» ga yig'iladi).
 *  - Barqaror kalit (kurs moduli va Jarvis uchun): `frictionKey(sahifa, amal)` = «sahifa:amal».
 */
import { yangiOperationId } from '../../api/supabase';
import { osuvchiYoz } from '../../api/t2-osuvchi';

export type FriksiyaHodisa = 'boshlandi' | 'tugadi' | 'tashlandi' | 'xato' | 'nol_qidiruv';
type Qator = { s: string; a: string; h: FriksiyaHodisa; k: string; n: number; o: 0 | 1 };

export const frictionKey = (sahifa: string, amal: string): string => `${sahifa}:${amal}`;

/** Qidiruv so'zini maxfiy ma'lumotsiz normallashtiradi; yaroqsiz bo'lsa null. */
export function qidiruvSozi(s: string): string | null {
  const x = s.toLowerCase().replace(/[@:/\\<>"{}]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return x.length < 2 || /\d{5,}/.test(x) ? null : x;
}

export const vaqtChelagi = (ms: number): 't0' | 't1' | 't2' | 't3' | 't4' => (ms < 5_000 ? 't0' : ms < 30_000 ? 't1' : ms < 120_000 ? 't2' : ms < 600_000 ? 't3' : 't4');

const KALIT_CHEGARA = 200;
const PARTIYA_CHEGARA = 60;
const navbat = new Map<string, Qator>();
let kompaniya: number | null = null;
let inflight: { id: string; qatorlar: Qator[] } | null = null;
let taymer: ReturnType<typeof setInterval> | null = null;
let yuborilmoqda = false;
let ketmaKetXato = 0;

const kunKalit = () => `osuvchi.odam.${new Date().toISOString().slice(0, 10)}`;
function birinchiMarta(kalit: string): boolean {
  try {
    const raw = localStorage.getItem(kunKalit());
    const set = new Set<string>(raw ? JSON.parse(raw) as string[] : []);
    if (set.has(kalit)) return false;
    set.add(kalit);
    localStorage.setItem(kunKalit(), JSON.stringify([...set].slice(-300)));
    return true;
  } catch { return true; }
}

/** Joriy kompaniyani belgilaydi (AdminShell/sahifa chaqiradi); o'zgarsa kutayotgan navbat yuboriladi. */
export function friksiyaKontekst(kid: number | null | undefined): void {
  const yangi = kid && kid > 0 ? kid : null;
  if (kompaniya !== yangi && kompaniya) void friksiyaYubor();
  kompaniya = yangi;
  if (!taymer && typeof setInterval !== 'undefined') {
    taymer = setInterval(() => { void friksiyaYubor(); }, 120_000);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void friksiyaYubor(); });
  }
}

export function friksiyaYoz(sahifa: string, amal: string, hodisa: FriksiyaHodisa, kod = ''): void {
  let k = kod;
  if (hodisa === 'nol_qidiruv') { const q = qidiruvSozi(kod); if (!q) return; k = q; }
  else if (hodisa === 'xato') k = kod.slice(0, 40) || 'NOMALUM';
  else if (hodisa !== 'tugadi') k = '';
  const kalit = [sahifa, amal, hodisa, k].join('\u0001');
  const bor = navbat.get(kalit);
  if (bor) { bor.n = Math.min(bor.n + 1, 1000); return; }
  if (navbat.size >= KALIT_CHEGARA) return;
  navbat.set(kalit, { s: sahifa, a: amal, h: hodisa, k, n: 1, o: hodisa === 'boshlandi' || hodisa === 'tugadi' ? 0 : birinchiMarta(kalit) ? 1 : 0 });
}

export type Kuzatuv = { tugadi: () => void; tashlandi: () => void; xato: (kod: string) => void; tugagan: () => boolean };

/** Ko'p bosqichli oqimni kuzatadi: boshlandi darhol; keyin aynan BIR yakun (tugadi / tashlandi). `xato` yakun emas — oqim davom etishi mumkin. */
export function friksiyaBoshla(sahifa: string, amal: string, soat: () => number = Date.now): Kuzatuv {
  const t0 = soat();
  let yakun = false;
  friksiyaYoz(sahifa, amal, 'boshlandi');
  return {
    tugadi: () => { if (yakun) return; yakun = true; friksiyaYoz(sahifa, amal, 'tugadi', vaqtChelagi(soat() - t0)); },
    tashlandi: () => { if (yakun) return; yakun = true; friksiyaYoz(sahifa, amal, 'tashlandi'); },
    xato: (kod) => friksiyaYoz(sahifa, amal, 'xato', kod),
    tugagan: () => yakun,
  };
}

/** Navbatni partiyalab yuboradi. Muvaffaqiyatsiz bo'lsa — bir xil partiya id bilan keyingi safar qayta (idempotent). */
export async function friksiyaYubor(): Promise<boolean> {
  const kid = kompaniya;
  if (!kid || yuborilmoqda) return false;
  if (!inflight) {
    if (!navbat.size) return true;
    const olinadi = [...navbat.entries()].slice(0, PARTIYA_CHEGARA);
    for (const [k] of olinadi) navbat.delete(k);
    inflight = { id: yangiOperationId(), qatorlar: olinadi.map(([, q]) => q) };
  }
  yuborilmoqda = true;
  try {
    const r = await osuvchiYoz({ kompaniyaId: kid, amal: 'friksiya_yubor', operationId: inflight.id, yuk: { qatorlar: inflight.qatorlar } });
    if (r.ok) { inflight = null; ketmaKetXato = 0; } else if (++ketmaKetXato >= 3) { inflight = null; ketmaKetXato = 0; } /* masalan rahbar roli yozolmaydi - abadiy qayta urinmaymiz */
    return !!r.ok;
  } catch { if (++ketmaKetXato >= 3) { inflight = null; ketmaKetXato = 0; } return false; } finally { yuborilmoqda = false; }
}

/** Faqat testlar uchun. */
export function friksiyaHolat(): { navbat: number; inflight: boolean } { return { navbat: navbat.size, inflight: !!inflight }; }
export function friksiyaTozala(): void { navbat.clear(); inflight = null; kompaniya = null; ketmaKetXato = 0; }
