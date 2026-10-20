/*
 * Kichik suhbat (salomlashuv, hol-ahvol, minnatdorchilik) — model va ma'lumot yig'ish KERAK EMAS, javob bir zumda.
 * Egasi 2026-10-20: «oddiy gaplar uchun ham 5 minut». Avval faqat aniq «salom» tanilardi; «salom jarvis qalaysan»
 * butun quvurdan (lavozim, ma'lumot, qoidalar, model) o'tardi. Endi gap FAQAT kichik suhbat so'zlaridan iborat bo'lsa
 * tanilaydi; bitta ham boshqa so'z (obyekt, fakt, narx…) bo'lsa — oddiy savol sifatida modelga boradi.
 */
const SALOM = new Set([
  'salom', 'assalomu', 'assalom', 'alaykum', 'aleykum', 'alekum', 'salomaleykum', 'hello', 'hi', 'hey',
  'привет', 'здравствуй', 'здравствуйте', 'добрый', 'хайрли', 'xayrli',
]);
const HOL = new Set(['qalaysan', 'qalaysiz', 'qalesan', 'qalesiz', 'yaxshimisan', 'yaxshimisiz', 'qalay', 'gap', 'gaplar', 'дела']);
const RAHMAT = new Set(['rahmat', 'raxmat', 'rahmatlar', 'tashakkur', 'спасибо', 'thanks', 'thank', 'zor', 'ajoyib', 'ok', 'okey', 'tushunarli', 'xop', 'mayli']);
/** Ruxsat etilgan, lekin o'zi kichik suhbat belgisi bo'lmagan so'zlar (murojaat, to'ldiruvchi). */
const NEYTRAL = new Set(['jarvis', 'джарвис', 'aka', 'uka', 'dost', 'brat', 'jigar', 'katta', 'большое', 'yaxshi', 'nima', 'ishlar',
  'kun', 'kech', 'tong', 'день', 'утро', 'вечер', 'как', 'ты', 'вы', 'how', 'are', 'you', 'senga', 'sizga', 'sizni', 'seni']);

export type KichikGap = 'salom' | 'rahmat';

export function jarvisKichikGap(text: string): KichikGap | null {
  const sozlar = text
    .toLocaleLowerCase('uz-UZ')
    .replace(/[ʻʼ‘’`']/g, '')
    .replace(/[!?.,;:()\-—]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!sozlar.length || sozlar.length > 8) return null;
  if (!sozlar.every((s) => SALOM.has(s) || HOL.has(s) || RAHMAT.has(s) || NEYTRAL.has(s))) return null;
  if (sozlar.some((s) => SALOM.has(s) || HOL.has(s))) return 'salom';
  if (sozlar.some((s) => RAHMAT.has(s))) return 'rahmat';
  return null;
}

export function jarvisSalommi(text: string): boolean {
  return jarvisKichikGap(text) != null;
}

export function jarvisSalomJavobi(): string {
  return 'Salom! Men Jarvis — TIZIM_02 yordamchisiman. Sizga qanday yordam bera olaman?';
}

export function jarvisRahmatJavobi(): string {
  return 'Arzimaydi! Yana savol bo‘lsa — yozing.';
}
