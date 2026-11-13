/**
 * Obyektlar ro'yxati keshini eskirtish — hech narsa import qilmaydigan kichik modul
 * (supabase.ts dan halqasiz chaqiriladi; mcp paketi ham uni react-query'siz type-check qiladi).
 * Obyekt yaratish/nomlash/o'chirish/tiklash/loyihaga biriktirishdan keyin chaqiriladi: keyingi o'qish serverdan.
 */
type EskirtuvchiKlient = {
  invalidateQueries: (f: { queryKey: readonly unknown[]; refetchType?: 'none' | 'active' | 'inactive' | 'all' }) => unknown;
};

const klientlar = new Set<EskirtuvchiKlient>();

export function obyektlarKlientiQayd(qc: EskirtuvchiKlient) { klientlar.add(qc); }

export function obyektlarEskirdi() {
  davr++;
  moduldaKesh.clear();
  for (const qc of klientlar) void qc.invalidateQueries({ queryKey: ['t2-obyektlar'], refetchType: 'none' });
}

/**
 * Modul darajasidagi ro'yxat keshi (react-query'siz chaqiruvchilar uchun ham): bir vaqtdagi bir xil so'rovlar BITTA
 * tarmoq so'roviga birlashadi (in-flight) va muvaffaqiyatli javob `OBYEKTLAR_MODUL_TTL_MS` davomida qayta ishlatiladi.
 * `obyektlarEskirdi()` hamma narsani tozalaydi; eskirishdan oldin boshlangan so'rov natijasi keshga YOZILMAYDI (`davr`).
 */
export const OBYEKTLAR_MODUL_TTL_MS = 60_000;
type Yozuv = { p: Promise<unknown>; t: number | null };
const moduldaKesh = new Map<number, Yozuv>();
let davr = 0;

export function obyektlarModuldaKesh<J extends { ok: boolean }>(
  kompaniyaId: number, oqi: () => Promise<J>, majburiy = false, hozir: () => number = Date.now,
): Promise<J> {
  const bor = moduldaKesh.get(kompaniyaId);
  if (!majburiy && bor && (bor.t === null || hozir() - bor.t < OBYEKTLAR_MODUL_TTL_MS)) return bor.p as Promise<J>;
  const boshDavr = davr;
  const yozuv: Yozuv = { p: Promise.resolve(null), t: null };
  yozuv.p = oqi().then((j) => {
    if (moduldaKesh.get(kompaniyaId) === yozuv) {
      if (j.ok && boshDavr === davr) yozuv.t = hozir(); else moduldaKesh.delete(kompaniyaId);
    }
    return j;
  }, (e) => { if (moduldaKesh.get(kompaniyaId) === yozuv) moduldaKesh.delete(kompaniyaId); throw e; });
  moduldaKesh.set(kompaniyaId, yozuv);
  return yozuv.p as Promise<J>;
}

/** Faqat testlar uchun. */
export function obyektlarModuldaKeshniTozala() { moduldaKesh.clear(); }
