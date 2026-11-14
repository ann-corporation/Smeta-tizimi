/**
 * SEAM: ishqalanish kalitlari -> kurs darslari. Kurs moduli (parallel PR, `claude/kurs-qollanma`) o'z `kursTavsiya(frictionKeys)` ini
 * `kursTavsiyaUlash` orqali ulaydi; ulanmagan bo'lsa bo'sh ro'yxat (qattiq bog'liqlik YO'Q). Jarvis esa `qiyinJoylar` dan foydalanadi.
 */
import { osuvchiFriksiyaOl, osuvchiPlatformaFriksiyaOl, type FriksiyaQator } from '../../api/t2-osuvchi';
import { frictionKey } from './friksiya';

export type DarsTavsiya = { dars: string; sabab?: string };
export type KursTavsiyaFn = (frictionKeys: string[]) => DarsTavsiya[];

let ulangan: KursTavsiyaFn | null = null;
export function kursTavsiyaUlash(f: KursTavsiyaFn | null): void { ulangan = f; }
export function kursTavsiya(frictionKeys: string[]): DarsTavsiya[] {
  if (!ulangan || !frictionKeys.length) return [];
  try { return ulangan(frictionKeys) ?? []; } catch { return []; }
}

export type QiyinJoy = FriksiyaQator & { kalit: string };
const belgila = (r: FriksiyaQator): QiyinJoy => ({ ...r, kalit: frictionKey(r.sahifa, r.amal) });

/** Eng ko'p adashilgan joylar (ball = odam x nuqson). `kompaniyaId` berilsa — o'z kompaniyasi (rahbar); berilmasa — platforma (egasi, anonim). */
export async function qiyinJoylar(kompaniyaId?: number | null, limit = 5): Promise<QiyinJoy[]> {
  const r = kompaniyaId ? await osuvchiFriksiyaOl(kompaniyaId) : await osuvchiPlatformaFriksiyaOl();
  return (r ?? []).filter((x) => x.sahifa !== '*').slice(0, limit).map(belgila);
}

/** Kurs tavsiyasi: qiyin joylar -> frictionKey -> kursTavsiya. */
export async function qiyinJoyDarslari(kompaniyaId?: number | null): Promise<{ joylar: QiyinJoy[]; darslar: DarsTavsiya[] }> {
  const joylar = await qiyinJoylar(kompaniyaId);
  return { joylar, darslar: kursTavsiya(joylar.map((j) => j.kalit)) };
}
