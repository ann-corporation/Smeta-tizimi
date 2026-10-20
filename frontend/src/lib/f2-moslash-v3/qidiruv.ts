/**
 * F2 import panellari uchun qidiruv (egasi 2026-10-20: «qulayliklar»). Ikkala panel (F2 va smeta) bir xil qoidada:
 * - so'zlar istalgan tartibda, hammasi topilishi kerak ("b25 beton" = "БЕТОН ... В25");
 * - lotin/kirill ko'rinishi bir xil harflar tenglashtiriladi (operator ko'pincha lotinda yozadi, smeta kirillda);
 * - kod, nom va birlik bo'yicha. Qidiruv faqat ko'rinishni o'zgartiradi — hech qanday bog'lanishni emas.
 */
const LOTIN_KIRILL: Record<string, string> = {
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У', Ё: 'Е',
};

export function qidiruvNormal(s: string): string {
  return s.toUpperCase().replace(/[ABCEHKMOPTXYЁ]/g, (c) => LOTIN_KIRILL[c] ?? c).replace(/\s+/g, ' ').trim();
}

// Lotinda yozilgan ruscha so'z: "beton" → "БЕТОН", "shcheben" → "ЩЕБЕН".
const TRANSLIT: ReadonlyArray<[string, string]> = [
  ['SHCH', 'Щ'], ['SH', 'Ш'], ['CH', 'Ч'], ['ZH', 'Ж'], ['KH', 'Х'], ['TS', 'Ц'], ['YU', 'Ю'], ['YA', 'Я'], ['YO', 'Е'],
  ['A', 'А'], ['B', 'Б'], ['V', 'В'], ['G', 'Г'], ['D', 'Д'], ['E', 'Е'], ['Z', 'З'], ['I', 'И'], ['J', 'Ж'], ['K', 'К'], ['L', 'Л'],
  ['M', 'М'], ['N', 'Н'], ['O', 'О'], ['P', 'П'], ['R', 'Р'], ['S', 'С'], ['T', 'Т'], ['U', 'У'], ['F', 'Ф'], ['H', 'Х'],
  ['C', 'Ц'], ['Y', 'Ы'], ['X', 'КС'], ['W', 'В'], ['Q', 'К'],
];
function translit(soz: string): string {
  let out = '';
  for (let i = 0; i < soz.length;) {
    const m = TRANSLIT.find(([l]) => soz.startsWith(l, i));
    if (m) { out += m[1]; i += m[0].length; } else { out += soz[i]; i += 1; }
  }
  return out;
}

/** null — qidiruv yoqilmagan (2 belgidan kam). Aks holda matnni tekshiradigan funksiya. */
export function qidiruvMoslagich(q: string): ((matn: string) => boolean) | null {
  const n = qidiruvNormal(q);
  if (n.length < 2) return null;
  // Har so'z uchun variantlar: ko'rinishi bir xil harflar (B25 → В25) va lotin transliteratsiyasi (beton → БЕТОН).
  const sozlar = q.toUpperCase().split(/\s+/).filter(Boolean).map((w) => [...new Set([qidiruvNormal(w), translit(w)])]);
  return (matn: string) => {
    const m = qidiruvNormal(matn);
    return sozlar.every((v) => v.some((s) => m.includes(s)));
  };
}

export const qidiruvMatni = (x: { kod?: string | null; nom?: string | null; birlik?: string | null }) =>
  `${x.kod ?? ''} ${x.nom ?? ''} ${x.birlik ?? ''}`;
