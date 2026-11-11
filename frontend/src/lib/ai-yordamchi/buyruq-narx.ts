/**
 * Buyruq satri: yuborishdan OLDIN token narxi chipi va bir xil mazmunni qayta yechmaslik.
 * Egasi qoidasi: har AI natija token yechadi (bepul qilinmaydi); bir xil mazmun (xesh) qayta so'ralsa takror yechilmaydi.
 * Haqiqiy sarf serverda (`aiHisobli` → hamyon); bu yerdagi son faqat TAXMIN («≈»), chip buni aniq yozadi.
 */
import { mazmunXeshi, narxHisob, type TokenHolat } from '../../api/t2-token';
import type { SiklNatija } from './sikl';

/** Taxminiy sarf: kirish ≈ (kontekst + buyruq) belgilar/3 × ~2 aylanish + tizim ko'rsatmasi; chiqish ≈ 900 token. */
export function buyruqTokenTaxmini(h: Pick<TokenHolat, 'narxlar' | 'sozlama'> | null | undefined, matn: string, kontekstUzunlik: number): number | null {
  if (!h) return null;
  const kirishN = h.narxlar.find((n) => n.amal === 'ai_kirish'); const chiqishN = h.narxlar.find((n) => n.amal === 'ai_chiqish');
  if (!kirishN || !chiqishN) return null;
  const kirish = Math.ceil((kontekstUzunlik + matn.length) / 3) * 2 + 1500;
  const a = narxHisob(kirishN, kirish, h.sozlama); const b = narxHisob(chiqishN, 900, h.sozlama);
  return a && b ? a.token + b.token : null;
}

/** Bir xil (obyekt + buyruq + ma'lumot holati) mazmun xeshi. */
export async function buyruqXeshi(kompaniyaId: number, obyektId: number, matn: string, kontekst: string): Promise<string> {
  const norm = matn.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${kompaniyaId}:${obyektId}:${await mazmunXeshi(new TextEncoder().encode(`${norm}\n${kontekst}`))}`;
}

const KESH_MAX = 40;
const kesh = new Map<string, Extract<SiklNatija, { ok: true }>>();
export const buyruqKeshdan = (kalit: string) => kesh.get(kalit) ?? null;
export function buyruqKeshgaYoz(kalit: string, n: Extract<SiklNatija, { ok: true }>): void {
  kesh.set(kalit, n);
  while (kesh.size > KESH_MAX) { const eski = kesh.keys().next().value as string | undefined; if (eski == null) break; kesh.delete(eski); }
}
export const buyruqKeshTozala = () => kesh.clear();
