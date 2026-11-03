/** Sessiyaga tegishli kalit tashqaridan keladi; kalit diskka yozilmaydi. */
export type OmborDoira = { kompaniyaId: number; foydalanuvchiId: number };
export function doiraKaliti(d: OmborDoira): string {
  if (![d.kompaniyaId, d.foydalanuvchiId].every(v => Number.isSafeInteger(v) && v > 0)) throw new Error('OMBOR_SCOPE_INVALID');
  return `${d.kompaniyaId}/${d.foydalanuvchiId}`;
}
export interface Saqlash {
  ol(kalit: string): Promise<Uint8Array | undefined>;
  yoz(kalit: string, qiymat: Uint8Array): Promise<void>;
  ochir(kalit: string): Promise<void>;
  kalitlar(): Promise<string[]>;
}
