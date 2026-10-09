/** Source-backed reference, not approval of a catalogue edition or a price. */
export type NormativeReference = {
  document: string; url: string; table: string; pdfPage: number; printedPage: number;
  operations: string[]; caution: string;
};

export function foundationReference(code: string): NormativeReference | null {
  // Explicit ABC ↔ printed norm mapping for these two rows only; other families are not inferred.
  if (!/^(?:E6-1-1-(?:22|23)|06-01-001-(?:22|23))$/i.test(code.trim())) return null;
  return {
    document: 'ШНК 4.02.06-04', url: 'https://mc.uz/uploads/mcuz_40273843723092.pdf',
    table: '6-01-001', pdfPage: 12, printedPage: 12,
    operations: ['Tayyorlangan taxtalarni kesish va o‘rnatish', 'Qolip panellarini o‘rnatish va mahkamlash', 'Armaturani o‘rnatish', 'Beton qorishmasini yotqizish'],
    caution: 'Bu manba jadvalning ish tarkibini ko‘rsatadi. Katalog nashri bilan mosligi va texnik qism hali tasdiqlanmagan. Armatura/qolipni alohida qo‘shishdan oldin takroriy hisobni tekshiring. Qolipni yechish yoki armatura tayyorlash ushbu ro‘yxatdan avtomatik isbotlanmaydi.',
  };
}

/** Audited context supplied by the server, never inferred from the model's answer. */
export function foundationSourceContext(userText: string): string {
  if (!/(?:lentali\s+fundament|ленточн[\s\S]{0,40}фундамент|E6-1-1-2[23]|06-01-001-2[23])/i.test(userText)) return '';
  const ref = foundationReference('E6-1-1-22')!;
  return `\nTEKSHIRILGAN MANBA: ${ref.document}, jadval ${ref.table}, PDF/kitob sahifasi 12: ${ref.url}#page=12.
06-01-001-22/23 temir-beton lentali fundament jadvalining ish tarkibida ARMATURA O‘RNATISH, QOLIP O‘RNATISH/MAHKAMLASH va BETON YOTQIZISH bor. "Lentali fundament normasiga armatura odatda kirmaydi" demang: bu manbaga zid. Alohida armatura o‘rnatish va qolip o‘rnatish pozitsiyalarini avtomatik tasdiqlamang; tanlangan normaning texnik qismini tekshirib takroriy hisobni bartaraf eting. Armatura tonnaji loyiha resursi sifatida saqlansin. Bu jadval armatura tayyorlash yoki qolip yechishni alohida isbotlamaydi. Bu eski nashr; katalogning amaldagi nashriga mosligi hali tasdiqlanmagan. Javobda ish tarkibi haqida gapirsangiz aniq jadval va sahifani ayting; boshqa norma oilalariga ushbu tarkibni yoymang.`;
}

/** Reject the observed blanket claim; this is a narrow source check, not a universal semantic validator. */
export function contradictsFoundationSource(answer: string): boolean {
  return answer.split(/[.!?\n]/).some(sentence =>
    /(?:lentali\s+fundament|ленточн[\s\S]{0,40}фундамент)/i.test(sentence) &&
    /(?:armatura[\s\S]{0,90}(?:odatda\s+)?kirmaydi|арматур[\s\S]{0,90}не\s+вход)/i.test(sentence) &&
    !/(?:demang|noto‘g‘ri|noto'g'ri|xato|неверн|ошибоч)/i.test(sentence));
}
