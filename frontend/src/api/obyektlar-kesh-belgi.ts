import type { QueryClient } from '@tanstack/react-query';

/**
 * Obyektlar ro'yxati keshini eskirtish — importsiz kichik modul (supabase.ts dan halqasiz chaqiriladi).
 * Obyekt yaratish/nomlash/o'chirish/tiklash/loyihaga biriktirishdan keyin chaqiriladi: keyingi o'qish serverdan.
 */
const klientlar = new Set<QueryClient>();

export function obyektlarKlientiQayd(qc: QueryClient) { klientlar.add(qc); }

export function obyektlarEskirdi() {
  for (const qc of klientlar) void qc.invalidateQueries({ queryKey: ['t2-obyektlar'], refetchType: 'none' });
}
