/**
 * Brauzer global'lari uchun AMBIENT e'lonlar: hujjat dvigateli (src/lib, src/api) Cloudflare Worker'da ham ishlaydi
 * (functions/api/hujjat-yarat). Ular `typeof window !== 'undefined'` / `localStorage` try/catch bilan himoyalangan —
 * Worker'da mavjud emas, shuning uchun faqat TUR e'lon qilinadi (runtime qiymat yaratilmaydi).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare var window: any;
declare var localStorage: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
interface ParentNode { querySelectorAll<T = unknown>(selector: string): Iterable<T> }
interface HTMLInputElement { reportValidity(): boolean }