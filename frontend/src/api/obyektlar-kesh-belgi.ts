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
  for (const qc of klientlar) void qc.invalidateQueries({ queryKey: ['t2-obyektlar'], refetchType: 'none' });
}
