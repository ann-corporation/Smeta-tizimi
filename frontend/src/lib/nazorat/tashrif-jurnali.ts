/**
 * tashrif-jurnali.ts - nazorat tashriflari jurnali (Журнал учета посещений / записи в общем
 * журнале работ) uchun sof funksiyalar: sana bo'yicha tartib, oylik guruhlash, rasmiy ruscha qatorlar.
 * DB yo'q; jadval kontraktdan keyin. Qiymat yo'q bo'lsa katak bo'sh.
 */
export type TashrifTuri = 'texnadzor' | 'gasn' | 'laboratoriya' | 'avtor' | 'boshqa';

export type Tashrif = {
  id: number;
  /** ISO yyyy-mm-dd */
  sana: string;
  turi: TashrifTuri;
  tashkilot?: string | null;
  vakil?: string | null;
  obyektNomi?: string | null;
  maqsad?: string | null;
  /** Ko'rsatma/замечание berilganmi: raqamlari. */
  predpisaniyaRaqamlari?: readonly string[];
  natija?: string | null;
};

export const TASHRIF_USTUNLARI = ['№ п/п', 'Дата', 'Организация', 'Представитель', 'Цель посещения', 'Результат / предписания'] as const;

export const TASHRIF_TURI_RU: Record<TashrifTuri, string> = {
  texnadzor: 'Технический надзор заказчика', gasn: 'Инспекция государственного архитектурно-строительного контроля',
  laboratoriya: 'Строительная лаборатория', avtor: 'Авторский надзор', boshqa: 'Иное',
};

const ddmmyyyy = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};

export function tashriflarTartibi<T extends Tashrif>(royxat: readonly T[]): T[] {
  return [...royxat].sort((a, b) => a.sana.localeCompare(b.sana) || a.id - b.id);
}

/** 'yyyy-mm' -> tashriflar soni. */
export function oyBoyichaSoni(royxat: readonly Tashrif[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const t of royxat) { const k = t.sana.slice(0, 7); r[k] = (r[k] ?? 0) + 1; }
  return r;
}

export function jurnalQatorlari(royxat: readonly Tashrif[]): string[][] {
  return tashriflarTartibi(royxat).map((t, i) => {
    const pr = t.predpisaniyaRaqamlari?.length ? `Предписание № ${t.predpisaniyaRaqamlari.join(', ')}` : '';
    return [
      String(i + 1), ddmmyyyy(t.sana), t.tashkilot?.trim() || TASHRIF_TURI_RU[t.turi], t.vakil ?? '', t.maqsad ?? '',
      [t.natija ?? '', pr].filter(Boolean).join('; '),
    ];
  });
}
