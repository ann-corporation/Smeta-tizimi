/** react-query ga bog'lanmaslik uchun (MCP paketlari shu faylni React'siz tekshiradi) — faqat kerakli qism. */
type QueryClient = { invalidateQueries(f: { queryKey: readonly unknown[] }): unknown };

/** Ustama (nakrutka) so'rovi keshi: obyekt boshiga alohida so'rov (fan-out) 5 daqiqa yangi hisoblanadi. */
export const USTAMA_STALE_MS = 5 * 60_000;

const HODISA = 'ustama-ozgardi';

/** Koeffitsient yoki podval o'zgarganda chaqiriladi — ustama keshlari darhol yangilanadi. */
export function ustamaOzgardi(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(HODISA));
}

/** Ilova ildizida bir marta: o'zgarishda ustama keshlarini yaroqsiz qiladi. */
export function ustamaKeshiniUla(qc: QueryClient): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const f = () => {
    void qc.invalidateQueries({ queryKey: ['ustama-nakrutka'] });
    void qc.invalidateQueries({ queryKey: ['pto-markup-podvals'] });
    void qc.invalidateQueries({ queryKey: ['pto-markup'] });
  };
  window.addEventListener(HODISA, f);
  return () => window.removeEventListener(HODISA, f);
}