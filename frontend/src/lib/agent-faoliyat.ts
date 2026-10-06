/**
 * agent-faoliyat.ts — AI «kuzatuv» rejimi uchun harakat izi (FAQAT foydalanuvchi AI ni yoqqanda ishlaydi).
 *
 * Maxfiylik qonunlari: iz xotirada (ring buffer, ≤40 hodisa, sahifa yopilsa yo'qoladi), serverga FAQAT AI taklif
 * so'ralganda ketadi. Hodisada MATN/QIYMAT yo'q: sahifa naqshi (ID lar `:id` ga almashtiriladi), tugma yorlig'i
 * (data-agent-action / aria-label / qisqa raqamsiz tugma matni) va xato turi. Kiritish maydonlari (input/textarea) HECH QACHON o'qilmaydi.
 */
import type { HarakatIzi } from '../api/t2-agent-ish';

export const IZ_SIGHIMI = 40;
export const IZ_HODISA = 't2-agent-iz';

/** /admin/obyekt/123/akt/45 → /admin/obyekt/:id/akt/:id (UUID va uzun raqamlar ham). Qidiruv qatori (?q=) tashlanadi. */
export function yolNaqshi(yol: string): string {
  return yol.split(/[?#]/)[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
    .slice(0, 120);
}

/** Tugma yorlig'i: data-agent-action → aria-label → qisqa, raqamsiz matn. Aks holda 'tugma'. */
export function tugmaYorligi(el: Element | null): string {
  if (!el || typeof (el as HTMLElement).closest !== 'function') return 'tugma';
  const b = (el as HTMLElement).closest('[data-agent-action],button,[role="button"],a') as HTMLElement | null;
  if (!b) return 'tugma';
  const a = b.getAttribute('data-agent-action') || b.getAttribute('aria-label');
  if (a) return a.slice(0, 40);
  const m = (b.textContent || '').replace(/\s+/g, ' ').trim();
  return m && m.length <= 24 && !/[0-9]/.test(m) ? m : 'tugma';
}

export type IzHodisa = { vaqt: number; tur: HarakatIzi['tur']; nom: string };

export class FaoliyatIzi {
  private bufer: IzHodisa[] = [];
  private soat: () => number;
  constructor(soat: () => number = () => Date.now()) { this.soat = soat; }
  yoz(tur: IzHodisa['tur'], nom: string) {
    const q = nom.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!q) return;
    this.bufer.push({ vaqt: this.soat(), tur, nom: q });
    if (this.bufer.length > IZ_SIGHIMI) this.bufer.splice(0, this.bufer.length - IZ_SIGHIMI);
  }
  tozala() { this.bufer = []; }
  get hodisalar(): readonly IzHodisa[] { return this.bufer; }
  /** Serverga yuboriladigan shakl: t = necha soniya oldin. */
  yuklash(): HarakatIzi[] {
    const hozir = this.soat();
    return this.bufer.map((e) => ({ t: Math.max(0, Math.round((hozir - e.vaqt) / 1000)), tur: e.tur, nom: e.nom }));
  }
}

export type TaklifSababi = 'xato_takrori' | 'adashish' | 'qotib_qolish' | null;

/**
 * Model chaqirishdan OLDIN arzon, mahalliy tekshiruv (token tejash): faqat haqiqiy qiyinchilik belgisi bo'lsa so'raladi.
 *  - xato_takrori: 90 s ichida ≥3 xato yoki ≥2 xato + saqlash urinishlari;
 *  - adashish: 60 s ichida ≥6 sahifa almashishi;
 *  - qotib_qolish: oxirgi harakatdan 120+ s o'tgan va oldin xato bo'lgan.
 */
export function taklifSababi(hodisalar: readonly IzHodisa[], hozir: number): TaklifSababi {
  const oxir = (soniya: number) => hodisalar.filter((e) => hozir - e.vaqt <= soniya * 1000);
  const x90 = oxir(90);
  const xatolar = x90.filter((e) => e.tur === 'xato').length;
  if (xatolar >= 3 || (xatolar >= 2 && x90.filter((e) => e.tur === 'saqlash').length >= 2)) return 'xato_takrori';
  if (oxir(60).filter((e) => e.tur === 'sahifa').length >= 6) return 'adashish';
  const oxirgi = hodisalar[hodisalar.length - 1];
  if (oxirgi && hozir - oxirgi.vaqt >= 120_000 && hodisalar.slice(-5).some((e) => e.tur === 'xato')) return 'qotib_qolish';
  return null;
}

/** Rad etilgan takliflar uchun to'xtatish: har rad 2x uzaytiradi (5 daq → 10 → 20 … ≤ 2 soat). */
export function sovushMs(radSoni: number): number {
  return Math.min(2 * 60 * 60_000, 5 * 60_000 * 2 ** Math.max(0, radSoni));
}

/** Toast va boshqa joylardan xato hodisasini yuborish uchun (matnsiz). */
export function izHodisasiYubor(tur: IzHodisa['tur'], nom: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(IZ_HODISA, { detail: { tur, nom } }));
}
