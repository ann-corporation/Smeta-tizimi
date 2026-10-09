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
