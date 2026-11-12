/**
 * To'lov shakli (sof hisob). To'lov — haqiqiy pul harakati: ustama QO'LLANMAYDI, summa QQS bilan (bankdan o'tgan).
 * Bo'sh summa — «kiritilmagan» (NULL ≠ 0): saqlanmaydi. Qaytarim manfiy yoziladi (kirim/chiqim belgisi bazada shunday).
 */
export type TolovTuri = 'tolov' | 'avans' | 'qaytarim';

export type TolovShakl = { shartnomaId: number | null; tur: TolovTuri; summa: string; sana: string; izoh: string };

export const TOLOV_TURLARI: ReadonlyArray<{ id: TolovTuri; nom: string; izoh: string }> = [
  { id: 'tolov', nom: 'To‘lov', izoh: 'buyurtmachidan kelgan pul' },
  { id: 'avans', nom: 'Avans', izoh: 'ish bajarilmasdan oldin kelgan pul' },
  { id: 'qaytarim', nom: 'Qaytarim', izoh: 'buyurtmachiga qaytarilgan pul' },
];

export function bugunISO(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function bosTolovShakl(shartnomaId: number | null = null, bugun: string = bugunISO()): TolovShakl {
  return { shartnomaId, tur: 'tolov', summa: '', sana: bugun, izoh: '' };
}

/** «1 234 567,50» / «1234567.5» → son; bo'sh yoki noto'g'ri → null (0 EMAS). */
export function summaOqi(x: string): number | null {
  const s = String(x ?? '').replace(/[\s ]/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type TolovXato = { joy: 'shartnoma' | 'summa' | 'sana'; matn: string };

export function tolovTekshir(s: TolovShakl): TolovXato[] {
  const x: TolovXato[] = [];
  if (s.shartnomaId == null) x.push({ joy: 'shartnoma', matn: 'Shartnomani tanlang' });
  const n = summaOqi(s.summa);
  if (n == null) x.push({ joy: 'summa', matn: 'Summani kiriting' });
  else if (n <= 0) x.push({ joy: 'summa', matn: 'Summa noldan katta bo‘lishi kerak (qaytarim turini tanlang — belgi o‘zi qo‘yiladi)' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.sana)) x.push({ joy: 'sana', matn: 'Sanani tanlang' });
  return x;
}

/** sbT2TolovYoz uchun yuk: qaytarim manfiy yoziladi, izoh kesiladi. */
export function tolovYuki(s: TolovShakl): { shartnomaId: number; summa: number; tur: TolovTuri; sana: string; izoh?: string } | null {
  if (tolovTekshir(s).length) return null;
  const n = summaOqi(s.summa) as number;
  const izoh = s.izoh.trim();
  return { shartnomaId: s.shartnomaId as number, summa: s.tur === 'qaytarim' ? -n : n, tur: s.tur, sana: s.sana, ...(izoh ? { izoh: izoh.slice(0, 500) } : {}) };
}
