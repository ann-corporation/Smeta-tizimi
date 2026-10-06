const GREETINGS = new Set([
  'salom',
  'assalomu alaykum',
  'assalom aleykum',
  'hello',
  'hi',
  'привет',
]);

export function jarvisSalommi(text: string): boolean {
  const normalized = text
    .toLocaleLowerCase('uz-UZ')
    .replace(/[!?.,;:]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return GREETINGS.has(normalized);
}

export function jarvisSalomJavobi(): string {
  return 'Salom! Men Jarvis — TIZIM_02 yordamchisiman. Sizga qanday yordam bera olaman?';
}
