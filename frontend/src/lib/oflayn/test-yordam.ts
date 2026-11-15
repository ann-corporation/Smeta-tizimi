/** Faqat testlar uchun: xotiradagi soxta native ko'prik (Rust'dagi qoidalar Rust testlarida tekshiriladi). */
import type { Kopri, NavbatYozuv, OflaynHolat } from './kopri';

export function soxtaKopri(opts: { tayyor?: boolean; onlayn?: boolean } = {}): Kopri & {
  kesh: Map<string, { vaqt_ms: number; qiymat: string }>;
  navbat: Map<string, string>;
  chaqiruvlar: string[];
  tayyor: boolean;
  vaqt: number;
} {
  const kesh = new Map<string, { vaqt_ms: number; qiymat: string }>();
  const navbat = new Map<string, string>();
  const chaqiruvlar: string[] = [];
  const k = {
    kesh, navbat, chaqiruvlar, tayyor: opts.tayyor ?? true, vaqt: 1_800_000_000_000,
    async holat(): Promise<OflaynHolat> {
      chaqiruvlar.push('holat');
      return { tayyor: k.tayyor, onlayn: opts.onlayn ?? true, foydalanuvchi_id: 5, kompaniyalar: [1], tekshirilgan_ms: k.vaqt, muddat_ms: k.vaqt + 72 * 3600_000, sabab: k.tayyor ? null : 'OFLAYN_NOT_BOUND' };
    },
    async yoz(kalit: string, qiymat: string) { chaqiruvlar.push('yoz'); kesh.set(kalit, { vaqt_ms: k.vaqt, qiymat }); },
    async oqi(kalit: string) { chaqiruvlar.push('oqi'); return kesh.get(kalit) ?? null; },
    async tozala(kalit?: string) { chaqiruvlar.push('tozala'); if (kalit) kesh.delete(kalit); else { kesh.clear(); navbat.clear(); } },
    async navbatQosh(id: string, qiymat: string) { chaqiruvlar.push('navbatQosh'); navbat.set(id, qiymat); },
    async navbatRoyxat(): Promise<NavbatYozuv[]> {
      return [...navbat.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, qiymat]) => ({ id, vaqt_ms: k.vaqt, qiymat }));
    },
    async navbatOchir(id: string) { chaqiruvlar.push('navbatOchir'); navbat.delete(id); },
    async qobiqTayyor(v: string) { chaqiruvlar.push('qobiqTayyor:' + v); },
  };
  return k;
}

export const OP1 = '11111111-1111-4111-8111-111111111111';
export const OP2 = '22222222-2222-4222-8222-222222222222';
export const OP3 = '33333333-3333-4333-8333-333333333333';
