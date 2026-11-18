/**
 * ozgarishSoni — «saqlanmagan o'zgarish» sonini hisoblash (SaqlashPaneli soni uchun).
 * Boshlang'ich (asl) obyekt bilan joriy qiymatlarni berilgan kalitlar bo'yicha solishtiradi; null/undefined/'' teng hisoblanadi.
 */
const norm = (v: unknown): string => (v == null ? '' : String(v));

export function ozgarishSoni<T extends object>(joriy: T | null | undefined, asl: T | null | undefined, kalitlar: ReadonlyArray<keyof T>): number {
  if (!joriy) return 0;
  let n = 0;
  for (const k of kalitlar) if (norm(joriy[k]) !== norm(asl?.[k])) n++;
  return n;
}

/** Ikki ro'yxat/obyektlar xaritasi (id → qiymat) orasidagi farq soni. */
export function xaritaFarqSoni(joriy: Record<string, unknown>, asl: Record<string, unknown>): number {
  const kalitlar = new Set([...Object.keys(joriy), ...Object.keys(asl)]);
  let n = 0;
  for (const k of kalitlar) if (norm(joriy[k]) !== norm(asl[k])) n++;
  return n;
}