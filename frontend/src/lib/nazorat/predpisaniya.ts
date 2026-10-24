/**
 * predpisaniya.ts - nazorat ko'rsatmalari (Предписание / замечание) uchun sof
 * hisob-kitob: muddati o'tganlar ro'yxati va rasmiy rus ustun nomlari bilan
 * reestr qatorlari. Ma'lumot manbai - mavjud t2_tomon_murojaat (Murojaatlar);
 * bu yerda DB ham, pul ham yo'q. Muddat yo'q bo'lsa - "muddatsiz" (o'ylab topilmaydi).
 */
export type PredpisaniyaHolat = 'ochiq' | 'bajarildi' | 'yopildi' | 'bekor';

export type PredpisaniyaQator = {
  id: number;
  raqam?: string | null;
  sarlavha: string;
  joy?: string | null;
  obyektNomi?: string | null;
  muhimlik?: 'past' | 'oddiy' | 'yuqori' | 'kritik' | string | null;
  /** ISO yyyy-mm-dd */
  muddat?: string | null;
  sana?: string | null;
  holat: PredpisaniyaHolat;
};

export type MuddatHolati = 'yopiq' | 'muddatsiz' | 'muddatda' | 'bugun' | 'otgan';

const KUN = 86_400_000;
const kunBoshi = (iso: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
};

/** Muddat holati: faqat 'ochiq' va 'bajarildi' (yopishni kutayotgan) muddat bilan o'lchanadi. */
export function muddatHolati(q: Pick<PredpisaniyaQator, 'holat' | 'muddat'>, bugun: string): MuddatHolati {
  if (q.holat === 'yopildi' || q.holat === 'bekor') return 'yopiq';
  const m = q.muddat ? kunBoshi(q.muddat) : null;
  const b = kunBoshi(bugun);
  if (m == null || b == null) return 'muddatsiz';
  if (m < b) return 'otgan';
  return m === b ? 'bugun' : 'muddatda';
}

/** Necha kun kechikkan (0 - kechikmagan yoki aniqlab bo'lmaydi). */
export function kechikkanKun(q: Pick<PredpisaniyaQator, 'holat' | 'muddat'>, bugun: string): number {
  if (muddatHolati(q, bugun) !== 'otgan') return 0;
  return Math.round(((kunBoshi(bugun) as number) - (kunBoshi(q.muddat as string) as number)) / KUN);
}

/** Muddati o'tganlar: eng ko'p kechikkani birinchi, teng bo'lsa muhimligi bo'yicha. */
export function muddatiOtganlar<T extends PredpisaniyaQator>(royxat: readonly T[], bugun: string): T[] {
  const og: Record<string, number> = { kritik: 3, yuqori: 2, oddiy: 1, past: 0 };
  return royxat
    .filter((q) => muddatHolati(q, bugun) === 'otgan')
    .sort((a, b) => kechikkanKun(b, bugun) - kechikkanKun(a, bugun)
      || (og[String(b.muhimlik)] ?? 1) - (og[String(a.muhimlik)] ?? 1)
      || a.id - b.id);
}

export const REESTR_USTUNLARI = ['№ п/п', '№ предписания', 'Дата', 'Объект', 'Место', 'Содержание', 'Срок устранения', 'Статус'] as const;

const RU_HOLAT: Record<PredpisaniyaHolat, string> = {
  ochiq: 'Не устранено', bajarildi: 'Устранено, проверка', yopildi: 'Закрыто', bekor: 'Отменено',
};

const ddmmyyyy = (iso?: string | null): string => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};

/** Rasmiy ruscha reestr qatorlari; qiymat yo'q bo'lsa katak bo'sh (soxta matn yo'q). */
export function reestrQatorlari(royxat: readonly PredpisaniyaQator[], bugun: string): string[][] {
  return royxat.map((q, i) => [
    String(i + 1), q.raqam ?? '', ddmmyyyy(q.sana), q.obyektNomi ?? '', q.joy ?? '', q.sarlavha,
    ddmmyyyy(q.muddat),
    muddatHolati(q, bugun) === 'otgan' ? `${RU_HOLAT[q.holat]} (просрочено ${kechikkanKun(q, bugun)} дн.)` : RU_HOLAT[q.holat],
  ]);
}
