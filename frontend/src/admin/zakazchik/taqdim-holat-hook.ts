/**
 * taqdim-holat-hook.ts — pudratchi o'z ekranida (F2 tarixi, tayyorlangan F2 lar, АОСР) «bu hujjatni buyurtmachiga
 * yuborganmanmi va u nima dedi» savoliga javob oladi. Yangi RPC kerak emas: mavjud «yuborilgan taqdimlar» ro'yxati
 * (manba_jadval + manba_id bilan) bir marta olinadi va ekrandagi hamma qatorlar uchun umumiy keshlanadi.
 */
import { useCallback, useEffect, useState } from 'react';
import { taqdimlarOl, type TaqdimQisqa } from '../../api/t2-tomon';

export type TaqdimXaritasi = Map<string, TaqdimQisqa>;
const TTL_MS = 10_000;
const kesh = new Map<number, { vaqt: number; p: Promise<TaqdimXaritasi> }>();

export const taqdimKaliti = (jadval: string, manbaId: number) => `${jadval}:${manbaId}`;

/** Ro'yxat id kamayish tartibida keladi - har hujjat uchun BIRINCHI (eng yangi) taqdim olinadi. */
export function xaritaYasa(royxat: TaqdimQisqa[]): TaqdimXaritasi {
  const m: TaqdimXaritasi = new Map();
  for (const q of royxat) {
    if (!q.manba_jadval || q.manba_id == null) continue;
    const k = taqdimKaliti(q.manba_jadval, q.manba_id);
    const eski = m.get(k);
    if (!eski || q.id > eski.id) m.set(k, q);
  }
  return m;
}

export function yuborilganTaqdimlar(kompaniyaId: number, yangi = false): Promise<TaqdimXaritasi> {
  const bor = kesh.get(kompaniyaId);
  if (!yangi && bor && Date.now() - bor.vaqt < TTL_MS) return bor.p;
  const p = taqdimlarOl(kompaniyaId, { yonalish: 'yuborilgan' })
    .then((r) => (r.ok ? xaritaYasa(r.natija) : new Map<string, TaqdimQisqa>()))
    .catch(() => new Map<string, TaqdimQisqa>());
  kesh.set(kompaniyaId, { vaqt: Date.now(), p });
  return p;
}

export function taqdimKeshiniTozala() { kesh.clear(); }

export function useYuborilganTaqdim(kompaniyaId: number | null | undefined, jadval: string, manbaId: number) {
  const [taqdim, setTaqdim] = useState<TaqdimQisqa | null>(null);
  const yukla = useCallback(async (yangi: boolean) => {
    if (!kompaniyaId) return;
    const x = await yuborilganTaqdimlar(kompaniyaId, yangi);
    setTaqdim(x.get(taqdimKaliti(jadval, manbaId)) ?? null);
  }, [kompaniyaId, jadval, manbaId]);
  useEffect(() => { void yukla(false); }, [yukla]);
  return { taqdim, yangila: () => yukla(true) };
}
