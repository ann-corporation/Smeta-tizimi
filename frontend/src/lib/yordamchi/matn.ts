/**
 * Yagona yordamchi (Jarvis) uchun matn normalizatsiyasi: o'zbek lotin, o'zbek kirill, rus va ingliz so'zlari BIR shaklga keltiriladi
 * (lotin -> kirill transliteratsiya, `qidiruv-normalizatsiya` bilan bir xil qoida). AI yo'q: bir xil kirish -> bir xil natija.
 */
import { lotinKirill } from '../qidiruv-normalizatsiya';

const UZ_KIRILL: Record<string, string> = { 'ў': 'о', 'қ': 'к', 'ғ': 'г', 'ҳ': 'х', 'ё': 'е' };

/** Bitta so'zni taqqoslash shakliga keltiradi (kichik harf, apostrofsiz, lotin -> kirill). */
export function sozNorm(w: string): string {
  const k = /[a-z]/i.test(w) ? lotinKirill(w) : w.toLowerCase();
  return [...k].map((c) => UZ_KIRILL[c] ?? c).join('');
}

/** Matnni normallashgan so'zlarga ajratadi («M-29» -> «м29», «F-2» -> «ф2»). */
export function sozlar(matn: string): string[] {
  const s = matn.toLowerCase().replace(/[ʻʼ‘’`´']/g, '').replace(/([\p{L}])-(\d)/gu, '$1$2');
  return s.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(sozNorm);
}

function umumiyPrefiks(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** So'zlar mosligi: aniq (1) yoki qo'shimcha/tuslanish farqi bilan (0.8); raqamli so'zlar (f2, 1, м29) faqat aniq. */
export function sozMosligi(q: string, a: string): number {
  if (q === a) return 1;
  if (/\d/.test(q) || /\d/.test(a)) return 0;
  const m = Math.min(q.length, a.length);
  if (m < 3) return 0;
  if (q.startsWith(a) || a.startsWith(q)) return 0.8;
  const p = umumiyPrefiks(q, a);
  return p >= 4 && p >= m - 2 ? 0.8 : 0;
}

/** Ochish/ko'rsatish fe'llari va to'ldiruvchi so'zlar — sahifa nomi emas (uz/ru/en). */
const TOLDIRUVCHI_XOM = [
  'och', 'ochib', 'ber', 'bering', 'ochgin', 'ochsang', 'ochaylik', 'ochish', 'korsat', 'korsating', 'kor', 'korish', 'korib', 'bor', 'borish', 'ot', 'otish', 'ket', 'ketdik', 'kir', 'kirish',
  'sahifa', 'sahifasi', 'sahifasini', 'sahifaga', 'bolim', 'bolimi', 'bolimini', 'ekran', 'oyna', 'oynasi', 'menyu', 'iltimos', 'marhamat', 'qanday', 'qancha', 'qaysi', 'necha', 'qanaqa', 'haqida', 'how', 'what', 'which', 'много', 'сколько', 'как', 'какой', 'каков', 'каково', 'menga', 'bizga', 'mening', 'men', 'shu', 'bu', 'u',
  'ning', 'ni', 'ga', 'da', 'dan', 'sini', 'ini', 'si', 'uchun', 'bilan', 'va', 'nima', 'qayerda', 'qani', 'kerak', 'xohlayman', 'istayman', 'kormoqchiman', 'qil', 'qilib',
  'open', 'go', 'to', 'show', 'me', 'the', 'my', 'page', 'screen', 'please', 'and', 'of', 'a', 'in', 'for', 'view', 'navigate',
  'и', 'в', 'на', 'открой', 'открыть', 'откройте', 'покажи', 'показать', 'перейди', 'перейти', 'зайди', 'страница', 'страницу', 'страницы', 'раздел', 'пожалуйста', 'мне', 'где', 'мой', 'моя', 'мои', 'по',
].map(sozNorm);
export const TOLDIRUVCHI: ReadonlySet<string> = new Set(TOLDIRUVCHI_XOM);

/** Faqat ochish niyatini bildiruvchi fe'llar (matnda bo'lsa — foydalanuvchi aniq «och» demoqda). */
export const OCHISH_FELLARI: ReadonlySet<string> = new Set([
  'och', 'ochib', 'ochgin', 'ochsang', 'ochaylik', 'ochish', 'korsat', 'korsating', 'otish', 'ot', 'bor', 'ketdik', 'open', 'go', 'show', 'navigate', 'view',
  'открой', 'открыть', 'откройте', 'покажи', 'показать', 'перейди', 'перейти', 'зайди',
].map(sozNorm));
